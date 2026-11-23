# Lab 40 · Wahi thumbnail do baar mila. Usage kitna hai?

Worker ek Standard SQS queue se p7 ka job padhta hai. Usage likhne ke baad pehli delivery par worker message delete nahi karta. Lab visibility ko 0 karti hai. Doosre receive mein wahi MessageId aur receive count 2 milte hain.

## Chalao

Repo root se ye command chalao. Python apna Moto server khaali loopback port par kholta hai. Dummy credentials, config aur log har run ki alag directory mein bante hain.

```bash
./docker-labs/.venv/bin/python -I docker-labs/40-idempotent-consumer/lab.py
```

## Worker ka faisla

| Test | DynamoDB ki strong read ya SQS ka result |
|---|---|
| Har delivery par seedha ADD | Ek job ka total 2 |
| Nayi ginti se shuru karo. Conditional Put aur ADD ek transaction mein do baar bhejo | Marker ki condition doosri baar fail hui. Total 1 |
| Producer wahi operation phir send kare | MessageId naya tha. Total 1 raha |
| Usi photo ka v2 aaye | Nayi key se total 2 hua |
| Purani key ke saath doosri photo aaye | Worker ne ack roka. Teen receives ke baad wahi payload DLQ mein mila |
| Total item missing ho | Counter ki condition fail hui. Naya marker bhi nahi bana |

Worker marker ki key mein tenant, photo aur version rakhta hai. Jab sirf marker ki condition fail ho, worker saved input ko strong read se milaata hai. Matching duplicate par ack milta hai. Doosre cancel reasons worker tak wapas jaate hain. Table ki transaction marker aur usage ke liye hai. External side effects ka apna duplicate check chahiye. [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)

## Laptop par mila output

Moto 5.2.4 aur boto3 1.43.118 ke saath Python worker ne local APIs chalaayi. Teen receives lab ki DLQ policy hai. Browser mission mein source ki policy paanch receives ki hai. Actual Lambda poller, AWS par load aur Docker runtime ka test baaki hai. Run log `.overhaul-evidence/lab40-runs/run-*/lab.log` mein milta hai.

```text
OWNED MOTO http://127.0.0.1:33445
PASS Same MessageId mila, receive counts 1 aur 2. Seedhe ADD par total 2.
PASS Same MessageId mila, receive counts 1 aur 2. Conditional Put + counter ek transaction mein: total 1.
PASS Naya MessageId, wahi operationId aur payload: total 1.
PASS Usi photo ka naya version alag operation hai: total 2.
PASS Wahi key par doosri photo: 3 receives ke baad payload DLQ mein mila. Total 2 raha.
PASS Counter ki condition fail hui. Marker nahi likha gaya aur total 2 raha.
HOST CHECK Python worker ne local SQS aur DynamoDB APIs chalayi. Visibility 0 se retry turant karaya.
GAP Lambda poller, asli retry timing aur AWS ki live concurrency is run mein test nahi hui.
PASS CLEANUP READBACK tables=0 queues=0
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```
