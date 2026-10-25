/* =====================================================================
   AWS Gurukul — 🌱 Beginner · Level 1: Cloud 101 (v2, 2026-10-23)
   Kahani: ShopKaro — Jaipur ki online kurta dukaan. Beginner track ke 8 levels
   mein ShopKaro ek server se poore 3-tier architecture tak badhta hai.
   Shape: hook → steps (ek card, ek sawal) → myth → playbook → exam lens →
          stages: dryrun pehle, phir live lab, games, triage, terminal, real lab.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho. Chhote vaakya.
   Numbers: illustrative, us-east-1 list price ~2025–26, ₹88 = $1.
   ===================================================================== */
(function () {
  const N = AG.aws.n;
  const L = v => '₹' + (v / 100000).toFixed(2) + ' lakh';

  /* on-prem vs cloud — saal ka kharcha (illustrative numbers) */
  function capexModel(k) {
    const n = k.normal, m = k.peak, d = k.days;
    const ONPREM_PER_SERVER = 120000;          // ₹3 lakh server / 5 saal + bijli/jagah + ops ka hissa
    const CLOUD_BASE_PER_SERVER = 165000;      // 8 vCPU / 32 GB, 1-saal Savings Plan, 24×7
    const CLOUD_PEAK_PER_HOUR = 29;            // same server On-Demand, sirf peak ke ghante
    const onprem = n * m * ONPREM_PER_SERVER;
    const cloud = n * CLOUD_BASE_PER_SERVER + n * (m - 1) * d * 24 * CLOUD_PEAK_PER_HOUR;
    const util = (n * 365 + n * (m - 1) * d) / (n * m * 365) * 100;
    return { onprem, cloud, util, servers: n * m };
  }

  AG.registerLevels('beginner', [{
    id: 'cloud101',
    icon: '☁️',
    title: 'Cloud 101 — AWS kya hai, kyun, aur kahan?',
    badge: 'Cloud Samajhdar',
    hook: {
      when: 'ShopKaro · Diwali sale · 9:04 PM',
      title: 'Ek server, 20 guna traffic, aur ₹18 lakh ki sale gayab',
      text: 'ShopKaro Jaipur ki online kurta dukaan hai. Poora store office ke ek rented server par chalta hai: 8 CPU core, 32 GB RAM. Normal din 300 log ek saath site par hote hain. Diwali sale raat 9 baje shuru hui. 9:04 tak 6,000 log aa gaye. Server ka CPU 100% hua, page 40 second mein khulne laga, phir site band ho gayi. Site 2 ghante band rahi. Founder Neha ne hisaab lagaya: ₹18 lakh ki sale gayi. Hardware vendor ne agle saal ke liye kaha: "20 server khareed lo, ₹60 lakh." Par 20 naye server saal ke 360 din khaali padenge. Neha ka sawal: kya koi aisa tareeka hai jahan sirf sale ke 3 din 20 server hon, aur baaki din 1?',
    },
    objectives: [
      'Samjho <b>cloud asal mein kya hai</b> — kiraye ki computing, per second bill',
      '<b>CapEx vs OpEx</b> aur <b>elasticity</b> — kab cloud sasta, kab mehenga (numbers ke saath)',
      '<b>Region → Availability Zone → Edge location</b> ka hierarchy, aur region kaise chunein',
      '<b>Multi-AZ vs multi-region</b> — kaunsi failure se kaun bachata hai',
      '<b>Shared Responsibility</b> — AWS ka kaam vs tumhara kaam (EC2, RDS, S3 par alag-alag)',
      'Pehla <b>asli aws CLI</b> — identity, region, AZ, aur "invisible bill" pakadna',
    ],
    steps: [
      {
        q: 'Cloud asal mein hai kya?',
        analogy: 'Ghar ke liye generator khareedna vs bijli company ka connection. Generator khareedo toh ₹2 lakh pehle do, diesel bharo, mechanic bulao — aur shaadi ke din load zyada hua toh generator band. Bijli company ka connection lo toh jitni bijli jalaao utna bill: shaadi ke din 10 AC chalao, agle din 1. <b>Cloud = computing ki bijli company.</b>',
        body: 'AWS ke paas duniya bhar mein datacenters hain jinmein lakhs servers lage hain. Tum un servers ko <b>API call</b> se minutes mein kiraye par lete ho, aur bill <b>per second</b> banta hai. Kaam khatam → server band → bill band.',
        points: [
          '<b>Compute</b> kiraye par: EC2 (virtual server), Lambda (sirf code)',
          '<b>Storage</b> kiraye par: S3 (files), EBS (disk)',
          '<b>Managed services</b>: RDS (database), SQS (queue) — AWS chalata hai, tum use karte ho',
        ],
        asli: 'Cloud = kisi aur ka datacenter, jo tum API se minutes mein kiraye par lete ho aur per second ka paisa dete ho.',
      },
      {
        q: 'ShopKaro ke liye paise ka farak kya hai? (CapEx vs OpEx)',
        body: '<div class="tbl-wrap"><table><tr><th></th><th>🏚️ Server khareedo (on-prem)</th><th>☁️ Cloud par kiraye</th></tr>' +
          '<tr><td>Diwali ke liye capacity</td><td>20 server pehle se khareedo</td><td>Sale ke 3 din 40 server, baaki din 2</td></tr>' +
          '<tr><td>Pehle din ka kharcha</td><td>~₹60 lakh (CapEx)</td><td>₹0 — jitna chala utna bill (OpEx)</td></tr>' +
          '<tr><td>Saal ka andaza</td><td>~₹48 lakh (40 server × ₹1.2 lakh)</td><td>~₹4 lakh (2 server saal bhar + 38 extra × 72 ghante)</td></tr>' +
          '<tr><td>Naya server chahiye</td><td>3–6 hafte delivery</td><td>2–3 minute</td></tr>' +
          '<tr><td>Saal ke 362 din</td><td>38 server khaali ghoomte hain</td><td>38 server exist hi nahi karte</td></tr></table></div>',
        asli: '<b>Elasticity</b> = load badhe toh capacity badhao, load ghate toh ghatao. Spiky traffic par cloud bahut sasta padta hai kyunki khaali capacity ka paisa nahi dena padta.',
      },
      {
        q: 'Region, Availability Zone aur Edge location — kaun kya hai?',
        analogy: '<b>Region</b> = ek shehar, jaise Mumbai. <b>Availability Zone (AZ)</b> = us shehar ke alag-alag ilaakon mein bane alag godown — Andheri, Thane, Navi Mumbai. Har godown ki apni bijli, apna generator, alag flood line. <b>Edge location</b> = chhote shehron ki chhoti dukaan jahan popular maal pehle se rakha hai, taaki customer ko door na jaana pade.',
        body: '<div class="tbl-wrap"><table><tr><th>Shabd</th><th>Asal mein</th><th>Example</th></tr>' +
          '<tr><td><b>Region</b></td><td>Ek geography mein datacenters ka group. Har region baaki regions se alag aur independent.</td><td><code>ap-south-1</code> Mumbai, <code>ap-south-2</code> Hyderabad, <code>us-east-1</code> N. Virginia</td></tr>' +
          '<tr><td><b>AZ</b></td><td>Region ke andar ek ya zyada datacenters — alag power, cooling, network. AZs aapas mein fast private links se jude.</td><td>Mumbai mein 3 AZs: <code>ap-south-1a/b/c</code></td></tr>' +
          '<tr><td><b>Edge location</b></td><td>CloudFront (CDN) ke cache points — 600+ duniya bhar mein, India ke kai shehron mein</td><td>Jaipur ka user Mumbai origin ki images paas wale edge se paata hai</td></tr></table></div>',
        asli: 'Region = data kahan rahega (law + latency). AZ = failure se bachav (copies alag godowns mein). Edge = user ke paas cache (speed).',
      },
      {
        q: 'Region kaise chunein? (4 sawal, isi order mein)',
        points: [
          '<b>1. Law / compliance:</b> data kis desh mein rehna chahiye? India mein payment data RBI ke niyam se India mein hi rehna chahiye → <code>ap-south-1</code> ya <code>ap-south-2</code>.',
          '<b>2. Latency:</b> users kahan hain? Jaipur ke user ke liye Mumbai ~20–30 ms, N. Virginia ~200+ ms.',
          '<b>3. Service availability:</b> jo service chahiye woh region mein hai? Naye AWS services aksar pehle <code>us-east-1</code> mein aate hain.',
          '<b>4. Price:</b> regions ke daam alag hote hain — same server ka bill region badalne se badalta hai.',
        ],
        example: 'ShopKaro ke customers India mein hain aur payment data India mein rakhna zaroori hai → <b>Mumbai (ap-south-1)</b>. Hyderabad (ap-south-2) disaster recovery ke liye doosra region ban sakta hai.',
        asli: 'Pehle law, phir latency. Price sabse aakhir mein — galat region mein sasta server compliance todta hai.',
      },
      {
        q: 'Ek AZ gir jaaye toh kya hota hai — aur poora region giraye toh?',
        body: '<b>AZ failure</b> (ek building ki bijli/network): jo app sirf us AZ mein thi, woh band. Jo app 2+ AZs mein thi (load balancer + har AZ mein server + Multi-AZ database), woh chalti rehti hai.<br><br><b>Regional service failure</b>: poore region ki koi service hi gir jaaye, toh har AZ ki copy usi service par tiki hai — Multi-AZ nahi bachata. Uske liye <b>doosre region</b> mein copy chahiye (disaster recovery).',
        example: '<b>28 Feb 2017, us-east-1:</b> AWS ka ek engineer S3 ke billing system ko debug kar raha tha. Command mein typo hua aur zarurat se zyada S3 servers hat gaye. N. Virginia mein S3 lagbhag 4 ghante gira rahi. Hazaaron websites tooti — AWS ka apna status dashboard bhi S3 par tika tha, woh bhi update nahi ho paaya. S3 khud region ke saare AZs mein copies rakhta hai, isliye Multi-AZ apps bhi giri. Sirf woh bache jinke paas doosre region ki copy thi.',
        asli: 'Multi-AZ = ek building ki aag se bachav (sasta, hamesha karo). Multi-region = poore shehar ki bijli jaane se bachav (mehenga, zaroorat dekh ke karo).',
      },
      {
        q: 'Shared Responsibility — AWS kya sambhalta hai, tum kya sambhalte ho?',
        analogy: 'Kiraye ka flat. Building ki deewar, lift, society ka gate, bijli ki main line = landlord ka kaam. Flat ka taala, kisko chaabi di, andar ka saamaan = tumhara kaam. Tumne darwaza khula chhoda aur chori hui → landlord ki galti nahi.',
        body: '<b>AWS = security OF the cloud</b> (datacenter, hardware, hypervisor, managed service ka andar). <b>Tum = security IN the cloud</b> (data, IAM, network rules, config). Service jitni "managed", tumhara hissa utna chhota:' +
          '<div class="tbl-wrap"><table><tr><th>Kaam</th><th>EC2 (server)</th><th>RDS (managed DB)</th><th>S3 / Lambda</th></tr>' +
          '<tr><td>Datacenter, hardware</td><td>AWS</td><td>AWS</td><td>AWS</td></tr>' +
          '<tr><td>OS patching</td><td><b>Tum</b></td><td>AWS</td><td>AWS</td></tr>' +
          '<tr><td>DB engine patching</td><td><b>Tum</b> (agar EC2 par DB)</td><td>AWS (tum maintenance window chunte ho)</td><td>—</td></tr>' +
          '<tr><td>Firewall rules (security groups)</td><td><b>Tum</b></td><td><b>Tum</b></td><td>—</td></tr>' +
          '<tr><td>Data, IAM access, encryption choice</td><td><b>Tum</b></td><td><b>Tum</b></td><td><b>Tum</b></td></tr></table></div>',
        asli: 'AWS par S3 bucket public chhoda aur data leak hua = tumhari galti. EC2 ka OS patch nahi kiya aur hack hua = tumhari galti.',
      },
      {
        q: 'AWS se baat kaise karte hain? (Console, CLI, SDK, IaC)',
        body: 'AWS mein <b>har kaam ek API call</b> hai. Console (website) bhi andar se API call karta hai. Chaar raaste:',
        points: [
          '<b>Console</b> — browser mein clicks. Seekhne ke liye theek, production ke liye nahi (koi history nahi, repeat mushkil).',
          '<b>CLI</b> — terminal mein <code>aws s3 ls</code>. Scripts, automation, debugging.',
          '<b>SDK</b> — app ke code se (Python boto3, JavaScript).',
          '<b>IaC</b> — Terraform / CloudFormation files. Poora infra code mein, Git mein, review ke saath.',
        ],
        code: `aws sts get-caller-identity      # main kaun hoon? (account + ARN)
aws configure list               # kaunse region / credentials se chal raha hoon?
aws ec2 describe-availability-zones --region ap-south-1   # Mumbai ke AZs`,
        asli: 'Har AWS resource ka pakka naam <b>ARN</b> hai: <code>arn:aws:s3:::shopkaro-assets</code>. Galat account/region mein command chalana sabse common beginner galti hai — pehle <code>sts get-caller-identity</code>.',
      },
    ],
    myth: [
      { myth: 'Cloud hamesha sasta hota hai.', sach: 'Cloud tab sasta hai jab load upar-neeche hota hai aur tum band karna yaad rakhte ho. 24×7 flat bhaari load, bhoole hue servers, aur galat region ka data transfer cloud ko mehenga bana dete hain. Neeche wali live lab mein khud dekho.' },
      { myth: 'Multi-AZ = har outage se safe.', sach: 'Multi-AZ ek AZ (building) ki failure se bachata hai. 2017 S3 outage jaisi poore region ki service failure se sirf doosre region ki copy bachati hai.' },
      { myth: 'AWS par daal diya, ab security AWS ki zimmedari.', sach: 'AWS datacenter aur hardware sambhalta hai. Public bucket, internet par khula port 22, kamzor password, admin keys GitHub par — sab tumhari zimmedari.' },
    ],
    playbook: {
      title: 'cloud par kab jaayein, kaise shuru karein',
      use: [
        'Traffic upar-neeche hota hai (sale, exam result, IPL) — elasticity ka seedha fayda',
        'Startup jiske paas ₹60 lakh upfront nahi hai',
        'Jaldi experiment / naye shehar ya desh mein launch',
        'Database, queue, backup jaise kaam AWS ko dena — team product par dhyaan de',
      ],
      avoid: [
        '24×7 flat, bahut bada, saalon predictable load + apni hardware team — aisi kuch companies ke liye apne servers saste pade (jaise 37signals ne 2023 mein cloud chhoda)',
        'Data aise desh mein rehna zaroori jahan AWS region nahi hai',
        'Factory machines jinhe local network par 1 ms latency chahiye (wahan Outposts/edge socho)',
      ],
      how: [
        'Region chuno: law → latency → service → price',
        'Day 1: root user par MFA, roz ke kaam ke liye alag IAM identity (agla level)',
        'Day 1: AWS Budgets alarm (e.g. $10) — bill aane se pehle email',
        'Production hamesha 2+ AZs mein',
        'Jo banao woh IaC (Terraform) mein likho',
      ],
      redflags: [
        'Sab kuch ek AZ mein',
        'Koi budget alarm nahi — bill mahine ke end mein surprise',
        'Root user se roz kaam',
        'Indian payment data us-east-1 mein, sirf isliye ki tutorial wahi region use kar raha tha',
      ],
      rule: 'Region = law + latency. AZ = failure se bachav. Bill = jo chalu hai uska — band karna seekho.',
    },
    exam: [
      { cue: '"trade capital expense for variable expense", "pay only for what you use"', pick: 'Cloud ka core benefit — CapEx → OpEx', why: 'Pehle se hardware nahi khareedna, usage ke hisaab se bill.' },
      { cue: '"survive the failure of a single data center / AZ"', pick: 'Multi-AZ deployment', why: 'Load balancer + 2+ AZs mein servers + Multi-AZ database.' },
      { cue: '"survive a regional outage", "disaster recovery in another geographic area"', pick: 'Multi-region', why: 'Multi-AZ regional failure se nahi bachata.' },
      { cue: '"data must remain in country X"', pick: 'Country X ka region chuno (data residency)', why: 'Data region ke bahar apne aap nahi jaata — tum replication banao tabhi.' },
      { cue: '"who patches the guest OS on EC2"', pick: 'Customer', why: 'EC2 = IaaS. OS tumhara.' },
      { cue: '"who patches the database engine on RDS / OS under Lambda"', pick: 'AWS', why: 'Managed service — andar ka software AWS ka.' },
      { cue: '"lowest latency for global users of static content"', pick: 'CloudFront edge locations', why: 'Cache user ke paas.' },
    ],
    stages: [
      /* ---------- 1. DRY RUN (interaction pehle) ---------- */
      {
        type: 'dryrun',
        title: '🔍 Dry run — Mumbai ke ek AZ ki bijli gayi',
        goal: 'ShopKaro ab 2 AZs mein chalta hai. Har click par ek cheez badlegi. Dekho kaun bachta hai, kaise bachta hai — aur kis failure se Multi-AZ bhi nahi bachata.',
        groups: [
          { label: 'Region ap-south-1 (Mumbai)', x: 210, y: 18, w: 772, h: 486, kind: 'region' },
          { label: 'AZ ap-south-1a', x: 228, y: 165, w: 362, h: 322, kind: 'az' },
          { label: 'AZ ap-south-1b', x: 604, y: 165, w: 362, h: 322, kind: 'az' },
        ],
        nodes: [
          N('user', 100, 100, { label: 'Shoppers' }),
          N('alb', 596, 92, { label: 'Load Balancer' }),
          N('ec2#a', 409, 270, { label: 'web-a' }),
          N('ec2#b', 785, 270, { label: 'web-b' }),
          N('rds#p', 409, 415, { label: 'DB primary' }),
          N('rds#s', 785, 415, { label: 'DB standby' }),
        ],
        edges: [
          { from: 'user', to: 'alb' }, { from: 'alb', to: 'ec2#a' }, { from: 'alb', to: 'ec2#b' },
          { from: 'ec2#a', to: 'rds#p' }, { from: 'ec2#b', to: 'rds#p' }, { from: 'rds#p', to: 'rds#s', dashed: true },
        ],
        panels: [{ id: 'health', title: 'Load balancer target health' }, { id: 'screen', title: 'Shopper ki screen' }],
        steps: [
          {
            clock: '8:00 PM',
            say: 'Normal raat. Load balancer har request ko web-a ya web-b ko bhejta hai. Dono web servers <b>DB primary</b> (AZ-a) se baat karte hain. DB standby (AZ-b) primary ki har write ki copy turant rakhta hai — yahi RDS <b>Multi-AZ</b> hai.',
            flows: [{ from: 'user', to: 'alb', label: '900 req/s', tone: 'ok' }, { from: 'alb', to: 'ec2#a', tone: 'ok' }, { from: 'alb', to: 'ec2#b', tone: 'ok' }, { from: 'rds#p', to: 'rds#s', label: 'sync copy', tone: 'acc' }],
            nodes: { user: { tone: 'ok' }, alb: { tone: 'ok' }, 'ec2#a': { tone: 'ok' }, 'ec2#b': { tone: 'ok' }, 'rds#p': { tone: 'ok', badge: 'writes yahan' }, 'rds#s': { tone: 'idle', badge: 'copy ready' } },
            panels: { health: ['web-a: healthy ✅', 'web-b: healthy ✅'], screen: ['Kurta page 0.4 s mein ✅'] },
          },
          {
            clock: '8:12 PM',
            say: 'AZ-a ki building mein bijli ka main panel jal gaya. AZ-a ke andar ka <b>web-a</b> aur <b>DB primary</b> dono band. AZ-b par koi asar nahi — AZ-b ki bijli alag hai.',
            flows: [{ from: 'alb', to: 'ec2#a', label: '❌ timeout', tone: 'bad' }],
            nodes: { 'ec2#a': { tone: 'bad', badge: 'AZ-a down' }, 'rds#p': { tone: 'bad', badge: 'AZ-a down' } },
            panels: { health: ['web-a: checking... ⚠️', 'web-b: healthy ✅'], screen: ['Kuch requests slow / error ⚠️'] },
            ask: {
              q: 'Load balancer ab web traffic ke saath kya karega?',
              choices: [
                'Health check fail hone par web-a ko "unhealthy" mark karke saara traffic web-b ko bhejega',
                'Load balancer bhi band ho jayega kyunki load balancer AZ-a mein hai',
                'Load balancer web-a ke theek hone ka intezaar karega',
                'Load balancer naya region bana dega',
              ],
              answer: 0,
              explain: 'Load balancer har few seconds har target ki health check karta hai. Lagataar fail = unhealthy = traffic band. Load balancer khud kai AZs mein chalta hai, isliye ek AZ girne se load balancer nahi girta.',
            },
          },
          {
            clock: '8:12:30 PM',
            say: 'Health check 2 baar fail. Load balancer ne web-a ko nikaal diya. Saari web requests ab <b>web-b</b> par.',
            flows: [{ from: 'user', to: 'alb', label: '900 req/s', tone: 'ok' }, { from: 'alb', to: 'ec2#b', label: 'saara traffic', tone: 'ok' }],
            nodes: { 'ec2#b': { tone: 'busy', badge: 'CPU 70%' }, alb: { tone: 'ok', badge: 'sirf healthy ko' } },
            panels: { health: ['web-a: unhealthy ❌ (traffic band)', 'web-b: healthy ✅'] },
          },
          {
            clock: '8:13 PM',
            say: 'Database: RDS ne primary ka band hona pakda aur <b>standby ko naya primary</b> bana diya (failover, ~1–2 minute). App jis DB naam (DNS endpoint) se connect karti thi, woh naam ab naye primary ki taraf point karta hai.',
            flows: [{ from: 'ec2#b', to: 'rds#s', label: 'reconnect (same endpoint)', tone: 'ok' }],
            nodes: { 'rds#s': { tone: 'ok', badge: 'naya primary' } },
            panels: { screen: ['1–2 minute: checkout par "dobara try karo" ⚠️', 'phir sab normal ✅'] },
            ask: {
              q: 'Web server ko naye database ka address kaise pata chala?',
              choices: [
                'App DNS endpoint naam use karti hai; failover ke baad RDS us naam ko naye primary ki taraf point kar deta hai',
                'Developer ne raat 8 baje code mein naya IP daala',
                'Web server ne saare IPs try kiye',
                'Standby apne aap web-a ke IP par aa gaya',
              ],
              answer: 0,
              explain: 'App kabhi DB ka IP hardcode na kare — hamesha RDS endpoint (DNS naam). Failover mein connections tootte hain, isliye app mein reconnect/retry logic zaroori hai.',
            },
          },
          {
            clock: '8:15 PM',
            say: 'ShopKaro chal raha hai — sirf 1–2 minute checkout par jhatka. <b>Single-AZ setup hota toh step 2 par hi poori site band</b>, aur AZ-a theek hone tak (ghante) band rehti. Multi-AZ ka kharcha: ek extra web server + DB standby (database ka bill lagbhag 2×).',
            nodes: { user: { tone: 'ok', badge: 'shopping chalu' } },
            panels: { screen: ['Kurta page 0.6 s mein ✅'] },
          },
          {
            clock: 'Socho: Feb 2017',
            say: 'Ab doosri tarah ki failure: poore region ki ek <b>service</b> hi gir gayi (jaise Feb 2017 mein us-east-1 ki S3). Web-a aur web-b dono product images usi regional service se padhte hain. Dono AZs ek saath fail.',
            flows: [{ from: 'alb', to: 'ec2#a', tone: 'bad' }, { from: 'alb', to: 'ec2#b', tone: 'bad' }],
            nodes: { 'ec2#a': { tone: 'bad', badge: 'images nahi' }, 'ec2#b': { tone: 'bad', badge: 'images nahi' }, user: { tone: 'bad', badge: 'site tooti' } },
            panels: { screen: ['Images load nahi ❌', 'Checkout fail ❌'] },
            ask: {
              q: 'Is failure se kaunsi cheez bachati?',
              choices: [
                'Doosre region (jaise Hyderabad ap-south-2) mein copy + traffic shift',
                'Teesra AZ jodna',
                'Bada EC2 instance',
                'Load balancer ka health check tez karna',
              ],
              answer: 0,
              explain: 'Saare AZs usi regional service par tike the. Regional failure se sirf multi-region bachata hai — aur multi-region ka kharcha + mehnat zyada hai, isliye business ki zaroorat dekh ke karte hain.',
            },
          },
        ],
        lesson: '<b>Asli baat:</b> Multi-AZ = ek AZ girne par bhi site chalti hai (load balancer health check + RDS failover). Multi-AZ har production app ka default hai. Poore region ki failure se bachne ke liye multi-region chahiye — woh DR level mein seekhoge.',
      },

      /* ---------- 2. LIVE LAB ---------- */
      {
        type: 'flowlab',
        title: '🎛️ Live lab — kharido ya kiraye par lo? Kab on-prem jeetta hai?',
        goal: 'Shuru mein ShopKaro ka Diwali scenario hai (cloud bahut sasta). Knobs ghuma ke <b>ek aisi situation dhoondo jahan apne server khareedna cloud se sasta pade</b>. Isse samjhoge ki cloud ka fayda kis tarah ke load par hai.',
        scenario: 'Hisaab (illustrative): khareeda hua server ≈ ₹1.2 lakh/saal (₹3 lakh hardware 5 saal mein + bijli/jagah + ops). Cloud par same server 24×7 Savings Plan ke saath ≈ ₹1.65 lakh/saal, aur peak ke extra server On-Demand ₹29/ghanta. On-prem mein peak ke liye pehle se khareedna padta hai.',
        knobs: [
          { id: 'normal', label: 'Normal din kitne server chahiye', min: 1, max: 10, step: 1, value: 2, unit: ' server' },
          { id: 'peak', label: 'Peak par kitna guna traffic', min: 1, max: 20, step: 1, value: 20, unit: '×', note: '1× = koi peak nahi, traffic hamesha same' },
          { id: 'days', label: 'Saal mein kitne din peak', min: 1, max: 60, step: 1, value: 3, unit: ' din' },
        ],
        model: k => {
          const m = capexModel(k);
          const cheaper = m.onprem < m.cloud ? 'onprem' : 'cloud';
          const max = Math.max(m.onprem, m.cloud);
          return {
            readouts: [
              { label: 'On-prem (peak ke liye khareedo)', value: L(m.onprem), tone: cheaper === 'onprem' ? 'ok' : 'bad' },
              { label: 'Cloud (baseline + peak kiraye)', value: L(m.cloud), tone: cheaper === 'cloud' ? 'ok' : 'bad' },
              { label: 'On-prem servers khareedne padenge', value: m.servers + ' server', tone: m.servers > k.normal * 3 ? 'warn' : '' },
              { label: 'On-prem servers ka average use', value: m.util.toFixed(0) + '%', tone: m.util < 30 ? 'bad' : m.util < 70 ? 'warn' : 'ok' },
            ],
            bars: [
              { label: 'On-prem saal ka kharcha', pct: m.onprem / max * 100, tone: cheaper === 'onprem' ? 'ok' : 'bad', text: L(m.onprem) },
              { label: 'Cloud saal ka kharcha', pct: m.cloud / max * 100, tone: cheaper === 'cloud' ? 'ok' : 'bad', text: L(m.cloud) },
            ],
            verdict: cheaper === 'onprem'
              ? { ok: true, text: `On-prem ${L(m.cloud - m.onprem)} sasta — traffic flat hai, khareede hue server ${m.util.toFixed(0)}% use ho rahe hain. Khaali capacity nahi, toh kiraye ka premium bekaar.` }
              : { ok: false, text: `Cloud ${L(m.onprem - m.cloud)} sasta. On-prem mein ${m.servers} server khareedne padte, average use sirf ${m.util.toFixed(0)}% — baaki capacity saal bhar khaali.` },
          };
        },
        check: k => { const m = capexModel(k); return m.onprem < m.cloud; },
        lesson: '🎯 On-prem tabhi jeeta jab <b>peak 1×</b> kiya — matlab traffic hamesha flat. Jaise hi thoda bhi peak aaya, khareede hue servers khaali baithe aur cloud sasta pada. <b>Asli baat:</b> cloud ka paisa <b>elasticity</b> se bachta hai. Flat 24×7 load par cloud mein bhi Savings Plans / Reserved capacity lo, warna "cloud mehenga hai" wali shikayat aati hai.',
        quiz: {
          q: 'Kis tarah ke load par cloud ka sabse bada paisa bachta hai?',
          choices: [
            'Spiky load — kabhi 1×, kabhi 20× (sale, exam result, IPL final)',
            'Flat 24×7 load jo saalon same rehta hai',
            'Load jo kabhi exist hi nahi karta',
            'Har tarah ke load par barabar bachat',
          ],
          answer: 0,
          explain: 'Spiky load par on-prem ko peak ke hisaab se khareedna padta hai aur saal bhar capacity khaali rehti hai. Cloud mein peak capacity sirf peak ke ghanton ke liye.',
        },
      },

      /* ---------- 3. BINS: shared responsibility ---------- */
      {
        type: 'bins',
        title: 'Kiska kaam? — AWS ya Tum',
        instructions: 'Har kaam ko sahi bin mein daalo. Dhyaan do service kaunsi hai — EC2, RDS aur S3 par jawab alag hai.',
        bins: [
          { id: 'aws', label: '🏢 AWS ka kaam (security OF the cloud)' },
          { id: 'you', label: '🧑 Tumhara kaam (security IN the cloud)' },
        ],
        items: [
          { text: 'Datacenter ka gate, guard, CCTV', bin: 'aws', explain: 'Physical security hamesha AWS ki.' },
          { text: 'EC2 instance ke Linux OS ka security patch', bin: 'you', explain: 'EC2 = IaaS. OS tumne chuna, OS tum patch karoge (SSM Patch Manager se automate kar sakte ho).' },
          { text: 'RDS PostgreSQL engine ka minor version patch', bin: 'aws', explain: 'RDS managed hai — AWS patch lagata hai, tum sirf maintenance window chunte ho.' },
          { text: 'S3 bucket public hai ya private', bin: 'you', explain: 'Bucket ki settings aur policy tumhari. Public chhodi = leak tumhari galti.' },
          { text: 'Security group mein port 22 kis IP ke liye khula', bin: 'you', explain: 'Network rules hamesha customer ki zimmedari.' },
          { text: 'Lambda function ke neeche chalne wale OS ka patch', bin: 'aws', explain: 'Lambda serverless — OS aur runtime ka infra AWS sambhalta hai. Tumhara code aur uski libraries tumhari.' },
          { text: 'Hypervisor (EC2 ke neeche ka virtualization layer)', bin: 'aws', explain: 'Hypervisor AWS ka hai (Nitro). Tum us tak pahunch bhi nahi sakte.' },
          { text: 'IAM users par MFA lagana', bin: 'you', explain: 'Identity aur access tumhari zimmedari.' },
          { text: 'Database ka data encrypt karna hai ya nahi — yeh faisla', bin: 'you', explain: 'Encryption ka option AWS deta hai; on karna aur key chunna tumhara faisla.' },
        ],
      },

      /* ---------- 4. MATCH: geography ---------- */
      {
        type: 'match',
        title: 'AWS ka naksha — naam milao',
        instructions: 'Har term ko uske sahi matlab se jodo.',
        pairs: [
          { left: 'Region', right: 'Ek geography mein datacenters ka independent group — jaise ap-south-1 (Mumbai)', explain: 'Regions ek doosre se alag hain. Data apne aap region ke bahar nahi jaata.' },
          { left: 'Availability Zone', right: 'Region ke andar alag power/network wale datacenter(s) — jaise ap-south-1a', explain: 'Multi-AZ = ek building ki failure se bachav.' },
          { left: 'Edge location', right: 'CloudFront ke cache points, users ke paas — 600+ duniya bhar mein', explain: 'Static content user ke paas se serve hota hai = tez + origin par load kam.' },
          { left: 'ap-south-2', right: 'Hyderabad region — India ka doosra region', explain: 'India mein data rakhte hue DR ke liye Mumbai + Hyderabad jodi.' },
          { left: 'ZoneId (aps1-az1)', right: 'Physical AZ ka pakka naam — har account mein same', explain: 'AZ naam (ap-south-1a) har account mein shuffled hote hain; ZoneId physical zone batata hai.' },
          { left: 'ARN', right: 'Har AWS resource ka globally unique naam — arn:aws:s3:::shopkaro-assets', explain: 'Policies aur CLI mein resources ARN se pehchaane jaate hain.' },
        ],
      },

      /* ---------- 5. TRIAGE ---------- */
      {
        type: 'triage',
        title: '🩺 Triage — "Free tier socha tha, ₹39,000 ka bill aa gaya"',
        symptom: '23 October. ShopKaro ke AWS account ka bill alert nahi tha. Accountant ne card statement dekha: <b>AWS $443 (~₹39,000)</b>. Team kehti hai "humne toh Mumbai mein sirf ek chhota server chalaya hai". Console mein Mumbai region kholo toh sirf 1 chhota instance dikhta hai. Paisa gaya kahan?',
        commands: [
          { cmd: 'aws ec2 describe-instances --region ap-south-1 --query "Reservations[].Instances[].[InstanceId,InstanceType,State.Name]" --output text', out: 'i-0a1b2c3d4e5f60718\tt3.micro\trunning', clue: false, note: 'Mumbai mein sirf ek t3.micro — itne chhote server ka bill $443 nahi ho sakta. Dead end... ya galat jagah dekh rahe ho?' },
          { cmd: 'aws ce get-cost-and-usage --time-period Start=2026-10-01,End=2026-10-23 --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=REGION', out: '{\n  "ResultsByTime": [{\n    "TimePeriod": { "Start": "2026-10-01", "End": "2026-10-23" },\n    "Groups": [\n      { "Keys": ["us-east-1"],  "Metrics": { "UnblendedCost": { "Amount": "440.64", "Unit": "USD" } } },\n      { "Keys": ["ap-south-1"], "Metrics": { "UnblendedCost": { "Amount": "3.10",   "Unit": "USD" } } }\n    ]\n  }]\n}', clue: true, note: '99% bill <b>us-east-1 (N. Virginia)</b> se aaya. Team ne us region ko kabhi dekha hi nahi.' },
          { cmd: 'aws ec2 describe-instances --region us-east-1 --query "Reservations[].Instances[].[InstanceId,InstanceType,LaunchTime,State.Name]" --output text', out: 'i-07aa11bb22cc33dd4\tc5.2xlarge\t2026-10-05T11:12:40+00:00\trunning\ni-07aa11bb22cc33dd5\tc5.2xlarge\t2026-10-05T11:12:40+00:00\trunning\ni-07aa11bb22cc33dd6\tc5.2xlarge\t2026-10-05T11:12:40+00:00\trunning', clue: true, note: '3 × c5.2xlarge, 5 October se chal rahe. 3 × ~$0.34/ghanta × 432 ghante ≈ $440. Yahi bill hai.' },
          { cmd: 'aws cloudtrail lookup-events --region us-east-1 --lookup-attributes AttributeKey=EventName,AttributeValue=RunInstances --max-results 1 --query "Events[].[EventTime,Username]" --output text', out: '2026-10-05T11:12:40+00:00\tintern-rahul', clue: true, note: 'CloudTrail batata hai kisne launch kiya: intern-rahul, load test ke liye — console ka region default N. Virginia par chhoot gaya tha.' },
          { cmd: 'aws budgets describe-budgets --account-id 123456789012', out: '{\n    "Budgets": []\n}', clue: true, note: 'Koi budget alarm nahi tha. $10 ka alarm hota toh 5 October ki shaam hi email aa jaata.' },
          { cmd: 'aws ec2 describe-regions --query "Regions[].RegionName" --output text', out: 'af-south-1 ap-east-1 ap-northeast-1 ap-south-1 ap-south-2 ap-southeast-1 ... us-east-1 us-east-2 us-west-1 us-west-2', clue: false, note: 'Regions ki list — kaam ki, par bill ka jawab nahi deti.' },
        ],
        questions: [
          {
            q: 'Team ko yeh instances pehle kyun nahi dikhe?',
            choices: [
              'Console aur CLI ek waqt mein sirf ek region dikhate hain; team sirf Mumbai dekh rahi thi, instances N. Virginia mein the',
              'AWS ne instances chhupa diye the',
              'Intern ne instances delete karke dobara banaye',
              'Free tier mein instances dikhte nahi',
            ],
            answer: 0,
            explain: 'EC2 regional service hai. "Kuch nahi chal raha" kehne se pehle har region check karo (ya Cost Explorer ka region breakdown).',
          },
          {
            q: 'Aisa dobara na ho, iske liye sabse pehla aur sasta kadam?',
            choices: [
              'AWS Budgets alarm (e.g. $10 aur $50 par email) — aaj hi',
              'Intern ko nikaal do',
              'Saare regions mein ek-ek server chala ke rakho',
              'Credit card hata do',
            ],
            answer: 0,
            explain: 'Budget alarm minutes mein lagta hai aur free hai. Aage chal ke Organizations SCP se unused regions block karna aur tags (owner) lagana bhi seekhoge.',
          },
          {
            q: 'Abhi turant kya karoge?',
            choices: [
              'Rahul se confirm karke us-east-1 ke teeno c5.2xlarge terminate karo (data chahiye toh pehle snapshot)',
              'Mumbai ka t3.micro band karo',
              'Account close kar do',
              'Mahine ke end tak wait karo',
            ],
            answer: 0,
            explain: 'Load test khatam ho chuka tha. Owner se confirm → snapshot (agar data chahiye) → terminate. Bill har ghante badh raha hai.',
          },
        ],
      },

      /* ---------- 6. TERMINAL (in-app simulator) ---------- */
      (function () {
        const TASKS = [
          { text: 'aws sts get-caller-identity — main kaun hoon (account + ARN)', check: s => s.history.some(h => /aws sts get-caller-identity/.test(h)) },
          { text: 'aws configure get region — kis region mein hoon', check: s => s.history.some(h => /aws configure (get region|list)/.test(h)) },
          { text: 'aws ec2 describe-availability-zones — is region ke AZs', check: s => s.history.some(h => /aws ec2 describe-availability-zones/.test(h)) },
          { text: 'aws s3 ls — kaunsi buckets hain', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
        ];
        return {
          type: 'terminal',
          title: '🖥️ Mission: pehla aws CLI — main kaun hoon, kahan hoon?',
          instructions: 'In-app simulator. Asli commands type karo (<code>help</code> se list).',
          goal: 'ShopKaro ke naye AWS account mein pehli baar login kiya. Chaar sawalon ka jawab CLI se nikaalo: <b>(1)</b> kaunsi identity — <code>aws sts get-caller-identity</code>. <b>(2)</b> kaunsa region — <code>aws configure get region</code>. <b>(3)</b> is region ke AZs — <code>aws ec2 describe-availability-zones</code>. <b>(4)</b> kaunsi buckets — <code>aws s3 ls</code>.',
          tasks: TASKS,
          account: {
            region: 'ap-south-1',
            callerIdentity: { Account: '123456789012', UserId: 'AIDASHOPKARONEHA', Arn: 'arn:aws:iam::123456789012:user/neha' },
            buckets: [{ name: 'shopkaro-assets', region: 'ap-south-1', creationDate: '2026-10-01 10:20:00', objects: [] }],
          },
          success: AG.allOf(TASKS),
          successText: 'Chaaron jawab mil gaye. <code>sts get-caller-identity</code> ne <b>ARN</b> dikhaya — <code>arn:aws:iam::123456789012:user/neha</code> = account 123456789012 ka IAM user neha. Region <code>ap-south-1</code> (Mumbai) aur uske 3 AZs. Aadat bana lo: <b>koi bhi badi command se pehle identity aur region check.</b>',
          hints: [
            'aws sts get-caller-identity',
            'aws configure get region',
            'aws ec2 describe-availability-zones',
            'aws s3 ls',
          ],
        };
      })(),

      /* ---------- 7. REAL LAB (Moto) ---------- */
      {
        type: 'docker',
        title: '🐳 Real lab — asli aws CLI, laptop par AWS',
        project: '01-first-contact',
        goal: 'Laptop par local AWS emulator chalao aur asli <code>aws</code> CLI se: identity, Mumbai ke AZs (naam vs ZoneId), pehli bucket, aur "invisible bill" wali galti khud bana ke pakdo.',
        why: 'Simulator commands samjhata hai; yeh lab wahi commands <b>asli CLI</b> se chalwati hai. Yahi commands kal asli AWS account par bhi chalengi.',
        steps: [
          { text: 'Emulator chalao (ek baar) aur terminal ko emulator ki taraf point karo.', cmd: 'cd aws-gurukul/docker-labs\n./start-moto.sh        # ya: docker compose up -d\nsource env.sh', expect: '✅ Moto chalu — http://127.0.0.1:4566   (agla kadam: source env.sh)\n🧪 aws → http://127.0.0.1:4566 (region ap-south-1). Asli AWS par wapas: unset AWS_ENDPOINT_URL' },
          { text: 'Main kaun hoon, aur Mumbai ke AZs kaunse hain?', cmd: "aws sts get-caller-identity\naws ec2 describe-availability-zones --query 'AvailabilityZones[].[ZoneName,ZoneId,State]' --output table", expect: '{\n    "UserId": "AKIAIOSFODNN7EXAMPLE",\n    "Account": "123456789012",\n    "Arn": "arn:aws:sts::123456789012:user/moto"\n}\n|  ap-south-1a|  aps1-az1  |  available  |\n|  ap-south-1b|  aps1-az3  |  available  |\n|  ap-south-1c|  aps1-az2  |  available  |' },
          { text: 'Pehli bucket aur pehli file.', cmd: 'cd 01-first-contact\naws s3 mb s3://shopkaro-assets-<tumhara-naam>\naws s3 cp hello.txt s3://shopkaro-assets-<tumhara-naam>/\naws s3 ls s3://shopkaro-assets-<tumhara-naam>/', expect: 'make_bucket: shopkaro-assets-neha\nupload: ./hello.txt to s3://shopkaro-assets-neha/hello.txt\n2026-10-23 19:51:56         15 hello.txt' },
          { text: 'Galti banao: 3 instances <b>us-east-1</b> mein launch karo, phir default region (Mumbai) mein dhoondo.', cmd: "AMI=$(aws ec2 describe-images --region us-east-1 --owners amazon --query 'Images[0].ImageId' --output text)\naws ec2 run-instances --region us-east-1 --image-id $AMI --instance-type t3.large --count 3 --query 'Instances[].InstanceId' --output text\naws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId' --output text", expect: 'i-55a139a20eb92a99c\ti-33a0749506f3d9817\ti-9fef9bff287deb89d\n                      ← Mumbai mein kuch nahi dikha!' },
          { text: 'Har region scan karke pakdo (README ka loop), phir terminate karo.', cmd: "for r in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do\n  n=$(aws ec2 describe-instances --region $r --filters Name=instance-state-name,Values=running --query 'length(Reservations[].Instances[])' --output text 2>/dev/null)\n  [ -n \"$n\" ] && [ \"$n\" != \"0\" ] && echo \"$r: $n running\"\ndone", expect: 'us-east-1: 3 running' },
        ],
        observe: {
          q: 'Step 2 mein `ap-south-1b` ka ZoneId `aps1-az3` aaya. Iska matlab kya hai?',
          choices: [
            'AZ ka naam har account mein shuffled hota hai; ZoneId physical zone ka pakka naam hai jo har account mein same hai',
            'ap-south-1b band hai',
            'Moto ka bug hai, asli AWS mein naam aur id hamesha same hote hain',
            'ap-south-1b Hyderabad mein hai',
          ],
          answer: 0,
          explain: 'AWS load baantne ke liye har account mein AZ naam alag physical zones par map karta hai. Do accounts ka "same AZ" chahiye toh ZoneId milao.',
        },
      },

      /* ---------- 8. EXAM-STYLE QUIZ ---------- */
      {
        type: 'quiz',
        bonus: true,
        title: '📝 SAA-style quick-fire — Cloud basics',
        questions: [
          {
            q: 'Ek company ka traffic Black Friday par 15× hota hai aur baaki saal flat. Kaunsa cloud benefit sabse zyada bachat dega?',
            choices: ['Elasticity — peak capacity sirf peak ke din', 'Global reach', 'Managed databases', 'Shared responsibility'],
            answer: 0,
            explain: 'Peak ke liye pehle se khareedi capacity saal bhar khaali rehti. Elasticity se capacity load ke saath badhti-ghatti hai.',
          },
          {
            q: 'Application ko ek datacenter ki failure jhelni hai, MINIMUM extra cost mein. Kya karoge?',
            choices: ['Ek region ke andar 2+ Availability Zones mein deploy', 'Do regions mein active-active', 'Bada instance type', 'Teen edge locations'],
            answer: 0,
            explain: 'Datacenter failure = AZ failure. Multi-AZ sabse sasta sahi jawab. Multi-region zyada mehenga — regional failure ke liye.',
          },
          {
            q: 'Indian fintech app ka payment data niyam ke hisaab se India mein hi rehna chahiye. Region?',
            choices: ['ap-south-1 (Mumbai) / ap-south-2 (Hyderabad)', 'us-east-1 kyunki sasta hai', 'Koi bhi — AWS global hai', 'eu-west-1'],
            answer: 0,
            explain: 'Region choice ka pehla sawal law/compliance hai. AWS data ko region ke bahar apne aap nahi le jaata.',
          },
          {
            q: 'EC2 par chal rahe MySQL database ka engine patch kaun lagayega?',
            choices: ['Customer — EC2 par software tumhara hai', 'AWS — database hai isliye', 'Dono milke', 'Koi nahi, auto ho jaata hai'],
            answer: 0,
            explain: 'EC2 par khud install kiya MySQL tumhara. RDS MySQL hota toh AWS patch lagata.',
          },
          {
            q: 'Kaunsi cheez Availability Zone ke baare mein SAHI hai?',
            choices: [
              'Ek region mein kai AZs hote hain, har AZ ki alag power aur network, aur AZs low-latency links se jude hote hain',
              'AZ ek desh hota hai',
              'Ek AZ mein kai regions hote hain',
              'AZ sirf CloudFront ke liye hote hain',
            ],
            answer: 0,
            explain: 'Region ⊃ AZs. AZs ka isolation failure se bachata hai, low-latency links synchronous replication (Multi-AZ DB) possible banate hain.',
          },
          {
            q: 'Startup ke paas upfront paisa nahi hai, product-market fit pata nahi. Sabse seedha cloud fayda?',
            choices: ['Koi upfront investment nahi — pay-as-you-go, fail ho toh band karo', 'Hamesha sasta', 'Koi security zimmedari nahi', 'Unlimited free tier'],
            answer: 0,
            explain: 'CapEx nahi, experiment sasta. "Hamesha sasta" myth hai, aur security IN the cloud tumhari hi rehti hai.',
          },
          {
            q: 'Console mein kuch nahi dikh raha par bill aa raha hai. Sabse pehle kya check karoge?',
            choices: ['Doosre regions (Cost Explorer region breakdown / region scan)', 'Browser cache', 'AWS support ko gaali', 'Free tier page'],
            answer: 0,
            explain: 'Console/CLI ek region dikhate hain. Bhoole hue resources aksar doosre region mein hote hain.',
          },
          {
            q: 'Global users ke liye static images ki latency kam karni hai, kam se kam effort mein.',
            choices: ['CloudFront (edge locations par cache)', 'Har desh mein EC2', 'Bada S3 bucket', 'Multi-AZ'],
            answer: 0,
            explain: 'Edge locations user ke paas cache rakhte hain — origin ek hi region mein rahe.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Cloud basics',
      instructions: 'Pehla mock interview. Jawab mein numbers aur "kyun" bolna — interviewer wahi sunna chahta hai. 🎤',
      questions: [
        {
          q: 'Manager poochta hai: "Hum apne do server wale setup ko cloud par kyun le jaayein?" Sabse strong business reason?',
          choices: [
            'Elasticity + pay-as-you-go: sale ke din capacity badhao, baaki din ghatao; upfront hardware nahi (CapEx → OpEx); naya server minutes mein',
            'Cloud naya hai isliye better hai',
            'Cloud par security ki koi zimmedari nahi',
            'Cloud har haalat mein sasta hai',
          ],
          answer: 0,
          explain: 'Achha jawab numbers ke saath: "Diwali par 20× traffic ke liye on-prem 40 server khareedne padte, average use 6%. Cloud mein peak capacity sirf 3 din."',
        },
        {
          q: '"Shared Responsibility Model" ek line mein — aur EC2 vs RDS ka farak?',
          choices: [
            'AWS = security OF the cloud (datacenter, hardware, managed service ka andar); customer = IN the cloud (data, IAM, network rules). EC2 par OS customer ka, RDS par OS + DB engine patch AWS ka',
            'AWS sab kuch sambhalta hai',
            'Customer sab kuch sambhalta hai, AWS sirf bill bhejta hai',
            'Koi clear division nahi hai',
          ],
          answer: 0,
          explain: 'Service jitni managed, customer ka hissa utna chhota — par data, IAM aur access hamesha customer ka.',
        },
        {
          q: 'Interviewer: "Multi-AZ aur multi-region mein kya farak hai? Kab kaunsa?"',
          choices: [
            'Multi-AZ ek region ke andar AZ failure se bachata hai (har production ka default, sasta). Multi-region regional outage/DR ke liye — mehenga, RTO/RPO ki zaroorat dekh ke',
            'Dono same hain',
            'Multi-region sasta hai, multi-AZ mehenga',
            'Multi-AZ sirf databases ke liye hota hai',
          ],
          answer: 0,
          explain: 'Example bolo: "2017 mein us-east-1 ki S3 outage mein Multi-AZ apps bhi giri — kyunki failure regional thi."',
        },
        {
          q: 'Naye account mein pehle din kaunse 3 kaam karoge?',
          choices: [
            'Root user par MFA + root ko roz use na karna, budget alarm, aur roz ke kaam ke liye alag IAM identity',
            'Saare regions mein EC2 chalana',
            'Root user ki access keys banana',
            'Pehle production deploy, security baad mein',
          ],
          answer: 0,
          explain: 'Day-1 basics: root lock, budget alarm, least-privilege identity. Agla level (IAM) isi par hai.',
        },
      ],
    },
    success: [
      'Main kisi ko numbers ke saath samjha sakta hoon ki spiky load par cloud kyun sasta hai, aur flat load par kab nahi',
      'Main region chun sakta hoon: law → latency → service → price',
      'Main bata sakta hoon kaunsi failure se Multi-AZ bachata hai aur kab multi-region chahiye',
      'Main EC2, RDS aur S3 ke liye shared responsibility ka farak bata sakta hoon',
      'Main aws CLI se identity, region, AZs check kar sakta hoon aur "invisible bill" (galat region) pakad sakta hoon',
    ],
    homework: `<p><b>Asli AWS account (optional).</b> July 2025 se naye AWS accounts mein <b>Free plan</b> milta hai: signup par credits (aur kuch onboarding tasks karne par extra credits), kuch mahinon ke liye. Purane "12 mahine free" wala model naye accounts par nahi hai. Signup se pehle <a href="https://aws.amazon.com/free/" target="_blank" rel="noopener">aws.amazon.com/free</a> par current terms padh lo.</p>
      <pre># Day-1 checklist (console):
1. Root user par MFA lagao (IAM → Security credentials)
2. Billing → Budgets → "Zero spend" ya $10 ka budget alarm
3. Region selector (upar daayein) → Mumbai (ap-south-1)
4. CloudShell kholo (browser terminal) aur chalao:
   aws sts get-caller-identity
   aws ec2 describe-availability-zones --query 'AvailabilityZones[].[ZoneName,ZoneId]' --output table</pre>
      <p>✅ Self-check: tumhare account mein <code>ap-south-1a</code> ka ZoneId kya aaya? Lab ke ZoneId se match kiya?</p>`,
    cards: [
      { front: 'Cloud ka sabse bada paisa bachane wala fayda kab milta hai?', back: '<b>Spiky load</b> par — elasticity se peak capacity sirf peak ke ghante. Flat 24×7 load par Savings Plans lo, warna cloud mehenga lag sakta hai.' },
      { front: 'Region vs AZ vs Edge location?', back: '<b>Region</b> = geography (ap-south-1 Mumbai). <b>AZ</b> = region ke andar alag power/network wale datacenters (ap-south-1a). <b>Edge</b> = CloudFront cache points users ke paas.' },
      { front: 'Region chunne ke 4 sawal (order mein)?', back: '1. Law/compliance (data kahan rehna chahiye) 2. Latency (users kahan) 3. Service available hai? 4. Price.' },
      { front: 'Multi-AZ kis failure se NAHI bachata?', back: 'Poore region ki service failure se (jaise Feb 2017 us-east-1 S3 outage). Uske liye multi-region/DR.' },
      { front: 'EC2 par OS patch kaun lagata hai? RDS par DB engine patch?', back: 'EC2 OS = <b>customer</b>. RDS engine = <b>AWS</b> (customer maintenance window chunta hai). Data, IAM, network rules hamesha customer.' },
      { front: 'Console mein resource nahi dikh raha par bill aa raha hai — pehla shak?', back: '<b>Doosra region.</b> Console/CLI ek region dikhate hain. Cost Explorer ka region breakdown ya region-scan loop chalao. Day 1 par budget alarm.' },
      { front: 'ap-south-1a ka matlab har account mein same building hai?', back: '<b>Nahi.</b> AZ naam har account mein shuffled hote hain. Physical zone ka pakka naam <b>ZoneId</b> (aps1-az1) hai.' },
    ],
  }]);
})();
