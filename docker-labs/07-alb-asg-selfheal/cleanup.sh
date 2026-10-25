#!/usr/bin/env bash
# Sirf current lab ke recorded resources delete karo; shared Moto reset nahi.
set -euo pipefail
lab_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$lab_dir"
test "${AWS_ENDPOINT_URL:-}" = http://127.0.0.1:4566 || { echo 'Local Moto endpoint required: source ../env.sh'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$lab_dir/.lab/credentials" AWS_CONFIG_FILE="$lab_dir/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
test "$AWS_ENDPOINT_URL" = http://127.0.0.1:4566
test "$(aws ec2 describe-vpcs --vpc-ids "$VPC" --query 'Vpcs[0].Tags[?Key==`Name`].Value | [0]' --output text)" = shopkaro-lab07
aws autoscaling delete-auto-scaling-group --auto-scaling-group-name shopkaro-lab07 --force-delete
aws elbv2 delete-load-balancer --load-balancer-arn "$LB"
aws elbv2 wait load-balancers-deleted --load-balancer-arns "$LB"
aws elbv2 delete-target-group --target-group-arn "$TG"
aws ec2 delete-launch-template --launch-template-id "$LT"
for SUBNET in "$PUBLIC_A" "$PUBLIC_B"; do
  ASSOC=$(aws ec2 describe-route-tables --filters "Name=association.subnet-id,Values=$SUBNET" --query "RouteTables[].Associations[?SubnetId=='$SUBNET'].RouteTableAssociationId | [0][0]" --output text)
  aws ec2 disassociate-route-table --association-id "$ASSOC"
done
aws ec2 delete-route-table --route-table-id "$PUBLIC_RT"
for SUBNET in "$PUBLIC_A" "$PUBLIC_B" "$PRIVATE_A" "$PRIVATE_B"; do
  aws ec2 delete-subnet --subnet-id "$SUBNET"
done
aws ec2 delete-security-group --group-id "$APP_SG"
aws ec2 delete-security-group --group-id "$ALB_SG"
aws ec2 detach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
aws ec2 delete-internet-gateway --internet-gateway-id "$IGW"
aws ec2 delete-vpc --vpc-id "$VPC"
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab07 --query AutoScalingGroups
aws elbv2 describe-load-balancers --query 'LoadBalancers[?LoadBalancerName==`shopkaro-lab07`]'
aws ec2 describe-vpcs --filters "Name=vpc-id,Values=$VPC" --query Vpcs
mv .lab/resources.sh .lab/last-cleaned-resources.sh
