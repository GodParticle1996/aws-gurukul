# Lab11 — CloudFront JSON, OAC policy aur invalidation metadata

**Pain:** private S3 bucket ke saath CDN403; old object same URL par stale. Actual CLI se config/ETag read karo, OAC attachment request aur scoped S3 policy submit karo, invalidation metadata inspect karo. In-app mission actual OAC link and fresh fixture state enforce karti hai.

**Honest boundary:** current Moto5.2.4 OAC object create karta hai, but distribution readback **OriginAccessControlId=null** deta hai; OAC attachment field retained nahi. Stale ETag update bhi accepted, ETag unchanged. No working private CDN claim. Cache policies list404; no actual edge/cache/TLS/signed requests. Invalidation status uppercase COMPLETED hai, AWS waiter expects Completed; invalidation waiter Moto par use mat karo. Distribution-deployed waiter passed.

## Setup

Existing Moto available ho toh start command skip karo. Shared emulator reset nahi.

```bash
cd aws-gurukul/docker-labs
./start-moto.sh
source env.sh
cd 11-cloudfront-oac
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
```

Loopback4566 + dummy test keys required. No `~/.aws` writes. Previous `.lab/resources.sh` ho toh cleanup first. Scripts task-local IDs save karte hain; generated bucket suffix/IDs vary.

## ex1 — private bucket/object and initial distribution

```bash
bash setup.sh
source .lab/resources.sh
cat .lab/distribution.json
```

Asli captured output excerpt (2026-10-26UTC):

```json
{"ETag":"B27SOVYNAPMUY","Enabled":true,"Origin":"shopkaro-lab11-1792978623.s3.ap-south-1.amazonaws.com"}
```

👉 S3 REST endpoint, default managed CachingOptimized ID and redirect-to-https requested. Object has `public,max-age=86400` metadata; bucket retains all four Block Public Access flags. Distribution metadata does not mean OAC authorized or content delivered.

## ex2 — OAC request, read ETag, update config and inspect bucket policy

```bash
bash exercises.sh
source .lab/resources.sh
cat .lab/oac.json
cat .lab/attach-oac.json
cat .lab/policy.json
aws cloudfront get-origin-access-control --id "$OAC"
aws cloudfront get-distribution-config --id "$DIST"
```

Script uses actual operations:

```bash
ETAG=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
aws cloudfront update-distribution --id "$DIST" --if-match "$ETAG" --distribution-config file://.lab/attach-oac.json
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file://.lab/policy.json
```

Asli `exercises.sh` readback:

```json
{"ETag":"B27SOVYNAPMUY","Status":"Deployed","OAC":null}
{"PublicAccessBlockConfiguration":{"BlockPublicAcls":true,"IgnorePublicAcls":true,"BlockPublicPolicy":true,"RestrictPublicBuckets":true}}
```

Policy persisted with service Principal `cloudfront.amazonaws.com`, Action `s3:GetObject`, lab bucket object Resource and exact `AWS:SourceArn` distribution ARN. OAC object stores SigningProtocol=sigv4/SigningBehavior=always, but distribution link readback is null in Moto.

👉 On real AWS, OAC must exist **and attach** to REST origin, policy must authorize that distribution, and deployment must finish. Current Moto does not certify attachment/auth enforcement. Do not disable BPA to hide an emulator403. SSE-KMS objects additionally need reviewed KMS key permission; this lab uses AES256/SSE-S3.

## ex3 — inspect invalidation (no real cache)

```bash
aws cloudfront get-invalidation --distribution-id "$DIST" --id "$INVALIDATION" --query 'Invalidation.{Id:Id,Status:Status,Paths:InvalidationBatch.Paths.Items}'
```

Asli output:

```json
{"Id":"VZ1QS14YC19DI","Status":"COMPLETED","Paths":["/img/kurta-red.jpg"]}
```

👉 Metadata accepted; no real cached bytes evicted. On real AWS, create-invalidation then get-invalidation/wait invalidation-completed observes InProgress→Completed. Current Moto capitalizes COMPLETED; waiter would keep waiting. One probe-owned waiter was stopped; shared emulator remained running.

For planned frequent releases, versioned filenames plus promptly refreshed HTML/manifests usually avoid routine invalidations. Invalidation does not flush a browser/corporate cache. Pay-as-you-go first1,000 paths/tags/month free, then approx $0.005/path/tag; a wildcard path counts as one path. Check current plan/pricing.

## ex4 — understand ETag/cache-policy limits

Captured capability probes:

```text
update-distribution --if-match STALE: accepted (exit0), ETag unchanged
list-cache-policies --type managed: An error occurred (404) when calling the ListCachePolicies operation: Not Found
```

👉 Real AWS stale ETag should return PreconditionFailed; re-read config, merge edits and retry with current ETag. In-app regression enforces the real precondition. Managed policy IDs in lab are actual documented IDs; current Moto does not validate/cache according to those policies. No latency/hit-ratio/cost measured.

## ex5 — scoped cleanup

```bash
bash cleanup.sh
```

Asli output:

```text
false
0
0
0
```

👉 Enabled=false readback, then zero matching distribution, OAC and bucket. Cleanup gets current config/ETag, disables and detaches OAC, waits deployed, re-reads ETag, deletes distribution and OAC, deletes exact lab object/bucket. Other labs untouched; IDs archived in `.lab/last-cleaned-resources.sh`.

Real AWS optional sandbox work is billable and separate. Approve region/traffic/budget first; do not simply remove AWS_ENDPOINT_URL while dummy-lab commands are prepared. Related S3/WAF/log/plan features may have costs; no invented ordinary disabled-distribution reservation fee.
