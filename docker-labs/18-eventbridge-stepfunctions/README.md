# Lab18 — routing, schedules aur compensation ka asli saboot

**Pain:** ShopKaro ke refund workflow mein captured payment aur fail stock reservation ke beech recovery ki kami hai. Raat ki report ko bhi saaf timezone aur delivery permissions chahiye. Mani hui API calls, config aur poora hua business kaam, teeno alag saboot hain.

## Setup — pehle se bana venv, apne thodi der ke servers

```bash
cd aws-gurukul/docker-labs
source env.sh
cd 18-eventbridge-stepfunctions
../.venv/bin/python -I metadata.py
../.venv/bin/python -I test_saga.py
```

Har script apna alag `ThreadedMotoServer` 127.0.0.1 par OS ke diye port par start karti hai. Har CLI/SDK call saaf taur par wahi endpoint, dummy test/test keys, ap-south-1 aur lab ki apni credential/config paths use karti hai. Profiles/session token unset; instance metadata band. Shared 4566 start/reset, Docker, asli AWS, package install ya bahar ka payment call nahi. `finally` sirf banaye resources delete karta hai aur sirf wahi server band karta hai; listener band hua ya nahi, check hota hai.

## ex1 — Classic rules: operators aur asli target delivery

`metadata.py` mein `pattern`, `variants` aur print hue commands padho. Yeh lab **default/Custom Event Bus ke Classic rules aur targets** use karti hai, naye Custom Event Bus subscriber APIs nahi. Dono products available hain; APIs, retry defaults, ordering/retention aur billing alag hain.

Pattern ko chahiye: source shop.orders, detail-type RefundRequested, numeric amount >1000, currency INR, customerId ka prefix customer-, environment test ke alawa koi bhi, aur debugToken na ho. Test variants mein amount 1000, string amount "2500", galat prefix, test environment, debugToken=false aur debugToken=null hain.

Actual captured output:

```json
PATTERN PROBE {"case":"match","expected":true,"actual":{}}
MOTO GAP TestEventPattern has no modeled Result; actual routing tested separately
POLICY PROBE {"withoutQueuePolicy":1,"motoGapIfNonzero":true}
ACTUAL ROUTING {"count":1,"details":[{"orderId":"order-101","amount":2500,"currency":"INR","customerId":"customer-101","environment":"prod"}]}
```

👉 Moto 5.2.4 `test-event-pattern` khaali safal response deta hai; Result bana hi nahi hai. `{}` ko matched pattern mat samjho. Saato variants publish karne ke baad asli SQS bodies se prove hota hai ki sirf sahi variant route hua. Missing aur null alag hain; numeric matching string "2500" ko number nahi banati.

Apni queue par pehla publish jaan-boojh kar bina queue policy ke hai: Moto ne phir bhi deliver kar diya. Script sirf apni taazi probe queue purge karti hai, phir exact rule SourceArn ke saath chhoti events.amazonaws.com SendMessage policy save karti hai. Policy readback check hota hai; **Moto ki delivery authorization ka saboot nahi**. Aaj ke Classic Lambda/SNS/SQS targets execution role ya resource policy use kar sakte hain; yeh lab resource-policy wala raasta dikhati hai.

Target metadata readback mein RetryPolicy MaximumRetryAttempts 3, MaximumEventAgeInSeconds 3600 aur ek Standard SQS queue ka DeadLetterConfig aata hai. Classic retry hone layak delivery ke defaults 24 ghante/185 retries tak hain; permanent missing-permission/resource errors seedhe set kiye DLQ mein ja sakte hain. Na policy readback, na yeh local turant route, retry timing ya DLQ runtime prove karta hai. PutEvents maan liya gaya ho tab bhi har entry ka failure dekhna padta hai; yeh target/business ka poora hona nahi.

## ex2 — Scheduler timezone, group trust aur Lambda permission

Output mein exact `create-schedule` call padho:

```text
ScheduleExpression: cron(0 3 * * ? *)
ScheduleExpressionTimezone: Asia/Kolkata
FlexibleTimeWindow: {"Mode":"OFF"}
State: ENABLED
```

Yeh fields pakde gaye GetSchedule JSON mein se chune gaye hain. Target ke paas saaf execution RoleArn, input, retry budget aur DLQ hai. Role trust wapas padha jaata hai aur **schedule-group ARN** tak scoped hai, ek schedule ARN tak nahi. Role permissions sirf target queue aur DLQ ka naam leti hain.

👉 Scheduler purane scheduled rules se alag hai. Chhe field wala cron 3AM yahan Asia/Kolkata mein samjha jaata hai. OFF flexible window ka matlab second tak ki precision nahi: Scheduler 60 second ki precision se chalata hai. Yeh Moto metadata lab asli scheduled invocation, timezone ka badlav, retry timer ya IAM enforcement nahi naapti.

Script apna Lambda zip/config bhi banati hai, exact rule SourceArn tak scoped events.amazonaws.com lambda:InvokeFunction permission jodti hai, aur bani policy padhti hai. Koi Lambda chalaya ya chalne wale target ke roop mein joda nahi jaata; Docker/runtime execution check nahi hua. Config aur permission ka metadata triage ke sawaal ka jawaab deta hai, bina yeh dikhawa kiye ki function chala.

## ex3 — Step Functions ki default Moto history nakli hai

Script is run ke naam se ek asli Choice/Pass state machine save karti hai. Definition VerifyStock se shuru hoti hai aur RecordRefund ya Ready par branch karti hai. DescribeStateMachine maangi gayi definition wapas deta hai. StartExecution ke input mein stockAvailable=false hai.

Captured result:

```json
SFN METADATA PROBE {"status":"RUNNING","output":null,"stateEnteredNames":["A State"],"scope":"default backend does not execute requested ASL; optional parser dependency unavailable"}
BEHAVIOR CHECKS 8
```

👉 Maange gaye states us default history mein kabhi nahi aate. GetExecutionHistory ka nakli ExecutionSucceeded event yeh prove nahi kar sakta ki workflow poora hua, jab DescribeExecution abhi bhi RUNNING bolta hai. Is installed environment mein Moto ka optional ASL parser import fail hota hai, kyunki `localstack` missing hai. Lab woh dependency install nahi karti, na parser on karti hai. **Asli Step Functions ASL execution ya Catch path ka koi daava nahi.**

## ex4 — DynamoDB state aur restart recovery ke saath asli host saga

`saga.py` padho, phir `test_saga.py`. Host reference apne alag Moto server mein asli DynamoDB conditional/transaction operations use karta hai. Payment saaf taur par ek **TEST ledger** hai, bahar ka gateway nahi.

1. Order ki stable pehchaan aur payload save/check karo. NEW→CAPTURED test capture counter ko ek baar badhata hai.
2. Inventory reserve karo aur READY phase/counter **ek hi TransactWriteItems** operation mein likho. Stock ki condition reject ho toh dono operations wapas ho jaate hain.
3. Stock na ho toh CAPTURED→REFUNDED test ledger ko ek baar update karta hai. Refund ka outage CAPTURED ko monitored recovery ke liye adhoora chhodta hai.
4. Rukawat ke baad wahi order dobara try karo. READY/REFUNDED durable results hain, isliye replay dobara capture, reserve ya refund nahi karta. Alag amount/pehchaan purane ko overwrite kiye bina reject hoti hai.

Actual capture:

```json
{"captureResume":"REFUNDED","checks":32,"externalPayments":0,"failed":{"captures":1,"phase":"REFUNDED","refunds":1},"ready":{"captures":1,"phase":"READY","reserves":1},"refundOutageRecovery":"REFUNDED","reserveResumeCount":1,"scope":"host reference + actual local DynamoDB; not Step Functions ASL runtime"}
OWNED TABLES []
OWNED MOTO STOPPED / LISTENER CLOSED
```

👉 32 behaviour checks yeh cover karte hain: stock ki kami/asli stock ka bachna, baar-baar refund/ready orders, capture ke baad rukawat, atomic reserve ke baad rukawat, refund outage/recovery, alag payload aur galat input. Alag cleanup assertion se 33 checks bante hain. Test payment fields kabhi bank/provider ko call nahi karte. Asli payment ko local DynamoDB transaction mein atomically nahi joda ja sakta: provider ki idempotency keys, saaf pending states, milaan aur monitored recovery use karo. Compensation fail ho sakta hai ya uska kharcha ho sakta hai; saga koi chhupa global rollback nahi.

Host reference ASL interpreter nahi, na installed Moto Step Functions runtime. Production ki seekh hai: stable business pehchaan aur durable phases dobara use karo. Asli workflow execution, bahar ke provider ka saaf jawaab na aana, distributed load/concurrency, IAM/KMS/network enforcement aur failure timing ke liye alag runtime tests chahiye.

## Cleanup and evidence

Metadata run: 8 behaviour checks + cleanup 9. Host saga: 32 + cleanup 33. Dono scripts apna endpoint/band listener ka status aur bani IDs ignore hone wale `.lab/` mein likhti hain. Bani IDs ki lists purane ledgers hain, bache hue resources nahi.

```text
OWNED RESOURCES {"queues": [], "rules": [], "schedules": [], "groups": [{"Arn": "arn:aws:scheduler:ap-south-1:123456789012:schedule-group/default", "Name": "default", "State": "ACTIVE"}], "machines": [], "roles": [], "functions": []}
OWNED MOTO STOPPED / LISTENER CLOSED
```

Default schedule group Moto ka built-in marker hai; run ka banaya group delete hota hai. In apne phenkne layak processes mein koi shared ya user resource nahi tha. CLI requests apne asli bane endpoint/resource names print karti hain; koi expected result banaya nahi gaya.

Primary references: [Classic/default bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html), [new Custom Event Bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html), [target permission paths](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html), [Classic retry](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html), [delivery DLQ](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html), [Scheduler timezones/precision](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html), [Scheduler group trust](https://docs.aws.amazon.com/scheduler/latest/UserGuide/cross-service-confused-deputy-prevention.html), [Standard/Express semantics](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html).
