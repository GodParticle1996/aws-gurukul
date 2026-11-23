"""Terraform applies PixShare to an owned Moto server. The review reads back and exercises both message paths."""
from pathlib import Path
import base64
import hashlib
import importlib.util
import json
import logging
import os
import shutil
import socket
import subprocess
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab41-runs"
EVIDENCE.mkdir(parents=True, exist_ok=True)
RUN = Path(tempfile.mkdtemp(prefix="run-", dir=EVIDENCE))
local_tf = EVIDENCE / "tools/terraform"
local_mirror = EVIDENCE / "tools/mirror"
TF = os.getenv("LAB41_TERRAFORM") or shutil.which("terraform") or str(local_tf if local_tf.is_file() else ROOT / ".overhaul-evidence/tools/terraform")
MIRROR = os.getenv("LAB41_PROVIDER_MIRROR") or str(local_mirror if local_mirror.is_dir() else ROOT / "docker-labs/08-three-tier-terraform/.terraform/providers")

for key in list(os.environ):
    if key.startswith(("AWS_", "TF_", "BOTO_")):
        del os.environ[key]
(RUN / "config").write_text("[default]\nregion = us-east-1\n")
(RUN / "credentials").write_text("[default]\naws_access_key_id=test\naws_secret_access_key=test\n")
(RUN / "terraform.tfrc").write_text("provider_installation { filesystem_mirror { path = " + json.dumps(str(Path(MIRROR).resolve())) + " } }\n")
os.environ.update(AWS_CONFIG_FILE=str(RUN / "config"), AWS_SHARED_CREDENTIALS_FILE=str(RUN / "credentials"),
                  AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test", AWS_DEFAULT_REGION="us-east-1",
                  AWS_MAX_ATTEMPTS="1", AWS_EC2_METADATA_DISABLED="true", TF_CLI_CONFIG_FILE=str(RUN / "terraform.tfrc"),
                  TF_IN_AUTOMATION="1", CHECKPOINT_DISABLE="1", NO_PROXY="localhost,127.0.0.1")
import boto3
from moto.server import ThreadedMotoServer

logging.getLogger("werkzeug").setLevel(logging.CRITICAL)


def say(line):
    print(line, flush=True)
    with (RUN / "lab.log").open("a") as log:
        print(line, file=log)


def tf(*args):
    result = subprocess.run([TF, *args], cwd=RUN, text=True, capture_output=True, timeout=210)
    with (RUN / "terraform.log").open("a") as log:
        print(*args, result.stdout, result.stderr, file=log)
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:] or result.stdout[-1500:])
    return result.stdout


def review(c):
    s3, cf, db, sns, sqs, eb, lam = (boto3.client(x) for x in ("s3", "cloudfront", "dynamodb", "sns", "sqs", "events", "lambda"))
    settings = cf.get_distribution_config(Id=c["distribution"])["DistributionConfig"]
    origin, = settings["Origins"]["Items"]
    behavior = settings["DefaultCacheBehavior"]
    assert behavior["TargetOriginId"] == origin["Id"] and origin["DomainName"].startswith(c["bucket"] + ".s3.")
    oac = cf.get_origin_access_control(Id=c["oac"])["OriginAccessControl"]["OriginAccessControlConfig"]
    assert oac["SigningBehavior"] == "always" and oac["SigningProtocol"] == "sigv4"
    assert all(s3.get_public_access_block(Bucket=c["bucket"])["PublicAccessBlockConfiguration"].values())
    statement, = json.loads(s3.get_bucket_policy(Bucket=c["bucket"])["Policy"])["Statement"]
    assert statement["Resource"] == "arn:aws:s3:::" + c["bucket"] + "/images/*"
    assert statement["Condition"]["StringEquals"]["AWS:SourceArn"] == c["cdn_arn"] and statement["Principal"] == {"Service":"cloudfront.amazonaws.com"}
    say("PASS S3 ke chaar public blocks mile. Policy mein sirf isi distribution ka images/* read hai.")
    if not origin.get("OriginAccessControlId"):
        say("GAP OAC ki SigV4 setting mili. Moto distribution ke origin readback mein OAC ID nahi aayi.")
    else:
        assert origin["OriginAccessControlId"] == c["oac"]
        say("PASS Origin ka OAC ID aur always/SigV4 setting mili.")
    key = "images/p7-v1.txt"
    s3.put_object(Bucket=c["bucket"], Key=key, Body=b"p7-v1")
    try:
        assert s3.get_object(Bucket=c["bucket"], Key=key)["Body"].read() == b"p7-v1"
    finally:
        s3.delete_object(Bucket=c["bucket"], Key=key)
    say("PASS S3 API se p7-v1 likha, padha aur hataaya. Edge hit aur viewer access live test nahi hue.")
    table = db.describe_table(TableName=c["table"])["Table"]
    assert table["KeySchema"] == [{"AttributeName":"pk","KeyType":"HASH"}] and table["BillingModeSummary"]["BillingMode"] == "PAY_PER_REQUEST"
    conf = lam.get_function_configuration(FunctionName=c["worker"])
    archive = RUN / "worker.zip"
    digest = base64.b64encode(hashlib.sha256(archive.read_bytes()).digest()).decode()
    assert conf["CodeSha256"] == digest
    assert conf["Handler"] == "worker.safe" and conf["Environment"]["Variables"]["TABLE_NAME"] == c["table"]
    assert lam.get_function_concurrency(FunctionName=c["worker"])["ReservedConcurrentExecutions"] == 4
    mapping = lam.get_event_source_mapping(UUID=c["mapping"])
    attrs = sqs.get_queue_attributes(QueueUrl=c["jobs"], AttributeNames=["All"])["Attributes"]
    assert mapping["State"] == "Disabled" and mapping["BatchSize"] == 1 and mapping["EventSourceArn"] == attrs["QueueArn"]
    policy = json.loads(attrs["RedrivePolicy"])
    assert policy["deadLetterTargetArn"] == c["failed"] and int(policy["maxReceiveCount"]) == 5
    for queue_url, principal, source_arn in [(c["jobs"], "sns.amazonaws.com", c["topic"]),
                                              (c["review"], "events.amazonaws.com", eb.describe_rule(Name=c["rule"])["Arn"])]:
        target = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn", "Policy"])["Attributes"]
        grant, = json.loads(target["Policy"])["Statement"]
        assert grant["Action"] == "sqs:SendMessage" and grant["Resource"] == target["QueueArn"]
        assert grant["Principal"] == {"Service": principal} and grant["Condition"]["ArnEquals"]["aws:SourceArn"] == source_arn
    say("PASS Dono queue policies mein sahi source ARN aur queue ARN mile.")
    say("PASS Worker zip ka hash, handler, table, cap 4, batch 1 aur DLQ limit 5 mili. Local review ke liye mapping disabled hai.")
    os.environ["TABLE_NAME"] = c["table"]
    with zipfile.ZipFile(archive) as package:
        source = package.extract("worker.py", RUN / "host-worker")
    spec = importlib.util.spec_from_file_location("pix_worker", source)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    job = {"tenant":"demo", "operationId":"p7/v1", "photo":"p7"}
    sns.publish(TopicArn=c["topic"], Message=json.dumps(job))
    receipts = []
    for count in (1, 2):
        msg, = sqs.receive_message(QueueUrl=c["jobs"], MessageSystemAttributeNames=["ApproximateReceiveCount"])["Messages"]
        assert json.loads(msg["Body"]) == job and int(msg["Attributes"]["ApproximateReceiveCount"]) == count
        receipts.append(msg["MessageId"])
        result = worker.safe({"Records":[{"body":msg["Body"]}]}, None)
        assert result == (["counted"] if count == 1 else ["duplicate"])
        if count == 1:
            sqs.change_message_visibility(QueueUrl=c["jobs"], ReceiptHandle=msg["ReceiptHandle"], VisibilityTimeout=0)
        else:
            sqs.delete_message(QueueUrl=c["jobs"], ReceiptHandle=msg["ReceiptHandle"])
    total = db.get_item(TableName=c["table"], Key={"pk":{"S":"TOTAL#demo"}}, ConsistentRead=True)["Item"]
    assert receipts[0] == receipts[1] and total["units"] == {"N":"1"}
    say("PASS HOST CHECK SNS se job SQS mein mili. Usi MessageId ke receives 1 aur 2 par packaged worker ka DynamoDB total 1 tha.")
    entries = [{"Source":"pix.upload","DetailType":"PhotoAccepted","Detail":json.dumps({"photo":photo,"review":flag})}
               for photo,flag in [("p7",True),("p8",False)]]
    assert eb.put_events(Entries=entries)["FailedEntryCount"] == 0
    msgs = sqs.receive_message(QueueUrl=c["review"], MaxNumberOfMessages=10)["Messages"]
    assert [json.loads(m["Body"])["detail"]["photo"] for m in msgs] == ["p7"]
    for m in msgs:
        sqs.delete_message(QueueUrl=c["review"],ReceiptHandle=m["ReceiptHandle"])
    assert not sqs.receive_message(QueueUrl=c["review"]).get("Messages")
    say("PASS EventBridge ko p7 aur p8 mile. Review queue mein sirf p7 mila.")
    say("GAP Host ne handler chalaaya. Lambda runtime, CloudFront delivery, IAM enforcement aur global failover is run mein test nahi hue.")


def cleanup():
    def client(name):
        return boto3.client(name)
    cf, lam, iam = (client(n) for n in ("cloudfront","lambda","iam"))
    counts = {"state":len(tf("state","list").splitlines()), "buckets":len(client("s3").list_buckets()["Buckets"]),
              "distributions":cf.list_distributions()["DistributionList"]["Quantity"],
              "oacs":cf.list_origin_access_controls()["OriginAccessControlList"]["Quantity"],
              "tables":len(client("dynamodb").list_tables()["TableNames"]), "topics":len(client("sns").list_topics()["Topics"]),
              "queues":len(client("sqs").list_queues().get("QueueUrls",[])), "rules":len(client("events").list_rules()["Rules"]),
              "functions":len(lam.list_functions()["Functions"]), "mappings":len(lam.list_event_source_mappings()["EventSourceMappings"]),
              "roles":sum(r["RoleName"]=="pix-worker" for r in iam.list_roles()["Roles"]),
              "logs":len(client("logs").describe_log_groups(logGroupNamePrefix="/aws/lambda/pix-worker")["logGroups"])}
    assert not any(counts.values()), counts
    say("PASS CLEANUP READBACK " + json.dumps(counts))


if not Path(TF).is_file() or not Path(MIRROR).is_dir():
    raise SystemExit("Set LAB41_TERRAFORM and LAB41_PROVIDER_MIRROR. See README.")
with socket.socket() as preflight:
    preflight.bind(("127.0.0.1",0))
server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
server.start()
host,port = server.get_host_and_port()
try:
    endpoint = f"http://{host}:{port}"
    os.environ.update(AWS_ENDPOINT_URL=endpoint, TF_VAR_endpoint=endpoint)
    say("OWNED MOTO " + endpoint)
    shutil.copyfile(HERE / "main.tf", RUN / "main.tf")
    with zipfile.ZipFile(RUN / "worker.zip","w") as package:
        package.write(HERE / "worker.py","worker.py")
    tf("init","-input=false","-no-color")
    try:
        tf("apply","-input=false","-auto-approve","-no-color")
        say("PASS Terraform apply ke baad state mein " + str(len(tf("state","list").splitlines())) + " resources hain.")
        review(json.loads(tf("output","-json","core")))
    finally:
        tf("destroy","-refresh=false","-input=false","-auto-approve","-no-color")
        cleanup()
finally:
    server.stop()
    with socket.socket() as probe:
        assert probe.connect_ex((host,port)) != 0
    say("PASS OWNED MOTO STOPPED / LISTENER CLOSED")
