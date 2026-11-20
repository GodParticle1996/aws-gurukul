# Lab21 — risky configuration se review evidence tak

**Pain:** `MultiAZ=true`, ek alarm ka naam aur ek logging flag yeh prove nahi kar sakte ki business workload wapas chal gaya. Review ke saboot ko config, naape runtime aur business result mein alag karo.

Yeh lab **course ke teen bataye config contracts** check karti hai, poora AWS Well-Architected Framework ya official AWS WA Tool ki risk rating nahi. Saare fixtures apne thodi der ke loopback Moto 5.2.4 server par TEST data use karte hain. Asli AWS, SQL, Lambda, packet tests ya Docker nahi chalte.

## Exact setup aur run

Pehle se bana `docker-labs/.venv` chahiye. `aws-gurukul` se:

```bash
./docker-labs/21-wellarch-risk-scan/seed.sh
```

`seed.sh` poori limit wali exercise chalata hai: seed → scan → repair → scan → cleanup. Baad ke terminal ke liye koi server chalta nahi chhoda jaata. `lab.py` `risk_scan.py` ka dobara use hone wala `risk_scan.scan()` helper bulata hai; run se pehle dono padho. Launcher pehle se bana environment source karta hai, jiska banner 4566/ap-south-1 bolta hai. Python saaf taur par **har client** ko naye print hue `OWNED MOTO http://127.0.0.1:<port>` endpoint/us-east-1 par bhejta hai, dummy credentials, band profiles/session token/metadata aur lab ki apni config ke saath. Shared reset ya ~/.aws mein likhna nahi.

## ex1 — seed karo, teen contracts dekho

Actual repository replay (2026-10-27):

```text
ACTUAL SCAN ... "count": 3, "notAnAWSWAReview": true ...
PASS 1 scanner finds3declared config risks before repair
```

Seed ek private encrypted PostgreSQL DB metadata fixture, BPA aur asli TEST saboot wala S3 audit bucket, aur baad mein topic/alarm/trail banata hai. Shuru ki kamiyan:

| Pillar / bataya contract | Shuru ka saboot | Review kiya repair |
|---|---|---|
| Reliability | Single-AZ, backup retention 0 din | Multi-AZ + 7 din retention; source bachao |
| Operational Excellence | Review kiya target 5xx alarm nahi | Sum/Count, exact diya dimension, 2×60s mein se 2 mein >5, missing data, apna SNS target |
| Security | Scoped multi-Region management trail config nahi | Exact S3 SourceArn policy, global/multi-Region/validation flags, All management selector, logging |

`risk_scan.py` padho: scanner asli field values check karta hai, sirf yeh nahi ki milte naam ka resource hai. Alarm dimensions `TRAINING-NOT-DEPLOYED` use karte hain: **koi asli ALB deploy nahi hota**. Threshold 5 Count course ka saaf diagnostic example hai, customer error-rate SLO ki salah nahi.

## ex2 — emulator ki kamiyan dobara dikhao aur samjho

Script pehle ek phenkne layak trail **bina bucket policy ke** banati/start karti hai, phir rok deti hai. Moto logging maan leta hai aur LatestDeliveryTime bhi de deta hai. Baad mein bucket dekhne par sirf `TEST-preserve.txt` milta hai; koi CloudTrail files ya digests nahi pahunche. Yeh pakdi hui authorization/delivery ki kami hai. Asli AWS ko chalne layak destination permissions chahiye, aur sirf IsLogging se delivery prove nahi hoti.

Review ki policy mein GetBucketAcl aur account ke AWSLogs path par PutObject hai, exact trail SourceArn aur bucket-owner-full-control condition ke saath. Simulator yahi limit wala likha access raasta check karta hai; Moto ki bina shart manzoori ki copy nahi karta.

Asli default GetEventSelectors ne `[]` diya; script saaf taur par All-management selector set karti hai. Asli default management-event capture aur saaf selector config ko aaj ki AWS documentation se check karo, Moto ki khaali list se andaaza mat lagao.

CloudWatch ke aaj ke SDK/provider defaults CBOR use kar sakte hain, jo yeh Moto version theek se decode nahi kar sakta. Ek **private in-memory SDK service model** apna supported Query protocol chunta hai; koi installed package ya server response patch nahi hota. Put/Describe/DeleteMetricAlarm asli local API calls hain. Asli shuru ki state:

```text
INITIAL ALARM OK Unchecked: Initial alarm creation
```

Yeh taaza 5xx observation, safal page ya healthy checkout nahi.

## ex3 — repair karo aur dobara scan karo

Run se pehle `lab.py` ka har API block padho. Script ke repairs app ke CLI faislon jaise hi hain:

1. Chhoti S3 policy save karo aur wapas padho. Exact trail/account path aana chahiye.
2. DB ka MultiAZ/BackupRetentionPeriod=7 badlo. Private DB bana rehna chahiye. Koi SQL restore/failover nahi chalta.
3. Poori tarah likha 5xx alarm supported Query client se put karo. Asli fields/topic wapas padhe jaane chahiye.
4. Apne trail ko review kiye flags aur saaf management selector ke saath update/start karo. IsLogging true aana chahiye, **sirf config metadata ke roop mein**.
5. Dobara scan karo aur asli TEST bytes wapas lo.

Actual output:

```text
PASS 2 reviewed exact trail policy persisted
PASS 3 HA/backup config repaired; no SQL/failover
PASS 4 actual Query alarm config; no ALB deployed/metric proof
PASS 5 trail flags/logging config readback
ACTUAL SCAN ... "count": 0, "notAnAWSWAReview": true ...
PASS 6 0of3declared config risks; not framework/runtime pass
LOOKUP_EVENTS_MOTO_GAP ClientError
HISTORY/DELIVERY ... "objects": ["TEST-preserve.txt"] ...
PASS 7 original TEST evidence preserved
BEHAVIOR CHECKS 7
```

Moto mein LookupEvents bana hi nahi hai aur HTTP 500/NotImplementedError deta hai; yeh expected kami print hoti hai, asli event ka saboot nahi maani jaati. Baaki anjaane API failures abhi bhi exercise fail karte hain. App ke lookup results course ke pehle se daale events hain, live ikattha history nahi.

## Cleanup and interpretation

`finally` block sirf apna trail, alarm/topic, DB/subnet group/VPC/subnets aur bucket ke TEST objects rokta/delete karta hai. Asli safal replay:

```text
PASS 8 owned fixture resources cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

Sirf apna listener band hota hai. Shared 4566 reset nahi. `.lab` ignore hone wala local scratch hai. Ek fail sandbox-startup capture aur pehli unsupported-LookupEvents koshish development ke saboot ke roop mein rakhi gayi hain; baad ka poora replay 7 behaviour checks + cleanup 8 ke saath pass hua.

**Bacha review ka kaam:** asli SQL/business IDs restore karke milao, asli RTO/RPO/tails/errors naapo, asli metric se chalne wale notifications check karo, pahunchi CloudTrail log/digest files dekho aur validation chalao. Log-file validation on karne se aage digest bante hain; yeh khud files validate nahi karta. Identity, deployment/runbooks, resources ka sahi use aur workload ke baaki risks bhi review karo. In 3 config findings ka zero hona security certificate ya poora Well-Architected pass nahi.

Sources: [review process](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-review-process.html), [improvement plan](https://docs.aws.amazon.com/wellarchitected/latest/userguide/improving-your-workload.html), [CloudTrail bucket policy](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/create-s3-bucket-policy-for-cloudtrail.html), [event history](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html), [digest validation](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html).
