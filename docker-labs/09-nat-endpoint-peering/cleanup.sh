#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] || { echo 'Loopback Moto required'; exit 1; }
[ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Dummy credentials required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
[ -z "${FLOW:-}" ] || aws ec2 delete-flow-logs --flow-log-ids "$FLOW"
for endpoint in "${ENDPOINT:-}" "${INTERFACE:-}"; do
  [ -z "$endpoint" ] || aws ec2 delete-vpc-endpoints --vpc-endpoint-ids "$endpoint"
done
for pair in "$APP_RT_A:0.0.0.0/0" "$APP_RT_B:0.0.0.0/0" "$ORDERS_RT:10.10.0.0/16" "$ANALYTICS_RT:10.9.0.0/16"; do
  present=$(aws ec2 describe-route-tables --route-table-ids "${pair%%:*}" --query "length(RouteTables[0].Routes[?DestinationCidrBlock=='${pair#*:}'])" --output text)
  [ "$present" = 0 ] || aws ec2 delete-route --route-table-id "${pair%%:*}" --destination-cidr-block "${pair#*:}"
done
[ -z "${PCX:-}" ] || aws ec2 delete-vpc-peering-connection --vpc-peering-connection-id "$PCX"
for nat in "${NAT_A:-}" "${NAT_B:-}"; do
  if [ -n "$nat" ]; then aws ec2 delete-nat-gateway --nat-gateway-id "$nat"; aws ec2 wait nat-gateway-deleted --nat-gateway-ids "$nat"; fi
done
for allocation in "${EIP_A:-}" "${EIP_B:-}"; do [ -z "$allocation" ] || aws ec2 release-address --allocation-id "$allocation"; done
[ -z "${ENDPOINT_SG:-}" ] || aws ec2 delete-security-group --group-id "$ENDPOINT_SG"
for rt in "$PUB_RT_A" "$PUB_RT_B" "$APP_RT_A" "$APP_RT_B" "$ORDERS_RT" "$ANALYTICS_RT"; do
  for association in $(aws ec2 describe-route-tables --route-table-ids "$rt" --query 'RouteTables[0].Associations[?Main==`false`].RouteTableAssociationId' --output text); do
    aws ec2 disassociate-route-table --association-id "$association"
  done
  aws ec2 delete-route-table --route-table-id "$rt"
done
for subnet in "$PUBLIC_A" "$PUBLIC_B" "$APP_A" "$APP_B" "$ORDERS" "$ANALYTICS_SUB"; do aws ec2 delete-subnet --subnet-id "$subnet"; done
aws ec2 detach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
aws ec2 delete-internet-gateway --internet-gateway-id "$IGW"
aws ec2 delete-vpc --vpc-id "$VPC"
aws ec2 delete-vpc --vpc-id "$ANALYTICS"
[ -z "${LOG_BUCKET:-}" ] || aws s3api delete-bucket --bucket "$LOG_BUCKET"
aws ec2 describe-vpcs --filters Name=tag:Name,Values=shopkaro-lab09,shopkaro-lab09-analytics --query 'Vpcs[].VpcId'
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC" --query 'VpcEndpoints[?State!=`deleted`].VpcEndpointId'
aws ec2 describe-addresses --filters "Name=allocation-id,Values=$EIP_A,$EIP_B" --query 'Addresses[].AllocationId'
mv .lab/resources.sh .lab/last-cleaned-resources.sh
