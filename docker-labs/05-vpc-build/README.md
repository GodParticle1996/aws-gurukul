# 05 — ShopKaro ka VPC: public web, private app

**Problem:** web server ko customers tak pahunchna hai. App/database ko direct internet par dikhana nahi hai.
Society ka gate lagana kaafi nahi: route table ko public block tak raasta dena padta hai.

**Goal:** `10.0.0.0/16`, do AZs, chaar `/24` subnets, attached IGW, do public associations.
Private subnets main route table ka sirf `local` route use karenge. NAT, EC2 aur public IPv4 create nahi honge.

Outputs **Moto 5.2.4 + awscli + Terraform 1.17.0 / AWS provider 6.70.0** par 2026-10-25 ko capture hue.
Resource IDs har run mein badlenge. CIDRs, counts aur rule meanings match hone chahiye.

## Setup — ek hi terminal mein commands chalao

Repo root `/home/vibekdutta/VixiApps/aws-gurukul` se:

```bash
cd docker-labs
./start-moto.sh
source env.sh
cd 05-vpc-build
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
aws sts get-caller-identity --query Account --output text
```

**Asli output:**

```text
123456789012
```

`AWS_ENDPOINT_URL=http://127.0.0.1:4566` aur dummy keys `env.sh` set karta hai. Lab role profiles use nahi karta.
Config paths lab-local hain; `~/.aws` ki zaroorat nahi. Shared emulator reset karne ki zaroorat nahi.

## ex1 — VPC aur chaar subnets banao

```bash
VPC=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=shopkaro-vpc-cli}]' \
  --query Vpc.VpcId --output text)
echo "$VPC"
WEB_A=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.0.1.0/24 \
  --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
WEB_B=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.0.2.0/24 \
  --availability-zone ap-south-1b --query Subnet.SubnetId --output text)
APP_A=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.0.11.0/24 \
  --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
APP_B=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.0.12.0/24 \
  --availability-zone ap-south-1b --query Subnet.SubnetId --output text)
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC" \
  --query 'sort_by(Subnets,&CidrBlock)[].[CidrBlock,AvailabilityZone,MapPublicIpOnLaunch,AvailableIpAddressCount]' \
  --output text
```

**Asli output:**

```text
vpc-8fcc96f4d7280b8a9
10.0.1.0/24     ap-south-1a    False    251
10.0.11.0/24    ap-south-1a    False    251
10.0.12.0/24    ap-south-1b    False    251
10.0.2.0/24     ap-south-1b    False    251
```

👉 `/24` mein 256 total, 251 usable IPs. Har subnet ek AZ mein hai. Abhi chaaron subnets main table inherit karte hain.
`public` naam dene se route nahi banta. `MapPublicIpOnLaunch=False` ko agle exercise mein bhi false rakho.

## ex2 — IGW, default route aur public associations

```bash
IGW=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
PUBLIC_RT=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id "$PUBLIC_RT" \
  --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW"
ASSOC_A=$(aws ec2 associate-route-table --route-table-id "$PUBLIC_RT" --subnet-id "$WEB_A" \
  --query AssociationId --output text)
ASSOC_B=$(aws ec2 associate-route-table --route-table-id "$PUBLIC_RT" --subnet-id "$WEB_B" \
  --query AssociationId --output text)
aws ec2 describe-route-tables --route-table-ids "$PUBLIC_RT" \
  --query 'RouteTables[0].Routes[].{Destination:DestinationCidrBlock,Target:GatewayId}'
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC" \
  "Name=route.gateway-id,Values=$IGW" --query 'RouteTables[].Associations[].SubnetId' --output text
aws ec2 describe-subnets --subnet-ids "$WEB_A" --query 'Subnets[0].MapPublicIpOnLaunch'
```

**Asli output** (`attach` aur variable assignments successful hone par output nahi dete):

```json
{
    "Return": true
}
[
    { "Destination": "10.0.0.0/16", "Target": "local" },
    { "Destination": "0.0.0.0/0", "Target": "igw-cf84201064440abf0" }
]
```

```text
subnet-606782919f054ee33    subnet-5ea7be98eddc8af48
false
```

👉 Dono web subnets public hain, auto public IP assignment abhi bhi false hai.
Internet se EC2 tak IPv4 connection ke liye instance ka public IPv4/EIP, listening service, SG aur NACL bhi chahiye.
`local` destination **VPC CIDR `10.0.0.0/16`** hai; web subnet ka `/24` nahi.

## ex3 — Main table aur default NACL inspect karo

```bash
MAIN_RT=$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC" \
  Name=association.main,Values=true --query 'RouteTables[0].RouteTableId' --output text)
aws ec2 describe-route-tables --route-table-ids "$MAIN_RT" \
  --query 'RouteTables[0].{Routes:Routes,Associations:Associations}'
aws ec2 describe-network-acls --filters "Name=vpc-id,Values=$VPC" \
  --query 'NetworkAcls[0].Entries[].[RuleNumber,Egress,Protocol,RuleAction,CidrBlock]' --output text
```

**Asli output** (JSON formatting compact ki gayi hai):

```json
{
  "Routes": [{
    "DestinationCidrBlock": "10.0.0.0/16", "GatewayId": "local",
    "Origin": "CreateRouteTable", "State": "active"
  }],
  "Associations": [{
    "Main": true, "RouteTableAssociationId": "rtbassoc-46c059bb18a0fa7e7",
    "RouteTableId": "rtb-477a9686ef4ed948c", "AssociationState": { "State": "associated" }
  }]
}
```

```text
100      True     -1    allow    0.0.0.0/0
32767    True     -1    deny     0.0.0.0/0
100      False    -1    allow    0.0.0.0/0
32767    False    -1    deny     0.0.0.0/0
```

👉 Main association par `Main=true` aur **koi SubnetId nahi**. App subnets implicit main association use karte hain.
Default NACL ka rule 100 sab IPv4 allow karta hai. NACL pehla matching rule use karta hai; `32767` fallback deny hai.
Naya **custom NACL** default allow-all nahi hota: rules add karne tak custom NACL traffic deny karta hai.

## ex4 — Association galat karo, count dekho, association repair karo

```bash
NEW_ASSOC=$(aws ec2 replace-route-table-association --association-id "$ASSOC_A" \
  --route-table-id "$MAIN_RT" --query NewAssociationId --output text)
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC" \
  "Name=route.gateway-id,Values=$IGW" --query 'length(RouteTables[].Associations[].SubnetId)'
aws ec2 replace-route-table-association --association-id "$NEW_ASSOC" --route-table-id "$PUBLIC_RT"
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC" \
  "Name=route.gateway-id,Values=$IGW" --query 'length(RouteTables[].Associations[].SubnetId)'
```

**Asli output:**

```text
1
```

```json
{
    "NewAssociationId": "rtbassoc-d875a1c4b60ae4066",
    "AssociationState": { "State": "associated" }
}
```

```text
2
```

👉 Pehle association swap ke baad web-a main/local-only table par chala gaya. Repair ke baad dono web subnets IGW table par hain.
Har replace par **naya association ID** milta hai. Purane association ID ko agli repair command mein mat reuse karo.
Configuration count packet delivery ka proof nahi hai.

## ex5 — Same layout Terraform se banao, verify karo, destroy karo

`main.tf` alag VPC banata hai; CLI wala VPC Terraform import nahi karta. Terraform 1.6+ executable PATH mein chahiye.
Setup wala terminal aur `AWS_ENDPOINT_URL` active rakho. Provider install ke liye pehli baar internet chahiye.

```bash
terraform init
terraform fmt -check
terraform validate
terraform apply
# Plan padho: 10 to add. Prompt par yes type karo.
TF_VPC=$(terraform output -raw vpc_id)
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$TF_VPC" --query 'length(Subnets)'
aws ec2 describe-route-tables --route-table-ids "$(terraform output -raw public_route_table_id)" \
  --query 'RouteTables[0].Routes[].{Destination:DestinationCidrBlock,Target:GatewayId}'
terraform plan
terraform destroy
# 10 resources delete karne ka plan padho. Prompt par yes type karo.
```

**Asli output ke relevant excerpts** (apply/destroy capture mein `-auto-approve` use hua):

```text
Success! The configuration is valid.
Plan: 10 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 10 added, 0 changed, 0 destroyed.
subnet_count = 4
4
```

```json
[
    { "Destination": "10.0.0.0/16", "Target": "local" },
    { "Destination": "0.0.0.0/0", "Target": "igw-88e8b3b4fb019db91" }
]
```

```text
No changes. Your infrastructure matches the configuration.
Destroy complete! Resources: 10 destroyed.
```

👉 `for_each` chaar subnets banata hai; public associations sirf do subnets par banti hain.
Terraform private subnets ka main table inheritance rakhta hai. Terraform state delete karna cleanup nahi hai: pehle `terraform destroy` chalao.

## CLI resources saaf karo — setup wala terminal zaroori hai

```bash
for SUBNET in "$WEB_A" "$WEB_B"; do
  ASSOC=$(aws ec2 describe-route-tables --filters "Name=association.subnet-id,Values=$SUBNET" \
    --query "RouteTables[].Associations[?SubnetId=='$SUBNET'].RouteTableAssociationId | [0][0]" --output text)
  aws ec2 disassociate-route-table --association-id "$ASSOC"
done
aws ec2 delete-route --route-table-id "$PUBLIC_RT" --destination-cidr-block 0.0.0.0/0
aws ec2 delete-route-table --route-table-id "$PUBLIC_RT"
for SUBNET in "$WEB_A" "$WEB_B" "$APP_A" "$APP_B"; do
  aws ec2 delete-subnet --subnet-id "$SUBNET"
done
aws ec2 detach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
aws ec2 delete-internet-gateway --internet-gateway-id "$IGW"
aws ec2 delete-vpc --vpc-id "$VPC"
```

## Emulator limits aur asli AWS ka decision

- Moto routes, associations, subnet metadata aur NACL entries store karta hai. Moto packet filtering, NAT, reachability ya an EC2 OS run nahi karta.
- Local-only routes ko inspect karna DB security ka complete test nahi hai. Real AWS par SGs, NACLs, routes, public addresses, listeners aur authentication alag verify karo.
- Lab **IPv4** par focused hai. IPv6 routes aur egress-only IGW alag design hain.
- Real AWS optional practice mein VPC/subnets/route tables/IGW ka separate hourly charge nahi, par EC2, public IPv4 aur NAT bill kar sakte hain. Lab NAT create nahi karta.
- S3/DynamoDB access ke liye free gateway endpoints evaluate karo. General internet egress ke liye NAT decision Intermediate `vpcdeep` mein milega.

Sources: [subnet sizing](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html),
[subnet route tables](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html),
[IGW routing](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html),
[NACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html),
[CLI association replacement](https://docs.aws.amazon.com/cli/latest/reference/ec2/replace-route-table-association.html).
