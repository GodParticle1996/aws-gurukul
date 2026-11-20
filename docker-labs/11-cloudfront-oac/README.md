# Lab11 — CloudFront JSON, OAC policy aur invalidation metadata

**Pain:** private S3 bucket ke saath CDN 403 deta hai; purana object usi URL par purana dikhta hai. Asli CLI se config/ETag padho, OAC attachment ki request aur scoped S3 policy bhejo, invalidation ka metadata dekho. App ka mission asli OAC link aur taaza fixture state laagu karta hai.

**Imaandar limit:** aaj ka Moto 5.2.4 OAC object banata hai, par distribution readback **OriginAccessControlId=null** deta hai; OAC attachment field bachta nahi. Purane ETag ke saath update bhi maan liya jaata hai, ETag badalta nahi. Chalte private CDN ka daava nahi. Cache policies ki list 404 deti hai; koi asli edge/cache/TLS/signed requests nahi. Invalidation status bade akshar mein COMPLETED hai, jabki AWS waiter Completed expect karta hai; Moto par invalidation waiter mat chalao. Distribution-deployed waiter pass hua.

## Setup

Moto pehle se available ho toh start command skip karo. Shared emulator reset nahi.

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

Loopback 4566 + dummy test keys chahiye. `~/.aws` mein kuch nahi likha jaata. Pichhla `.lab/resources.sh` ho toh pehle cleanup. Scripts is task ki IDs save karti hain; bane bucket suffix/IDs badalte rehte hain.

## ex1 — private bucket/object aur pehla distribution

```bash
bash setup.sh
source .lab/resources.sh
cat .lab/distribution.json
```

Asli pakde output ka hissa (2026-10-26 UTC):

```json
{"ETag":"B27SOVYNAPMUY","Enabled":true,"Origin":"shopkaro-lab11-1792978623.s3.ap-south-1.amazonaws.com"}
```

👉 S3 REST endpoint, default managed CachingOptimized ID aur redirect-to-https maange gaye. Object par `public,max-age=86400` metadata hai; bucket ke chaaron Block Public Access flags bane rehte hain. Distribution ke metadata ka matlab yeh nahi ki OAC allowed hai ya content deliver hua.

## ex2 — OAC request, ETag padho, config update karo aur bucket policy dekho

```bash
bash exercises.sh
source .lab/resources.sh
cat .lab/oac.json
cat .lab/attach-oac.json
cat .lab/policy.json
aws cloudfront get-origin-access-control --id "$OAC"
aws cloudfront get-distribution-config --id "$DIST"
```

Script asli operations use karti hai:

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

Policy service Principal `cloudfront.amazonaws.com`, Action `s3:GetObject`, lab bucket object Resource aur exact `AWS:SourceArn` distribution ARN ke saath save hui. OAC object SigningProtocol=sigv4/SigningBehavior=always rakhta hai, par Moto mein distribution link ka readback null hai.

👉 Asli AWS par OAC bana hona **aur** REST origin se juda hona chahiye, policy ko us distribution ko allow karna chahiye, aur deployment poora hona chahiye. Aaj ka Moto attachment/auth enforcement ka certificate nahi deta. Emulator ka 403 chhupane ke liye BPA band mat karo. SSE-KMS objects ko review ki KMS key permission bhi chahiye; yeh lab AES256/SSE-S3 use karti hai.

## ex3 — invalidation dekho (asli cache nahi)

```bash
aws cloudfront get-invalidation --distribution-id "$DIST" --id "$INVALIDATION" --query 'Invalidation.{Id:Id,Status:Status,Paths:InvalidationBatch.Paths.Items}'
```

Asli output:

```json
{"Id":"VZ1QS14YC19DI","Status":"COMPLETED","Paths":["/img/kurta-red.jpg"]}
```

👉 Metadata maana gaya; koi asli cached bytes nahi hate. Asli AWS par create-invalidation ke baad get-invalidation/wait invalidation-completed InProgress→Completed dikhata hai. Aaj ka Moto COMPLETED bade akshar mein deta hai; waiter wait karta hi rahega. Probe ka ek apna waiter roka gaya; shared emulator chalta raha.

Baar-baar ki planned releases ke liye versioned filenames + jaldi refresh hone wale HTML/manifests aam taur par roz ki invalidations se bachate hain. Invalidation browser/office ka cache saaf nahi karti. Pay-as-you-go mein har mahine pehle 1,000 paths/tags free, phir lagbhag $0.005/path/tag; wildcard path ek hi path gina jaata hai. Aaj ka plan/pricing check karo.

## ex4 — ETag/cache-policy ki limits samjho

Captured capability probes:

```text
update-distribution --if-match STALE: accepted (exit0), ETag unchanged
list-cache-policies --type managed: An error occurred (404) when calling the ListCachePolicies operation: Not Found
```

👉 Asli AWS mein purana ETag PreconditionFailed dena chahiye; config dobara padho, edits milao aur aaj ke ETag ke saath dobara try karo. App ka regression asli precondition laagu karta hai. Lab ke managed policy IDs asli likhe hue IDs hain; aaj ka Moto un policies ke hisaab se validate/cache nahi karta. Latency/hit-ratio/kharcha nahi naapa gaya.

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

👉 Enabled=false readback, phir match karne wala koi distribution, OAC ya bucket nahi. Cleanup aaj ka config/ETag leta hai, disable karke OAC alag karta hai, deployed ka wait karta hai, ETag dobara padhta hai, distribution aur OAC delete karta hai, exact lab object/bucket delete karta hai. Baaki labs ko chhoota nahi; IDs `.lab/last-cleaned-resources.sh` mein archive hoti hain.

Asli AWS ka optional sandbox kaam bill hone wala aur alag hai. Pehle region/traffic/budget ki manzoori lo; dummy-lab ke commands taiyaar hote hue sirf AWS_ENDPOINT_URL mat hatao. Jude S3/WAF/log/plan features ka kharcha ho sakta hai; band distribution par koi banayi hui reservation fee nahi.
