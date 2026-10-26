/* =====================================================================
   AWS Gurukul — Track 2: 🔥 Intermediate (Sadhak Path)
   Architect ka hathiyaar-basta. Production-grade building blocks.
   Naya level add karna ho? Bas is file mein ek aur object.
   ===================================================================== */

AG.registerLevels('intermediate', [

  /* ================= LEVEL 6: DynamoDB ================= */
  {
    id: 'dynamodb',
    icon: '📊',
    title: 'DynamoDB — NoSQL at Scale',
    badge: 'NoSQL Nayak',
    objectives: [
      '<b>NoSQL vs SQL</b> — kab DynamoDB, kab RDS',
      '<b>Partition key, sort key, GSI</b> — data model',
      '<b>RCU/WCU</b> capacity aur DAX cache',
      'aws dynamodb commands se tables inspect',
    ],
    lesson: [
      `<h3>📊 NoSQL — SQL ka bhai, alag tareeqa</h3>
       <p>RDS (SQL) = structured, joins, transactions, fixed schema. DynamoDB
       (NoSQL) = flexible schema, key-value, documents, <b>any scale</b>,
       single-digit ms latency.</p>
       <table>
         <tr><th>RDS (SQL)</th><th>DynamoDB (NoSQL)</th></tr>
         <tr><td>Fixed schema (columns)</td><td>Flexible (items alag fields)</td></tr>
         <tr><td>Joins, complex queries</td><td>No joins — denormalize</td></tr>
         <tr><td>Transactions</td><td>Limited transactions</td></tr>
         <tr><td>Scale: vertical (bada instance)</td><td>Scale: automatic (partition)</td></tr>
         <tr><td>Latency: ms (varies)</td><td>Single-digit ms (consistent)</td></tr>
       </table>
       <p>💡 <b>DynamoDB =</b> high-scale, simple queries, predictable latency.
       <b>RDS =</b> complex relationships, transactions, joins.</p>`,
      `<h3>🔑 Key schema — partition + sort</h3>
       <p>DynamoDB table ka data <b>keys</b> se organize:</p>
       <ul>
         <li>🔑 <b>Partition key</b> (hash) — data kaise baanta. <code>user_id</code>.
             Same key = same partition. Har item ka unique key.</li>
         <li>🔢 <b>Sort key</b> (range) — optional, partition ke andar order.
             <code>user_id + created_at</code> — ek user ke saare events time order mein.</li>
         <li>📑 <b>GSI</b> (Global Secondary Index) — dusre attribute se query.
             Primary <code>user_id</code> par, par <code>email</code> se bhi
             search chahiye? GSI on email.</li>
       </ul>
       <pre># Table: Users
Partition key: user_id (string)
Sort key: (none) — simple key

# Table: Orders
Partition key: customer_id
Sort key: order_date — ek customer ke saare orders date order mein

# GSI on Orders: by_status
Partition: status, Sort: order_date → "all PENDING orders" query</pre>`,
      `<h3>⚡ RCU/WCU + DAX — capacity aur cache</h3>
       <p>DynamoDB capacity do tarah:</p>
       <ul>
         <li>📐 <b>Provisioned</b> — RCU (read) + WCU (write) units define.
             Cheaper but capacity planning. Auto-scaling possible.</li>
         <li>💸 <b>On-demand</b> — pay per request. No planning, 2.5x cost.
             Spiky/unpredictable.</li>
       </ul>
       <p>⚡ <b>DAX</b> (DynamoDB Accelerator) = in-memory cache. Microsecond
       latency reads. 10x faster than DynamoDB direct. Use for hot reads.</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek gaming company ne
       RDS MySQL use kiya — 10M active users, leaderboards. Reads slow (500ms+),
       scaling nightmare. DynamoDB + DAX pe move kiya: <b>1ms reads, infinite
       scale, $0 ops</b>. Seekh: high-scale simple key lookups = DynamoDB,
       not RDS.</div>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'DynamoDB Diagram Detective',
        instructions: 'DynamoDB ke components par click karo.',
        visual: 'dynamodb',
        questions: [
          { q: 'Top-level container — items ka collection?', target: 'table', explain: 'Table. Users, Orders, etc. No fixed schema — items alag fields.' },
          { q: 'Ek record — attributes ka set?', target: 'item', explain: 'Item. user_id: 42 + name + email. Flexible schema.' },
          { q: 'Data kaise baanta — hash?', target: 'attr', explain: 'Partition key. Same key = same partition. user_id typically.' },
          { q: 'Partition ke andar order?', target: 'sortkey', explain: 'Sort key. customer_id + order_date — orders time order.' },
          { q: 'Dusre attribute se query?', target: 'gsi', explain: 'GSI. Primary user_id, GSI on email — email se search.' },
          { q: 'Read capacity units?', target: 'rcu', explain: 'RCU. 1 RCU = 1 strongly consistent read/sec (4KB).' },
          { q: 'Write capacity units?', target: 'wcu', explain: 'WCU. 1 WCU = 1 write/sec (1KB).' },
          { q: 'In-memory cache — microseconds?', target: 'dax', explain: 'DAX. 10x faster reads. Hot data cache. Microsecond latency.' },
        ],
      },
      {
        type: 'bins',
        title: 'DynamoDB ya RDS?',
        instructions: 'Har use-case ko sahi DB mein daalo.',
        bins: [
          { id: 'dynamo', label: '📊 DynamoDB (NoSQL)' },
          { id: 'rds', label: '🗄️ RDS (SQL)' },
        ],
        items: [
          { text: 'User sessions, 10M users, simple key lookup', bin: 'dynamo', explain: 'DynamoDB — key-value, any scale, ms latency.' },
          { text: 'Banking transactions, ACID, joins', bin: 'rds', explain: 'RDS — transactions, joins, ACID. Banking = SQL.' },
          { text: 'Shopping cart — flexible items, high scale', bin: 'dynamo', explain: 'DynamoDB — flexible schema, scale.' },
          { text: 'Complex reports, multi-table joins, GROUP BY', bin: 'rds', explain: 'RDS — SQL queries, joins. Reporting = SQL.' },
          { text: 'IoT sensor data, millions writes/sec', bin: 'dynamo', explain: 'DynamoDB — write scale, time-series key.' },
          { text: 'ERP system — 50 related tables, transactions', bin: 'rds', explain: 'RDS — relationships, joins, transactions.' },
        ],
      },
      {
        type: 'quiz',
        title: 'DynamoDB Quick-fire',
        questions: [
          {
            q: 'Partition key ka role?',
            choices: [
              'Data kaise baanta (hash) — same key = same partition. Har item unique key',
              'Data order karta',
              'Data encrypt karta',
              'Data replicate karta',
            ],
            answer: 0,
            explain: 'Partition key = hash. DynamoDB data partitions mein baanta. Hot partitions = uneven — choose key wisely (high cardinality).',
          },
          {
            q: 'GSI (Global Secondary Index) kab use karein?',
            choices: [
              'Dusre attribute se query chahiye — primary user_id, par email se bhi search',
              'Data encrypt karne ke liye',
              'Table ko fast karne ke liye',
              'Joins ke liye',
            ],
            answer: 0,
            explain: 'GSI = alternate query path. Primary key se hi query. Email/name search chahiye → GSI. Up to 20 per table.',
          },
          {
            q: 'DAX (DynamoDB Accelerator) ka use?',
            choices: [
              'In-memory cache — microsecond reads, 10x faster. Hot data',
              'Data encrypt karta',
              'Backups leta',
              'Replication karta',
            ],
            answer: 0,
            explain: 'DAX = cache layer. Hot reads (leaderboards, profiles) = microseconds. 10x faster. Extra cost but read-heavy = worth.',
          },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: DynamoDB Explorer',
        instructions: 'Mock account mein DynamoDB tables dekho.',
        goal: 'NoSQL audit: <b>(1)</b> Tables list karo. <b>(2)</b> Ek table describe karo (key schema). <b>(3)</b> Scan karo (items dekho).',
        tasks: [
          { text: 'aws dynamodb list-tables', check: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) },
          { text: 'aws dynamodb describe-table --table-name <name>', check: s => s.history.some(h => /aws dynamodb describe-table.*--table-name/.test(h)) },
          { text: 'aws dynamodb scan --table-name <name>', check: s => s.history.some(h => /aws dynamodb scan.*--table-name/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          tables: [
            { name: 'Users', partitionKey: 'user_id', sortKey: null, rcu: 5, wcu: 5, items: [{ user_id: '42', name: 'Ravi', email: 'ravi@example.com' }, { user_id: '43', name: 'Priya', email: 'priya@example.com' }] },
            { name: 'Orders', partitionKey: 'customer_id', sortKey: 'order_date', rcu: 10, wcu: 10, items: [{ customer_id: '42', order_date: '2024-03-15', total: 999 }] },
          ],
          buckets: [], vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        success: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) && s.history.some(h => /aws dynamodb describe-table.*--table-name/.test(h)),
        successText: '<b>Users</b> (partition key: user_id, simple) + <b>Orders</b> (partition: customer_id, sort: order_date — composite key). Notice: Users mein GSI on email chahiye for email-based lookup. Provisioned RCU/WCU. Hot reads = DAX.',
        hints: [
          'aws dynamodb list-tables — tables dekho',
          'aws dynamodb describe-table --table-name Users',
          'aws dynamodb scan --table-name Users — items',
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: Hot Partition Fix',
        instructions: 'Production user-sessions table pe throttling aa rahi hai. <b>Hot partition</b> ka shak hai. Diagnose karo, immediate relief do (capacity scale), aur root-cause fix apply karo (repartition).',
        goal: 'Hot partition fix — 3 steps: <b>(1)</b> <code>aws dynamodb query --table-name user-sessions --partition-key active</code> chala ke confirm karo ki saare items ek hi partition key value pe hain. <b>(2)</b> <code>aws dynamodb update-table --table-name user-sessions --read-capacity 50 --write-capacity 50</code> se immediate capacity scale karo (throttling relief). <b>(3)</b> Root-cause fix: <code>ls</code> se files dekho, phir <code>apply -f repartition.json</code> se partition key <b>status</b> → <b>user_id</b> (high-cardinality) karo. Verify: describe-table mein KeySchema ka partition key user_id ho gaya.',
        tasks: [
          { text: 'aws dynamodb query --table-name user-sessions --partition-key active — confirm all items on one partition', check: s => s.history.some(h => /aws dynamodb query.*user-sessions.*--partition-key active/.test(h)) },
          { text: 'aws dynamodb update-table --table-name user-sessions --read-capacity 50 --write-capacity 50 — scale capacity', check: s => { const t = (s.account.tables || []).find(x => x.name === 'user-sessions'); return t && t.rcu >= 50 && t.wcu >= 50; } },
          { text: 'apply -f repartition.json — repartition to user_id (high-cardinality)', check: s => { const t = (s.account.tables || []).find(x => x.name === 'user-sessions'); return t && t.partitionKey === 'user_id'; } },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          tables: [
            { name: 'user-sessions', partitionKey: 'status', sortKey: 'session_id', rcu: 5, wcu: 5, items: [
              { status: 'active', session_id: 's001', user_id: 'u1001', user: 'ravi' },
              { status: 'active', session_id: 's002', user_id: 'u1002', user: 'priya' },
              { status: 'active', session_id: 's003', user_id: 'u1003', user: 'arjun' },
              { status: 'active', session_id: 's004', user_id: 'u1004', user: 'neha' },
              { status: 'active', session_id: 's005', user_id: 'u1005', user: 'vikram' },
            ] },
          ],
          buckets: [],
        },
        files: {
          'repartition.json': {
            desc: 'Config: user-sessions table repartition — partition key status → user_id (high-cardinality). Hot partition fix.',
            apply: s => {
              const t = (s.account.tables || []).find(x => x.name === 'user-sessions');
              if (!t) return 'Error: user-sessions table not found';
              const oldKey = t.partitionKey;
              t.partitionKey = 'user_id';
              return `aws_dynamodb_table.user-sessions: Partition key changed "${oldKey}" → "user_id" (high-cardinality).\nApply complete! Hot partition FIXED. Items now spread across partitions by user_id.`;
            },
          },
        },
        success: s => s.history.some(h => /aws dynamodb query.*user-sessions.*--partition-key active/.test(h))
          && s.history.some(h => /aws dynamodb update-table.*user-sessions/.test(h))
          && s.history.some(h => /apply -f repartition\.json/.test(h))
          && ((s.account.tables || []).find(x => x.name === 'user-sessions') || {}).partitionKey === 'user_id',
        successText: 'Hot partition fix complete! 🛠️ <b>3-step production rescue:</b><br><br><b>1. Diagnose</b> — <code>query --partition-key active</code> se pata chala saare items ek hi partition pe (status="active"). Count=5, sab ek partition. Yahi hot partition hai — 5 RCU/WCU sirf ek partition pe, throttle.<br><br><b>2. Immediate relief</b> — <code>update-table</code> se RCU/WCU 5→50 scale kiya. Throttling abhi kam hoga, par yeh temporary hai — agar traffic aur badhe toh phir throttle.<br><br><b>3. Root-cause fix</b> — <code>apply -f repartition.json</code> se partition key <b>status → user_id</b> kiya. Ab 5 items 5 alag partitions pe (u1001-u1005, high-cardinality). Traffic even spread, koi partition hot nahi. <b>Scale to any traffic bina throttle ke.</b><br><br>💡 <b>Seekh:</b> Hot partition = low-cardinality partition key (status, category, isActive). Fix = high-cardinality key (user_id, session_id, order_id). Capacity scaling = temporary bandage, repartition = permanent cure.',
        hints: [
          'Step 1: aws dynamodb query --table-name user-sessions --partition-key active — dekho Count aur ScannedCount same hain? Saare items ek partition pe!',
          'Step 2: aws dynamodb update-table --table-name user-sessions --read-capacity 50 --write-capacity 50 — RCU/WCU scale karo (immediate throttling relief)',
          'Step 3: ls se files dekho — repartition.json milega. apply -f repartition.json chala ke partition key user_id karo (high-cardinality = even spread)',
        ],
      },
    ],
    interview: {
      title: 'Interview Round — NoSQL',
      instructions: 'DynamoDB round. 🎤',
      questions: [
        {
          q: '"DynamoDB ya RDS — kaise decide karein?" — interviewer.',
          choices: [
            'DynamoDB: high-scale, simple key lookup, flexible schema, predictable ms latency. RDS: complex joins, transactions, relationships, fixed schema',
            'Hamesha DynamoDB',
            'Hamesha RDS',
            'Dono same',
          ],
          answer: 0,
          explain: 'Use case driven. User profiles/sessions/IoT = DynamoDB. Banking/ERP/reporting = RDS. Right tool for query pattern.',
        },
        {
          q: 'Scenario: 10M users, leaderboard (top 100 by score). Best design?',
          choices: [
            'DynamoDB — partition: game_id, sort: score (descending). Query top 100. DAX for hot reads. Infinite scale, ms latency',
            'RDS MySQL — ORDER BY score LIMIT 100',
            'S3 pe JSON file',
            'EC2 pe Redis',
          ],
          answer: 0,
          explain: 'DynamoDB composite key (game_id + score) = efficient top-N query. DAX = microsecond. Scales to any user count. RDS would struggle at 10M.',
        },
        {
          q: 'Interviewer: "Partition key design mein common galti?"',
          choices: [
            'Hot partition — sab ek key pe (e.g. status="active"). Uneven distribution. Use high-cardinality key (user_id)',
            'Key ka naam short karna',
            'Sort key use karna',
            'GSI banana',
          ],
          answer: 0,
            explain: 'Hot partition = killer. "status" par partition = sab active ek partition pe = throttle. High-cardinality (user_id) = even distribution.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Table design audit! DynamoDB pe throttling report aaya. Investigate: <b>(1)</b> Tables list karo. <b>(2)</b> <code>user-sessions</code> table ka key schema dekho. <b>(3)</b> Scan karo — items mein pattern dhundo.',
            tasks: [
              { text: 'aws dynamodb list-tables — tables list', check: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) },
              { text: 'aws dynamodb describe-table --table-name user-sessions — key schema', check: s => s.history.some(h => /aws dynamodb describe-table.*user-sessions/.test(h)) },
              { text: 'aws dynamodb scan --table-name user-sessions — items dekho', check: s => s.history.some(h => /aws dynamodb scan.*user-sessions/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              tables: [
                { name: 'user-sessions', partitionKey: 'status', sortKey: 'session_id', rcu: 5, wcu: 5, items: [
                  { status: 'active', session_id: 's001', user: 'ravi' },
                  { status: 'active', session_id: 's002', user: 'priya' },
                  { status: 'active', session_id: 's003', user: 'arjun' },
                  { status: 'active', session_id: 's004', user: 'neha' },
                  { status: 'active', session_id: 's005', user: 'vikram' },
                ] },
              ],
              buckets: [],
            },
            success: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) && s.history.some(h => /aws dynamodb describe-table.*user-sessions/.test(h)) && s.history.some(h => /aws dynamodb scan.*user-sessions/.test(h)),
            successText: 'Throttling root cause mil gaya! 🔍 <b>user-sessions</b> table ka partition key = <b>status</b>. Saare items mein status = "active" — matlab <b>SAARA traffic ek partition pe</b>! Yehi hot partition problem hai. 5 RCU/WCU sirf ek partition pe — throttle. Fix: partition key = <b>user_id</b> (high-cardinality) hona chahiye, status attribute rakhna par partition mat banao. Scan se pata chala sab "active" hain — clear hot partition signal.',
            hints: [
              'aws dynamodb list-tables — table naam dekho',
              'aws dynamodb describe-table --table-name user-sessions — KeySchema dekho (partition key kya hai?)',
              'aws dynamodb scan --table-name user-sessions — items mein status field dekho, sab same hain?',
            ],
          },
        },
      ],
    },
    success: [
      'Main NoSQL vs SQL ka farak aur kab DynamoDB choose karna hai bata sakta hoon',
      'Main partition key, sort key, GSI ka data model samjhta hoon',
      'Main RCU/WCU capacity aur DAX cache ka role explain kar sakta hoon',
      'Main aws dynamodb commands se tables inspect kar sakta hoon',
    ],
    homework: `<p>Free Tier mein DynamoDB table banao:</p>
      <pre># Console → DynamoDB → Create table
# Name: Users
# Partition key: user_id (string)
# Sort key: (none)
# Capacity: on-demand (Free Tier)

# Items add karo (console)
# Or CLI:
aws dynamodb put-item --table-name Users --item '{"user_id":{"S":"1"},"name":{"S":"Ravi"}}'

# Scan:
aws dynamodb scan --table-name Users</pre>
      <p>✅ Self-check: <code>aws dynamodb list-tables</code> mein Users dikha? Items scan hue?</p>`,
    cards: [
      { front: 'DynamoDB vs RDS?', back: 'DynamoDB: NoSQL, flexible schema, key-value, any scale, ms latency, no joins. RDS: SQL, fixed schema, joins, transactions, relationships. Right tool for query pattern.' },
      { front: 'Partition key + sort key?', back: '<b>Partition key</b> = hash (data baanta, same key = same partition). <b>Sort key</b> = order within partition. user_id + created_at = user events time order.' },
      { front: 'GSI kya hai?', back: 'Global Secondary Index — dusre attribute se query. Primary user_id, GSI on email → email se search. Up to 20 per table.' },
      { front: 'RCU/WCU?', back: 'RCU = read capacity units (1 RCU = 1 strongly-consistent read/sec, 4KB). WCU = write (1 WCU = 1 write/sec, 1KB). Provisioned (planned) ya on-demand (pay per).' },
      { front: 'DAX + hot partition?', back: '<b>DAX</b> = in-memory cache, microsecond reads, 10x faster. <b>Hot partition</b> = sab ek key pe (status="active") = throttle. High-cardinality key (user_id) use karo.' },
    ],
  },

  /* ================= LEVEL 7: SQS / SNS / Kinesis ================= */
  {
    id: 'sqssns',
    icon: '📨',
    title: 'SQS / SNS / Kinesis — Decoupling ka Shastra',
    badge: 'Message Maestro',
    objectives: [
      '<b>Decoupling</b> kyun zaroori — producer consumer se independent',
      '<b>SQS</b> (queue) vs <b>SNS</b> (pub/sub) vs <b>Kinesis</b> (stream)',
      'Fan-out pattern aur at-least-once delivery',
      'aws sqs/sns ke concepts (CLI commands limited in sim)',
    ],
    lesson: [
      `<h3>🔗 Decoupling — components ko alag karo</h3>
       <p>Bina decoupling: <code>order → payment → email → inventory</code> —
       sab ek saath sync. Ek fail → sab block. <b>Decoupled:</b> order queue
       mein daal do, payment/email/inventory alag-alag consume karte. Ek fail
       bhi dusre chale.</p>
       <pre>SYNC (coupled):           DECOUPLED:
order → payment             order → [SQS] → payment
       → email                      → [SNS] → email
       → inventory                  → [SQS] → inventory
       
Ek fail = sab ruk.          Ek fail = baaki chal.</pre>
       <p>💡 <b>Decoupling benefits:</b> failure isolation, independent scaling,
       burst handling (queue absorbs spikes), async processing.</p>`,
      `<h3>📨 SQS — queue (1 message → 1 consumer)</h3>
       <p><b>SQS (Simple Queue Service)</b> = message queue. Producer message
       daalta, consumer pull karta. <b>1 message → 1 consumer</b> (no fan-out
       by default).</p>
       <ul>
         <li>📤 <b>Producer</b> → message queue mein daal</li>
         <li>📥 <b>Consumer</b> → poll + process + delete</li>
         <li>⏰ <b>Visibility timeout</b> — message hidden jab tak process</li>
         <li>🔁 <b>At-least-once</b> — message may deliver twice (idempotent consumer)</li>
         <li>✅ <b>Standard</b> (unlimited throughput, may duplicate/reorder) ya
             <b>FIFO</b> (exact order, exactly-once, 300 msg/s)</li>
       </ul>`,
      `<h3>📡 SNS — pub/sub (1 message → many subscribers)</h3>
       <p><b>SNS (Simple Notification Service)</b> = pub/sub. Publisher message
       <b>topic</b> pe bhejta, sab subscribers ko push. <b>Fan-out</b> = 1
       message → many.</p>
       <pre>Order service → SNS topic "order-events"
                    ├── SQS queue (payment)    ← fan-out
                    ├── SQS queue (email)      ← each gets copy
                    ├── SQS queue (inventory)
                    └── Lambda (analytics)</pre>
       <p>💡 <b>Fan-out pattern:</b> SNS + multiple SQS = 1 event, n independent
       consumers. Add/remove consumers without touching producer.</p>
       <p>🌊 <b>Kinesis</b> = real-time streaming (shards, order matters, replay).
       SQS/SNS = messages. Kinesis = continuous stream (IoT, clickstream).</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek e-commerce company
       ne <b>sync</b> checkout banaya — payment + email + inventory ek saath.
       Email service down → <b>checkout fail</b> → revenue loss. SQS decouple
       kiya: order event → SNS → payment (sync, critical) + email (async,
       retry) + inventory (async). Email down bhi checkout chal raha. Seekh:
       <b>critical sync, non-critical async</b>.</div>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'SQS vs SNS — diagram detective',
        instructions: 'Message services ke components par click karo.',
        visual: 'sqssns',
        questions: [
          { q: 'Message daalta queue mein?', target: 'producer', explain: 'Producer. SQS mein message bhejta.' },
          { q: 'Queue — messages line, 1→1 consumer?', target: 'queue', explain: 'SQS queue. At-least-once, visibility timeout. Standard ya FIFO.' },
          { q: 'Pull + process + delete karta?', target: 'consumer', explain: 'Consumer. Poll karta, process, delete. Idempotent hona chahiye.' },
          { q: 'Publisher topic pe bhejta?', target: 'publisher', explain: 'SNS publisher. Topic pe message publish.' },
          { q: 'Fan-out — 1 message many subscribers?', target: 'topic', explain: 'SNS topic. Sab subscribers ko push. SQS/Lambda/Email.' },
        ],
      },
      {
        type: 'bins',
        title: 'SQS, SNS, ya Kinesis?',
        instructions: 'Har use-case ko sahi service mein daalo.',
        bins: [
          { id: 'sqs', label: '📨 SQS (queue, 1→1)' },
          { id: 'sns', label: '📡 SNS (pub/sub, 1→many)' },
          { id: 'kinesis', label: '🌊 Kinesis (stream)' },
        ],
        items: [
          { text: 'Order processing — ek order ek worker handle', bin: 'sqs', explain: 'SQS — 1 message 1 consumer. Workers pull, process.' },
          { text: 'Order event — payment + email + inventory sab ko bhejo', bin: 'sns', explain: 'SNS fan-out — 1 event many subscribers.' },
          { text: 'IoT sensor data — continuous stream, order matters, replay', bin: 'kinesis', explain: 'Kinesis — real-time stream, shards, replay.' },
          { text: 'User signup — welcome email + analytics + CRM update', bin: 'sns', explain: 'SNS — 1 event, 3 subscribers (email/analytics/CRM).' },
          { text: 'Video encoding jobs queue — ek job ek encoder', bin: 'sqs', explain: 'SQS — worker pool, 1 job 1 encoder.' },
          { text: 'Clickstream analytics — millions events/sec, real-time', bin: 'kinesis', explain: 'Kinesis — high-throughput stream, analytics.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: Fan-Out Setup — SNS + SQS',
        instructions: 'Ek order event ka <b>fan-out</b> setup karo — 1 SNS topic, 2 SQS queues subscribe. Publish karte hi dono queues mein message aana chahiye!',
        goal: 'Fan-out architecture: <b>(1)</b> 2 SQS queues banao: <code>email-queue</code> aur <code>analytics-queue</code>. <b>(2)</b> Ek SNS topic banao: <code>order-events</code>. <b>(3)</b> Dono queues ko topic pe subscribe karo (protocol: sqs). <b>(4)</b> Topic pe message publish karo — <code>"Order123"</code>. <b>(5)</b> Dono queues se receive-message chala ke verify karo — dono mein message aaya!',
        tasks: [
          { text: 'aws sqs create-queue --queue-name email-queue', check: s => s.account.queues && s.account.queues.some(q => q.name === 'email-queue') },
          { text: 'aws sqs create-queue --queue-name analytics-queue', check: s => s.account.queues && s.account.queues.some(q => q.name === 'analytics-queue') },
          { text: 'aws sns create-topic --name order-events', check: s => s.account.topics && s.account.topics.some(t => t.name === 'order-events') },
          { text: 'Dono queues ko topic pe subscribe karo (2x aws sns subscribe)', check: s => { const t = s.account.topics && s.account.topics.find(x => x.name === 'order-events'); return t && (t.subscriptions || []).filter(s2 => s2.protocol === 'sqs').length >= 2; } },
          { text: 'aws sns publish --topic-arn <order-events-arn> --message "Order123"', check: s => s.history.some(h => /aws sns publish.*order-events/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          queues: [],
          topics: [],
        },
        success: s => {
          const emailQ = s.account.queues && s.account.queues.find(q => q.name === 'email-queue');
          const analyticsQ = s.account.queues && s.account.queues.find(q => q.name === 'analytics-queue');
          const topic = s.account.topics && s.account.topics.find(t => t.name === 'order-events');
          const subscribed = topic && (topic.subscriptions || []).filter(sub => sub.protocol === 'sqs').length >= 2;
          const emailHasMsg = emailQ && (emailQ.messages || []).some(m => /Order123/.test(m.body));
          const analyticsHasMsg = analyticsQ && (analyticsQ.messages || []).some(m => /Order123/.test(m.body));
          return subscribed && emailHasMsg && analyticsHasMsg;
        },
        successText: '<b>Fan-out complete!</b> 🎉 Ek <code>aws sns publish</code> chalaya — aur <b>dono queues</b> mein message aa gaya! Yehi decoupling ka power hai: producer sirf SNS ko jaanta hai, consumers (email/analytics) independently add/remove ho sakte hain. Naya consumer chahiye? SQS queue banao + subscribe — producer ka code change nahi. <b>Yehi SAA exam ka classic fan-out pattern hai.</b>',
        hints: [
          'Pehle 2 queues banao: aws sqs create-queue --queue-name email-queue (phir analytics-queue)',
          'Topic banao: aws sns create-topic --name order-events',
          'Subscribe karo: aws sns subscribe --topic-arn <arn-from-create-topic> --protocol sqs --notification-endpoint <queue-arn>. Queue ARN: arn:aws:sqs:us-east-1:123456789012:email-queue',
          'Publish karo: aws sns publish --topic-arn <topic-arn> --message "Order123" — fan-out dono queues mein message daalega',
          'Verify: aws sqs receive-message --queue-name email-queue (aur analytics-queue) — dono mein message hoga',
        ],
      },
      {
        type: 'quiz',
        title: 'Message Services Quick-fire',
        questions: [
          {
            q: 'SQS "at-least-once" delivery ka matlab?',
            choices: [
              'Message at least ek baar deliver hoga — par ho sakta do baar bhi. Consumer idempotent hona chahiye',
              'Message exactly ek baar — guaranteed',
              'Message kabhi nahi kuchhta',
              'Message at most ek baar',
            ],
            answer: 0,
            explain: 'At-least-once = may duplicate. Consumer ko idempotent design karo (same message 2x process = same result). Standard SQS.',
          },
          {
            q: 'Fan-out pattern — 1 event, 3 services. Best design?',
            choices: [
              'SNS topic → 3 SQS queues (payment, email, analytics). Producer sirf SNS ko bhej. Add/remove consumer without producer change',
              'Producer 3 baar bhej — har service ko',
              '3 alag SQS queues, producer sab mein daal',
              'SNS sirf, no SQS',
            ],
            answer: 0,
            explain: 'SNS + SQS = fan-out. Producer decoupled. Naya consumer? SQS queue + SNS subscribe. No producer code change.',
          },
          {
            q: 'Kinesis kab SQS se behtar?',
            choices: [
              'Real-time streaming, order matters, replay needed, high-throughput (IoT, clickstream)',
              'Hamesha Kinesis better',
              'Kabhi nahi — SQS best',
              'Sirf video ke liye',
            ],
            answer: 0,
            explain: 'Kinesis = stream (ordered, replay, shards). SQS = message (one-shot). IoT/clickstream/analytics = Kinesis. Order/worker = SQS.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Decoupling',
      instructions: 'Message services round. 🎤',
      questions: [
        {
          q: '"Decoupling kyun zaroori?" — interviewer.',
          choices: [
            'Failure isolation (ek fail baki chal), independent scaling, burst handling (queue absorbs spike), async processing. Tight coupling = cascade failure',
            'Sirf code clean rehta',
            'Performance badhti',
            'Cost kam hota',
          ],
          answer: 0,
          explain: 'Decoupling = resilience + scale + flexibility. Sync coupled = one failure breaks all. Async decoupled = independent, retry, scale per service.',
        },
        {
          q: 'Scenario: checkout — payment (critical) + email (non-critical). Design?',
          choices: [
            'Payment sync (user wait), email async via SQS (retry if fail). Critical = sync, non-critical = async decoupled',
            'Sab sync — user wait kare',
            'Sab async — user pata nahi payment hua ya nahi',
            'Email skip kar do',
          ],
          answer: 0,
            explain: 'Right pattern: critical path sync (user gets confirmation), non-critical async (email can retry, queue absorbs). Checkout fast + resilient.',
        },
        {
          q: 'Interviewer: "SQS vs SNS vs Kinesis — ek line mein?"',
          choices: [
            'SQS = queue (1→1, pull, at-least-once). SNS = pub/sub (1→many, push, fan-out). Kinesis = stream (ordered, replay, high-throughput)',
            'Dono same — message bhejna',
            'SQS push, SNS pull',
            'Kinesis = queue',
          ],
          answer: 0,
          explain: 'SQS queue (worker pattern), SNS pub/sub (broadcast), Kinesis stream (ordered continuous). Different message patterns.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Team ne SNS topic <code>order-events</code> aur SQS queue <code>notification-queue</code> banaye, par <b>subscribe bhool gaye</b>! Tum fan-out complete karo: <b>(1)</b> Queue ko topic pe subscribe karo (protocol: sqs). <b>(2)</b> Topic pe message publish karo — <code>Order123</code>. <b>(3)</b> Verify: queue se receive-message chala ke dekho — message aaya?',
            tasks: [
              { text: 'aws sns subscribe --topic-arn <order-events-arn> --protocol sqs --notification-endpoint <notification-queue-arn>', check: s => { const t = s.account.topics && s.account.topics.find(x => x.name === 'order-events'); return t && (t.subscriptions || []).some(sub => sub.protocol === 'sqs'); } },
              { text: 'aws sns publish --topic-arn <arn> --message Order123', check: s => s.history.some(h => /aws sns publish.*order-events/.test(h)) },
              { text: 'Verify: aws sqs receive-message --queue-name notification-queue', check: s => s.history.some(h => /aws sqs receive-message.*notification-queue/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              queues: [
                { name: 'notification-queue', url: 'https://sqs.us-east-1.amazonaws.com/123456789012/notification-queue', arn: 'arn:aws:sqs:us-east-1:123456789012:notification-queue', messages: [], isFifo: false, visibilityTimeout: 30 },
              ],
              topics: [
                { name: 'order-events', arn: 'arn:aws:sns:us-east-1:123456789012:order-events', subscriptions: [] },
              ],
            },
            success: s => {
              const q = s.account.queues && s.account.queues.find(x => x.name === 'notification-queue');
              const hasMsg = q && (q.messages || []).some(m => /Order123/.test(m.body));
              const subscribed = s.account.topics && s.account.topics.find(t => t.name === 'order-events') && (s.account.topics.find(t => t.name === 'order-events').subscriptions || []).some(sub => sub.protocol === 'sqs');
              return hasMsg && subscribed;
            },
            successText: 'Debug complete! 🎯 Problem tha: <b>subscribe bhool gaye the</b>. Subscribe → publish → verify. Yehi real interview mein poochte — "setup diya, bug dhundo". Fan-out mein 3 steps: (1) queue banao, (2) topic banao + subscribe, (3) publish → dono mein message. Agar message nahi aaya, check karo: subscription protocol sqs hai? endpoint correct ARN? topic pe publish kiya?',
            hints: [
              'Subscribe karo: aws sns subscribe --topic-arn arn:aws:sns:us-east-1:123456789012:order-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:notification-queue',
              'Publish karo: aws sns publish --topic-arn arn:aws:sns:us-east-1:123456789012:order-events --message Order123',
              'Verify: aws sqs receive-message --queue-name notification-queue — message body mein Order123 hoga',
            ],
          },
        },
      ],
    },
    success: [
      'Main decoupling ke benefits (failure isolation, scaling, burst) explain kar sakta hoon',
      'Main SQS (queue 1→1) vs SNS (pub/sub 1→many) vs Kinesis (stream) ka farak bata sakta hoon',
      'Main fan-out pattern (SNS + SQS) design kar sakta hoon',
      'Main critical-sync + non-critical-async pattern samjhta hoon',
    ],
    homework: `<p>Free Tier mein SQS + SNS fan-out setup:</p>
      <pre># SQS queue banao
aws sqs create-queue --queue-name email-queue
aws sqs create-queue --queue-name analytics-queue

# SNS topic
aws sns create-topic --name order-events

# Subscribe queues to topic (fan-out)
aws sns subscribe --topic-arn arn:... --protocol sqs --notification-endpoint <email-queue-arn>
aws sns subscribe --topic-arn arn:... --protocol sqs --notification-endpoint <analytics-queue-arn>

# Publish → dono queues mein message
aws sns publish --topic-arn arn:... --message "Order123"</pre>
      <p>✅ Self-check: Publish ke baad dono queues mein message dikha?</p>`,
    cards: [
      { front: 'Decoupling kyun?', back: 'Failure isolation (ek fail baki chal), independent scaling, burst handling (queue absorbs spike), async. Tight coupling = cascade failure.' },
      { front: 'SQS vs SNS vs Kinesis?', back: 'SQS = queue (1→1, pull, at-least-once, worker pattern). SNS = pub/sub (1→many, push, fan-out). Kinesis = stream (ordered, replay, high-throughput, IoT/clickstream).' },
      { front: 'Fan-out pattern?', back: 'SNS topic + multiple SQS queues. Producer → SNS. Har SQS queue ek consumer. Naya consumer = SQS + subscribe. No producer change.' },
      { front: 'SQS at-least-once?', back: 'Message at least ek baar, par <b>ho sakta do baar</b>. Consumer <b>idempotent</b> hona chahiye (same message 2x = same result). FIFO = exactly-once.' },
      { front: 'Critical sync vs non-critical async?', back: 'Payment = sync (user waits for confirmation). Email/analytics = async (SQS, retry if fail). Checkout fast + resilient. Email down bhi checkout chal raha.' },
    ],
  },

  /* ================= LEVEL 9: EventBridge + Step Functions ================= */
  {
    id: 'events',
    icon: '🔔',
    title: 'EventBridge + Step Functions — Events aur Orchestration',
    badge: 'Event Rishi',
    objectives: [
      '<b>EventBridge</b> — event bus, rules, event patterns, schedules',
      '<b>SNS vs SQS vs EventBridge</b> — teeno "message" bhejte hain, farak kya',
      '<b>Step Functions</b> — state machine, Retry/Catch, Standard vs Express',
      '<b>Orchestration vs choreography</b> — aur Saga (compensating transaction)',
    ],
    lesson: [
      `<h3>🔔 EventBridge — "kuch hua" ka postman</h3>
       <p>SQS/SNS ne producer-consumer ko decouple kiya. EventBridge ek qadam aage
       jaata hai: producer ko yeh bhi nahi pata ki <b>kitne</b> log sun rahe hain,
       aur consumer <b>content ke basis par</b> filter karta hai.</p>
       <pre># Event (JSON) — order service ne bus par daala
{
  "source": "com.myapp.orders",
  "detail-type": "OrderPlaced",
  "detail": { "orderId": "A-123", "amount": 4999, "country": "IN" }
}

# Rule ka event pattern — sirf yehi events match honge
{
  "source": ["com.myapp.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": { "amount": [{ "numeric": [">", 1000] }] }
}
# → Target: Lambda "fraud-check"   (₹1000 se upar wale orders hi)</pre>
       <p>Do tarah ke rules:</p>
       <ul>
         <li>🧭 <b>Event pattern rule</b> — "jab aisa event aaye".</li>
         <li>⏰ <b>Schedule rule</b> — <code>rate(5 minutes)</code> ya
             <code>cron(0 3 * * ? *)</code>. Serverless cron — EC2 par crontab
             chalane ki zaroorat khatam.</li>
       </ul>
       <p>💡 <b>SAA ka discriminator:</b> <b>SQS</b> = ek consumer, kaam ki queue,
       buffer/retry. <b>SNS</b> = fan-out, sab subscribers ko same message.
       <b>EventBridge</b> = content-based routing, 3rd-party/SaaS + AWS service
       events, schema registry, archive & replay. "AWS service ke event par react
       karo" (e.g. EC2 state change, S3 object created) = EventBridge.</p>`,
      `<h3>🪜 Step Functions — workflow jise tum debug kar sakte ho</h3>
       <p>EventBridge <i>route</i> karta hai. Step Functions <i>order</i> sambhalta
       hai: kya pehle, kya baad mein, fail hone par kya.</p>
       <pre>ValidateOrder → ChargePayment → ReserveStock → ShipOrder
                          │
                          └── Retry 3x (exponential backoff)
                          └── Catch → RefundPayment (compensate)</pre>
       <ul>
         <li>🔁 <b>Retry</b> — per-state, backoff ke saath. Code mein retry loop
             likhne ki zaroorat khatam.</li>
         <li>🪤 <b>Catch</b> — error par dusre state par jao (rollback / alert).</li>
         <li>👁️ <b>Visual execution history</b> — kaunsa step, kis input par,
             kab toota. Yeh Lambda-chain par sabse bada jeet hai.</li>
         <li>⚡ <b>Standard vs Express</b>: Standard = 1 saal tak chal sakta hai,
             exactly-once, per-transition billing (business workflows). Express =
             5 min max, at-least-once, high-volume/sasta (streaming, IoT).</li>
       </ul>
       <div class="war-story"><b>⚡ Real incident:</b> Ek D2C startup ka checkout
       "Lambda calls Lambda calls Lambda" tha. Payment ke baad stock reserve fail
       hua — customer ka paisa kat gaya, order kabhi bana hi nahi. Refund manually,
       Slack par, 400 orders ke liye. Step Functions par migrate kiya:
       <code>ChargePayment</code> par <b>Retry 3x</b> aur <code>ReserveStock</code>
       par <b>Catch → RefundPayment</b>. Agli baar stock service giri toh 62 orders
       apne aap refund hue, kisi ne ticket nahi kaata. Sabak: <b>paise wale
       multi-step flow mein rollback ka rasta bhi state machine mein likho.</b></div>`,
      `<h3>🎼 Orchestration vs Choreography (aur Saga)</h3>
       <table>
         <tr><th></th><th>Orchestration</th><th>Choreography</th></tr>
         <tr><td>Kaun</td><td>Step Functions</td><td>EventBridge / SNS+SQS</td></tr>
         <tr><td>Control</td><td>ek central conductor</td><td>har service khud react karti hai</td></tr>
         <tr><td>Visibility</td><td>👁️ poora flow ek jagah dikhta hai</td><td>🕵️ trace karna mushkil (X-Ray chahiye)</td></tr>
         <tr><td>Coupling</td><td>thoda zyada (conductor sabko jaanta hai)</td><td>sabse kam</td></tr>
         <tr><td>Kab</td><td>transaction, order matter karta hai, rollback chahiye</td><td>independent reactions (email, analytics, audit)</td></tr>
       </table>
       <p><b>Saga pattern</b> — distributed transaction ka jawab. Har step ka ek
       <i>compensating action</i> hota hai: ChargePayment ka RefundPayment,
       ReserveStock ka ReleaseStock. Fail hua toh ulti disha mein compensate karo.
       Step Functions ka Catch isi ke liye banaya gaya hai.</p>
       <p>💡 Real architecture dono use karti hai: checkout ka core = Step Functions
       (orchestration), "OrderShipped" event ke baad email/analytics/loyalty =
       EventBridge (choreography). Core ko control chahiye, side-effects ko azaadi.</p>`,
    ],
    stages: [
      {
        type: 'match',
        title: 'Kaun kya karta hai',
        instructions: 'Service ko uske kaam se jodo.',
        pairs: [
          { left: '📨 SQS', right: 'Buffer + retry — ek consumer group kaam uthata hai, poll karke', explain: 'Queue = kaam ka backlog. Consumer apni raftaar se process karta hai, message delete hone tak safe.' },
          { left: '📢 SNS', right: 'Fan-out — same message har subscriber ko push', explain: 'Pub/sub push. Ek publish → N subscribers (SQS, Lambda, email, SMS).' },
          { left: '🔔 EventBridge', right: 'Content-based routing — event pattern match karke target par bhejo', explain: 'Bus + rules. Filter event ke andar ke fields par, AWS/SaaS events bhi, archive & replay.' },
          { left: '⏰ EventBridge schedule rule', right: 'Serverless cron — cron(0 3 * * ? *)', explain: 'Scheduled invocation bina EC2 crontab ke. Nightly jobs ka standard jawab.' },
          { left: '🪜 Step Functions Standard', right: 'Lamba business workflow — 1 saal tak, exactly-once, visual history', explain: 'Order processing, approval flows. Per state-transition billing.' },
          { left: '⚡ Step Functions Express', right: 'High-volume short workflow — 5 min max, at-least-once, sasta', explain: 'Streaming/IoT ingestion. Duration+memory par bill, millions/sec.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Event flow par ungli rakho',
        instructions: 'Diagram mein sahi hissa click karo.',
        visual: 'events',
        questions: [
          { q: 'Event ke content par filter karke decide karta hai kaun sunega?', target: 'rule', explain: 'Rule ka event pattern — source, detail-type, aur detail ke andar ke fields par match.' },
          { q: 'Rule match hone ke baad event yahan jaata hai — yeh na ho toh event chup-chaap gir jaata hai?', target: 'target', explain: 'Target (Lambda/SQS/Step Functions...). Rule bina target = event match hota hai par kahin deliver nahi hota. #1 EventBridge bug.' },
          { q: 'Nightly 3 AM job ke liye kya use karoge?', target: 'schedule', explain: 'Schedule rule — cron(0 3 * * ? *). EC2 crontab ki zaroorat nahi.' },
          { q: 'Payment ke baad step fail ho gaya — paisa wapas karne wala step?', target: 'compensate', explain: 'Catch → RefundPayment. Saga ka compensating transaction. Yehi Step Functions ka asli faayda hai.' },
        ],
      },
      {
        type: 'fill',
        title: 'EventBridge rule ka event pattern',
        instructions: 'Sirf ₹1000 se upar ke India orders fraud-check par jaane chahiye. Blanks bharo.',
        template: `{
  "{0}": ["com.myapp.orders"],
  "{1}": ["OrderPlaced"],
  "detail": {
    "country": ["IN"],
    "amount": [{ "{2}": [">", 1000] }]
  }
}

# rule banane ke baad yeh MAT bhoolna — warna event match hoke gir jaayega:
aws events {3} --rule high-value-orders \\
  --targets arn:aws:lambda:us-east-1:123456789012:function:fraud-check`,
        tokens: ['source', 'detail-type', 'numeric', 'put-targets', 'topic-arn', 'subject', 'prefix', 'put-rule'],
        blanks: [
          { answer: 'source', explain: '<code>source</code> = event kis app/service se aaya (e.g. com.myapp.orders, ya AWS ka aws.ec2).' },
          { answer: 'detail-type', explain: '<code>detail-type</code> = event ka kism ("OrderPlaced", "EC2 Instance State-change Notification").' },
          { answer: 'numeric', explain: 'Content filter operators: <code>numeric</code>, <code>prefix</code>, <code>exists</code>, <code>anything-but</code>. Yehi EventBridge ko SNS se alag banate hain.' },
          { answer: 'put-targets', explain: '<code>put-rule</code> sirf rule banata hai. <code>put-targets</code> use kisi Lambda/SQS/Step Function se jodta hai. Target ke bina rule ek chithhi hai bina pate ke.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: Event kahin pahunch hi nahi raha',
        instructions: 'Fraud check kabhi trigger nahi hota. Rule aur uske targets audit karo, phir workflow ka failure dhundo.',
        goal: 'Team ne <code>high-value-orders</code> rule banaya, par <code>fraud-check</code> Lambda kabhi nahi chalti. <b>(1)</b> <code>aws events list-rules</code> — rule hai? <b>(2)</b> <code>aws events list-targets-by-rule --rule high-value-orders</code> — target laga hai kya? <b>(3)</b> <code>aws events put-targets</code> se Lambda jodo. <b>(4)</b> Phir <code>aws stepfunctions start-execution --name checkout</code> aur <code>get-execution-history</code> — checkout workflow kis state par toot raha hai?',
        tasks: [
          { text: 'aws events list-rules — rule exist karta hai?', check: s => s.history.some(h => /aws events list-rules/.test(h)) },
          { text: 'aws events list-targets-by-rule --rule high-value-orders', check: s => s.history.some(h => /aws events list-targets-by-rule/.test(h)) },
          { text: 'Lambda ko target banao (put-targets)', check: s => ((s.account.eventRules || []).find(r => r.name === 'high-value-orders') || {}).targets?.length > 0 },
          { text: 'checkout workflow chalao aur history dekho', check: s => s.history.some(h => /aws stepfunctions get-execution-history/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          eventRules: [
            { name: 'high-value-orders', bus: 'default', state: 'ENABLED', pattern: { source: ['com.myapp.orders'], 'detail-type': ['OrderPlaced'] }, targets: [] },
            { name: 'nightly-report', bus: 'default', state: 'ENABLED', schedule: 'cron(0 3 * * ? *)', targets: ['arn:aws:lambda:us-east-1:123456789012:function:daily-report'] },
          ],
          stateMachines: [
            { name: 'checkout', type: 'STANDARD', states: ['ValidateOrder', 'ChargePayment', 'ReserveStock', 'ShipOrder'], failAt: 'ReserveStock' },
          ],
          lambdas: [
            { name: 'fraud-check', runtime: 'python3.12', handler: 'app.handler', state: 'Active', memory: 512, timeout: 30 },
            { name: 'daily-report', runtime: 'python3.12', handler: 'app.report', state: 'Active', memory: 256, timeout: 300 },
          ],
        },
        success: s => {
          const r = (s.account.eventRules || []).find(x => x.name === 'high-value-orders');
          return !!(r && (r.targets || []).length) && s.history.some(h => /aws stepfunctions get-execution-history/.test(h));
        },
        successText: '🎉 <b>Dono classic bugs mil gaye.</b> (1) EventBridge rule bina target ke — pattern match hota tha, event chup-chaap gir jaata tha. <code>put-rule</code> aur <code>put-targets</code> do alag calls hain, IaC mein dono likho. (2) Step Functions history ne <code>ReserveStock</code> par ungli rakh di — <b>ChargePayment ke baad</b>. Yahi woh jagah hai jahan <code>Catch → RefundPayment</code> chahiye, warna paisa kat ke order gayab.',
        hints: [
          'aws events list-rules — dono rules dikhenge, dhyaan se dekho kis mein kya hai',
          'aws events list-targets-by-rule --rule high-value-orders — khaali array = event kahin nahi jaa raha',
          'aws events put-targets --rule high-value-orders --targets arn:aws:lambda:us-east-1:123456789012:function:fraud-check',
          'aws stepfunctions start-execution --name checkout, phir aws stepfunctions get-execution-history — kaunsa state TaskFailed hai?',
        ],
      },
      {
        type: 'quiz',
        title: 'Event-driven Quick-fire',
        questions: [
          {
            q: 'EC2 instance ke "state changed to stopped" par automatically ticket banana hai. Kya use karoge?',
            choices: [
              'EventBridge rule — AWS services apne events default bus par bhejti hain, pattern match karke Lambda/SNS target',
              'SQS queue — EC2 usme message daalegi',
              'Har 1 min par Lambda cron chala ke describe-instances poll karo',
              'CloudWatch alarm hi ek raasta hai',
            ],
            answer: 0,
            explain: 'AWS service events (EC2 state change, S3 object created, CodePipeline, GuardDuty finding) seedhe EventBridge default bus par aate hain. Polling anti-pattern hai — mehnga aur der se pata chalta hai.',
          },
          {
            q: 'Step Functions Standard vs Express — kab Express?',
            choices: [
              'High-volume, chhote (≤5 min) workflows jahan at-least-once chalega — streaming/IoT ingestion',
              'Jab workflow 1 saal chalna ho',
              'Jab exactly-once zaroori ho — jaise payment',
              'Jab visual debugging chahiye',
            ],
            answer: 0,
            explain: 'Express = 5 min limit, at-least-once, duration+memory billing, millions/sec. Payment jaise exactly-once + lambe workflows = Standard.',
          },
          {
            q: 'Rule ka pattern sahi hai, event bhi bus par aa raha hai, phir bhi Lambda nahi chalti. Sabse pehle kya check karoge?',
            choices: [
              'Rule par target laga hai kya (list-targets-by-rule) — aur rule ENABLED hai kya',
              'Lambda ka memory badhao',
              'VPC ka NAT gateway check karo',
              'DynamoDB ka RCU badhao',
            ],
            answer: 0,
            explain: 'put-rule aur put-targets alag operations hain — target bhoolna #1 galti hai. Doosra: rule DISABLED, teesra: Lambda ki resource policy EventBridge ko invoke karne nahi deti.',
          },
          {
            q: 'Checkout mein payment kat gaya par stock reserve fail hua. Sahi design?',
            choices: [
              'Step Functions mein ReserveStock par Catch → RefundPayment (Saga compensating transaction)',
              'Payment step ko retry karte raho jab tak stock na mile',
              'Frontend par customer ko refund form bharne bolo',
              'DynamoDB transaction se poora checkout ek transaction bana do',
            ],
            answer: 0,
            explain: 'Distributed services par ek ACID transaction possible nahi — Saga pattern chahiye: har step ka compensating action. Step Functions ka Catch exactly yahi implement karta hai. (DynamoDB transaction sirf ek table-set ke andar chalta hai, external payment gateway par nahi.)',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Events & Orchestration',
      instructions: 'Event-driven design round. 🎤',
      questions: [
        {
          q: '"SNS aur EventBridge dono fan-out karte hain — tum EventBridge kab choose karoge?"',
          choices: [
            'Jab routing event ke <b>content</b> par ho (numeric/prefix filters), ya AWS/SaaS service events chahiye, ya archive-replay/schema registry chahiye. SNS simple fan-out ke liye tez aur sasta hai',
            'Hamesha EventBridge — SNS purana hai',
            'Hamesha SNS — EventBridge mehnga hai',
            'Dono mein koi farak nahi, naam alag hai',
          ],
          answer: 0,
          explain: 'Achha jawab trade-off deta hai: EventBridge = richer routing + ecosystem integration + replay, thoda zyada latency/cost. SNS = ultra-simple high-throughput fan-out (aur mobile push/SMS).',
        },
        {
          q: 'Scenario: 8 Lambda ek dusre ko call karti hain. Prod mein "kahin fail ho raha hai" par pata nahi chalta. Kya badloge?',
          choices: [
            'Step Functions state machine bana do — har step ki visual execution history, per-state Retry/Catch, aur failure exactly kahan hua woh dikhega',
            'Har Lambda mein aur console.log daal do',
            'Sab kuch ek badi Lambda mein merge kar do',
            'SQS ke beech mein daal do har call ke',
          ],
          answer: 0,
          explain: 'Lambda-chain ka core problem <b>observability aur error handling</b> hai. Step Functions dono deta hai bina business logic badle — plus retry/backoff config-driven ho jaata hai.',
        },
        {
          q: 'Interviewer: "Orchestration aur choreography mein tum kya choose karte ho?"',
          choices: [
            'Dono — core transaction (order matter karta hai, rollback chahiye) = Step Functions orchestration; side-effects (email, analytics, loyalty) = EventBridge choreography',
            'Hamesha orchestration — control chahiye',
            'Hamesha choreography — loose coupling best hai',
            'Choreography sirf monolith ke liye hai',
          ],
          answer: 0,
          explain: 'Senior jawab "dono, alag jagah" hota hai. Paise/consistency wala core chahiye conductor; independent reactions ko azaadi do warna conductor har nayi feature par badalna padega.',
        },
      ],
    },
    success: [
      'Main SQS vs SNS vs EventBridge ka farak scenario ke hisaab se bata sakta hoon',
      'Main EventBridge rule ka event pattern likh sakta hoon aur target ki ahmiyat samjhta hoon',
      'Main Step Functions ke Retry/Catch aur Standard vs Express ka choice justify kar sakta hoon',
      'Main Saga (compensating transaction) pattern explain kar sakta hoon',
    ],
    homework: `<p>Free Tier par ek serverless cron banao:</p>
      <pre># 1. Lambda banao (python3.12) jo bas print kare:
def handler(event, context):
    print("chal gaya:", event)
    return {"ok": True}

# 2. EventBridge → Rules → Create rule
#    - Rule type: Schedule → rate(5 minutes)
#    - Target: woh Lambda            ← YEH step mat bhoolna
# 3. 10 min baad CloudWatch Logs mein 2 invocations dikhni chahiye

# 4. Ab ek pattern rule try karo:
#    Rule type: Event pattern → AWS services → EC2 → EC2 Instance State-change Notification
#    Target: same Lambda
#    Phir koi t3.micro start/stop karo — event log mein aayega

# 5. Bonus: Step Functions → Create state machine → Blank → 2 Lambda steps,
#    doosre par Catch add karo, phir jaan-boojh ke fail karke history dekho</pre>
      <p>✅ Self-check: Schedule rule ne Lambda chalayi? EC2 state-change event ka JSON logs mein dikha (source: aws.ec2)? Rule banate waqt target set kiya tha na?</p>`,
    cards: [
      { front: 'SQS vs SNS vs EventBridge?', back: '<b>SQS</b> = queue, ek consumer group, buffer+retry. <b>SNS</b> = fan-out push, sabko same message. <b>EventBridge</b> = content-based routing (numeric/prefix filters), AWS+SaaS events, archive & replay.' },
      { front: 'EventBridge rule ke 2 kism?', back: '<b>Event pattern rule</b> (jab aisa event aaye) aur <b>Schedule rule</b> (<code>rate(5 minutes)</code> / <code>cron(0 3 * * ? *)</code>) — serverless cron.' },
      { front: '#1 EventBridge bug?', back: 'Rule bana diya par <b>target nahi lagaya</b>. <code>put-rule</code> aur <code>put-targets</code> alag calls hain — event match hota hai aur chup-chaap gir jaata hai.' },
      { front: 'Step Functions Standard vs Express?', back: '<b>Standard</b>: 1 saal tak, exactly-once, per-transition billing — business workflows. <b>Express</b>: 5 min max, at-least-once, duration×memory billing — high-volume streaming/IoT.' },
      { front: 'Saga pattern?', back: 'Distributed transaction ka jawab: har step ka <b>compensating action</b> (ChargePayment ↔ RefundPayment). Step Functions ka <b>Catch</b> isi ke liye. Paise wale multi-step flow mein rollback ka rasta zaroori.' },
      { front: 'Orchestration vs choreography?', back: '<b>Orchestration</b> (Step Functions) = central conductor, visible flow, rollback — core transaction ke liye. <b>Choreography</b> (EventBridge) = har service khud react kare — side-effects (email/analytics) ke liye.' },
    ],
  },

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
