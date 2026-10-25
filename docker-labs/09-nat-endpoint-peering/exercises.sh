#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] || { echo 'Loopback Moto required'; exit 1; }
[ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Dummy credentials required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
# Preserve newly allocated IDs if an exercise fails.
trap 'for key in EIP_A EIP_B NAT_A NAT_B ENDPOINT INTERFACE ENDPOINT_SG PCX FLOW LOG_BUCKET; do printf "export %s=%q\n" "$key" "${!key:-}"; done >> .lab/resources.sh' EXIT
set -x
EIP_A=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
EIP_B=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
NAT_A=$(aws ec2 create-nat-gateway --subnet-id "$PUBLIC_A" --allocation-id "$EIP_A" --query NatGateway.NatGatewayId --output text)
NAT_B=$(aws ec2 create-nat-gateway --subnet-id "$PUBLIC_B" --allocation-id "$EIP_B" --query NatGateway.NatGatewayId --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_A" "$NAT_B"
aws ec2 create-route --route-table-id "$APP_RT_A" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_A"
aws ec2 create-route --route-table-id "$APP_RT_B" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_B"
aws ec2 describe-nat-gateways --nat-gateway-ids "$NAT_A" "$NAT_B" --query 'NatGateways[].{State:State,Subnet:SubnetId,EIP:NatGatewayAddresses[0].AllocationId}'
ENDPOINT=$(aws ec2 create-vpc-endpoint --vpc-id "$VPC" --vpc-endpoint-type Gateway --service-name com.amazonaws.ap-south-1.s3 --route-table-ids "$APP_RT_A" "$APP_RT_B" --query VpcEndpoint.VpcEndpointId --output text)
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids "$ENDPOINT" --query 'VpcEndpoints[0].{Type:VpcEndpointType,State:State,RouteTables:RouteTableIds}'
aws ec2 describe-route-tables --route-table-ids "$APP_RT_A" --query 'RouteTables[0].Routes'
aws ec2 describe-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.ap-south-1.s3 --query 'PrefixLists[].{Name:PrefixListName,Id:PrefixListId,Cidrs:Cidrs}'
ENDPOINT_SG=$(aws ec2 create-security-group --group-name shopkaro-lab09-endpoint --description 'HTTPS from private app CIDRs' --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$ENDPOINT_SG" --protocol tcp --port 443 --cidr 10.9.11.0/24
aws ec2 authorize-security-group-ingress --group-id "$ENDPOINT_SG" --protocol tcp --port 443 --cidr 10.9.12.0/24
INTERFACE=$(aws ec2 create-vpc-endpoint --vpc-id "$VPC" --vpc-endpoint-type Interface --service-name com.amazonaws.ap-south-1.secretsmanager --subnet-ids "$APP_A" "$APP_B" --security-group-ids "$ENDPOINT_SG" --private-dns-enabled --query VpcEndpoint.VpcEndpointId --output text)
aws ec2 describe-vpc-endpoints --vpc-endpoint-ids "$INTERFACE" --query 'VpcEndpoints[0].{Type:VpcEndpointType,State:State,PrivateDNS:PrivateDnsEnabled,ENIs:length(NetworkInterfaceIds)}'
PCX=$(aws ec2 create-vpc-peering-connection --vpc-id "$VPC" --peer-vpc-id "$ANALYTICS" --query VpcPeeringConnection.VpcPeeringConnectionId --output text)
aws ec2 describe-vpc-peering-connections --vpc-peering-connection-ids "$PCX" --query 'VpcPeeringConnections[0].Status.Code'
aws ec2 accept-vpc-peering-connection --vpc-peering-connection-id "$PCX" --query VpcPeeringConnection.Status.Code
aws ec2 create-route --route-table-id "$ORDERS_RT" --destination-cidr-block 10.10.0.0/16 --vpc-peering-connection-id "$PCX"
aws ec2 create-route --route-table-id "$ANALYTICS_RT" --destination-cidr-block 10.9.0.0/16 --vpc-peering-connection-id "$PCX"
aws ec2 describe-route-tables --route-table-ids "$ORDERS_RT" "$ANALYTICS_RT" --query 'RouteTables[].Routes'
LOG_BUCKET=shopkaro-lab09-flowlogs-123456789012
aws s3api create-bucket --bucket "$LOG_BUCKET" --create-bucket-configuration LocationConstraint=ap-south-1
FLOW=$(aws ec2 create-flow-logs --resource-type VPC --resource-ids "$VPC" --traffic-type ALL --log-destination-type s3 --log-destination "arn:aws:s3:::$LOG_BUCKET" --query 'FlowLogIds[0]' --output text)
aws ec2 describe-flow-logs --flow-log-ids "$FLOW" --query 'FlowLogs[0].{State:FlowLogStatus,Traffic:TrafficType,Destination:LogDestinationType}'
