/* =====================================================================
   AWS Gurukul — Track 1: 🌱 Beginner (Shishya Path)
   Cloud ka pehla word nahi aata? Yahan se shuruaat.
   Naya level add karna ho? Bas is file mein ek aur object,
   ya kahin bhi: AG.registerLevels('beginner', [ {...} ]);
   ===================================================================== */

AG.registerLevels('beginner', [

  /* ================= LEVEL 8: BOSS — First Architecture ================= */
  {
    id: 'boss1',
    icon: '🏆',
    title: 'Boss: First 3-Tier Architecture',
    badge: 'Cloud Pandit',
    objectives: [
      'Poora 3-tier web app architecture design karna (ALB → EC2 ASG → RDS)',
      'Saare beginner concepts ek saath jodna',
      'aws CLI se complete infrastructure verify karna',
      'Boss-level interview marathon',
    ],
    lesson: [
      `<h3>🏆 Boss level — saab kuch jodo</h3>
       <p>Pichhle 7 levels mein tumne alag-alag seekha: IAM, EC2, S3, VPC, RDS,
       ELB+ASG. Ab in sab ko <b>jodke ek complete architecture</b> banao —
       jaise real SAA exam mein poocha jaata.</p>
       <p>Goal: ek <b>3-tier web application</b> jo:</p>
       <ul>
         <li>🌐 Internet se accessible (ALB public)</li>
         <li>🖥️ Auto-scales traffic ke saath (ASG multi-AZ)</li>
         <li>🗄️ Data safe (RDS Multi-AZ, S3 images)</li>
         <li>🔒 Secure (private subnet DB, SG rules, IAM roles)</li>
         <li>⚡ Survives failure (ek AZ down bhi chale)</li>
       </ul>`,
      `<h3>🏗️ Architecture — piece by piece</h3>
       <pre>🌐 Users (internet)
   ↓
📡 Route 53 (DNS) → ALB
   ↓
🌐 VPC (10.0.0.0/16, Multi-AZ)
   ├── Public subnets (AZ-a, AZ-b, AZ-c)
   │     └── ALB (internet-facing)
   ├── Private subnets (AZ-a, AZ-b, AZ-c)
   │     └── ASG: 3 EC2 (web app)
   └── DB subnets (AZ-a, AZ-b)
         └── RDS Multi-AZ (primary + standby)
🪣 S3 (images, static assets)
🔐 IAM roles (EC2 → S3 read, RDS access)</pre>
       <p>💡 <b>Key decisions:</b></p>
       <ul>
         <li>ALB public (lets users in), EC2 private (hackar direct nahi pahunche)</li>
         <li>RDS Multi-AZ (DR, 60-120s failover)</li>
         <li>ASG Multi-AZ (ek AZ down bhi 2/3 instances chal rahe)</li>
         <li>S3 for images (CDN-ready, cheap)</li>
         <li>EC2 IAM role → S3 access (no hard-coded keys!)</li>
       </ul>`,
      `<h3>🚨 Common Boss-level mistakes (interview mein avoid karo)</h3>
       <ul>
         <li>❌ EC2 public subnet mein (internet se hack) → ✅ Private, ALB se</li>
         <li>❌ RDS single-AZ (no DR) → ✅ Multi-AZ</li>
         <li>❌ Hard-coded AWS keys EC2 pe → ✅ IAM role</li>
         <li>❌ SSH 0.0.0.0/0 → ✅ SSM Session Manager ya internal only</li>
         <li>❌ S3 public bucket (images) → ✅ CloudFront signed URLs</li>
         <li>❌ SG: DB 0.0.0.0/0 port 5432 → ✅ Source = app SG</li>
       </ul>
       <div class="war-story"><b>⚡ Real architecture:</b> Yehi architecture
       Netflix, Airbnb, Slack jaise companies use karte hain (with extras —
       CloudFront, ElastiCache, microservices). Tumne beginner level mein
       yeh banaya — bahut bada milestone! Certificate ready. 🏆</div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Sahi ya Galat architecture decision?',
        instructions: 'Har decision ko sahi ya galat bin mein daalo — production best practice ke hisaab se.',
        bins: [
          { id: 'right', label: '✅ Sahi (best practice)' },
          { id: 'wrong', label: '❌ Galat (anti-pattern)' },
        ],
        items: [
          { text: 'EC2 app ko private subnet mein, ALB se access', bin: 'right', explain: 'Hackar internet se direct EC2 nahi pahunche. ALB beech mein.' },
          { text: 'RDS Multi-AZ on for production', bin: 'right', explain: 'DR. Primary mara → standby promote 60-120s. Sasta insurance.' },
          { text: 'EC2 pe hard-coded AWS access key (S3 ke liye)', bin: 'wrong', explain: 'NEVER. IAM role use karo. Key git mein leak, laptop chala jaaye.' },
          { text: 'SSH (port 22) 0.0.0.0/0 pe khula', bin: 'wrong', explain: 'Bots brute-force. SSM Session Manager ya internal CIDR.' },
          { text: 'S3 images bucket public (sab read)', bin: 'wrong', explain: 'CloudFront signed URLs for private. Public = leak risk.' },
          { text: 'DB security group: source = app SG (not CIDR)', bin: 'right', explain: 'SG reference = sirf app se DB access. Tightest possible.' },
          { text: 'ASG single-AZ (sasta)', bin: 'wrong', explain: 'AZ down → sab instances gone. Multi-AZ for HA.' },
          { text: 'ALB SSL termination (cert ALB pe)', bin: 'right', explain: 'HTTPS user se ALB tak. ALB → EC2 HTTP (internal, fast).' },
        ],
      },
      {
        type: 'incident',
        title: '🚨 Incident: Black Friday Outage',
        instructions: '3 AM pager. App down. Debug karo — decision tree.',
        pager: `🚨 ALERT: E-commerce app DOWN — Black Friday sale
HTTP 502 Bad Gateway — ALB se
Traffic: 50x normal (sale day)
Time: 3:07 AM IST`,
        start: 'n1',
        nodes: {
          n1: {
            sitrep: 'aws ec2 describe-instances → 3 instances Running\naws elbv2 describe-target-groups → 0 healthy targets!',
            text: 'ALB ke saare targets unhealthy dikha rahe. Pehla kadam?',
            choices: [
              { t: 'Target group ka health check path verify karo (/health 200 return karna chahiye)', good: true, next: 'n2', explain: 'Sahi. Health check fail → ALB traffic band. Root cause yahi hai.' },
              { t: 'ALB delete karke naya banao', good: false, explain: 'Galat — ALB sahi hai, targets unhealthy. Naya banake problem nahi solve.' },
              { t: 'Sab instances terminate karo', good: false, explain: 'Galat — ASG wapas naya banayega but root cause fix nahi.' },
            ],
          },
          n2: {
            sitrep: 'EC2 pe SSH: curl localhost:80 → 503\nApp logs: "DB connection refused"',
            text: 'App DB se connect nahi ho raha. Debug kaise?',
            choices: [
              { t: 'RDS status check — Multi-AZ failover hua? SG: EC2 → RDS port 5432 allow?', good: true, next: 'n3', explain: 'Sahi. DB connection issue — RDS down ya SG block. Dono check karo.' },
              { t: 'App code debug karo ( Profiler chalao)', good: false, explain: 'Galat — code issue nahi, infrastructure issue. DB connection.' },
              { t: 'Traffic kam karo (rate limit)', good: false, explain: 'Galat — symptom chhupana, root cause nahi.' },
            ],
          },
          n3: {
            sitrep: 'aws rds describe-db-instances → Multi-AZ failover in progress\nDB SG ingress: source = 0.0.0.0/0 (not app SG)!',
            text: 'Failover chal raha. Wait karo ya aur kuch?',
            choices: [
              { t: 'Failover complete hone do (60-120s), aur DB SG ko fix karo: source = app SG (not 0.0.0.0/0) — security hole bhi dhundo', good: true, next: 'n4', explain: 'Sahi — failover wait + security fix. SG galat tha (0.0.0.0/0 = hack risk).' },
              { t: 'Manual failover trigger karo (reboot with failover)', good: false, explain: 'Galat — already in progress. Wait karo.' },
              { t: 'Naya RDS launch karo', good: false, explain: 'Galat — overkill. Failover handle karega.' },
            ],
          },
          n4: {
            sitrep: 'Failover done. App reconnect. Health check 200. ALB traffic wapas.\nSG fix applied: DB source = app-sg.',
            text: 'App wapas up. Long-term kya improve karo?',
            choices: [
              { t: 'CloudWatch alarm: DB connections, failover alert. ASG scale based on request count. Multi-AZ already. Post-mortem doc likho', good: true, next: 'end', explain: 'Sahi — observability + auto-reaction. Post-mortem = culture.' },
              { t: 'Kuch nahi — chalta hai ab', good: false, explain: 'Galat — yeh dobara ho sakta. Monitoring + alerting zaroori.' },
              { t: 'RDS Multi-AZ band kar do (sasta)', good: false, explain: 'Galat — yahi to bacha! Multi-AZ DR deta.' },
            ],
          },
          end: { end: true, text: '🧯 Incident resolved!', summary: '<b>Root cause:</b> RDS failover chal raha tha, app DB connect nahi kar paaya → /health 503 → ALB targets unhealthy → 502.<br><b>Found:</b> DB SG 0.0.0.0/0 (security hole).<br><b>Fixes:</b> (1) Failover complete, (2) SG fixed, (3) CloudWatch alarms + post-mortem.<br><b>Seekh:</b> Health check DB dependency expose karta. Multi-AZ DR deta but app ko <b>retry logic</b> chahiye failover ke 60-120s ke liye.' },
        },
      },
      {
        type: 'terminal',
        title: '🖥️ Boss Mission: Architecture Audit',
        instructions: 'Complete 3-tier architecture verify karo — sab pieces jude hain?',
        goal: 'Poora infrastructure audit: <b>(1)</b> ALB hai? <b>(2)</b> ASG hai? <b>(3)</b> RDS Multi-AZ hai? <b>(4)</b> S3 bucket hai? Sab commands chalao.',
        tasks: [
          { text: 'ALB check: aws elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
          { text: 'ASG check: aws autoscaling describe-auto-scaling-groups', check: s => s.history.some(h => /aws autoscaling describe-auto-scaling-groups/.test(h)) },
          { text: 'RDS check: aws rds describe-db-instances', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
          { text: 'S3 check: aws s3 ls', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          elbs: [{ id: 'alb-001', name: 'web-alb', type: 'application', scheme: 'internet-facing', dns: 'web-alb-123.us-east-1.elb.amazonaws.com' }],
          asgs: [{ name: 'web-asg', min: 2, max: 10, desired: 3, instances: ['i-1', 'i-2', 'i-3'], vpcZone: 'subnet-a,subnet-b,subnet-c', lb: 'web-alb' }],
          rds: [{ id: 'prod-db', name: 'prod-db', engine: 'postgres', class: 'db.r6.large', state: 'available', multiAZ: true, endpoint: 'prod-db.abc.rds.amazonaws.com', storage: 100 }],
          buckets: [{ name: 'shop-images-2024', region: 'us-east-1', encryption: true, public: false, objects: [] }],
          vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        success: s => [
          /aws elbv2 describe-load-balancers/.test(s.history.join(' ')),
          /aws autoscaling describe-auto-scaling-groups/.test(s.history.join(' ')),
          /aws rds describe-db-instances/.test(s.history.join(' ')),
          /aws s3 ls\b/.test(s.history.join(' ')),
        ].every(Boolean),
        successText: 'Poora architecture verify! ALB (internet-facing) + ASG (3 instances, multi-AZ, scale 2-10) + RDS (Multi-AZ on!) + S3 (encrypted, private). Yehi <b>SAA exam ka classic 3-tier</b>. Tumne beginner track ka har piece joda — Cloud Pandit certificate ready! 🏆',
        hints: [
          'aws elbv2 describe-load-balancers — ALB dekho',
          'aws autoscaling describe-auto-scaling-groups — ASG',
          'aws rds describe-db-instances — RDS Multi-AZ?',
          'aws s3 ls — bucket dekho',
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Boss Architecture',
      instructions: 'Final interview — full architecture round. 🎤',
      questions: [
        {
          q: 'Interviewer: "Ek e-commerce app design karo — 1 lakh daily users, 99.9% uptime." Sahi architecture summary?',
          choices: [
            'Route 53 → ALB (public, Multi-AZ) → ASG of EC2 (private, Multi-AZ, 3+ min) → RDS Multi-AZ (private DB subnets) → S3 (images). CloudFront for CDN. IAM roles, SG tight',
            'Ek bada EC2 instance — sab kuch usi pe',
            'Sirf S3 static website — no EC2',
            'Lambda + API Gateway — serverless sab',
          ],
          answer: 0,
          explain: 'Yehi classic 3-tier. Multi-AZ har layer pe. ALB public, app private. RDS Multi-AZ. S3 for static. CloudFront for global. Yehi SAA exam ka answer.',
        },
        {
          q: 'Scenario: app ko S3 se images read karni hain. Best practice?',
          choices: [
            'EC2 pe IAM role lagao with S3 read policy. App role assume kare. No hard-coded keys, CloudTrail audit',
            'S3 bucket public kar do — sab read',
            'AWS access key EC2 ke env mein',
            'Images EC2 ke EBS pe copy kar lo',
          ],
          answer: 0,
          explain: 'IAM role = security best practice. Temporary STS token, no key leak. SAA exam mein yeh answer hamesha.',
        },
        {
          q: '"Ek AZ down ho gaya — tumhari app kaise survive karegi?" — senior Q.',
          choices: [
            'Multi-AZ har layer pe: ALB (Multi-AZ), ASG (3 AZs — 2 bachenge), RDS Multi-AZ (standby promote). Traffic automatic shift. 99.9%+ uptime',
            'AWS automatic recovery karta hai — kuch nahi karna',
            'Manual failover — admin call karo',
            'App down — ek AZ pe bharosa mat karo',
          ],
          answer: 0,
          explain: 'HA = Multi-AZ har layer. ALB Multi-AZ, ASG 3 AZs, RDS Multi-AZ. Ek AZ down → 2/3 EC2 chal rahe, RDS failover, ALB redirect. Zero downtime.',
        },
      ],
    },
    success: [
      'Main complete 3-tier web app architecture design kar sakta hoon (ALB → ASG → RDS + S3)',
      'Main production best practices (Multi-AZ, IAM roles, SG tight, private subnets) samjhta hoon',
      'Main aws CLI se complete infrastructure audit kar sakta hoon',
      'Main interview mein architecture question confidently answer kar sakta hoon — Cloud Pandit ready! 🏆',
    ],
    homework: `<p>Apne AWS account mein complete 3-tier banao (Free Tier + caution):</p>
      <pre># 1. VPC (multi-AZ, public + private subnets)
# 2. RDS PostgreSQL Multi-AZ (Free Tier: single-AZ OK)
# 3. EC2 launch template (Amazon Linux + nginx + app)
# 4. ASG: min 2, max 4, Multi-AZ
# 5. ALB: internet-facing, target group → ASG
# 6. S3 bucket for images (private, encryption on)
# 7. IAM role for EC2 (S3 read)
# 8. Route 53 (ya ALB DNS direct) — browser mein test

# Verify sab:
aws elbv2 describe-load-balancers
aws autoscaling describe-auto-scaling-groups
aws rds describe-db-instances
aws s3 ls</pre>
      <p>✅ Self-check: Browser mein app dikha? 2 EC2 ASG mein? RDS available? <b>Sab delete karna baad mein — bill avoid!</b></p>`,
    cards: [
      { front: '3-tier web app architecture (SAA classic)?', back: 'Route 53 → ALB (public, Multi-AZ) → ASG of EC2 (private, Multi-AZ) → RDS Multi-AZ (private DB subnets) + S3 (images). CloudFront for CDN. IAM roles, SG tight.' },
      { front: 'EC2 private subnet kyun, public nahi?', back: 'Hackar internet se direct EC2 nahi pahunche. ALB beech mein (public). EC2 private — sirf ALB se access. SG: ALB → EC2 allow.' },
      { front: 'Multi-AZ har layer pe kyun?', back: 'ALB Multi-AZ = ek AZ down bhi traffic serve. ASG 3 AZs = 2/3 bachenge. RDS Multi-AZ = primary mara toh standby. HA = har layer redundant.' },
      { front: 'EC2 ko S3 access — best practice?', back: '<b>IAM role</b> EC2 pe lagao (S3 read policy). App role assume — temporary STS token, no hard-coded key. CloudTrail audit. NEVER key in env.' },
      { front: 'App DB connect nahi kar paaya — debug flow?', back: '1) <code>aws rds describe-db-instances</code> — Multi-AZ failover? 2) SG: app → DB port allow? 3) App logs: connection refused? 4) Retry logic in app for failover window.' },
    ],
  },

]);
