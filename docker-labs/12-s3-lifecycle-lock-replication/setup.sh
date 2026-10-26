#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test keys required'; exit 1; }
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
[ ! -f .lab/resources.sh ] || { echo 'Cleanup previous lab state first'; exit 1; }
SRC= DR= LOCK= ROLE_NAME= ROLE= LOCK_VERSION= SOURCE_VERSION= ARCHIVE_VERSION=
SRC_CREATED=false DR_CREATED=false LOCK_CREATED=false ROLE_CREATED=false ROLE_POLICY_CREATED=false
umask 077
save() { for key in SRC DR LOCK ROLE_NAME ROLE LOCK_VERSION SOURCE_VERSION ARCHIVE_VERSION SRC_CREATED DR_CREATED LOCK_CREATED ROLE_CREATED ROLE_POLICY_CREATED; do printf 'export %s=%q\n' "$key" "${!key:-}"; done > .lab/resources.sh; }
trap save EXIT
export SRC="shop-lab12-$(date +%s)"
export DR="$SRC-dr" LOCK="$SRC-lock" ROLE_NAME="$SRC-replication"
aws s3api create-bucket --bucket "$SRC" --create-bucket-configuration LocationConstraint=ap-south-1
SRC_CREATED=true
aws s3api create-bucket --bucket "$DR" --region us-east-1
DR_CREATED=true
aws s3api create-bucket --bucket "$LOCK" --create-bucket-configuration LocationConstraint=ap-south-1
LOCK_CREATED=true
export ROLE="arn:aws:iam::123456789012:role/$ROLE_NAME"
python3 make-config.py
ROLE=$(aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document file://.lab/trust.json --query Role.Arn --output text)
ROLE_CREATED=true
export ROLE
python3 make-config.py
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name replication --policy-document file://.lab/role-policy.json
ROLE_POLICY_CREATED=true
for bucket in "$SRC" "$DR" "$LOCK"; do aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true; done
printf 'dummy invoice lab12\n' > .lab/invoice.txt
aws s3api get-bucket-versioning --bucket "$SRC"
echo 'Source initially unversioned; replication-before-versioning example should fail.'
