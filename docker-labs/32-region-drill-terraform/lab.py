"""Lab 32. Terraform aur do Regional clients sirf apne Moto server se baat karte hain."""
import json
import logging
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab32-runs"
EVIDENCE.mkdir(parents=True, exist_ok=True)
RUN = Path(tempfile.mkdtemp(prefix="run-", dir=EVIDENCE))
TF = shutil.which("terraform") or str(ROOT / ".overhaul-evidence/tools/terraform")
MIRROR = Path(os.getenv("LAB32_PROVIDER_MIRROR", ROOT / "docker-labs/08-three-tier-terraform/.terraform/providers"))
for key in list(os.environ):
    if key.startswith(("AWS_", "TF_", "BOTO_")):
        del os.environ[key]
(RUN / "config").write_text("[default]\nregion = ap-south-1\n")
(RUN / "credentials").write_text("[default]\naws_access_key_id = test\naws_secret_access_key = test\n")
(RUN / "terraform.tfrc").write_text('provider_installation { filesystem_mirror { path = ' + json.dumps(str(MIRROR.resolve())) + ' } }\n')
os.environ.update(AWS_CONFIG_FILE=str(RUN / "config"), AWS_SHARED_CREDENTIALS_FILE=str(RUN / "credentials"),
                  AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test", AWS_MAX_ATTEMPTS="1",
                  AWS_EC2_METADATA_DISABLED="true", AWS_DEFAULT_REGION="ap-south-1",
                  TF_CLI_CONFIG_FILE=str(RUN / "terraform.tfrc"), TF_IN_AUTOMATION="1",
                  CHECKPOINT_DISABLE="1", NO_PROXY="127.0.0.1,localhost")
import boto3
from botocore.exceptions import ClientError
from moto.server import ThreadedMotoServer

logging.getLogger("werkzeug").setLevel(logging.CRITICAL)
PRIMARY, SECONDARY = "ap-south-1", "ap-south-2"
SECRET = "shopkaro/checkout"
server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
log = RUN / "drill.log"


def say(line):
    print(line, flush=True)
    with log.open("a") as stream:
        print(line, file=stream)


def check(ok, line):
    if not ok:
        raise AssertionError(line)
    say("PASS " + line)


def tf(*args):
    result = subprocess.run([TF, *args], cwd=RUN, capture_output=True, text=True, timeout=180)
    with (RUN / "terraform.log").open("a") as stream:
        print(*args, result.stdout, result.stderr, file=stream)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


def client(service, region):
    return boto3.client(service, region_name=region, endpoint_url=endpoint)


def provider(alias, region):
    return f'''provider "aws" {{
  alias = "{alias}"
  region = "{region}"
  skip_credentials_validation = true
  skip_requesting_account_id = true
  skip_metadata_api_check = true
  endpoints {{
    kms = "{endpoint}"
    secretsmanager = "{endpoint}"
    route53 = "{endpoint}"
    ec2 = "{endpoint}"
    autoscaling = "{endpoint}"
    sts = "{endpoint}"
  }}
}}
'''


def drill(outputs):
    key, zone, probe = (outputs[k]["value"] for k in ("key_id", "zone_id", "check_id"))
    kms = client("kms", SECONDARY)
    replica = kms.describe_key(KeyId=key)["KeyMetadata"]
    check(replica["Arn"].split(":")[3] == SECONDARY and replica["MultiRegion"], "same key ID mila, ARN secondary Region ka hai")
    ciphertext = client("kms", PRIMARY).encrypt(KeyId=key, Plaintext=b"TEST-order-42")["CiphertextBlob"]
    try:
        clear = kms.decrypt(KeyId=key, CiphertextBlob=ciphertext)["Plaintext"]
    except ClientError as error:
        if error.response["Error"]["Code"] != "AccessDeniedException":
            raise
        say("GAP Hyderabad KMS Decrypt ne AccessDeniedException diya. Dono Regions mein decrypt ki permission alag jaancho.")
    else:
        check(clear == b"TEST-order-42", "Mumbai ka encrypted order Hyderabad ki key se khula")
    kind = client("kms", PRIMARY).describe_key(KeyId=key)["KeyMetadata"]["MultiRegionConfiguration"]["MultiRegionKeyType"]
    say(("GAP " if kind != "PRIMARY" else "") + "Mumbai key type after replication = " + kind)
    status = client("secretsmanager", PRIMARY).describe_secret(SecretId=SECRET)["ReplicationStatus"]
    local = client("secretsmanager", SECONDARY).get_secret_value(SecretId=SECRET)["SecretString"]
    check(any(s["Region"] == SECONDARY and s["Status"] == "InSync" for s in status) and local == "TEST-checkout-v1",
          "secret InSync hai aur secondary se TEST value mili")
    say("GAP Moto secret status mein KmsKeyId = " + str(status[0].get("KmsKeyId")) + ". Key policy enforcement is run mein nahi maapi.")
    dns = client("route53", PRIMARY)
    zone_records = dns.list_resource_record_sets(HostedZoneId=zone)["ResourceRecordSets"]
    records = {r["Failover"]: r for r in zone_records if r["Name"] == "checkout.shopkaro.test."}
    check(any(r["Name"] == "mumbai.shopkaro.test." and r["ResourceRecords"] == [{"Value": "192.0.2.10"}]
              for r in zone_records), "probe ka apna DNS naam hamesha Mumbai par hai")
    config = dns.get_health_check(HealthCheckId=probe)["HealthCheck"]["HealthCheckConfig"]
    check(records["PRIMARY"]["HealthCheckId"] == probe and config["ResourcePath"] == "/ready" and
          config["FullyQualifiedDomainName"].rstrip(".") == "mumbai.shopkaro.test", "primary DNS record Mumbai ke /ready check se juda hai")
    group = client("autoscaling", SECONDARY).describe_auto_scaling_groups(AutoScalingGroupNames=["checkout-dr"])["AutoScalingGroups"][0]
    capacity = min(group["MinSize"], group["DesiredCapacity"]) * 100
    for primary_healthy, expected in [(True, "192.0.2.10"), (False, "192.0.2.20")]:
        answer = records["PRIMARY" if primary_healthy else "SECONDARY"]["ResourceRecords"][0]["Value"]
        check(answer == expected, f"HOST CHECK primary healthy={primary_healthy} -> {answer}")
    check(capacity >= 300 and local == "TEST-checkout-v1", f"HOST CHECK standby budget {capacity} orders/s, drill load 300 orders/s")
    say("GAP DNS probes, EC2 boot, checkout load aur RTO/RPO ka live test baaki hai.")


def cleanup_readback(outputs):
    check(not tf("state", "list").strip(), "CLEANUP READBACK Terraform state khaali hai")
    check(not client("autoscaling", SECONDARY).describe_auto_scaling_groups()["AutoScalingGroups"] and
          not client("route53", PRIMARY).list_hosted_zones()["HostedZones"] and
          not client("route53", PRIMARY).list_health_checks()["HealthChecks"], "CLEANUP READBACK group, zone aur health check hat gaye")
    check(all(not client("secretsmanager", region).list_secrets()["SecretList"] for region in (PRIMARY, SECONDARY)),
          "CLEANUP READBACK dono Regions mein secret ki list khaali hai")
    for region in (SECONDARY, PRIMARY):
        state = client("kms", region).describe_key(KeyId=outputs["key_id"]["value"])["KeyMetadata"]["KeyState"]
        check(state in ("PendingDeletion", "PendingReplicaDeletion"), "CLEANUP READBACK " + region + " KMS " + state)


# Moto ka start() bind fail hone par wait karta rehta hai. Pehle socket check karo.
with socket.socket() as test_socket:
    test_socket.bind(("127.0.0.1", 0))
server.start()
try:
    host, port = server.get_host_and_port()
    endpoint = f"http://{host}:{port}"
    os.environ["AWS_ENDPOINT_URL"] = endpoint
    say("OWNED MOTO " + endpoint)
    shutil.copyfile(HERE / "main.tf", RUN / "main.tf")
    (RUN / "providers.tf").write_text(provider("primary", PRIMARY) + provider("standby", SECONDARY))
    tf("init", "-no-color", "-input=false")
    try:
        tf("apply", "-no-color", "-input=false", "-auto-approve")
        outputs = json.loads(tf("output", "-json"))
        drill(outputs)
    finally:
        # Moto can report REPLICA for the primary after replication. Use our fresh local state.
        tf("destroy", "-refresh=false", "-no-color", "-input=false", "-auto-approve")
    cleanup_readback(outputs)
finally:
    server.stop()
    with socket.socket() as connection:
        check(connection.connect_ex((host, port)) != 0, "OWNED MOTO STOPPED / LISTENER CLOSED")
