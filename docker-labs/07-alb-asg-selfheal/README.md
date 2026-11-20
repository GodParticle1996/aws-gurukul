# 07 — ALB + ASG: scale karo aur instance replace karo

**Problem:** Diwali sale par ek EC2 kaafi nahi. Dusra EC2 add karne ke baad traffic distribution aur failed instance replacement kaun karega?
**Goal:** 2-AZ VPC, ALB listener → target group → ASG, desired 2→3, desired capacity ghataaye bina ek instance ka replacement,
health-check config, CPU target tracking aur deregistration delay dekho.

**Asli output** ke hisse **Moto 5.2.4 / AWS CLI, 2026-10-25** ke run se hain. IDs har run mein badlenge.
CLI commands asli hain; Moto EC2 par OS/nginx aur ALB ka HTTP listener asal mein nahi chalta.

## Setup — repo root `aws-gurukul` se

```bash
cd docker-labs
./start-moto.sh
source env.sh
cd 07-alb-asg-selfheal
bash setup.sh
source .lab/resources.sh
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
```

`setup.sh` local endpoint check karta hai. Config lab ki apni hai; role profiles nahi, `~/.aws` mein kuch nahi likha jaata.
Setup yeh banata hai: VPC `10.7.0.0/16`, `ap-south-1a/1b` mein 2 public + 2 private subnets, IGW/public route,
ALB SG (HTTP 80), app SG (8080 only from ALB SG), launch template, ALB, target group `/health`, HTTP listener,
ASG min=2 / desired=2 / max=4. Private app subnets main/local-only table use karte hain; lab NAT nahi banati.

Setup AMI ID **Moto ke describe-images output** se leta hai. Moto ka built-in image metadata asli AWS ki aaj ki AMI salah nahi.
Asli AWS deployment mein aaj ki approved image dhoondho; yeh lab asli AWS par chalane ki manzoori nahi deti.

Setup ka HTTP listener API ki banawat ki practice hai. Production HTTPS ke liye ACM cert + 443 listener + 80→443 redirect aur matching SG chahiye.

## ex1 — Min / desired / max aur health ka source dekho

```bash
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab07 \
  --query 'AutoScalingGroups[0].{Min:MinSize,Desired:DesiredCapacity,Max:MaxSize,Count:length(Instances),Health:HealthCheckType,Grace:HealthCheckGracePeriod}'
aws elbv2 describe-target-health --target-group-arn "$TG"
```

**Asli output:**

```json
{ "Min": 2, "Desired": 2, "Max": 4, "Count": 2, "Health": "EC2", "Grace": 120 }
```

```json
{
  "TargetHealthDescriptions": [
    { "Target": { "Id": "i-c2ad6ad4a5fbfacaa", "Port": 8080 }, "HealthCheckPort": "traffic-port", "TargetHealth": { "State": "healthy" } },
    { "Target": { "Id": "i-c09f335f26e1a7830", "Port": 8080 }, "HealthCheckPort": "traffic-port", "TargetHealth": { "State": "healthy" } }
  ]
}
```

👉 Default `HealthCheckType=EC2` app-health failures ko ASG ke replacement ka signal nahi banata.
Moto ka `healthy` output network/nginx probe ka saboot nahi: Moto mein asli process hai hi nahi.

## ex2 — Desired capacity 2→3 karo

```bash
aws autoscaling set-desired-capacity --auto-scaling-group-name shopkaro-lab07 --desired-capacity 3
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab07 \
  --query 'AutoScalingGroups[0].{Desired:DesiredCapacity,Count:length(Instances)}'
```

**Asli output:**

```json
{ "Desired": 3, "Count": 3 }
```

👉 `set-desired-capacity` API test hua. Traffic/CloudWatch alarm ne Moto ASG ko apne aap scale nahi kiya.
Asli AWS mein naye instances boot aur register hote hain, phir pehle health checks pass karte hain; warmup jode gaye scaling metrics ko tikne ka time deta hai.

## ex3 — Ek instance terminate karo, desired count waisa hi rakho

```bash
OLD=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab07 \
  --query 'AutoScalingGroups[0].Instances[0].InstanceId' --output text)
aws autoscaling terminate-instance-in-auto-scaling-group --instance-id "$OLD" \
  --no-should-decrement-desired-capacity --query 'Activity.{Status:StatusCode,Description:Description}'
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab07 \
  --query 'AutoScalingGroups[0].{Desired:DesiredCapacity,Count:length(Instances)}'
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab07 \
  --query "length(AutoScalingGroups[0].Instances[?InstanceId=='$OLD'])"
```

**Asli output:**

```json
{ "Status": "InProgress", "Description": "Terminating EC2 instance: i-c09f335f26e1a7830" }
```

```json
{ "Desired": 3, "Count": 3 }
```

```text
0
```

👉 Purana instance ASG membership se gaya aur membership ki ginti 3 rahi. Replacement ki config state check hui.
Activity response `InProgress` tha; nakli poori hui activity history mat maano.
`--should-decrement-desired-capacity` ulta action hai: yeh desired count bhi ghata deta hai.

## ex4 — Health path + ASG ELB health + target tracking + draining config

```bash
aws elbv2 modify-target-group --target-group-arn "$TG" --health-check-path /healthz \
  --query 'TargetGroups[0].HealthCheckPath'
aws elbv2 modify-target-group-attributes --target-group-arn "$TG" \
  --attributes Key=deregistration_delay.timeout_seconds,Value=30 \
  --query 'Attributes[?Key==`deregistration_delay.timeout_seconds`]'
aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-lab07 \
  --health-check-type ELB --health-check-grace-period 120
aws autoscaling put-scaling-policy --auto-scaling-group-name shopkaro-lab07 --policy-name cpu50 \
  --policy-type TargetTrackingScaling --estimated-instance-warmup 120 \
  --target-tracking-configuration '{"PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},"TargetValue":50}'
aws autoscaling describe-policies --auto-scaling-group-name shopkaro-lab07 \
  --query 'ScalingPolicies[0].{Type:PolicyType,Target:TargetTrackingConfiguration.TargetValue,Metric:TargetTrackingConfiguration.PredefinedMetricSpecification.PredefinedMetricType}'
aws autoscaling describe-scaling-activities --auto-scaling-group-name shopkaro-lab07 \
  --query 'Activities[].{Status:StatusCode,Description:Description}'
```

**Asli output** (is Moto run mein safal update/put calls ne koi output nahi diya):

```json
"/healthz"
```

```json
[{ "Key": "deregistration_delay.timeout_seconds", "Value": "30" }]
```

```json
{ "Type": "TargetTrackingScaling", "Target": 50.0, "Metric": "ASGAverageCPUUtilization" }
```

```json
[]
```

👉 Moto policy/config save karta hai; asli metric se scaling aur health se replacement test nahi hue.
AWS ASG ko ELB health status use karne ke liye opt in karna padta hai. Grace period aur warmup alag settings hain.
30 second ka deregistration delay exercise ke liye chuna gaya hai; asli request ke time ke hisaab se chuno. ALB ka default 300 second hai.

## ex5 — Cleanup, shared emulator reset ke bina

```bash
bash cleanup.sh
```

**Asli output ke final checks:**

```json
[]
[]
[]
```

Cleanup likhe hue lab07 ke ASG, ALB, target group, launch template, SGs, subnets, IGW aur VPC delete karta hai.
Aakhri khaali arrays check karte hain ki ASG, naam wala ALB aur likha VPC ab nahi hain. Script ko local endpoint + lab VPC ka Name tag chahiye.
Setup beech mein fail ho toh `.lab/resources.sh` IDs bachata hai; cleanup fail ho toh us exact resource ko dekho.
Shared Moto `reset.sh` ki zaroorat nahi.

## Emulator limits

- Moto EC2 instance mein OS nahi; asli nginx, browser request, HTTPS handshake, health probe, capacity benchmark ya draining timing nahi chale.
- Target health ne bina asli web server ke `healthy` diya. ASG membership ka replacement chala, par activity history ne `[]` diya.
- Ek extra register/deregister probe ne target counts 3→4 diye jabki ASG membership 3 thi. Target-registration metadata ASG membership se alag ho sakta hai; asli AWS target lifecycle app ke model mein sikhaya jaata hai aur runtime check maangta hai.
- App ka simulator tay health/replacement model use karta hai. Simulator ki activity history model ka saboot hai, pakdi hui Moto history nahi.
- Abhi Docker nahi hai. Yeh level Moto APIs use karta hai; baad ke Docker runtime hisse user ke install karne ke baad check honge.

Sources: [ALB health/fail-open](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html),
[ASG health sources](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html),
[target tracking](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html),
[warmup](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-default-instance-warmup.html),
[draining](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html).
