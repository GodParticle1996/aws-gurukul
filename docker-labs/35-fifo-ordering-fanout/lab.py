"""Check FIFO edit delivery and Kinesis replay on an owned loopback Moto server."""
from contextlib import ExitStack
import json
import logging
import os
from pathlib import Path
import socket
import tempfile
from time import monotonic, sleep

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab35-runs"
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
from moto.server import ThreadedMotoServer

logging.getLogger("werkzeug").setLevel(logging.CRITICAL)


def say(line):
    print(line, flush=True)
    with (RUN / "lab.log").open("a") as stream:
        print(line, file=stream)


def check(ok, message):
    if not ok:
        raise AssertionError(message)
    say("PASS " + message)

def event(photo, rev):
    return {"photo": photo, "rev": rev, "editId": f"{photo}-v{rev}"}


def drain(sqs, url):
    rows = []
    until = monotonic() + 10
    while monotonic() < until:
        messages = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10, WaitTimeSeconds=1,
                                       MessageSystemAttributeNames=["All"]).get("Messages", [])
        if not messages:
            if len(rows) >= 3:
                break
            continue
        for m in messages:
            body = json.loads(m["Body"])
            attrs = m["Attributes"]
            if (body["photo"], body["editId"]) != (attrs["MessageGroupId"], attrs["MessageDeduplicationId"]):
                raise AssertionError("FIFO identity and raw body disagree")
            rows.append(body)
            sqs.delete_message(QueueUrl=url, ReceiptHandle=m["ReceiptHandle"])
    return rows


def main(endpoint):
    def client(service):
        return boto3.client(service, endpoint_url=endpoint)

    sns, sqs, streams = map(client, ["sns","sqs","kinesis"])
    stream = "pix-activity"
    unique = [event("p7",1), event("p8",1), event("p7",2)]
    with ExitStack() as clean:
        topic = sns.create_topic(Name="pix-edits.fifo", Attributes={"FifoTopic":"true"})["TopicArn"]
        clean.callback(sns.delete_topic, TopicArn=topic)
        queues = []
        for name in ["pix-render.fifo","pix-feed.fifo"]:
            url = sqs.create_queue(QueueName=name, Attributes={"FifoQueue":"true"})["QueueUrl"]
            clean.callback(sqs.delete_queue, QueueUrl=url)
            arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
            policy = {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"sns.amazonaws.com"},
                      "Action":"sqs:SendMessage","Resource":arn,"Condition":{"ArnEquals":{"aws:SourceArn":topic}}}]}
            sqs.set_queue_attributes(QueueUrl=url, Attributes={"Policy":json.dumps(policy)})
            sub = sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn)["SubscriptionArn"]
            clean.callback(sns.unsubscribe, SubscriptionArn=sub)
            sns.set_subscription_attributes(SubscriptionArn=sub, AttributeName="RawMessageDelivery", AttributeValue="true")
            raw = sns.get_subscription_attributes(SubscriptionArn=sub)["Attributes"]["RawMessageDelivery"]
            check(raw == "true", name + " ki subscription raw body bhejti hai.")
            saved = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["Policy","FifoQueue"])["Attributes"]
            check(json.loads(saved["Policy"]) == policy and saved["FifoQueue"] == "true", name + " FIFO aur topic policy mili.")
            queues.append((name,url))
        for row in [unique[0], unique[1], unique[0], unique[2]]:
            sns.publish(TopicArn=topic, Message=json.dumps(row), MessageGroupId=row["photo"], MessageDeduplicationId=row["editId"])
        for name,url in queues:
            rows = drain(sqs,url)
            check(len(rows) == 3 and all([r for r in rows if r["photo"] == p] == [r for r in unique if r["photo"] == p]
                                        for p in ["p7","p8"]),
                  f"{name}: 4 publishes par 3 raw edits. p7=[1, 2], p8=[1].")
        streams.create_stream(StreamName=stream, StreamModeDetails={"StreamMode":"ON_DEMAND"})
        clean.callback(streams.delete_stream, StreamName=stream)
        streams.get_waiter("stream_exists").wait(StreamName=stream, WaiterConfig={"Delay":1,"MaxAttempts":8})
        info = streams.describe_stream_summary(StreamName=stream)["StreamDescriptionSummary"]
        check(info["StreamModeDetails"]["StreamMode"] == "ON_DEMAND" and info["StreamStatus"] == "ACTIVE",
              "Kinesis ON_DEMAND stream ACTIVE hai.")
        shard, seqs = None, []
        for row in [unique[0], unique[2]]:
            response = streams.put_record(StreamName=stream, PartitionKey="p7", Data=json.dumps(row).encode(),
                                          **({"SequenceNumberForOrdering":seqs[-1]} if seqs else {}))
            if shard is not None and response["ShardId"] != shard:
                raise AssertionError("test stream shard changed")
            shard = response["ShardId"]
            seqs.append(response["SequenceNumber"])

        def read(kind, count, after=None):
            iterator = streams.get_shard_iterator(StreamName=stream, ShardId=shard, ShardIteratorType=kind,
                         **({"StartingSequenceNumber":after} if after else {}))["ShardIterator"]
            records = []
            until = monotonic() + 5
            while len(records) < count and monotonic() < until:
                page = streams.get_records(ShardIterator=iterator, Limit=1)
                records.extend(page["Records"])
                iterator = page["NextShardIterator"]
                if len(records) < count:
                    sleep(.22)
            return records

        for label in ["Pehla reader", "Doosra reader"]:
            rows = read("TRIM_HORIZON", 2)
            check([r["SequenceNumber"] for r in rows] == seqs and
                  [json.loads(r["Data"]) for r in rows] == [unique[0],unique[2]], label + ": p7 ke wahi v1 aur v2 mile.")
        resumed = read("AFTER_SEQUENCE_NUMBER", 1, seqs[0])
        check([r["SequenceNumber"] for r in resumed] == seqs[1:] and json.loads(resumed[0]["Data"]) == unique[2],
              "v1 ke checkpoint ke baad sirf v2 mili.")
        say("HOST CHECK Python ne dono queues ke groups, edit IDs aur replay ke sequence numbers milaaye.")
        say("GAP Moto ka chhota run AWS ki throughput, retry timing, IAM enforcement ya billing nahi naapta.")
    remaining = {"topics": len(sns.list_topics()["Topics"]), "subscriptions": len(sns.list_subscriptions()["Subscriptions"]),
                 "queues": len(sqs.list_queues().get("QueueUrls", [])), "streams": len(streams.list_streams()["StreamNames"])}
    check(not any(remaining.values()), "CLEANUP READBACK " + json.dumps(remaining))
with socket.socket() as preflight:
    preflight.bind(("127.0.0.1", 0))
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
        check(probe.connect_ex((host, port)) != 0, "OWNED MOTO STOPPED / LISTENER CLOSED")
