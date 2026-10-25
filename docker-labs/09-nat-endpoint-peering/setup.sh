#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] || { echo 'source ../env.sh: loopback Moto required'; exit 1; }
[ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Dummy test credentials required'; exit 1; }
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
[ ! -f .lab/resources.sh ] || { echo 'Run cleanup.sh on the previous lab state first'; exit 1; }
umask 077
save_ids() {
  for key in VPC ANALYTICS PUBLIC_A PUBLIC_B APP_A APP_B ORDERS ANALYTICS_SUB IGW PUB_RT_A PUB_RT_B APP_RT_A APP_RT_B ORDERS_RT ANALYTICS_RT EIP_A EIP_B NAT_A NAT_B ENDPOINT INTERFACE ENDPOINT_SG PCX FLOW LOG_BUCKET; do
    printf 'export %s=%q\n' "$key" "${!key:-}"
  done > .lab/resources.sh
}
trap save_ids EXIT
VPC=$(aws ec2 create-vpc --cidr-block 10.9.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=shopkaro-lab09}]' --query Vpc.VpcId --output text)
ANALYTICS=$(aws ec2 create-vpc --cidr-block 10.10.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=shopkaro-lab09-analytics}]' --query Vpc.VpcId --output text)
aws ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-support
aws ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-hostnames
PUBLIC_A=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.9.1.0/24 --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
PUBLIC_B=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.9.2.0/24 --availability-zone ap-south-1b --query Subnet.SubnetId --output text)
APP_A=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.9.11.0/24 --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
APP_B=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.9.12.0/24 --availability-zone ap-south-1b --query Subnet.SubnetId --output text)
ORDERS=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.9.21.0/24 --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
ANALYTICS_SUB=$(aws ec2 create-subnet --vpc-id "$ANALYTICS" --cidr-block 10.10.1.0/24 --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
IGW=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
PUB_RT_A=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
PUB_RT_B=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
APP_RT_A=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
APP_RT_B=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
ORDERS_RT=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
ANALYTICS_RT=$(aws ec2 create-route-table --vpc-id "$ANALYTICS" --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id "$PUB_RT_A" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW"
aws ec2 create-route --route-table-id "$PUB_RT_B" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW"
for pair in "$PUBLIC_A:$PUB_RT_A" "$PUBLIC_B:$PUB_RT_B" "$APP_A:$APP_RT_A" "$APP_B:$APP_RT_B" "$ORDERS:$ORDERS_RT" "$ANALYTICS_SUB:$ANALYTICS_RT"; do
  aws ec2 associate-route-table --subnet-id "${pair%%:*}" --route-table-id "${pair#*:}"
done
echo 'Starting state: private app tables local-only; no NAT, endpoint or peer.'
