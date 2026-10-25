# 07 — ALB + ASG: scale karo aur instance replace karo

**Problem:** Diwali sale par ek EC2 kaafi nahi. Dusra EC2 add karne ke baad traffic distribution aur failed instance replacement kaun karega?
**Goal:** 2-AZ VPC, ALB listener → target group → ASG, desired 2→3, one-instance replacement without shrinking desired capacity,
health-check config, CPU target tracking aur deregistration delay inspect karo.

**Asli output** excerpts **Moto 5.2.4 / AWS CLI, 2026-10-25** run se hain. IDs har run mein badlenge.
CLI commands real hain; Moto EC2 par OS/nginx aur ALB HTTP listener actually run nahi karta.

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

`setup.sh` local endpoint verify karta hai. Config lab-local hai; no role profiles, no `~/.aws` writes.
Setup create karta hai: VPC `10.7.0.0/16`, 2 public + 2 private subnets across `ap-south-1a/1b`, IGW/public route,
ALB SG (HTTP 80), app SG (8080 only from ALB SG), launch template, ALB, target group `/health`, HTTP listener,
ASG min=2 / desired=2 / max=4. Private app subnets main/local-only table use karte hain; lab NAT nahi banata.

Setup AMI ID **Moto ke describe-images output** se leta hai. Moto builtin image metadata real AWS current AMI recommendation nahi hai.
Actual AWS deployment mein current approved image resolve karo; lab real AWS execution authorize nahi karta.

Setup ka HTTP listener API anatomy practice karta hai. Production HTTPS ke liye ACM cert + 443 listener + 80→443 redirect aur matching SG chahiye.

## ex1 — Min / desired / max aur health source inspect karo

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

👉 `HealthCheckType=EC2` default app-health failures ko ASG replacement signal nahi banata.
Moto ka `healthy` output network/nginx probe ka proof nahi: Moto mein actual process absent hai.

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

👉 `set-desired-capacity` API test hua. Traffic/CloudWatch alarm ne Moto ASG automatically scale nahi kiya.
Real AWS new instances boot, register aur initial health checks pass karte hain; warmup aggregated scaling metrics ko stabilize karta hai.

## ex3 — Ek instance terminate karo, desired count preserve karo

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

👉 Old instance ASG membership se gaya aur membership count 3 raha. Replacement configuration state verified hai.
Activity response `InProgress` tha; fake completed activity history mat assume karo.
`--should-decrement-desired-capacity` opposite action hai: desired count bhi reduce karta hai.

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

**Asli output** (successful update/put calls produced no output in this Moto run):

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

👉 Moto policy/config persist karta hai; real metric-driven scaling aur health-driven replacement test nahi hue.
AWS ASG ko ELB health status use karne ke liye opt in karna padta hai. Grace period aur warmup alag settings hain.
30-second deregistration delay exercise choice hai; real request duration ke hisaab se choose karo. ALB default 300 seconds hai.

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

Cleanup recorded lab07 ASG, ALB, target group, launch template, SGs, subnets, IGW aur VPC delete karta hai.
Final empty arrays ASG, named ALB aur recorded VPC ki absence verify karti hain. Script requires local endpoint + lab VPC Name tag.
Partial setup failure ho toh `.lab/resources.sh` IDs preserve karta hai; cleanup failure ka exact resource inspect karo.
Shared Moto `reset.sh` ki zaroorat nahi.

## Emulator limits

- Moto EC2 instance has no OS; no actual nginx, browser request, HTTPS handshake, health probe, capacity benchmark or draining timing ran.
- Target health returned `healthy` without a real web server. ASG membership replacement worked, but activity history returned `[]`.
- Extra register/deregister probe returned target counts 3→4 while ASG membership was 3. Target-registration metadata can disagree with ASG membership; actual AWS target lifecycle behavior is taught by the in-app model and requires runtime verification.
- The in-app simulator uses a deterministic health/replacement model. Simulator activity history is model evidence, not captured Moto history.
- Docker is not available yet. This level uses Moto APIs; later Docker runtime sections will be verified after the user's installation is available.

Sources: [ALB health/fail-open](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html),
[ASG health sources](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html),
[target tracking](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html),
[warmup](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-default-instance-warmup.html),
[draining](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html).
