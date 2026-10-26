#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test keys required'; exit 1; }
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
[ ! -f .lab/resources.sh ] || { echo 'Clean previous lab resources first'; exit 1; }
BUCKET= CALLER= DIST= DIST_ARN= OAC= INVALIDATION=
umask 077
save() { for key in BUCKET CALLER DIST DIST_ARN OAC INVALIDATION; do printf 'export %s=%q\n' "$key" "${!key:-}"; done > .lab/resources.sh; }
trap save EXIT
export CALLER="lab11-$(date +%s%N)" BUCKET="shopkaro-lab11-$(date +%s)"
aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint=ap-south-1
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
printf 'shopkaro red kurta v1\n' > .lab/image.txt
aws s3api put-object --bucket "$BUCKET" --key img/kurta-red.jpg --body .lab/image.txt --cache-control public,max-age=86400 --server-side-encryption AES256
python3 make-config.py
DIST=$(aws cloudfront create-distribution --distribution-config file://.lab/distribution.json --query Distribution.Id --output text)
DIST_ARN=$(aws cloudfront get-distribution --id "$DIST" --query Distribution.ARN --output text)
aws cloudfront get-distribution-config --id "$DIST" --query '{ETag:ETag,Enabled:DistributionConfig.Enabled,Origin:DistributionConfig.Origins.Items[0].DomainName}'
