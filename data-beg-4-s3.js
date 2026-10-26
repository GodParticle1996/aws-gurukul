/* =====================================================================
   AWS Gurukul — 🌱 Beginner · Level 4: S3 (v2, 2026-10-23)
   ShopKaro: images sabko dikhein, invoices sirf owner ko, aur galti wapas aaye.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho. Chhote vaakya.
   ===================================================================== */
(function () {
  const N = AG.aws.n;

  /* kaun dekh sakta hai? — 4 requests, Block Public Access + bucket policy ke hisaab se */
  const POLICIES = [
    'koi bucket policy nahi',
    'public read — poori bucket (Principal "*")',
    'public read — sirf images/*',
    'sirf CloudFront (OAC) — sirf images/*',
  ];
  function access(k) {
    const bpa = k.bpa === 1, p = k.policy;
    const publicAll = p === 1, publicImages = p === 2, oacImages = p === 3;
    const publicWorks = !bpa;                    // BPA on → public policies ignore/reject
    const cell = (allowed, want) => ({ allowed, good: allowed === want });
    return {
      anonImg: cell(publicWorks && (publicAll || publicImages), false),
      anonInv: cell(publicWorks && publicAll, false),
      cfImg: cell(oacImages || (publicWorks && (publicAll || publicImages)), true),
      cfInv: cell(publicWorks && publicAll, false),
    };
  }

  AG.registerLevels('beginner', [{
    id: 's3',
    icon: '🪣',
    title: 'S3 — files ka godown: kaun dekhe, aur galti kaise wapas lo',
    badge: 'Bucket Builder',
    hook: {
      when: 'ShopKaro · IAM hack ke 2 hafte baad',
      title: '"Mujhe kisi aur ka invoice dikh raha hai"',
      text: 'IAM wale hack mein attacker ne product images ki bucket khaali kar di thi. Versioning off thi — ek bhi photo wapas nahi aayi; 1,800 photos dobara khinchwani padi. Naye setup mein Ravi ne jaldi mein ek hi bucket banayi: <code>images/</code> aur <code>invoices/</code> dono usi mein. Website par photos dikhane ke liye Ravi ne bucket <b>public</b> kar di. Teen din baad customer Priya ka email aaya: "Mere invoice link mein INV-10231 tha. Maine 10232 kiya toh kisi Bengaluru wale ka naam, address aur order dikh gaya." Neha ka sawal: photos sabko dikhein, invoice sirf usi customer ko, aur koi galti se delete ya overwrite kare toh wapas aaye — ek S3 mein yeh sab kaise?',
    },
    objectives: [
      'S3 ka model: <b>bucket, key, object</b> — aur "folder" asal mein kya hai',
      '<b>Durability vs availability</b> — 11 nines ka sach, aur woh kis cheez se NAHI bachata',
      '<b>Kaun dekh sakta hai:</b> Block Public Access, bucket policy, IAM — aur website ke liye <b>CloudFront + OAC</b>',
      '<b>Presigned URL</b> — private file ek customer ko, kuch minute ke liye',
      '<b>Versioning + delete marker</b> — overwrite aur delete dono wapas; Object Lock / MFA Delete',
      '<b>Encryption</b> (SSE-S3 default, SSE-KMS kab), <b>lifecycle</b> se bill control, aur performance numbers',
    ],
    steps: [
      {
        q: 'S3 hai kya — bucket, key, object?',
        analogy: 'Ek bahut bada godown (<b>bucket</b>). Andar har dabba (<b>object</b>) par ek lambi label likhi hai (<b>key</b>): <code>images/kurta/red-001.jpg</code>. Godown mein asal mein almaariyan/folders nahi hain — sab dabbe ek hi farsh par hain. Label mein "/" dekh ke console tumhe folder jaisa dikhata hai.',
        body: '<div class="tbl-wrap"><table><tr><th>Shabd</th><th>Matlab</th><th>Example</th></tr>' +
          '<tr><td><b>Bucket</b></td><td>Container — naam <b>duniya bhar mein unique</b>, ek region mein</td><td><code>shopkaro-product-images</code></td></tr>' +
          '<tr><td><b>Key</b></td><td>Object ka poora naam (path jaisa dikhta hai)</td><td><code>images/kurta/red-001.jpg</code></td></tr>' +
          '<tr><td><b>Object</b></td><td>Data + metadata (content-type, size, tags)</td><td>51 KB JPEG</td></tr>' +
          '<tr><td><b>Prefix</b></td><td>Key ka shuru wala hissa — "folder" ka bhram</td><td><code>images/kurta/</code></td></tr></table></div>' +
          'Ek object ka current documented maximum <b>50 TB</b> hai (December 2025 update). Ek PUT max 5 GB — badi file ke liye <b>multipart upload</b> (around 100 MB se consider karo). 2020 se S3 <b>strong read-after-write</b> consistent hai: successful write ke baad read naya data deta hai.',
        asli: 'S3 = HTTP API wala object store. File ke beech mein ek byte edit nahi hota — poora object dobara likhna padta hai. Database ya OS disk ke liye nahi.',
      },
      {
        q: '11 nines durability ka matlab kya hai — aur kya nahi?',
        body: '<b>Durability 99.999999999%</b> = AWS ke hisaab se 1 crore objects rakho toh average 10,000 saal mein ek object hardware failure se kho sakta hai. S3 Standard data ko region ke 3+ AZs mein rakhta hai.<br><br><b>Availability 99.99%</b> (Standard) = saal mein ~53 minute tak S3 jawab na de, yeh SLA ke andar hai. Durability ≠ availability.',
        points: [
          '✅ Disk kharab, rack jala, ek AZ gaya → data bacha',
          '❌ <b>Tumne (ya attacker ne) delete/overwrite kiya</b> → S3 ne wahi kiya jo kaha gaya. 11 nines tumhari galti se nahi bachata.',
          '❌ Poore region ki outage (2017) → data bacha rehta hai, par kuch ghante mil nahi sakta',
        ],
        asli: 'Galti se bachav = <b>versioning</b> + (zaroori data par) <b>Object Lock</b> / doosre account mein backup. ShopKaro ki photos 11 nines ke bawajood gayi — kyunki delete "galti" nahi, valid API call thi.',
      },
      {
        q: 'Bucket kaun dekh sakta hai? (Block Public Access, bucket policy, IAM)',
        analogy: 'Godown ka main gate (<b>Block Public Access</b>) ek master taala hai: "bahar ka koi bhi aadmi andar nahi aayega" — chahe andar kisi ne "sabko aane do" ka board (public policy) laga diya ho. Andar ka guard (<b>bucket policy + IAM</b>) dekhta hai ki andar wale logon mein se kaun kis dabbe tak jaa sakta hai.',
        points: [
          '<b>Default:</b> nayi bucket private hai. April 2023 se nayi bucket par <b>Block Public Access ON</b> aur <b>ACLs disabled</b> (Object Ownership = bucket owner enforced) default hai.',
          '<b>Block Public Access</b> (bucket ya poore account par): public bucket policy lagne hi nahi deta (<code>BlockPublicPolicy</code>) aur pehle se lagi public policy ko bekaar karta hai (<code>RestrictPublicBuckets</code>).',
          '<b>Bucket policy</b> (resource policy): Principal ke saath — "CloudFront distribution X ko <code>images/*</code> padhne do".',
          '<b>IAM policy</b>: tumhare users/roles kya kar sakte hain (pichla level).',
        ],
        example: 'Ravi ne public policy lagane ke liye pehle Block Public Access OFF kiya — yahi pehla laal jhanda tha. Sahi raasta: bucket private, BPA ON, aur website ke liye CloudFront.',
        asli: 'Production mein "bucket public" ka lagbhag kabhi koi sahi jawab nahi hai. Account-level Block Public Access ON rakho.',
      },
      {
        q: 'Website par photos dikhani hain — bucket public kiye bina kaise?',
        body: '<b>CloudFront + Origin Access Control (OAC):</b> bucket private rehti hai. CloudFront distribution apni requests ko sign karta hai. Bucket policy kehti hai: "sirf yeh CloudFront distribution <code>images/*</code> padh sakta hai".',
        code: `{
  "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::shopkaro-product-images/images/*",
  "Condition": { "StringEquals": {
    "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/E2SHOPKARO" } }
}`,
        points: [
          'Fayde: HTTPS + apna domain, edge cache (tez + S3 ka bill kam), WAF laga sakte ho, bucket direct URL se band',
          'S3 "static website hosting" endpoint sirf HTTP deta hai aur bucket public maangta hai — dev/demo ke liye theek, production ke liye CloudFront',
          'Policy sirf <code>images/*</code> par — <code>invoices/</code> CloudFront se bhi nahi khulta',
        ],
        asli: 'Public content = CloudFront + OAC + private bucket. Neeche wali live lab mein khud dekho kaunsa combination chaaron sawalon ka sahi jawab deta hai.',
      },
      {
        q: 'Private invoice sirf us customer ko kaise dein? (presigned URL)',
        analogy: 'Godown ka ek-baar wala gate pass: "Priya, aaj shaam 5:00 se 5:05 tak, sirf dabba INV-10231". Pass par manager (app) ke dastkhat hain. Pass mein dabbe ka number badla toh dastkhat match nahi — guard rok dega.',
        body: 'App (jiske role ke paas <code>s3:GetObject</code> hai) ek <b>presigned URL</b> banati hai: object ka URL + expiry + signature. Customer ko na AWS account chahiye, na bucket permission.',
        code: `aws s3 presign s3://shopkaro-invoices/2026/10/INV-10231.pdf --expires-in 300
# https://shopkaro-invoices.s3.ap-south-1.amazonaws.com/2026/10/INV-10231.pdf
#   ?X-Amz-Expires=300&X-Amz-Signature=...   ← 5 minute; key badli = 403`,
        points: [
          'Expiry: IAM user credentials se max 7 din; role credentials se tab tak jab tak role session zinda',
          'Upload ke liye bhi presigned PUT URL — mobile app seedha S3 par photo bheje, server se nahi',
          'Invoices alag bucket mein (images ke saath kabhi nahi) — alag policy, alag encryption, alag lifecycle',
        ],
        asli: 'Priya wala leak do galtiyon se hua: public bucket + andaze se lagne wale sequential naam. Presigned URL mein naam badalne se signature toot jaata hai.',
      },
      {
        q: 'Galti se delete ya overwrite — versioning kaise bachata hai?',
        body: '<b>Versioning ON</b> hone ke baad:',
        points: [
          '<b>Overwrite</b> = naya version upar; purana version neeche pada rehta hai',
          '<b>Delete</b> (bina version-id) = sabse upar ek <b>delete marker</b>. File "gayab" dikhti hai, versions pade hain. Marker hatao → file wapas',
          '<b>Delete with --version-id</b> = woh version <b>hamesha ke liye</b> gaya',
          '<b>MFA Delete</b>: version delete karne ke liye root + MFA code chahiye',
          '<b>Object Lock</b> (WORM): retention period tak koi delete/overwrite nahi kar sakta — compliance mode mein root bhi nahi. Ransomware aur audit records ke liye',
        ],
        visual: '<div class="tbl-wrap"><table><tr><th>Waqt</th><th>Action</th><th>images/kurta-red.jpg ka stack (upar = current)</th></tr>' +
          '<tr><td>10:00</td><td>upload asli photo</td><td>v1</td></tr>' +
          '<tr><td>11:00</td><td>intern ki galat photo</td><td><b>v2</b> · v1</td></tr>' +
          '<tr><td>12:00</td><td>attacker <code>rm</code></td><td><b>delete-marker</b> · v2 · v1 → website par 404</td></tr>' +
          '<tr><td>12:30</td><td>marker hatao</td><td><b>v2</b> · v1 → galat photo dikhi</td></tr>' +
          '<tr><td>12:31</td><td>v2 version-id se delete</td><td><b>v1</b> → asli photo wapas ✅</td></tr></table></div>',
        asli: 'Versioning on karo toh <b>lifecycle</b> bhi lagao (noncurrent versions 30 din baad delete) — warna har overwrite ki copy ka bill badhta rehta hai.',
      },
      {
        q: 'Encryption — kya karna padta hai?',
        body: 'Jan 2023 se har bucket ke har naye object par <b>SSE-S3 (AES-256)</b> default se lagta hai — tumhe kuch nahi karna. Upar ke options tab jab requirement ho:',
        points: [
          '<b>SSE-KMS</b>: KMS key ki policy se control (kaun decrypt kar sakta hai), har use ka CloudTrail audit, key disable = data band. <b>Bucket Key</b> on karo — KMS calls aur bill bahut kam.',
          '<b>DSSE-KMS</b>: do layer encryption (kuch compliance rules ke liye)',
          '<b>SSE-C</b>: har request ke saath apni key bhejo (AWS key store nahi karta)',
          '<b>Client-side</b>: upload se pehle app khud encrypt kare',
          '<b>Transit mein</b>: bucket policy mein <code>aws:SecureTransport = false</code> par Deny — sirf HTTPS',
        ],
        asli: 'Invoices (personal data) → SSE-KMS customer managed key + Bucket Key. Product photos → default SSE-S3 kaafi.',
      },
      {
        q: 'Speed aur bill — kaunse numbers yaad rakhein?',
        body: '<div class="tbl-wrap"><table><tr><th>Cheez</th><th>Number</th><th>Matlab</th></tr>' +
          '<tr><td>Requests per prefix</td><td>~3,500 PUT/DELETE + ~5,500 GET per second</td><td>Zyada load → keys ko alag prefixes mein baanto</td></tr>' +
          '<tr><td>Storage (Standard)</td><td>~$0.023/GB-mahina</td><td>1 TB ≈ $23</td></tr>' +
          '<tr><td>Data transfer out (internet)</td><td>~$0.09/GB</td><td>1 TB download ≈ $90 — storage se 4× mehenga!</td></tr>' +
          '<tr><td>S3 → CloudFront</td><td>free</td><td>CloudFront se serve karo, CloudFront ka rate S3 se sasta</td></tr>' +
          '<tr><td>Multipart upload</td><td>&gt; 100 MB par</td><td>Parallel parts, toote part ka retry; adhoore uploads lifecycle se saaf</td></tr></table></div>',
        asli: 'S3 ka bill aksar storage nahi, <b>requests + data transfer</b> se bigadta hai. Images CloudFront ke peeche, purana data lifecycle se sasti class mein (S3 Advanced level).',
      },
    ],
    myth: [
      { myth: 'Website par images dikhane ke liye bucket public karni padti hai.', sach: 'CloudFront + Origin Access Control: bucket private, sirf tumhara CloudFront distribution padh sakta hai. HTTPS aur cache saath mein.' },
      { myth: 'S3 mein folders hote hain.', sach: 'Sirf keys hain. "images/" ek prefix hai jise console folder ki tarah dikhata hai. Isliye "folder rename" asal mein har object copy + delete hota hai.' },
      { myth: 'Versioning wali bucket mein delete = file gayi.', sach: 'Bina version-id ka delete sirf delete marker lagata hai. Marker hatao, file wapas. Sirf version-id ke saath delete permanent hai.' },
      { myth: '11 nines durability = data kabhi nahi khoyega.', sach: 'Hardware failure se haan. Tumhare ya attacker ke delete/overwrite se nahi — uske liye versioning, Object Lock, backup.' },
    ],
    playbook: {
      title: 'S3 — surakshit default',
      use: [
        'User uploads, images, videos, backups, logs, data lake, static site assets',
        'Public content: CloudFront + OAC ke peeche',
        'Private download/upload: presigned URLs',
        'Zaroori data: versioning + lifecycle; compliance/ransomware: Object Lock',
      ],
      avoid: [
        'Bucket public karna (ya BPA OFF karna)',
        'Public aur private data ek hi bucket mein',
        'Andaze se lagne wale keys (INV-10231) public jagah par',
        'Database ya OS disk ki tarah use (block storage chahiye → EBS)',
      ],
      how: [
        'Account-level Block Public Access ON',
        'Data type ke hisaab se alag buckets (images / invoices / logs)',
        'Versioning ON + noncurrent-version lifecycle (30 din)',
        'Sensitive data: SSE-KMS + Bucket Key; policy mein aws:SecureTransport Deny',
        'Access logging / CloudTrail data events sensitive buckets par',
      ],
      redflags: [
        'BlockPublicPolicy = false kisi bhi bucket par',
        '"Principal": "*" bina condition ke',
        'Versioning off wali bucket mein irreplaceable data',
        'Versioning on par koi lifecycle nahi (bill chupchaap badhta)',
      ],
      rule: 'Bucket private. Public cheez CloudFront se. Private cheez presigned URL se. Galti ke liye versioning. Bill ke liye lifecycle.',
    },
    exam: [
      { cue: '"protect objects from accidental deletion or overwrite"', pick: 'S3 Versioning (+ MFA Delete)', why: 'Delete marker se restore.' },
      { cue: '"WORM", "retain for 7 years, nobody can delete", "ransomware"', pick: 'S3 Object Lock (compliance mode)', why: 'Retention tak root bhi delete nahi kar sakta.' },
      { cue: '"temporary access to a private object without AWS credentials"', pick: 'Presigned URL', why: 'Expiry + signature.' },
      { cue: '"serve S3 content only through CloudFront; bucket must not be public"', pick: 'CloudFront Origin Access Control (OAC)', why: 'Purana naam OAI — naya setup OAC.' },
      { cue: '"enforce HTTPS-only access to bucket"', pick: 'Bucket policy Deny when aws:SecureTransport = false', why: 'Transit encryption enforce.' },
      { cue: '"prevent any bucket in the account from becoming public"', pick: 'Account-level S3 Block Public Access (+ SCP to lock it)', why: 'Bucket policy se upar ka guardrail.' },
      { cue: '"upload large files faster / resume failed uploads"', pick: 'Multipart upload (+ Transfer Acceleration for distant clients)', why: 'Parallel parts, part-level retry.' },
      { cue: '"audit every decrypt of sensitive objects"', pick: 'SSE-KMS (customer managed key)', why: 'KMS calls CloudTrail mein.' },
    ],
    stages: [
      /* ---------- 1. DRY RUN ---------- */
      {
        type: 'dryrun',
        title: '🔍 Dry run — ek photo ki zindagi: overwrite, delete, aur wapsi',
        goal: 'Versioning ON bucket mein <code>images/kurta-red.jpg</code> ka version stack dekho. Har click par ek action — dekho website par kya dikhta hai aur file kaise wapas aati hai.',
        nodes: [
          N('user', 110, 120, { label: 'Shopper' }),
          N('cf', 110, 380, { label: 'CloudFront' }),
          N('s3', 520, 250, { label: 'product-images' }),
          N('dev', 880, 120, { label: 'intern' }),
          N('attacker', 880, 380, { label: 'leaked key' }),
        ],
        edges: [{ from: 'user', to: 'cf' }, { from: 'cf', to: 's3' }, { from: 'dev', to: 's3' }, { from: 'attacker', to: 's3' }],
        panels: [{ id: 'stack', title: 'images/kurta-red.jpg — version stack (upar = current)' }, { id: 'site', title: 'Website par kya dikh raha hai' }],
        steps: [
          {
            clock: '10:00',
            say: 'Bucket par <b>versioning ON</b> hai. Photographer ne asli photo upload ki — S3 ne usse version id <code>v1</code> diya. CloudFront current version dikhata hai.',
            flows: [{ from: 'user', to: 'cf', tone: 'ok' }, { from: 'cf', to: 's3', label: 'GET current', tone: 'ok' }],
            nodes: { s3: { tone: 'ok', badge: 'versioning: Enabled' }, user: { tone: 'ok' }, cf: { tone: 'ok' } },
            panels: { stack: ['v1  · asli photo · 51 KB   ← current'], site: ['🧥 Laal kurta (asli photo) ✅'] },
          },
          {
            clock: '11:00',
            say: 'Intern ne galat file usi key par upload kar di. S3 ne purani photo mitayi nahi — naya version <code>v2</code> upar rakha.',
            flows: [{ from: 'dev', to: 's3', label: 'PUT (overwrite)', tone: 'slow' }],
            nodes: { dev: { tone: 'slow', badge: 'galti' } },
            panels: { stack: ['v2  · galat photo · 0.9 KB  ← current', 'v1  · asli photo · 51 KB'], site: ['🖼️ Galat photo dikh rahi ⚠️'] },
            ask: {
              q: 'v1 (asli photo) abhi kahan hai?',
              choices: ['Bucket mein hi, v2 ke neeche — versioning ne purana version rakha', 'Hamesha ke liye gaya', 'Glacier mein chali gayi', 'Intern ke laptop par'],
              answer: 0,
              explain: 'Versioning on = har overwrite naya version banata hai, purana rehta hai (aur purane version ka bhi storage bill lagta hai).',
            },
          },
          {
            clock: '12:00',
            say: 'Leaked key wale attacker ne <code>aws s3 rm s3://shopkaro-product-images/images/kurta-red.jpg</code> chalaya. Versioning on hai, isliye S3 ne sabse upar ek <b>delete marker</b> rakh diya. Website par 404.',
            flows: [{ from: 'attacker', to: 's3', label: 'DELETE (no version-id)', tone: 'bad' }, { from: 'cf', to: 's3', label: '404', tone: 'bad' }],
            nodes: { attacker: { tone: 'bad' }, user: { tone: 'bad', badge: 'photo gayab' }, cf: { tone: 'bad' } },
            panels: { stack: ['DELETE MARKER                ← current', 'v2  · galat photo', 'v1  · asli photo'], site: ['❌ 404 — photo nahi mili'] },
            ask: {
              q: 'Kya data sach mein gaya?',
              choices: ['Nahi — v2 aur v1 dono pade hain; delete marker sirf upar ka "parda" hai', 'Haan, sab gaya', 'Sirf v1 gaya', 'S3 ne 24 ghante ke liye lock kiya'],
              answer: 0,
              explain: 'Bina version-id ka delete = delete marker. Versions bachte hain. Isliye versioning galti/attack ke baad wapsi ka raasta hai.',
            },
          },
          {
            clock: '12:30',
            say: 'Ravi <code>list-object-versions</code> se marker ki id dekhta hai aur <code>delete-object --version-id &lt;marker&gt;</code> chalata hai. Marker hata — par ab current <b>v2</b> (galat photo) hai.',
            flows: [{ from: 'cf', to: 's3', label: 'GET → v2', tone: 'slow' }],
            nodes: { user: { tone: 'slow', badge: 'galat photo' }, cf: { tone: 'slow' } },
            panels: { stack: ['v2  · galat photo   ← current', 'v1  · asli photo'], site: ['🖼️ Galat photo wapas ⚠️'] },
          },
          {
            clock: '12:31',
            say: 'Ab <code>v2</code> ko uski version-id se delete kiya. Version-id wala delete <b>permanent</b> hai — v2 hamesha ke liye gaya. Current ab <b>v1</b>: asli photo wapas.',
            flows: [{ from: 'cf', to: 's3', label: 'GET → v1', tone: 'ok' }],
            nodes: { user: { tone: 'ok', badge: 'asli photo ✅' }, cf: { tone: 'ok' }, s3: { tone: 'ok', badge: 'restored' } },
            panels: { stack: ['v1  · asli photo   ← current'], site: ['🧥 Laal kurta (asli photo) ✅'] },
            ask: {
              q: 'Attacker bhi <code>--version-id</code> se har version delete kar sakta tha. Usse kaun rokta?',
              choices: [
                'S3 Object Lock (retention tak koi delete nahi) ya MFA Delete — aur doosre account mein backup',
                'Sirf versioning',
                'Bucket ka naam lamba rakhna',
                'CloudFront',
              ],
              answer: 0,
              explain: 'Versioning galti se bachata hai; jaanbujh ke kiye attack se Object Lock / MFA Delete / cross-account backup bachate hain.',
            },
          },
        ],
        lesson: '<b>Asli baat:</b> versioning = har overwrite aur delete ke neeche purani copy. Delete marker hatao → delete ulta. Version-id se delete → permanent. Zaroori data par Object Lock, aur purane versions ke bill ke liye lifecycle.',
      },

      /* ---------- 2. LIVE LAB ---------- */
      {
        type: 'flowlab',
        title: '🎛️ Live lab — kaun kya dekh sakta hai? (Block Public Access + bucket policy)',
        goal: 'Paancho sawal hare karo: <b>(1)</b> internet se seedha S3 URL par photo — band (sirf CloudFront se), <b>(2)</b> seedha invoice — band, <b>(3)</b> CloudFront se photo — khula, <b>(4)</b> CloudFront se invoice — band, <b>(5)</b> kal koi galti se public policy lagaye toh bhi bucket na khule.',
        scenario: 'Ek hi bucket mein <code>images/</code> aur <code>invoices/</code> hain (Ravi ka setup). Do knobs: Block Public Access, aur bucket policy. CloudFront OAC ke saath signed requests bhejta hai. (Behtar design: invoices alag bucket — par pehle yeh dekho ki policy kya-kya rokti hai.)',
        knobs: [
          { id: 'bpa', label: 'Block Public Access', min: 0, max: 1, step: 1, value: 0, labels: { 0: 'OFF', 1: 'ON (saare 4 settings)' } },
          { id: 'policy', label: 'Bucket policy', min: 0, max: 3, step: 1, value: 1, labels: { 0: POLICIES[0], 1: POLICIES[1], 2: POLICIES[2], 3: POLICIES[3] } },
        ],
        model: k => {
          const a = access(k);
          const ro = (label, c, want) => ({ label, value: (c.allowed ? 'KHULA' : 'BAND') + (c.good ? ' ✅' : ' ❌ (chahiye: ' + (want ? 'khula' : 'band') + ')'), tone: c.good ? 'ok' : 'bad' });
          const all = [a.anonImg, a.anonInv, a.cfImg, a.cfInv].every(c => c.good) && k.bpa === 1;
          return {
            readouts: [
              ro('1. Internet → seedha S3 → photo', a.anonImg, false),
              ro('2. Internet → seedha S3 → invoice', a.anonInv, false),
              ro('3. CloudFront → photo', a.cfImg, true),
              ro('4. CloudFront → invoice', a.cfInv, false),
              { label: '5. Kal koi galti se public policy lagaye toh?', value: k.bpa === 1 ? 'BPA rok dega ✅' : 'bucket khul jayegi ❌', tone: k.bpa === 1 ? 'ok' : 'bad' },
            ],
            verdict: all
              ? { ok: true, text: 'Bucket private, Block Public Access ON, aur sirf CloudFront distribution ko sirf images/* padhne ki ijaazat. Invoices tak koi raasta nahi.' }
              : k.bpa === 0 && k.policy === 3
                ? { ok: false, text: 'Aaj ke chaaron raaste sahi hain — par Block Public Access OFF hai. Kal koi "jaldi fix" mein Principal "*" policy laga de toh bucket khul jayegi. Guardrail ON karo.' }
              : k.bpa === 1 && k.policy !== 3
                ? { ok: false, text: 'Block Public Access ne public policy ko bekaar kar diya — achha! Par ab CloudFront ke liye bhi raasta nahi (ya policy hi nahi). CloudFront ko OAC policy chahiye.' }
                : { ok: false, text: 'Bucket public raaste se khul rahi hai. Priya wala leak yahin se hua tha: koi bhi URL guess karke padh sakta hai.' },
          };
        },
        check: k => { const a = access(k); return k.bpa === 1 && [a.anonImg, a.anonInv, a.cfImg, a.cfInv].every(c => c.good); },
        lesson: '🎯 Sirf <b>BPA ON + CloudFront OAC policy (images/*)</b> paancho sawal sahi karta hai. BPA OFF + OAC aaj sahi hai, par kal ki galti se nahi bachata — guardrail aur policy dono chahiye. Public policy (poori bucket ya sirf images) internet ko seedha S3 tak aane deti hai. OAC policy "public" nahi maani jaati (Principal ek specific CloudFront distribution hai), isliye BPA usse nahi rokta.',
        quiz: {
          q: 'Toh Priya apna invoice download kaise karegi?',
          choices: [
            'App Priya ke login ke baad uske invoice ka presigned URL (5 minute expiry) banayegi',
            'Invoices folder public kar do',
            'Priya ko IAM user do',
            'Invoice email mein attachment ke alawa koi raasta nahi',
          ],
          answer: 0,
          explain: 'Private object + temporary access = presigned URL. Aur invoices alag bucket mein rakhna aur behtar.',
        },
      },

      /* ---------- 3. MATCH ---------- */
      {
        type: 'match',
        title: 'Problem → S3 feature',
        instructions: 'Har problem ko us S3 feature se jodo jo usse solve karta hai.',
        pairs: [
          { left: 'Intern ne photo overwrite kar di', right: 'Versioning — purana version neeche pada hai', explain: 'Overwrite = naya version; purana restore ho sakta hai.' },
          { left: 'Audit records 7 saal tak koi delete na kar sake (root bhi nahi)', right: 'Object Lock — compliance mode retention', explain: 'WORM. Governance mode mein special permission wale hata sakte hain; compliance mein koi nahi.' },
          { left: 'Customer ko private invoice 5 minute ke liye', right: 'Presigned URL', explain: 'Signature + expiry, customer ko AWS account nahi chahiye.' },
          { left: 'Koi bhi bucket galti se public na ho', right: 'Account-level Block Public Access', explain: 'Public policies/ACLs ko block/ignore karta hai.' },
          { left: 'Website images HTTPS + cache, bucket private', right: 'CloudFront + Origin Access Control', explain: 'Bucket policy mein sirf distribution ko GetObject.' },
          { left: 'Purane versions ka bill badh raha hai', right: 'Lifecycle — noncurrent version expiration', explain: 'Noncurrent versions N din baad delete/transition.' },
          { left: 'Invoices ke har decrypt ka audit chahiye', right: 'SSE-KMS (customer managed key) + Bucket Key', explain: 'KMS calls CloudTrail mein; Bucket Key se bill kam.' },
        ],
      },

      /* ---------- 4. QUIZ ---------- */
      {
        type: 'quiz',
        title: 'S3 quick-fire — mechanism samjho',
        questions: [
          {
            q: 'Versioning ON bucket mein <code>aws s3 rm s3://b/a.jpg</code> chalaya. Kya hua?',
            choices: ['a.jpg par delete marker laga; purane versions pade hain', 'a.jpg ke saare versions permanent delete', 'Command fail — versioning bucket mein delete nahi hota', 'a.jpg Glacier mein gaya'],
            answer: 0,
            explain: 'Bina version-id delete = delete marker. Marker hatane se file wapas.',
          },
          {
            q: 'Bucket par Block Public Access (BlockPublicPolicy = true) ON hai. Koi Principal "*" wali policy lagata hai. Kya hoga?',
            choices: ['PutBucketPolicy AccessDenied se fail', 'Policy lag jayegi aur bucket public', 'Policy lagegi par 24 ghante baad', 'Sirf GET public hoga'],
            answer: 0,
            explain: 'BlockPublicPolicy public policy lagne hi nahi deta. RestrictPublicBuckets pehle se lagi public policy ko bekaar karta hai.',
          },
          {
            q: '"images/" folder rename karke "photos/" karna hai, 50,000 objects. S3 mein kya hota hai?',
            choices: ['Har object copy hota hai naye key par aur purana delete — 50,000 copy + 50,000 delete requests', 'Ek metadata change, turant', 'Folder rename API hai', 'Impossible'],
            answer: 0,
            explain: 'Folders nahi hain, sirf keys. Prefix badalna = har object ka naya key.',
          },
          {
            q: 'S3 Standard ki 11 nines durability kis cheez se NAHI bachati?',
            choices: ['Tumhare apne (ya attacker ke) delete/overwrite se', 'Disk failure se', 'Ek AZ ki aag se', 'Rack ke power failure se'],
            answer: 0,
            explain: 'Valid API delete ko S3 follow karta hai. Versioning/Object Lock/backup chahiye.',
          },
          {
            q: 'Ek prefix par 12,000 GET/second aa rahe hain aur 503 Slow Down errors aate hain. Pehla design fix?',
            choices: ['Objects ko kai prefixes mein baanto (har prefix ~5,500 GET/s) aur CloudFront cache lagao', 'Bucket ka naam badlo', 'Versioning off karo', 'Glacier mein daalo'],
            answer: 0,
            explain: 'S3 per-prefix scale karta hai. Cache se requests hi kam.',
          },
        ],
      },

      /* ---------- 5. TRIAGE ---------- */
      {
        type: 'triage',
        title: '🩺 Triage — "mujhe kisi aur ka invoice dikh raha hai"',
        symptom: 'Priya (customer) ka email: "INV-10231 ke link mein maine number 10232 kiya, kisi aur ka naam-address-order dikh gaya." Tum ShopKaro ke on-call engineer ho. Pehle samjho exposure kitna bada hai, phir band karo.',
        commands: [
          { cmd: 'aws s3api get-public-access-block --bucket shopkaro-store', out: '{\n    "PublicAccessBlockConfiguration": {\n        "BlockPublicAcls": false,\n        "IgnorePublicAcls": false,\n        "BlockPublicPolicy": false,\n        "RestrictPublicBuckets": false\n    }\n}', clue: true, note: 'Charon settings OFF. Kisi ne public policy lagane ke liye master taala hi khol diya.' },
          { cmd: 'aws s3api get-bucket-policy --bucket shopkaro-store --query Policy --output text', out: '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::shopkaro-store/*"}]}', clue: true, note: '<code>Principal: "*"</code> on <code>shopkaro-store/*</code> — poori bucket internet ke liye, sirf images nahi.' },
          { cmd: 'aws s3 ls s3://shopkaro-store/invoices/ --recursive | head -3', out: '2026-10-09 11:02:14     48211 invoices/INV-10229.pdf\n2026-10-09 11:40:51     47903 invoices/INV-10230.pdf\n2026-10-09 12:15:08     48650 invoices/INV-10231.pdf', clue: true, note: 'Invoices usi public bucket mein, aur naam sequential — andaza lagana bachchon ka khel.' },
          { cmd: 'aws s3 ls s3://shopkaro-store/invoices/ --recursive --summarize | tail -2', out: 'Total Objects: 4120\n   Total Size: 198841320', clue: true, note: '4,120 invoices public the. Exposure ka size.' },
          { cmd: 'aws s3api get-bucket-versioning --bucket shopkaro-store', out: '{\n    "Status": "Enabled"\n}', clue: false, note: 'Versioning on hai — achha hai, par leak (padhne) se versioning nahi bachata.' },
          { cmd: 'aws s3api get-bucket-encryption --bucket shopkaro-store --query "ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm" --output text', out: 'AES256', clue: false, note: 'Encryption at rest on hai — par public read ke saath S3 khud decrypt karke de deta hai. At-rest encryption public access se nahi bachata.' },
        ],
        questions: [
          {
            q: 'Abhi sabse pehle kya karoge? (minutes mein)',
            choices: [
              'Bucket par Block Public Access ON (aur public policy delete) — exposure turant band; images ke liye CloudFront OAC policy baad mein',
              'Saare invoices delete karo',
              'Versioning off karo',
              'Encryption KMS par shift karo',
            ],
            answer: 0,
            explain: 'Pehle khoon rokna: BPA ON se public policy bekaar. Website photos thodi der toot sakti hain — leak usse bada nuksaan hai.',
          },
          {
            q: 'Encryption on thi, phir bhi data leak kyun hua?',
            choices: [
              'At-rest encryption disk chori se bachata hai; authorized (yahan public) request par S3 khud decrypt karke data deta hai',
              'Encryption kaam nahi kar rahi thi',
              'AES256 kamzor hai',
              'Hackers ne key tod di',
            ],
            answer: 0,
            explain: 'Access control (kaun padh sakta hai) aur encryption (disk par kaise pada hai) alag cheezein hain.',
          },
          {
            q: 'Long-term sahi design?',
            choices: [
              'Invoices alag private bucket (SSE-KMS), images bucket private + CloudFront OAC, invoices presigned URL se, aur random/UUID keys',
              'Ek hi bucket, bas policy sahi',
              'Invoices EC2 par',
              'Har invoice ka password',
            ],
            answer: 0,
            explain: 'Data type ke hisaab se alag buckets, private default, temporary access. Plus: CloudTrail data events / access logs se kisne kya padha — breach notification ke liye.',
          },
        ],
      },

      /* ---------- 6. TERMINAL ---------- */
      (function () {
        const B = s => (s.account.buckets || []).find(b => b.name === 'shopkaro-product-images');
        const cur = (b, key) => { const v = ((b && b.versions) || {})[key] || []; return v[0]; };
        const TASKS = [
          { text: 'Block Public Access ON (put-public-access-block, chaaron true)', check: s => { const b = B(s); return !!b && !!b.bpa && b.bpa.BlockPublicPolicy && b.bpa.RestrictPublicBuckets && b.bpa.BlockPublicAcls && b.bpa.IgnorePublicAcls; } },
          { text: 'Public bucket policy hatao (delete-bucket-policy)', check: s => { const b = B(s); return !!b && !b.policy; } },
          { text: 'kurta-red.jpg ke versions dekho (list-object-versions)', check: s => s.history.some(h => /aws s3api list-object-versions.*kurta-red/.test(h)) },
          { text: 'kurta-red.jpg wapas lao — delete marker hatao', check: s => { const v = cur(B(s), 'images/kurta-red.jpg'); return !!v && !v.deleteMarker && v.versionId === 'v-kr-001'; } },
          { text: 'banner.jpg ki galat nayi version hatao — purana banner wapas', check: s => { const v = cur(B(s), 'images/banner.jpg'); return !!v && v.versionId === 'v-bn-001'; } },
        ];
        return {
          type: 'terminal',
          title: '🖥️ Mission: bucket band karo, photos wapas lao (asli S3 commands)',
          instructions: 'In-app simulator, asli CLI syntax. Version IDs <code>list-object-versions</code> ke output se padho.',
          goal: '<code>shopkaro-product-images</code> par: <b>(1)</b> Block Public Access ON. <b>(2)</b> public bucket policy delete. <b>(3)</b> <code>images/kurta-red.jpg</code> kisi ne delete kar di — versions dekho aur delete marker hata ke photo wapas lao. <b>(4)</b> <code>images/banner.jpg</code> par intern ne galat file daali — galat (latest) version hata ke purana banner wapas lao.',
          tasks: TASKS,
          account: {
            region: 'ap-south-1',
            callerIdentity: { Account: '123456789012', UserId: 'AIDARAVI', Arn: 'arn:aws:iam::123456789012:user/ravi' },
            buckets: [{
              name: 'shopkaro-product-images', region: 'ap-south-1', creationDate: '2026-10-08 10:00:00', versioning: true, public: true,
              policy: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: 'arn:aws:s3:::shopkaro-product-images/*' }] },
              versions: {
                'images/kurta-red.jpg': [
                  { versionId: 'dm-kr-002', deleteMarker: true, lastModified: '2026-10-23 09:12:41' },
                  { versionId: 'v-kr-001', deleteMarker: false, size: 51203, lastModified: '2026-10-09 10:00:00' },
                ],
                'images/banner.jpg': [
                  { versionId: 'v-bn-002', deleteMarker: false, size: 912, lastModified: '2026-10-23 09:10:05' },
                  { versionId: 'v-bn-001', deleteMarker: false, size: 88410, lastModified: '2026-10-09 10:02:00' },
                ],
                'images/kurta-blue.jpg': [{ versionId: 'v-kb-001', deleteMarker: false, size: 49870, lastModified: '2026-10-09 10:01:00' }],
              },
            }],
          },
          success: AG.allOf(TASKS),
          successText: '✅ Bucket band aur photos wapas. <b>BPA ON</b> se ab koi public policy lag hi nahi sakti. <b>kurta-red</b>: delete marker hata → v-kr-001 current. <b>banner</b>: galat v-bn-002 version-id se delete (permanent) → v-bn-001 current. Agla kadam: CloudFront OAC policy (sirf <code>images/*</code>) taaki website photos dikhaye — CloudFront level mein.',
          hints: [
            'aws s3api put-public-access-block --bucket shopkaro-product-images --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true',
            'aws s3api delete-bucket-policy --bucket shopkaro-product-images',
            'aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/kurta-red.jpg',
            'aws s3api delete-object --bucket shopkaro-product-images --key images/kurta-red.jpg --version-id dm-kr-002',
            'aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/banner.jpg phir aws s3api delete-object --bucket shopkaro-product-images --key images/banner.jpg --version-id v-bn-002',
          ],
        };
      })(),

      /* ---------- 7. REAL LAB ---------- */
      {
        type: 'docker',
        title: '🐳 Real lab — versioning undo, presigned invoice, KMS, lifecycle',
        project: '04-s3-safety',
        goal: 'Asli <code>aws</code> CLI se: overwrite + delete ke baad versioning se asli photo wapas lao, invoice ka 5 minute ka presigned link banao aur <code>curl</code> se kholo, invoices bucket par SSE-KMS default encryption, aur lifecycle se purane versions ki safai.',
        why: 'Dry run ne version stack dikhaya; yeh lab wahi stack asli S3 API par banati aur todti hai. (Public access ka enforcement emulator nahi karta — woh hissa upar ki live lab aur mission mein hai.)',
        steps: [
          { text: 'Emulator + env.', cmd: 'cd aws-gurukul/docker-labs\n./start-moto.sh\nsource env.sh\ncd 04-s3-safety' },
          { text: 'ex1 — versioning on, asli photo, galat photo, delete. Versions dekho.', cmd: "aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/kurta-red.jpg \\\n  --query '[Versions[].{Id:VersionId,Latest:IsLatest,Size:Size}, DeleteMarkers[].{Id:VersionId,Latest:IsLatest}]'", expect: '[\n  [ { "Id": "88238470-...", "Latest": false, "Size": 45 },     ← galat\n    { "Id": "bdb15366-...", "Latest": false, "Size": 30 } ],   ← asli\n  [ { "Id": "b89a5af4-...", "Latest": true } ]                 ← delete marker\n]' },
          { text: 'ex1 — marker hatao, phir galat version hatao. Har baar file padho.', cmd: 'aws s3api delete-object --bucket shopkaro-product-images --key images/kurta-red.jpg --version-id $DM\naws s3 cp s3://shopkaro-product-images/images/kurta-red.jpg -\naws s3api delete-object --bucket shopkaro-product-images --key images/kurta-red.jpg --version-id $BAD\naws s3 cp s3://shopkaro-product-images/images/kurta-red.jpg -', expect: 'WRONG IMAGE — intern ne galti se upload ki\nred kurta — asli photo (v1)' },
          { text: 'ex2 — invoice ka presigned URL (300 second) aur curl.', cmd: 'URL=$(aws s3 presign s3://shopkaro-invoices/2026/10/INV-10231.pdf --expires-in 300)\necho "$URL" | tr \'?&\' \'\\n\\n\'\ncurl -s "$URL"', expect: 'X-Amz-Expires=300\nX-Amz-Signature=...\nINVOICE 10231 — Priya Sharma, Jaipur — Rs 2,499' },
          { text: 'ex3 + ex4 — SSE-KMS default encryption aur lifecycle (README).', cmd: "aws s3api head-object --bucket shopkaro-invoices --key 2026/10/INV-10232.pdf --query '{SSE:ServerSideEncryption,BucketKey:BucketKeyEnabled}'\naws s3api get-bucket-lifecycle-configuration --bucket shopkaro-product-images --query 'Rules[].[ID,Status]' --output text", expect: '{ "SSE": "aws:kms", "BucketKey": true }\npurane-versions-30-din-baad-saaf\tEnabled\nadhoore-uploads-saaf\tEnabled' },
        ],
        observe: {
          q: 'ex1 mein delete marker hatane ke baad bhi galat photo kyun aayi?',
          choices: [
            'Marker hatne par jo version sabse upar tha (v2, galat wala) current bana; asli v1 uske neeche tha — v2 ko version-id se hatana pada',
            'Emulator ka bug',
            'Delete marker hatana kaam nahi karta',
            'Cache ki wajah se',
          ],
          answer: 0,
          explain: 'Version stack upar se padha jaata hai. Restore = jo galat hai usse upar se hatao (marker ya version), ya purane version ko copy karke naya current banao.',
        },
      },

      /* ---------- 8. EXAM QUIZ ---------- */
      {
        type: 'quiz',
        bonus: true,
        title: '📝 SAA-style quick-fire — S3',
        questions: [
          {
            q: 'Company ko compliance ke liye log files 5 saal tak aise rakhni hain ki koi bhi (root bhi) delete na kar sake.',
            choices: ['S3 Object Lock in compliance mode, retention 5 years', 'Versioning + MFA Delete', 'Bucket policy Deny DeleteObject', 'Glacier Deep Archive'],
            answer: 0,
            explain: 'Compliance mode retention ko koi bypass nahi kar sakta. Bucket policy admin badal sakta hai.',
          },
          {
            q: 'Static website S3 mein hai. Requirement: HTTPS, custom domain, bucket public nahi honi chahiye.',
            choices: ['CloudFront distribution + Origin Access Control + ACM certificate', 'S3 website endpoint + public bucket', 'EC2 par nginx', 'Route 53 alias seedha bucket par'],
            answer: 0,
            explain: 'S3 website endpoint HTTP-only aur public maangta hai. CloudFront + OAC = HTTPS + private bucket.',
          },
          {
            q: 'Mobile app users ko seedha S3 par badi videos upload karni hain, app ke servers se guzare bina, aur bucket private rahe.',
            choices: ['Backend presigned PUT URLs (ya multipart presigned parts) generate kare', 'Bucket public write', 'Har user ko IAM access key', 'EC2 par upload server'],
            answer: 0,
            explain: 'Presigned URL temporary write permission deta hai bina credentials share kiye.',
          },
          {
            q: 'Ek bucket ke objects ko sirf HTTPS par hi access hone dena hai.',
            choices: ['Bucket policy: Deny s3:* jab "aws:SecureTransport": "false"', 'SSE-S3 on karo', 'Versioning on', 'CloudTrail on'],
            answer: 0,
            explain: 'Encryption in transit enforce karne ka standard pattern.',
          },
          {
            q: 'Galti se delete hue objects wapas laane hain. Bucket par versioning on thi. Kya karoge?',
            choices: ['Delete markers hata do (list-object-versions → delete-object --version-id <marker>)', 'AWS support ko ticket', 'CloudTrail se restore', 'Possible nahi'],
            answer: 0,
            explain: 'Delete marker hatao → previous version current.',
          },
          {
            q: 'Organization ke kisi bhi account mein koi bhi bucket kabhi public na ho, aur koi admin yeh setting band na kar sake.',
            choices: ['Har account mein account-level Block Public Access + SCP jo s3:PutAccountPublicAccessBlock deny kare', 'Har bucket par alag policy', 'CloudWatch alarm', 'Encryption'],
            answer: 0,
            explain: 'BPA guardrail + SCP lock = admin bhi band nahi kar sakta.',
          },
          {
            q: 'Versioning on karne ke baad S3 bill badhta ja raha hai.',
            choices: ['Lifecycle rule: noncurrent versions N din baad expire (ya sasti class mein)', 'Versioning off karke saare versions bhool jao', 'Bucket delete', 'CloudFront lagao'],
            answer: 0,
            explain: 'Har overwrite ki purani copy ka storage bill lagta hai — lifecycle se saaf.',
          },
          {
            q: 'Sensitive objects ko encrypt karna hai aur security team ko har decrypt request ka audit chahiye, key policy bhi apni.',
            choices: ['SSE-KMS with customer managed key', 'SSE-S3', 'SSE-C', 'Koi encryption nahi, sirf IAM'],
            answer: 0,
            explain: 'KMS decrypt calls CloudTrail mein dikhte hain; key policy customer control karta hai.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — S3',
      instructions: 'S3 round — security aur "galti se bachav" par focus. 🎤',
      questions: [
        {
          q: '"Website ki images S3 mein hain. Bucket public kiye bina kaise serve karoge?"',
          choices: [
            'CloudFront distribution + Origin Access Control; bucket policy mein sirf us distribution ko s3:GetObject (sirf images prefix); BPA ON',
            'Bucket public kar do, simple hai',
            'Har user ko IAM role',
            'EC2 par proxy',
          ],
          answer: 0,
          explain: 'Bonus bolo: HTTPS + ACM, cache se S3 request bill kam, WAF option.',
        },
        {
          q: '"Versioning on bucket mein delete karne par kya hota hai, aur restore kaise?"',
          choices: [
            'Delete marker lagta hai, versions bachte hain; marker ko version-id se delete karo → pichla version current. Version-id wala delete permanent hai',
            'File hamesha ke liye jaati hai',
            'Versioning delete ko rok deta hai',
            'Restore sirf AWS support karta hai',
          ],
          answer: 0,
          explain: 'Plus: attacker se bachav ke liye Object Lock / MFA Delete; bill ke liye lifecycle.',
        },
        {
          q: '"S3 bucket se data leak hua, encryption on thi. Kaise?"',
          choices: [
            'Encryption at rest disk-level chori se bachata hai; public ya galat IAM/bucket policy se authorized request ko S3 decrypt karke deta hai. Fix access control mein hai: BPA, private, presigned URLs',
            'Encryption toot gayi',
            'AWS ka bug',
            'Versioning ki wajah se',
          ],
          answer: 0,
          explain: 'Access control ≠ encryption. Dono layers chahiye.',
        },
        {
          q: '"Ek prefix par heavy read traffic se 503 SlowDown aa raha hai. Kya karoge?"',
          choices: [
            'Keys ko kai prefixes mein baanto (S3 per-prefix scale karta hai ~5,500 GET/s), CloudFront cache lagao, client par exponential backoff retry',
            'Bucket badal do',
            'Versioning off',
            'Glacier mein move',
          ],
          answer: 0,
          explain: '503 SlowDown = throttling. Partition (prefix) + cache + backoff.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: interviewer ne bola — <code>shopkaro-invoices</code> bucket ka security check karo: <b>(1)</b> Block Public Access ki setting dekho. <b>(2)</b> Encryption dekho. <b>(3)</b> Ek invoice ka 10 minute ka presigned URL banao.',
            tasks: [
              { text: 'aws s3api get-public-access-block --bucket shopkaro-invoices', check: s => s.history.some(h => /aws s3api get-public-access-block.*shopkaro-invoices/.test(h)) },
              { text: 'aws s3api get-bucket-encryption --bucket shopkaro-invoices', check: s => s.history.some(h => /aws s3api get-bucket-encryption.*shopkaro-invoices/.test(h)) },
              { text: 'aws s3 presign ... --expires-in 600', check: s => s.history.some(h => /aws s3 presign s3:\/\/shopkaro-invoices\/.*--expires-in 600/.test(h)) },
            ],
            account: {
              region: 'ap-south-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAAPP', Arn: 'arn:aws:iam::123456789012:user/app' },
              buckets: [{ name: 'shopkaro-invoices', region: 'ap-south-1', encryption: 'kms', kmsKey: 'arn:aws:kms:ap-south-1:123456789012:key/7f3c-invoices', bucketKey: true,
                bpa: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
                objects: [{ key: '2026/10/INV-10231.pdf', size: 48650, lastModified: '2026-10-09 12:15:08' }] }],
            },
            success: s => s.history.some(h => /aws s3api get-public-access-block.*shopkaro-invoices/.test(h)) && s.history.some(h => /aws s3api get-bucket-encryption.*shopkaro-invoices/.test(h)) && s.history.some(h => /aws s3 presign s3:\/\/shopkaro-invoices\/.*--expires-in 600/.test(h)),
            successText: 'Check poora: BPA ke chaaron settings true, SSE-KMS customer managed key + Bucket Key, aur 600 second ka presigned link. Interview mein bolo: "link app ke role se sign hota hai — role ke paas sirf GetObject on invoices/*."',
            hints: [
              'aws s3api get-public-access-block --bucket shopkaro-invoices',
              'aws s3api get-bucket-encryption --bucket shopkaro-invoices',
              'aws s3 presign s3://shopkaro-invoices/2026/10/INV-10231.pdf --expires-in 600',
            ],
          },
        },
      ],
    },
    success: [
      'Main bucket/key/object/prefix samjhta hoon aur S3 kab use nahi karna (block storage, in-place edits)',
      'Main durability vs availability aur 11 nines ki seema bata sakta hoon',
      'Main bucket ko private rakh ke CloudFront OAC se public content aur presigned URL se private content de sakta hoon',
      'Main versioning se overwrite/delete wapas la sakta hoon aur Object Lock/MFA Delete ka role jaanta hoon',
      'Main encryption (SSE-S3 vs SSE-KMS), HTTPS-only policy, lifecycle aur request/transfer ke bill ke numbers jaanta hoon',
    ],
    homework: `<p><b>Asli account (optional, pennies):</b></p>
      <pre>1. Account settings → S3 Block Public Access (account level) → saare 4 ON
2. Nayi bucket (versioning ON), ek file 2 baar upload, phir delete
3. Console → "Show versions" toggle — delete marker dekho, usse delete karo
4. CloudShell:
   aws s3 presign s3://&lt;bucket&gt;/&lt;file&gt; --expires-in 60
   (link browser mein kholo; 60 second baad dobara kholo → AccessDenied / Request has expired)
5. Lifecycle: noncurrent versions 30 din baad expire</pre>
      <p>✅ Self-check: expire hone ke baad link ne kya error diya? Account-level BPA ON hai?</p>`,
    cards: [
      { front: 'Versioning on bucket mein delete (bina version-id) kya karta hai?', back: 'Sabse upar <b>delete marker</b> lagata hai — versions bachte hain. Marker hatao → file wapas. Version-id ke saath delete = permanent.' },
      { front: 'Block Public Access ke 4 settings kya karte hain (short)?', back: 'BlockPublicAcls / IgnorePublicAcls (ACLs se public nahi), <b>BlockPublicPolicy</b> (public policy lagne hi nahi deta), <b>RestrictPublicBuckets</b> (lagi hui public policy bekaar).' },
      { front: 'Website images private bucket se kaise serve?', back: '<b>CloudFront + Origin Access Control</b>; bucket policy mein sirf us distribution ko GetObject (specific prefix).' },
      { front: 'Private file customer ko temporary kaise do?', back: '<b>Presigned URL</b> — signature + expiry; key badli = 403. IAM user creds se max 7 din.' },
      { front: '11 nines durability kis se nahi bachati?', back: 'Tumhare ya attacker ke valid delete/overwrite se. Uske liye versioning, Object Lock, cross-account backup.' },
      { front: 'Object Lock compliance vs governance?', back: '<b>Compliance</b>: retention tak koi delete nahi (root bhi nahi). <b>Governance</b>: special permission (s3:BypassGovernanceRetention) wale hata sakte hain.' },
      { front: 'S3 per-prefix request limits?', back: '~<b>3,500</b> PUT/COPY/POST/DELETE aur ~<b>5,500</b> GET/HEAD per second per prefix. Zyada → prefixes baanto + CloudFront.' },
      { front: 'Encryption on thi phir bhi leak — kyun?', back: 'At-rest encryption disk chori se bachata hai. Authorized/public request ko S3 decrypt karke deta hai. Leak access control (policy/BPA) ki galti hai.' },
    ],
  }]);
})();
