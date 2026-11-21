# Lab 32 · Mumbai se Hyderabad ka checkout drill

Mumbai band ho toh Hyderabad mein order lene ke liye password, key aur servers pehle se chahiye. Is lab mein Terraform ke `aws.primary` aur `aws.standby` providers ek hi local Moto server par alag Regions banaate hain. Dono Regions ki settings alag padhi jaati hain.

## Chalao

Project root se command chalao. Lab ko Python environment mein Moto aur boto3, Terraform aur pehle se downloaded AWS provider 6.70.0 chahiye. Runner Terraform ko PATH mein ya project ke `.overhaul-evidence/tools/terraform` par dhoondhta hai. Lab 08 ke provider folder ki jagah apna local mirror dene ke liye `LAB32_PROVIDER_MIRROR` set kar sakte ho.

```bash
./docker-labs/.venv/bin/python -I docker-labs/32-region-drill-terraform/lab.py
```

1. `main.tf` mein dekho ki primary key ka ARN kis resource ko milta hai. Usi ID wali replica key ka ARN Hyderabad ka hota hai. Checkout secret ki replica ke liye woh Regional ARN maanga gaya hai.
2. Runner Hyderabad se test password padhta hai. Mumbai mein encrypted order ko Hyderabad mein kholne ki koshish bhi karta hai. Dono calls ka result alag dekho.
3. Terraform primary DNS record ko Mumbai ke `/ready` health check se jodta hai. Secondary par check nahi laga hai. Python pehle primary ko healthy aur phir unhealthy maan kar saved records mein se address chunta hai.
4. Hyderabad group ka min aur desired 3 hai. Host ka hisaab har server ko 100 orders/s deta hai. Asli server ki speed jaanchne ke liye app par load bhejna padega.
5. Aakhir mein Terraform destroy chalta hai. Runner Terraform state, DNS, ASG, secrets aur KMS key states dobara padhta hai. Har run ki files `.overhaul-evidence/lab32-runs/run-*/` mein hain. `drill.log` checks dikhata hai. `terraform.log` mein apply aur destroy hain.

## Asli output

2026-11-21 ke local run mein Terraform ne 13 resources banaye aur 13 hataaye.

```text
Apply complete! Resources: 13 added, 0 changed, 0 destroyed.
PASS same key ID mila, ARN secondary Region ka hai
GAP Hyderabad KMS Decrypt ne AccessDeniedException diya. Dono Regions mein decrypt ki permission alag jaancho.
GAP Mumbai key type after replication = REPLICA
PASS secret InSync hai aur secondary se TEST value mili
GAP Moto secret status mein KmsKeyId = alias/aws/secretsmanager. Key policy enforcement is run mein nahi maapi.
PASS probe ka apna DNS naam hamesha Mumbai par hai
PASS primary DNS record Mumbai ke /ready check se juda hai
PASS HOST CHECK primary healthy=True -> 192.0.2.10
PASS HOST CHECK primary healthy=False -> 192.0.2.20
PASS HOST CHECK standby budget 300 orders/s, drill load 300 orders/s
GAP DNS probes, EC2 boot, checkout load aur RTO/RPO ka live test baaki hai.
Destroy complete! Resources: 13 destroyed.
PASS CLEANUP READBACK Terraform state khaali hai
PASS CLEANUP READBACK group, zone aur health check hat gaye
PASS CLEANUP READBACK dono Regions mein secret ki list khaali hai
PASS CLEANUP READBACK ap-south-2 KMS PendingDeletion
PASS CLEANUP READBACK ap-south-1 KMS PendingDeletion
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```

## Emulator limits

- Moto ne replication ke baad Mumbai ki primary key ka type bhi `REPLICA` bataya. Pehle run mein isi wajah se Terraform destroy ka refresh ruka. Runner apne abhi-abhi bane local state se `destroy -refresh=false` karta hai aur phir APIs se cleanup padhta hai. Dono KMS keys deletion ke wait mein dikhin.
- Terraform ne secret ki copy ke liye Hyderabad ka key ARN bheja. Moto ne status mein `alias/aws/secretsmanager` lautaya. Hyderabad se test value mili. Requested key se secret encrypt hua, iska proof nahi mila. Alag order file ka cross-region decrypt bhi is run mein fail hua.
- DNS addresses course ke hain. Moto ke paas public DNS delegation ya live health probes nahi hain. Python ka switch, ek subnet ka ASG aur 300 orders/s ka hisaab local practice hai. Buyer ka order, multi-AZ runtime, cache expiry aur asli RTO/RPO alag drill maangte hain.
- Is run mein Terraform, Python aur Moto chale. Docker ki zaroorat nahi thi.
