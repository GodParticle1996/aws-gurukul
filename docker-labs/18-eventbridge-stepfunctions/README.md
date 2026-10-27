# Lab18 — routing, schedules aur compensation ka actual proof

**Pain:** ShopKaro refund workflow mein captured payment aur failed stock reservation ke beech recovery gap hai. A nightly report also needs an explicit timezone and delivery permissions. Accepted API calls, configuration and completed business work are different proofs.

## Setup — existing venv, owned ephemeral servers

```bash
cd aws-gurukul/docker-labs
source env.sh
cd 18-eventbridge-stepfunctions
../.venv/bin/python -I metadata.py
../.venv/bin/python -I test_saga.py
```

Each script starts a separate owned `ThreadedMotoServer` on127.0.0.1 at an OS-assigned port. Every CLI/SDK call explicitly pins that endpoint, dummy test/test keys, ap-south-1 and lab-local credential/config paths. Profiles/session token unset; instance metadata disabled. No shared4566 start/reset, Docker, real AWS, package install or external payment call. `finally` deletes only created resources and closes only that server; listener closure is checked.

## ex1 — Classic rules: operators and actual target delivery

Read `pattern`, `variants` and the printed commands in `metadata.py`. This lab uses **default/Custom Event Bus–Classic rules and targets**, not the newer Custom Event Bus subscriber APIs. Both products remain available; APIs, retry defaults, ordering/retention and billing differ.

Pattern requires source shop.orders, detail-type RefundRequested, numeric amount >1000, currency INR, customerId prefix customer-, environment other than test, and absent debugToken. Test variants include amount1000, string amount"2500", wrong prefix, test environment, debugToken=false and debugToken=null.

Actual captured output:

```json
PATTERN PROBE {"case":"match","expected":true,"actual":{}}
MOTO GAP TestEventPattern has no modeled Result; actual routing tested separately
POLICY PROBE {"withoutQueuePolicy":1,"motoGapIfNonzero":true}
ACTUAL ROUTING {"count":1,"details":[{"orderId":"order-101","amount":2500,"currency":"INR","customerId":"customer-101","environment":"prod"}]}
```

👉 Moto5.2.4 `test-event-pattern` returns an empty successful response; it does not implement the Result. Do not treat `{}` as a matched pattern. After publishing all seven variants, actual SQS bodies prove only the valid variant routed. Missing and null are different; numeric matching does not coerce string"2500" into a number.

The first own-queue publish intentionally omits queue policy: Moto delivered anyway. Script purges only its fresh probe queue, then stores a narrow events.amazonaws.com SendMessage policy with exact rule SourceArn. Policy readback is verified; **Moto delivery is not authorization proof**. Current Classic Lambda/SNS/SQS targets can use an execution role or resource policy; this lab demonstrates the resource-policy path.

Target metadata readback includes RetryPolicy MaximumRetryAttempts3, MaximumEventAgeInSeconds3600 and DeadLetterConfig for a Standard SQS queue. Classic retriable-delivery defaults are24hours/up to185retries; permanent missing-permission/resource errors can go directly to a configured DLQ. Neither policy readback nor this local immediate route proves retry timing or DLQ runtime. PutEvents acceptance also needs per-entry failure inspection; it is not target/business completion.

## ex2 — Scheduler timezone, group trust and Lambda permission

Read the exact `create-schedule` call in output:

```text
ScheduleExpression: cron(0 3 * * ? *)
ScheduleExpressionTimezone: Asia/Kolkata
FlexibleTimeWindow: {"Mode":"OFF"}
State: ENABLED
```

These fields are a selection from the captured GetSchedule JSON. The target has an explicit execution RoleArn, input, retry budget and DLQ. Role trust is read back and scoped to the **schedule-group ARN**, not an individual schedule ARN. Role permissions name only the target queue and DLQ.

👉 Scheduler is separate from legacy scheduled rules. Six-field cron3AM is interpreted in Asia/Kolkata here. OFF flexible window does not mean second-level precision: Scheduler invokes with60-second precision. No actual scheduled invocation, timezone transition, retry timer or IAM enforcement is measured by this Moto metadata lab.

The script also creates an own Lambda zip/configuration, adds events.amazonaws.com lambda:InvokeFunction permission scoped to the exact rule SourceArn, and reads the resulting policy. No Lambda is invoked or attached as an executing target; Docker/runtime execution remains unverified. Configuration and permission metadata answer the triage question without pretending the function ran.

## ex3 — Step Functions default Moto history is synthetic

Script stores a real Choice/Pass state machine named for this run. Definition starts at VerifyStock and branches to RecordRefund or Ready. DescribeStateMachine round-trips the requested definition. StartExecution input has stockAvailable=false.

Captured result:

```json
SFN METADATA PROBE {"status":"RUNNING","output":null,"stateEnteredNames":["A State"],"scope":"default backend does not execute requested ASL; optional parser dependency unavailable"}
BEHAVIOR CHECKS 8
```

👉 Requested states never appear in that default history. A synthetic ExecutionSucceeded event in GetExecutionHistory cannot prove the requested workflow completed when DescribeExecution still says RUNNING. Moto's optional ASL parser import fails in this installed environment because `localstack` is missing. The lab does not install that dependency or enable the parser. **No actual Step Functions ASL execution or Catch path is claimed.**

## ex4 — actual host saga with DynamoDB state and restart recovery

Read `saga.py`, then `test_saga.py`. The host reference uses actual DynamoDB conditional/transaction operations in its own separate Moto server. Payment is explicitly a **TEST ledger**, not an external gateway.

1. Persist/verify stable order identity and payload. NEW→CAPTURED increments a test capture counter once.
2. Reserve inventory and write READY phase/counter in **one TransactWriteItems** operation. A rejected stock condition rolls back both operations.
3. When stock is unavailable, CAPTURED→REFUNDED updates the test ledger once. Refund outage leaves CAPTURED unresolved for monitored recovery.
4. Retry the same order after interruption. READY/REFUNDED are durable outcomes, so replay does not capture, reserve or refund again. Conflicting amount/identity is rejected without overwriting the original.

Actual capture:

```json
{"captureResume":"REFUNDED","checks":32,"externalPayments":0,"failed":{"captures":1,"phase":"REFUNDED","refunds":1},"ready":{"captures":1,"phase":"READY","reserves":1},"refundOutageRecovery":"REFUNDED","reserveResumeCount":1,"scope":"host reference + actual local DynamoDB; not Step Functions ASL runtime"}
OWNED TABLES []
OWNED MOTO STOPPED / LISTENER CLOSED
```

👉32 behavior checks cover shortage/actual stock preservation, repeated refunded/ready orders, interruption after capture, interruption after atomic reserve, refund outage/recovery, conflicting payload and malformed input. Separate cleanup assertion makes33checks. Test payment fields never call a bank/provider. A real payment cannot be atomically included in the local DynamoDB transaction: use provider idempotency keys, explicit pending states, reconciliation and monitored recovery. Compensation can fail or have costs; a saga is not an invisible global rollback.

The host reference is not an ASL interpreter and is not the installed Moto Step Functions runtime. Reusing stable business identity and durable phases is the production lesson. Real workflow execution, external-provider ambiguity, distributed load/concurrency, IAM/KMS/network enforcement and failure timing need separate runtime tests.

## Cleanup and evidence

Metadata run:8 behavior checks plus cleanup9. Host saga:32 plus cleanup33. Both scripts record their endpoint/closed-listener status and created IDs under ignored `.lab/`. Created-ID lists are historical ledgers, not leftovers.

```text
OWNED RESOURCES {"queues": [], "rules": [], "schedules": [], "groups": [{"Arn": "arn:aws:scheduler:ap-south-1:123456789012:schedule-group/default", "Name": "default", "State": "ACTIVE"}], "machines": [], "roles": [], "functions": []}
OWNED MOTO STOPPED / LISTENER CLOSED
```

Default schedule group is Moto's builtin marker; the run-created group is deleted. No shared or user resources were present in these owned disposable processes. CLI requests print their real generated endpoint/resource names; no expected result is invented.

Primary references: [Classic/default bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html), [new Custom Event Bus](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus.html), [target permission paths](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html), [Classic retry](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html), [delivery DLQ](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html), [Scheduler timezones/precision](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html), [Scheduler group trust](https://docs.aws.amazon.com/scheduler/latest/UserGuide/cross-service-confused-deputy-prevention.html), [Standard/Express semantics](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html).
