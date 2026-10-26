# 🧪 AWS Gurukul — Real Labs (laptop par local AWS)

App ke andar ka simulator commands ko "samajhne" ke liye hai. Yeh labs **asli `aws` CLI** aur **asli Terraform**
chalwati hain — bas AWS ki jagah tumhare laptop par chal raha **Moto** emulator jawab deta hai.

- 💸 **Bill $0.** Koi AWS account nahi chahiye, koi credit card nahi.
- 💥 **Kuch bhi tod sakte ho.** `./reset.sh` aur sab saaf.
- ✅ **Commands 100% asli hain.** Wahi command asli AWS par chalegi — sirf `AWS_ENDPOINT_URL` hata do.

## 1. Emulator chalao (ek baar, dono mein se ek tareeka)

**Docker hai:**

```bash
cd aws-gurukul/docker-labs
docker compose up -d
```

**Docker nahi hai** (sirf Python 3.9+ chahiye — pehli baar ~30 second install):

```bash
cd aws-gurukul/docker-labs
./start-moto.sh            # normal emulator, port 4566
./start-moto.sh iam        # sirf IAM labs ke liye — policies sach mein check hoti hain, port 4567
```

## 2. Terminal ko emulator ki taraf point karo (har naye terminal mein)

```bash
source env.sh              # aws + terraform → http://127.0.0.1:4566 , region ap-south-1 (Mumbai)
source env.sh iam          # IAM-enforcing emulator (4567)
aws sts get-caller-identity     # chal gaya? "Account": "123456789012" dikhega
```

`env.sh` sirf environment variables set karta hai: `AWS_ENDPOINT_URL`, dummy keys (`test`/`test`),
`AWS_DEFAULT_REGION=ap-south-1`. Docker ke bina chala rahe ho toh `.venv` ka `aws` CLI bhi PATH mein aa jaata hai.

⚠️ **Asli AWS keys is terminal mein kabhi mat daalna.** Asli AWS par wapas jaana ho toh naya terminal kholo
(ya `unset AWS_ENDPOINT_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY`).

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
| `06-rds-recovery` | 🗄️ RDS | Multi-AZ + 7-day backups, managed-password metadata, snapshot, separate reporting replica, new-instance restore; actual SQL/failover emulator nahi chalata |
| `07-alb-asg-selfheal` | ⚖️ ALB + ASG | launch template, 2-AZ ASG, desired capacity, instance replacement, health/policy/draining metadata; no actual HTTP or metric-driven scaling |
| `08-three-tier-terraform` | 🏆 Boss architecture | connected two-AZ Terraform stack, scoped SG chain, instance role, ALB/ASG/RDS/S3, per-AZ egress, API review and destroy |
| `09-nat-endpoint-peering` | 🌐 VPC Deep Dive | zonal NAT/EIP, managed S3 prefix routes, interface ENIs, active peer + two routes, Flow Log metadata and cleanup |
| `10-route53-routing` | 📡 Route53 | actual CLI Alias/weighted/failover JSON, primary health association repair, honest DNS/probe limits and scoped cleanup |
| `11-cloudfront-oac` | 🌍 CloudFront | real OAC/config/ETag/policy requests, invalidation metadata; explicit Moto attachment/ETag/status limits; scoped cleanup |

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

## Emulator ki seemayein (honest list)

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
| `InvalidAccessKeyId` (IAM lab mein) | IAM emulator par pehle admin banana tha | lab ka setup step dobara chalao (`../reset.sh` ke baad) |
| asli AWS ka bill/resource dikh raha hai | `source env.sh` bhool gaye | naya terminal + `source env.sh` |
| `aws: command not found` | CLI install nahi | `./start-moto.sh` ek baar chalao (`.venv` mein aws CLI aa jaata hai), phir `source env.sh` |
