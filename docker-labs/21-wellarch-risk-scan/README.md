# Lab21 — risky configuration se review evidence tak

**Pain:** `MultiAZ=true`, an alarm name and a logging flag cannot prove a recovered business workload. Review evidence ko configuration, measured runtime aur business outcome mein distinguish karo.

This lab checks **three declared course configuration contracts**, not the complete AWS Well-Architected Framework or an official AWS WA Tool risk rating. All fixtures use TEST data on an owned ephemeral loopback Moto5.2.4 server. No real AWS, SQL, Lambda, packet tests or Docker run.

## Exact setup and run

Existing `docker-labs/.venv` is required. From `aws-gurukul`:

```bash
./docker-labs/21-wellarch-risk-scan/seed.sh
```

`seed.sh` runs the whole bounded exercise: seed → scan → repair → scan → cleanup. No server is left running for a later terminal. `lab.py` calls the reusable `risk_scan.scan()` helper from `risk_scan.py`; read both before the run. The launcher sources the existing environment, whose banner mentions4566/ap-south-1. Python explicitly overrides **every client** to the new printed `OWNED MOTO http://127.0.0.1:<port>` endpoint/us-east-1 with dummy credentials, disabled profiles/session token/metadata and lab-local config. No shared reset or ~/.aws writes.

## ex1 — seed, inspect the three contracts

Actual repository replay (2026-10-27):

```text
ACTUAL SCAN ... "count": 3, "notAnAWSWAReview": true ...
PASS 1 scanner finds3declared config risks before repair
```

The seed owns a private encrypted PostgreSQL DB metadata fixture, an S3 audit bucket with BPA and original TEST evidence, and later a topic/alarm/trail. Initial gaps:

| Pillar / declared contract | Initial evidence | Reviewed repair |
|---|---|---|
| Reliability | Single-AZ, backup retention0days | Multi-AZ plus7days retention; preserve source |
| Operational Excellence | Reviewed target5xx alarm absent | Sum/Count, exact supplied dimension, >5 in2of2×60s, missing, owned SNS target |
| Security | Scoped multi-Region management trail config absent | Exact S3 SourceArn policy, global/multi-Region/validation flags, All management selector, logging |

Read `risk_scan.py`: the scanner checks actual field values, not whether a matching resource name merely exists. Alarm dimensions use `TRAINING-NOT-DEPLOYED`: **no actual ALB is deployed**. Threshold5Count is an explicit course diagnostic example, not a recommended customer error-rate SLO.

## ex2 — reproduce and understand emulator gaps

The script first creates/starts a disposable trail **without a bucket policy**, then stops it. Moto accepts logging and even returns a LatestDeliveryTime. Actual bucket inspection later shows only `TEST-preserve.txt`; no CloudTrail files or digests were delivered. This is a captured authorization/delivery gap. Real AWS requires usable destination permissions, and IsLogging alone still does not prove delivery.

The reviewed policy contains GetBucketAcl plus PutObject to the account AWSLogs path, with exact trail SourceArn and bucket-owner-full-control condition. The simulator checks this bounded documented access path; it does not copy Moto's unconditional acceptance.

Actual default GetEventSelectors returned `[]`; the script explicitly sets the All-management selector. Real default management-event capture and explicit selector configuration should be checked against current AWS documentation, not inferred from Moto's empty list.

CloudWatch current SDK/provider defaults can use CBOR, which this Moto version cannot decode correctly. A **private in-memory SDK service model** selects its supported Query protocol; no installed package or server response is patched. Put/Describe/DeleteMetricAlarm are actual local API calls. Actual initial state:

```text
INITIAL ALARM OK Unchecked: Initial alarm creation
```

That is not a fresh5xx observation, successful page or healthy checkout.

## ex3 — repair and scan again

Read each API block in `lab.py` before the run. The scripted repairs mirror the in-app CLI decisions:

1. Persist the narrow S3 policy and read it back. Expect exact trail/account path.
2. Modify DB MultiAZ/BackupRetentionPeriod=7. Expect private DB still present. No SQL restore/failover runs.
3. Put the fully specified5xx alarm through the supported Query client. Expect the actual fields/topic read back.
4. Update/start the owned trail with reviewed flags and explicit management selector. Expect IsLogging true **as configuration metadata**.
5. Re-scan and retrieve original TEST bytes.

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

Moto LookupEvents is unimplemented and returns HTTP500/NotImplementedError; the expected gap is printed, not treated as real event evidence. Other unexpected API failures still fail the exercise. In-app lookup results are explicitly seeded course events, not live collected history.

## Cleanup and interpretation

The `finally` block stops/deletes only the own trail, alarm/topic, DB/subnet group/VPC/subnets and bucket TEST objects. Actual successful replay:

```text
PASS 8 owned fixture resources cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

Only the own listener is closed. No shared4566reset. `.lab` is ignored local scratch. A failed sandbox-startup capture and the first unsupported-LookupEvents attempt are retained as development evidence; later complete replay passed7behavior checks plus cleanup8.

**Remaining review work:** restore and reconcile actual SQL/business IDs, measure real RTO/RPO/tails/errors, verify real metric-triggered notifications, inspect delivered CloudTrail log/digest files and execute validation. Enabling log-file validation permits future digest creation; it does not itself validate files. Also review identity, deployment/runbooks, resource efficiency and the other workload risks. Zero of these3configuration findings is not a security certificate or a full Well-Architected pass.

Sources: [review process](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-review-process.html), [improvement plan](https://docs.aws.amazon.com/wellarchitected/latest/userguide/improving-your-workload.html), [CloudTrail bucket policy](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/create-s3-bucket-policy-for-cloudtrail.html), [event history](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html), [digest validation](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html).
