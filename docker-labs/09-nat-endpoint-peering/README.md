# 09 — Outbound path, S3 shortcut aur analytics VPC

**Problem:** ShopKaro private app ko payment verification/package downloads chahiye. S3 images NAT processing bill badha rahi hain. Analytics VPC ko orders subnet tak private path chahiye.
**Goal:** do zonal NATs + same-AZ app routes, S3 gateway endpoint, Secrets Manager interface endpoint, active peering + dono routes aur flow-log subscription ka metadata dekho; apne resources ka cleanup karo.

Moto **5.2.4**, pehle se bana AWS CLI venv, **2026-10-25** ka asli capture. Random resource IDs badlenge. Region ap-south-1; kharche ke examples lesson mein alag, lagbhag US East ke andaaze hain. Koi asli AWS resources ya OS/app/SQL traffic nahi.

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

Scripts ko loopback Moto aur dummy test keys chahiye. Credentials/config lab ki apni hain; `~/.aws` ya role profile use nahi hota. Shared emulator ko reset mat karo. `.lab/resources.sh` pehle se mile toh pichhle lab ka cleanup pehle karo.

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

Setup do VPCs, chhe subnets, public IGW routes aur saaf app/data/analytics route associations banata hai. App route sirf local hai; subnet par private label lagane se bahar jaane ka raasta nahi banta.

## ex2 — Commands read karo, phir connected paths build karo

`exercises.sh` kholo: asli CLI commands is order mein hain: NAT/EIP → default routes → gateway endpoint → interface endpoint → peer/accept/routes → flow-log subscription. Script ka save trap resource IDs likhta hai, taaki beech mein fail hone ke baad bhi cleanup ho sake.

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

👉 NAT waiter safal ho toh koi output nahi aata. Public NAT ki jagah + IGW route dekho; sirf `available` metadata internet tak pahunch prove nahi karta. Interface ENI ka SG inbound 443 sirf app CIDRs ko allow karta hai. Private DNS flags VPC ke DNS support/hostnames par depend karte hain.

## ex3 — S3 endpoint ka asli route aur association repair

```bash
aws ec2 describe-route-tables --route-table-ids "$APP_RT_A" --query 'RouteTables[0].Routes'
aws ec2 describe-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.ap-south-1.s3 --query 'PrefixLists[].{Name:PrefixListName,Id:PrefixListId,Cidrs:Cidrs}'
aws ec2 modify-vpc-endpoint --vpc-endpoint-id "$ENDPOINT" --remove-route-table-ids "$APP_RT_B"
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids "$ENDPOINT" --query 'length(VpcEndpoints[0].RouteTableIds)'
aws ec2 modify-vpc-endpoint --vpc-endpoint-id "$ENDPOINT" --add-route-table-ids "$APP_RT_B"
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids "$ENDPOINT" --query 'length(VpcEndpoints[0].RouteTableIds)'
```

**Asli output ke hisse:** NAT default route ke saath endpoint ka managed prefix-list route apne aap jud gaya:

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

👉 Match karne wali same-region S3 destination ke liye service prefix route `0.0.0.0/0` se zyada specific hai. AWS endpoint association route sambhalti hai; S3 gateway route ko nakli `create-route --vpc-endpoint-id` command se haath se mat lagao. Aaj ka Moto prefix-list CIDRs null dikhata hai; output live AWS IPs ki list nahi.

## ex4 — Peering aur logging ke evidence ki limit samjho

```bash
aws ec2 describe-vpc-peering-connections --vpc-peering-connection-ids "$PCX" --query 'VpcPeeringConnections[0].Status.Code'
aws ec2 describe-route-tables --route-table-ids "$ORDERS_RT" "$ANALYTICS_RT" --query 'RouteTables[].Routes'
aws ec2 describe-flow-logs --flow-log-ids "$FLOW" --query 'FlowLogs[0].{State:FlowLogStatus,Traffic:TrafficType,Destination:LogDestinationType}'
```

**Asli output**: peer active; orders table mein `10.10.0.0/16 → pcx-…` hai; analytics table mein `10.9.0.0/16 → same pcx-…` hai.

```json
{"State":"ACTIVE","Traffic":"ALL","Destination":"s3"}
```

👉 Active peer ke baad dono taraf routes + SG/NACL/application permissions chahiye. Flow-log config ACTIVE hona asli pahunche packets/log objects prove nahi karta. Lab koi EC2 OS nahi chalati; `curl`, DB read ya S3 throughput check nahi hua.

## ex5 — Scoped cleanup

```bash
bash cleanup.sh
```

**Asli cleanup output:** aakhri live VPCs, live endpoints aur allocated EIPs:

```text
[]
[]
[]
```

Moto delete hue endpoints ko `State=deleted` nishaan (tombstones) ke roop mein rakhta hai; aakhri endpoint query delete hua metadata nahi dikhati.

Cleanup IDs `.lab/resources.sh` se aate hain: flow subscription, dono endpoints, peering routes/connection, NATs + waiters, EIPs, endpoint SG, saaf route associations/tables, subnets, IGW, do VPCs, khaali log bucket. Cleanup sirf lab ki apni IDs delete karta hai; shared reset nahi.

## Emulator limits

- Sirf API metadata: packet translation, internet downloads, DNS requests, SQL, Flow Log delivery, naapi AZ recovery ya NAT throughput nahi.
- Gateway endpoint managed prefix-list route banata hai; route association hatana/jodna chalta hai. Moto mein prefix-list CIDRs null the, isliye asli IPs ki list ke liye aaj ke AWS managed-prefix APIs use karo.
- Interface endpoint mein do ENIs aur PrivateDNS=true metadata hai; chalti SDK calls ke liye asli DNS/network/IAM/service permissions chahiye, jo AWS par alag se test hoti hain.
- Endpoint policy ek extra permission boundary hai, IAM grant nahi; default full endpoint policy private S3 ko public nahi banati. Asli least-privilege policy + application role/bucket policy phir bhi chahiye.
- Zonal public NAT chalaya gaya. Regional NAT, NAT64/DNS64, IPv6 egress-only gateway, TGW aur Reachability Analyzer lesson ke faisle hain, lab mein runtime test hui services nahi.
- AWS ka bill lagta hai: NAT ghante/GB, public IPv4, interface endpoints, traffic aur log storage. NAT delete karne se Elastic IP release nahi hota; cleanup dono EIPs saaf taur par release karta hai.
