# Lab 36 · PixShare ka review phir chalao

Teen uploads ek Classic EventBridge bus par bhejo. Premium review ko chhota JSON chahiye. Audit ko har upload ka poora event chahiye. Phir sirf review rule ko ek purani window replay karke queue se padho. Ek alag SQS inbox ka Pipe Standard Step Functions workflow se jodo.

## Lab chalao

Project root mein local venv se chalao. Lab apna khaali loopback port leti hai. Dummy credentials, config aur log har run ke liye `.overhaul-evidence/lab36-runs/` mein bante hain.

```bash
./docker-labs/.venv/bin/python -I docker-labs/36-event-bus-replay/lab.py
```

Pehli baar venv banaane ke liye project root mein chalao.

```bash
python3 -m venv docker-labs/.venv
docker-labs/.venv/bin/pip install 'moto[server]==5.2.4' 'boto3==1.43.118'
```

## Output kaise padhein

| Check | Sample se kya milna chahiye |
|---|---|
| Pattern | p7 premium, p8 basic, p9 premium. Review ka pattern true, false, true deta hai. Moto ne `TestEventPattern` mein Result field nahi diya. Dono queues ka actual output bhi dekho. |
| Live delivery | Review queue mein sirf p7 aur p9 ka `uploadId` aur `tier` hai. Audit queue mein teen poore envelopes hain. |
| Archive | Saat din ki retention hai. Original bus aur time window chuni hai. Window mein p7 aur p8 hain. Sirf review rule ko replay diya hai. AWS contract par sirf p7 ka chhota JSON review tak jaata hai. |
| Pipe | Alag inbox mein JSON body hai. Pehle galat filter `detail.tier` padho. Phir `body.tier` wala filter lagao. Pipe ka role queue ko padh sakta hai aur workflow ko start kar sakta hai. |
| Cleanup | Lab apni rules ke targets, roles, queues, bus, archive, workflow aur Pipe hataati hai. Completed replay ki history alag rehti hai. Moto band hone par local server ki state khatam ho jaati hai. |

AWS par archive tak event pahunchne mein der ho sakti hai. AWS replay se pehle das minute rukne ko kehta hai. Queue target par current rule ka transformer lagta hai. Replay ki har delivery par worker ki stable business key bhi check karo. [Archive aur replay](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html) · [Input transformer](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html)

## Laptop par mila output

Moto 5.2.4 aur boto3 1.43.118 ka output hai. Port har run par badalta hai.

```text
OWNED MOTO http://127.0.0.1:43397
PASS Classic bus ka saat din wala archive mila.
GAP TestEventPattern ne teen calls mein Result field nahi diya.
PASS Review queue ko sirf p7 aur p9 ke chhote JSON mile.
PASS Audit queue ko teen poore events mile.
PASS Replay COMPLETED hua. Saved destination mein sirf premium rule hai.
READBACK replay review=['p7', 'p9'] audit=['p7', 'p8', 'p9']
GAP Replay mein chuni window ke bahar IDs: ['p9']. Audit copies: 3. Review par poore envelopes: 2.
PASS HOST CHECK uploadId se ek hi upload ek baar gina.
PASS Pipe mein body.tier, SQS aur Standard workflow waapas padhe.
READBACK Pipe CurrentState=RUNNING
GAP Pipe readback mila. Poll ke dauran execution zero tha aur p10 source queue mein mila.
PASS CLEANUP READBACK {"customBuses": 0, "archives": 0, "queues": 0, "pipes": 0, "machines": 0, "pixRoles": 0}
READBACK Replay history COMPLETED. Replay delete ki API nahi hai.
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```

## Moto mein kya hua

Live rule ne transformer lagaaya. Replay par Moto ne time window ke bahar p9 bhi bheja. Audit ko teen copies mili aur review ko chhote JSON ki jagah do poore envelopes mile. Python ne live aur replay deliveries mein uploadId se do alag uploads gine. Worker ka DB transaction is lab mein nahi chala.

Pipe ki state RUNNING thi. Match karta p10 source queue mein hi mila aur chhote poll mein workflow executions zero the. Is run mein Pipe ki settings verify hui. Docker, AWS delivery latency, IAM enforcement aur workflow execution is run se verify nahi hue. [SQS source aur filtering](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes-event-filtering.html) · [Workflow target](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes-event-target.html)
