"""Lab 33 runs against its own localhost Moto. Runtime evidence comes from host Python."""
import base64
from contextlib import ExitStack
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab33-runs"
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


def main(endpoint):
    def client(service):
        return boto3.client(service, endpoint_url=endpoint)

    iam, lam, ecs, ec2 = map(client, ["iam", "lambda", "ecs", "ec2"])
    source = (HERE / "handler.py").read_text()
    package = io.BytesIO()
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr("handler.py", source)
    payload = package.getvalue()
    with ExitStack() as clean:
        role = iam.create_role(RoleName="pix-thumb", AssumeRolePolicyDocument=json.dumps({
            "Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"},
                                                    "Action": "sts:AssumeRole"}]}))["Role"]["Arn"]
        clean.callback(iam.delete_role, RoleName="pix-thumb")
        lam.create_function(FunctionName="pix-thumb", Runtime="python3.12", Handler="handler.thumbnail",
                            Role=role, Code={"ZipFile": payload}, MemorySize=256, Timeout=3)
        clean.callback(lam.delete_function, FunctionName="pix-thumb")
        lam.update_function_configuration(FunctionName="pix-thumb", MemorySize=512, Timeout=15)
        cfg = lam.get_function_configuration(FunctionName="pix-thumb")
        check(cfg["CodeSha256"] == base64.b64encode(hashlib.sha256(payload).digest()).decode() and
              (cfg["Handler"], cfg["MemorySize"], cfg["Timeout"]) == ("handler.thumbnail", 512, 15),
              "Lambda ZIP ka hash mila. Handler thumbnail, memory 512 MB aur timeout 15 second hai.")
        vpc = ec2.create_vpc(CidrBlock="10.33.0.0/16")["Vpc"]["VpcId"]
        clean.callback(ec2.delete_vpc, VpcId=vpc)
        ec2.modify_vpc_attribute(VpcId=vpc, EnableDnsHostnames={"Value": True})
        subnet = ec2.create_subnet(VpcId=vpc, CidrBlock="10.33.1.0/24")["Subnet"]["SubnetId"]
        clean.callback(ec2.delete_subnet, SubnetId=subnet)
        def clear_task_interfaces():
            for eni in ec2.describe_network_interfaces(Filters=[{"Name": "subnet-id", "Values": [subnet]}])["NetworkInterfaces"]:
                ec2.delete_network_interface(NetworkInterfaceId=eni["NetworkInterfaceId"])
        clean.callback(clear_task_interfaces)
        ecs.create_cluster(clusterName="pix-media")
        clean.callback(ecs.delete_cluster, cluster="pix-media")
        event = {"pixels": [[0, 20, 100, 100], [20, 40, 100, 100], [8, 8, 2, 4], [8, 8, 6, 8]]}
        # The ECS command carries the same short source as the Lambda ZIP.
        entry = source + "\nimport json,sys\nprint(json.dumps(thumbnail(json.loads(sys.argv[1]))))"
        command = ["python", "-c", entry, json.dumps(event)]
        td = ecs.register_task_definition(family="pix-thumb", requiresCompatibilities=["FARGATE"],
                networkMode="awsvpc", cpu="256", memory="512", containerDefinitions=[
                    {"name": "thumb", "image": "public.ecr.aws/docker/library/python:3.12-slim",
                     "essential": True, "memory": 512, "command": command}])["taskDefinition"]["taskDefinitionArn"]
        clean.callback(ecs.deregister_task_definition, taskDefinition=td)
        group = ec2.describe_security_groups(Filters=[{"Name": "vpc-id", "Values": [vpc]},
                                                     {"Name": "group-name", "Values": ["default"]}])["SecurityGroups"][0]["GroupId"]
        task = ecs.run_task(cluster="pix-media", taskDefinition=td, launchType="FARGATE",
                networkConfiguration={"awsvpcConfiguration": {"subnets": [subnet], "securityGroups": [group]}})["tasks"][0]["taskArn"]
        clean.callback(ecs.stop_task, cluster="pix-media", task=task)
        read = ecs.describe_tasks(cluster="pix-media", tasks=[task])["tasks"][0]
        check(read["taskDefinitionArn"] == td and read["launchType"] == "FARGATE", "Moto mein Fargate task sahi revision par mila. Status " + read["lastStatus"] + ".")
        saved = ecs.describe_task_definition(taskDefinition=td)["taskDefinition"]["containerDefinitions"][0]["command"]
        result = subprocess.check_output([sys.executable, *saved[1:]], text=True).strip()
        from_zip = {}
        with zipfile.ZipFile(io.BytesIO(payload)) as zipped:
            exec(zipped.read("handler.py"), from_zip)
        check(json.loads(result) == from_zip["thumbnail"](event) == [[20, 100], [8, 5]],
              "HOST CHECK same 4x4 photo se ZIP aur ECS command dono ne " + result + " diya.")
        say("GAP Task status Moto se mila. Lambda runtime aur ECS image laptop par launch nahi hue.")
        say(subprocess.check_output([sys.executable, "-I", str(HERE / "breakeven.py")], text=True).rstrip())
    leftovers = {
        "function": [r["FunctionName"] for r in lam.list_functions()["Functions"] if r["FunctionName"] == "pix-thumb"],
        "role": [r["RoleName"] for r in iam.list_roles()["Roles"] if r["RoleName"] == "pix-thumb"],
        "active_cluster": [c["clusterName"] for c in ecs.describe_clusters(clusters=["pix-media"])["clusters"] if c["status"] != "INACTIVE"],
        "task_interfaces": [e["NetworkInterfaceId"] for e in ec2.describe_network_interfaces(Filters=[{"Name": "subnet-id", "Values": [subnet]}])["NetworkInterfaces"]],
        "active_revision": ecs.list_task_definitions(familyPrefix="pix-thumb", status="ACTIVE")["taskDefinitionArns"],
        "vpc": [r["VpcId"] for r in ec2.describe_vpcs()["Vpcs"] if r["VpcId"] == vpc],
    }
    check(not any(leftovers.values()), "CLEANUP READBACK " + json.dumps(leftovers))


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
