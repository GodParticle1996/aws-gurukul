# 🛕 AWS Gurukul — Build Plan

**AWS Solutions Architect seekho, khel khel mein — Hinglish mein, hands-on, beginner se mahaguru tak.**

KubeGurukul ka direct sibling. SAA-C03 (Solutions Architect Associate) certification
focus. Pure HTML/CSS/JS — no build, no dependencies, sab kuch browser mein.

## Decisions (user-confirmed)

- **Naam:** AWS Gurukul 🛕 → folder `awsgurukul/`
- **Cert focus:** SAA-C03 (Associate) — domains: Secure / Resilient / High-Performing / Cost-Optimized
- **Scope:** Pura app — 4 tracks, 38 levels (8 + 11 + 10 + 9)
- **Terminal sim:** `aws` CLI simulator + Terraform fill-in-the-blanks
- **Language:** Hinglish throughout
- **Tech stack:** Pure HTML/CSS/JS (same as kubegurukul), `AG` namespace

## Tech Architecture (kubegurukul port + AWS-specific changes)

| File | Kya hai | KubeGurukul se farak |
|------|---------|----------------------|
| `core.js` | State, XP, ranks, streak, spaced-repetition, registry | Namespace `AG`, AWS ranks, STORE_KEY `awsgurukul-v1` |
| `awscli.js` | **aws CLI + terraform simulator** (terminal missions) | Naya — `aws s3/ec2/iam/rds/lambda/dynamodb/sts...` commands |
| `games.js` | Game renderers (bins/order/match/quiz/fill/hotspot/incident) | Same engine, fill game Terraform/CFN YAML support |
| `visuals.js` | 38 AWS concept diagrams (VPCs, AZs, regions, architectures) | Naya content, same `.dg-*` primitives |
| `app.js` | Screens: home, track, level, interview, dojo, certs | Same engine, AWS branding |
| `style.css` | AWS orange (#ff9900) + dark navy (#232f3e) theme | AWS color palette |
| `data-core.js` | Ranks + track definitions | AWS-themed ranks & tracks |
| `data-beg-*.js` | 8 levels: Cloud 101 → Boss | Full content |
| `data-intermediate.js` | 11 levels: VPC deep dive → Boss | Full content |
| `data-advanced.js` | 10 levels: Well-Architected → Final Boss | Full content |
| `index.html` | Entry point | Script tags for AG |
| `EXTENDING.md` | How to add levels/tracks/games | AWS-specific examples |
| `PLAN.md` | This file | — |

## Tracks & Levels (38 total)

### 🌱 Track 1: Beginner — Shishya Path (8 levels)
*Cloud foundations — zero se first architecture tak.*

1. **☁️ Cloud 101** — What is cloud, on-prem vs cloud, AWS account, regions/AZs, shared responsibility
2. **🔐 IAM** — Root user, users/groups/roles, policies (JSON), least privilege, MFA
3. **🖥️ EC2** — Virtual machines, instance types, key pairs, security groups, EBS volumes
4. **🪣 S3** — Object storage, buckets, keys, permissions, static website hosting
5. **🌐 VPC Basics** — VPC, subnets (public/private), IGW, route tables, CIDR
6. **🗄️ RDS & Databases** — Managed DBs, RDS engines, Multi-AZ, read replicas, backups
7. **⚖️ ELB & Auto Scaling** — Load balancers (ALB/NLB), ASG, target groups, health checks
8. **🏆 Boss: First Architecture** — 3-tier web app deploy (ALB → EC2 ASG → RDS Multi-AZ)

### 🔥 Track 2: Intermediate — Sadhak Path (11 levels)
*Architect's toolkit — production-grade building blocks.*

1. **🌐 VPC Deep Dive** — NAT gateway, VPC peering, Transit Gateway, private subnets, NACLs
2. **📡 Route 53** — DNS, hosted zones, routing policies (simple/weighted/latency/failover), health checks
3. **🌍 CloudFront & CDN** — Edge locations, distributions, origins, cache behaviors, signed URLs
4. **🪣 S3 Advanced** — Storage classes (Standard/IA/Glacier), lifecycle rules, replication, encryption
5. **📁 EFS, FSx & Hybrid** — block vs file vs object, EFS mount targets/IA lifecycle, FSx Windows/Lustre, Storage Gateway, DataSync, Snow
6. **⚡ Lambda & API Gateway** — Serverless functions, triggers, cold starts, API Gateway stages
7. **📊 DynamoDB** — NoSQL at scale, partition key, RCU/WCU, GSI, DAX, streams
8. **📨 SQS / SNS / Kinesis** — Decoupling: queues, pub/sub, streaming, fan-out
9. **🔔 EventBridge & Step Functions** — event bus, rules/patterns, schedules, state machines, Retry/Catch, Saga
10. **🛡️ Security Deep Dive** — KMS encryption, WAF, Shield, GuardDuty, Secrets Manager, Macie
11. **🏆 Boss: Multi-AZ Resilient Architecture** — Fault-tolerant e-commerce (ALB+ASG multi-AZ+RDS+ElastiCache+S3+CloudFront)

### 🚀 Track 3: Advanced — Guru Path (10 levels)
*Senior solutions architect — design, optimize, modernize.*

1. **🏛️ Well-Architected Framework** — 6 pillars (Operational/Security/Reliability/Performance/Cost/Sustainability)
2. **🏢 Organizations & Multi-Account** — OUs, SCP guardrails, Control Tower/Account Factory, consolidated billing, org CloudTrail
3. **🚑 HA & Disaster Recovery** — RTO/RPO, backup/restore/pilot light/warm standby/multi-site active-active
4. **🔗 Advanced Networking** — Direct Connect, PrivateLink, VPC endpoints, Transit Gateway hub-and-spoke
5. **📦 Container Services** — ECS (Fargate/EC2), EKS, ECR, when to use containers vs Lambda
6. **🏗️ Infrastructure as Code** — CloudFormation vs Terraform, templates, drift, stacks
7. **💰 Cost Optimization** — Reserved/Savings Plans, Spot instances, rightsizing, cost allocation tags
8. **👁️ Observability** — CloudWatch (metrics/logs/alarms), X-Ray tracing, CloudTrail audit, VPC Flow Logs
9. **🚚 Migration & Modernization** — 7Rs (rehost/refactor/repurchase/replatform/retain/retire/relocate), DMS, Migration Hub
10. **👑 Final Boss: Senior Solutions Architect Gauntlet** — Full architecture design + incident + interview marathon


### 🧭 Track 4: Architect — Nirnay Path (9 levels)
*Decision-first: kaunsa service KAB, aur kab NAHI. Continuity: "PixShare" startup, MVP → global.*

1. **🖥️ Compute Chuno** — Lambda vs Fargate vs EC2 vs Batch; "serverless hamesha sasta" myth; Graviton/Spot
2. **🗄️ Data Store Chuno** — S3/RDS/Aurora/DynamoDB/ElastiCache/Redshift/Athena; OLTP≠OLAP; polyglot persistence
3. **📨 Decouple Kaise** — SQS vs SNS vs Kinesis vs Step Functions; SNS→SQS fan-out; orchestration vs choreography
4. **🔔 EventBridge & Pipes** — content routing, bus vs SNS, **Pipes** (source→filter→enrich→target), Scheduler
5. **🔍 Log Analytics ETL** — CloudWatch Logs → Subscription Filter → **Firehose** → **OpenSearch** + S3; Firehose vs Kinesis Streams; Metric Filter
6. **🌍 Edge & Network** — ALB vs NLB vs API GW; CloudFront vs Global Accelerator; VPC endpoints
7. **💰 Cost Decisions** — NAT/cross-AZ/idle traps; right-size→commit→Spot order; break-even
8. **🛡️ Resilience** — multi-AZ baseline, idempotency (at-least-once), graceful degradation, DR by RTO/RPO
9. **👑 Final Boss** — poora PixShare global architecture design review

## Per-Level Structure (same as kubegurukul)

Har level mein:
- 🎯 **objectives** (intro par learning goals)
- 📖 **lesson** (2-3 Hinglish HTML cards with ⚡ real incident war stories)
- 📊 **VISUALS[id]** (signature animated HTML/CSS diagram)
- 🎮 **stages** (2-4 interactive challenges: bins/order/match/quiz/fill/hotspot/incident/terminal)
- 🎤 **interview** (asli interview-style sawal: MCQ + hands-on terminal)
- ✔ **success** (completion checklist)
- 🏋️ **homework** (optional real AWS Free Tier practice)
- 🧘 **cards** (3-5 flashcards → Revision Dojo)

## Game Types (8 — same engine)

1. 🗂️ **bins** — categories mein sort karo
2. 🔢 **order** — sahi sequence banao
3. 🔗 **match** — jodi milao
4. 🧠 **quiz** — MCQ (context optional — aws CLI output / Terraform)
5. 📄 **fill** — Terraform/CloudFormation blanks (drag tokens)
6. 🎯 **hotspot** — diagram ke sahi hisse par click
7. 🚨 **incident** — 3AM pager decision tree
8. 🖥️ **terminal** — aws CLI simulator (mock AWS account)

## aws CLI Simulator Commands

```
aws sts get-caller-identity
aws iam list-users / list-roles / list-policies / list-groups
aws s3 ls / ls s3://bucket / mb s3://bucket / cp / sync
aws s3api list-buckets / get-bucket-encryption
aws ec2 describe-instances / describe-vpcs / describe-subnets / describe-security-groups / describe-volumes
aws rds describe-db-instances
aws lambda list-functions / invoke
aws dynamodb list-tables / describe-table / scan
aws route53 list-hosted-zones
aws cloudformation describe-stacks / describe-stack-events
aws cloudwatch describe-alarms
aws efs describe-file-systems / describe-mount-targets / create-mount-target
aws organizations list-accounts / list-policies / attach-policy
aws events list-rules / list-targets-by-rule / put-rule / put-targets
aws stepfunctions list-state-machines / start-execution / get-execution-history
terraform plan / apply / validate / destroy
help · ls · clear · hint
```

## Retention System (same as kubegurukul)

- 🧘 **Revision Dojo** — SM-2-lite spaced repetition (1→3→7→16→35 days)
- 🎲 **Surprise Pop Quiz** — naye level se pehle purane concepts ka quick check
- 🔥 **Daily Streak** — roz khelo, flame badhao
- 11 Gurukul ranks 🐣 Cloud Shishya → 👑 Solutions Architect Mahaguru

## Ranks (11)

| XP | Rank | Icon |
|----|------|------|
| 0 | Cloud Shishya | 🐣 |
| 200 | Instance Initiate | 🖥️ |
| 450 | Bucket Builder | 🪣 |
| 750 | VPC Voyager | 🌐 |
| 1100 | Subnet Sadhak | 🧘 |
| 1500 | IAM Insaf | 🔐 |
| 1950 | Lambda Lila | ⚡ |
| 2450 | Dynamo Darvesh | 📊 |
| 3000 | CloudFormation Chakraborty | 🏗️ |
| 3600 | Well-Architected Acharya | 🏛️ |
| 4300 | Solutions Architect Mahaguru | 👑 |

## Build Order

1. ✅ PLAN.md (this file)
2. `core.js` — engine foundation
3. `awscli.js` — terminal simulator
4. `games.js` — game renderers
5. `visuals.js` — 26 diagrams
6. `app.js` — screens
7. `style.css` — AWS theme
8. `index.html` + `data-core.js` — entry + ranks/tracks
9. `data-beg-*.js` — 8 levels
10. `data-intermediate.js` — 9 levels
11. `data-advanced.js` — 9 levels
12. `EXTENDING.md` — extensibility guide
13. Test + code review
