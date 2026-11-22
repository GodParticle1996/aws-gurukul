"""PixShare edge resources on an owned loopback server."""
from contextlib import ExitStack
from fnmatch import fnmatchcase
import json
import logging
import os
from pathlib import Path
import socket
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab38-runs"
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
    def client(service, region="us-east-1"):
        return boto3.client(service, region_name=region, endpoint_url=endpoint)

    ec2, elb, cf, waf, s3 = map(client, ["ec2", "elbv2", "cloudfront", "wafv2", "s3"])
    ga = client("globalaccelerator", "us-west-2")
    disabled = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    forward = "216adef6-5c7f-47e4-b989-5492eafa07d3"
    bucket = "pix-edge-images"
    path = "/images/p7.jpg"

    with ExitStack() as clean:
        vpc = ec2.create_vpc(CidrBlock="10.38.0.0/16")["Vpc"]["VpcId"]
        clean.callback(ec2.delete_vpc, VpcId=vpc)
        igw = ec2.create_internet_gateway()["InternetGateway"]["InternetGatewayId"]
        clean.callback(ec2.delete_internet_gateway, InternetGatewayId=igw)
        ec2.attach_internet_gateway(VpcId=vpc, InternetGatewayId=igw)
        clean.callback(ec2.detach_internet_gateway, VpcId=vpc, InternetGatewayId=igw)
        subs = []
        for idx, az in enumerate(["us-east-1a","us-east-1b"]):
            subnet = ec2.create_subnet(VpcId=vpc, CidrBlock=f"10.38.{idx}.0/24", AvailabilityZone=az)["Subnet"]["SubnetId"]
            clean.callback(ec2.delete_subnet, SubnetId=subnet)
            subs.append(subnet)
        lb = elb.create_load_balancer(Name="pix-api", Subnets=subs, Scheme="internal", Type="application")["LoadBalancers"][0]
        arn = lb["LoadBalancerArn"]
        clean.callback(elb.delete_load_balancer, LoadBalancerArn=arn)
        def reply(status):
            return [{"Type":"fixed-response","FixedResponseConfig":{"StatusCode":status,"ContentType":"text/plain","MessageBody":"pix-api"}}]
        listener = elb.create_listener(LoadBalancerArn=arn, Protocol="HTTP", Port=80, DefaultActions=reply("404"))["Listeners"][0]["ListenerArn"]
        clean.callback(elb.delete_listener, ListenerArn=listener)
        rule = elb.create_rule(ListenerArn=listener, Priority=10, Conditions=[{"Field":"path-pattern",
                               "PathPatternConfig":{"Values":["/api","/api/*"]}}], Actions=reply("200"))["Rules"][0]["RuleArn"]
        clean.callback(elb.delete_rule, RuleArn=rule)
        status = elb.describe_load_balancers(LoadBalancerArns=[arn])["LoadBalancers"][0]
        routes = elb.describe_rules(RuleArns=[rule])["Rules"][0]
        check(status["Scheme"]=="internal" and len(status["AvailabilityZones"])==2 and
              set(routes["Conditions"][0]["PathPatternConfig"]["Values"])=={"/api","/api/*"}, "Internal ALB ke do AZ aur dono API path mile.")

        s3.create_bucket(Bucket=bucket)
        clean.callback(s3.delete_bucket, Bucket=bucket)
        s3.put_public_access_block(Bucket=bucket, PublicAccessBlockConfiguration={
            key:True for key in ["BlockPublicAcls","IgnorePublicAcls","BlockPublicPolicy","RestrictPublicBuckets"]})
        s3.put_object(Bucket=bucket, Key=path[1:], Body=b"pix-p7-v1")
        clean.callback(s3.delete_object, Bucket=bucket, Key=path[1:])
        oac = cf.create_origin_access_control(OriginAccessControlConfig={"Name":"pix-images","Description":"PixShare lab",
              "SigningProtocol":"sigv4","SigningBehavior":"always","OriginAccessControlOriginType":"s3"})["OriginAccessControl"]["Id"]
        def remove_oac():
            tag = cf.get_origin_access_control(Id=oac)["ETag"]
            cf.delete_origin_access_control(Id=oac, IfMatch=tag)
        clean.callback(remove_oac)
        scope = {"SampledRequestsEnabled":True,"CloudWatchMetricsEnabled":True,"MetricName":"pix-edge"}
        acl = waf.create_web_acl(Name="pix-edge",Scope="CLOUDFRONT",DefaultAction={"Allow":{}}, VisibilityConfig=scope,
                Rules=[{"Name":"release-check","Priority":0,"Action":{"Block":{}},"VisibilityConfig":scope,
                 "Statement":{"ByteMatchStatement":{"SearchString":b"/release-check","FieldToMatch":{"UriPath":{}},
                 "TextTransformations":[{"Priority":0,"Type":"NONE"}],"PositionalConstraint":"EXACTLY"}}}])["Summary"]
        def remove_acl():
            params = {"Name":"pix-edge","Id":acl["Id"],"Scope":"CLOUDFRONT"}
            waf.delete_web_acl(**params, LockToken=waf.get_web_acl(**params)["LockToken"])
        clean.callback(remove_acl)
        actual = waf.get_web_acl(Name="pix-edge",Id=acl["Id"],Scope="CLOUDFRONT")["WebACL"]
        check(actual["Rules"][0]["Statement"]["ByteMatchStatement"]["SearchString"]==b"/release-check" and
              actual["Rules"][0]["Action"]=={"Block":{}}, "Global WAF ki release-check block rule padhi.")

        origin = {"Id":"private-api","DomainName":lb["DNSName"]}
        try:
            v = cf.create_vpc_origin(VpcOriginEndpointConfig={"Name":"pix-vpc","Arn":arn,"HTTPPort":80,"HTTPSPort":443,
                                     "OriginProtocolPolicy":"http-only","OriginSslProtocols":{"Quantity":1,"Items":["TLSv1.2"]}})
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code not in ("404","500","501","NotImplemented","InternalError","InvalidAction"):
                raise
            say("GAP CreateVpcOrigin ka local response " + code + ". ALB DNS ko custom-origin metadata mein rakha.")
            origin["CustomOriginConfig"]={"HTTPPort":80,"HTTPSPort":443,"OriginProtocolPolicy":"http-only"}
        else:
            vid = v["VpcOrigin"]["Id"]
            clean.callback(lambda: cf.delete_vpc_origin(Id=vid,IfMatch=cf.get_vpc_origin(Id=vid)["ETag"]))
            origin["VpcOriginConfig"]={"VpcOriginId":vid}
            check(cf.get_vpc_origin(Id=vid)["VpcOrigin"]["VpcOriginEndpointConfig"]["Arn"]==arn, "VPC origin ka ALB ARN mila.")
        def behavior(target, policy):
            return {"TargetOriginId":target,"ViewerProtocolPolicy":"redirect-to-https","CachePolicyId":policy,
                    "TrustedSigners":{"Enabled":False,"Quantity":0},"TrustedKeyGroups":{"Enabled":False,"Quantity":0}}
        api = behavior("private-api",disabled)
        api["OriginRequestPolicyId"]=forward
        image = dict(behavior("images",optimized), PathPattern="/images/*")
        cfg = {"CallerReference":"pix-d6","Comment":"PixShare D6","Enabled":True,"WebACLId":acl["ARN"],
               "Origins":{"Quantity":2,"Items":[origin,{"Id":"images","DomainName":bucket+".s3.us-east-1.amazonaws.com",
                         "S3OriginConfig":{"OriginAccessIdentity":""},"OriginAccessControlId":oac}]},
               "DefaultCacheBehavior":api,"CacheBehaviors":{"Quantity":1,"Items":[image]}}
        dist = cf.create_distribution(DistributionConfig=cfg)["Distribution"]
        did = dist["Id"]
        def remove_distribution():
            tag=cf.get_distribution_config(Id=did)["ETag"]
            cf.update_distribution(Id=did,IfMatch=tag,DistributionConfig={**cfg,"Enabled":False})
            assert not cf.get_distribution_config(Id=did)["DistributionConfig"]["Enabled"]
            cf.delete_distribution(Id=did,IfMatch=cf.get_distribution_config(Id=did)["ETag"])
        clean.callback(remove_distribution)
        policy = {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"cloudfront.amazonaws.com"},
                  "Action":"s3:GetObject","Resource":"arn:aws:s3:::"+bucket+"/images/*",
                  "Condition":{"StringEquals":{"AWS:SourceArn":dist["ARN"]}}}]}
        s3.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
        check(json.loads(s3.get_bucket_policy(Bucket=bucket)["Policy"])==policy and
              all(s3.get_public_access_block(Bucket=bucket)["PublicAccessBlockConfiguration"].values()) and
              cf.get_origin_access_control(Id=oac)["OriginAccessControl"]["OriginAccessControlConfig"]["SigningBehavior"]=="always",
              "S3 public block, distribution ke ARN wali policy aur signing OAC mile.")
        saved = cf.get_distribution_config(Id=did)["DistributionConfig"]
        item = saved["CacheBehaviors"]["Items"][0]
        check(saved["WebACLId"]==acl["ARN"] and item["PathPattern"]=="/images/*" and item["TargetOriginId"]=="images"
              and saved["DefaultCacheBehavior"]["TargetOriginId"]=="private-api", "Distribution par image path, default API origin aur WAF ARN mile.")
        got = [item.get("CachePolicyId"),saved["DefaultCacheBehavior"].get("CachePolicyId"),saved["DefaultCacheBehavior"].get("OriginRequestPolicyId"),
               next(o for o in saved["Origins"]["Items"] if o["Id"]=="images").get("OriginAccessControlId")]
        expected=[optimized,disabled,forward,oac]
        for value,want in zip(got,expected):
            assert value in (None,"",want), (value,want)
        say("READBACK image policy / API policy / forward policy / attached OAC: " +
            " / ".join("mila" if x==y else "missing" for x,y in zip(got,expected)))
        if got!=expected:
            say("GAP Moto ne saari CloudFront settings readback mein nahi di.")
        def target(url):
            return item["TargetOriginId"] if fnmatchcase(url,item["PathPattern"]) else saved["DefaultCacheBehavior"]["TargetOriginId"]
        check([target(p) for p in [path,"/api","/api/me"]]==["images","private-api","private-api"] and
              s3.get_object(Bucket=bucket,Key=path[1:])["Body"].read()==b"pix-p7-v1",
              "HOST CHECK Python ne teen paths milaye. S3 API se p7 ka test object padha.")
        try:
            answer=ga.list_accelerators()
        except ClientError as exc:
            code=exc.response["Error"]["Code"]
            if code not in ("404","500","501","NotImplemented","InternalError","InvalidAction"):
                raise
            say("GAP ListAccelerators ka local response "+code+". Global Accelerator ki routing test nahi hui.")
        else:
            if "Accelerators" not in answer:
                say("GAP ListAccelerators response mein Accelerators field nahi mili.")
            else:
                accel=ga.create_accelerator(Name="pix-edge",Enabled=False,IdempotencyToken="pix-edge-38-test")["Accelerator"]
                clean.callback(ga.delete_accelerator,AcceleratorArn=accel["AcceleratorArn"])
                check(ga.describe_accelerator(AcceleratorArn=accel["AcceleratorArn"])["Accelerator"]["Name"]=="pix-edge","GA metadata mila.")
    remaining={"distributions":cf.list_distributions()["DistributionList"]["Quantity"],
               "oacs":cf.list_origin_access_controls()["OriginAccessControlList"]["Quantity"],
               "acls":len(waf.list_web_acls(Scope="CLOUDFRONT")["WebACLs"]),
               "loadBalancers":len(elb.describe_load_balancers()["LoadBalancers"]),
               "buckets":len(s3.list_buckets()["Buckets"]), "labVpcs":len(ec2.describe_vpcs(Filters=[{"Name":"cidr","Values":["10.38.0.0/16"]}])["Vpcs"])}
    check(not any(remaining.values()), "CLEANUP READBACK "+json.dumps(remaining))
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
