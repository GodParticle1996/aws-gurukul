# Lab17 — SNS fan-out, SQS retries aur durable intent

**Pain:** ShopKaro checkout email provider ka wait karta hai. Async delivery se checkout jaldi acknowledge hota hai, lekin retries duplicate email bana sakti hain. Queue acknowledgement aur business completion alag contracts hain.

## Setup — owned emulator, no shared reset

```bash
cd aws-gurukul/docker-labs
source env.sh
cd 17-sqs-sns-fanout-dlq
../.venv/bin/python -I lab.py
```

Existing Moto5.2.4/boto3/awscli venv use hota hai. Script apna `ThreadedMotoServer` loopback127.0.0.1 par OS-assigned port par start karta hai. Every CLI/SDK call uses that explicit endpoint, test/test keys, ap-south-1 and lab-local `.lab/credentials`/`.lab/config`. Profiles/session token unset; metadata disabled. Shared4566 start/reset karne ki zaroorat nahi. Script creates only run-prefixed fixtures and closes its own server in `finally`. No Docker, real AWS or external email service is used.

## ex1 — policy bug ko emulator se alag pehchano

`lab.py` creates a Standard topic, two Standard queues, one DLQ and raw subscriptions. First publish deliberately has **no queue policy**. Captured output:

```json
POLICY PROBE {"receivedWithoutQueuePolicy":[1,1],"motoGapIfNonzero":true}
```

👉 Moto delivered anyway. Real SNS needs destination SQS resource-policy permission. `Publish` MessageId proves acceptance by SNS, not delivery to a queue. Simulator enforces permission; this Moto result is **not authorization proof**. Script purges only these freshly owned probe queues before the real exercise.

Next read `policy()` and the printed commands. Each queue gets `Principal.Service=sns.amazonaws.com`, `Action=sqs:SendMessage`, exact queue ARN and `ArnEquals aws:SourceArn` for the exact topic. Producer IAM `sns:Publish` is separate; customer-managed KMS encryption adds key permissions. Broad `Principal:*` is unnecessary.

## ex2 — body filters and independent consumer intents

Read `set-subscription-attributes` calls: `RawMessageDelivery=true`, `FilterPolicyScope=MessageBody`, `FilterPolicy={"type":["OrderPlaced"]}`. `OrderCancelled` produces no queue deliveries. Two identical `OrderPlaced` publishes intentionally inject duplicate business input.

```json
DURABLE INTENTS {"received":{"email":2,"invoice":2},"outboxRows":2,"created":2,"duplicate":2,"externalEmailsSent":0}
```

👉 Each consumer receives both copies. `outbox()` writes a DynamoDB conditional intent keyed by **consumer#eventId**; email dedup must not suppress invoice work. A duplicate is acknowledged only after a strong read verifies the full existing intent matches. Different payload under the same eventId raises `IdempotencyConflict`; no acknowledgement or overwrite follows.

The reference creates a **durable pending-dispatch intent**, not an email. A separate dispatcher must use a provider idempotency key or reconcile ambiguous external outcomes. A simple “write dedup row, then send email” can lose work after a crash; “send email, then write dedup row” can send twice. Business DB updates plus event publication need a transactional outbox or another reviewed atomicity design. No exactly-once email claim is made.

## ex3 — actual poison message moves to DLQ

Script sends a conflicting total0 with the same eventId as the original total499. Source has `RedrivePolicy.maxReceiveCount=3`. Each deliberate failure uses `VisibilityTimeout=0` to retry immediately in this local exercise; production does not use a zero timeout for slow work.

Captured selection (generated sender IDs/timestamps omitted):

```json
{"sourceReceiveCounts":["1","2","3"],"dlqBody":{"type":"OrderPlaced","eventId":"evt-101","orderId":"order-101","total":0},"outboxUnchanged":true}
```

👉 Inspect the actual body, repair the producer/consumer, then review redrive. Deleting a poison message only to make queue depth zero loses the event. Source processing DLQ differs from a subscription DLQ for **SNS delivery failure**. DLQ retention is7days versus source default4days. Standard message expiration uses original enqueue age; FIFO DLQ movement resets enqueue timestamp. DLQs can break FIFO business order.

## ex4 — FIFO group blocking, dedup boundary and SNS FIFO

Printed real CLI sends A1, duplicate A1, A2 in customer-a and B1 in customer-b. Capture:

```json
FIFO INFLIGHT {"first":["evt-a1"],"otherGroupsWhileAInFlight":["evt-b1"]}
MOTO GAP {"dedupAfterDeleteBroken":true,"awsContract":"same dedup ID suppressed for five minutes even after delete"}
SNS FIFO SUBSCRIBERS {"fifo":["fifo-fanout"],"standard":["fifo-fanout","fifo-fanout"]}
STANDARD GROUP PROBE {"received":["fair-probe"],"scope":"acceptance only, not fair-queue scheduling measurement"}
BEHAVIOR CHECKS 17
```

👉 A2 waits while A1 is in flight; B1 can proceed. Initial duplicate A1 is suppressed. Moto loses the dedup record after DeleteMessage: AWS retains the dedup ID for the five-minute interval even after deletion. The simulator tests the AWS contract. A real consumer crash before acknowledgement can still repeat business work.

Current SNS FIFO supports **both SQS FIFO and Standard** subscribers. Standard retains best-effort order/at-least-once semantics; this Moto run delivered two Standard copies. Do not infer SNS dedup conformance from this emulator. Standard SQS accepts MessageGroupId for **fair queues**, without becoming FIFO; the probe checks acceptance only, not tenant scheduling or the additional fair-queue request charge.

## Cleanup — automatic and scoped

Finally unsubscribes exact owned subscriptions, deletes exact topics/queues/table, queries the empty owned server, then stops only that server and verifies its listener is closed. `.lab/last-run.json` records endpoint,18 checks including cleanup, and the IDs created by the run. IDs in that ledger are historical, not leftover resources.

```text
OWNED RESOURCES {"queues": [], "topics": [], "tables": []}
OWNED MOTO STOPPED / LISTENER CLOSED
```

An interrupted run may omit the final lines. Re-run the script to exercise a new independent process; no shared reset is needed. The OS closes this disposable server when its process exits.

## Limits and production follow-ups

Moto policy enforcement and dedup-after-delete diverge as captured above. No AWS latency, retry duration, fair scheduling, quotas, encryption enforcement, cross-account IAM, Lambda invocation, external email or production FIFO/SNS dedup conformance is measured. Local receive ordering is a fixture, not a Standard-queue ordering guarantee. The in-app simulator strictly rejects stale/expired receipts for useful diagnostics; real DeleteMessage can return200 for an old receipt without deleting the message. Always use the latest receipt and verify durable effects. Queue-attribute changes are immediate in the model; AWS propagation can take up to60seconds for most settings and15minutes for retention. Filter updates apply immediately locally; AWS propagation can take up to15minutes.

Real SQS defaults allow1MiB messages. SNS default256KiB can now be raised with topic `MaximumMessageSize` up to1MiB for supported endpoint configurations; check endpoint/subscription restrictions. Large payloads often fit S3 claim-check better. Body filters are billed for scanned bytes; attribute filtering is free. SNS/SQS payload chunks, retries, polls, KMS and transfer affect actual bills.

Primary references: [SQS DLQ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html), [FIFO dedup](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html), [SNS queue policy](https://docs.aws.amazon.com/sns/latest/dg/sns-access-policy-use-cases.html), [SNS FIFO delivery](https://docs.aws.amazon.com/sns/latest/dg/fifo-message-delivery.html), [SNS payload limits](https://docs.aws.amazon.com/sns/latest/dg/large-message-payloads.html), [filter propagation](https://docs.aws.amazon.com/sns/latest/dg/sns-subscription-filter-policies.html).
