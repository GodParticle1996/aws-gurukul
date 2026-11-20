# Lab14 — handler bytes, duplicate events aur Lambda configuration

**Pain:** S3 event dobara aa sakta hai; source key overwrite ho sakti hai; batch mein ek galat message ho sakta hai. StatusCode 200 mein bhi function error ho sakta hai. Sahi hone ka saboot asli output aur fail IDs se lo.

**Scope:** sirf bharose wala SVG fixture, host Python + pehle se bana loopback Moto 5.2.4. Teen derivative sizes 64/128/256; source VersionId bacha rehta hai; byte check ke saath conditional output banta hai. Yeh JPEG/PNG codec, anjaani images ki security pipeline ya AWS runtime benchmark nahi. Extra package install nahi chahiye: pehle se bane lab venv mein boto3 hai.

## Setup environment

```bash
cd aws-gurukul/docker-labs
# Existing Moto absent ho tab launcher; shared reset mat chalao.
./start-moto.sh
source env.sh
cd 14-lambda-handler-config
```

Dono scripts dummy test/test, lab ki apni credential/config paths aur loopback endpoints zaroori karti hain. `lab.py` **har CLI service** par saaf `--endpoint-url http://127.0.0.1:4566 --region ap-south-1` deta hai. Profiles/session tokens unset, metadata band. Scripts `~/.aws` ko nahi chhooti.

## ex1 — host par asli handler chalao, phir asli S3 objects check karo

```bash
../.venv/bin/python -I test_handler.py
```

Test `app.py` ko saaf path se import karta hai (`-I` import paths alag rakhta hai), do unique naam wale apne buckets banata hai, source versioning on karta hai aur key mein URL-encoded space/plus wala bharose ka SVG upload karta hai. Handler event ki exact VersionId padhta hai, asli SVG bytes banata hai aur derivatives alag output bucket mein likhta hai. Keys source bucket/key/version ki pehchaan se banti hain. Asli source bacha rehta hai.

Asli captured output:

```json
{
  "checks":19,
  "first":{"written":3,"duplicates":0},
  "second":{"written":0,"duplicates":3},
  "partial":{"batchItemFailures":[{"itemIdentifier":"bad-1"}]},
  "concurrent":{"written":3,"duplicates":9},
  "outputObjects":6
}
```

Bane bucket naam badalte rehte hain. Test teeno asli dimensions, asli bytes, duplicate writes, naye source version ki chaar ek saath deliveries, purane version ke purane events, galat nested events aur ek kharab pehle se bana derivative check karta hai. Dono test buckets aur exact versions `finally` mein saaf hote hain.

👉 **Asli baat:** tay output keys + `IfNoneMatch='*'` duplicate banne se rokte hain. 412 aane par acknowledge karne se pehle purane bytes compare karo. Baaki failures retry ke liye aage jaate hain; asli S3 conditional 409/network behaviour ke liye retry policy chahiye. Yeh har output ki idempotency hai, distributed transaction ya har jagah exactly-once ka vaada nahi. Beech mein rukha pehla invocation adhoora set chhod sakta hai; retry missing derivatives bhar deta hai.

## ex2 — Standard SQS partial-batch ka contract

`test_handler.py` mein `handler()` aur `partial` test padho. Achha message wahi S3 event lapet kar rakhta hai. Kharab message mein galat JSON hai. Handler `batchItemFailures` mein sirf `bad-1` lautata hai aur pehle se sahi outputs bachata hai.

Asli Lambda SQS mapping mein `ReportBatchItemFailures` on hona chahiye **aur** handler ko fail message IDs lautane chahiye. Function ki async retry/destination settings, SQS visibility/redrive se alag mechanism hain. Yeh fixture Standard SQS ke niyam use karta hai; FIFO mein order bachana aur failure ke baad bache records report karna zaroori hai.

## ex3 — Moto par asli AWS CLI config requests

Read `lab.py`, then:

```bash
../.venv/bin/python -I lab.py setup
../.venv/bin/python -I lab.py exercises
```

Controller har asli CLI command print karta hai. Setup sirf apne khaali source/output buckets, khaali jobs/failures queues, ek scoped Lambda-trusted IAM role/policy aur Python 3.12 function ZIP banata hai. Koi source-bucket notification ya queue message install/send nahi hota; apne aap runtime execution ka daava nahi.

Exercises run:

- `update-function-configuration` se memory 1024MB/timeout 15s, phir asli `wait function-updated-v2` aur config read.
- Reserved concurrency 10; function async retry 2/age 3600s, OnFailure SQS destination ke saath.
- `ReportBatchItemFailures` ke saath Standard SQS event source mapping, aur asli list readback.
- Source bucket ARN aur source account se scoped S3 resource permission; `get-policy` readback.
- Ek haath se `invoke`, response metadata aur body dono dekho; ek version publish karo aur provisioned concurrency API try karo.

Captured configuration excerpt:

```json
{"Memory":1024,"Timeout":15,"Update":"Successful"}
```

Pakda hua async config ka hissa:

```json
{"MaximumRetryAttempts":2,"MaximumEventAgeInSeconds":3600,
 "DestinationConfig":{"OnFailure":{"Destination":"arn:aws:sqs:ap-south-1:123456789012:lab14-...-failures"}}}
```

Upar ka ARN chhota kiya hua hissa hai; asli bana ARN controller print karta hai aur `.lab/resources.json` mein likhta hai. Pakde mapping response mein `State:"Enabled"`, `BatchSize:10`, `FunctionResponseTypes:["ReportBatchItemFailures"]` hain. Yeh metadata hai, iska saboot nahi ki Moto ne queue padhi ya failure destination tak deliver kiya.

## ex4 — HTTP status handler ki safalta nahi; Docker ki limit

Abhi Docker nahi hai. Asli Moto invoke result:

```json
{"StatusCode":200,"FunctionError":"Handled"}
```

Asli response body ka hissa:

```text
error running docker: Error while fetching server API version: ('Connection aborted.', FileNotFoundError(2, 'No such file or directory'))
```

Installed Moto par `PutProvisionedConcurrencyConfig` ne 404 diya. Version publish safal hua; warm runtime allocation check nahi hua. Na CLI ka success status, na metadata, chala hua code, initialization latency ya request delivery prove karta hai.

**Docker runtime wala hissa user ke install karne tak baaki:** is lab ne koi Docker install ya start nahi kiya. Upar ka host handler test alag se check hua hai. Aage Docker run se pehle container-se-Moto endpoint routing review karo (container ka 127.0.0.1 host ka 127.0.0.1 nahi), runtime dependencies, trigger delivery, logs aur cleanup bhi; aaj ke function environment ko test kiya container networking mat samjho. Koi banaya hua safal Docker output isme nahi.

## Cleanup

```bash
../.venv/bin/python -I lab.py cleanup
```

Sirf safal creation ke baad likhi IDs cleanup ke layak hain. Order: mapping, koi maana gaya PC config, function/apna log group, queues, khaali buckets, role policy/role. Setup fail ho toh woh apna scoped cleanup try karta hai; exercise fail hone ke baad cleanup saaf taur par chalao. Safal cleanup resource manifest ko archive karta hai.

Asli final lookup output:

```json
[]
[]
```

Source/output metadata buckets khaali rehte hain; host handler tests ke apne alag buckets hain, apne version cleanup ke saath. Shared emulator kabhi reset nahi hota. Asli AWS ya Docker runtime ke results ka daava nahi.
