#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test credentials required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
if [ -n "${ZONE:-}" ]; then
  [ "$(aws route53 get-hosted-zone --id "$ZONE" --query HostedZone.Name --output text)" = shopkaro-lab10.test. ] || { echo 'Unexpected hosted zone; stopping'; exit 1; }
  aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" --query ResourceRecordSets > .lab/current-records.json
  python3 - <<'PY'
import json,pathlib
records=json.loads(pathlib.Path('.lab/current-records.json').read_text())
changes=[dict(Action='DELETE',ResourceRecordSet=r) for r in records if r['Type'] not in ['NS','SOA']]
pathlib.Path('.lab/delete.json').write_text(json.dumps(dict(Changes=changes)))
print('Deleting lab non-default records:',len(changes))
PY
  if [ "$(python3 -c 'import json; print(len(json.load(open(".lab/delete.json"))["Changes"]))')" != 0 ]; then
    CHANGE=$(aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch file://.lab/delete.json --query ChangeInfo.Id --output text)
    aws route53 wait resource-record-sets-changed --id "$CHANGE"
  fi
fi
[ -z "${HEALTH:-}" ] || aws route53 delete-health-check --health-check-id "$HEALTH"
[ -z "${ZONE:-}" ] || aws route53 delete-hosted-zone --id "$ZONE"
[ -z "${ALB:-}" ] || aws elbv2 delete-load-balancer --load-balancer-arn "$ALB"
for subnet in "${SUB_A:-}" "${SUB_B:-}"; do [ -z "$subnet" ] || aws ec2 delete-subnet --subnet-id "$subnet"; done
[ -z "${VPC:-}" ] || aws ec2 delete-vpc --vpc-id "$VPC"
aws route53 list-hosted-zones --query "HostedZones[?Id=='$ZONE'].Id"
aws route53 list-health-checks --query "HealthChecks[?Id=='${HEALTH:-}'].Id"
aws elbv2 describe-load-balancers --query "LoadBalancers[?LoadBalancerArn=='${ALB:-}'].LoadBalancerArn"
aws ec2 describe-vpcs --query "Vpcs[?VpcId=='${VPC:-}'].VpcId"
mv .lab/resources.sh .lab/last-cleaned-resources.sh
