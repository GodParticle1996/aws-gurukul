# 🛕 AWS Gurukul

**AWS Solutions Architect seekho, khel khel mein — Hinglish mein, hands-on, beginner se mahaguru tak.**

KubeGurukul ka sibling, SAA-C03 (Solutions Architect Associate) focus ke saath.
Pure HTML/CSS/JS — no build, no dependencies, sab kuch browser mein.

## Run it

```bash
# Option 1: bas file kholo (sab local hai)
explorer.exe index.html        # WSL se
# ya Windows Explorer mein index.html double-click

# Option 2: serve karo
cd awsgurukul
python3 -m http.server 8000
# → http://localhost:8000
```

Diagram gallery: [`gallery.html`](gallery.html) — saare 38 concept visuals ek page par.

## Kya hai isme

- **4 tracks, 38 levels** — sequential unlock, har track ka boss level + certificate:
  - 🌱 **Beginner (8):** Cloud 101 (regions/AZs/shared responsibility), IAM,
    EC2, S3, VPC Basics, RDS, ELB+Auto Scaling, Boss: pehla 3-tier architecture
  - 🔥 **Intermediate (11):** VPC Deep Dive, Route 53, CloudFront, S3 Advanced,
    **EFS/FSx/Hybrid Storage**, Lambda+API Gateway, DynamoDB, SQS/SNS/Kinesis,
    **EventBridge+Step Functions**, Security Deep Dive, Boss: Multi-AZ Resilient
  - 🚀 **Advanced (10):** Well-Architected 6 Pillars, **Organizations & Multi-Account
    Governance**, Disaster Recovery, Advanced Networking, Containers (ECS/EKS/ECR),
    IaC (CloudFormation/Terraform), Cost Optimization, Observability,
    Migration 7Rs, Final Boss: Senior Gauntlet
  - 🧭 **Architect — Nirnay Path (9):** *kaunsa service KAB, aur kab NAHI* —
    Compute chuno, Data store chuno, Decoupling, **EventBridge + Pipes**,
    **Log-analytics ETL (CloudWatch→Firehose→OpenSearch)**, Edge/Network,
    Cost traps, Resilience — Final Boss: poora PixShare global architecture

- **Har level mein:**
  - 🎯 Learning objectives (intro par) + ✔ success criteria (completion par)
  - 📖 Bite-sized Hinglish lessons + ⚡ real production-incident war stories
  - 📊 Signature animated diagram (HTML/CSS, no images)
  - 🎮 3–5 interactive challenges
  - 🎤 **Interview Round** — asli interview-style sawal (MCQ + hands-on terminal)
  - 🏋️ Optional **real AWS Free Tier homework**
  - 🧘 Flashcards jo Revision Dojo mein jaate hain

- **Game types (8):** 🗂️ sorting bins · 🔢 sequence builder · 🔗 matching ·
  🧠 scenario quizzes · 📄 Terraform/CloudFormation/IAM-policy fill-in-the-blanks ·
  🎯 diagram hotspots · 🚨 3AM-pager incident decision-trees ·
  🖥️ **aws CLI + terraform simulator** (mock AWS account jisme tum sach mein commands
  type karke debug karte ho — public bucket, admin policy, missing EFS mount target,
  hot partition, target-less EventBridge rule, un-attached SCP...)

- **Bhoolne ka ilaaj (retention system):**
  - 🧘 **Revision Dojo** — spaced-repetition flashcards (1→3→7→16→35 din intervals);
    complete kiye levels ke concepts + tumhari galtiyan cards ban ke wapas aati hain
  - 🎲 **Surprise Pop Quiz** — naye level se pehle purane concepts ka random quick-check
  - 🔥 **Daily Streak** — roz khelo, flame badhao

- **Progression:** XP per first-try answer, perfect bonuses, 14 Gurukul ranks
  (🐣 Cloud Shishya → 👑 Solutions Architect Mahaguru → 🌌 Chief Architect Chakravarti),
  per-level badges + 1–3 stars,
  har track ka certificate.

- **Progress localStorage mein save hota hai** (`awsgurukul-v1`) — tab band karo, baad
  mein wahin se continue. Reset home screen se.

## 🧭 Architect Track — "kaunsa service KAB?"

AWS mein 200+ services hain; asli mushkil *kya* hai woh nahi, **kab kaunsa** hai.
Yeh track ek badhti hui startup (**PixShare** — photo/video app) ke saath chalta
hai: MVP se global scale tak, har level ek naya growth problem aur uska
service-selection decision.

Har level **decision-first** hai:
- 📊 **Decision matrix** — X vs Y vs Z, side-by-side
- ⚖️ **Trade-off** — cost / latency / scale / ops-load / blast-radius
- ❌ **"Kab NAHI"** — har service ki boundary (yeh sabse zyada miss hota hai)
- 🧩 **Scenario decision-tree** — service chuno → galat pick ka *consequence* dekho → branch
- 🎤 Interview round + hands-on audit mission

Har service choice ke peeche wahi 5 sawal hain:
**requirement · data/traffic ka shape · cost · ops-load · blast radius.**

## ✅ Validation

```bash
node validate.js      # browser ke bina poori app check
```

Yeh check karta hai: syntax + cross-file redeclaration · duplicate VISUALS keys
aur level ids · har stage ka schema (hotspot targets vs `data-hs`, incident graph
reachability, quiz answer indices) · **saare 66 terminal missions asli simulator
par end-to-end** · saare fill stages solvable · app boot + har screen render ·
diagram CSS classes · rank reachability.

Focused regressions: `node validate-containers.js` aur `node validate-iac.js`.
Lab25 partial-setup cleanup tests ka command [Lab25 README](docker-labs/25-ecs-fargate-service/README.md#run) mein hai.

Optional Cost browser QA: local Playwright package aur Chromium pehle se chahiye.

```bash
node validate-cost-browser.cjs
```

Existing install alag folder mein ho toh `PLAYWRIGHT_MODULE` ko package ke absolute path aur
`CHROMIUM_PATH` ko browser executable ke absolute path par set karo. Screenshots/report default
`.overhaul-evidence/` mein save hote hain; `AWS_GURUKUL_EVIDENCE_DIR` output folder override karta hai.
Browser test 1280px/360px, keyboard actions, final-step wins, reload aur overflow check karta hai.

## App extend karna (naya service seekha?)

Yeh app ever-extending design ki hai — naya level/track/game/card add karna sirf
data files ka kaam hai, engine ko chhoona nahi padta.
Poora guide: [`EXTENDING.md`](EXTENDING.md)

## Files

| File | Kya hai |
|------|---------|
| `core.js` | State, XP, ranks, streak, spaced-repetition engine, level registry (`AG` namespace) |
| `games.js` | Game renderers (bins/order/match/quiz/fill/hotspot/incident) |
| `awscli.js` | aws CLI + terraform simulator (mock AWS account + command parser) |
| `app.js` | Screens: home, track maps, stages, interview, Dojo, pop quiz, certificates |
| `visuals.js` | 38 concept diagrams (`VISUALS[levelId]`) |
| `data-core.js` | Ranks + track definitions |
| `data-beg-*.js` / `data-intermediate.js` / `data-advanced.js` | Level content |
| `data-architect.js` | Track 4 — decision-first service selection (PixShare story) |
| `validate.js` | **Offline full-app validator** — `node validate.js` |
| `gallery.html` | Saare diagrams ek page par |
| `PLAN.md` | Original build plan |

## Simulator mein kaunse commands chalte hain

Terminal mission mein `help` type karo — us mission ke supported commands dikh jayenge.
Broadly: `sts`, `iam`, `s3`/`s3api`, `ec2`, `rds`, `lambda`, `dynamodb`, `route53`,
`cloudformation`, `cloudwatch`, `kms`, `logs`, `cloudfront`, `elbv2`, `autoscaling`,
`sqs`, `sns`, `ecr`, `efs`, `organizations`, `events` (EventBridge), `stepfunctions`,
`kinesis`, `firehose`, `opensearch`/`es`, `pipes` (EventBridge Pipes),
`configure` — plus `terraform init/validate/plan/apply/destroy/state list` aur
`apply -f <file>` (mission ki JSON fix files ke liye). `ls` se files dekho,
`hint` se madad lo (−5 XP), `clear` se screen saaf.
