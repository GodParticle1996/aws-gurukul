/* =====================================================================
   AWS Gurukul — 🧭 Decision Dojo trees: INTEGRATION
   messaging (SQS/SNS/EventBridge/Kinesis/MQ) · sqstype (Standard vs FIFO) ·
   workflow (Step Functions vs choreography) · stream (Kinesis vs Firehose vs MSK)
   Prices: us-east-1 list price (2025–26), approx.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho.
   ===================================================================== */
AG.registerDecisions([

  /* ------------------------------------------------------------------ */
  {
    id: 'messaging',
    icon: '📨',
    title: 'Services ko kaise jodun? — SQS, SNS, EventBridge, Kinesis, Amazon MQ',
    short: 'Messaging chuno',
    tldr: 'Ek kaam, ek worker, load buffer → SQS. Ek event, kai subscribers (fan-out) → SNS (+SQS). Event ke content par routing, SaaS events, schedules → EventBridge. Ordered stream, replay, kai consumers same data padhein → Kinesis. Purana JMS/AMQP app → Amazon MQ.',
    levels: ['sqssns', 'events', 'messaging', 'eventbridge'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Ek message/event kitne consumers ko chahiye?',
        why: 'Queue (SQS) mein ek message ek hi worker uthata hai — kaam baantne ke liye. Pub/sub (SNS/EventBridge) mein ek event ki copy har subscriber ko jaati hai. Stream (Kinesis) mein data rehta hai — har consumer apni speed se padhta hai, chahe toh dobara bhi.',
        options: [
          { t: 'Ek — kaam ki queue, workers mein baant do', next: 'q2' },
          { t: 'Kai alag services ko same event (order placed → email, inventory, analytics)', next: 'q3' },
          { t: 'Lagataar data stream (clicks, IoT, logs) — order + replay chahiye', next: 'kinesis' },
          { t: 'Existing app JMS / AMQP / MQTT protocol bolta hai (ActiveMQ/RabbitMQ)', next: 'mq' },
        ],
      },
      q2: {
        q: 'Order zaroori hai aur duplicate bilkul nahi chahiye?',
        options: [
          { t: 'Nahi — at-least-once chalega, consumer idempotent hai', next: 'sqs' },
          { t: 'Haan — ek customer ke events strict order mein, dedup', next: 'sqsfifo' },
        ],
      },
      q3: {
        q: 'Routing kis basis par?',
        why: 'SNS topic par sab subscribers ko message milta hai (filter policy se thoda filtering). EventBridge event ke JSON content ke kisi bhi field par rule bana sakta hai, SaaS (Zendesk, Shopify) aur AWS services ke events bhi leta hai, aur archive/replay deta hai.',
        options: [
          { t: 'Simple fan-out — har subscriber ko har message, high throughput', next: 'q4' },
          { t: 'Event content par rules (detail.amount > 10000 → fraud), SaaS events, AWS service events, schedules', next: 'eb' },
        ],
      },
      q4: {
        q: 'Subscriber service down ho tab bhi subscriber ko message baad mein milna chahiye?',
        options: [
          { t: 'Haan — har subscriber apni speed se, retry ke saath (durable)', next: 'snssqs' },
          { t: 'Nahi — bas push notification / email / SMS bhejna', next: 'sns' },
        ],
      },
      sqs: {
        leaf: true, icon: '📨', pick: 'Amazon SQS (Standard)',
        one: 'Fully managed queue — producer daalta hai, workers uthate hain, load buffer hota hai.',
        why: 'Producer aur worker alag speed par chal sakte hain. Worker down ho toh messages queue mein wait karte hain (default 4 din, max 14 din).',
        when: ['Order aaya → background processing (email, PDF, image resize)', 'Traffic spike ko smooth karna (1,000 req/s aaye, workers 100/s process karein)', 'Lambda ke saath event source mapping'],
        avoid: ['Kai consumers ko same message chahiye (SNS fan-out ya Kinesis)', 'Strict ordering (FIFO lo)', 'Replay purane messages ka (consume + delete ke baad message gaya)'],
        gotchas: ['At-least-once delivery — consumer idempotent banao (same message do baar aa sakta hai)', 'Visibility timeout > worker ka processing time, warna doosra worker same message utha lega', 'DLQ lagao (maxReceiveCount 3–5) — poison message infinite loop na kare', 'Long polling (WaitTimeSeconds 20) — khaali receives ka bill kam'],
        cost: '~$0.40 per 10 lakh requests (pehle 10 lakh free har mahine).',
        exam: '"decouple", "buffer", "asynchronous processing", "workers scale independently" → SQS.',
        iac: `resource "aws_sqs_queue" "dlq" { name = "orders-dlq" }
resource "aws_sqs_queue" "orders" {
  name                       = "orders"
  visibility_timeout_seconds = 120     # worker ke max time se zyada
  receive_wait_time_seconds  = 20      # long polling
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}`,
        example: 'Food app: order API turant "order received" bolti hai, SQS mein message daalti hai; 20 workers restaurant ko notify karte hain. Dinner rush mein queue lambi hoti hai, API slow nahi hoti.',
        level: 'sqssns',
      },
      sqsfifo: {
        leaf: true, icon: '🔢', pick: 'Amazon SQS FIFO',
        one: 'Order guarantee (per message group) + exactly-once processing (5 min dedup window).',
        when: ['Bank account ke debit/credit strict order mein', 'Inventory updates per SKU order mein'],
        avoid: ['Bahut zyada throughput jahan order zaroori nahi (Standard sasta, unlimited)'],
        gotchas: ['Order sirf ek MessageGroupId ke andar — poore queue mein nahi; group id = customer_id/account_id rakho', 'Throughput limits: ~300 msg/s per API (batching se ~3,000; high-throughput mode se aur zyada)', 'Queue naam .fifo par khatam hona chahiye'],
        cost: '~$0.50 per 10 lakh requests.',
        exam: '"order must be preserved", "exactly-once processing", "no duplicates" → SQS FIFO.',
        level: 'sqssns',
      },
      snssqs: {
        leaf: true, icon: '📣', pick: 'SNS → multiple SQS (fan-out)',
        one: 'Ek SNS topic, har consumer service ki apni SQS queue subscribe — har service ko apni durable copy.',
        when: ['Order placed → email-queue, inventory-queue, analytics-queue', 'Har consumer alag speed, alag retry, alag DLQ'],
        avoid: ['Content-based complex routing / SaaS sources (EventBridge)'],
        gotchas: ['SQS queue policy mein SNS topic ko sqs:SendMessage allow karna padta hai — bhoole toh messages chup-chaap drop', 'Raw message delivery on karo warna body mein SNS ka JSON envelope aata hai', 'SNS filter policy se har queue sirf apne kaam ke messages le'],
        cost: 'SNS ~$0.50 per 10 lakh publishes + SQS requests (SNS→SQS delivery free).',
        exam: '"fan-out", "one message to multiple queues / systems in parallel" → SNS + SQS.',
        level: 'sqssns',
      },
      sns: {
        leaf: true, icon: '📣', pick: 'Amazon SNS',
        one: 'Pub/sub push — email, SMS, mobile push, HTTP, Lambda, SQS subscribers.',
        when: ['Alarm → on-call ko email/SMS', 'Mobile push notifications', 'Lambda subscribers ko event push'],
        avoid: ['Subscriber down ho toh message rakhna (SNS store nahi karta — SQS subscribe karo)'],
        gotchas: ['HTTP/email subscriptions ko confirm karna padta hai', 'FIFO topic sirf SQS FIFO subscribers ko'],
        cost: '~$0.50 per 10 lakh publishes; SMS per message alag.',
        exam: '"notify", "push", "email/SMS alerts", "pub/sub" → SNS.',
        level: 'sqssns',
      },
      eb: {
        leaf: true, icon: '🔔', pick: 'Amazon EventBridge',
        one: 'Event bus — event ke content par rules, AWS + SaaS + custom events, archive/replay, Scheduler, Pipes.',
        when: ['"order.amount > 10000" jaise content-based routing', 'AWS service events (EC2 state change, S3 object created, GuardDuty finding) par action', 'SaaS events (Shopify, Zendesk, Datadog)', 'Cron/one-time schedules (EventBridge Scheduler)', 'Event-driven microservices (choreography) with schema registry'],
        avoid: ['Bahut high-throughput simple fan-out jahan ms latency chahiye (SNS)', 'Ordered stream + replay by offset (Kinesis)'],
        gotchas: ['Rule ka target na ho toh event match hoke bhi kahin nahi jaata', 'Target failure par retry policy + DLQ lagao', 'Ek rule par max 5 targets'],
        cost: '~$1 per 10 lakh custom events; AWS service events default bus par free.',
        exam: '"route events based on content", "SaaS integration", "react to AWS service events", "schedule" → EventBridge.',
        iac: `resource "aws_cloudwatch_event_rule" "big_orders" {
  name = "big-orders"
  event_pattern = jsonencode({
    source      = ["shop.orders"]
    detail-type = ["OrderPlaced"]
    detail      = { amount = [{ numeric = [">", 10000] }] }
  })
}`,
        level: 'events',
      },
      kinesis: {
        leaf: true, icon: '🌊', pick: 'Kinesis Data Streams',
        one: 'Real-time ordered stream — shards, retention 24 ghante se 365 din, kai consumers, replay.',
        when: ['Clickstream / IoT telemetry / app events real-time analytics', 'Kai consumers same data alag kaam ke liye (fraud + dashboard + archive)', 'Ordering per partition key + replay'],
        avoid: ['Simple job queue (SQS simple aur sasta)', 'Bas S3/OpenSearch tak data pahunchana hai (Firehose — no shards)'],
        gotchas: ['Provisioned mode: har shard 1 MB/s ya 1,000 records/s in, 2 MB/s out — hot partition key = ek shard bhar jaata hai', 'On-demand mode capacity khud sambhalta hai', 'Enhanced fan-out se har consumer ko apna 2 MB/s per shard'],
        cost: 'Provisioned ~$0.015/shard-ghanta + PUT units; on-demand per GB.',
        exam: '"real-time streaming", "ordering", "replay", "multiple consumers read same stream" → Kinesis Data Streams.',
        level: 'sqssns',
      },
      mq: {
        leaf: true, icon: '🐰', pick: 'Amazon MQ (ActiveMQ / RabbitMQ)',
        one: 'Managed message broker — JMS, AMQP, MQTT, STOMP protocols.',
        when: ['On-prem app ActiveMQ/RabbitMQ use karta hai — code badle bina migrate'],
        avoid: ['Naya cloud-native design (SQS/SNS zyada scalable aur serverless)'],
        gotchas: ['Broker instances chalte hain — active/standby multi-AZ deployment chuno'],
        cost: 'Broker instance ghante + storage.',
        exam: '"JMS", "AMQP", "MQTT", "migrate existing message broker without code changes" → Amazon MQ.',
        level: 'messaging',
      },
    },
    compare: {
      cols: ['', 'SQS', 'SNS', 'EventBridge', 'Kinesis', 'Amazon MQ'],
      rows: [
        ['Model', 'queue (pull)', 'pub/sub (push)', 'event bus (rules)', 'stream (pull)', 'broker'],
        ['Consumers per msg', '1', 'sab', 'rule ke targets', 'sab, apni speed', 'queue/topic'],
        ['Order', 'FIFO mein', 'FIFO topic', 'nahi', 'per shard', 'haan'],
        ['Replay', 'nahi', 'nahi', 'archive se', 'haan (retention)', 'nahi'],
        ['Best fit', 'job buffer', 'fan-out/notify', 'content routing/SaaS', 'real-time analytics', 'legacy protocols'],
      ],
    },
    scenarios: [
      { s: 'Image upload ke baad resize ka kaam background mein; upload spike ke time workers ko overload nahi karna.', answer: 'sqs', explain: 'Job queue + buffer → SQS Standard.' },
      { s: '"OrderPlaced" event ko email service, inventory service aur analytics teeno ko apni-apni speed se chahiye; koi down ho toh message miss na ho.', answer: 'snssqs', explain: 'Durable fan-out → SNS + har service ki SQS queue.' },
      { s: 'Sirf 50,000 se badi payments par fraud Lambda chale; Stripe ke webhooks bhi isi system mein aane chahiye.', answer: 'eb', explain: 'Content-based rule + SaaS → EventBridge.' },
      { s: '10 lakh IoT sensors har second reading bhejte hain; real-time dashboard aur ML model dono same data padhein, 7 din replay chahiye.', answer: 'kinesis', explain: 'Stream + multiple consumers + replay → Kinesis Data Streams.' },
      { s: 'Bank ke ek account ke transactions bilkul order mein process hone chahiye, duplicate nahi.', answer: 'sqsfifo', explain: 'Order + dedup → SQS FIFO with MessageGroupId = account_id.' },
      { s: 'On-prem Java app ActiveMQ (JMS) par hai; AWS par bina code change shift karna hai.', answer: 'mq', explain: 'JMS compatibility → Amazon MQ.' },
      { s: 'CloudWatch alarm fire ho toh on-call engineer ko SMS + email.', answer: 'sns', explain: 'Push notifications → SNS.' },
      { s: 'EC2 instance terminate hote hi Slack message jaaye.', answer: 'eb', explain: 'AWS service event (EC2 state change) → EventBridge rule → Lambda/API destination.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'sqstype',
    icon: '🔢',
    title: 'SQS configure kaise karun? — Standard vs FIFO, visibility timeout, DLQ',
    short: 'SQS setup',
    tldr: 'Default Standard + idempotent consumer + DLQ. FIFO sirf tab jab order zaroori ho. Visibility timeout worker ke max time se zyada.',
    levels: ['sqssns'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Problem kya dikh raha hai?',
        options: [
          { t: 'Same message do workers process kar rahe hain', next: 'vis' },
          { t: 'Ek kharab message baar-baar fail ho ke queue ko jaam kar raha hai', next: 'dlq' },
          { t: 'Messages order mein process nahi ho rahe, order zaroori hai', next: 'fifo' },
          { t: 'Khaali receive calls ka bill bahut aa raha hai', next: 'lp' },
          { t: 'Message body bahut badi hai (MBs ki files)', next: 'big' },
        ],
      },
      vis: { leaf: true, icon: '⏳', pick: 'Visibility timeout badhao (+ idempotency)', one: 'Message receive hote hi chhup jaata hai; timeout se pehle delete nahi hua toh wapas dikh jaata hai.', when: ['Worker ka processing time > visibility timeout (default 30 s)'], avoid: ['Timeout itna lamba ki crashed worker ka message ghanton atka rahe'], gotchas: ['Lambda ke saath: queue visibility timeout ≥ 6 × function timeout (AWS recommendation)', 'Lambe kaam mein ChangeMessageVisibility se timeout extend karo', 'Phir bhi duplicate ho sakta hai — consumer idempotent (DynamoDB conditional write)'], exam: '"messages processed more than once" → visibility timeout increase.', level: 'sqssns' },
      dlq: { leaf: true, icon: '☠️', pick: 'Dead-Letter Queue (redrive policy)', one: 'maxReceiveCount baar fail hone ke baad message DLQ mein — main queue chalti rehti hai.', when: ['Poison messages (bad JSON, missing field)'], avoid: ['DLQ banake bhool jaana — DLQ depth par CloudWatch alarm lagao'], gotchas: ['DLQ redrive se fix ke baad messages wapas main queue mein'], exam: '"messages that cannot be processed", "isolate failed messages" → DLQ.', level: 'sqssns' },
      fifo: { leaf: true, icon: '🔢', pick: 'FIFO queue + MessageGroupId', one: 'Order per message group; dedup ID se 5 minute mein duplicate reject.', when: ['Per-entity strict order (account, order id)'], avoid: ['Global order poore system mein (scale khatam) — group id choose karo'], gotchas: ['Standard queue ko FIFO mein convert nahi kar sakte — naya queue banao'], exam: '"FIFO", "order" → FIFO queue.', level: 'sqssns' },
      lp: { leaf: true, icon: '🎣', pick: 'Long polling (ReceiveMessageWaitTimeSeconds = 20)', one: 'Receive call 20 second tak wait karta hai — khaali responses kam, bill kam.', when: ['Low-traffic queues jahan workers lagataar poll karte hain'], avoid: ['Worker ko har receive call turant wapas chahiye (UI thread jaisa) — tab WaitTimeSeconds chhota rakho'], gotchas: ['Short polling (0) sab servers se nahi poochta — false empty bhi de sakta hai'], exam: '"reduce empty responses / cost" → long polling.', level: 'sqssns' },
      big: { leaf: true, icon: '📦', pick: 'Claim-check: payload S3 mein, message mein pointer', one: 'Badi file S3 par, SQS message mein sirf s3://bucket/key.', when: ['MBs/GBs payloads'], avoid: ['Chhote JSON messages par overkill'], gotchas: ['Extended Client Library (Java/Python) claim-check pattern automatic karti hai', 'S3 lifecycle se purane payloads saaf karo'], exam: '"large messages" → S3 + pointer (SQS Extended Client).', level: 'sqssns' },
    },
    scenarios: [
      { s: 'Video encode 2 minute leta hai, visibility timeout 30 second hai — same video do baar encode ho raha hai.', answer: 'vis', explain: 'Timeout < processing time → visibility timeout badhao (> 2 min).' },
      { s: 'Ek corrupt message har 30 second fail hota hai, 3 din se queue mein ghoom raha hai.', answer: 'dlq', explain: 'Poison message → DLQ with maxReceiveCount.' },
      { s: 'Workers har second ReceiveMessage karte hain, 95% responses khaali, bill bada.', answer: 'lp', explain: 'Long polling 20 s.' },
      { s: '20 MB PDF reports queue se workers ko bhejni hain.', answer: 'big', explain: 'Claim-check pattern — S3 + pointer.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'workflow',
    icon: '🪜',
    title: 'Multi-step process kaise chalaun? — Step Functions (Standard/Express) ya event choreography',
    short: 'Workflow / orchestration',
    tldr: 'Steps ka order, retry, timeout, compensation (saga) ek jagah dikhna chahiye → Step Functions. Lambi (din/hafte), human approval → Standard. Bahut high volume, chhota (<5 min) → Express. Services independent, bas react karein → EventBridge choreography.',
    levels: ['events', 'messaging'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Steps ke beech kaun control rakhe?',
        why: 'Orchestration = ek conductor (state machine) har step ko bolta hai "ab tum". Choreography = har service event sunti hai aur khud react karti hai — loosely coupled, par poora flow kahin ek jagah nahi dikhta.',
        options: [
          { t: 'Ek central flow — order, retries, rollback (saga) dikhne chahiye', next: 'q2' },
          { t: 'Services independent hain, bas events par react karein, naye consumers aasaani se judein', next: 'chor' },
        ],
      },
      q2: {
        q: 'Ek execution kitni lambi aur kitni baar?',
        options: [
          { t: 'Minutes se din/hafte, human approval, exactly-once steps (payment)', next: 'sfnstd' },
          { t: '5 minute se kam, bahut zyada volume (1000s/second) — IoT, streaming transforms', next: 'sfnexp' },
        ],
      },
      sfnstd: {
        leaf: true, icon: '🪜', pick: 'Step Functions — Standard workflow',
        one: 'Durable state machine — up to 1 saal, exactly-once step execution, visual history.',
        when: ['Order saga: reserve inventory → charge payment → ship; fail par compensation', 'Human approval (callback task token)', 'ML pipeline, ETL with retries'],
        avoid: ['Har second hazaaron chhote executions (state transition bill badhta hai) — Express'],
        gotchas: ['Retry + Catch har task par likho — bina Catch error poori execution fail karta hai', 'Payload limit 256 KB — badi cheez S3 mein, path pass karo'],
        cost: '~$0.025 per 1,000 state transitions.',
        exam: '"orchestrate multiple Lambda functions", "long-running", "human approval", "visual workflow" → Step Functions Standard.',
        iac: `"ChargePayment": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Retry": [{ "ErrorEquals": ["States.Timeout"], "MaxAttempts": 3, "BackoffRate": 2 }],
  "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "ReleaseInventory" }],
  "Next": "ShipOrder"
}`,
        level: 'events',
      },
      sfnexp: {
        leaf: true, icon: '⚡', pick: 'Step Functions — Express workflow',
        one: 'High-volume, short (≤5 min), at-least-once — per request + duration bill.',
        when: ['IoT data transform per event', 'API backend orchestration jo seconds mein khatam'],
        avoid: ['Lambe workflows / exactly-once payment steps'],
        gotchas: ['History CloudWatch Logs mein (console mein Standard jaisa nahi)'],
        cost: 'Per request + GB-second — Standard se bahut sasta high volume par.',
        exam: '"high-volume, short-duration event processing workflows" → Express.',
        level: 'events',
      },
      chor: {
        leaf: true, icon: '💃', pick: 'Choreography (EventBridge events)',
        one: 'Har service event publish karti hai; doosri services rules se subscribe karke react karti hain.',
        when: ['Teams independent, naye consumers bina producer badle judne chahiye', 'Simple reactions (order placed → loyalty points)'],
        avoid: ['Lambi multi-step transaction jahan rollback chahiye — flow "kahan atka" pata karna mushkil'],
        gotchas: ['Correlation id har event mein rakho, warna debugging nightmare', 'Event schema registry se contract'],
        cost: 'EventBridge ~$1 per 10 lakh events.',
        exam: '"loosely coupled", "event-driven", "add consumers without changing producer" → EventBridge choreography.',
        level: 'eventbridge',
      },
    },
    scenarios: [
      { s: 'Loan approval: documents check → credit score → manager ki manual approval (2 din tak) → disbursal.', answer: 'sfnstd', explain: 'Lamba + human approval → Standard workflow (task token).' },
      { s: 'Har IoT reading (5,000/second) par 3 chhote transform steps, har baar 200 ms.', answer: 'sfnexp', explain: 'High volume + short → Express workflow.' },
      { s: 'Order placed hone par loyalty, analytics aur recommendations teams apne-apne kaam karein; agle quarter 2 aur teams judengi.', answer: 'chor', explain: 'Independent consumers, easy to add → EventBridge choreography.' },
      { s: 'Travel booking: flight + hotel + car; koi ek fail ho toh baaki bookings cancel (saga).', answer: 'sfnstd', explain: 'Compensation/saga with Catch → Step Functions Standard.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'stream',
    icon: '🌊',
    title: 'Streaming data — Kinesis Data Streams, Firehose ya MSK (Kafka)?',
    short: 'Streaming chuno',
    tldr: 'Data ko bas S3/Redshift/OpenSearch/Splunk tak pahunchana hai → Firehose (no shards, near real-time). Custom real-time consumers + replay → Kinesis Data Streams. Kafka API/ecosystem chahiye → MSK.',
    levels: ['sqssns', 'logsetl'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Data ke saath kya karna hai?',
        options: [
          { t: 'Bas destination tak deliver karna (S3, Redshift, OpenSearch, Splunk), thoda transform', next: 'fh' },
          { t: 'Apne consumers real-time process karein (fraud, leaderboard), replay chahiye', next: 'q2' },
        ],
      },
      q2: {
        q: 'Kafka ecosystem (Kafka Connect, Kafka Streams, existing producers) chahiye?',
        options: [
          { t: 'Haan — team Kafka jaanti hai / existing Kafka clients', next: 'msk' },
          { t: 'Nahi — AWS-native, kam ops', next: 'kds' },
        ],
      },
      fh: { leaf: true, icon: '🚒', pick: 'Amazon Data Firehose', one: 'Fully managed delivery — buffer (size/time), optional Lambda transform, compression, Parquet conversion → destination.', when: ['Logs/clickstream → S3 data lake', 'CloudWatch Logs subscription → OpenSearch', 'Near real-time (seconds–minutes) kaafi hai'], avoid: ['Custom consumer logic / replay (Firehose replay nahi deta)', 'Sub-second latency'], gotchas: ['Buffer interval/size latency aur file size decide karta hai', 'Failed records ke liye S3 backup bucket set karo'], cost: 'Per GB ingested (~$0.029/GB first tier).', exam: '"load streaming data into S3/Redshift/OpenSearch", "near real-time", "no administration" → Firehose.', level: 'logsetl' },
      kds: { leaf: true, icon: '🌊', pick: 'Kinesis Data Streams', one: 'Shards par ordered records, retention + replay, multiple consumers (Lambda, KCL, Flink).', when: ['Real-time fraud detection, live dashboards', 'Kai consumers same stream'], avoid: ['Sirf delivery chahiye (Firehose simple)'], gotchas: ['Partition key se shard decide hota hai — skewed key = hot shard', 'On-demand mode unpredictable traffic ke liye'], cost: 'Shard-ghante ya on-demand per GB.', exam: '"real-time", "custom processing", "replay" → Kinesis Data Streams.', level: 'sqssns' },
      msk: { leaf: true, icon: '🐘', pick: 'Amazon MSK (Managed Kafka)', one: 'Managed Apache Kafka — Kafka APIs, Connect, ecosystem; MSK Serverless bhi.', when: ['Existing Kafka workloads migrate', 'Kafka Connect connectors, Kafka Streams apps'], avoid: ['Team Kafka nahi jaanti aur simple stream chahiye (Kinesis)'], gotchas: ['Provisioned MSK mein broker sizing, partitions, storage tumhare zimme'], cost: 'Broker ghante + storage (ya Serverless per partition/GB).', exam: '"Apache Kafka", "open-source compatibility" → MSK.', level: 'messaging' },
    },
    scenarios: [
      { s: 'Website clickstream ko har 60 second S3 mein Parquet files mein daalna hai Athena queries ke liye.', answer: 'fh', explain: 'Delivery + Parquet conversion → Firehose.' },
      { s: 'Card swipe events par 1 second ke andar fraud score, aur 3 doosre consumers bhi same events padhte hain.', answer: 'kds', explain: 'Real-time custom consumers + fan-out → Kinesis Data Streams.' },
      { s: 'Company ke paas 200 Kafka producers aur Kafka Connect pipelines hain, on-prem se AWS shift.', answer: 'msk', explain: 'Kafka compatibility → MSK.' },
    ],
  },
]);
