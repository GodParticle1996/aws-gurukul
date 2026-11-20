# 🧪 AWS Gurukul — Real Labs (laptop par local AWS)

App ke andar ka simulator commands ko "samajhne" ke liye hai. Yeh labs **asli `aws` CLI** aur **asli Terraform**
chalwati hain — bas AWS ki jagah tumhare laptop par chal raha **Moto** emulator jawab deta hai.

- 💸 **Bill $0.** Koi AWS account nahi chahiye, koi credit card nahi.
- `./reset.sh` chune hue emulator ki **sabhi labs** ka data mitaata hai. Sirf apni lab hataane ke liye us lab ka cleanup chalao.
- CLI asli hai. Jawaab Moto deta hai. Har lab ke README mein likha hai ki Moto kaunsa hissa chala paata hai.

## 1. Emulator chalao (ek baar, dono mein se ek tareeka)

**Docker hai:**

```bash
cd aws-gurukul/docker-labs
docker compose up -d
```

**Docker nahi hai** (sirf Python 3.10+ aur venv chahiye):

```bash
cd aws-gurukul/docker-labs
./start-moto.sh            # normal emulator, port 4566
./start-moto.sh iam        # sirf IAM labs ke liye — policies sach mein check hoti hain, port 4567
```

## 2. Terminal ko emulator ki taraf point karo (har naye terminal mein)

```bash
source env.sh              # aws + terraform → http://127.0.0.1:4566 , region ap-south-1 (Mumbai)

# Sirf IAM lab ke liye upar wale source ki jagah: source env.sh iam
aws sts get-caller-identity     # chal gaya? "Account": "123456789012" dikhega
```

`env.sh` sirf environment variables set karta hai: `AWS_ENDPOINT_URL`, dummy keys (`test`/`test`),
`AWS_DEFAULT_REGION=ap-south-1`. Docker ke bina chala rahe ho toh `.venv` ka `aws` CLI bhi PATH mein aa jaata hai.

⚠️ **Asli AWS keys is terminal mein kabhi mat daalna.** Asli AWS par wapas jaana ho toh naya terminal kholo.

## 3. Lab chalao

Har lab ka apna folder aur `README.md` hai: exercises, commands, aur **asli run ka output** (taaki tum compare kar sako).
App mein jis level ka "🐳 Real lab" stage aata hai, woh isi folder ka naam batata hai.

| Lab | Level | Kya seekhoge |
|---|---|---|
| `01-first-contact` | ☁️ Cloud 101 | identity, regions, AZ name vs ZoneId, pehli bucket, "invisible bill" (galat region) |
| `02-iam-least-privilege` | 🔐 IAM | (IAM emulator) root → admin, group policy, asli AccessDenied, explicit Deny jeetta hai, role ke ASIA temporary credentials |
| `03-ec2-lifecycle` | 🖥️ EC2 | port 22 ke bina SG, IMDSv2, user data; stop/start par IP badalna; terminate par root disk vs data volume + snapshot; khule SSH SGs ka audit |
| `04-s3-safety` | 🪣 S3 | versioning se overwrite + delete wapas, presigned invoice link, SSE-KMS + Bucket Key, lifecycle se purane versions saaf |
| `05-vpc-build` | 🌐 VPC basics | 2 AZs, 4 subnets, IGW route + public associations, private main table, default NACL, association repair; same layout Terraform se |
| `06-rds-recovery` | 🗄️ RDS | Multi-AZ + 7 din ke backups, managed-password metadata, snapshot, alag reporting replica, nayi instance mein restore; asli SQL/failover emulator nahi chalata |
| `07-alb-asg-selfheal` | ⚖️ ALB + ASG | launch template, 2-AZ ASG, desired capacity, instance replacement, health/policy/draining metadata; asli HTTP ya metric se scaling nahi |
| `08-three-tier-terraform` | 🏆 Boss architecture | do AZ ka juda Terraform stack, scoped SG chain, instance role, ALB/ASG/RDS/S3, har AZ ka egress, API review aur destroy |
| `09-nat-endpoint-peering` | 🌐 VPC Deep Dive | zonal NAT/EIP, managed S3 prefix routes, interface ENIs, active peer + dono routes, Flow Log metadata aur cleanup |
| `10-route53-routing` | 📡 Route53 | asli CLI se Alias/weighted/failover JSON, primary ka health link theek karna, DNS/probe ki imaandar limits aur scoped cleanup |
| `11-cloudfront-oac` | 🌍 CloudFront | asli OAC/config/ETag/policy requests, invalidation metadata; Moto ki attachment/ETag/status limits saaf; scoped cleanup |
| `12-s3-lifecycle-lock-replication` | 🪣 S3 Advanced | lifecycle/CRR metadata, governance retention + legal hold + marker, restore hue bytes ka check; tiering/filter/replication ki kamiyan saaf, scoped cleanup |
| `13-efs-shared-storage` | 📁 EFS / FSx / hybrid | target SG repair, lifecycle/access point readbacks; unsupported throughput update alag Elastic fixture se; NFS runtime nahi |
| `14-lambda-handler-config` | ⚡ Lambda / API Gateway | host par asli SVG derivatives, version/idempotency/partial failures; asli config CLI; Docker/PC ki kami imaandari se likhi |
| `15-dynamodb-access-patterns` | 📊 DynamoDB | 1,000 items ka migration aur poore attributes ka comparison, GSI/PITR/TTL, conditional duplicate, atomic checkout/rollback; scoped cleanup |
| `16-cache-aside` | ⚡ Caching | host par asli cache/origin counts, TTL/invalidation/race/coalescing; alag Moto cache/DAX metadata ki limits; Docker follow-up check nahi hua |
| `17-sqs-sns-fanout-dlq` | 📨 SQS/SNS | apne thodi der ke Moto par fan-out/body filters, har consumer ke durable intents, asli poison DLQ aur FIFO group ka rukna; policy/dedup ki kamiyan pakdi gayi |
| `18-eventbridge-stepfunctions` | 🔔 Events | asli Classic→SQS pattern routing, Scheduler/Lambda policy metadata, SFN ki nakli history ki limit; host par DynamoDB TEST saga/crash recovery |
| `19-kms-secrets-waf` | 🛡️ Security | host par asli AES-GCM envelope/tamper checks, secret stages, KMS/SSM/WAF/GuardDuty metadata aur runtime ki saaf kamiyan |
| `20-mahasale-terraform` | 🏆 Mahasale boss | 18 apne Terraform objects, dikhta OAC drift, SDK Query alarm metadata/haath se SNS channel, ASG/RDS/Lambda config, network-mana 10,000 TEST intents ka 1 vs 5 worker scenario; storefront/runtime/asli email nahi |
| `21-wellarch-risk-scan` | 🏛️ Well-Architected | 3 contracts wala scoped scanner, DB HA/backups, review kiya Query 5xx alarm, trail policy/management logging metadata aur bacha TEST saboot; Moto ki delivery/history ki kamiyan saaf, apna cleanup |
| `22-org-scp-guardrails` | 🏢 Organizations | virtual org/accounts/nested OUs/default SCP attachments/Config delegation/member STS identity; asli mana kiya bucket dikhata hai ki Moto SCP laagu nahi karta; scoped membership/resource cleanup |
| `23-backup-restore-failover` | 🚑 Disaster Recovery | Mumbai→Hyderabad vaults/plan ka copy rule, governance lock readback, snapshot restore, cross-Region replica ARN link, AMI copy, CRR config, failover jodi; Moto selection/job/promotion/CRR/TestDNSAnswer ki kamiyan saaf; host SQLite restore ek missing accepted order dikhata hai |
| `24-hybrid-tgw-segments` | 🔗 Hybrid networking | segmented TGW (prod/dev/shared/on-prem tables, blackhole), TGW par VPN, Resolver inbound/outbound + rule; asli metadata par likha evaluator; Moto search/double-association/propagation ki kamiyan saaf |
| `25-ecs-fargate-service` | 📦 Containers | ECR immutable tags (latest bahar) + scan rule + lifecycle, execution vs task role, bina NAT private pull raasta, Fargate task definitions + circuit-breaker service; asli metadata par likha start contract; Moto preview/validation/no-task ki kamiyan saaf; Docker wala hissa Docker ka wait kar raha hai |
| `26-terraform-drift-import` | 🏗️ IaC | asli Terraform SG drift/refresh-only/import/stale plan, HCL moved + native JSON ka barabar hona, prevent_destroy, S3 conditional lock ki takkar, asli TEST data + scoped cleanup |
| `27-cost-waste-hunter` | 💰 Cost | apne asli CLI se EBS/snapshot/EIP/retention/Budget+SNS metadata, billing/subscriber/runtime ki saaf kamiyan, lagbhag EBS+IPv4 model aur baseline bachane wala cleanup |

(Naye labs har level ke rewrite ke saath judte jaayenge.)

## 4. Saaf karna / band karna

```bash
./reset.sh                 # emulator ka saara data saaf (emulator chalta rahega)
docker compose down        # Docker wale emulators band
./stop-moto.sh             # ./start-moto.sh wale emulators band
```

## Terraform

Terraform (1.6+) install ho toh `source env.sh` ke baad Terraform AWS provider bhi emulator par jaata hai. Har lab ke
`.tf` files mein provider block mein yeh flags hain (emulator ke liye zaroori, asli AWS par hata do):

```hcl
provider "aws" {
  region                      = "ap-south-1"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
}
```

## Emulator ki limits (imaandar list)

Moto API ko bahut achhe se nakal karta hai, par asli datacenter nahi hai:

- EC2 instances "chalte" hain par andar koi OS nahi — SSH ya ping nahi hoga.
- Network reachability (security group ne packet roka ya nahi) simulate nahi hoti — config check hoti hai, packets nahi.
- Lambda invoke ke liye Moto ko Docker chahiye — Docker ke bina Lambda labs mein function sirf banta hai, chalta nahi.
- Billing/Cost Explorer nahi hai.

Jahan emulator kuch nahi kar sakta, lab ka README saaf likhta hai — aur app ke andar ka simulator/dry run woh hissa dikhata hai.

## Troubleshooting

| Dikha | Matlab | Fix |
|---|---|---|
| `Could not connect to the endpoint URL` | emulator band hai | `docker compose up -d` ya `./start-moto.sh` |
| `InvalidAccessKeyId` (IAM lab mein) | IAM emulator par pehle admin banana tha | lab ka setup step dobara chalao (`../reset.sh iam` ke baad) |
| asli AWS ka bill/resource dikh raha hai | `source env.sh` bhool gaye | naya terminal + `source env.sh` |
| `aws: command not found` | CLI install nahi | `./start-moto.sh` ek baar chalao (`.venv` mein aws CLI aa jaata hai), phir `source env.sh` |
