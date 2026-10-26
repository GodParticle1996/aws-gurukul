# Lab 15 — cart keys, safe backfill aur atomic checkout

**Pain:** ShopKaro sale ke 950 carts ka logical partition key `active` hai. Extra table capacity hot access pattern ko automatically fix nahi karti. Primary key in-place change nahi hoti; separate table aur verified migration chahiye.

**Scope:** existing local Moto5.2.4, dummy credentials, 1,000 actual items, real AWS CLI + boto3 requests. Lab counts logical keys and checks complete item attributes. Counts do not measure physical partitions, throttling, latency or production throughput.

## Setup — exact commands

```bash
cd aws-gurukul/docker-labs
# Existing Moto absent ho tab ./start-moto.sh; shared reset mat chalao.
source env.sh
cd 15-dynamodb-access-patterns
../.venv/bin/python -I lab.py setup
```

Controller requires loopback4566 and test/test credentials, pins **every CLI/SDK service** to that endpoint and ap-south-1, unsets profiles/session tokens and disables instance metadata. Credential/config paths stay inside `.lab/`; no `~/.aws` writes. Existing lab venv supplies boto3/aws; no installation or Docker required.

`setup` saves exact owned table names in `.lab/resources.json`, creates v1 with `status` HASH + `cartId` RANGE, and writes 1,000 carts through BatchWriteItem in chunks of25. UnprocessedItems get bounded exponential-backoff retries; an exhausted retry stops visibly. Each cart also has sellerId, numeric updatedAt/expiresAt/total/version. Generated `lab15-<timestamp>` names vary.

Asli captured output:

```text
SOURCE {"items": 1000, "partitionKeyCounts": {"active": 950, "saved": 50}}
```

👉 950 items share one **logical** key. Hotness depends on request concentration, item sizes and physical partition capacity, not row count alone. Adaptive capacity and splitting can help; high-cardinality cartId still needs distributed traffic.

## ex1 — run migration and safety exercises

Read `lab.py`, then type:

```bash
../.venv/bin/python -I lab.py exercises
```

Controller prints every full CLI command. Operations run in this order:

1. Paginate a full source Scan. Create `v2` with cartId HASH and PAY_PER_REQUEST; wait for table ACTIVE.
2. Backfill every typed item in25-write batches. Compare all attributes, not just Count. Source stays intact.
3. Add `bySeller` GSI (sellerId HASH, numeric updatedAt RANGE, ALL projection). Inspect **IndexStatus ACTIVE**, separately from table status.
4. Query seller-1 by key. Try `--consistent-read` on the GSI and inspect the expected validation error.
5. Enable PITR with RecoveryPeriodInDays35; read configuration back. Enable TTL on numeric epoch-seconds expiresAt; inspect status.
6. Put cart-new with `attribute_not_exists(cartId)`. Try duplicate cart-new with total0 under the same condition. Read total499 back and query seller-1 again.
7. Create separate checkout table. Seed SKU#kurta available1. Transaction tries quantity2 plus order creation: condition fails, both actions roll back. Retry quantity1 with another token: stock0 and order quantity1 commit atomically.
8. Replay successful token to expose the documented Moto idempotency gap.

Asli captured selections:

```text
BACKFILL {"sourceItems": 1000, "targetItems": 1000, "equalAttributes": true, "distinctCartKeys": 1000, "maxItemsPerLogicalKey": 1}
```

```json
[{"Name":"bySeller","State":"ACTIVE"}]
```

Seller query initially returned Count100, ScannedCount100 and FirstCart cart-0001. GSI strong read returned:

```text
An error occurred (ValidationException) when calling the Query operation: Consistent reads are not supported on global secondary indexes
```

PITR/TTL readback:

```json
{"Status":"ENABLED","Days":35}
{"TimeToLiveDescription":{"TimeToLiveStatus":"ENABLED","AttributeName":"expiresAt"}}
```

Conditional duplicate and actual preserved item:

```text
An error occurred (ConditionalCheckFailedException) when calling the PutItem operation: The conditional request failed
```

```json
{"Cart":"cart-new","Total":"499"}
{"Count":101,"ScannedCount":101,"FirstCart":"cart-0001"}
```

Atomic checkout:

```text
An error occurred (TransactionCanceledException) when calling the TransactWriteItems operation: Transaction cancelled, please refer cancellation reasons for specific reasons [ConditionalCheckFailed, None]
ROLLBACK stock=1 orderAbsent=true
ATOMIC-COMMIT stock=0 orderQuantity=1
```

👉 BatchWriteItem is **not** a transaction and PutRequest can overwrite an existing item. Conditions belong on each Put/Update or transaction request; one conditional call does not install a permanent unique/business constraint. Transactions support up to100 distinct items/4MB in the same account/Region; transaction units cost2× standard units. No two actions can target the same item.

## ex2 — understand the emulator boundaries

- Moto returns table/index/TTL/PITR metadata immediately in this run. Real creation, GSI backfill and TTL readiness take time. `table-exists` only waits for the table; inspect index status independently.
- No physical partition placement, adaptive/burst capacity, throttle, global replication, real latency, TTL ageing/deletion or historical PITR recovery is verified. TTL expired items can remain for days; application expiry checks still matter. PITR restores to a **new table**, within configured1–35 day window and actual restorable time bounds.
- Moto replayed `lab15-success` by evaluating conditions again and returned TransactionCanceledException `[ConditionalCheckFailed, ConditionalCheckFailed]`. Real AWS identical ClientRequestToken retry is idempotent for10minutes; changed parameters within the window produce IdempotentParameterMismatch. Keep business idempotency after token expiry too.
- Lab writers are paused. Scan is not a migration snapshot for live writes, even with ConsistentRead. Production needs reviewed dual-write/CDC, delete handling, reconciliation, catch-up, controlled cutover and rollback. Preserve old table until acceptance; do not infer a deployed app cutover from this lab.
- GSI projection/consistency and per-key traffic matter after migration. A single hot sellerId can move the bottleneck into the GSI. GSI readback does not prove immediate visibility guarantees.

## Cleanup — only this run's tables

```bash
../.venv/bin/python -I lab.py cleanup
```

Deletes only exact names saved by setup, waits for absence and records the cleaned ledger. Asli final output:

```text
OWNED_TABLES_REMAIN []
```

Do not use shared Moto reset. On partial failure, retain `.lab/resources.json`, inspect the printed error and run scoped cleanup before a fresh setup. Running exercises twice can encounter existing v2; use cleanup/setup for a full replay.

Primary references checked2026-10-26: [partition keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html), [batch writes](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html), [transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html), [GSI lifecycle](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.OnlineOps.html), [TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html), [PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html).
