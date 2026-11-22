"""Compare two complete feed reads on an isolated Moto server."""
import gzip
from contextlib import ExitStack
import json
import logging
import os
from pathlib import Path
import socket
import tempfile
from time import monotonic, perf_counter, sleep

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab34-runs"
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



def read_all(operation, **params):
    rows, evaluated, units, pages = [], 0, 0.0, 0
    start = perf_counter()
    while True:
        page = operation(**params, Limit=32, ReturnConsumedCapacity="TOTAL", ConsistentRead=False)
        rows.extend(page["Items"])
        evaluated += page["ScannedCount"]
        units += page["ConsumedCapacity"]["CapacityUnits"]
        pages += 1
        last = page.get("LastEvaluatedKey")
        if not last:
            break
        params["ExclusiveStartKey"] = last
    elapsed = (perf_counter() - start) * 1000
    say(f"HOST CHECK {operation.__name__}: pages={pages} read={evaluated} returned={len(rows)} "
        f"MotoUnits={units:g} time={elapsed:.2f} ms")
    return rows, evaluated


def main(endpoint):
    def client(name):
        return boto3.client(name, endpoint_url=endpoint)

    ddb, s3, rds = map(client, ["dynamodb", "s3", "rds"])
    name, bucket, cluster = "pix-feed", "pix-report-lab34", "pix-accounts"
    base = [{"AttributeName": "userId", "KeyType": "HASH"}, {"AttributeName": "postKey", "KeyType": "RANGE"}]
    index = [{"AttributeName": "creatorId", "KeyType": "HASH"}, base[1]]
    def empty_bucket():
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
            for obj in page.get("Contents", []):
                s3.delete_object(Bucket=bucket, Key=obj["Key"])

    with ExitStack() as clean:
        s3.create_bucket(Bucket=bucket)
        clean.callback(s3.delete_bucket, Bucket=bucket)
        clean.callback(empty_bucket)
        table = ddb.create_table(TableName=name, BillingMode="PAY_PER_REQUEST", KeySchema=base,
                AttributeDefinitions=[{"AttributeName": k, "AttributeType": "S"} for k in ("userId","postKey","creatorId")],
                GlobalSecondaryIndexes=[{"IndexName": "byCreator", "KeySchema": index,
                                         "Projection": {"ProjectionType": "ALL"}}])["TableDescription"]
        clean.callback(ddb.delete_table, TableName=name)
        ddb.get_waiter("table_exists").wait(TableName=name)
        desc = ddb.describe_table(TableName=name)["Table"]
        check(desc["KeySchema"] == base and desc["GlobalSecondaryIndexes"][0]["KeySchema"] == index,
              "feed aur byCreator ki dono keys mili.")
        data = [{"userId": {"S": f"u{u:02}"}, "postKey": {"S": f"2026-11-{day:02}#u{u:02}"},
                 "creatorId": {"S": f"c{u % 4}"}, "caption": {"S": "a" * 900}} for u in range(32) for day in range(1,13)]
        for offset in range(0,len(data),25):
            writes = [{"PutRequest": {"Item": item}} for item in data[offset:offset+25]]
            response = ddb.batch_write_item(RequestItems={name: writes})
            if response["UnprocessedItems"]:
                raise AssertionError("Moto did not accept all feed rows")
        condition = dict(TableName=name, ExpressionAttributeValues={":u": {"S": "u07"}})
        feed, query_read = read_all(ddb.query, KeyConditionExpression="userId = :u", **condition)
        scanned, scan_read = read_all(ddb.scan, FilterExpression="userId = :u", **condition)
        expected = [row for row in data if row["userId"]["S"] == "u07"]
        order = lambda row: row["postKey"]["S"]
        check(feed == expected and sorted(scanned, key=order) == expected and query_read == 12 and scan_read == 384,
              "Query aur filtered Scan se wahi 12 posts mili. Scan ne 384 items dekhe.")
        pitr = ddb.update_continuous_backups(TableName=name, PointInTimeRecoverySpecification={"PointInTimeRecoveryEnabled": True})
        check(pitr["ContinuousBackupsDescription"]["PointInTimeRecoveryDescription"]["PointInTimeRecoveryStatus"] == "ENABLED",
              "pix-feed par PITR chalu hai.")
        export = ddb.export_table_to_point_in_time(TableArn=table["TableArn"], S3Bucket=bucket, S3Prefix="weekly",
                    ExportFormat="DYNAMODB_JSON", ClientToken="lab34-weekly")["ExportDescription"]
        end = monotonic() + 10
        while export["ExportStatus"] == "IN_PROGRESS" and monotonic() < end:
            sleep(.05)
            export = ddb.describe_export(ExportArn=export["ExportArn"])["ExportDescription"]
        check(export["ExportStatus"] == "COMPLETED", "Moto export poora hua.")
        exported = []
        for obj in s3.list_objects_v2(Bucket=bucket, Prefix="weekly/")["Contents"]:
            if "/data/" in obj["Key"] and obj["Key"].endswith(".gz"):
                raw = s3.get_object(Bucket=bucket, Key=obj["Key"])["Body"].read()
                exported.extend(json.loads(line)["Item"] for line in gzip.decompress(raw).splitlines())
        check(sorted(exported, key=order) == sorted(data, key=order), "S3 ki gzip file mein 384 rows aur unke attributes mile.")
        # Rehearse the interview change on this disposable table. The base rows stay in place.
        ddb.update_table(TableName=name, GlobalSecondaryIndexUpdates=[{"Delete": {"IndexName": "byCreator"}}])
        ddb.get_waiter("table_exists").wait(TableName=name)
        ddb.update_table(TableName=name,
                AttributeDefinitions=[{"AttributeName": k, "AttributeType": "S"} for k in ("creatorId","postKey")],
                GlobalSecondaryIndexUpdates=[{"Create": {"IndexName": "byCreator", "KeySchema": index,
                                                        "Projection": {"ProjectionType": "ALL"}}}])
        ddb.get_waiter("table_exists").wait(TableName=name)
        rebuilt = ddb.describe_table(TableName=name)["Table"]["GlobalSecondaryIndexes"][0]
        if rebuilt["IndexStatus"] != "ACTIVE":
            raise AssertionError("Moto did not finish the index")
        # A second viewer sees an existing post. Save its author without the GSI partition key.
        copy = dict(next(row for row in data if row["creatorId"]["S"] == "c3"))
        copy["userId"] = {"S": "u42"}
        copy["authorId"] = copy.pop("creatorId")
        ddb.put_item(TableName=name, Item=copy)
        kept = ddb.get_item(TableName=name, Key={k: copy[k] for k in ("userId", "postKey")})["Item"]
        check(kept == copy, "Doosre viewer ki feed mein bhi wahi post mili.")
        creator, _ = read_all(ddb.query, TableName=name, IndexName="byCreator", KeyConditionExpression="creatorId = :c",
                              ExpressionAttributeValues={":c": {"S": "c3"}})
        check(sorted(creator, key=order) == sorted([r for r in data if r["creatorId"]["S"] == "c3"], key=order),
              "byCreator par c3 ki 96 posts mili. Viewer ki copy index mein dobara nahi aayi.")
        rds.create_db_cluster(DBClusterIdentifier=cluster, Engine="aurora-postgresql", MasterUsername="pixadmin",
                              ManageMasterUserPassword=True, StorageEncrypted=True)
        clean.callback(rds.delete_db_cluster, DBClusterIdentifier=cluster, SkipFinalSnapshot=True)
        rds.get_waiter("db_cluster_available").wait(DBClusterIdentifier=cluster, WaiterConfig={"Delay": 1, "MaxAttempts": 5})
        db = rds.describe_db_clusters(DBClusterIdentifier=cluster)["DBClusters"][0]
        check(db["Engine"] == "aurora-postgresql" and db["StorageEncrypted"] and not db["DBClusterMembers"],
              "Aurora cluster ki settings mili. Writer instances zero hain.")
        say("GAP Time laptop aur Moto ka hai. MotoUnits AWS ka bill nahi naapte. SQL writer aur Athena query nahi chale.")
    remaining = {"table": name in ddb.list_tables()["TableNames"],
                 "bucket": bucket in [b["Name"] for b in s3.list_buckets()["Buckets"]],
                 "cluster": cluster in [c["DBClusterIdentifier"] for c in rds.describe_db_clusters()["DBClusters"]]}
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
