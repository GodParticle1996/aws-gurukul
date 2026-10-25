/* =====================================================================
   AWS Gurukul — 🧭 Decision Dojo trees: RESILIENCE + OPERATIONS
   dr (kaunsi DR strategy?) · dbha (DB ki HA / scale) · observability (kya dekhne ke liye kya?) ·
   iac (kaunsa IaC tool?) · migrate7r (7 Rs) · transfer (data AWS tak kaise?)
   Prices: us-east-1 list price (2025–26), approx.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho.
   ===================================================================== */
AG.registerDecisions([

  /* ------------------------------------------------------------------ */
  {
    id: 'dr',
    icon: '🚑',
    title: 'Region gir jaaye toh? — Backup & Restore, Pilot Light, Warm Standby, Multi-site',
    short: 'DR strategy',
    tldr: 'Do numbers se strategy nikalti hai: RTO (kitni der down chalega) aur RPO (kitna data kho sakte ho). Jitne chhote numbers, utni mehengi strategy. Business se numbers pucho, phir chuno.',
    levels: ['dr', 'resilience'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Business kitni der downtime bardasht kar sakta hai (RTO)?',
        why: 'RTO = disaster ke baad app wapas chalne tak ka time. RPO = disaster se kitna pehle tak ka data bachna chahiye. Example: RPO 1 ghanta = last 1 ghante ka data kho bhi gaya toh chalega.',
        hint: 'Misaal: dukaan jal gayi. RTO = nayi dukaan kitne din mein khulni chahiye. RPO = bahi-khata kitne din purana mile toh chalega.',
        options: [
          { t: 'Ghante se din (internal tools, reports)', next: 'q2' },
          { t: '10 minute se 1 ghanta', next: 'pilot' },
          { t: 'Kuch minute', next: 'warm' },
          { t: 'Lagbhag zero — har second ka downtime = bada nuksaan', next: 'active' },
        ],
      },
      q2: {
        q: 'Data kitna kho sakte ho (RPO)?',
        options: [
          { t: 'Ghante (last backup tak)', next: 'backup' },
          { t: 'Minutes/seconds — par downtime ghanton chalega', next: 'pilot' },
        ],
      },
      backup: { leaf: true, icon: '💾', pick: 'Backup & Restore', one: 'Sirf backups doosre region mein; disaster par infra IaC se banao aur restore karo.', when: ['Non-critical apps, RTO ghante–din'], avoid: ['Customer-facing revenue apps jahan ghanton ka downtime nahi chalega'], gotchas: ['Restore ka drill karo — untested backup = backup nahi', 'AWS Backup cross-region copy + vault lock (ransomware se bachav)', 'Infra ko CloudFormation/Terraform mein rakho warna restore mein din lagenge'], cost: 'Sabse sasta — sirf storage.', exam: '"lowest cost" + "RTO/RPO in hours" → Backup & Restore.', level: 'dr' },
      pilot: { leaf: true, icon: '🕯️', pick: 'Pilot Light', one: 'Core data live replicate (DB replica), baaki app servers band/minimal; disaster par scale up.', when: ['RTO 10s of minutes, RPO minutes', 'Cost aur speed ka balance'], avoid: ['Minutes mein recovery chahiye'], gotchas: ['Failover runbook automate karo (ASG desired 0 → N, DNS switch)', 'AMIs/containers DR region mein bhi copy rakho'], cost: 'Kam — DB replica + storage.', exam: '"core components running, scale up during disaster" → Pilot Light.', level: 'dr' },
      warm: { leaf: true, icon: '🔥', pick: 'Warm Standby', one: 'Poora stack DR region mein chhote size par chalu; disaster par full scale + DNS switch.', when: ['RTO minutes, business-critical apps'], avoid: ['Budget bahut tight'], gotchas: ['DR stack ko regular traffic (thoda) dekar zinda test karte raho'], cost: 'Medium — chhota full copy hamesha chalu.', exam: '"scaled-down but fully functional copy" → Warm Standby.', level: 'dr' },
      active: { leaf: true, icon: '🌐', pick: 'Multi-site Active/Active', one: 'Do+ regions dono live traffic lete hain; ek gire toh baaki sambhalte hain.', when: ['RTO ~0, RPO ~0 (near), global users', 'Payments, trading, large ecommerce'], avoid: ['Data model multi-region writes ke liye ready nahi (conflicts)'], gotchas: ['Multi-region data: DynamoDB Global Tables / Aurora Global Database', 'Route 53 latency/weighted + health checks, ya Global Accelerator'], cost: 'Sabse mehenga — ~2× infra.', exam: '"near-zero RTO/RPO", "active-active" → Multi-site.', level: 'dr' },
    },
    compare: {
      cols: ['', 'Backup & Restore', 'Pilot Light', 'Warm Standby', 'Active/Active'],
      rows: [
        ['RTO', 'ghante–din', '10 min – ghante', 'minutes', '~0'],
        ['RPO', 'ghante', 'minutes', 'seconds–minutes', '~0'],
        ['DR region mein kya chalta hai', 'kuch nahi (backups)', 'sirf DB replica', 'chhota poora stack', 'poora stack'],
        ['Cost', '$', '$$', '$$$', '$$$$'],
      ],
    },
    scenarios: [
      { s: 'HR ka internal leave-tracker; ek din down rahe toh chalega, last night ka backup kaafi.', answer: 'backup', explain: 'RTO din, RPO ghante → Backup & Restore.' },
      { s: 'Ecommerce: 15–30 minute downtime chalega, par orders ka data minutes se zyada nahi khona.', answer: 'pilot', explain: 'DB replica live, app servers on-demand → Pilot Light.' },
      { s: 'SaaS platform: recovery 5 minute mein chahiye.', answer: 'warm', explain: 'Scaled-down live stack → Warm Standby.' },
      { s: 'Stock trading platform: ek second ka downtime bhi crores ka nuksaan.', answer: 'active', explain: 'Near-zero RTO → Active/Active multi-region.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'dbha',
    icon: '🗄️',
    title: 'Database fail ya slow ho toh? — Multi-AZ, Read Replicas, Aurora Global, DynamoDB Global Tables',
    short: 'DB HA vs scale',
    tldr: 'Multi-AZ = availability (failover), read traffic nahi. Read Replica = read scale (async), automatic failover nahi (promote manually). Doosre region ke liye: Aurora Global Database ya DynamoDB Global Tables.',
    levels: ['rds', 'dynamodb', 'dr', 'boss1'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Problem kya hai?',
        options: [
          { t: 'AZ fail hua toh DB down — automatic failover chahiye', next: 'maz' },
          { t: 'Reads se primary ka CPU 90% — reads baantne hain', next: 'rr' },
          { t: 'Poora region gir jaaye toh bhi DB chahiye', next: 'q2' },
        ],
      },
      q2: {
        q: 'Database kaunsa hai aur kya chahiye?',
        options: [
          { t: 'Aurora (SQL) — secondary region read + DR failover', next: 'aglobal' },
          { t: 'DynamoDB — dono regions mein reads AUR writes (multi-active)', next: 'gt' },
          { t: 'RDS (non-Aurora) — sasta DR', next: 'xrr' },
        ],
      },
      maz: { leaf: true, icon: '🛟', pick: 'RDS Multi-AZ', one: 'Doosre AZ mein synchronous standby; primary gire toh DNS standby par (~1–2 min).', when: ['Har production RDS'], avoid: ['Read scale ke liye (standby reads nahi leta — Multi-AZ DB cluster option chhod ke)'], gotchas: ['App DNS endpoint use kare, IP nahi', 'Connection retry logic rakho — failover mein connections tootenge'], cost: '~2× single-AZ.', exam: '"high availability", "automatic failover" → Multi-AZ.', level: 'rds' },
      rr: { leaf: true, icon: '📖', pick: 'Read Replicas', one: 'Async copies jo reads lete hain; app reads replica par bheje.', when: ['Read-heavy: reports, catalog, search pages'], avoid: ['Turant ka latest data chahiye (replica lag)', 'HA ka akela solution'], gotchas: ['Replica lag monitor karo (ReplicaLag metric)', 'App ko reader endpoint/connection alag rakhna padta hai'], cost: 'Har replica ek instance ka bill.', exam: '"read-heavy", "offload reads", "reporting queries" → read replicas.', level: 'rds' },
      aglobal: { leaf: true, icon: '🌍', pick: 'Aurora Global Database', one: 'Ek primary region + kai read-only secondary regions, replication lag typically 1 second se kam; managed switchover/failover.', when: ['Global reads low latency', 'Cross-region DR, RPO ~1 s, RTO ~1 min'], avoid: ['Har region mein writes (secondary read-only; write forwarding limited)'], gotchas: ['Switchover/failover runbook practice karo'], cost: 'Har region ka cluster + replicated write I/O.', exam: '"cross-region", "RPO of 1 second", "global reads" → Aurora Global Database.', level: 'rds' },
      gt: { leaf: true, icon: '🌐', pick: 'DynamoDB Global Tables', one: 'Multi-region, multi-active — har region mein read + write, async replication.', when: ['Global app, har region local writes', 'Active/active DR'], avoid: ['Strong consistency across regions chahiye (conflicts last-writer-wins)'], gotchas: ['Same item do regions mein ek saath likha = last writer wins'], cost: 'Har region ka replicated write capacity.', exam: '"multi-region", "multi-active", "DynamoDB" → Global Tables.', level: 'dynamodb' },
      xrr: { leaf: true, icon: '🛰️', pick: 'Cross-region read replica (RDS)', one: 'Doosre region mein async replica — disaster par manually promote.', when: ['RDS MySQL/Postgres ka sasta DR (pilot light)'], avoid: ['Seconds ka RTO'], gotchas: ['Promote ke baad replication khatam — naya replica banana padega'], cost: 'Instance + cross-region data transfer.', exam: '"DR for RDS in another region at low cost" → cross-region read replica.', level: 'dr' },
    },
    scenarios: [
      { s: 'Production Postgres ek AZ mein hai; AZ outage mein 3 ghante down raha.', answer: 'maz', explain: 'Automatic AZ failover → Multi-AZ.' },
      { s: 'Analytics dashboards ne primary MySQL ka CPU 95% kar diya.', answer: 'rr', explain: 'Reads offload → read replica.' },
      { s: 'Gaming leaderboard US aur EU dono mein local writes chahiye.', answer: 'gt', explain: 'Multi-active → DynamoDB Global Tables.' },
      { s: 'Aurora app ko doosre region mein 1 second RPO wala DR chahiye.', answer: 'aglobal', explain: 'Aurora Global Database.' },
      { s: 'Chhoti company ka RDS MySQL; budget-friendly DR doosre region mein.', answer: 'xrr', explain: 'Cross-region read replica, disaster par promote.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'observability',
    icon: '👁️',
    title: 'Kya dekhna hai? — CloudWatch metrics/logs/alarms, X-Ray, CloudTrail, Config, VPC Flow Logs',
    short: 'Observability tool',
    tldr: 'Sawal se tool: "app kaisi chal rahi hai?" → CloudWatch metrics + alarms. "Error kya tha?" → CloudWatch Logs. "Request kahan slow hui?" → X-Ray traces. "Kisne kya API call kiya?" → CloudTrail. "Resource ki config kab badli / compliant hai?" → Config. "Kaunsa IP kahan baat kar raha?" → VPC Flow Logs.',
    levels: ['observability', 'logsetl'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kaunsa sawal ka jawab chahiye?',
        options: [
          { t: 'CPU/latency/error rate kitna hai, threshold cross ho toh alert', next: 'cwm' },
          { t: 'Application ka exact error message / stack trace', next: 'cwl' },
          { t: 'Ek request 5 services mein se kahan slow hui', next: 'xray' },
          { t: 'Kisne bucket delete kiya / security group badla (WHO did WHAT)', next: 'trail' },
          { t: 'Kaunse resources rule tod rahe hain (unencrypted EBS, public bucket), config history', next: 'config' },
          { t: 'Network: kaunsa IP kis port par connect hua / reject hua', next: 'flow' },
        ],
      },
      cwm: { leaf: true, icon: '📈', pick: 'CloudWatch Metrics + Alarms', one: 'Time-series numbers + threshold alarms → SNS/Auto Scaling/action.', when: ['CPU, latency, 5xx, queue depth par alarms', 'Auto Scaling triggers'], avoid: ['Memory/disk EC2 par by default nahi — CloudWatch agent install karo'], gotchas: ['EC2 basic monitoring 5 min; detailed 1 min (paid)', 'Alarm "INSUFFICIENT_DATA" ko bhi handle karo'], cost: 'Custom metrics ~$0.30/metric/mahina; alarms ~$0.10 each.', exam: '"monitor CPU", "alert when threshold" → CloudWatch alarm. "memory utilization" → CloudWatch agent.', level: 'observability' },
      cwl: { leaf: true, icon: '📜', pick: 'CloudWatch Logs (+ Logs Insights, metric filters)', one: 'App/Lambda/VPC logs ek jagah; Logs Insights se query; metric filter se log → metric → alarm.', when: ['Lambda/ECS logs, error search', '"ERROR" count par alarm (metric filter)'], avoid: ['Retention "never expire" chhod dena — bill badhta rehta hai'], gotchas: ['Retention policy set karo (14/30/90 din)', 'Badi analytics ke liye subscription filter → Firehose → OpenSearch/S3'], cost: '~$0.50/GB ingest + storage.', exam: '"centralize logs", "search logs" → CloudWatch Logs / Logs Insights.', level: 'logsetl' },
      xray: { leaf: true, icon: '🧵', pick: 'AWS X-Ray (distributed tracing)', one: 'Request ka poora safar — har service/DB call ka time ek trace mein.', when: ['Microservices latency debugging, service map'], avoid: ['Sirf ek service ka metric dekhna'], gotchas: ['SDK/OpenTelemetry (ADOT) se instrument karo; sampling rate set karo'], cost: 'Per trace recorded/scanned.', exam: '"trace requests across microservices", "identify bottleneck" → X-Ray.', level: 'observability' },
      trail: { leaf: true, icon: '🕵️', pick: 'AWS CloudTrail', one: 'Har API call ka audit — kisne, kab, kahan se, kya kiya.', when: ['Security investigation, compliance audit', 'Organization trail se saare accounts ka central log'], avoid: ['Performance metrics ke liye'], gotchas: ['Event history sirf 90 din (management events) — trail banao S3 mein lambe time ke liye', 'Data events (S3 object-level, Lambda invoke) alag se enable, paid', 'Log file validation + S3 Object Lock se tamper-proof'], cost: 'Pehli management events copy free; data events ~$0.10 per 1 lakh.', exam: '"who made the API call", "audit", "track user activity" → CloudTrail.', level: 'observability' },
      config: { leaf: true, icon: '📋', pick: 'AWS Config', one: 'Resource configuration ka timeline + compliance rules (aur auto-remediation).', when: ['"Saare EBS encrypted hain?"', '"Security group kab aur kya badla?"', 'Conformance packs (CIS, PCI)'], avoid: ['API call ka "kisne" jawab (CloudTrail)'], gotchas: ['Config "kya badla", CloudTrail "kisne badla" — dono saath use karo'], cost: 'Per configuration item + per rule evaluation.', exam: '"assess, audit, evaluate configurations", "compliance over time" → AWS Config.', level: 'observability' },
      flow: { leaf: true, icon: '🌊', pick: 'VPC Flow Logs', one: 'Network traffic metadata — src/dst IP, port, ACCEPT/REJECT (payload nahi).', when: ['"Connection reject kyun?" (SG/NACL debug)', 'Security: unusual IP traffic'], avoid: ['Packet content dekhna (Traffic Mirroring chahiye)'], gotchas: ['S3 mein bhejo + Athena se query — sasta'], cost: 'Log ingestion per GB.', exam: '"capture IP traffic information", "troubleshoot connectivity" → VPC Flow Logs.', level: 'vpcdeep' },
    },
    scenarios: [
      { s: 'Kal raat production S3 bucket delete hua — kisne kiya?', answer: 'trail', explain: 'API audit → CloudTrail.' },
      { s: 'Checkout 3 second leta hai; 6 microservices mein se kaunsi slow hai?', answer: 'xray', explain: 'Distributed trace → X-Ray.' },
      { s: 'Compliance: har resource ki config history aur unencrypted volumes ki list chahiye.', answer: 'config', explain: 'Config rules + timeline → AWS Config.' },
      { s: 'EC2 se RDS connect nahi ho raha — packets kahan reject ho rahe hain?', answer: 'flow', explain: 'ACCEPT/REJECT records → VPC Flow Logs.' },
      { s: 'ALB ka 5xx error rate 1% cross kare toh on-call ko page.', answer: 'cwm', explain: 'Metric + alarm → CloudWatch.' },
      { s: 'Lambda ka "TimeoutError" message aur stack trace dekhna hai.', answer: 'cwl', explain: 'CloudWatch Logs / Logs Insights.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'iac',
    icon: '🏗️',
    title: 'Infra code mein kaise likhun? — CloudFormation, CDK, SAM, Terraform',
    short: 'IaC tool',
    tldr: 'Sirf AWS + AWS-native support → CloudFormation (YAML) ya CDK (code). Serverless apps → SAM. Multi-cloud / team Terraform jaanti hai → Terraform. Console click = koi history nahi, koi repeat nahi.',
    levels: ['iac'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Infra sirf AWS par hai?',
        options: [
          { t: 'Nahi — AWS + GCP/Azure/Cloudflare/Datadog bhi', next: 'tf' },
          { t: 'Haan, sirf AWS', next: 'q2' },
        ],
      },
      q2: {
        q: 'Team kya likhna pasand karti hai?',
        options: [
          { t: 'Declarative YAML/JSON templates', next: 'cfn' },
          { t: 'TypeScript/Python code — loops, classes, reusable constructs', next: 'cdk' },
          { t: 'Serverless app (Lambda + API GW + DynamoDB), local testing', next: 'sam' },
          { t: 'Team pehle se Terraform jaanti hai', next: 'tf' },
        ],
      },
      cfn: { leaf: true, icon: '📜', pick: 'AWS CloudFormation', one: 'AWS ka native IaC — stacks, change sets, drift detection, StackSets (multi-account/region).', when: ['AWS-only, Organizations ke saath StackSets se har account mein baseline'], avoid: ['Multi-cloud'], gotchas: ['Change set dekh ke apply karo (kya replace hoga)', 'DeletionPolicy: Retain production DBs par'], cost: 'Free (AWS resources ka bill).', exam: '"deploy same infrastructure across multiple accounts/regions" → CloudFormation StackSets.', level: 'iac' },
      cdk: { leaf: true, icon: '🧩', pick: 'AWS CDK', one: 'TypeScript/Python mein infra — synth hokar CloudFormation banta hai.', when: ['Developers infra likhte hain, reusable constructs chahiye'], avoid: ['Team code nahi likhti / multi-cloud'], gotchas: ['cdk diff hamesha deploy se pehle'], cost: 'Free.', exam: '"define infrastructure using familiar programming languages" → CDK.', level: 'iac' },
      sam: { leaf: true, icon: '🐿️', pick: 'AWS SAM', one: 'Serverless shorthand on CloudFormation + sam local invoke/test.', when: ['Lambda-heavy apps, local testing'], avoid: ['Non-serverless bada infra'], gotchas: ['sam build + sam deploy --guided'], cost: 'Free.', exam: '"serverless application model", "local testing of Lambda" → SAM.', level: 'iac' },
      tf: { leaf: true, icon: '🟪', pick: 'Terraform', one: 'Multi-provider IaC — HCL, plan/apply, state file.', when: ['Multi-cloud / SaaS providers', 'Team ka existing Terraform skill + modules'], avoid: ['State file ko local laptop par rakhna'], gotchas: ['Remote state: S3 backend (+ locking) — encrypted, versioned', 'terraform plan review PR mein'], cost: 'Open-source CLI free (HCP Terraform paid tiers).', exam: 'Exam AWS-native tools poochta hai; "multi-cloud IaC" real duniya mein → Terraform.', level: 'iac' },
    },
    scenarios: [
      { s: 'Har naye account mein CloudTrail + Config + baseline roles automatically deploy hone chahiye (Organizations).', answer: 'cfn', explain: 'CloudFormation StackSets with service-managed permissions.' },
      { s: 'Company AWS + Cloudflare + Datadog teeno ek tool se manage karna chahti hai.', answer: 'tf', explain: 'Multi-provider → Terraform.' },
      { s: 'Lambda + API Gateway app ko laptop par test karke deploy karna hai.', answer: 'sam', explain: 'SAM local + deploy.' },
      { s: 'Platform team TypeScript mein reusable "SecureBucket" component banana chahti hai.', answer: 'cdk', explain: 'CDK constructs.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'migrate7r',
    icon: '🚚',
    title: 'App ko AWS par kaise laun? — 7 Rs (Rehost, Replatform, Refactor...)',
    short: 'Migration 7Rs',
    tldr: 'Har app ke liye ek R: band karo (Retire), abhi rehne do (Retain), jaisa hai waisa (Rehost), chhota badlaav (Replatform), SaaS khareedo (Repurchase), dobara likho (Refactor), VMware jaisa hai (Relocate).',
    levels: ['migration'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'App ki business value aaj bhi hai?',
        options: [
          { t: 'Nahi — koi use nahi karta', next: 'retire' },
          { t: 'Hai, par abhi move nahi kar sakte (compliance, recent investment, dependency)', next: 'retain' },
          { t: 'Hai, move karni hai', next: 'q2' },
        ],
      },
      q2: {
        q: 'Kitna badlaav kar sakte ho / deadline?',
        options: [
          { t: 'Koi badlaav nahi, deadline tight (datacenter lease khatam)', next: 'q3' },
          { t: 'Thoda badlaav — managed services se ops bachao (e.g. self-managed DB → RDS)', next: 'replatform' },
          { t: 'Commercial off-the-shelf app ki jagah SaaS (CRM → Salesforce)', next: 'repurchase' },
          { t: 'Cloud-native banana — scale/agility ke liye dobara likhna', next: 'refactor' },
        ],
      },
      q3: {
        q: 'Servers VMware par hain aur VMware hi chalana hai?',
        options: [
          { t: 'Haan — VMware tooling jaisa hai waisa', next: 'relocate' },
          { t: 'Nahi — servers EC2 par lift-and-shift', next: 'rehost' },
        ],
      },
      retire: { leaf: true, icon: '🪦', pick: 'Retire', one: 'App band karo — migrate karne ka paisa bachao.', when: ['Discovery mein mile unused/duplicate apps'], avoid: ['Data retention requirements bhool jaana (archive pehle)'], gotchas: ['Usually 10–20% portfolio retire ho jaata hai'], exam: '"no longer needed" → Retire.', level: 'migration' },
      retain: { leaf: true, icon: '⏸️', pick: 'Retain (revisit)', one: 'Abhi on-prem rehne do, baad mein dekhenge.', when: ['Compliance, recently upgraded hardware, mainframe dependency'], avoid: ['"Retain" ko hamesha ke liye bhool jaana — har 6–12 mahine review date likho'], gotchas: ['Hybrid connectivity plan (VPN/DX)'], exam: '"keep on-premises for now" → Retain.', level: 'migration' },
      rehost: { leaf: true, icon: '🏗️', pick: 'Rehost (lift-and-shift) — AWS Application Migration Service', one: 'Servers jaise hain waise EC2 par — continuous block replication, cutover.', when: ['Tight deadline, bade server fleets'], avoid: ['Ummeed ki cost apne aap kam hogi bina right-sizing ke'], gotchas: ['Pehle move, phir optimize (right-size, Savings Plans)'], exam: '"migrate quickly with minimal changes" → Rehost (Application Migration Service).', level: 'migration' },
      relocate: { leaf: true, icon: '🚛', pick: 'Relocate (VMware Cloud on AWS)', one: 'VMware workloads hypervisor level par move — VM ke andar kuch nahi badla.', when: ['Bada VMware estate, VMware skills'], avoid: ['VMware licensing nahi chahiye'], gotchas: ['Broadcom ke baad VMware licensing/pricing ko alag se evaluate karo'], exam: '"VMware" + "no changes" → Relocate.', level: 'migration' },
      replatform: { leaf: true, icon: '🔧', pick: 'Replatform (lift-tinker-shift)', one: 'Core code same, platform managed: MySQL VM → RDS, Tomcat → Beanstalk/containers.', when: ['Ops-load kam karna bina rewrite'], avoid: ['Architecture hi problem hai (refactor)'], gotchas: ['DB move: DMS (+ continuous replication) se minimal downtime'], exam: '"reduce operational overhead with minimal code changes" (e.g. move to RDS) → Replatform.', level: 'migration' },
      repurchase: { leaf: true, icon: '🛒', pick: 'Repurchase (drop and shop)', one: 'Purana software chhodo, SaaS lo.', when: ['CRM, HR, email jaise commodity apps'], avoid: ['Core differentiating product'], gotchas: ['Data migration + integrations ka plan'], exam: '"move to a SaaS" → Repurchase.', level: 'migration' },
      refactor: { leaf: true, icon: '♻️', pick: 'Refactor / Re-architect', one: 'Cloud-native redesign — microservices, serverless, managed data.', when: ['Scale/agility business ki zaroorat, monolith rok raha hai'], avoid: ['Tight deadline (sabse lamba, mehenga)'], gotchas: ['Strangler fig: dheere-dheere routes naye services par'], exam: '"maximize cloud-native benefits", "serverless re-architecture" → Refactor.', level: 'migration' },
    },
    scenarios: [
      { s: 'Datacenter lease 4 mahine mein khatam; 300 VMs; code badalne ka time nahi.', answer: 'rehost', explain: 'Fast, minimal change → Rehost (Application Migration Service).' },
      { s: 'App ka self-managed Oracle VM par; DBA team chhoti hai, patching ka bojh kam karna hai, code same rahe.', answer: 'replatform', explain: 'DB → RDS (managed) → Replatform.' },
      { s: 'Discovery mein mila: 3 internal apps jinhe 2 saal se kisi ne login nahi kiya.', answer: 'retire', explain: 'Retire.' },
      { s: 'On-prem Exchange email ki jagah Microsoft 365 lena hai.', answer: 'repurchase', explain: 'SaaS → Repurchase.' },
      { s: 'Monolith Black Friday par scale nahi hota; team ko event-driven microservices chahiye.', answer: 'refactor', explain: 'Re-architect.' },
      { s: 'Mainframe app jo abhi move nahi ho sakta, 2 saal baad dekhenge.', answer: 'retain', explain: 'Retain.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'transfer',
    icon: '🚛',
    title: 'Data AWS tak kaise pahunchaun? — DataSync, Snowball, Transfer Family, Storage Gateway, DMS',
    short: 'Data transfer tool',
    tldr: 'Ek baar ka bada move internet par → DataSync. Network chhota, data bahut bada → Snowball (offline device). Partners SFTP se files bhejte hain → Transfer Family. On-prem apps ko cloud storage hamesha chahiye (hybrid) → Storage Gateway. Database → DMS.',
    levels: ['efs', 'migration'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kya move karna hai?',
        options: [
          { t: 'Database (minimal downtime, continuous replication)', next: 'dms' },
          { t: 'Files / objects', next: 'q2' },
        ],
      },
      q2: {
        q: 'Ek baar ka migration ya hamesha chalne wala hybrid access?',
        options: [
          { t: 'Ek baar (ya scheduled sync) — files AWS par shift', next: 'q3' },
          { t: 'On-prem apps ko lagataar cloud storage local share ki tarah chahiye', next: 'sgw' },
          { t: 'Bahar ke partners SFTP/FTPS/AS2 se files upload karte hain', next: 'tfam' },
        ],
      },
      q3: {
        q: 'Network kitna hai? (Hisaab: 100 TB ÷ 1 Gbps ≈ 9–10 din, link poora bhar ke)',
        why: '1 Gbps link par asli speed ~110 MB/s. 100 TB = 1,00,00,000 MB ÷ 110 MB/s ≈ 9 lakh second ≈ 10 din — aur office ka internet bhi us beech bhara rahega.',
        options: [
          { t: 'Network theek hai — din/hafte mein ho jayega', next: 'dsync' },
          { t: 'Network chhota/mehenga, data sau TBs — mahine lagenge', next: 'snow' },
        ],
      },
      dms: { leaf: true, icon: '🔄', pick: 'AWS Database Migration Service (DMS)', one: 'Full load + CDC (continuous changes) — source DB chalti rehti hai, cutover minutes ka.', when: ['Oracle → Aurora, MySQL → RDS, on-prem → AWS'], avoid: ['Files (DataSync)'], gotchas: ['Heterogeneous (Oracle → Postgres) mein schema conversion pehle (DMS Schema Conversion)'], exam: '"migrate database with minimal downtime", "continuous replication" → DMS.', level: 'migration' },
      dsync: { leaf: true, icon: '🔁', pick: 'AWS DataSync', one: 'NFS/SMB/HDFS/object storage → S3/EFS/FSx online transfer, encryption, verification, scheduling.', when: ['NAS ka 50 TB S3/EFS par', 'Roz raat incremental sync'], avoid: ['Network bahut slow aur data PB-scale'], gotchas: ['On-prem DataSync agent chahiye', 'Bandwidth throttle set karo office hours mein'], cost: 'Per GB transferred (~$0.0125).', exam: '"move large amounts of data online", "NFS/SMB to S3/EFS", "automate and accelerate" → DataSync.', level: 'efs' },
      snow: { leaf: true, icon: '📦', pick: 'AWS Snowball Edge (offline)', one: 'AWS device bhejta hai, tum data bharte ho, courier wapas — AWS S3 mein daal deta hai.', when: ['Sau TBs, slow/costly network', 'Remote sites (ship, mine) — edge compute bhi'], avoid: ['Chhota data / achha network (DataSync tez)'], gotchas: ['Device ka round-trip ~1 hafta', 'Snow family ke kuch devices AWS band kar chuka hai (Snowmobile, Snowcone) — real project mein current availability check karo'], exam: '"petabytes", "limited bandwidth", "would take weeks over the network" → Snowball.', level: 'efs' },
      tfam: { leaf: true, icon: '📤', pick: 'AWS Transfer Family', one: 'Managed SFTP/FTPS/FTP/AS2 server jiska backend S3/EFS.', when: ['Banks/partners SFTP se daily files bhejte hain'], avoid: ['Internal bulk migration (DataSync)'], gotchas: ['Partners ke existing SFTP clients bina badle kaam karte hain'], exam: '"SFTP", "partners upload files", "FTP to S3" → Transfer Family.', level: 'efs' },
      sgw: { leaf: true, icon: '🌉', pick: 'AWS Storage Gateway', one: 'On-prem VM/appliance jo cloud storage ko local share/volume/tape ki tarah dikhata hai, local cache ke saath.', when: ['S3 File Gateway: on-prem apps NFS/SMB par likhein, files S3 mein', 'Tape Gateway: backup software ke virtual tapes S3/Glacier mein', 'Volume Gateway: iSCSI volumes, EBS snapshots'], avoid: ['Ek baar ka migration (DataSync)'], gotchas: ['Local cache size hot data ke hisaab se'], exam: '"hybrid", "on-premises applications access cloud storage", "replace tape backups" → Storage Gateway.', level: 'efs' },
    },
    scenarios: [
      { s: 'Remote mining site par 500 TB data, internet 50 Mbps satellite.', answer: 'snow', explain: 'Network ke saath saal lagega → Snowball Edge.' },
      { s: 'Office NAS ka 20 TB S3 par move, 1 Gbps link, weekend ke baad raat ko incremental sync.', answer: 'dsync', explain: 'Online + scheduled → DataSync.' },
      { s: 'Partner banks roz SFTP se settlement files bhejte hain; files S3 mein chahiye.', answer: 'tfam', explain: 'Managed SFTP → Transfer Family.' },
      { s: 'Backup software virtual tapes par likhta hai; physical tape library hatani hai.', answer: 'sgw', explain: 'Tape Gateway → S3 Glacier.' },
      { s: 'On-prem Oracle se Aurora PostgreSQL, downtime 15 minute se kam.', answer: 'dms', explain: 'DMS + schema conversion, CDC.' },
    ],
  },
]);
