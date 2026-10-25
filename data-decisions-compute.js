/* =====================================================================
   AWS Gurukul — 🧭 Decision Dojo trees: COMPUTE
   compute (kahan chalaun?) · ec2buy (EC2 ka paisa kaise do?) · containers (ECS ya EKS?)
   Prices: us-east-1 list price (2025–26), approx — asli bill ke liye AWS Pricing Calculator.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho. Chhote vaakya.
   ===================================================================== */
AG.registerDecisions([

  /* ------------------------------------------------------------------ */
  {
    id: 'compute',
    icon: '🖥️',
    title: 'Code kahan chalaun? — Lambda, Fargate, ECS/EKS, EC2, Batch',
    short: 'Compute chuno',
    tldr: 'Traffic ka shape decide karta hai: spiky aur chhote kaam → Lambda. Hamesha chalne wali container service → Fargate. Kubernetes ki zaroorat → EKS. Poora control, GPU, ya licence → EC2. Lambi batch jobs → AWS Batch.',
    levels: ['ec2', 'lambda', 'containers', 'compute', 'elbasg', 'boss1'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Ek request/job ka kaam kitni der chalta hai?',
        why: 'Lambda ek invocation ko maximum 15 minute deta hai. 15 minute se lamba kaam Lambda par chal hi nahi sakta.',
        options: [
          { t: '15 minute se kam (API call, file process, event handle)', next: 'q2' },
          { t: '15 minute se zyada ya hamesha chalta rehta hai (server, worker)', next: 'q3' },
          { t: 'Ghanton ki batch job (video render, ML training, report)', next: 'batch' },
        ],
      },
      q2: {
        q: 'Traffic ka shape kaisa hai?',
        why: 'Lambda ka paisa sirf chalne ke time ka lagta hai. Idle time ka paisa zero. Isliye spiky traffic par Lambda sasta, aur 24×7 bhaari traffic par mehenga padta hai.',
        hint: 'Spiky = din mein kuch ghante traffic, raat ko lagbhag zero. Steady = har second requests aati rehti hain.',
        options: [
          { t: 'Spiky ya kam — kabhi 0, kabhi 500 req/s', next: 'lambda' },
          { t: 'Steady aur bhaari — 24×7 lagataar 200+ req/s', next: 'q3' },
        ],
      },
      q3: {
        q: 'App container mein packed hai (Docker image)?',
        options: [
          { t: 'Haan, Docker image hai', next: 'q4' },
          { t: 'Nahi — legacy app, Windows software, ya OS-level control chahiye', next: 'ec2' },
        ],
      },
      q4: {
        q: 'Team ko Kubernetes chahiye? (Helm charts, K8s operators, multi-cloud portability)',
        why: 'EKS control plane ka khud ka bill hai ($0.10/ghanta ≈ $73/mahina) aur Kubernetes chalane ka ops-load bhi. Bina zaroorat EKS = paisa aur mehnat dono zyada.',
        options: [
          { t: 'Haan — K8s already use karte hain / K8s ecosystem chahiye', next: 'eks' },
          { t: 'Nahi — bas container chalana hai, servers manage nahi karne', next: 'q5' },
        ],
      },
      q5: {
        q: 'GPU chahiye, ya bahut bade scale par har dollar bachana hai?',
        why: 'Fargate par GPU nahi milta. Bade, steady scale par ECS-on-EC2 (Savings Plan + Spot ke saath) Fargate se sasta padta hai — par servers patch karne ka kaam wapas aata hai.',
        options: [
          { t: 'Nahi — kam ops chahiye, servers ka jhanjhat nahi', next: 'fargate' },
          { t: 'Haan — GPU chahiye ya 100+ containers steady chal rahe hain', next: 'ecsec2' },
        ],
      },
      lambda: {
        leaf: true, icon: 'λ', pick: 'AWS Lambda',
        one: 'Function upload karo, event aane par AWS chalata hai. Server nahi, idle ka bill nahi.',
        why: 'Kaam 15 minute se chhota hai aur traffic spiky hai — Lambda sirf chalne ke milliseconds ka paisa leta hai, aur 0 se hazaaron parallel copies tak khud scale karta hai.',
        when: [
          'S3 upload par thumbnail banana, SQS message process karna, API Gateway ke peeche chhota API',
          'Traffic din mein upar-neeche hota hai, raat ko lagbhag zero',
          'Cron jaisa kaam — EventBridge Scheduler har 5 minute Lambda chalaye',
        ],
        avoid: [
          '15 minute se lamba kaam (hard limit)',
          '24×7 steady bhaari traffic — steady traffic par Fargate/EC2 sasta padta hai',
          'Latency-sensitive API jahan cold start (pehli request par 100 ms – 1 s+) bardasht nahi — ya Provisioned Concurrency ka paisa do',
          'Bahut lambi-chaudi connection pools (RDS) — har Lambda copy naya DB connection kholti hai; RDS Proxy lagao',
        ],
        gotchas: [
          'Account mein default 1,000 concurrent executions (region mein, sab functions mila ke) — ek function saari concurrency kha sakta hai; reserved concurrency lagao',
          'Memory badhane se CPU bhi badhta hai (128 MB – 10,240 MB) — kabhi-kabhi zyada memory = jaldi khatam = sasta',
          'VPC ke andar Lambda ko internet chahiye toh NAT Gateway chahiye (aur NAT ka bill)',
        ],
        cost: '$0.20 per 10 lakh requests + $0.0000166667 per GB-second. Example: 50 lakh requests/mahina, 512 MB, 200 ms → 5,00,000 GB-s ≈ $8.3 + $1 = ~$9/mahina. Idle = $0.',
        exam: '"event-driven", "LEAST operational overhead", "pay only when code runs" → Lambda. "processing takes 30 minutes" → Lambda NAHI (Fargate/Batch/EC2).',
        iac: `resource "aws_lambda_function" "thumb" {
  function_name = "make-thumbnail"
  runtime       = "python3.12"
  handler       = "app.handler"
  filename      = "build/app.zip"
  role          = aws_iam_role.lambda.arn
  memory_size   = 512
  timeout       = 30      # seconds (max 900)
}`,
        example: 'Photo app: user photo S3 par upload karta hai → S3 event → Lambda 3 size ke thumbnails banata hai. Raat ko 0 uploads = $0 bill.',
        level: 'lambda',
      },
      fargate: {
        leaf: true, icon: '📦', pick: 'ECS on Fargate',
        one: 'Container image do, CPU/memory batao — AWS server ke bina container chalata hai.',
        why: 'Hamesha chalne wali container service chahiye, Kubernetes nahi chahiye, aur servers patch nahi karne. Fargate har task ka per-second bill karta hai.',
        when: [
          'REST API / web app jo 24×7 chalti hai, 2–50 containers',
          'Background worker jo SQS queue se lagataar padhta hai',
          'Team chhoti hai — OS patching, AMI updates nahi chahiye',
        ],
        avoid: [
          'GPU chahiye — Fargate par GPU nahi hai',
          'Bahut bade steady scale par har dollar bachana — ECS on EC2 + Savings Plans sasta',
          'Kubernetes-specific tooling (Helm, operators) — EKS lo',
        ],
        gotchas: [
          'Fargate task ko internet/ECR se image pull ke liye public IP ya NAT Gateway ya VPC endpoints chahiye',
          'Fargate Spot ~70% sasta, par 2 minute notice par task cheen sakta hai — sirf interruption-tolerant kaam',
          'Task size fixed combos mein aata hai (e.g. 0.25 vCPU / 0.5–2 GB)',
        ],
        cost: '~$0.04048 per vCPU-ghanta + ~$0.004445 per GB-ghanta. 1 vCPU + 2 GB, 24×7 ≈ (0.04048 + 0.00889) × 730 ≈ $36/mahina per task.',
        exam: '"run containers without managing servers/EC2 instances" → Fargate. "Kubernetes" likha ho → EKS (EKS bhi Fargate par chal sakta hai).',
        iac: `resource "aws_ecs_service" "api" {
  name            = "orders-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 3
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.api.id]
  }
}`,
        example: 'Orders API: 3 Fargate tasks do AZs mein ALB ke peeche, CPU 60% par auto scaling 3 → 12 tasks.',
        level: 'containers',
      },
      ecsec2: {
        leaf: true, icon: '🏭', pick: 'ECS on EC2 (capacity providers)',
        one: 'Containers ECS chalata hai, par containers tumhare EC2 instances par baithte hain.',
        why: 'GPU chahiye, ya scale itna bada hai ki EC2 + Savings Plans + Spot Fargate se kaafi sasta padta hai. Badle mein EC2 fleet ka patching tumhara kaam.',
        when: ['GPU containers (ML inference)', '100+ steady containers — bin-packing se instance poora use hota hai', 'Spot instances ke saath sasta batch/worker fleet'],
        avoid: ['Chhoti team jo OS patching nahi sambhal sakti', 'Chhota, spiky workload — Fargate ya Lambda simple hai'],
        gotchas: ['ECS-optimized AMI ko update karna tumhara kaam', 'Capacity provider + managed scaling on karo, warna tasks "PROVISIONING" mein atke rehte hain jab instances bhar jaate hain'],
        cost: 'EC2 ka bill (instance-ghante) — containers bin-pack hon toh per-container cost Fargate se 20–40% kam ho sakta hai.',
        exam: '"GPU" + "containers" → ECS/EKS on EC2. Fargate GPU support nahi karta.',
        level: 'containers',
      },
      eks: {
        leaf: true, icon: '☸️', pick: 'Amazon EKS',
        one: 'Managed Kubernetes control plane — worker nodes EC2, Fargate, ya EKS Auto Mode par.',
        why: 'Team ko Kubernetes ka ecosystem chahiye (Helm, operators, portability). EKS control plane AWS sambhalta hai.',
        when: ['Pehle se Kubernetes chal raha hai (on-prem / doosra cloud)', 'Helm charts, service mesh, K8s operators chahiye', 'Multi-cloud portability ek asli requirement hai'],
        avoid: ['Sirf "container chalana hai" — ECS simple aur control plane free', 'Team mein Kubernetes jaanne wala koi nahi'],
        gotchas: ['Har cluster ka control plane ~$73/mahina (standard support) — purane K8s version par extended support mehenga', 'Kubernetes version har ~14 mahine mein upgrade karna padta hai'],
        cost: '$0.10/ghanta per cluster + nodes ka bill (EC2/Fargate).',
        exam: '"existing Kubernetes workloads", "open-source portability" → EKS.',
        level: 'containers',
      },
      ec2: {
        leaf: true, icon: '🖥️', pick: 'Amazon EC2',
        one: 'Virtual machine — OS, software, sab tumhare haath mein.',
        why: 'App container mein nahi hai, ya OS-level control / special hardware / per-core licence chahiye.',
        when: ['Legacy app (lift-and-shift migration)', 'Windows/SQL Server licence, ya Dedicated Host chahiye', 'Special hardware: GPU, bahut zyada memory, local NVMe'],
        avoid: ['Spiky chhote kaam — Lambda', 'Container app jahan servers manage nahi karne — Fargate'],
        gotchas: ['OS patching, AMI updates, agent installs — sab tumhara (shared responsibility)', 'Single instance = single AZ. HA ke liye Auto Scaling group 2+ AZs mein'],
        cost: 'Per-second billing. m7g.large (2 vCPU, 8 GB, Graviton) ≈ $0.0816/ghanta ≈ $60/mahina On-Demand; Savings Plan se ~40% kam.',
        exam: '"full control of the OS", "BYOL license", "lift and shift" → EC2.',
        level: 'ec2',
      },
      batch: {
        leaf: true, icon: '🧮', pick: 'AWS Batch',
        one: 'Jobs ko queue mein daalo — Batch compute (EC2/Spot/Fargate) laata hai, jobs chalata hai, phir band karta hai.',
        why: 'Kaam ghanton chalta hai aur job-queue jaisa hai. Batch Spot instances se 70–90% sasta compute deta hai.',
        when: ['Video transcoding, genomics, Monte-Carlo, raat ki report', 'Hazaaron independent jobs, retry ke saath'],
        avoid: ['User ke saamne real-time API', '15 minute se chhote event jobs — Lambda simple'],
        gotchas: ['Spot par chal rahe ho toh job checkpoint karo — 2 minute notice par instance ja sakta hai'],
        cost: 'Batch khud free — sirf EC2/Fargate ka bill. Spot ke saath 70–90% bachat.',
        exam: '"batch processing jobs", "hundreds of thousands of jobs" → AWS Batch.',
        level: 'compute',
      },
    },
    compare: {
      cols: ['', 'Lambda', 'Fargate', 'ECS on EC2', 'EKS', 'EC2'],
      rows: [
        ['Max ek kaam', '15 min', 'unlimited', 'unlimited', 'unlimited', 'unlimited'],
        ['Idle ka bill', '$0', 'task chal raha = bill', 'instance = bill', 'control plane + nodes', 'instance = bill'],
        ['Ops-load', 'sabse kam', 'kam', 'medium (EC2 patch)', 'zyada (K8s)', 'sabse zyada'],
        ['GPU', 'nahi', 'nahi', 'haan', 'haan', 'haan'],
        ['Scale speed', 'ms–seconds', '~1 min', 'minutes', 'minutes', 'minutes'],
        ['Best fit', 'spiky events', 'steady containers', 'bada steady/GPU', 'K8s ecosystem', 'legacy / full control'],
      ],
    },
    scenarios: [
      { s: 'S3 mein PDF upload hota hai, 20 second mein text nikaal ke DynamoDB mein likhna hai. Din mein 3,000 uploads, raat ko lagbhag zero.', answer: 'lambda', explain: 'Chhota event-driven kaam, spiky traffic. Lambda ka idle bill $0.' },
      { s: 'Ek video ko 4K mein render karne mein 3 ghante lagte hain. Roz 500 videos.', answer: 'batch', explain: '15 minute se lamba, job-queue jaisa kaam. Batch + Spot sabse sasta.' },
      { s: 'Orders API Docker image mein hai, 24×7 chalti hai, team mein 3 log, koi Kubernetes nahi jaanta.', answer: 'fargate', explain: 'Steady container service, servers manage nahi karne, Kubernetes nahi chahiye → Fargate.' },
      { s: 'Company ke paas on-prem Kubernetes par 40 microservices hain, Helm charts ke saath. AWS par same tooling chahiye.', answer: 'eks', explain: 'Existing Kubernetes + Helm → EKS. ECS par Helm charts kaam nahi karte.' },
      { s: 'Purana Windows app jo ek specific licensed software ke saath per-core licence par chalta hai. Container nahi bana.', answer: 'ec2', explain: 'Legacy, licence, OS-control → EC2 (licence ke hisaab se Dedicated Host bhi).' },
      { s: 'ML inference containers ko GPU chahiye, 24×7, 30 containers.', answer: 'ecsec2', explain: 'Fargate par GPU nahi. ECS on EC2 GPU instances (ya EKS) chahiye.' },
      { s: 'Har raat 2 baje ek 5-minute cleanup script chalni hai.', answer: 'lambda', explain: 'EventBridge Scheduler + Lambda. Server 24 ghante chalane ki zaroorat nahi.' },
      { s: 'Ek API har second 800 requests lagataar leti hai, har request 50 ms, 24×7. Container ready hai, K8s nahi chahiye.', answer: 'fargate', explain: 'Steady bhaari traffic par Lambda ka per-request bill bahut badhta hai. Fargate tasks steady load par sasta.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'ec2buy',
    icon: '💳',
    title: 'EC2 ka paisa kaise do? — On-Demand, Savings Plans, RI, Spot, Dedicated',
    short: 'EC2 pricing model',
    tldr: 'Pehle right-size karo. Phir jo hamesha chalta hai us par commit karo (Savings Plans). Jo kaam ruk ke dobara chal sakta hai, us kaam ko Spot par chalao. Bacha hua On-Demand.',
    levels: ['ec2', 'cost', 'costdec'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kaam beech mein ruk jaaye (instance 2 minute notice par chhin jaaye) toh chalega?',
        why: 'Spot instances AWS ki khaali capacity hain — 90% tak sasti, par AWS 2 minute ka notice dekar wapas le sakta hai.',
        options: [
          { t: 'Haan — batch, CI builds, stateless workers, retry ho sakta hai', next: 'spot' },
          { t: 'Nahi — production database, user-facing server', next: 'q2' },
        ],
      },
      q2: {
        q: 'Licence ya compliance ke liye physical server tumhare naam chahiye?',
        options: [
          { t: 'Haan — per-socket/per-core licence (BYOL), ya regulator dedicated hardware maangta hai', next: 'dedicated' },
          { t: 'Nahi', next: 'q3' },
        ],
      },
      q3: {
        q: 'Instance kitne time tak chalega?',
        options: [
          { t: 'Kuch din/hafte — test, PoC, ya pata nahi', next: 'ondemand' },
          { t: '1–3 saal steady, 24×7 baseline', next: 'q4' },
        ],
      },
      q4: {
        q: 'Agle 1–3 saal mein instance family / region / Fargate-Lambda mein shift ho sakte ho?',
        why: 'Compute Savings Plan har family, region, Fargate aur Lambda par lagta hai (flexible). EC2 Instance Savings Plan ek family + region mein bandhta hai, badle mein thoda zyada discount.',
        options: [
          { t: 'Haan, flexibility chahiye', next: 'csp' },
          { t: 'Nahi, family aur region fix hai — max discount chahiye', next: 'eisp' },
          { t: 'Capacity GUARANTEE chahiye ek specific AZ mein (DR, event day)', next: 'odcr' },
        ],
      },
      spot: {
        leaf: true, icon: '🎯', pick: 'Spot Instances',
        one: 'AWS ki khaali capacity — On-Demand se 90% tak sasti, 2 minute notice par wapas.',
        when: ['CI/CD build runners, batch jobs, big data (EMR), stateless web workers ASG mein mix', 'Kaam checkpoint/retry kar sakta hai'],
        avoid: ['Database, single-instance production server', 'Kaam jo beech mein ruk nahi sakta'],
        gotchas: ['ASG mein multiple instance types + "price-capacity-optimized" allocation rakho — ek type ki capacity khatam ho toh doosra', 'Interruption notice EventBridge / instance metadata se pakdo aur graceful drain karo'],
        cost: '60–90% bachat. Price demand ke saath dheere badalta hai.',
        exam: '"MOST cost-effective" + "can tolerate interruptions" / "fault-tolerant batch" → Spot.',
        level: 'cost',
      },
      dedicated: {
        leaf: true, icon: '🏢', pick: 'Dedicated Host',
        one: 'Poora physical server tumhara — sockets/cores dikhte hain, BYOL licence lagta hai.',
        when: ['Windows Server / SQL Server / Oracle ke per-core licence BYOL', 'Compliance: physical isolation ka proof'],
        avoid: ['Bina licence/compliance wajah ke — sabse mehenga option'],
        gotchas: ['Dedicated Instance ≠ Dedicated Host: Dedicated Instance hardware isolate karta hai par sockets/cores ki visibility nahi deta (BYOL ke liye Host chahiye)'],
        cost: 'Per host per ghanta — host ke andar jitne instances, sab us bill mein.',
        exam: '"BYOL", "per-socket licensing", "server-bound software licenses" → Dedicated Host.',
        level: 'ec2',
      },
      ondemand: {
        leaf: true, icon: '⏱️', pick: 'On-Demand',
        one: 'Koi commitment nahi — per-second bill, jab chaaho band karo.',
        when: ['Short-term, unpredictable kaam', 'Naye workload ka pehla mahina — usage samajhne ke liye', 'Savings Plan ke upar ka extra peak'],
        avoid: ['Saalon chalne wala steady baseline — Savings Plan se 30–70% bachat chhoot rahi hai'],
        gotchas: ['Sabse mehenga per-ghanta rate — Cost Explorer ka "Savings Plans recommendations" dekhte raho'],
        cost: 'List price. m7g.large ≈ $0.0816/ghanta.',
        exam: '"short-term", "unpredictable", "cannot be interrupted", "no commitment" → On-Demand.',
        level: 'ec2',
      },
      csp: {
        leaf: true, icon: '🔄', pick: 'Compute Savings Plan',
        one: '$X/ghanta ka 1 ya 3 saal commit — kisi bhi EC2 family, region, Fargate aur Lambda par discount.',
        when: ['Steady baseline par jahan architecture badal sakta hai (EC2 → Fargate/Graviton)', 'Multi-region compute'],
        avoid: ['Pehle right-size kiye bina commit — oversized instances par discount lena = waste ko lock karna'],
        gotchas: ['Commit $/ghanta mein hota hai, instance count mein nahi', 'Organization mein consolidated billing se saare accounts mein share hota hai'],
        cost: 'On-Demand se ~66% tak kam (3 saal, all upfront).',
        exam: '"flexibility to change instance family/region" + "commitment" → Compute Savings Plan.',
        level: 'cost',
      },
      eisp: {
        leaf: true, icon: '🔒', pick: 'EC2 Instance Savings Plan (ya Standard RI)',
        one: 'Ek instance family + region par commit — sabse zyada discount.',
        when: ['Family aur region saalon fix hai (e.g. m7g in ap-south-1)'],
        avoid: ['Family badalne ka plan ho — Compute Savings Plan lo'],
        gotchas: ['Size badal sakte ho (m7g.large → m7g.xlarge) same family mein', 'Purane Reserved Instances bhi milte hain; naye setup mein Savings Plans simple hain'],
        cost: 'On-Demand se ~72% tak kam.',
        exam: '"steady-state usage" + "specific instance family" + "largest discount" → EC2 Instance SP / Standard RI.',
        level: 'cost',
      },
      odcr: {
        leaf: true, icon: '📌', pick: 'On-Demand Capacity Reservation',
        one: 'Ek specific AZ mein capacity book — discount nahi, guarantee hai.',
        when: ['DR region mein failover ke din capacity pakki chahiye', 'Big sale day (Diwali) par instance type ki kami ka darr'],
        avoid: ['Sirf paisa bachana ho — Capacity Reservation discount nahi deti'],
        gotchas: ['Reserved capacity ka bill lagta hai chahe instance chale ya na chale', 'Savings Plan ke saath combine karo — guarantee + discount'],
        cost: 'On-Demand rate, use ho ya na ho.',
        exam: '"guarantee capacity in a specific AZ" → On-Demand Capacity Reservation (ya zonal RI).',
        level: 'cost',
      },
    },
    compare: {
      cols: ['', 'On-Demand', 'Savings Plan / RI', 'Spot', 'Dedicated Host'],
      rows: [
        ['Discount', '0%', '~66–72%', '60–90%', 'mehenga'],
        ['Commitment', 'koi nahi', '1 ya 3 saal', 'koi nahi', 'per host'],
        ['Interruption', 'nahi', 'nahi', '2 min notice', 'nahi'],
        ['Use', 'unpredictable', 'steady baseline', 'fault-tolerant', 'BYOL / compliance'],
      ],
    },
    scenarios: [
      { s: 'CI pipeline ke build runners — ek build fail ho toh dobara chal jaata hai.', answer: 'spot', explain: 'Interruption-tolerant → Spot, 60–90% bachat.' },
      { s: 'Production web tier: 3 saal se 10 m7g.large 24×7 chal rahe hain, family badalne ka koi plan nahi.', answer: 'eisp', explain: 'Fix family + region, steady → EC2 Instance Savings Plan (max discount).' },
      { s: 'Company agle saal EC2 se Fargate aur Graviton par shift karegi, par baseline compute $5/ghanta hamesha rahega.', answer: 'csp', explain: 'Commit chahiye par flexibility bhi → Compute Savings Plan (Fargate/Lambda par bhi lagta hai).' },
      { s: 'Oracle database per-core licence ke saath BYOL karna hai.', answer: 'dedicated', explain: 'Per-core BYOL → Dedicated Host (cores/sockets visible).' },
      { s: 'Ek 2-hafte ka PoC, baad mein shayad band.', answer: 'ondemand', explain: 'Short-term, uncertain → On-Demand.' },
      { s: 'DR region mein disaster ke din 50 instances pakke milne chahiye.', answer: 'odcr', explain: 'Capacity guarantee → On-Demand Capacity Reservation.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'containers',
    icon: '📦',
    title: 'Container kahan chalaun? — ECS ya EKS, Fargate ya EC2',
    short: 'ECS vs EKS',
    tldr: 'Do alag faisle hain. (1) Orchestrator: ECS (AWS ka simple, control plane free) ya EKS (Kubernetes). (2) Capacity: Fargate (server nahi) ya EC2 (sasta at scale, GPU).',
    levels: ['containers'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kubernetes API/tooling ki asli zaroorat hai?',
        options: [
          { t: 'Haan — Helm, operators, multi-cloud, existing K8s', next: 'q2' },
          { t: 'Nahi — bas containers reliably chalane hain', next: 'q3' },
        ],
      },
      q2: {
        q: 'Nodes (servers) ka jhanjhat kitna chahiye?',
        options: [
          { t: 'Bilkul nahi — pods bina nodes ke', next: 'eksfargate' },
          { t: 'Theek hai — GPU, DaemonSets, cost control chahiye', next: 'eksec2' },
        ],
      },
      q3: {
        q: 'GPU chahiye ya 100+ steady containers?',
        options: [
          { t: 'Nahi', next: 'ecsfargate' },
          { t: 'Haan', next: 'ecsec2c' },
        ],
      },
      ecsfargate: { leaf: true, icon: '🟧', pick: 'ECS + Fargate', one: 'Sabse kam ops: task definition likho, AWS chalata hai.', when: ['Chhoti/medium team, web APIs, workers'], avoid: ['GPU', 'Kubernetes tooling'], gotchas: ['Image pull ke liye NAT ya ECR VPC endpoints'], cost: 'Per task vCPU + GB ghanta.', exam: '"containers" + "no servers to manage" → ECS on Fargate.', level: 'containers' },
      ecsec2c: { leaf: true, icon: '🏭', pick: 'ECS + EC2', one: 'ECS orchestrate karta hai, containers tumhare EC2 par.', when: ['GPU', 'Bade steady fleet par cost'], avoid: ['Chhoti team jo EC2 patching nahi sambhal sakti'], gotchas: ['Capacity providers + managed scaling on rakho'], cost: 'EC2 ka bill, bin-packing se sasta.', level: 'containers' },
      eksfargate: { leaf: true, icon: '☸️', pick: 'EKS + Fargate', one: 'Kubernetes pods bina nodes ke.', when: ['K8s chahiye par node management nahi'], avoid: ['DaemonSets, GPU, privileged pods — Fargate par nahi chalte'], gotchas: ['Har pod ek alag micro-VM — bahut chhote pods par mehenga'], cost: 'Control plane $0.10/ghanta + pod vCPU/GB.', level: 'containers' },
      eksec2: { leaf: true, icon: '⚙️', pick: 'EKS + EC2 (managed node groups / Karpenter)', one: 'Poora Kubernetes control, nodes EC2 par.', when: ['GPU, DaemonSets, Spot-heavy fleets, max control'], avoid: ['Team ke paas K8s skills nahi'], gotchas: ['Node AMI + K8s version upgrades tumhare zimme'], cost: 'Control plane + EC2 (Spot/Savings Plan se kam).', level: 'containers' },
    },
    scenarios: [
      { s: 'Startup ke 5 microservices, koi Kubernetes nahi jaanta, servers patch nahi karne.', answer: 'ecsfargate', explain: 'Simple + kam ops → ECS on Fargate.' },
      { s: 'K8s par ML platform, GPU nodes chahiye, Karpenter se Spot use karna hai.', answer: 'eksec2', explain: 'Kubernetes + GPU + node control → EKS on EC2.' },
      { s: 'Existing Helm charts, par team nodes manage nahi karna chahti; koi DaemonSet nahi.', answer: 'eksfargate', explain: 'Kubernetes chahiye, nodes nahi → EKS on Fargate.' },
      { s: '150 steady containers, Kubernetes nahi chahiye, har mahine ka bill kam karna hai.', answer: 'ecsec2c', explain: 'Bada steady scale, K8s nahi → ECS on EC2 + Savings Plans.' },
    ],
  },
]);
