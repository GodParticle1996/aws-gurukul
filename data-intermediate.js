/* =====================================================================
   AWS Gurukul — Track 2: 🔥 Intermediate (Sadhak Path)
   Architect ka hathiyaar-basta. Production-grade building blocks.
   Naya level add karna ho? Bas is file mein ek aur object.
   ===================================================================== */

AG.registerLevels('intermediate', [

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
