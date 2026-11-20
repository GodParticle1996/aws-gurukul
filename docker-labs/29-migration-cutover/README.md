# Lab29 — chhota asli migration: full load, CDC, validation aur cutover

**Pain:** GodamTech ka orders DB move karna hai, par app band nahi kar sakte. Sirf full load karoge toh load ke dauran aaye orders chhoot jaayenge. Yeh lab ek chhota asli migration chalati hai aur dikhati hai ki CDC, validation aur cutover runbook kyun zaroori hain.

**Scope:** sirf local. "On-prem" source ek SQLite file hai (Python ka built-in `sqlite3`), target Moto 5.2.4 DynamoDB. Moto DMS sirf metadata rakhta hai (data nahi chalata), isliye full load, CDC replay aur validation host par Python karta hai. Asli AWS, Docker, shared 4566 server ya `~/.aws` nahi. Sab data TEST hai. Har emulator ki kami **GAP** line mein likhi hai.

## Chalao — app ke root folder se

```bash
./docker-labs/.venv/bin/python -I docker-labs/29-migration-cutover/lab.py
```

Runner apna naya `127.0.0.1` Moto server OS ke diye port par chalata hai, dummy `test` keys, lab ki apni credential/config files aur `AWS_MAX_ATTEMPTS=1` use karta hai. Resources ka naam `lab29-<number>` se shuru hota hai. SQLite file, mappings aur `app-config.json` `.overhaul-evidence/lab29-runs/run-<number>/` mein bante hain. Source endpoint ka password sirf dummy `TEST-only` hai; asli kaam mein Secrets Manager use karo.

## ex1 — source aur DMS metadata

SQLite mein 1000 TEST orders bante hain. Triggers har insert/update/delete ko `changes` table mein ek LSN (kram number) ke saath likhte hain: yahi chhota sa "redo log" hai jisse CDC padhega. Phir asli CLI se Moto par DMS instance, do endpoints aur `full-load-and-cdc` task bante hain. Asli output (2026-11-20, naam chhota kiya):

```text
PASS 1 source mein 1000 TEST orders, triggers change log likh rahe
$ aws dms start-replication-task --replication-task-arn arn:aws:dms:ap-south-1:123456789012:task:lab29-...-task --start-replication-task-type start-replication --query ReplicationTask.Status
"running"
PASS 2 Moto par DMS instance, endpoints aur full-load-and-cdc task ka metadata bana
GAP describe-table-statistics exit 255 aur modify-replication-task exit 255 -- Moto DMS mein nahi (500); data bhi Moto DMS nahi chalata
```

👉 Moto task ko "running" dikhata hai, par koi data nahi chalta, aur table statistics/modify bane hi nahi. App ka simulator asli DMS ke status steps, waiters aur table statistics ka model chalata hai.

## ex2 — full load, aur woh kya chhod deta hai

Full load shuru hote waqt source ki copy li jaati hai. Load ke dauran app chalti rehti hai: 25 naye orders, 4 badlav aur 1 delete.

```text
FULL LOAD rows 1000 | load ke dauran source mein naye changes: 30
PASS 4 full load: target mein 1000 rows (load shuru hone ke waqt ki copy)
VALIDATION after full load only: mismatched rows 30 (CDC ke bina naye changes chhoot gaye)
```

👉 Sirf full load par cutover karte toh 30 rows galat hoti. Isi liye DMS mein `full-load-and-cdc` chahiye.

## ex3 — CDC replay aur validation

Load ke baad `changes` table ke LSN marker ke aage wale changes order mein lagaye jaate hain. Replay do baar chalaya jaata hai, taaki dikhe ki dobara lagane se result nahi bigadta (idempotent).

```text
CDC REPLAY applied 30 changes; dobara replay 30 ; last LSN 1030 ; mismatches 0
PASS 6 CDC ke baad source aur target barabar (1024 rows, checksums match), replay idempotent
```

👉 Validation sirf ginti nahi: har row ka SHA-256 checksum compare hota hai. Asli DMS validation bhi rows compare karta hai, par business logic test nahi karta.

## ex4 — cutover runbook

```text
CUTOVER writes rukein: True | CDC lag (bache changes): 0
FINAL VALIDATION source fingerprint 5c97d2f3d168e702 | target fingerprint 5c97d2f3d168e702
SWITCH app-config -> dynamodb:lab29-...-orders | smoke test order 1001: TEST-cust-new-1 | source rollback ke liye read-only bacha
```

👉 Order: writes roko (app read-only connection par) → CDC lag 0 → aakhri validation (poore table ka fingerprint) → app config switch → smoke test. Source file delete nahi hoti: rollback window ke liye read-only bachti hai.

## ex5 — NAS folder ka S3 sync

```text
$ aws s3 sync .../nas s3://lab29-...-nas/nas/
upload: .../nas/invoices/TEST-inv-2.txt to s3://lab29-...-nas/nas/invoices/TEST-inv-2.txt
upload: .../nas/invoices/TEST-inv-0.txt to s3://lab29-...-nas/nas/invoices/TEST-inv-0.txt
upload: .../nas/invoices/TEST-inv-1.txt to s3://lab29-...-nas/nas/invoices/TEST-inv-1.txt
$ aws s3 sync .../nas s3://lab29-...-nas/nas/
upload: .../nas/invoices/TEST-inv-1.txt to s3://lab29-...-nas/nas/invoices/TEST-inv-1.txt
S3 SYNC pehli baar 3 files; dusri baar 1 file (sirf badli hui)
BEHAVIOR CHECKS 10
```

👉 Pehla sync sab bhejta hai, dusra sirf badli file. Asli migration mein yahi "pehle bada copy, phir cutover par chhota delta" wala pattern DataSync karta hai (verification aur scheduling ke saath).

## Cleanup — sirf apne resources

```text
CLEANUP READBACK {"tables": [], "buckets": [], "tasks": [], "endpoints": [], "instances": []}
PASS 11 apne table, bucket aur DMS resources saaf
OWNED MOTO STOPPED / LISTENER CLOSED
```

## Emulator ki limits (imaandar list)

- Moto DMS koi data nahi chalata; task "running" sirf metadata hai.
- `describe-table-statistics` aur `modify-replication-task` Moto 5.2.4 mein 500 dete hain.
- Asli Oracle, supplemental logging, Aurora, schema conversion, MGN, DataSync agent ya network transfer nahi.
- SQLite triggers asli redo log jaise sirf dikhane ke liye hain; asli CDC ka time, lag aur load alag hota hai.

Asli AWS par DMS ka kaam optional, alag manzoori wala aur bill hone wala hai; level ka homework steps aur cleanup batata hai.

Sources: [DMS full load + CDC](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html), [DMS validation](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Validating.html), [DMS Schema Conversion](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_SchemaConversion.html), [Oracle source supplemental logging](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Source.Oracle.html), [Migration Hub availability](https://docs.aws.amazon.com/migrationhub/latest/ug/migrationhub-availability-change.html), [Application Discovery Service availability](https://docs.aws.amazon.com/application-discovery/latest/userguide/application-discovery-service-availability-change.html), [MGN free period](https://aws.amazon.com/application-migration-service/faqs/), [DataSync pricing](https://aws.amazon.com/datasync/pricing/).
