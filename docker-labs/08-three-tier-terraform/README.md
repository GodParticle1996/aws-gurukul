# 08 — ShopKaro ka first three-tier review, Terraform se

**Problem:** demo ke diagram mein ALB, EC2 aur RDS boxes hain. Diagram redundancy, scoped access aur egress prove nahi karta.
**Goal:** do AZ ka network + ALB + ASG + private encrypted RDS + private S3 + instance role banao. API state review karo; phir usi state se destroy karo.

Moto **5.2.4**, Terraform **1.17.0**, AWS provider **6.70.0** par 2026-10-25 ko commands run hue.
Terraform ka basic workflow: `plan` hone wale changes dikhata hai; `apply` resources banata hai; state resource IDs track karti hai; `destroy` track kiye resources delete karta hai. Advanced IaC level is workflow ki details sikhayega.

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

Terraform pehle se installed hona chahiye. `main.tf` ka provider **loopback 127.0.0.1:4566** aur dummy `test` keys par pinned hai.
Asli AWS ke liye endpoint/key lines hata kar config bina soche deploy mat karo. AMI Moto ka metadata hai; production AMI chunna alag kaam hai.
`~/.aws` mein kuch nahi likha jaata, na role profiles use hote hain. Lab ke fixed naamon wale resources pehle se milen toh pehle purane lab state se cleanup karo; shared emulator reset mat karo.

## ex1 — Init, format aur validation

```bash
terraform init
terraform fmt -check
terraform validate
```

**Asli output** (format safal ho toh koi output nahi):

```text
Success! The configuration is valid.
```

👉 Chhe subnets: do public ALB/NAT, do private app, do alag DB. Public subnet ka route IGW tak hai; `MapPublicIpOnLaunch=false` routing ko private nahi banata. DB subnets main local-only table inherit karte hain.

## ex2 — Plan dekho, phir apply karo

```bash
terraform plan -out=.lab/plan
terraform apply .lab/plan
```

**Asli output ke hisse** (capture mein review kiye saved plan ka noninteractive apply use hua):

```text
Plan: 39 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 39 added, 0 changed, 0 destroyed.
```

ALB listener HTTP/80 ek **metadata exercise** hai. Asli customer traffic ke liye ACM certificate + HTTPS/443 listener aur HTTP redirect chahiye. Moto EC2 par app install/run nahi hota; ALB DNS ko chalta hua storefront mat samjho.
SG chain: internet se ALB 80 → ALB SG se app 8080 → app SG se PostgreSQL 5432. App ka HTTPS egress NAT se jaata hai. DB ko internet ka default route nahi diya.
Instance role `catalog/*` objects par GetObject deta hai; DB master secret app ko nahi diya. Asli application ko alag least-privilege DB user/secret do.

## ex3 — Paanch rules ko asli API state par review karo

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

👉 Review script Terraform output IDs se scoped CLI queries chalati hai. Script SSH exposure, DB SG ka source, Multi-AZ, ASG ke private subnet AZs, chaar BPA flags, app routes aur saat din ke backups assert karti hai. Fail check asli values print karke nonzero exit deta hai. API config packet delivery, SQL ka sahi hona ya chalta checkout prove nahi karta.

## ex4 — Repeat plan mein drift dekho

```bash
terraform plan -detailed-exitcode
```

**Asli output excerpt:**

```text
No changes. Your infrastructure matches the configuration.
```

Exit 0 = koi change nahi; 2 = changes aane wale hain; 1 = error. Console se resource edit karoge toh plan drift dikha sakta hai. State file delete karna recovery/cleanup ka tareeka nahi.

## ex5 — Apne tracked resources destroy karo

```bash
terraform destroy
# Prompt par plan inspect karke yes type karo.
aws ec2 describe-vpcs --filters Name=tag:Name,Values=shopkaro-lab08 --query 'Vpcs[].VpcId'
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab08 --query 'AutoScalingGroups[].AutoScalingGroupName'
aws rds describe-db-instances --query 'DBInstances[?DBInstanceIdentifier==`shopkaro-lab08`].DBInstanceIdentifier'
```

**Asli output** (capture mein plan review karne ke baad `terraform destroy -auto-approve` use hua):

```text
Destroy complete! Resources: 39 destroyed.
[]
[]
[]
```

Safal destruction ke baad khaali describe results check hue. `skip_final_snapshot=true` aur deletion protection off **phenkne layak emulator cleanup ke chunav** hain. Production mein backup retention/final snapshot policy saaf taur par tay karo. Terraform state mein secret metadata ho sakta hai; state/cache/plan files commit mat karo.

## Emulator limits

- EC2 OS, asli app, PostgreSQL/SQL, HTTP health probe, traffic balancing, IAM role delivery, CPU se scaling, packet routing, NAT se internet ya timed AZ failover nahi.
- AWS-managed `AmazonSSMManagedInstanceCore` policy aaj ke Moto process mein pehle se loaded nahi thi: AttachRolePolicy ne NoSuchEntity diya. Lab chhoti inline SSM-channel permission metadata use karti hai. Asli Session Manager ke agent, managed-node permissions aur outbound network ki zarooratein alag hain; connection check nahi hua.
- RDS managed master password secret metadata banata hai; secret rotation/runtime SQL authentication check nahi hua. Application master DB credentials use nahi karti.
- S3 Block Public Access flags bane rehte hain, par Moto mein unka laagu hona pakka security saboot nahi. Production mein images dene ka raasta CloudFront OAC aur scoped bucket policy hai; CloudFront deployment baad ke CDN level mein hoga. Signed viewer URLs har user par extra rok hain, public origin ka ilaaj nahi.
- Har AZ mein zonal NAT saaf taur par model kiya gaya; Regional NAT aaj ka ek alag AWS option hai, jisme har AZ ki billing/availability ka dhyaan rakhna padta hai. Moto lab regional expansion test nahi karti.
- Provider waiters ko ALB/RDS metadata ke liye lagbhag 1–2 minute lage; yeh timings production provisioning ke benchmarks nahi.
