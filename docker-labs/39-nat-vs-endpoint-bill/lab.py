"""PixShare NAT and S3 route comparison on an owned loopback server."""
from contextlib import ExitStack
from decimal import Decimal
from ipaddress import ip_address, ip_network
import json
import logging
import os
from pathlib import Path
import socket
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EVIDENCE = ROOT / ".overhaul-evidence/lab39-runs"
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


def bill(s3_via_nat, other_gb, hours=720):
    # Dono zonal NAT aur do public IPv4 poore mahine lage rehte hain.
    processing = Decimal(s3_via_nat + other_gb) * Decimal("0.045")
    fixed = 2 * hours * (Decimal("0.045") + Decimal("0.005"))
    return processing, fixed, processing + fixed


def main(endpoint):
    ec2 = boto3.client("ec2", endpoint_url=endpoint)
    service = "com.amazonaws.us-east-1.s3"
    with ExitStack() as clean:
        vpc = ec2.create_vpc(CidrBlock="10.39.0.0/16")["Vpc"]["VpcId"]
        clean.callback(ec2.delete_vpc, VpcId=vpc)
        igw = ec2.create_internet_gateway()["InternetGateway"]["InternetGatewayId"]
        clean.callback(ec2.delete_internet_gateway, InternetGatewayId=igw)
        ec2.attach_internet_gateway(VpcId=vpc, InternetGatewayId=igw)
        clean.callback(ec2.detach_internet_gateway, InternetGatewayId=igw, VpcId=vpc)

        def subnet(az, octet):
            sid = ec2.create_subnet(VpcId=vpc, CidrBlock=f"10.39.{octet}.0/24", AvailabilityZone="us-east-1"+az)["Subnet"]["SubnetId"]
            clean.callback(ec2.delete_subnet, SubnetId=sid)
            return sid

        def table(sid, **target):
            rt = ec2.create_route_table(VpcId=vpc)["RouteTable"]["RouteTableId"]
            clean.callback(ec2.delete_route_table, RouteTableId=rt)
            assoc = ec2.associate_route_table(RouteTableId=rt, SubnetId=sid)["AssociationId"]
            clean.callback(ec2.disassociate_route_table, AssociationId=assoc)
            ec2.create_route(RouteTableId=rt, DestinationCidrBlock="0.0.0.0/0", **target)
            return rt

        def read(rt):
            return ec2.describe_route_tables(RouteTableIds=[rt])["RouteTables"][0]

        nats, private, subnets = [], [], []
        for i, zone in enumerate(["a","b"]):
            pub = subnet(zone, i+1)
            public_rt = table(pub, GatewayId=igw)
            assert any(r.get("GatewayId")==igw for r in read(public_rt)["Routes"])
            alloc = ec2.allocate_address(Domain="vpc")["AllocationId"]
            clean.callback(ec2.release_address, AllocationId=alloc)
            nat = ec2.create_nat_gateway(SubnetId=pub, AllocationId=alloc)["NatGateway"]["NatGatewayId"]
            nats.append(nat)
            def delete_nat(nat_id):
                ec2.delete_nat_gateway(NatGatewayId=nat_id)
                ec2.get_waiter("nat_gateway_deleted").wait(NatGatewayIds=[nat_id], WaiterConfig={"Delay":1,"MaxAttempts":10})
            clean.callback(delete_nat, nat)
            ec2.get_waiter("nat_gateway_available").wait(NatGatewayIds=[nat], WaiterConfig={"Delay":1,"MaxAttempts":10})
            subnets.append(subnet(zone,i+11))
            private.append(table(subnets[-1], NatGatewayId=nat))
        names = ec2.describe_prefix_lists(Filters=[{"Name":"prefix-list-name","Values":[service]}])["PrefixLists"]
        assert len(names)==1 and names[0]["PrefixListName"]==service
        prefix = names[0]["PrefixListId"]
        cidrs = names[0].get("Cidrs") or [e["Cidr"] for e in ec2.get_managed_prefix_list_entries(PrefixListId=prefix)["Entries"]]
        if cidrs:
            say("READBACK S3 prefix list ke CIDRs: "+", ".join(cidrs)+".")
        else:
            say("GAP S3 prefix list ka ID mila. Moto ne IPv4 CIDRs nahi diye. Host check mein 192.0.2.0/24 test range li.")
            cidrs = ["192.0.2.0/24"]
        networks = [ip_network(c) for c in cidrs if ip_network(c).version==4]
        assert networks
        s3_ip = networks[0].network_address
        other = ip_address("198.51.100.9")
        assert all(other not in net for net in networks)

        def check_paths(expected_s3, label):
            metered_s3 = metered_other = 0
            for i, rt in enumerate(private):
                state = read(rt)
                assert any(a.get("SubnetId")==subnets[i] for a in state["Associations"])
                choices = []
                for row in state["Routes"]:
                    if row.get("State")!="active":
                        continue
                    if row.get("DestinationPrefixListId")==prefix:
                        choices.extend((net,row["GatewayId"]) for net in networks)
                    elif "DestinationCidrBlock" in row:
                        choices.append((ip_network(row["DestinationCidrBlock"]),row.get("NatGatewayId") or row["GatewayId"]))
                def target(ip):
                    return max((net.prefixlen,dest) for net,dest in choices if ip in net)[1]
                s3_target, other_target = target(s3_ip), target(other)
                assert s3_target==expected_s3[i] and other_target==nats[i]
                # Traffic dono AZ mein barabar maana hai. Sirf NAT lene wale bytes charge karo.
                if s3_target in nats:
                    metered_s3 += 99000
                if other_target in nats:
                    metered_other += 1000
            say("HOST CHECK "+label+" Dono private tables ka default apne NAT par raha.")
            return bill(metered_s3, metered_other)

        before=check_paths(nats, "Pehle S3 bhi dono NAT par gaya.")
        def endpoint_for(tables):
            return ec2.create_vpc_endpoint(VpcId=vpc,VpcEndpointType="Gateway",ServiceName=service,
                                           RouteTableIds=tables)["VpcEndpoint"]["VpcEndpointId"]
        with ExitStack() as first:
            first_id=endpoint_for([private[0]])
            first.callback(ec2.delete_vpc_endpoints,VpcEndpointIds=[first_id])
            partial=check_paths([first_id,nats[1]], "Sirf A jodne par A ka S3 endpoint par aur B ka S3 NAT par gaya.")
            check(partial[2]==Decimal(4617),"HOST CHECK Sirf A par S3 route badalne se model ka monthly subtotal $4,617 hai.")
            ec2.modify_vpc_endpoint(VpcEndpointId=first_id,AddRouteTableIds=[private[1]])
            saved=ec2.describe_vpc_endpoints(VpcEndpointIds=[first_id])["VpcEndpoints"][0]
            assert set(saved["RouteTableIds"])==set(private)
            if not any(r.get("GatewayId")==first_id for r in read(private[1])["Routes"]):
                say("GAP ModifyVpcEndpoint mein B ki association save hui. B ki route table mein S3 prefix route nahi aaya.")
            else:
                check_paths([first_id,first_id], "Modify ke baad bhi dono S3 routes mile.")
            ec2.modify_vpc_endpoint(VpcEndpointId=first_id,RemoveRouteTableIds=[private[1]])
        with ExitStack() as both:
            vpce=endpoint_for(private)
            both.callback(ec2.delete_vpc_endpoints,VpcEndpointIds=[vpce])
            saved=ec2.describe_vpc_endpoints(VpcEndpointIds=[vpce])["VpcEndpoints"][0]
            check(saved["ServiceName"]==service and set(saved["RouteTableIds"])==set(private),
                  "Naye S3 endpoint par shuru se dono private tables jodi gayin.")
            after=check_paths([vpce,vpce], "Ab dono tables mein S3 prefix ne default se pehle endpoint chuna.")
            check(before==(Decimal(9000),Decimal(72),Decimal(9072)) and after==(Decimal(90),Decimal(72),Decimal(162)),
                  "HOST CHECK 198,000 GB S3 aur 2,000 GB baaki par monthly NAT + IPv4 model $9,072 se $162 hua. Bachat $8,910.")
        assert check_paths(nats, "Endpoint hataane par S3 phir NAT par gaya.")==before
    end_states=[e["State"] for e in ec2.describe_vpc_endpoints(Filters=[{"Name":"vpc-id","Values":[vpc]}])["VpcEndpoints"]]
    say("READBACK Endpoint delete ke baad states: "+str(end_states))
    counts={"vpcs":len(ec2.describe_vpcs(Filters=[{"Name":"cidr","Values":["10.39.0.0/16"]}])["Vpcs"]),
            "tables":len(ec2.describe_route_tables(Filters=[{"Name":"vpc-id","Values":[vpc]}])["RouteTables"]),
            "subnets":len(ec2.describe_subnets(Filters=[{"Name":"vpc-id","Values":[vpc]}])["Subnets"]),
            "labIgw":sum(g["InternetGatewayId"]==igw for g in ec2.describe_internet_gateways()["InternetGateways"]),
            "liveEndpoints":sum(state!="deleted" for state in end_states),
            "liveNats":sum(n["State"]!="deleted" for n in ec2.describe_nat_gateways()["NatGateways"]),
            "eips":len(ec2.describe_addresses()["Addresses"])}
    check(not any(counts.values()),"CLEANUP READBACK "+json.dumps(counts))
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
