# Lab20 — Mahasale readiness: configuration, channel test aur bounded work

**Pain:** architecture diagram traffic readiness prove nahi karta. Scheduled capacity, replica availability, consumer caps, alarm configuration aur actual work identity ko separate evidence chahiye.

Three scripts have distinct scopes. Terraform creates local control-plane objects; metadata.py checks capacity APIs; load.py checks durable TEST handoff under a bounded workload. **No working storefront, real PostgreSQL, Lambda runtime, actual WAF filtering, metric-triggered paging or AWS throughput is claimed.**

## Setup and exact order

Existing Moto5.2.4 Python environment, Terraform1.17.0 and AWS provider6.70.0 were used. Terraform is a separate tool; Docker is not required.

```bash
cd aws-gurukul/docker-labs
source env.sh
# If terraform is already on PATH, no extra export is needed.
# On this reviewed workspace the verified local binary is available at:
export LAB20_TERRAFORM="$PWD/../.overhaul-evidence/tools/terraform"
python -I 20-mahasale-terraform/lab.py
python -I 20-mahasale-terraform/metadata.py
python -I 20-mahasale-terraform/load.py
```

A fresh clone needs an installed/verified Terraform binary; set LAB20_TERRAFORM to its absolute path if needed. [Official Terraform downloads](https://developer.hashicorp.com/terraform/install) provide release/checksum guidance. Current workspace binary1.17.0 was verified against the official SHA256SUMS. The cached provider from lab08 is reused when present; LAB20_PLUGIN_DIR can select another existing provider mirror. Otherwise Terraform init fetches the pinned public provider into the lab's own data directory. No system package installation is performed by these scripts.

**Do not start/reset shared Moto for this lab.** lab.py and metadata.py each start a separate ephemeral127.0.0.1 server and close the owned listener. Every SDK/provider endpoint is explicit, with dummy keys, disabled profiles/session token/instance metadata and lab-local config. load.py instead uses in-process Moto interception with all DNS/socket connects forbidden; service URLs in that script are virtual identities, not outbound requests. No script accesses real AWS or writes ~/.aws.

Read scripts before running. Only TEST data is used; external emails/payments remain0. Historical IDs, state, ledgers and captures live under ignored .lab. Preserve nonempty state after a failed run; deleting state is not cleanup.

## ex1 — Terraform18 scoped resources, then inspect drift

lab.py performs format check → init → validate → saved plan → same saved-plan apply → actual outputs → repeat plan → API review/test → scoped destroy. The explicit local backend is .lab/state.tfstate; a custom plan -state flag alone is not relied on to choose saved-plan apply output.

Actual successful preparation capture:

```text
Success! The configuration is valid.
Plan: 18 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 18 added, 0 changed, 0 destroyed.
REPEAT PLAN EXIT 2 known Moto OAC/default/JSON readback gaps; not a zero-drift claim
```

Resources: an isolated internal ALB/two subnets/VPC; private S3 bucket/BPA/OAC/CloudFront and exact distribution policy; Regional CommonRuleSet/login-rate WAF association; Standard DLQ/two work queues; SNS alert topic/SQS alert sink/scoped queue policy/raw subscription. No application/listener is deployed. This configuration is an isolated extension exercise, not a deployable production commerce stack.

👉 Repeat plan exit2 is deliberately visible. Moto drops the requested OriginAccessControlId, adds legacy forwarded/default viewer fields and normalizes SQS redrive JSON differently. Critical OAC drift is **not ignored to manufacture a clean plan**. OAC object and exact SourceArn bucket policy persist, but the missing origin attachment means no working private CDN claim. The same gap is documented in lab11. Real AWS needs the OAC attached, deployed config and actual signed-access tests.

## ex2 — CloudWatch protocol boundary and manual notification channel

Current provider6.70.0 CloudWatch CBOR requests/responses are incompatible with installed Moto5.2.4. Native alarm resource examples remain in main.tf behind native_alarms=false. Enabling the flag on this emulator does not become a supported path merely because the HCL validates.

The local script selects AWS-supported Query protocol **only in a private SDK client's in-memory service metadata**, without modifying packages or emulating a successful response. Actual PutMetricAlarm/DescribeAlarms/DeleteAlarms operations run through Moto's supported Query endpoint. Two alarm records use:

- ALB TargetResponseTime, p95, Seconds, threshold0.4,60s periods,2of3, missing data=missing, low sample count=ignore, exact ALB dimension.
- SQS ApproximateAgeOfOldestMessage, Maximum,120s threshold,2of2 periods, empty/inactive queue missing data=notBreaching. An active-workflow telemetry liveness check is separate.

Both action lists target the actual owned SNS topic. Moto returns StateValue OK with StateReason `Unchecked: Initial alarm creation`, despite no real samples. **That is not evidence of healthy latency.** Native Terraform alarm lifecycle, automatic evaluations, production percentile behavior and metric-triggered notification remain unverified in this environment.

Actual route check:

```text
CLOUDWATCH COMPATIBILITY PROTOCOL query; Terraform native alarms disabled due captured CBOR gap
MANUAL NOTIFICATION ROUTE VERIFIED SNS -> SQS TEST body; not metric-triggered paging
```

👉 A manually published READINESS_TEST body reaches the own raw SQS alert sink and is received/acknowledged. This proves that tested notification route, not that a latency breach triggered CloudWatch or paged a human. Moto resource-policy enforcement gaps still apply; policies are explicitly scoped, but no IAM enforcement certification is claimed.

## ex3 — pre-scaling, read-replica and consumer budgets

metadata.py owns a separate loopback server and disposable capacity fixtures. Captured assertions:

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

👉 Current ASG12instances is separate from two future scheduled actions. Recurring ASG uses a **five-field** cron and explicit Asia/Kolkata timezone; EventBridge Scheduler's six-field cron is a different API. Stored actions do not demonstrate timer firing, app boot, cache warmup or healthy requests.

The Postgres source uses ordinary disposable TEST master credentials, with private/Multi-AZ/seven-day-backup metadata. It does not use the unsupported PostgreSQL managed-master-secret/read-replica combination. Replica availability is Moto metadata, not SQL read routing/replication/lag measurement. Replica provisioning has real lead time on AWS.

Function reserved concurrency20 and SQS mapping MaximumConcurrency20 are independent limits. No Lambda is invoked; the queue remains empty. Reserved concurrency does not pre-warm environments. Production needs regional/function/downstream budgets, actual mapping state, partial-batch behavior, throttle/queue-age monitoring and measured runtime. Provisioned SQS poller mode has separate rules/cost and is not enabled here.

## ex4 — actual10,000 unique TEST intents,1vs5 business workers

load.py runs10windows of1000unique messages plus10deliberate duplicates per window for each scenario. Total per scenario:10,000unique event IDs,100deliberate duplicate copies. The SQLite ledger remains durable across windows; all expected IDs are checked exactly. Message acknowledgement occurs after durable PENDING_DISPATCH intent creation, **not after a real email send**.

The run declares2ms synthetic business work/message. Socket/DNS connects are forbidden, and Moto intercepts SDK operations in-process. Only emulator API calls are serialized to avoid Moto's observed concurrent pending-set iteration crash; business work remains concurrent. Actual Standard-queue redelivery is permitted: receives can exceed publishes, but unique intents cannot exceed or lose expected IDs. The script verifies acknowledgement counts, duplicate conservation, exact durable IDs and controlled local visible/inflight empty state. Production SQS approximate counters alone are not a proof of business completeness.

Measured exact repository replay (2026-10-27), using this guarded method:

| Business workers | Unique intents | Published copies | Received/acknowledged copies | Summed drain windows | Unique intents/drain-second |
|---|---:|---:|---:|---:|---:|
| 1 | 10000 | 10100 | 10100 | 173.523 s | 57.63 |
| 5 | 10000 | 10100 | 10100 | 162.705 s | 61.46 |

```text
MEASURED WORKLOAD COMPLETE
IN-PROCESS OWNED QUEUES EMPTY / NETWORK FORBIDDEN
```

👉 Both scenarios persisted10,000unique TEST intents and suppressed100duplicate intents; externalEmails0. Measured times vary with host load. Five workers gave about1.07× throughput in this capture, **not5×**. Emulator API serialization, Python/SQLite overhead and the declared work delay limit this test. These are host/Moto measurements, not EC2/Lambda/SQS production capacity ratings. Summed drain windows exclude publishing and are not end-to-end wall time.

**Scope correction:** an earlier full10k HTTP-server burst published10100copies but hit the180s drain deadline after770durable intents. The final bounded-window test does not claim to have completed that initial10kburst. Increasing a timeout or consumer count must not hide missing work. Failed receive-equality and concurrent-set probes are retained as preparation evidence; the final test accepts valid redelivery and protects the emulator boundary.

## Cleanup and recovery

Terraform script deletes the two own Query alarm records, then destroys exactly its own tracked18resources. Successful capture:

```text
Destroy complete! Resources: 18 destroyed.
OWNED TERRAFORM STATE EMPTY True
OWNED MOTO STOPPED / LISTENER CLOSED
```

metadata.py deletes only its own function/mapping/queue/role, replica/source/subnet group, ASG/template/subnets/VPC, then closes the listener. load.py deletes both own virtual queues before leaving the mock/network-forbidden context; historical SQLite evidence remains local. No shared server reset, unrelated deletion, real AWS, Docker or system install.

If an owned server/script fails, preserve .lab and inspect printed error/state/endpoint before recovery. The owned ephemeral listener is closed in finally. Do not redirect a saved state to another endpoint/account or use a shared reset. A failed preparation state-path probe was archived; later explicit-backend runs verified actual18-resource destruction rather than merely checking an unrelated empty pathname.

Primary references: [ASG schedules](https://docs.aws.amazon.com/autoscaling/ec2/userguide/scheduled-scaling-create-scheduled-action.html), [warmup](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-default-instance-warmup.html), [RDS read replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html), [SQS mapping concurrency](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html), [percentile low samples](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/percentiles-with-low-samples.html), [missing data](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html), [AWS protocol support](https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/CLIENTS.md).
