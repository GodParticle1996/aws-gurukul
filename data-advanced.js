/* =====================================================================
   AWS Gurukul — Track 3: 🚀 Advanced (Guru Path)
   Senior Solutions Architect ka shastra. Design, optimize, modernize.
   ===================================================================== */

AG.registerLevels('advanced', [

  /* ================= LEVEL 9: FINAL BOSS ================= */
  {
    id: 'finalboss',
    icon: '👑',
    title: 'Final Boss: Senior Solutions Architect Gauntlet',
    badge: 'Solutions Architect Mahaguru',
    objectives: [
      'Saare advanced concepts ek saath jodna',
      'Complete architecture design + defend karna',
      'Incident handle karna (boss-level)',
      'Interview marathon — SAA ready!',
    ],
    lesson: [
      `<h3>👑 Final Boss — sab kuch jodo</h3>
       <p>3 tracks, 26 levels — ab tum <b>Senior Solutions Architect</b> ke
       ready ho. Yeh level sab concepts ek saath jodta.</p>
       <p>Senior architect ka din:</p>
       <ul>
         <li>🏗️ <b>Design</b> — scalable, secure, resilient, cost-optimized</li>
         <li>🛡️ <b>Harden</b> — security layers, compliance</li>
         <li>💰 <b>Optimize</b> — cost, performance</li>
         <li>🚑 <b>Recover</b> — DR, RTO/RPO, multi-region</li>
         <li>👁️ <b>Observe</b> — metrics, logs, traces, audit</li>
         <li>🚚 <b>Migrate</b> — 7Rs, modernize</li>
       </ul>`,
      `<h3>🏆 Senior architect mindset</h3>
       <ul>
         <li>⚖️ <b>Trade-offs</b> — har choice ka cost vs benefit (Multi-AZ $
             vs downtime $)</li>
         <li>🧩 <b>Well-Architected</b> — 6 pillars har design pe</li>
         <li>🔮 <b>Future-proof</b> — multi-region, multi-AZ, scalable</li>
         <li>📝 <b>Document</b> — ADRs (Architecture Decision Records), diagrams</li>
         <li>🧪 <b>Test</b> — chaos engineering, DR drills, load tests</li>
         <li>📈 <b>Iterate</b> — quarterly Well-Architected review, improve</li>
       </ul>
       <div class="war-story"><b>⚡ Real senior:</b> Ek senior architect ne
       fintech ka design review kiya. Poocha: "RTO?", "1 ghanta", "Tested?",
       silence. "DR drill kar lo." Drill mein pata chala DNS failover broken.
       Fix. <b>Production outage mein DR kaam kiya</b>. Seekh: <b>senior =
       ask hard questions, test assumptions</b>. "It works" → "prove it".</div>`,
      `<h3>🎤 SAA exam ready?</h3>
       <p>Agar tumne 26 levels + Revision Dojo + interviews kiye — tum SAA-C03
       ready ho. Exam mein:</p>
       <ul>
         <li>🏗️ <b>Architecture</b> — design scenarios (most questions)</li>
         <li>⚙️ <b>Services</b> — kaunsa kab (VPC, EC2, RDS, Lambda...)</li>
         <li>🔒 <b>Security</b> — IAM, KMS, WAF, compliance</li>
         <li>💰 <b>Cost</b> — Reserved/Spot/rightsize</li>
         <li>♻️ <b>Reliability</b> — Multi-AZ, DR, HA</li>
       </ul>
       <p>💡 <b>Revision Dojo</b> mein sab flashcards hain — roz revise. <b>Yeh
       certificate = SAA-ready badge.</b> 👑</p>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Senior architecture decisions',
        instructions: 'Har decision ko best practice ya anti-pattern mein daalo.',
        bins: [
          { id: 'best', label: '✅ Best practice' },
          { id: 'anti', label: '❌ Anti-pattern' },
        ],
        items: [
          { text: 'Well-Architected review quarterly', bin: 'best', explain: '6 pillars, drift detect, improve. Senior habit.' },
          { text: 'DR plan but never tested', bin: 'anti', explain: 'Untested DR = no DR. Game days quarterly. Senior asks "tested?"' },
          { text: 'Multi-AZ + multi-region for critical', bin: 'best', explain: 'HA + DR. Ek region down bhi app chale.' },
          { text: 'Hard-coded secrets in code', bin: 'anti', explain: 'Secrets Manager + rotation. #1 breach vector.' },
          { text: 'Cost optimization: Reserved + Spot + rightsize', bin: 'best', explain: 'Layered pricing. 40-60% saving. Senior owns cost.' },
          { text: 'Single region, "it\'s fine"', bin: 'anti', explain: 'Region down = app down. Critical = multi-region DR.' },
          { text: 'IaC (Terraform) for all infra', bin: 'best', explain: 'Repeatable, auditable, Git-tracked. Console clicks banned.' },
          { text: 'No observability, "we\'ll debug when issue"', bin: 'anti', explain: 'Metrics + logs + traces + alarms before issue. Proactive.' },
        ],
      },
      {
        type: 'incident',
        title: '🚨 Final Boss Incident: Multi-Region Failover',
        instructions: 'Sabse bada test. us-east-1 down. Multi-region app. Save karo.',
        pager: `🚨 CRITICAL: us-east-1 REGION DOWN
AWS status page: ongoing issue
Tumhari app: multi-region (us-east-1 + eu-west-1)
Route 53 failover routing configured
Time: 2:00 PM IST — peak traffic`,
        start: 'n1',
        nodes: {
          n1: {
            sitrep: 'AWS status: us-east-1 degraded. Users reporting errors.\nRoute 53: primary (us-east-1) health check FAIL',
            text: 'Region down. Route 53 health check fail. Pehla kadam?',
            choices: [
              { t: 'Verify health check failing + Route 53 failover triggered → traffic to eu-west-1 secondary', good: true, next: 'n2', explain: 'Sahi. Failover routing + health check = automatic. Verify it\'s working.' },
              { t: 'Manual DNS change — slow', good: false, explain: 'Galat — failover routing automatic hona chahiye. Manual = minutes delay.' },
              { t: 'Users ko "maintenance" page dikhao', good: false, explain: 'Galat — multi-region is for this. Failover should work.' },
            ],
          },
          n2: {
            sitrep: 'Route 53 failover: traffic → eu-west-1. But eu-west-1 overloaded (2x traffic).',
            text: 'Secondary overloaded. Scale up kaise?',
            choices: [
              { t: 'eu-west-1 ASG scale out (max badhao) + CloudFront (cache more) + check DynamoDB Global Tables capacity', good: true, next: 'n3', explain: 'Sahi. Multi-layer: ASG scale, CDN cache, DB capacity. Handle 2x load.' },
              { t: 'Users ko rate limit lagao', good: false, explain: 'Symptom. Capacity badhao, users block mat.' },
              { t: 'eu-west-1 bhi band kar do', good: false, explain: 'Disaster! Dono down = total outage.' },
            ],
          },
          n3: {
            sitrep: 'eu-west-1 scaled. App stable. us-east-1 still down (AWS fixing).',
            text: 'App running on secondary. Communications + long-term?',
            choices: [
              { t: 'Status page update users + prepare us-east-1 recovery (data sync, cutover back when AWS fixes) + post-mortem planned', good: true, next: 'n4', explain: 'Sahi. Communicate, plan recovery, post-mortem. Senior thinks beyond "just fix".' },
              { t: 'Celebrate — ho gaya', good: false, explain: 'Galat — us-east-1 recovery bhi plan karo. Post-mortem for improvement.' },
              { t: 'us-east-1 abandon kar do', good: false, explain: 'Cost, data residency. Recover jab AWS fixes.' },
            ],
          },
          n4: {
            sitrep: 'us-east-1 back (AWS fixed). Data sync done. Cutover back planned.',
            text: 'Cutover back to primary. Safely kaise?',
            choices: [
              { t: 'Gradual: Route 53 weighted (10% → 50% → 100% to us-east-1). Monitor. Rollback if issue. Post-mortem document', good: true, next: 'end', explain: 'Sahi. Gradual cutover, monitor, rollback ready, post-mortem. Senior = careful.' },
              { t: 'Sab traffic ek saath us-east-1 pe', good: false, explain: 'Risky — if us-east-1 unstable again, all users affected.' },
              { t: 'eu-west-1 hi chalte raho', good: false, explain: 'Cost + latency for primary region users. Cutover back.' },
            ],
          },
          end: { end: true, text: '👑 Final Boss defeated!', summary: '<b>Multi-region DR worked!</b> Route 53 failover + health check = automatic traffic shift. eu-west-1 scaled (ASG + CloudFront + DynamoDB Global).<br><b>Recovery:</b> gradual cutover back (weighted), monitor, post-mortem.<br><b>Senior lessons:</b> (1) Multi-region DR = survival, (2) test failover regularly, (3) secondary must handle full load, (4) communicate + post-mortem. <b>SAA-ready! 👑</b>' },
        },
      },
      {
        type: 'terminal',
        title: '🖥️ Final Boss: Complete Audit',
        instructions: 'Poora production infra audit — sab services verify.',
        goal: 'Final audit: ALB, ASG, RDS (Multi-AZ), S3, CloudFront, Lambda, DynamoDB, KMS, CloudWatch — sab check karo.',
        tasks: [
          { text: 'aws elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
          { text: 'aws rds describe-db-instances (Multi-AZ?)', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
          { text: 'aws dynamodb list-tables', check: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) },
          { text: 'aws kms list-keys', check: s => s.history.some(h => /aws kms list-keys/.test(h)) },
          { text: 'aws cloudwatch describe-alarms', check: s => s.history.some(h => /aws cloudwatch describe-alarms/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          elbs: [{ id: 'alb-1', name: 'prod-alb', type: 'application', scheme: 'internet-facing', dns: 'prod.elb.amazonaws.com' }],
          asgs: [{ name: 'prod-asg', min: 5, max: 30, desired: 8, instances: ['i-1','i-2','i-3','i-4','i-5','i-6','i-7','i-8'], vpcZone: 'subnet-a,subnet-b,subnet-c' }],
          rds: [{ id: 'prod-db', name: 'prod-db', engine: 'aurora-postgresql', class: 'db.r6.2xlarge', state: 'available', multiAZ: true, endpoint: 'prod-db.rds.amazonaws.com', storage: 1000 }],
          buckets: [{ name: 'prod-assets', region: 'us-east-1', encryption: true, public: false, objects: [] }],
          cloudfront: [{ id: 'E1', domain: 'dprod.cloudfront.net', status: 'Deployed', enabled: true }],
          lambdas: [{ name: 'order-handler', runtime: 'nodejs20.x', handler: 'index.handler', state: 'Active', memory: 1024, timeout: 30 }],
          tables: [{ name: 'UserSessions', partitionKey: 'session_id', sortKey: null, rcu: 100, wcu: 100, items: [] }],
          kmsKeys: [{ id: 'arn:aws:kms:us-east-1:123:key/abc', alias: 'prod-key', state: 'Enabled' }],
          alarms: [{ name: 'HighCPU', metric: 'CPUUtilization', namespace: 'AWS/EC2', state: 'OK', threshold: 80 }],
          vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        success: s => [
          /aws elbv2 describe-load-balancers/.test(s.history.join(' ')),
          /aws rds describe-db-instances/.test(s.history.join(' ')),
          /aws dynamodb list-tables/.test(s.history.join(' ')),
          /aws kms list-keys/.test(s.history.join(' ')),
          /aws cloudwatch describe-alarms/.test(s.history.join(' ')),
        ].every(Boolean),
        successText: '👑 <b>Complete production architecture verified!</b> ALB + ASG (8 instances, scale 5-30, multi-AZ) + Aurora Multi-AZ + S3 (encrypted) + CloudFront + Lambda + DynamoDB (sessions) + KMS + CloudWatch alarm. Yehi <b>real senior architect ka domain</b>. Tumne 3 tracks, 26 levels, 100+ challenges complete kiye — <b>Solutions Architect Mahaguru!</b> 👑',
        hints: [
          'aws elbv2 describe-load-balancers — ALB',
          'aws rds describe-db-instances — Aurora Multi-AZ',
          'aws dynamodb list-tables, aws kms list-keys, aws cloudwatch describe-alarms',
        ],
      },
    ],
    interview: {
      title: '🎤 Final Interview Marathon',
      instructions: 'Senior architect interview. SAA-ready prove karo! 🎤',
      questions: [
        {
          q: '"Ek global SaaS design karo — 10M users, 99.99% uptime, multi-region." Architecture?',
          choices: [
            'Route 53 latency routing → CloudFront (global edge) → Multi-region (us-east-1 + eu-west-1 + ap-south-1). Each region: ALB + ASG Multi-AZ + Aurora Global DB + DynamoDB Global Tables. SNS/SQS decouple. KMS + GuardDuty + WAF. DR: Multi-Site',
            'Ek region, bada EC2',
            'Sirf Lambda serverless',
            'S3 static only',
          ],
          answer: 0,
          explain: 'Senior answer: multi-region active-active, global DB sync, CDN edge, decouple, security layers, DR. 99.99% = ~52min downtime/year = multi-region must.',
        },
        {
          q: 'Scenario: $100k/mo AWS bill. Cost optimize karo (60% target).',
          choices: [
            'Cost Explorer analyze → rightsizing (CloudWatch) → Reserved (steady 72%) + Spot (batch 90%) → S3 lifecycle → delete unused EBS → tags + budgets. Portfolio. 60% achievable',
            'Sab EC2 band',
            'AWS se discount maango',
            'Region change',
          ],
          answer: 0,
          explain: 'Systematic: analyze, rightsize, commit (Reserved), spot (batch), lifecycle, clean, monitor. Real companies 40-60% save. Senior owns cost.',
        },
        {
          q: 'Interviewer: "Tumhari app pe outage. Walk me through your debugging."',
          choices: [
            'CloudWatch alarms (what broke) → metrics dashboard (CPU/latency/errors) → X-Ray trace (where slow) → CloudWatch Logs (why) → CloudTrail (who changed what) → fix → post-mortem',
            'Sab EC2 restart',
            'Users ko wait karao',
            'AWS support ko call',
          ],
          answer: 0,
            explain: 'Systematic: alarms (alert) → metrics (what) → traces (where) → logs (why) → trail (cause) → fix → post-mortem. Observability = debugging superpower.',
        },
      ],
    },
    success: [
      'Main complete production architecture (multi-region, HA, secure, cost-optimized) design kar sakta hoon',
      'Main Well-Architected 6 pillars har design pe apply kar sakta hoon',
      'Main multi-region DR failover handle kar sakta hoon (tested!)',
      'Main SAA-C03 exam ready hoon — Solutions Architect Mahaguru! 👑',
    ],
    homework: `<p>Apne complete architecture ka ADR (Architecture Decision Record) likho:</p>
      <pre># ADR-001: Multi-Region Active-Active
# Date: 2024-XX-XX
# Status: Accepted
# Context: 10M users, 99.99% uptime needed
# Decision: Route 53 latency + multi-region (us-east-1, eu-west-1, ap-south-1)
#           Aurora Global DB, DynamoDB Global Tables, CloudFront
# Consequences: +$5k/mo cost, complexity. But 99.99% achievable.
# DR: Multi-Site, tested quarterly (game days)</pre>
      <p>✅ Self-check: ADR likha? Architecture diagram banaya? <b>SAA exam book karo! 🎓</b></p>`,
    cards: [
      { front: 'Senior architect mindset?', back: 'Trade-offs (cost vs benefit), Well-Architected 6 pillars, future-proof (multi-region), document (ADRs), test (chaos/DR), iterate (quarterly review).' },
      { front: 'Global 10M users, 99.99%?', back: 'Multi-region active-active. Route 53 latency → CloudFront edge → each region (ALB+ASG+Aurora Global+DynamoDB Global). 99.99% = ~52min downtime/yr = multi-region must.' },
      { front: 'Cost optimize $100k → $40k?', back: 'Explorer analyze → rightsize → Reserved (steady) + Spot (batch) → S3 lifecycle → delete unused → tags + budgets. 60% achievable. Senior owns cost.' },
      { front: 'Outage debugging flow?', back: 'Alarms (alert) → Metrics (what) → X-Ray traces (where) → Logs (why) → CloudTrail (cause) → fix → post-mortem. Observability = superpower.' },
      { front: 'Multi-region DR?', back: 'Route 53 failover + health check = automatic. Secondary scales (ASG/CloudFront/DB). Gradual cutover back. <b>Test quarterly (game days)</b>. Untested DR = no DR.' },
    ],
  },

]);
