#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test keys required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
if [ -z "${OAC:-}" ]; then
 OAC=$(aws cloudfront create-origin-access-control --origin-access-control-config file://.lab/oac.json --query OriginAccessControl.Id --output text)
 printf 'export OAC=%q\n' "$OAC" >> .lab/resources.sh
fi
export OAC
python3 make-config.py
ETAG=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
aws cloudfront update-distribution --id "$DIST" --if-match "$ETAG" --distribution-config file://.lab/attach-oac.json --query '{ETag:ETag,Status:Distribution.Status,OAC:Distribution.DistributionConfig.Origins.Items[0].OriginAccessControlId}'
aws cloudfront wait distribution-deployed --id "$DIST"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file://.lab/policy.json
aws s3api get-public-access-block --bucket "$BUCKET"
aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text
INVALIDATION=$(aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/img/kurta-red.jpg' --query Invalidation.Id --output text)
printf 'export INVALIDATION=%q\n' "$INVALIDATION" >> .lab/resources.sh
aws cloudfront get-invalidation --distribution-id "$DIST" --id "$INVALIDATION" --query 'Invalidation.{Id:Id,Status:Status,Paths:InvalidationBatch.Paths.Items}'
echo 'Moto invalidation status is COMPLETED; do not run AWS invalidation-completed waiter against this Moto version.'
