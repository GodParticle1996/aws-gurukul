"""Verify local log delivery by reading the stored bytes."""
from contextlib import ExitStack
from datetime import datetime, timezone
import gzip
import json
import logging
import os
from pathlib import Path
import socket
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab37-runs"
EVIDENCE.mkdir(parents=True, exist_ok=True)
RUN = Path(tempfile.mkdtemp(prefix="run-", dir=EVIDENCE))
# SDK imports se pehle is run ki local config aur dummy credentials set karo.
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


def say(line):
    print(line, flush=True)
    with (RUN / "lab.log").open("a") as stream:
        print(line, file=stream)


def check(ok, message):
    if not ok:
        raise AssertionError(message)
    say("PASS " + message)


def main(endpoint):
    logs, fire, s3, search, iam = [boto3.client(s, endpoint_url=endpoint)
                                  for s in ("logs", "firehose", "s3", "opensearch", "iam")]
    group, bucket, domain = "/pixshare/feed", "pix-log-vault", "pix-logs"
    pat = '{ $.level = "ERROR" || $.level = "WARN" }'
    def contents(prefix):
        keys = s3.list_objects_v2(Bucket=bucket, Prefix=prefix).get("Contents", [])
        return [s3.get_object(Bucket=bucket, Key=k["Key"])["Body"].read() for k in keys]

    with ExitStack() as clean:
        s3.create_bucket(Bucket=bucket)
        clean.callback(s3.delete_bucket, Bucket=bucket)
        def empty():
            for obj in s3.list_objects_v2(Bucket=bucket).get("Contents", []):
                s3.delete_object(Bucket=bucket, Key=obj["Key"])
        clean.callback(empty)
        rule = {"ID":"raw-expiry", "Status":"Enabled", "Filter":{"Prefix":"raw/"}, "Expiration":{"Days":90}}
        s3.put_bucket_lifecycle_configuration(Bucket=bucket, LifecycleConfiguration={"Rules":[rule]})
        check(s3.get_bucket_lifecycle_configuration(Bucket=bucket)["Rules"] == [rule], "S3 raw/ ki expiry 90 din hai.")
        def role(name, service, action, resource):
            def policy(statement):
                return json.dumps({"Version":"2012-10-17", "Statement":[statement]})
            trust = policy({"Effect":"Allow","Action":"sts:AssumeRole","Principal":{"Service":service}})
            arn = iam.create_role(RoleName=name, AssumeRolePolicyDocument=trust)["Role"]["Arn"]
            clean.callback(iam.delete_role, RoleName=name)
            doc = policy({"Effect":"Allow","Action":action,"Resource":resource})
            iam.put_role_policy(RoleName=name, PolicyName="deliver", PolicyDocument=doc)
            clean.callback(iam.delete_role_policy, RoleName=name, PolicyName="deliver")
            return arn

        bucket_arn = "arn:aws:s3:::" + bucket
        writer = role("pix-fire-writer", "firehose.amazonaws.com",
                      ["s3:AbortMultipartUpload","s3:GetBucketLocation","s3:GetObject","s3:ListBucket",
                       "s3:ListBucketMultipartUploads","s3:PutObject"], [bucket_arn, bucket_arn+"/*"])
        def stream(name, prefix):
            dest = {"BucketARN":bucket_arn, "RoleARN":writer, "Prefix":prefix}
            arn = fire.create_delivery_stream(DeliveryStreamName=name, S3DestinationConfiguration=dest)["DeliveryStreamARN"]
            clean.callback(fire.delete_delivery_stream, DeliveryStreamName=name)
            actual = fire.describe_delivery_stream(DeliveryStreamName=name)["DeliveryStreamDescription"]
            assert actual["Destinations"][0]["S3DestinationDescription"]["Prefix"] == prefix
            return arn
        raw = stream("pix-raw", "raw/")
        probe = stream("pix-pattern-probe", "probe/")
        stream("pix-doc-probe", "docs/")
        forward = role("pix-log-forward", "logs.amazonaws.com", "firehose:PutRecord", [raw, probe])
        logs.create_log_group(logGroupName=group)
        clean.callback(logs.delete_log_group, logGroupName=group)
        logs.create_log_stream(logGroupName=group, logStreamName="release")
        for name, pattern, dest in [("raw","",raw), ("hot-probe",pat,probe)]:
            logs.put_subscription_filter(logGroupName=group, filterName=name, filterPattern=pattern,
                                         destinationArn=dest, roleArn=forward)
        subs = logs.describe_subscription_filters(logGroupName=group)["subscriptionFilters"]
        check({(s["filterName"],s["filterPattern"],s["destinationArn"]) for s in subs}
              == {("raw","",raw),("hot-probe",pat,probe)}, "Raw aur filtered probe ke pattern aur ARN mile.")
        now = int(datetime.now(timezone.utc).timestamp()*1000)
        rows = [{"level":level, "requestId":req} for level,req in [("INFO","p7"),("WARN","p8"),("ERROR","p9")]]
        logs.put_log_events(logGroupName=group, logStreamName="release",
                            logEvents=[{"timestamp":now+i, "message":json.dumps(row)} for i,row in enumerate(rows)])
        def events(prefix, name):
            result = []
            for data in contents(prefix):
                env = json.loads(gzip.decompress(data))
                assert env["logGroup"] == group and env["messageType"] == "DATA_MESSAGE"
                assert env["logStream"] == "release" and name in env["subscriptionFilters"]
                result.extend(env["logEvents"])
            return result
        # Bucket ke bytes kholo. Saved filter ya ACTIVE status se delivery prove nahi hoti.
        raw_events = events("raw/", "raw")
        check([json.loads(e["message"]) for e in raw_events] == rows and len({e["id"] for e in raw_events}) == 3,
              "Logs → Firehose → S3: gzip kholne par INFO p7, WARN p8 aur ERROR p9 mile.")
        matched = [json.loads(e["message"]) for e in events("probe/", "hot-probe")]
        if matched == rows:
            say("GAP Moto ke hot-probe mein INFO p7 bhi aaya. Saved pattern ne delivery par filter nahi kiya.")
        else:
            check(matched == rows[1:], "Hot probe ne sirf WARN aur ERROR bheje.")
        # Moto ke filter ko assume mat karo. Host par alag se hot documents banao.
        docs = [{"eventId":e["id"], **json.loads(e["message"])} for e in raw_events
                if json.loads(e["message"])["level"] in ("WARN", "ERROR")]
        response = fire.put_record_batch(DeliveryStreamName="pix-doc-probe",
                    Records=[{"Data":(json.dumps(doc)+"\n").encode()} for doc in docs])
        assert response["FailedPutCount"] == 0
        saved = [json.loads(line) for data in contents("docs/") for line in data.splitlines()]
        check(saved == docs and [d["requestId"] for d in saved] == ["p8","p9"],
              "HOST CHECK Python ne batch khola. Do alag Firehose records ke JSON S3 mein mile.")

        clusters = {"InstanceType":"r6g.xlarge.search", "InstanceCount":3, "ZoneAwarenessEnabled":True,
                    "ZoneAwarenessConfig":{"AvailabilityZoneCount":3}, "DedicatedMasterEnabled":True,
                    "DedicatedMasterType":"c6g.large.search", "DedicatedMasterCount":3}
        search.create_domain(DomainName=domain, ClusterConfig=clusters, EBSOptions={"EBSEnabled":True,"VolumeType":"gp3","VolumeSize":30},
                             EncryptionAtRestOptions={"Enabled":True}, NodeToNodeEncryptionOptions={"Enabled":True})
        clean.callback(search.delete_domain, DomainName=domain)
        meta = search.describe_domain(DomainName=domain)["DomainStatus"]
        check(meta["ClusterConfig"]["InstanceCount"] == 3 and meta["EBSOptions"]["VolumeSize"] == 30 and
              meta["EncryptionAtRestOptions"]["Enabled"] and meta["EBSOptions"]["VolumeType"] == "gp3" and
              meta["ClusterConfig"]["ZoneAwarenessConfig"]["AvailabilityZoneCount"] == 3 and
              meta["ClusterConfig"]["DedicatedMasterCount"] == 3,
              "OpenSearch metadata mein 3 data nodes, 3 masters, 3 AZ, encryption aur 30 GB gp3 per data node mile.")
        index_role = role("pix-index-writer", "firehose.amazonaws.com",
                          ["es:DescribeElasticsearchDomain","es:DescribeElasticsearchDomains","es:DescribeElasticsearchDomainConfig",
                           "es:ESHttpPost","es:ESHttpPut","es:ESHttpGet"], [meta["ARN"],meta["ARN"]+"/*"])
        dest = {"DomainARN":meta["ARN"],"RoleARN":index_role,"IndexName":"pix-feed","IndexRotationPeriod":"OneDay",
                "S3BackupMode":"AllDocuments",
                "BufferingHints":{"IntervalInSeconds":60,"SizeInMBs":5},
                "S3Configuration":{"BucketARN":bucket_arn,"RoleARN":writer,"Prefix":"matched/"}}
        try:
            fire.create_delivery_stream(DeliveryStreamName="pix-search", AmazonopensearchserviceDestinationConfiguration=dest)
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            message = exc.response["Error"]["Message"]
            if code != "InvalidArgumentException" or "Exactly one destination configuration" not in message:
                raise
            say("GAP Firehose ne OpenSearch destination configuration nahi pehchaana (" + code + "). Index write test nahi hua.")
        else:
            clean.callback(fire.delete_delivery_stream, DeliveryStreamName="pix-search")
            description = fire.describe_delivery_stream(DeliveryStreamName="pix-search")["DeliveryStreamDescription"]
            check("AmazonopensearchserviceDestinationDescription" in description["Destinations"][0], "Search destination metadata mila.")
            say("GAP Is local run mein OpenSearch index aur Lambda runtime nahi chale.")
    counts = {"groups":len(logs.describe_log_groups()["logGroups"]), "streams":len(fire.list_delivery_streams()["DeliveryStreamNames"]),
              "domains":len(search.list_domain_names()["DomainNames"]), "buckets":len(s3.list_buckets()["Buckets"]),
              "roles":len(iam.list_roles()["Roles"])}
    check(not any(counts.values()), "CLEANUP READBACK " + json.dumps(counts))

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
