# Lab 37 · PixShare ki teen log lines kahan gayin?

Ek local Moto server par CloudWatch Logs ko teen requests bhejo. S3 se gzip object padho aur log lines ki IDs milao. OpenSearch domain ki saved settings bhi dekho.

## Lab chalao

Repo root mein lab ki Python environment se command chalao. Script apna loopback port, dummy credentials aur run ki alag config banaati hai.

```bash
./docker-labs/.venv/bin/python -I docker-labs/37-log-pipeline-firehose/lab.py
```

| Kahan dekho | Kya milega |
|---|---|
| `raw/` | Khaali pattern wali subscription Firehose ke S3 stream ko batch bhejti hai. Gzip ke andar teen source event IDs, levels aur request IDs padhe jaate hain. Raw prefix ki 90 din ki expiry bhi readback mein milti hai. |
| `probe/` | Doosra S3 stream sirf filter ki jaanch ke liye hai. WARN aur ERROR ka pattern save hua. Is Moto version ne INFO bhi bheja. |
| `docs/` | Python host raw envelope kholta hai. WARN aur ERROR ka ek-ek JSON record Direct PUT wale test stream ko deta hai. S3 mein dono records ke event IDs aur request IDs milte hain. |
| `pix-logs` | Domain ki data nodes, master nodes, AZ, encryption aur gp3 settings padhi jaati hain. Moto ne Firehose ka OpenSearch destination create karte waqt error diya. |
| Cleanup | Script test objects, bucket, streams, group, domain aur IAM roles hataati hai. Phir list APIs aur band listener check karti hai. |

## AWS mein hot route

D5 ke design mein filtered subscription Lambda ko batch deti hai. Lambda har matching event ka alag document Firehose ko deti hai. Firehose docs ko OpenSearch aur `matched/` backup tak bhejta hai. CloudWatch ka poora gzip envelope seedha OpenSearch destination par supported nahi hai. [AWS Firehose ki OpenSearch delivery guide](https://docs.aws.amazon.com/firehose/latest/dev/data-not-delivered-to-es.html)

Is lab ka `docs/` host check splitter ke output ki shape dikhaata hai. Docker, Lambda invocation, AWS ke buffer ka waqt aur search index ki query is run mein test nahi hue. Har run ka log `.overhaul-evidence/lab37-runs/run-*/lab.log` mein milta hai.

## Laptop par mila output

Moto 5.2.4 aur boto3 1.43.118 par yeh output mila. Har run mein port badalta hai.

```text
OWNED MOTO http://127.0.0.1:43507
PASS S3 raw/ ki expiry 90 din hai.
PASS Raw aur filtered probe ke pattern aur ARN mile.
PASS Logs → Firehose → S3: gzip kholne par INFO p7, WARN p8 aur ERROR p9 mile.
GAP Moto ke hot-probe mein INFO p7 bhi aaya. Saved pattern ne delivery par filter nahi kiya.
PASS HOST CHECK Python ne batch khola. Do alag Firehose records ke JSON S3 mein mile.
PASS OpenSearch metadata mein 3 data nodes, 3 masters, 3 AZ, encryption aur 30 GB gp3 per data node mile.
GAP Firehose ne OpenSearch destination configuration nahi pehchaana (InvalidArgumentException). Index write test nahi hua.
PASS CLEANUP READBACK {"groups": 0, "streams": 0, "domains": 0, "buckets": 0, "roles": 0}
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```
