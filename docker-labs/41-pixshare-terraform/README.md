# Lab 41 · PixShare core ko Terraform se banao aur review karo

Ek p7 photo S3 mein jaati hai. Thumbnail job SNS se SQS tak aati hai. Review ki zaroorat waali photo ka alag EventBridge event review queue mein jaata hai. `lab.py` Terraform apply karta hai, APIs se setup padhta hai, dono raaste chalaata hai aur destroy ke baad cleanup check karta hai.

## Chalao

Is run mein Terraform 1.13.5, HashiCorp AWS provider 6.70.0, Moto 5.2.4 aur boto3 1.43.118 the. Repo root se command chalao.

```bash
./docker-labs/.venv/bin/python -I docker-labs/41-pixshare-terraform/lab.py
```

Runner pehle `LAB41_TERRAFORM` aur phir PATH mein Terraform dhoondhta hai. Uske baad worktree mein `.overhaul-evidence/lab41-runs/tools/terraform` aur `.overhaul-evidence/tools/terraform` dekhta hai.

Provider ke local mirror ka path `LAB41_PROVIDER_MIRROR` mein de sakte ho. Agar variable khaali hai toh runner pehle `.overhaul-evidence/lab41-runs/tools/mirror` dekhta hai. Phir Lab 08 ka `docker-labs/08-three-tier-terraform/.terraform/providers` dekhta hai. Mirror mein `registry.terraform.io/hashicorp/aws` ke andar 6.70.0 ka package chahiye. Naye checkout mein is lab ke folder se `terraform providers mirror /tmp/pixshare-provider-mirror` chalao. Phir repo root se runner chalaate waqt `LAB41_PROVIDER_MIRROR=/tmp/pixshare-provider-mirror` do. Is download ke liye AWS account ki zaroorat nahi hai. [Terraform provider mirror](https://developer.hashicorp.com/terraform/cli/commands/providers/mirror)

Har run ki apni directory, provider config, state aur dummy credentials hain. AWS provider sirf runner ke apne loopback Moto port se baat karta hai. Evidence `.overhaul-evidence/lab41-runs/run-*/` mein milta hai. `lab.log` mein review hai. `terraform.log` mein apply aur destroy ka poora output hai.

## Kya dekhna hai?

| Raasta | Probe aur result |
|---|---|
| CloudFront → S3 | Chaar public-access blocks, private origin ki setting aur distribution tak scoped bucket policy padhi. Direct S3 API par p7 ki write aur read mili. OAC object par SigV4 tha. Distribution ke origin readback mein Moto ne OAC ID nahi di. |
| SNS → thumbnail queue | Queue policy mein isi SNS topic ko bhejne ki permission mili. Raw subscription ne job body di. Worker ko write ke baad pehli delivery ka delete nahi mila. Visibility 0 karke doosri receipt li. Dono ka MessageId same tha. |
| Worker → DynamoDB | Lambda API ke code hash aur worker zip ka hash mile. Host ne us zip se worker nikaalkar chalaaya. Marker aur increment ki transaction ke baad strong read 1 thi. Same operation ki doosri delivery par handler ne duplicate diya. |
| EventBridge → review queue | Queue policy ka source isi rule ka ARN tha. P7 ka review flag true aur p8 ka false tha. Queue mein sirf p7 mila. Dono publish paths alag test hue. |
| Lambda aur cleanup | Worker ki table, handler, cap 4, batch size 1 aur source ki DLQ limit 5 mili. Mapping jaanbujhkar disabled thi taaki host dono receipts khud padhe. Terraform ne 20 resources destroy kiye. State aur service lists khaali milin. |

Lab ek Region ka core banaati hai. Browser ka global budget model, live Region switch, real viewer, Lambda execution aur Docker runtime alag hain. IAM settings padhi gayin. Live permission enforcement test nahi hua.

## Laptop par mila output

```text
OWNED MOTO http://127.0.0.1:39019
PASS Terraform apply ke baad state mein 20 resources hain.
PASS S3 ke chaar public blocks mile. Policy mein sirf isi distribution ka images/* read hai.
GAP OAC ki SigV4 setting mili. Moto distribution ke origin readback mein OAC ID nahi aayi.
PASS S3 API se p7-v1 likha, padha aur hataaya. Edge hit aur viewer access live test nahi hue.
PASS Dono queue policies mein sahi source ARN aur queue ARN mile.
PASS Worker zip ka hash, handler, table, cap 4, batch 1 aur DLQ limit 5 mili. Local review ke liye mapping disabled hai.
PASS HOST CHECK SNS se job SQS mein mili. Usi MessageId ke receives 1 aur 2 par packaged worker ka DynamoDB total 1 tha.
PASS EventBridge ko p7 aur p8 mile. Review queue mein sirf p7 mila.
GAP Host ne handler chalaaya. Lambda runtime, CloudFront delivery, IAM enforcement aur global failover is run mein test nahi hue.
PASS CLEANUP READBACK {"state": 0, "buckets": 0, "distributions": 0, "oacs": 0, "tables": 0, "topics": 0, "queues": 0, "rules": 0, "functions": 0, "mappings": 0, "roles": 0, "logs": 0}
PASS OWNED MOTO STOPPED / LISTENER CLOSED
```
