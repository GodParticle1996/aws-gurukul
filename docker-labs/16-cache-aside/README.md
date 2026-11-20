# Lab16 — cache-aside, invalidation aur thundering herd

**Pain:** ShopKaro ke public catalogue ke baar-baar reads DB ko busy rakhte hain. Galat key har request ko miss bana deti hai; price update ke baad cache purana reh sakta hai; ek saath expiry saari requests ko ek saath DB par bhej sakti hai.

**Check hua scope:** host Python reference cache, asli local Moto DynamoDB calls ke aage. Tests data aur request counts cover karte hain, Valkey/DAX runtime, TLS/network enforcement ya AWS latency nahi. Core lab ke liye Docker install nahi chahiye.

## Setup — pehle se bana venv, alag emulator

```bash
cd aws-gurukul/docker-labs
source env.sh
cd 16-cache-aside
```

Is lab ke liye shared emulator start/reset **mat** karo. Har script apna `ThreadedMotoServer` 127.0.0.1 aur OS ke diye free port par start karti hai. Har CLI/SDK request saaf taur par wahi loopback endpoint, dummy test/test keys, ap-south-1 aur lab ki apni credential/config paths use karti hai. Profiles/session tokens unset; metadata lookup band. Scripts `finally` mein sirf apna server rokti hain. Pehle se bana `moto[server]` venv boto3 deta hai; koi package install nahi hota.

Alag process ki life maayne rakhti hai: Moto 5.2.4 mein kuch delete APIs nahi hain aur woh cache/DAX metadata ke nishaan (tombstones) chhod deta hai. Is lab ka apna phenkne layak server/process rokne se sirf is run ka metadata hatta hai, bina shared reset ke aur bina kisi doosre learner ke emulator mein records chhode.

## ex1 — asli origin reads vs cache hits

`cache.py` aur `test_cache.py` ka `fetch()` padho, phir chalao:

```bash
../.venv/bin/python -I test_cache.py
```

Test tenant + product key wali table aur asli versioned catalogue rows banata hai. Source adapter GetItem ConsistentRead use karta hai; cached responses mein phir bhi purane data ki window hai aur yeh end-to-end strongly consistent **nahi**.

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

Alag apni-table cleanup assertion se pehle 34 behaviour checks hain. Koi naapa throughput ya p99 result ka daava nahi.

👉 Das baar ke reads ko sirf ek asli GetItem chahiye; nau reads copy kiya cached data dete hain. Tenant aur product key ka hissa hain. Session/request timestamp nahi hai, kyunki yeh fixture requests ke paar wahi catalogue response cache karta hai. Har woh cheez key mein daalo jo asli response badalti hai: tenant, product, locale, currency, authorization/price scope aur schema version, jo bhi lagu ho. Caller ka diya tenant naam authentication nahi; production allowed scope alag se nikaalta hai.

## ex2 — TTL purane data ki window hai, write consistency nahi

Tests jaan-boojh kar bina invalidation ke price 499→599 karte hain aur cache se purana 499 dekhte hain. DB write safal hone ke baad `invalidate()` entry hataata hai; agla read asli 599/version 2 deta hai. **Test clock** ko 60 second aage le jaane se bhi asli read hota hai. Koi wait ya wall-clock benchmark nahi.

Missing item ko zyada se zyada 1 second ka negative-cache TTL milta hai; us beech item ban jaaye toh invalidation/expiry tak missing hi aa sakta hai. Caller ke badlav cached values ko kharab nahi kar sakte. Entries ki ginti wali LRU capacity laagu hai; yeh byte tak sahi Valkey memory model nahi. Neeche ki taraf jitter alag keys ki expiry ko phailata hai aur set maximum TTL ke andar rehta hai.

👉 TTL fill ke baad cache mein rehne ka time limit karta hai. Asli source replica lag, purane in-flight reads, der se invalidation aur failure recovery data ki umar badha sakte hain. Product/price dikhane mein review ki gayi purane data ki window chal sakti hai; checkout ke price/stock niyam authoritative transaction raaste se hi chalne chahiye. Cache hits se turant stock ka sahi hona mat maano.

## ex3 — ek saath cold miss aur purane fill ki race

Bees threads wahi cold key maangte hain jabki ek test gate asli origin result ko rok kar rakhta hai. Unees requests ek hi origin read ke peeche jud jaati hain. Gates requests ka order check karte hain; beeta time performance ka naap nahi.

Ek aur gate purane result ko cache mein daalne se pehle rokta hai. DB update 699/version 3 commit hota hai, phir invalidation chalte fill ko purana mark karta hai. Purana fill chhodne par wrapper purana data phenk kar dobara laata hai; do asli reads ke baad 699/version 3 cache hota hai. Yeh **single-process** coordination model hai. Asli multi-instance design ko review kiya distributed coordination/version fencing aur limit wale retries chahiye; har process ka lock poori fleet ko coordinate nahi karta.

Origin errors kaam ke messages ke saath aage jaate hain; error cache nahi hota, na koi adhoora pending fill bachta hai. Galat keys, mismatch tenant/product rows aur galat cache settings saaf fail hote hain. Cache outage/fallback design ko deadlines, limit wali concurrency/backoff aur load shedding se DB capacity bachani chahiye; yeh reference remote cache transport ka outage simulate nahi karta.

## ex4 — asli cache/DAX metadata APIs chalao, kamiyan dekho

```bash
../.venv/bin/python -I metadata.py
```

Script sirf phenkne layak apne VPC/subnets/SGs, ek subnet-group record, ek Valkey 8.0 replication-group metadata fixture aur catalogue-table read policy wala DAX-trusted IAM role banati hai. Ports 6379/9111 app SG tak scoped hain. Har poora CLI command print hota hai. Koi application traffic AWS jaise cache endpoint se nahi judta. Metadata probe cache RBAC nahi banata, na authorization prove karta hai; app ka mission ek alag pehle se bane RBAC fixture se shuru hota hai.

Asli Moto 5.2.4 observations:

- `create-replication-group --num-cache-clusters 2` ne available, MultiAZ enabled, automatic failover enabled, transit/at-rest flags true diye, **par sirf ek MemberCluster/primary node**. `describe-cache-clusters` ne [] diya. Boolean flags asli HA prove nahi karte.
- Modify-replication-group ka description/failover metadata aur replication-group-available waiter chale.
- Serverless cache ka create/describe, DAX subnet-group banana aur delete-cache-subnet-group ne 500/unsupported behaviour diya. Script errors likhti hai; safal serverless/subnet deployment ka daava nahi.
- DAX create ne TLS/SSE metadata maana, Nodes null ke saath creating par atka raha; ek implementation endpoint TLS ke bawajood 8111 use karta raha. Asli encrypted DAX 9111 use karta hai. Moto ne placement/subnet/security details ignore ki, isliye metadata TLS/VPC/HA/IAM enforcement ka saboot nahi.
- Delete requests ne cache/DAX ke nishaan chhode. Script saari alag cleanup calls try karti hai, phir apna **thodi der ka** listener rok/band karti hai; process khatam hone par bache in-memory records hat jaate hain.

Asli final output:

```text
METADATA DELETE REQUESTS COMPLETE; unsupported APIs/tombstones discarded with owned process exit
OWNED MOTO STOPPED / LISTENER CLOSED
```

Bane naam/ports badalte rehte hain. Source, IAM aur metadata local fixtures hain, deploy hue caches nahi. Pehle ke capability probe ne is task ke apne 4566 server par yahi kamiyan dekhi thi; woh server rok diya gaya. Yeh lab 4566/4567 par depend nahi karti.

## Docker follow-up — machine ki taiyaari baaki, check nahi hua

Likhte waqt Docker nahi tha; koi image/container/port run ka daava nahi. Docker install karne ke baad official [Valkey container source](https://valkey.io/topics/installation/) check karo, phir ek phenkne layak, sirf local container use karo. Neeche diye follow-up commands yahan **nahi chalaye gaye**; koi pakda Docker output nahi hai.

<!-- run-readme: docker-only -->
```bash
LAB16_CONTAINER="aws-gurukul-valkey-$(date +%s)"
docker run --rm -d --name "$LAB16_CONTAINER" -p 127.0.0.1:6389:6379 valkey/valkey:8.0
docker exec "$LAB16_CONTAINER" valkey-cli SET catalog:shop:kurta 499 EX 60
docker exec "$LAB16_CONTAINER" valkey-cli GET catalog:shop:kurta
docker exec "$LAB16_CONTAINER" valkey-cli TTL catalog:shop:kurta
docker exec "$LAB16_CONTAINER" valkey-cli DEL catalog:shop:kurta
docker stop "$LAB16_CONTAINER"
```

Cleanup sirf us container ka chalao jo is shell mein safal bana. 6389/naam pehle se use ho raha ho toh dekh kar doosra local port/naam chuno; anjaane containers mat hatao. Local GET/SET/TTL sirf basic Valkey runtime check karta hai, managed ElastiCache Multi-AZ, AWS TLS/IAM, eviction/durability ya poora cache-aside adapter nahi. Asli Valkey wala adapter/replay Docker follow-up mein baaki hai.

## What cleanup establishes

`test_cache.py` apni table delete karta hai aur finally mein apna listener band karta hai. `metadata.py` supported resource deletes try karta hai aur apna listener band karta hai; unsupported metadata us phenkne layak process ke saath gayab hota hai. `.lab/` sirf endpoint/ledger ka saboot rakhta hai. Shared reset, asli AWS, user credentials ya anjaane process ka band hona nahi.

Aaj ki architecture ki limits: aam Valkey/Redis OSS async replicas failover par haal ke writes kho sakti hain; Memcached ki node-based sharding replicated durable database nahi. ElastiCache Valkey 9.0+ (cluster mode enabled, node-based) mein ab alag se set hone wale durable Multi-AZ-log options hain (sync vs async); durability TTL/eviction band nahi karti. MemoryDB bhi durable in-memory database ka candidate hai. Yeh lab purane node-based 8.0 metadata fixture use karti hai; in managed durability modes mein se koi nahi chalaya jaata.

Primary references checked 2026-10-26: [cache write/invalidation](https://docs.aws.amazon.com/prescriptive-guidance/latest/dynamodb-elasticache-integration/cache-write.html), [Multi-AZ](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/AutoFailover.html), [current durability](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Durability.Options.html), [serverless/deployment](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.corecomponents.html), [DAX networking/TLS](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.create-cluster.cli.html).
