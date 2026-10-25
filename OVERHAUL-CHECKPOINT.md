# AWS Gurukul overhaul checkpoint — 2026-10-25

Completed through **Beginner level 7 `elbasg`** (7 of 8 Beginner levels). All eight master-plan §1
preferences are answered. Next: **Beginner 8 `boss1`** (master plan §5.A2), then the required Beginner track checkpoint.

## User decisions

Round 1 answered on 2026-10-25 (master plan §1):

1. **Exam gaps:** add three new levels — Intermediate `caching`, Advanced `analytics` and `appai`.
2. **Docker:** user will install Docker; then use Docker for Lambda invocation, real containers and PostgreSQL labs.
   Installation readiness has not yet been confirmed. Continue independent Moto work; do not install Docker on the user's behalf.
   Runtime lab results must distinguish verified Docker runs from sections awaiting Docker availability.
3. **Session structure:** two parts per level — Part 1 Samjho and Part 2 Karo, with a save point between parts.
4. **Mock exam:** full timed 65-question mock plus domain-wise readiness on home.

Round 2 answered on 2026-10-25:

5. **Check-ins:** after each finished level, send a 3–5 line summary and screenshot path, then continue without waiting for approval.
6. **Git:** make a local commit after every finished level. **Ask before every push** (push triggers Cloudflare deployment).
   This explicitly supersedes the earlier no-commit preference. Preserve and account for the existing uncommitted overhaul work.
7. **Order:** levels first — Beginner → Intermediate → Advanced → Architect; then app-wide features.
8. **Extras:** all four — resume + export/import, glossary/search, Lab Hub, printable Kab kya cheatsheet.
   Offline PWA and the daily 10-minute plan were not selected.

All eight initial preference questions are answered. Next implementation: Beginner 8 `boss1` (master plan §5.A2).
Two-part level UX is selected and scheduled with Phase E, in the chosen levels-first order.

Exam check on 2026-10-25: the current [official AWS exam guide](https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03.html)
lists **SAA-C03**, with domain weights **30/26/24/20**. No SAA-C04 announcement found in the official-source check.

Local baseline commit **6d8ba63** preserves the reviewed, validated overhaul through Beginner 6, including the user decisions.
Per-level commits are authorized. No push/deployment.

Current `node validate.js`: **ALL CHECKS PASSED** — 38 levels, 176 stages, 49/49 terminal missions,
28 interactive labs, 7 real-lab projects. Includes 471 VPC + 304 RDS + 176,283 ALB/ASG regression checks.

## Level 7 loop completed

1. Read the old ALB/ASG level and visual. Removed unsupported incident, S3-as-ALB-target, universal instant scaling,
   zero-downtime and hard-coded 70/30 threshold claims. Explicit EC2-default versus opt-in ELB application health.
2. Added `data-beg-7-elbasg.js`: same ID, 8 lesson cards, 4 myths, playbook, 9 exam cues;
   dryrun → flowlab → match → bins → triage → terminal → docker → 8 bonus MCQs;
   4 interview MCQs + state-changing terminal, 8 flashcards, optional real-AWS cost/cleanup homework.
3. Ran real Moto CLI experiments first: ALB/target group + launch-template/ASG in two AZs, capacity 2→3,
   terminate without decrement → count remains 3 and old member disappears, health-path /healthz, ELB health opt-in,
   30-second drain and CPU50 target tracking. Added lab 07 setup/cleanup/README with captured outputs.
4. Extended simulator with strict ELB/ASG flags, target health/path/port checks, deterministic replacement,
   ASG capacity/placement, policy/attributes, registration/draining and bounded query/text output. Invalid edits
   are atomic; unsupported query syntax gives an explicit error. Simulator transitions are immediate models.
5. Primary mission needs all four actions and preserves the original healthy instance; interview requires capacity
   plus replacement. `validate-elb.js` checks 64,800 planner states, every omitted action, wrong order, matcher hacks,
   killing good servers, zero-capacity shortcuts, missing/invalid flags, queries, parser garbage and clean replays.
6. Removed old block, registered the new file, linked compute Decision Dojo and corrected concept-visual caption.
7. `node validate.js` passes; pronoun lint and `git diff --check` clean.
8. Inspected intro/dryrun/planner start+solved/terminal screenshots at 1280px and 360px. 18 browser samples:
   no page overflow or console/page errors. Both dry-run decisions, documented sliders and keyboard mission pass.
9. Replayed every README exercise against a newly created lab; cleanup returns three empty resource queries.
   Shared Moto was not reset. No Docker, real AWS, installs or push.

Evidence: `/tmp/aws-gurukul-elbasg/{CLI-CAPTURE,EXTRA-CAPTURE,SETUP-REPLAY,README-REPLAY}.txt`,
`BROWSER-REPORT.json`, `screenshots/`. Repeatable suite: `node validate-elb.js` (also in-process from validator).

Moto limits verified: EC2 has no OS; healthy target metadata does not prove an HTTP probe. A replacement activity
returns InProgress but describe-scaling-activities returns `[]`. A separate target-registration probe disagreed
with ASG member count. Teach membership/health as separate checks; do not claim real startup, draining or failover timing.

Plan corrections: all registered ALB targets unhealthy can **fail open**, rather than always return 503; triage
therefore diagnoses a 404 readiness path while requests can still work. NLB can target an ALB; ALB cannot target
another ALB natively. Two games follow the 1–2-game DoD; request ordering is covered by dry run and lesson instead
of a third order game. Two-part Samjho/Karo UX remains scheduled for Phase E, following the chosen levels-first order.
Prices are approximate us-east-1 examples; planner RPS values are explicitly toy load-test assumptions, not EC2 ratings.

Level 7 sources checked this session:
- [ALB health checks, fail-open and defaults](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
- [ALB target types](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- [Target attributes, algorithms and draining](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html)
- [Cross-zone behavior](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html)
- [ASG health checks](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html)
- [Health grace](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-check-grace-period.html)
- [Instance warmup](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-default-instance-warmup.html)
- [Target tracking](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html)
- [Predictive scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/predictive-scaling-policy-overview.html)
- [Forwarded header trust boundary](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html)
- [LB list pricing and LCU dimensions](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [T3 sizes and illustrative list prices](https://docs.aws.amazon.com/prescriptive-guidance/latest/optimize-costs-microsoft-workloads/right-size-selection.html)
- [ASG pricing](https://aws.amazon.com/ec2/autoscaling/pricing/)

## Level 6 loop completed

1. Read old RDS level and visual. Removed fabricated startup-loss anecdote, instant/10ms Aurora failover,
   universal 15-replica claim, universal PostgreSQL speedup, five-minute restore-duration wording,
   standby-as-backup implications and "managed means no operations work" claims.
2. Added `data-beg-6-rds.js`: same RDS ID, 8 lesson cards, 4 myths, playbook, 8 exam cues,
   dryrun → flowlab → bins → order → triage → terminal → docker → 8 bonus MCQs;
   4 interview MCQs + terminal, 8 flashcards, optional real-AWS practice.
3. Ran Moto exercises **before** writing the lab: encrypted private DB with managed-password metadata,
   Multi-AZ + 7-day backups, manual snapshot, async replica metadata, new-instance snapshot restore, scoped cleanup.
   Moto moved SecretStatus creating→active. Real SQL, replication and failover timing remain explicitly unverified.
4. Added `docker-labs/06-rds-recovery/README.md` with captured outputs and emulator/version limits; linked lab table.
5. Simulator now persists RDS snapshots/replicas/restore targets; real boolean flags, numeric validation,
   pending modifications, availability waiters, snapshot waiters, protected-source deletion guard,
   no overwrite on restore, unique identifiers and source backup/state preconditions.
6. Removed old block and registered new file in index/validator. Existing dbha decision tree already links `rds`.
7. Validator passes. `validate-rds.js` includes 304 checks: intended final-step wins, every omitted action,
   missing resources, invalid flags, source preservation, 80 reader-planner states and clean replay resets.
8. Inspected intro, dryrun and planner screenshots at 1280px/360px. New restore target is a distinct node.
   Seven screens per width: no document overflow or console/page errors. Dryrun, sliders and keyboard mission pass.
9. Pronoun lint: no banned stand-ins in `data-beg-6-rds.js`.

Additional evidence: `/tmp/aws-gurukul-vpc-overhaul/rds-capture.txt`, `rds-browser-report.json`, `rds-screenshots/`.
Both Moto lab cleanups verified; shared emulator was not reset. No real AWS resources, Docker or installs used.

RDS sources: [Multi-AZ instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html),
[Multi-AZ cluster](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html),
[PITR](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html),
[backups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html),
[encryption](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html),
[RDS Proxy](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html).
Current encryption docs also allow an eligible encrypted Blue/Green migration path; the lesson avoids the obsolete
blanket claim that snapshot copy is the only possible migration. Budget arithmetic is explicitly hypothetical, not an AWS price quote.

## Level 5 loop completed

1. Read old `data-beginner.js` level and `VISUALS.vpcbasics`. Fixed local-route CIDR, reserved-address meanings,
   public-IP flag vs IGW route, default-VPC claims, deterministic ransomware timing and history-only mission wins.
   Old level used valid read-only CLI commands; replacement missions now repair actual configuration.
2. Wrote `data-beg-5-vpcbasics.js`: ShopKaro hook, 7 lesson cards, 4 myths, playbook, 8 exam cues;
   dryrun → flowlab → order → bins → triage → terminal → docker → 8-question bonus quiz;
   4 interview MCQs + terminal, 8 flashcards, optional AWS homework. Existing `vpcbasics` ID retained.
3. Ran Moto 5.2.4 CLI exercises first: four /24s across two AZs, IGW route + two associations,
   unchanged `MapPublicIpOnLaunch=false`, main/local-only inheritance, default NACL, swap/repair count 2→1→2.
   Terraform 1.17.0 / provider 6.70.0: 10 add, repeat plan no changes, 10 destroyed.
4. Added `docker-labs/05-vpc-build/{README.md,main.tf}` with real output excerpts and explicit packet/emulator limits.
   Verified README cleanup against only the lab's own CLI VPC; final describe returned `[]`.
5. Extended simulator: create/delete route, associate/replace association, real association output/filtering,
   default NACL describe. Deterministic new association IDs; stale IDs, invalid CIDRs, duplicate routes,
   wrong-VPC targets, forbidden local deletion and dry-run mutations guarded. Task ticks reflect current state.
6. Replaced old level block; registered the new file in index/validator. Linked private-access Decision Dojo.
7. `node validate.js`: **ALL CHECKS PASSED** — 38 levels, 168 stages, 47/47 terminal missions, 20 interactive labs,
   5 real-lab projects; includes **471 VPC regression checks**, all 198 planner states and wrong-path tests.
8. Chromium desktop 1280px + phone 360px: intro/dryrun/planner screenshots inspected. Corrected clipped SVG node.
   Seven screens at each width: no page overflow or browser errors. Packet walk, planner and keyboard terminal passed.
9. Pronoun lint: no banned stand-ins in the new level file.

## Validation runner correction

The restricted host returned `spawnSync.error=EPERM` together with `status=0` and empty stdout.
The validator previously relied on exit status for child syntax checks. Syntax/combined-script checks now use
`vm.Script` directly. VPC regressions run in-process, so blocked subprocesses cannot masquerade as successful checks.

## Evidence from this run

- `/tmp/aws-gurukul-vpc-overhaul/cli-capture.txt`
- `/tmp/aws-gurukul-vpc-overhaul/terraform-capture.txt`
- `/tmp/aws-gurukul-vpc-overhaul/cleanup-capture.txt`
- `/tmp/aws-gurukul-vpc-overhaul/browser-report.json`
- `/tmp/aws-gurukul-vpc-overhaul/screenshots/` (intro, dryrun, default/solved planner, 1280px and 360px)
- Repeatable offline regression suite: `node validate-network.js` (also called by `node validate.js`).

Moto on 4566 pre-existed outside the sandbox. No shared emulator reset; no unrelated emulator resources deleted.
AWS credentials/config remained scratch/lab-local; no role profiles and no `~/.aws` writes.
No parallel agents spawned, per handover quota preference.

## Sources checked while writing level 5

- [AWS subnet sizing and reserved addresses](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)
- [AWS subnet route tables: local routes, explicit and implicit main associations](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html)
- [AWS default VPC](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html)
- [AWS IGW/public IPv4 routing](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html)
- [AWS NACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)
- [AWS CLI replace-route-table-association](https://docs.aws.amazon.com/cli/latest/reference/ec2/replace-route-table-association.html)
- [VPC pricing: NAT, regional NAT and gateway endpoint distinction](https://aws.amazon.com/vpc/pricing/)
- [Research describing January 2017 database ransom attacks](https://arxiv.org/abs/1907.06775)

Story timelines remain explicitly fictional. NAT costs are approximate US East illustrations; actual region prices vary.
DNS note preserves the distinction between reserved subnet base+2 and the resolver at primary VPC base+2.
