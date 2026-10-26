# Lab14 — handler bytes, duplicate events aur Lambda configuration

**Pain:** S3 event dobara aa sakta hai; source key overwrite ho sakti hai; batch mein ek invalid message ho sakta hai. StatusCode200 bhi function error rakh sakta hai. Correctness ka proof actual output aur failed IDs se lo.

**Scope:** trusted SVG fixture only, host Python + existing loopback Moto5.2.4. Three derivative sizes64/128/256; source VersionId preserved; conditional output creation with byte verification. This is not a JPEG/PNG codec, untrusted-image security pipeline or AWS runtime benchmark. No extra package installation needed: existing lab venv includes boto3.

## Setup environment

```bash
cd aws-gurukul/docker-labs
# Existing Moto absent ho tab launcher; shared reset mat chalao.
./start-moto.sh
source env.sh
cd 14-lambda-handler-config
```

Both scripts force dummy test/test, lab-local credential/config paths and loopback endpoints. `lab.py` passes explicit `--endpoint-url http://127.0.0.1:4566 --region ap-south-1` on **every CLI service**. Profiles/session tokens unset, metadata disabled. Scripts do not touch `~/.aws`.

## ex1 — run actual handler on host, then verify real S3 objects

```bash
../.venv/bin/python -I test_handler.py
```

Test imports `app.py` by explicit path (`-I` isolates import paths), creates two uniquely named owned buckets, enables source versioning and uploads a trusted SVG with a URL-encoded space/plus in the key. Handler reads the event's exact VersionId, generates actual SVG bytes and writes derivatives into the separate output bucket. Keys are derived from source bucket/key/version identity. Original source is preserved.

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

Generated bucket names vary. Test verifies all three actual dimensions, original bytes, duplicate writes, four concurrent deliveries of a new source version, stale-event reads of the old version, invalid nested events and a corrupt existing derivative. Both test buckets and exact versions are cleaned in `finally`.

👉 **Asli baat:** deterministic output keys plus `IfNoneMatch='*'` avoid duplicate creation. On412, compare existing bytes before acknowledging. Other failures propagate for retry; real S3 conditional409/network behavior still needs retry policy. This is per-output idempotency, not a distributed transaction or a blanket exactly-once promise. An interrupted first invocation may leave a partial set; retry fills missing derivatives.

## ex2 — Standard SQS partial-batch contract

Read `handler()` and the `partial` test in `test_handler.py`. The good message wraps the same S3 event. The bad message contains invalid JSON. Handler returns only `bad-1` in `batchItemFailures` and preserves already-correct outputs.

A real Lambda SQS mapping must enable `ReportBatchItemFailures` **and** handler must return the failed message IDs. Function async retry/destination settings are a different mechanism from SQS visibility/redrive. This fixture uses Standard SQS semantics; FIFO requires preserving ordering and reporting unprocessed records after a failure.

## ex3 — actual AWS CLI configuration requests on Moto

Read `lab.py`, then:

```bash
../.venv/bin/python -I lab.py setup
../.venv/bin/python -I lab.py exercises
```

Controller prints every actual CLI command. Setup creates only owned empty source/output buckets, empty jobs/failures queues, a scoped Lambda-trusted IAM role/policy and a Python3.12 function ZIP. No source-bucket notifications or queue messages are installed/sent; automatic runtime execution is not claimed.

Exercises run:

- `update-function-configuration` to memory1024MB/timeout15s, then real `wait function-updated-v2` and configuration read.
- Reserved concurrency10; function async retry2/age3600s with OnFailure SQS destination.
- Standard SQS event source mapping with `ReportBatchItemFailures` and actual list readback.
- Scoped S3 resource permission using source bucket ARN and source account; `get-policy` readback.
- One manual `invoke`, inspect both response metadata and body; publish a version and probe provisioned concurrency API.

Captured configuration excerpt:

```json
{"Memory":1024,"Timeout":15,"Update":"Successful"}
```

Captured async config excerpt:

```json
{"MaximumRetryAttempts":2,"MaximumEventAgeInSeconds":3600,
 "DestinationConfig":{"OnFailure":{"Destination":"arn:aws:sqs:ap-south-1:123456789012:lab14-...-failures"}}}
```

The ARN above is a shortened excerpt; actual generated ARN is printed by the controller and recorded in `.lab/resources.json`. Captured mapping response includes `State:"Enabled"`, `BatchSize:10`, `FunctionResponseTypes:["ReportBatchItemFailures"]`. These are metadata, not a proof that Moto consumed a queue or delivered a failure destination.

## ex4 — HTTP status is not handler success; Docker boundary

Docker is currently absent. Actual Moto invoke result:

```json
{"StatusCode":200,"FunctionError":"Handled"}
```

Actual response-body excerpt:

```text
error running docker: Error while fetching server API version: ('Connection aborted.', FileNotFoundError(2, 'No such file or directory'))
```

`PutProvisionedConcurrencyConfig` returned404 on installed Moto. Publishing a version succeeded; warm runtime allocation was not verified. Neither CLI success status nor metadata proves executed code, initialization latency or request delivery.

**Docker runtime section pending user installation:** no Docker was installed or started by this lab. Host handler test above is verified independently. A future Docker run must first review container-to-Moto endpoint routing (container127.0.0.1 is not host127.0.0.1), runtime dependencies, trigger delivery, logs and cleanup; do not treat current function environment as tested container networking. No invented successful Docker output is included.

## Cleanup

```bash
../.venv/bin/python -I lab.py cleanup
```

Only IDs recorded after successful creation are eligible for cleanup. Order: mapping, any accepted PC config, function/owned log group, queues, empty buckets, role policy/role. Setup failure attempts its own scoped cleanup; after an exercise failure run cleanup explicitly. Successful cleanup archives the resource manifest.

Actual final lookup output:

```json
[]
[]
```

Source/output metadata buckets remain empty; host handler tests own separate buckets with their own version cleanup. Shared emulator is never reset. No real AWS or Docker runtime results claimed.
