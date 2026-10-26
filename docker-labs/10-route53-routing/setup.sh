#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test credentials required'; exit 1; }
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
[ ! -f .lab/resources.sh ] || { echo 'Run cleanup.sh for previous lab resources first'; exit 1; }
VPC= SUB_A= SUB_B= ALB= ALB_DNS= ALB_ZONE= ZONE= HEALTH= CHANGE=
umask 077
save_ids() { for key in VPC SUB_A SUB_B ALB ALB_DNS ALB_ZONE ZONE HEALTH CHANGE; do printf 'export %s=%q\n' "$key" "${!key:-}"; done > .lab/resources.sh; }
trap save_ids EXIT
VPC=$(aws ec2 create-vpc --cidr-block 10.110.0.0/16 --query Vpc.VpcId --output text)
SUB_A=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.110.1.0/24 --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
SUB_B=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.110.2.0/24 --availability-zone ap-south-1b --query Subnet.SubnetId --output text)
ALB=$(aws elbv2 create-load-balancer --name shop-lab10-routing --subnets "$SUB_A" "$SUB_B" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB" --query 'LoadBalancers[0].DNSName' --output text)
ALB_ZONE=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB" --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)
ZONE=$(aws route53 create-hosted-zone --name shopkaro-lab10.test --caller-reference "lab10-$(date +%s%N)" --query HostedZone.Id --output text)
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" --query 'ResourceRecordSets[].Type'
echo "ALB canonical zone: $ALB_ZONE (read returned metadata; do not hard-code Moto IDs on AWS)"
