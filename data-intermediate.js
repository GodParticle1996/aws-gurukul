/* =====================================================================
   AWS Gurukul — Track 2: 🔥 Intermediate (Sadhak Path)
   Architect ka hathiyaar-basta. Production-grade building blocks.
   Naya level add karna ho? Bas is file mein ek aur object.
   ===================================================================== */

AG.registerLevels('intermediate', [

  /* ================= LEVEL 10: Security Deep Dive ================= */
  {
    id: 'security',
    icon: '🛡️',
    title: 'Security Deep Dive — Encryption + Protection',
    badge: 'Security Senapati',
    objectives: [
      '<b>KMS</b> — encryption key management',
      '<b>WAF, Shield, GuardDuty</b> — protection layers',
      '<b>Secrets Manager</b> — credentials rotation',
      '<b>Defense in depth</b> — layers par layers',
    ],
    lesson: [
      `<h3>🔑 KMS — encryption keys ka manager</h3>
       <p><b>KMS (Key Management Service)</b> = encryption keys create/manage.
       Keys se data encrypt/decrypt. AWS managed ya customer managed keys.</p>
       <ul>
         <li>🔐 <b>AWS managed</b> — S3/S3/EBS ke liye auto (aws/s3 key)</li>
         <li>🔑 <b>Customer managed</b> — tumhare keys, define rotation, who
             can use, CloudTrail audit</li>
         <li>🔄 <b>Automatic rotation</b> — har saal key change (no data re-encrypt)</li>
         <li>📝 <b>Key policy</b> — kaun encrypt/decrypt kar sakta</li>
       </ul>
       <p>💡 S3 SSE-KMS = KMS key use. Decrypt karne wale ko <code>kms:Decrypt</code>
       permission chahiye. Extra security layer.</p>`,
      `<h3>🛡️ WAF + Shield — web attacks + DDoS</h3>
       <p><b>WAF (Web Application Firewall)</b> = Layer-7 firewall. SQL
       injection, XSS, bad bots block. Rules per URL.</p>
       <ul>
         <li>💉 <b>SQL injection</b> — <code>' OR 1=1</code> block</li>
         <li>📧 <b>XSS</b> — <code>&lt;script&gt;</code> block</li>
         <li>🚫 <b>Rate limiting</b> — 100 req/min per IP</li>
         <li>🌍 <b>Geo blocking</b> — specific countries block</li>
       </ul>
       <p>🛡️ <b>Shield</b> = DDoS protection. <b>Standard</b> (free, auto on
       CloudFront/Route 53) ya <b>Advanced</b> ($3000/mo, DDoS response team,
       credit). CloudFront ke saath automatically on.</p>`,
      `<h3>🕵️ GuardDuty + Secrets Manager + Macie</h3>
       <p><b>GuardDuty</b> = ML-based threat detection. Suspicious API calls,
       unusual instance access, cryptomining automatically detect. No agents.</p>
       <p><b>Secrets Manager</b> = credentials (DB passwords, API keys) store +
       <b>automatic rotation</b> (RDS password 30 days). Lambda se retrieve.</p>
       <p><b>Macie</b> = ML to find PII (personally identifiable info) in S3.
       "Yeh bucket mein SSN hai" — alert.</p>
       <div class="war-story"><b>⚡ Real incident:</b> Capital One 2019 —
       SSRF vulnerability se EC2 metadata se IAM credentials chura li.
       <b>100M customer records leak</b>. GuardDuty on tha? Nahin. On hota to
       unusual API access detect hota. Seekh: <b>defense in depth</b> — har
       layer pe security. KMS + WAF + GuardDuty + Secrets Manager + Macie.
       Ek break bhi dusre bachaye.</div>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'Security Layers — diagram detective',
        instructions: 'Defense-in-depth ke components par click karo.',
        visual: 'security',
        questions: [
          { q: 'Layer-7 firewall — SQLi, XSS block?', target: 'waf', explain: 'WAF. Web Application Firewall. Rules per URL. CloudFront/ALB pe lagta.' },
          { q: 'Instance-level stateful firewall?', target: 'sg', explain: 'Security Group. Allow rules, stateful. Already seekha.' },
          { q: 'Encryption keys manage?', target: 'kms', explain: 'KMS. AWS managed ya customer managed. Rotation, audit.' },
          { q: 'Credentials store + rotation?', target: 'secrets', explain: 'Secrets Manager. DB passwords, API keys. Auto-rotation (RDS 30 days).' },
          { q: 'ML threat detection — suspicious API?', target: 'guardduty', explain: 'GuardDuty. No agents. ML detects unusual access, cryptomining.' },
          { q: 'PII in S3 find?', target: 'macie', explain: 'Macie. ML scans S3 for SSN, credit card, PII. Alert on discovery.' },
          { q: 'API audit log — kaun kya kiya?', target: 'cloudtrail', explain: 'CloudTrail. Sab AWS API calls log. Security investigation.' },
        ],
      },
      {
        type: 'match',
        title: 'Security services — naam milao',
        instructions: 'Har security service ko uske kaam se milao.',
        pairs: [
          { left: 'KMS', right: 'Encryption keys — create, rotate, audit. SSE-KMS, EBS encryption', explain: 'Customer managed keys = control + CloudTrail audit.' },
          { left: 'WAF', right: 'Web Application Firewall — SQLi, XSS, rate limit, geo block', explain: 'L7 firewall. CloudFront/ALB pe. Rules per URL.' },
          { left: 'Shield', right: 'DDoS protection — Standard free (CF/R53), Advanced $3k/mo (response team)', explain: 'Volumetric attacks absorb. CloudFront auto-on.' },
          { left: 'GuardDuty', right: 'ML threat detection — suspicious API, unusual access, cryptomining', explain: 'No agents. CloudTrail + VPC Flow Logs analyze.' },
          { left: 'Secrets Manager', right: 'Credentials store + auto-rotation (RDS password 30 days)', explain: 'Lambda se retrieve. No hard-coded secrets.' },
          { left: 'Macie', right: 'ML to find PII in S3 (SSN, credit card)', explain: 'Data discovery + classification. Compliance.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Security Quick-fire',
        questions: [
          {
            q: 'S3 mein customer data. Encryption best practice?',
            choices: [
              'SSE-KMS with customer managed key — rotation, CloudTrail audit (kaun decrypt), per-object control',
              'No encryption — fast',
              'SSE-S3 only — default free',
              'Client-side only — AWS nahi',
            ],
            answer: 0,
            explain: 'Sensitive = KMS. Rotation automatic, audit trail (kaun decrypt kiya, kab), per-object control. Compliance mandatory.',
          },
          {
            q: 'GuardDuty ka sabse bada value?',
            choices: [
              'ML-based automatic threat detection — no agents, no rules to write. Suspicious API, cryptomining, unusual access',
              'Free encryption',
              'Faster EC2',
              'S3 public block',
            ],
            answer: 0,
            explain: 'GuardDuty = "set and forget" threat detection. Analyzes CloudTrail, VPC Flow Logs, DNS. ML finds anomalies humans miss.',
          },
          {
            q: 'DB password app mein hard-coded. Risk + fix?',
            choices: [
              'Risk: leak (git, logs). Fix: Secrets Manager — store + auto-rotation (30 days). App runtime pe retrieve',
              'Risk: slow. Fix: bada EC2',
              'Risk: none. Fix: nothing',
              'Risk: cost. Fix: smaller DB',
            ],
            answer: 0,
            explain: 'Hard-coded = #1 breach vector. Secrets Manager = secure store + rotation + Lambda retrieve. No leak.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Security',
      instructions: 'Security architecture round. 🎤',
      questions: [
        {
          q: '"Defense in depth" — explain karo.',
          choices: [
            'Multiple security layers — WAF (L7) + SG (instance) + NACL (subnet) + KMS (encryption) + GuardDuty (detection) + IAM. Ek break baki bachaye',
            'Ek bada firewall sab kuch',
            'Sirf IAM enough',
            'Sirf encryption enough',
          ],
          answer: 0,
          explain: 'Layers = resilience. Capital One: SSRF broke metadata, but GuardDuty (if on) would detect. Defense in depth = no single point of failure.',
        },
        {
          q: 'Scenario: public web app, SQLi attacks. Solution?',
          choices: [
            'WAF on CloudFront/ALB — SQLi rules block. Plus parameterized queries in code. Defense in depth',
            'Bigger EC2',
            'App ko private subnet mein le jao',
            'Password strong karo',
            ],
          answer: 0,
            explain: 'WAF = L7 filter (SQLi/XSS patterns block). Code-side = parameterized queries (no string concat). Both layers = defense in depth.',
        },
        {
          q: 'Interviewer: "KMS SSE-S3 se kya extra deta hai?"',
          choices: [
            'Customer managed keys (rotation control), CloudTrail audit (kaun decrypt, kab), per-object permissions, compliance (HIPAA/PCI)',
            'KMS free hai',
            'KMS fast hai',
            'SSE-S3 me security nahi',
          ],
          answer: 0,
          explain: 'KMS = control + audit. "Kaun ne data decrypt kiya" — CloudTrail. Rotation automatic. Per-object key. Compliance mandatory.',
        },
      ],
    },
    success: [
      'Main KMS ka role (key management, rotation, audit) explain kar sakta hoon',
      'Main WAF, Shield, GuardDuty, Secrets Manager, Macie ke use cases bata sakta hoon',
      'Main defense in depth (layers par layers) design kar sakta hoon',
      'Main encryption best practices (SSE-KMS for sensitive) samjhta hoon',
    ],
    homework: `<p>Free Tier mein KMS key + Secrets Manager try:</p>
      <pre># KMS key banao
aws kms create-key --description "my-app-key"
# (Customer managed key — rotation enable)

# S3 bucket SSE-KMS encryption with this key

# Secrets Manager:
aws secretsmanager create-secret --name my-db-password --secret-string '{"username":"admin","password":"..."}'
# Auto-rotation: RDS password 30 days</pre>
      <p>✅ Self-check: KMS key bana? Secret store hua?</p>`,
    cards: [
      { front: 'KMS ka role?', back: 'Encryption keys create/manage/rotate. AWS managed (free, auto) ya customer managed (rotation, CloudTrail audit, per-object). Sensitive data = KMS.' },
      { front: 'WAF + Shield?', back: 'WAF = L7 firewall (SQLi, XSS, rate limit, geo block) on CloudFront/ALB. Shield = DDoS (Standard free on CF/R53, Advanced $3k/mo response team).' },
      { front: 'GuardDuty + Macie?', back: 'GuardDuty = ML threat detection (suspicious API, cryptomining, no agents). Macie = ML find PII in S3 (SSN, credit card). Set-and-forget.' },
      { front: 'Secrets Manager?', back: 'Credentials store + auto-rotation (RDS password 30 days). Lambda se retrieve. No hard-coded secrets (git leak). #1 breach fix.' },
      { front: 'Defense in depth?', back: 'Multiple layers: WAF + SG + NACL + KMS + GuardDuty + IAM + Secrets Manager. Ek break baki bachaye. Capital One: SSRF broke, GuardDuty (if on) would catch.' },
    ],
  },

  /* ================= LEVEL 9: BOSS — Multi-AZ Resilient ================= */
  {
    id: 'boss2',
    icon: '🏆',
    title: 'Boss: Multi-AZ Resilient E-Commerce',
    badge: 'Architect Sadhak',
    objectives: [
      'Poora production-grade resilient architecture design karna',
      'Saare intermediate concepts ek saath jodna',
      'aws CLI se complete infra verify',
      'Boss-level interview + incident',
    ],
    lesson: [
      `<h3>🏆 Boss level — production-grade resilient</h3>
       <p>Beginner boss mein basic 3-tier banaya. Ab <b>production-grade</b> —
       resilient, fast, secure, decoupled. Yehi real companies use karte.</p>
       <p>Goal: e-commerce app jo:</p>
       <ul>
         <li>🌍 <b>Global fast</b> — CloudFront CDN + Route 53 latency routing</li>
         <li>⚖️ <b>Handles spikes</b> — ALB + ASG multi-AZ, ElastiCache</li>
         <li>🗄️ <b>Data safe</b> — RDS Multi-AZ + DynamoDB + S3 (lifecycle)</li>
         <li>📨 <b>Decoupled</b> — SNS/SQS for async (email, analytics)</li>
         <li>🛡️ <b>Secure</b> — WAF + KMS + Secrets Manager + GuardDuty</li>
         <li>⚡ <b>Survives</b> — ek AZ/region down bhi chale</li>
       </ul>`,
      `<h3>🏗️ Architecture — poora picture</h3>
       <pre>🌐 Global Users
   ↓
📡 Route 53 (latency routing) → 🌍 CloudFront (edge cache)
   ↓
🌐 VPC Multi-AZ (us-east-1)
   ├── ALB (public, WAF on)
   ├── ASG: EC2 (Multi-AZ, 3+)
   ├── ElastiCache Redis (session cache)
   ├── RDS Multi-AZ (orders DB)
   ├── DynamoDB (user profiles, sessions)
   └── S3 (images, lifecycle → Glacier)
📨 SNS + SQS (order events → email/analytics async)
🔐 KMS (encryption), Secrets Manager (DB password), GuardDuty</pre>
       <p>💡 <b>Key additions vs beginner boss:</b></p>
       <ul>
         <li>CloudFront — global latency, DDoS</li>
         <li>ElastiCache — session cache, DB load kam</li>
         <li>DynamoDB — user profiles (high-scale NoSQL)</li>
         <li>SNS/SQS — async email/analytics (decoupled)</li>
         <li>WAF + KMS + GuardDuty — security layers</li>
       </ul>`,
      `<h3>🚨 Boss-level thinking (interview mein dikhao)</h3>
       <ul>
         <li>📊 <b>Cache strategy:</b> ElastiCache (hot sessions) + CloudFront (static) + DAX (DynamoDB hot reads)</li>
         <li>📨 <b>Async pattern:</b> checkout = sync payment, async email/analytics via SNS+SQS</li>
         <li>🗄️ <b>DB choice:</b> RDS (orders, transactions) + DynamoDB (profiles, scale) + S3 (images)</li>
         <li>🛡️ <b>Security:</b> WAF + KMS + Secrets Manager + GuardDuty + IAM roles</li>
         <li>⚡ <b>HA:</b> Multi-AZ har layer, Route 53 failover for multi-region DR</li>
         <li>💰 <b>Cost:</b> S3 lifecycle, Reserved instances, Spot for batch</li>
       </ul>
       <div class="war-story"><b>⚡ Real architecture:</b> Yeh pattern Amazon,
       Flipkart, Airbnb use karte. CloudFront (global) + multi-AZ + RDS Multi-AZ
       + DynamoDB + ElastiCache + SQS decoupling. Tumne intermediate seekha —
       Architect Sadhak ready! 🏆</div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Resilient architecture decisions',
        instructions: 'Har decision ko best-practice ya anti-pattern mein daalo.',
        bins: [
          { id: 'best', label: '✅ Best practice' },
          { id: 'anti', label: '❌ Anti-pattern' },
        ],
        items: [
          { text: 'CloudFront for global static content', bin: 'best', explain: 'Edge cache, DDoS, HTTPS. Global latency 20ms.' },
          { text: 'RDS single-AZ to save $100/mo on prod', bin: 'anti', explain: 'No DR. Primary down = hours restore. Multi-AZ mandatory.' },
          { text: 'ElastiCache Redis for session cache', bin: 'best', explain: 'DB load kam, ms reads. Session store.' },
          { text: 'Hard-coded DB password in EC2 env', bin: 'anti', explain: 'Secrets Manager + auto-rotation. Hard-coded = leak.' },
          { text: 'SNS + SQS fan-out for order events', bin: 'best', explain: 'Decoupled. Email/analytics async. Checkout fast.' },
          { text: 'WAF off — "we have strong passwords"', bin: 'anti', explain: 'WAF = L7 (SQLi/XSS) protection. Passwords ≠ app security.' },
          { text: 'S3 lifecycle: 90d → Glacier', bin: 'best', explain: '80% cost saving on old data. Automatic.' },
          { text: 'All traffic to us-east-1 (single region)', bin: 'anti', explain: 'Global users latency. Route 53 latency routing + multi-region.' },
        ],
      },
      {
        type: 'incident',
        title: '🚨 Incident: Sale Day Spike',
        instructions: '3 AM. Sale day. App slow + errors. Debug karo.',
        pager: `🚨 ALERT: E-commerce SLOW — Sale Day
HTTP 504 (Gateway Timeout) — 30% requests
RDS CPU 100%, connections exhausted
Time: 11:00 AM (sale start)`,
        start: 'n1',
        nodes: {
          n1: {
            sitrep: 'CloudWatch: RDS CPU 100%, 800 connections (limit 1000)\nApp logs: "connection pool exhausted"',
            text: 'RDS overload. Pehla kadam?',
            choices: [
              { t: 'ElastiCache add karo (session cache) + RDS Read Replica (read load baant) + connection pool tuning', good: true, next: 'n2', explain: 'Sahi. Cache = DB load kam. Read Replica = read scale. Pool = limit connections.' },
              { t: 'Bada RDS instance (vertical scale)', good: false, explain: 'Temporary, but root cause (read load) fix nahi. Horizontal better.' },
              { t: 'App ko rate limit lagao', good: false, explain: 'Symptom chhupana — revenue loss. Root cause DB.' },
            ],
          },
          n2: {
            sitrep: 'ElastiCache add: sessions cached. RDS CPU 60%. But order creation still slow.',
            text: 'Read fix. Write bottleneck. Solution?',
            choices: [
              { t: 'DynamoDB for order creation (write scale) + SQS for async processing. RDS for final reconcile', good: true, next: 'n3', explain: 'Sahi. DynamoDB = write scale. SQS = async. RDS = consistency later.' },
              { t: 'RDS Multi-AZ band karke single-AZ', good: false, explain: 'Galat — write bhi single pe, no HA.' },
              { t: 'Aur bada RDS', good: false, explain: 'Vertical scale ka limit. Horizontal (DynamoDB) better.' },
            ],
          },
          n3: {
            sitrep: 'DynamoDB + SQS. Orders fast. But email service lagging.',
            text: 'Email slow — users ko order confirmation nahi mil raha. Fix?',
            choices: [
              { t: 'SNS + SQS: order event → SNS → SQS → email Lambda async. Email slow bhi checkout fast', good: true, next: 'n4', explain: 'Sahi. Decouple — email async, retry if fail. Checkout sync sirf payment.' },
              { t: 'Email sync rakhke bada EC2', good: false, explain: 'Galat — sync email checkout slow karta.' },
              { t: 'Email skip kar do', good: false, explain: 'UX bad. Decouple + retry.' },
            ],
          },
          n4: {
            sitrep: 'All fixed. App 200ms, 0 errors. Sale day handled.',
            text: 'Long-term — future sale days ke liye kya prepare karo?',
            choices: [
              { t: 'Auto Scaling aggressive + CloudWatch alarms + load test before sale + Chaos Engineering (fail tests)', good: true, next: 'end', explain: 'Sahi. Proactive: scale rules, alarms, load test, chaos. Be ready, not reactive.' },
              { t: 'Kuch nahi — chal raha ab', good: false, explain: 'Galat — next sale same issue. Prepare.' },
              { t: 'Bada cluster hamesha rakho', good: false, explain: 'Wasteful. Scale on demand.' },
            ],
          },
          end: { end: true, text: '🧯 Sale day handled!', summary: '<b>Root causes:</b> (1) DB read load (no cache), (2) write bottleneck (RDS), (3) sync email (slow).<br><b>Fixes:</b> ElastiCache (session) + RDS Read Replica (read scale) + DynamoDB (write scale) + SNS/SQS (async email).<br><b>Seekh:</b> Cache + read replica + NoSQL + decouple = production resilience. Sale spike = pattern. Be proactive (load test, chaos).' },
        },
      },
      {
        type: 'terminal',
        title: '🖥️ Boss: Architecture Audit',
        instructions: 'Poora production infra verify karo.',
        goal: 'Complete audit: ALB, ASG, RDS (Multi-AZ), S3, CloudFront, Lambda — sab check karo.',
        tasks: [
          { text: 'aws elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
          { text: 'aws autoscaling describe-auto-scaling-groups', check: s => s.history.some(h => /aws autoscaling describe-auto-scaling-groups/.test(h)) },
          { text: 'aws rds describe-db-instances (Multi-AZ?)', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
          { text: 'aws s3 ls', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
          { text: 'aws cloudfront list-distributions', check: s => s.history.some(h => /aws cloudfront list-distributions/.test(h)) },
          { text: 'aws lambda list-functions', check: s => s.history.some(h => /aws lambda list-functions/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          elbs: [{ id: 'alb-prod', name: 'shop-alb', type: 'application', scheme: 'internet-facing', dns: 'shop-alb.elb.amazonaws.com' }],
          asgs: [{ name: 'shop-asg', min: 3, max: 20, desired: 5, instances: ['i-1', 'i-2', 'i-3', 'i-4', 'i-5'], vpcZone: 'subnet-a,subnet-b,subnet-c', lb: 'shop-alb' }],
          rds: [{ id: 'shop-db', name: 'shop-db', engine: 'postgres', class: 'db.r6.xlarge', state: 'available', multiAZ: true, endpoint: 'shop-db.rds.amazonaws.com', storage: 500 }],
          buckets: [{ name: 'shop-images', region: 'us-east-1', encryption: true, public: false, objects: [] }],
          cloudfront: [{ id: 'E1', domain: 'd123.cloudfront.net', status: 'Deployed', enabled: true, origins: ['shop-images.s3.amazonaws.com'] }],
          lambdas: [{ name: 'order-processor', runtime: 'nodejs20.x', handler: 'index.handler', state: 'Active', memory: 512, timeout: 30 }],
          vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        success: s => [
          /aws elbv2 describe-load-balancers/.test(s.history.join(' ')),
          /aws autoscaling describe-auto-scaling-groups/.test(s.history.join(' ')),
          /aws rds describe-db-instances/.test(s.history.join(' ')),
          /aws s3 ls\b/.test(s.history.join(' ')),
          /aws cloudfront list-distributions/.test(s.history.join(' ')),
          /aws lambda list-functions/.test(s.history.join(' ')),
        ].every(Boolean),
        successText: 'Poora production architecture! ALB (internet) + ASG (5 instances, scale 3-20, multi-AZ) + RDS (Multi-AZ on!) + S3 (encrypted) + CloudFront (CDN) + Lambda (order processing). Yehi <b>real e-commerce production</b>. Architect Sadhak certificate ready! 🏆',
        hints: [
          'aws elbv2 describe-load-balancers — ALB',
          'aws autoscaling describe-auto-scaling-groups — ASG',
          'aws rds describe-db-instances — RDS Multi-AZ?',
          'aws s3 ls, aws cloudfront list-distributions, aws lambda list-functions',
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Boss Architecture',
      instructions: 'Final intermediate interview. 🎤',
      questions: [
        {
          q: '"Production e-commerce design karo — 1M users, global, 99.95% uptime." Architecture?',
          choices: [
            'Route 53 latency → CloudFront (edge) → ALB (Multi-AZ, WAF) → ASG EC2 (Multi-AZ) → ElastiCache + RDS Multi-AZ + DynamoDB + S3. SNS/SQS async. KMS + Secrets Manager + GuardDuty',
            'Ek bada EC2 — sab kuch',
            'Sirf Lambda serverless',
            'S3 static only',
          ],
          answer: 0,
          explain: 'Yehi production. Multi-AZ har layer, CloudFront global, cache (ElastiCache/DAX), decouple (SNS/SQS), security (WAF/KMS/GuardDuty). 99.95% = Multi-AZ + DR.',
        },
        {
          q: 'Scenario: DB read load high, app slow. Fix without bigger instance?',
          choices: [
            'ElastiCache (cache hot reads) + RDS Read Replica (read scale). Cache hit = no DB. Replica = read load baant',
            'Bada RDS instance',
            'App ko rate limit',
            'Users block kar do',
          ],
          answer: 0,
          explain: 'Cache + read replica = horizontal. Cache = 90% reads served (no DB). Replica = remaining reads. DB write-only. No vertical scale needed.',
        },
        {
          q: 'Interviewer: "Checkout flow design karo — payment + email + analytics."',
          choices: [
            'Payment sync (user waits for confirmation) → SNS event → SQS → email Lambda (async, retry) + analytics Lambda (async). Critical sync, non-critical async decoupled',
            'Sab sync — user sab wait kare',
            'Sab async — user ko pata nahi',
            'Email skip',
          ],
          answer: 0,
          explain: 'Critical (payment) = sync, user gets confirmation. Non-critical (email, analytics) = async via SNS+SQS. Checkout fast + resilient. Email down bhi checkout chal raha.',
        },
      ],
    },
    success: [
      'Main complete production-grade resilient architecture design kar sakta hoon',
      'Main cache strategy (ElastiCache/CloudFront/DAX) + DB choice (RDS/DynamoDB/S3) justify kar sakta hoon',
      'Main decoupling (SNS/SQS) aur security layers (WAF/KMS/GuardDuty) integrate kar sakta hoon',
      'Main sale-day incident handle kar sakta hoon — Architect Sadhak ready! 🏆',
    ],
    homework: `<p>Apne architecture mein intermediate pieces add karo:</p>
      <pre># 1. CloudFront for S3 images (custom domain + HTTPS)
# 2. ElastiCache Redis (session cache) — ASG EC2 se connect
# 3. DynamoDB table (user profiles, on-demand)
# 4. SNS topic + SQS queue (order events → email Lambda)
# 5. WAF on ALB (SQLi/XSS rules)
# 6. KMS key + S3 SSE-KMS
# 7. Secrets Manager for RDS password

# Verify sab:
aws elbv2 describe-load-balancers
aws rds describe-db-instances
aws cloudfront list-distributions
aws dynamodb list-tables</pre>
      <p>✅ Self-check: Sab pieces jud gaye? <b>Cost monitor karo — sab delete baad mein!</b></p>`,
    cards: [
      { front: 'Production e-commerce architecture?', back: 'Route 53 latency → CloudFront → ALB (WAF) → ASG (Multi-AZ) → ElastiCache + RDS Multi-AZ + DynamoDB + S3. SNS/SQS async. KMS + Secrets + GuardDuty. Multi-AZ har layer.' },
      { front: 'Cache strategy?', back: '<b>ElastiCache Redis</b> (sessions, hot data) + <b>CloudFront</b> (static, edge) + <b>DAX</b> (DynamoDB hot reads). Cache = DB load 90% kam, ms latency.' },
      { front: 'DB read load high — fix?', back: 'ElastiCache (cache hot reads) + RDS Read Replica (read scale). Cache hit = no DB. Replica = read baant. DB write-only. No bigger instance.' },
      { front: 'Checkout flow — sync vs async?', back: 'Payment = sync (user waits for confirmation). Email + analytics = async via SNS+SQS (retry if fail). Checkout fast + resilient. Email down bhi chal raha.' },
      { front: 'Security layers (defense in depth)?', back: 'WAF (L7 SQLi/XSS) + SG + NACL + KMS (encryption) + Secrets Manager (rotation) + GuardDuty (ML threats) + IAM. Layers = ek break baki bachaye.' },
    ],
  },

]);
