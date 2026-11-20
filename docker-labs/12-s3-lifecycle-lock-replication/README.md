# Lab12 — lifecycle, Object Lock, replication aur archive restore

**Pain:** lakhon chhote logs ka transition bill storage ki bachat se zyada ho sakta hai. Default retention purane invoice versions ko peeche jaa kar lock nahi karti. Replication ka config DR copy ka saboot nahi. Asli CLI state dekho.

**Scope:** sirf local Moto 5.2.4. Lab ke apne teen buckets + ek IAM role. Source Mumbai, destination us-east-1 metadata, alag lock bucket. Retention jaan-boojh kar **GOVERNANCE 1 day**, taaki cleanup ke paas allowed bypass ho. Saat saal ka COMPLIANCE app mein sikhaya/test kiya jaata hai; yahan koi lambi, wapas na ho sakne wali retention resource nahi banti. Asli AWS, shared reset ya lifecycle ke liye dino ka wait nahi.

## Setup — alag dummy environment

Moto pehle se chal raha ho toh start command skip karo.

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

Loopback 4566 + dummy test keys chahiye; `~/.aws` mein kuch nahi likha jaata. Setup sirf safal bane resources track karta hai, beech mein fail ho toh IDs save karta hai. `.lab/resources.sh` pehle se ho toh pehle pichhla run saaf karo. Scripts padhne layak hain; bane naam/UUIDs badalte rehte hain.

## ex1 — replication ko versioning kyun chahiye

Before `exercises.sh`, run:

```bash
cat .lab/role-policy.json
cat .lab/replication.json
aws s3api put-bucket-replication --bucket "$SRC" --replication-configuration file://.lab/replication.json
```

Versioning se pehle asli capability probe:

```text
An error occurred (InvalidRequest) when calling the PutBucketReplication operation: Versioning must be 'Enabled' on the bucket to apply a replication configuration
```

👉 Source aur destination dono versioned hone chahiye. Source par Object Lock on ho toh destination par bhi lock on chahiye, aur role ko GetObjectRetention/GetObjectLegalHold bhi chahiye. Setup service trust aur scoped role policy banata hai; normal Moto poore IAM enforcement ka certificate nahi deta. SSE-KMS/cross-account designs ko extra review ki permissions chahiye.

## ex2 — metadata lagao, limits wapas padho

```bash
cat lifecycle.json
bash exercises.sh
source .lab/resources.sh
```

Script versioning on karti hai; source/DR par Object Lock bina blanket default ke; alag lock bucket 1 din ka governance use karta hai. Lifecycle mein bade logs ke alag transitions, noncurrent cleanup aur abort-multipart rules hain. Replication invoices/ ko filter karta hai; asli AWS par purane objects ke liye Batch Replication phir bhi chahiye.

Asli output excerpts:

```json
{"TransitionDefaultMinimumObjectSize":"all_storage_classes_128K","Rules":[
 {"ID":"archive-large-logs","Status":"Enabled","Filter":{"And":{"Prefix":"logs/aggregated/"}},"Transitions":[{"Days":30,"StorageClass":"STANDARD_IA"},{"Days":180,"StorageClass":"GLACIER"}]},
 {"ID":"noncurrent-cleanup","Status":"Enabled","Filter":{"Prefix":"logs/"},"NoncurrentVersionTransitions":[{"NoncurrentDays":30,"StorageClass":"STANDARD_IA"}],"NoncurrentVersionExpiration":{"NoncurrentDays":365}},
 {"ID":"abort-incomplete","Status":"Enabled","Filter":{"Prefix":"logs/"},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}
]}
```

👉 Aaj ka Moto bheje gaye And filter se `ObjectSizeGreaterThan` gira deta hai. Default-size header aur baaki rule metadata bache rehte hain; poora size-filter enforcement aur umar se chalne wale transitions **check nahi hue**. Bheje lifecycle.json ko readback se compare karo; yeh daava mat karo ki emulator ne 180 din ki umar chalayi.

Intelligent-Tiering probe ka result:

```text
An error occurred (IllegalLocationConstraintException) when calling the PutBucketIntelligentTieringConfiguration operation: The unspecified location constraint is incompatible for the region specific endpoint this request was sent to.
Known current Moto Intelligent-Tiering API gap; no tiering behavior claimed.
```

```json
{"IntelligentTieringConfiguration":{}}
```

👉 Aaj ke installed Moto mein yeh config handler nahi hai. Khaali get response sahi save hua tiering rule nahi. Script sirf dekhi hui failure pehchanti hai; anjaane errors exercise rok dete hain. Asli AWS mein class chunna aur optional archive-tier config alag faisle hain; sirf bucket config Standard objects ko badalta nahi.

Upload ke baad DR `list-object-versions --prefix invoices/` ne koi version nahi diya (sirf Prefix). Config bacha raha, par async replication worker/copies nahi chale. Koi naapi RTC/RPO guarantee nahi.

## ex3 — locked version vs delete marker vs legal hold

`exercises.sh` save kiye version ke saath yeh operations karta hai:

```bash
aws s3api head-object --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION" --query '{Mode:ObjectLockMode,Until:ObjectLockRetainUntilDate}'
aws s3api delete-object --bucket "$LOCK" --key invoices/locked.txt --version-id "$LOCK_VERSION"
```

Asli results: Mode=GOVERNANCE, retain-until timestamp 1 din aage, phir:

```text
An error occurred (AccessDenied) when calling the DeleteObject operation: Access Denied
```

Script legal hold ON karti hai, `{"LegalHold":{"Status":"ON"}}` padhti hai, phir `--bypass-governance-retention` **ke saath** version delete karne par bhi AccessDenied aata hai. Legal hold alag cheez hai. Hold OFF ke baad script bina version ke simple delete karti hai, jo ek marker jodta hai:

```json
{"Versions":1,"Markers":1}
```

👉 Protected version abhi bhi hai; sabse naya marker aam latest-version GET se key chhupa sakta hai. Lock protected version ka hamesha ke liye delete rokta hai, har tarah ka dikhna badalna nahi. Asli AWS mein governance bypass ke liye permission **aur** request flag dono chahiye; retention ke dauran COMPLIANCE ko root bhi bypass/chhota nahi kar sakta.

Aaj ke `get-object-retention` capability probe ne 500 diya. Is lab mein safal HeadObject lock metadata use karo; woh unsupported call baar-baar retry mat karo. App ka engine sahi get-retention behaviour chalata hai.

## ex4 — archive hue bytes restore karo, naya permanent storage class nahi

Script GLACIER object banati hai; restore se pehle GET fail hota hai:

```text
An error occurred (InvalidObjectState) when calling the GetObject operation: The operation is not valid for the object's storage class
```

Asli command sequence (script pehle hi chala chuki hai):

```bash
aws s3api restore-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" --restore-request 'Days=2,GlacierJobParameters={Tier=Standard}'
aws s3api head-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" --query '{StorageClass:StorageClass,Restore:Restore}'
aws s3api get-object --bucket "$SRC" --key archive/history.txt --version-id "$ARCHIVE_VERSION" .lab/restored.txt
cmp .lab/invoice.txt .lab/restored.txt
```

Asli head: StorageClass GLACIER hi rehta hai, Restore mein `ongoing-request="false"` aur do din ki expiry hai. `cmp` pass hota hai:

```text
Restored Moto object bytes match original; no real archive delay measured.
```

👉 Moto turant restore kar deta hai. Asli Flexible/Deep archive restore chune tier ka time leta hai; thodi der ki padhne layak copy asli archive ki class nahi badalti. Restore metadata poll karo jab tak complete na ho, phir bytes/version check karo. Is course mein koi nakli `restore-completed` S3 waiter nahi.

## ex5 — sirf save hue resources ka cleanup

```bash
bash cleanup.sh
```

Asli output do khaali lists ke saath khatam hota hai:

```text
[]
[]
```

👉 Save hue bucket naam aur role ab nahi hain. Script exact versions/markers ginti hai, exercise ke legal hold hatane ke baad sirf lab ki governance retention bypass karti hai, apne buckets delete karti hai, phir inline policy/role. Shared emulator reset nahi. IDs/creation flags `.lab/last-cleaned-resources.sh` mein archive hote hain.

Legal hold ON ke saath beech mein ruk jaaye toh cleanup se pehle dekh kar sirf lab version ka hold saaf taur par hatao; hold ka bypass jaan-boojh kar nahi diya gaya. Wahi put-object-legal-hold command Status=OFF aur save hue version ke saath chalao. Pehle se bane datasets/policies ko chhoota nahi jaata.

Asli AWS ka kaam optional, bill hone wala aur alag hai. Jis resource ko aaj delete karna hai, us par kabhi saat saal ka COMPLIANCE test mat karo. Storage class kharche/retrieval ka chunav hai; WORM ke liye retention settings aur protected encryption-key access bhi chahiye.
