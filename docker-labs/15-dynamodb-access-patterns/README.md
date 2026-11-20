# Lab 15 — cart keys, safe backfill aur atomic checkout

**Pain:** ShopKaro sale ke 950 carts ka logical partition key `active` hai. Table ki extra capacity hot access pattern ko apne aap theek nahi karti. Primary key wahin par nahi badalti; alag table aur check kiya migration chahiye.

**Scope:** pehle se bana local Moto 5.2.4, dummy credentials, 1,000 asli items, asli AWS CLI + boto3 requests. Lab logical keys ginti hai aur poore item attributes check karti hai. Ginti physical partitions, throttling, latency ya production throughput nahi naapti.

## Setup — exact commands

```bash
cd aws-gurukul/docker-labs
# Existing Moto absent ho tab ./start-moto.sh; shared reset mat chalao.
source env.sh
cd 15-dynamodb-access-patterns
../.venv/bin/python -I lab.py setup
```

Controller ko loopback 4566 aur test/test credentials chahiye, **har CLI/SDK service** ko usi endpoint aur ap-south-1 par pin karta hai, profiles/session tokens unset karta hai aur instance metadata band karta hai. Credential/config paths `.lab/` ke andar rehte hain; `~/.aws` mein kuch nahi likha jaata. Pehle se bana lab venv boto3/aws deta hai; koi install ya Docker nahi chahiye.

`setup` apni exact table names `.lab/resources.json` mein save karta hai, `status` HASH + `cartId` RANGE ke saath v1 banata hai, aur BatchWriteItem se 25-25 ke chunks mein 1,000 carts likhta hai. UnprocessedItems ko limit wale exponential-backoff retries milte hain; retries khatam hone par saaf ruk jaata hai. Har cart mein sellerId aur numeric updatedAt/expiresAt/total/version bhi hai. Bane `lab15-<timestamp>` naam badalte rehte hain.

Asli captured output:

```text
SOURCE {"items": 1000, "partitionKeyCounts": {"active": 950, "saved": 50}}
```

👉 950 items ek hi **logical** key share karte hain. Hot hona requests ke ek jagah jamaa hone, item size aur physical partition ki capacity par depend karta hai, sirf rows ki ginti par nahi. Adaptive capacity aur splitting madad kar sakte hain; high-cardinality cartId ko bhi bikhra traffic chahiye.

## ex1 — migration aur safety exercises chalao

Read `lab.py`, then type:

```bash
../.venv/bin/python -I lab.py exercises
```

Controller har poora CLI command print karta hai. Operations is order mein chalte hain:

1. Poora source Scan page-by-page padho. cartId HASH aur PAY_PER_REQUEST ke saath `v2` banao; table ACTIVE hone ka wait karo.
2. Har typed item ko 25-write batches mein backfill karo. Sirf Count nahi, saare attributes compare karo. Source waisa hi rehta hai.
3. `bySeller` GSI jodo (sellerId HASH, numeric updatedAt RANGE, ALL projection). Table status se alag **IndexStatus ACTIVE** dekho.
4. Key se seller-1 query karo. GSI par `--consistent-read` try karo aur expected validation error dekho.
5. RecoveryPeriodInDays 35 ke saath PITR on karo; config wapas padho. Numeric epoch-seconds expiresAt par TTL on karo; status dekho.
6. `attribute_not_exists(cartId)` ke saath cart-new put karo. Usi condition ke saath total 0 wala duplicate cart-new try karo. Total 499 wapas padho aur seller-1 dobara query karo.
7. Alag checkout table banao. SKU#kurta ko available 1 ke saath seed karo. Transaction quantity 2 + order banana try karta hai: condition fail, dono actions wapas. Doosre token ke saath quantity 1 dobara try karo: stock 0 aur order quantity 1 ek saath commit.
8. Safal token dobara chalao, taaki likhi hui Moto idempotency ki kami dikhe.

Asli captured selections:

```text
BACKFILL {"sourceItems": 1000, "targetItems": 1000, "equalAttributes": true, "distinctCartKeys": 1000, "maxItemsPerLogicalKey": 1}
```

```json
[{"Name":"bySeller","State":"ACTIVE"}]
```

Seller query ne shuru mein Count 100, ScannedCount 100 aur FirstCart cart-0001 diya. GSI strong read ne yeh diya:

```text
An error occurred (ValidationException) when calling the Query operation: Consistent reads are not supported on global secondary indexes
```

PITR/TTL readback:

```json
{"Status":"ENABLED","Days":35}
{"TimeToLiveDescription":{"TimeToLiveStatus":"ENABLED","AttributeName":"expiresAt"}}
```

Conditional duplicate aur asli bacha hua item:

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

👉 BatchWriteItem transaction **nahi** hai, aur PutRequest pehle se bane item ko overwrite kar sakta hai. Conditions har Put/Update ya transaction request par lagti hain; ek conditional call hamesha ka unique/business constraint nahi lagata. Transactions ek hi account/Region mein 100 alag items/4MB tak chalti hain; transaction units ka kharcha standard units ka 2× hai. Do actions ek hi item ko target nahi kar sakte.

## ex2 — emulator ki limits samjho

- Is run mein Moto table/index/TTL/PITR metadata turant deta hai. Asli creation, GSI backfill aur TTL ki readiness mein time lagta hai. `table-exists` sirf table ka wait karta hai; index status alag se dekho.
- Physical partition placement, adaptive/burst capacity, throttle, global replication, asli latency, TTL ka purana hona/delete ya purani PITR recovery check nahi hui. TTL expire hue items din bhar reh sakte hain; app ki expiry checks phir bhi zaroori hain. PITR **nayi table** mein restore karta hai, set ki 1–35 din ki window aur asli restorable time ki limit ke andar.
- Moto ne `lab15-success` ko conditions dobara jaanch kar replay kiya aur TransactionCanceledException `[ConditionalCheckFailed, ConditionalCheckFailed]` diya. Asli AWS mein wahi ClientRequestToken 10 minute tak idempotent hai; us window mein badle parameters IdempotentParameterMismatch dete hain. Token expire hone ke baad bhi business idempotency rakho.
- Lab ke writers ruke hue hain. Live writes ke liye Scan migration ka snapshot nahi, ConsistentRead ke saath bhi nahi. Production ko review kiya dual-write/CDC, delete handling, milaan, catch-up, control kiya cutover aur rollback chahiye. Acceptance tak purani table bachao; is lab se deploy hue app ka cutover mat maano.
- Migration ke baad GSI projection/consistency aur har key ka traffic maayne rakhta hai. Ek hot sellerId bottleneck ko GSI mein le ja sakta hai. GSI readback turant dikhne ki guarantee prove nahi karta.

## Cleanup — sirf is run ki tables

```bash
../.venv/bin/python -I lab.py cleanup
```

Sirf setup ke save kiye exact naam delete hote hain, unke hatne ka wait hota hai aur saaf ledger likha jaata hai. Asli final output:

```text
OWNED_TABLES_REMAIN []
```

Shared Moto reset use mat karo. Beech mein fail ho toh `.lab/resources.json` rakho, print hua error dekho aur naye setup se pehle scoped cleanup chalao. Exercises do baar chalane par pehle se bana v2 mil sakta hai; poore replay ke liye cleanup/setup use karo.

Primary references checked 2026-10-26: [partition keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html), [batch writes](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html), [transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html), [GSI lifecycle](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.OnlineOps.html), [TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html), [PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html).
