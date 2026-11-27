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
python3 -m http.server 8000 --bind 127.0.0.1  # repo ke root folder se
# → http://localhost:8000
```

Diagram gallery: [`gallery.html`](gallery.html) — saare 41 concept visuals ek page par.

## Kya hai isme

- **4 tracks, 41 levels** — sequential unlock, har track ka boss level + certificate:
  - 🌱 **Beginner (8):** Cloud 101 (regions/AZs/shared responsibility), IAM,
    EC2, S3, VPC Basics, RDS, ELB+Auto Scaling, Boss: pehla 3-tier architecture
  - 🔥 **Intermediate (12):** VPC Deep Dive, Route 53, CloudFront, S3 Advanced,
    **EFS/FSx/Hybrid Storage**, Lambda+API Gateway, DynamoDB, Caching, SQS/SNS/Kinesis,
    **EventBridge+Step Functions**, Security Deep Dive, Boss: Multi-AZ Resilient
  - 🚀 **Advanced (12):** Well-Architected 6 Pillars, **Organizations & Multi-Account
    Governance**, Disaster Recovery, Advanced Networking, Containers (ECS/EKS/ECR),
    IaC (CloudFormation/Terraform), Cost Optimization, Observability,
    Migration, Analytics, App login aur AI services, Final Boss ka Region drill
  - 🧭 **Architect — Nirnay Path (9):** *kaunsa service KAB, aur kab NAHI* —
    Compute chuno, Data store chuno, Decoupling, **EventBridge + Pipes**,
    **Log-analytics ETL (CloudWatch→Firehose→OpenSearch)**, Edge/Network,
    Cost traps, Resilience — Final Boss: poora PixShare global architecture

- **Har level mein:**
  - 🎯 Learning objectives (intro par) + ✔ success criteria (completion par)
  - 📖 ShopKaro aur PixShare ki kahaani, chhote lesson cards aur har choice ki wajah
  - 📊 Signature animated diagram (HTML/CSS, no images)
  - 🎮 Part 1 **Samjho** mein scene, dry run, flow lab aur games. Part 2 **Karo** pehle triage case se shuru hota hai. Dono ke beech rukne ka save point hai.
  - 🎤 **Interview Round** — 41 interviews mein MCQ hain. Cloud 101 ke baad baaki 40 interviews mein terminal mission bhi hai.
  - 🏋️ Optional AWS homework. Har lab ka local raasta aur cleanup uske README mein hai.
  - 🧘 Flashcards jo Revision Dojo mein jaate hain

- **Practice** mein bins, order, match, quiz, fill, hotspot, incident aur CLI terminal ke saath dry run, flow lab, triage, real-lab guide aur Decision Dojo ki choices hain. Terminal mein learner command chalaakar simulator ki state badalta hai.

- **Practice labs** (System Gurukul aur Kube Gurukul jaise) — 42 labs: 14 drills, 14 on-call shifts aur 14 chaos rounds, chaaron bosses aur bade topic levels ke aakhir mein:
  - ⚡ **Lakshan → fix drill:** ek lakshan (CloudWatch number, error line), 3 fixes, ghadi sirf sochne ka samay ginti hai.
  - 📟 **On-call shift:** asli simulator par ek raat ke jude hue alerts. Dekho → theek karo → pakka karo, phir report card.
  - 🎲 **Chaos round:** swasth account mein ek chhupi config galti. Probe se dhoondho, ek badlaav se theek karo, batao kya toota tha.

- **Bhoolne ka ilaaj (retention system):**
  - 🧘 **Revision Dojo** — spaced-repetition flashcards (1→3→7→16→35 din intervals);
    complete kiye levels ke concepts + tumhari galtiyan cards ban ke wapas aati hain
  - 🎲 **Surprise Pop Quiz** — naye level se pehle purane concepts ka random quick-check
  - 🔥 **Daily Streak** — roz khelo, flame badhao

- **Progression:** XP per first-try answer, perfect bonuses, 14 Gurukul ranks
  (🐣 Cloud Shishya → 👑 Solutions Architect Mahaguru → 🌌 Chief Architect Chakravarti),
  per-level badges + 1–3 stars,
  har track ka certificate.

- **Wahin se shuru karo** adhoora challenge kholta hai. Challenge ke pehle mile XP dobara nahi judte. Home ki Settings mein JSON backup download aur restore hota hai. Browser ka storage key `awsgurukul-v1` hai.

## Home se kya khol sakte hain?

| Tool | Kaam |
|---|---|
| SAA mock exam | 41 levels se 65 sawaal. 130-minute timer rok sakte hain ya bina timer ke khel sakte hain. Submit ke baad 50 scored sawaalon ka score, explanations, galti ke cards aur weak topics milte hain. Chaar topic scores Home par dikhte hain. |
| Lab Hub | 41 local labs, setup copy karne ke buttons, Moto ki limits aur apne done marks. [Lab guide](docker-labs/README.md) |
| Glossary aur search | 34 terms ki chhoti definitions. Lesson cards, flashcards aur Dojo ke faislon mein bhi dhoondh sakte hain. |
| Kab kya cheatsheet | 41 playbooks aur 170 Dojo choices. Topic chuno aur list ko print ya PDF karo. |
| Decision Dojo aur Soch Akhada | 32 decision trees aur 30 cases. Learner apni choice ka asar aur wajah dekh sakta hai. |

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
reachability, quiz answer indices) · **saare 81 terminal missions asli simulator
par end-to-end** · saare fill stages solvable · app boot + har screen render ·
diagram CSS classes · rank reachability.

Har `validate-*.js` suite ko alag bhi chala sakte hain. Jaise `node validate-containers.js` aur `node validate-iac.js`.
Lab25 partial-setup cleanup tests ka command [Lab25 README](docker-labs/25-ecs-fargate-service/README.md#run) mein hai.

Browser QA ke liye local Playwright package aur Chromium chahiye.

```bash
node validate-cost-browser.cjs
node validate-resume-browser.cjs
node validate-release-browser.cjs
```

Existing install alag folder mein ho toh `PLAYWRIGHT_MODULE` ko package ke absolute path aur
`CHROMIUM_PATH` ko browser executable ke absolute path par set karo. Screenshots/report default
`.overhaul-evidence/` mein save hote hain; `AWS_GURUKUL_EVIDENCE_DIR` output folder override karta hai.
Cost aur resume suites learner ke actions check karti hain. Release sweep har level ka intro, dry run aur flow lab 360 aur 1280 px par capture karta hai. Gallery ke links aur browser errors bhi check hote hain.

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
| `visuals.js` | 41 concept diagrams (`VISUALS[levelId]`) |
| `data-core.js` | Ranks + track definitions |
| `data-beg-*.js` / `data-int-*.js` / `data-adv-*.js` | Level content |
| `data-arch-*.js` | Track 4 — decision-first service selection (PixShare story) |
| `validate.js` | **Offline full-app validator** — `node validate.js` |
| `labs.js`, `parts.js` | Dry run, flow lab, triage, lab guide aur do hisson ka save point |
| `resume.js`, `mockexam.js`, `labhub.js`, `search.js`, `cheatsheet.js` | Home se khulne waale progress aur study tools |
| `gallery.html` | 41 diagrams aur unke lesson links |
| `PLAN.md` | Original build plan |

## Simulator mein kaunse commands chalte hain

Terminal mission mein `help` type karo — us mission ke supported commands dikh jayenge.
Broadly: `sts`, `iam`, `s3`/`s3api`, `ec2`, `rds`, `lambda`, `dynamodb`, `route53`,
`cloudformation`, `cloudwatch`, `kms`, `logs`, `cloudfront`, `elbv2`, `autoscaling`,
`sqs`, `sns`, `ecr`, `efs`, `organizations`, `events` (EventBridge), `stepfunctions`,
`kinesis`, `firehose`, `opensearch`/`es`, `pipes` (EventBridge Pipes),
`configure` aur mission ke Terraform commands bhi milte hain. `ls` se files dekho. `hint` ya madad ka button agla kadam dikhaata hai. `clear` terminal screen saaf karta hai.

Poore checks aur emulator runs ka record [overhaul checkpoint](OVERHAUL-CHECKPOINT.md) mein hai.
