# Lab 34 · Asha ki 12 posts

Ek hi viewer ki posts do raaston se padho. DynamoDB Query ko viewer ki partition key do. Phir poori table par Scan chala kar wahi viewer filter karo. Dono jawaab ke saath har page ka kaam bhi gino.

## Lab chalao

Project root mein lab ki Python venv se chalao. Lab apne khaali localhost port par Moto shuru karti hai. Dummy credentials aur config run folder mein bante hain.

```bash
./docker-labs/.venv/bin/python -I docker-labs/34-polyglot-data/lab.py
```

Venv pehli baar banaane ke liye project root mein ye commands chala sakte ho.

```bash
python3 -m venv docker-labs/.venv
docker-labs/.venv/bin/pip install 'moto[server]==5.2.4' boto3
```

## Kya milana hai

1. Lab 32 viewers ki 12-12 posts daalti hai. Primary key `userId` aur `postKey` hai. Doosre index `byCreator` ki keys `creatorId` aur `postKey` hain. Har post ki caption mein 900 ASCII letters hain.
2. Dono reads eventually consistent hain. Page limit 32 items hai. Lab `LastEvaluatedKey` ke saath aage padhti hai. Khaali result page par bhi key bachi ho toh read jaari rehti hai. Har page ke `ScannedCount` aur `ConsumedCapacity.CapacityUnits` ko jodo. Dono reads ke sabhi rows aur attributes milne chahiye. [DynamoDB Scan](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html) · [Query pagination](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html)
3. PITR chalu karke full export lo. Lab export ke status ka wait karti hai, phir S3 ki gzip data file kholti hai. Export ki sabhi 384 rows original rows se milti hain. S3 par Athena chalaane ke liye data files ke prefix aur DynamoDB JSON ke typed fields se milta schema chahiye. [Export ka output](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/S3DataExport.Output.html)
4. Isi test table par creator index dobara banta hai. Base rows bachi rehti hain. Ek post ko doosre viewer u42 ke feed mein bhi rakho. Copy par authorId hai. GSI key creatorId sirf original row par hai. Creator index se ab bhi c3 ki 96 posts milti hain. Aakhir mein Moto mein encrypted Aurora PostgreSQL cluster banta hai. Cluster readback mein koi writer instance nahi hai. Resources hatne aur port band hone ka check bhi log mein hai.

## Laptop par mila output

Time poore paginated call ka hai. Laptop, Moto aur page count timing par asar daalte hain. Is run mein Moto ne har page par 1 unit lautayi. AWS par size aur consistency ke hisaab se read units lagti hain. AWS ke $/million rate ko Moto ki units par laga kar production bill mat nikaalo. [DynamoDB read units](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html)

```text
OWNED MOTO http://127.0.0.1:37695
PASS feed aur byCreator ki dono keys mili.
HOST CHECK query: pages=1 read=12 returned=12 MotoUnits=1 time=6.58 ms
HOST CHECK scan: pages=12 read=384 returned=12 MotoUnits=12 time=55.03 ms
PASS Query aur filtered Scan se wahi 12 posts mili. Scan ne 384 items dekhe.
PASS pix-feed par PITR chalu hai.
PASS Moto export poora hua.
PASS S3 ki gzip file mein 384 rows aur unke attributes mile.
PASS Doosre viewer ki feed mein bhi wahi post mili.
HOST CHECK query: pages=3 read=96 returned=96 MotoUnits=3 time=38.59 ms
PASS byCreator par c3 ki 96 posts mili. Viewer ki copy index mein dobara nahi aayi.
PASS Aurora cluster ki settings mili. Writer instances zero hain.
GAP Time laptop aur Moto ka hai. MotoUnits AWS ka bill nahi naapte. SQL writer aur Athena query nahi chale.
PASS CLEANUP READBACK {"table": false, "bucket": false, "cluster": false}
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```

Har run ka log `.overhaul-evidence/lab34-runs/run-*/lab.log` mein milta hai. SQL login, Athena execution, AWS latency aur AWS billing ki jaanch baaki hai.
