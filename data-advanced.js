/* =====================================================================
   AWS Gurukul — Track 3: 🚀 Advanced (Guru Path)
   Senior Solutions Architect ka shastra. Design, optimize, modernize.
   ===================================================================== */

AG.registerLevels('advanced', [

  /* ================= LEVEL 7: Observability ================= */
  {
    id: 'observability',
    icon: '👁️',
    title: 'Observability — Metrics, Logs, Traces, Audit',
    badge: 'Drashta Dev',
    objectives: [
      '<b>3 pillars</b>: metrics, logs, traces',
      '<b>CloudWatch</b> (metrics/logs/alarms), <b>X-Ray</b> (tracing)',
      '<b>CloudTrail</b> (API audit), <b>VPC Flow Logs</b>',
      'Debugging superpowers',
    ],
    lesson: [
      `<h3>👁️ Observability — debugging ka superpower</h3>
       <p>Bina observability: "app slow hai" — kyun? Pata nahi. Observability
       ke 3 pillars:</p>
       <ul>
         <li>📊 <b>Metrics</b> — numbers over time (CPU, latency, error rate)</li>
         <li>📜 <b>Logs</b> — text events (app output, errors)</li>
         <li>🔍 <b>Traces</b> — request ka poora safar across services</li>
       </ul>
       <p>💡 <b>Metrics</b> = "kya slow hai" (alerting). <b>Logs</b> = "kyun"
       (debug). <b>Traces</b> = "kahan" (distributed). Sab milke debug.</p>`,
      `<h3>📊 CloudWatch — metrics, logs, alarms</h3>
       <p><b>CloudWatch</b> = AWS ka observability hub.</p>
       <ul>
         <li>📊 <b>Metrics</b> — EC2 CPU, RDS connections, Lambda errors.
             Custom metrics bhi (PutMetricData).</li>
         <li>📜 <b>Logs</b> — Log Groups (app), Log Streams (instance).
             Insights query (search logs).</li>
         <li>🚨 <b>Alarms</b> — threshold cross → SNS (email/SMS/Lambda).
             CPU > 80% for 5min → alert.</li>
         <li>📊 <b>Dashboards</b> — graphs, team-wide visibility.</li>
       </ul>
       <div class="war-story"><b>⚡ Real incident:</b> Ek team ko pata chala
       app slow — par kyun? Bina proper metrics, 4 ghante debug. Fix:
       CloudWatch dashboards (latency, error rate, CPU) + alarms (p95
       latency > 500ms → Slack). Next time: <b>alert aaya, 10 min mein root
       cause</b> (DB slow query). Seekh: <b>observability = time saved</b>.</div>`,
      `<h3>🔍 X-Ray + CloudTrail + Flow Logs</h3>
       <p><b>X-Ray</b> = distributed tracing. Microservices mein request ka
       poora safar — kahan slow, kahan fail. "User → API GW → Lambda →
       DynamoDB" har step ka time.</p>
       <p><b>CloudTrail</b> = API audit log. <b>Kaunne kya AWS API call kiya,
       kab</b>. Security investigation, compliance. "Root user ne RDS delete
       kiya 3 AM" — trail mein.</p>
       <p><b>VPC Flow Logs</b> = network traffic log. Kaunse IP se kaunse
       port pe connection. Security + debug (kyun connection fail?).</p>
       <pre># Observability stack:
Metrics  → CloudWatch (CPU, latency, errors)
Logs     → CloudWatch Logs (app output, errors)
Traces   → X-Ray (request across services)
Audit    → CloudTrail (AWS API calls)
Network  → VPC Flow Logs (traffic)</pre>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'Observability — diagram detective',
        instructions: 'Observability tools ke components par click karo.',
        visual: 'observability',
        questions: [
          { q: 'Numbers over time (CPU, latency)?', target: 'cwmetrics', explain: 'CloudWatch Metrics. Numbers, time series. Alerting.' },
          { q: 'App output, text events?', target: 'cwlogs', explain: 'CloudWatch Logs. App stdout/stderr. Search/Insights.' },
          { q: 'Threshold cross → alert?', target: 'alarm', explain: 'CloudWatch Alarms. CPU > 80% → SNS. Alerting.' },
          { q: 'Request safar across services?', target: 'xray', explain: 'X-Ray. Distributed tracing. Microservices debug.' },
          { q: 'API audit — kaun kya kiya?', target: 'cloudtrail', explain: 'CloudTrail. AWS API calls log. Security, compliance.' },
          { q: 'Network traffic log?', target: 'flowlogs', explain: 'VPC Flow Logs. IP/port connections. Security + debug.' },
        ],
      },
      {
        type: 'match',
        title: 'Observability tools — naam milao',
        instructions: 'Har tool ko uske kaam se milao.',
        pairs: [
          { left: 'CloudWatch Metrics', right: 'Numbers over time — CPU, latency, error rate. Alerting, dashboards', explain: '"Kya slow hai" — high-level signal.' },
          { left: 'CloudWatch Logs', right: 'Text events — app output, errors. Insights query', explain: '"Kyun" — deep debug. Log search.' },
          { left: 'X-Ray', right: 'Distributed tracing — request across microservices. Per-step time', explain: '"Kahan slow" — microservices.' },
          { left: 'CloudTrail', right: 'API audit — kaunne kya AWS API call kiya, kab. Security, compliance', explain: '"Kaunne kya kiya" — security investigation.' },
          { left: 'VPC Flow Logs', right: 'Network traffic — IP/port connections. Security, debug', explain: 'Connection refused? Flow Logs se root cause.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Observability Quick-fire',
        questions: [
          {
            q: 'Microservices app, request slow. Kaunsa tool root cause dhoondega?',
            choices: [
              'X-Ray — distributed tracing, request ka safar, kahan slow/fail dikhega',
              'CloudWatch Metrics — high-level only',
              'CloudTrail — API audit, not app',
              'S3 — storage',
            ],
            answer: 0,
            explain: 'X-Ray = request trace across services. "API GW → Lambda (50ms) → DynamoDB (800ms)" — DynamoDB slow! Microservices must.',
          },
          {
            q: 'CloudTrail ka primary use?',
            choices: [
              'API audit — kaunne kya AWS API call kiya, kab. Security investigation, compliance',
              'App logs',
              'Metrics dashboards',
              'Network traffic',
            ],
            answer: 0,
            explain: 'CloudTrail = AWS API audit. "Root ne RDS delete 3AM" — trail. Security forensics, compliance (PCI/HIPAA).',
          },
          {
            q: 'CPU > 80% for 5 min → email alert. Kaunsa tool?',
            choices: [
              'CloudWatch Alarm + SNS — threshold cross → notification',
              'CloudTrail',
              'X-Ray',
              'VPC Flow Logs',
            ],
            answer: 0,
            explain: 'CloudWatch Alarm = threshold + duration → SNS (email/SMS/Lambda). Proactive alerting before user complaints.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Observability',
      instructions: 'Monitoring round. 🎤',
      questions: [
        {
          q: '"Observability ke 3 pillars?" — interviewer.',
          choices: [
            'Metrics (numbers, alerting), Logs (text, debug), Traces (request across services, microservices)',
            'Logs, alerts, emails',
            'CPU, RAM, disk',
            'CloudWatch, S3, EC2',
          ],
          answer: 0,
          explain: '3 pillars: metrics (what), logs (why), traces (where in distributed). All needed for full observability.',
        },
        {
          q: 'Scenario: microservices, request slow. Debug approach?',
          choices: [
            'X-Ray trace → see per-service time → find slow service → CloudWatch Logs for that service → root cause',
            'Sab EC2 restart karo',
            'Logs manually read karo (lakhon lines)',
            'Bigger instances',
          ],
          answer: 0,
            explain: 'X-Ray = trace shows which service slow. Then that service\'s CloudWatch Logs for "kyun". Systematic, not guesswork.',
        },
        {
          q: 'Interviewer: "CloudTrail ka use batao production mein."',
          choices: [
            'API audit log — security investigation (kaunne kya kiya), compliance (PCI/HIPAA), root cause (unauthorized delete?). All AWS API calls',
            'App performance monitor',
            'Cost tracking',
            'Network traffic',
          ],
          answer: 0,
          explain: 'CloudTrail = who did what AWS API call, when. Security forensics ("who deleted RDS"), compliance audit. Enable on all accounts.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Monitoring audit! Production mein <b>no alerts</b> report mila. Verify karo: <b>(1)</b> CloudWatch alarms list karo. <b>(2)</b> CloudWatch log groups dekho. <b>(3)</b> KMS keys dekho (encryption audit).',
            tasks: [
              { text: 'aws cloudwatch describe-alarms — koi alerts setup hain?', check: s => s.history.some(h => /aws cloudwatch describe-alarms/.test(h)) },
              { text: 'aws logs describe-log-groups — log groups dekho', check: s => s.history.some(h => /aws logs describe-log-groups/.test(h)) },
              { text: 'aws kms list-keys — encryption keys audit', check: s => s.history.some(h => /aws kms list-keys/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              alarms: [],
              logGroups: [
                { name: '/aws/lambda/order-processor', retention: 7, events: ['INFO: processing order', 'INFO: order complete'] },
                { name: '/aws/lambda/email-sender', retention: null, events: [] },
              ],
              kmsKeys: [
                { id: 'key-1', alias: 'alias/app-data-key', state: 'Enabled' },
                { id: 'key-2', alias: 'alias/s3-backup-key', state: 'Enabled' },
              ],
              buckets: [],
            },
            success: s => s.history.some(h => /aws cloudwatch describe-alarms/.test(h)) && s.history.some(h => /aws logs describe-log-groups/.test(h)) && s.history.some(h => /aws kms list-keys/.test(h)),
            successText: 'Observability audit complete! 📋 Findings: <b>CloudWatch alarms</b> ❌ <b>ZERO alarms!</b> — production mein koi alert nahi. CPU 100% ho ya DB down, pata nahi chalega. Fix: CPU > 80% alarm, disk > 90%, error rate > 5%, DB connection count. <b>Log groups</b> ⚠️ — order-processor logs 7 din retention (OK), email-sender <b>no retention</b> (never expires = growing cost). Fix: retention set karo. <b>KMS</b> ✅ 2 keys enabled (app data + S3 backup). Pro tip: <b>1 alert per critical metric</b> — CPU, memory, disk, errors, latency. PagerDuty/Slack integration.',
            hints: [
              'aws cloudwatch describe-alarms — koi alarms hain? (MetricAlarms array dekho)',
              'aws logs describe-log-groups — retentionInDays dekho (null = never expire)',
              'aws kms list-keys — keys list, state Enabled hona chahiye',
            ],
          },
        },
      ],
    },
    success: [
      'Main observability ke 3 pillars (metrics/logs/traces) explain kar sakta hoon',
      'Main CloudWatch (metrics/logs/alarms) aur X-Ray (tracing) samjhta hoon',
      'Main CloudTrail (API audit) aur VPC Flow Logs ka role bata sakta hoon',
      'Main systematic debugging approach use kar sakta hoon',
    ],
    homework: `<p>CloudWatch dashboard + alarm banao:</p>
      <pre># Console → CloudWatch → Dashboards → Create
# Widgets: EC2 CPU, RDS connections, Lambda errors

# Alarm:
# Console → CloudWatch → Alarms → Create
# Metric: EC2 CPUUtilization
# Threshold: > 80% for 5 min
# Action: SNS → email</pre>
      <p>✅ Self-check: Dashboard mein metrics dikhe? Alarm bana?</p>`,
    cards: [
      { front: 'Observability 3 pillars?', back: '<b>Metrics</b> (numbers, alerting — "kya"), <b>Logs</b> (text, debug — "kyun"), <b>Traces</b> (request across services — "kahan").' },
      { front: 'CloudWatch?', back: 'Metrics (CPU/latency/errors), Logs (app output, Insights query), Alarms (threshold → SNS), Dashboards. AWS observability hub.' },
      { front: 'X-Ray?', back: 'Distributed tracing. Request ka poora safar across microservices. "API GW→Lambda→DB" per-step time. Microservices debug must.' },
      { front: 'CloudTrail?', back: 'API audit log. <b>Kaunne kya AWS API call kiya, kab</b>. Security investigation (unauthorized delete), compliance (PCI/HIPAA).' },
      { front: 'VPC Flow Logs?', back: 'Network traffic log. IP/port connections. "Connection refused?" root cause. Security + network debug.' },
    ],
  },

  /* ================= LEVEL 8: Migration ================= */
  {
    id: 'migration',
    icon: '🚚',
    title: 'Migration & Modernization — 7Rs',
    badge: 'Migration Maha',
    objectives: [
      '<b>7Rs</b> migration strategy',
      '<b>DMS</b> (Database Migration Service)',
      '<b>Migration Hub</b> tracking',
      'Per-app migration decision',
    ],
    lesson: [
      `<h3>🚚 Migration — on-prem se cloud tak</h3>
       <p>Company ne 10 saal on-prem mein app chalaya. Ab cloud pe jaana hai.
       <b>7Rs</b> = strategy per app. Sab apps ek strategy nahi.</p>
       <table>
         <tr><th>R</th><th>Matlab</th><th>Use case</th></tr>
         <tr><td>1️⃣ <b>Rehost</b> ("lift & shift")</td><td>As-is move</td><td>Fastest, least refactor. Deadline pressure</td></tr>
         <tr><td>2️⃣ <b>Replatform</b> ("lift & reshape")</td><td>Minor tweaks</td><td>RDS vs self-managed DB. Cloud benefits</td></tr>
         <tr><td>3️⃣ <b>Refactor/Re-architect</b></td><td>Reimagine</td><td>Monolith → microservices. Long-term best</td></tr>
         <tr><td>4️⃣ <b>Repurchase</b></td><td>Move to SaaS</td><td>CRM → Salesforce. Off-the-shelf</td></tr>
         <tr><td>5️⃣ <b>Retain</b></td><td>Keep on-prem</td><td>Compliance, not worth migrating</td></tr>
         <tr><td>6️⃣ <b>Retire</b></td><td>Turn off</td><td>App no longer needed</td></tr>
         <tr><td>7️⃣ <b>Relocate</b></td><td>Move within AWS</td><td>VMware Cloud → EC2</td></tr>
       </table>`,
      `<h3>🗄️ DMS — Database Migration Service</h3>
       <p><b>DMS</b> = AWS ka DB migration tool. On-prem DB → AWS RDS/Aurora.
       <b>Homogeneous</b> (MySQL→MySQL) ya <b>heterogeneous</b> (Oracle→Aurora).</p>
       <ul>
         <li>📤 <b>Source</b> — on-prem DB (Oracle, MySQL, SQL Server...)</li>
         <li>📥 <b>Target</b> — RDS, Aurora, DynamoDB, Redshift</li>
         <li>🔄 <b>CDC</b> (Change Data Capture) — ongoing replication, near-zero downtime</li>
         <li>⚡ <b>SCT</b> (Schema Conversion Tool) — schema convert for heterogeneous</li>
       </ul>
       <p>💡 <b>Strategy:</b> DMS + CDC = migrate bina downtime. Source chalta,
       target sync, cutover jab ready.</p>`,
      `<h3>📊 Migration Hub + 6R decision</h3>
       <p><b>Migration Hub</b> = central tracking. Saare apps ka migration
       status ek dashboard. DMS, Server Migration Service integrate.</p>
       <p>📋 <b>Per-app 6R decision:</b></p>
       <ul>
         <li>⚡ Deadline tight? → <b>Rehost</b> (fast, optimize later)</li>
         <li>🔧 Cloud benefits chahiye (managed DB)? → <b>Replatform</b></li>
         <li>🏗️ Long-term, scale issues? → <b>Refactor</b> (microservices)</li>
         <li>🛒 Off-the-shelf better? → <b>Repurchase</b> (SaaS)</li>
         <li>🔒 Compliance/recent investment? → <b>Retain</b></li>
         <li>💀 Unused? → <b>Retire</b> (save cost!)</li>
       </ul>
       <div class="war-story"><b>⚡ Real migration:</b> Ek bank ne 200 apps
       migrate ki. <b>Per-app 6R:</b> 50 rehost (deadline), 80 replatform
       (managed DB), 30 refactor (critical microservices), 20 repurchase
       (SaaS), 15 retain (compliance), 5 retire (unused — $200k/yr saved!).
       Not all same strategy. <b>Portfolio approach</b>.</div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: '7R strategy choose karo',
        instructions: 'Har app ko sahi 7R strategy mein daalo.',
        bins: [
          { id: 'rehost', label: '1️⃣ Rehost (lift&shift)' },
          { id: 'replatform', label: '2️⃣ Replatform' },
          { id: 'refactor', label: '3️⃣ Refactor' },
          { id: 'retire', label: '6️⃣ Retire' },
        ],
        items: [
          { text: 'App, 2 months deadline, no time refactor', bin: 'rehost', explain: 'Rehost — as-is move. Fast. Optimize later.' },
          { text: 'DB, on-prem MySQL, want managed (RDS)', bin: 'replatform', explain: 'Replatform — minor tweak (self-managed → RDS). Cloud benefit.' },
          { text: 'Monolith, scaling issues, long-term', bin: 'refactor', explain: 'Refactor — microservices. Long-term best. Effort.' },
          { text: 'App, no users, 5 years unused', bin: 'retire', explain: 'Retire — turn off. Save cost! $200k/yr example.' },
          { text: 'Legacy, tight deadline, optimize post-migration', bin: 'rehost', explain: 'Rehost — move fast, optimize in cloud later.' },
          { text: 'Self-managed PostgreSQL → Aurora for performance', bin: 'replatform', explain: 'Replatform — Aurora (5x faster). Minor change.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Migration — diagram detective',
        instructions: 'Migration tools ke components par click karo.',
        visual: 'migration',
        questions: [
          { q: 'DB migration service (homogeneous/heterogeneous)?', target: 'dms', explain: 'DMS. On-prem DB → RDS/Aurora. CDC for near-zero downtime.' },
          { q: 'Central tracking for all migrations?', target: 'mgh', explain: 'Migration Hub. Dashboard for all apps. DMS/SMS integrate.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Migration Quick-fire',
        questions: [
          {
            q: 'Deadline tight, no time refactor. Strategy?',
            choices: [
              'Rehost (lift & shift) — as-is move fast. Optimize later in cloud',
              'Refactor — full rewrite',
              'Retire — band kar do',
              'Retain — on-prem hi',
            ],
            answer: 0,
            explain: 'Rehost = fastest. Move as-is, cloud benefits later. Common first step. Then replatform/refactor in cloud.',
          },
          {
            q: 'On-prem Oracle → Aurora (PostgreSQL). Tool?',
            choices: [
              'DMS (heterogeneous) + SCT (schema convert Oracle→Aurora). CDC for near-zero downtime',
              'Manual SQL export/import',
              'Lambda',
              'CloudFormation',
            ],
            answer: 0,
            explain: 'DMS = heterogeneous migration. SCT = schema convert (Oracle→Aurora PG). CDC = ongoing replication, cutover when ready.',
          },
          {
            q: 'Portfolio of 200 apps. Sab ko ek strategy?',
            choices: [
              'No — per-app 6R decision. Some rehost, some replatform, some refactor, some retire. Portfolio approach',
              'Haan — sab rehost',
              'Haan — sab refactor',
              'Haan — sab retain',
            ],
            answer: 0,
            explain: 'Per-app. Critical → refactor. Deadline → rehost. Managed benefit → replatform. Unused → retire (save!). Portfolio.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Migration',
      instructions: 'Migration strategy round. 🎤',
      questions: [
        {
          q: '"7Rs batao" — interviewer.',
          choices: [
            'Rehost (lift&shift), Replatform (tweak), Refactor (re-architect), Repurchase (SaaS), Retain (keep), Retire (turn off), Relocate (within AWS)',
            'Sirf 3 strategies',
            '10 strategies',
            'Rehost aur Refactor only',
          ],
          answer: 0,
          explain: '7Rs. Rehost/Replatform/Refactor main 3. Repurchase/Retain/Retire/Relocate additional. Per-app decision.',
        },
        {
          q: 'Scenario: 500 apps, 1 year deadline. Strategy approach?',
          choices: [
            'Portfolio — per-app 6R. Critical → refactor. Majority → rehost (fast). Some → replatform. Unused → retire (save). Phased migration',
            'Sab ek saath rehost',
            'Sab refactor (2 years lag jaayega)',
            'Sab retain',
          ],
          answer: 0,
            explain: 'Portfolio approach. Can\'t refactor 500 in 1yr. Critical few refactor, majority rehost, unused retire. Phased waves.',
        },
        {
          q: 'Interviewer: "DMS + CDC ka benefit?"',
          choices: [
            'Near-zero downtime migration. Source chalta, target sync (CDC ongoing replication), cutover when ready. No app outage',
            'Faster migration only',
            'Free hai',
            'Schema convert',
            ],
          answer: 0,
          explain: 'CDC = Change Data Capture. Source → target ongoing replication. App runs on source, target stays in sync. Cutover = minutes. No downtime.',
        },
      ],
    },
    success: [
      'Main 7Rs migration strategies aur unke use cases bata sakta hoon',
      'Main DMS (Database Migration Service) + CDC samjhta hoon',
      'Main Migration Hub aur per-app 6R decision explain kar sakta hoon',
      'Main portfolio migration approach design kar sakta hoon',
    ],
    homework: `<p>Apne apps ka 6R assessment likho:</p>
      <pre># Spreadsheet:
# App | Criticality | 6R Strategy | Reason | Timeline
# ----|-------------|-------------|--------|----------
# CRM | High        | Replatform  | RDS managed | Q1
# Reports | Med     | Rehost      | Deadline    | Q1
# Legacy HR | Low   | Retire      | Unused      | Q2
# Payment | Critical | Refactor   | Microservices | Q3</pre>
      <p>✅ Self-check: Har app ka strategy decide? Timeline?</p>`,
    cards: [
      { front: '7Rs strategies?', back: 'Rehost (lift&shift), Replatform (tweak), Refactor (re-architect), Repurchase (SaaS), Retain (keep on-prem), Retire (turn off), Relocate (within AWS).' },
      { front: 'Rehost vs Replatform vs Refactor?', back: 'Rehost = as-is move (fast). Replatform = minor tweak (managed DB). Refactor = full re-architect (microservices, long-term).' },
      { front: 'DMS + CDC?', back: 'Database Migration Service. <b>CDC</b> = Change Data Capture, ongoing replication. Source chalta, target sync, cutover when ready. <b>Near-zero downtime</b>.' },
      { front: 'Migration Hub?', back: 'Central tracking for all migrations. Dashboard. DMS/SMS integrate. Portfolio view of app statuses.' },
      { front: 'Portfolio approach?', back: 'Per-app 6R. Critical → refactor. Majority → rehost (deadline). Some → replatform. Unused → retire (save $!). Not all same strategy.' },
    ],
  },

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
