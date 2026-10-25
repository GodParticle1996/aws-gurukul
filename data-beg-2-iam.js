/* =====================================================================
   AWS Gurukul — 🌱 Beginner · Level 2: IAM (v2, 2026-10-23)
   ShopKaro kahani continue: root key GitHub par leak → crypto mining + backdoor user.
   Shape: hook → steps → myth → playbook → exam lens → stages (dryrun pehle).
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho. Chhote vaakya.
   ===================================================================== */
(function () {
  const N = AG.aws.n;

  /* blast radius — leak hui credential se attacker kya kar sakta hai */
  const ACTIONS = [
    { label: 's3:GetObject (sirf padhna)', w: 1, txt: '1 action' },
    { label: 's3:Get* (saare S3 read)', w: 3, txt: '~30 S3 read actions' },
    { label: 's3:* (S3 mein sab)', w: 6, txt: '~170 S3 actions — delete bhi' },
    { label: '* (poora AWS)', w: 10, txt: 'har service ki har action (hazaaron)' },
  ];
  const RESOURCES = [
    { label: 'shopkaro-reports/* (ek folder)', w: 1, txt: '1 bucket ka data' },
    { label: 'shopkaro-reports (ek bucket)', w: 2, txt: '1 bucket' },
    { label: 'arn:aws:s3:::* (saari buckets)', w: 6, txt: 'account ki saari 23 buckets' },
    { label: '* (har resource)', w: 10, txt: 'har resource (EC2, RDS, IAM...)' },
  ];
  const CREDS = [
    { label: 'IAM role (temporary credentials)', w: 1, txt: 'kuch ghanton mein expire, apne aap rotate' },
    { label: 'IAM user access key (permanent)', w: 4, txt: 'jab tak koi delete na kare — aksar mahine' },
  ];
  function blast(k) {
    const a = ACTIONS[k.action], r = RESOURCES[k.resource], c = CREDS[k.creds];
    return { a, r, c, score: a.w * r.w * c.w, appWorks: true };
  }

  AG.registerLevels('beginner', [{
    id: 'iam',
    icon: '🔐',
    title: 'IAM — kaun, kya, kis par kar sakta hai',
    badge: 'IAM Insafdaar',
    hook: {
      when: 'ShopKaro · 21 Oct · 2:07 AM',
      title: 'Ek GitHub push, 7 minute, 40 GPU servers',
      text: 'ShopKaro mein 5 log ek hi root login share karte the. Product upload script ke liye root user ki access key banayi gayi thi. Ek freelancer ne website ke CSS ka kaam karte waqt woh key apni <code>.env</code> file mein rakhi aur galti se poora folder public GitHub repo mein push kar diya. 7 minute baad internet par ghoomte bots ne key utha li. Raat 2:07 baje attacker ne N. Virginia mein 40 GPU servers chalaye (crypto mining), 2:09 par apne liye ek naya admin user <code>backup-svc</code> banaya, aur product images ki bucket khaali kar di. Subah 8 baje tak bill $1,360 (~₹1.2 lakh). Neha ka sawal: har insaan aur har program ko sirf utni power kaise doon jitni kaam ki hai — taaki ek key leak ho toh poori dukaan na lute?',
    },
    objectives: [
      '<b>Root user</b> ka sahi istemaal — MFA, koi access key nahi, roz ka kaam nahi',
      'AWS har request ka faisla kaise karta hai: <b>default deny → Allow → explicit Deny jeetta hai</b>',
      '<b>Policy JSON</b> ke hisse — Effect, Action, Resource, Condition — aur bucket vs object ARN ka farak',
      '<b>User, Group, Role</b> — kisko kya do, aur apps ko hamesha <b>role</b> kyun',
      '<b>Least privilege</b> practically — blast radius numbers mein, Access Analyzer, conditions',
      'Key leak hone par <b>incident response</b> — asli CLI commands se containment',
    ],
    steps: [
      {
        q: 'IAM kya hai — aur root user ka kya karein?',
        analogy: 'Ek office building. <b>Root user</b> = building ki master key — har darwaza, tijori, bijli ka main switch. <b>IAM</b> = access-card system: har employee ka apna card, card par likha hai kaunsi manzil, kaunsa darwaza, kis time. Master key roz jeb mein le ke ghoomoge toh ek din girogi — aur tab poori building gayi.',
        body: 'AWS account banate hi <b>root user</b> milta hai (signup email + password). Root ke upar koi IAM policy nahi lagti — root sab kuch kar sakta hai, account band bhi.',
        points: [
          'Root par <b>MFA</b> (phone app ya hardware key) — pehla kaam',
          'Root ki <b>access key kabhi mat banao</b>. Bani hai toh delete karo.',
          'Root sirf rare kaam ke liye: billing settings, account close, kuch support plan changes',
          'Roz ka kaam: <b>IAM Identity Center</b> (multi-account) ya IAM user + MFA (chhota setup)',
        ],
        asli: 'Root = master key, taale mein. ShopKaro ki tabaahi ki jad: root ki access key ek script mein thi — leak hote hi attacker ke paas har darwaza khula tha.',
      },
      {
        q: 'AWS ek request ko Allow ya Deny kaise karta hai?',
        analogy: 'Building ka guard. Rule 1: card nahi dikhaya → andar nahi (<b>default deny</b>). Rule 2: card par is manzil ki entry likhi hai → andar (<b>Allow</b>). Rule 3: kisi ne "is aadmi ko tijori wale kamre mein kabhi mat jaane dena" likh diya → nahi jaane dega, chahe card par sab manzilein likhi hon (<b>explicit Deny jeetta hai</b>).',
        body: 'Har API call ke saath AWS 3 cheezein dekhta hai: <b>kaun</b> (principal — user/role), <b>kya</b> (action — <code>s3:GetObject</code>), <b>kis par</b> (resource — <code>arn:aws:s3:::shopkaro-reports/q3.csv</code>). Phir faisla:',
        points: [
          '<b>1. Shuru mein DENY.</b> Kuch likha nahi = mana.',
          '<b>2. Explicit Deny dhoondo.</b> Kisi bhi policy mein Deny match kiya → <b>Deny, khatam</b>.',
          '<b>3. Allow dhoondo.</b> Koi Allow match kiya → Allow.',
          '<b>4. Kuch match nahi</b> → implicit Deny (AccessDenied).',
        ],
        asli: 'Order yaad rakho: <b>Deny &gt; Allow &gt; default deny</b>. Explicit Deny ek guardrail hai jo galti se diye gaye Allow ko bhi kaat deta hai. (Bade setups mein SCPs aur permission boundaries upar se aur limit lagate hain — Advanced track.)',
      },
      {
        q: 'Policy JSON ke hisse kya hain?',
        code: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadReports",
    "Effect": "Allow",                                  ← Allow ya Deny
    "Action": ["s3:GetObject"],                         ← kya (service:action, * wildcard)
    "Resource": "arn:aws:s3:::shopkaro-reports/*",      ← kis par (ARN)
    "Condition": {                                      ← kab (optional)
      "Bool": { "aws:MultiFactorAuthPresent": "true" }
    }
  }]
}`,
        body: '<b>Bucket vs object ARN</b> — beginners ki sabse common galti:<div class="tbl-wrap"><table><tr><th>Action</th><th>Resource ARN</th></tr>' +
          '<tr><td><code>s3:ListBucket</code> (bucket ke andar list)</td><td><code>arn:aws:s3:::shopkaro-reports</code> (bina <code>/*</code>)</td></tr>' +
          '<tr><td><code>s3:GetObject</code>, <code>s3:PutObject</code> (files)</td><td><code>arn:aws:s3:::shopkaro-reports/*</code> (<code>/*</code> ke saath)</td></tr></table></div>',
        asli: 'Galat ARN = "policy toh likhi thi, phir bhi AccessDenied". Pehle dekho action bucket par hai ya object par.',
      },
      {
        q: 'User, Group, Role — kisko kya do?',
        body: '<div class="tbl-wrap"><table><tr><th></th><th>Misaal</th><th>Credentials</th><th>Kab</th></tr>' +
          '<tr><td>👤 <b>User</b></td><td>Employee ka apna ID card</td><td>Password (console) / access key (permanent, <code>AKIA…</code>)</td><td>Ek insaan (chhota setup) ya purana tool jo sirf key leta hai</td></tr>' +
          '<tr><td>👥 <b>Group</b></td><td>Department ("Developers")</td><td>Koi nahi — sirf permissions ka dabba</td><td>10 developers ko ek jaisi permission — group par policy, users group mein</td></tr>' +
          '<tr><td>🎭 <b>Role</b></td><td>Visitor badge — reception par milta hai, shaam ko expire</td><td>Temporary (<code>ASIA…</code> + session token), STS deta hai</td><td>EC2/Lambda/ECS app, doosre account ka access, insaan ka temporary elevated access</td></tr></table></div>' +
          'Role ki do policies: <b>trust policy</b> = kaun is role ko pehen (assume) sakta hai. <b>Permission policy</b> = role pehen ke kya kar sakte ho.',
        asli: 'Code ko kabhi permanent key mat do — EC2 par instance profile, Lambda par execution role. Temporary credentials khud expire aur rotate hote hain.',
      },
      {
        q: 'Identity policy aur resource policy mein farak?',
        body: '<b>Identity-based policy</b> user/group/role par lagti hai: "ravi kya kar sakta hai". <b>Resource-based policy</b> resource par lagti hai (S3 bucket policy, SQS queue policy, KMS key policy): "is bucket ko kaun chhoo sakta hai" — isme <code>Principal</code> likha hota hai.',
        example: 'ShopKaro ka accountant doosri company (CA firm) ke AWS account se monthly reports padhta hai. Do raaste: (1) reports bucket ki <b>bucket policy</b> mein CA firm ka account Principal, ya (2) ShopKaro mein ek <b>role</b> jiski trust policy mein CA firm ka account — CA firm role assume kare. Doosre account ke case mein dono taraf permission chahiye: ShopKaro ki taraf (bucket policy / trust policy) aur CA firm ki taraf (unki identity policy).',
        asli: 'Ek hi account ke andar: identity policy kaafi hoti hai. Account ke bahar: dono taraf ki "haan" chahiye.',
      },
      {
        q: 'Least privilege practically kaise karein?',
        points: [
          '<b>Shuru:</b> AWS managed policy (jaise <code>AmazonS3ReadOnlyAccess</code>) se prototype — par production mein mat chhodo',
          '<b>Tight karo:</b> specific actions (<code>s3:GetObject</code>, <code>s3:*</code> nahi) + specific ARNs (<code>shopkaro-reports/*</code>, <code>*</code> nahi)',
          '<b>Data se tight karo:</b> IAM Access Analyzer CloudTrail dekh ke batata hai kaunsi permissions use hi nahi hui, aur used actions se policy generate kar deta hai',
          '<b>Conditions:</b> sensitive kaam sirf MFA ke saath (<code>aws:MultiFactorAuthPresent</code>), sirf office IP se (<code>aws:SourceIp</code>)',
          '<b>Guardrail:</b> prod data par explicit Deny — galat Allow bhi kaam na kare',
        ],
        asli: '"Abhi full access de do, baad mein tight karenge" — baad kabhi nahi aata. Capital One (2019): ek EC2 role ke paas zarurat se zyada S3 access tha; attacker ne SSRF bug se role ke temporary credentials churaye aur ~10 crore customer records nikaal liye.',
      },
      {
        q: 'Key leak ho jaaye toh kya karein? (order mein)',
        points: [
          '<b>1. Key band:</b> <code>aws iam update-access-key --status Inactive</code> (phir delete). Root key ho toh root se login karke delete.',
          '<b>2. Dekho kya hua:</b> CloudTrail mein us key ke saare calls — kya banaya, kya delete kiya.',
          '<b>3. Attacker ka chhupa raasta hatao:</b> naye users, naye keys, naye roles jo attacker ne banaye (ShopKaro ka <code>backup-svc</code>).',
          '<b>4. Nuksaan rokna:</b> attacker ke chalaye resources terminate (GPU servers), data restore (versioning/backup).',
          '<b>5. Wajah band:</b> secrets scanning (git), root keys nahi, roles, budget alarm.',
        ],
        asli: 'Public GitHub par leak hui keys bots minutes mein dhoondh lete hain. AWS bhi public repos scan karke leak hui key par quarantine policy laga deta hai — par bots aksar pehle pahunch jaate hain. Key kabhi code mein mat rakho.',
      },
    ],
    myth: [
      { myth: 'Mere paas Allow hai toh kaam hoga.', sach: 'Kahin bhi explicit Deny match kiya (tumhari policy, group ki policy, SCP, permission boundary) toh Deny jeetega. Allow sirf tab chalta hai jab koi Deny na ho.' },
      { myth: 'Role bhi ek tarah ka user hai.', sach: 'Role ka koi password ya permanent key nahi hota. Trust policy mein jo allowed hai woh role "assume" karke temporary credentials (default 1 ghanta) leta hai.' },
      { myth: 'Developer ko AdministratorAccess de do, project ke baad hata denge.', sach: 'Project ke baad koi yaad nahi rakhta. Laptop chori ya key leak = poora account. Shuru se scoped permissions do; Access Analyzer se unused permissions hatao.' },
      { myth: 'MFA sirf root ke liye zaroori hai.', sach: 'Har insaan par MFA. Aur policy mein condition se sensitive actions (delete, IAM changes) bina MFA ke block kar sakte ho.' },
    ],
    playbook: {
      title: 'IAM — kisko kya, kaise',
      use: [
        'Apps (EC2, Lambda, ECS) ko <b>role</b> — instance profile / execution role / task role',
        'Insaanon ko <b>IAM Identity Center</b> (multi-account SSO); chhote setup mein IAM user + MFA',
        'Permissions <b>groups</b> par, users groups mein',
        'Doosre account ko access: <b>cross-account role</b> (third-party ke liye ExternalId)',
        'Prod data par <b>explicit Deny</b> guardrail',
      ],
      avoid: [
        'Root se roz kaam, root ki access keys',
        'EC2 par access key file / code mein hardcoded key',
        'Apps ke liye <code>"Action": "*"</code> ya <code>"Resource": "*"</code>',
        'Ek login kai logon mein share',
        'Har user par alag-alag inline policies ka jungle',
      ],
      how: [
        'Root: MFA, keys delete, password manager mein band',
        'Admin identity banao (Identity Center / IAM user + MFA)',
        'Groups + managed/customer policies; specific actions + ARNs',
        'IAM Access Analyzer on — unused access aur external access findings',
        'Credential report / last-used dekh ke 90+ din purani keys rotate ya delete',
      ],
      redflags: [
        'Kisi user par AdministratorAccess jo roz CLI chalata hai',
        'Access keys 90 din se purani, ya kabhi use hi nahi hui',
        'Resource policy mein <code>"Principal": "*"</code> bina condition ke',
        'Unused roles jinke trust policy mein bahar ke accounts',
      ],
      rule: 'Default deny. Allow sirf zaroorat ka. Explicit Deny sabse upar. Insaan = SSO + MFA. Code = role. Root = taale mein.',
    },
    exam: [
      { cue: '"application running on EC2 needs to access S3/DynamoDB"', pick: 'IAM role (instance profile) — access keys NAHI', why: 'Temporary credentials, auto-rotate.' },
      { cue: '"users from another AWS account need access"', pick: 'Cross-account IAM role (sts:AssumeRole), ya resource-based policy', why: 'Dono accounts ki taraf permission chahiye.' },
      { cue: '"centrally manage workforce access to multiple accounts"', pick: 'IAM Identity Center', why: 'SSO + permission sets.' },
      { cue: '"allow action only when MFA is used"', pick: 'Condition aws:MultiFactorAuthPresent = true', why: 'Ya Deny jab MFA false.' },
      { cue: '"an Allow and a Deny both match"', pick: 'Explicit Deny wins', why: 'Policy evaluation ka pehla rule.' },
      { cue: '"identify unused permissions / generate least-privilege policy from activity"', pick: 'IAM Access Analyzer', why: 'CloudTrail activity se policy generation + unused access findings.' },
      { cue: '"limit the maximum permissions a developer can give to roles they create"', pick: 'Permissions boundary', why: 'Boundary ke bahar ki permission kaam nahi karti, chahe policy Allow kare.' },
      { cue: '"third-party vendor assumes a role in your account"', pick: 'Trust policy mein vendor account + ExternalId condition', why: 'Confused-deputy se bachav.' },
    ],
    stages: [
      /* ---------- 1. DRY RUN ---------- */
      {
        type: 'dryrun',
        title: '🔍 Dry run — guard ka faisla: Allow ya Deny?',
        goal: 'Ravi teen commands chalata hai. Har click par dekho AWS kaunsa rule check karta hai aur kaunsi policy faisla karti hai.',
        nodes: [
          N('dev', 120, 250, { label: 'ravi' }),
          N('iam', 470, 250, { label: 'IAM policy check' }),
          N('s3#r', 850, 130, { label: 'shopkaro-reports' }),
          N('s3#p', 850, 380, { label: 'prod-backups' }),
          N('trail', 470, 440, { label: 'CloudTrail' }),
        ],
        edges: [{ from: 'dev', to: 'iam' }, { from: 'iam', to: 's3#r' }, { from: 'iam', to: 's3#p' }, { from: 'iam', to: 'trail', dashed: true }],
        panels: [{ id: 'pol', title: 'Ravi par lagi policies' }, { id: 'dec', title: 'Faisla (step by step)' }],
        steps: [
          {
            say: 'Ravi chalata hai <code>aws s3 cp s3://shopkaro-reports/q3.csv .</code>. CLI request ko ravi ki secret key se <b>sign</b> karta hai. Request mein 3 cheezein: <b>kaun</b> = user/ravi, <b>kya</b> = <code>s3:GetObject</code>, <b>kis par</b> = <code>arn:aws:s3:::shopkaro-reports/q3.csv</code>.',
            flows: [{ from: 'dev', to: 'iam', label: 's3:GetObject q3.csv', tone: 'acc' }],
            nodes: { dev: { tone: 'acc' }, iam: { tone: 'busy', badge: 'check shuru' } },
            panels: { pol: ['group developers → reports-read:', '  Allow s3:ListBucket on shopkaro-reports', '  Allow s3:GetObject on shopkaro-reports/*'], dec: ['Shuru: DENY (default)'] },
          },
          {
            say: 'IAM pehle signature check karta hai: key kis user ki hai, key Active hai? Phir ravi par lagi <b>saari policies jama</b> karta hai — ravi ki apni + ravi ke har group ki. Ravi ki apni koi policy nahi, group <code>developers</code> ki ek policy hai.',
            nodes: { iam: { tone: 'busy', badge: 'policies jama' } },
            panels: { dec: ['Shuru: DENY (default)', 'Signature ✅ (key Active)', 'Policies mili: 1 (group se)'] },
          },
          {
            say: 'Rule: pehle <b>explicit Deny</b> dhoondo. Kisi statement mein <code>"Effect": "Deny"</code> hai jo <code>s3:GetObject</code> aur is ARN se match kare? Koi nahi.',
            panels: { dec: ['Shuru: DENY (default)', 'Signature ✅', 'Explicit Deny match? → nahi'] },
            ask: {
              q: 'Agar kisi bhi policy mein ek Deny match kar jaata, toh kya hota?',
              choices: [
                'Request turant Deny — chahe kitne bhi Allow statements hon',
                'Allow aur Deny gin ke jo zyada hon woh jeetta',
                'Pehle likhi policy jeetti',
                'AWS admin se poochta',
              ],
              answer: 0,
              explain: 'Explicit Deny hamesha jeetta hai. Isliye explicit Deny guardrail ki tarah use hota hai — prod data ko galat Allow se bachane ke liye.',
            },
          },
          {
            say: 'Ab <b>Allow</b> dhoondo: <code>reports-read</code> ka statement <code>s3:GetObject</code> on <code>shopkaro-reports/*</code> — match! Faisla <b>ALLOW</b>. Request S3 tak gayi, file mil gayi. (CloudTrail mein S3 file-level calls tabhi dikhte hain jab "data events" on hon — management events hamesha.)',
            flows: [{ from: 'iam', to: 's3#r', label: 'ALLOW', tone: 'ok' }, { from: 'iam', to: 'trail', label: 'log', tone: 'acc' }],
            nodes: { iam: { tone: 'ok', badge: 'ALLOW' }, 's3#r': { tone: 'ok', badge: 'q3.csv diya' } },
            panels: { dec: ['Shuru: DENY', 'Explicit Deny? → nahi', 'Allow match? → haan (reports-read)', '✅ ALLOW'] },
          },
          {
            say: 'Ravi ab chalata hai <code>aws s3 rm s3://shopkaro-reports/q3.csv</code> — action <code>s3:DeleteObject</code>. Explicit Deny? Nahi. Allow? <code>reports-read</code> mein DeleteObject likha hi nahi.',
            flows: [{ from: 'dev', to: 'iam', label: 's3:DeleteObject', tone: 'acc' }, { from: 'iam', to: 'dev', label: 'AccessDenied', tone: 'bad', back: true }],
            nodes: { iam: { tone: 'bad', badge: 'implicit deny' }, 's3#r': { tone: 'idle', badge: '' } },
            panels: { dec: ['Explicit Deny? → nahi', 'Allow match? → nahi', '❌ DENY (implicit)'] },
            ask: {
              q: 'Koi Deny statement nahi tha — phir bhi AccessDenied kyun?',
              choices: [
                'Koi Allow match nahi hua, aur default faisla Deny hai (implicit deny)',
                'S3 ne file lock kar rakhi thi',
                'Ravi ka password galat tha',
                'CloudTrail ne rok diya',
              ],
              answer: 0,
              explain: 'IAM mein "jo likha nahi, woh mana". Isliye least privilege mein sirf zaroori actions likhte hain — baaki apne aap band.',
            },
          },
          {
            say: 'Kisi admin ne galti se ravi ko apni policy <code>s3:*</code> on <code>*</code> de di. Saath mein group par guardrail hai: <b>Deny</b> <code>s3:*</code> on <code>prod-backups</code>. Ravi chalata hai <code>aws s3 ls s3://prod-backups</code> — <code>s3:ListBucket</code>.',
            flows: [{ from: 'dev', to: 'iam', label: 's3:ListBucket prod-backups', tone: 'acc' }, { from: 'iam', to: 's3#p', label: '✋ blocked', tone: 'bad' }],
            nodes: { iam: { tone: 'bad', badge: 'explicit DENY' }, 's3#p': { tone: 'ok', badge: 'surakshit' } },
            panels: { pol: ['ravi → oops-s3-full: Allow s3:* on *', 'group developers → reports-read', 'group developers → deny-prod: Deny s3:* on prod-backups'], dec: ['Explicit Deny? → HAAN (deny-prod)', '❌ DENY — Allow (s3:*) bekaar'] },
            ask: {
              q: 'Allow (s3:*) bhi match hua aur Deny bhi. Final faisla?',
              choices: ['DENY — explicit Deny jeetta hai', 'ALLOW — s3:* zyada broad hai', 'Jo policy baad mein lagi woh jeetegi', 'Error — conflict'],
              answer: 0,
              explain: 'Isi wajah se explicit Deny "galti-proof" guardrail hai. Bade setups mein yahi kaam SCP poore account ke liye karta hai.',
            },
          },
        ],
        lesson: '<b>Asli baat:</b> AWS ka guard teen sawal poochta hai — <b>kaun, kya, kis par</b> — aur ek order mein faisla karta hai: <b>explicit Deny → Allow → default Deny</b>. Policy likhte waqt yahi order dimaag mein rakho.',
      },

      /* ---------- 2. LIVE LAB: blast radius ---------- */
      {
        type: 'flowlab',
        title: '🎛️ Live lab — key leak hui toh kitna nuksaan? (blast radius)',
        goal: 'ShopKaro ka report-generator app sirf <code>shopkaro-reports/</code> se files <b>padhta</b> hai. Shuru mein app ko admin jaisi permanent key di gayi hai. Knobs ghuma ke <b>risk score 4 ya usse kam</b> karo — app ka kaam (reports padhna) chalta rahe.',
        scenario: 'Risk score = (actions kitni broad) × (resources kitne broad) × (credential kitni der zinda). Har knob ki position app ka kaam todti nahi — teeno positions par reports padhna allowed hai. Sawal sirf yeh hai ki leak hone par attacker ko kitna milta hai.',
        knobs: [
          { id: 'action', label: 'Action', min: 0, max: 3, step: 1, value: 3, labels: { 0: ACTIONS[0].label, 1: ACTIONS[1].label, 2: ACTIONS[2].label, 3: ACTIONS[3].label } },
          { id: 'resource', label: 'Resource', min: 0, max: 3, step: 1, value: 3, labels: { 0: RESOURCES[0].label, 1: RESOURCES[1].label, 2: RESOURCES[2].label, 3: RESOURCES[3].label } },
          { id: 'creds', label: 'Credential type', min: 0, max: 1, step: 1, value: 1, labels: { 0: CREDS[0].label, 1: CREDS[1].label } },
        ],
        model: k => {
          const b = blast(k);
          const tone = b.score <= 4 ? 'ok' : b.score <= 40 ? 'warn' : 'bad';
          return {
            readouts: [
              { label: 'Risk score (1 – 400)', value: String(b.score), tone },
              { label: 'Attacker kya kar sakta hai', value: b.a.txt, tone: b.a.w <= 1 ? 'ok' : b.a.w <= 3 ? 'warn' : 'bad' },
              { label: 'Kis par', value: b.r.txt, tone: b.r.w <= 2 ? 'ok' : 'bad' },
              { label: 'Kitni der tak', value: b.c.txt, tone: b.c.w === 1 ? 'ok' : 'bad' },
            ],
            bars: [{ label: 'Blast radius', pct: b.score / 400 * 100, tone, text: b.score + ' / 400' }],
            verdict: b.score <= 4
              ? { ok: true, text: 'Leak hone par attacker ko sirf reports padhne ko milega, aur woh bhi credentials expire hone tak. App ka kaam poora chal raha hai.' }
              : { ok: false, text: `Risk ${b.score}. App ko sirf reports padhni hain, par leak hone par attacker ko "${b.a.txt}" on "${b.r.txt}" milega, "${b.c.txt}".` },
          };
        },
        check: k => blast(k).score <= 4,
        lesson: '🎯 Least privilege teen dials hain: <b>action chhota</b>, <b>resource chhota</b>, <b>credential ki umar chhoti</b>. Teeno se app ka kaam nahi ruka — sirf attacker ka maal kam hua. ShopKaro ki root key teeno dials par sabse upar thi (score 400).',
        quiz: {
          q: 'EC2 par chal rahe app ke liye sabse sahi combination?',
          choices: [
            'IAM role (instance profile) + s3:GetObject + arn:aws:s3:::shopkaro-reports/*',
            'Admin user ki access key app ki config file mein',
            'IAM user key + AmazonS3FullAccess',
            'Bucket public kar do, credential ki zaroorat hi nahi',
          ],
          answer: 0,
          explain: 'Role = temporary credentials. Specific action + specific ARN = chhota blast radius.',
        },
      },

      /* ---------- 3. BINS ---------- */
      {
        type: 'bins',
        title: 'User, Group, Role ya Policy?',
        instructions: 'Har situation ko sahi IAM cheez mein daalo.',
        bins: [
          { id: 'user', label: '👤 User' },
          { id: 'group', label: '👥 Group' },
          { id: 'role', label: '🎭 Role' },
          { id: 'policy', label: '📜 Policy' },
        ],
        items: [
          { text: 'Neha (founder) ka apna console login, MFA ke saath — chhota single-account setup', bin: 'user', explain: 'Ek insaan = ek identity. Multi-account org mein Identity Center behtar, chhote setup mein IAM user + MFA.' },
          { text: '6 developers ko ek jaisi S3 read permission', bin: 'group', explain: 'Group par ek policy; naya developer aaye toh bas group mein add.' },
          { text: 'EC2 par chal rahi app ko DynamoDB mein likhna hai', bin: 'role', explain: 'Instance profile = role. Koi key file nahi.' },
          { text: 'Lambda ko SQS se messages padhne hain', bin: 'role', explain: 'Lambda execution role.' },
          { text: '"Allow s3:GetObject on shopkaro-reports/*" — JSON document', bin: 'policy', explain: 'Policy = Effect + Action + Resource (+ Condition).' },
          { text: 'CA firm ke AWS account ko monthly reports padhne dena', bin: 'role', explain: 'Cross-account role: trust policy mein CA firm ka account.' },
          { text: '"Finance team ke saare log" ka dabba', bin: 'group', explain: 'Group = users ka collection, khud login nahi kar sakta.' },
          { text: '"prod-backups par s3:* Deny" — guardrail', bin: 'policy', explain: 'Explicit Deny statement wali policy.' },
        ],
      },

      /* ---------- 4. ORDER ---------- */
      {
        type: 'order',
        title: 'Naya account — root ko taale mein band karne ka sahi order',
        instructions: 'ShopKaro ka naya (saaf) AWS account bana. Steps sahi order mein lagao.',
        steps: [
          { text: 'Root se login karke root par MFA lagao', explain: 'Sabse pehle master key par doosra taala. Root par MFA ke bina kuch aur mat karo.' },
          { text: 'Root ki access keys check karo — koi hai toh delete karo', explain: 'Root key = ShopKaro wali tabaahi. Root ke paas key honi hi nahi chahiye.' },
          { text: 'Roz ke admin kaam ke liye alag identity banao (Identity Center ya IAM user + MFA)', explain: 'Ab root ke bina kaam karne ka raasta taiyaar.' },
          { text: 'Nayi admin identity se login karke check karo ki sab kaam ho raha hai', explain: 'Root band karne se pehle confirm — warna khud ko lock out kar loge.' },
          { text: 'Root se logout; root ka password + MFA device surakshit jagah (password manager / tijori)', explain: 'Root ab sirf rare kaam ke liye — billing settings, account close.' },
        ],
      },

      /* ---------- 5. FILL ---------- */
      {
        type: 'fill',
        title: 'Least-privilege policy khud likho',
        instructions: 'Report-generator app (EC2 par) ko <b>sirf</b> <code>shopkaro-reports</code> se files padhni hain. Tokens ko sahi blank mein daalo.',
        template: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "{0}",
      "Action": "{1}",
      "Resource": "arn:aws:s3:::shopkaro-reports/{2}"
    }
  ]
}

# App ko yeh policy kaise milegi? Access key EC2 par MAT daalo —
# ek {3} banao aur EC2 instance se instance profile ke through attach karo.`,
        tokens: ['Allow', 's3:GetObject', '*', 'IAM role', 'Deny', 's3:*', 'IAM user', 'access key'],
        blanks: [
          { answer: 'Allow', explain: 'IAM default se sab deny karta hai — jo chahiye woh explicitly Allow.' },
          { answer: 's3:GetObject', explain: 'Sirf padhna = <code>s3:GetObject</code>. <code>s3:*</code> mein delete bhi aa jaata — least privilege ka ulta.' },
          { answer: '*', explain: 'Bucket ke andar ki files ka ARN <code>arn:aws:s3:::shopkaro-reports/*</code>. Bucket khud (bina <code>/*</code>) <code>s3:ListBucket</code> ke liye hota hai.' },
          { answer: 'IAM role', explain: 'EC2 par hamesha role — temporary credentials, auto-rotate, CloudTrail mein role ke naam se audit.' },
        ],
      },

      /* ---------- 6. QUIZ: policy padho ---------- */
      {
        type: 'quiz',
        title: 'Policy JSON padho — faisla kya hoga?',
        questions: [
          {
            q: 'Is policy ke saath user <code>aws s3 ls s3://photos/</code> chalata hai (bucket ke andar list). Kya hoga?',
            context: '{\n  "Version": "2012-10-17",\n  "Statement": [{\n    "Effect": "Allow",\n    "Action": ["s3:ListBucket", "s3:GetObject"],\n    "Resource": "arn:aws:s3:::photos/*"\n  }]\n}',
            choices: [
              'AccessDenied — s3:ListBucket bucket ke ARN (arn:aws:s3:::photos) par lagta hai, photos/* par nahi',
              'List ho jayegi — ListBucket allowed hai',
              'Saari buckets list hongi',
              'Error — Action array mein nahi likh sakte',
            ],
            answer: 0,
            explain: 'Classic galti. ListBucket = bucket resource; GetObject = object resource (/*). Dono ARNs alag statements mein ya Resource array mein dono do.',
          },
          {
            q: 'User par yeh do policies hain. User <code>s3:DeleteObject</code> on <code>arn:aws:s3:::logs/a.txt</code> karta hai. Faisla?',
            context: 'Policy A: { "Effect": "Allow", "Action": "s3:*", "Resource": "*" }\nPolicy B: { "Effect": "Deny",  "Action": "s3:Delete*", "Resource": "arn:aws:s3:::logs/*" }',
            choices: ['Deny — explicit Deny jeetta hai', 'Allow — s3:* sab cover karta hai', 'Policy A pehle hai isliye Allow', 'Dono cancel, error'],
            answer: 0,
            explain: 'Deny > Allow. Logs ko delete se bachane ka yahi tareeka hai — chahe kisi ke paas s3:* ho.',
          },
          {
            q: 'Yeh condition kya karti hai?',
            context: '{\n  "Effect": "Deny",\n  "Action": ["ec2:TerminateInstances", "iam:*"],\n  "Resource": "*",\n  "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }\n}',
            choices: [
              'Bina MFA ke login kiya hai toh instances terminate karna aur IAM changes block',
              'Sab users ke liye IAM hamesha block',
              'Sirf MFA wale users ko block',
              'Kuch nahi karti — Deny ke saath Condition nahi lagti',
            ],
            answer: 0,
            explain: 'Sensitive actions ke liye MFA zaroori banane ka standard pattern. BoolIfExists isliye ki kuch requests (access keys) mein MFA key hoti hi nahi — unhe bhi block maana jaaye.',
          },
          {
            q: 'Policy mein <code>"Resource": "arn:aws:s3:::reports*"</code> likha hai. Kaunsi bucket bhi match ho jayegi jo shayad tum nahi chahte?',
            choices: ['reports-archive-old aur reportsXYZ bhi — * prefix ke baad kuch bhi match karta hai', 'Sirf reports', 'Koi nahi', 'Sirf reports/ folder'],
            answer: 0,
            explain: 'Wildcard ka matlab "kuch bhi". Exact ARN likho — reports aur reports/* — taaki naye buckets galti se cover na hon.',
          },
          {
            q: 'EC2 app ko S3 se file padhni hai. Best practice?',
            choices: [
              'EC2 par IAM role (instance profile) jisme sirf zaroori S3 actions — app ko key file nahi',
              'Access key EC2 ke environment variable mein',
              'Bucket public kar do',
              'Root user ki key EC2 par',
            ],
            answer: 0,
            explain: 'Hardcoded/permanent keys leak hoti hain. Role = temporary, auto-rotate, audit trail.',
          },
        ],
      },

      /* ---------- 7. TRIAGE ---------- */
      {
        type: 'triage',
        title: '🩺 Triage — raat 2 baje kya hua? (leaked key)',
        symptom: '21 Oct, subah 8 baje. Neha ko bank ka SMS: AWS par $1,360. Site par product images gayab. Team ka WhatsApp: "kisi ne kuch nahi kiya". Tum on-call ho. Pehle samjho kya hua — phir action.',
        commands: [
          { cmd: 'aws ec2 describe-instances --region us-east-1 --query "length(Reservations[].Instances[?InstanceType==\'g5.12xlarge\'])"', out: '40', clue: true, note: '40 bade GPU servers us region mein jahan ShopKaro kuch chalata hi nahi. Crypto mining ka classic nishaan.' },
          { cmd: 'aws cloudtrail lookup-events --region us-east-1 --lookup-attributes AttributeKey=EventName,AttributeValue=RunInstances --max-results 1 --query "Events[].[EventTime,Username,AccessKeyId]" --output text', out: '2026-10-21T02:07:13+00:00\troot\tAKIA4SHOPKAROROOT01', clue: true, note: 'Launch <b>root</b> ki access key se hua. Root par koi IAM policy nahi lagti — attacker ke paas har power thi.' },
          { cmd: 'aws iam get-account-summary --query "SummaryMap.AccountAccessKeysPresent"', out: '1', clue: true, note: 'Root user ki ek access key exist karti hai. Root ke paas key honi hi nahi chahiye thi.' },
          { cmd: 'aws iam list-users --query "Users[].[UserName,CreateDate]" --output text', out: 'neha\t2026-07-15T10:02:11+00:00\nravi\t2026-08-01T09:40:55+00:00\nbackup-svc\t2026-10-21T02:09:40+00:00', clue: true, note: '<b>backup-svc</b> launch ke 2 minute baad bana. Kisi team member ne nahi banaya — attacker ka chhupa raasta (persistence): root key band ho jaaye tab bhi wapas aa sake.' },
          { cmd: 'aws iam list-attached-user-policies --user-name backup-svc --query "AttachedPolicies[].PolicyName" --output text', out: 'AdministratorAccess', clue: true, note: 'Backdoor user ke paas poora admin access.' },
          { cmd: 'aws s3 ls s3://shopkaro-product-images --summarize | tail -2', out: 'Total Objects: 0\n   Total Size: 0', clue: true, note: 'Product images ki bucket khaali. Versioning on thi ya nahi — agla level (S3) yahi sikhata hai.' },
          { cmd: 'aws ec2 describe-key-pairs --region ap-south-1 --query "KeyPairs[].KeyName" --output text', out: 'shopkaro-web', clue: false, note: 'Mumbai ka purana SSH key pair — is incident se juda nahi.' },
        ],
        questions: [
          {
            q: 'Sabse pehla containment kadam kya hai?',
            choices: [
              'Root ki leaked access key turant delete karo, aur backup-svc ki keys + user hatao — dono raaste band',
              'Pehle GPU servers ka bill dispute karo',
              'Sirf GPU instances terminate karo',
              'Account ka password badlo aur wait karo',
            ],
            answer: 0,
            explain: 'Jab tak attacker ke paas koi bhi chaabi hai (root key ya backdoor user), woh wapas aa sakta hai. Pehle chaabiyan, phir nuksaan saaf (instances terminate), phir data restore.',
          },
          {
            q: 'Is incident ka blast radius "poora account" kyun tha?',
            choices: [
              'Leak hui key root ki thi — root par IAM policies lagti hi nahi, toh attacker sab kuch kar sakta tha',
              'Kyunki region us-east-1 tha',
              'Kyunki GPU instances mehenge hote hain',
              'Kyunki CloudTrail on tha',
            ],
            answer: 0,
            explain: 'Least privilege root par kaam nahi karta. Isliye root ki key kabhi nahi banate — script ko scoped IAM user ya role do.',
          },
          {
            q: 'Dobara na ho — kaunsa set sabse sahi hai?',
            choices: [
              'Root key kabhi nahi + root MFA, har insaan ki alag identity + MFA, script ko least-privilege role/user, git mein secret scanning, budget alarm',
              'GitHub band kar do',
              'Sirf freelancer ko blacklist karo',
              'Har mahine password badlo',
            ],
            answer: 0,
            explain: 'Ek kaam se nahi, layers se bachav: kam power wali chaabi, chaabi code mein nahi, aur kuch ho toh jaldi pata chale.',
          },
        ],
      },

      /* ---------- 8. TERMINAL: containment ---------- */
      (function () {
        const ravi = s => (s.account.users || []).find(u => u.name === 'ravi');
        const TASKS = [
          { text: 'backup-svc ki access keys dhoondo (list-access-keys)', check: s => s.history.some(h => /aws iam list-access-keys.*backup-svc/.test(h)) },
          { text: 'backup-svc ki key turant Inactive karo (update-access-key)', check: s => s.history.some(h => /aws iam update-access-key.*backup-svc.*Inactive/.test(h)) },
          { text: 'backup-svc ko poora hatao — key delete, admin policy detach, user delete', check: s => !(s.account.users || []).some(u => u.name === 'backup-svc') },
          { text: 'ravi se AmazonS3FullAccess hatao (detach-user-policy) — ravi ka kaam group se chalta hai', check: s => !!ravi(s) && !(ravi(s).attachedPolicies || []).includes('AmazonS3FullAccess') },
          { text: 'simulate-principal-policy se confirm: ravi reports padh sakta hai, delete nahi', check: s => s.history.some(h => /aws iam simulate-principal-policy.*user\/ravi/.test(h)) && !!ravi(s) && !(ravi(s).attachedPolicies || []).includes('AmazonS3FullAccess') },
        ];
        return {
          type: 'terminal',
          title: '🖥️ Mission: containment — backdoor hatao, power kam karo',
          instructions: 'In-app simulator — commands bilkul asli AWS CLI syntax mein. <code>help</code> se list.',
          goal: 'Root key delete ho chuki hai. Ab: <b>(1)</b> attacker ka user <code>backup-svc</code> poora hatao — pehle key Inactive, phir key delete, policy detach, user delete (AWS keys/policies ke saath user delete nahi karne deta). <b>(2)</b> Audit mein mila ki <code>ravi</code> par bhi <code>AmazonS3FullAccess</code> laga hai — hatao. <b>(3)</b> <code>simulate-principal-policy</code> se prove karo ki ravi ab sirf reports padh sakta hai.',
          tasks: TASKS,
          account: {
            region: 'ap-south-1',
            callerIdentity: { Account: '123456789012', UserId: 'AIDANEHA', Arn: 'arn:aws:iam::123456789012:user/neha' },
            users: [
              { name: 'neha', attachedPolicies: ['AdministratorAccess'], keys: [] },
              { name: 'ravi', groups: ['developers'], attachedPolicies: ['AmazonS3FullAccess'], keys: [{ id: 'AKIA2RAVIKEY0001', status: 'Active', created: '2026-08-01T09:41:00Z' }] },
              { name: 'backup-svc', attachedPolicies: ['AdministratorAccess'], keys: [{ id: 'AKIA9EVILKEY0042', status: 'Active', created: '2026-10-21T02:09:52Z' }] },
            ],
            groups: [{ name: 'developers', users: ['ravi'], inline: { 'reports-read': { Version: '2012-10-17', Statement: [
              { Effect: 'Allow', Action: 's3:ListBucket', Resource: 'arn:aws:s3:::shopkaro-reports' },
              { Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::shopkaro-reports/*' },
            ] } } }],
          },
          success: AG.allOf(TASKS),
          successText: '🧯 <b>Containment poora.</b> Attacker ke dono raaste band (root key + backdoor user). Ravi ki extra power hati — <code>simulate-principal-policy</code> ne dikhaya: <code>s3:GetObject</code> on reports = <b>allowed</b>, <code>s3:DeleteObject</code> = <b>implicitDeny</b>. Order yaad rakho: <b>key Inactive → investigate → delete → persistence hatao → least privilege → verify</b>.',
          hints: [
            'aws iam list-access-keys --user-name backup-svc',
            'aws iam update-access-key --user-name backup-svc --access-key-id AKIA9EVILKEY0042 --status Inactive',
            'aws iam delete-access-key --user-name backup-svc --access-key-id AKIA9EVILKEY0042 phir aws iam detach-user-policy --user-name backup-svc --policy-arn arn:aws:iam::aws:policy/AdministratorAccess phir aws iam delete-user --user-name backup-svc',
            'aws iam detach-user-policy --user-name ravi --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess',
            'aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::123456789012:user/ravi --action-names s3:GetObject s3:DeleteObject --resource-arns arn:aws:s3:::shopkaro-reports/q3.csv',
          ],
        };
      })(),

      /* ---------- 9. REAL LAB ---------- */
      {
        type: 'docker',
        title: '🐳 Real lab — emulator jo sach mein AccessDenied deta hai',
        project: '02-iam-least-privilege',
        goal: 'IAM-enforcing emulator par: root se admin banao, group + policy se ravi ko sirf reports padhne do, khud AccessDenied dekho, explicit Deny ko <code>s3:*</code> Allow harate dekho, aur role se temporary <code>ASIA…</code> credentials lo.',
        why: 'Dry run ne faisle ka order dikhaya. Yeh lab wahi order asli <code>aws</code> CLI par prove karti hai — har AccessDenied asli policy evaluation se aata hai.',
        steps: [
          { text: 'IAM emulator chalao aur setup (root → admin).', cmd: 'cd aws-gurukul/docker-labs\n./start-moto.sh iam\ncd 02-iam-least-privilege\n./setup.sh\nsource lab-env.sh', expect: '▶ (root jaisa, 1/3) admin user\narn:aws:iam::123456789012:user/admin\n▶ (root jaisa, 2/3) admin ko full policy\n▶ (root jaisa, 3/3) admin ki access key\n✅ admin ready. Ab: source lab-env.sh' },
          { text: 'ex2 — buckets, group, policy, ravi (README ke commands). Phir ravi bano.', cmd: 'aws s3 cp s3://shopkaro-reports/q3.csv - --profile ravi\naws s3 cp q3.csv s3://shopkaro-reports/q4.csv --profile ravi\naws iam list-users --profile ravi', expect: 'q3 sales: 4,12,000\nupload failed: ./q3.csv to s3://shopkaro-reports/q4.csv An error occurred (AccessDenied) when calling the PutObject operation: Access Denied\nAn error occurred (AccessDenied) when calling the ListUsers operation: User: arn:aws:iam::123456789012:user/ravi is not authorized to perform: iam:ListUsers' },
          { text: 'ex3 — galti se s3:* do, phir group par Deny lagao.', cmd: 'aws iam put-user-policy --user-name ravi --policy-name oops-s3-full --policy-document file://policies/oops-s3-full.json\naws iam put-group-policy --group-name developers --policy-name deny-prod-backups --policy-document file://policies/deny-prod-backups.json\naws s3 ls s3://shopkaro-prod-backups/ --profile ravi', expect: 'An error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied' },
          { text: 'ex4 — role assume karo, temporary key dekho, us key se likho aur delete try karo.', cmd: "read -r AK SK ST < <(aws sts assume-role --role-arn arn:aws:iam::123456789012:role/reports-writer --role-session-name ravi-upload --profile ravi --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text)\necho \"temporary key: $AK\"", expect: 'temporary key: ASIARZPUZDIKLLDSVE3Z   (session token: 356 characters)\narn:aws:sts::123456789012:assumed-role/reports-writer/ravi-upload\nupload: ./q3.csv to s3://shopkaro-reports/q4.csv\ndelete failed: ... AccessDenied ... DeleteObject' },
        ],
        observe: {
          q: 'ex4 mein role se mili key <code>ASIA…</code> se shuru hui, jabki ravi ki apni key <code>AKIA…</code> thi. Is farak ka matlab?',
          choices: [
            'ASIA = temporary credentials (session token ke saath, khud expire); AKIA = permanent IAM user key',
            'ASIA = Asia region ki key',
            'ASIA wali key zyada powerful hai',
            'Koi farak nahi, random prefix hai',
          ],
          answer: 0,
          explain: 'Logs/alerts mein key ka prefix dekh ke turant pata chalta hai: permanent key leak hui (bada khatra) ya temporary (umar ghanton mein).',
        },
      },

      /* ---------- 10. EXAM QUIZ ---------- */
      {
        type: 'quiz',
        bonus: true,
        title: '📝 SAA-style quick-fire — IAM',
        questions: [
          {
            q: 'EC2 par ek application ko S3 bucket mein objects likhne hain. MOST secure tareeka?',
            choices: ['IAM role banao jisme s3:PutObject us bucket par, aur EC2 instance profile se attach karo', 'IAM user ki access key application config mein', 'Bucket policy mein Principal "*"', 'Root access key'],
            answer: 0,
            explain: 'Instance profile = temporary credentials. Baaki options permanent keys ya public access.',
          },
          {
            q: 'Company chahti hai ki koi bhi user, admin bhi, CloudTrail band na kar sake. Single account. Kaise?',
            choices: ['IAM policy mein cloudtrail:StopLogging aur DeleteTrail par explicit Deny, sab users/groups par', 'Sirf admins ko batao', 'CloudTrail ka naam chhupa do', 'MFA laga do'],
            answer: 0,
            explain: 'Explicit Deny Allow ko kaat deta hai. Multi-account mein yahi kaam SCP karta hai (aur SCP admin par bhi lagta hai).',
          },
          {
            q: 'Developers khud IAM roles banate hain (Lambda ke liye). Kaise ensure karoge ki developer kisi role ko apne se zyada power na de sake?',
            choices: ['Permissions boundary — developer sirf boundary attach karke hi role bana sake', 'Developers ko IAM se rok do', 'Har role manually review', 'MFA'],
            answer: 0,
            explain: 'Permissions boundary maximum limit hai. Boundary ke bahar ki permission kaam nahi karti.',
          },
          {
            q: 'Auditor (doosri company, apna AWS account) ko tumhare account ke resources read-only dekhne hain. Best?',
            choices: ['Tumhare account mein read-only role, trust policy mein auditor ka account + ExternalId; auditor AssumeRole kare', 'Auditor ke liye IAM user + access key bana ke email karo', 'Root password share', 'Saare resources public'],
            answer: 0,
            explain: 'Cross-account role = koi permanent key share nahi. ExternalId third-party ke case mein confused-deputy rokta hai.',
          },
          {
            q: '200 employees, 15 AWS accounts. Login aur permissions centrally manage karne hain, company ke existing identity provider ke saath.',
            choices: ['IAM Identity Center + permission sets', 'Har account mein 200 IAM users', 'Ek shared admin user', 'Cognito user pool'],
            answer: 0,
            explain: 'Workforce SSO = Identity Center. Cognito app ke customers ke liye hai.',
          },
          {
            q: 'Ek IAM policy mein Allow s3:* hai aur doosri mein Deny s3:DeleteBucket. User DeleteBucket karta hai.',
            choices: ['Denied', 'Allowed', 'Pehli policy ke hisaab se', 'Error'],
            answer: 0,
            explain: 'Explicit Deny wins.',
          },
          {
            q: 'Security team jaanna chahti hai ki kaunse roles/users ke paas permissions hain jo 90 din se use nahi hui.',
            choices: ['IAM Access Analyzer (unused access) / last accessed information', 'CloudWatch metrics', 'AWS Config se EC2 list', 'S3 inventory'],
            answer: 0,
            explain: 'Access Analyzer unused access findings + "last accessed" data se permissions trim karte hain.',
          },
          {
            q: 'Mobile app ke users ko apni-apni S3 folder mein photo upload karni hai, app mein AWS keys rakhe bina.',
            choices: ['Cognito (user pool + identity pool) se temporary credentials, policy mein ${cognito-identity.amazonaws.com:sub} folder', 'App mein ek IAM user ki key', 'Bucket public write', 'Har user ka IAM user'],
            answer: 0,
            explain: 'Customer identity = Cognito. Identity pool har user ko temporary, scoped credentials deta hai.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — IAM & security',
      instructions: 'Security round. Har jawab mein "kyun" aur "blast radius" bolo. 🎤',
      questions: [
        {
          q: '"IAM policy evaluation logic samjhao" — interviewer.',
          choices: [
            'Default deny; agar kahin explicit Deny match ho toh Deny; warna koi Allow match ho toh Allow; kuch match na ho toh implicit deny. Upar se SCP/permission boundary limit lagate hain',
            'Jo policy sabse naya ho woh jeetti hai',
            'Allow hamesha Deny se upar',
            'Admin users par policies nahi lagti',
          ],
          answer: 0,
          explain: 'Order bolo, phir example: "Developer ke paas s3:* hai par prod bucket par Deny hai — Deny jeetega."',
        },
        {
          q: '"EC2 app ke liye access key kyun galat hai, role kyun sahi?"',
          choices: [
            'Key permanent hai — git, logs, laptop se leak hoti hai, rotate manually. Role temporary credentials deta hai (ASIA…), auto-rotate, CloudTrail mein role ke naam se audit',
            'Keys AWS mein kaam nahi karti',
            'Role fast hai',
            'Koi farak nahi',
          ],
          answer: 0,
          explain: 'Blast radius ki baat karo: permanent key ki umar mahine, temporary ki ghante.',
        },
        {
          q: '"Developer ka laptop chori hua, usme access key thi. Pehle 30 minute mein kya karoge?"',
          choices: [
            'Key Inactive/delete → CloudTrail mein us key ke calls → attacker ke banaye users/keys/resources hatao → nayi scoped credentials (ya role) issue',
            'Kuch nahi, laptop encrypted tha',
            'Naya account bana lo',
            'Agle din socho',
          ],
          answer: 0,
          explain: 'Containment pehle, investigation saath mein, persistence hatana mat bhoolna.',
        },
        {
          q: '"IAM user, group aur role mein kab kya?"',
          choices: [
            'User = ek identity with long-term credentials (insaan/legacy tool); group = users par common permissions; role = temporary credentials — apps, cross-account, elevated access',
            'Teeno same hain',
            'Role sirf root ke liye',
            'Group bhi login kar sakta hai',
          ],
          answer: 0,
          explain: 'Bonus: multi-account mein insaanon ke liye Identity Center batao.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: auditor ne bola — <b>(1)</b> saare roles list karo, <b>(2)</b> <code>deploy</code> role ka max session duration dekho, <b>(3)</b> <code>AmazonS3FullAccess</code> policy ka document dekho aur batao kya allow karti hai.',
            tasks: [
              { text: 'aws iam list-roles — saare roles', check: s => s.history.some(h => /aws iam list-roles/.test(h)) },
              { text: 'aws iam get-role --role-name deploy', check: s => s.history.some(h => /aws iam get-role.*deploy/.test(h)) },
              { text: 'aws iam get-policy --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess', check: s => s.history.some(h => /aws iam get-policy.*AmazonS3FullAccess/.test(h)) },
            ],
            account: {
              region: 'ap-south-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAAUDITOR', Arn: 'arn:aws:iam::123456789012:user/auditor' },
              roles: [
                { name: 'deploy', maxSession: 43200, lastUsed: '2026-10-10T12:00:00Z' },
                { name: 'lambda-exec', maxSession: 3600, lastUsed: '2026-10-22T09:00:00Z' },
                { name: 'ec2-ssm', maxSession: 3600, lastUsed: null },
              ],
              policies: [
                { name: 'AmazonS3FullAccess', arn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess', attached: 3, document: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['s3:*', 's3-object-lambda:*'], Resource: '*' }] } },
                { name: 'AmazonS3ReadOnlyAccess', arn: 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess', attached: 5 },
              ],
            },
            success: s => s.history.some(h => /aws iam list-roles/.test(h)) && s.history.some(h => /aws iam get-role.*deploy/.test(h)) && s.history.some(h => /aws iam get-policy.*AmazonS3FullAccess/.test(h)),
            successText: 'Audit findings: <b>deploy</b> role ka max session <b>43,200 s = 12 ghante</b> — CI deploy ke liye 1 ghanta kaafi; lambi session = leak hone par lamba khatra. <b>AmazonS3FullAccess</b> = <code>s3:*</code> on <code>*</code> — har bucket par har action, delete bhi. Teen roles mein se <b>ec2-ssm</b> kabhi use nahi hua (<code>LastUsed: null</code>) — hatane ka candidate.',
            hints: [
              'aws iam list-roles',
              'aws iam get-role --role-name deploy',
              'aws iam get-policy --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess',
            ],
          },
        },
      ],
    },
    success: [
      'Main naye account mein root ko sahi order mein secure kar sakta hoon (MFA, keys delete, admin identity, verify, logout)',
      'Main kisi bhi request ka faisla policy evaluation order se nikaal sakta hoon (explicit Deny → Allow → default deny)',
      'Main least-privilege policy likh sakta hoon — sahi action, sahi bucket/object ARN, zaroorat ho toh condition',
      'Main bata sakta hoon user, group, role kab — aur apps ko role kyun',
      'Main key leak par containment kar sakta hoon: key band, CloudTrail, backdoor hatao, verify',
    ],
    homework: `<p><b>Asli account (optional, free):</b></p>
      <pre>1. IAM → Security recommendations: root MFA ✅, root access keys ❌ (0 hon)
2. IAM → Access Analyzer → analyzer banao (account zone of trust) — findings dekho
3. CloudShell mein:
   aws iam get-account-summary --query "SummaryMap.[AccountMFAEnabled,AccountAccessKeysPresent]"
   aws iam simulate-principal-policy --policy-source-arn $(aws sts get-caller-identity --query Arn --output text) \\
       --action-names s3:DeleteBucket iam:CreateUser --query "EvaluationResults[].[EvalActionName,EvalDecision]" --output table</pre>
      <p>✅ Self-check: <code>AccountMFAEnabled</code> = 1 aur <code>AccountAccessKeysPresent</code> = 0 aaya? (Root identity se simulate nahi chalta — IAM user/role se chalao.)</p>`,
    cards: [
      { front: 'IAM policy evaluation ka order?', back: '1. Default <b>deny</b> 2. Koi <b>explicit Deny</b> match → Deny (final) 3. Koi <b>Allow</b> match → Allow 4. Kuch match nahi → implicit deny.' },
      { front: 'Naye account mein root ke saath kya karna hai?', back: 'MFA lagao → root ki access keys delete → alag admin identity → verify → root logout, credentials taale mein. Root sirf rare kaam ke liye.' },
      { front: 's3:ListBucket aur s3:GetObject ke Resource ARN mein farak?', back: 'ListBucket = <b>bucket</b> ARN <code>arn:aws:s3:::name</code>. GetObject/PutObject = <b>object</b> ARN <code>arn:aws:s3:::name/*</code>.' },
      { front: 'AKIA… vs ASIA… key?', back: '<b>AKIA</b> = permanent IAM user key. <b>ASIA</b> = temporary credentials (role/STS) + session token, khud expire.' },
      { front: 'Role ki do policies kaunsi?', back: '<b>Trust policy</b> = kaun role assume kar sakta hai. <b>Permission policy</b> = role pehen ke kya kar sakte ho.' },
      { front: 'Key leak — containment order?', back: 'Key Inactive/delete → CloudTrail se dekho kya hua → attacker ke users/keys/roles hatao (persistence) → resources saaf/restore → wajah band (no root keys, roles, secret scanning, budget alarm).' },
      { front: 'Developers roles banayein par apne se zyada power na de sakein — kaise?', back: '<b>Permissions boundary</b> — role ki maximum limit. Boundary ke bahar ki permission kaam nahi karti.' },
      { front: 'Doosre account ko access dene ka sahi tareeka?', back: '<b>Cross-account role</b> (trust policy mein unka account, third-party ho toh ExternalId) ya resource-based policy. Keys share kabhi nahi.' },
    ],
  }]);
})();
