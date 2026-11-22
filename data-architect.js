/* =====================================================================
   AWS Gurukul — Track 4: 🧭 Architect (Nirnay Path)
   Decision-first: kaunsa service KAB, aur kab NAHI.
   Continuity: "PixShare" — ek photo/video startup jo MVP se global tak jaata hai.
   Har level ek service-category ka decision framework — matrix, trade-off,
   "kab NAHI" traps, aur ek scenario decision-tree.
   ===================================================================== */

AG.registerLevels('architect', [

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
