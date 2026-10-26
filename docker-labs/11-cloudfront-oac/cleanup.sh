#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test keys required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
if [ -n "${DIST:-}" ]; then
 aws cloudfront get-distribution-config --id "$DIST" > .lab/current.json
 python3 - <<'PY'
import json,pathlib
r=json.loads(pathlib.Path('.lab/current.json').read_text());c=r['DistributionConfig'];c['Enabled']=False
for o in c['Origins']['Items']:o['OriginAccessControlId']=''
pathlib.Path('.lab/disable.json').write_text(json.dumps(c))
PY
 ETAG=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
 aws cloudfront update-distribution --id "$DIST" --if-match "$ETAG" --distribution-config file://.lab/disable.json --query Distribution.DistributionConfig.Enabled
 aws cloudfront wait distribution-deployed --id "$DIST"
 ETAG=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
 aws cloudfront delete-distribution --id "$DIST" --if-match "$ETAG"
fi
if [ -n "${OAC:-}" ]; then
 ETAG=$(aws cloudfront get-origin-access-control --id "$OAC" --query ETag --output text)
 aws cloudfront delete-origin-access-control --id "$OAC" --if-match "$ETAG"
fi
if [ -n "${BUCKET:-}" ]; then
 aws s3api delete-object --bucket "$BUCKET" --key img/kurta-red.jpg
 aws s3api delete-bucket --bucket "$BUCKET"
fi
aws cloudfront list-distributions --query "length(DistributionList.Items[?Id=='${DIST:-}'] || \`[]\`)"
aws cloudfront list-origin-access-controls --query "length(OriginAccessControlList.Items[?Id=='${OAC:-}'] || \`[]\`)"
aws s3api list-buckets --query "length(Buckets[?Name=='${BUCKET:-}'])"
mv .lab/resources.sh .lab/last-cleaned-resources.sh
