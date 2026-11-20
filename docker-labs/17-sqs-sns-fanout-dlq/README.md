# Lab17 — SNS fan-out, SQS retries aur durable intent

**Pain:** ShopKaro checkout email provider ka wait karta hai. Async delivery se checkout jaldi acknowledge hota hai, lekin retries duplicate email bana sakti hain. Queue acknowledgement aur business completion alag contracts hain.

## Setup — apna emulator, shared reset nahi

```bash
cd aws-gurukul/docker-labs
source env.sh
cd 17-sqs-sns-fanout-dlq
../.venv/bin/python -I lab.py
```

Pehle se bana Moto 5.2.4/boto3/awscli venv use hota hai. Script apna `ThreadedMotoServer` loopback 127.0.0.1 par OS ke diye port par start karta hai. Har CLI/SDK call wahi saaf endpoint, test/test keys, ap-south-1 aur lab ki apni `.lab/credentials`/`.lab/config` use karti hai. Profiles/session token unset; metadata band. Shared 4566 start/reset karne ki zaroorat nahi. Script sirf run ke prefix wale fixtures banata hai aur `finally` mein apna server band karta hai. Docker, asli AWS ya bahar ki email service use nahi hoti.

## ex1 — policy bug ko emulator se alag pehchano

`lab.py` ek Standard topic, do Standard queues, ek DLQ aur raw subscriptions banata hai. Pehla publish jaan-boojh kar **bina queue policy** ke hai. Pakda output:

```json
POLICY PROBE {"receivedWithoutQueuePolicy":[1,1],"motoGapIfNonzero":true}
```

👉 Moto ne phir bhi deliver kar diya. Asli SNS ko destination SQS par resource-policy permission chahiye. `Publish` ka MessageId sirf yeh prove karta hai ki SNS ne maan liya, queue tak delivery nahi. Simulator permission laagu karta hai; yeh Moto result **authorization ka saboot nahi**. Asli exercise se pehle script sirf apni taazi probe queues purge karta hai.

Ab `policy()` aur print hue commands padho. Har queue ko `Principal.Service=sns.amazonaws.com`, `Action=sqs:SendMessage`, exact queue ARN aur exact topic ke liye `ArnEquals aws:SourceArn` milta hai. Producer ka IAM `sns:Publish` alag hai; customer-managed KMS encryption key permissions bhi jodta hai. Chauda `Principal:*` zaroori nahi.

## ex2 — body filters aur har consumer ke alag intents

`set-subscription-attributes` calls padho: `RawMessageDelivery=true`, `FilterPolicyScope=MessageBody`, `FilterPolicy={"type":["OrderPlaced"]}`. `OrderCancelled` se koi queue delivery nahi hoti. Do ek jaise `OrderPlaced` publishes jaan-boojh kar duplicate business input daalte hain.

```json
DURABLE INTENTS {"received":{"email":2,"invoice":2},"outboxRows":2,"created":2,"duplicate":2,"externalEmailsSent":0}
```

👉 Har consumer ko dono copies milti hain. `outbox()` **consumer#eventId** key wala DynamoDB conditional intent likhta hai; email ka dedup invoice ka kaam nahi rokna chahiye. Duplicate tabhi acknowledge hota hai jab strong read se poora purana intent match ho jaaye. Usi eventId par alag payload `IdempotencyConflict` deta hai; uske baad na acknowledgement hota hai, na overwrite.

Reference ek **durable pending-dispatch intent** banata hai, email nahi. Alag dispatcher ko provider ki idempotency key use karni hogi, ya bahar ke saaf na hue results ka milaan karna hoga. Simple "pehle dedup row likho, phir email bhejo" crash ke baad kaam kho sakta hai; "pehle email bhejo, phir dedup row likho" do baar bhej sakta hai. Business DB updates + event publication ke liye transactional outbox ya koi aur review kiya atomicity design chahiye. Exactly-once email ka koi daava nahi.

## ex3 — asli poison message DLQ mein jaata hai

Script asli total 499 wale eventId ke saath hi alag total 0 bhejta hai. Source par `RedrivePolicy.maxReceiveCount=3` hai. Har jaan-boojh kar failure `VisibilityTimeout=0` use karta hai taaki is local exercise mein turant retry ho; production mein slow kaam ke liye zero timeout use nahi karte.

Pakda hua hissa (bani sender IDs/timestamps hataye gaye):

```json
{"sourceReceiveCounts":["1","2","3"],"dlqBody":{"type":"OrderPlaced","eventId":"evt-101","orderId":"order-101","total":0},"outboxUnchanged":true}
```

👉 Asli body dekho, producer/consumer theek karo, phir redrive review karo. Sirf queue depth zero karne ke liye poison message delete karna event kho deta hai. Source processing DLQ, **SNS delivery failure** wale subscription DLQ se alag hai. DLQ ki retention 7 din vs source ka default 4 din. Standard message ki expiry asli enqueue age se chalti hai; FIFO DLQ mein jaane par enqueue timestamp reset hota hai. DLQs FIFO ka business order tod sakte hain.

## ex4 — FIFO group ka rukna, dedup ki limit aur SNS FIFO

Print hua asli CLI customer-a mein A1, duplicate A1, A2 aur customer-b mein B1 bhejta hai. Capture:

```json
FIFO INFLIGHT {"first":["evt-a1"],"otherGroupsWhileAInFlight":["evt-b1"]}
MOTO GAP {"dedupAfterDeleteBroken":true,"awsContract":"same dedup ID suppressed for five minutes even after delete"}
SNS FIFO SUBSCRIBERS {"fifo":["fifo-fanout"],"standard":["fifo-fanout","fifo-fanout"]}
STANDARD GROUP PROBE {"received":["fair-probe"],"scope":"acceptance only, not fair-queue scheduling measurement"}
BEHAVIOR CHECKS 17
```

👉 Jab tak A1 in flight hai, A2 wait karta hai; B1 aage badh sakta hai. Pehla duplicate A1 rok diya jaata hai. Moto DeleteMessage ke baad dedup record kho deta hai: AWS delete ke baad bhi paanch minute tak dedup ID rakhta hai. Simulator AWS ka contract test karta hai. Acknowledgement se pehle asli consumer crash ho toh business kaam phir bhi dohraaya ja sakta hai.

Aaj ka SNS FIFO **SQS FIFO aur Standard dono** subscribers support karta hai. Standard mein best-effort order/at-least-once hi rehta hai; is Moto run ne do Standard copies deliver ki. Is emulator se SNS dedup ka sahi hona mat maano. Standard SQS **fair queues** ke liye MessageGroupId maanta hai, bina FIFO bane; probe sirf maanna check karta hai, tenant scheduling ya fair-queue request ka extra charge nahi.

## Cleanup — apne aap aur scoped

Aakhir mein exact apni subscriptions unsubscribe hoti hain, exact topics/queues/table delete hote hain, khaali apne server ko query kiya jaata hai, phir sirf wahi server rokta hai aur listener band hua ya nahi, check karta hai. `.lab/last-run.json` mein endpoint, cleanup samet 18 checks, aur run mein bani IDs likhi hoti hain. Us ledger ki IDs purani hain, bache hue resources nahi.

```text
OWNED RESOURCES {"queues": [], "topics": [], "tables": []}
OWNED MOTO STOPPED / LISTENER CLOSED
```

Beech mein ruka run aakhri lines chhod sakta hai. Naya alag process chalane ke liye script dobara chalao; shared reset nahi chahiye. Process khatam hone par OS yeh phenkne layak server band kar deta hai.

## Limits aur production mein aage ka kaam

Moto ka policy enforcement aur delete ke baad dedup, upar ke capture jaise alag hain. AWS latency, retry ka time, fair scheduling, quotas, encryption enforcement, cross-account IAM, Lambda invocation, bahar ki email ya production FIFO/SNS dedup ka sahi hona nahi naapa gaya. Local receive ka order ek fixture hai, Standard-queue ke order ki guarantee nahi. App ka simulator achhe diagnostics ke liye purani/expired receipts ko strictly reject karta hai; asli DeleteMessage purani receipt par 200 de sakta hai bina message delete kiye. Hamesha latest receipt use karo aur durable effects check karo. Model mein queue-attribute ke badlav turant hote hain; AWS mein zyaadatar settings ko 60 second tak aur retention ko 15 minute tak lag sakte hain. Filter updates local mein turant lagte hain; AWS mein 15 minute tak lag sakte hain.

Asli SQS ke defaults 1 MiB messages allow karte hain. SNS ka default 256 KiB ab topic ke `MaximumMessageSize` se supported endpoint configs ke liye 1 MiB tak badhaya ja sakta hai; endpoint/subscription ki rokein check karo. Bade payloads ke liye S3 claim-check aksar behtar hai. Body filters par scan hue bytes ka bill lagta hai; attribute filtering free hai. SNS/SQS payload chunks, retries, polls, KMS aur transfer asli bill par asar daalte hain.

Primary references: [SQS DLQ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html), [FIFO dedup](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html), [SNS queue policy](https://docs.aws.amazon.com/sns/latest/dg/sns-access-policy-use-cases.html), [SNS FIFO delivery](https://docs.aws.amazon.com/sns/latest/dg/fifo-message-delivery.html), [SNS payload limits](https://docs.aws.amazon.com/sns/latest/dg/large-message-payloads.html), [filter propagation](https://docs.aws.amazon.com/sns/latest/dg/sns-subscription-filter-policies.html).
