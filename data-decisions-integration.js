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
    tldr: 'Competing workers + job buffer → SQS; repeated delivery still needs idempotency. Ek event, kai subscribers (fan-out) → SNS (+SQS). Event ke content par routing, SaaS events, schedules → EventBridge. Ordered stream, replay, kai consumers same data padhein → Kinesis. Purana JMS/AMQP app → Amazon MQ.',
    levels: ['sqssns', 'events', 'messaging', 'eventbridge', 'boss2'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Ek message/event kitne consumers ko chahiye?',
        why: 'SQS workers share jobs; retries/Standard duplication can repeat work. SNS/EventBridge route independent matching copies to subscribers/targets, subject to delivery permission. Stream (Kinesis) mein data rehta hai — har consumer apni speed se padhta hai, chahe toh dobara bhi.',
        options: [
          { t: 'Ek — kaam ki queue, workers mein baant do', next: 'q2' },
          { t: 'Kai alag services ko same event (order placed → email, inventory, analytics)', next: 'q3' },
          { t: 'Lagataar data stream (clicks, IoT, logs) — order + replay chahiye', next: 'kinesis' },
          { t: 'Existing app JMS / AMQP / MQTT protocol bolta hai (ActiveMQ/RabbitMQ)', next: 'mq' },
        ],
      },
      q2: {
        q: 'Strict per-entity order chahiye; repeated business work ka contract kya hai?',
        options: [
          { t: 'Nahi — at-least-once chalega, consumer idempotent hai', next: 'sqs' },
          { t: 'Haan — per-customer order + five-minute producer dedup; consumer idempotent rahega', next: 'sqsfifo' },
        ],
      },
      q3: {
        q: 'Routing kis basis par?',
        why: 'SNS message attributes aur JSON body filters dono support karta hai. EventBridge tab chuno jab uske event-source/rule/integration features chahiye; sirf filtering EventBridge ki khaas cheez nahi. Delivery permission aur matching rules se tay hoti hai.',
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
        one: 'Managed job buffer; competing workers ko message thodi der ke liye dikhna band (visibility) milta hai, woh kaam save karte hain, phir latest receipt se delete karte hain.',
        why: 'Producer aur worker alag speed par chal sakte hain. Worker down ho toh messages queue mein wait karte hain (default 4 din, max 14 din).',
        when: ['Order aaya → background processing (email, PDF, image resize)', 'Traffic spike ko smooth karna (1,000 req/s aaye, workers 100/s process karein)', 'Lambda ke saath event source mapping'],
        avoid: ['Kai consumers ko same message chahiye (SNS fan-out ya Kinesis)', 'Strict ordering (FIFO lo)', 'Replay purane messages ka (consume + delete ke baad message gaya)'],
        gotchas: ['At-least-once delivery — consumer idempotent banao (same message do baar aa sakta hai)', 'Visibility timeout > worker ka processing time, warna doosra worker same message utha lega', 'DLQ lagao (maxReceiveCount 3–5) — poison message infinite loop na kare', 'Long polling (WaitTimeSeconds 20) — khaali receives ka bill kam'],
        cost: 'Approx us-east-1 Standard $0.40/million request units before allowances; 64KiB chunks, polls/retries/batches change units. Fair queues add eligible request charges.',
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
        one: 'Per-MessageGroupId order + five-minute producer dedup; external business work still needs idempotency.',
        when: ['Bank account ke debit/credit strict order mein', 'Inventory updates per SKU order mein'],
        avoid: ['Independent jobs without strict order (Standard candidate; quotas and consumer capacity still apply)'],
        gotchas: ['Order sirf ek MessageGroupId ke andar — poore queue mein nahi; group id = customer_id/account_id rakho', 'Normal (non-high-throughput) FIFO: har partition, har API action par 300 transactions/s; batch 10 se 3000 messages/s tak ja sakte hain. High-throughput/Region quotas aur groups ka bantwaara maayne rakhta hai.', 'Queue ke naam mein .fifo + FifoQueue=true; latest receipt se delete aur consumer ki recovery phir bhi zaroori hai'],
        cost: 'Approx us-east-1 FIFO $0.50/million eligible message-action requests; payload/batch/Region rules matter.',
        exam: 'Per-entity ordering/five-minute producer dedup → SQS FIFO + stable group/event ID; no automatic exactly-once email/payment.',
        level: 'sqssns',
      },
      snssqs: {
        leaf: true, icon: '📣', pick: 'SNS → multiple SQS (fan-out)',
        one: 'Ek SNS topic, har consumer service ki apni SQS queue subscribe — har service ko apni durable copy.',
        when: ['Order placed → email-queue, inventory-queue, analytics-queue', 'Har consumer alag speed, alag retry, alag DLQ'],
        avoid: ['Content-based complex routing / SaaS sources (EventBridge)'],
        gotchas: ['Exact queue par SNS ko SendMessage allow karo, topic ke SourceArn se scope karke; Publish safal hona delivery ka saboot nahi. Delivery logs/metrics aur subscription DLQ dekho.', 'Raw body ya default SNS envelope, soch kar chuno; raw SQS delivery mein zyada se zyada 10 message attributes chalte hain', 'FilterPolicyScope defaults to MessageAttributes; JSON payload fields need MessageBody. AWS propagation up to 15 minutes.'],
        cost: 'Lagbhag us-east-1 SNS Standard $0.50/million paid API requests + SQS/worker/KMS/filter/transfer ka alag kharcha; SNS se SQS delivery ki per-message fee nahi.',
        exam: '"fan-out", "one message to multiple queues / systems in parallel" → SNS + SQS.',
        level: 'sqssns',
      },
      sns: {
        leaf: true, icon: '📣', pick: 'Amazon SNS',
        one: 'SNS Standard topic email, SMS, mobile push, HTTP, Lambda aur SQS tak bhej sakta hai.',
        when: ['Alarm → on-call ko email/SMS', 'Mobile push notifications', 'Lambda subscribers ko event push'],
        avoid: ['Competing-worker job buffer (use SQS); durable per-service processing copies need queues. Eligible SNS FIFO archive/replay is separate from queue consumption.'],
        gotchas: ['HTTP/email subscriptions ko confirm karo. SNS retry ki policy endpoint aur error par depend karti hai. Delivery fail rahe toh subscription DLQ kaam aa sakti hai.', 'SNS FIFO, SQS FIFO aur Standard dono ko bhej sakta hai; Standard phir bhi best-effort/at-least-once hai. Seedhe customer HTTP/email/SMS/mobile endpoints supported nahi.'],
        cost: 'Lagbhag us-east-1 Standard $0.50/million paid API request units; endpoint, body-filter scans, transfer aur KMS ka charge alag se jud sakta hai.',
        exam: '"notify", "push", "email/SMS alerts", "pub/sub" → SNS.',
        level: 'sqssns',
      },
      eb: {
        leaf: true, icon: '🔔', pick: 'EventBridge — default/Classic rules',
        one: 'Default/Classic bus rules/targets se route karta hai. Aaj ke Custom Event Bus ke retained-event subscribers ek alag API/product hain; exact order/replay/price contract compare karo.',
        when: ['"order.amount > 10000" jaise content-based routing', 'AWS service events (EC2 state change, S3 object created, GuardDuty finding) par action', 'SaaS events (Shopify, Zendesk, Datadog)', 'Cron/one-time schedules (EventBridge Scheduler)', 'Event-driven microservices (choreography) with schema registry'],
        avoid: ['Bahut high-throughput simple fan-out jahan ms latency chahiye (SNS)', 'Ordered stream + replay by offset (Kinesis)'],
        gotchas: ['Rule ka target na ho toh event match hoke bhi kahin nahi jaata', 'Target failure par retry policy + DLQ lagao', 'Classic rule max 5 targets; current Custom Event Bus subscriber limits differ'],
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
        gotchas: ['Partition key ek taraf jhuki ho toh ek shard overload ho sakta hai, chahe poore stream ki capacity theek dikhe; aaj ka mode/Region/record limits check karo', 'On-demand likhi limits ke andar capacity apne aap badhata hai; load ka badhna aur skew naapo, capacity ko unlimited mat maano', 'Enhanced fan-out har consumer ko apna alag throughput deta hai, aaj ki likhi limits ke andar'],
        cost: 'Mode ke hisaab se shard/capacity, records/bytes, retention aur consumer ka charge; aaj ki Region pricing check karo.',
        exam: '"real-time streaming", "ordering", "replay", "multiple consumers read same stream" → Kinesis Data Streams.',
        level: 'sqssns',
      },
      mq: {
        leaf: true, icon: '🐰', pick: 'Amazon MQ (ActiveMQ / RabbitMQ)',
        one: 'Managed ActiveMQ/RabbitMQ; exact engine/client protocols match karo (har engine har protocol nahi chalata).',
        when: ['On-prem app ActiveMQ/RabbitMQ use karta hai — code badle bina migrate'],
        avoid: ['Naya cloud-native design (SQS/SNS zyada scalable aur serverless)'],
        gotchas: ['Engine-specific protocols/deployment: ActiveMQ and RabbitMQ have different HA layouts; verify broker capacity, failover and maintenance requirements'],
        cost: 'Broker instance ghante + storage.',
        exam: '"JMS", "AMQP", "MQTT", "migrate existing message broker without code changes" → Amazon MQ.',
        level: 'messaging',
      },
    },
    compare: {
      cols: ['', 'SQS', 'SNS', 'EventBridge Classic', 'Kinesis', 'Amazon MQ'],
      rows: [
        ['Model', 'queue (pull)', 'pub/sub (push)', 'event bus (rules)', 'stream (pull)', 'broker'],
        ['Consumer contract', 'competing workers; retries', 'matching subscriptions', 'matching rule targets', 'independent offsets', 'engine queue/topic'],
        ['Order', 'FIFO per group', 'FIFO→FIFO per group', 'no general order promise', 'per shard', 'engine/config dependent'],
        ['Replay', 'not after delete', 'eligible FIFO archive', 'configured archive', 'within retention', 'engine/config dependent'],
        ['Best fit', 'job buffer', 'fan-out/notify', 'content routing/SaaS', 'real-time analytics', 'legacy protocols'],
      ],
    },
    scenarios: [
      { s: 'Image upload ke baad resize ka kaam background mein; upload spike ke time workers ko overload nahi karna.', answer: 'sqs', explain: 'Job queue + buffer → SQS Standard.' },
      { s: 'PixShare par har edit render aur feed dono ko chahiye. Feed worker do ghante band ho sakta hai. Wapas aakar feed ko har edit apni speed se lagaani hai.', answer: 'snssqs', explain: 'Har service apni queue mein bachi copy padhti hai. Publish ke baad queue policy aur subscription ki delivery bhi jaancho.' },
      { s: 'Sirf 50,000 se badi payments par fraud Lambda chale; Stripe ke webhooks bhi isi system mein aane chahiye.', answer: 'eb', explain: 'Content-based rule + SaaS → EventBridge.' },
      { s: '10 lakh IoT sensors har second reading bhejte hain; real-time dashboard aur ML model dono same data padhein, 7 din replay chahiye.', answer: 'kinesis', explain: 'Stream + multiple consumers + replay → Kinesis Data Streams.' },
      { s: 'Ek worker pool ko har account ki entries order mein lagaani hain. Worker payment aur payment ID ek saath save karta hai.', answer: 'sqsfifo', explain: 'Account ID ko FIFO group banao. Worker payment ko dobara lagaane se pehle uski saved ID jaanche.' },
      { s: 'On-prem Java app ActiveMQ (JMS) par hai; AWS par bina code change shift karna hai.', answer: 'mq', explain: 'JMS compatibility → Amazon MQ.' },
      { s: 'CloudWatch alarm fire ho toh on-call engineer ko SMS + email.', answer: 'sns', explain: 'Push notifications → SNS.' },
      { s: 'EC2 instance terminate hote hi Slack message jaaye.', answer: 'eb', explain: 'AWS service event (EC2 state change) → EventBridge rule → Lambda/API destination.' },
    ],
  },

  {
    id:'pixroutes',icon:'🔔',short:'PixShare routes',title:'Upload, inbox ya ghadi se kaam shuru hoga?',
    tldr:'Kaam kis cheez se shuru hota hai aur kitne consumers ko chahiye? Usse route chuno.',levels:['eventbridge'],start:'source',
    nodes:{
      source:{q:'Pehla signal kahan se aata hai?',why:'Queue ko padhna, event ko push karna aur time par call karna alag kaam hain.',
        options:[{t:'Time ya calendar se',next:'clock'},{t:'Pehle se bani queue ya stream se',next:'pipe'},{t:'App ek event publish karta hai',next:'publish'}]},
      publish:{q:'Consumers ka kaam kya hai?',why:'Notification aur chuni rule par archive replay ki zaroorat alag dekho.',
        options:[{t:'Email ya SMS alert bhi seedha chahiye',next:'topic'},{t:'Kai rules aur archived upload dobara chalana hai',next:'bus'}]},
      clock:{leaf:true,icon:'⏰',pick:'EventBridge Scheduler',one:'Calendar ya rate se target API chalao.',when:['Raat ka cleanup ya ek baar ka reminder'],avoid:['Har naye upload par action'],gotchas:['Timezone aur execution role milao.'],level:'eventbridge'},
      pipe:{leaf:true,icon:'🔧',pick:'EventBridge Pipe',one:'Ek source se poll karo. Filter aur optional lookup ke baad ek target bulao.',when:['SQS se Standard workflow'],avoid:['Kai services ko har job ki apni copy'],gotchas:['Unmatched SQS message queue se hat jaata hai.'],level:'eventbridge'},
      topic:{leaf:true,icon:'📣',pick:'SNS Standard',one:'Ek publish ko matching subscriptions tak push karo.',when:['Seedha SMS aur email alert'],avoid:['Classic bus ke rules par archive replay'],gotchas:['JSON body ya message attributes ka filter scope chuno.'],level:'eventbridge'},
      bus:{leaf:true,icon:'🔔',pick:'EventBridge Classic bus',one:'Har rule ka pattern dekho. Matching events ko us rule ke targets tak bhejo.',when:['Audit sab uploads le aur review sirf premium'],avoid:['Sirf raat ki ghadi se kaam shuru karna'],gotchas:['Target aur access bhi jodo. Replay original bus par aata hai.'],level:'eventbridge'}
    },scenarios:[
      {s:'PixShare ke app uploads ko audit aur review alag rules se padhenge. Bug fix par sirf review rule ko kal ke events chahiye.',answer:'bus',explain:'Classic archive se original bus par chuni rule aur window ko replay do.'},
      {s:'SQS inbox mein orders hain. Premium jobs mein customer lookup jodkar ek Standard workflow shuru karo.',answer:'pipe',explain:'Pipe SQS ko poll karta hai. Match ke baad enrichment aur async workflow target jodo.'},
      {s:'Har Sunday subah 3 baje Toronto time par thumbnail safai chahiye.',answer:'clock',explain:'Scheduler par timezone aur weekly cron do. Target ka execution role bhi set karo.'},
      {s:'Signup par support ko seedha SMS aur on-call ko email alert chahiye.',answer:'topic',explain:'SNS Standard topic se SMS aur confirmed email subscriptions tak alert bhejo.'},
      {s:'Customer ne Friday dopahar ek reminder maanga. Us waqt koi upload nahi hoga.',answer:'clock',explain:'Ek baar ke at schedule se target bulao. Event publish hone ka wait nahi chahiye.'},
      {s:'DynamoDB stream ki matching changes ek hi analytics target ko deni hain. Team polling ka code hataana chahti hai.',answer:'pipe',explain:'Stream source ko Pipe poll karega. Filter aur ek target ka route bana sakte ho.'}
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'sqstype',
    icon: '🔢',
    title: 'SQS configure kaise karun? — Standard vs FIFO, visibility timeout, DLQ',
    short: 'SQS setup',
    tldr: 'Default Standard + idempotent consumer + DLQ. FIFO sirf tab jab order zaroori ho. Visibility timeout worker ke max time se zyada.',
    levels: ['sqssns', 'messaging'],
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
      vis: { leaf: true, icon: '⏳', pick: 'Visibility timeout badhao (+ idempotency)', one: 'Message receive hote hi chhup jaata hai; timeout se pehle delete nahi hua toh wapas dikh jaata hai.', when: ['Worker ka processing time > visibility timeout (default 30 s)'], avoid: ['Timeout itna lamba ki crashed worker ka message ghanton atka rahe'], gotchas: ['Lambda validation minimum=function timeout; recommended visibility=6×timeout+batch window. Tune actual processing tail and concurrency.', 'Lambe kaam mein ChangeMessageVisibility se timeout extend karo', 'Business ka kaam aur uska asar idempotent hona chahiye; bahar ka kaam karne se pehle sirf ek conditional flag lagana, crash ke baad kaam kho sakta hai'], exam: '"messages processed more than once" → visibility timeout increase.', level: 'sqssns' },
      dlq: { leaf: true, icon: '☠️', pick: 'Dead-Letter Queue (redrive policy)', one: 'Bina delete kiye source ke saare receive attempts khatam → processing DLQ. Asli retry timing koi exact fixed deadline nahi.', when: ['Poison messages (bad JSON, missing field)'], avoid: ['DLQ banake bhool jaana — DLQ depth par CloudWatch alarm lagao'], gotchas: ['Inspect/repair then controlled redrive; retain original payload and monitor business outcomes. SNS delivery DLQ is separate.'], exam: '"messages that cannot be processed", "isolate failed messages" → DLQ.', level: 'sqssns' },
      fifo: { leaf: true, icon: '🔢', pick: 'FIFO queue + MessageGroupId', one: 'Per-group order; duplicate send ID is accepted but suppressed within 5 minutes, even after delete. No automatic external exactly-once effect.', when: ['Per-entity strict order (account, order id)'], avoid: ['Global order poore system mein (scale khatam) — group id choose karo'], gotchas: ['Standard queue ko FIFO mein convert nahi kar sakte — naya queue banao'], exam: '"FIFO", "order" → FIFO queue.', level: 'sqssns' },
      lp: { leaf: true, icon: '🎣', pick: 'Long polling — up to 20 s', one: 'Queue attribute ReceiveMessageWaitTimeSeconds = 20 sets the default; per-call WaitTimeSeconds can override. Call waits up to 20 s for work, returns earlier when work arrives.', when: ['Low-traffic queues jahan workers lagataar poll karte hain'], avoid: ['Worker ko har receive call turant wapas chahiye (UI thread jaisa) — tab WaitTimeSeconds chhota rakho'], gotchas: ['Short polling (0) sab servers se nahi poochta — false empty bhi de sakta hai', 'HTTP client timeout must exceed receive wait; polling is not initial delivery delay'], exam: '"reduce empty responses / cost" → long polling.', level: 'sqssns' },
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
          { t: 'Long/callback/auditable flow; reviewed idempotent workers and recovery contract', next: 'sfnstd' },
          { t: 'Chhote, idempotent, async event transforms, jahan caller ko turant result nahi chahiye', next: 'sfnexp' },
          { t: 'Single API call needs the completed result within 5 minutes', next: 'sfnsync' },
        ],
      },
      sfnstd: {
        leaf: true, icon: '🪜', pick: 'Step Functions — Standard workflow',
        one: 'Standard execution model, 1 saal tak, API history ke saath; saaf Retry aur bahar ke effects ko phir bhi idempotency/milaan chahiye.',
        when: ['Order saga: reserve inventory → charge payment → ship; fail par compensation', 'Human approval (callback task token)', 'ML pipeline, ETL with retries'],
        avoid: ['Eligible chhote, idempotent event flows Express mein fit ho sakte hain; sirf volume nahi, asli duration/memory/log/target ka kharcha compare karo'],
        gotchas: ['Retry only reviewed transient errors; Catch routes compensation/escalation. Unresolved failure must remain visible; Standard does not atomically include external payment', 'Payload limit 256 KB — badi cheez S3 mein, path pass karo'],
        cost: 'Approx us-east-1 $0.025/1000 billable transitions including retries, before allowances/other service costs.',
        exam: '"orchestrate multiple Lambda functions", "long-running", "human approval", "visual workflow" → Step Functions Standard.',
        iac: `"ReserveStock": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": {"FunctionName":"reserve-test", "Payload.$":"$"},
  "ResultPath":"$.reserve",
  "Catch":[{"ErrorEquals":["OutOfStock"],"ResultPath":"$.stockFailure","Next":"RefundTestPayment"}],
  "Next":"Ready"
}`,
        level: 'events',
      },
      sfnexp: {
        leaf: true, icon: '⚡', pick: 'Step Functions — Express workflow',
        one: 'Async Express: up to 5 minutes, at-least-once execution; request/duration/memory billing and configured logs.',
        when: ['IoT data transform per event', 'API backend orchestration jo seconds mein khatam'],
        avoid: ['Callback/job-run patterns, 5 minute se lamba workflow, ya bina review ka non-idempotent bahar ka kaam'],
        gotchas: ['History CloudWatch Logs mein (console mein Standard jaisa nahi)'],
        cost: 'Approx us-east-1 $1/million starts + tiered GB-s; 100ms/64MB billing increments, logs/targets separate. Eligibility and actual duration matter.',
        exam: '"high-volume, short-duration event processing workflows" → Express.',
        level: 'events',
      },
      sfnsync: {
        leaf:true,icon:'⚡',pick:'Step Functions — Sync Express',
        one:'StartSyncExecution Express ke result ka wait karta hai, 5 minute tak. At-most-once workflow execution caller/business ki idempotency nahi sambhalta.',
        when:['Jab ek API call ko chhote workflow ka poora result chahiye'],avoid:['Human callback or job-run integration; long execution'],
        gotchas:['HTTP success par bhi status/error/output dekho','Caller baar-baar start kare toh bahar ke results ke liye stable business identity/idempotency phir bhi chahiye','Use configured CloudWatch Logs; Standard GetExecutionHistory is not Express history'],
        cost:'Request + rounded duration/memory; include logs and target costs.',exam:'Single-call short orchestration result → Sync Express candidate.',level:'events'
      },
      chor: {
        leaf: true, icon: '💃', pick: 'Choreography (EventBridge events)',
        one: 'Har service event publish karti hai; doosri services rules se subscribe karke react karti hain.',
        when: ['Teams independent, naye consumers bina producer badle judne chahiye', 'Simple reactions (order placed → loyalty points)'],
        avoid: ['Lambi multi-step transaction jahan rollback chahiye — flow "kahan atka" pata karna mushkil'],
        gotchas: ['Correlation id har event mein rakho, warna debugging nightmare', 'Event schema registry se contract'],
        cost: 'Classic custom event lagbhag us-east-1 $1/million, 64KiB units mein; naya subscriber bus alag byte/retention meters use karta hai.',
        exam: '"loosely coupled", "event-driven", "add consumers without changing producer" → EventBridge choreography.',
        level: 'eventbridge',
      },
    },
    scenarios: [
      { s: 'Loan approval: documents check → credit score → manager ki manual approval (2 din tak) → disbursal.', answer: 'sfnstd', explain: 'Lamba + human approval → Standard workflow (task token).' },
      { s: 'Har IoT reading (5,000/second) par 3 chhote transform steps, har baar 200 ms.', answer: 'sfnexp', explain: 'Chhota, idempotent async event flow → Async Express candidate, at-least-once semantics aur naape hue poore kharche ke saath.' },
      { s: 'Order placed hone par loyalty, analytics aur recommendations teams apne-apne kaam karein; agle quarter 2 aur teams judengi.', answer: 'chor', explain: 'Independent consumers, easy to add → EventBridge choreography.' },
      { s: 'Ek API caller ko ek hi StartSyncExecution call mein 2 second ke idempotent workflow ke result ka wait karna hai.', answer:'sfnsync', explain:'Sync Express returns workflow result; inspect response status and retain business idempotency.' },
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
    levels: ['sqssns', 'logsetl', 'analytics'],
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
      fh: { leaf: true, icon: '🚒', pick: 'Amazon Data Firehose', one: 'Poori tarah managed delivery — buffer (size/time), optional Lambda transform, compression, Parquet conversion → destination.', when: ['Logs/clickstream → S3 data lake', 'CloudWatch Logs subscription → OpenSearch', 'Near real-time (seconds–minutes) kaafi hai'], avoid: ['Custom consumer logic / replay (Firehose replay nahi deta)', 'Sub-second latency'], gotchas: ['Buffer interval/size latency aur file size decide karta hai', 'Failed records ke liye S3 backup bucket set karo'], cost: 'Per GB ingested (~$0.029/GB first tier).', exam: '"load streaming data into S3/Redshift/OpenSearch", "near real-time", "no administration" → Firehose.', level: 'logsetl' },
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
