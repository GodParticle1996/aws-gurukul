# Lab20 — Mahasale readiness: config, channel test aur limit wala kaam

**Pain:** architecture diagram traffic ke liye taiyaari prove nahi karta. Scheduled capacity, replica availability, consumer caps, alarm config aur asli kaam ki pehchaan, sabko alag saboot chahiye.

Teen scripts ke scope alag hain. Terraform local control-plane objects banata hai; metadata.py capacity APIs check karta hai; load.py limit wale workload mein durable TEST handoff check karta hai. **Chalta hua storefront, asli PostgreSQL, Lambda runtime, asli WAF filtering, metric se chalne wali paging ya AWS throughput ka koi daava nahi.**

## Setup aur exact order

Pehle se bana Moto 5.2.4 Python environment, Terraform 1.17.0 aur AWS provider 6.70.0 use hue. Terraform ek alag tool hai; Docker nahi chahiye.

```bash
cd aws-gurukul/docker-labs
source env.sh
# Terraform pehle install karo. Yeh command uska version dikhaati hai.
terraform version
python -I 20-mahasale-terraform/lab.py
python -I 20-mahasale-terraform/metadata.py
python -I 20-mahasale-terraform/load.py
```

Naye clone mein installed aur check kiya Terraform binary chahiye; zaroorat ho toh LAB20_TERRAFORM ko uske absolute path par set karo. [Official Terraform downloads](https://developer.hashicorp.com/terraform/install) release/checksum ki guidance dete hain. Aaj ka workspace binary 1.17.0 official SHA256SUMS se check kiya gaya. lab08 ka cached provider ho toh wahi dobara use hota hai; LAB20_PLUGIN_DIR se koi doosra pehle se bana provider mirror chun sakte ho. Warna Terraform init pinned public provider ko lab ki apni data directory mein laata hai. Yeh scripts koi system package install nahi karti.

**Is lab ke liye shared Moto start/reset mat karo.** lab.py aur metadata.py dono apna alag, thodi der ka 127.0.0.1 server start karte hain aur apna listener band karte hain. Har SDK/provider endpoint saaf likha hai, dummy keys, band profiles/session token/instance metadata aur lab ki apni config ke saath. load.py iski jagah in-process Moto interception use karta hai, jisme saare DNS/socket connects mana hain; us script ke service URLs virtual pehchaan hain, bahar jaane wali requests nahi. Koi script asli AWS tak nahi jaati, na ~/.aws mein likhti hai.

Chalane se pehle scripts padho. Sirf TEST data use hota hai; bahar ke emails/payments 0 rehte hain. Purani IDs, state, ledgers aur captures ignore hone wale .lab mein hain. Fail run ke baad khaali na ho toh state bachao; state delete karna cleanup nahi.

## ex1 — Terraform ke 18 scoped resources, phir drift dekho

lab.py yeh karta hai: format check → init → validate → saved plan → usi saved plan ka apply → asli outputs → dobara plan → API review/test → scoped destroy. Saaf local backend .lab/state.tfstate hai; saved-plan apply ka output chunne ke liye sirf custom plan -state flag par bharosa nahi kiya.

Asli safal taiyaari ka capture:

```text
Success! The configuration is valid.
Plan: 18 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 18 added, 0 changed, 0 destroyed.
REPEAT PLAN EXIT 2 known Moto OAC/default/JSON readback gaps; not a zero-drift claim
```

Resources: ek alag internal ALB/do subnets/VPC; private S3 bucket/BPA/OAC/CloudFront aur exact distribution policy; Regional CommonRuleSet/login-rate WAF association; Standard DLQ/do work queues; SNS alert topic/SQS alert sink/scoped queue policy/raw subscription. Koi application/listener deploy nahi hota. Yeh config ek alag practice exercise hai, deploy karne layak production commerce stack nahi.

👉 Dobara plan ka exit 2 jaan-boojh kar dikhaya gaya hai. Moto maanga OriginAccessControlId gira deta hai, purane forwarded/default viewer fields jod deta hai aur SQS redrive JSON ko alag tarah normalize karta hai. Zaroori OAC drift ko **saaf plan dikhane ke liye ignore nahi kiya**. OAC object aur exact SourceArn bucket policy bane rehte hain, par origin attachment missing hai, isliye chalte private CDN ka daava nahi. Yahi kami lab11 mein bhi likhi hai. Asli AWS mein OAC attach, deployed config aur asli signed-access tests chahiye.

## ex2 — CloudWatch protocol ki limit aur haath se notification channel

Aaj ke provider 6.70.0 ke CloudWatch CBOR requests/responses installed Moto 5.2.4 ke saath nahi chalte. Native alarm resource ke examples main.tf mein native_alarms=false ke peeche rakhe hain. Is emulator par flag on karne se raasta supported nahi ban jaata, sirf isliye ki HCL validate ho gaya.

Local script AWS ka supported Query protocol **sirf ek private SDK client ke in-memory service metadata mein** chunti hai, bina packages badle ya nakli safal response banaye. Asli PutMetricAlarm/DescribeAlarms/DeleteAlarms operations Moto ke supported Query endpoint se chalte hain. Do alarm records yeh use karte hain:

- ALB TargetResponseTime, p95, Seconds, threshold 0.4, 60s periods, 3 mein se 2, missing data=missing, kam sample count=ignore, exact ALB dimension.
- SQS ApproximateAgeOfOldestMessage, Maximum, 120s threshold, 2 mein se 2 periods, khaali/band queue par missing data=notBreaching. Chalte workflow ki telemetry liveness ka check alag hai.

Dono action lists asli apne SNS topic ko target karti hain. Moto StateValue OK deta hai, StateReason `Unchecked: Initial alarm creation` ke saath, jabki koi asli sample nahi. **Yeh healthy latency ka saboot nahi.** Native Terraform alarm lifecycle, apne aap evaluations, production percentile behaviour aur metric se chalne wala notification is environment mein check nahi hue.

Actual route check:

```text
CLOUDWATCH COMPATIBILITY PROTOCOL query; Terraform native alarms disabled due captured CBOR gap
MANUAL NOTIFICATION ROUTE VERIFIED SNS -> SQS TEST body; not metric-triggered paging
```

👉 Haath se publish ki READINESS_TEST body apne raw SQS alert sink tak pahunchti hai aur receive/acknowledge hoti hai. Isse sirf woh test kiya notification raasta prove hota hai, yeh nahi ki latency breach ne CloudWatch chalaya ya kisi insaan ko page kiya. Moto ki resource-policy enforcement ki kamiyan abhi bhi hain; policies saaf scoped hain, par IAM enforcement ka certificate ka daava nahi.

## ex3 — pehle se scaling, read replica aur consumer budgets

metadata.py ka apna alag loopback server aur phenkne layak capacity fixtures hain. Pakde gaye assertions:

```text
PASS 1 current ASG scale metadata12instances; no boot/runtime timing
PASS 2 future scheduled down action does not immediately scale down
PASS 3 recurring five-field schedule accepted; inspect timezone readback
PASS 4 replica source/private/available metadata; no SQL/lag proof
PASS 5 primary HA/backup metadata preserved
MAPPING SCALING READBACK {"State":"Enabled","ScalingConfig":{"MaximumConcurrency":20},"FunctionResponseTypes":["ReportBatchItemFailures"],"BatchSize":10}
PASS 6 function reserved capacity20 readback, not provisioned warm environments
BEHAVIOR CHECKS 6
PASS 7 owned function/DB/group/queues cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

👉 Aaj ke ASG ke 12 instances, aage ke do scheduled actions se alag hain. Recurring ASG **paanch field** wala cron aur saaf Asia/Kolkata timezone use karta hai; EventBridge Scheduler ka chhe field wala cron alag API hai. Save hue actions timer chalna, app boot, cache warmup ya healthy requests nahi dikhate.

Postgres source aam, phenkne layak TEST master credentials use karta hai, private/Multi-AZ/saat din backup ke metadata ke saath. Yeh unsupported PostgreSQL managed-master-secret/read-replica combination use nahi karta. Replica availability Moto ka metadata hai, SQL read routing/replication/lag ka naap nahi. AWS par replica banne mein asli time lagta hai.

Function ki reserved concurrency 20 aur SQS mapping ki MaximumConcurrency 20 alag-alag limits hain. Koi Lambda nahi chalta; queue khaali rehti hai. Reserved concurrency environments ko pehle se garam nahi karti. Production ko regional/function/downstream budgets, asli mapping state, partial-batch behaviour, throttle/queue-age monitoring aur naapa runtime chahiye. Provisioned SQS poller mode ke niyam/kharcha alag hain aur yahan on nahi.

## ex4 — asli 10,000 unique TEST intents, 1 vs 5 business workers

load.py har scenario ke liye 10 windows chalata hai, har window mein 1000 unique messages + 10 jaan-boojh kar duplicates. Har scenario ka total: 10,000 unique event IDs, 100 jaan-boojh kar duplicate copies. SQLite ledger windows ke paar durable rehta hai; saari expected IDs exact check hoti hain. Message acknowledgement durable PENDING_DISPATCH intent banne ke baad hota hai, **asli email bhejne ke baad nahi**.

Run har message par 2ms ka nakli business kaam bataata hai. Socket/DNS connects mana hain, aur Moto SDK operations ko in-process pakadta hai. Sirf emulator API calls ek-ek karke chalti hain, taaki Moto ka dekha gaya concurrent pending-set iteration crash na ho; business kaam concurrent hi rehta hai. Asli Standard-queue redelivery allowed hai: receives publishes se zyada ho sakte hain, par unique intents expected IDs se na zyada ho sakte, na kam. Script acknowledgement counts, duplicates ka hisaab, exact durable IDs aur control kiya local visible/inflight khaali state check karti hai. Production mein sirf SQS ke approximate counters business ke poore hone ka saboot nahi.

Naapa hua exact repository replay (2026-10-27), isi guarded tareeke se:

| Business workers | Unique intents | Publish hui copies | Receive/acknowledge hui copies | Drain windows ka jod | Unique intents/drain-second |
|---|---:|---:|---:|---:|---:|
| 1 | 10000 | 10100 | 10100 | 173.523 s | 57.63 |
| 5 | 10000 | 10100 | 10100 | 162.705 s | 61.46 |

```text
MEASURED WORKLOAD COMPLETE
IN-PROCESS OWNED QUEUES EMPTY / NETWORK FORBIDDEN
```

👉 Dono scenarios ne 10,000 unique TEST intents save kiye aur 100 duplicate intents roke; bahar ke emails 0. Naapa time host ke load ke saath badalta hai. Is capture mein paanch workers ne lagbhag 1.07× throughput diya, **5× nahi**. Emulator API ka ek-ek karke chalna, Python/SQLite ka overhead aur bataya kaam ka delay is test ko limit karte hain. Yeh host/Moto ke naap hain, EC2/Lambda/SQS production capacity ki rating nahi. Drain windows ke jod mein publishing ka time nahi gina gaya, aur yeh end-to-end wall time nahi.

**Scope correction:** pehle ke poore 10k HTTP-server burst ne 10100 copies publish ki, par 770 durable intents ke baad 180s drain deadline par atak gaya. Aakhri limit-window test us pehle 10k burst ko poora karne ka daava nahi karta. Timeout ya consumers badha kar missing kaam chhupana nahi chahiye. Fail receive-equality aur concurrent-set probes taiyaari ke saboot ke roop mein rakhe gaye hain; aakhri test sahi redelivery maanta hai aur emulator ki limit bachata hai.

## Cleanup and recovery

Terraform script apne do Query alarm records delete karti hai, phir sirf apne track kiye 18 resources destroy karti hai. Safal capture:

```text
Destroy complete! Resources: 18 destroyed.
OWNED TERRAFORM STATE EMPTY True
OWNED MOTO STOPPED / LISTENER CLOSED
```

metadata.py sirf apna function/mapping/queue/role, replica/source/subnet group, ASG/template/subnets/VPC delete karta hai, phir listener band karta hai. load.py mock/network-mana context chhodne se pehle apni dono virtual queues delete karta hai; purana SQLite saboot local rehta hai. Shared server reset, anjaana delete, asli AWS, Docker ya system install nahi.

Apna server/script fail ho toh .lab bachao aur recovery se pehle print hua error/state/endpoint dekho. Apna thodi der ka listener finally mein band hota hai. Saved state ko doosre endpoint/account par mat bhejo, na shared reset use karo. Ek fail taiyaari wala state-path probe archive kiya gaya; baad ke saaf-backend runs ne asli 18-resource destruction check kiya, sirf kisi anjaane khaali path ko nahi.

Primary references: [ASG schedules](https://docs.aws.amazon.com/autoscaling/ec2/userguide/scheduled-scaling-create-scheduled-action.html), [warmup](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-default-instance-warmup.html), [RDS read replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html), [SQS mapping concurrency](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html), [percentile low samples](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/percentiles-with-low-samples.html), [missing data](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html), [AWS protocol support](https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/CLIENTS.md).
