# 08 — ShopKaro ka first three-tier review, Terraform se

**Problem:** demo ke diagram mein ALB, EC2 aur RDS boxes hain. Diagram redundancy, scoped access aur egress prove nahi karta.
**Goal:** two-AZ network + ALB + ASG + private encrypted RDS + private S3 + instance role banao. API state review karo; phir same state se destroy karo.

Moto **5.2.4**, Terraform **1.17.0**, AWS provider **6.70.0** par 2026-10-25 ko commands run hue.
Terraform ka basic workflow: `plan` proposed changes dikhata hai; `apply` resources banata hai; state resource IDs track karti hai; `destroy` tracked resources delete karta hai. Advanced IaC level workflow detail cover karega.

## Setup — ek hi terminal

Repo root `aws-gurukul` se:

```bash
cd docker-labs
./start-moto.sh
source env.sh
cd 08-three-tier-terraform
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
export TF_VAR_moto_ami_id=$(aws ec2 describe-images --query 'Images[0].ImageId' --output text)
```

Terraform already installed hona chahiye. `main.tf` provider **loopback 127.0.0.1:4566** aur dummy `test` keys par pinned hai.
Real AWS ke liye endpoint/key lines remove karke configuration blindly deploy mat karo. AMI Moto metadata hai; production AMI selection alag hai.
No `~/.aws` writes ya role profiles. Fixed lab names ke existing resources milen toh pehle original lab state se cleanup karo; shared emulator reset mat karo.

## ex1 — Init, format aur validation

```bash
terraform init
terraform fmt -check
terraform validate
```

**Asli output** (format successful hone par output nahi):

```text
Success! The configuration is valid.
```

👉 Six subnets: two public ALB/NAT, two private app, two isolated DB. Public subnet ka route IGW tak hai; `MapPublicIpOnLaunch=false` routing ko private nahi banata. DB subnets main local-only table inherit karte hain.

## ex2 — Plan dekho, phir apply karo

```bash
terraform plan -out=.lab/plan
terraform apply .lab/plan
```

**Asli output excerpts** (capture used noninteractive apply of the reviewed saved plan):

```text
Plan: 39 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 39 added, 0 changed, 0 destroyed.
```

ALB listener HTTP/80 **metadata exercise** hai. Real customer traffic ke liye ACM certificate + HTTPS/443 listener aur HTTP redirect chahiye. Moto EC2 par app install/run nahi hota; ALB DNS ko working storefront mat samjho.
SG chain: ALB80 from internet → app8080 from ALB SG → PostgreSQL5432 from app SG. App HTTPS egress NAT se hai. DB ko internet default route nahi diya.
Instance role `catalog/*` objects ka GetObject deta hai; DB master secret app ko nahi diya. Real application ko separate least-privilege DB user/secret do.

## ex3 — Five rules ko actual API state par review karo

```bash
python3 -I review.py
```

**Asli output:**

```json
{
  "ssh_world_rules": 0,
  "db_source_is_app_sg": true,
  "rds_multi_az": true,
  "asg_enabled_azs": 2,
  "s3_block_public_access": true,
  "app_egress_nat_azs": 2,
  "rds_backups_days": 7
}
```

👉 Review script Terraform output IDs se scoped CLI queries chalata hai. Script SSH exposure, DB SG source, Multi-AZ, ASG private subnet AZs, four BPA flags, app routes aur seven-day backups assert karta hai. Failed check actual values print karke nonzero exit deta hai. API configuration packet delivery, SQL correctness ya a working checkout prove nahi karti.

## ex4 — Repeat plan mein drift dekho

```bash
terraform plan -detailed-exitcode
```

**Asli output excerpt:**

```text
No changes. Your infrastructure matches the configuration.
```

Exit 0 = no changes; 2 = proposed changes; 1 = error. Console se resource edit karoge toh plan drift show kar sakta hai. State file delete karna recovery/cleanup strategy nahi hai.

## ex5 — Apne tracked resources destroy karo

```bash
terraform destroy
# Prompt par plan inspect karke yes type karo.
aws ec2 describe-vpcs --filters Name=tag:Name,Values=shopkaro-lab08 --query 'Vpcs[].VpcId'
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab08 --query 'AutoScalingGroups[].AutoScalingGroupName'
aws rds describe-db-instances --query 'DBInstances[?DBInstanceIdentifier==`shopkaro-lab08`].DBInstanceIdentifier'
```

**Asli output** (capture used `terraform destroy -auto-approve` after reviewing the plan):

```text
Destroy complete! Resources: 39 destroyed.
[]
[]
[]
```

Empty describe results verified hue after successful destruction. `skip_final_snapshot=true` aur deletion protection off **disposable emulator cleanup choices** hain. Production mein backup retention/final snapshot policy explicitly decide karo. Terraform state secret metadata contain kar sakti hai; state/cache/plan files commit mat karo.

## Emulator limits

- No EC2 OS, real app, PostgreSQL/SQL, HTTP health probe, traffic balancing, IAM role delivery, CPU-driven scaling, packet routing, NAT internet connectivity or timed AZ failover.
- AWS-managed `AmazonSSMManagedInstanceCore` policy current Moto process mein preloaded nahi thi: AttachRolePolicy returned NoSuchEntity. Lab minimal inline SSM-channel permission metadata use karta hai. Real Session Manager ke agent, managed-node permissions aur outbound network prerequisites separate hain; connection verified nahi.
- RDS managed master password creates secret metadata; secret rotation/runtime SQL authentication verified nahi. Application master DB credentials use nahi karti.
- S3 Block Public Access flags persist, enforcement Moto mein reliable security proof nahi. CloudFront OAC and scoped bucket policy are the production image-delivery path; CloudFront deployment later CDN level mein hoga. Signed viewer URLs are an additional per-user restriction, not a public-origin repair.
- Zonal NAT per AZ explicitly modeled; Regional NAT is a different current AWS option, with per-AZ billing/availability considerations. Moto lab regional expansion test nahi karta.
- Provider waiters ko ALB/RDS metadata ke liye about 1–2 minutes lage; timings production provisioning benchmarks nahi hain.
