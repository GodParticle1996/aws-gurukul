/* =====================================================================
   AWS Gurukul — Track 4: 🧭 Architect (Nirnay Path)
   Decision-first: kaunsa service KAB, aur kab NAHI.
   Continuity: "PixShare" — ek photo/video startup jo MVP se global tak jaata hai.
   Har level ek service-category ka decision framework — matrix, trade-off,
   "kab NAHI" traps, aur ek scenario decision-tree.
   ===================================================================== */

AG.registerLevels('architect', [

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
            successText: '👑 <b>Yehi sahi tarika hai — pehle context, phir design.</b> Account batata hai: media <b>S3</b> par, events <b>SNS fan-out</b> se, feed <b>DynamoDB</b> par, compute <b>Lambda</b> (event-driven). Toh "stories" feature ko <b>usi pattern mein</b> fit karo: media S3+CloudFront, story-metadata DynamoDB (TTL ke saath — stories 24h mein expire hoti hain!), upload event <code>photo-uploaded</code> jaisa SNS topic, processing Lambda. <b>Naya feature naye services nahi maangta — pehle se chal rahe patterns mein fit hona chahiye, jab tak koi requirement sach mein alag na ho.</b> 🎓',
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
      { front: 'Naya feature add karte waqt pehla kadam?', back: '<b>Context lo</b> — account mein pehle se chal rahe patterns dekho (compute, events, data). Naya feature un patterns mein fit hona chahiye, jab tak koi requirement sach mein alag na ho.' },
      { front: 'Poore track ka nichod?', back: '<b>Sahi service woh nahi jo powerful ho — woh jo requirement, cost aur blast-radius ko fit kare.</b> Aur "kab NAHI" jaanna utna hi zaroori hai jitna "kab". 👑' },
    ],
  },

]);
