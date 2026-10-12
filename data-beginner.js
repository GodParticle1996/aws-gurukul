/* =====================================================================
   AWS Gurukul — Track 1: 🌱 Beginner (Shishya Path)
   Cloud ka pehla word nahi aata? Yahan se shuruaat.
   Naya level add karna ho? Bas is file mein ek aur object,
   ya kahin bhi: AG.registerLevels('beginner', [ {...} ]);
   ===================================================================== */

AG.registerLevels('beginner', [

  /* ================= LEVEL 1: Cloud 101 ================= */
  {
    id: 'cloud101',
    icon: '☁️',
    title: 'Cloud 101 — AWS kya hai, kyun?',
    badge: 'Cloud Samajhdar',
    objectives: [
      'Samjho <b>on-prem vs cloud</b> ka farak — kyun companies cloud par ja rahe hain',
      '<b>Region, Availability Zone (AZ), aur Edge Location</b> ka hierarchy',
      '<b>Shared Responsibility Model</b> — AWS ka kaam, tumhara kaam',
      'Pehli baar <b>aws CLI</b> mein haath — identity check karna',
    ],
    lesson: [
      `<h3>🏚️ On-prem ki kahani, ☁️ cloud ki kahani</h3>
       <p>Socho tumhari startup ek server kharid rahi hai. <b>On-prem</b> (apna
       datacenter) mein kya hota hai:</p>
       <ul>
         <li>📦 Hardware order karo → <b>3-6 hafta</b> delivery wait</li>
         <li>💰 Capacity guess karo — Diwali par traffic 10x aayega toh? Pehle se
             bada server kharido (over-provisioning = paise doobe)</li>
         <li>🔧 Maintenance, AC, power, security — sab tumhara headache</li>
         <li>⚡ Scale karna ho toh nayi machine kharido → phir 3-6 hafta</li>
       </ul>
       <p><b>Cloud (AWS)</b> mein:</p>
       <ul>
         <li>🚀 <b>Minutes</b> mein virtual machine launch (API call bas!)</li>
         <li>💰 <b>Pay-as-you-go</b> — jitna use kiya, utna paisa. Idle = $0</li>
         <li>🔧 AWS hardware, AC, power, security sambhalta hai</li>
         <li>⚡ Scale = aur instances API se add karo (seconds mein)</li>
       </ul>
       <div class="war-story"><b>⚡ Real incident:</b> 2014 mein Netflix ne poora
       on-prem datacenter band karke AWS par shift kiya. Reason? On-prem mein
       Diwali/Black Friday traffic handle karne ke liye saal bhar extra servers
       kharide rakhne padte the. Cloud mein woh sirf <b>2 din ke liye</b> scale
       up karte hain, phir wapas scale down. <b>$ millions bachaye.</b>
       Yehi "elasticity" hai — cloud ka sabse bada superpower.</div>`,
      `<h3>🌍 Geography — Region, AZ, Edge</h3>
       <p>AWS duniya bhar mein data centers chalata hai. 3 shabd yaad rakho:</p>
       <table>
         <tr><th>Shabd</th><th>Matlab</th><th>Example</th></tr>
         <tr><td><b>Region</b></td><td>Geography (country/area) — independent & isolated</td><td><code>us-east-1</code> (N. Virginia), <code>ap-south-1</code> (Mumbai)</td></tr>
         <tr><td><b>Availability Zone (AZ)</b></td><td>Us region ke andar alag data center — alag power, alag flood zone</td><td><code>us-east-1a</code>, <code>us-east-1b</code>, <code>us-east-1c</code></td></tr>
         <tr><td><b>Edge Location</b></td><td>Content cache points (CloudFront CDN) — cities mein</td><td>400+ globally</td></tr>
       </table>
       <p>💡 <b>Key rule:</b> Multi-AZ = survive failure. Ek AZ ki aag lag jaaye
       ya light jaaye, dusra AZ pe app chalegi. Yehi reliability ka foundation hai.</p>
       <div class="war-story"><b>⚡ Real incident:</b> 2017 mein AWS <code>us-east-1</code>
       (N. Virginia) mein S3 ki badi outage hui — ek engineer ne galti se zyada
       servers remove kar diye. <b>Sabse pehle gir gaya:</b> jo apps sirf ek AZ
       mein the. <b>Bacha:</b> jo apps multi-AZ the. Iske baad Netflix, Slack,
       Spotify sab ne multi-AZ banaya. <b>Seekh: ek AZ pe bharosa mat karo.</b></div>`,
      `<h3>🤝 Shared Responsibility — kaun kya sambhalta?</h3>
       <p>Cloud ka sabse important concept interview ke liye. <b>Do tarah ki
       responsibility:</b></p>
       <table>
         <tr><th>AWS ka kaam (cloud OF)</th><th>Tumhara kaam (cloud IN)</th></tr>
         <tr><td>Hardware, datacenter, power, cooling</td><td>Data (kya store kar rahe)</td></tr>
         <tr><td>Region/AZ infrastructure</td><td>IAM (kaun access kar sakta)</td></tr>
         <tr><td>Managed services ka patching (RDS, Lambda...)</td><td>Security groups, firewall rules</td></tr>
         <tr><td>Physical security</td><td>OS patches (EC2 par), app code, encryption keys</td></tr>
       </table>
       <p>💡 Yaad rakho: <b>"Security OF the cloud"</b> = AWS. <b>"Security IN the
       cloud"</b> = tum. EC2 launch kiya? OS ka patch tum lagaoge, AWS nahi.
       S3 mein public bucket banaya? Data leak tumhari galti, AWS nahi.</p>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'On-prem ya Cloud? — kiska kaam',
        instructions: 'Har situation ko sahi bin mein daalo — yeh <b>on-prem</b> mein karna padta tha, ya <b>cloud (AWS)</b> mein easy hai.',
        bins: [
          { id: 'onprem', label: '🏚️ On-prem ka headache' },
          { id: 'cloud', label: '☁️ Cloud ka superpower' },
        ],
        items: [
          { text: 'Nayi machine kharido, 3-6 hafta wait', bin: 'onprem', explain: 'On-prem mein hardware procurement itna slow. Cloud mein minutes mein EC2 launch.' },
          { text: 'Traffic spike par 30 aur instances seconds mein', bin: 'cloud', explain: 'Elasticity! Auto Scaling group se API call = naye instances. On-prem mein impossible itna fast.' },
          { text: 'Hardware ka AC, power, physical security', bin: 'onprem', explain: 'On-prem mein yeh sab tumhara. Cloud mein AWS sambhalta — "security OF the cloud".' },
          { text: 'Sirf 2 din ke liye 100x capacity, phir wapas kam', bin: 'cloud', explain: 'Pay-as-you-go + elasticity. Diwali sale ke 2 din scale up, baith ke scale down. On-prem mein saal bhar khareedna padta.' },
          { text: 'OS ka patching (EC2 instance par)', bin: 'onprem', explain: 'Trick! Cloud mein bhi EC2 ka OS patch tumhara kaam — "security IN the cloud". (Managed services jaise RDS ka patching AWS karta.)' },
          { text: 'Datacenter ki building ka rent', bin: 'onprem', explain: 'On-prem mein real estate cost. Cloud mein $0 — AWS ka headache.' },
        ],
      },
      {
        type: 'match',
        title: 'AWS Geography — naam milao',
        instructions: 'Har term ko uske matlab se milao.',
        pairs: [
          { left: 'Region', right: 'Geography (country/area) — e.g. ap-south-1 (Mumbai)', explain: 'Regions independent hote hain — us-east-1 ka outage ka asar ap-south-1 par nahi.' },
          { left: 'Availability Zone (AZ)', right: 'Region ke andar alag data center — e.g. us-east-1a', explain: 'Har AZ ka alag power grid, alag flood zone. Multi-AZ = survive failure.' },
          { left: 'Edge Location', right: 'Content cache points (CloudFront CDN) — 400+ globally', explain: 'User ko nearest edge se content milta hai = fast. CloudFront level mein milega.' },
          { left: 'us-east-1', right: 'N. Virginia region (sabse purana, sabse services)', explain: 'AWS ki default region. Naye services pehle yahan aate hain. Mumbai = ap-south-1.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Pehla Mission: Identity Check',
        instructions: 'Tumhara pehla <b>aws CLI</b> terminal! Mock AWS account explore karo — commands type karke (help se list milegi).',
        goal: 'Apni AWS identity verify karo: <b>(1)</b> kaun ho tum? <code>aws sts get-caller-identity</code> chalao. <b>(2)</b> kis region mein ho? <code>aws configure get region</code> chalao. <b>(3)</b> S3 buckets ki list dekho (koi bucket hai kya).',
        tasks: [
          { text: 'aws sts get-caller-identity — kaun ho tum', check: s => s.history.some(h => /aws sts get-caller-identity/.test(h)) },
          { text: 'aws configure get region — kis region mein', check: s => s.history.some(h => /aws configure get region/.test(h)) },
          { text: 'aws s3 ls — buckets ki list', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/shishya' },
          buckets: [
            { name: 'my-first-bucket-2024', region: 'us-east-1', creationDate: '2024-03-10 10:20:00', objects: [] },
          ],
        },
        success: s => [
          /aws sts get-caller-identity/.test(s.history.join(' ')),
          /aws configure get region/.test(s.history.join(' ')),
          /aws s3 ls\b/.test(s.history.join(' ')),
        ].every(Boolean),
        successText: 'Teeno commands chal gayi! Notice kiya? <code>sts get-caller-identity</code> ne tumhara <b>ARN</b> (Amazon Resource Name) dikhaya — yeh tumhari poori identity hai. <code>configure get region</code> ne us-east-1 bataya. Aur <code>s3 ls</code> ne ek bucket dikha. Yeh teen commands tumhari AWS journey ke first tools hain — har level mein use karoge.',
        hints: [
          'Shuru karo: aws sts get-caller-identity',
          'Region dekho: aws configure get region',
          'Buckets dekho: aws s3 ls',
        ],
      },
      {
        type: 'quiz',
        bonus: true,
        title: 'Good to Know — Cloud trivia',
        questions: [
          {
            q: 'Tumne EC2 launch kiya but OS ka security patch lagana bhool gaye. Hack ho gaya. Kiski galti?',
            choices: [
              'Tumhari — OS patching "security IN the cloud" hai, AWS ka kaam nahi',
              'AWS ki — unhone vulnerable OS diya',
              'Dono ki — shared responsibility matlab dono blame',
              'Kisi ki nahi — cloud mein hacking nahi hota 🙈',
            ],
            answer: 0,
            explain: 'Shared Responsibility! EC2 mein OS tumhara hai. RDS jaisa managed service hota toh AWS patch karta. Interview mein yeh classic sawal poochte hain.',
          },
          {
            q: 'Tumhari app sirf us-east-1a (ek AZ) mein hai. us-east-1a down ho gaya. Kya hoga?',
            choices: [
              'App down — ek AZ pe bharosa kiya, multi-AZ nahi banaya',
              'App chalegi — AWS automatic failover karta hai',
              'AWS tumhe refund dega',
              'Kuch nahi — regions independent hote hain',
            ],
            answer: 0,
            explain: 'AWS single-AZ apps ko automatically multi-AZ nahi banata — tumhe design karna padta hai (ALB + ASG multi-AZ). Yehi "shared responsibility" hai.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Cloud Basics',
      instructions: 'Pehla mock interview! Cloud ka basics clear karo. 🎤',
      questions: [
        {
          q: 'Manager poochta hai: "Hum on-prem se cloud kyun migrate karein?" Sabse strong business reason?',
          choices: [
            'Elasticity + pay-as-you-go — traffic spike par seconds mein scale, idle par $0. CapEx (kharidna) → OpEx (use karna)',
              'Cloud naya hai isliye better',
              'AWS ke employees zyada smart hain',
              'Cloud mein hacking nahi hota',
            ],
            answer: 0,
            explain: 'CapEx (capital expenditure — ek baar bada paisa) → OpEx (operational — jitna use utna paisa). Aur elasticity = peak load handle bina over-provisioning ke. Yehi business case hai.',
        },
        {
          q: 'Interviewer: "Shared Responsibility Model batao" — ek line mein sahi summary?',
          choices: [
            'AWS sambhalta "security OF the cloud" (hardware, datacenter, managed services), tum sambhalte "security IN the cloud" (data, IAM, OS patches, config)',
            'AWS sab sambhalti hai, tumhe kuch nahi karna',
            'Tum sab sambhalte ho, AWS sirf billing karti hai',
            'Dono milke har cheez sambhalte hain — koi clear division nahi',
          ],
          answer: 0,
          explain: 'OF vs IN — yehi mantra. EC2 diya AWS, OS patch tum. S3 diya AWS, bucket public kiya tum → leak tumhari galti. Interview mein yeh line bolo toh plus points.',
        },
        {
          q: 'Scenario: tum Mumbai (ap-south-1) mein app deploy kar rahe ho. Users US aur Europe mein hain. Problem kya ho sakti hai?',
          choices: [
            'Latency — US/Europe users ko Mumbai se data aane mein time lagega. Solution: CloudFront CDN ya multi-region deploy',
            'Koi problem nahi — internet fast hai',
            'Mumbai region mein sirf Indian apps chalti hain',
            'AWS extra charge karega international users ke liye',
          ],
          answer: 0,
          explain: 'Latency = distance × speed of light. Mumbai se US ~200ms round trip. CloudFront edge locations users ke paas cache rakhte hain. Ya global app ho toh multi-region + Route 53 latency routing.',
        },
      ],
    },
    success: [
      'Main bata sakta hoon ki on-prem vs cloud mein kya farak hai aur elasticity kyun game-changer hai',
      'Main Region, AZ, Edge Location ka hierarchy aur kyun multi-AZ important hai samjhta hoon',
      'Main Shared Responsibility Model (OF vs IN) explain kar sakta hoon',
      'Main aws CLI ka basic use kar sakta hoon (sts, configure, s3 ls)',
    ],
    homework: `<p>AWS Free Tier mein account banao aur console explore karo:</p>
      <pre># AWS console: https://console.aws.amazon.com
# (Free Tier — credit card chahiye but $0 for 12 months basics)

# Region selector (top right) → Mumbai (ap-south-1) chuno
# Services menu → EC2, S3, IAM dekho (sirf dekho, launch mat karo ab)</pre>
      <p>✅ Self-check: Console mein Region change kar paaye? IAM dashboard mein "Root user" warning dikhi? (Haan — yeh tumhe root ko band karne ke liye remind karta hai, next level!)</p>`,
    cards: [
      { front: 'Cloud ka sabse bada superpower (on-prem nahi de sakta)?', back: '<b>Elasticity</b> — traffic spike par seconds mein scale up, kam hone par scale down. Pay-as-you-go. On-prem mein hardware kharidne mein 3-6 hafta.' },
      { front: 'Region vs AZ vs Edge Location?', back: '<b>Region</b> = geography (ap-south-1). <b>AZ</b> = us region ke andar alag data center (us-east-1a). <b>Edge</b> = CDN cache points (CloudFront). Multi-AZ = survive failure.' },
      { front: 'Shared Responsibility Model — ek line mein?', back: 'AWS: "security OF the cloud" (hardware, datacenter, managed services patching). Tum: "security IN the cloud" (data, IAM, OS patches EC2 par, config).' },
      { front: 'Ek AZ down, sirf single-AZ app tha. Kya hoga?', back: 'App <b>down</b>. AWS automatic multi-AZ failover nahi karta — tumhe design karna padta hai (ALB + ASG multi-AZ). 2017 S3 outage ne yeh sikhaaya.' },
    ],
  },

  /* ================= LEVEL 2: IAM ================= */
  {
    id: 'iam',
    icon: '🔐',
    title: 'IAM — Kaun kya kar sakta hai',
    badge: 'IAM Insafdaar',
    objectives: [
      '<b>Root user</b> kya hai aur kyun daily use nahi karna chahiye',
      '<b>Users, Groups, Roles, Policies</b> — 4 shabd, 4 roles',
      '<b>Least privilege</b> principle — sirf utna power jitna zaroori',
      'Policy JSON padhna aur <code>aws iam</code> commands se verify karna',
    ],
    lesson: [
      `<h3>👑 Root user — taaj pehn ke mat ghoomo</h3>
       <p>Jab tum AWS account banate ho, ek <b>root user</b> milta hai — sabse
       zyada power wala. Yeh sab kuch kar sakta hai — billing, account delete,
       sab kuch. <b>Problem:</b> root compromise = poora account gaya.</p>
       <p>❌ <b>Galti:</b> root se daily kaam karna (EC2 launch, S3 dekhna).
       ✅ <b>Sahi:</b> root se sirf billing setup + MFA on karo, phir
       <b>admin user</b> banao (IAM mein) aur usse daily kaam karo.</p>
       <div class="war-story"><b>⚡ Real incident:</b> 2017 mein Code Spaces
       (ek DevOps company) ka AWS root account hack ho gaya. Hacker ne
       <b>poora account delete kar diya</b> — saari customer data, code,
       backups. Company <b>raat overnight band ho gayi</b>. Root ka password
       + MFA nahi tha. Yehi seekh: <b>root ko lock karo, MFA on karo, daily
       use mat karo.</b></div>`,
      `<h3>👥 IAM ke 4 shabd — Users, Groups, Roles, Policies</h3>
       <table>
         <tr><th>Shabd</th><th>Analogy</th><th>Kaam</th></tr>
         <tr><td>👤 <b>User</b></td><td>Ek insaan</td><td>1 person ka identity (e.g. <code>ravi</code>) — long-term credentials</td></tr>
         <tr><td>👥 <b>Group</b></td><td>Department</td><td>Users ka dabba — ek policy lagaate ho, sab ko milta (e.g. <code>Developers</code>)</td></tr>
         <tr><td>🎭 <b>Role</b></td><td>Temporary badge</td><td>Short-term power — EC2 ko S3 access chahiye? Role lagao. Apps roles use karte hain</td></tr>
         <tr><td>📜 <b>Policy</b></td><td>Rule book</td><td>JSON document — <b>"kaun kya kar sakta hai"</b>. User/Group/Role par lagti</td></tr>
       </table>
       <p>💡 <b>Role vs User ka farak:</b> User = insaan (long-term key). Role =
       temporary (apps, cross-account, STS token). Apps hamesha <b>role</b>
       use karte hain, kabhi hard-coded keys nahi!</p>`,
      `<h3>📜 Policy JSON — asli rule book</h3>
       <p>Policy ek JSON document hai. 4 hisse:</p>
       <pre>{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",            ← Allow ya Deny
    "Action": "s3:GetObject",     ← kya kar sakta (s3:Get* = saari get)
    "Resource": "arn:aws:s3:::my-bucket/*"   ← kis par
  }]
}</pre>
       <p><b>Least privilege</b> = sirf utna allow jitna zaroori. <code>s3:*</code>
       (sab) mat likho agar sirf read chahiye — <code>s3:GetObject</code> likho.
       <code>Resource: "*"</code> (sab buckets) mat likho — specific bucket ARN do.</p>
       <div class="war-story"><b>⚡ Real incident:</b> 2019 mein ek SaaS company
       ne developer ko <code>AdministratorAccess</code> policy di (sab power).
       Uska laptop chala gaya. Hacker ne uss account se <b>poora production
       RDS delete</b> kar diya. Recovery: 6 ghante downtime. Seekh: <b>least
       privilege</b> — developer ko sirf dev environment ka access, prod ka
       nahi. 2 days tak lawsuit chala.</div>`,
    ],
    stages: [
      {
        type: 'order',
        title: 'Root ko lock karo — sahi sequence',
        instructions: 'Naya AWS account banaya. Root ko secure karne ke steps sahi order mein lagao.',
        steps: [
          { text: 'Root se login karke MFA (multi-factor auth) on karo', explain: 'Pehla kaam — root ka password + MFA. Bina MFA ke root = death wish.' },
          { text: 'IAM mein ek admin user banao (root nahi)', explain: 'Daily use ke liye admin user. Root ka use sirf billing/account-level kaam.' },
          { text: 'Admin user ko Access Key banao (ya console password)', explain: 'CLI ke liye access key. Console ke liye password. MFA bhi is par lagao.' },
          { text: 'Root ki access key delete karo (agar bani hai)', explain: 'Root ki access key = sabse bada risk. AWS recommend: root ki key na ho.' },
          { text: 'Root se logout, ab admin user se kaam karo', explain: 'Root ko lock karke chhodo. Daily kaam admin se. Interview mein yeh sequence bolo!' },
        ],
      },
      {
        type: 'bins',
        title: 'User, Group, Role, ya Policy?',
        instructions: 'Har scenario ko sahi IAM entity bin mein daalo.',
        bins: [
          { id: 'user', label: '👤 User' },
          { id: 'group', label: '👥 Group' },
          { id: 'role', label: '🎭 Role' },
          { id: 'policy', label: '📜 Policy' },
        ],
        items: [
          { text: 'Ravi naam ka developer, console login karega', bin: 'user', explain: '1 insaan = 1 user. Ravi apna user, apna password.' },
          { text: '10 developers ko ek saath S3 read access dena', bin: 'group', explain: 'Group "Developers" banao, policy lagao, 10 users ko add karo. Ek policy, 10 log.' },
          { text: 'EC2 instance ko S3 se files read karni hain', bin: 'role', explain: 'Apps roles use karte — temporary power. Hard-coded key NEVER.' },
          { text: '"Allow s3:GetObject on bucket X" — JSON rule', bin: 'policy', explain: 'Policy = rule book. JSON mein Effect/Action/Resource.' },
          { text: 'Lambda function ko DynamoDB write karne ki permission', bin: 'role', explain: 'Role Lambda pe lagta — execution role. Apps = roles, not users.' },
          { text: '"Developers team ke saare log" ka dabba', bin: 'group', explain: 'Group = users ka collection. Ek policy lagaate, sab ko milta.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: IAM Detective',
        instructions: 'Mock AWS account mein <b>over-privileged user</b> dhundo! Ek developer ko AdminAccess mila hai — galat hai.',
        goal: 'IAM audit: <b>(1)</b> saare users list karo. <b>(2)</b> <code>ravi</code> user ki attached policies dekho. <b>(3)</b> Agar AdminAccess hai, toh galat policy file apply karke hatao (<code>ls</code> se files dekho).',
        tasks: [
          { text: 'aws iam list-users — users list', check: s => s.history.some(h => /aws iam list-users/.test(h)) },
          { text: 'aws iam list-attached-user-policies --user-name ravi', check: s => s.history.some(h => /aws iam list-attached-user-policies.*ravi/.test(h)) },
          { text: 'Galat policy hatao (file apply karo)', check: s => s.account.users && s.account.users.find(u => u.name === 'ravi') && (!s.account.users.find(u => u.name === 'ravi').attachedPolicies || !s.account.users.find(u => u.name === 'ravi').attachedPolicies.includes('AdministratorAccess')) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          users: [
            { name: 'admin', attachedPolicies: ['AdministratorAccess'] },
            { name: 'ravi', attachedPolicies: ['AdministratorAccess'] },
            { name: 'priya', attachedPolicies: ['AmazonS3ReadOnlyAccess'] },
          ],
          buckets: [],
        },
        files: {
          'fix-ravi-policy.json': {
            desc: 'ravi se AdminAccess hata kar S3ReadOnly deta hai',
            apply: s => {
              const u = s.account.users.find(x => x.name === 'ravi');
              if (u) u.attachedPolicies = ['AmazonS3ReadOnlyAccess'];
              return 'User ravi updated — AdministratorAccess removed, AmazonS3ReadOnlyAccess attached. (Least privilege restored ✓)';
            },
          },
          'fix-nothing.json': {
            desc: 'Kuch nahi karta (galat fix)',
            apply: () => 'File applied — but nothing changed. (Yeh fix nahi hai!)',
          },
        },
        success: s => s.account.users && s.account.users.find(u => u.name === 'ravi') && !(s.account.users.find(u => u.name === 'ravi').attachedPolicies || []).includes('AdministratorAccess'),
        successText: 'Mila! <b>ravi</b> developer ko <b>AdministratorAccess</b> mila tha — production RDS delete kar sakta tha. Fix: least privilege — sirf <code>S3ReadOnlyAccess</code>. Pro-tip: production mein IAM Access Analyzer use karo — over-privileged users automatically dikhata hai.',
        hints: [
          'aws iam list-users — kaun-kaun se users hain',
          'aws iam list-attached-user-policies --user-name ravi — kya policies hain',
          'ls se files dekho, sahi wali apply karo (apply -f fix-ravi-policy.json)',
        ],
      },
      {
        type: 'fill',
        title: 'IAM policy khud likho',
        instructions: 'Least-privilege policy: EC2 par chalti app ko sirf "reports" bucket se files padhni hain. Tokens ko sahi blank mein drag karo.',
        template: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "{0}",
      "Action": "{1}",
      "Resource": "arn:aws:s3:::reports/{2}"
    }
  ]
}

# App ko yeh policy kaise milegi? Access key EC2 par MAT daalo —
# ek {3} banao aur EC2 instance se attach kar do.`,
        tokens: ['Allow', 's3:GetObject', '*', 'IAM role', 'Deny', 's3:*', 'IAM user', 'access key'],
        blanks: [
          { answer: 'Allow', explain: 'IAM policy default se sab kuch <b>deny</b> hai — jo chahiye woh explicitly Allow karo. (Explicit Deny sabse upar jeetta hai, par yahan hume dena hai.)' },
          { answer: 's3:GetObject', explain: 'Sirf padhna hai = <code>s3:GetObject</code>. <code>s3:*</code> likh dete toh delete/put ki power bhi mil jaati — least privilege ka ulta.' },
          { answer: '*', explain: 'Bucket ke <b>andar ke objects</b> ka ARN <code>arn:aws:s3:::reports/*</code> hota hai. Bucket khud <code>arn:aws:s3:::reports</code> hai (bina slash) — ListBucket ke liye woh chahiye hota hai.' },
          { answer: 'IAM role', explain: 'EC2 par hamesha <b>role</b> — temporary STS credentials, apne aap rotate hote hain, CloudTrail mein audit. Access key file/env mein rakhna hi woh galti hai jo leaks banati hai.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Policy JSON padho',
        questions: [
          {
            q: 'Yeh policy kya allow karti hai?',
            context: '{\n  "Version": "2012-10-17",\n  "Statement": [{\n    "Effect": "Allow",\n    "Action": "s3:GetObject",\n    "Resource": "arn:aws:s3:::photos/*"\n  }]\n}',
            choices: [
              'Sirf "photos" bucket se files read (download) kar sakte ho — aur kuch nahi',
              'Photos bucket mein sab kuch kar sakte ho (read, write, delete)',
              'Saare buckets se files read kar sakte ho',
              'Kuch nahi kar sakte — Effect Allow galat hai',
            ],
            answer: 0,
            explain: 's3:GetObject = sirf read. Resource specific = sirf "photos" bucket. Yehi least privilege — sirf utna jitna zaroori.',
          },
          {
            q: 'EC2 app ko S3 se file read karni hai. Best practice?',
            choices: [
              'EC2 pe role lagao jisme S3 read policy ho — app role assume kare, hard-coded key nahi',
              'AWS access key EC2 ke env var mein daal do',
              'Bucket public kar do — sab read kar sake',
              'Root user ka key EC2 pe daal do',
            ],
            answer: 0,
            explain: 'Hard-coded keys = GALT. Role = temporary STS token, automatic rotation, audit trail. Yehi IAM ka golden rule.',
          },
          {
            q: 'Scenario: 20 developers hain, sabko S3 read chahiye. Sabse efficient tarika?',
            choices: [
              'Group "Developers" banao, S3 read policy lagao, 20 users ko add karo — ek policy, 20 log',
              '20 users banao, har ek pe individually S3 policy lagao',
              'Ek admin user banao, sab use karein (share karein)',
              'Bucket public kar do — sab access karein',
            ],
            answer: 0,
            explain: 'Group = scalability. Naya developer aaye? Group mein add karo, policy automatically milta. 20 baar lagane se behtar.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — IAM & Security',
      instructions: 'Security round — IAM clarity dikhao. 🎤',
      questions: [
        {
          q: '"IAM mein least privilege kya hai?" — interviewer. Sahi jawab?',
          choices: [
            'Sirf utna power do jitna kaam ke liye zaroori — na zyada, na kam. S3 read chahiye toh s3:* nahi, s3:GetObject do',
            'Sab users ko AdminAccess do — easy',
            'Sab kuch deny kar do — sabse safe',
            'Root user sab use kare — ek hi account',
          ],
          answer: 0,
            explain: 'Least privilege = SAA exam ki atma. Over-permission = breach risk. IAM Access Analyzer se over-privileged find karte hain.',
        },
        {
          q: 'Interviewer: "EC2 app ko S3 access chahiye. Hard-coded key kyun galat hai?"',
          choices: [
            'Key leak ho sakti (code repo, logs), rotate nahi hoti automatic, audit mushkil. Role = temporary STS token, auto-rotate, audit trail',
            'Hard-coded keys AWS mein kaam nahi karti',
            'Keys slow hoti hain, roles fast',
            'Koi farak nahi — dono same hain',
          ],
          answer: 0,
          explain: 'Classic! Keys git mein commit ho jaati, logs mein print, laptop chala jaaye. Role = no permanent credential, STS temporary token, CloudTrail audit. Always roles.',
        },
        {
          q: 'Scenario: ek developer ka laptop chala gaya, usme AWS access key thi. Kya karoge?',
          choices: [
            'Turant key deactivate/delete karo → CloudTrail mein uss key ke calls check karo → breach hai toh resources clean karo → naya key/role issue karo',
            'Kuch nahi — key toh encrypted thi',
            'AWS ko call karke account lock karo',
            'Naya account bana lo, purana chhodo',
          ],
          answer: 0,
          explain: 'Incident response: key revoke → audit (kya kiya uss key ne) → clean → rotate. Yeh security incident ka flow hai. Time matters!',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: External auditor IAM verify karne bola. <b>(1)</b> Saare roles list karo. <b>(2)</b> <code>deploy</code> role ka detail dekho (max session duration). <b>(3)</b> <code>S3FullAccess</code> policy document dekho — kya allow karti hai?',
            tasks: [
              { text: 'aws iam list-roles — saare roles', check: s => s.history.some(h => /aws iam list-roles/.test(h)) },
              { text: 'aws iam get-role --role-name deploy — role detail', check: s => s.history.some(h => /aws iam get-role.*deploy/.test(h)) },
              { text: 'aws iam get-policy --policy-arn arn:aws:iam::aws:policy/S3FullAccess — policy document', check: s => s.history.some(h => /aws iam get-policy.*S3FullAccess/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              roles: [
                { name: 'deploy', maxSession: 28800, lastUsed: '2024-07-10T12:00:00Z' },
                { name: 'lambda-exec', maxSession: 3600, lastUsed: '2024-07-15T09:00:00Z' },
                { name: 'ec2-ssm', maxSession: 3600, lastUsed: null },
              ],
              policies: [
                { name: 'S3FullAccess', arn: 'arn:aws:iam::aws:policy/S3FullAccess', attached: 3, document: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 's3:*', Resource: '*' }] } },
                { name: 'AmazonS3ReadOnlyAccess', arn: 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess', attached: 5 },
              ],
              users: [],
              buckets: [],
            },
            success: s => s.history.some(h => /aws iam list-roles/.test(h)) && s.history.some(h => /aws iam get-role.*deploy/.test(h)) && s.history.some(h => /aws iam get-policy.*S3FullAccess/.test(h)),
            successText: 'Audit complete! 📋 Findings: <b>deploy</b> role ka max session <b>28800s (8 hours)</b> — too long for security best practice (recommend 1hr). <b>S3FullAccess</b> policy allows <code>s3:*</code> on <code>Resource: "*"</code> — ALL buckets, ALL operations. Least privilege violation! Recommend: replace with specific bucket ARN + only needed actions (s3:GetObject, s3:PutObject). Yehi real IAM audit ka flow hai — list, inspect, flag risks.',
            hints: [
              'aws iam list-roles — saare roles dekho',
              'aws iam get-role --role-name deploy — max session duration check karo',
              'aws iam get-policy --policy-arn arn:aws:iam::aws:policy/S3FullAccess — policy document dekho',
            ],
          },
        },
      ],
    },
    success: [
      'Main root user ko secure karne ke steps bata sakta hoon (MFA, admin user, root lock)',
      'Main User, Group, Role, Policy ka farak aur kab kya use karna hai samjhta hoon',
      'Main least privilege principle explain kar sakta hoon aur Policy JSON padh sakta hoon',
      'Main aws iam commands se users aur policies audit kar sakta hoon',
    ],
    homework: `<p>Apne AWS account mein IAM setup karo (Free Tier):</p>
      <pre># Console → IAM → Users → "Add user"
# 1. admin user banao, console access + MFA on
# 2. root se logout, admin se login
# 3. Root ki access key (agar bani) delete karo
# 4. IAM → "Access analyzer" on karo</pre>
      <p>✅ Self-check: <code>aws iam list-users</code> mein admin user dikha? Root ki access key nahi hai? MFA on hai?</p>`,
    cards: [
      { front: 'Root user ko kaise secure karte hain?', back: '1) <b>MFA on</b> 2) <b>Admin user banao</b>, root sirf billing/account 3) <b>Root ki access key delete</b> 4) Daily use <b>admin se</b>. Code Spaces ki tarah root hack = account gone.' },
      { front: 'User vs Group vs Role vs Policy?', back: '<b>User</b> = 1 insaan. <b>Group</b> = users ka dabba (ek policy, sab). <b>Role</b> = temporary power (apps, cross-account). <b>Policy</b> = JSON rule (Effect/Action/Resource).' },
      { front: 'Least privilege kya hai?', back: 'Sirf utna power jitna zaroori. <code>s3:GetObject</code> chahiye toh <code>s3:*</code> mat do. <code>Resource: "*"</code> mat likho, specific ARN do. Over-permission = breach risk.' },
      { front: 'EC2 app ko S3 access — key ya role?', back: '<b>Hamesha role</b>, hard-coded key NEVER. Role = temporary STS token, auto-rotate, CloudTrail audit. Key = git commit, logs, laptop chala jaaye.' },
      { front: 'IAM Access Analyzer ka kaam?', back: 'Over-privileged users/resources automatically dikhata — kaun broader-than-expected access de raha. Production security audit ka tool.' },
    ],
  },

  /* ================= LEVEL 3: EC2 ================= */
  {
    id: 'ec2',
    icon: '🖥️',
    title: 'EC2 — Virtual Machine AWS par',
    badge: 'Instance Nawab',
    objectives: [
      'EC2 instance kya hai — <b>AMI, instance type, key pair</b> ke 3 pillars',
      '<b>EBS volume</b> — persistent storage, instance mara toh bhi rehta',
      '<b>Security Group</b> — stateful firewall, allow rules, deny default',
      'aws ec2 commands se instances explore karna',
    ],
    lesson: [
      `<h3>🖥️ EC2 = tumhari virtual machine AWS par</h3>
       <p>EC2 (Elastic Compute Cloud) = AWS ka IaaS. Tum virtual machine
       chalate ho — OS, app, jo bhi. 3 cheezein chunte ho:</p>
       <table>
         <tr><th>Choice</th><th>Matlab</th><th>Examples</th></tr>
         <tr><td>🖼️ <b>AMI</b> (Amazon Machine Image)</td><td>OS + software ka image</td><td>Amazon Linux 2, Ubuntu, Windows, ya apni custom AMI</td></tr>
         <tr><td>📊 <b>Instance type</b></td><td>CPU + RAM size</td><td><code>t2.micro</code> (1 vCPU, 1GB — Free Tier), <code>m5.large</code> (2 vCPU, 8GB)</td></tr>
         <tr><td>🔑 <b>Key pair</b></td><td>SSH access ke liye</td><td>.pem file — private key tumhare paas, public AWS par</td></tr>
       </table>
       <p>💡 <b>Instance type naming:</b> <code>t2.micro</code> — <code>t</code>
       = family (burstable), <code>2</code> = generation, <code>micro</code> =
       size. <code>m5</code>, <code>c5</code> (compute), <code>r5</code> (RAM),
       <code>g4</code> (GPU).</p>`,
      `<h3>💾 EBS Volume — disk jo rehta hai</h3>
       <p>EC2 ka disk = <b>EBS (Elastic Block Store)</b>. Yeh instance se
       alag hota hai — instance terminate karo, EBS rehta. Photos, DB, files
       yahan safe.</p>
       <ul>
         <li><b>Volume</b> = ek virtual disk (8GB, 100GB...)</li>
         <li><b>Snapshot</b> = EBS ka backup (S3 par, incremental)</li>
         <li><b>Types:</b> gp3 (general SSD), io2 (high IOPS DB), st1 (HDD)</li>
       </ul>
       <div class="war-story"><b>⚡ Real incident:</b> Ek startup ne EC2 pe
       MySQL chalaya, data EBS par. Team ne <b>"Delete on termination"</b>
       flag ON rakh diya galti se. Instance terminate kiya → EBS bhi gaya →
       <b>3 mahine ka customer data gone</b>. Backup? Nahin banaya tha.
       Seekh: <b>critical data ka snapshot</b> + <b>"Delete on termination"
       OFF</b> for prod.</div>`,
      `<h3>🛡️ Security Group — stateful firewall</h3>
       <p>Security Group (SG) = EC2 ka firewall. Rules:</p>
       <ul>
         <li>✅ <b>Sirf ALLOW rules</b> — deny nahi likhna padta (default deny)</li>
         <li>🔄 <b>Stateful:</b> outbound request ka inbound reply automatic allow</li>
         <li>🌐 <b>Inbound:</b> port 22 (SSH), 80 (HTTP), 443 (HTTPS) allow karo</li>
         <li>📤 <b>Outbound:</b> default sab allow (internet, APIs...)</li>
       </ul>
       <pre># Example: web server SG
Inbound:  TCP 80  from 0.0.0.0/0    ← HTTP internet se
Inbound:  TCP 443 from 0.0.0.0/0    ← HTTPS
Inbound:  TCP 22  from 10.0.0.0/16  ← SSH sirf internal (public nahi!)
Outbound: All  All              ← default allow</pre>
       <div class="war-story"><b>⚡ Real incident:</b> Ek company ne EC2 pe
       <b>SSH (port 22) ko 0.0.0.0/0</b> (sab internet) khula chhoda. Bot
       ne brute-force karke password tod diya → crypto-miner install →
       <b>$50k ka EC2 bill</b> ek hafte mein. Seekh: <b>SSH sirf internal/
       trusted IP se</b>, public 0.0.0.0/0 mat karo. Better: <b>SSM Session
       Manager</b> use karo (no SSH, no key).</div>`,
    ],
    stages: [
      {
        type: 'match',
        title: 'EC2 ke 3 pillars — naam milao',
        instructions: 'Har EC2 concept ko uske matlab se milao.',
        pairs: [
          { left: 'AMI', right: 'OS + software ka image (Amazon Linux, Ubuntu, ya custom)', explain: 'Apni app install karke custom AMI bana sakte ho — phir usse naye instances fast launch.' },
          { left: 'Instance type', right: 'CPU + RAM size (t2.micro, m5.large, c5.2xlarge)', explain: 't=burstable, m=general, c=compute, r=RAM, g=GPU. Free Tier = t2.micro/t3.micro.' },
          { left: 'Key pair', right: 'SSH access — .pem private key tumhare paas', explain: 'Public key AWS par, private tumhare paas. Better: SSM Session Manager (no key needed).' },
          { left: 'EBS volume', right: 'Persistent disk — instance mara toh bhi rehta', explain: 'Snapshot backup. "Delete on termination" OFF for prod data!' },
          { left: 'Security Group', right: 'Stateful firewall — allow rules, deny default', explain: 'Inbound rules likhne padte, outbound default allow. SSH ko public mat kholo.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'EC2 Diagram Detective',
        instructions: 'Diagram ke sahi component par <b>click</b> karo.',
        visual: 'ec2',
        questions: [
          { q: 'OS + software ka image (launch ke time chunte ho) — kya hai?', target: 'ami', explain: 'AMI = Amazon Machine Image. Ubuntu, Amazon Linux, ya custom (apni app pre-installed).' },
          { q: 'CPU + RAM ka size — kya hai?', target: 'type', explain: 'Instance type. t2.micro = 1 vCPU 1GB (Free Tier). c5 = compute heavy, r5 = RAM heavy.' },
          { q: 'SSH ke liye .pem file — kya hai?', target: 'keypair', explain: 'Key pair. Private key tumhare paas, public AWS par. SSM Session Manager better (no key).' },
          { q: 'Persistent disk jo instance mara toh bhi rehta?', target: 'ebs', explain: 'EBS volume. Snapshot backup zaroori. "Delete on termination" prod pe OFF.' },
          { q: 'Stateful firewall — allow rules, deny default?', target: 'sg', explain: 'Security Group. Inbound rules likhne padte. SSH 0.0.0.0/0 mat kholo!' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: EC2 Explorer',
        instructions: 'Mock AWS account mein EC2 resources explore karo. <b>(1)</b> Instances list karo. <b>(2)</b> Kis instance pe web app hai (tag:Name dekh ke)? <b>(3)</b> Us instance ki security group check karo — kya SSH public khula hai?',
        goal: 'EC2 inventory banao: <b>(1)</b> <code>aws ec2 describe-instances</code> — kaun si instances chal rahi hain, kis AZ mein, public IP hai ya nahi. <b>(2)</b> <code>aws ec2 describe-security-groups</code> — firewall rules dekho, koi port 22 par <code>0.0.0.0/0</code> toh nahi?',
        tasks: [
          { text: 'aws ec2 describe-instances — instances list', check: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) },
          { text: 'aws ec2 describe-security-groups — SG rules', check: s => s.history.some(h => /aws ec2 describe-security-groups/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          instances: [
            { id: 'i-0abc123def456', name: 'web-server', type: 't3.micro', state: 'running', az: 'us-east-1a', vpcId: 'vpc-abc123', subnetId: 'subnet-abc', sgIds: ['sg-web'], publicIp: '54.210.1.2', privateIp: '10.0.1.10' },
            { id: 'i-0xyz789ghi012', name: 'db-server', type: 't3.small', state: 'running', az: 'us-east-1b', vpcId: 'vpc-abc123', subnetId: 'subnet-xyz', sgIds: ['sg-db'], publicIp: null, privateIp: '10.0.2.20' },
          ],
          securityGroups: [
            { id: 'sg-web', vpcId: 'vpc-abc123', name: 'web-sg', ingress: [
              { protocol: 'tcp', fromPort: 80, toPort: 80, cidr: '0.0.0.0/0' },
              { protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' },
              { protocol: 'tcp', fromPort: 22, toPort: 22, cidr: '0.0.0.0/0' },
            ] },
            { id: 'sg-db', vpcId: 'vpc-abc123', name: 'db-sg', ingress: [
              { protocol: 'tcp', fromPort: 5432, toPort: 5432, cidr: '10.0.1.0/24' },
            ] },
          ],
          vpcs: [{ id: 'vpc-abc123', cidr: '10.0.0.0/16', name: 'main-vpc', default: false }],
          subnets: [
            { id: 'subnet-abc', vpcId: 'vpc-abc123', cidr: '10.0.1.0/24', az: 'us-east-1a', name: 'public-a', public: true },
            { id: 'subnet-xyz', vpcId: 'vpc-abc123', cidr: '10.0.2.0/24', az: 'us-east-1b', name: 'private-b', public: false },
          ],
          buckets: [],
        },
        success: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) && s.history.some(h => /aws ec2 describe-security-groups/.test(h)),
        successText: 'Notice kiya? <b>sg-web</b> ka SSH (port 22) <b>0.0.0.0/0</b> khula hai — DANGER! Bots brute-force karenge. Fix: SSH sirf internal CIDR (10.0.0.0/16) ya SSM Session Manager use karo. <b>sg-db</b> sahi hai — 5432 sirf 10.0.1.0/24 se.',
        hints: [
          'aws ec2 describe-instances — instances + unke tags dekho',
          'aws ec2 describe-security-groups — firewall rules dekho',
        ],
      },
      {
        type: 'quiz',
        bonus: true,
        title: 'Good to Know — EC2 trivia',
        questions: [
          {
            q: 'Instance terminate kiya. EBS bhi gaya. Data kahan gaya?',
            choices: [
              ' agar "Delete on termination" ON tha — data permanently gone. Prod pe yeh flag OFF hona chahiye',
              'AWS ne automatic backup le liya hoga',
              'EBS hamesha rehta, kabhi delete nahi hota',
              'Snapshot ban gaya automatically',
            ],
            answer: 0,
            explain: 'EBS ka "Delete on termination" flag default ON hota EC2 launch mein. Prod data ke liye OFF karo, aur snapshot backup lo!',
          },
          {
            q: 'Security Group mein SSH rule: 0.0.0.0/0. Kya galat hai?',
            choices: [
              'Haan — bots brute-force karenge. Sirf trusted CIDR/IP ya SSM Session Manager use karo',
              'Koi problem nahi — AWS firewall strong hai',
              'Galat hai kyunki 0.0.0.0/0 ka matlab kuch nahi',
              'Theek hai agar password strong ho',
            ],
            answer: 0,
            explain: '0.0.0.0/0 = sab internet. SSH bots 24/7 scan karte. Crypto-miner install = $50k bill. SSM Session Manager = no SSH, no port, IAM-based.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — EC2 & Networking',
      instructions: 'EC2 architecture round. 🎤',
      questions: [
        {
          q: '"EC2 launch karne ke liye 3 main choices batao" — interviewer.',
          choices: [
            '1) AMI (OS+software image) 2) Instance type (CPU/RAM size) 3) Key pair (SSH access). Bonus: EBS disk + Security Group',
            'Sirf instance type chunna hota hai',
            'Region aur AZ chunna, baaki AWS decide karta',
            'OS, browser, aur office suite',
          ],
          answer: 0,
            explain: 'Yeh THE EC2 question hai. AMI + type + key pair mandatory. EBS aur SG bhi batana impressive. t2.micro Free Tier.',
        },
        {
          q: 'Interviewer: "Security Group stateful hota hai — matlab?"',
          choices: [
            'Outbound request ka inbound reply automatic allow — return traffic ke liye rule nahi likhna padta',
            'Har request ka rule likhna padta hai (inbound + outbound dono)',
            'SG ka state AWS save karta hai (jaise cookie)',
            'Stateful matlab ek hi rule dono directions kaam karta hai',
          ],
          answer: 0,
          explain: 'Stateful = AWS connection track karta. Tum SSH outbound karoge → reply automatic aayega bina inbound rule likhe. NACL (stateless) mein dono likhne padte.',
        },
        {
          q: 'Scenario: EC2 pe DB chal raha. Instance slow ho gaya. Kaunsa type change karoge?',
          choices: [
            'CPU/RAM dekh ke — agar DB RAM-bound hai toh r5 family (memory-optimized), compute-bound toh c5. CloudWatch metrics se pata chalta',
            'Hamesha sabse bada type chuno',
            't2.micro se t2.nano — sasta',
            'Type change nahi kar sakte, nayi instance banani padti',
          ],
          answer: 0,
          explain: 'Right-sizing! CloudWatch se CPU/RAM dekho. r5 = RAM heavy (DB), c5 = CPU, g4 = GPU. t2 = burstable (development). Instance type change hota (stop → change → start).',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Security audit! Production EC2 pe <b>SSH open to internet</b> report mila. Verify karo: <b>(1)</b> Security groups list karo. <b>(2)</b> Kaunsa SG SSH (port 22) ko 0.0.0.0/0 khula hai? <b>(3)</b> Kaunsi instance us SG ko use karti hai?',
            tasks: [
              { text: 'aws ec2 describe-security-groups — SG rules dekho', check: s => s.history.some(h => /aws ec2 describe-security-groups/.test(h)) },
              { text: 'aws ec2 describe-instances — kaunsi instance risky SG use karti hai', check: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              securityGroups: [
                { id: 'sg-web', vpcId: 'vpc-abc', name: 'web-sg', ingress: [
                  { protocol: 'tcp', fromPort: 80, toPort: 80, cidr: '0.0.0.0/0' },
                  { protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' },
                  { protocol: 'tcp', fromPort: 22, toPort: 22, cidr: '0.0.0.0/0' },
                ] },
                { id: 'sg-db', vpcId: 'vpc-abc', name: 'db-sg', ingress: [
                  { protocol: 'tcp', fromPort: 5432, toPort: 5432, cidr: '10.0.1.0/24' },
                ] },
              ],
              instances: [
                { id: 'i-web01', name: 'web-server', type: 't3.micro', state: 'running', az: 'us-east-1a', vpcId: 'vpc-abc', subnetId: 'subnet-public', sgIds: ['sg-web'], publicIp: '54.210.1.2', privateIp: '10.0.1.10' },
                { id: 'i-db01', name: 'db-server', type: 't3.small', state: 'running', az: 'us-east-1b', vpcId: 'vpc-abc', subnetId: 'subnet-private', sgIds: ['sg-db'], publicIp: null, privateIp: '10.0.2.20' },
              ],
              vpcs: [{ id: 'vpc-abc', cidr: '10.0.0.0/16', name: 'main-vpc', default: false }],
              subnets: [], buckets: [],
            },
            success: s => s.history.some(h => /aws ec2 describe-security-groups/.test(h)) && s.history.some(h => /aws ec2 describe-instances/.test(h)),
            successText: 'Audit complete! 🚨 <b>sg-web</b> ka SSH (port 22) <b>0.0.0.0/0</b> khula hai — sab internet se SSH! Yehi #1 EC2 security risk hai. Bots 24/7 brute-force karte. Fix: SSH sirf trusted CIDR (office VPN) ya <b>SSM Session Manager</b> use karo (no SSH port, IAM-based). <b>sg-db</b> sahi hai — 5432 sirf internal 10.0.1.0/24 se. <b>i-web01</b> uses sg-web → at risk.',
            hints: [
              'aws ec2 describe-security-groups — ingress rules dekho, port 22 + 0.0.0.0/0 dhundo',
              'aws ec2 describe-instances — kaunsi instance sg-web use karti hai (sgIds dekho)',
            ],
          },
        },
      ],
    },
    success: [
      'Main EC2 launch ke 3 main choices (AMI, instance type, key pair) bata sakta hoon',
      'Main EBS volume aur "delete on termination" flag ka importance samjhta hoon',
      'Main Security Group ke stateful behaviour aur allow-rules-only model ko explain kar sakta hoon',
      'Main aws ec2 commands se instances aur SGs inspect kar sakta hoon',
    ],
    homework: `<p>Free Tier mein ek EC2 launch karo (sirf learn ke liye):</p>
      <pre># Console → EC2 → Launch instance
# AMI: Amazon Linux 2 (Free Tier eligible)
# Type: t2.micro (Free Tier)
# Key pair: nayi banao (.pem download, safe rakhna)
# SG: SSH apne IP se, HTTP 0.0.0.0/0
# Launch! 1-2 min mein Running

# SSH (Mac/Linux):
ssh -i my-key.pem ec2-user@&lt;public-ip&gt;
# (Windows: PuTTY ya WSL use karo)

# Band karne: EC2 → Terminate (EBS delete on termination OFF check karo)</pre>
      <p>✅ Self-check: SSH ho gaya? <code>aws ec2 describe-instances</code> mein dikha? <b>Terminate zaroor karna</b> — nahi toh bill aayega!</p>`,
    cards: [
      { front: 'EC2 launch ke 3 main choices?', back: '1) <b>AMI</b> (OS+software image: Amazon Linux, Ubuntu, custom) 2) <b>Instance type</b> (CPU/RAM: t2.micro Free Tier, m5 general, c5 compute, r5 RAM, g4 GPU) 3) <b>Key pair</b> (.pem SSH key).' },
      { front: 'EBS volume kya hai?', back: 'EC2 ka <b>persistent disk</b> — instance terminate hone par bhi rehta (agar "Delete on termination" OFF). Snapshot backup S3 par incremental.' },
      { front: 'Security Group — 3 key properties?', back: '1) <b>Allow rules only</b> (default deny) 2) <b>Stateful</b> (outbound reply auto-allow) 3) Inbound rules likhne padte, outbound default allow.' },
      { front: 'SSH 0.0.0.0/0 kyun galat hai?', back: 'Sab internet open — bots 24/7 brute-force. Crypto-miner install = $50k bill. Fix: trusted CIDR ya <b>SSM Session Manager</b> (no SSH, IAM-based).' },
      { front: 'Instance type naming — t2.micro ka matlab?', back: '<code>t</code> = family (burstable), <code>2</code> = generation, <code>micro</code> = size. t/m/c/r/g/x families — general/compute/RAM/GPU/high-mem.' },
    ],
  },

  /* ================= LEVEL 4: S3 ================= */
  {
    id: 's3',
    icon: '🪣',
    title: 'S3 — Object Storage ka Raja',
    badge: 'Bucket Builder',
    objectives: [
      'S3 ka data model: <b>bucket, key, object</b>',
      '<b>11 nines durability</b> aur storage ki philosophy',
      'Bucket <b>permissions</b> — policy, encryption, public access block',
      '<b>Static website hosting</b> aur aws s3 commands',
    ],
    lesson: [
      `<h3>🪣 S3 = files ka mighty dabba</h3>
       <p>S3 (Simple Storage Service) = object storage. Files (objects) ko
       rakhta hai — images, videos, backups, logs. <b>99.999999999%</b>
       (11 nines) durability — matlab 10 million files rakhoge toh 10,000
       saal mein 1 kho jaye. Insane.</p>
       <table>
         <tr><th>Shabd</th><th>Matlab</th><th>Example</th></tr>
         <tr><td>🪣 <b>Bucket</b></td><td>Top-level container — naam globally unique</td><td><code>my-shop-images-2024</code></td></tr>
         <tr><td>🔑 <b>Key</b></td><td>File ka path (folder jaisa)</td><td><code>products/shoes/red-001.jpg</code></td></tr>
         <tr><td>📦 <b>Object</b></td><td>File + metadata</td><td>image binary + content-type + size</td></tr>
       </table>
       <p>💡 <b>Bucket naam globally unique</b> — puri duniya mein ek hi naam.
       <code>images</code> naam gaya tum nahi le sakte. <code>my-company-images-app-2024</code> try karo.</p>
       <p>📏 <b>Limits:</b> bucket mein unlimited objects, ek object 5TB tak,
       single PUT 5GB.</p>`,
      `<h3>🔒 Permissions — bucket public mat karo!</h3>
       <p>S3 ka default = <b>private</b>. Sirf owner access. Public karne ke
       3 tarika — sab galat ke liye risky:</p>
       <ul>
         <li>📜 <b>Bucket Policy</b> — JSON, "sab ko read allow"</li>
         <li>👤 <b>ACL</b> (legacy) — per-object permissions</li>
         <li>❌ <b>Public Access Block OFF</b> — DANGER, sab khula</li>
       </ul>
       <div class="war-story"><b>⚡ Real incident:</b> 2017 mein ek defense
       contractor (US) ne S3 bucket <b>public</b> chhoda galti se. <b>1.8 TB
       sensitive government data</b> internet par. Baad mein pata chala.
       Same year: Verizon, WWE, Deep Root Analytics — sab ka public S3 leak.
       AWS ne "Public Access Block" feature launch kiya. Seekh: <b>public
       S3 = data breach</b>. Block ON rakho default.</div>`,
      `<h3>🌐 S3 Static Website — free hosting!</h3>
       <p>S3 se <b>static website</b> host kar sakte ho — HTML/CSS/JS. Free
       (sirf storage + bandwidth). Perfect for portfolios, docs, SPAs.</p>
       <pre># 1. Bucket banao (naam = domain)
aws s3 mb s3://my-portfolio-2024

# 2. Files upload karo
aws s3 cp index.html s3://my-portfolio-2024/

# 3. Bucket public read policy lagao
# 4. Static website hosting ON
# Endpoint: http://my-portfolio-2024.s3-website-us-east-1.amazonaws.com</pre>
       <p>💡 Production mein <b>CloudFront</b> S3 ke aage lagao — HTTPS,
       custom domain, CDN cache. Direct S3 URL sirf dev ke liye.</p>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'S3 ke concepts — sahi bin mein',
        instructions: 'Har cheez ko sahi category mein daalo.',
        bins: [
          { id: 'bucket', label: '🪣 Bucket level' },
          { id: 'object', label: '📦 Object level' },
          { id: 'wrong', label: '❌ S3 nahi karta' },
        ],
        items: [
          { text: 'Globally unique naam dena', bin: 'bucket', explain: 'Puri duniya mein ek hi naam. my-shop-images-2024 jaisa unique.' },
          { text: 'File ka path (products/shoes/red.jpg)', bin: 'object', explain: 'Key = object ka path. Folder jaisa structure.' },
          { text: '5TB tak ek file', bin: 'object', explain: 'Ek object 5TB. Bucket mein unlimited objects.' },
          { text: 'EC2 instance chalana', bin: 'wrong', explain: 'S3 storage hai, compute nahi. EC2 chalata hai apps.' },
          { text: '11 nines durability (99.999999999%)', bin: 'bucket', explain: 'Bucket-wide guarantee. 10M files 10K saal mein 1 kho.' },
          { text: 'Database query (SELECT * FROM)', bin: 'wrong', explain: 'S3 me SELECT nahi. DynamoDB/RDS use karo. (S3 Select hai par limited.)' },
        ],
      },
      {
        type: 'hotspot',
        title: 'S3 Diagram Detective',
        instructions: 'S3 ke components par click karo.',
        visual: 's3',
        questions: [
          { q: 'Top-level container jiska naam globally unique hota hai?', target: 'bucket', explain: 'Bucket = top-level container. Naam puri duniya mein unique — my-shop-images-2024 jaisa.' },
          { q: 'File ka path (e.g. products/shoes/red.jpg)?', target: 'key', explain: 'Key = object ka path. Folder jaisa hierarchy. Bucket ke andar.' },
          { q: 'JSON rule book — kaun access kar sakta?', target: 'policy', explain: 'Bucket Policy. Public mat karo galti se — Public Access Block ON rakho.' },
          { q: 'SSE-S3, SSE-KMS — kya hai?', target: 'encryption', explain: 'Encryption. SSE-S3 (AWS managed, default free), SSE-KMS (your keys, KMS).' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: S3 Bucket Security',
        instructions: 'Mock account mein ek bucket public hai (leak risk!). Dhundo aur fix karo.',
        goal: 'S3 security audit: <b>(1)</b> Saare buckets list karo. <b>(2)</b> <code>customer-data-2024</code> bucket ki encryption check karo — hai ya nahi? <b>(3)</b> Agar nahi hai, encryption file apply karo.',
        tasks: [
          { text: 'aws s3 ls — buckets list', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
          { text: 'aws s3api get-bucket-encryption --bucket customer-data-2024', check: s => s.history.some(h => /aws s3api get-bucket-encryption.*customer-data/.test(h)) },
          { text: 'Encryption on karo (file apply)', check: s => s.account.buckets && s.account.buckets.find(b => b.name === 'customer-data-2024') && s.account.buckets.find(b => b.name === 'customer-data-2024').encryption === true },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          buckets: [
            { name: 'app-logs-2024', region: 'us-east-1', encryption: true, public: false, objects: [] },
            { name: 'customer-data-2024', region: 'us-east-1', encryption: false, public: false, objects: [{ key: 'users.csv', size: 102400, lastModified: '2024-03-15 14:22:00' }] },
          ],
        },
        files: {
          'fix-encryption.json': {
            desc: 'customer-data-2024 bucket par SSE-S3 encryption on karta hai',
            apply: s => {
              const b = s.account.buckets.find(x => x.name === 'customer-data-2024');
              if (b) b.encryption = true;
              return 'put-bucket-encryption completed on customer-data-2024 — SSE-S3 (AES256) enabled ✓';
            },
          },
          'fix-nothing.json': {
            desc: 'Kuch nahi karta (galat)',
            apply: () => 'No change. (Yeh fix nahi hai — encryption on karo!)',
          },
        },
        success: s => s.account.buckets && s.account.buckets.find(b => b.name === 'customer-data-2024') && s.account.buckets.find(b => b.name === 'customer-data-2024').encryption === true,
        successText: 'Encryption on! <b>customer-data-2024</b> ab SSE-S3 (AES256) se encrypted. Disk par data encrypted — koi S3 physical disk nikal le toh bhi unreadable. Pro-tip: sensitive data ke liye <b>SSE-KMS</b> (your keys, rotation, audit) better.',
        hints: [
          'aws s3 ls — buckets dekho',
          'aws s3api get-bucket-encryption --bucket customer-data-2024 — encryption hai?',
          'ls se file dekho, apply -f fix-encryption.json',
        ],
      },
      {
        type: 'quiz',
        title: 'S3 Quick-fire',
        questions: [
          {
            q: 'S3 ka "11 nines durability" ka matlab?',
            choices: [
              '99.999999999% — 10M files rakhoge toh 10K saal mein 1 kho jaaye. Multi-AZ automatic replication',
              '11 hours uptime din mein',
              '11 copies har file ki banti hain',
              '11 saal tak data guarantee',
            ],
            answer: 0,
            explain: 'Durability ≠ availability. Durability = data kho na jaaye. Availability = accessible rahe. S3 11 nines durability, 99.99% availability (Standard).',
          },
          {
            q: 'Bucket naam "images" le sakte ho?',
            choices: [
              'Nahi — globally unique chahiye. "my-company-images-app-2024" jaisa unique try karo',
              'Haan — koi bhi naam chal jaata',
              'Haan — agar tum pehle aao',
              'Nahi — sirf numbers allowed hain',
            ],
            answer: 0,
            explain: 'S3 namespace global. Common naam gaya. Company + purpose + year jaisa prefix use karo.',
          },
          {
            q: 'S3 static website banaya. Best practice production ke liye?',
            choices: [
              'CloudFront aage lagao — HTTPS, custom domain, CDN cache, DDoS protection',
              'Direct S3 URL use karo — sab users ko bhejo',
              'Bucket public karke chhodo — sab access kare',
              'EC2 pe nginx chalake reverse proxy karo',
            ],
            answer: 0,
            explain: 'CloudFront = HTTPS (S3 direct HTTP only), custom domain, edge cache, DDoS (Shield). Direct S3 URL sirf dev. Yehi SAA exam ka answer.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — S3',
      instructions: 'S3 architecture round. 🎤',
      questions: [
        {
          q: '"S3 ki durability 11 nines hai — yeh kaise achieve hoti hai?" — interviewer.',
          choices: [
            'S3 automatic multi-AZ replication — ek object kam se kam 3 AZ mein copy. Bit-level checksum. Background self-healing',
            'S3 har file 11 baar copy karta hai',
            'S3 SSD use karta hai isliye durable',
            'S3 tape backup leta hai daily',
          ],
          answer: 0,
            explain: 'Multi-AZ + checksums + self-healing. Data silently corrupt hua toh S3 repair. Isliye 11 nines — practically data loss nahi.',
        },
        {
          q: 'Interviewer: "S3 public bucket ke risks kya?" — sahi jawab?',
          choices: [
            'Data breach — puri duniya access. 2017 mein defense contractor ka 1.8TB leak. Public Access Block ON, least-privilege policy, CloudFront signed URLs for private',
            'Koi risk nahi — S3 security strong hai',
            'Sirf bandwidth ka charge zyada aata',
            'Bucket naam leak ho jaata',
          ],
          answer: 0,
          explain: 'Public S3 = #1 cause of cloud data breaches. Block Public Access ON (account + bucket level). Private content ke liye CloudFront signed URLs/cookies.',
        },
        {
          q: 'Scenario: 100GB ka log file S3 par hai. Tumhe sirf ek column query karni (CSV). Best approach?',
          choices: [
            'S3 Select — sirf relevant rows/columns query karo, pura download mat karo. Athena bhi chalega (serverless SQL)',
            '100GB EC2 pe download karo, phir process',
            'S3 me SELECT nahi hota, RDS mein daalo',
            'Lambda function chalao har file par',
          ],
          answer: 0,
          explain: 'S3 Select = filter at S3 (parquet/CSV/JSON). Athena = full SQL on S3 (serverless). EC2 download = expensive + slow.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Security alert! Ek bucket <b>publicly accessible</b> hai. Audit karo: <b>(1)</b> Buckets list karo. <b>(2)</b> <code>internal-docs-2024</code> ka bucket policy dekho (public?). <b>(3)</b> Fix file apply karo — public access block karo.',
            tasks: [
              { text: 'aws s3 ls — buckets list', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
              { text: 'aws s3api get-bucket-policy --bucket internal-docs-2024 — policy dekho', check: s => s.history.some(h => /aws s3api get-bucket-policy.*internal-docs/.test(h)) },
              { text: 'Fix apply karo (public access block)', check: s => s.account.buckets && s.account.buckets.find(b => b.name === 'internal-docs-2024') && !s.account.buckets.find(b => b.name === 'internal-docs-2024').public },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              buckets: [
                { name: 'app-assets-2024', region: 'us-east-1', encryption: true, public: false, objects: [] },
                { name: 'internal-docs-2024', region: 'us-east-1', encryption: true, public: true, objects: [{ key: 'quarterly-report.pdf', size: 2048000, lastModified: '2024-07-01 10:00:00' }] },
              ],
            },
            files: {
              'fix-public-access.json': {
                desc: 'internal-docs-2024 bucket par public access block lagata hai',
                apply: s => {
                  const b = s.account.buckets.find(x => x.name === 'internal-docs-2024');
                  if (b) b.public = false;
                  return 'put-public-access-block completed on internal-docs-2024 — BlockPublicAcls=true, BlockPublicPolicy=true, IgnorePublicAcls=true, RestrictPublicBuckets=true ✓';
                },
              },
              'fix-nothing.json': {
                desc: 'Kuch nahi karta (galat fix)',
                apply: () => 'No change. (Yeh fix nahi hai — public access block karo!)',
              },
            },
            success: s => s.account.buckets && s.account.buckets.find(b => b.name === 'internal-docs-2024') && !s.account.buckets.find(b => b.name === 'internal-docs-2024').public,
            successText: 'Public access blocked! 🛡️ <b>internal-docs-2024</b> ab private hai. Notice: bucket policy mein <code>Principal: "*"</code> tha — sab internet ko read access. Public Access Block lagane se aisi policies ignore hoti hain. Pro-tip: <b>S3 Block Public Access</b> account-level pe ON rakho — sab buckets default private. 2017 mein bahut companies ka data leak hua tha exactly aise public buckets se.',
            hints: [
              'aws s3 ls — buckets dekho',
              'aws s3api get-bucket-policy --bucket internal-docs-2024 — policy mein Principal "*" hai?',
              'ls se files dekho, apply -f fix-public-access.json chala ke public access block karo',
            ],
          },
        },
      ],
    },
    success: [
      'Main S3 ka data model (bucket, key, object) aur 11 nines durability explain kar sakta hoon',
      'Main bucket permissions (policy, encryption, public access block) samjhta hoon',
      'Main static website hosting aur CloudFront ka role bata sakta hoon',
      'Main aws s3 / s3api commands se buckets manage kar sakta hoon',
    ],
    homework: `<p>Free Tier mein S3 static website banao:</p>
      <pre># Bucket banao (naam unique hona chahiye)
aws s3 mb s3://my-portfolio-2024-yourname

# index.html banao aur upload
echo "&lt;h1&gt;Hello AWS Gurukul!&lt;/h1&gt;" > index.html
aws s3 cp index.html s3://my-portfolio-2024-yourname/

# Console → S3 → bucket → Properties → Static website hosting → ON
# Index: index.html
# Permissions → Bucket policy: public read (sirf is test ke liye!)

# Endpoint kholo browser mein:
# http://my-portfolio-2024-yourname.s3-website-us-east-1.amazonaws.com</pre>
      <p>✅ Self-check: Browser mein page dikha? <b>Baad mein bucket delete kar dena</b> — nahi toh storage bill.</p>`,
    cards: [
      { front: 'S3 ka data model?', back: '<b>Bucket</b> (globally unique naam) ⊃ <b>Objects</b> (file + metadata). <b>Key</b> = object ka path (folder jaisa). 11 nines durability, 5TB max object.' },
      { front: 'S3 11 nines durability kaise?', back: 'Automatic <b>multi-AZ replication</b> (3+ AZ), bit-level checksums, background self-healing. 10M files → 10K saal mein 1 kho.' },
      { front: 'S3 public bucket ka risk?', back: '<b>Data breach</b> — puri duniya access. 2017 defense contractor 1.8TB leak. Fix: <b>Public Access Block ON</b>, least-privilege policy, CloudFront signed URLs for private.' },
      { front: 'SSE-S3 vs SSE-KMS?', back: '<b>SSE-S3</b>: AWS managed keys, free, default. <b>SSE-KMS</b>: tumhare keys (KMS), rotation, CloudTrail audit, per-object control. Sensitive data = KMS.' },
      { front: 'Static website S3 + CloudFront kyun?', back: 'S3 direct = sirf HTTP, no custom domain, no CDN. <b>CloudFront</b>: HTTPS, custom domain, edge cache (fast globally), DDoS (Shield). Production = CF + S3.' },
    ],
  },

  /* ================= LEVEL 5: VPC Basics ================= */
  {
    id: 'vpcbasics',
    icon: '🌐',
    title: 'VPC Basics — Tumhara Private Network',
    badge: 'VPC Voyager',
    objectives: [
      '<b>VPC, subnet, CIDR</b> — network ka foundation',
      '<b>Public vs Private subnet</b> — IGW ka role',
      '<b>Route Table</b> — traffic kahan jaayega',
      'aws ec2 describe-vpcs/subnets se network explore',
    ],
    lesson: [
      `<h3>🌐 VPC = tumhara private cloud network</h3>
       <p>VPC (Virtual Private Cloud) = AWS mein tumhara apna isolated
       network. <b>CIDR block</b> assign karte ho — jaise <code>10.0.0.0/16</code>
       (65,536 IP addresses). Yeh tumhare control mein, public internet se
       isolated.</p>
       <pre>VPC 10.0.0.0/16  (65,536 IPs)
├── subnet 10.0.1.0/24 (256 IPs) — AZ-a, public
├── subnet 10.0.2.0/24 (256 IPs) — AZ-b, private
└── subnet 10.0.3.0/24 (256 IPs) — AZ-c, private</pre>
       <p>💡 <b>CIDR kya hai?</b> IP range. <code>/16</code> = last 16 bits
       free = 2^16 = 65,536 addresses. <code>/24</code> = 256. <code>/28</code>
       = 16. AWS 5 IPs har subnet mein reserve karta (network, broadcast,
       DNS, 2 future).</p>`,
      `<h3>🌍 Public vs Private — IGW ka jadoo</h3>
       <p>Subnet ko "public" banane ke liye <b>Internet Gateway (IGW)</b>
       chahiye — VPC ko internet se jodta hai. Private subnet = no IGW
       route = no direct internet.</p>
       <table>
         <tr><th>Public subnet</th><th>Private subnet</th></tr>
         <tr><td>IGW se route</td><td>IGW route nahi</td></tr>
         <tr><td>EC2 public IP milta</td><td>No public IP</td></tr>
         <tr><td>Web servers, ALB</td><td>DB, app backend</td></tr>
         <tr><td>Internet se direct access</td><td>Sirf internal/VPC se</td></tr>
       </table>
       <p>💡 Best practice: <b>web = public, db/app = private</b>. Hackar
       internet se DB tak nahi pahunche. Private subnet ko internet chahiye
       (patches)? <b>NAT Gateway</b> (intermediate level mein milega).</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek startup ne DB ko
       <b>public subnet</b> mein rakha, 0.0.0.0/0 pe port 5432 khola. 6
       ghante mein ransomware ne <b>poora DB encrypt kar diya</b>. Bitcoin
       maanga. Seekh: <b>DB hamesha private subnet</b>, sirf app se access
       (security group source = app SG).</div>`,
      `<h3>🗺️ Route Table — traffic ka GPS</h3>
       <p>Route Table = subnet mein traffic kahan jaaye. Rules:</p>
       <pre># Public subnet route table
10.0.1.0/24  → local          (VPC internal)
0.0.0.0/0    → igw-xxx        (internet — sab kuch bahar)

# Private subnet route table
10.0.0.0/16  → local          (VPC internal)
(0.0.0.0/0   → NAT GW — next level mein)</pre>
       <p><b>0.0.0.0/0</b> = "default route" — kuch bhi match nahi hua toh
       yahan bhej. Public subnet ka default = IGW. Private ka = NAT (intermediate).</p>`,
    ],
    stages: [
      {
        type: 'order',
        title: 'VPC banane ka sequence',
        instructions: 'Naya VPC banane ke steps sahi order mein lagao.',
        steps: [
          { text: 'VPC banao with CIDR (e.g. 10.0.0.0/16)', explain: 'Pehla kaam — VPC ka dabba, CIDR assign.' },
          { text: 'Subnets banao (public/private, har AZ mein)', explain: 'VPC ke andar subnets. Multi-AZ for HA.' },
          { text: 'Internet Gateway (IGW) banao aur VPC se jodo', explain: 'IGW = VPC ko internet se jodta. Public subnet ke liye zaroori.' },
          { text: 'Route tables banao — public subnet ka default route IGW ko', explain: 'Route table rules. Public subnet ka 0.0.0.0/0 → IGW. Private subnet ka sirf local.' },
          { text: 'Security groups aur NACLs configure karo', explain: 'Firewall rules. SG instance-level, NACL subnet-level.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'VPC Diagram Detective',
        instructions: 'VPC ke components par click karo.',
        visual: 'vpcbasics',
        questions: [
          { q: 'VPC ko internet se jodne wala component?', target: 'igw', explain: 'Internet Gateway (IGW). Public subnet ka default route yahan jaata.' },
          { q: 'Traffic rules — kahan jaaye decide karta?', target: 'rt', explain: 'Route Table. 0.0.0.0/0 = default route. Public → IGW, private → local only.' },
          { q: 'DB/app backend kahan rehta hai (internet se direct access nahi)?', target: 'privatesubnet', explain: 'Private subnet — no IGW route, no public IP. DB/app yahan safe, internet se direct nahi pahunche.' },
        ],
      },
      {
        type: 'quiz',
        title: 'VPC Quick-fire',
        questions: [
          {
            q: 'Private subnet ka matlab?',
            choices: [
              'No direct internet route — sirf VPC internal access. Public IP nahi milta instances ko',
              'Subnet chhota hai (kam IPs)',
              'Sirf private company use kar sakti',
              'Internet hai par slow',
            ],
            answer: 0,
            explain: 'Private = no IGW route. DB, app backend yahan. Internet se hack nahi ho sakte directly.',
          },
          {
            q: 'CIDR 10.0.0.0/16 mein kitne IPs?',
            choices: [
              '65,536 (2^16) — last 16 bits free',
              '256 (2^8)',
              '16 (2^4)',
              '1 — sirf ek IP',
            ],
            answer: 0,
            explain: '/16 = 32-16 = 16 bits free = 2^16 = 65,536. /24 = 256, /28 = 16. AWS 5 IPs reserve per subnet.',
          },
          {
            q: 'DB ko public subnet mein rakh ke 0.0.0.0/0 port 5432 khola. Kya hoga?',
            choices: [
              'Ransomware/hack risk — DB internet pe exposed. Hamesha private subnet, sirf app SG se access',
              'Koi problem nahi — SG strong hai',
              'DB slow ho jaayega',
              'AWS block kar dega',
            ],
            answer: 0,
            explain: 'Public DB = death wish. 6 ghante mein ransomware. Private subnet + SG source = app SG (no CIDR).',
          },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: Network Mapper',
        instructions: 'Mock account ka VPC map karo — VPCs, subnets, unke AZs.',
        goal: 'Network audit: <b>(1)</b> VPCs list karo. <b>(2)</b> Subnets list karo (kis AZ mein, public ya private).',
        tasks: [
          { text: 'aws ec2 describe-vpcs — VPCs dekho', check: s => s.history.some(h => /aws ec2 describe-vpcs/.test(h)) },
          { text: 'aws ec2 describe-subnets — subnets + AZs', check: s => s.history.some(h => /aws ec2 describe-subnets/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          vpcs: [{ id: 'vpc-abc123', cidr: '10.0.0.0/16', name: 'main-vpc', default: false, igw: 'igw-001' }],
          subnets: [
            { id: 'subnet-aaa', vpcId: 'vpc-abc123', cidr: '10.0.1.0/24', az: 'us-east-1a', name: 'public-a', public: true },
            { id: 'subnet-bbb', vpcId: 'vpc-abc123', cidr: '10.0.2.0/24', az: 'us-east-1b', name: 'public-b', public: true },
            { id: 'subnet-ccc', vpcId: 'vpc-abc123', cidr: '10.0.3.0/24', az: 'us-east-1a', name: 'private-a', public: false },
            { id: 'subnet-ddd', vpcId: 'vpc-abc123', cidr: '10.0.4.0/24', az: 'us-east-1b', name: 'private-b', public: false },
          ],
          securityGroups: [], instances: [], buckets: [],
        },
        success: s => s.history.some(h => /aws ec2 describe-vpcs/.test(h)) && s.history.some(h => /aws ec2 describe-subnets/.test(h)),
        successText: 'Notice: 4 subnets — 2 public (web/ALB), 2 private (DB/app), multi-AZ (a + b). Yehi standard production VPC design. CIDR 10.0.0.0/16, subnets /24. Boss level mein tum aise VPC khud design karoge.',
        hints: [
          'aws ec2 describe-vpcs — VPCs list',
          'aws ec2 describe-subnets — subnets + AZs + public/private',
        ],
      },
    ],
    interview: {
      title: 'Interview Round — VPC',
      instructions: 'Networking round — VPC clarity dikhao. 🎤',
      questions: [
        {
          q: '"Public aur private subnet ka farak batao" — interviewer.',
          choices: [
            'Public subnet ka route IGW tak — instances ko public IP, internet access. Private mein IGW route nahi, no public IP, sirf internal',
            'Public subnet internet se fast, private slow',
            'Public free, private paid',
            'Dono same — sirf naam alag',
          ],
          answer: 0,
          explain: 'IGW route = public. Web/ALB yahan. DB/app = private. Hackar internet se private tak nahi pahunche.',
        },
        {
          q: 'Scenario: DB ko private subnet mein rakha. Ab DB ko patches download karne hain internet se. Solution?',
          choices: [
            'NAT Gateway — private subnet ko outbound internet do bina public IP diye. Inbound block, sirf outbound (patches, API calls)',
            'DB ko public subnet mein le aao',
            'IGW private subnet mein jodo',
            'Kuch nahi — DB ko patches nahi chahiye',
          ],
          answer: 0,
          explain: 'NAT GW — next level mein deep dive. Private ko outbound internet, inbound block. Patches/download possible, hackar access nahi.',
        },
        {
          q: 'CIDR 10.0.0.0/16 aur subnet 10.0.1.0/24 — farak samjhao.',
          choices: [
            '/16 = 65,536 IPs (VPC ka dabba), /24 = 256 IPs (subnet — AZ ke andar). VPC ⊃ subnets',
            '16 aur 24 IP address hain respectively',
            '/16 chhota, /24 bada',
            'CIDR aur subnet same cheez hai',
          ],
          answer: 0,
          explain: 'VPC ka CIDR bada (/16 = 65k), subnet chhota (/24 = 256). AWS 5 IPs reserve per subnet. Subnet AZ-specific.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Network topology audit! Pre-production review mein VPC setup verify karo: <b>(1)</b> VPC list karo (CIDR block). <b>(2)</b> Subnets dekho — public ya private? <b>(3)</b> Security groups check karo — koi over-permissive rule?',
            tasks: [
              { text: 'aws ec2 describe-vpcs — VPC CIDR', check: s => s.history.some(h => /aws ec2 describe-vpcs/.test(h)) },
              { text: 'aws ec2 describe-subnets — public/private subnets', check: s => s.history.some(h => /aws ec2 describe-subnets/.test(h)) },
              { text: 'aws ec2 describe-security-groups — firewall rules', check: s => s.history.some(h => /aws ec2 describe-security-groups/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              vpcs: [
                { id: 'vpc-prod', cidr: '10.0.0.0/16', name: 'prod-vpc', default: false, igw: 'igw-1' },
              ],
              subnets: [
                { id: 's-public', vpcId: 'vpc-prod', cidr: '10.0.1.0/24', az: 'us-east-1a', name: 'public-a', public: true },
                { id: 's-private', vpcId: 'vpc-prod', cidr: '10.0.2.0/24', az: 'us-east-1b', name: 'private-b', public: false },
              ],
              securityGroups: [
                { id: 'sg-web', vpcId: 'vpc-prod', name: 'web-sg', ingress: [
                  { protocol: 'tcp', fromPort: 80, toPort: 80, cidr: '0.0.0.0/0' },
                  { protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' },
                ] },
                { id: 'sg-db', vpcId: 'vpc-prod', name: 'db-sg', ingress: [
                  { protocol: 'tcp', fromPort: 5432, toPort: 5432, cidr: '10.0.1.0/24' },
                ] },
              ],
              instances: [], buckets: [],
            },
            success: s => s.history.some(h => /aws ec2 describe-vpcs/.test(h)) && s.history.some(h => /aws ec2 describe-subnets/.test(h)) && s.history.some(h => /aws ec2 describe-security-groups/.test(h)),
            successText: 'Topology clear! 📋 VPC <b>prod-vpc</b> (10.0.0.0/16) mein 2 subnets: <b>public-a</b> (10.0.1.0/24, IGW route) aur <b>private-b</b> (10.0.2.0/24, no direct internet). SGs: <b>web-sg</b> HTTP/HTTPS open (correct for web), <b>db-sg</b> 5432 sirf 10.0.1.0/24 se (correct — DB sirf web tier se). Topology looks good! ✅ Pro tip: private subnet mein NAT Gateway chahiye for outbound internet (patches, API calls).',
            hints: [
              'aws ec2 describe-vpcs — VPC aur CIDR dekho',
              'aws ec2 describe-subnets — public/private flag dekho',
              'aws ec2 describe-security-groups — ingress rules audit karo',
            ],
          },
        },
      ],
    },
    success: [
      'Main VPC, subnet, CIDR ka concept aur hierarchy samjhta hoon',
      'Main public vs private subnet aur IGW ka role explain kar sakta hoon',
      'Main route table aur 0.0.0.0/0 default route samjhta hoon',
      'Main DB ko private subnet rakhne ki wajah (security) bata sakta hoon',
    ],
    homework: `<p>Free Tier mein VPC wizard se naya VPC banao:</p>
      <pre># Console → VPC → "VPC and more" wizard
# Name: my-lab-vpc
# CIDR: 10.0.0.0/16
# AZs: 2 (a, b)
# Public subnets: 2
# Private subnets: 2
# NAT gateway: None (sasta rakhne ke liye, ya $32/mo)

# Verify:
aws ec2 describe-vpcs
aws ec2 describe-subnets --filters Name=vpc-id,Values=vpc-xxx</pre>
      <p>✅ Self-check: 1 VPC + 4 subnets (2 public, 2 private) mile? Route tables mein public ka 0.0.0.0/0 → IGW dikha?</p>`,
    cards: [
      { front: 'VPC kya hai aur CIDR ka matlab?', back: '<b>VPC</b> = tumhara private AWS network. <b>CIDR</b> = IP range. /16 = 65,536 IPs, /24 = 256, /28 = 16. AWS 5 IPs reserve per subnet.' },
      { front: 'Public vs Private subnet?', back: 'Public = IGW route, public IP, internet access (web/ALB). Private = no IGW, no public IP, sirf internal (DB/app). Hackar internet se private nahi pahunche.' },
      { front: 'Route table ka kaam?', back: 'Traffic ka GPS. Rules: <code>10.0.0.0/16 → local</code> (VPC internal), <code>0.0.0.0/0 → IGW</code> (public subnet, internet). Private mein sirf local.' },
      { front: 'DB public subnet + 0.0.0.0/0 port 5432 — kya hoga?', back: '<b>Ransomware</b> 6 ghante mein. DB hamesha <b>private subnet</b>, SG source = app SG (no CIDR). Public DB = #1 hack vector.' },
      { front: 'Private subnet ko internet kaise (patches)?', back: '<b>NAT Gateway</b> — outbound internet do bina public IP diye. Inbound block. Next level mein deep dive.' },
    ],
  },

  /* ================= LEVEL 6: RDS ================= */
  {
    id: 'rds',
    icon: '🗄️',
    title: 'RDS — Managed Database, Tension-Free',
    badge: 'Database Darshan',
    objectives: [
      '<b>Managed vs self-managed DB</b> ka farak',
      '<b>Multi-AZ</b> (DR) vs <b>Read Replica</b> (scaling) ka farak',
      'RDS engines aur backups ka model',
      'aws rds commands se DBs inspect',
    ],
    lesson: [
      `<h3>🗄️ RDS = AWS sambhalta DB, tum sirf schema dekho</h3>
       <p>RDS (Relational Database Service) = managed relational DB.
       Tum EC2 pe MySQL khud chala sakte ho — par usme <b>sab tumhara kaam</b>:
       OS patch, DB patch, backups, replication, scaling. RDS mein AWS yeh
       sab sambhalta.</p>
       <table>
         <tr><th>Self-managed (EC2 pe DB)</th><th>RDS (managed)</th></tr>
         <tr><td>OS patching tum</td><td>AWS patches OS + DB</td></tr>
         <tr><td>Backups tum</td><td>Automated + snapshots</td></tr>
         <tr><td>Replication setup tum</td><td>Multi-AZ / Read Replica button</td></tr>
         <tr><td>Scaling tough</td><td>Vertical (instance class), horizontal (read replicas)</td></tr>
       </table>
       <p>💡 <b>Engines:</b> MySQL, PostgreSQL, MariaDB, Oracle, SQL Server,
       Aurora (AWS ka custom, MySQL/PG compatible, faster).</p>`,
      `<h3>🔁 Multi-AZ vs Read Replica — confusion khatam</h3>
       <p>Do alag cheezein — exam mein confuse karte hain:</p>
       <table>
         <tr><th>Multi-AZ</th><th>Read Replica</th></tr>
         <tr><td><b>DR</b> (disaster recovery) ke liye</td><td><b>Read scaling</b> ke liye</td></tr>
         <tr><td>Primary + standby (different AZ)</td><td>Primary + n copies (any AZ/region)</td></tr>
         <tr><td>Synchronous replication</td><td>Asynchronous</td></tr>
         <tr><td>Standby pe read nahi (sirf failover)</td><td>Replica pe read kar sakte</td></tr>
         <tr><td>Primary mara → standby promote (auto, 60-120s)</td><td>Primary mara → replica unaffected (ya manually promote)</td></tr>
         <tr><td>1 primary + 1 standby (typical)</td><td>Up to 15 read replicas</td></tr>
       </table>
       <div class="war-story"><b>⚡ Real incident:</b> Ek startup ne RDS
       <b>single-AZ</b> chalaya (sasta). Ek raat hardware fail → DB down
       <b>4 ghante</b> tak. Recovery: backup se restore. Revenue loss: $200k.
       Multi-AZ ka extra cost (~2x) bahut sasta tha! Seekh: <b>prod DB hamesha
       Multi-AZ</b>. $100/mo extra vs $200k loss.</div>`,
      `<h3>💾 Backups — automated + manual</h3>
       <p>RDS 2 tarah ke backups:</p>
       <ul>
         <li>📅 <b>Automated backups</b> — daily, retention 1-35 days. Point-in-time
             recovery (kisi bhi second pe wapas ja sakte 5 min ke andar).</li>
         <li>📸 <b>Manual snapshots</b> — tum kabhi banao, jab chaaho. Retention
             unlimited (jab tak delete nahi). Long-term archive.</li>
       </ul>
       <p>💡 <b>Aurora</b> = AWS ka premium RDS. 6 copies data ke 3 AZ mein,
       10ms se kam failover, 5x PG speed, aurora serverless bhi.</p>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Multi-AZ ya Read Replica?',
        instructions: 'Har use-case ko sahi bin mein daalo — yeh <b>Multi-AZ (DR)</b> ke liye hai ya <b>Read Replica (scaling reads)</b>?',
        bins: [
          { id: 'multiaz', label: '🔁 Multi-AZ (DR)' },
          { id: 'replica', label: '📖 Read Replica (scale)' },
        ],
        items: [
          { text: 'Primary DB mara toh automatic failover chahiye', bin: 'multiaz', explain: 'Multi-AZ = DR. Standby promote 60-120s. Synchronous replication.' },
          { text: 'Reporting queries DB ko slow kar rahe — alag read copy chahiye', bin: 'replica', explain: 'Read Replica = read load baantna. Replica pe reporting, primary pe app traffic.' },
          { text: 'Primary mara toh 0 data loss (sync replication)', bin: 'multiaz', explain: 'Multi-AZ sync — primary pe write confirm hone ke baad standby pe bhi. Failover = 0 loss.' },
          { text: '15 alag copies chahiye read-heavy app ke liye', bin: 'replica', explain: 'Up to 15 read replicas. Horizontal read scaling.' },
          { text: 'Cross-region backup DR chahiye', bin: 'replica', explain: 'Cross-region read replica = DR across regions. Multi-AZ ek hi region mein.' },
          { text: 'Standby pe read nahi kar sakte (sirf failover ke liye)', bin: 'multiaz', explain: 'Multi-AZ standby = hidden, sirf failover. Read Replica = actually read kar sakte.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'RDS Diagram Detective',
        instructions: 'RDS Multi-AZ ke components par click karo.',
        visual: 'rds',
        questions: [
          { q: 'Primary DB — writes + reads handle karta?', target: 'primary', explain: 'Primary = main DB. Sab writes yahan. Reads bhi (ya read replica pe offload).' },
          { q: 'Failover ke liye standby — kaha rehta?', target: 'standby', explain: 'Standby = dusre AZ, sync replication. Primary mara → promote (60-120s).' },
          { q: 'Automatic failover — kaunsa feature?', target: 'multiaz', explain: 'Multi-AZ = DR. Synchronous replication, 0 data loss, auto-failover.' },
          { q: 'Read load baantne ke liye?', target: 'readreplica', explain: 'Read Replica = scaling reads. Asynchronous, up to 15, can be cross-region.' },
        ],
      },
      {
        type: 'quiz',
        title: 'RDS Quick-fire',
        questions: [
          {
            q: 'Self-managed DB (EC2 pe MySQL) vs RDS — sabse bada RDS advantage?',
            choices: [
              'AWS patches OS+DB, backups automatic, replication button — tum sirf schema aur queries dekho',
              'RDS free hai, EC2 paid',
              'RDS me sirf AWS ka SQL chalta',
              'RDS slow hai',
            ],
            answer: 0,
            explain: 'Managed = operational overhead gone. OS/DB patching, backups, replication — sab AWS. Tum business pe focus karo.',
          },
          {
            q: 'Multi-AZ failover kitni der mein hota?',
            choices: [
              '60-120 seconds — automatic, primary health check fail hone par',
              'Instant (0 seconds)',
              '1 hour',
              'Manual — tum call karo AWS ko',
            ],
            answer: 0,
            explain: 'RDS Multi-AZ = automatic failover 60-120s. Aurora = 10s se kam (6 copies, fast). App ko reconnect logic hona chahiye.',
          },
          {
            q: 'RDS automated backup retention?',
            choices: [
              '1-35 days, point-in-time recovery (kisi bhi second pe wapas)',
              '30 days fixed',
              '1 year',
              'Lifetime',
            ],
            answer: 0,
            explain: 'Automated = 1-35 days. Point-in-time = 5-min recovery. Long-term ke liye manual snapshot (unlimited retention).',
          },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: DB Inspector',
        instructions: 'Mock account ka RDS dekho — Multi-AZ hai ya nahi?',
        goal: 'DB audit: <b>(1)</b> RDS instances list karo. <b>(2)</b> Kya <code>prod-db</code> Multi-AZ enabled hai? Check karo.',
        tasks: [
          { text: 'aws rds describe-db-instances — DBs list', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          rds: [
            { id: 'prod-db', name: 'prod-db', engine: 'postgres', class: 'db.r6.large', state: 'available', multiAZ: false, endpoint: 'prod-db.abc.us-east-1.rds.amazonaws.com', storage: 100 },
            { id: 'dev-db', name: 'dev-db', engine: 'mysql', class: 'db.t3.micro', state: 'available', multiAZ: false, endpoint: 'dev-db.xyz.us-east-1.rds.amazonaws.com', storage: 20 },
          ],
          buckets: [], vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        success: s => s.history.some(h => /aws rds describe-db-instances/.test(h)),
        successText: 'Dhyan se dekho — <b>prod-db</b> ka <code>MultiAZ: false</code>! Yeh DANGER. Primary mara toh standby nahi, manual restore (hours). Fix: Multi-AZ enable karo (modify DB, ~2x cost but DR). Dev-db single-AZ OK hai (non-critical).',
        hints: [
          'aws rds describe-db-instances — MultiAZ field dekho',
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Databases',
      instructions: 'DB architecture round. 🎤',
      questions: [
        {
          q: '"Multi-AZ aur Read Replica ka farak?" — classic interview Q.',
          choices: [
            'Multi-AZ = DR (sync, standby promote 60-120s, no read on standby). Read Replica = read scaling (async, up to 15, readable, cross-region possible)',
            'Dono same — sirf naam alag',
            'Multi-AZ reads badhata, Read Replica DR deta',
            'Multi-AZ free, Read Replica paid',
          ],
          answer: 0,
          explain: 'Yeh question 90% interviews mein puchha jaata. Multi-AZ = survival (DR). Read Replica = performance (read scaling). Different goals.',
        },
        {
          q: 'Scenario: production DB primary fail ho gaya. Multi-AZ on hai. Kya hoga?',
          choices: [
            'RDS automatic standby promote karega 60-120s mein — app ko reconnect karna padega (DNS same point karega)',
            'DB down rahega jab tak tum manually restore karo',
            'AWS support ko call karna padega',
            'Data loss hoga (sync nahi hota)',
            ],
          answer: 0,
          explain: 'Multi-AZ sync = 0 data loss. Auto failover. App ka connection string same (endpoint DNS same). App mein retry logic hona chahiye — 60-120s blip.',
        },
        {
          q: 'Interviewer: "Aurora kyun use karein, regular RDS se kya better?"',
          choices: [
            '6 copies data ke 3 AZ mein, 10ms se kam failover, 5x PG speed, aurora serverless option, global database',
            'Aurora free hai',
            'Aurora me sirf AWS SQL chalta',
            'Aurora self-managed hai (tum sambhalo)',
          ],
          answer: 0,
          explain: 'Aurora = AWS ka premium. Storage layer alag (6 copies), compute scale up/down independent. Failover 10s. Aurora Serverless = intermittent workloads. Global DB = cross-region.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: DR readiness audit! Management ne bola "sab databases Multi-AZ hain?" Verify karo: <b>(1)</b> Saare RDS instances list karo. <b>(2)</b> Kaunsa Multi-AZ hai aur kaunsa nahi?',
            tasks: [
              { text: 'aws rds describe-db-instances — Multi-AZ status dekho', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              rds: [
                { id: 'prod-db', name: 'prod-db', engine: 'postgres', class: 'db.r6.large', state: 'available', multiAZ: true, endpoint: 'prod-db.cxxx.us-east-1.rds.amazonaws.com', storage: 100 },
                { id: 'dev-db', name: 'dev-db', engine: 'postgres', class: 'db.t3.micro', state: 'available', multiAZ: false, endpoint: 'dev-db.cxxx.us-east-1.rds.amazonaws.com', storage: 20 },
                { id: 'analytics-db', name: 'analytics-db', engine: 'mysql', class: 'db.m5.large', state: 'available', multiAZ: true, endpoint: 'analytics-db.cxxx.us-east-1.rds.amazonaws.com', storage: 500 },
              ],
              buckets: [],
            },
            success: s => s.history.some(h => /aws rds describe-db-instances/.test(h)),
            successText: 'DR audit complete! 📋 3 RDS instances: <b>prod-db</b> ✅ Multi-AZ (HA, failover ready), <b>analytics-db</b> ✅ Multi-AZ, <b>dev-db</b> ❌ <b>NOT Multi-AZ</b> — single AZ, no failover. Agar us-east-1a down hua toh dev-db gone. Production ke liye Multi-AZ mandatory. Dev ke liye cost save karke single-AZ chal sakte hain — par team ko pata hona chahiye. Recommend: dev-db pe Multi-AZ enable karo ya snapshot backup schedule karo.',
            hints: [
              'aws rds describe-db-instances — MultiAZ field true/false dekho har instance ke liye',
            ],
          },
        },
      ],
    },
    success: [
      'Main managed vs self-managed DB ka farak aur RDS ke benefits bata sakta hoon',
      'Main Multi-AZ (DR) vs Read Replica (scaling) ka clear farak explain kar sakta hoon',
      'Main RDS backup types (automated 1-35 days + manual snapshots) samjhta hoon',
      'Main aws rds commands se DBs inspect kar sakta hoon',
    ],
    homework: `<p>Free Tier mein RDS PostgreSQL launch karo (sirf dev):</p>
      <pre># Console → RDS → Create database
# Engine: PostgreSQL (Free Tier)
# Template: Free tier
# DB instance class: db.t3.micro
# Multi-AZ: No (Free Tier, par prod mein hamesha Yes)
# Storage: 20GB gp2
# VPC: apne VPC ke private subnet
# Public access: No
# DB name, master password set karo

# Connect (EC2 se private subnet mein):
psql -h prod-db.xxx.rds.amazonaws.com -U postgres -d mydb</pre>
      <p>✅ Self-check: <code>aws rds describe-db-instances</code> mein available dikha? Psql connect hua? <b>DB delete zaroor karna baad mein!</b></p>`,
    cards: [
      { front: 'RDS managed vs self-managed (EC2 pe DB)?', back: 'RDS: AWS patches OS+DB, backups auto, replication button. Self-managed: sab tumhara. RDS = operational overhead gone, tum sirf schema.' },
      { front: 'Multi-AZ vs Read Replica?', back: '<b>Multi-AZ</b> = DR (sync, standby promote 60-120s, no read on standby, 0 data loss). <b>Read Replica</b> = read scaling (async, up to 15, readable, cross-region). Different goals!' },
      { front: 'RDS backup types?', back: '<b>Automated</b> (daily, retention 1-35 days, point-in-time recovery 5-min). <b>Manual snapshots</b> (unlimited retention, long-term). Always backup prod!' },
      { front: 'Aurora kyun better?', back: '6 copies 3 AZ mein, 10ms failover (vs 60-120s RDS), 5x PG speed, serverless option, global database. Premium but worth it for critical.' },
      { front: 'Single-AZ prod DB ka risk?', back: 'Primary mara → manual restore (hours). Startup ka $200k loss. <b>Prod DB hamesha Multi-AZ</b> — ~2x cost but DR. Sasta insurance.' },
    ],
  },

  /* ================= LEVEL 7: ELB + Auto Scaling ================= */
  {
    id: 'elbasg',
    icon: '⚖️',
    title: 'ELB + Auto Scaling — Traffic Handle Karo',
    badge: 'Scale Samrat',
    objectives: [
      '<b>Load Balancer</b> kya karta — ALB vs NLB vs CLB',
      '<b>Auto Scaling Group</b> — traffic ke hisaab se instances add/remove',
      '<b>Health checks</b> aur target groups ka role',
      'aws elbv2 / autoscaling commands se explore',
    ],
    lesson: [
      `<h3>⚖️ Load Balancer — traffic ko baant ke bhejo</h3>
       <p>1 lakh users ek EC2 pe aaye toh mar jaayega. <b>Load Balancer (LB)</b>
       beech mein — traffic ko multiple EC2 pe baantta. 3 types:</p>
       <table>
         <tr><th>Type</th><th>Layer</th><th>Use</th></tr>
         <tr><td><b>ALB</b> (Application LB)</td><td>L7 (HTTP/HTTPS)</td><td>Web apps, path-based routing (/api → API, /images → S3), WebSocket</td></tr>
         <tr><td><b>NLB</b> (Network LB)</td><td>L4 (TCP/UDP)</td><td>Ultra-low latency, gaming, IoT, fixed IP per AZ</td></tr>
         <tr><td><b>CLB</b> (Classic, legacy)</td><td>L4/L7</td><td>Purana, avoid new use</td></tr>
       </table>
       <p>💡 SAA exam mein <b>ALB</b> sabse common. ALB features: path/host
       routing, SSL termination, WebSocket, integrates with ECS/Kubernetes.</p>`,
      `<h3>📈 Auto Scaling — traffic ke hisaab se scale</h3>
       <p><b>Auto Scaling Group (ASG)</b> = EC2 instances ka group jo automatically
       scale up/down karta based on rules:</p>
       <ul>
         <li>📈 <b>Scale out:</b> CPU > 70% → 1 aur instance add</li>
         <li>📉 <b>Scale in:</b> CPU < 30% → 1 instance remove</li>
         <li>🎯 <b>Min/Max/Desired:</b> min 2, max 10, desired 3 — 2-10 ke beech
             rakhta, 3 target</li>
         <li>💓 <b>Health checks:</b> instance unhealthy → replace (mara toh
             naya banata)</li>
       </ul>
       <div class="war-story"><b>⚡ Real incident:</b> 2013 Super Bowl ka
       ad chala, 1 lakh log ek sath ek startup ki website pe. <b>Bina ASG</b>:
       server down 4 min — viral moment gone. Next year: ASG lagaya, traffic
       aate hi 5 se 50 instances, <b>0 downtime</b>. Seekh: <b>traffic
       unpredictable</b>, ASG = survival.</div>`,
      `<h3>🎯 ALB + ASG + Health Check = trio</h3>
       <p>Production ka standard combo:</p>
       <pre>Users → ALB (public) → Target Group → EC2 ASG (Multi-AZ, private)

ALB:
  - HTTP/HTTPS accept karta
  - SSL terminate (cert ALB pe)
  - Path routing: /api → api-TG, /static → s3-TG

Target Group:
  - EC2 instances register
  - Health check: GET /health har 30s
  - Unhealthy → ALB traffic band

ASG:
  - Min 2, Max 10, Desired 3
  - CloudWatch alarm: CPU > 70% → +1
  - Multi-AZ (subnet-a, subnet-b, subnet-c)
  - Mara instance → ASG naya banata, ALB pe register</pre>`,
    ],
    stages: [
      {
        type: 'match',
        title: 'LB types — naam milao',
        instructions: 'Har load balancer type ko uske use-case se milao.',
        pairs: [
          { left: 'ALB (Application LB)', right: 'L7 HTTP/HTTPS — web apps, path routing (/api → API), WebSocket, SSL terminate', explain: 'SAA exam ka most common. CloudFront ke peeche, ASG ke aage.' },
          { left: 'NLB (Network LB)', right: 'L4 TCP/UDP — ultra-low latency, gaming, IoT, fixed IP per AZ', explain: 'Performance critical. TCP-level. Fixed IP (ALB ka DNS only).' },
          { left: 'CLB (Classic)', right: 'Legacy — avoid new use, L4/L7 dono', explain: 'Purana. ALB/NLB use karo naye projects mein.' },
          { left: 'Target Group', right: 'ALB ka target — EC2 instances register, health check rules', explain: 'ALB → Target Group → EC2. Health check: GET /health har 30s.' },
          { left: 'Auto Scaling Group', right: 'EC2 instances auto add/remove based on CPU/traffic rules', explain: 'Min/Max/Desired. CloudWatch alarm triggers scale out/in.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'ALB + ASG Diagram Detective',
        instructions: 'Architecture ke components par click karo.',
        visual: 'elbasg',
        questions: [
          { q: 'Users se aate hue pehla stop — Layer-7 load balancer?', target: 'alb', explain: 'ALB = HTTP/HTTPS, SSL terminate, path routing, traffic targets pe baantta.' },
          { q: 'Instances ka group jo auto scale karta?', target: 'asg', explain: 'ASG — Min/Max/Desired, CPU-based scale out/in, mara instance replace.' },
          { q: 'Ek ek EC2 instance — ASG ka part?', target: 'instance', explain: 'EC2. ASG launch template se banaye. Multi-AZ for HA. ALB target group mein register.' },
        ],
      },
      {
        type: 'order',
        title: 'Traffic flow — user se EC2 tak',
        instructions: 'Ek HTTP request ka safar sahi order mein lagao.',
        steps: [
          { text: 'User browser mein URL type karta (DNS resolve)', explain: 'DNS (Route 53) ALB ka DNS naam resolve karta.' },
          { text: 'Request ALB pe pahunchta (HTTPS terminate)', explain: 'ALB SSL certificate handle. Path dekh ke target group chunta.' },
          { text: 'ALB health check dekhta — kaunsa target healthy?', explain: 'Target group mein health check chal raha. Unhealthy pe traffic nahi.' },
          { text: 'ALB request ek healthy EC2 pe bhejta (round-robin/least-conn)', explain: 'Load balancing algorithm. EC2 ASG ke part.' },
          { text: 'EC2 app process karke response ALB ko', explain: 'App chalta, response bhejta. ALB user ko wapas.' },
          { text: 'ALB response user ko bhejta', explain: 'ALB stateful (sticky sessions possible). Response path automatic.' },
        ],
      },
      {
        type: 'quiz',
        title: 'ELB + ASG Quick-fire',
        questions: [
          {
            q: 'ALB ka "path-based routing" ka matlab?',
            choices: [
              '/api/* → API target group, /static/* → S3 target group, /admin → admin TG. Ek ALB, multiple backends',
              'ALB path mein chalta (geography)',
              'ALB traffic ko shortest path bhejta',
              'Path = ALB ka URL',
            ],
            answer: 0,
            explain: 'Ek ALB, multiple services. /api → microservice-1, /images → S3, / → frontend. Saves cost (1 LB for many apps).',
          },
          {
            q: 'ASG mein Min=2, Max=10, Desired=3. CPU 90% ho gaya. Kya hoga?',
            choices: [
              'CloudWatch alarm trigger → scale out, naye instances add (3 → 4 → 5...) jab tak CPU normal ya Max=10',
              'Kuch nahi — Desired fix 3 rahega',
              'Sab instances band ho jayenge',
              'ASG email bhejega admin ko',
            ],
            answer: 0,
            explain: 'Scale out policy. Desired badhega, Max tak. CPU normal → scale in (Desired wapas 3 tak).',
          },
          {
            q: 'Instance mara (health check fail). ASG kya karega?',
            choices: [
              'Naya instance launch karega (replace), ALB pe register — traffic automatic shift',
              'Marai hui instance ko restart karne ki koshish',
              'Email bhejega aur wait karega',
              'Sab traffic band kar dega',
            ],
            answer: 0,
            explain: 'Self-healing! ASG m instance replace. Cattle, not pets. ALB health check pe unhealthy → traffic band, ASG replacement.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Scaling & LB',
      instructions: 'Architecture round — scaling concepts. 🎤',
      questions: [
        {
          q: '"ALB aur NLB kab use karein?" — interviewer.',
          choices: [
            'ALB = HTTP/HTTPS web apps (L7, path routing, SSL). NLB = TCP/UDP ultra-low latency, fixed IP, gaming/IoT (L4)',
            'ALB sabse fast, NLB slow',
            'Dono same, sirf price farak',
            'ALB free, NLB paid',
          ],
          answer: 0,
          explain: 'Layer-7 (HTTP) = ALB. Layer-4 (TCP) = NLB. NLB lower latency, fixed IP per AZ. ALB features zyada (routing, WebSocket).',
        },
        {
          q: 'Scenario: traffic spike aaya, app slow ho gaya. ASG lagana bhool gaye. Kya karoge?',
          choices: [
            'ASG setup karo: min 2, max 10, CloudWatch CPU > 70% → scale out. Multi-AZ. ALB ke peeche. Future spikes auto-handle',
            'Bada instance type change karo (vertical scale) — temporary fix',
            'Users ko rate limit lagao',
            'AWS ko call karke more bandwidth maango',
          ],
          answer: 0,
          explain: 'ASG = horizontal scaling, auto. Vertical (bada instance) = limit hit. Multi-AZ + ALB + ASG = production-ready.',
        },
        {
          q: 'Interviewer: "Health check kaam nahi kar raha, traffic unhealthy instance pe ja raha. Debug?"',
          choices: [
            'Target group ka health check path/code check karo (/health should return 200). SG: ALB se EC2 pe health port allow. CloudWatch metrics',
            'ALB delete karke naya banao',
            'Sab instances terminate karo',
            'ASG disable kar do',
          ],
          answer: 0,
            explain: 'Common issue: /health route missing ya 500 return. Ya SG block ALB → EC2. Debug: target group → health check details. CloudWatch.',
        },
      ],
    },
    success: [
      'Main ALB/NLB/CLB ka farak aur kab kya use karna hai bata sakta hoon',
      'Main Auto Scaling Group (Min/Max/Desired, scale out/in, health checks) explain kar sakta hoon',
      'Main ALB → Target Group → ASG → EC2 ka poora traffic flow samjhta hoon',
      'Main aws elbv2/autoscaling commands se LB aur ASG inspect kar sakta hoon',
    ],
    homework: `<p>Free Tier mein ALB + ASG setup (thoda advance, par try karo):</p>
      <pre># 1. Launch template banao (AMI: Amazon Linux, userdata: nginx install)
# 2. ASG banao: min 2, max 4, desired 2, multi-AZ
# 3. ALB banao (internet-facing), listener HTTP:80
# 4. Target group banao, ASG attach
# 5. ALB DNS kholo browser mein — nginx welcome page dikhe

# Verify:
aws elbv2 describe-load-balancers
aws autoscaling describe-auto-scaling-groups</pre>
      <p>✅ Self-check: ALB DNS pe page dikha? 2 instances ASG mein? <b>Sab delete karna baad mein!</b> (ALB + ASG + EC2)</p>`,
    cards: [
      { front: 'ALB vs NLB?', back: '<b>ALB</b> = L7 HTTP/HTTPS, path routing, SSL terminate, WebSocket (web apps). <b>NLB</b> = L4 TCP/UDP, ultra-low latency, fixed IP per AZ (gaming/IoT).' },
      { front: 'ASG Min/Max/Desired ka matlab?', back: 'Min = minimum instances (always), Max = ceiling, Desired = target. CPU > 70% → scale out (Desired+1, Max tak). CPU < 30% → scale in.' },
      { front: 'Instance health check fail — kya hoga?', back: 'ASG <b>naya instance launch</b> karke replace (self-healing). ALB pe register. Cattle, not pets. ~min mein replacement.' },
      { front: 'ALB path-based routing?', back: 'Ek ALB, multiple backends. <code>/api → api-TG</code>, <code>/static → s3-TG</code>, <code>/ → frontend-TG</code>. Cost saving (1 LB many apps).' },
      { front: 'ALB + ASG + Multi-AZ = ?', back: 'Production-ready HA. ALB public, ASG private Multi-AZ. Traffic auto-baant, failure survive, auto-scale. SAA exam bread-and-butter.' },
    ],
  },

  /* ================= LEVEL 8: BOSS — First Architecture ================= */
  {
    id: 'boss1',
    icon: '🏆',
    title: 'Boss: First 3-Tier Architecture',
    badge: 'Cloud Pandit',
    objectives: [
      'Poora 3-tier web app architecture design karna (ALB → EC2 ASG → RDS)',
      'Saare beginner concepts ek saath jodna',
      'aws CLI se complete infrastructure verify karna',
      'Boss-level interview marathon',
    ],
    lesson: [
      `<h3>🏆 Boss level — saab kuch jodo</h3>
       <p>Pichhle 7 levels mein tumne alag-alag seekha: IAM, EC2, S3, VPC, RDS,
       ELB+ASG. Ab in sab ko <b>jodke ek complete architecture</b> banao —
       jaise real SAA exam mein poocha jaata.</p>
       <p>Goal: ek <b>3-tier web application</b> jo:</p>
       <ul>
         <li>🌐 Internet se accessible (ALB public)</li>
         <li>🖥️ Auto-scales traffic ke saath (ASG multi-AZ)</li>
         <li>🗄️ Data safe (RDS Multi-AZ, S3 images)</li>
         <li>🔒 Secure (private subnet DB, SG rules, IAM roles)</li>
         <li>⚡ Survives failure (ek AZ down bhi chale)</li>
       </ul>`,
      `<h3>🏗️ Architecture — piece by piece</h3>
       <pre>🌐 Users (internet)
   ↓
📡 Route 53 (DNS) → ALB
   ↓
🌐 VPC (10.0.0.0/16, Multi-AZ)
   ├── Public subnets (AZ-a, AZ-b, AZ-c)
   │     └── ALB (internet-facing)
   ├── Private subnets (AZ-a, AZ-b, AZ-c)
   │     └── ASG: 3 EC2 (web app)
   └── DB subnets (AZ-a, AZ-b)
         └── RDS Multi-AZ (primary + standby)
🪣 S3 (images, static assets)
🔐 IAM roles (EC2 → S3 read, RDS access)</pre>
       <p>💡 <b>Key decisions:</b></p>
       <ul>
         <li>ALB public (lets users in), EC2 private (hackar direct nahi pahunche)</li>
         <li>RDS Multi-AZ (DR, 60-120s failover)</li>
         <li>ASG Multi-AZ (ek AZ down bhi 2/3 instances chal rahe)</li>
         <li>S3 for images (CDN-ready, cheap)</li>
         <li>EC2 IAM role → S3 access (no hard-coded keys!)</li>
       </ul>`,
      `<h3>🚨 Common Boss-level mistakes (interview mein avoid karo)</h3>
       <ul>
         <li>❌ EC2 public subnet mein (internet se hack) → ✅ Private, ALB se</li>
         <li>❌ RDS single-AZ (no DR) → ✅ Multi-AZ</li>
         <li>❌ Hard-coded AWS keys EC2 pe → ✅ IAM role</li>
         <li>❌ SSH 0.0.0.0/0 → ✅ SSM Session Manager ya internal only</li>
         <li>❌ S3 public bucket (images) → ✅ CloudFront signed URLs</li>
         <li>❌ SG: DB 0.0.0.0/0 port 5432 → ✅ Source = app SG</li>
       </ul>
       <div class="war-story"><b>⚡ Real architecture:</b> Yehi architecture
       Netflix, Airbnb, Slack jaise companies use karte hain (with extras —
       CloudFront, ElastiCache, microservices). Tumne beginner level mein
       yeh banaya — bahut bada milestone! Certificate ready. 🏆</div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Sahi ya Galat architecture decision?',
        instructions: 'Har decision ko sahi ya galat bin mein daalo — production best practice ke hisaab se.',
        bins: [
          { id: 'right', label: '✅ Sahi (best practice)' },
          { id: 'wrong', label: '❌ Galat (anti-pattern)' },
        ],
        items: [
          { text: 'EC2 app ko private subnet mein, ALB se access', bin: 'right', explain: 'Hackar internet se direct EC2 nahi pahunche. ALB beech mein.' },
          { text: 'RDS Multi-AZ on for production', bin: 'right', explain: 'DR. Primary mara → standby promote 60-120s. Sasta insurance.' },
          { text: 'EC2 pe hard-coded AWS access key (S3 ke liye)', bin: 'wrong', explain: 'NEVER. IAM role use karo. Key git mein leak, laptop chala jaaye.' },
          { text: 'SSH (port 22) 0.0.0.0/0 pe khula', bin: 'wrong', explain: 'Bots brute-force. SSM Session Manager ya internal CIDR.' },
          { text: 'S3 images bucket public (sab read)', bin: 'wrong', explain: 'CloudFront signed URLs for private. Public = leak risk.' },
          { text: 'DB security group: source = app SG (not CIDR)', bin: 'right', explain: 'SG reference = sirf app se DB access. Tightest possible.' },
          { text: 'ASG single-AZ (sasta)', bin: 'wrong', explain: 'AZ down → sab instances gone. Multi-AZ for HA.' },
          { text: 'ALB SSL termination (cert ALB pe)', bin: 'right', explain: 'HTTPS user se ALB tak. ALB → EC2 HTTP (internal, fast).' },
        ],
      },
      {
        type: 'incident',
        title: '🚨 Incident: Black Friday Outage',
        instructions: '3 AM pager. App down. Debug karo — decision tree.',
        pager: `🚨 ALERT: E-commerce app DOWN — Black Friday sale
HTTP 502 Bad Gateway — ALB se
Traffic: 50x normal (sale day)
Time: 3:07 AM IST`,
        start: 'n1',
        nodes: {
          n1: {
            sitrep: 'aws ec2 describe-instances → 3 instances Running\naws elbv2 describe-target-groups → 0 healthy targets!',
            text: 'ALB ke saare targets unhealthy dikha rahe. Pehla kadam?',
            choices: [
              { t: 'Target group ka health check path verify karo (/health 200 return karna chahiye)', good: true, next: 'n2', explain: 'Sahi. Health check fail → ALB traffic band. Root cause yahi hai.' },
              { t: 'ALB delete karke naya banao', good: false, explain: 'Galat — ALB sahi hai, targets unhealthy. Naya banake problem nahi solve.' },
              { t: 'Sab instances terminate karo', good: false, explain: 'Galat — ASG wapas naya banayega but root cause fix nahi.' },
            ],
          },
          n2: {
            sitrep: 'EC2 pe SSH: curl localhost:80 → 503\nApp logs: "DB connection refused"',
            text: 'App DB se connect nahi ho raha. Debug kaise?',
            choices: [
              { t: 'RDS status check — Multi-AZ failover hua? SG: EC2 → RDS port 5432 allow?', good: true, next: 'n3', explain: 'Sahi. DB connection issue — RDS down ya SG block. Dono check karo.' },
              { t: 'App code debug karo ( Profiler chalao)', good: false, explain: 'Galat — code issue nahi, infrastructure issue. DB connection.' },
              { t: 'Traffic kam karo (rate limit)', good: false, explain: 'Galat — symptom chhupana, root cause nahi.' },
            ],
          },
          n3: {
            sitrep: 'aws rds describe-db-instances → Multi-AZ failover in progress\nDB SG ingress: source = 0.0.0.0/0 (not app SG)!',
            text: 'Failover chal raha. Wait karo ya aur kuch?',
            choices: [
              { t: 'Failover complete hone do (60-120s), aur DB SG ko fix karo: source = app SG (not 0.0.0.0/0) — security hole bhi dhundo', good: true, next: 'n4', explain: 'Sahi — failover wait + security fix. SG galat tha (0.0.0.0/0 = hack risk).' },
              { t: 'Manual failover trigger karo (reboot with failover)', good: false, explain: 'Galat — already in progress. Wait karo.' },
              { t: 'Naya RDS launch karo', good: false, explain: 'Galat — overkill. Failover handle karega.' },
            ],
          },
          n4: {
            sitrep: 'Failover done. App reconnect. Health check 200. ALB traffic wapas.\nSG fix applied: DB source = app-sg.',
            text: 'App wapas up. Long-term kya improve karo?',
            choices: [
              { t: 'CloudWatch alarm: DB connections, failover alert. ASG scale based on request count. Multi-AZ already. Post-mortem doc likho', good: true, next: 'end', explain: 'Sahi — observability + auto-reaction. Post-mortem = culture.' },
              { t: 'Kuch nahi — chalta hai ab', good: false, explain: 'Galat — yeh dobara ho sakta. Monitoring + alerting zaroori.' },
              { t: 'RDS Multi-AZ band kar do (sasta)', good: false, explain: 'Galat — yahi to bacha! Multi-AZ DR deta.' },
            ],
          },
          end: { end: true, text: '🧯 Incident resolved!', summary: '<b>Root cause:</b> RDS failover chal raha tha, app DB connect nahi kar paaya → /health 503 → ALB targets unhealthy → 502.<br><b>Found:</b> DB SG 0.0.0.0/0 (security hole).<br><b>Fixes:</b> (1) Failover complete, (2) SG fixed, (3) CloudWatch alarms + post-mortem.<br><b>Seekh:</b> Health check DB dependency expose karta. Multi-AZ DR deta but app ko <b>retry logic</b> chahiye failover ke 60-120s ke liye.' },
        },
      },
      {
        type: 'terminal',
        title: '🖥️ Boss Mission: Architecture Audit',
        instructions: 'Complete 3-tier architecture verify karo — sab pieces jude hain?',
        goal: 'Poora infrastructure audit: <b>(1)</b> ALB hai? <b>(2)</b> ASG hai? <b>(3)</b> RDS Multi-AZ hai? <b>(4)</b> S3 bucket hai? Sab commands chalao.',
        tasks: [
          { text: 'ALB check: aws elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
          { text: 'ASG check: aws autoscaling describe-auto-scaling-groups', check: s => s.history.some(h => /aws autoscaling describe-auto-scaling-groups/.test(h)) },
          { text: 'RDS check: aws rds describe-db-instances', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
          { text: 'S3 check: aws s3 ls', check: s => s.history.some(h => /aws s3 ls\b/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/admin' },
          elbs: [{ id: 'alb-001', name: 'web-alb', type: 'application', scheme: 'internet-facing', dns: 'web-alb-123.us-east-1.elb.amazonaws.com' }],
          asgs: [{ name: 'web-asg', min: 2, max: 10, desired: 3, instances: ['i-1', 'i-2', 'i-3'], vpcZone: 'subnet-a,subnet-b,subnet-c', lb: 'web-alb' }],
          rds: [{ id: 'prod-db', name: 'prod-db', engine: 'postgres', class: 'db.r6.large', state: 'available', multiAZ: true, endpoint: 'prod-db.abc.rds.amazonaws.com', storage: 100 }],
          buckets: [{ name: 'shop-images-2024', region: 'us-east-1', encryption: true, public: false, objects: [] }],
          vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        success: s => [
          /aws elbv2 describe-load-balancers/.test(s.history.join(' ')),
          /aws autoscaling describe-auto-scaling-groups/.test(s.history.join(' ')),
          /aws rds describe-db-instances/.test(s.history.join(' ')),
          /aws s3 ls\b/.test(s.history.join(' ')),
        ].every(Boolean),
        successText: 'Poora architecture verify! ALB (internet-facing) + ASG (3 instances, multi-AZ, scale 2-10) + RDS (Multi-AZ on!) + S3 (encrypted, private). Yehi <b>SAA exam ka classic 3-tier</b>. Tumne beginner track ka har piece joda — Cloud Pandit certificate ready! 🏆',
        hints: [
          'aws elbv2 describe-load-balancers — ALB dekho',
          'aws autoscaling describe-auto-scaling-groups — ASG',
          'aws rds describe-db-instances — RDS Multi-AZ?',
          'aws s3 ls — bucket dekho',
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Boss Architecture',
      instructions: 'Final interview — full architecture round. 🎤',
      questions: [
        {
          q: 'Interviewer: "Ek e-commerce app design karo — 1 lakh daily users, 99.9% uptime." Sahi architecture summary?',
          choices: [
            'Route 53 → ALB (public, Multi-AZ) → ASG of EC2 (private, Multi-AZ, 3+ min) → RDS Multi-AZ (private DB subnets) → S3 (images). CloudFront for CDN. IAM roles, SG tight',
            'Ek bada EC2 instance — sab kuch usi pe',
            'Sirf S3 static website — no EC2',
            'Lambda + API Gateway — serverless sab',
          ],
          answer: 0,
          explain: 'Yehi classic 3-tier. Multi-AZ har layer pe. ALB public, app private. RDS Multi-AZ. S3 for static. CloudFront for global. Yehi SAA exam ka answer.',
        },
        {
          q: 'Scenario: app ko S3 se images read karni hain. Best practice?',
          choices: [
            'EC2 pe IAM role lagao with S3 read policy. App role assume kare. No hard-coded keys, CloudTrail audit',
            'S3 bucket public kar do — sab read',
            'AWS access key EC2 ke env mein',
            'Images EC2 ke EBS pe copy kar lo',
          ],
          answer: 0,
          explain: 'IAM role = security best practice. Temporary STS token, no key leak. SAA exam mein yeh answer hamesha.',
        },
        {
          q: '"Ek AZ down ho gaya — tumhari app kaise survive karegi?" — senior Q.',
          choices: [
            'Multi-AZ har layer pe: ALB (Multi-AZ), ASG (3 AZs — 2 bachenge), RDS Multi-AZ (standby promote). Traffic automatic shift. 99.9%+ uptime',
            'AWS automatic recovery karta hai — kuch nahi karna',
            'Manual failover — admin call karo',
            'App down — ek AZ pe bharosa mat karo',
          ],
          answer: 0,
          explain: 'HA = Multi-AZ har layer. ALB Multi-AZ, ASG 3 AZs, RDS Multi-AZ. Ek AZ down → 2/3 EC2 chal rahe, RDS failover, ALB redirect. Zero downtime.',
        },
      ],
    },
    success: [
      'Main complete 3-tier web app architecture design kar sakta hoon (ALB → ASG → RDS + S3)',
      'Main production best practices (Multi-AZ, IAM roles, SG tight, private subnets) samjhta hoon',
      'Main aws CLI se complete infrastructure audit kar sakta hoon',
      'Main interview mein architecture question confidently answer kar sakta hoon — Cloud Pandit ready! 🏆',
    ],
    homework: `<p>Apne AWS account mein complete 3-tier banao (Free Tier + caution):</p>
      <pre># 1. VPC (multi-AZ, public + private subnets)
# 2. RDS PostgreSQL Multi-AZ (Free Tier: single-AZ OK)
# 3. EC2 launch template (Amazon Linux + nginx + app)
# 4. ASG: min 2, max 4, Multi-AZ
# 5. ALB: internet-facing, target group → ASG
# 6. S3 bucket for images (private, encryption on)
# 7. IAM role for EC2 (S3 read)
# 8. Route 53 (ya ALB DNS direct) — browser mein test

# Verify sab:
aws elbv2 describe-load-balancers
aws autoscaling describe-auto-scaling-groups
aws rds describe-db-instances
aws s3 ls</pre>
      <p>✅ Self-check: Browser mein app dikha? 2 EC2 ASG mein? RDS available? <b>Sab delete karna baad mein — bill avoid!</b></p>`,
    cards: [
      { front: '3-tier web app architecture (SAA classic)?', back: 'Route 53 → ALB (public, Multi-AZ) → ASG of EC2 (private, Multi-AZ) → RDS Multi-AZ (private DB subnets) + S3 (images). CloudFront for CDN. IAM roles, SG tight.' },
      { front: 'EC2 private subnet kyun, public nahi?', back: 'Hackar internet se direct EC2 nahi pahunche. ALB beech mein (public). EC2 private — sirf ALB se access. SG: ALB → EC2 allow.' },
      { front: 'Multi-AZ har layer pe kyun?', back: 'ALB Multi-AZ = ek AZ down bhi traffic serve. ASG 3 AZs = 2/3 bachenge. RDS Multi-AZ = primary mara toh standby. HA = har layer redundant.' },
      { front: 'EC2 ko S3 access — best practice?', back: '<b>IAM role</b> EC2 pe lagao (S3 read policy). App role assume — temporary STS token, no hard-coded key. CloudTrail audit. NEVER key in env.' },
      { front: 'App DB connect nahi kar paaya — debug flow?', back: '1) <code>aws rds describe-db-instances</code> — Multi-AZ failover? 2) SG: app → DB port allow? 3) App logs: connection refused? 4) Retry logic in app for failover window.' },
    ],
  },

]);
