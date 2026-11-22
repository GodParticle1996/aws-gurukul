# Lab 35 · Ek photo ki edits aur analytics ka replay

PixShare ki render queue aur feed queue ko ek hi crop ki apni copy chahiye. Pehle ek edit do baar publish karo. Phir dono queues par body, photo group aur edit ID milao. Kinesis mein do readers se wahi records padho.

## Lab chalao

Project root mein lab ki Python venv se chalao. Lab apne khaali localhost port par Moto shuru karti hai. Har run ke dummy credentials, config aur output `.overhaul-evidence/lab35-runs/` ke ek naye folder mein milte hain.

```bash
./docker-labs/.venv/bin/python -I docker-labs/35-fifo-ordering-fanout/lab.py
```

Agar venv pehli baar bana rahe ho, toh pehle project root mein ye commands chalao.

```bash
python3 -m venv docker-labs/.venv
docker-labs/.venv/bin/pip install 'moto[server]==5.2.4' 'boto3==1.43.118'
```

## Kya milana hai

1. SNS FIFO topic ki do subscriptions hain. Har queue ki policy sirf us topic ko bhejne ka access deti hai. Raw delivery chalu hone par worker ko seedha edit JSON milta hai. [SNS se SQS delivery](https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html)
2. Producer p7-v1, p8-v1, p7-v1 aur p7-v2 bhejta hai. Doosri p7-v1 pehli edit ka retry hai. Dono baar group aur dedup ID wahi hain. Har queue mein teen alag edits milni chahiye. p7 ke liye v1 ke baad v2 chahiye. p8 ki edit apne group mein hai. [FIFO groups](https://docs.aws.amazon.com/sns/latest/dg/fifo-message-grouping.html) · [Paanch minute ki dedup](https://docs.aws.amazon.com/sns/latest/dg/fifo-message-dedup.html)
3. Kinesis mein p7 ki do edits ek partition key se jaati hain. Lab pehle put ka sequence doosre put ko deti hai. Do readers usi shard par apne `TRIM_HORIZON` iterator se shuru karte hain. Har page se agla iterator milta hai. Pehla sequence save ho chuka ho toh `AFTER_SEQUENCE_NUMBER` se v2 milti hai. [Kinesis shard iterator](https://docs.aws.amazon.com/kinesis/latest/APIReference/API_GetShardIterator.html)
4. Lab resources hataakar topic, subscription, queue aur stream ki lists padhti hai. Aakhir mein apna Moto server band karke port bhi check karti hai.

## Laptop par mila output

Moto 5.2.4 aur boto3 1.43.118 par mila output neeche hai. Har run par localhost ka port badal sakta hai.

```text
OWNED MOTO http://127.0.0.1:43777
PASS pix-render.fifo ki subscription raw body bhejti hai.
PASS pix-render.fifo FIFO aur topic policy mili.
PASS pix-feed.fifo ki subscription raw body bhejti hai.
PASS pix-feed.fifo FIFO aur topic policy mili.
PASS pix-render.fifo: 4 publishes par 3 raw edits. p7=[1, 2], p8=[1].
PASS pix-feed.fifo: 4 publishes par 3 raw edits. p7=[1, 2], p8=[1].
PASS Kinesis ON_DEMAND stream ACTIVE hai.
PASS Pehla reader: p7 ke wahi v1 aur v2 mile.
PASS Doosra reader: p7 ke wahi v1 aur v2 mile.
PASS v1 ke checkpoint ke baad sirf v2 mili.
HOST CHECK Python ne dono queues ke groups, edit IDs aur replay ke sequence numbers milaaye.
GAP Moto ka chhota run AWS ki throughput, retry timing, IAM enforcement ya billing nahi naapta.
PASS CLEANUP READBACK {"topics": 0, "subscriptions": 0, "queues": 0, "streams": 0}
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```

## Run ki had

Python ne localhost par Moto APIs chalaayi aur unse laute records padhe. Docker is run mein nahi chala. Chhote run se AWS ka sustained throughput, retry ka waqt, IAM policy enforcement ya bill nahi naap sakte. Worker ke DB save ko dobara lagne se rokna app ka alag test hai.
