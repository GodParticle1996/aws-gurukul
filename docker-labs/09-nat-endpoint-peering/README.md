# 09 — Outbound path, S3 shortcut aur analytics VPC

**Problem:** ShopKaro private app ko payment verification/package downloads chahiye. S3 images NAT processing bill badha rahi hain. Analytics VPC ko orders subnet tak private path chahiye.
**Goal:** two zonal NATs + same-AZ app routes, S3 gateway endpoint, Secrets Manager interface endpoint, active peering + both routes aur flow-log subscription metadata inspect karo; own resources cleanup karo.

Moto **5.2.4**, existing AWS CLI venv, **2026-10-25** actual capture. Random resource IDs change honge. Region ap-south-1; cost examples lesson mein separate approx US East estimates hain. No real AWS resources or OS/app/SQL traffic.

## Setup — ek terminal, repo root aws-gurukul se

```bash
cd docker-labs
./start-moto.sh
source env.sh
cd 09-nat-endpoint-peering
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
```

Scripts require loopback Moto and dummy test keys. Credentials/config lab-local hain; `~/.aws` ya role profile use nahi hota. Shared emulator ko reset mat karo. Existing `.lab/resources.sh` mile toh previous lab ka cleanup pehle karo.

## ex1 — Starting network banao, route gap dekho

```bash
bash setup.sh
source .lab/resources.sh
aws ec2 describe-route-tables --route-table-ids "$APP_RT_A" --query 'RouteTables[0].Routes'
```

**Asli output** ka initial route shape:

```json
[{"DestinationCidrBlock":"10.9.0.0/16","GatewayId":"local","Origin":"CreateRouteTable","State":"active"}]
```

Setup two VPCs, six subnets, public IGW routes and explicit app/data/analytics route associations banata hai. App route local-only hai; subnet ka private label outbound path create nahi karta.

## ex2 — Commands read karo, phir connected paths build karo

`exercises.sh` kholo: real CLI commands NAT/EIP → default routes → gateway endpoint → interface endpoint → peer/accept/routes → flow-log subscription order mein hain. Script save trap resource IDs record karta hai, taaki partial failure ke baad cleanup possible ho.

```bash
bash exercises.sh
source .lab/resources.sh
```

**Asli output excerpts**, command order mein:

```json
[
  {"State":"available","Subnet":"subnet-5c3611f481742ed60","EIP":"eipalloc-7a060f72ba4aa5388"},
  {"State":"available","Subnet":"subnet-06274f4981144b181","EIP":"eipalloc-e816ea561118e8030"}
]
```

```json
{"Type":"Gateway","State":"available","RouteTables":["rtb-cda73ea1d2622eef8","rtb-74aabd0f7d97b9fb9"]}
```

```json
{"Type":"Interface","State":"available","PrivateDNS":true,"ENIs":2}
```

```text
"pending-acceptance"
"active"
```

👉 NAT waiter success par no output. Public NAT ka placement + IGW route inspect karo; `available` metadata alone internet reachability prove nahi karta. Interface ENI SG inbound443 only app CIDRs allow karta hai. Private DNS flags VPC DNS support/hostnames par depend karte hain.

## ex3 — S3 endpoint ka actual route aur association repair

```bash
aws ec2 describe-route-tables --route-table-ids "$APP_RT_A" --query 'RouteTables[0].Routes'
aws ec2 describe-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.ap-south-1.s3 --query 'PrefixLists[].{Name:PrefixListName,Id:PrefixListId,Cidrs:Cidrs}'
aws ec2 modify-vpc-endpoint --vpc-endpoint-id "$ENDPOINT" --remove-route-table-ids "$APP_RT_B"
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids "$ENDPOINT" --query 'length(VpcEndpoints[0].RouteTableIds)'
aws ec2 modify-vpc-endpoint --vpc-endpoint-id "$ENDPOINT" --add-route-table-ids "$APP_RT_B"
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids "$ENDPOINT" --query 'length(VpcEndpoints[0].RouteTableIds)'
```

**Asli output excerpts:** NAT default route ke saath endpoint-managed prefix-list route automatically add hua:

```json
{"DestinationPrefixListId":"pl-8870eb04a720f66d2","GatewayId":"vpce-f5a817d704e55632e","Origin":"CreateRoute","State":"active"}
```

```json
[{"Name":"com.amazonaws.ap-south-1.s3","Id":"pl-8870eb04a720f66d2","Cidrs":null}]
```

Association counts:

```text
1
2
```

👉 Matching same-region S3 destination ke liye service prefix route `0.0.0.0/0` se more specific hai. AWS endpoint association route manage karti hai; S3 gateway route ko fake `create-route --vpc-endpoint-id` command se manually install mat karo. Current Moto prefix-list CIDRs null dikhata hai; output live AWS IP inventory nahi.

## ex4 — Peering aur logging ke evidence ki limit samjho

```bash
aws ec2 describe-vpc-peering-connections --vpc-peering-connection-ids "$PCX" --query 'VpcPeeringConnections[0].Status.Code'
aws ec2 describe-route-tables --route-table-ids "$ORDERS_RT" "$ANALYTICS_RT" --query 'RouteTables[].Routes'
aws ec2 describe-flow-logs --flow-log-ids "$FLOW" --query 'FlowLogs[0].{State:FlowLogStatus,Traffic:TrafficType,Destination:LogDestinationType}'
```

**Asli output**: peer active; orders table has `10.10.0.0/16 → pcx-…`; analytics table has `10.9.0.0/16 → same pcx-…`.

```json
{"State":"ACTIVE","Traffic":"ALL","Destination":"s3"}
```

👉 Active peer ke baad two-sided routes plus SG/NACL/application permissions chahiye. Flow-log configuration ACTIVE actual delivered packets/log objects prove nahi karta. Lab no EC2 OS run karta hai; `curl`, DB read or S3 throughput verified nahi.

## ex5 — Scoped cleanup

```bash
bash cleanup.sh
```

**Asli cleanup output:** final live VPCs, live endpoints and allocated EIPs:

```text
[]
[]
[]
```

Moto deleted endpoints ko `State=deleted` tombstones ke roop mein retain karta hai; final endpoint query deleted metadata exclude karti hai.

Cleanup IDs `.lab/resources.sh` se aate hain: flow subscription, both endpoints, peering routes/connection, NATs + waiters, EIPs, endpoint SG, explicit route associations/tables, subnets, IGW, two VPCs, empty log bucket. Cleanup deletes only lab-owned IDs; no shared reset.

## Emulator limits

- API metadata only: no packet translation, internet downloads, DNS requests, SQL, Flow Log delivery, measured AZ recovery or NAT throughput.
- Gateway endpoint creates the managed prefix-list route; route association remove/add works. Prefix-list CIDRs in Moto were null, so use current AWS managed-prefix APIs for a real IP inventory.
- Interface endpoint has two ENIs and PrivateDNS=true metadata; working SDK calls require actual DNS/network/IAM/service permissions, separately tested on AWS.
- Endpoint policy is an extra permission boundary, not an IAM grant; default full endpoint policy does not make private S3 public. Real least-privilege policy + application role/bucket policy remain required.
- Zonal public NAT is exercised. Regional NAT, NAT64/DNS64, IPv6 egress-only gateway, TGW and Reachability Analyzer are lesson decisions, not runtime-tested lab services.
- AWS is billable: NAT hours/GB, public IPv4, interface endpoints, traffic and log storage. Deleting NAT does not release the Elastic IP; cleanup explicitly releases both EIPs.
