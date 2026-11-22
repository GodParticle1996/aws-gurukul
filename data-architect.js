/* =====================================================================
   AWS Gurukul — Track 4: 🧭 Architect (Nirnay Path)
   Decision-first: kaunsa service KAB, aur kab NAHI.
   Continuity: "PixShare" — ek photo/video startup jo MVP se global tak jaata hai.
   Har level ek service-category ka decision framework — matrix, trade-off,
   "kab NAHI" traps, aur ek scenario decision-tree.
   ===================================================================== */

AG.registerLevels('architect', [

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
            successText: '🚨 <b>Do serious findings:</b> (1) <code>pixshare-prod</code> ka <code>"MultiAZ": false</code> — <b>prod database single-AZ hai</b>. Us AZ mein problem = poora DB down, aur failover manual restore hoga. (2) ASG ka <code>VPCZoneIdentifier</code> sirf <code>subnet-1a</code> hai — matlab saari 4 instances <b>ek hi AZ</b> mein hain, jabki 1b aur 1c subnets bhi hain! ALB multi-AZ hai par uske peeche sab kuch ek AZ mein. <b>Yeh "multi-AZ dikhta hai par hai nahi" wala classic setup hai — ek AZ event poori app le jaayega.</b> Fix: RDS Multi-AZ on, aur ASG ko teeno subnets par faila do.',
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
