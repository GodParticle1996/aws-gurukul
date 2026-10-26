#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test keys required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
for bucket in "$SRC" "$DR" "$LOCK"; do aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled; done
for bucket in "$SRC" "$DR"; do aws s3api put-object-lock-configuration --bucket "$bucket" --object-lock-configuration '{"ObjectLockEnabled":"Enabled"}'; done
aws s3api put-object-lock-configuration --bucket "$LOCK" --object-lock-configuration file://.lab/lock.json
aws s3api put-bucket-lifecycle-configuration --bucket "$SRC" --lifecycle-configuration file://lifecycle.json --transition-default-minimum-object-size all_storage_classes_128K
aws s3api get-bucket-lifecycle-configuration --bucket "$SRC"
aws s3api put-bucket-replication --bucket "$SRC" --replication-configuration file://.lab/replication.json
aws s3api get-bucket-replication --bucket "$SRC"
if AWS_MAX_ATTEMPTS=1 aws s3api put-bucket-intelligent-tiering-configuration --bucket "$SRC" --id unknown-media --intelligent-tiering-configuration file://.lab/tiering.json > .lab/tiering-result.txt 2>&1; then
 cat .lab/tiering-result.txt
else
 cat .lab/tiering-result.txt
 case "$(cat .lab/tiering-result.txt)" in *IllegalLocationConstraintException*) echo 'Known current Moto Intelligent-Tiering API gap; no tiering behavior claimed.';; *) exit 1;; esac
fi
aws s3api get-bucket-intelligent-tiering-configuration --bucket "$SRC" --id unknown-media
SOURCE_VERSION=$(aws s3api put-object --bucket "$SRC" --key invoices/INV-12.txt --body .lab/invoice.txt --query VersionId --output text)
printf 'export SOURCE_VERSION=%q\n' "$SOURCE_VERSION" >> .lab/resources.sh
aws s3api list-object-versions --bucket "$DR" --prefix invoices/
LOCK_VERSION=$(aws s3api put-object --bucket "$LOCK" --key invoices/locked.txt --body .lab/invoice.txt --query VersionId --output text)
printf 'export LOCK_VERSION=%q\n' "$LOCK_VERSION" >> .lab/resources.sh
aws s3api head-object --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION" --query '{Mode:ObjectLockMode,Until:ObjectLockRetainUntilDate}'
expect_denied() {
 if "$@" > .lab/denied.txt 2>&1; then echo 'Unexpected delete success; stop and review'; exit 1; fi
 cat .lab/denied.txt
 case "$(cat .lab/denied.txt)" in *AccessDenied*) :;; *) exit 1;; esac
}
expect_denied aws s3api delete-object --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION"
aws s3api put-object-legal-hold --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION" --legal-hold Status=ON
aws s3api get-object-legal-hold --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION"
expect_denied aws s3api delete-object --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION" --bypass-governance-retention
aws s3api put-object-legal-hold --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION" --legal-hold Status=OFF
aws s3api delete-object --bucket "$LOCK" --key invoices/locked.txt
aws s3api list-object-versions --bucket "$LOCK" --query '{Versions:length(Versions),Markers:length(DeleteMarkers)}'
ARCHIVE_VERSION=$(aws s3api put-object --bucket "$SRC" --key archive/history.txt --body .lab/invoice.txt --storage-class GLACIER --query VersionId --output text)
printf 'export ARCHIVE_VERSION=%q\n' "$ARCHIVE_VERSION" >> .lab/resources.sh
if aws s3api get-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" .lab/before.txt > .lab/archive-error.txt 2>&1; then echo 'Expected archive InvalidObjectState; stop'; exit 1; fi
cat .lab/archive-error.txt
case "$(cat .lab/archive-error.txt)" in *InvalidObjectState*) :;; *) exit 1;; esac
aws s3api restore-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" --restore-request 'Days=2,GlacierJobParameters={Tier=Standard}'
aws s3api head-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" --query '{StorageClass:StorageClass,Restore:Restore}'
aws s3api get-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" .lab/restored.txt
cmp .lab/invoice.txt .lab/restored.txt
echo 'Restored Moto object bytes match original; no real archive delay measured.'
