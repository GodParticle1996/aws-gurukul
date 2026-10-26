#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test credentials required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
python3 make-records.py
if [ -z "${HEALTH:-}" ]; then
  HEALTH=$(aws route53 create-health-check --caller-reference "lab10-primary-$(date +%s%N)" --health-check-config file://.lab/primary-health.json --query HealthCheck.Id --output text)
  printf 'export HEALTH=%q\n' "$HEALTH" >> .lab/resources.sh
fi
export HEALTH
python3 make-records.py
CHANGE=$(aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" --change-batch file://.lab/routing.json --query ChangeInfo.Id --output text)
printf 'export CHANGE=%q\n' "$CHANGE" >> .lab/resources.sh
aws route53 wait resource-record-sets-changed --id "$CHANGE"
aws route53 get-change --id "$CHANGE" --query ChangeInfo.Status
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" --query 'ResourceRecordSets[?SetIdentifier!=`null`].{Id:SetIdentifier,Weight:Weight,Failover:Failover,TTL:TTL,Check:HealthCheckId}'
aws route53 get-health-check --health-check-id "$HEALTH" --query HealthCheck.HealthCheckConfig
aws route53 get-health-check-status --health-check-id "$HEALTH"
