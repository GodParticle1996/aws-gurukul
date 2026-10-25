#!/usr/bin/env bash
# Sirf local Moto: four-subnet VPC, ALB aur two-instance ASG banao.
set -euo pipefail
lab_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$lab_dir"
test "${AWS_ENDPOINT_URL:-}" = http://127.0.0.1:4566 || { echo 'Pehle source ../env.sh: local Moto endpoint required.'; exit 1; }
umask 077
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$lab_dir/.lab/credentials"
export AWS_CONFIG_FILE="$lab_dir/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
# Existing lab dobara banane se pehle cleanup karo.
if [ -f .lab/resources.sh ]; then echo 'Existing .lab/resources.sh mila; pehle bash cleanup.sh chalao.'; exit 1; fi
save_ids() {
  printf 'export VPC=%q PUBLIC_A=%q PUBLIC_B=%q PRIVATE_A=%q PRIVATE_B=%q IGW=%q PUBLIC_RT=%q ALB_SG=%q APP_SG=%q LT=%q LB=%q TG=%q\n' "${VPC:-}" "${PUBLIC_A:-}" "${PUBLIC_B:-}" "${PRIVATE_A:-}" "${PRIVATE_B:-}" "${IGW:-}" "${PUBLIC_RT:-}" "${ALB_SG:-}" "${APP_SG:-}" "${LT:-}" "${LB:-}" "${TG:-}" > .lab/resources.sh
}
trap save_ids EXIT
VPC=$(aws ec2 create-vpc --cidr-block 10.7.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=shopkaro-lab07}]' --query Vpc.VpcId --output text)
PUBLIC_A=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.7.1.0/24 --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
PUBLIC_B=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.7.2.0/24 --availability-zone ap-south-1b --query Subnet.SubnetId --output text)
PRIVATE_A=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.7.11.0/24 --availability-zone ap-south-1a --query Subnet.SubnetId --output text)
PRIVATE_B=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.7.12.0/24 --availability-zone ap-south-1b --query Subnet.SubnetId --output text)
IGW=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
PUBLIC_RT=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id "$PUBLIC_RT" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW"
aws ec2 associate-route-table --route-table-id "$PUBLIC_RT" --subnet-id "$PUBLIC_A"
aws ec2 associate-route-table --route-table-id "$PUBLIC_RT" --subnet-id "$PUBLIC_B"
ALB_SG=$(aws ec2 create-security-group --group-name lab07-alb --description 'HTTP lab metadata only' --vpc-id "$VPC" --query GroupId --output text)
APP_SG=$(aws ec2 create-security-group --group-name lab07-app --description 'App from ALB only' --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$APP_SG" --protocol tcp --port 8080 --source-group "$ALB_SG"
AMI=$(aws ec2 describe-images --query 'Images[0].ImageId' --output text)
echo "$AMI"
LT=$(aws ec2 create-launch-template --launch-template-name shopkaro-lab07 --launch-template-data "{\"ImageId\":\"$AMI\",\"InstanceType\":\"t3.micro\",\"SecurityGroupIds\":[\"$APP_SG\"]}" --query LaunchTemplate.LaunchTemplateId --output text)
LB=$(aws elbv2 create-load-balancer --name shopkaro-lab07 --type application --scheme internet-facing --subnets "$PUBLIC_A" "$PUBLIC_B" --security-groups "$ALB_SG" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
TG=$(aws elbv2 create-target-group --name shopkaro-lab07 --protocol HTTP --port 8080 --vpc-id "$VPC" --target-type instance --health-check-path /health --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 create-listener --load-balancer-arn "$LB" --protocol HTTP --port 80 --default-actions "Type=forward,TargetGroupArn=$TG" --query 'Listeners[0].{Protocol:Protocol,Port:Port}'
aws autoscaling create-auto-scaling-group --auto-scaling-group-name shopkaro-lab07 --launch-template "LaunchTemplateId=$LT,Version=1" --min-size 2 --max-size 4 --desired-capacity 2 --vpc-zone-identifier "$PRIVATE_A,$PRIVATE_B" --target-group-arns "$TG" --health-check-type EC2 --health-check-grace-period 120 --default-instance-warmup 120

echo "Setup ready. Agla command: source .lab/resources.sh"
