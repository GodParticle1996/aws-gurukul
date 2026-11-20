# Lab30 — chhota data lake: Firehose, partitions, Glue catalog aur Athena

**Pain:** Neha ki weekly report orders RDS par chalti thi aur checkout dheema hota tha. Data lake mein report chalani hai, par scan kam rakhna hai. Yeh lab ek chhota lake banati hai aur dikhati hai ki local emulator kya karta hai aur kya nahi.

**Scope:** sirf local Moto 5.2.4. Asli AWS, Docker, shared 4566 server ya `~/.aws` nahi. Sab data TEST hai. Moto Glue catalog aur partitions rakhta hai, par crawler kuch nahi dhoondhta aur Athena SQL nahi chalata; woh **GAP** mein likhe hain. Query ka jawaab aur scan ka hisaab **HOST CHECK** mein Python se nikalta hai. Parquet ke liye library (pyarrow) installed nahi, isliye curated zone CSV mein hai.

## Chalao — app ke root folder se

```bash
./docker-labs/.venv/bin/python -I docker-labs/30-data-lake-athena/lab.py
```

Runner apna naya `127.0.0.1` Moto server OS ke diye port par chalata hai, dummy `test` keys, lab ki apni config aur `AWS_MAX_ATTEMPTS=1` use karta hai. Resources ka naam `lab30-<number>` se shuru hota hai. JSON inputs `.overhaul-evidence/lab30-runs/run-<number>/` mein bante hain.

## ex1 — Firehose se raw zone

60 TEST order events aur 1 kharab line Firehose (DirectPut) se S3 raw zone mein jaati hain. Prefix mein `dt=!{timestamp:yyyy-MM-dd}/` diya hai. Asli output (2026-11-20, naam chhota kiya):

```text
RAW OBJECTS ['raw/orders/dt=!{timestamp:yyyy-MM-dd}/2026/11/20/20/lab30-...-orders-1-2026-11-20-...']
PASS 1 Firehose ne 61 TEST records raw zone mein pahunchaye
GAP Firehose prefix literal raha: True -- asli Firehose !{timestamp:yyyy-MM-dd} ko date mein badalta hai
```

👉 Asli Firehose `!{timestamp:...}` ko date bana deta hai, aur dynamic partitioning se record ke field (jaise `dt`) par bhi folder bana sakta hai. Moto prefix ko jaisa ka taisa likh deta hai.

## ex2 — host ETL: kharab row hatao, din ke partitions banao

```text
ETL good rows 60 | bad rows hataye 1 | curated partitions {"2026-11-17": 609, "2026-11-18": 620, "2026-11-19": 610}
GAP Parquet library (pyarrow) installed: False -- curated zone CSV mein; asli lake mein Parquet column bhi chhodta
PASS 2 ETL ne 1 kharab row hataya aur 3 dt= partitions likhe
```

👉 Raw ko chhua nahi gaya; curated zone mein `dt=YYYY-MM-DD/` folders bane. Asli lake mein Glue ETL ya Athena CTAS se Parquet likhte, jisse column bhi chhode ja sakte hain.

## ex3 — Glue catalog aur crawler

Table `orders` (partition key `dt`) banti hai, aur `batch-create-partition` se pehle sirf 2 din catalog mein daale jaate hain.

```text
CATALOG partitions ['2026-11-17', '2026-11-18'] | S3 mein ['2026-11-17', '2026-11-18', '2026-11-19']
PASS 3 catalog mein sirf 2 partitions; teesra din S3 mein hai par catalog mein nahi
GAP crawler state RUNNING | partitions abhi bhi ['2026-11-17', '2026-11-18'] -- Moto crawler S3 nahi padhta; asli crawler teesra din jod deta
PASS 4 crawler ki kami pakdi; teesra partition haath se (batch-create-partition) joda
```

👉 Data S3 mein ho, par catalog mein partition na ho, toh Athena us din ko nahi dekhta. Asli AWS mein crawler, `MSCK REPAIR TABLE`, `ALTER TABLE ADD PARTITION` ya partition projection yeh kaam karte hain.

## ex4 — Athena workgroup aur query

```text
PASS 5 workgroup: enforce + per-query scan limit 10 MB save
MOTO query state SUCCEEDED | result rows 0 | DataScannedInBytes 0
GAP Moto Athena SQL nahi chalata: SUCCEEDED par result khaali
HOST CHECK jawaab {"DL/kurta-red": 15, "DL/saree-silk": 10, "KA/kurta-blue": 10, "KA/saree-silk": 15, "MH/kurta-blue": 10, "MH/saree-silk": 15, "RJ/kurta-red": 15, "RJ/saree-silk": 10}
HOST CHECK scan: bina partition 1839 bytes | dt filter ke saath 1230 bytes | 33 % kam
BEHAVIOR CHECKS 6
```

👉 Moto workgroup ki setting (enforce, scan limit) save karta hai, par query ka koi asli jawaab ya scan nahi deta. Host par 3 mein se 2 din padhne se scan 33% kam hua; asli lake mein 30 din ke data par 7 din ki query ka farak kahin bada hota hai, aur Parquet column chhod kar aur bachata hai.

## Cleanup — sirf apne resources

```text
CLEANUP READBACK {"buckets": [], "databases": [], "crawlers": [], "workgroups": [], "streams": []}
PASS 7 apne bucket, catalog, crawler, workgroup aur stream saaf
OWNED MOTO STOPPED / LISTENER CLOSED
```

## Emulator ki limits (imaandar list)

- Firehose ka `!{timestamp:...}` prefix nahi badalta; dynamic partitioning nahi.
- Glue crawler "RUNNING" dikhata hai par S3 nahi padhta, table/partition nahi banata.
- Athena query SUCCEEDED dikhati hai par koi SQL nahi chalta: result khaali, DataScannedInBytes 0.
- Parquet library installed nahi; Lake Formation permissions, Redshift, EMR aur QuickSight yahan nahi.

Asli AWS par lake banana optional, alag manzoori wala aur bill hone wala kaam hai; level ka homework steps aur cleanup batata hai.

Sources: [Athena pricing](https://aws.amazon.com/athena/pricing/), [partitioning data in Athena](https://docs.aws.amazon.com/athena/latest/ug/partitions.html), [partition projection](https://docs.aws.amazon.com/athena/latest/ug/partition-projection.html), [workgroup data limits](https://docs.aws.amazon.com/athena/latest/ug/workgroups-setting-control-limits-cloudwatch.html), [Glue crawlers](https://docs.aws.amazon.com/glue/latest/dg/add-crawler.html), [Firehose dynamic partitioning](https://docs.aws.amazon.com/firehose/latest/dev/dynamic-partitioning.html), [Redshift zero-ETL](https://docs.aws.amazon.com/redshift/latest/mgmt/zero-etl-using.html), [AWS Quick (QuickSight)](https://docs.aws.amazon.com/quick/latest/userguide/what-is.html).
