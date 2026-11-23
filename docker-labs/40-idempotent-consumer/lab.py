"""Count one thumbnail once across an SQS redelivery and a producer resend."""
from contextlib import ExitStack
from pathlib import Path
import json
import logging
import os
import socket
import tempfile

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / ".overhaul-evidence/lab40-runs"
EVIDENCE.mkdir(parents=True, exist_ok=True)
RUN = Path(tempfile.mkdtemp(prefix="run-", dir=EVIDENCE))
for key in list(os.environ):
    if key.startswith("AWS_"):
        del os.environ[key]
(RUN / "config").write_text("[default]\nregion = us-east-1\n")
(RUN / "credentials").write_text("[default]\naws_access_key_id=test\naws_secret_access_key=test\n")
os.environ.update(AWS_CONFIG_FILE=str(RUN / "config"), AWS_SHARED_CREDENTIALS_FILE=str(RUN / "credentials"),
                  AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test", AWS_DEFAULT_REGION="us-east-1",
                  AWS_MAX_ATTEMPTS="1", AWS_EC2_METADATA_DISABLED="true", NO_PROXY="localhost,127.0.0.1")

import boto3
from botocore.exceptions import ClientError
from moto.server import ThreadedMotoServer

logging.getLogger("werkzeug").setLevel(logging.CRITICAL)
TABLE = "pix-usage"
TOTAL = {"pk": {"S": "TOTAL#demo"}}


def say(line):
    print(line, flush=True)
    with (RUN / "lab.log").open("a") as log:
        print(line, file=log)


def item(db, key):
    return db.get_item(TableName=TABLE, Key=key, ConsistentRead=True).get("Item")


def total(db):
    return int(item(db, TOTAL)["units"]["N"])


def apply_once(db, job, counter=TOTAL):
    key = {"pk": {"S": "EVENT#" + job["operationId"]}}
    marker = {**key, "photo": {"S": job["photo"]}}
    try:
        db.transact_write_items(TransactItems=[
            {"Put": {"TableName": TABLE, "Item": marker, "ConditionExpression": "attribute_not_exists(pk)"}},
            {"Update": {"TableName": TABLE, "Key": counter, "UpdateExpression": "ADD #u :one",
                        "ConditionExpression": "attribute_exists(pk)", "ExpressionAttributeNames": {"#u": "units"},
                        "ExpressionAttributeValues": {":one": {"N": "1"}}}},
        ])
    except ClientError as exc:
        reasons = [r["Code"] for r in exc.response.get("CancellationReasons", [])]
        if exc.response["Error"]["Code"] != "TransactionCanceledException" or reasons != ["ConditionalCheckFailed", "None"]:
            raise
        if item(db, key) != marker:
            return "conflict"
        return "duplicate"
    return "counted"


def main(endpoint):
    db = boto3.client("dynamodb", endpoint_url=endpoint)
    sqs = boto3.client("sqs", endpoint_url=endpoint)
    job = {"operationId": "demo/thumb/p7/v1", "photo": "p7"}
    with ExitStack() as cleanup:
        db.create_table(TableName=TABLE, KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
                        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}], BillingMode="PAY_PER_REQUEST")
        cleanup.callback(db.delete_table, TableName=TABLE)
        db.get_waiter("table_exists").wait(TableName=TABLE)
        url = sqs.create_queue(QueueName="pix-thumbs")["QueueUrl"]
        cleanup.callback(sqs.delete_queue, QueueUrl=url)

        def send(payload):
            return sqs.send_message(QueueUrl=url, MessageBody=json.dumps(payload))["MessageId"]

        def receive():
            msg, = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=1,
                                       MessageSystemAttributeNames=["ApproximateReceiveCount"])["Messages"]
            return msg, json.loads(msg["Body"])

        def ack(msg):
            sqs.delete_message(QueueUrl=url, ReceiptHandle=msg["ReceiptHandle"])

        for safe in (False, True):
            db.put_item(TableName=TABLE, Item={**TOTAL, "units": {"N": "0"}})
            sent = send(job)
            results = []
            for count in (1, 2):
                msg, payload = receive()
                assert msg["MessageId"] == sent and int(msg["Attributes"]["ApproximateReceiveCount"]) == count
                if safe:
                    results.append(apply_once(db, payload))
                else:
                    db.update_item(TableName=TABLE, Key=TOTAL, UpdateExpression="ADD #u :one",
                                   ExpressionAttributeNames={"#u": "units"}, ExpressionAttributeValues={":one": {"N": "1"}})
                if count == 1:
                    # Write ho gayi par worker ack se pehle ruk gaya. Message ko abhi visible karo.
                    sqs.change_message_visibility(QueueUrl=url, ReceiptHandle=msg["ReceiptHandle"], VisibilityTimeout=0)
                else:
                    ack(msg)
            assert total(db) == (1 if safe else 2)
            if safe:
                assert results == ["counted", "duplicate"]
                say("PASS Same MessageId mila, receive counts 1 aur 2. Conditional Put + counter ek transaction mein: total 1.")
            else:
                say("PASS Same MessageId mila, receive counts 1 aur 2. Seedhe ADD par total 2.")

        assert send(job) != sent
        msg, payload = receive()
        assert apply_once(db, payload) == "duplicate" and total(db) == 1
        ack(msg)
        say("PASS Naya MessageId, wahi operationId aur payload: total 1.")
        next_job = {**job, "operationId": "demo/thumb/p7/v2"}
        send(next_job)
        msg, payload = receive()
        assert apply_once(db, payload) == "counted" and total(db) == 2
        ack(msg)
        say("PASS Usi photo ka naya version alag operation hai: total 2.")

        # Sirf pehchaani hui duplicate par ack. Doosri failure ko policy ke hisaab se retry/DLQ mile.
        dlq = sqs.create_queue(QueueName="pix-failed")["QueueUrl"]
        cleanup.callback(sqs.delete_queue, QueueUrl=dlq)
        arn = sqs.get_queue_attributes(QueueUrl=dlq, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
        sqs.set_queue_attributes(QueueUrl=url, Attributes={"RedrivePolicy": json.dumps({"deadLetterTargetArn": arn, "maxReceiveCount": 3})})
        conflict = {**job, "photo": "p9"}
        send(conflict)
        for count in (1, 2, 3):
            msg, payload = receive()
            assert int(msg["Attributes"]["ApproximateReceiveCount"]) == count and apply_once(db, payload) == "conflict"
            sqs.change_message_visibility(QueueUrl=url, ReceiptHandle=msg["ReceiptHandle"], VisibilityTimeout=0)
        assert not sqs.receive_message(QueueUrl=url).get("Messages")
        dead, = sqs.receive_message(QueueUrl=dlq)["Messages"]
        assert json.loads(dead["Body"]) == conflict and total(db) == 2
        sqs.delete_message(QueueUrl=dlq, ReceiptHandle=dead["ReceiptHandle"])
        say("PASS Wahi key par doosri photo: 3 receives ke baad payload DLQ mein mila. Total 2 raha.")

        failed = {**job, "operationId": "demo/thumb/p7/v3"}
        try:
            apply_once(db, failed, {"pk": {"S": "TOTAL#missing"}})
        except ClientError as exc:
            assert [r["Code"] for r in exc.response["CancellationReasons"]] == ["None", "ConditionalCheckFailed"]
        else:
            raise AssertionError("Missing counter should cancel both writes")
        assert item(db, {"pk": {"S": "EVENT#" + failed["operationId"]}}) is None and total(db) == 2
        say("PASS Counter ki condition fail hui. Marker nahi likha gaya aur total 2 raha.")
        say("HOST CHECK Python worker ne local SQS aur DynamoDB APIs chalayi. Visibility 0 se retry turant karaya.")
        say("GAP Lambda poller, asli retry timing aur AWS ki live concurrency is run mein test nahi hui.")
    assert not db.list_tables()["TableNames"] and not sqs.list_queues().get("QueueUrls")
    say("PASS CLEANUP READBACK tables=0 queues=0")


server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
server.start()
host, port = server.get_host_and_port()
try:
    endpoint = f"http://{host}:{port}"
    os.environ["AWS_ENDPOINT_URL"] = endpoint
    say("OWNED MOTO " + endpoint)
    main(endpoint)
finally:
    server.stop()
    with socket.socket() as probe:
        assert probe.connect_ex((host, port)) != 0
    say("PASS OWNED MOTO STOPPED / LISTENER CLOSED")
