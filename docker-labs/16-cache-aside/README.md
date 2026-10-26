# Lab16 — cache-aside, invalidation aur thundering herd

**Pain:** ShopKaro public catalogue repeated reads DB ko busy rakhti hain. Wrong key har request ko miss banata hai; a price update can leave stale cache; concurrent expiry can send all requests to the DB together.

**Verified scope:** host Python reference cache in front of actual local Moto DynamoDB calls. Tests cover data and request counts, not Valkey/DAX runtime, TLS/network enforcement or AWS latency. No Docker installation required for the core lab.

## Setup — existing venv, isolated emulator

```bash
cd aws-gurukul/docker-labs
source env.sh
cd 16-cache-aside
```

Do **not** start/reset the shared emulator for this lab. Each script starts its own `ThreadedMotoServer` on127.0.0.1 and an OS-assigned free port. Each CLI/SDK request explicitly uses that loopback endpoint, dummy test/test keys, ap-south-1 and lab-local credential/config paths. Profiles/session tokens unset; metadata lookup disabled. Scripts stop only their own server in `finally`. Existing `moto[server]` venv supplies boto3; no packages are installed.

Isolated process lifetime matters: Moto5.2.4 lacks some delete APIs and leaves cache/DAX metadata tombstones. Stopping this lab's own disposable server/process discards only this run's metadata, without a shared reset or leaving records in another learner's emulator.

## ex1 — actual origin reads versus cache hits

Read `cache.py` and `fetch()` in `test_cache.py`, then run:

```bash
../.venv/bin/python -I test_cache.py
```

Test creates a table keyed by tenant + product and actual versioned catalogue rows. Source adapter uses GetItem ConsistentRead; cached responses still have a stale window and are **not** end-to-end strongly consistent.

Asli captured selection:

```json
{
  "checks":34,
  "warm":{"requests":10,"hits":9,"misses":1,"coalesced":0,"db_reads":1,"evictions":0,"invalidations":0,"errors":0},
  "coalescing":{"requests":20,"hits":0,"misses":1,"coalesced":19,"db_reads":1,"evictions":0,"invalidations":0,"errors":0},
  "inflightRace":{"originReads":2,"price":699,"version":3},
  "scope":"host Python cache + real local DynamoDB calls; not Valkey runtime/performance"
}
OWNED TABLES [] / OWNED SERVER STOPPED
```

34 behavior checks precede the separate owned-table cleanup assertion. No measured throughput or p99 result is claimed.

👉 Ten repeated reads need one actual GetItem; nine reads return copied cached data. Tenant and product are part of the key. A session/request timestamp is absent because this fixture caches the same catalogue response across requests. Include every dimension that changes a real response: tenant, product, locale, currency, authorization/price scope and schema version as applicable. A caller-supplied tenant name is not authentication; production derives authorized scope separately.

## ex2 — TTL is a stale window, not write consistency

Tests deliberately update price499→599 without invalidation and observe old499 from cache. After successful DB write, `invalidate()` removes the entry; the next read returns actual599/version2. Advancing the **test clock** past60seconds also forces a real read. No waiting or wall-clock benchmark is involved.

A missing item gets at most1second negative-cache TTL; creation during that interval can still return missing until invalidation/expiry. Caller mutation cannot poison cached values. Entry-count LRU capacity is enforced; this is not a byte-accurate Valkey memory model. Downward jitter spreads expiration across different keys while staying within configured maximum TTL.

👉 TTL bounds residency after a fill. Real source replica lag, old in-flight reads, delayed invalidation and failure recovery can add data age. Product/price display may accept a reviewed stale window; checkout price/stock invariants must use the authoritative transaction path. Do not infer immediate stock correctness from cache hits.

## ex3 — concurrent cold miss and stale-fill race

Twenty threads request the same cold key while a test gate holds the actual origin result. Nineteen requests coalesce behind one origin read. Gates exercise request ordering; elapsed times are not performance measurements.

Another gate pauses an old result before cache publication. A DB update699/version3 commits, then invalidation marks the in-flight fill obsolete. Releasing the old fill makes the wrapper discard old data and refetch; result699/version3 is cached after two actual reads. This is a **single-process** coordination model. A real multi-instance design needs reviewed distributed coordination/version fencing and bounded retries; a per-process lock does not coordinate an entire fleet.

Origin errors propagate with useful messages and no cached error or abandoned pending fill. Invalid keys, mismatched tenant/product rows and invalid cache settings fail visibly. Cache outage/fallback design must protect DB capacity with deadlines, bounded concurrency/backoff and load shedding; this reference does not simulate a remote cache transport outage.

## ex4 — run actual cache/DAX metadata APIs, inspect gaps

```bash
../.venv/bin/python -I metadata.py
```

Script creates only disposable owned VPC/subnets/SGs, a subnet-group record, a Valkey8.0 replication-group metadata fixture and a DAX-trusted IAM role with a catalogue-table read policy. Ports6379/9111 are scoped to the app SG. Every full CLI command is printed. No application traffic connects to an AWS-style cache endpoint. The metadata probe does not provision cache RBAC or prove authorization; the in-app mission starts with a separate preprovisioned RBAC fixture.

Actual Moto5.2.4 observations:

- `create-replication-group --num-cache-clusters 2` returned available, MultiAZ enabled, automatic failover enabled, transit/at-rest flags true, **but only one MemberCluster/primary node**. `describe-cache-clusters` returned[]. Boolean flags do not prove real HA.
- Modify-replication-group description/failover metadata and replication-group-available waiter worked.
- Create/describe serverless cache, DAX subnet-group creation and delete-cache-subnet-group returned500/unsupported behavior. Script records errors; no successful serverless/subnet deployment is claimed.
- DAX create accepted TLS/SSE metadata, remained creating with Nodes null; an implementation endpoint still used8111 despite TLS. Real encrypted DAX uses9111. Moto ignored placement/subnet/security details, so metadata is not TLS/VPC/HA/IAM enforcement evidence.
- Delete requests left cache/DAX tombstones. Script attempts all independent cleanup calls and then stops/closes its **owned** ephemeral listener; process exit discards remaining in-memory records.

Asli final output:

```text
METADATA DELETE REQUESTS COMPLETE; unsupported APIs/tombstones discarded with owned process exit
OWNED MOTO STOPPED / LISTENER CLOSED
```

Generated names/ports vary. Source, IAM and metadata are local fixtures, not deployed caches. An earlier capability probe on this task's own4566 server found the same gaps; that owned server was stopped. This lab does not depend on4566/4567.

## Docker follow-up — pending machine readiness, unverified

Docker was absent during authoring; no image/container/port run is claimed. After installing Docker, verify the official [Valkey container source](https://valkey.io/topics/installation/), then use a disposable local-only container. Proposed follow-up commands below have **not** been run here; there is no captured Docker output.

```bash
LAB16_CONTAINER="aws-gurukul-valkey-$(date +%s)"
docker run --rm -d --name "$LAB16_CONTAINER" -p 127.0.0.1:6389:6379 valkey/valkey:8.0
docker exec "$LAB16_CONTAINER" valkey-cli SET catalog:shop:kurta 499 EX 60
docker exec "$LAB16_CONTAINER" valkey-cli GET catalog:shop:kurta
docker exec "$LAB16_CONTAINER" valkey-cli TTL catalog:shop:kurta
docker exec "$LAB16_CONTAINER" valkey-cli DEL catalog:shop:kurta
docker stop "$LAB16_CONTAINER"
```

Run cleanup only for the container successfully created in this shell. If6389/name is occupied, inspect and choose another local port/name; do not remove unrelated containers. Local GET/SET/TTL validates a basic Valkey runtime only, not managed ElastiCache Multi-AZ, AWS TLS/IAM, eviction/durability or the full cache-aside adapter. An actual Valkey-backed adapter/replay remains a Docker follow-up.

## What cleanup establishes

`test_cache.py` deletes its table and closes its own listener in finally. `metadata.py` attempts supported resource deletes and closes its own listener; unsupported metadata disappears with that disposable process. `.lab/` stores endpoint/ledger evidence only. No shared reset, real AWS, user credentials or unrelated process shutdown.

Current architecture boundaries: ordinary Valkey/Redis OSS async replicas can lose recent writes at failover; Memcached node-based sharding is not a replicated durable database. ElastiCache Valkey9.0+ now has separately configured durable Multi-AZ-log options (sync versus async); durability does not disable TTL/eviction. MemoryDB is also a durable in-memory database candidate. This lab uses a traditional node-based8.0 metadata fixture; none of those managed durability modes are exercised.

Primary references checked2026-10-26: [cache write/invalidation](https://docs.aws.amazon.com/prescriptive-guidance/latest/dynamodb-elasticache-integration/cache-write.html), [Multi-AZ](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/AutoFailover.html), [current durability](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Durability.Options.html), [serverless/deployment](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.corecomponents.html), [DAX networking/TLS](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.create-cluster.cli.html).
