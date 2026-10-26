# AWS Gurukul overhaul checkpoint — 2026-10-26

**Phase A complete; Phase B through Intermediate 2 `route53` complete.** User approved continuing at the Beginner
track checkpoint. Next: **Intermediate 3 `cloudfront`** (master plan §5.B3), then continue levels without per-level approval.

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

Beginner track checkpoint answered on 2026-10-25: **Continue — Intermediate 1 vpcdeep shuru karo (Recommended)**.
Continue Intermediate levels in order with per-level summaries and local commits, as already selected.
Two-part level UX is selected and scheduled with Phase E, in the chosen levels-first order.

Exam check on 2026-10-25: the current [official AWS exam guide](https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03.html)
lists **SAA-C03**, with domain weights **30/26/24/20**. No SAA-C04 announcement found in the official-source check.

Local baseline commit **6d8ba63** preserves the reviewed, validated overhaul through Beginner 6, including the user decisions.
Level 7 local commit: **c04494a**. Level 8 local commit: **d728ff2**.
Intermediate1 local commit: **e59e258**. Intermediate2 completion and validation recorded below; latest local commit identifies the level delivery.
Per-level commits are authorized. No push/deployment. `git log --oneline` records baseline and finished-level local commits.

Current `node validate.js`: **ALL CHECKS PASSED** — 38 levels, 189 stages, 51/51 terminal missions,
40 interactive labs, 10 real-lab projects. Focused suites: 973 VPC + 304 RDS + 176,283 ALB/ASG + 2,342 architecture + 5,066 Route53 checks.

## Intermediate 2 `route53` loop completed (2026-10-26 UTC)

1. Read full old level and VISUALS entry. Removed CNAME/Alias muddle, ALB hostname as A Value, geographically closest
   latency claim, geoproximity=latency+bias, default10s check, guaranteed seconds RTO/RPO, exact user split and
   invented real-company story. Preserved level ID `route53` and progress identity.
2. New `data-int-2-route53.js`: eight question/analogy cards, four myths, comparison/decision playbook, nine exam cues;
   dryrun → flowlab → policy match → Alias/CNAME bins → triage → serving-state terminal → lab10 → eight bonus MCQs;
   four interview MCQs + repair terminal, eight flashcards and explicitly optional billable AWS work/cleanup.
3. Tested actual Moto CLI before lab authoring: scoped VPC/two subnets/ALB/zone; Alias target metadata read from ALB;
   weighted90/10 and failover HealthCheckId persist. Waiter/get-change immediately INSYNC in current Moto.
   Health status returns canned200 for documentation IP; `test-dns-answer` returns404. Neither proves real DNS/probes.
   Moto canonical ALB zone is placeholder Z2P70J7EXAMPLE; real Mumbai ALB canonical ID verified separately in AWS docs.
4. Lab10 README/scripts written from captured output, repository replay and missing-health association repair passed.
   Cleanup deletes exact lab records, saved check/zone/ALB/subnets/VPC; four empty lists verify saved resources absent.
   Setup clears task resource variables before recording partial progress; isolated credentials/config under .lab.
   Shared emulator unchanged, no reset/real AWS/Docker/install.
5. Replaced Route53 simulator with public zone APIs, realistic record reads, JSON file/inline ChangeBatch CREATE/UPSERT/
   exact DELETE, atomic invalid edits, health CRUD/defaults/version checks, get-change/waiter and bounded DNS answers.
   Added readable mission `cat` and returned ALB CanonicalHostedZoneId. Namespaced AG.dnsAnswer shares serving-state
   algorithm with predicates. New service handlers retain bounded --query support and clear unsupported-scope errors.
6. Desired records remain separate from authoritative serving snapshot until explicit waiter. Five-action intended solution
   needs each action, wins only after final waiter; all seven planned records, original zone/NS/SOA/ALB/private assets,
   enabled non-inverted correct /ready check and actual fixture answer must agree. Describes/get-change/answer alone
   do not publish desired config. Last change waiter propagates preceding same-zone snapshots in this explicit model;
   elapsed real propagation and recursive/client caches are not simulated. Old waiter cannot roll back newer serving state.
7. Wrong ratios/TTL/IP/roles, missing association, disabled/inverted/wrong-path check, pending-only edits and protected
   asset deletion fail. AWS permits deleting a referenced health check (HealthCheckInUse is deprecated): simulator permits
   deletion, mission fails, and diagnostic answer reports unpredictable real routing instead of inventing an answer.
   Weighted TTL mismatches align to last specified TTL, per AWS docs. Allzero/zero-weight fallback and both-unhealthy
   failover-primary fallback are covered. Public test-dns-answer rejects private zones/unsupported location policy scope.
8. `validate-dns.js` wired in-process: **5,066 checks**, all **1,400 planner settings**, intended and omitted actions,
   reset/replay, idempotent caller references/UPSERT, malformed files/JSON/flags, atomic changes, real field semantics,
   DNS answer health/weights, IPv6 validation and fixed-demand cheats. **15 MCQs: 0 length-bias flags; positions4/4/4/3.**
   Full `node validate.js`: **ALL CHECKS PASSED**, 38 levels, 189 stages, 51/51 missions, 40 interactive labs, 10 real labs.
9. Corrected linked r53policy Decision Dojo: IP-based choice, approximate geolocation vs actual compliance, direct
   geoproximity, zero-weight fallback and DNS-answer vs user split. Concept visual now distinguishes measured latency.
10. Browser screenshots reviewed at1280px/360px: intro, dryrun, flowlab start/solved, terminal start/solved; all eight
    lesson cards per width and both inline decisions. **38 samples**, zero console/page errors or document overflow.
    Fixed4px mobile planner overflow from unbroken formula and shortened slider unit. Pronoun lint/diff whitespace clean.

Evidence: `/tmp/aws-gurukul-route53/` contains `01-`…`18-` Moto probe captures, `REPO-SETUP.txt`, `REPO-EXERCISES.txt`,
`REPO-REPAIR.txt`, `REPO-CLEANUP.txt`, `FINAL-VALIDATE.txt`, `BROWSER-REPORT.json`, `screenshots/`.
No push. Next: Intermediate3 `cloudfront`, master §5.B3; keep per-level loop and continue without per-level approval.

Route53 sources checked this session (primary AWS docs):
- [Eight policy choices](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html),
  [weighted/zero-weight behavior](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-weighted.html),
  [ResourceRecordSet API: weighted cardinality, TTL and failover](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ResourceRecordSet.html).
- [Alias vs non-alias](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html),
  [AliasTarget health constraints](https://docs.aws.amazon.com/Route53/latest/APIReference/API_AliasTarget.html),
  [ALB endpoints/canonical zone IDs](https://docs.aws.amazon.com/general/latest/gr/elb.html).
- [Health config/default30s/threshold3](https://docs.aws.amazon.com/Route53/latest/APIReference/API_HealthCheckConfig.html),
  [checker behavior/HTTP status](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/health-checks-creating-values.html),
  [health-aware selection](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/health-checks-how-route-53-chooses-records.html),
  [create/check caller reference](https://docs.aws.amazon.com/Route53/latest/APIReference/API_CreateHealthCheck.html),
  [delete associated check is permitted/unpredictable](https://docs.aws.amazon.com/Route53/latest/APIReference/API_DeleteHealthCheck.html).
- [Direct geoproximity expansion Jan10,2024](https://aws.amazon.com/about-aws/whats-new/2024/01/amazon-route-53-expands-geoproximity-routing/),
  [distance/bias](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-geoproximity.html),
  [multivalue](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-multivalue.html),
  [IP-based](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-ipbased.html).
- [Private zone precedence/NXDOMAIN](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zone-private-considerations.html),
  [private zone resolution](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-private.html),
  [VPC DNS attributes](https://docs.aws.amazon.com/vpc/latest/userguide/AmazonDNS-concepts.html),
  [pricing](https://aws.amazon.com/route53/pricing/).

## Intermediate 1 `vpcdeep` loop completed

1. Read old full level and VISUALS entry. Removed fictional incident labeled real, N² peer count, duplicate NACL/SG basics,
   always-zonal NAT claim, guaranteed production choice and history-only terminal. Kept `vpcdeep` ID.
2. New `data-int-1-vpcdeep.js`: 8 question/analogy cards, 4 myths, playbook/decision tree/tables, 9 exam cues,
   dryrun → flowlab → bins → order → triage → state-changing terminal → lab09 → 8 bonus MCQs;
   4 interview MCQs + terminal, 8 flashcards, explicit optional billable AWS work/cleanup.
3. Ran Moto first: two public zonal NATs/EIPs + same-AZ app defaults; S3 gateway endpoint automatically adds managed
   prefix-list routes; endpoint table association repair 2→1→2; Interface endpoint PrivateDNS=true and 2 ENIs;
   peer pending-acceptance→active with two-sided routes; S3 Flow Log subscription ACTIVE metadata.
4. Added lab09 setup/exercises/cleanup scripts and README from captured results. Actual repo replay passed.
   Cleanup verifies no live lab VPCs/endpoints/EIPs. Moto retains endpoints as State=deleted tombstones; final query
   excludes deleted metadata. Prefix-list CIDRs were null in Moto, not real AWS IP inventory.
5. Simulator now models NAT allocation/creation/waiters/deletion/EIP release, endpoint route associations and managed
   prefix-list routes, Interface ENI/DNS/SG metadata, peer activation/deletion/two-sided routes, S3 Flow Log subscription.
   Invalid edits atomic; strict flags, dry-run, token replays, CIDR overlap, nonparticipant routes and malformed queries guarded.
   IDs deterministic, deletion leaves blackhole route state, released EIP IDs not reused. Interface DNS choice is explicit
   in this bounded model; other endpoint/TGW/regional/NAT64/IPv6 runtime types are not claimed.
6. Thirteen-command solution needs every action and wins only on command 13. Same-public-subnet NAT, shared NAT-a,
   private NAT host subnet, missing route/acceptance/waiter, one-table/wrong-region endpoint, broad DB rule and deleting/stopping
   apps, extra allocations and world-open app ingress fail. Only the planned two NATs/two EIPs/one S3 endpoint/one peer are accepted. Interview needs endpoint repair and Flow Log subscription. Original private reader/apps/local routes retained.
7. Extended `validate-network.js` to **973 checks** (502 added), including all **192 NAT budget settings**, old 198 subnet
   settings, every omitted action, parser inputs, token replay, pending/deleted state, managed route add/remove, overlap,
   dry-run, blackholes, diagram geometry/styles and clean replays. Full validator passes: **51/51** terminal missions.
8. Validator uses explicit `solution` arrays when present: prior hint-command deduplication incorrectly removed one of two
   identical allocate-address commands. Runnable hints still agree with explicit solution; old hint-based missions continue passing.
9. Old block removed and file registered in index/validator. Existing privateaccess/vpcconnect trees already link `vpcdeep`;
   corrected related tree claims and concept visual (own-AZ NAT vs Regional NAT, no automatic safe transit, no always-use endpoint).
10. Inspected intro, dryrun, default/solved planner, solved terminal and lesson screenshots at 1280px/360px. Fixed dark
    unstyled subnet labels and touching nodes. Browser **34 samples**, all eight lesson cards per width, both inline questions,
    documented slider settings and thirteen-command keyboard solve pass; zero console/page errors and document overflow.
    14 quiz/triage/interview MCQs: **0 length-bias flags**, positions **3/4/4/3**. Pronoun lint and diff whitespace clean.

Evidence: `/tmp/aws-gurukul-vpcdeep/{SETUP,EXERCISES,EXTRA,CLEANUP,INITIAL-ROUTE,REPO-SETUP,REPO-EXERCISES,
REPO-REPAIR,REPO-CLEANUP,FINAL-VALIDATE}.txt`, `BROWSER-REPORT.json`, `screenshots/`.
One automatic approval-review timeout occurred before cleanup execution; one short-command retry succeeded.
No pending approval, no shared Moto reset, Docker, real AWS, installs, agents or push.

Plan decisions / limits: payment **outbound verification**, not inbound webhook, uses NAT. Regional NAT exists and gets a
separate card/exam cue; current lab explicitly zonal. Gateway prefix routes are endpoint-managed, not manually created with
fake S3 `create-route --vpc-endpoint-id` syntax. Lab FlowLogStatus ACTIVE proves subscription config, not packet/log delivery.
The NAT board fixes minimum S3/internet demand, requires one NAT per active AZ and endpoint, and states a hypothetical
aggregate $0.02/GB cross-AZ allowance (not universal billing). Approx example $77.50/month = ₹6,820/month includes two NATs,
two public IPv4 and 100 GB NAT internet processing; S3/storage/requests, transfer/logs/taxes extra. Two-part UX remains Phase E.

Sources checked this session:
- [Gateway endpoint routing/longest prefix](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)
- [S3 gateway endpoint limits and cost](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html)
- [Zonal NAT basics](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html)
- [Regional NAT configuration](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html)
- [NAT and IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [PrivateLink/Interface endpoint pricing](https://aws.amazon.com/privatelink/pricing/)
- [Interface DNS/SG/ENI prerequisites](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html)
- [Real endpoint CLI flags/policy](https://docs.aws.amazon.com/cli/latest/reference/ec2/create-vpc-endpoint.html)
- [PrivateLink service sharing](https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-share-your-services.html)
- [Peering non-transitivity, overlap and both routes](https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html)
- [TGW pricing example](https://aws.amazon.com/transit-gateway/pricing/)
- [IPv6 egress-only IGW](https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html)
- [Flow Logs metadata/destinations/cost](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html)
- [Reachability Analyzer configuration analysis](https://docs.aws.amazon.com/vpc/latest/reachability/what-is-reachability-analyzer.html)

## Level 8 loop completed

1. Read the whole old boss level and visual. Removed named-company architecture overclaim, signed-viewer-URL-as-origin-fix,
   open-DB-SG-as-outage-cause, zero-downtime and stale Free Tier assumptions. Kept `boss1` ID and saved-progress identity.
2. Added `data-beg-8-boss1.js`: fictional investor review, 8 question cards, 4 myths, decision playbook,
   comparison tables/decision tree, 8 exam cues, 8 flashcards, explicit optional billable AWS practice + cleanup.
   Stage order: dryrun → flowlab → bins → match → triage → terminal → docker → 8 bonus MCQs.
   Interview has 4 MCQs + state-changing terminal. Questions include why tempting alternatives fail.
3. Tested Moto/Terraform first. Provider supports connected VPC + six subnets + ALB/TG/listener + ASG/launch template +
   private encrypted Multi-AZ RDS/seven-day backups + S3/BPA/encryption + instance role/profile + two zonal NAT routes.
   Initial AWS-managed SSM policy attachment failed NoSuchEntity; final lab uses explicit minimal SSM-channel metadata.
   Real Session Manager runtime and complete managed-node permission setup are not claimed.
4. Wrote lab 08 main.tf, review.py and README from captured output. Fresh plan/apply: **39 resources**;
   repeat plan: **no changes**; read-only API review: all seven checks pass; destroy: **39 destroyed**;
   final VPC/ASG/RDS queries: `[]`, `[]`, `[]`. Repeated the actual repo README from init through cleanup successfully.
   No shared reset, Docker, real AWS, installs or deployment.
5. Extended simulator: SG source-group references, JSON permission arrays, port ranges/protocols, canonical IPv4 CIDRs,
   real duplicate/not-found/dry-run behavior, atomic invalid edits, filtered SG describes/query output, strict flags.
   ASG subnet updates now reconcile actual live AZ placement (modeled launch-before-terminate); new IPs use subnet CIDR.
   ASG cannot silently switch VPC. Immediate reconciliation is explicitly a simulator simplification.
6. Verified partial S3 BPA PUT on a disposable Moto bucket: omitted flags reset false. Simulator now models that replacement
   behavior, rejects malformed/unknown fields and reevaluates public policy exposure. RDS strict flags reject fake boolean values.
7. Boss solution is explicit data: seven actions; wins **only after the seventh**, never after mere describes or pending DB state.
   Every omitted action fails. Wrong source CIDR, broad leftover permit, wrong port, public app subnets, two subnets in one AZ,
   maintenance-only changes, partial BPA, deleting data, stopping/resetting capacity, killing all healthy workers and breaking ALB
   access fail. Interview needs both repairs. At least two original healthy workers and existing data/config must survive.
8. `validate-architecture.js`: **2,342 checks**, including all **1,120 budget settings**, parser/flags/JSON/dry-run cases,
   SG references, real placement, data preservation and independent clean replays. All prior suites pass unchanged.
   14 MCQs: **0 length-bias flags**, answers A/B/C/D **3/4/4/3**; canonical SAA domain metadata.
9. Linked frontdoor/dbha/secrets/compute decision trees; removed now-empty `data-beginner.js` and both runtime manifest references.
   Updated the concept caption and documentation references to the eight separate Beginner files.
10. Inspected 1280px + 360px intro, dryrun, default/solved planner and solved terminal screenshots, plus technical lesson cards.
    Browser **34 samples**, no document overflow or console/page errors; all eight lesson cards per width checked.
    Two dryrun decisions, documented slider settings and keyboard seven-command solve pass. Mobile request example is fully visible.
    Pronoun lint and `git diff --check` clean.

Evidence: `/tmp/aws-gurukul-boss1/` — `PROBE.txt`, `BPA-PROBE.txt`, `FRESH-{PLAN,APPLY,REVIEW,REPEAT-PLAN}.txt`,
`DESTROY.txt`, `CLEANUP.txt`, `REPO-{INIT,PLAN,APPLY,REVIEW,REPEAT-PLAN,DESTROY,CLEANUP}.txt`,
`BROWSER-REPORT.json`, `QUIZ-AUDIT.json`, `screenshots/`.

Explicit modeling/plan decisions:
- Master-plan "payment callbacks" symptom is now precisely **outbound verification** timing out while inbound webhook reaches ALB.
  Missing private-b NAT route affects outbound requests; NAT does not provide unsolicited inbound callbacks.
- Planner has the requested 1/2-AZ input, but 1 AZ is labeled an **invalid standard regional ALB design** (ALB needs two AZ subnets).
- Budget ≈ $258.70 / ₹22,766 monthly is an explicit subtotal: 730 hours, ₹88/$, four small workers, assumed 1 LCU,
  two NATs/four public IPv4/secret. DB $40/$80 and $15 storage/ops are **hypothetical allowances**, not class price quotes.
  Traffic/extra costs remain excluded. RTO is typical DB failover plus reconnect, not an uptime guarantee; bad DELETE needs restore.
- Local three-tier lab runs metadata, not an OS/app/SQL/HTTP/packet/AZ-failure runtime. HTTP80 is lab-only;
  real customer deployment needs certificate/HTTPS, application setup and runtime tests. CloudFront OAC deployment stays in CDN level.
- During fact review, found Moto lab 06 accepts a PostgreSQL read replica from a managed-master-secret source unsupported by current
  real RDS (exceptions SQL Server/Db2). Added explicit lesson/README boundary; simulator source has no managed-secret flag.
  Real PostgreSQL replica practice needs a separate supported source/credential design. Do not copy Moto's accepted combination.
- Two-part Samjho/Karo UX, mock/readiness and extras remain Phase E after all tracks, per the user's chosen levels-first order.

Level 8 sources verified this session:
- [RDS instance failover and DNS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html)
- [Synchronous standby vs readable replicas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- [RDS managed-secret limitations](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)
- [SG references and additive rules](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html)
- [Real SG CLI flags/JSON permissions](https://docs.aws.amazon.com/cli/latest/reference/ec2/authorize-security-group-ingress.html)
- [EC2 roles and instance profiles](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
- [Session Manager prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html)
- [Private S3 origin/OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [Zonal NAT dependency](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html)
- [Regional NAT](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html)
- [VPC NAT, endpoint and IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [Secrets pricing](https://aws.amazon.com/secrets-manager/pricing/)
- [ALB AZ/subnet requirements](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- [ASG AZ balancing](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-benefits.html)
- [Application DB least privilege](https://docs.aws.amazon.com/secretsmanager/latest/userguide/tutorials_rotation-single.html)
- ALB and EC2 pricing sources are also listed with level 7 below; verified rates reused explicitly.

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
