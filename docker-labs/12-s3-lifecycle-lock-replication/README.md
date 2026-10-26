# Lab12 — lifecycle, Object Lock, replication and archive restore

**Pain:** millions of tiny logs ka transition bill storage saving ko beat kar sakta hai. Default retention existing invoice versions retroactively lock nahi karti. Replication configuration is not proof of a DR copy. Actual CLI state inspect karo.

**Scope:** local Moto5.2.4 only. Three lab-owned buckets + one IAM role. Source Mumbai, destination us-east-1 metadata, separate lock bucket. Retention intentionally **GOVERNANCE1day**, so cleanup has an authorized bypass. Seven-year COMPLIANCE is taught/tested in-app; no long irreversible retention resource created here. No real AWS, shared reset or waiting days for lifecycle.

## Setup — isolated dummy environment

Existing Moto ho toh start command skip karo.

```bash
cd aws-gurukul/docker-labs
./start-moto.sh
source env.sh
cd 12-s3-lifecycle-lock-replication
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
bash setup.sh
source .lab/resources.sh
```

Loopback4566 + dummy test keys required; no `~/.aws` writes. Setup tracks only successfully created resources, saves IDs on partial failure. Existing `.lab/resources.sh` means clean previous run first. Scripts are readable; generated names/UUIDs vary.

## ex1 — why replication needs versioning

Before `exercises.sh`, run:

```bash
cat .lab/role-policy.json
cat .lab/replication.json
aws s3api put-bucket-replication --bucket "$SRC" --replication-configuration file://.lab/replication.json
```

Asli capability probe before versioning:

```text
An error occurred (InvalidRequest) when calling the PutBucketReplication operation: Versioning must be 'Enabled' on the bucket to apply a replication configuration
```

👉 Source and destination must be versioned. Source Object Lock enabled ho toh destination lock enabled and role needs GetObjectRetention/GetObjectLegalHold too. Setup creates service trust and scoped role policy; normal Moto does not certify complete IAM enforcement. SSE-KMS/cross-account designs need additional reviewed permissions.

## ex2 — apply metadata, read back the limits

```bash
cat lifecycle.json
bash exercises.sh
source .lab/resources.sh
```

Script enables versioning; source/DR Object Lock with no blanket default; separate lock bucket uses1day governance. Lifecycle has separate large-log transitions, noncurrent cleanup and abort-multipart rules. Replication filters invoices/; existing objects still need Batch Replication on real AWS.

Asli output excerpts:

```json
{"TransitionDefaultMinimumObjectSize":"all_storage_classes_128K","Rules":[
 {"ID":"archive-large-logs","Status":"Enabled","Filter":{"And":{"Prefix":"logs/aggregated/"}},"Transitions":[{"Days":30,"StorageClass":"STANDARD_IA"},{"Days":180,"StorageClass":"GLACIER"}]},
 {"ID":"noncurrent-cleanup","Status":"Enabled","Filter":{"Prefix":"logs/"},"NoncurrentVersionTransitions":[{"NoncurrentDays":30,"StorageClass":"STANDARD_IA"}],"NoncurrentVersionExpiration":{"NoncurrentDays":365}},
 {"ID":"abort-incomplete","Status":"Enabled","Filter":{"Prefix":"logs/"},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}
]}
```

👉 Current Moto drops `ObjectSizeGreaterThan` from the submitted And filter. Default-size header and remaining rule metadata persist; full size-filter enforcement and age-driven transitions are **unverified**. Compare input lifecycle.json against readback; do not claim the emulator ran180days of aging.

Intelligent-Tiering probe result:

```text
An error occurred (IllegalLocationConstraintException) when calling the PutBucketIntelligentTieringConfiguration operation: The unspecified location constraint is incompatible for the region specific endpoint this request was sent to.
Known current Moto Intelligent-Tiering API gap; no tiering behavior claimed.
```

```json
{"IntelligentTieringConfiguration":{}}
```

👉 Current installed Moto lacks this configuration handler. Empty get response is not a valid saved tiering rule. Script recognizes only the observed failure; unexpected errors stop the exercise. Real AWS class selection vs optional archive-tier configuration are separate decisions; bucket configuration alone does not convert Standard objects.

After upload, DR `list-object-versions --prefix invoices/` returned no versions (Prefix only). Config persisted, asynchronous replication worker/copies did not run. No measured RTC/RPO guarantee.

## ex3 — locked version vs delete marker vs legal hold

`exercises.sh` performs these operations with the saved version:

```bash
aws s3api head-object --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION" --query '{Mode:ObjectLockMode,Until:ObjectLockRetainUntilDate}'
aws s3api delete-object --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION"
```

Asli outcomes: Mode=GOVERNANCE with retain-until timestamp1day ahead, then:

```text
An error occurred (AccessDenied) when calling the DeleteObject operation: Access Denied
```

Script adds legal hold ON, reads `{"LegalHold":{"Status":"ON"}}`, then a version delete **with** `--bypass-governance-retention` still gets AccessDenied. Legal hold independent hai. Hold OFF ke baad script simple delete without version adds a marker:

```json
{"Versions":1,"Markers":1}
```

👉 Protected version still exists; newest marker can hide the key from ordinary latest-version GET. Lock prevents permanent protected-version deletion, not all visibility changes. In real AWS governance bypass requires permission **and** request flag; COMPLIANCE cannot be bypassed/shortened even by root during retention.

Current `get-object-retention` capability probe returned500. Use the successful HeadObject lock metadata in this lab; do not retry that unsupported call repeatedly. In-app engine implements correct get-retention behavior.

## ex4 — restore archived bytes, not a new permanent storage class

Script creates GLACIER object; GET before restore fails:

```text
An error occurred (InvalidObjectState) when calling the GetObject operation: The operation is not valid for the object's storage class
```

Actual command sequence (script already executed it):

```bash
aws s3api restore-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" --restore-request 'Days=2,GlacierJobParameters={Tier=Standard}'
aws s3api head-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" --query '{StorageClass:StorageClass,Restore:Restore}'
aws s3api get-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" .lab/restored.txt
cmp .lab/invoice.txt .lab/restored.txt
```

Asli head: StorageClass remains GLACIER, Restore contains `ongoing-request="false"` and a two-day expiry. `cmp` passes:

```text
Restored Moto object bytes match original; no real archive delay measured.
```

👉 Moto restores immediately. Real Flexible/Deep archive restore takes selected-tier time; temporary readable copy does not reclassify original archive. Poll Restore metadata until complete, then verify bytes/version. No fake `restore-completed` S3 waiter exists in this course.

## ex5 — cleanup only saved resources

```bash
bash cleanup.sh
```

Asli output ends with two empty lists:

```text
[]
[]
```

👉 Saved bucket names and role absent. Script enumerates exact versions/markers, bypasses only lab governance retention after exercise removed legal hold, deletes owned buckets then inline policy/role. No shared emulator reset. IDs/creation flags archive in `.lab/last-cleaned-resources.sh`.

If interrupted with legal hold ON, inspect and explicitly remove only the lab version's hold before cleanup; hold bypass is intentionally unavailable. Run the same put-object-legal-hold command with Status=OFF and saved version. Existing datasets/policies remain untouched.

Real AWS work is optional, billable and separate. Never test seven-year COMPLIANCE on a resource you expect to delete today. Storage class is a cost/retrieval choice; WORM requires retention settings and protected encryption-key access too.
