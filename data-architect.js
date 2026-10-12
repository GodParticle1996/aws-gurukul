/* =====================================================================
   AWS Gurukul — Track 4: 🧭 Architect (Nirnay Path)
   Decision-first: kaunsa service KAB, aur kab NAHI.
   Continuity: "PixShare" — ek photo/video startup jo MVP se global tak jaata hai.
   Har level ek service-category ka decision framework — matrix, trade-off,
   "kab NAHI" traps, aur ek scenario decision-tree.
   ===================================================================== */

AG.registerLevels('architect', [

  /* ================= LEVEL 1: Compute chuno ================= */
  {
    id: 'compute',
    icon: '🖥️',
    title: 'Compute Chuno — Lambda? Fargate? EC2?',
    badge: 'Compute Chintak',
    objectives: [
      '<b>Lambda vs Fargate vs ECS/EC2 vs Batch</b> — kaunsa kab',
      '<b>Serverless "hamesha sasta" myth</b> — break-even samjho',
      '<b>Kab NAHI Lambda</b>: &gt;15 min, steady heavy load, ultra-low latency',
      '<b>Graviton + Spot</b> — same workload, kam paisa',
    ],
    lesson: [
      `<h3>🧭 Sabse pehla decision: compute kya hoga</h3>
       <p>PixShare abhi MVP hai — ek photo-sharing app. Pehla sawal: code kahan
       chalega? AWS mein 5+ compute options hain aur log yahin confuse hote hain.
       Teen sawal poocho:</p>
       <ol>
         <li><b>Traffic spiky hai ya steady?</b> (spiky = idle time zyada)</li>
         <li><b>Kaam kitna lamba?</b> (seconds ka request, ya ghante ka job)</li>
         <li><b>Server manage karne ki fursat/zaroorat hai?</b> (patching, scaling)</li>
       </ol>
       <table>
         <tr><th>Service</th><th>Kab</th><th>Kab NAHI</th></tr>
         <tr><td><b>⚡ Lambda</b></td><td>event/spiky, &lt;15 min, idle&gt;0 (S3 upload trigger, API burst)</td><td>&gt;15 min, steady 24×7 heavy, &lt;10ms latency</td></tr>
         <tr><td><b>📦 Fargate</b></td><td>long-running container service, steady traffic, no node mgmt</td><td>GPU, super-high throughput, licensing</td></tr>
         <tr><td><b>🖥️ EC2/ASG</b></td><td>full control, GPU/special, always-on heavy</td><td>chhoti spiky cheez (over-provision waste)</td></tr>
         <tr><td><b>🧮 Batch+Spot</b></td><td>bulk offline jobs (thumbnails at night, ML)</td><td>real-time user-facing</td></tr>
       </table>`,
      `<h3>💰 "Serverless hamesha sasta" — sabse bada myth</h3>
       <p>Lambda pay-per-invocation hai: idle = <b>$0</b>. Isliye <b>spiky</b> ya
       <b>kam-traffic</b> par sasta. Par jab traffic <b>steady aur high</b> ho
       jaata hai, ek always-on Fargate/EC2 usse sasta pad sakta hai — kyunki
       tum har millisecond ka invocation bill de rahe ho.</p>
       <pre>Spiky / MVP / bursty     →  Lambda   (idle = $0, koi baseline cost nahi)
Steady 24×7 high load    →  Fargate/EC2  (Lambda ka per-invoke bill jama ho jaata)
                             (yahan "break-even" hota hai — utilization dekho)</pre>
       <p>💡 <b>Rule:</b> naya/uncertain workload = Lambda se shuru (sasta+fast to
       build). Traffic predictable aur high ho jaye → utilization naapo, aur agar
       hamesha busy hai toh Fargate/EC2 par shift karo. Yeh ek <b>decision</b> hai,
       dogma nahi.</p>`,
      `<h3>⚡ Graviton, Spot, aur "kab NAHI Lambda"</h3>
       <p>Do sasta-karne wale levers jo log bhool jaate hain:</p>
       <ul>
         <li>🦾 <b>Graviton (ARM)</b> — Lambda/Fargate/EC2 sab par ~20% sasta,
             aksar tez bhi. Naya kaam Graviton par shuru karo.</li>
         <li>🎰 <b>Spot</b> — ~70-90% sasta, par AWS 2-min notice pe wapas le sakta
             hai. Isliye <b>fault-tolerant / interruptible</b> kaam par (batch,
             thumbnails, CI, stateless ASG) — <b>na</b> ki ek single stateful DB par.</li>
       </ul>
       <div class="war-story"><b>⚡ Real trap:</b> Ek team ne video-transcoding
       (har video 20-40 min) ko Lambda par daal diya kyunki "serverless cool hai".
       Lambda ki max timeout <b>15 minute</b> hai — aadhe videos beech mein
       <code>Task timed out</code> ho jaate the, aur retries se bill aur badhta
       gaya. Fix: transcoding ko <b>AWS Batch + Spot</b> (ya Fargate task) par
       daala — koi timeout nahi, aur Spot se 70% sasta. <b>Sabak: compute ka
       pehla filter "kaam kitna lamba" hai — 15 min se upar Lambda option hi
       nahi hai.</b></div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Workload → sahi compute',
        instructions: 'Har PixShare workload ko sahi compute service mein daalo.',
        bins: [
          { id: 'lambda', label: '⚡ Lambda' },
          { id: 'fargate', label: '📦 Fargate' },
          { id: 'ec2', label: '🖥️ EC2' },
          { id: 'batch', label: '🧮 Batch + Spot' },
        ],
        items: [
          { text: 'S3 par photo upload hone par thumbnail banao (chhota, event-driven)', bin: 'lambda', explain: 'Event-driven + short = Lambda ka classic case. Idle par $0.' },
          { text: 'Raat ko poori library ka ML tagging (bulk, interruptible)', bin: 'batch', explain: 'Bulk offline + fault-tolerant = Batch + Spot, 70-90% sasta.' },
          { text: 'Main API jo 24×7 steady high traffic sambhalti hai', bin: 'fargate', explain: 'Long-running steady service, no node mgmt = Fargate. Lambda yahan mehnga padta.' },
          { text: '20-40 min ka video transcoding job', bin: 'batch', explain: 'Lambda ki 15-min limit cross — Batch/Fargate task. Spot se sasta.' },
          { text: 'GPU chahiye — real-time face detection model serving', bin: 'ec2', explain: 'Fargate GPU support karta hi NAHI — GPU ke liye EC2 (ya ECS/EKS on GPU EC2 instances). Steady GPU load par Savings Plan/RI lagao.' },
          { text: 'Legacy app jise specific OS-level tuning aur licensed software chahiye', bin: 'ec2', explain: 'Full OS control/licensing = EC2. Fargate mein OS access nahi.' },
          { text: 'Webhook jo din mein kabhi-kabhi 5 baar aata hai', bin: 'lambda', explain: 'Low/spiky traffic = Lambda. Ek EC2 iske liye 24×7 jalana pure waste.' },
          { text: 'Nightly report generation (10 min, roz ek baar)', bin: 'lambda', explain: '<15 min + scheduled = Lambda (EventBridge Scheduler se trigger). Batch tab jab hours lage.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Compute map par ungli rakho',
        instructions: 'Diagram mein sahi option par click karo.',
        visual: 'compute',
        questions: [
          { q: 'Spiky, event-driven, <15 min kaam — sabse pehla choice?', target: 'lambda', explain: 'Lambda — idle par $0, event triggers, fast to build. Naya/uncertain kaam yahin se.' },
          { q: 'Steady 24×7 container service, par node manage nahi karna — kaunsa?', target: 'fargate', explain: 'Fargate — serverless containers. Lambda yahan per-invoke bill se mehnga pad jaata.' },
          { q: 'Lambda ka deal-breaker (kab option hi nahi)?', target: 'lambdano', explain: '>15 min job, steady heavy load, ya ultra-low <10ms latency. Yeh teeno Lambda ko out kar dete hain.' },
          { q: 'GPU / special hardware / OS control chahiye — kahan jaoge?', target: 'ec2yes', explain: 'EC2 — full control. Reserved Instances/Savings Plans se steady GPU load sasta karo.' },
        ],
      },
      {
        type: 'incident',
        title: '🧩 Decision: PixShare MVP compute',
        instructions: 'Founder ne bola "launch karna hai". Sahi compute chuno — galat pick ka anjaam dekho.',
        pager: '<b>PixShare — Day 0</b><br>MVP launch karna hai: users photo upload karenge, thumbnail banega, feed dikhega. Traffic abhi <b>unpredictable aur kam</b> hoga (kuch hundred users). Team chhoti hai — koi dedicated ops nahi. Budget tight.',
        start: 'api',
        nodes: {
          api: {
            text: 'Pehla component: photo-upload + feed API. Kis par chalao?',
            choices: [
              { t: 'API Gateway + Lambda — spiky/low traffic, idle par $0, koi server manage nahi', good: true, next: 'thumb', explain: 'Bilkul sahi. MVP/uncertain traffic par serverless sabse sasta aur fastest-to-build hai.' },
              { t: 'Ek badi EC2 24×7 chalao — "simple hai"', good: false, explain: 'Kam traffic par woh EC2 zyadatar idle jalegi — paisa waste, aur patching/scaling tumhaare sar. MVP par over-kill.' },
              { t: 'EKS cluster (Kubernetes) khada karo', good: false, explain: 'Do log ki team ke liye EKS chalana pura din kha lega. Kubernetes ki complexity abhi zaroori nahi.' },
            ],
          },
          thumb: {
            sitrep: 'API serverless. Ab: har upload par ek 250×250 thumbnail banana hai (~1-2 sec ka kaam).',
            text: 'Thumbnail generation kaise?',
            choices: [
              { t: 'S3 upload event → Lambda jo thumbnail banaye', good: true, next: 'video', explain: 'Event-driven + short = Lambda ka perfect case. Upload hote hi trigger, idle par kuch nahi.' },
              { t: 'Ek EC2 jo har 5 min S3 poll kare aur naye photos process kare', good: false, explain: 'Polling = latency + 24×7 idle cost. Event-driven duniya mein poll anti-pattern hai.' },
              { t: 'Main API ke andar hi synchronously thumbnail banao', good: false, explain: 'Upload request slow ho jayegi aur API thread block. Yeh kaam async hona chahiye (agla level: decouple).' },
            ],
          },
          video: {
            sitrep: 'Thumbnails Lambda par. Founder: "Reels bhi add karte hain — 30 min tak ke videos, transcode karne padenge."',
            text: 'Video transcoding (20-40 min/job) kahan?',
            choices: [
              { t: 'AWS Batch (ya Fargate task) on Spot — long job, fault-tolerant, sasta', good: true, next: 'done', explain: 'Sahi. 15-min se lamba kaam Lambda mein aata hi nahi; Batch+Spot long + interruptible ke liye banaya gaya hai.' },
              { t: 'Lambda — "thumbnail bhi toh Lambda par hai"', good: false, explain: 'Lambda max 15 min. 30-min video beech mein Task timed out dega, aur retries bill badha denge. Yeh classic trap hai.' },
              { t: 'Main API ke Fargate service par hi transcode kar lo', good: false, explain: 'Bhaari CPU job user-facing API ko choke kar dega. Alag async worker chahiye, alag scaling ke saath.' },
            ],
          },
          done: {
            end: true,
            text: 'PixShare MVP live — sahi compute, minimum cost 🎉',
            summary: `<b>Kya seekha:</b>
              <ul>
                <li><b>API</b> (spiky/low) → <b>API Gateway + Lambda</b> — idle $0, fast to build.</li>
                <li><b>Thumbnail</b> (short, event-driven) → <b>Lambda</b> on S3 event.</li>
                <li><b>Video transcode</b> (long, interruptible) → <b>Batch/Fargate + Spot</b> — Lambda ki 15-min deewar ke bahar.</li>
              </ul>
              <b>Pattern:</b> pehle "kaam kitna lamba + kitna spiky" poocho, phir service chuno. MVP par default serverless — control/GPU/lamba-job aane par shift karo.`,
          },
        },
      },
      {
        type: 'quiz',
        title: 'Compute Decision Quick-fire',
        questions: [
          {
            q: 'Ek internal tool: din mein ~50 requests, har ek 200ms. Sabse cost-efficient?',
            choices: [
              'Lambda — itni kam traffic par 24×7 server jalana pure waste hai, idle par $0',
              'Ek t3.medium EC2 24×7',
              'EKS cluster',
              'Fargate service min 1 task always-on',
            ],
            answer: 0,
            explain: 'Low/spiky traffic ka poster child. Always-on compute (EC2/Fargate min-1) yahan zyadatar idle bill dega.',
          },
          {
            q: 'Ek API steady 24×7 ~2000 req/sec sambhalti hai. Team Lambda bill se pareshan hai. Ab?',
            choices: [
              'Fargate/EC2 par shift socho — steady high load par always-on compute per-invoke Lambda se sasta pad sakta hai (utilization naapo)',
              'Lambda memory badha do',
              'Aur Lambdas add karo',
              'Kuch nahi, serverless hamesha sasta hai',
            ],
            answer: 0,
            explain: '"Serverless hamesha sasta" myth. Steady-high par break-even cross ho jaata hai — always-on compute jeet-ta hai.',
          },
          {
            q: 'Nightly ML batch job (2 ghante), agar beech mein instance chhin jaye toh dobara chala sakte ho. Sabse sasta?',
            choices: [
              'AWS Batch / ASG on Spot instances — interruptible kaam par 70-90% saving',
              'On-Demand EC2',
              'Reserved Instances',
              'Lambda',
            ],
            answer: 0,
            explain: 'Fault-tolerant + interruptible = Spot ka ideal case. Lambda 15-min limit se bahar; On-Demand/RI mehnge.',
          },
          {
            q: 'Naya microservice, container mein hai, traffic predictable-steady. Team ko servers manage nahi karne. Kaunsa?',
            choices: [
              'Fargate — serverless containers, no node patching/scaling, steady service ke liye theek',
              'Lambda (container image)',
              'EC2 khud manage karo',
              'EKS with self-managed nodes',
            ],
            answer: 0,
            explain: 'Container + steady + no-ops = Fargate. Lambda short/spiky ke liye; EC2/EKS-nodes tab jab control/scale ki khaas zaroorat ho.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Compute Selection',
      instructions: 'Architecture round — "kyun" bolna zaroori hai. 🎤',
      questions: [
        {
          q: '"Ek naya feature bana rahe ho, traffic ka andaza nahi. Compute kya chunoge aur kyun?"',
          choices: [
            'Lambda se shuru — serverless par idle cost $0, fastest to build, aur traffic samajh aane par utilization dekh ke Fargate/EC2 par shift kar sakta hoon',
            'Sabse badi EC2 — safe rahega',
            'EKS — future-proof',
            'Jo team ko aata hai wahi',
          ],
          answer: 0,
          explain: 'Uncertain traffic par serverless default hai: no baseline cost + fast iteration. Aur "shift later" bolna maturity dikhata hai.',
        },
        {
          q: 'Interviewer: "Serverless hamesha sasta hota hai — sahi ya galat?"',
          choices: [
            'Galat — Lambda spiky/idle par sasta, par steady-high sustained load par per-invoke bill jama ho ke always-on Fargate/EC2 se mehnga pad sakta hai. Utilization se decide karo',
            'Sahi, hamesha sasta',
            'Sahi, kyunki servers nahi',
            'Depend karta hai region par',
          ],
          answer: 0,
          explain: 'Yeh sabse common misconception hai. Achha jawab break-even/utilization ka zikr karta hai.',
        },
        {
          q: '🎛️ Interviewer: "Account mein compute inspect karke batao ye setup theek hai ya nahi."',
          terminal: {
            title: 'Interview hands-on — compute audit',
            goal: '🎛️ <b>Hands-on:</b> PixShare account mein compute dekho. <b>(1)</b> <code>aws lambda list-functions</code> — kaunse functions hain, memory/timeout kya. <b>(2)</b> <code>aws ec2 describe-instances</code> — koi badi instance idle toh nahi. <b>(3)</b> <code>aws lambda get-function --function-name video-transcode</code> — iska timeout dekho (video job Lambda par galat jagah hai!).',
            tasks: [
              { text: 'aws lambda list-functions', check: s => s.history.some(h => /aws lambda list-functions/.test(h)) },
              { text: 'aws ec2 describe-instances', check: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) },
              { text: 'aws lambda get-function --function-name video-transcode', check: s => s.history.some(h => /aws lambda get-function.*video-transcode/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              lambdas: [
                { name: 'photo-thumbnail', runtime: 'nodejs20.x', handler: 'index.handler', state: 'Active', memory: 512, timeout: 30 },
                { name: 'feed-api', runtime: 'nodejs20.x', handler: 'app.handler', state: 'Active', memory: 1024, timeout: 29 },
                { name: 'video-transcode', runtime: 'python3.12', handler: 'app.run', state: 'Active', memory: 3008, timeout: 900 },
              ],
              instances: [
                { id: 'i-0build01', name: 'legacy-batch-box', type: 'm5.2xlarge', state: 'running', az: 'us-east-1a', vpcId: 'vpc-pix', subnetId: 'subnet-a', sgIds: ['sg-1'], publicIp: null, privateIp: '10.0.1.9' },
              ],
            },
            success: s => s.history.some(h => /aws lambda list-functions/.test(h))
              && s.history.some(h => /aws ec2 describe-instances/.test(h))
              && s.history.some(h => /aws lambda get-function.*video-transcode/.test(h)),
            successText: '✅ Do red flags mile: <code>video-transcode</code> Lambda ka timeout <b>900s (15 min max)</b> hai — 30-min videos yahan fail honge, ise Batch/Fargate par le jao. Aur <code>legacy-batch-box</code> (m5.2xlarge) 24×7 running hai — agar woh sirf raat ko chalti hai toh Spot/Batch par shift karke bahut bacha sakte ho. <b>Compute audit ka matlab yehi hai: har workload ka shape uske service se match karta hai ya nahi.</b>',
            hints: [
              'aws lambda list-functions',
              'aws ec2 describe-instances',
              'aws lambda get-function --function-name video-transcode',
            ],
          },
        },
      ],
    },
    success: [
      'Main Lambda / Fargate / EC2 / Batch mein sahi choice justify kar sakta hoon',
      'Main "serverless hamesha sasta" myth ko break-even se refute kar sakta hoon',
      'Main jaanta hoon kab Lambda option hi nahi (>15 min, steady heavy, ultra-low latency)',
      'Main Graviton aur Spot ka sahi use-case bata sakta hoon',
    ],
    homework: `<p>Free Tier par khud dekho (chhota rakho):</p>
      <pre># Lambda banao, timeout dekho (max 900s = 15 min)
aws lambda create-function --function-name demo --runtime python3.12 \\
  --handler app.h --zip-file fileb://f.zip --role <role-arn> --timeout 900
# ...15 min se lamba job? Lambda option hi nahi.

# Graviton (arm64) chun ke ~20% bachao:
#   Lambda: --architectures arm64
#   Fargate: runtimePlatform cpuArchitecture ARM64
#   EC2: t4g/m7g/c7g instance family

# Spot dekho (fault-tolerant load ke liye):
aws ec2 describe-spot-price-history --instance-types m5.large \\
  --product-descriptions "Linux/UNIX" --max-items 3
# On-Demand se compare karo — 70%+ sasta dikhega</pre>
      <p>✅ Self-check: Lambda ka max timeout confirm kiya (900s)? Graviton price farak dekha? Spot vs On-Demand ka gap dikha?</p>`,
    cards: [
      { front: 'Compute ke 3 decision sawal?', back: '1) Traffic <b>spiky ya steady</b>? 2) Kaam kitna <b>lamba</b>? 3) Server manage karne ki <b>zaroorat/fursat</b>? Inse Lambda/Fargate/EC2/Batch nikalta hai.' },
      { front: 'Lambda kab NAHI?', back: '<b>&gt;15 min</b> job, <b>steady 24×7 heavy</b> load (per-invoke bill mehnga), ya <b>ultra-low &lt;10ms</b> latency chahiye. In teeno mein Lambda option hi nahi.' },
      { front: '"Serverless hamesha sasta" — sach?', back: '<b>Nahi.</b> Lambda spiky/idle par sasta (idle=$0); steady-high sustained load par always-on Fargate/EC2 sasta pad jaata hai. Utilization se decide karo.' },
      { front: 'Graviton kya deta hai?', back: 'ARM-based — Lambda/Fargate/EC2 sab par <b>~20% sasta</b> (aksar tez bhi). Naya kaam Graviton (arm64 / t4g/m7g) par shuru karo.' },
      { front: 'Spot kab (aur kab nahi)?', back: '<b>Fault-tolerant / interruptible</b> kaam par — batch, thumbnails, stateless ASG (~70-90% sasta). AWS 2-min notice pe wapas le sakta hai, isliye <b>single stateful</b> cheez par kabhi nahi.' },
    ],
  },

  /* ================= LEVEL 2: Data store chuno ================= */
  {
    id: 'datastore',
    icon: '🗄️',
    title: 'Data Store Chuno — SQL? NoSQL? Cache? Warehouse?',
    badge: 'Data Shape Darshi',
    objectives: [
      '<b>RDS/Aurora vs DynamoDB vs ElastiCache vs Redshift/Athena vs S3</b>',
      '<b>Data ka shape</b> decide karta hai, service ki popularity nahi',
      '<b>Kab NAHI DynamoDB</b> (ad-hoc/analytical), <b>kab NAHI RDS</b> (massive KV scale)',
      '<b>Polyglot persistence</b> — ek app, kai stores',
    ],
    lesson: [
      `<h3>🧭 "Sab DynamoDB" aur "sab RDS" — dono galat</h3>
       <p>PixShare badh raha hai. Ab data kahan rakhein? Sabse badi galti: ek hi
       DB mein sab thoos dena. <b>Data ka shape aur access pattern</b> service
       chunta hai:</p>
       <table>
         <tr><th>Data / need</th><th>Service</th><th>Kyun</th></tr>
         <tr><td>Photos, videos, media</td><td><b>🪣 S3</b></td><td>object storage — cheap, durable, unlimited. <b>DB nahi.</b></td></tr>
         <tr><td>User accounts, orders, joins/transactions</td><td><b>🗄️ RDS/Aurora</b></td><td>relational — ACID, complex queries, joins</td></tr>
         <tr><td>Feed/likes/sessions — known key, massive scale, ms latency</td><td><b>🔑 DynamoDB</b></td><td>key-value NoSQL — predictable single-digit ms at any scale</td></tr>
         <tr><td>Hot reads (trending feed) DB ko bachao</td><td><b>⚡ ElastiCache/DAX</b></td><td>in-memory cache — sub-ms, DB load kam</td></tr>
         <tr><td>Analytics/BI, bade scans, reporting</td><td><b>📊 Redshift / Athena</b></td><td>columnar warehouse / S3 par SQL — OLAP</td></tr>
       </table>
       <p>💡 <b>OLTP ≠ OLAP.</b> Transactions (orders, likes) = OLTP (RDS/DynamoDB).
       Analytics (kitne users per city per month) = OLAP (Redshift/Athena). Ek
       ke liye doosra use karoge toh dard hoga.</p>`,
      `<h3>🔑 DynamoDB — powerful, par jab access pattern pata ho</h3>
       <p>DynamoDB kisi bhi scale par single-digit ms deta hai — <b>agar</b> tum
       key se access karo. Yeh "known access pattern" par design hota hai: partition
       key + sort key ko pehle se soch ke banate ho.</p>
       <pre>✅ DynamoDB: "user X ka feed do", "session token se lookup" (key pata hai)
❌ DynamoDB: "pichhle mahine har city ke top 10 photographers" (ad-hoc scan)
   → yeh full-table scan hai = mehnga + slow. Yeh Athena/Redshift ka kaam.</pre>
       <p>⚠️ <b>Kab NAHI DynamoDB:</b> ad-hoc queries, joins, aggregations,
       reporting. Wahan relational ya warehouse chahiye. DynamoDB ko "sasta scale"
       samajh ke analytics thoosna sabse common mahenga bug hai.</p>
       <p>⚠️ <b>Kab NAHI RDS:</b> jab tumhe internet-scale key-value chahiye
       (billions of items, unpredictable spikes) aur relational features (joins)
       ki zaroorat nahi — wahan DynamoDB fit hai, RDS scale par tootega.</p>`,
      `<h3>🍱 Polyglot persistence — ek app, kai stores</h3>
       <p>Ek achhi architecture aksar 3-4 data stores use karti hai — har ek apne
       kaam ke liye:</p>
       <pre>PixShare:
  🪣 S3           → photos/videos (raw media)
  🗄️ Aurora       → users, follows, comments (relational, joins)
  🔑 DynamoDB     → feed timeline, likes, sessions (KV, massive scale)
  ⚡ ElastiCache  → trending feed cache (hot reads, sub-ms)
  📊 Athena/Redshift → analytics (kaunsa content viral, per-region)</pre>
       <div class="war-story"><b>⚡ Real trap:</b> Ek team ne poora product
       DynamoDB par banaya kyunki "scale karta hai". 6 mahine baad management ne
       poocha "har week ke top creators per country dikhao". DynamoDB mein yeh
       query <b>possible hi nahi</b> thi bina poori table scan kiye — jo ghante
       leta aur hazaaron dollar ka read cost. Unhe DynamoDB Streams se data
       <b>S3 par pipe</b> karke <b>Athena</b> se analytics chalani padi (retrofit).
       <b>Sabak: DynamoDB transactional access ke liye hai; analytical questions
       ke liye pehle din se S3+Athena/Redshift ka rasta rakho.</b></div>`,
    ],
    stages: [
      {
        type: 'match',
        title: 'Need → sahi data store',
        instructions: 'Har requirement ko sabse fit store se jodo.',
        pairs: [
          { left: '🖼️ Raw photos/videos store', right: 'S3 — object storage, cheap+durable', explain: 'Media DB mein nahi jaata. S3 unlimited, cheap, 11-nines durable.' },
          { left: '👥 Users, follows, comments (joins)', right: 'RDS / Aurora — relational + ACID', explain: 'Rishtey aur transactions = relational. Aurora = MySQL/PG compat, auto-scale storage.' },
          { left: '📰 Feed timeline / likes at massive scale (key se)', right: 'DynamoDB — key-value, single-digit ms', explain: 'Known key access + huge scale = DynamoDB. Predictable latency.' },
          { left: '🔥 Trending feed hot reads, DB relief', right: 'ElastiCache (Redis) — in-memory sub-ms', explain: 'Read-heavy hot data cache karo. DAX = DynamoDB ka cache.' },
          { left: '📈 "Per city per month active users" (BI)', right: 'Redshift / Athena — OLAP warehouse', explain: 'Ad-hoc analytical scans = columnar warehouse. Athena = S3 par serverless SQL.' },
          { left: '🔎 Full-text photo caption search', right: 'OpenSearch — search engine', explain: 'Full-text/relevance search DB ka kaam nahi. (Agla track: log analytics bhi OpenSearch.)' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Data store map par ungli rakho',
        instructions: 'Diagram mein sahi store par click karo.',
        visual: 'datastore',
        questions: [
          { q: 'Joins, transactions, complex queries — kaunsa?', target: 'rds', explain: 'RDS/Aurora — relational. Rishtey aur ACID chahiye toh yahan.' },
          { q: 'Ad-hoc analytical queries ke liye DynamoDB kyun galat hai?', target: 'dynamono', explain: 'DynamoDB known-key access ke liye; ad-hoc scan = full-table = slow+mehnga. Warehouse chahiye.' },
          { q: 'Hot reads se DB ko bachane ke liye?', target: 'cache', explain: 'ElastiCache/DAX — in-memory sub-ms. Read-heavy load DB tak pahunchne se pehle cache se serve.' },
          { q: 'Media/objects rakhne ke liye (yeh DB nahi hai)?', target: 's3', explain: 'S3 — object storage. Photos/videos yahan; DB mein sirf unka metadata/URL.' },
        ],
      },
      {
        type: 'bins',
        title: 'OLTP ya OLAP?',
        instructions: 'Har query ko sahi kism mein daalo — isse store ka choice nikalta hai.',
        bins: [
          { id: 'oltp', label: '⚡ OLTP (transactional)' },
          { id: 'olap', label: '📊 OLAP (analytical)' },
        ],
        items: [
          { text: '"User 42 ka feed do" (single user, abhi)', bin: 'oltp', explain: 'Point lookup by key = OLTP. DynamoDB/RDS.' },
          { text: '"Pichhle quarter har region ki growth rate"', bin: 'olap', explain: 'Bade scans + aggregation across time = OLAP. Redshift/Athena.' },
          { text: '"Is post par like +1 karo"', bin: 'oltp', explain: 'Single-row write = OLTP.' },
          { text: '"Top 100 viral posts all-time, category-wise"', bin: 'olap', explain: 'Full-dataset analytical query = OLAP.' },
          { text: '"Order place karo (stock decrement + payment)"', bin: 'oltp', explain: 'Transaction = OLTP. RDS/Aurora with ACID.' },
          { text: '"Monthly revenue dashboard by product line"', bin: 'olap', explain: 'Reporting/BI = OLAP warehouse.' },
        ],
      },
      {
        type: 'incident',
        title: '🧩 Decision: PixShare data layer',
        instructions: 'App scale kar rahi hai. Har data need ke liye sahi store chuno.',
        pager: '<b>PixShare — 500K users</b><br>Ab decide karna hai: photos kahan, user-graph kahan, feed kahan, aur "trending content" analytics kahan. Ek galat pick 6 mahine baad retrofit banata hai.',
        start: 'media',
        nodes: {
          media: {
            text: 'Photos/videos (petabytes aane wale) kahan?',
            choices: [
              { t: 'S3 — object storage, cheap+durable; DB mein sirf metadata/URL', good: true, next: 'graph', explain: 'Media hamesha S3. DB mein blob daalna mehnga + slow; wahan sirf key/URL rakho.' },
              { t: 'RDS mein BLOB column mein daal do', good: false, explain: 'DB mein large binaries = mehnga storage, bloated backups, slow queries. S3 iske liye bana hai.' },
              { t: 'DynamoDB item mein base64 karke', good: false, explain: 'DynamoDB item max 400KB — photo/video fit hi nahi hoga, aur mehnga.' },
            ],
          },
          graph: {
            sitrep: 'Media S3 par. Ab user accounts, follows, comments — inme rishtey aur joins hain.',
            text: 'User-graph + comments kahan?',
            choices: [
              { t: 'Aurora (relational) — joins, transactions, foreign keys', good: true, next: 'feed', explain: 'Rishtey + ACID = relational. Aurora scale bhi karta hai (read replicas, auto storage).' },
              { t: 'Sab DynamoDB — "scale karta hai"', good: false, explain: 'Follows/comments mein joins aur ad-hoc queries aayenge — DynamoDB par yeh dard ban jaata hai. Relational chahiye.' },
              { t: 'Ek badi Redshift table', good: false, explain: 'Redshift OLAP warehouse hai, transactional user writes ke liye nahi. Galat tool.' },
            ],
          },
          feed: {
            sitrep: 'User-graph Aurora par. Feed timeline ko har scroll par ms-latency chahiye, aur reads bahut zyada.',
            text: 'Feed timeline + trending cache?',
            choices: [
              { t: 'DynamoDB (feed items, key = userId) + ElastiCache (trending hot reads)', good: true, next: 'analytics', explain: 'Known-key massive-scale reads = DynamoDB; trending hot data cache = ElastiCache. Aurora ko relief.' },
              { t: 'Har feed request par Aurora ko hit karo', good: false, explain: 'High-read feed Aurora ko choke karega. Feed ka access pattern KV+cache ke liye perfect hai.' },
              { t: 'Athena se feed banao', good: false, explain: 'Athena analytical/batch hai (seconds+), per-request feed ke liye nahi. Latency galat.' },
            ],
          },
          analytics: {
            sitrep: 'Feed fast. Management: "har week per-country top creators aur viral content chahiye." Yeh ad-hoc analytical hai.',
            text: 'Analytics kahan chalao?',
            choices: [
              { t: 'DynamoDB/Aurora ka data S3 mein land karo, Athena/Redshift se query', good: true, next: 'done', explain: 'Analytical questions = warehouse. OLTP stores ko scan karke mat maaro; data lake (S3) + Athena/Redshift use karo.' },
              { t: 'DynamoDB par hi scan karke nikaal lo', good: false, explain: 'Full-table scan = ghante + hazaaron $ read cost, aur production latency par asar. Yeh DynamoDB ka anti-pattern hai.' },
              { t: 'Aurora par heavy analytical query roz raat ko', good: false, explain: 'Bhaari OLAP query OLTP DB par production ko slow karti hai. Alag warehouse/replica chahiye.' },
            ],
          },
          done: {
            end: true,
            text: 'PixShare data layer — polyglot, har store apne kaam par 🎉',
            summary: `<b>Kya seekha:</b>
              <ul>
                <li><b>Media</b> → S3 (DB nahi). <b>User-graph</b> → Aurora (joins/ACID).</li>
                <li><b>Feed</b> → DynamoDB (key-based massive scale) + <b>ElastiCache</b> (hot reads).</li>
                <li><b>Analytics</b> → S3 data lake + <b>Athena/Redshift</b> (OLAP, alag se).</li>
              </ul>
              <b>Pattern:</b> ek app = kai stores (polyglot). "Sab DynamoDB" / "sab RDS" dono galat. Data ka <b>shape + access pattern</b> service chunta hai, aur <b>OLTP alag, OLAP alag</b>.`,
          },
        },
      },
    ],
    interview: {
      title: 'Interview Round — Data Store Selection',
      instructions: 'Data design round. 🎤',
      questions: [
        {
          q: '"DynamoDB kab NAHI use karoge?"',
          choices: [
            'Jab ad-hoc/analytical queries, joins, ya aggregations chahiye — DynamoDB known-key access ke liye hai; wahan full scan mehnga+slow hai, warehouse (Athena/Redshift) ya relational chahiye',
            'Kabhi nahi, DynamoDB har jagah best',
            'Sirf jab data chhota ho',
            'Jab budget kam ho',
          ],
          answer: 0,
          explain: 'DynamoDB ka boundary "known access pattern" hai. Ad-hoc analytics uske bahar — yeh interview ka favourite hai.',
        },
        {
          q: 'Interviewer: "Ek media-heavy app — photos kahan store karoge aur DB mein kya?"',
          choices: [
            'Photos S3 mein (object storage), DB mein sirf metadata + S3 key/URL — media kabhi DB blob mein nahi',
            'Sab RDS BLOB column mein',
            'DynamoDB item mein base64',
            'EFS par sab',
          ],
          answer: 0,
          explain: 'Classic separation: bytes S3 mein, pointers DB mein. DB mein large binaries = mehnga + slow backups.',
        },
        {
          q: '🎛️ Interviewer: "Account ka data layer inspect karke galtiyan batao."',
          terminal: {
            title: 'Interview hands-on — data audit',
            goal: '🎛️ <b>Hands-on:</b> <b>(1)</b> <code>aws s3 ls</code> — media buckets. <b>(2)</b> <code>aws rds describe-db-instances</code> — relational kya chal raha, Multi-AZ hai? <b>(3)</b> <code>aws dynamodb list-tables</code> aur <code>aws dynamodb describe-table --table-name analytics-events</code> — dekho koi table analytics ke liye galat use toh nahi ho rahi.',
            tasks: [
              { text: 'aws s3 ls — media buckets', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
              { text: 'aws rds describe-db-instances', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
              { text: 'aws dynamodb describe-table --table-name analytics-events', check: s => s.history.some(h => /aws dynamodb describe-table.*analytics-events/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              buckets: [
                { name: 'pixshare-media', region: 'us-east-1', encryption: true, creationDate: '2026-01-10 09:00:00' },
                { name: 'pixshare-datalake', region: 'us-east-1', encryption: true, creationDate: '2026-03-02 09:00:00' },
              ],
              rds: [
                { id: 'pixshare-aurora', name: 'pixshare-aurora', engine: 'aurora-postgresql', class: 'db.r6g.large', state: 'available', multiAZ: true, endpoint: 'pixshare-aurora.cluster-x.us-east-1.rds.amazonaws.com', storage: 100 },
              ],
              tables: [
                { name: 'feed', partitionKey: 'userId', sortKey: 'postId', rcu: 100, wcu: 50, items: [] },
                { name: 'analytics-events', partitionKey: 'eventId', rcu: 5, wcu: 200, items: [{ eventId: 'e1', type: 'view', country: 'IN' }] },
              ],
            },
            success: s => s.history.some(h => /aws s3 ls\b/.test(h))
              && s.history.some(h => /aws rds describe-db-instances/.test(h))
              && s.history.some(h => /aws dynamodb describe-table.*analytics-events/.test(h)),
            successText: '✅ Achhe signs aur ek smell: media <code>pixshare-media</code> S3 par ✅, Aurora Multi-AZ ✅, <code>pixshare-datalake</code> bucket analytics ke liye ready ✅. Par <code>analytics-events</code> DynamoDB table ka naam batata hai ki analytical events wahan ja rahe hain — agar log iss par ad-hoc "per-country" queries chala rahe hain, woh full scan hai. Behtar: yeh events S3 datalake mein land karo aur <b>Athena</b> se query karo. <b>Naming se anti-pattern pakad lena — "analytics" + DynamoDB = shak.</b>',
            hints: [
              'aws s3 ls',
              'aws rds describe-db-instances',
              'aws dynamodb list-tables   phir   aws dynamodb describe-table --table-name analytics-events',
            ],
          },
        },
      ],
    },
    success: [
      'Main data ke shape/access-pattern se sahi store chun sakta hoon',
      'Main OLTP vs OLAP ka farak aur alag tools bata sakta hoon',
      'Main jaanta hoon kab DynamoDB NAHI (ad-hoc/analytical) aur kab RDS NAHI (internet-scale KV)',
      'Main polyglot persistence (ek app, kai stores) design kar sakta hoon',
    ],
    homework: `<p>Free Tier par shapes chakho:</p>
      <pre># S3 media + metadata pattern
aws s3 mb s3://myapp-media-demo
# ...file S3 mein, DB mein sirf key store karo (blob DB mein nahi)

# DynamoDB known-key vs scan ka farak
aws dynamodb create-table --table-name feed \\
  --attribute-definitions AttributeName=userId,AttributeType=S \\
  --key-schema AttributeName=userId,KeyType=HASH \\
  --billing-mode PAY_PER_REQUEST
# get-item (fast, cheap) vs scan (slow, mehnga) ko compare karo

# S3 par Athena — analytical SQL bina server:
#   Glue crawler → table → Athena query (SELECT country, COUNT(*) ...)
#   Yeh DynamoDB scan se sasta+tez analytics ke liye

# OLTP par heavy analytics ka dard:
#   RDS par ek bada GROUP BY chala ke dekho latency — production ko slow karta hai</pre>
      <p>✅ Self-check: get-item vs scan ka cost/latency farak samjha? Athena se S3 par SQL chalaya? Yaad rakha ki media S3, pointer DB?</p>`,
    cards: [
      { front: 'Data store kaise chunte hain?', back: 'Data ke <b>shape + access pattern</b> se — service ki popularity se nahi. Media=S3, joins/ACID=RDS/Aurora, known-key massive-scale=DynamoDB, hot reads=ElastiCache, analytics=Redshift/Athena.' },
      { front: 'OLTP vs OLAP?', back: '<b>OLTP</b> = transactional (point reads/writes: order, like) → RDS/DynamoDB. <b>OLAP</b> = analytical (bade scans/aggregations: monthly BI) → Redshift/Athena. Ek ke liye doosra = dard.' },
      { front: 'DynamoDB kab NAHI?', back: 'Ad-hoc queries, joins, aggregations, reporting. Woh known-key access ke liye hai; analytics wahan full-table scan = slow+mehnga. Data ko S3+Athena/Redshift par le jao.' },
      { front: 'Media DB mein kyun nahi?', back: 'Large binaries DB mein = mehnga storage, bloated slow backups, slow queries. <b>Bytes S3 mein, DB mein sirf metadata + S3 key/URL.</b>' },
      { front: 'Polyglot persistence?', back: 'Ek app aksar 3-4 stores use karti hai — har ek apne kaam par (S3+Aurora+DynamoDB+ElastiCache+Athena). "Sab ek DB" ek anti-pattern hai.' },
    ],
  },

  /* ================= LEVEL 3: Messaging & Decoupling ================= */
  {
    id: 'messaging',
    icon: '📨',
    title: 'Decouple Kaise — SQS? SNS? Kinesis? Step Functions?',
    badge: 'Decoupling Darvesh',
    objectives: [
      '<b>SQS vs SNS vs Kinesis vs Step Functions</b> — kaunsa kab',
      '<b>Sync ko async</b> banao — resilience + speed',
      '<b>Queue vs pub/sub vs stream</b> ka farak',
      '<b>Kab NAHI</b>: SQS for ordered replay, SNS for buffering, Kinesis for simple job',
    ],
    lesson: [
      `<h3>🧭 Decoupling — ek component gire toh baaki chale</h3>
       <p>PixShare mein photo upload par bahut kuch hota hai: thumbnail, notify
       followers, update feed, analytics. Agar yeh sab <b>synchronously</b> API
       request ke andar ho, toh: upload slow, aur koi ek step gira (notify service
       down) toh <b>poora upload fail</b>. Ilaaj: <b>decouple</b> — kaam ko message
       ke through async karo.</p>
       <table>
         <tr><th>Service</th><th>Kya</th><th>Kab</th></tr>
         <tr><td><b>📨 SQS</b></td><td>queue — ek consumer group kaam uthata hai</td><td>buffer + retry, kaam ek baar ho (thumbnail job)</td></tr>
         <tr><td><b>📢 SNS</b></td><td>pub/sub — ek message, N subscribers (push)</td><td>fan-out: ek event, kai reactions (notify + analytics + feed)</td></tr>
         <tr><td><b>🌊 Kinesis</b></td><td>ordered, replayable stream — kai readers same data</td><td>clickstream/IoT, ordering + replay chahiye</td></tr>
         <tr><td><b>🪜 Step Functions</b></td><td>workflow orchestration, retry/catch</td><td>multi-step process with rollback (order → pay → ship)</td></tr>
       </table>`,
      `<h3>🍟 SNS + SQS fan-out — sabse kaam ka combo</h3>
       <p>"Ek event, kai independent reactions" ka classic pattern: SNS topic par
       publish, aur har reaction ki apni SQS queue subscribe. Har consumer apni
       raftaar se, apna retry, ek dusre se independent:</p>
       <pre>photo-uploaded → SNS topic
                   ├─→ SQS: thumbnail-queue   → thumbnail Lambda
                   ├─→ SQS: notify-queue      → notification service
                   └─→ SQS: analytics-queue   → analytics writer</pre>
       <p>💡 Sirf SNS (bina SQS) use karoge toh consumer down hone par message
       <b>kho</b> sakta hai (SNS push karta hai, hold nahi karta). SQS beech mein
       daalne se message <b>buffer</b> ho jaata hai — consumer wapas aake process
       kar leta hai. <b>Fan-out + durability = SNS→SQS.</b></p>
       <p>⚠️ <b>Kab NAHI:</b></p>
       <ul>
         <li>Sirf <b>SQS</b> jab ordering/replay chahiye — SQS standard order guarantee nahi deta (FIFO alag hai, limited throughput). Wahan Kinesis.</li>
         <li>Sirf <b>SNS</b> jab consumer ko buffer chahiye — SNS hold nahi karta. Beech mein SQS.</li>
         <li><b>Kinesis</b> jab kaam ek simple background job hai — Kinesis (shards, replay) over-engineering. SQS kaafi.</li>
       </ul>`,
      `<h3>🪜 Orchestration vs Choreography</h3>
       <p>Multi-step process do tarah se ho sakta hai:</p>
       <ul>
         <li>🎭 <b>Choreography</b> (events) — har service event sun ke react karta
             hai (SNS/EventBridge). Loosely coupled, par poora flow trace karna
             mushkil.</li>
         <li>🎬 <b>Orchestration</b> (Step Functions) — ek central "conductor"
             steps ko order mein chalata hai, retry/catch/rollback sambhalta hai.
             Flow saaf dikhta hai.</li>
       </ul>
       <p>💡 "Order place → payment → inventory → ship" jaisa <b>transaction jisme
       rollback chahiye</b> = Step Functions. "Photo uploaded → 5 independent
       reactions" = fan-out events.</p>
       <div class="war-story"><b>⚡ Real trap:</b> PixShare ne notifications ko
       upload API ke andar synchronous rakha. Ek din notification provider (3rd
       party) slow ho gaya — har upload 8-10 sec lene laga, aur users ko lagta app
       hang hai. Uploads gir-ne lage kyunki API timeout ho rahi thi. Fix:
       notification ko <b>SNS→SQS</b> ke peeche async kar diya — ab upload turant
       200 deta hai, notification apne queue se background mein jaata hai, aur
       provider slow ho toh queue mein wait karta hai (upload par koi asar nahi).
       <b>Sabak: user-facing request ke andar sirf woh rakho jo turant chahiye;
       baaki sab async decouple karo.</b></div>`,
    ],
    stages: [
      {
        type: 'match',
        title: 'Messaging service → uska role',
        instructions: 'Har service ko uske sahi kaam se jodo.',
        pairs: [
          { left: '📨 SQS', right: 'Buffer + retry — ek consumer group poll karke kaam uthata hai', explain: 'Queue. Consumer down = messages safe wait karte hain. Background jobs ka default.' },
          { left: '📢 SNS', right: 'Fan-out — ek publish, N subscribers ko push', explain: 'Pub/sub. Ek event ke kai independent reactions. Durability chahiye toh peeche SQS.' },
          { left: '🌊 Kinesis', right: 'Ordered, replayable stream — kai consumers same data padh sakte', explain: 'Clickstream/IoT, ordering + replay. Ek record kai analytics apps padhti hain.' },
          { left: '🪜 Step Functions', right: 'Multi-step workflow with retry/catch + rollback', explain: 'Orchestration. "Order→pay→ship" jaisa transaction with compensation.' },
          { left: '🔔 EventBridge', right: 'Content-based event router (AWS/SaaS events, rules)', explain: 'Many-to-many event bus with pattern filtering. Agla level iske baare mein.' },
        ],
      },
      {
        type: 'bins',
        title: 'Scenario → messaging choice',
        instructions: 'Har PixShare scenario ko sahi service mein daalo.',
        bins: [
          { id: 'sqs', label: '📨 SQS' },
          { id: 'sns', label: '📢 SNS (fan-out)' },
          { id: 'kinesis', label: '🌊 Kinesis' },
          { id: 'sfn', label: '🪜 Step Functions' },
        ],
        items: [
          { text: 'Thumbnail banane ka background job, ek consumer, retry chahiye', bin: 'sqs', explain: 'Single background worker + buffer/retry = SQS.' },
          { text: 'Upload par: notify + feed-update + analytics — teeno independent', bin: 'sns', explain: 'Ek event, kai independent reactions = SNS fan-out (peeche SQS durability ke liye).' },
          { text: 'Real-time clickstream jise 3 alag analytics apps padhengi, ordering chahiye', bin: 'kinesis', explain: 'Ordered + replayable + multiple consumers same data = Kinesis.' },
          { text: 'Checkout: payment → inventory → shipping, fail par rollback', bin: 'sfn', explain: 'Multi-step transaction with compensation = Step Functions (saga).' },
          { text: 'IoT sensors se per-second readings, replay ki zaroorat', bin: 'kinesis', explain: 'High-throughput ordered ingest + replay = Kinesis. SQS ordering/replay guarantee nahi deta.' },
          { text: 'Email verification bhejna — ek baar, retry par safe', bin: 'sqs', explain: 'Simple durable background task = SQS.' },
          { text: 'Naya user signup event jise marketing, analytics, aur onboarding sab sunein', bin: 'sns', explain: 'Fan-out to independent subscribers = SNS.' },
          { text: 'Loan approval: verify → credit-check → manual review → disburse, har step ka state', bin: 'sfn', explain: 'Stateful multi-step workflow = Step Functions.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Messaging map par ungli rakho',
        instructions: 'Diagram mein sahi service par click karo.',
        visual: 'messaging',
        questions: [
          { q: 'Ek background job, buffer + retry chahiye — kaunsa?', target: 'sqs', explain: 'SQS — queue. Consumer down par messages safe. Background jobs ka default.' },
          { q: 'Ek event, kai independent reactions — kaunsa?', target: 'sns', explain: 'SNS — fan-out pub/sub. Durability ke liye har subscriber ki SQS queue.' },
          { q: 'Ordered + replayable stream, multiple consumers same data — kaunsa?', target: 'kinesis', explain: 'Kinesis — clickstream/IoT. SQS yeh nahi de sakta.' },
          { q: 'Multi-step workflow with rollback — kaunsa?', target: 'sfn', explain: 'Step Functions — orchestration, retry/catch, saga compensation.' },
        ],
      },
      {
        type: 'incident',
        title: '🧩 Decision: PixShare upload pipeline',
        instructions: 'Upload par bahut kuch karna hai. Sahi decoupling chuno.',
        pager: '<b>PixShare — upload pipeline</b><br>Photo upload par 4 cheezein: (1) thumbnail banao, (2) followers ko notify karo, (3) feed update karo, (4) analytics record karo. Abhi sab upload API ke andar sync hai — slow aur nazuk. Redesign karo.',
        start: 'sync',
        nodes: {
          sync: {
            text: 'Upload API ko tez + resilient karne ka pehla kadam?',
            choices: [
              { t: 'Upload ko sirf "photo save + event publish" tak seemit karo, baaki sab async kar do', good: true, next: 'fanout', explain: 'Sahi soch. User-facing request mein sirf turant zaroori kaam; baaki decouple. Ab publish kahan?' },
              { t: 'Sab kaam sync rakho par API ka timeout badha do', good: false, explain: 'Timeout badhana lakshan chhupata hai — user abhi bhi 8 sec wait karega aur ek downstream fail = poora upload fail. Decouple karo.' },
              { t: 'Har kaam ke liye API se seedha alag Lambda call karo (sync)', good: false, explain: 'Sync chain abhi bhi hai — koi ek Lambda slow/down = upload slow/fail. Async messaging chahiye.' },
            ],
          },
          fanout: {
            sitrep: 'Upload ab event publish karega. 4 reactions independent hain — thumbnail, notify, feed, analytics.',
            text: 'Ek event → 4 independent reactions. Kaise?',
            choices: [
              { t: 'SNS topic par publish, har reaction ki apni SQS queue subscribe (fan-out + durability)', good: true, next: 'notify', explain: 'Classic fan-out. Har consumer independent, apna retry, aur SQS message ko buffer karta hai agar consumer down ho.' },
              { t: 'Ek SQS queue jisse chaaron consumer padhein', good: false, explain: 'Ek queue = ek message ek hi consumer ko milta hai (compete karte hain). 4 independent reactions ke liye fan-out chahiye (SNS/EventBridge).' },
              { t: 'Kinesis stream banao', good: false, explain: 'Kinesis tab jab ordering/replay/high-throughput chahiye. Simple fan-out ke liye SNS→SQS saaf aur sasta hai.' },
            ],
          },
          notify: {
            sitrep: 'Fan-out lag gaya. Notification 3rd-party provider kabhi-kabhi slow hota hai.',
            text: 'Provider slow ho toh notifications kho na jaayein — kaise pakka karo?',
            choices: [
              { t: 'notify-queue (SQS) mein messages wait karte hain; consumer apni raftaar se, retry ke saath process karta hai', good: true, next: 'checkout', explain: 'SQS ka buffer yahi bachata hai — provider slow = queue mein wait, upload par koi asar nahi. Yehi durability ka point tha.' },
              { t: 'Seedha SNS se notification service ko push, bina queue', good: false, explain: 'SNS push karta hai, hold nahi. Consumer slow/down = message kho sakta hai. Beech mein SQS zaroori.' },
              { t: 'Notification ko wapas sync kar do "reliability ke liye"', good: false, explain: 'Sync karna hi asli problem thi — provider slow = upload slow. Async + queue hi sahi hai.' },
            ],
          },
          checkout: {
            sitrep: 'PixShare ne "print my photobook" store add kiya: order → payment → print-vendor → shipping, aur kisi step ke fail par paisa refund karna hai.',
            text: 'Yeh multi-step, rollback-wala flow kaise?',
            choices: [
              { t: 'Step Functions — har step, retry/catch, aur fail par compensation (refund)', good: true, next: 'done', explain: 'Stateful multi-step transaction with rollback = orchestration. Step Functions saga pattern isi ke liye.' },
              { t: 'Ek badi Lambda jo sab steps sequentially kare', good: false, explain: 'Beech mein crash = aadha kaam, koi rollback nahi, aur 15-min limit. Orchestration chahiye.' },
              { t: 'SNS fan-out kar do', good: false, explain: 'Fan-out independent reactions ke liye hai; yahan steps ka ORDER aur rollback matter karta hai. Step Functions.' },
            ],
          },
          done: {
            end: true,
            text: 'PixShare pipeline — tez, resilient, sahi tool per job 🎉',
            summary: `<b>Kya seekha:</b>
              <ul>
                <li><b>Decouple:</b> user request mein sirf turant zaroori kaam; baaki async.</li>
                <li><b>Fan-out</b> (1 event, N reactions) → <b>SNS → SQS</b> (durability ke liye SQS peeche).</li>
                <li><b>Slow consumer se bachao</b> → SQS buffer.</li>
                <li><b>Multi-step + rollback</b> → <b>Step Functions</b> (orchestration), na ki fan-out.</li>
              </ul>
              <b>Pattern:</b> queue (SQS) = durable work, pub/sub (SNS) = fan-out, stream (Kinesis) = ordered replay, workflow (Step Functions) = orchestrated rollback.`,
          },
        },
      },
    ],
    interview: {
      title: 'Interview Round — Decoupling',
      instructions: 'Integration round. 🎤',
      questions: [
        {
          q: '"SNS aur SQS mein farak, aur inhe saath kyun use karte hain?"',
          choices: [
            'SNS = pub/sub push (ek message, N subscribers); SQS = queue pull (buffer + retry). Saath: SNS fan-out deta hai, har subscriber ki SQS queue message ko buffer karti hai taaki consumer down ho toh bhi na khoye',
            'Dono same hain',
            'SNS purana, SQS naya',
            'SQS sirf FIFO ke liye',
          ],
          answer: 0,
          explain: 'Fan-out + durability = SNS→SQS. Yeh AWS ka sabse poocha jaane wala integration pattern hai.',
        },
        {
          q: 'Interviewer: "Kab SQS ke bajaye Kinesis?"',
          choices: [
            'Jab ordering + replay chahiye, ya same data ko multiple consumers padhte hain (clickstream/IoT). SQS standard ordering/replay guarantee nahi deta',
            'Jab budget zyada ho',
            'Jab messages chhote hon',
            'Kabhi nahi',
          ],
          answer: 0,
          explain: 'Kinesis = ordered replayable multi-consumer stream. Simple background job ke liye Kinesis over-engineering — SQS use karo.',
        },
        {
          q: '🎛️ Interviewer: "Fan-out setup inspect/verify karke dikhao."',
          terminal: {
            title: 'Interview hands-on — fan-out audit',
            goal: '🎛️ <b>Hands-on:</b> PixShare ka upload fan-out check karo. <b>(1)</b> <code>aws sns list-topics</code> aur <code>aws sqs list-queues</code> — topics aur queues. <b>(2)</b> <code>aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-1:123456789012:photo-uploaded</code> — kitni queues subscribe hain (durable fan-out?). <b>(3)</b> Ek test event publish karke verify karo ki queue mein message aaya: <code>aws sns publish --topic-arn arn:aws:sns:us-east-1:123456789012:photo-uploaded --message "photo123"</code> phir <code>aws sqs receive-message --queue-name notify-queue</code>.',
            tasks: [
              { text: 'aws sns list-topics + aws sqs list-queues', check: s => s.history.some(h => /aws sns list-topics/.test(h)) && s.history.some(h => /aws sqs list-queues/.test(h)) },
              { text: 'list-subscriptions-by-topic (fan-out dekho)', check: s => s.history.some(h => /aws sns list-subscriptions-by-topic/.test(h)) },
              { text: 'publish + receive-message se verify karo', check: s => s.history.some(h => /aws sns publish.*photo-uploaded/.test(h)) && s.history.some(h => /aws sqs receive-message/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              topics: [
                { name: 'photo-uploaded', arn: 'arn:aws:sns:us-east-1:123456789012:photo-uploaded', subscriptions: [
                  { subscriptionArn: 'arn:aws:sns:us-east-1:123456789012:photo-uploaded:1', protocol: 'sqs', endpoint: 'arn:aws:sqs:us-east-1:123456789012:thumbnail-queue', confirmed: true },
                  { subscriptionArn: 'arn:aws:sns:us-east-1:123456789012:photo-uploaded:2', protocol: 'sqs', endpoint: 'arn:aws:sqs:us-east-1:123456789012:notify-queue', confirmed: true },
                  { subscriptionArn: 'arn:aws:sns:us-east-1:123456789012:photo-uploaded:3', protocol: 'sqs', endpoint: 'arn:aws:sqs:us-east-1:123456789012:analytics-queue', confirmed: true },
                ] },
              ],
              queues: [
                { name: 'thumbnail-queue', url: 'https://sqs.us-east-1.amazonaws.com/123456789012/thumbnail-queue', arn: 'arn:aws:sqs:us-east-1:123456789012:thumbnail-queue', messages: [], visibilityTimeout: 30 },
                { name: 'notify-queue', url: 'https://sqs.us-east-1.amazonaws.com/123456789012/notify-queue', arn: 'arn:aws:sqs:us-east-1:123456789012:notify-queue', messages: [], visibilityTimeout: 30 },
                { name: 'analytics-queue', url: 'https://sqs.us-east-1.amazonaws.com/123456789012/analytics-queue', arn: 'arn:aws:sqs:us-east-1:123456789012:analytics-queue', messages: [], visibilityTimeout: 30 },
              ],
            },
            success: s => s.history.some(h => /aws sns list-topics/.test(h))
              && s.history.some(h => /aws sqs list-queues/.test(h))
              && s.history.some(h => /aws sns list-subscriptions-by-topic/.test(h))
              && s.history.some(h => /aws sns publish.*photo-uploaded/.test(h))
              && s.history.some(h => /aws sqs receive-message/.test(h)),
            successText: '✅ Textbook fan-out: <code>photo-uploaded</code> topic par <b>3 SQS queues</b> subscribe hain — har reaction (thumbnail/notify/analytics) ki apni durable queue. Publish karte hi message queues mein pahunch gaya, aur agar koi consumer down ho toh message queue mein <b>wait</b> karega (SNS akela hota toh kho jaata). <b>Yeh durability hi SNS→SQS ka pura point hai.</b>',
            hints: [
              'aws sns list-topics   aur   aws sqs list-queues',
              'aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-1:123456789012:photo-uploaded',
              'aws sns publish --topic-arn arn:aws:sns:us-east-1:123456789012:photo-uploaded --message "photo123"   phir   aws sqs receive-message --queue-name notify-queue',
            ],
          },
        },
      ],
    },
    success: [
      'Main SQS / SNS / Kinesis / Step Functions mein sahi choice justify kar sakta hoon',
      'Main sync ko async decouple karke resilience+speed nikaal sakta hoon',
      'Main SNS→SQS fan-out pattern aur uski durability samjha sakta hoon',
      'Main orchestration (Step Functions) vs choreography (events) mein choose kar sakta hoon',
    ],
    homework: `<p>Free Tier par fan-out chakho:</p>
      <pre># SNS topic + 2 SQS queues fan-out
aws sns create-topic --name uploads
aws sqs create-queue --queue-name thumb-q
aws sqs create-queue --queue-name notify-q
# har queue ko topic par subscribe karo (--protocol sqs)
# publish karo, dono queues mein message dekho (fan-out)

# SNS akela vs SNS→SQS ka farak:
#   consumer band karke publish karo → SQS mein message wait karega
#   (SNS-direct hota toh kho jaata)

# Step Functions ke liye: Console → Create state machine → 2 Lambda steps,
#   doosre par Catch add karo, jaan-boojh ke fail karke rollback dekho</pre>
      <p>✅ Self-check: Ek publish, dono queues mein aaya (fan-out)? Consumer down par SQS ne message bachaya? Step Functions ka Catch chala?</p>`,
    cards: [
      { front: 'SQS vs SNS vs Kinesis vs Step Functions?', back: '<b>SQS</b> = queue (buffer+retry, 1 consumer group). <b>SNS</b> = fan-out pub/sub. <b>Kinesis</b> = ordered replayable stream (multi-consumer). <b>Step Functions</b> = orchestrated multi-step workflow with rollback.' },
      { front: 'SNS→SQS fan-out kyun?', back: 'SNS ek event ko N subscribers ko push karta hai (fan-out); har subscriber ki SQS queue message ko <b>buffer</b> karti hai. Consumer down = message safe (akela SNS hold nahi karta).' },
      { front: 'Kab SQS ke bajaye Kinesis?', back: 'Jab <b>ordering + replay</b> chahiye, ya <b>same data multiple consumers</b> padhte hain (clickstream/IoT). Simple background job ke liye Kinesis over-engineering.' },
      { front: 'Orchestration vs choreography?', back: '<b>Orchestration</b> (Step Functions) = central conductor, order+retry+rollback, flow saaf. <b>Choreography</b> (SNS/EventBridge) = services events sun ke react karti hain, loosely coupled par trace mushkil.' },
      { front: 'Decoupling ka core rule?', back: 'User-facing request mein <b>sirf turant zaroori kaam</b> rakho; baaki async (queue/event). Ek downstream slow/down = user par asar nahi. Sync chain = ek fail, sab fail.' },
    ],
  },

  /* ================= LEVEL 4: EventBridge & Pipes ================= */
  {
    id: 'eventbridge',
    icon: '🔔',
    title: 'EventBridge & Pipes — Event Backbone',
    badge: 'Event Backbone Banane Wala',
    objectives: [
      '<b>EventBridge Bus</b> — content-based routing, AWS/SaaS events, schema registry',
      '<b>EventBridge vs SNS</b> — kab content-filtering/replay chahiye',
      '<b>EventBridge Pipes</b> — source→filter→enrich→target, glue-code khatam',
      '<b>EventBridge Scheduler</b> — serverless cron',
    ],
    lesson: [
      `<h3>🧭 EventBridge — many-to-many event router</h3>
       <p>SNS fan-out achha hai, par EventBridge do cheezein aur deta hai jo
       architecture ko clean banati hain:</p>
       <ul>
         <li>🧭 <b>Content-based routing</b> — event ke <b>andar ke fields</b> par
             filter. "Sirf premium users ke uploads fraud-check par bhejo",
             "sirf amount &gt; 1000 wale orders."</li>
         <li>🌐 <b>AWS + SaaS + custom events</b> — EC2 state change, S3 object
             created, CodePipeline, GuardDuty, aur Zendesk/Stripe jaise partners —
             sab ek bus par. SNS yeh ecosystem nahi deta.</li>
         <li>🗃️ <b>Schema registry + archive/replay</b> — events ko archive karke
             baad mein replay kar sakte ho (debugging/backfill).</li>
       </ul>
       <pre>Producers → EventBridge Bus → Rules (pattern match) → Targets (Lambda/SQS/SFN/…)
{ "source": "pixshare.uploads", "detail-type": "PhotoUploaded",
  "detail": { "tier": "premium", "sizeMB": 45 } }
Rule pattern: { "detail": { "tier": ["premium"] } }  → premium-only target</pre>
       <p>💡 <b>EventBridge vs SNS:</b> simple high-throughput fan-out (ultra-low
       latency) = SNS. Content-filtering, AWS/SaaS events, schema/replay = EventBridge.</p>`,
      `<h3>🔧 EventBridge Pipes — point-to-point ETL glue</h3>
       <p>Bahut baar log ek chhota Lambda likhte hain jo bas: "SQS/Kinesis/DynamoDB
       stream se padho → thoda filter/transform karo → kahin bhej do." Yeh
       boilerplate <b>Pipes</b> khatam kar deta hai. Ek Pipe ke 4 hisse:</p>
       <pre>Source     → Filter        → Enrichment      → Target
(SQS/       (chhaan lo,    (Lambda/API/       (SQS/SNS/SFN/
 Kinesis/    poll+batch     Step Functions se  EventBridge bus/
 DDB stream) built-in)      data jodo)         API destination)</pre>
       <ul>
         <li><b>Filter</b> — built-in, bina code ke events chhaan lo</li>
         <li><b>Enrichment</b> — optional Lambda/API se data add karo</li>
         <li>Source polling, batching, retries — <b>managed</b>, tumhe nahi likhna</li>
       </ul>
       <p>💡 <b>Pipes vs Lambda-glue:</b> agar tumhara Lambda sirf "read-transform-forward"
       kar raha hai, woh Pipe hona chahiye — kam code, kam bug, managed retries.
       Custom heavy business logic ho toh Lambda theek.</p>`,
      `<h3>⏰ Scheduler, aur #1 EventBridge bug</h3>
       <p><b>EventBridge Scheduler</b> = serverless cron. <code>rate(5 minutes)</code>
       ya <code>cron(0 3 * * ? *)</code> — EC2 par crontab chalane ki zaroorat
       khatam. Nightly jobs, reminders, cleanup — sab yahan.</p>
       <div class="war-story"><b>⚡ Real trap (sabse common):</b> PixShare ne ek
       EventBridge rule banaya "high-value uploads ko fraud-check par bhejo" —
       pattern bilkul sahi tha, events bhi bus par aa rahe the, par fraud-check
       Lambda kabhi nahi chali. Wajah: rule bana diya par uspar <b>target nahi
       lagaya</b>. <code>put-rule</code> aur <code>put-targets</code> do alag calls
       hain — target bhoolna EventBridge ki #1 galti hai. Rule match hota hai aur
       event <b>chup-chaap gir</b> jaata hai (koi error nahi). <b>Sabak: rule +
       target dono ek saath, aur IaC mein dono likho; verify with
       <code>list-targets-by-rule</code>.</b></div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'EventBridge, SNS, ya Pipes?',
        instructions: 'Har requirement ko sahi tool mein daalo.',
        bins: [
          { id: 'eb', label: '🔔 EventBridge (bus+rules)' },
          { id: 'sns', label: '📢 SNS' },
          { id: 'pipes', label: '🔧 Pipes' },
          { id: 'sched', label: '⏰ Scheduler' },
        ],
        items: [
          { text: 'Event ke andar tier=premium par hi filter karke route karo', bin: 'eb', explain: 'Content-based routing = EventBridge rule pattern. SNS content par filter (rich) nahi karta.' },
          { text: 'EC2 instance "stopped" hone par ticket banao', bin: 'eb', explain: 'AWS service events default bus par aate hain = EventBridge. SNS yeh nahi deta.' },
          { text: 'Ultra-high-throughput simple fan-out, lowest latency', bin: 'sns', explain: 'Simple fast fan-out = SNS. EventBridge thodi extra latency deta hai (routing).' },
          { text: 'SQS se padho, chhaan ke, Lambda se enrich karke Step Functions ko bhejo', bin: 'pipes', explain: 'Source→filter→enrich→target = EventBridge Pipes (managed glue, no boilerplate Lambda).' },
          { text: 'Roz raat 3 baje cleanup job chalao', bin: 'sched', explain: 'Serverless cron = EventBridge Scheduler (cron/rate). EC2 crontab ki zaroorat nahi.' },
          { text: 'DynamoDB stream se changes padho, filter karke EventBridge bus par bhejo', bin: 'pipes', explain: 'Stream source → filter → target = Pipes. Custom Lambda-glue ki jagah.' },
          { text: 'Stripe (SaaS) payment events ko apni app mein sunno', bin: 'eb', explain: 'Partner/SaaS events = EventBridge partner event source. SNS mein nahi aata.' },
          { text: 'Marketing + analytics + onboarding sabko signup event bhejo (simple)', bin: 'sns', explain: 'Simple fan-out, koi content-filter/AWS-event nahi = SNS kaafi (sasta+tez).' },
        ],
      },
      {
        type: 'hotspot',
        title: 'EventBridge map par ungli rakho',
        instructions: 'Diagram mein sahi hissa click karo.',
        visual: 'eventbridge',
        questions: [
          { q: 'Event ke content par filter karke decide karta hai kaun sunega?', target: 'rule', explain: 'Rule ka event pattern — source, detail-type, aur detail ke andar ke fields par match.' },
          { q: 'Rule match hone ke baad event yahan jaata hai — na ho toh event gir jaata hai?', target: 'target', explain: 'Target. Rule bina target = event match hota par kahin deliver nahi. #1 EventBridge bug.' },
          { q: 'SQS se padho, filter+enrich karke bhejo — bina glue-Lambda?', target: 'penrich', explain: 'Pipes ka Enrichment step (Lambda/API), source+filter+target managed.' },
          { q: 'Serverless cron (nightly job) ke liye?', target: 'schedule', explain: 'EventBridge Scheduler — cron(0 3 * * ? *) / rate(5 minutes). EC2 crontab khatam.' },
        ],
      },
      {
        type: 'fill',
        title: 'EventBridge Pipe banao',
        instructions: 'Ek Pipe: SQS orders se padho, high-value chhaan-o, enrich karke Step Functions ko bhejo. Blanks bharo.',
        template: `# EventBridge Pipe — source → filter → enrichment → target
aws pipes create-pipe --name orders-to-fulfillment \\
  --{0}      arn:aws:sqs:us-east-1:123456789012:orders \\
  --{1}  arn:aws:lambda:us-east-1:123456789012:function:add-customer-data \\
  --{2}      arn:aws:states:us-east-1:123456789012:stateMachine:fulfillment

# Source filter (bina code — sirf amount > 1000 wale aage jaate hain):
# FilterCriteria pattern:
{ "{3}": { "amount": [{ "numeric": [">", 1000] }] } }`,
        tokens: ['source', 'enrichment', 'target', 'detail', 'destination', 'rule', 'schedule', 'body'],
        blanks: [
          { answer: 'source', explain: 'Pipe ka <b>source</b> — SQS/Kinesis/DynamoDB stream. Polling, batching, retries yahan managed hote hain (Lambda-glue khatam).' },
          { answer: 'enrichment', explain: '<b>Enrichment</b> (optional) — Lambda/API/Step Functions se event mein data jodo (jaise customer profile). Business logic yahan.' },
          { answer: 'target', explain: 'Pipe ka <b>target</b> — SQS/SNS/Step Functions/EventBridge bus/API destination. Ek pipe = ek source→ek target.' },
          { answer: 'detail', explain: 'Filter pattern event ke <b>detail</b> (payload) par match karta hai. <code>numeric [">", 1000]</code> jaise content operators — yehi EventBridge ko SNS se alag banate hain.' },
        ],
      },
      {
        type: 'incident',
        title: '🧩 Decision: PixShare event backbone',
        instructions: 'App event-driven ho rahi hai. Sahi tool chuno — aur #1 bug se bacho.',
        pager: '<b>PixShare — event backbone</b><br>App bade ho rahi hai: premium-only fraud checks, AWS service events (S3/EC2) par react, ek SQS→transform→SFN glue, aur nightly cleanup. Team har cheez ke liye Lambda likh rahi hai. Simplify karo.',
        start: 'route',
        nodes: {
          route: {
            text: 'Uploads mein se sirf "premium tier" wale fraud-check par bhejne hain. Kaise?',
            choices: [
              { t: 'EventBridge rule with content pattern { detail: { tier: ["premium"] } } → fraud-check target', good: true, next: 'target', explain: 'Content-based routing = EventBridge. Event ke andar tier par filter — SNS yeh rich filtering nahi deta.' },
              { t: 'SNS topic, aur har consumer khud check kare ki tier premium hai', good: false, explain: 'Sab consumers ko sab events milenge aur har ek filter karega — waste + coupling. EventBridge bus par filter karo.' },
              { t: 'Lambda jo har event padh ke if(premium) kare', good: false, explain: 'Yeh routing logic infra ka kaam hai, tumhare code ka nahi. EventBridge rule declaratively karta hai.' },
            ],
          },
          target: {
            sitrep: 'Rule bana diya. Par fraud-check Lambda kabhi trigger nahi ho rahi, jabki events aa rahe hain.',
            text: 'Kya bhool gaye?',
            choices: [
              { t: 'Rule par target nahi lagaya — put-rule aur put-targets alag calls hain', good: true, next: 'pipe', explain: 'EventBridge #1 bug. Rule match hota hai par bina target ke event chup-chaap gir jaata hai. list-targets-by-rule se verify karo.' },
              { t: 'Lambda ka memory badhana bhool gaye', good: false, explain: 'Memory ka isse koi lena-dena nahi — event Lambda tak pahunch hi nahi raha kyunki target missing hai.' },
              { t: 'Rule DISABLED chhod diya', good: false, explain: 'Ho sakta hai, par sabse common yeh hai ki target hi nahi laga. Pehle target check karo.' },
            ],
          },
          pipe: {
            sitrep: 'Fraud-check chal gayi. Ab: ek SQS queue se orders padho, high-value chhaan-o, customer data se enrich karo, Step Functions ko bhejo — team ne iske liye 60-line Lambda likhi hai.',
            text: 'Is glue-Lambda ko simplify kaise?',
            choices: [
              { t: 'EventBridge Pipe — source (SQS) → filter (built-in) → enrichment (Lambda) → target (SFN)', good: true, next: 'cron', explain: 'Read-transform-forward glue = Pipes. Polling/batching/retries managed; filter bina code. Sirf enrichment logic Lambda mein.' },
              { t: 'Lambda ko aur bada bana do', good: false, explain: 'Boilerplate (poll, batch, retry, filter) khud maintain karna = bugs. Pipes yeh sab managed deta hai.' },
              { t: 'Step Functions ko seedha SQS se jodo', good: false, explain: 'Filter+enrich beech mein chahiye. Pipe woh managed way hai; direct integration filtering/enrichment miss karega.' },
            ],
          },
          cron: {
            sitrep: 'Pipe se glue-Lambda hata. Aakhri: roz raat 3 baje purane temp files cleanup.',
            text: 'Nightly cleanup kaise trigger karo?',
            choices: [
              { t: 'EventBridge Scheduler — cron(0 3 * * ? *) → cleanup Lambda', good: true, next: 'done', explain: 'Serverless cron = EventBridge Scheduler. Koi EC2 crontab nahi, koi always-on box nahi.' },
              { t: 'Ek t3.micro 24×7 chala ke crontab lagao', good: false, explain: 'Ek nightly job ke liye 24×7 box = waste + patching. Scheduler serverless hai.' },
              { t: 'Lambda ko infinite loop mein sleep karao', good: false, explain: 'Lambda 15-min max + yeh anti-pattern hai. Scheduler use karo.' },
            ],
          },
          done: {
            end: true,
            text: 'PixShare event backbone — declarative, glue-free 🎉',
            summary: `<b>Kya seekha:</b>
              <ul>
                <li><b>Content routing / AWS+SaaS events</b> → EventBridge rules (SNS nahi).</li>
                <li><b>#1 bug</b>: <code>put-rule</code> ≠ <code>put-targets</code> — target bhoolna = event chup-chaap gir jaata. Verify with <code>list-targets-by-rule</code>.</li>
                <li><b>Read-transform-forward glue</b> → EventBridge <b>Pipes</b> (source→filter→enrich→target), na ki boilerplate Lambda.</li>
                <li><b>Nightly cron</b> → EventBridge <b>Scheduler</b>.</li>
              </ul>`,
          },
        },
      },
    ],
    interview: {
      title: 'Interview Round — EventBridge & Pipes',
      instructions: 'Event-driven round. 🎤',
      questions: [
        {
          q: '"SNS aur EventBridge dono fan-out karte hain — EventBridge kab?"',
          choices: [
            'Jab routing event ke content par ho (numeric/prefix filters), ya AWS/SaaS service events chahiye, ya archive-replay/schema registry chahiye. Simple ultra-fast fan-out ke liye SNS sasta+tez',
            'Hamesha EventBridge — modern hai',
            'Hamesha SNS — EventBridge mehnga',
            'Dono same hain',
          ],
          answer: 0,
          explain: 'Trade-off jawab: EventBridge = richer routing + ecosystem + replay (thodi latency/cost); SNS = ultra-simple fan-out (+ mobile push/SMS).',
        },
        {
          q: 'Interviewer: "EventBridge Pipes kya solve karta hai?"',
          choices: [
            'Woh "read from source → filter → enrich → forward to target" wala boilerplate Lambda khatam karta hai — source polling/batching/retries + built-in filter managed, sirf enrichment logic likhna padta hai',
            'Woh EventBridge ka purana naam hai',
            'Woh Step Functions ka replacement hai',
            'Woh sirf logging ke liye hai',
          ],
          answer: 0,
          explain: 'Pipes = point-to-point managed integration with filter+enrich. "Agar Lambda sirf glue hai, woh Pipe hona chahiye."',
        },
        {
          q: '🎛️ Interviewer: "Event routing debug karke dikhao — event kahin pahunch nahi raha."',
          terminal: {
            title: 'Interview hands-on — EventBridge debug',
            goal: '🎛️ <b>Hands-on:</b> <code>high-value-uploads</code> rule ki fraud-check Lambda kabhi nahi chalti. <b>(1)</b> <code>aws events list-rules</code> — rule hai? <b>(2)</b> <code>aws events list-targets-by-rule --rule high-value-uploads</code> — target laga hai? <b>(3)</b> Fix: <code>aws events put-targets --rule high-value-uploads --targets arn:aws:lambda:us-east-1:123456789012:function:fraud-check</code>. <b>(4)</b> Pipe bhi dekho: <code>aws pipes list-pipes</code> aur <code>aws pipes describe-pipe --name orders-to-fulfillment</code>.',
            tasks: [
              { text: 'aws events list-rules', check: s => s.history.some(h => /aws events list-rules/.test(h)) },
              { text: 'list-targets-by-rule — khaali hai?', check: s => s.history.some(h => /aws events list-targets-by-rule.*high-value-uploads/.test(h)) },
              { text: 'put-targets se Lambda jodo', check: s => (s.account.eventRules || []).find(r => r.name === 'high-value-uploads')?.targets?.length > 0 },
              { text: 'aws pipes describe-pipe --name orders-to-fulfillment', check: s => s.history.some(h => /aws pipes describe-pipe.*orders-to-fulfillment/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              eventRules: [
                { name: 'high-value-uploads', bus: 'default', state: 'ENABLED', pattern: { source: ['pixshare.uploads'], 'detail-type': ['PhotoUploaded'], detail: { tier: ['premium'] } }, targets: [] },
                { name: 'nightly-cleanup', bus: 'default', state: 'ENABLED', schedule: 'cron(0 3 * * ? *)', targets: ['arn:aws:lambda:us-east-1:123456789012:function:cleanup'] },
              ],
              lambdas: [
                { name: 'fraud-check', runtime: 'python3.12', handler: 'app.handler', state: 'Active', memory: 512, timeout: 30 },
                { name: 'cleanup', runtime: 'python3.12', handler: 'app.clean', state: 'Active', memory: 256, timeout: 300 },
              ],
              pipes: [
                { name: 'orders-to-fulfillment', state: 'RUNNING', source: 'arn:aws:sqs:us-east-1:123456789012:orders', enrichment: 'arn:aws:lambda:us-east-1:123456789012:function:add-customer-data', target: 'arn:aws:states:us-east-1:123456789012:stateMachine:fulfillment', filter: '{ "detail": { "amount": [{ "numeric": [">", 1000] }] } }' },
              ],
            },
            success: s => s.history.some(h => /aws events list-rules/.test(h))
              && s.history.some(h => /aws events list-targets-by-rule.*high-value-uploads/.test(h))
              && (s.account.eventRules || []).find(r => r.name === 'high-value-uploads')?.targets?.length > 0
              && s.history.some(h => /aws pipes describe-pipe.*orders-to-fulfillment/.test(h)),
            successText: '🎉 <b>#1 bug pakda:</b> <code>high-value-uploads</code> rule ka pattern sahi tha par <code>targets: []</code> — event match hoke chup-chaap gir raha tha. <code>put-targets</code> ke baad fraud-check jud gayi. Aur <code>orders-to-fulfillment</code> Pipe ne dikha diya ki source (SQS) → filter (amount&gt;1000) → enrichment (Lambda) → target (Step Functions) sab <b>managed</b> hai — koi glue-Lambda nahi. <b>Rule + target hamesha jodi mein; Pipe = glue-free integration.</b>',
            hints: [
              'aws events list-rules',
              'aws events list-targets-by-rule --rule high-value-uploads   ← khaali = event kahin nahi ja raha',
              'aws events put-targets --rule high-value-uploads --targets arn:aws:lambda:us-east-1:123456789012:function:fraud-check',
              'aws pipes list-pipes   phir   aws pipes describe-pipe --name orders-to-fulfillment',
            ],
          },
        },
      ],
    },
    success: [
      'Main EventBridge vs SNS mein sahi choice (content-filter/AWS-SaaS events/replay) kar sakta hoon',
      'Main EventBridge Pipes se glue-Lambda ko replace kar sakta hoon',
      'Main jaanta hoon ki rule + target dono zaroori hain (#1 bug)',
      'Main EventBridge Scheduler ko serverless cron ke liye use kar sakta hoon',
    ],
    homework: `<p>Free Tier par event backbone chakho:</p>
      <pre># Content-filter rule
aws events put-rule --name premium-uploads \\
  --event-pattern '{"source":["pixshare.uploads"],"detail":{"tier":["premium"]}}'
aws events put-targets --rule premium-uploads \\
  --targets 'Id=1,Arn=<lambda-arn>'     # ← YEH mat bhoolna
aws events list-targets-by-rule --rule premium-uploads   # verify

# Serverless cron (Scheduler)
#   Console → EventBridge → Scheduler → rate(5 minutes) → Lambda target

# Pipe (SQS → filter → enrich → target)
#   Console → EventBridge → Pipes → Create pipe
#   Source: SQS ; Filter: amount>1000 ; Enrichment: Lambda ; Target: SFN
#   Dekho: koi glue-Lambda likhni nahi padi</pre>
      <p>✅ Self-check: Rule bina target ke event drop hua (list-targets khaali)? Pipe ne bina code ke filter+forward kiya? Scheduler ne Lambda time par chalaya?</p>`,
    cards: [
      { front: 'EventBridge vs SNS kab?', back: '<b>EventBridge</b>: content-based routing (numeric/prefix filters), AWS/SaaS service events, schema registry + archive/replay. <b>SNS</b>: simple ultra-fast fan-out (+ SMS/mobile push).' },
      { front: 'EventBridge Pipes kya hai?', back: 'Point-to-point managed integration: <b>source → filter → enrichment → target</b>. Source polling/batching/retries + built-in filter managed. "Agar Lambda sirf read-transform-forward glue hai, woh Pipe hona chahiye."' },
      { front: 'EventBridge #1 bug?', back: 'Rule bana diya par <b>target nahi lagaya</b>. <code>put-rule</code> ≠ <code>put-targets</code> — event match hoke chup-chaap gir jaata hai (koi error nahi). Verify: <code>list-targets-by-rule</code>.' },
      { front: 'EventBridge Scheduler?', back: 'Serverless cron — <code>rate(5 minutes)</code> / <code>cron(0 3 * * ? *)</code>. Nightly jobs/reminders/cleanup. EC2 crontab / always-on box khatam.' },
      { front: 'Pipe ke 4 hisse?', back: '<b>Source</b> (SQS/Kinesis/DDB stream) → <b>Filter</b> (built-in, no code) → <b>Enrichment</b> (optional Lambda/API) → <b>Target</b> (SQS/SNS/SFN/EventBridge/API).' },
    ],
  },

  /* ================= LEVEL 5: Log Analytics ETL pipeline ================= */
  {
    id: 'logsetl',
    icon: '🔍',
    title: 'Log Analytics ETL — CloudWatch → Firehose → OpenSearch',
    badge: 'Log Pipeline Lohar',
    objectives: [
      '<b>Log ka safar</b>: CloudWatch Logs → Subscription Filter → Firehose → OpenSearch (+ S3)',
      '<b>Firehose vs Kinesis Streams</b> — kab managed delivery, kab custom processing',
      '<b>OpenSearch vs Logs Insights vs Athena</b> — kaunsa kab',
      '<b>Metric Filter</b> — log se metric+alarm (ERROR count)',
    ],
    lesson: [
      `<h3>🧭 Problem: logs sab jagah, dhoondho kahin nahi</h3>
       <p>PixShare ke 15 Lambdas + Fargate services har ek apni CloudWatch Logs
       mein likhti hain. Ek user complaint aati hai "upload fail hua" — ab tumhe
       15 alag log groups mein dhoondhna padta hai. CloudWatch Logs Insights
       ek group par theek hai, par <b>cross-service, real-time, dashboards</b>
       ke liye ek proper search backend chahiye.</p>
       <p>Solution ek ETL pipeline hai — logs ko ek jagah stream, index, aur
       search karne ka:</p>
       <pre>App logs → CloudWatch Logs
            └─(Subscription Filter: real-time tap, pattern)→ Kinesis Firehose
                └─(managed buffer + optional transform)→ OpenSearch (index + Dashboards)
                                                       └→ S3 (raw backup, Athena se query)</pre>
       <p>Har hissa kya karta hai:</p>
       <ul>
         <li><b>📜 CloudWatch Logs</b> — jahan logs aate hain (default).</li>
         <li><b>🔎 Subscription Filter</b> — log group par ek "tap": pattern se
             match karke logs ko <b>real-time</b> ek destination (Firehose/Kinesis/Lambda)
             par bhejta hai. Pattern <code>""</code> = sab logs.</li>
         <li><b>🚿 Kinesis Data Firehose</b> — fully managed delivery: buffer
             (size/time), optional transform (Lambda), aur destination tak pahunchana.
             <b>Shards manage nahi karne padte.</b></li>
         <li><b>🔍 OpenSearch</b> — logs index hoke searchable, OpenSearch
             Dashboards se visualize.</li>
         <li><b>🪣 S3</b> — Firehose ka doosra haath: raw logs sasta archive,
             Athena se on-demand query.</li>
       </ul>`,
      `<h3>🚿 Firehose vs Kinesis Streams — sabse confusing choice</h3>
       <p>Dono "Kinesis" hain, par alag kaam:</p>
       <table>
         <tr><th></th><th>🚿 Firehose (Data Firehose)</th><th>🌊 Kinesis Data Streams</th></tr>
         <tr><td>Kaam</td><td>managed <b>delivery</b> to S3/OpenSearch/Redshift</td><td>real-time <b>stream</b> for custom consumers</td></tr>
         <tr><td>Shards</td><td>koi nahi (auto)</td><td>tum manage karte ho</td></tr>
         <tr><td>Latency</td><td>near-real-time (buffer: sec/MB)</td><td>real-time (~ms)</td></tr>
         <tr><td>Kab</td><td>"logs ko OpenSearch/S3 tak pahuncha do"</td><td>"custom real-time processing, replay, multiple apps"</td></tr>
       </table>
       <p>💡 <b>Log analytics pipeline ke liye Firehose default hai</b> — kyunki
       tumhe sirf reliable delivery + buffer + transform chahiye, custom stream
       processing nahi. Kinesis Streams tab jab tum khud real-time consumers
       likh rahe ho jo same data ko replay/parallel padhte hain.</p>`,
      `<h3>🔎 OpenSearch vs Logs Insights vs Athena, aur Metric Filter</h3>
       <table>
         <tr><th>Tool</th><th>Kab</th></tr>
         <tr><td><b>CloudWatch Logs Insights</b></td><td>ek/kuch log groups par quick ad-hoc query, koi setup nahi. Chhote scale par pehla tool.</td></tr>
         <tr><td><b>OpenSearch</b></td><td>cross-service, high-volume, rich dashboards, full-text search, alerting. Log analytics ka heavy-duty backend.</td></tr>
         <tr><td><b>Athena on S3</b></td><td>logs S3 mein hain, occasional/historical analytical queries, serverless + sasta (pay-per-scan).</td></tr>
       </table>
       <p><b>Metric Filter</b> ek alag chhoti powerful cheez hai: log group par
       pattern (e.g. <code>"ERROR"</code>) se ek <b>CloudWatch metric</b> banao,
       aur uspar <b>alarm</b>. "5 min mein 100 se zyada ERROR = page karo" — bina
       kisi pipeline ke.</p>
       <div class="war-story"><b>⚡ Real trap:</b> Ek team ne "sab logs OpenSearch
       mein daalo" kiya — har chhoti debug line bhi. OpenSearch cluster storage
       bhar gaya, cost aasman chhoo gaya, aur queries slow. Do galtiyan: (1)
       subscription filter <b>pattern</b> use nahi kiya — sirf ERROR/WARN chahiye
       the, sab INFO bhej diye. (2) OpenSearch ko raw archive ke liye use kiya —
       jahan <b>S3 (Firehose ka doosra output) + lifecycle → Glacier</b> hona
       chahiye tha, aur purana searchable data OpenSearch se S3 par roll karna
       chahiye tha. Fix: filter pattern se sirf zaroori logs, OpenSearch mein
       short retention (hot search), aur raw sab S3 mein sasta. <b>Sabak: sab kuch
       search backend mein mat thooso — filter karo, aur cold data S3 par rakho.</b></div>`,
    ],
    stages: [
      {
        type: 'order',
        title: 'Log ka safar — pipeline order',
        instructions: 'Logs ko searchable banane ke steps sahi order mein lagao.',
        steps: [
          { text: 'App CloudWatch Logs mein likhti hai', explain: 'Default — har Lambda/ECS apni log group mein.' },
          { text: 'Subscription Filter (pattern) real-time tap lagata hai', explain: 'Log group par filter — sirf matching logs ko aage stream karta hai.' },
          { text: 'Kinesis Firehose buffer + (optional) transform karta hai', explain: 'Managed delivery: buffer size/time, optional Lambda transform. Shards nahi.' },
          { text: 'OpenSearch mein index hoke searchable + Dashboards', explain: 'Ab cross-service search aur visualize ho sakta hai.' },
          { text: 'Firehose raw copy S3 mein bhi bhejta hai (sasta archive)', explain: 'Doosra output — Athena se query, lifecycle se Glacier. Cold data OpenSearch se bahar.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Pipeline map par ungli rakho',
        instructions: 'Diagram mein sahi hissa click karo.',
        visual: 'logsetl',
        questions: [
          { q: 'Log group par real-time "tap" jo pattern se logs aage bhejta hai?', target: 'subfilter', explain: 'Subscription Filter — pattern match karke logs ko Firehose/Kinesis/Lambda par stream.' },
          { q: 'Fully managed delivery (buffer+transform), shards nahi manage karne — kaunsa?', target: 'firehose', explain: 'Kinesis Data Firehose — log analytics pipeline ka default delivery.' },
          { q: 'Logs index + dashboards + full-text search — kaunsa?', target: 'opensearch', explain: 'OpenSearch — searchable backend + OpenSearch Dashboards.' },
          { q: 'Raw logs ka sasta archive (Athena se query) — kahan?', target: 's3backup', explain: 'S3 — Firehose ka doosra output. Cold data OpenSearch mein nahi, S3 mein.' },
          { q: 'Log se metric+alarm (ERROR count) — bina pipeline ke?', target: 'metricfilter', explain: 'Metric Filter — pattern se CloudWatch metric + alarm.' },
        ],
      },
      {
        type: 'fill',
        title: 'Pipeline wire karo — subscription filter → Firehose',
        instructions: 'Log group ko Firehose se jodo (sirf ERROR/WARN). Blanks bharo.',
        template: `# Sirf ERROR/WARN logs ko real-time Firehose par bhejo
aws logs put-{0} \\
  --log-group-name /aws/lambda/feed-api \\
  --filter-name errors-to-firehose \\
  --filter-pattern "{1}" \\
  --destination-arn arn:aws:firehose:us-east-1:123456789012:deliverystream/logs-to-opensearch

# Firehose ka destination confirm karo:
aws firehose {2} --delivery-stream-name logs-to-opensearch

# Log se ERROR-count metric + alarm (pipeline ki zaroorat nahi):
aws logs put-{3} --log-group-name /aws/lambda/feed-api \\
  --filter-name error-count --filter-pattern "ERROR" ...`,
        tokens: ['subscription-filter', '?WARN ?ERROR', 'describe-delivery-stream', 'metric-filter', 'delivery-stream', 'ERROR', 'list-streams', 'log-group'],
        blanks: [
          { answer: 'subscription-filter', explain: '<code>put-subscription-filter</code> — log group par real-time tap. Yeh pipeline ka pehla connection hai.' },
          { answer: '?WARN ?ERROR', explain: 'Filter pattern se sirf zaroori logs — <code>?ERROR ?WARN</code> (OR match). Pattern <code>""</code> = SAB logs (yehi galti storage/cost blast karti hai).' },
          { answer: 'describe-delivery-stream', explain: '<code>describe-delivery-stream</code> se confirm karo destination = OpenSearch (+ S3 backup). Firehose fully managed hai, shards nahi.' },
          { answer: 'metric-filter', explain: '<code>put-metric-filter</code> — log se CloudWatch metric (ERROR count) banake alarm laga sakte ho, bina pipeline ke. Alag use-case.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: Log analytics pipeline banao aur verify',
        instructions: 'Logs OpenSearch tak pahunchane ka rasta jodo, aur har hop verify karo.',
        goal: 'PixShare ke logs bikhre hain. Pipeline banao: <b>(1)</b> <code>aws logs describe-log-groups</code> — kaunsi log groups hain. <b>(2)</b> <code>aws firehose describe-delivery-stream --delivery-stream-name logs-to-opensearch</code> — destination OpenSearch hai? <b>(3)</b> <code>aws opensearch describe-domain --domain-name pixshare-logs</code> — cluster multi-AZ + encrypted hai? <b>(4)</b> Log group ko Firehose se jodo: <code>aws logs put-subscription-filter --log-group-name /aws/lambda/feed-api --filter-name errors --filter-pattern "?ERROR ?WARN" --destination-arn arn:aws:firehose:us-east-1:123456789012:deliverystream/logs-to-opensearch</code>. <b>(5)</b> Verify: <code>aws logs describe-subscription-filters --log-group-name /aws/lambda/feed-api</code>.',
        tasks: [
          { text: 'aws logs describe-log-groups', check: s => s.history.some(h => /aws logs describe-log-groups/.test(h)) },
          { text: 'firehose describe-delivery-stream (destination?)', check: s => s.history.some(h => /aws firehose describe-delivery-stream/.test(h)) },
          { text: 'opensearch describe-domain (multi-AZ+encrypted?)', check: s => s.history.some(h => /aws opensearch describe-domain|aws es describe-domain/.test(h)) },
          { text: 'put-subscription-filter se log→Firehose jodo', check: s => { const lg = (s.account.logGroups || []).find(l => l.name === '/aws/lambda/feed-api'); return !!lg && (lg.subscriptionFilters || []).length > 0; } },
          { text: 'describe-subscription-filters se verify', check: s => s.history.some(h => /aws logs describe-subscription-filters/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
          logGroups: [
            { name: '/aws/lambda/feed-api', retention: 7, events: ['INFO request ok', 'ERROR db timeout'], subscriptionFilters: [] },
            { name: '/aws/lambda/photo-thumbnail', retention: 7, events: ['INFO thumb ok'], subscriptionFilters: [] },
            { name: '/ecs/pixshare-web', retention: 30, events: ['WARN high latency'], subscriptionFilters: [] },
          ],
          deliveryStreams: [
            { name: 'logs-to-opensearch', status: 'ACTIVE', source: 'directput', destination: 'opensearch', domain: 'pixshare-logs', backupS3: 'pixshare-logs-raw', backupAll: true, bufferMB: 5, bufferSec: 60 },
          ],
          opensearchDomains: [
            { name: 'pixshare-logs', version: 'OpenSearch_2.11', instanceType: 'r6g.large.search', instanceCount: 3, multiAZ: true, dedicatedMaster: true, volumeGB: 100, encrypted: true },
          ],
          buckets: [
            { name: 'pixshare-logs-raw', region: 'us-east-1', encryption: true, creationDate: '2026-04-01 09:00:00' },
          ],
        },
        success: s => {
          const lg = (s.account.logGroups || []).find(l => l.name === '/aws/lambda/feed-api');
          return !!lg && (lg.subscriptionFilters || []).some(f => /firehose/.test(f.destinationArn || ''))
            && s.history.some(h => /aws firehose describe-delivery-stream/.test(h))
            && s.history.some(h => /aws opensearch describe-domain|aws es describe-domain/.test(h))
            && s.history.some(h => /aws logs describe-subscription-filters/.test(h));
        },
        successText: '🎉 <b>Pipeline live — aur har hop verify kiya.</b> <code>feed-api</code> logs ab Subscription Filter (sirf <code>?ERROR ?WARN</code>) → Firehose → OpenSearch tak jaate hain, aur Firehose raw copy <code>pixshare-logs-raw</code> S3 par bhi bhejta hai. Firehose ka fayda dikha — koi shard manage nahi karna. OpenSearch domain <b>3 nodes, multi-AZ, encrypted, dedicated master</b> — production-grade. Aur filter pattern se sirf zaroori logs gaye (sab INFO nahi) — yehi cost/storage bachata hai. <b>Yaad rakho: filter karo, hot data OpenSearch mein short-retention, cold raw S3 mein.</b>',
        hints: [
          'aws logs describe-log-groups',
          'aws firehose describe-delivery-stream --delivery-stream-name logs-to-opensearch',
          'aws opensearch describe-domain --domain-name pixshare-logs',
          'aws logs put-subscription-filter --log-group-name /aws/lambda/feed-api --filter-name errors --filter-pattern "?ERROR ?WARN" --destination-arn arn:aws:firehose:us-east-1:123456789012:deliverystream/logs-to-opensearch',
          'aws logs describe-subscription-filters --log-group-name /aws/lambda/feed-api',
        ],
      },
      {
        type: 'quiz',
        title: 'Log ETL Quick-fire',
        questions: [
          {
            q: 'Log analytics pipeline mein Firehose kyun (Kinesis Data Streams nahi)?',
            choices: [
              'Firehose fully managed delivery hai (buffer+transform, no shards) — tumhe sirf logs OpenSearch/S3 tak reliably pahunchane hain, custom stream processing nahi',
              'Firehose real-time (ms) hai, Streams nahi',
              'Firehose sasta hamesha',
              'Streams OpenSearch support nahi karta',
            ],
            answer: 0,
            explain: 'Firehose = managed delivery (near-real-time). Kinesis Streams tab jab custom real-time consumers/replay chahiye. Log→OpenSearch ke liye Firehose default.',
          },
          {
            q: 'Ek log group par sirf ERROR/WARN chahiye pipeline mein — kaise?',
            choices: [
              'Subscription filter ka filter-pattern set karo ("?ERROR ?WARN") — sab logs bhejna storage+cost blast karta hai',
              'Sab bhej do, OpenSearch mein filter kar lena',
              'Firehose buffer badha do',
              'OpenSearch retention badha do',
            ],
            answer: 0,
            explain: 'Source par filter karo — pipeline ke aage sirf zaroori logs. "Sab OpenSearch mein daal do" classic cost/storage bug hai.',
          },
          {
            q: 'Ek log group par quick ad-hoc query chahiye, koi setup nahi. Best?',
            choices: [
              'CloudWatch Logs Insights — ek group par turant query, koi pipeline nahi. OpenSearch tab jab cross-service/high-volume/dashboards chahiye',
              'Poora OpenSearch cluster khada karo',
              'Athena',
              'Redshift',
            ],
            answer: 0,
            explain: 'Chhote/single-group ad-hoc = Logs Insights (zero setup). OpenSearch heavy-duty cross-service ke liye; Athena S3 ke historical logs ke liye.',
          },
          {
            q: '"5 min mein 100+ ERROR par page karo" — sabse simple?',
            choices: [
              'Metric Filter (pattern "ERROR") → CloudWatch metric → alarm. Poori search pipeline ki zaroorat nahi',
              'OpenSearch alerting setup karo',
              'Lambda jo logs poll kare',
              'Athena query cron',
            ],
            answer: 0,
            explain: 'Metric Filter log se metric banata hai; uspar alarm. Alerting ke liye pipeline over-engineering hai.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Observability Pipeline',
      instructions: 'Log analytics round. 🎤',
      questions: [
        {
          q: '"Centralized log search chahiye 20 microservices par. Pipeline design karo."',
          choices: [
            'Har service ki CloudWatch Logs par subscription filter (pattern) → Kinesis Firehose → OpenSearch (search+dashboards) + S3 (raw backup, Athena). Filter se sirf zaroori logs, OpenSearch short retention, cold data S3',
            'Sab logs ek OpenSearch mein bina filter',
            'Har service ka apna OpenSearch',
            'Sirf CloudWatch Logs Insights, kuch aur nahi',
          ],
          answer: 0,
          explain: 'Poora pipeline + cost-awareness (filter + tiering). "Sab bina filter" wala jawab cluster ko dubota hai.',
        },
        {
          q: 'Interviewer: "Firehose aur Kinesis Data Streams mein farak?"',
          choices: [
            'Firehose = fully-managed delivery to S3/OpenSearch/Redshift (buffer, no shards, near-real-time). Streams = raw real-time stream jise tum custom consumers se padhte ho (shards, replay, multiple readers)',
            'Firehose purana, Streams naya',
            'Dono same, naam alag',
            'Firehose sirf S3 ke liye',
          ],
          answer: 0,
          explain: 'Managed delivery vs custom stream — yeh core distinction hai. Log→OpenSearch ke liye Firehose.',
        },
        {
          q: '🎛️ Interviewer: "Pipeline health check karke batao kahin gap toh nahi."',
          terminal: {
            title: 'Interview hands-on — pipeline audit',
            goal: '🎛️ <b>Hands-on:</b> <b>(1)</b> <code>aws logs describe-subscription-filters --log-group-name /aws/lambda/checkout</code> — is critical service ke logs kahin stream ho rahe hain? <b>(2)</b> <code>aws firehose list-delivery-streams</code> aur <code>describe-delivery-stream</code>. <b>(3)</b> <code>aws opensearch describe-domain --domain-name pixshare-logs</code> — single-node toh nahi (prod risk)?',
            tasks: [
              { text: 'describe-subscription-filters on /aws/lambda/checkout', check: s => s.history.some(h => /aws logs describe-subscription-filters.*checkout/.test(h)) },
              { text: 'firehose list + describe', check: s => s.history.some(h => /aws firehose describe-delivery-stream/.test(h)) },
              { text: 'opensearch describe-domain', check: s => s.history.some(h => /aws opensearch describe-domain|aws es describe-domain/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              logGroups: [
                { name: '/aws/lambda/feed-api', retention: 7, events: [], subscriptionFilters: [{ name: 'errors', pattern: '?ERROR ?WARN', destinationArn: 'arn:aws:firehose:us-east-1:123456789012:deliverystream/logs-to-opensearch' }] },
                { name: '/aws/lambda/checkout', retention: 7, events: ['ERROR payment failed'], subscriptionFilters: [] },
              ],
              deliveryStreams: [
                { name: 'logs-to-opensearch', status: 'ACTIVE', source: 'directput', destination: 'opensearch', domain: 'pixshare-logs', backupS3: 'pixshare-logs-raw', bufferMB: 5, bufferSec: 60 },
              ],
              opensearchDomains: [
                { name: 'pixshare-logs', version: 'OpenSearch_2.11', instanceType: 'r6g.large.search', instanceCount: 1, multiAZ: false, dedicatedMaster: false, volumeGB: 100, encrypted: true },
              ],
            },
            success: s => s.history.some(h => /aws logs describe-subscription-filters.*checkout/.test(h))
              && s.history.some(h => /aws firehose describe-delivery-stream/.test(h))
              && s.history.some(h => /aws opensearch describe-domain|aws es describe-domain/.test(h)),
            successText: '✅ <b>Do gaps mile.</b> (1) <code>/aws/lambda/checkout</code> — sabse critical service — par <b>koi subscription filter nahi</b>: uske logs OpenSearch tak pahunch hi nahi rahe, incident ke waqt woh andhera. (2) <code>pixshare-logs</code> domain <b>single-node, multi-AZ off</b> hai — prod par woh ek node fail = search down. Fixes: checkout par filter lagao, aur OpenSearch ko 3-node multi-AZ karo. <b>Observability ka pipeline bhi HA hona chahiye — warna jab sabse zaroorat ho tab woh down milega.</b>',
            hints: [
              'aws logs describe-subscription-filters --log-group-name /aws/lambda/checkout',
              'aws firehose list-delivery-streams   phir   aws firehose describe-delivery-stream --delivery-stream-name logs-to-opensearch',
              'aws opensearch describe-domain --domain-name pixshare-logs   ← InstanceCount aur ZoneAwareness dekho',
            ],
          },
        },
      ],
    },
    success: [
      'Main CloudWatch → Subscription Filter → Firehose → OpenSearch (+S3) pipeline design kar sakta hoon',
      'Main Firehose vs Kinesis Data Streams ka farak justify kar sakta hoon',
      'Main OpenSearch vs Logs Insights vs Athena mein sahi tool chun sakta hoon',
      'Main Metric Filter se log-based alarm bana sakta hoon',
    ],
    homework: `<p>Free Tier par (chhota OpenSearch, delete kar dena — mehnga):</p>
      <pre># Metric filter se ERROR alarm (sasta, pehle try karo)
aws logs put-metric-filter --log-group-name /aws/lambda/demo \\
  --filter-name error-count --filter-pattern "ERROR" \\
  --metric-transformations metricName=Errors,metricNamespace=App,metricValue=1
# ...phir uspar CloudWatch alarm

# Subscription filter → Firehose → S3 (OpenSearch se sasta start)
#   1. Firehose delivery stream banao (destination: S3)
#   2. aws logs put-subscription-filter --filter-pattern "?ERROR ?WARN" --destination-arn <firehose-arn>
#   3. S3 mein logs land hote dekho, Athena se query karo

# Firehose vs Streams:
aws firehose list-delivery-streams
aws kinesis list-streams
# describe dono — Firehose mein shards nahi, Streams mein hain</pre>
      <p>✅ Self-check: Metric filter se alarm bana? Subscription filter ne sirf ERROR/WARN bheje (sab nahi)? Firehose ne bina shards ke S3 tak pahunchaya?</p>`,
    cards: [
      { front: 'Log analytics pipeline ka rasta?', back: 'CloudWatch Logs → <b>Subscription Filter</b> (pattern tap) → <b>Kinesis Firehose</b> (managed buffer+transform) → <b>OpenSearch</b> (search+dashboards) + <b>S3</b> (raw backup, Athena).' },
      { front: 'Firehose vs Kinesis Data Streams?', back: '<b>Firehose</b> = managed delivery to S3/OpenSearch/Redshift (buffer, no shards, near-real-time). <b>Streams</b> = raw real-time stream for custom consumers (shards, replay). Log→OpenSearch = Firehose.' },
      { front: 'OpenSearch vs Logs Insights vs Athena?', back: '<b>Logs Insights</b> = ek/kuch groups par quick ad-hoc, zero setup. <b>OpenSearch</b> = cross-service, high-volume, dashboards, full-text. <b>Athena</b> = S3 ke logs par occasional/historical SQL, serverless.' },
      { front: 'Metric Filter kya hai?', back: 'Log group par pattern (e.g. "ERROR") → CloudWatch <b>metric</b> → <b>alarm</b>. "5 min mein 100+ ERROR = page" bina kisi search pipeline ke.' },
      { front: 'Log pipeline ka #1 cost bug?', back: '<b>Bina filter ke sab logs OpenSearch mein daalna.</b> Fix: subscription filter pattern se sirf zaroori logs, OpenSearch short retention (hot search), cold raw S3 mein (Firehose ka doosra output) + lifecycle → Glacier.' },
    ],
  },

  /* ================= LEVEL 6: Edge & Network ================= */
  {
    id: 'edge',
    icon: '🌍',
    title: 'Edge & Network — ALB? NLB? API GW? CloudFront?',
    badge: 'Edge Emissary',
    objectives: [
      '<b>ALB vs NLB vs API Gateway</b> — L7 vs L4 vs managed API',
      '<b>CloudFront vs Global Accelerator</b> — cache vs anycast-TCP',
      '<b>VPC endpoints</b> — private access + NAT cost bachao',
      '<b>Kab NAHI</b>: NLB for L7, CloudFront for raw TCP',
    ],
    lesson: [
      `<h3>🧭 Entry point: traffic andar kaise aata hai</h3>
       <p>PixShare global ja rahi hai. Traffic ke andar aane ka sahi darwaza
       chuno — galat pick se latency, cost, ya missing features milte hain.</p>
       <table>
         <tr><th>Service</th><th>Layer / kya</th><th>Kab</th></tr>
         <tr><td><b>🚦 ALB</b></td><td>L7 (HTTP/HTTPS)</td><td>path/host routing, microservices, WAF, redirects</td></tr>
         <tr><td><b>⚡ NLB</b></td><td>L4 (TCP/UDP)</td><td>ultra-low latency, static IP, millions rps, non-HTTP</td></tr>
         <tr><td><b>🚪 API Gateway</b></td><td>managed API front</td><td>REST/HTTP APIs, auth/throttle/API keys, Lambda backend</td></tr>
       </table>
       <p>💡 <b>ALB</b> = smart HTTP router (URL path dekh ke alag service par
       bhej sakta hai). <b>NLB</b> = raw speed, TCP/UDP, static IP — HTTP ke smart
       features nahi, par bahut tez. <b>API Gateway</b> = jab API ke around auth,
       rate-limiting, keys, request validation chahiye (khaas kar serverless).</p>`,
      `<h3>🌍 Global reach: CloudFront vs Global Accelerator</h3>
       <p>Dono "global fast" karte hain, par bilkul alag:</p>
       <table>
         <tr><th></th><th>🛰️ CloudFront (CDN)</th><th>🌐 Global Accelerator</th></tr>
         <tr><td>Kaam</td><td><b>cache</b> content edge par (static+dynamic)</td><td><b>anycast IP</b>, traffic ko AWS backbone par jaldi laata</td></tr>
         <tr><td>Protocol</td><td>HTTP/HTTPS</td><td>koi bhi TCP/UDP</td></tr>
         <tr><td>Kab</td><td>websites, media, cacheable APIs</td><td>non-HTTP (gaming, IoT, VoIP), fast regional failover, static IPs</td></tr>
       </table>
       <p>💡 PixShare ke <b>photos/thumbnails</b> = CloudFront (cache at edge,
       users ke paas se serve). Ek <b>real-time multiplayer game server</b> (UDP)
       ya <b>static IP + instant failover</b> chahiye = Global Accelerator.
       Cacheable content par GA use karna paisa waste; raw TCP par CloudFront
       fit hi nahi.</p>`,
      `<h3>🔒 VPC Endpoints — private + sasta</h3>
       <p>Default mein, private subnet se S3/DynamoDB/etc. tak jaane ke liye
       traffic <b>NAT Gateway → internet</b> se jaata hai — jo per-GB charge karta
       hai (cost level mein detail). <b>VPC Endpoint</b> us traffic ko AWS ke andar
       hi rakhta hai:</p>
       <ul>
         <li><b>Gateway endpoint</b> (S3, DynamoDB) — <b>free</b>, route table entry.
             Isse S3/DDB traffic NAT se bachta = paisa bachta + private.</li>
         <li><b>Interface endpoint</b> (baaki services) — PrivateLink, per-hour +
             per-GB, par internet exposure khatam.</li>
       </ul>
       <div class="war-story"><b>⚡ Real trap:</b> Ek team ne PixShare ka API ALB
       ke peeche daala, aur "global fast" ke liye <b>Global Accelerator</b> laga
       diya. Par API cacheable content (feed JSON, images) serve karti thi — GA
       cache nahi karta, sirf routing tez karta hai. Result: har request abhi bhi
       origin tak jaati thi, latency zyada nahi giri, aur GA ka bill add ho gaya.
       Fix: <b>CloudFront</b> laga diya — feed/images edge par cache hone lage,
       origin load 70% gira, latency bhi. <b>Sabak: cacheable = CloudFront; GA
       tab jab content cache nahi ho sakta (raw TCP/UDP) ya static-IP/instant-failover
       chahiye.</b></div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Scenario → sahi entry/edge service',
        instructions: 'Har requirement ko sabse fit service mein daalo.',
        bins: [
          { id: 'alb', label: '🚦 ALB (L7)' },
          { id: 'nlb', label: '⚡ NLB (L4)' },
          { id: 'apigw', label: '🚪 API Gateway' },
          { id: 'cloudfront', label: '🛰️ CloudFront' },
          { id: 'ga', label: '🌐 Global Accelerator' },
        ],
        items: [
          { text: '/api/* ko service-A, /images/* ko service-B — URL path se routing', bin: 'alb', explain: 'L7 path-based routing = ALB. NLB path nahi dekh sakta (L4).' },
          { text: 'Millions of TCP connections, ultra-low latency, static IP chahiye', bin: 'nlb', explain: 'L4 raw speed + static IP = NLB.' },
          { text: 'Serverless REST API with auth, rate-limiting, API keys', bin: 'apigw', explain: 'Managed API features + Lambda backend = API Gateway.' },
          { text: 'Photos/thumbnails ko global users ke paas cache karke serve', bin: 'cloudfront', explain: 'Cacheable content edge par = CloudFront CDN.' },
          { text: 'Real-time UDP game server, fast regional failover', bin: 'ga', explain: 'Non-HTTP (UDP) + anycast + failover = Global Accelerator.' },
          { text: 'Cacheable feed JSON ko edge se serve, origin load kam', bin: 'cloudfront', explain: 'Dynamic-but-cacheable bhi CloudFront karta hai (TTL/behaviors).' },
          { text: 'Two static IPs chahiye jinke peeche multi-region endpoints, instant failover', bin: 'ga', explain: 'Static anycast IPs + multi-region failover = Global Accelerator.' },
          { text: 'HTTP microservices with WAF + host-based routing', bin: 'alb', explain: 'L7 + WAF integration = ALB.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Edge map par ungli rakho',
        instructions: 'Diagram mein sahi service par click karo.',
        visual: 'edge',
        questions: [
          { q: 'HTTP path/host routing + WAF — kaunsa?', target: 'alb', explain: 'ALB — L7 smart routing. Microservices ke aage.' },
          { q: 'Raw TCP/UDP, ultra-low latency, static IP — kaunsa?', target: 'nlb', explain: 'NLB — L4. HTTP smarts nahi, par bahut tez.' },
          { q: 'Cacheable content ko global edge par serve — kaunsa?', target: 'cloudfront', explain: 'CloudFront — CDN cache. Origin load + latency dono kam.' },
          { q: 'NLB kab galat? (path routing chahiye)', target: 'nlbno', explain: 'L7 path/host routing chahiye toh NLB nahi (woh L4 hai) — ALB use karo.' },
        ],
      },
      {
        type: 'match',
        title: 'Edge service → uska core faayda',
        instructions: 'Har service ko uske asli faayde se jodo.',
        pairs: [
          { left: '🚦 ALB', right: 'L7 HTTP smart routing (path/host) + WAF', explain: 'Content-aware routing to microservices.' },
          { left: '⚡ NLB', right: 'L4 raw speed, static IP, millions rps, TCP/UDP', explain: 'Jab HTTP smarts nahi chahiye, sirf throughput+latency.' },
          { left: '🚪 API Gateway', right: 'Managed API: auth, throttle, keys, request validation', explain: 'Serverless API front — Lambda/HTTP backend ke aage.' },
          { left: '🛰️ CloudFront', right: 'Cache content at edge (static + cacheable dynamic)', explain: 'Origin load kam, latency kam. Cacheable ke liye.' },
          { left: '🌐 Global Accelerator', right: 'Anycast static IP, non-HTTP TCP/UDP, instant failover', explain: 'Raw protocol global speed + failover, cache nahi.' },
        ],
      },
      {
        type: 'incident',
        title: '🧩 Decision: PixShare goes global',
        instructions: 'Users duniya bhar mein. Sahi edge/network chuno.',
        pager: '<b>PixShare — global launch</b><br>Users ab US, EU, India, Brazil se. Complaints: photos slow load hote hain door se, aur ek naya multiplayer "photo-battle" game UDP par chahiye. Edge + network design karo.',
        start: 'media',
        nodes: {
          media: {
            text: 'Photos/thumbnails door ke users ko tez dene ka pehla kadam?',
            choices: [
              { t: 'CloudFront (CDN) — content edge par cache, users ke paas se serve', good: true, next: 'api', explain: 'Cacheable media = CloudFront. Edge cache se latency + origin load dono girte hain.' },
              { t: 'Har region mein S3 bucket replicate karke app mein logic likho', good: false, explain: 'Yeh CloudFront khud karta hai (edge cache) bina tumhare replication/logic ke. Reinvent mat karo.' },
              { t: 'Global Accelerator laga do', good: false, explain: 'GA routing tez karta hai par cache NAHI — media har baar origin se aayega. Cacheable content par CloudFront chahiye.' },
            ],
          },
          api: {
            sitrep: 'Media CloudFront par. Ab main API: HTTP, aur alag paths (/feed, /users, /upload) alag services par jaate hain.',
            text: 'API ka entry point?',
            choices: [
              { t: 'ALB — L7 path-based routing to microservices (+ WAF)', good: true, next: 'game', explain: 'HTTP + path routing = ALB. Har path apni target group par. CloudFront ise origin bana sakta hai.' },
              { t: 'NLB', good: false, explain: 'NLB L4 hai — woh URL path nahi dekh sakta, isliye /feed vs /users route nahi kar sakta. L7 ke liye ALB.' },
              { t: 'Seedha EC2 public IP par', good: false, explain: 'No load balancing, no routing, no WAF, no HA. Prod mein entry point managed hona chahiye.' },
            ],
          },
          game: {
            sitrep: 'API ALB par. Ab "photo-battle" — real-time multiplayer, UDP, low latency, aur players ko ek stable IP chahiye.',
            text: 'Game server ka global entry?',
            choices: [
              { t: 'Global Accelerator — anycast static IPs, UDP, AWS backbone se low latency + failover', good: true, next: 'private', explain: 'Non-HTTP (UDP) + static IP + instant failover = Global Accelerator. CloudFront yahan fit hi nahi (woh HTTP cache hai).' },
              { t: 'CloudFront', good: false, explain: 'CloudFront HTTP content cache hai — real-time UDP game traffic ke liye nahi. Yeh galat tool hai.' },
              { t: 'ALB', good: false, explain: 'ALB L7 HTTP hai; raw UDP game protocol ke liye nahi. NLB+GA yahan fit hain.' },
            ],
          },
          private: {
            sitrep: 'Edge sort. Ab private subnets se S3 (media) aur DynamoDB (feed) tak bahut traffic jaata hai — NAT Gateway ka bill badh raha hai.',
            text: 'S3/DynamoDB traffic ka NAT cost kaise kam karo?',
            choices: [
              { t: 'VPC Gateway Endpoint for S3 & DynamoDB — free, traffic AWS ke andar, NAT bypass', good: true, next: 'done', explain: 'Gateway endpoints (S3/DDB) free hain aur traffic ko NAT/internet se bachate hain — cost bhi kam, private bhi.' },
              { t: 'NAT Gateway aur bada kar do', good: false, explain: 'NAT badhane se cost aur badhega. S3/DDB ke liye gateway endpoint use karke NAT bypass karo (free).' },
              { t: 'Private subnets ko public bana do', good: false, explain: 'Security disaster — resources internet-exposed. Endpoint sahi (aur sasta) raasta hai.' },
            ],
          },
          done: {
            end: true,
            text: 'PixShare global — sahi darwaza har traffic ke liye 🎉',
            summary: `<b>Kya seekha:</b>
              <ul>
                <li><b>Cacheable media/API</b> → CloudFront (edge cache).</li>
                <li><b>HTTP path routing</b> → ALB (L7 + WAF). <b>NLB</b> = L4 raw speed.</li>
                <li><b>Non-HTTP (UDP game) + static IP + failover</b> → Global Accelerator (cache nahi).</li>
                <li><b>Private S3/DDB access</b> → VPC Gateway Endpoint (free, NAT bypass).</li>
              </ul>
              <b>Pattern:</b> "global fast" ke do matlab hain — <b>cache</b> (CloudFront) ya <b>routing</b> (Global Accelerator). Protocol + cacheability decide karte hain.`,
          },
        },
      },
    ],
    interview: {
      title: 'Interview Round — Edge & Network',
      instructions: 'Networking round. 🎤',
      questions: [
        {
          q: '"ALB aur NLB mein kaise choose karte ho?"',
          choices: [
            'HTTP smarts chahiye (path/host routing, WAF, redirects) → ALB (L7). Raw TCP/UDP throughput, ultra-low latency, static IP, non-HTTP → NLB (L4)',
            'NLB hamesha better, tez hai',
            'ALB hamesha, modern hai',
            'Dono same, naam alag',
          ],
          answer: 0,
          explain: 'L7 (content-aware) vs L4 (raw). "NLB path route kar sakta hai" galat hai — woh L4 hai.',
        },
        {
          q: 'Interviewer: "CloudFront aur Global Accelerator dono global speed dete hain — farak?"',
          choices: [
            'CloudFront content ko edge par CACHE karta hai (HTTP, cacheable). Global Accelerator anycast static IP se traffic ko AWS backbone par jaldi laata hai (koi bhi TCP/UDP), cache nahi — non-HTTP/failover/static-IP ke liye',
            'CloudFront purana, GA naya',
            'Dono cache karte hain',
            'GA sirf S3 ke liye',
          ],
          answer: 0,
          explain: 'Cache vs routing. Cacheable content par GA use karna paisa waste; raw TCP par CloudFront fit nahi.',
        },
        {
          q: '🎛️ Interviewer: "Edge setup inspect karke galtiyan batao."',
          terminal: {
            title: 'Interview hands-on — edge audit',
            goal: '🎛️ <b>Hands-on:</b> <b>(1)</b> <code>aws elbv2 describe-load-balancers</code> — kaunse LB, type (ALB/NLB), scheme. <b>(2)</b> <code>aws cloudfront list-distributions</code> — CDN laga hai media par? <b>(3)</b> <code>aws ec2 describe-nat-gateways</code> — NAT hai; socho S3/DDB ke liye gateway endpoint se bachat ho sakti.',
            tasks: [
              { text: 'aws elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
              { text: 'aws cloudfront list-distributions', check: s => s.history.some(h => /aws cloudfront list-distributions/.test(h)) },
              { text: 'aws ec2 describe-nat-gateways', check: s => s.history.some(h => /aws ec2 describe-nat-gateways/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              elbs: [
                { id: 'elb-1', name: 'pixshare-api-alb', type: 'application', scheme: 'internet-facing', dns: 'pixshare-api-alb-123.us-east-1.elb.amazonaws.com' },
                { id: 'elb-2', name: 'photo-battle-nlb', type: 'network', scheme: 'internet-facing', dns: 'photo-battle-nlb-456.us-east-1.elb.amazonaws.com' },
              ],
              cloudfront: [
                { id: 'E1PIX', domain: 'd111.cloudfront.net', origins: ['pixshare-media.s3.amazonaws.com'], status: 'Deployed', enabled: true },
              ],
              natGateways: [
                { id: 'nat-abc', subnetId: 'subnet-public-1a', state: 'available', publicIp: '52.1.2.3' },
              ],
            },
            success: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h))
              && s.history.some(h => /aws cloudfront list-distributions/.test(h))
              && s.history.some(h => /aws ec2 describe-nat-gateways/.test(h)),
            successText: '✅ Setup mostly sahi hai: <b>ALB</b> API ke liye (L7 routing) ✅, <b>NLB</b> photo-battle game ke liye (L4/UDP) ✅, <b>CloudFront</b> media par (edge cache) ✅. Ek cost opportunity: ek <b>NAT Gateway</b> chal raha hai — agar private subnets se S3 (<code>pixshare-media</code>) aur DynamoDB tak bahut traffic hai, toh <b>VPC Gateway Endpoints</b> (free) us traffic ko NAT se bachayenge, per-GB bill kam. <b>Har entry service apne protocol/layer se match karti hai — ab NAT cost ka agla level.</b>',
            hints: [
              'aws elbv2 describe-load-balancers   ← Type: application (ALB) vs network (NLB)',
              'aws cloudfront list-distributions',
              'aws ec2 describe-nat-gateways   ← S3/DDB ke liye gateway endpoint se bachat socho',
            ],
          },
        },
      ],
    },
    success: [
      'Main ALB (L7) vs NLB (L4) vs API Gateway mein sahi choice kar sakta hoon',
      'Main CloudFront (cache) vs Global Accelerator (anycast routing) mein choose kar sakta hoon',
      'Main VPC gateway/interface endpoints se private access + NAT cost bachao samjhta hoon',
      'Main jaanta hoon kab NLB galat (L7 routing) aur CloudFront galat (raw TCP)',
    ],
    homework: `<p>Free Tier par edge chakho:</p>
      <pre># ALB (L7) — path routing
#   listener rule: /api/* → target-group-A, /img/* → target-group-B

# NLB (L4) — TCP passthrough, static IP
#   ALB se compare: NLB path/host nahi dekh sakta

# CloudFront distribution S3 origin par
aws cloudfront list-distributions
#   cache behaviors set karo, edge se serve hote dekho (X-Cache: Hit)

# VPC Gateway Endpoint (S3) — free, NAT bypass
aws ec2 create-vpc-endpoint --vpc-id <vpc> --service-name com.amazonaws.us-east-1.s3 \\
  --route-table-ids <rt>
#   ab private subnet se S3 traffic NAT se nahi, endpoint se jaata (sasta+private)</pre>
      <p>✅ Self-check: ALB path-routing chala? NLB static IP mila? CloudFront ne <code>X-Cache: Hit</code> diya? S3 gateway endpoint free tha?</p>`,
    cards: [
      { front: 'ALB vs NLB vs API Gateway?', back: '<b>ALB</b> = L7 HTTP smart routing (path/host, WAF). <b>NLB</b> = L4 raw TCP/UDP, static IP, ultra-low latency, millions rps. <b>API Gateway</b> = managed API (auth/throttle/keys), serverless backend.' },
      { front: 'CloudFront vs Global Accelerator?', back: '<b>CloudFront</b> = CDN, content ko edge par <b>cache</b> (HTTP/cacheable). <b>Global Accelerator</b> = anycast static IP, traffic ko AWS backbone par jaldi laata (koi bhi TCP/UDP), <b>cache nahi</b> — non-HTTP/failover/static-IP.' },
      { front: 'NLB kab galat?', back: 'Jab <b>L7 path/host routing</b> ya WAF chahiye — NLB L4 hai, woh URL path nahi dekh sakta. ALB use karo.' },
      { front: 'VPC Gateway Endpoint?', back: '<b>S3 & DynamoDB</b> ke liye <b>free</b> endpoint — private subnet ka traffic NAT/internet se bachta, AWS ke andar rehta. NAT bill kam + private. (Baaki services = interface endpoint / PrivateLink, paid.)' },
      { front: '"Global fast" ke 2 matlab?', back: '<b>Cache</b> (CloudFront — cacheable HTTP content) ya <b>routing</b> (Global Accelerator — raw TCP/UDP anycast). Protocol + cacheability decide karti hai.' },
    ],
  },

  /* ================= LEVEL 7: Cost decisions ================= */
  {
    id: 'costdec',
    icon: '💰',
    title: 'Cost Decisions — Sasta Lagta, Mehnga Nikla',
    badge: 'Bill Bachane Wala',
    objectives: [
      '<b>Chhupe kharche</b>: NAT Gateway, cross-AZ/egress transfer, idle resources',
      '<b>Levers</b>: Savings Plans/RI (steady), Spot (interruptible), Graviton, lifecycle',
      '<b>Break-even</b> soch — Lambda vs Fargate/EC2',
      '<b>Cost = architecture decision</b>, baad ki safai nahi',
    ],
    lesson: [
      `<h3>🧭 Bill kahan se aata hai (jahan tum dekhte nahi)</h3>
       <p>PixShare ka bill 3 mahine mein $4k se <b>$28k</b> ho gaya, jabki users
       sirf 3x badhe. Compute/storage line-items normal the. Asli kharcha teen
       chhupi jagah tha:</p>
       <table>
         <tr><th>Chhupa kharcha</th><th>Kya hota hai</th><th>Ilaaj</th></tr>
         <tr><td><b>🚪 NAT Gateway</b></td><td>hourly + <b>per-GB</b> processed. Private subnet ka har byte (S3/DDB samet) isse guzarta hai</td><td><b>VPC Gateway Endpoint</b> (S3/DynamoDB) — free, NAT bypass</td></tr>
         <tr><td><b>🌐 Data transfer</b></td><td>internet egress + <b>cross-AZ</b> traffic (dono taraf charge)</td><td>same-AZ mein rakho jahan safe ho, CloudFront se egress sasta</td></tr>
         <tr><td><b>💤 Idle / orphan</b></td><td>un-attached EBS volumes, purane snapshots, idle RDS, bhoole huye env</td><td>tagging + regular sweep, auto-stop dev</td></tr>
       </table>
       <p>💡 <b>Cost Explorer mein pehle "Data Transfer" aur "NAT Gateway" dekho</b>
       — compute se pehle. Log hamesha instance size dekhte hain aur yeh miss
       karte hain.</p>`,
      `<h3>💰 Teen bade levers</h3>
       <ul>
         <li>📉 <b>Savings Plans / Reserved Instances</b> — 1-3 saal commit,
             <b>40-70% off</b>. <b>Steady, predictable</b> baseline par lagao
             (woh compute jo hamesha chalta hai). Compute Savings Plan sabse
             flexible (EC2/Fargate/Lambda par lagta hai).</li>
         <li>🎰 <b>Spot</b> — <b>70-90% off</b>, par 2-min notice par chhin sakta.
             Sirf <b>fault-tolerant/interruptible</b> par: batch, thumbnails,
             stateless ASG, CI. Stateful DB par kabhi nahi.</li>
         <li>🦾 <b>Graviton + right-sizing + S3 lifecycle</b> — Graviton ~20% off
             (Lambda/Fargate/EC2), right-size = jitni zaroorat utni, aur S3
             lifecycle purana data IA/Glacier par (~80% off).</li>
       </ul>
       <p>⚠️ <b>Commit karne se pehle right-size karo.</b> Warna tum apne
       over-provisioned setup ko 3 saal ke liye lock kar doge — "discount" par
       waste kharidna.</p>`,
      `<h3>⚖️ Break-even — "serverless hamesha sasta" phir se</h3>
       <p>Compute level ka sabak yahan paisa banta hai. Lambda ka bill
       <b>invocations × duration × memory</b> hai. Idle par $0 — isliye spiky par
       jeet-ta hai. Par ek endpoint jo <b>24×7 steady</b> chal raha hai, wahan
       always-on Fargate/EC2 (+ Savings Plan) aksar sasta pad jaata hai.</p>
       <pre>Spiky / low / uncertain   → Lambda (idle $0)
Steady 24×7 high          → Fargate/EC2 + Savings Plan (per-invoke bill se bachao)
Interruptible bulk        → Spot (70-90% off)</pre>
       <div class="war-story"><b>⚡ Real incident:</b> PixShare ke $28k bill ki
       jaanch mein sabse bada single line-item <b>NAT Gateway data processing</b>
       nikla — $9k. Wajah: thumbnail Lambdas private subnet mein the aur har
       photo <b>S3 se</b> padhte the, matlab har byte NAT se guzarta tha. Fix ek
       cheez thi: <b>S3 ke liye VPC Gateway Endpoint</b> (jo <b>free</b> hai) —
       woh traffic NAT se hat gaya. $9k → ~$0. Doosra $6k <b>cross-AZ transfer</b>
       tha (app ek AZ, cache doosri AZ). <b>Sabak: bade bill aksar compute se
       nahi, data ke <i>raaste</i> se aate hain — data kis rasta jaa raha hai woh
       architecture decision hai.</b></div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Bill badhata hai ya ghatata hai?',
        instructions: 'Har cheez ko sahi bin mein daalo.',
        bins: [
          { id: 'trap', label: '💸 Chhupa kharcha (trap)' },
          { id: 'lever', label: '💰 Bachat ka lever' },
        ],
        items: [
          { text: 'Private subnet se S3 par bahut traffic, bina VPC endpoint', bin: 'trap', explain: 'Har byte NAT Gateway se = per-GB charge. Gateway endpoint (free) se bypass karo.' },
          { text: 'App ek AZ mein, uska cache doosri AZ mein', bin: 'trap', explain: 'Cross-AZ data transfer dono taraf charge hota hai. Same-AZ rakho jahan resilience allow kare.' },
          { text: 'Un-attached EBS volumes aur 2 saal purane snapshots', bin: 'trap', explain: 'Idle/orphan storage chup-chaap bill deta hai. Regular sweep + tagging.' },
          { text: 'Steady 24×7 baseline compute par Compute Savings Plan', bin: 'lever', explain: '40-70% off predictable baseline par. Pehle right-size, phir commit.' },
          { text: 'Nightly batch job ko Spot par chalana', bin: 'lever', explain: 'Interruptible kaam par 70-90% off — Spot ka ideal case.' },
          { text: 'S3 lifecycle: 90 din baad Glacier', bin: 'lever', explain: 'Purana data sasta tier par — ~80% storage saving, zero code change.' },
          { text: 'Lambda ko 24×7 steady high traffic par rakhna', bin: 'trap', explain: 'Per-invoke bill jama ho ke always-on compute se mehnga pad jaata hai. Break-even dekho.' },
          { text: 'Graviton (arm64) par shift karna', bin: 'lever', explain: '~20% sasta (aksar tez bhi) — Lambda/Fargate/EC2 sab par.' },
          { text: 'Dev environment raat bhar aur weekend chalte rehna', bin: 'trap', explain: 'Non-prod ko schedule se band karo — aasan 60-70% dev saving.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Cost map par ungli rakho',
        instructions: 'Diagram mein sahi cheez click karo.',
        visual: 'costdec',
        questions: [
          { q: 'Private subnet ka har byte isse guzarta hai — aur per-GB charge hota hai?', target: 'nat', explain: 'NAT Gateway. S3/DynamoDB ke liye VPC Gateway Endpoint (free) se bypass karo.' },
          { q: 'Steady predictable load par 40-70% bachane wala lever?', target: 'commit', explain: 'Savings Plans / Reserved Instances. Pehle right-size, phir commit.' },
          { q: 'Interruptible batch par 70-90% off — par 2-min notice par chhin sakta?', target: 'spot', explain: 'Spot. Fault-tolerant kaam par hi — stateful DB par kabhi nahi.' },
          { q: 'Lambda kab mehnga pad jaata hai?', target: 'breakeven', explain: 'Steady 24×7 high load par — per-invoke bill jama hota hai. Wahan Fargate/EC2 + Savings Plan.' },
        ],
      },
      {
        type: 'incident',
        title: '🧩 Decision: $28k ka bill',
        instructions: 'CFO ne bill dekha. Sahi jagah dekho, sahi lever lagao.',
        pager: '<b>PixShare — bill shock</b><br>Bill 3 mahine mein $4k → <b>$28k</b>, par users sirf 3x badhe. CFO ne meeting bulayi hai. Instance sizes normal dikhte hain. Kahan dekhoge?',
        start: 'where',
        nodes: {
          where: {
            text: 'Cost investigation kahan se shuru?',
            choices: [
              { t: 'Cost Explorer mein service+usage-type se break down karo — khaas kar Data Transfer aur NAT Gateway line-items', good: true, next: 'nat', explain: 'Data pehle. Bade bills aksar data transfer/NAT se aate hain, compute se nahi — aur log wahin dekhna bhool jaate hain.' },
              { t: 'Sab instances ek size chhota kar do', good: false, explain: 'Bina measure kiye cutting = performance risk aur shayad asli kharcha chhua hi nahi. Pehle break down karo.' },
              { t: 'Reserved Instances abhi kharid lo', good: false, explain: 'Right-size aur asli kharcha samjhe bina commit karna = waste ko 3 saal lock karna.' },
            ],
          },
          nat: {
            sitrep: 'Break-down: <b>NAT Gateway data processing $9k</b>, <b>cross-AZ transfer $6k</b>, compute $8k, storage $5k. Thumbnail Lambdas private subnet mein hain aur har photo S3 se padhte hain.',
            text: '$9k NAT charge ka ilaaj?',
            choices: [
              { t: 'S3 (aur DynamoDB) ke liye VPC Gateway Endpoint lagao — free, aur woh traffic NAT se hat jaata hai', good: true, next: 'az', explain: 'Gateway endpoints free hain. S3/DDB traffic NAT bypass karke AWS ke andar rehta — $9k lagbhag $0.' },
              { t: 'NAT Gateway hata do, Lambdas ko public subnet mein daal do', good: false, explain: 'Security downgrade aur baaki internet traffic toot jaayega. Endpoint sahi (aur free) fix hai.' },
              { t: 'Thumbnails kam karo', good: false, explain: 'Product feature kaatna cost bug ka ilaaj nahi. Data ka raasta theek karo.' },
            ],
          },
          az: {
            sitrep: 'NAT charge khatam. Ab $6k cross-AZ: app us-east-1a mein, ElastiCache us-east-1b mein — har cache read AZ boundary cross karta hai.',
            text: 'Cross-AZ transfer ka ilaaj?',
            choices: [
              { t: 'Cache replica har AZ mein rakho taaki reads same-AZ se hon (resilience bhi bani rahe)', good: true, next: 'commit', explain: 'Same-AZ reads = koi cross-AZ charge nahi, aur multi-AZ replicas se HA bhi bachi. Cost aur resilience dono.' },
              { t: 'Sab kuch ek hi AZ mein daal do', good: false, explain: 'Cost toh bachega par <b>single-AZ prod</b> ban jayega — ek AZ gaya, app gayi. Cost ke liye resilience mat becho.' },
              { t: 'Cache hata do', good: false, explain: 'Cache hatane se DB load aur latency badhegi — bill kahin aur badh jayega.' },
            ],
          },
          commit: {
            sitrep: 'Transfer charges fix. Ab $8k compute: ek steady 24×7 API fleet, aur nightly batch jobs.',
            text: 'Compute par kaunse levers?',
            choices: [
              { t: 'Pehle right-size karo, phir steady baseline par Savings Plan, aur nightly batch ko Spot par — plus Graviton', good: true, next: 'done', explain: 'Sahi order: <b>right-size → commit</b> (steady) → <b>Spot</b> (interruptible) → Graviton. Over-provisioned setup par commit karna waste lock karta hai.' },
              { t: 'Seedha 3-saal ka RI kharid lo current sizes par', good: false, explain: 'Right-size kiye bina commit = waste ko 3 saal ke liye lock. Pehle sizing theek karo.' },
              { t: 'Sab kuch Spot par daal do', good: false, explain: 'User-facing steady API Spot par = interruptions se outages. Spot sirf fault-tolerant/interruptible par.' },
            ],
          },
          done: {
            end: true,
            text: 'Bill $28k → $11k, bina koi feature kaate 🎉',
            summary: `<b>Kya seekha:</b>
              <ul>
                <li><b>Pehle measure</b> — Cost Explorer mein Data Transfer + NAT dekho, compute se pehle.</li>
                <li><b>NAT ka per-GB</b> sabse chhupa kharcha — S3/DDB ke liye <b>VPC Gateway Endpoint (free)</b>.</li>
                <li><b>Cross-AZ</b> transfer dono taraf charge — par cost ke liye single-AZ mat karo (resilience!).</li>
                <li><b>Lever order:</b> right-size → Savings Plan (steady) → Spot (interruptible) → Graviton/lifecycle.</li>
              </ul>
              <b>Cost ek architecture decision hai</b> — data ka raasta, compute ka shape, aur commitment sab design ka hissa hain.`,
          },
        },
      },
      {
        type: 'quiz',
        title: 'Cost Quick-fire',
        questions: [
          {
            q: 'Private subnet se S3 par bahut traffic hai. Sabse bada cost fix?',
            choices: [
              'S3 ke liye VPC Gateway Endpoint — free hai aur woh traffic NAT Gateway (per-GB) se bypass kar deta hai',
              'NAT Gateway ko bada karo',
              'S3 bucket dusre region mein le jao',
              'Lambda memory kam karo',
            ],
            answer: 0,
            explain: 'Gateway endpoints (S3/DynamoDB) free hain. Yeh aksar sabse bada single-line-item saving hota hai.',
          },
          {
            q: 'Savings Plan kharidne se PEHLE kya karna chahiye?',
            choices: [
              'Right-size karo — warna over-provisioned setup ko 1-3 saal ke liye lock kar doge',
              'Turant kharid lo, discount jaldi shuru ho',
              'Sab kuch Spot par daal do',
              'Region badal do',
            ],
            answer: 0,
            explain: 'Commit waste ko lock kar deta hai. Order: right-size → commit.',
          },
          {
            q: 'Kaunsa workload Spot par NAHI daalna chahiye?',
            choices: [
              'Steady user-facing API — Spot 2-min notice par chhin sakta hai, interruptions = outage',
              'Nightly batch job',
              'CI/CD runners',
              'Stateless thumbnail workers',
            ],
            answer: 0,
            explain: 'Spot fault-tolerant/interruptible ke liye. User-facing steady load par Savings Plan wala on-demand/reserved chahiye.',
          },
          {
            q: 'Bill spike investigate karne ka pehla kadam?',
            choices: [
              'Cost Explorer mein service + usage-type se break down karo (Data Transfer/NAT aksar chhupe hote hain)',
              'Sab instances chhote kar do',
              'Purane snapshots delete kar do',
              'Region badal do',
            ],
            answer: 0,
            explain: 'Measure first. Blind cutting performance todta hai aur asli kharcha aksar data transfer mein chhupa hota hai.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Cost',
      instructions: 'FinOps round. 🎤',
      questions: [
        {
          q: '"AWS bill achanak double ho gaya. Kaise investigate karoge?"',
          choices: [
            'Cost Explorer mein service + usage-type se break down karunga — khaas kar Data Transfer aur NAT Gateway, jo aksar chhupe bade kharche hote hain; phir right-size → commit → Spot ke order mein levers lagaunga',
            'Sab instances ek size chhota kar dunga',
            'Reserved Instances kharid lunga',
            'Purana data delete kar dunga',
          ],
          answer: 0,
          explain: 'Measure-first + "data transfer aksar chhupa hota hai" bolna asli experience dikhata hai. Blind cutting ya blind commit dono galat.',
        },
        {
          q: 'Interviewer: "Cost bachane ke liye sab kuch ek AZ mein daal dein?"',
          choices: [
            'Nahi — cross-AZ charge bachega par prod single-AZ ho jayega (ek AZ gaya, app gayi). Behtar: har AZ mein replica rakho taaki reads same-AZ hon aur HA bhi bani rahe',
            'Haan, sabse sasta yahi hai',
            'Haan, agar AZ bada ho',
            'Farak nahi padta',
          ],
          answer: 0,
          explain: 'Cost aur resilience ka trade-off pehchanna zaroori hai — yahan dono sadhne ka rasta hai (per-AZ replicas).',
        },
        {
          q: '🎛️ Interviewer: "Account mein cost waste dhoondh ke dikhao."',
          terminal: {
            title: 'Interview hands-on — cost audit',
            goal: '🎛️ <b>Hands-on:</b> PixShare account mein waste dhoondo. <b>(1)</b> <code>aws ec2 describe-volumes</code> — koi un-attached (available) volume? <b>(2)</b> <code>aws ec2 describe-nat-gateways</code> — NAT hai (S3/DDB endpoint se bachat?). <b>(3)</b> <code>aws ec2 describe-instances</code> — koi bada idle box? <b>(4)</b> <code>aws rds describe-db-instances</code> — dev DB bada/Multi-AZ toh nahi.',
            tasks: [
              { text: 'aws ec2 describe-volumes — orphan volumes', check: s => s.history.some(h => /aws ec2 describe-volumes/.test(h)) },
              { text: 'aws ec2 describe-nat-gateways', check: s => s.history.some(h => /aws ec2 describe-nat-gateways/.test(h)) },
              { text: 'aws ec2 describe-instances', check: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) },
              { text: 'aws rds describe-db-instances', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              volumes: [
                { id: 'vol-attached1', size: 100, type: 'gp3', state: 'in-use', attachedTo: 'i-api01' },
                { id: 'vol-orphan1', size: 500, type: 'gp2', state: 'available' },
                { id: 'vol-orphan2', size: 200, type: 'gp2', state: 'available' },
              ],
              natGateways: [{ id: 'nat-pix', subnetId: 'subnet-public-1a', state: 'available', publicIp: '52.9.9.9' }],
              instances: [
                { id: 'i-api01', name: 'api-server', type: 'c6g.large', state: 'running', az: 'us-east-1a', vpcId: 'vpc-pix', subnetId: 'subnet-a', sgIds: ['sg-1'], publicIp: null, privateIp: '10.0.1.5' },
                { id: 'i-old99', name: 'poc-box-2024', type: 'm5.4xlarge', state: 'running', az: 'us-east-1a', vpcId: 'vpc-pix', subnetId: 'subnet-a', sgIds: ['sg-1'], publicIp: null, privateIp: '10.0.1.99' },
              ],
              rds: [
                { id: 'pixshare-prod', name: 'pixshare-prod', engine: 'aurora-postgresql', class: 'db.r6g.large', state: 'available', multiAZ: true, endpoint: 'prod.rds.amazonaws.com', storage: 200 },
                { id: 'pixshare-dev', name: 'pixshare-dev', engine: 'postgres', class: 'db.r6g.2xlarge', state: 'available', multiAZ: true, endpoint: 'dev.rds.amazonaws.com', storage: 200 },
              ],
            },
            success: s => s.history.some(h => /aws ec2 describe-volumes/.test(h))
              && s.history.some(h => /aws ec2 describe-nat-gateways/.test(h))
              && s.history.some(h => /aws ec2 describe-instances/.test(h))
              && s.history.some(h => /aws rds describe-db-instances/.test(h)),
            successText: '✅ <b>Chaar waste mile:</b> (1) <code>vol-orphan1</code> + <code>vol-orphan2</code> — 700GB un-attached EBS jo chup-chaap bill de raha hai. (2) <code>poc-box-2024</code> — ek <b>m5.4xlarge</b> jo 2024 ke POC se chal raha hai. (3) <code>pixshare-dev</code> — dev DB <b>r6g.2xlarge + Multi-AZ</b> (dev ko Multi-AZ ki zaroorat nahi, aur size prod jitna!). (4) NAT Gateway — agar S3/DDB traffic zyada hai toh <b>gateway endpoint</b> se bada saving. <b>Yeh chaar patterns (orphan storage, bhoola hua box, over-provisioned non-prod, NAT) har account mein milte hain.</b>',
            hints: [
              'aws ec2 describe-volumes',
              'aws ec2 describe-nat-gateways',
              'aws ec2 describe-instances',
              'aws rds describe-db-instances',
            ],
          },
        },
      ],
    },
    success: [
      'Main NAT/cross-AZ/idle jaise chhupe kharche pehchaan sakta hoon',
      'Main right-size → Savings Plan → Spot ka sahi order justify kar sakta hoon',
      'Main Lambda vs always-on compute ka break-even samjha sakta hoon',
      'Main cost ko architecture decision ki tarah treat karta hoon',
    ],
    homework: `<p>Apne account mein waste dhoondo (sab read-only):</p>
      <pre># Orphan EBS volumes (available = kisi se attached nahi)
aws ec2 describe-volumes --filters Name=status,Values=available \\
  --query 'Volumes[].{ID:VolumeId,GB:Size,Type:VolumeType}'

# Purane snapshots
aws ec2 describe-snapshots --owner-ids self \\
  --query 'Snapshots[?StartTime<=\`2025-01-01\`].[SnapshotId,VolumeSize,StartTime]'

# NAT gateways (per-GB charge!) — S3/DDB endpoint se bachat socho
aws ec2 describe-nat-gateways
aws ec2 describe-vpc-endpoints    # gateway endpoint hai ya nahi?

# Cost Explorer: Data Transfer + NAT ko usage-type se dekho (console)
#   Billing → Cost Explorer → Group by: Usage Type</pre>
      <p>✅ Self-check: Koi available volume mila? VPC endpoint tha ya sab NAT se jaa raha hai? Cost Explorer mein Data Transfer ka hissa kitna nikla?</p>`,
    cards: [
      { front: 'Teen sabse chhupe AWS kharche?', back: '<b>NAT Gateway</b> (hourly + per-GB — private subnet ka har byte), <b>data transfer</b> (internet egress + cross-AZ, dono taraf), <b>idle/orphan</b> (un-attached EBS, purane snapshots, bhoole boxes).' },
      { front: 'NAT ka per-GB kaise bachaayein?', back: '<b>VPC Gateway Endpoint</b> S3 aur DynamoDB ke liye — <b>free</b> hai, traffic AWS ke andar rehta, NAT bypass. Aksar sabse bada single saving.' },
      { front: 'Cost levers ka sahi order?', back: '<b>1) Right-size → 2) Savings Plan/RI</b> (steady baseline) <b>→ 3) Spot</b> (interruptible) <b>→ 4) Graviton + S3 lifecycle</b>. Right-size se pehle commit = waste ko lock karna.' },
      { front: 'Spot kab NAHI?', back: 'Steady <b>user-facing</b> load aur <b>stateful</b> cheezein (DB) — 2-min notice par chhin sakta hai. Spot sirf fault-tolerant/interruptible (batch, CI, stateless workers).' },
      { front: 'Bill spike ka pehla kadam?', back: '<b>Cost Explorer mein service + usage-type se break down</b> — khaas kar <b>Data Transfer aur NAT</b>. Bade bills aksar data ke <i>raaste</i> se aate hain, compute se nahi.' },
    ],
  },

  /* ================= LEVEL 8: Resilience ================= */
  {
    id: 'resilience',
    icon: '🛡️',
    title: 'Resilience — Fault Tolerance & Blast Radius',
    badge: 'Blast Radius Rakshak',
    objectives: [
      '<b>Multi-AZ baseline</b> — prod ka minimum',
      '<b>Retry + backoff + idempotency</b> — at-least-once ka matlab duplicates',
      '<b>Graceful degradation</b> — feature gaya ≠ app gayi',
      '<b>DR strategies</b> aur RTO/RPO se choice',
    ],
    lesson: [
      `<h3>🧭 Fault tolerance = maan lo cheezein tootengi</h3>
       <p>Sawal "kya fail hoga?" nahi, "<b>jab fail hoga tab kya hoga?</b>" hai.
       Resilience ki seedhi ek ladder hai — neeche se upar:</p>
       <ol>
         <li><b>Multi-AZ</b> — prod ka baseline. RDS Multi-AZ, ASG across ≥2 AZs,
             ALB multi-AZ. Single-AZ prod ek waiting incident hai.</li>
         <li><b>Decouple</b> — queue beech mein. Consumer gira toh messages SQS
             mein safe wait karte hain (Level 3).</li>
         <li><b>Retry + backoff + idempotency</b> — network fail hote hain;
             retry karo, par <b>exponential backoff + jitter</b> ke saath.</li>
         <li><b>Graceful degradation</b> — recommendations service down = default
             feed dikhao, poora page error nahi.</li>
         <li><b>Multi-region (DR)</b> — sabse mehnga, RTO/RPO ke hisaab se.</li>
       </ol>`,
      `<h3>🔁 Idempotency — at-least-once ka matlab duplicates</h3>
       <p>SQS, SNS, EventBridge, Lambda retries — yeh sab <b>at-least-once</b>
       delivery dete hain. Matlab ek message <b>do baar</b> aa sakta hai. Agar
       tumhara handler idempotent nahi hai toh:</p>
       <pre>❌ "payment charge karo"  → do baar chala → customer se do baar paisa 😱
✅ idempotency key (orderId) se check: "yeh order already process ho chuka?"</pre>
       <p>Idempotent banane ke tareeke:</p>
       <ul>
         <li>🔑 <b>Idempotency key</b> — request ke saath unique id; DB mein
             conditional write (DynamoDB <code>attribute_not_exists</code>) se
             duplicate rok do.</li>
         <li>➕ <b>Naturally idempotent ops</b> — "status = shipped set karo"
             (do baar chalane se koi farak nahi) vs "counter +1" (farak padta hai).</li>
       </ul>
       <p>💡 <b>Retry ke saath backoff + jitter zaroori hai</b> — warna sab clients
       ek saath retry karke <b>thundering herd</b> banate hain aur girta hua
       service dobara gira dete hain.</p>`,
      `<h3>🚑 DR strategies — RTO/RPO se choose karo</h3>
       <table>
         <tr><th>Strategy</th><th>RTO / RPO</th><th>Cost</th></tr>
         <tr><td><b>Backup & Restore</b></td><td>ghante / ghante</td><td>💲 sabse sasta</td></tr>
         <tr><td><b>Pilot Light</b></td><td>~10s of min / minutes</td><td>💲💲 core chalta rehta</td></tr>
         <tr><td><b>Warm Standby</b></td><td>minutes / seconds</td><td>💲💲💲 chhota replica live</td></tr>
         <tr><td><b>Multi-Site Active-Active</b></td><td>~0 / ~0</td><td>💲💲💲💲 dono full</td></tr>
       </table>
       <p><b>RTO</b> = kitni der down reh sakte ho. <b>RPO</b> = kitna data kho
       sakte ho. Business yeh decide karta hai, tum uske hisaab se architecture
       chunte ho — "sabse best" nahi, "requirement ke hisaab se sasta".</p>
       <div class="war-story"><b>⚡ Real incident:</b> PixShare ka thumbnail
       worker SQS se messages padhta tha aur har message par ek "usage counter +1"
       karta tha. Ek din downstream S3 call timeout hui — message visibility
       timeout ke baad <b>dobara</b> deliver hua (at-least-once, bilkul expected).
       Handler ne counter phir se badha diya. Mahine ke aakhir mein billing report
       ne users ko <b>30% zyada</b> usage dikhaya, aur kuch ko galat invoice gaya.
       Fix: har message ke <code>messageId</code> ko idempotency key banake
       DynamoDB mein conditional write — duplicate message ab no-op hai.
       <b>Sabak: at-least-once delivery ka matlab hai tumhara handler idempotent
       hona hi chahiye — yeh "shayad" nahi, "zaroor" hoga.</b></div>`,
    ],
    stages: [
      {
        type: 'order',
        title: 'Resilience ki seedhi',
        instructions: 'Sabse pehle kya, phir kya — sahi order lagao.',
        steps: [
          { text: 'Multi-AZ — prod ka baseline (RDS Multi-AZ, ASG across AZs)', explain: 'Sabse pehla kadam. Single-AZ prod ek waiting incident hai.' },
          { text: 'Decouple — beech mein queue, taaki ek component gire toh baaki chale', explain: 'Consumer down = messages SQS mein safe. Failure isolate ho jaata hai.' },
          { text: 'Retry + exponential backoff + jitter, aur handler idempotent', explain: 'At-least-once = duplicates. Backoff+jitter thundering herd rokta hai.' },
          { text: 'Graceful degradation — feature gaya toh default dikhao, error nahi', explain: 'Recommendations down = default feed. Poora page error karna over-reaction hai.' },
          { text: 'Multi-region DR — RTO/RPO ke hisaab se (sabse mehnga, aakhir mein)', explain: 'Business ke RTO/RPO se strategy chuno: backup→pilot light→warm→active-active.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Resilience map par ungli rakho',
        instructions: 'Diagram mein sahi cheez click karo.',
        visual: 'resilience',
        questions: [
          { q: 'Prod ka baseline — AZ fail survive karne ke liye?', target: 'multiaz', explain: 'Multi-AZ: RDS Multi-AZ, ASG across ≥2 AZs, ALB multi-AZ.' },
          { q: 'At-least-once delivery ka matlab duplicates — handler kaisa hona chahiye?', target: 'idempotent', explain: 'Idempotent — idempotency key + conditional write. Duplicate = no-op.' },
          { q: 'Recommendations service down — poora page error karne ke bajaye?', target: 'degrade', explain: 'Graceful degradation — default feed dikhao. Feature gaya ≠ app gayi.' },
          { q: 'Ek galti kitna tod sakti hai — ise chhota rakhne wali soch?', target: 'blast', explain: 'Blast radius — alag accounts/AZ/cells se failure ko contain karo.' },
        ],
      },
      {
        type: 'match',
        title: 'DR strategy → RTO/RPO + cost',
        instructions: 'Har strategy ko uske recovery profile se jodo.',
        pairs: [
          { left: '💾 Backup & Restore', right: 'RTO/RPO ghanton mein — sabse sasta', explain: 'Sirf backups; restore par time lagta. Non-critical/cost-sensitive workloads.' },
          { left: '🕯️ Pilot Light', right: 'Core minimal chalta hai, DR par scale up — RTO 10s of minutes', explain: 'DB replica + minimal infra live; baaki demand par khada hota hai.' },
          { left: '🔥 Warm Standby', right: 'Chhota full replica live — RTO minutes, RPO seconds', explain: 'Scaled-down poora stack chalta hai; failover par scale up.' },
          { left: '🌍 Multi-Site Active-Active', right: 'Dono regions live traffic lete hain — RTO/RPO ~0, sabse mehnga', explain: 'Instant failover, par double infra + data consistency ki complexity.' },
        ],
      },
      {
        type: 'incident',
        title: '🧩 Decision: AZ gir gayi',
        instructions: '3 AM. Ek AZ down. Sahi kadam chuno.',
        pager: '<b>PixShare — 3:14 AM</b><br>AWS status: <code>us-east-1a</code> mein networking issue. PixShare ka API 50% errors de raha hai, aur thumbnail queue mein backlog badh raha hai. Kuch users ko poora page error dikh raha hai.',
        start: 'first',
        nodes: {
          first: {
            text: 'Pehla kadam?',
            choices: [
              { t: 'Confirm karo ki ASG/ALB baaki AZs mein healthy capacity chala rahe hain, aur RDS Multi-AZ failover hua ya nahi', good: true, next: 'degrade', explain: 'Pehle dekho ki multi-AZ design apna kaam kar raha hai ya nahi. Yehi baseline hai.' },
              { t: 'Turant naya region mein poora stack khada karo', good: false, explain: 'Ek AZ ke liye region failover over-reaction hai (ghante lagenge). Multi-AZ ka poora point yahi hai ki yeh apne aap sambhal le.' },
              { t: 'Sab restart kar do', good: false, explain: 'Blind restart evidence mita deta hai aur AZ-level issue theek nahi karta.' },
            ],
          },
          degrade: {
            sitrep: 'ASG ne baaki 2 AZs mein instances badha diye, RDS Multi-AZ failover ho chuka. Par kuch users ko abhi bhi <b>poora page error</b> dikh raha hai — kyunki recommendations service (jo 1a mein thi) time out kar rahi hai aur homepage uspar block karta hai.',
            text: 'Poora page error kyun ho raha hai — ilaaj?',
            choices: [
              { t: 'Graceful degradation: recommendations fail ho toh default feed dikhao (timeout + fallback), page error nahi', good: true, next: 'dupes', explain: 'Ek non-critical dependency poore page ko nahi gira sakti. Timeout + fallback + circuit breaker.' },
              { t: 'Recommendations ka timeout badha do taaki woh complete ho jaye', good: false, explain: 'Timeout badhane se page aur slow hoga aur threads block honge — failure fail-slow ban jaayega, jo fail-fast se bura hai.' },
              { t: 'Homepage band kar do jab tak theek na ho', good: false, explain: 'Poora feature band karna users ke liye outage hi hai. Degrade karo, band mat karo.' },
            ],
          },
          dupes: {
            sitrep: 'Page ab default feed ke saath load ho raha hai. Par backlog clear hote waqt pata chala: kuch thumbnails <b>do-do baar</b> process hue aur usage counter double badh gaya.',
            text: 'Duplicate processing ka asli ilaaj?',
            choices: [
              { t: 'Handler ko idempotent banao — messageId ko idempotency key bana ke conditional write se duplicate no-op karo', good: true, next: 'dr', explain: 'SQS at-least-once hai — duplicates expected hain. Idempotency handler ki zimmedari hai, queue ki nahi.' },
              { t: 'SQS ko exactly-once par set kar do', good: false, explain: 'Standard SQS at-least-once hai; FIFO bhi limited throughput ke saath aata hai aur phir bhi handler idempotent hona chahiye. Design se solve karo.' },
              { t: 'Retries band kar do', good: false, explain: 'Retries band = transient failure par messages kho jayenge. Retry chahiye, idempotency ke saath.' },
            ],
          },
          dr: {
            sitrep: 'Incident khatam. Postmortem mein CFO poochta hai: "poore region ke fail hone par kya?" Business bolta hai: 30 min tak down chalega, par data loss 1 min se zyada nahi.',
            text: 'RTO 30 min / RPO 1 min — kaunsi DR strategy?',
            choices: [
              { t: 'Warm Standby — chhota full replica doosre region mein live, cross-region replication; failover par scale up', good: true, next: 'done', explain: 'RTO minutes + RPO seconds = Warm Standby fit hai. Active-active (RTO~0) yahan zaroorat se zyada aur mehnga.' },
              { t: 'Backup & Restore', good: false, explain: 'Uska RTO/RPO ghanton mein hai — 30 min / 1 min ka requirement miss ho jayega.' },
              { t: 'Multi-Site Active-Active', good: false, explain: 'Yeh RTO/RPO ~0 deta hai par sabse mehnga aur complex — requirement se zyada. Requirement ke hisaab se sasta chuno.' },
            ],
          },
          done: {
            end: true,
            text: 'AZ survive, page degrade hua par zinda raha 🧯',
            summary: `<b>Kya seekha:</b>
              <ul>
                <li><b>Multi-AZ</b> baseline ne AZ failure sambhal liya — yeh prod ka minimum hai.</li>
                <li><b>Graceful degradation</b>: non-critical dependency fail ho toh <b>timeout + fallback</b>, poora page error nahi.</li>
                <li><b>At-least-once = duplicates</b> — handler ko <b>idempotent</b> banana tumhari zimmedari hai.</li>
                <li><b>DR strategy RTO/RPO se</b> chuno — "best" nahi, requirement ke hisaab se sasta (yahan Warm Standby).</li>
              </ul>`,
          },
        },
      },
    ],
    interview: {
      title: 'Interview Round — Resilience',
      instructions: 'Reliability round. 🎤',
      questions: [
        {
          q: '"SQS se messages process kar rahe ho. Kya guarantee hai aur uska design par kya asar?"',
          choices: [
            'Standard SQS <b>at-least-once</b> deta hai — matlab duplicates aa sakte hain, isliye handler <b>idempotent</b> hona chahiye (idempotency key + conditional write)',
            'Exactly-once, kuch nahi karna padta',
            'At-most-once, messages kho sakte hain',
            'Ordering guaranteed hai',
          ],
          answer: 0,
          explain: 'At-least-once → idempotency handler ki zimmedari. Yeh distributed systems ka sabse practical sawal hai.',
        },
        {
          q: 'Interviewer: "Ek non-critical service (recommendations) down hai. Homepage ka kya hona chahiye?"',
          choices: [
            'Graceful degradation — chhota timeout, fallback (default feed), aur circuit breaker; poora page error nahi',
            'Poora page error dikhao',
            'Timeout badha do jab tak jawab na aaye',
            'Homepage band kar do',
          ],
          answer: 0,
          explain: 'Fail-fast + fallback. Timeout badhana "fail-slow" banata hai jo threads block karke poore system ko le doobta hai.',
        },
        {
          q: '🎛️ Interviewer: "Is account ki resilience audit karo."',
          terminal: {
            title: 'Interview hands-on — resilience audit',
            goal: '🎛️ <b>Hands-on:</b> <b>(1)</b> <code>aws rds describe-db-instances</code> — prod DB Multi-AZ hai? <b>(2)</b> <code>aws autoscaling describe-auto-scaling-groups</code> — ASG kitni AZs mein faili hai? <b>(3)</b> <code>aws ec2 describe-subnets</code> — subnets kaunsi AZs mein. <b>(4)</b> <code>aws elbv2 describe-load-balancers</code> — LB hai?',
            tasks: [
              { text: 'aws rds describe-db-instances — MultiAZ?', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
              { text: 'aws autoscaling describe-auto-scaling-groups', check: s => s.history.some(h => /aws autoscaling describe-auto-scaling-groups/.test(h)) },
              { text: 'aws ec2 describe-subnets — AZ spread', check: s => s.history.some(h => /aws ec2 describe-subnets/.test(h)) },
              { text: 'aws elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              rds: [
                { id: 'pixshare-prod', name: 'pixshare-prod', engine: 'aurora-postgresql', class: 'db.r6g.large', state: 'available', multiAZ: false, endpoint: 'prod.rds.amazonaws.com', storage: 200 },
              ],
              asgs: [
                { name: 'pixshare-api-asg', min: 2, max: 10, desired: 4, instances: ['i-1', 'i-2', 'i-3', 'i-4'], vpcZone: 'subnet-1a' },
              ],
              subnets: [
                { id: 'subnet-1a', vpcId: 'vpc-pix', cidr: '10.0.1.0/24', az: 'us-east-1a', name: 'app-1a', public: false },
                { id: 'subnet-1b', vpcId: 'vpc-pix', cidr: '10.0.2.0/24', az: 'us-east-1b', name: 'app-1b', public: false },
                { id: 'subnet-1c', vpcId: 'vpc-pix', cidr: '10.0.3.0/24', az: 'us-east-1c', name: 'app-1c', public: false },
              ],
              elbs: [
                { id: 'elb-1', name: 'pixshare-alb', type: 'application', scheme: 'internet-facing', dns: 'pixshare-alb-1.us-east-1.elb.amazonaws.com' },
              ],
            },
            success: s => s.history.some(h => /aws rds describe-db-instances/.test(h))
              && s.history.some(h => /aws autoscaling describe-auto-scaling-groups/.test(h))
              && s.history.some(h => /aws ec2 describe-subnets/.test(h))
              && s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)),
            successText: '🚨 <b>Do serious findings:</b> (1) <code>pixshare-prod</code> ka <code>"MultiAZ": false</code> — <b>prod database single-AZ hai</b>. Us AZ mein problem = poora DB down, aur failover manual restore hoga. (2) ASG ka <code>VPCZoneIdentifier</code> sirf <code>subnet-1a</code> hai — matlab saari 4 instances <b>ek hi AZ</b> mein hain, jabki 1b aur 1c subnets maujood hain! ALB multi-AZ hai par uske peeche sab kuch ek AZ mein. <b>Yeh "multi-AZ dikhta hai par hai nahi" wala classic setup hai — ek AZ event poori app le jaayega.</b> Fix: RDS Multi-AZ on, aur ASG ko teeno subnets par faila do.',
            hints: [
              'aws rds describe-db-instances',
              'aws autoscaling describe-auto-scaling-groups',
              'aws ec2 describe-subnets',
              'aws elbv2 describe-load-balancers',
            ],
          },
        },
      ],
    },
    success: [
      'Main multi-AZ ko prod baseline maanta hoon aur AZ-spread verify karta hoon',
      'Main at-least-once delivery ke liye idempotent handler design kar sakta hoon',
      'Main graceful degradation (timeout+fallback) implement karne ka faisla kar sakta hoon',
      'Main RTO/RPO se DR strategy chun sakta hoon',
    ],
    homework: `<p>Apne setup ki resilience khud check karo:</p>
      <pre># Prod DB Multi-AZ hai?
aws rds describe-db-instances --query 'DBInstances[].{ID:DBInstanceIdentifier,MultiAZ:MultiAZ}'

# ASG kitni AZs mein? (VPCZoneIdentifier mein kitne subnets)
aws autoscaling describe-auto-scaling-groups \\
  --query 'AutoScalingGroups[].{Name:AutoScalingGroupName,Subnets:VPCZoneIdentifier}'

# Idempotency practice (DynamoDB conditional write):
aws dynamodb put-item --table-name processed \\
  --item '{"messageId":{"S":"abc-123"}}' \\
  --condition-expression "attribute_not_exists(messageId)"
# ...dobara chalao → ConditionalCheckFailedException = duplicate safely ignored

# Retry with backoff+jitter — AWS SDK mein built-in:
#   AWS_RETRY_MODE=adaptive  AWS_MAX_ATTEMPTS=5</pre>
      <p>✅ Self-check: Koi prod DB single-AZ mila? ASG ek hi subnet par toh nahi? Conditional write ne duplicate rok diya?</p>`,
    cards: [
      { front: 'Resilience ki seedhi (5 steps)?', back: '1) <b>Multi-AZ</b> (prod baseline) → 2) <b>decouple</b> (queue) → 3) <b>retry+backoff+jitter & idempotency</b> → 4) <b>graceful degradation</b> → 5) <b>multi-region DR</b> (RTO/RPO ke hisaab se).' },
      { front: 'At-least-once ka design par asar?', back: 'Duplicates <b>aayenge</b> (SQS/SNS/EventBridge/Lambda retries). Handler ko <b>idempotent</b> banao — idempotency key (messageId/orderId) + conditional write se duplicate no-op.' },
      { front: 'Graceful degradation?', back: 'Non-critical dependency fail ho toh <b>chhota timeout + fallback</b> (default feed) + circuit breaker — poora page error nahi. Timeout badhana "fail-slow" banata hai, jo fail-fast se bura hai.' },
      { front: '4 DR strategies + RTO/RPO?', back: '<b>Backup&Restore</b> (ghante/ghante, sasta) · <b>Pilot Light</b> (10s of min) · <b>Warm Standby</b> (min/sec) · <b>Active-Active</b> (~0/~0, sabse mehnga). Business ke RTO/RPO se chuno.' },
      { front: '"Multi-AZ dikhta hai par hai nahi" ka classic setup?', back: 'ALB multi-AZ, par <b>ASG ka VPCZoneIdentifier sirf ek subnet</b> aur <b>RDS MultiAZ:false</b>. Ek AZ event poori app le jaata hai. Hamesha AZ-spread <i>verify</i> karo.' },
    ],
  },

  /* ================= LEVEL 9: FINAL BOSS ================= */
  {
    id: 'archboss',
    icon: '👑',
    title: 'Final Boss: PixShare Global Architecture',
    badge: 'Decision Architect',
    objectives: [
      'Poore stack ke liye service selection — ek saath',
      'Cost, resilience aur requirement ka trade-off ek design mein',
      'Anti-patterns pehchaan ke justify karna',
      'Track 4 ka certificate — Decision Architect! 👑',
    ],
    lesson: [
      `<h3>👑 Aakhri imtihaan: poora architecture</h3>
       <p>PixShare ab global hai: 5M users, media-heavy, spiky uploads, aur ek
       board jo cost pooch-ta hai. Tumhe har layer ka service <b>chunna aur
       justify</b> karna hai.</p>
       <p>Har layer par wahi 5 sawal jo poore track mein seekhe:</p>
       <ol>
         <li><b>Requirement</b> kya hai (latency, scale, ordering, consistency)?</li>
         <li><b>Data/traffic ka shape</b> kya hai (spiky/steady, key-based/ad-hoc)?</li>
         <li><b>Cost</b> ka asar (idle? per-GB? commit?)</li>
         <li><b>Ops load</b> — kaun manage karega?</li>
         <li><b>Blast radius</b> — yeh gira toh kya-kya girega?</li>
       </ol>
       <table>
         <tr><th>Layer</th><th>PixShare ka choice</th><th>Kyun</th></tr>
         <tr><td>Media</td><td>S3 + CloudFront</td><td>object storage + edge cache</td></tr>
         <tr><td>API</td><td>ALB → Fargate (steady) / Lambda (spiky)</td><td>traffic shape ke hisaab se</td></tr>
         <tr><td>User-graph</td><td>Aurora Multi-AZ</td><td>joins + ACID + HA</td></tr>
         <tr><td>Feed</td><td>DynamoDB + ElastiCache</td><td>known-key scale + hot reads</td></tr>
         <tr><td>Async</td><td>SNS→SQS fan-out, Step Functions (orders)</td><td>decouple + orchestration</td></tr>
         <tr><td>Events</td><td>EventBridge (+Pipes)</td><td>content routing, glue-free</td></tr>
         <tr><td>Observability</td><td>Logs→Firehose→OpenSearch + S3</td><td>cross-service search + sasta archive</td></tr>
         <tr><td>Analytics</td><td>S3 data lake + Athena</td><td>OLAP alag, OLTP par nahi</td></tr>
       </table>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Poora stack — har layer ka service',
        instructions: 'Har requirement ko sahi service mein daalo. Yeh poore track ka nichod hai.',
        bins: [
          { id: 'compute', label: '🖥️ Compute' },
          { id: 'data', label: '🗄️ Data store' },
          { id: 'async', label: '📨 Async/Events' },
          { id: 'edge', label: '🌍 Edge/Network' },
          { id: 'obs', label: '🔍 Observability' },
        ],
        items: [
          { text: 'Spiky upload-trigger processing, <15 min', bin: 'compute', explain: 'Lambda — event-driven, idle par $0.' },
          { text: 'Photos aur videos (petabytes)', bin: 'data', explain: 'S3 — object storage. DB mein sirf metadata.' },
          { text: 'Ek upload par 4 independent reactions', bin: 'async', explain: 'SNS→SQS fan-out — har reaction ki apni durable queue.' },
          { text: 'Global users ko media tez dena (cacheable)', bin: 'edge', explain: 'CloudFront — edge cache. Origin load + latency dono kam.' },
          { text: 'Cross-service log search + dashboards', bin: 'obs', explain: 'Subscription filter → Firehose → OpenSearch (+ S3 archive).' },
          { text: 'User follows/comments with joins aur transactions', bin: 'data', explain: 'Aurora — relational + ACID, Multi-AZ.' },
          { text: 'Feed timeline, known key, ms latency, huge scale', bin: 'data', explain: 'DynamoDB (+ ElastiCache hot reads).' },
          { text: 'Order → payment → ship with rollback', bin: 'async', explain: 'Step Functions — orchestration + compensation (saga).' },
          { text: 'HTTP path-based routing to microservices + WAF', bin: 'edge', explain: 'ALB — L7 routing.' },
          { text: 'Steady 24×7 container API service', bin: 'compute', explain: 'Fargate — steady service, no node management.' },
          { text: '"5 min mein 100+ ERROR par page karo"', bin: 'obs', explain: 'Metric Filter → CloudWatch alarm. Pipeline ki zaroorat nahi.' },
          { text: 'Premium-tier events ko hi fraud-check par bhejo', bin: 'async', explain: 'EventBridge rule — content-based routing.' },
        ],
      },
      {
        type: 'incident',
        title: '👑 Boss: PixShare global design review',
        instructions: 'Board ke saamne design defend karo. Har choice justify karo.',
        pager: '<b>PixShare — architecture review</b><br>5M users, media-heavy, spiky uploads, global. Board ke sawal: "cost control mein hai? region gaya toh? logs se debug kar sakte ho?" Har layer par sahi call lo.',
        start: 'media',
        nodes: {
          media: {
            text: 'Media delivery — global, petabytes, cacheable.',
            choices: [
              { t: 'S3 (origin) + CloudFront (edge cache) — objects sasta, cache se latency aur origin load dono kam', good: true, next: 'compute', explain: 'Media ka standard jawab. GA yahan galat hota (woh cache nahi karta).' },
              { t: 'Har region mein EC2 + EBS par media copy', good: false, explain: 'Mehnga, manage karna mushkil, aur CloudFront yeh already karta hai. Object storage + CDN use karo.' },
              { t: 'Global Accelerator', good: false, explain: 'GA routing tez karta hai par cache NAHI — cacheable media par CloudFront chahiye.' },
            ],
          },
          compute: {
            sitrep: 'Media sort. API traffic: steady baseline + upload spikes.',
            text: 'Compute ka mix?',
            choices: [
              { t: 'Steady API → Fargate (+ Savings Plan); spiky upload-processing → Lambda; bulk transcode → Batch on Spot', good: true, next: 'data', explain: 'Har workload ka shape apna service chunta hai — yehi poore track ka core. Aur commit/Spot se cost.' },
              { t: 'Sab kuch Lambda par — serverless hamesha sasta', good: false, explain: 'Steady 24×7 par Lambda ka per-invoke bill mehnga pad jaata hai, aur >15 min transcode wahan chalta hi nahi.' },
              { t: 'Sab kuch ek badi EC2 fleet par', good: false, explain: 'Spiky uploads par over-provisioning aur idle waste; event-driven kaam Lambda par sasta hai.' },
            ],
          },
          data: {
            sitrep: 'Compute mix set. Ab data: user-graph (joins), feed (key-based huge scale), aur board ko "top creators per country" analytics chahiye.',
            text: 'Data layer?',
            choices: [
              { t: 'Aurora Multi-AZ (graph) + DynamoDB (feed) + ElastiCache (hot reads) + S3 data lake & Athena (analytics)', good: true, next: 'events', explain: 'Polyglot: har store apne kaam par, aur analytics OLTP se alag (S3+Athena).' },
              { t: 'Sab DynamoDB — scale karta hai', good: false, explain: 'Joins aur ad-hoc analytics DynamoDB par dard hai (full scan = slow+mehnga). Polyglot chahiye.' },
              { t: 'Sab Aurora par, analytics bhi wahin', good: false, explain: 'Heavy OLAP query OLTP DB ko slow karti hai, aur feed ka key-scale Aurora par mehnga. Alag karo.' },
            ],
          },
          events: {
            sitrep: 'Data layer set. Async: upload par 4 reactions, premium-only fraud check, ek SQS→transform→SFN glue, aur nightly cleanup.',
            text: 'Async + events?',
            choices: [
              { t: 'SNS→SQS fan-out (4 reactions), EventBridge rule (premium filter), Pipes (glue), Scheduler (nightly)', good: true, next: 'obs', explain: 'Har pattern apna tool: durable fan-out, content routing, glue-free integration, serverless cron.' },
              { t: 'Sab kuch ek SQS queue se', good: false, explain: 'Ek queue = ek message ek consumer ko. 4 independent reactions ke liye fan-out chahiye.' },
              { t: 'Har cheez ke liye custom Lambda glue likho', good: false, explain: 'Read-transform-forward glue = Pipes ka kaam; routing = EventBridge ka. Boilerplate bugs laata hai.' },
            ],
          },
          obs: {
            sitrep: 'Async sort. Board: "3 AM incident mein 20 services ke logs kaise dhoondhoge?"',
            text: 'Observability pipeline?',
            choices: [
              { t: 'Subscription filter (ERROR/WARN) → Firehose → OpenSearch (multi-AZ) + S3 raw archive; plus Metric Filter alarms', good: true, next: 'dr', explain: 'Cross-service search + sasta archive + alerting. Filter se cost control, OpenSearch khud multi-AZ.' },
              { t: 'Sab logs bina filter OpenSearch mein', good: false, explain: 'Storage/cost blast aur queries slow. Source par filter karo, cold data S3 par.' },
              { t: 'Sirf CloudWatch Logs Insights, har group alag se', good: false, explain: '20 services par cross-service search nahi ho paayega — incident mein yahi chahiye hota hai.' },
            ],
          },
          dr: {
            sitrep: 'Observability set. Aakhri sawal: "region gaya toh? Budget unlimited nahi hai." Business: RTO 30 min, RPO 1 min.',
            text: 'DR strategy + cost posture?',
            choices: [
              { t: 'Warm Standby (RTO min/RPO sec) + right-size → Savings Plan (steady) + Spot (batch) + S3 lifecycle + VPC endpoints', good: true, next: 'done', explain: 'Requirement ke hisaab se DR (active-active nahi — woh over-spec hai), aur cost levers sahi order mein.' },
              { t: 'Multi-Site Active-Active — sabse best hai', good: false, explain: 'RTO/RPO ~0 chahiye hi nahi tha; yeh sabse mehnga aur complex hai. Requirement se zyada mat kharido.' },
              { t: 'Backup & Restore — sasta hai', good: false, explain: 'RTO/RPO ghanton mein — 30 min / 1 min requirement miss ho jayega.' },
            ],
          },
          done: {
            end: true,
            text: '👑 Board convinced — Decision Architect!',
            summary: `<b>Poora stack, har layer justified:</b>
              <ul>
                <li><b>Media</b> S3 + CloudFront · <b>Compute</b> Fargate (steady) + Lambda (spiky) + Batch/Spot (bulk)</li>
                <li><b>Data</b> Aurora + DynamoDB + ElastiCache + S3/Athena (OLTP≠OLAP)</li>
                <li><b>Async</b> SNS→SQS fan-out + EventBridge + Pipes + Scheduler + Step Functions</li>
                <li><b>Observability</b> filtered logs → Firehose → OpenSearch + S3</li>
                <li><b>Resilience</b> Multi-AZ + Warm Standby (RTO/RPO se) · <b>Cost</b> right-size → commit → Spot → endpoints</li>
              </ul>
              <b>Poore track ka nichod:</b> sahi service woh nahi jo powerful ho — woh jo <b>requirement, data ka shape, cost, ops-load aur blast-radius</b> ko fit kare. Aur har choice ke saath "<b>kab NAHI</b>" bhi pata ho. 🎓`,
          },
        },
      },
      {
        type: 'terminal',
        title: '🖥️ Boss Mission: Poore architecture ka audit',
        instructions: 'Production account ka full sweep — har layer verify karo.',
        goal: '👑 <b>Final audit.</b> PixShare prod account ka har layer check karo: <b>(1)</b> <code>aws elbv2 describe-load-balancers</code> (entry) <b>(2)</b> <code>aws rds describe-db-instances</code> (Multi-AZ?) <b>(3)</b> <code>aws dynamodb list-tables</code> (feed) <b>(4)</b> <code>aws cloudfront list-distributions</code> (edge cache) <b>(5)</b> <code>aws logs describe-subscription-filters --log-group-name /aws/lambda/checkout</code> (observability gap?) <b>(6)</b> <code>aws ec2 describe-volumes</code> (cost waste?).',
        tasks: [
          { text: 'Entry layer — elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
          { text: 'Data layer — rds describe-db-instances', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
          { text: 'Data layer — dynamodb list-tables', check: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) },
          { text: 'Edge — cloudfront list-distributions', check: s => s.history.some(h => /aws cloudfront list-distributions/.test(h)) },
          { text: 'Observability — subscription filters on checkout', check: s => s.history.some(h => /aws logs describe-subscription-filters/.test(h)) },
          { text: 'Cost — ec2 describe-volumes', check: s => s.history.some(h => /aws ec2 describe-volumes/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
          elbs: [{ id: 'elb-1', name: 'pixshare-alb', type: 'application', scheme: 'internet-facing', dns: 'pixshare-alb.us-east-1.elb.amazonaws.com' }],
          rds: [{ id: 'pixshare-aurora', name: 'pixshare-aurora', engine: 'aurora-postgresql', class: 'db.r6g.large', state: 'available', multiAZ: true, endpoint: 'aurora.rds.amazonaws.com', storage: 200 }],
          tables: [{ name: 'feed', partitionKey: 'userId', sortKey: 'postId', rcu: 200, wcu: 100, items: [] }],
          cloudfront: [{ id: 'E1PIX', domain: 'd111.cloudfront.net', origins: ['pixshare-media.s3.amazonaws.com'], status: 'Deployed', enabled: true }],
          logGroups: [
            { name: '/aws/lambda/feed-api', retention: 7, events: [], subscriptionFilters: [{ name: 'errors', pattern: '?ERROR ?WARN', destinationArn: 'arn:aws:firehose:us-east-1:123456789012:deliverystream/logs-to-opensearch' }] },
            { name: '/aws/lambda/checkout', retention: 7, events: ['ERROR payment failed'], subscriptionFilters: [] },
          ],
          volumes: [
            { id: 'vol-prod1', size: 100, type: 'gp3', state: 'in-use', attachedTo: 'i-api01' },
            { id: 'vol-orphan9', size: 800, type: 'gp2', state: 'available' },
          ],
          deliveryStreams: [{ name: 'logs-to-opensearch', status: 'ACTIVE', source: 'directput', destination: 'opensearch', domain: 'pixshare-logs', backupS3: 'pixshare-logs-raw', bufferMB: 5, bufferSec: 60 }],
        },
        success: s => ['elbv2 describe-load-balancers', 'rds describe-db-instances', 'dynamodb list-tables', 'cloudfront list-distributions', 'logs describe-subscription-filters', 'ec2 describe-volumes']
          .every(c => s.history.some(h => h.includes(c))),
        successText: `👑 <b>FULL AUDIT COMPLETE — TUM DECISION ARCHITECT HO.</b><br><br>
          Jo sahi mila: <b>ALB</b> (L7 entry) ✅, <b>Aurora Multi-AZ</b> ✅, <b>DynamoDB feed</b> (key-based scale) ✅, <b>CloudFront</b> media par ✅, <b>feed-api</b> logs filtered → Firehose → OpenSearch ✅.<br><br>
          Do gaps jo tumne pakde: (1) <code>/aws/lambda/checkout</code> par <b>koi subscription filter nahi</b> — sabse critical service incident ke waqt andhera rahega. (2) <code>vol-orphan9</code> — <b>800GB un-attached EBS</b> chup-chaap bill de raha hai.<br><br>
          <b>Yeh poora track ek hi baat sikhata hai:</b> AWS mein 200+ services hain, par sahi choice hamesha 5 sawaalon se nikalti hai — <b>requirement, data/traffic ka shape, cost, ops-load, aur blast radius</b>. Aur har service ke saath "<b>kab NAHI</b>" jaanna utna hi zaroori hai jitna "kab". 🎓👑`,
        hints: [
          'aws elbv2 describe-load-balancers',
          'aws rds describe-db-instances',
          'aws dynamodb list-tables',
          'aws cloudfront list-distributions',
          'aws logs describe-subscription-filters --log-group-name /aws/lambda/checkout',
          'aws ec2 describe-volumes',
        ],
      },
      {
        type: 'quiz',
        title: '👑 Final Round — poora track',
        questions: [
          {
            q: 'Service chunne ke liye tumhara framework kya hai?',
            choices: [
              'Requirement + data/traffic ka shape + cost + ops-load + blast radius — aur har choice ka "kab NAHI" bhi pata ho',
              'Jo sabse naya service ho',
              'Jo sabse popular ho',
              'Jo sabse zyada scale kare',
            ],
            answer: 0,
            explain: 'Yeh poore track ka nichod hai. "Powerful" service nahi, "fit" service chahiye.',
          },
          {
            q: 'Ek team sab kuch DynamoDB par bana rahi hai kyunki "woh scale karta hai". Sabse bada risk?',
            choices: [
              'Ad-hoc/analytical queries aur joins wahan full-scan ban jaate hain (slow + mehnga) — analytics ke liye S3+Athena/Redshift alag chahiye',
              'DynamoDB slow hai',
              'DynamoDB mehnga hai hamesha',
              'Koi risk nahi',
            ],
            answer: 0,
            explain: 'Polyglot persistence. DynamoDB known-key access ke liye; OLAP alag tool maangta hai.',
          },
          {
            q: 'Bill audit mein sabse pehle kya dekhoge?',
            choices: [
              'Data Transfer + NAT Gateway usage-types — bade bills aksar data ke raaste se aate hain, compute se nahi',
              'Instance sizes',
              'S3 storage class',
              'Lambda memory',
            ],
            answer: 0,
            explain: 'NAT per-GB aur cross-AZ transfer sabse chhupe kharche hain. S3/DDB ke liye gateway endpoint (free).',
          },
          {
            q: 'Prod design mein resilience ka minimum baseline?',
            choices: [
              'Multi-AZ (RDS Multi-AZ + ASG across ≥2 AZs) — aur AZ-spread verify karo, sirf maan mat lo',
              'Multi-region active-active',
              'Roz backup',
              'Bade instances',
            ],
            answer: 0,
            explain: 'Multi-AZ prod ka minimum. "ALB multi-AZ par ASG ek subnet par" wala setup multi-AZ dikhta hai, hai nahi.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Final Architecture',
      instructions: 'Aakhri round. Ab tum design defend kar sakte ho. 🎤',
      questions: [
        {
          q: '"Ek photo-sharing app ka architecture design karo — 5M users, global."',
          choices: [
            'S3+CloudFront (media), ALB→Fargate/Lambda (traffic shape se), Aurora (graph) + DynamoDB (feed) + ElastiCache, SNS→SQS fan-out + EventBridge, logs→Firehose→OpenSearch, Multi-AZ + DR RTO/RPO se, aur cost levers (endpoints/commit/Spot)',
            'Sab kuch ek badi EC2 par',
            'Sab kuch Lambda + DynamoDB par',
            'Kubernetes par sab kuch',
          ],
          answer: 0,
          explain: 'Layer-by-layer justified design. Ek-service-fits-all wale jawab (sab Lambda/sab DynamoDB/sab K8s) hamesha weak lagte hain.',
        },
        {
          q: 'Interviewer: "Tumne DynamoDB chuna feed ke liye — analytics ka kya?"',
          choices: [
            'Analytics OLTP store par nahi chalaunga — DynamoDB Streams/exports se data S3 data lake mein land karunga aur Athena/Redshift se query karunga',
            'DynamoDB par scan chala dunga',
            'Aurora par sab analytics',
            'Analytics ki zaroorat nahi',
          ],
          answer: 0,
          explain: 'OLTP ≠ OLAP. Yeh distinction bolna senior signal hai — aur retrofit se bachata hai.',
        },
        {
          q: '🎛️ Final hands-on: "Ek nayi service add karni hai — pehle account ka context dekho."',
          terminal: {
            title: 'Final interview hands-on',
            goal: '🎛️ <b>Final:</b> Naya "stories" feature add karna hai. Pehle context lo: <b>(1)</b> <code>aws lambda list-functions</code> — compute pattern kya hai. <b>(2)</b> <code>aws sns list-topics</code> — event backbone hai? <b>(3)</b> <code>aws dynamodb list-tables</code> — data layer. <b>(4)</b> <code>aws s3 ls</code> — media/datalake buckets.',
            tasks: [
              { text: 'aws lambda list-functions', check: s => s.history.some(h => /aws lambda list-functions/.test(h)) },
              { text: 'aws sns list-topics', check: s => s.history.some(h => /aws sns list-topics/.test(h)) },
              { text: 'aws dynamodb list-tables', check: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) },
              { text: 'aws s3 ls', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAPIXSHARE', Arn: 'arn:aws:iam::123456789012:user/architect' },
              lambdas: [
                { name: 'photo-thumbnail', runtime: 'nodejs20.x', handler: 'i.h', state: 'Active', memory: 512, timeout: 30 },
                { name: 'feed-api', runtime: 'nodejs20.x', handler: 'a.h', state: 'Active', memory: 1024, timeout: 29 },
              ],
              topics: [{ name: 'photo-uploaded', arn: 'arn:aws:sns:us-east-1:123456789012:photo-uploaded', subscriptions: [{ subscriptionArn: 'a1', protocol: 'sqs', endpoint: 'arn:aws:sqs:us-east-1:123456789012:thumbnail-queue', confirmed: true }] }],
              tables: [{ name: 'feed', partitionKey: 'userId', sortKey: 'postId', rcu: 200, wcu: 100, items: [] }],
              buckets: [
                { name: 'pixshare-media', region: 'us-east-1', encryption: true, creationDate: '2026-01-10 09:00:00' },
                { name: 'pixshare-datalake', region: 'us-east-1', encryption: true, creationDate: '2026-03-02 09:00:00' },
              ],
            },
            success: s => ['lambda list-functions', 'sns list-topics', 'dynamodb list-tables']
              .every(c => s.history.some(h => h.includes(c))) && s.history.some(h => /aws s3 ls\b/.test(h)),
            successText: '👑 <b>Yehi sahi tarika hai — pehle context, phir design.</b> Account batata hai: media <b>S3</b> par, events <b>SNS fan-out</b> se, feed <b>DynamoDB</b> par, compute <b>Lambda</b> (event-driven). Toh "stories" feature ko <b>usi pattern mein</b> fit karo: media S3+CloudFront, story-metadata DynamoDB (TTL ke saath — stories 24h mein expire hoti hain!), upload event <code>photo-uploaded</code> jaisa SNS topic, processing Lambda. <b>Naya feature naye services nahi maangta — maujooda patterns mein fit hona chahiye, jab tak koi requirement sach mein alag na ho.</b> 🎓',
            hints: [
              'aws lambda list-functions',
              'aws sns list-topics',
              'aws dynamodb list-tables',
              'aws s3 ls',
            ],
          },
        },
      ],
    },
    success: [
      'Main poore stack ka service selection justify kar sakta hoon',
      'Main cost, resilience aur requirement ka trade-off ek design mein sadh sakta hoon',
      'Main anti-patterns (sab-ek-service, OLTP par OLAP, single-AZ prod) pehchaan sakta hoon',
      'Main Decision Architect certificate le chuka hoon 👑',
    ],
    homework: `<p><b>Aakhri homework — apna khud ka design likho:</b></p>
      <pre># Koi ek app chuno (jo tum banana chahte ho) aur likho:
#
# 1. Requirements: users, traffic shape (spiky/steady), latency, consistency
# 2. Har layer ka service + KYUN + "kab NAHI" (alternative kyun nahi chuna):
#      compute · data store · async/events · edge · observability
# 3. Cost: kaunse levers (endpoints/commit/Spot/lifecycle), aur bill kahan
#      chhup sakta hai (NAT/cross-AZ/idle)
# 4. Resilience: multi-AZ kahan, idempotency kahan, degrade kahan,
#      aur RTO/RPO ke hisaab se DR strategy
# 5. Blast radius: yeh component gira toh kya-kya girega?
#
# Phir usse Well-Architected Tool (free) par review karo:
#   Console → AWS Well-Architected Tool → Define workload → 6 pillars
#   → risks nikalte hain → improvement plan</pre>
      <p>Yeh ek page ka document hi asli architecture skill hai — service ka naam
      nahi, <b>uske peeche ka "kyun"</b>. ✅ Self-check: har choice ke saath tumne
      "kab NAHI" bhi likha?</p>`,
    cards: [
      { front: 'Service selection ka framework?', back: '<b>1) Requirement</b> (latency/scale/ordering/consistency) <b>2) Data/traffic ka shape</b> (spiky vs steady, key vs ad-hoc) <b>3) Cost</b> (idle/per-GB/commit) <b>4) Ops load</b> <b>5) Blast radius</b>. Plus har choice ka "kab NAHI".' },
      { front: 'PixShare stack ek line mein?', back: 'S3+CloudFront (media) · ALB→Fargate/Lambda (traffic shape) · Aurora+DynamoDB+ElastiCache (polyglot) · SNS→SQS+EventBridge+Pipes+SFN (async) · Logs→Firehose→OpenSearch+S3 (observability) · Multi-AZ + DR by RTO/RPO.' },
      { front: 'Teen sabse common architecture anti-patterns?', back: '1) <b>Sab-ek-service</b> ("sab Lambda"/"sab DynamoDB") 2) <b>OLTP par OLAP</b> chalana 3) <b>Single-AZ prod</b> (ya "multi-AZ dikhta hai par ASG ek subnet par").' },
      { front: 'Naya feature add karte waqt pehla kadam?', back: '<b>Context lo</b> — account mein maujooda patterns dekho (compute, events, data). Naya feature un patterns mein fit hona chahiye, jab tak koi requirement sach mein alag na ho.' },
      { front: 'Poore track ka nichod?', back: '<b>Sahi service woh nahi jo powerful ho — woh jo requirement, cost aur blast-radius ko fit kare.</b> Aur "kab NAHI" jaanna utna hi zaroori hai jitna "kab". 👑' },
    ],
  },

]);
