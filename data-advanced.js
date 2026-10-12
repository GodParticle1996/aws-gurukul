/* =====================================================================
   AWS Gurukul — Track 3: 🚀 Advanced (Guru Path)
   Senior Solutions Architect ka shastra. Design, optimize, modernize.
   ===================================================================== */

AG.registerLevels('advanced', [

  /* ================= LEVEL 1: Well-Architected Framework ================= */
  {
    id: 'wellarch',
    icon: '🏛️',
    title: 'Well-Architected Framework — 6 Pillars',
    badge: 'Pillar Pandit',
    objectives: [
      '<b>6 pillars</b> of Well-Architected Framework',
      'Har pillar ke <b>design principles</b>',
      '<b>Well-Architected Tool</b> ka use',
      'Architecture review kaise kare',
    ],
    lesson: [
      `<h3>🏛️ Well-Architected — AWS ka architecture mantra</h3>
       <p>AWS ne lakho customer interactions se <b>6 pillars</b> nikaale —
       jinpe achhi architecture tikti hai. SAA exam ki atma yahin hai.</p>
       <table>
         <tr><th>Pillar</th><th>Matlab</th><th>Example</th></tr>
         <tr><td>1️⃣ <b>Operational Excellence</b></td><td>Achhe se chalo, monitor, improve</td><td>IaC (Terraform), small frequent changes, runbooks</td></tr>
         <tr><td>2️⃣ <b>Security</b></td><td>Sab layers pe protection</td><td>Least privilege, KMS, GuardDuty, encryption</td></tr>
         <tr><td>3️⃣ <b>Reliability</b></td><td>Failure survive, recover</td><td>Multi-AZ, auto-recover, test failures (chaos)</td></tr>
         <tr><td>4️⃣ <b>Performance Efficiency</b></td><td>Sahi resource, scale</td><td>Right instance type, autoscaling, CDN</td></tr>
         <tr><td>5️⃣ <b>Cost Optimization</b></td><td>Kam paisa, same value</td><td>Reserved, Spot, rightsize, lifecycle</td></tr>
         <tr><td>6️⃣ <b>Sustainability</b></td><td>Min resource, max benefit</td><td>Efficient code, right-size, sustainable regions</td></tr>
       </table>`,
      `<h3>🎯 Design principles — har pillar ke</h3>
       <p>Har pillar ke <b>design principles</b> hain — architecture review
       ke checkpoints:</p>
       <ul>
         <li>🛠️ <b>Operational:</b> IaC, small reversible changes, learn from
             failure, runbooks</li>
         <li>🔒 <b>Security:</b> least privilege, all layers, trace everything,
             automate security</li>
         <li>♻️ <b>Reliability:</b> test recovery, design for failure,
             graceful degradation</li>
         <li>⚡ <b>Performance:</b> right resource, scale to demand,
             use managed services</li>
         <li>💰 <b>Cost:</b> pay for value, rightsize, lifecycle, Reserved</li>
         <li>🌱 <b>Sustainability:</b> min resource, max benefit, efficient</li>
       </ul>
       <div class="war-story"><b>⚡ Real use:</b> Ek startup ne IPO se pehle
       <b>Well-Architected Tool</b> review karwaya. 50 questions, har pillar
       pe. Pata chala: 8 critical risks (no DR, over-permissioned IAM,
       no encryption). Fix karke IPO clean chali. Investors ko confidence.
       Well-Architected = <b>due diligence tool</b>.</div>`,
      `<h3>🔍 Well-Architected Tool — free review</h3>
       <p>AWS ka <b>Well-Architected Tool</b> (free) — tumhari architecture
       review karta. Workflow:</p>
       <ol>
         <li>📝 <b>Define workload</b> — app name, description</li>
         <li>❓ <b>50 questions</b> — 6 pillars pe (best practices)</li>
         <li>⚠️ <b>Identify risks</b> — kahan deviate from best practice</li>
         <li>📋 <b>Improvement plan</b> — action items</li>
         <li>✅ <b>Track progress</b> — risks mitigate</li>
       </ol>
       <p>💡 Review quarterly karne ka mantr. Architecture drift detect hota.</p>`,
    ],
    stages: [
      {
        type: 'match',
        title: '6 Pillars — naam milao',
        instructions: 'Har pillar ko uske focus se milao.',
        pairs: [
          { left: 'Operational Excellence', right: 'Run & monitor, IaC, small frequent changes, runbooks', explain: 'Achhe se chalo. Automation, learn from failure.' },
          { left: 'Security', right: 'Least privilege, all layers, trace, automate', explain: 'Sab layers pe. KMS, GuardDuty, IAM.' },
          { left: 'Reliability', right: 'Multi-AZ, test recovery, design for failure, chaos', explain: 'Failure survive. Test, don\'t assume.' },
          { left: 'Performance Efficiency', right: 'Right resource, scale to demand, managed services', explain: 'Sahi tool for job. Auto-scale, CDN.' },
          { left: 'Cost Optimization', right: 'Pay for value, rightsize, Reserved, lifecycle', explain: 'Kam paisa same value. No waste.' },
          { left: 'Sustainability', right: 'Min resource, max benefit, efficient code', explain: 'Environment. Efficient, right-size.' },
        ],
      },
      {
        type: 'bins',
        title: 'Konsa pillar? — scenario sort karo',
        instructions: 'Har action ko sahi pillar bin mein daalo.',
        bins: [
          { id: 'op', label: '🛠️ Operational' },
          { id: 'sec', label: '🔒 Security' },
          { id: 'rel', label: '♻️ Reliability' },
          { id: 'cost', label: '💰 Cost' },
        ],
        items: [
          { text: 'Terraform se infrastructure deploy', bin: 'op', explain: 'IaC = Operational Excellence. Repeatable, versioned.' },
          { text: 'IAM least privilege + KMS encryption', bin: 'sec', explain: 'Security pillar. Layers + least privilege.' },
          { text: 'Multi-AZ + chaos engineering (failure test)', bin: 'rel', explain: 'Reliability. Test recovery, design for failure.' },
          { text: 'Reserved Instances + S3 lifecycle', bin: 'cost', explain: 'Cost Optimization. Commit discount + auto class.' },
          { text: 'Runbook for incident response', bin: 'op', explain: 'Operational. Documented procedures.' },
          { text: 'GuardDuty + CloudTrail audit', bin: 'sec', explain: 'Security. Detection + audit.' },
          { text: 'Auto Scaling + CloudFront for performance', bin: 'rel', explain: 'Reliability (also Performance). Scale + edge. Close call — Performance pillar actually, but auto-scale handles traffic = reliability too.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Well-Architected Quick-fire',
        questions: [
          {
            q: 'Well-Architected Tool ka primary purpose?',
            choices: [
              'Architecture review against 6 pillars — identify risks, improvement plan. Free, quarterly recommended',
              'S3 cost calculator',
              'EC2 monitoring tool',
              'IAM policy generator',
            ],
            answer: 0,
            explain: 'Review tool. 50 questions, 6 pillars, risks + plan. Due diligence before launch/IPO. Free.',
          },
          {
            q: 'Reliability pillar ka key design principle?',
            choices: [
              'Test recovery (chaos engineering), design for failure, multi-AZ, graceful degradation',
              'Lowest cost instance',
              'Encrypt everything',
              'Use Terraform',
            ],
            answer: 0,
            explain: 'Reliability = test, don\'t assume. Chaos engineering (Netflix Chaos Monkey). Multi-AZ. Graceful degradation.',
          },
          {
            q: 'Kaunsa pillar "least privilege + all layers" pe focus karta?',
            choices: [
              'Security',
              'Cost',
              'Operational',
              'Sustainability',
            ],
            answer: 0,
            explain: 'Security pillar. Least privilege (IAM), all layers (WAF+SG+NACL+KMS), trace (CloudTrail), automate.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Well-Architected',
      instructions: 'Framework round. 🎤',
      questions: [
        {
          q: '"Well-Architected Framework ke 6 pillars batao" — interviewer.',
          choices: [
            '1) Operational Excellence 2) Security 3) Reliability 4) Performance Efficiency 5) Cost Optimization 6) Sustainability',
            'Sirf 3 pillars hote hain',
            '10 pillars',
            'Pillars nahi, principles hote hain',
          ],
          answer: 0,
            explain: 'Yeh THE framework question hai. 6 pillars. Earlier 5 tha, 2021 mein Sustainability (6th) add hua. Exam mein yaad rakho.',
        },
        {
          q: 'Scenario: tumhari app pe frequent outages. Kaunsa pillar weak?',
          choices: [
            'Reliability — multi-AZ missing, no chaos test, no auto-recover. Well-Architected Tool review se pata chal jaata',
            'Cost — sasta hai isliye gira',
            'Security — hack ho gaya',
            'Operational — chal raha',
          ],
          answer: 0,
          explain: 'Outages = Reliability weak. Review: multi-AZ, test recovery, chaos engineering, auto-recover, graceful degradation.',
        },
        {
          q: 'Interviewer: "Well-Architected Tool kaise use karoge?"',
          choices: [
            'Workload define → 50 questions (6 pillars) → risks identify → improvement plan → quarterly review. Architecture drift track',
            'Sirf ek baar launch pe',
            'AWS khud chalata',
            'Sirf prod ke liye',
          ],
          answer: 0,
          explain: 'Continuous process. Quarterly review. Drift detect (naya service add, config change). Risks mitigate, track.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Well-Architected review simulation! Architecture audit karke <b>risks identify</b> karo: <b>(1)</b> CloudFront distributions check karo (CDN enabled?). <b>(2)</b> RDS instances dekho (Multi-AZ?). <b>(3)</b> CloudWatch alarms dekho (monitoring setup?).',
            tasks: [
              { text: 'aws cloudfront list-distributions — CDN check', check: s => s.history.some(h => /aws cloudfront list-distributions/.test(h)) },
              { text: 'aws rds describe-db-instances — Multi-AZ check', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
              { text: 'aws cloudwatch describe-alarms — monitoring check', check: s => s.history.some(h => /aws cloudwatch describe-alarms/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              cloudfront: [{ id: 'E1', domain: 'd1.cloudfront.net', status: 'Deployed', enabled: true, origins: ['app-s3.amazonaws.com'] }],
              rds: [{ id: 'prod-db', name: 'prod-db', engine: 'postgres', class: 'db.r6.large', state: 'available', multiAZ: false, endpoint: 'prod-db.cxxx.rds.amazonaws.com', storage: 100 }],
              alarms: [],
              buckets: [],
            },
            success: s => s.history.some(h => /aws cloudfront list-distributions/.test(h)) && s.history.some(h => /aws rds describe-db-instances/.test(h)) && s.history.some(h => /aws cloudwatch describe-alarms/.test(h)),
            successText: 'Well-Architected review complete! 📋 Findings: <b>CDN</b> ✅ (CloudFront enabled), <b>Reliability</b> ❌ (prod-db NOT Multi-AZ — single AZ, no failover), <b>Operational Excellence</b> ❌ (ZERO CloudWatch alarms — no monitoring!). Risks: 2 critical. Improvement plan: (1) RDS Multi-AZ enable karo, (2) CloudWatch alarms setup karo (CPU > 80%, disk > 90%, DB connection count). Yehi Well-Architected Tool ka flow hai — identify risks, create improvement plan.',
            hints: [
              'aws cloudfront list-distributions — CDN enabled hai?',
              'aws rds describe-db-instances — MultiAZ true ya false?',
              'aws cloudwatch describe-alarms — koi alarms setup hain?',
            ],
          },
        },
      ],
    },
    success: [
      'Main 6 pillars aur unke focus bata sakta hoon',
      'Main har pillar ke design principles samjhta hoon',
      'Main Well-Architected Tool ka use explain kar sakta hoon',
      'Main architecture review aur risk identification kar sakta hoon',
    ],
    homework: `<p>Apne AWS account mein Well-Architected Tool review karo:</p>
      <pre># Console → Well-Architected Tool → Define workload
# Name: my-app, description
# Answer 50 questions honestly (6 pillars)
# Review risks (high/medium)
# Create improvement plan
# Quarterly revisit</pre>
      <p>✅ Self-check: Kuch risks identify hue? Improvement plan bana?</p>`,
    cards: [
      { front: '6 pillars of Well-Architected?', back: '1) <b>Operational Excellence</b> 2) <b>Security</b> 3) <b>Reliability</b> 4) <b>Performance Efficiency</b> 5) <b>Cost Optimization</b> 6) <b>Sustainability</b> (2021 add).' },
      { front: 'Reliability pillar key principles?', back: 'Test recovery (chaos engineering), design for failure, multi-AZ, graceful degradation. <b>Test, don\'t assume.</b> Netflix Chaos Monkey.' },
      { front: 'Well-Architected Tool?', back: 'Free AWS tool. Workload define → 50 questions (6 pillars) → risks identify → improvement plan. <b>Quarterly review</b>. Due diligence.' },
      { front: 'Security pillar principles?', back: 'Least privilege (IAM), all layers (WAF+SG+NACL+KMS), trace everything (CloudTrail), automate security (GuardDuty).' },
      { front: 'Cost Optimization pillar?', back: 'Pay for value, rightsize, Reserved/Savings Plans, Spot for batch, S3 lifecycle. No waste. Cost Explorer + Budgets.' },
    ],
  },

  /* ================= LEVEL 2: Organizations & Multi-Account ================= */
  {
    id: 'orgs',
    icon: '🏢',
    title: 'Organizations — Multi-Account Governance',
    badge: 'Landing Zone Lord',
    objectives: [
      '<b>Multi-account strategy</b> — blast radius, isolation, billing',
      '<b>OUs + SCPs</b> — guardrails jo admin bhi tod na sake',
      '<b>Control Tower</b> — landing zone, guardrails, Account Factory',
      '<b>Cross-account access</b> — role assume, org CloudTrail, consolidated billing',
    ],
    lesson: [
      `<h3>🏢 Ek account kaafi kyun nahi</h3>
       <p>Junior architect ek AWS account mein dev/staging/prod ko tags aur IAM se
       alag karta hai. Senior architect <b>alag accounts</b> banata hai. Kyun?</p>
       <ul>
         <li>💥 <b>Blast radius</b> — dev mein galti se <code>terraform destroy</code>
             chala? Prod ek doosre account mein hai, chhua tak nahi gaya. IAM
             boundary galti se todi ja sakti hai; account boundary AWS ki hai.</li>
         <li>📊 <b>Billing clarity</b> — "kaunsi team ne $40k jalaye?" ka jawab
             account-level par apne aap milta hai, tag hygiene ki umeed par nahi.</li>
         <li>📈 <b>Service quotas</b> — limits per-account hoti hain. Ek shor
             machane wali team dusri ka Lambda concurrency nahi kha sakti.</li>
         <li>🔒 <b>Compliance</b> — PCI/HIPAA workload apne account mein, audit
             scope chhota.</li>
       </ul>
       <p><b>Typical account layout:</b> management (sirf billing + org, koi
       workload nahi), log-archive (org CloudTrail sink), audit/security
       (read-only cross-account), phir prod/staging/dev per workload.</p>
       <p>⚠️ <b>Management account mein workload MAT chalao.</b> Woh account SCPs
       se restrict hi nahi hota — SCP root par lagao tab bhi management account par
       apply nahi hoti. Compromise hua toh poori org gayi.</p>`,
      `<h3>🚧 SCP — guardrail, grant nahi</h3>
       <p>Sabse zyada galat samjha jaane wala concept. SCP kisi ko permission
       <b>deti nahi</b> — sirf <b>maximum</b> set karti hai.</p>
       <pre>Effective permission = SCP (ceiling) ∩ IAM policy (grant)

IAM policy: Allow s3:*        SCP: Deny s3:DeleteBucket
→ user s3 sab kar sakta hai, DeleteBucket NAHI — chahe woh account admin ho</pre>
       <pre># SCP: sirf do region allow (data residency)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringNotEquals": { "aws:RequestedRegion": ["ap-south-1", "us-east-1"] }
    }
  }]
}</pre>
       <p>SCP OU par lagti hai (ya account par) aur <b>neeche sab</b> inherit karte
       hain. Root par <code>FullAWSAccess</code> by default attached hoti hai —
       hata di toh poori org lock ho jaati hai.</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek company ne cost bachane
       ke liye Sandbox OU par SCP lagayi: sirf <code>t3.*</code> aur
       <code>t4g.*</code> instance types allow. Do hafte baad ek data scientist ne
       ticket kaata — "mera SageMaker training job AccessDenied de raha hai, par
       mere paas AdministratorAccess hai!" Admin hone ke bawajood SCP ceiling ke
       bahar kuch nahi ho sakta tha. <b>Yeh bug nahi, feature tha</b> — par sabak
       yeh mila ki guardrail ke saath <b>exception ka rasta</b> (alag OU) aur
       error ka clear message document karo, warna log ghanton IAM policy debug
       karte rehte hain.</div>`,
      `<h3>🗼 Control Tower, billing aur cross-account</h3>
       <ul>
         <li>🗼 <b>Control Tower</b> = Organizations + best-practice landing zone
             ek click mein: OU structure (Security, Sandbox), log-archive & audit
             accounts, preventive guardrails (SCP) aur detective guardrails (AWS
             Config rules), aur <b>Account Factory</b> naye account vend karne ke
             liye. Manual setup ka opinionated version.</li>
         <li>💵 <b>Consolidated billing</b> — ek invoice, aur <b>volume discounts
             poori org ke usage par</b>. Reserved Instances / Savings Plans by
             default org bhar mein share hote hain (band bhi kar sakte ho).</li>
         <li>🎭 <b>Cross-account access</b> — har account mein alag IAM user MAT
             banao. Ek identity account (ya IAM Identity Center) se
             <code>sts:AssumeRole</code> karke dusre account ke role mein jao.
             Credentials temporary, audit CloudTrail mein.</li>
         <li>🧾 <b>Organization CloudTrail</b> — management account se ek trail jo
             saare accounts ko cover karti hai aur log-archive account ke S3 bucket
             mein likhti hai. Member account uska log delete nahi kar sakta — yehi
             tamper-evidence ka pura point hai.</li>
       </ul>
       <p>💡 <b>SAA discriminator:</b> "sab accounts par kuch <i>rok-na</i>" =
       <b>SCP</b>. "kisi ko kuch <i>dena</i>" = <b>IAM policy</b>. "naye accounts
       standard tarike se banane hain" = <b>Control Tower Account Factory</b>.
       "ek jagah saare accounts ke logs" = <b>org CloudTrail → log-archive</b>.</p>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'SCP ya IAM policy?',
        instructions: 'Har requirement ko sahi tool mein daalo — ya "dono ki zaroorat".',
        bins: [
          { id: 'scp', label: '🚧 SCP (guardrail)' },
          { id: 'iam', label: '📜 IAM policy (grant)' },
          { id: 'both', label: '🤝 Dono chahiye' },
        ],
        items: [
          { text: 'Koi bhi account eu-west-1 mein resource na bana paye', bin: 'scp', explain: 'Org-wide prohibition = SCP Deny with aws:RequestedRegion condition. IAM policy har account/user par lagani padti aur koi bhi admin hata deta.' },
          { text: 'ravi ko prod-data account ke ek S3 bucket par read access do', bin: 'iam', explain: 'Kisi ko kuch <b>dena</b> = IAM policy. SCP kabhi grant nahi karti.' },
          { text: 'Sandbox OU mein sirf t3/t4g instance types chalein', bin: 'scp', explain: 'OU-level ceiling = SCP. Sandbox ke admins bhi bada instance nahi utha payenge.' },
          { text: 'Dev team ko naya bucket banane ki ijazat, par sirf ap-south-1 mein', bin: 'both', explain: 'SCP region ki ceiling lagati hai, IAM policy s3:CreateBucket <b>grant</b> karti hai. Effective = intersection.' },
          { text: 'Member accounts CloudTrail band na kar sakein', bin: 'scp', explain: 'Classic SCP: Deny cloudtrail:StopLogging / DeleteTrail. Tamper-evidence ka base.' },
          { text: 'CI pipeline ko dusre account mein deploy karne ki power', bin: 'iam', explain: 'Cross-account role + trust policy + sts:AssumeRole — grant hai, guardrail nahi.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Org tree par ungli rakho',
        instructions: 'Diagram mein sahi component par click karo.',
        visual: 'orgs',
        questions: [
          { q: 'Yahan workload chalana galti hai — billing aur org root isi mein hai, aur SCP ise restrict nahi karti?', target: 'mgmt', explain: 'Management account. SCPs member accounts par lagti hain, management par nahi — isliye usme kuch mat chalao.' },
          { q: 'Maximum permission set karta hai, permission deta nahi — admin bhi iske bahar nahi ja sakta?', target: 'scp', explain: 'SCP. Effective permission = SCP ∩ IAM policy. Guardrail, grant nahi.' },
          { q: 'Ek invoice, aur volume discount + Savings Plans poori org mein share — yeh kis wajah se?', target: 'billing', explain: 'Consolidated billing. Org bhar ka usage jud jaata hai, isliye tier discount jaldi milta hai.' },
          { q: 'Landing zone ek click mein — OUs, log-archive/audit accounts, guardrails, Account Factory?', target: 'ct', explain: 'Control Tower. Organizations ke upar opinionated best-practice setup.' },
        ],
      },
      {
        type: 'fill',
        title: 'SCP likho — CloudTrail ko band hone se roko',
        instructions: 'Yeh SCP har member account ko CloudTrail chhedne se rokegi. Blanks bharo.',
        template: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectAuditTrail",
      "Effect": "{0}",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "RegionLock",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "{1}": { "aws:RequestedRegion": ["ap-south-1", "us-east-1"] }
      }
    }
  ]
}

# OU par attach karo — neeche ke saare accounts inherit karenge
aws organizations attach-policy --policy-id p-protect \\
  --target-id {2}`,
        tokens: ['Deny', 'StringNotEquals', 'ou-prod-1a2b3c', 'Allow', 'StringEquals', 'arn:aws:iam::aws:policy/AdministratorAccess'],
        blanks: [
          { answer: 'Deny', explain: 'SCP mein asli kaam <b>Deny</b> karti hai. Allow sirf ceiling widen karta hai (aur root par FullAWSAccess pehle se hoti hai) — grant kabhi nahi.' },
          { answer: 'StringNotEquals', explain: '"In do region ke <b>alawa</b> sab deny" — isliye NotEquals. StringEquals likh dete toh ulta in dono region ko hi block kar dete. 😅' },
          { answer: 'ou-prod-1a2b3c', explain: 'SCP OU (ya account) par attach hoti hai aur neeche sab inherit karte hain. Target ek IAM policy ARN nahi hota — SCP IAM se alag duniya hai.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: Org audit se pehle SCP lagao',
        instructions: 'Org ka structure samjho, dekho kaunsi SCP kahin attach hi nahi hai, aur use Production OU par lagao.',
        goal: 'Compliance audit kal hai. <b>(1)</b> <code>aws organizations describe-organization</code> aur <code>list-accounts</code> — kitne accounts, kaunsa management? <b>(2)</b> <code>list-organizational-units-for-parent</code> — OU structure. <b>(3)</b> <code>list-policies</code> aur <code>describe-policy --policy-id p-notrail</code> — SCPs dekho. <b>(4)</b> Jo SCP CloudTrail ko protect karti hai use Production OU par <code>attach-policy</code> se lagao.',
        tasks: [
          { text: 'aws organizations list-accounts — accounts inventory', check: s => s.history.some(h => /aws organizations list-accounts/.test(h)) },
          { text: 'aws organizations list-organizational-units-for-parent — OU tree', check: s => s.history.some(h => /aws organizations list-organizational-units/.test(h)) },
          { text: 'aws organizations list-policies — SCPs dekho', check: s => s.history.some(h => /aws organizations list-policies/.test(h)) },
          { text: 'CloudTrail-protection SCP ko Production OU par attach karo', check: s => ((s.account.scps || []).find(p => p.id === 'p-notrail') || {}).targets?.includes('ou-prod-1a2b3c') },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '111111111111', UserId: 'AIDAORGADMIN', Arn: 'arn:aws:iam::111111111111:user/org-admin' },
          organization: { id: 'o-gurukul123', managementAccountId: '111111111111', email: 'root@company.com', featureSet: 'ALL' },
          orgAccounts: [
            { id: '111111111111', name: 'management', email: 'root@company.com', status: 'ACTIVE', ou: 'Root' },
            { id: '222222222222', name: 'prod-web', status: 'ACTIVE', ou: 'Production' },
            { id: '333333333333', name: 'prod-data', status: 'ACTIVE', ou: 'Production' },
            { id: '444444444444', name: 'dev-sandbox', status: 'ACTIVE', ou: 'Sandbox' },
            { id: '555555555555', name: 'log-archive', status: 'ACTIVE', ou: 'Security' },
            { id: '666666666666', name: 'audit', status: 'ACTIVE', ou: 'Security' },
          ],
          orgUnits: [
            { id: 'ou-prod-1a2b3c', name: 'Production' },
            { id: 'ou-sand-4d5e6f', name: 'Sandbox' },
            { id: 'ou-sec-7g8h9i', name: 'Security' },
          ],
          scps: [
            { id: 'p-FullAWSAccess', name: 'FullAWSAccess', awsManaged: true, targets: ['r-root'] },
            { id: 'p-region', name: 'RegionLock', targets: ['ou-prod-1a2b3c', 'ou-sand-4d5e6f'], document: { Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: '*', Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': ['ap-south-1', 'us-east-1'] } } }] } },
            { id: 'p-notrail', name: 'ProtectAuditTrail', targets: [], document: { Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: ['cloudtrail:StopLogging', 'cloudtrail:DeleteTrail'], Resource: '*' }] } },
          ],
        },
        success: s => {
          const p = (s.account.scps || []).find(x => x.id === 'p-notrail');
          return !!(p && (p.targets || []).includes('ou-prod-1a2b3c'))
            && s.history.some(h => /aws organizations list-policies/.test(h));
        },
        successText: '🎉 <b>Guardrail lag gaya.</b> Ab Production OU ka koi bhi account — chahe uska admin ho — CloudTrail band nahi kar sakta. Do cheezein yaad rakho: (1) SCP <b>banane</b> aur <b>attach karne</b> ke beech ek gap hota hai, aur wahi gap audits mein pakda jaata hai. (2) <code>management</code> account (111111111111) par SCP apply hoti hi nahi — isliye usme workload mat chalao, sirf billing/org rakho.',
        hints: [
          'aws organizations describe-organization — management account id note karo',
          'aws organizations list-accounts — dekho kaunsa account kis OU mein hai',
          'aws organizations list-policies, phir aws organizations describe-policy --policy-id p-notrail — yeh kya rokti hai?',
          'aws organizations attach-policy --policy-id p-notrail --target-id ou-prod-1a2b3c',
        ],
      },
      {
        type: 'quiz',
        title: 'Governance Quick-fire',
        questions: [
          {
            q: 'User ke paas AdministratorAccess hai par action AccessDenied de raha hai. Sabse pehla shak?',
            choices: [
              'SCP ceiling — OU par lagi SCP us action ko Deny kar rahi hai, aur SCP admin par bhi lagti hai',
              'IAM policy mein typo hai',
              'MFA expire ho gaya',
              'Region down hai',
            ],
            answer: 0,
            explain: 'Effective permission = SCP ∩ IAM. Admin bhi ceiling nahi tod sakta. Doosra common karan: permissions boundary ya explicit Deny kisi resource policy mein.',
          },
          {
            q: 'Naye team accounts standard baseline (logging, guardrails, network) ke saath chahiye. Sabse kam mehnat?',
            choices: [
              'Control Tower Account Factory — vend kiya gaya har account baseline ke saath aata hai',
              'Har baar manually account banao aur checklist follow karo',
              'Ek hi account mein sab teams ko IAM se alag karo',
              'CloudFormation StackSet hi kaafi hai, Organizations ki zaroorat nahi',
            ],
            answer: 0,
            explain: 'Account Factory = repeatable account vending. (StackSets useful hain baseline resources push karne ke liye, par OU/SCP/landing-zone structure Control Tower deta hai.)',
          },
          {
            q: 'Consolidated billing ka sabse bada financial faayda?',
            choices: [
              'Poori org ka usage jud jaata hai — volume tier discounts jaldi milte hain, aur RI/Savings Plans accounts mein share hote hain',
              'Har account ka bill 10% kam ho jaata hai',
              'Free Tier har account ko dobara milta hai',
              'Support plan free ho jaata hai',
            ],
            answer: 0,
            explain: 'Aggregation = tiered pricing par jaldi pahunchna + unused RI/SP coverage dusre account mein kaam aa jaana. (Sharing off bhi ki ja sakti hai.)',
          },
          {
            q: 'Member account apne CloudTrail logs delete na kar paye — design?',
            choices: [
              'Organization trail management account se, logs alag log-archive account ke S3 bucket mein + SCP se StopLogging/DeleteTrail deny',
              'Har account apna trail rakhe, bas IAM policy laga do',
              'Logs CloudWatch mein rakho, S3 mein nahi',
              'Root user ka password bata do sirf security team ko',
            ],
            answer: 0,
            explain: 'Tamper-evidence = logs <b>doosre account</b> mein (jahan compromise hua account ki pahunch nahi) + SCP guardrail. Yeh do layers hi asli jawab hain.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Multi-Account',
      instructions: 'Governance design round. 🎤',
      questions: [
        {
          q: '"Ek account mein sab kuch tags se alag kar dein toh? Multi-account ki kya zaroorat?"',
          choices: [
            'Account = AWS ki apni hard boundary: blast radius, per-account service quotas, saaf billing, chhota compliance scope. Tags aur IAM galti se ya jaan-boojh ke tode ja sakte hain',
            'Multi-account sasta padta hai',
            'Tags AWS support nahi karta',
            'Ek account mein 100 se zyada resources nahi bante',
          ],
          answer: 0,
          explain: 'Interviewer boundary strength sun-na chahta hai. IAM misconfiguration ek policy door hai; account boundary ke paar jaane ke liye explicit cross-account trust chahiye.',
        },
        {
          q: 'Scenario: dev team galti se prod ka RDS delete kar deti hai. Design-level fix kya batao ge?',
          choices: [
            'Prod alag account mein, dev ke paas uska koi role hi nahi; upar se Production OU par SCP jo rds:DeleteDBInstance ko deny kare, aur deletion protection on',
            'Sabko sirf ReadOnlyAccess de do',
            'CloudTrail alert laga do delete par',
            'Backup rakho aur restore kar lo',
          ],
          answer: 0,
          explain: 'Layered prevention: account isolation (pahunch hi na ho) + SCP (ceiling) + resource-level protection. Alert aur backup <i>detection/recovery</i> hain — prevention nahi.',
        },
        {
          q: 'Interviewer: "SCP se kisi ko S3 access de sakte ho?"',
          choices: [
            'Nahi — SCP sirf maximum permission define karti hai. Access hamesha IAM policy (ya resource policy) se aata hai; SCP use sirf kaat sakti hai',
            'Haan, Allow statement likh do',
            'Haan, agar OU root par lagayein',
            'Haan, par sirf management account mein',
          ],
          answer: 0,
          explain: 'Yeh trick question interviews mein aksar aata hai. SCP ka Allow ceiling define karta hai, grant nahi. Bina IAM grant ke koi bhi kuch nahi kar sakta.',
        },
      ],
    },
    success: [
      'Main multi-account strategy ke 4 karan (blast radius, billing, quotas, compliance) bata sakta hoon',
      'Main SCP vs IAM policy ka farak aur "effective = SCP ∩ IAM" samjhata hoon',
      'Main Control Tower, Account Factory aur landing zone ka role jaanta hoon',
      'Main org CloudTrail + log-archive account se tamper-evident logging design kar sakta hoon',
    ],
    homework: `<p>Organizations chakho (free hai — sirf resources par paisa lagta hai):</p>
      <pre># 1. Console → AWS Organizations → Create organization (ALL features)
# 2. Ek OU banao: "Sandbox"
# 3. Naya member account invite/create karo aur Sandbox OU mein daalo
# 4. SCP banao (Policies → Service control policies → Create):
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny", "Action": "*", "Resource": "*",
    "Condition": { "StringNotEquals": { "aws:RequestedRegion": ["ap-south-1"] } }
  }]
}
# 5. Sandbox OU par attach karo
# 6. Member account mein switch role karke us-east-1 mein S3 bucket banane ki
#    koshish karo → AccessDenied milega, chahe tum admin ho. Yehi guardrail hai.
# 7. Cleanup: SCP detach karo (warna khud phas jaoge 🙂)</pre>
      <p>✅ Self-check: Admin hote hue bhi blocked region mein action fail hua? Management account par SCP ka koi asar nahi dikha (woh exempt hai)?</p>`,
    cards: [
      { front: 'Multi-account kyun (4 karan)?', back: '<b>Blast radius</b> (account = AWS ki hard boundary), <b>billing clarity</b> (per-account cost), <b>service quotas</b> (per-account limits), <b>compliance scope</b> (chhota audit boundary).' },
      { front: 'SCP kya karti hai?', back: '<b>Guardrail, grant nahi.</b> Effective permission = SCP (ceiling) ∩ IAM policy (grant). Admin bhi SCP ke bahar kuch nahi kar sakta. OU par lagti hai, neeche sab inherit karte hain.' },
      { front: 'Management account ka rule?', back: 'Sirf billing + org management. <b>Workload mat chalao</b> — SCPs management account par apply nahi hotin, toh compromise = poori org.' },
      { front: 'Control Tower deta kya hai?', back: 'Landing zone one-click: OU structure, log-archive + audit accounts, preventive guardrails (SCP) + detective (Config rules), aur <b>Account Factory</b> naye accounts vend karne ke liye.' },
      { front: 'Tamper-evident logging design?', back: '<b>Organization CloudTrail</b> management account se → logs <b>alag log-archive account</b> ke S3 mein + SCP se <code>cloudtrail:StopLogging/DeleteTrail</code> deny. Compromised account apne nishaan nahi mita sakta.' },
      { front: 'Consolidated billing ka faayda?', back: 'Ek invoice + poori org ka usage aggregate → volume tier discount jaldi, aur <b>RI/Savings Plans accounts mein share</b> hote hain (off bhi kar sakte ho).' },
    ],
  },

  /* ================= LEVEL 3: DR ================= */
  {
    id: 'dr',
    icon: '🚑',
    title: 'Disaster Recovery — 4 Strategies',
    badge: 'DR Darpok Nahi',
    objectives: [
      '<b>RTO</b> vs <b>RPO</b> — recovery metrics',
      '<b>4 DR strategies</b>: Backup&Restore, Pilot Light, Warm Standby, Multi-Site',
      'Cost vs downtime tradeoff',
      'DR plan aur testing',
    ],
    lesson: [
      `<h3>⏱️ RTO aur RPO — do metrics yaad rakho</h3>
       <p>DR ke do key metrics:</p>
       <ul>
         <li>⏰ <b>RTO</b> (Recovery Time Objective) — kitni der tak down ho
             sakte ho? "1 ghante tak OK, uske baad revenue loss"</li>
         <li>📊 <b>RPO</b> (Recovery Point Objective) — kitna data loss
             acceptable? "5 min ka loss OK, zyada nahi"</li>
       </ul>
       <pre>RTO = how FAST you recover (time)
RPO = how MUCH data you lose (data)

Example:
  RTO 1hr  = 1 ghante mein app wapas up
  RPO 5min = last 5 min ka data gone (max)

Lower RTO/RPO = more expensive (real-time replication)</pre>`,
      `<h3>🏥 4 DR strategies — cheapest to priciest</h3>
       <table>
         <tr><th>Strategy</th><th>RPO</th><th>RTO</th><th>Cost</th><th>How</th></tr>
         <tr><td>1️⃣ <b>Backup & Restore</b></td><td>Hours</td><td>Hours</td><td>$</td><td>S3/EBS backups, restore on disaster</td></tr>
         <tr><td>2️⃣ <b>Pilot Light</b></td><td>Mins</td><td>Mins-Hours</td><td>$$</td><td>Core (DB) running, scale up on DR</td></tr>
         <tr><td>3️⃣ <b>Warm Standby</b></td><td>Secs</td><td>Mins</td><td>$$$</td><td>Scaled-down replica running, scale up</td></tr>
         <tr><td>4️⃣ <b>Multi-Site Active-Active</b></td><td>0 (no loss)</td><td>0 (instant)</td><td>$$$$$</td><td>Full dual, both regions serve</td></tr>
       </table>
       <p>💡 Choice = <b>cost vs downtime tradeoff</b>. Critical app (payment)
       = Multi-Site. Internal tool = Backup&Restore.</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek fintech ne sirf
       <b>Backup&Restore</b> use kiya (sasta). Region down hua → 6 ghante
       restore → RTO 6hrs. SLA breach, $500k penalty. Fix: <b>Warm Standby</b>
       (RTO 10 min, extra $2k/mo). $2k/mo vs $500k penalty — obvious choice.
       Seekh: <b>DR cost = insurance premium</b>. SLA se calculate karo.</div>`,
      `<h3>🧪 DR testing — sabse important step</h3>
       <p>DR plan bana ke file mein rakhna kaafi nahi. <b>Test karo</b> —
       varna disaster mein pata chalega plan kaam nahi karta.</p>
       <ul>
         <li>📅 <b>Quarterly</b> DR drill — simulate region down</li>
         <li>🎮 <b>Game days</b> — team ko bina warning failover karwao</li>
         <li>📝 <b>Document gaps</b> — kahan plan toota, fix karo</li>
         <li>🤖 <b>Automate</b> — Terraform/IaC se DR environment spin up</li>
       </ul>
       <p>💡 <b>Untested DR = no DR.</b> Netflix chaos engineering ka pioneer —
       har week something fail karta deliberately.</p>`,
    ],
    stages: [
      {
        type: 'order',
        title: 'DR strategies — cheapest to priciest',
        instructions: '4 strategies cost ke hisaab se order mein lagao (cheapest pehle).',
        steps: [
          { text: 'Backup & Restore — backups se restore, hours RTO/RPO, cheapest', explain: 'S3/EBS backups. Simple. Hours to recover.' },
          { text: 'Pilot Light — core (DB) running, scale up on DR', explain: 'DB replicate. Rest spin up. Minutes.' },
          { text: 'Warm Standby — scaled-down replica running, scale up', explain: 'Full stack but small. Scale up on DR. Seconds-mins.' },
          { text: 'Multi-Site Active-Active — full dual, both regions serve, instant', explain: 'Both regions live. 0 RPO/RTO. Most expensive.' },
        ],
      },
      {
        type: 'bins',
        title: 'DR strategy choose karo',
        instructions: 'Har scenario ko sahi DR strategy mein daalo.',
        bins: [
          { id: 'backup', label: '1️⃣ Backup&Restore' },
          { id: 'pilot', label: '2️⃣ Pilot Light' },
          { id: 'warm', label: '3️⃣ Warm Standby' },
          { id: 'multi', label: '4️⃣ Multi-Site' },
        ],
        items: [
          { text: 'Internal HR tool, 4hr downtime OK', bin: 'backup', explain: 'Low criticality. Backup&Restore. Cheap. Hours acceptable.' },
          { text: 'Payment app, 0 data loss, instant failover', bin: 'multi', explain: 'Critical. Multi-Site Active-Active. 0 RPO/RTO. $$$$.' },
          { text: 'E-commerce, 10 min downtime OK, DB running', bin: 'pilot', explain: 'Pilot Light. DB replicate. Rest spin up. Minutes.' },
          { text: 'SaaS, 2 min RTO, scaled-down replica OK', bin: 'warm', explain: 'Warm Standby. Small replica. Scale up. Seconds-mins.' },
          { text: 'Compliance archive, 12hr retrieve OK', bin: 'backup', explain: 'Backup (Glacier Deep Archive). Restore hours. Cheap.' },
          { text: 'Global gaming, 0 downtime, both regions serve', bin: 'multi', explain: 'Multi-Site. Both active. 0 loss. Premium cost.' },
        ],
      },
      {
        type: 'quiz',
        title: 'DR Quick-fire',
        questions: [
          {
            q: 'RTO 1hr, RPO 5min ka matlab?',
            choices: [
              '1 ghante mein app up (RTO), last 5 min ka data loss max (RPO)',
              '1 ghanta data loss, 5 min recovery',
              'RTO = data, RPO = time',
              'Dono same hain',
            ],
            answer: 0,
            explain: 'RTO = recovery TIME (how fast). RPO = recovery POINT (how much data lost). Lower = more expensive.',
          },
          {
            q: 'Payment app, 0 data loss, instant failover. Strategy?',
            choices: [
              'Multi-Site Active-Active — both regions serve, 0 RPO/RTO. Most expensive but critical',
              'Backup & Restore — sasta',
              'Pilot Light — DB running',
              'Warm Standby — scaled down',
            ],
            answer: 0,
            explain: 'Payment = critical, 0 loss. Multi-Site. Both regions active. DynamoDB Global Tables / Aurora Global. $$$$ but no loss.',
          },
          {
            q: 'DR plan bana liya. Sabse important next step?',
            choices: [
              'Test karo (game day, quarterly drill). Untested DR = no DR',
              'File mein rakho',
              'AWS ko bhejo',
              'Kuch nahi — plan ready',
            ],
            answer: 0,
            explain: 'Test! Netflix chaos engineering. Untested plan breaks on real disaster. Game days, automate, document gaps.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — DR',
      instructions: 'DR strategy round. 🎤',
      questions: [
        {
          q: '"RTO aur RPO farak samjhao" — interviewer.',
          choices: [
            'RTO = Recovery Time Objective (kitni der down). RPO = Recovery Point Objective (kitna data loss). Lower = more expensive',
            'Dono same — time',
            'RTO = data, RPO = time',
            'RTO AWS set karta, RPO tum',
          ],
          answer: 0,
          explain: 'RTO = how FAST. RPO = how MUCH data lost. Lower both = real-time replication = expensive. Trade-off with cost.',
        },
        {
          q: 'Scenario: e-commerce, 10min RTO, DB critical. Strategy?',
          choices: [
            'Pilot Light — DB replicate (RDS cross-region read replica promoted). Rest spin up via IaC. 10min achievable',
            'Backup & Restore — hours',
            'Multi-Site — overkill for 10min',
            'No DR — hope for best',
          ],
          answer: 0,
          explain: 'Pilot Light fits 10min. DB running (replica), app spin up. Not full Warm Standby (more expensive). Right strategy for RTO.',
        },
        {
          q: 'Interviewer: "DR plan test karna kyun zaroori?"',
          choices: [
            'Untested DR = no DR. Real disaster mein plan toot sakta. Game days, quarterly drill, automate, document gaps',
            'Test optional hai',
            'AWS khud test karta',
            'Sirf launch pe ek baar',
          ],
          answer: 0,
            explain: 'Testing reveals gaps — missing config, DNS issues, team confused. Netflix chaos engineering: deliberately fail weekly.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: DR readiness checklist! Verify karo ki DR infrastructure ready hai: <b>(1)</b> RDS instances dekho — Multi-AZ for HA. <b>(2)</b> S3 buckets dekho — replication for backup. <b>(3)</b> Route 53 hosted zones — failover DNS configured?',
            tasks: [
              { text: 'aws rds describe-db-instances — Multi-AZ for DB failover', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
              { text: 'aws s3api list-buckets — buckets for backup', check: s => s.history.some(h => /aws s3api list-buckets/.test(h)) },
              { text: 'aws route53 list-hosted-zones — failover DNS', check: s => s.history.some(h => /aws route53 list-hosted-zones/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              rds: [
                { id: 'prod-db', name: 'prod-db', engine: 'postgres', class: 'db.r6.large', state: 'available', multiAZ: true, endpoint: 'prod-db.cxxx.rds.amazonaws.com', storage: 100 },
              ],
              buckets: [
                { name: 'backup-prod-2024', region: 'us-east-1', encryption: true, public: false, objects: [{ key: 'db-snapshot-2024-07-19.sql', size: 5000000000, lastModified: '2024-07-19 03:00:00' }] },
              ],
              hostedZones: [{ id: 'Z1ABC', name: 'myapp.com', records: [
                { name: 'myapp.com', type: 'A', value: 'primary-alb.us-east-1.elb.amazonaws.com' },
              ] }],
            },
            success: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) && s.history.some(h => /aws s3api list-buckets/.test(h)) && s.history.some(h => /aws route53 list-hosted-zones/.test(h)),
            successText: 'DR checklist complete! 📋 <b>RDS</b> ✅ Multi-AZ (failover ready), <b>S3 backup</b> ✅ (db-snapshot-2024-07-19.sql, 5GB — latest snapshot), <b>Route 53</b> ⚠️ sirf 1 A record (primary ALB) — <b>failover secondary missing!</b> DR gap: agar us-east-1 down, DNS sirf primary pe point karta — no failover. Fix: failover routing policy + secondary region ALB + health check. RTO without failover DNS = hours (manual DNS change). With failover = seconds.',
            hints: [
              'aws rds describe-db-instances — MultiAZ field dekho',
              'aws s3api list-buckets — backup bucket dhundo',
              'aws route53 list-hosted-zones — zones dekho, failover records check karo',
            ],
          },
        },
      ],
    },
    success: [
      'Main RTO aur RPO ka farak explain kar sakta hoon',
      'Main 4 DR strategies (Backup/Pilot/Warm/Multi-Site) aur cost-downtime tradeoff bata sakta hoon',
      'Main use case ke hisaab se DR strategy choose kar sakta hoon',
      'Main DR testing (game days, quarterly) ka importance samjhta hoon',
    ],
    homework: `<p>DR plan likho apne app ke liye:</p>
      <pre># Document:
# 1. RTO/RPO targets (business se confirm)
# 2. Strategy (Backup/Pilot/Warm/Multi-Site)
# 3. Replication setup (RDS cross-region, S3 CRR, DynamoDB Global)
# 4. Failover steps (Route 53, IaC for spin up)
# 5. Game day: quarterly test
# 6. Contacts, runbook</pre>
      <p>✅ Self-check: Plan likha? Game day schedule?</p>`,
    cards: [
      { front: 'RTO vs RPO?', back: '<b>RTO</b> = Recovery Time Objective (kitni der down). <b>RPO</b> = Recovery Point Objective (kitna data loss). Lower = expensive (real-time replication).' },
      { front: '4 DR strategies?', back: '1) <b>Backup&Restore</b> (hours, $) 2) <b>Pilot Light</b> (mins, $$) 3) <b>Warm Standby</b> (secs, $$$) 4) <b>Multi-Site Active-Active</b> (0, $$$$$).' },
      { front: 'Multi-Site Active-Active?', back: 'Both regions live, serve traffic. <b>0 RPO/RTO</b>. DynamoDB Global Tables / Aurora Global / Route 53. Most expensive. Payment/critical apps.' },
      { front: 'Untested DR = ?', back: '<b>No DR</b>. Test quarterly (game days). Netflix chaos engineering: deliberately fail weekly. Document gaps, automate.' },
      { front: 'DR strategy choice?', back: 'Cost vs downtime tradeoff. Critical (payment, 0 loss) = Multi-Site. Internal tool (hours OK) = Backup&Restore. SLA se calculate karo.' },
    ],
  },

  /* ================= LEVEL 3: Advanced Networking ================= */
  {
    id: 'advnet',
    icon: '🔗',
    title: 'Advanced Networking — Direct Connect + PrivateLink',
    badge: 'Network Netritva',
    objectives: [
      '<b>Direct Connect</b> — dedicated line on-prem to AWS',
      '<b>Transit Gateway</b> hub-and-spoke for many VPCs',
      '<b>PrivateLink + VPC Endpoints</b> — private access to services',
      'Hybrid cloud networking',
    ],
    lesson: [
      `<h3>🔌 Direct Connect — dedicated line, no internet</h3>
       <p><b>AWS Direct Connect (DX)</b> = dedicated network line on-prem
       datacenter se AWS tak. <b>No internet</b> — private, consistent,
       predictable.</p>
       <ul>
         <li>⚡ <b>Speeds:</b> 1 Gbps ya 10 Gbps (ya sub-Gbps via partner)</li>
         <li>🔒 <b>Private</b> — no public internet, no encryption by default
             (MACsec ya VPN overlay for encryption)</li>
         <li>📊 <b>Consistent</b> — internet pe latency varies, DX stable</li>
         <li>💰 <b>Cost</b> — monthly port fee + data transfer (cheaper for
             high volume)</li>
       </ul>
       <p>💡 Use case: hybrid cloud (on-prem + AWS), high data transfer,
       compliance (no public internet).</p>`,
      `<h3>🌐 Transit Gateway — hub for many VPCs</h3>
       <p>Beginner/intermediate mein seekha — VPC Peering non-transitive.
       Bahut VPCs hain? <b>Transit Gateway (TGW)</b> = hub-and-spoke.</p>
       <pre>VPC-A ─┐
VPC-B ─┼── Transit Gateway ── on-prem (DX/VPN)
VPC-C ─┤
VPC-D ─┘

TGW = central router. Transitive routing automatic.
N VPCs peering = N². TGW = N connections to hub.</pre>
       <p>💡 TGW pe VPN ya Direct Connect bhi jod sakte — on-prem se sab VPCs
       ek hub se. Central routing, security inspection.</p>`,
      `<h3>🔗 PrivateLink + VPC Endpoints — private service access</h3>
       <p>Normally S3/DynamoDB access karne ke liye <b>internet</b> (NAT+IGW)
       chahiye. <b>PrivateLink</b> + <b>VPC Endpoints</b> = private access,
       no internet.</p>
       <ul>
         <li>🔌 <b>Gateway Endpoint</b> — S3, DynamoDB only. Free, route table
             mein entry.</li>
         <li>🔗 <b>Interface Endpoint</b> (PrivateLink) — any AWS service ya
             your own service. ENI in your VPC. $/hour + data.</li>
       </ul>
       <p>💡 Use case: private subnet se S3/DynamoDB bina NAT Gateway ke
       (sasta + secure). Ya dusre account ka service privately access.</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek bank ne private
       subnet se S3 access ke liye <b>NAT Gateway</b> use kiya — $1000/mo
       data charges. VPC Gateway Endpoint (free) pe move kiya → <b>$0</b>,
       faster (no internet round-trip), more secure (no public path).
       Seekh: S3/DynamoDB from private subnet = <b>Gateway Endpoint</b>,
       not NAT.</div>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'Advanced Networking — diagram detective',
        instructions: 'Hybrid network ke components par click karo.',
        visual: 'advnet',
        questions: [
          { q: 'Dedicated line on-prem to AWS (no internet)?', target: 'dx', explain: 'Direct Connect. 1/10 Gbps. Private, consistent. High volume cheaper than internet.' },
          { q: 'Hub for many VPCs — transitive routing?', target: 'tgw', explain: 'Transit Gateway. N VPCs = N connections (vs N² peering). Central routing.' },
          { q: 'Private access to AWS service (no internet)?', target: 'privatelink', explain: 'PrivateLink. Interface endpoint. Any service. ENI in VPC.' },
          { q: 'S3/DynamoDB private access (free, route table)?', target: 'endpoint', explain: 'VPC Endpoint (Gateway). S3/DynamoDB only. Free. Route table entry.' },
        ],
      },
      {
        type: 'match',
        title: 'Networking concepts — naam milao',
        instructions: 'Har term ko matlab se milao.',
        pairs: [
          { left: 'Direct Connect', right: 'Dedicated line on-prem → AWS. 1/10 Gbps, private, consistent, no internet', explain: 'Hybrid cloud, high volume, compliance.' },
          { left: 'Transit Gateway', right: 'Hub-and-spoke for many VPCs + on-prem. Transitive routing', explain: 'N VPCs = N connections (vs N² peering). Central.' },
          { left: 'VPC Gateway Endpoint', right: 'S3/DynamoDB private access. Free, route table entry', explain: 'No NAT needed. Private subnet se S3 free.' },
          { left: 'PrivateLink (Interface Endpoint)', right: 'Any AWS service ya your service, private. ENI in VPC, $/hr', explain: 'Cross-account service privately. No internet.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Advanced Networking Quick-fire',
        questions: [
          {
            q: 'Private subnet se S3 access. NAT Gateway ($1000/mo) vs Gateway Endpoint?',
            choices: [
              'Gateway Endpoint — free, no internet, faster, more secure. S3/DynamoDB only',
              'NAT Gateway — internet round-trip OK',
              'Public IP do EC2 ko',
              'Direct Connect chahiye',
            ],
            answer: 0,
            explain: 'Gateway Endpoint = free + private + fast. S3/DynamoDB only. NAT = $ + internet. Bank example: $1000/mo → $0.',
          },
          {
            q: 'On-prem datacenter se AWS — consistent, private, high-volume. Best?',
            choices: [
              'Direct Connect — dedicated 1/10 Gbps line. No internet, consistent latency',
              'Internet VPN — cheap but variable',
              'Public S3',
              'No connection needed',
            ],
            answer: 0,
            explain: 'DX = dedicated, consistent, private. High volume cheaper (no per-GB internet cost). Hybrid cloud standard.',
          },
          {
            q: '10 VPCs + on-prem connect. Peering ya Transit Gateway?',
            choices: [
              'Transit Gateway — 10 connections to hub (vs 45 peering), transitive, central routing',
              'VPC Peering — 45 connections banani padengi',
              'No connection — isolated',
              'Internet se',
            ],
            answer: 0,
            explain: '10 VPCs peering = 45 (N²/2) connections, non-transitive. TGW = 10 to hub, transitive, on-prem bhi. Clear winner.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Advanced Networking',
      instructions: 'Hybrid networking round. 🎤',
      questions: [
        {
          q: '"Direct Connect kyun use karein, internet VPN se kya farak?" — interviewer.',
          choices: [
            'DX = dedicated, consistent latency, private (no internet), high-volume cheaper. VPN = internet, variable, encrypted but public path',
            'DX free hai',
            'Dono same',
            'VPN faster',
          ],
          answer: 0,
          explain: 'DX = predictable (SLA), private, no internet exposure. High data volume = cheaper (no per-GB internet). VPN = backup/redundancy.',
        },
        {
          q: 'Scenario: private subnet se S3. Cost optimize karo.',
          choices: [
            'VPC Gateway Endpoint — free, no NAT needed, private, faster. S3/DynamoDB only',
            'NAT Gateway — $1000/mo but works',
            'Public IP do',
            'Direct Connect',
          ],
          answer: 0,
          explain: 'Gateway Endpoint = $0, no internet, private, faster. S3/DynamoDB only. Private subnet se S3 = always Gateway Endpoint.',
        },
        {
          q: 'Interviewer: "Transit Gateway vs VPC Peering — kab kya?"',
          choices: [
            '2-3 VPCs = peering (simple). 4+ VPCs ya transitive needed ya on-prem hub = TGW. Scalability + central routing',
            'Hamesha peering',
            'Hamesha TGW',
            'Dono same cost',
          ],
          answer: 0,
            explain: 'Small scale = peering (no TGW cost). Large scale / transitive / hub = TGW. N² vs N connections. Central management.',
        },
      ],
    },
    success: [
      'Main Direct Connect ka purpose aur VPN se farak bata sakta hoon',
      'Main Transit Gateway (hub-and-spoke) vs VPC Peering choose kar sakta hoon',
      'Main VPC Endpoints (Gateway/Interface) aur PrivateLink samjhta hoon',
      'Main hybrid cloud networking design kar sakta hoon',
    ],
    homework: `<p>VPC Gateway Endpoint try karo (free):</p>
      <pre># Console → VPC → Endpoints → Create
# Service: com.amazonaws.us-east-1.s3 (gateway type)
# VPC: your VPC
# Route tables: select (auto adds route)

# Private EC2 se: aws s3 ls — works without NAT!
# (No internet, no NAT cost)</pre>
      <p>✅ Self-check: Private EC2 se S3 access without NAT?</p>`,
    cards: [
      { front: 'Direct Connect?', back: 'Dedicated line on-prem → AWS. 1/10 Gbps. <b>Private, consistent, no internet</b>. High volume cheaper. Hybrid cloud.' },
      { front: 'Transit Gateway vs Peering?', back: 'Peering: 2-3 VPCs, non-transitive. TGW: 4+ VPCs, transitive, hub-and-spoke, on-prem bhi. N² vs N connections.' },
      { front: 'VPC Gateway Endpoint?', back: 'S3/DynamoDB private access. <b>Free</b>, route table entry, no internet. Private subnet se S3 = always this, not NAT.' },
      { front: 'PrivateLink (Interface Endpoint)?', back: 'Any AWS service ya your service, private. ENI in VPC. $/hour. Cross-account service privately.' },
      { front: 'NAT vs Gateway Endpoint for S3?', back: 'NAT = $1000/mo, internet. Gateway Endpoint = <b>$0, private, faster</b>. S3/DynamoDB from private subnet = always Gateway Endpoint.' },
    ],
  },

  /* ================= LEVEL 4: Containers ================= */
  {
    id: 'containers',
    icon: '📦',
    title: 'Containers — ECS / EKS / ECR',
    badge: 'Container Commander',
    objectives: [
      '<b>Containers vs VMs vs Lambda</b> — kab kya',
      '<b>ECS</b> (Fargate/EC2) vs <b>EKS</b> (Kubernetes)',
      '<b>ECR</b> — image registry',
      'Container architecture decisions',
    ],
    lesson: [
      `<h3>📦 Containers — lightweight, portable apps</h3>
       <p><b>Container</b> = app + dependencies ek package mein. VM se
       lightweight (no OS per container). <b>Docker</b> = popular runtime.</p>
       <table>
         <tr><th>VM (EC2)</th><th>Container</th><th>Lambda</th></tr>
         <tr><td>Full OS per instance</td><td>Shared OS, app isolated</td><td>No server, code only</td></tr>
         <tr><td>Minutes to start</td><td>Seconds</td><td>ms (cold start)</td></tr>
         <tr><td>Long-running, stateful</td><td>Long-running, microservices</td><td>Short, event-driven</td></tr>
         <tr><td>You manage OS</td><td>You manage image</td><td>AWS manages all</td></tr>
       </table>
       <p>💡 <b>Use containers for:</b> microservices, long-running apps,
       portability (same image dev/prod). <b>Lambda for:</b> event-driven,
       short tasks, spiky.</p>`,
      `<h3>🚢 ECS vs EKS — AWS native vs Kubernetes</h3>
       <p>AWS pe containers chalane ke 2 main options:</p>
       <table>
         <tr><th>ECS (AWS native)</th><th>EKS (Kubernetes)</th></tr>
         <tr><td>AWS ka own orchestrator</td><td>Managed Kubernetes (K8s)</td></tr>
         <tr><td>Simple, AWS-integrated</td><td>Complex, portable (multi-cloud)</td></tr>
         <tr><td>Fargate (serverless) ya EC2</td><td>EC2 ya Fargate (newer)</td></tr>
         <tr><td>AWS-only skills</td><td>K8s skills (transferable)</td></tr>
         <tr><td>Less features</td><td>Huge ecosystem (Helm, operators...)</td></tr>
       </table>
       <p>🏆 <b>ECS Fargate</b> = easiest. No EC2 manage, no K8s learn. Serverless
       containers. Perfect for AWS-only teams. <b>EKS</b> = multi-cloud,
       K8s ecosystem, portability.</p>
       <div class="war-story"><b>⚡ Real decision:</b> Ek startup ne ECS
       Fargate choose kiya — simple, no K8s expertise needed. Phir unhe
       <b>multi-cloud</b> (AWS + GCP) chahiye for a big client. EKS pe move
       kiya — same K8s manifests dono clouds pe. Seekh: <b>ECS = AWS simplicity,
       EKS = portability</b>. Future multi-cloud? EKS. AWS-only? ECS.</div>`,
      `<h3>📦 ECR — image registry</h3>
       <p><b>ECR (Elastic Container Registry)</b> = AWS ka Docker image
       registry. Docker Hub jaisa par AWS mein, IAM-integrated.</p>
       <pre># Build image
docker build -t my-app .

# Tag + push to ECR
docker tag my-app:latest 123456.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
docker push 123456.dkr.ecr.us-east-1.amazonaws.com/my-app:latest

# ECS/EKS task definition mein image reference
image: 123456.dkr.ecr.us-east-1.amazonaws.com/my-app:latest</pre>
       <p>💡 ECR = private, IAM auth, integrated with ECS/EKS. Lifecycle
       policies (old images auto-delete).</p>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'Container Services — diagram detective',
        instructions: 'ECS/EKS ke components par click karo.',
        visual: 'containers',
        questions: [
          { q: 'Image registry — store container images?', target: 'ecr', explain: 'ECR. AWS Docker Hub. IAM-integrated. Lifecycle policies.' },
          { q: 'Serverless containers — no EC2 manage?', target: 'fargate', explain: 'Fargate. ECS/EKS pe. Pay per task. No server manage.' },
          { q: 'Managed Kubernetes — multi-cloud portable?', target: 'eks', explain: 'EKS. K8s. Complex but portable. Huge ecosystem.' },
        ],
      },
      {
        type: 'bins',
        title: 'VM, Container, ya Lambda?',
        instructions: 'Har use-case ko sahi compute option mein daalo.',
        bins: [
          { id: 'vm', label: '🖥️ VM (EC2)' },
          { id: 'container', label: '📦 Container' },
          { id: 'lambda', label: '⚡ Lambda' },
        ],
        items: [
          { text: 'Long-running web server, full OS control', bin: 'vm', explain: 'EC2. Full OS, long-running, stateful, custom config.' },
          { text: 'Microservices, portable dev/prod', bin: 'container', explain: 'Container. Same image everywhere. Microservices.' },
          { text: 'S3 upload trigger, process image, 30sec', bin: 'lambda', explain: 'Lambda. Event-driven, short. No server.' },
          { text: 'Legacy monolith, full OS access needed', bin: 'vm', explain: 'EC2. Legacy needs OS control. Migrate to containers later.' },
          { text: 'API backend, scales to zero when idle', bin: 'lambda', explain: 'Lambda. $0 idle, scales automatic. API GW + Lambda.' },
          { text: 'Multi-cloud microservices (AWS + GCP)', bin: 'container', explain: 'Container (EKS). K8s portable. Same manifests both clouds.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: ECR Repository Setup',
        instructions: 'Ek naya microservice deploy karne ke liye <b>ECR</b> mein image repository banao. Pehla hands-on container workflow!',
        goal: 'ECR repository setup: <b>(1)</b> Existing repositories dekho (<code>aws ecr describe-repositories</code>). <b>(2)</b> Naya repository <code>my-app</code> banao (<code>aws ecr create-repository --repository-name my-app</code>). <b>(3)</b> Verify karo ki bana (<code>describe-repositories</code> phir se).',
        tasks: [
          { text: 'aws ecr describe-repositories — existing repos dekho', check: s => s.history.some(h => /aws ecr describe-repositories/.test(h)) },
          { text: 'aws ecr create-repository --repository-name my-app', check: s => s.account.repositories && s.account.repositories.some(r => r.name === 'my-app') },
          { text: 'Verify: describe-repositories mein my-app dikhe', check: s => s.history.filter(h => /aws ecr describe-repositories/.test(h)).length >= 2 },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          repositories: [
            { name: 'frontend', registryId: '123456789012', uri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/frontend', imageCount: 3, createdAt: '2024-04-01T10:00:00.000Z', images: [
              { imageTag: 'v1.0', imageDigest: 'sha256:abc123', imageSizeInBytes: 45000000, imagePushedAt: '2024-04-01T10:00:00.000Z' },
              { imageTag: 'v1.1', imageDigest: 'sha256:def456', imageSizeInBytes: 48000000, imagePushedAt: '2024-04-05T14:00:00.000Z' },
              { imageTag: 'latest', imageDigest: 'sha256:def456', imageSizeInBytes: 48000000, imagePushedAt: '2024-04-05T14:00:00.000Z' },
            ] },
          ],
        },
        success: s => s.account.repositories && s.account.repositories.some(r => r.name === 'my-app') && s.history.some(h => /aws ecr create-repository.*my-app/.test(h)),
        successText: 'Repository bana! <b>my-app</b> ab ECR mein hai. Notice: <code>create-repository</code> ne ek <b>repositoryUri</b> diya — <code>123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app</code>. Yehi pe <code>docker push</code> karoge. Next steps (real AWS): <code>aws ecr get-login-password | docker login --username AWS --password-stdin &lt;uri&gt;</code>, phir <code>docker push &lt;uri&gt;:latest</code>. ECS/EKS task definition mein yeh URI reference hota hai.',
        hints: [
          'Pehle dekho kya repos hain: aws ecr describe-repositories',
          'Naya repo banao: aws ecr create-repository --repository-name my-app',
          'Verify karo: aws ecr describe-repositories (my-app ab dikhega)',
        ],
      },
      {
        type: 'quiz',
        title: 'Containers Quick-fire',
        questions: [
          {
            q: 'ECS Fargate ka sabse bada advantage?',
            choices: [
              'Serverless containers — no EC2 manage, pay per task, no K8s learn. Simplest AWS container option',
              'Free hai',
              'Multi-cloud portable',
              'Lambda se fast',
            ],
            answer: 0,
            explain: 'Fargate = no server manage, no K8s. Just define task (CPU/RAM + image), AWS runs. Perfect for AWS-only teams wanting containers.',
          },
          {
            q: 'ECS vs EKS — kab EKS choose karein?',
            choices: [
              'Multi-cloud (AWS+GCP+Azure), K8s ecosystem (Helm/operators), portability, team knows K8s',
              'AWS-only, simple needed',
              'Sirf choti apps',
              'Free chahiye',
            ],
            answer: 0,
            explain: 'EKS = K8s. Portability (multi-cloud), ecosystem (Helm), team skills. Cost: complexity. ECS = AWS simplicity.',
          },
          {
            q: 'Lambda vs Container for API backend?',
            choices: [
              'Lambda = event-driven, short, $0 idle, scales auto. Container = long-running, stateful, constant load, more control',
              'Hamesha Lambda',
              'Hamesha container',
              'Dono same',
            ],
            answer: 0,
            explain: 'Spiky/idle = Lambda ($0 idle). Constant/heavy = container (cheaper at high volume). Stateful = container. Right tool.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Containers',
      instructions: 'Container architecture round. 🎤',
      questions: [
        {
          q: '"ECS vs EKS — kaise decide?" — interviewer.',
          choices: [
            'ECS = AWS-native, simple, Fargate serverless. EKS = Kubernetes, portable (multi-cloud), ecosystem, complex. AWS-only + simple = ECS. Multi-cloud/K8s = EKS',
            'Hamesha ECS',
            'Hamesha EKS',
            'Dono same',
          ],
          answer: 0,
          explain: 'ECS for AWS simplicity. EKS for portability + K8s ecosystem. Team skills matter. Cost: EKS control plane $73/mo + complexity.',
        },
        {
          q: 'Scenario: microservices, AWS-only, no K8s expertise. Best?',
          choices: [
            'ECS Fargate — serverless containers, no EC2, no K8s. Simplest. Pay per task',
            'EKS — K8s learn karo',
            'EC2 pe Docker manually',
            'Lambda sab kuch',
          ],
          answer: 0,
          explain: 'ECS Fargate = no server, no K8s, AWS-integrated. Perfect for microservices without K8s overhead. Fastest to production.',
        },
        {
          q: 'Interviewer: "Containers kab Lambda se behtar?"',
          choices: [
            'Long-running (>15min), stateful, constant high load, more control over runtime, WebSocket/long connections',
            'Hamesha Lambda behtar',
            'Kabhi nahi',
            'Sirf choti apps ke liye container',
          ],
          answer: 0,
            explain: 'Lambda 15min limit, stateless, cold start. Containers = long-running, stateful, WebSocket, constant load (cheaper than Lambda at high volume).',
        },
      ],
    },
    success: [
      'Main VM vs Container vs Lambda ka choice justify kar sakta hoon',
      'Main ECS (Fargate/EC2) vs EKS (Kubernetes) ka farak bata sakta hoon',
      'Main ECR aur container workflow samjhta hoon',
      'Main microservices architecture design kar sakta hoon',
    ],
    homework: `<p>ECS Fargate try karo (Free Tier-ish):</p>
      <pre># ECR mein image push
aws ecr create-repository --repository-name my-app
docker build -t my-app .
# (push steps from ECR console)

# ECS cluster (Fargate)
# Task definition: image, CPU/RAM, port
# Service: 2 tasks, ALB

# Browser: ALB URL → app</pre>
      <p>✅ Self-check: App chal raha? <b>Delete baad mein!</b></p>`,
    cards: [
      { front: 'VM vs Container vs Lambda?', back: 'VM: full OS, long-running, stateful. Container: shared OS, microservices, portable. Lambda: serverless, event-driven, ≤15min, $0 idle.' },
      { front: 'ECS vs EKS?', back: 'ECS = AWS-native, simple, Fargate serverless. EKS = managed Kubernetes, portable (multi-cloud), ecosystem, complex. AWS-only+simple = ECS. Multi-cloud/K8s = EKS.' },
      { front: 'Fargate?', back: 'Serverless containers. No EC2 manage, no K8s. Pay per task (CPU/RAM). Simplest AWS container option. Perfect for microservices without K8s.' },
      { front: 'ECR?', back: 'Elastic Container Registry. AWS Docker Hub. IAM-integrated. Lifecycle policies (old images auto-delete). Private.' },
      { front: 'Container vs Lambda (API)?', back: 'Lambda: spiky/idle, $0 idle, ≤15min. Container: long-running, stateful, constant high load (cheaper), WebSocket. Right tool for load pattern.' },
    ],
  },

  /* ================= LEVEL 5: IaC ================= */
  {
    id: 'iac',
    icon: '🏗️',
    title: 'Infrastructure as Code — CloudFormation vs Terraform',
    badge: 'IaC Ishwar',
    objectives: [
      '<b>IaC kyun</b> — manual clicks band, code se infra',
      '<b>CloudFormation</b> (AWS) vs <b>Terraform</b> (multi-cloud)',
      'Templates, stacks, state, drift',
      'terraform commands use karna',
    ],
    lesson: [
      `<h3>🏗️ IaC — console ke clicks band, code se infra</h3>
       <p>Bina IaC: console mein click karke EC2/VPC banate ho. Problem?</p>
       <ul>
         <li>❌ <b>Not repeatable</b> — dev/staging/prod alag click karoge</li>
         <li>❌ <b>No version control</b> — kya change hua, pata nahi</li>
         <li>❌ <b>No audit</b> — kaunne kya banaya</li>
         <li>❌ <b>Drift</b> — koi console mein change, code outdated</li>
       </ul>
       <p><b>IaC (Infrastructure as Code)</b> = infrastructure code mein
       (YAML/HCL). Git-tracked, repeatable, auditable.</p>
       <pre># Terraform example
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t3.micro"
  tags = { Name = "web-server" }
}

# terraform plan  → kya banega dikhata
# terraform apply → actually banata</pre>`,
      `<h3>📋 CloudFormation vs Terraform</h3>
       <table>
         <tr><th>CloudFormation (AWS)</th><th>Terraform (HashiCorp)</th></tr>
         <tr><td>AWS-only</td><td>Multi-cloud (AWS, Azure, GCP...)</td></tr>
         <tr><td>YAML/JSON templates</td><td>HCL (HashiCorp Config Language)</td></tr>
         <tr><td>Stacks (resource groups)</td><td>State file (tfstate)</td></tr>
         <tr><td>Free (ya Open Source)</td><td>Open source (CLI free)</td></tr>
         <tr><td>Deep AWS integration</td><td>Provider ecosystem</td></tr>
         <tr><td>AWS manages state</td><td>You manage state (S3+DynamoDB lock)</td></tr>
       </table>
       <p>💡 <b>AWS-only</b> = CloudFormation (free, deep integration). <b>Multi-cloud
       ya team knows Terraform</b> = Terraform.</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek company ne console
       se sab banaya. Ek engineer ne galti se prod RDS delete kiya (console
       click). Recovery: 4 ghante. Fix: <b>Terraform</b> adopt kiya — Git
       review se delete prevent, plan se preview, state se track. Console
       clicks banned. <b>6 mahine mein 0 manual incidents.</b></div>`,
      `<h3>🗺️ State + Drift — Terraform ka dil</h3>
       <p>Terraform ka <b>state file</b> (tfstate) = currently kya infrastructure
       hai. Har <code>plan</code>/<code>apply</code> pe state compare karta.</p>
       <ul>
         <li>🗺️ <b>State</b> — JSON file, S3 mein store (remote backend)</li>
         <li>🔍 <b>Drift detection</b> — <code>plan</code> chalao, agar kisi
             ne console mein change kiya hoga to dikhega</li>
         <li>🔒 <b>State locking</b> — DynamoDB lock, simultaneous apply prevent</li>
         <li>🤝 <b>Team</b> — remote state (S3) sab share karte, local nahi</li>
       </ul>
       <p>💡 <b>Never commit tfstate to Git</b> — secrets ho sakte hain. S3
       mein rakho, .gitignore mein daalo.</p>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'IaC — diagram detective',
        instructions: 'CloudFormation/Terraform ke components par click karo.',
        visual: 'iac',
        questions: [
          { q: 'CloudFormation template (YAML/JSON)?', target: 'template', explain: 'Template. Stack banata. Resources define.' },
          { q: 'CloudFormation stack — resource group?', target: 'stack', explain: 'Stack. Template se banaya. Delete stack = sab delete.' },
          { q: 'Terraform config (.tf, HCL)?', target: 'tfconfig', explain: 'Terraform config. HCL language. Multi-cloud.' },
          { q: 'Terraform state file — current infra?', target: 'tfconfig', explain: 'Wait — state is separate. tfstate file tracks current.' },
        ],
      },
      {
        type: 'terminal',
        title: '🖥️ Mission: Terraform Explorer',
        instructions: 'Terraform simulator try karo — validate, plan, apply.',
        goal: 'Terraform workflow: <b>(1)</b> <code>terraform validate</code> chalao. <b>(2)</b> <code>terraform plan</code> — kya banega dekho. <b>(3)</b> <code>terraform apply</code> — resources banao.',
        tasks: [
          { text: 'terraform validate', check: s => s.history.some(h => /terraform validate/.test(h)) },
          { text: 'terraform plan', check: s => s.history.some(h => /terraform plan/.test(h)) },
          { text: 'terraform apply', check: s => s.history.some(h => /terraform apply/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          buckets: [], vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        files: {
          'main.tf': {
            desc: 'EC2 instance + S3 bucket define karta hai',
            apply: s => {
              s.account.instances = s.account.instances || [];
              s.account.instances.push({ id: 'i-iac-001', name: 'iac-web', type: 't3.micro', state: 'running', az: 'us-east-1a' });
              s.account.buckets = s.account.buckets || [];
              s.account.buckets.push({ name: 'iac-bucket-2024', region: 'us-east-1', encryption: true, public: false, objects: [] });
              return 'aws_instance.iac-web: Creating... (i-iac-001)\naws_s3_bucket.iac-bucket: Creating... (iac-bucket-2024)\n\nApply complete! 2 resources added.';
            },
          },
        },
        success: s => s.history.some(h => /terraform validate/.test(h)) && s.history.some(h => /terraform plan/.test(h)) && s.history.some(h => /terraform apply/.test(h)),
        successText: 'Terraform workflow complete! <b>validate</b> (syntax check) → <b>plan</b> (preview, kya banega) → <b>apply</b> (actually banao). Notice: <code>apply</code> ne EC2 + S3 banaya (file mein defined). Yehi IaC ka power — code se infra, repeatable, Git-tracked.',
        hints: [
          'terraform validate — syntax check',
          'terraform plan — preview kya banega',
          'terraform apply — actually banao',
        ],
      },
      {
        type: 'fill',
        title: 'CloudFormation template ke blanks',
        instructions: 'Ek chhota CFN template — S3 bucket + uska naam output. Tokens sahi jagah drag karo.',
        template: `AWSTemplateFormatVersion: "2010-09-09"

Parameters:
  EnvName:
    Type: String
    AllowedValues: [dev, prod]

{0}:
  IsProd: !Equals [!Ref EnvName, "prod"]

Resources:
  AppBucket:
    Type: AWS::S3::Bucket
    {1}: Retain          # stack delete hone par bucket bacha rahe
    Properties:
      BucketName: !Sub "myapp-\${EnvName}-assets"
      VersioningConfiguration:
        Status: !If [IsProd, "Enabled", "Suspended"]

{2}:
  BucketArn:
    Value: !{3} [AppBucket, Arn]
    Export:
      Name: !Sub "\${AWS::StackName}-BucketArn"`,
        tokens: ['Conditions', 'DeletionPolicy', 'Outputs', 'GetAtt', 'Mappings', 'UpdatePolicy', 'Resources', 'Ref'],
        blanks: [
          { answer: 'Conditions', explain: '<code>Conditions</code> section — boolean jo <code>!If</code> mein use hota hai. Ek hi template dev aur prod dono ke liye. (<code>Mappings</code> alag hai — woh lookup table hai, e.g. region → AMI id.)' },
          { answer: 'DeletionPolicy', explain: '<code>DeletionPolicy: Retain</code> — stack delete par resource bacha rahega. Stateful cheezon (S3, RDS) par yeh na lagana woh galti hai jo ek hi baar karte ho. <code>Snapshot</code> bhi option hai.' },
          { answer: 'Outputs', explain: '<code>Outputs</code> + <code>Export</code> = dusri stack <code>!ImportValue</code> se yeh ARN utha sakti hai. Cross-stack reference ka tarika.' },
          { answer: 'GetAtt', explain: '<code>!GetAtt [Resource, Attribute]</code> = resource ka koi bhi attribute (Arn, DomainName...). <code>!Ref</code> sirf default identifier deta hai (bucket ke case mein naam).' },
        ],
      },
      {
        type: 'quiz',
        title: 'IaC Quick-fire',
        questions: [
          {
            q: 'IaC ka sabse bada benefit?',
            choices: [
              'Repeatable (Git-tracked), auditable, no manual clicks, drift detection, team collaboration',
              'Free hai',
              'Fast hai',
              'Console se better UI',
            ],
            answer: 0,
            explain: 'IaC = reproducible infra. Dev/staging/prod same template. Git history = audit. No drift (plan detects console changes).',
          },
          {
            q: 'CloudFormation vs Terraform — kab Terraform?',
            choices: [
              'Multi-cloud (AWS+Azure+GCP), team knows HCL, provider ecosystem needed',
              'AWS-only project',
              'Sirf choti infra',
              'Free chahiye',
            ],
            answer: 0,
            explain: 'Terraform = multi-cloud. AWS-only = CloudFormation (free, deep integration). Team skills + future multi-cloud = Terraform.',
          },
          {
            q: 'Terraform state file kahan store karein?',
            choices: [
              'Remote backend (S3 + DynamoDB lock) — team share, locking, never Git (secrets)',
              'Local laptop pe',
              'Git mein commit',
              'EC2 pe',
            ],
            answer: 0,
            explain: 'S3 remote backend + DynamoDB lock (simultaneous apply prevent). Never Git (secrets). Team shares. .gitignore mein tfstate.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — IaC',
      instructions: 'IaC round. 🎤',
      questions: [
        {
          q: '"IaC kyun zaroori, console se kya problem?" — interviewer.',
          choices: [
            'Console = not repeatable, no version control, no audit, drift prone, team can\'t collaborate. IaC = Git-tracked, repeatable, auditable, drift detection',
            'Console slow hai',
            'Console paid hai',
            'Koi problem nahi',
          ],
          answer: 0,
          explain: 'Console clicks = manual, error-prone, no history. IaC = code review, plan preview, repeatable, team collaboration. Industry standard.',
        },
        {
          q: 'Scenario: AWS + Azure dono pe infra manage. IaC choice?',
          choices: [
            'Terraform — multi-cloud, same tool dono pe. HCL. Provider ecosystem',
            'CloudFormation — sirf AWS',
            'Azure ARM — sirf Azure',
            'Console se dono',
          ],
          answer: 0,
          explain: 'Terraform = multi-cloud standard. Ek tool, dono clouds. Same workflow. CloudFormation/ARM = single-cloud only.',
        },
        {
          q: 'Interviewer: "Terraform state kyun important?"',
          choices: [
            'State = current infra snapshot. plan/apply state compare karta. Drift detection. Remote (S3) + lock (DynamoDB). Never Git (secrets)',
            'State optional hai',
            'State = terraform ka code',
            'State AWS manage karta',
          ],
          answer: 0,
            explain: 'State = source of truth for current infra. Without state, Terraform can\'t know what exists. Drift = state vs reality. Remote + lock for teams.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Terraform workflow practice! Team ne IaC adopt kiya. Tum <b>first deployment</b> karo: <b>(1)</b> <code>terraform validate</code> — syntax check. <b>(2)</b> <code>terraform plan</code> — preview kya banega. <b>(3)</b> <code>terraform apply</code> — resources banao.',
            tasks: [
              { text: 'terraform validate — syntax check', check: s => s.history.some(h => /terraform validate/.test(h)) },
              { text: 'terraform plan — preview', check: s => s.history.some(h => /terraform plan/.test(h)) },
              { text: 'terraform apply — create resources', check: s => s.history.some(h => /terraform apply/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              buckets: [], vpcs: [], subnets: [], securityGroups: [], instances: [],
            },
            files: {
              'main.tf': {
                desc: 'EC2 instance + S3 bucket define karta hai',
                apply: s => {
                  s.account.instances = s.account.instances || [];
                  s.account.instances.push({ id: 'i-tf-001', name: 'tf-web', type: 't3.micro', state: 'running', az: 'us-east-1a' });
                  s.account.buckets = s.account.buckets || [];
                  s.account.buckets.push({ name: 'tf-bucket-2024', region: 'us-east-1', encryption: true, public: false, objects: [] });
                  return 'aws_instance.tf-web: Creating... (i-tf-001)\naws_s3_bucket.tf-bucket: Creating... (tf-bucket-2024)\n\nApply complete! 2 resources added.';
                },
              },
            },
            success: s => s.history.some(h => /terraform validate/.test(h)) && s.history.some(h => /terraform plan/.test(h)) && s.history.some(h => /terraform apply/.test(h)),
            successText: 'IaC workflow complete! 🏗️ <b>validate</b> → syntax OK. <b>plan</b> → 2 resources preview (EC2 + S3). <b>apply</b> → actually ban gaya! Yehi Terraform ka power — code se infra, repeatable, Git-tracked. Console se banaya hota toh no audit, no version history. Pro tip: production mein <b>plan</b> review karke hi <b>apply</b> karo — unintended changes plan mein dikhte hain.',
            hints: [
              'terraform validate — syntax check karo',
              'terraform plan — kya banega preview karo',
              'terraform apply — actually resources banao',
            ],
          },
        },
      ],
    },
    success: [
      'Main IaC ke benefits (repeatable, auditable, drift detection) explain kar sakta hoon',
      'Main CloudFormation vs Terraform ka choice justify kar sakta hoon',
      'Main Terraform workflow (validate/plan/apply) aur state management samjhta hoon',
      'Main terraform commands use kar sakta hoon',
    ],
    homework: `<p>Terraform install karke EC2 banao:</p>
      <pre># Install: https://terraform.io (CLI)
# main.tf banao:
resource "aws_instance" "web" {
  ami           = "ami-0c7217cdde336cf2"  # Amazon Linux 2
  instance_type = "t2.micro"               # Free Tier
  tags          = { Name = "tf-web" }
}

# Commands:
terraform init      # providers download
terraform plan      # preview
terraform apply     # create (yes)
terraform destroy   # clean up</pre>
      <p>✅ Self-check: <code>apply</code> ne EC2 banaya? <b>Destroy zaroor!</b></p>`,
    cards: [
      { front: 'IaC kyun?', back: 'Repeatable (Git-tracked), auditable, no manual clicks, drift detection, team collaboration. Dev/staging/prod same template. Industry standard.' },
      { front: 'CloudFormation vs Terraform?', back: 'CF: AWS-only, YAML/JSON, free, deep integration. Terraform: multi-cloud, HCL, state file you manage. AWS-only = CF. Multi-cloud = Terraform.' },
      { front: 'Terraform workflow?', back: '<b>init</b> (providers) → <b>validate</b> (syntax) → <b>plan</b> (preview) → <b>apply</b> (create) → <b>destroy</b> (clean). Plan se pata kya banega.' },
      { front: 'State file management?', back: 'Remote backend (S3 + DynamoDB lock). Team share, prevent simultaneous apply. <b>Never Git</b> (secrets). .gitignore mein tfstate.' },
      { front: 'Drift detection?', back: '<code>terraform plan</code> state vs real infra compare. Agar kisi ne console mein change kiya, plan dikhega "will change". IaC = detect manual drift.' },
    ],
  },

  /* ================= LEVEL 6: Cost Optimization ================= */
  {
    id: 'cost',
    icon: '💰',
    title: 'Cost Optimization — Kam Paisa, Same Value',
    badge: 'Paisa Prabhu',
    objectives: [
      '<b>Pricing models</b>: On-Demand, Reserved, Spot, Savings Plans',
      '<b>Rightsizing</b> + lifecycle + auto scaling for cost',
      '<b>Cost Explorer, Budgets, Allocation Tags</b>',
      'Cost architecture decisions',
    ],
    lesson: [
      `<h3>💵 Pricing models — kaunsa kab?</h3>
       <p>AWS EC2 ke 3 main pricing models (cost kam karne ke):</p>
       <table>
         <tr><th>Model</th><th>Discount</th><th>Commitment</th><th>Use case</th></tr>
         <tr><td><b>On-Demand</b></td><td>0% (base)</td><td>None</td><td>Default, unpredictable, short-term</td></tr>
         <tr><td><b>Reserved</b> (1/3 yr)</td><td>Up to 72%</td><td>Commit</td><td>Steady-state (DB, web server 24/7)</td></tr>
         <tr><td><b>Spot</b></td><td>Up to 90%</td><td>None (can be killed)</td><td>Batch, fault-tolerant, flexible</td></tr>
         <tr><td><b>Savings Plans</b></td><td>Up to 72%</td><td>$/hr commit</td><td>Flexible (any instance family/region)</td></tr>
       </table>
       <p>💡 <b>Steady 24/7</b> = Reserved. <b>Batch/flexible</b> = Spot. <b>Unpredictable</b> = On-Demand. <b>Flexible commit</b> = Savings Plans.</p>
       <div class="war-story"><b>⚡ Real incident:</b> Ek startup ne sab
       <b>On-Demand</b> chalaya — $50k/mo. Reserved (1yr, 72% off) laaya on
       steady servers → <b>$14k/mo</b>. Batch jobs Spot pe → <b>$500</b>
       (was $5k). Total <b>$20k/mo (60% saving)</b>. Seekh: <b>commit what\'s
       steady, spot what\'s flexible</b>.</div>`,
      `<h3>📏 Rightsizing + Lifecycle — waste hatado</h3>
       <p><b>Rightsizing</b> = CloudWatch metrics dekhke bade instances ko
       chhota karo. CPU 10%? <code>m5.xlarge</code> → <code>t3.medium</code>.
       70% saving.</p>
       <p><b>S3 Lifecycle</b> = old data auto cheaper class. 30d→IA, 90d→Glacier.
       80% saving (intermediate level mein seekha).</p>
       <p><b>Auto Scaling</b> = traffic kam → instances kam. Raat ko scale down.
       Daytime scale up. Idle = $0 (ya kam).</p>
       <pre># Cost optimization checklist:
✅ Rightsizing (CloudWatch CPU/RAM)
✅ Reserved/Savings Plans (steady)
✅ Spot (batch/flexible)
✅ S3 lifecycle (old data → Glacier)
✅ Auto Scaling (scale down idle)
✅ Cost allocation tags (team/project)
✅ Budgets + alerts
✅ Delete unused EBS/resources</pre>`,
      `<h3>📊 Cost Explorer + Budgets + Tags</h3>
       <ul>
         <li>📊 <b>Cost Explorer</b> — visualize spend over time, by service/
             tag/region. Trends, forecasts.</li>
         <li>💰 <b>Budgets</b> — set limit ($X/month), alert at 80%.
             <b>RDS spend</b> budget specific.</li>
         <li>🏷️ <b>Cost Allocation Tags</b> — tag resources (team=payments,
             env=prod). Cost by team. Accountability.</li>
         <li>🔔 <b>Billing alarms</b> — SNS alert if bill crosses threshold.</li>
       </ul>
       <p>💡 <b>Tags</b> = accountability. "Payments team ne $10k kharcha"
       = clear. Without tags = "AWS ka bill $50k, kaunne kya?"</p>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Pricing model choose karo',
        instructions: 'Har workload ko sahi pricing model mein daalo.',
        bins: [
          { id: 'on', label: '📊 On-Demand' },
          { id: 'reserved', label: '🎟️ Reserved' },
          { id: 'spot', label: '⚡ Spot' },
        ],
        items: [
          { text: 'Prod DB, 24/7, steady load', bin: 'reserved', explain: 'Reserved 1/3yr. 72% off. Steady = commit.' },
          { text: 'Batch video encoding, can restart', bin: 'spot', explain: 'Spot 90% off. Fault-tolerant. Can be killed.' },
          { text: 'New app, traffic unpredictable', bin: 'on', explain: 'On-Demand. No commit. Flexible.' },
          { text: 'Dev test server, business hours only', bin: 'reserved', explain: 'Reserved (ya stop nights). Steady pattern.' },
          { text: 'ML training, 4hr job, flexible start', bin: 'spot', explain: 'Spot. Batch. Can wait/restart.' },
          { text: 'Sudden traffic spike (scale out)', bin: 'on', explain: 'On-Demand for burst. Reserved for base.' },
        ],
      },
      {
        type: 'order',
        title: 'Cost optimization audit — steps',
        instructions: 'Cost audit karne ke steps sahi order mein.',
        steps: [
          { text: 'Cost Explorer se spend analyze (by service/tag)', explain: 'Pehle dekho kahan paisa ja raha. Top services.' },
          { text: 'Rightsizing — bade instances chhote karo (CloudWatch)', explain: 'CPU 10%? Downsize. 70% saving often.' },
          { text: 'Reserved/Savings Plans for steady workloads', explain: 'Commit 1/3yr. 72% off. Steady 24/7.' },
          { text: 'Spot for batch/flexible workloads', explain: '90% off. Fault-tolerant jobs.' },
          { text: 'S3 lifecycle + delete unused (EBS, snapshots)', explain: 'Old data cheaper. Unused = waste.' },
          { text: 'Budgets + alerts + tags (accountability)', explain: 'Set limits. Team-wise cost. Alerts on breach.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Cost Quick-fire',
        questions: [
          {
            q: 'Steady prod DB 24/7. Sabse sasta pricing?',
            choices: [
              'Reserved Instance (1/3yr) — up to 72% off. Steady = commit',
              'On-Demand — base price',
              'Spot — can be killed (bad for DB)',
              'Free Tier',
            ],
            answer: 0,
            explain: 'DB = steady, can\'t be killed. Reserved = commit = 72% off. Spot = risky (DB killed = data loss).',
          },
          {
            q: 'Batch job (video encode), 4hr, flexible. Best pricing?',
            choices: [
              'Spot — up to 90% off. Fault-tolerant, can restart. Perfect for batch',
              'On-Demand — expensive',
              'Reserved — overkill for batch',
              'Lambda — 15min limit',
            ],
            answer: 0,
            explain: 'Spot = spare capacity, 90% off. Can be interrupted. Batch = restart-able = perfect. EC2 Spot Fleet.',
          },
          {
            q: 'Cost allocation tags ka purpose?',
            choices: [
              'Team/project wise cost breakdown — accountability. "Payments team $10k"',
              'Faster EC2',
              'Free tier enable',
              'Security improve',
            ],
            answer: 0,
            explain: 'Tags = accountability. Tag resources (team, env, project). Cost Explorer mein filter. "Kaunne kya kharcha" clear.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Cost',
      instructions: 'Cost optimization round. 🎤',
      questions: [
        {
          q: '"AWS bill $50k/mo hai. Cost optimize kaise?" — interviewer.',
          choices: [
            'Cost Explorer analyze → rightsizing (bade→chhote) → Reserved/Savings for steady → Spot for batch → S3 lifecycle → delete unused → tags + budgets. 40-60% typical saving',
            'Sab EC2 band kar do',
            'AWS ko call karo discount maango',
            'Region change kar lo',
          ],
          answer: 0,
          explain: 'Systematic: analyze, rightsize, commit (Reserved), spot (batch), lifecycle, clean, monitor. Real companies 40-60% save.',
        },
        {
          q: 'Scenario: prod web servers 24/7, batch jobs nightly. Pricing mix?',
          choices: [
            'Web servers = Reserved (steady 24/7, 72% off). Batch = Spot (90% off, can restart). Mix for optimal',
            'Sab On-Demand',
            'Sab Spot (web bhi) — risky',
            'Sab Reserved — batch overkill',
            ],
          answer: 0,
            explain: 'Right mix. Steady (web) = Reserved commit. Flexible (batch) = Spot. On-Demand for burst. Layered pricing = optimal cost.',
        },
        {
          q: 'Interviewer: "Rightsizing kaise karoge?"',
          choices: [
            'CloudWatch metrics (CPU/RAM) dekho. CPU <20% consistently? Next smaller instance. Test, monitor. 70% saving common',
            'Sabse bada instance chuno',
            'Random chhota karo',
            'AWS khud karta',
          ],
          answer: 0,
          explain: 'Data-driven. CloudWatch 2-4 weeks metrics. Low utilization → smaller. m5.xlarge→t3.medium = 75% saving. Test before/after.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Cost audit! Finance ne bola "EC2 bill bahut zyada hai". Investigate: <b>(1)</b> EC2 instances list karo — kaunse types chal rahe. <b>(2)</b> S3 buckets dekho — kitne buckets, kitna data. <b>(3)</b> RDS instances — over-provisioned?',
            tasks: [
              { text: 'aws ec2 describe-instances — instance types + status', check: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) },
              { text: 'aws s3api list-buckets — buckets count', check: s => s.history.some(h => /aws s3api list-buckets/.test(h)) },
              { text: 'aws rds describe-db-instances — DB class check', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              instances: [
                { id: 'i-web01', name: 'web-server', type: 'm5.xlarge', state: 'running', az: 'us-east-1a', vpcId: 'vpc-1', subnetId: 's-1', sgIds: ['sg-1'], publicIp: '54.1.1.1', privateIp: '10.0.1.5' },
                { id: 'i-web02', name: 'web-server-2', type: 'm5.xlarge', state: 'running', az: 'us-east-1b', vpcId: 'vpc-1', subnetId: 's-2', sgIds: ['sg-1'], publicIp: '54.1.1.2', privateIp: '10.0.1.6' },
                { id: 'i-dev01', name: 'dev-box', type: 'm5.2xlarge', state: 'running', az: 'us-east-1a', vpcId: 'vpc-1', subnetId: 's-1', sgIds: ['sg-1'], publicIp: null, privateIp: '10.0.1.10' },
              ],
              buckets: [
                { name: 'app-logs-2024', region: 'us-east-1', encryption: false, public: false, objects: [{ key: 'log-001.txt', size: 50000000, lastModified: '2024-07-01' }] },
                { name: 'app-assets-2024', region: 'us-east-1', encryption: true, public: false, objects: [] },
                { name: 'old-backup-2023', region: 'us-east-1', encryption: false, public: false, objects: [{ key: 'backup.tar.gz', size: 50000000000, lastModified: '2023-12-01' }] },
              ],
              rds: [
                { id: 'dev-db', name: 'dev-db', engine: 'postgres', class: 'db.r6.4xlarge', state: 'available', multiAZ: false, endpoint: 'dev-db.cxxx.rds.amazonaws.com', storage: 500 },
              ],
              securityGroups: [], vpcs: [], subnets: [],
            },
            success: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) && s.history.some(h => /aws s3api list-buckets/.test(h)) && s.history.some(h => /aws rds describe-db-instances/.test(h)),
            successText: 'Cost audit complete! 💰 Findings: <b>EC2</b> — 2x m5.xlarge (web, OK) + 1x <b>m5.2xlarge for DEV</b> (over-provisioned! dev pe 8 vCPU/32GB chahiye nahi → t3.medium, 75% saving). <b>S3</b> — <b>old-backup-2023</b> (50GB, Dec 2023, no encryption) → Glacier Deep Archive move karo (90% saving). <b>RDS</b> — dev-db <b>db.r6.4xlarge</b> (16 vCPU/128GB for DEV?! → db.t3.micro, 95% saving). Total potential saving: ~$2000/mo. Pro tip: CloudWatch metrics se CPU < 10% = rightsize candidate.',
            hints: [
              'aws ec2 describe-instances — InstanceType field dekho, dev vs prod compare',
              'aws s3api list-buckets — old buckets dhundo (2023 ke, bina encryption)',
              'aws rds describe-db-instances — DBInstanceClass dekho, dev ke liye chhota chahiye',
            ],
          },
        },
      ],
    },
    success: [
      'Main 4 pricing models (On-Demand/Reserved/Spot/Savings) aur kab kya use bata sakta hoon',
      'Main rightsizing, lifecycle, auto scaling se cost optimize kar sakta hoon',
      'Main Cost Explorer, Budgets, Cost Allocation Tags samjhta hoon',
      'Main cost audit strategy design kar sakta hoon',
    ],
    homework: `<p>Cost Explorer + Budget setup:</p>
      <pre># Console → Billing → Cost Explorer
# View: spend by service, by tag, last 3 months
# Identify top 3 costly services

# Budget:
# Console → Budgets → Create
# Type: Cost budget, $X/month
# Alert: 80% → SNS email

# Tags:
# Tag resources: team, env, project
# Activate tags in Billing → Cost Allocation Tags</pre>
      <p>✅ Self-check: Budget bana? Top costly services identify?</p>`,
    cards: [
      { front: '4 pricing models?', back: '<b>On-Demand</b> (base, no commit), <b>Reserved</b> (72% off, 1/3yr commit), <b>Spot</b> (90% off, can kill), <b>Savings Plans</b> ($/hr commit, flexible).' },
      { front: 'Steady vs batch pricing?', back: 'Steady 24/7 (DB, web) = <b>Reserved</b> (72% off). Batch/flexible = <b>Spot</b> (90% off, can restart). Burst = On-Demand. Layered.' },
      { front: 'Rightsizing?', back: 'CloudWatch metrics. CPU <20% consistently → smaller instance. m5.xlarge→t3.medium = 75% saving. Data-driven, test before/after.' },
      { front: 'Cost Explorer + Budgets?', back: 'Explorer: visualize spend by service/tag/time. Budgets: $X/month limit, alert at 80%. Tags: team-wise accountability. Billing alarms.' },
      { front: 'Cost audit flow?', back: '1) Explorer analyze 2) Rightsizing 3) Reserved/Savings 4) Spot batch 5) S3 lifecycle 6) Delete unused 7) Tags + Budgets. 40-60% typical saving.' },
    ],
  },

  /* ================= LEVEL 7: Observability ================= */
  {
    id: 'observability',
    icon: '👁️',
    title: 'Observability — Metrics, Logs, Traces, Audit',
    badge: 'Drashta Dev',
    objectives: [
      '<b>3 pillars</b>: metrics, logs, traces',
      '<b>CloudWatch</b> (metrics/logs/alarms), <b>X-Ray</b> (tracing)',
      '<b>CloudTrail</b> (API audit), <b>VPC Flow Logs</b>',
      'Debugging superpowers',
    ],
    lesson: [
      `<h3>👁️ Observability — debugging ka superpower</h3>
       <p>Bina observability: "app slow hai" — kyun? Pata nahi. Observability
       ke 3 pillars:</p>
       <ul>
         <li>📊 <b>Metrics</b> — numbers over time (CPU, latency, error rate)</li>
         <li>📜 <b>Logs</b> — text events (app output, errors)</li>
         <li>🔍 <b>Traces</b> — request ka poora safar across services</li>
       </ul>
       <p>💡 <b>Metrics</b> = "kya slow hai" (alerting). <b>Logs</b> = "kyun"
       (debug). <b>Traces</b> = "kahan" (distributed). Sab milke debug.</p>`,
      `<h3>📊 CloudWatch — metrics, logs, alarms</h3>
       <p><b>CloudWatch</b> = AWS ka observability hub.</p>
       <ul>
         <li>📊 <b>Metrics</b> — EC2 CPU, RDS connections, Lambda errors.
             Custom metrics bhi (PutMetricData).</li>
         <li>📜 <b>Logs</b> — Log Groups (app), Log Streams (instance).
             Insights query (search logs).</li>
         <li>🚨 <b>Alarms</b> — threshold cross → SNS (email/SMS/Lambda).
             CPU > 80% for 5min → alert.</li>
         <li>📊 <b>Dashboards</b> — graphs, team-wide visibility.</li>
       </ul>
       <div class="war-story"><b>⚡ Real incident:</b> Ek team ko pata chala
       app slow — par kyun? Bina proper metrics, 4 ghante debug. Fix:
       CloudWatch dashboards (latency, error rate, CPU) + alarms (p95
       latency > 500ms → Slack). Next time: <b>alert aaya, 10 min mein root
       cause</b> (DB slow query). Seekh: <b>observability = time saved</b>.</div>`,
      `<h3>🔍 X-Ray + CloudTrail + Flow Logs</h3>
       <p><b>X-Ray</b> = distributed tracing. Microservices mein request ka
       poora safar — kahan slow, kahan fail. "User → API GW → Lambda →
       DynamoDB" har step ka time.</p>
       <p><b>CloudTrail</b> = API audit log. <b>Kaunne kya AWS API call kiya,
       kab</b>. Security investigation, compliance. "Root user ne RDS delete
       kiya 3 AM" — trail mein.</p>
       <p><b>VPC Flow Logs</b> = network traffic log. Kaunse IP se kaunse
       port pe connection. Security + debug (kyun connection fail?).</p>
       <pre># Observability stack:
Metrics  → CloudWatch (CPU, latency, errors)
Logs     → CloudWatch Logs (app output, errors)
Traces   → X-Ray (request across services)
Audit    → CloudTrail (AWS API calls)
Network  → VPC Flow Logs (traffic)</pre>`,
    ],
    stages: [
      {
        type: 'hotspot',
        title: 'Observability — diagram detective',
        instructions: 'Observability tools ke components par click karo.',
        visual: 'observability',
        questions: [
          { q: 'Numbers over time (CPU, latency)?', target: 'cwmetrics', explain: 'CloudWatch Metrics. Numbers, time series. Alerting.' },
          { q: 'App output, text events?', target: 'cwlogs', explain: 'CloudWatch Logs. App stdout/stderr. Search/Insights.' },
          { q: 'Threshold cross → alert?', target: 'alarm', explain: 'CloudWatch Alarms. CPU > 80% → SNS. Alerting.' },
          { q: 'Request safar across services?', target: 'xray', explain: 'X-Ray. Distributed tracing. Microservices debug.' },
          { q: 'API audit — kaun kya kiya?', target: 'cloudtrail', explain: 'CloudTrail. AWS API calls log. Security, compliance.' },
          { q: 'Network traffic log?', target: 'flowlogs', explain: 'VPC Flow Logs. IP/port connections. Security + debug.' },
        ],
      },
      {
        type: 'match',
        title: 'Observability tools — naam milao',
        instructions: 'Har tool ko uske kaam se milao.',
        pairs: [
          { left: 'CloudWatch Metrics', right: 'Numbers over time — CPU, latency, error rate. Alerting, dashboards', explain: '"Kya slow hai" — high-level signal.' },
          { left: 'CloudWatch Logs', right: 'Text events — app output, errors. Insights query', explain: '"Kyun" — deep debug. Log search.' },
          { left: 'X-Ray', right: 'Distributed tracing — request across microservices. Per-step time', explain: '"Kahan slow" — microservices.' },
          { left: 'CloudTrail', right: 'API audit — kaunne kya AWS API call kiya, kab. Security, compliance', explain: '"Kaunne kya kiya" — security investigation.' },
          { left: 'VPC Flow Logs', right: 'Network traffic — IP/port connections. Security, debug', explain: 'Connection refused? Flow Logs se root cause.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Observability Quick-fire',
        questions: [
          {
            q: 'Microservices app, request slow. Kaunsa tool root cause dhoondega?',
            choices: [
              'X-Ray — distributed tracing, request ka safar, kahan slow/fail dikhega',
              'CloudWatch Metrics — high-level only',
              'CloudTrail — API audit, not app',
              'S3 — storage',
            ],
            answer: 0,
            explain: 'X-Ray = request trace across services. "API GW → Lambda (50ms) → DynamoDB (800ms)" — DynamoDB slow! Microservices must.',
          },
          {
            q: 'CloudTrail ka primary use?',
            choices: [
              'API audit — kaunne kya AWS API call kiya, kab. Security investigation, compliance',
              'App logs',
              'Metrics dashboards',
              'Network traffic',
            ],
            answer: 0,
            explain: 'CloudTrail = AWS API audit. "Root ne RDS delete 3AM" — trail. Security forensics, compliance (PCI/HIPAA).',
          },
          {
            q: 'CPU > 80% for 5 min → email alert. Kaunsa tool?',
            choices: [
              'CloudWatch Alarm + SNS — threshold cross → notification',
              'CloudTrail',
              'X-Ray',
              'VPC Flow Logs',
            ],
            answer: 0,
            explain: 'CloudWatch Alarm = threshold + duration → SNS (email/SMS/Lambda). Proactive alerting before user complaints.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Observability',
      instructions: 'Monitoring round. 🎤',
      questions: [
        {
          q: '"Observability ke 3 pillars?" — interviewer.',
          choices: [
            'Metrics (numbers, alerting), Logs (text, debug), Traces (request across services, microservices)',
            'Logs, alerts, emails',
            'CPU, RAM, disk',
            'CloudWatch, S3, EC2',
          ],
          answer: 0,
          explain: '3 pillars: metrics (what), logs (why), traces (where in distributed). All needed for full observability.',
        },
        {
          q: 'Scenario: microservices, request slow. Debug approach?',
          choices: [
            'X-Ray trace → see per-service time → find slow service → CloudWatch Logs for that service → root cause',
            'Sab EC2 restart karo',
            'Logs manually read karo (lakhon lines)',
            'Bigger instances',
          ],
          answer: 0,
            explain: 'X-Ray = trace shows which service slow. Then that service\'s CloudWatch Logs for "kyun". Systematic, not guesswork.',
        },
        {
          q: 'Interviewer: "CloudTrail ka use batao production mein."',
          choices: [
            'API audit log — security investigation (kaunne kya kiya), compliance (PCI/HIPAA), root cause (unauthorized delete?). All AWS API calls',
            'App performance monitor',
            'Cost tracking',
            'Network traffic',
          ],
          answer: 0,
          explain: 'CloudTrail = who did what AWS API call, when. Security forensics ("who deleted RDS"), compliance audit. Enable on all accounts.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: Monitoring audit! Production mein <b>no alerts</b> report mila. Verify karo: <b>(1)</b> CloudWatch alarms list karo. <b>(2)</b> CloudWatch log groups dekho. <b>(3)</b> KMS keys dekho (encryption audit).',
            tasks: [
              { text: 'aws cloudwatch describe-alarms — koi alerts setup hain?', check: s => s.history.some(h => /aws cloudwatch describe-alarms/.test(h)) },
              { text: 'aws logs describe-log-groups — log groups dekho', check: s => s.history.some(h => /aws logs describe-log-groups/.test(h)) },
              { text: 'aws kms list-keys — encryption keys audit', check: s => s.history.some(h => /aws kms list-keys/.test(h)) },
            ],
            account: {
              region: 'us-east-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
              alarms: [],
              logGroups: [
                { name: '/aws/lambda/order-processor', retention: 7, events: ['INFO: processing order', 'INFO: order complete'] },
                { name: '/aws/lambda/email-sender', retention: null, events: [] },
              ],
              kmsKeys: [
                { id: 'key-1', alias: 'alias/app-data-key', state: 'Enabled' },
                { id: 'key-2', alias: 'alias/s3-backup-key', state: 'Enabled' },
              ],
              buckets: [],
            },
            success: s => s.history.some(h => /aws cloudwatch describe-alarms/.test(h)) && s.history.some(h => /aws logs describe-log-groups/.test(h)) && s.history.some(h => /aws kms list-keys/.test(h)),
            successText: 'Observability audit complete! 📋 Findings: <b>CloudWatch alarms</b> ❌ <b>ZERO alarms!</b> — production mein koi alert nahi. CPU 100% ho ya DB down, pata nahi chalega. Fix: CPU > 80% alarm, disk > 90%, error rate > 5%, DB connection count. <b>Log groups</b> ⚠️ — order-processor logs 7 din retention (OK), email-sender <b>no retention</b> (never expires = growing cost). Fix: retention set karo. <b>KMS</b> ✅ 2 keys enabled (app data + S3 backup). Pro tip: <b>1 alert per critical metric</b> — CPU, memory, disk, errors, latency. PagerDuty/Slack integration.',
            hints: [
              'aws cloudwatch describe-alarms — koi alarms hain? (MetricAlarms array dekho)',
              'aws logs describe-log-groups — retentionInDays dekho (null = never expire)',
              'aws kms list-keys — keys list, state Enabled hona chahiye',
            ],
          },
        },
      ],
    },
    success: [
      'Main observability ke 3 pillars (metrics/logs/traces) explain kar sakta hoon',
      'Main CloudWatch (metrics/logs/alarms) aur X-Ray (tracing) samjhta hoon',
      'Main CloudTrail (API audit) aur VPC Flow Logs ka role bata sakta hoon',
      'Main systematic debugging approach use kar sakta hoon',
    ],
    homework: `<p>CloudWatch dashboard + alarm banao:</p>
      <pre># Console → CloudWatch → Dashboards → Create
# Widgets: EC2 CPU, RDS connections, Lambda errors

# Alarm:
# Console → CloudWatch → Alarms → Create
# Metric: EC2 CPUUtilization
# Threshold: > 80% for 5 min
# Action: SNS → email</pre>
      <p>✅ Self-check: Dashboard mein metrics dikhe? Alarm bana?</p>`,
    cards: [
      { front: 'Observability 3 pillars?', back: '<b>Metrics</b> (numbers, alerting — "kya"), <b>Logs</b> (text, debug — "kyun"), <b>Traces</b> (request across services — "kahan").' },
      { front: 'CloudWatch?', back: 'Metrics (CPU/latency/errors), Logs (app output, Insights query), Alarms (threshold → SNS), Dashboards. AWS observability hub.' },
      { front: 'X-Ray?', back: 'Distributed tracing. Request ka poora safar across microservices. "API GW→Lambda→DB" per-step time. Microservices debug must.' },
      { front: 'CloudTrail?', back: 'API audit log. <b>Kaunne kya AWS API call kiya, kab</b>. Security investigation (unauthorized delete), compliance (PCI/HIPAA).' },
      { front: 'VPC Flow Logs?', back: 'Network traffic log. IP/port connections. "Connection refused?" root cause. Security + network debug.' },
    ],
  },

  /* ================= LEVEL 8: Migration ================= */
  {
    id: 'migration',
    icon: '🚚',
    title: 'Migration & Modernization — 7Rs',
    badge: 'Migration Maha',
    objectives: [
      '<b>7Rs</b> migration strategy',
      '<b>DMS</b> (Database Migration Service)',
      '<b>Migration Hub</b> tracking',
      'Per-app migration decision',
    ],
    lesson: [
      `<h3>🚚 Migration — on-prem se cloud tak</h3>
       <p>Company ne 10 saal on-prem mein app chalaya. Ab cloud pe jaana hai.
       <b>7Rs</b> = strategy per app. Sab apps ek strategy nahi.</p>
       <table>
         <tr><th>R</th><th>Matlab</th><th>Use case</th></tr>
         <tr><td>1️⃣ <b>Rehost</b> ("lift & shift")</td><td>As-is move</td><td>Fastest, least refactor. Deadline pressure</td></tr>
         <tr><td>2️⃣ <b>Replatform</b> ("lift & reshape")</td><td>Minor tweaks</td><td>RDS vs self-managed DB. Cloud benefits</td></tr>
         <tr><td>3️⃣ <b>Refactor/Re-architect</b></td><td>Reimagine</td><td>Monolith → microservices. Long-term best</td></tr>
         <tr><td>4️⃣ <b>Repurchase</b></td><td>Move to SaaS</td><td>CRM → Salesforce. Off-the-shelf</td></tr>
         <tr><td>5️⃣ <b>Retain</b></td><td>Keep on-prem</td><td>Compliance, not worth migrating</td></tr>
         <tr><td>6️⃣ <b>Retire</b></td><td>Turn off</td><td>App no longer needed</td></tr>
         <tr><td>7️⃣ <b>Relocate</b></td><td>Move within AWS</td><td>VMware Cloud → EC2</td></tr>
       </table>`,
      `<h3>🗄️ DMS — Database Migration Service</h3>
       <p><b>DMS</b> = AWS ka DB migration tool. On-prem DB → AWS RDS/Aurora.
       <b>Homogeneous</b> (MySQL→MySQL) ya <b>heterogeneous</b> (Oracle→Aurora).</p>
       <ul>
         <li>📤 <b>Source</b> — on-prem DB (Oracle, MySQL, SQL Server...)</li>
         <li>📥 <b>Target</b> — RDS, Aurora, DynamoDB, Redshift</li>
         <li>🔄 <b>CDC</b> (Change Data Capture) — ongoing replication, near-zero downtime</li>
         <li>⚡ <b>SCT</b> (Schema Conversion Tool) — schema convert for heterogeneous</li>
       </ul>
       <p>💡 <b>Strategy:</b> DMS + CDC = migrate bina downtime. Source chalta,
       target sync, cutover jab ready.</p>`,
      `<h3>📊 Migration Hub + 6R decision</h3>
       <p><b>Migration Hub</b> = central tracking. Saare apps ka migration
       status ek dashboard. DMS, Server Migration Service integrate.</p>
       <p>📋 <b>Per-app 6R decision:</b></p>
       <ul>
         <li>⚡ Deadline tight? → <b>Rehost</b> (fast, optimize later)</li>
         <li>🔧 Cloud benefits chahiye (managed DB)? → <b>Replatform</b></li>
         <li>🏗️ Long-term, scale issues? → <b>Refactor</b> (microservices)</li>
         <li>🛒 Off-the-shelf better? → <b>Repurchase</b> (SaaS)</li>
         <li>🔒 Compliance/recent investment? → <b>Retain</b></li>
         <li>💀 Unused? → <b>Retire</b> (save cost!)</li>
       </ul>
       <div class="war-story"><b>⚡ Real migration:</b> Ek bank ne 200 apps
       migrate ki. <b>Per-app 6R:</b> 50 rehost (deadline), 80 replatform
       (managed DB), 30 refactor (critical microservices), 20 repurchase
       (SaaS), 15 retain (compliance), 5 retire (unused — $200k/yr saved!).
       Not all same strategy. <b>Portfolio approach</b>.</div>`,
    ],
    stages: [
      {
        type: 'bins',
        title: '7R strategy choose karo',
        instructions: 'Har app ko sahi 7R strategy mein daalo.',
        bins: [
          { id: 'rehost', label: '1️⃣ Rehost (lift&shift)' },
          { id: 'replatform', label: '2️⃣ Replatform' },
          { id: 'refactor', label: '3️⃣ Refactor' },
          { id: 'retire', label: '6️⃣ Retire' },
        ],
        items: [
          { text: 'App, 2 months deadline, no time refactor', bin: 'rehost', explain: 'Rehost — as-is move. Fast. Optimize later.' },
          { text: 'DB, on-prem MySQL, want managed (RDS)', bin: 'replatform', explain: 'Replatform — minor tweak (self-managed → RDS). Cloud benefit.' },
          { text: 'Monolith, scaling issues, long-term', bin: 'refactor', explain: 'Refactor — microservices. Long-term best. Effort.' },
          { text: 'App, no users, 5 years unused', bin: 'retire', explain: 'Retire — turn off. Save cost! $200k/yr example.' },
          { text: 'Legacy, tight deadline, optimize post-migration', bin: 'rehost', explain: 'Rehost — move fast, optimize in cloud later.' },
          { text: 'Self-managed PostgreSQL → Aurora for performance', bin: 'replatform', explain: 'Replatform — Aurora (5x faster). Minor change.' },
        ],
      },
      {
        type: 'hotspot',
        title: 'Migration — diagram detective',
        instructions: 'Migration tools ke components par click karo.',
        visual: 'migration',
        questions: [
          { q: 'DB migration service (homogeneous/heterogeneous)?', target: 'dms', explain: 'DMS. On-prem DB → RDS/Aurora. CDC for near-zero downtime.' },
          { q: 'Central tracking for all migrations?', target: 'mgh', explain: 'Migration Hub. Dashboard for all apps. DMS/SMS integrate.' },
        ],
      },
      {
        type: 'quiz',
        title: 'Migration Quick-fire',
        questions: [
          {
            q: 'Deadline tight, no time refactor. Strategy?',
            choices: [
              'Rehost (lift & shift) — as-is move fast. Optimize later in cloud',
              'Refactor — full rewrite',
              'Retire — band kar do',
              'Retain — on-prem hi',
            ],
            answer: 0,
            explain: 'Rehost = fastest. Move as-is, cloud benefits later. Common first step. Then replatform/refactor in cloud.',
          },
          {
            q: 'On-prem Oracle → Aurora (PostgreSQL). Tool?',
            choices: [
              'DMS (heterogeneous) + SCT (schema convert Oracle→Aurora). CDC for near-zero downtime',
              'Manual SQL export/import',
              'Lambda',
              'CloudFormation',
            ],
            answer: 0,
            explain: 'DMS = heterogeneous migration. SCT = schema convert (Oracle→Aurora PG). CDC = ongoing replication, cutover when ready.',
          },
          {
            q: 'Portfolio of 200 apps. Sab ko ek strategy?',
            choices: [
              'No — per-app 6R decision. Some rehost, some replatform, some refactor, some retire. Portfolio approach',
              'Haan — sab rehost',
              'Haan — sab refactor',
              'Haan — sab retain',
            ],
            answer: 0,
            explain: 'Per-app. Critical → refactor. Deadline → rehost. Managed benefit → replatform. Unused → retire (save!). Portfolio.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — Migration',
      instructions: 'Migration strategy round. 🎤',
      questions: [
        {
          q: '"7Rs batao" — interviewer.',
          choices: [
            'Rehost (lift&shift), Replatform (tweak), Refactor (re-architect), Repurchase (SaaS), Retain (keep), Retire (turn off), Relocate (within AWS)',
            'Sirf 3 strategies',
            '10 strategies',
            'Rehost aur Refactor only',
          ],
          answer: 0,
          explain: '7Rs. Rehost/Replatform/Refactor main 3. Repurchase/Retain/Retire/Relocate additional. Per-app decision.',
        },
        {
          q: 'Scenario: 500 apps, 1 year deadline. Strategy approach?',
          choices: [
            'Portfolio — per-app 6R. Critical → refactor. Majority → rehost (fast). Some → replatform. Unused → retire (save). Phased migration',
            'Sab ek saath rehost',
            'Sab refactor (2 years lag jaayega)',
            'Sab retain',
          ],
          answer: 0,
            explain: 'Portfolio approach. Can\'t refactor 500 in 1yr. Critical few refactor, majority rehost, unused retire. Phased waves.',
        },
        {
          q: 'Interviewer: "DMS + CDC ka benefit?"',
          choices: [
            'Near-zero downtime migration. Source chalta, target sync (CDC ongoing replication), cutover when ready. No app outage',
            'Faster migration only',
            'Free hai',
            'Schema convert',
            ],
          answer: 0,
          explain: 'CDC = Change Data Capture. Source → target ongoing replication. App runs on source, target stays in sync. Cutover = minutes. No downtime.',
        },
      ],
    },
    success: [
      'Main 7Rs migration strategies aur unke use cases bata sakta hoon',
      'Main DMS (Database Migration Service) + CDC samjhta hoon',
      'Main Migration Hub aur per-app 6R decision explain kar sakta hoon',
      'Main portfolio migration approach design kar sakta hoon',
    ],
    homework: `<p>Apne apps ka 6R assessment likho:</p>
      <pre># Spreadsheet:
# App | Criticality | 6R Strategy | Reason | Timeline
# ----|-------------|-------------|--------|----------
# CRM | High        | Replatform  | RDS managed | Q1
# Reports | Med     | Rehost      | Deadline    | Q1
# Legacy HR | Low   | Retire      | Unused      | Q2
# Payment | Critical | Refactor   | Microservices | Q3</pre>
      <p>✅ Self-check: Har app ka strategy decide? Timeline?</p>`,
    cards: [
      { front: '7Rs strategies?', back: 'Rehost (lift&shift), Replatform (tweak), Refactor (re-architect), Repurchase (SaaS), Retain (keep on-prem), Retire (turn off), Relocate (within AWS).' },
      { front: 'Rehost vs Replatform vs Refactor?', back: 'Rehost = as-is move (fast). Replatform = minor tweak (managed DB). Refactor = full re-architect (microservices, long-term).' },
      { front: 'DMS + CDC?', back: 'Database Migration Service. <b>CDC</b> = Change Data Capture, ongoing replication. Source chalta, target sync, cutover when ready. <b>Near-zero downtime</b>.' },
      { front: 'Migration Hub?', back: 'Central tracking for all migrations. Dashboard. DMS/SMS integrate. Portfolio view of app statuses.' },
      { front: 'Portfolio approach?', back: 'Per-app 6R. Critical → refactor. Majority → rehost (deadline). Some → replatform. Unused → retire (save $!). Not all same strategy.' },
    ],
  },

  /* ================= LEVEL 9: FINAL BOSS ================= */
  {
    id: 'finalboss',
    icon: '👑',
    title: 'Final Boss: Senior Solutions Architect Gauntlet',
    badge: 'Solutions Architect Mahaguru',
    objectives: [
      'Saare advanced concepts ek saath jodna',
      'Complete architecture design + defend karna',
      'Incident handle karna (boss-level)',
      'Interview marathon — SAA ready!',
    ],
    lesson: [
      `<h3>👑 Final Boss — sab kuch jodo</h3>
       <p>3 tracks, 26 levels — ab tum <b>Senior Solutions Architect</b> ke
       ready ho. Yeh level sab concepts ek saath jodta.</p>
       <p>Senior architect ka din:</p>
       <ul>
         <li>🏗️ <b>Design</b> — scalable, secure, resilient, cost-optimized</li>
         <li>🛡️ <b>Harden</b> — security layers, compliance</li>
         <li>💰 <b>Optimize</b> — cost, performance</li>
         <li>🚑 <b>Recover</b> — DR, RTO/RPO, multi-region</li>
         <li>👁️ <b>Observe</b> — metrics, logs, traces, audit</li>
         <li>🚚 <b>Migrate</b> — 7Rs, modernize</li>
       </ul>`,
      `<h3>🏆 Senior architect mindset</h3>
       <ul>
         <li>⚖️ <b>Trade-offs</b> — har choice ka cost vs benefit (Multi-AZ $
             vs downtime $)</li>
         <li>🧩 <b>Well-Architected</b> — 6 pillars har design pe</li>
         <li>🔮 <b>Future-proof</b> — multi-region, multi-AZ, scalable</li>
         <li>📝 <b>Document</b> — ADRs (Architecture Decision Records), diagrams</li>
         <li>🧪 <b>Test</b> — chaos engineering, DR drills, load tests</li>
         <li>📈 <b>Iterate</b> — quarterly Well-Architected review, improve</li>
       </ul>
       <div class="war-story"><b>⚡ Real senior:</b> Ek senior architect ne
       fintech ka design review kiya. Poocha: "RTO?", "1 ghanta", "Tested?",
       silence. "DR drill kar lo." Drill mein pata chala DNS failover broken.
       Fix. <b>Production outage mein DR kaam kiya</b>. Seekh: <b>senior =
       ask hard questions, test assumptions</b>. "It works" → "prove it".</div>`,
      `<h3>🎤 SAA exam ready?</h3>
       <p>Agar tumne 26 levels + Revision Dojo + interviews kiye — tum SAA-C03
       ready ho. Exam mein:</p>
       <ul>
         <li>🏗️ <b>Architecture</b> — design scenarios (most questions)</li>
         <li>⚙️ <b>Services</b> — kaunsa kab (VPC, EC2, RDS, Lambda...)</li>
         <li>🔒 <b>Security</b> — IAM, KMS, WAF, compliance</li>
         <li>💰 <b>Cost</b> — Reserved/Spot/rightsize</li>
         <li>♻️ <b>Reliability</b> — Multi-AZ, DR, HA</li>
       </ul>
       <p>💡 <b>Revision Dojo</b> mein sab flashcards hain — roz revise. <b>Yeh
       certificate = SAA-ready badge.</b> 👑</p>`,
    ],
    stages: [
      {
        type: 'bins',
        title: 'Senior architecture decisions',
        instructions: 'Har decision ko best practice ya anti-pattern mein daalo.',
        bins: [
          { id: 'best', label: '✅ Best practice' },
          { id: 'anti', label: '❌ Anti-pattern' },
        ],
        items: [
          { text: 'Well-Architected review quarterly', bin: 'best', explain: '6 pillars, drift detect, improve. Senior habit.' },
          { text: 'DR plan but never tested', bin: 'anti', explain: 'Untested DR = no DR. Game days quarterly. Senior asks "tested?"' },
          { text: 'Multi-AZ + multi-region for critical', bin: 'best', explain: 'HA + DR. Ek region down bhi app chale.' },
          { text: 'Hard-coded secrets in code', bin: 'anti', explain: 'Secrets Manager + rotation. #1 breach vector.' },
          { text: 'Cost optimization: Reserved + Spot + rightsize', bin: 'best', explain: 'Layered pricing. 40-60% saving. Senior owns cost.' },
          { text: 'Single region, "it\'s fine"', bin: 'anti', explain: 'Region down = app down. Critical = multi-region DR.' },
          { text: 'IaC (Terraform) for all infra', bin: 'best', explain: 'Repeatable, auditable, Git-tracked. Console clicks banned.' },
          { text: 'No observability, "we\'ll debug when issue"', bin: 'anti', explain: 'Metrics + logs + traces + alarms before issue. Proactive.' },
        ],
      },
      {
        type: 'incident',
        title: '🚨 Final Boss Incident: Multi-Region Failover',
        instructions: 'Sabse bada test. us-east-1 down. Multi-region app. Save karo.',
        pager: `🚨 CRITICAL: us-east-1 REGION DOWN
AWS status page: ongoing issue
Tumhari app: multi-region (us-east-1 + eu-west-1)
Route 53 failover routing configured
Time: 2:00 PM IST — peak traffic`,
        start: 'n1',
        nodes: {
          n1: {
            sitrep: 'AWS status: us-east-1 degraded. Users reporting errors.\nRoute 53: primary (us-east-1) health check FAIL',
            text: 'Region down. Route 53 health check fail. Pehla kadam?',
            choices: [
              { t: 'Verify health check failing + Route 53 failover triggered → traffic to eu-west-1 secondary', good: true, next: 'n2', explain: 'Sahi. Failover routing + health check = automatic. Verify it\'s working.' },
              { t: 'Manual DNS change — slow', good: false, explain: 'Galat — failover routing automatic hona chahiye. Manual = minutes delay.' },
              { t: 'Users ko "maintenance" page dikhao', good: false, explain: 'Galat — multi-region is for this. Failover should work.' },
            ],
          },
          n2: {
            sitrep: 'Route 53 failover: traffic → eu-west-1. But eu-west-1 overloaded (2x traffic).',
            text: 'Secondary overloaded. Scale up kaise?',
            choices: [
              { t: 'eu-west-1 ASG scale out (max badhao) + CloudFront (cache more) + check DynamoDB Global Tables capacity', good: true, next: 'n3', explain: 'Sahi. Multi-layer: ASG scale, CDN cache, DB capacity. Handle 2x load.' },
              { t: 'Users ko rate limit lagao', good: false, explain: 'Symptom. Capacity badhao, users block mat.' },
              { t: 'eu-west-1 bhi band kar do', good: false, explain: 'Disaster! Dono down = total outage.' },
            ],
          },
          n3: {
            sitrep: 'eu-west-1 scaled. App stable. us-east-1 still down (AWS fixing).',
            text: 'App running on secondary. Communications + long-term?',
            choices: [
              { t: 'Status page update users + prepare us-east-1 recovery (data sync, cutover back when AWS fixes) + post-mortem planned', good: true, next: 'n4', explain: 'Sahi. Communicate, plan recovery, post-mortem. Senior thinks beyond "just fix".' },
              { t: 'Celebrate — ho gaya', good: false, explain: 'Galat — us-east-1 recovery bhi plan karo. Post-mortem for improvement.' },
              { t: 'us-east-1 abandon kar do', good: false, explain: 'Cost, data residency. Recover jab AWS fixes.' },
            ],
          },
          n4: {
            sitrep: 'us-east-1 back (AWS fixed). Data sync done. Cutover back planned.',
            text: 'Cutover back to primary. Safely kaise?',
            choices: [
              { t: 'Gradual: Route 53 weighted (10% → 50% → 100% to us-east-1). Monitor. Rollback if issue. Post-mortem document', good: true, next: 'end', explain: 'Sahi. Gradual cutover, monitor, rollback ready, post-mortem. Senior = careful.' },
              { t: 'Sab traffic ek saath us-east-1 pe', good: false, explain: 'Risky — if us-east-1 unstable again, all users affected.' },
              { t: 'eu-west-1 hi chalte raho', good: false, explain: 'Cost + latency for primary region users. Cutover back.' },
            ],
          },
          end: { end: true, text: '👑 Final Boss defeated!', summary: '<b>Multi-region DR worked!</b> Route 53 failover + health check = automatic traffic shift. eu-west-1 scaled (ASG + CloudFront + DynamoDB Global).<br><b>Recovery:</b> gradual cutover back (weighted), monitor, post-mortem.<br><b>Senior lessons:</b> (1) Multi-region DR = survival, (2) test failover regularly, (3) secondary must handle full load, (4) communicate + post-mortem. <b>SAA-ready! 👑</b>' },
        },
      },
      {
        type: 'terminal',
        title: '🖥️ Final Boss: Complete Audit',
        instructions: 'Poora production infra audit — sab services verify.',
        goal: 'Final audit: ALB, ASG, RDS (Multi-AZ), S3, CloudFront, Lambda, DynamoDB, KMS, CloudWatch — sab check karo.',
        tasks: [
          { text: 'aws elbv2 describe-load-balancers', check: s => s.history.some(h => /aws elbv2 describe-load-balancers/.test(h)) },
          { text: 'aws rds describe-db-instances (Multi-AZ?)', check: s => s.history.some(h => /aws rds describe-db-instances/.test(h)) },
          { text: 'aws dynamodb list-tables', check: s => s.history.some(h => /aws dynamodb list-tables/.test(h)) },
          { text: 'aws kms list-keys', check: s => s.history.some(h => /aws kms list-keys/.test(h)) },
          { text: 'aws cloudwatch describe-alarms', check: s => s.history.some(h => /aws cloudwatch describe-alarms/.test(h)) },
        ],
        account: {
          region: 'us-east-1',
          callerIdentity: { Account: '123456789012', UserId: 'AIDASAMPLE', Arn: 'arn:aws:iam::123456789012:user/admin' },
          elbs: [{ id: 'alb-1', name: 'prod-alb', type: 'application', scheme: 'internet-facing', dns: 'prod.elb.amazonaws.com' }],
          asgs: [{ name: 'prod-asg', min: 5, max: 30, desired: 8, instances: ['i-1','i-2','i-3','i-4','i-5','i-6','i-7','i-8'], vpcZone: 'subnet-a,subnet-b,subnet-c' }],
          rds: [{ id: 'prod-db', name: 'prod-db', engine: 'aurora-postgresql', class: 'db.r6.2xlarge', state: 'available', multiAZ: true, endpoint: 'prod-db.rds.amazonaws.com', storage: 1000 }],
          buckets: [{ name: 'prod-assets', region: 'us-east-1', encryption: true, public: false, objects: [] }],
          cloudfront: [{ id: 'E1', domain: 'dprod.cloudfront.net', status: 'Deployed', enabled: true }],
          lambdas: [{ name: 'order-handler', runtime: 'nodejs20.x', handler: 'index.handler', state: 'Active', memory: 1024, timeout: 30 }],
          tables: [{ name: 'UserSessions', partitionKey: 'session_id', sortKey: null, rcu: 100, wcu: 100, items: [] }],
          kmsKeys: [{ id: 'arn:aws:kms:us-east-1:123:key/abc', alias: 'prod-key', state: 'Enabled' }],
          alarms: [{ name: 'HighCPU', metric: 'CPUUtilization', namespace: 'AWS/EC2', state: 'OK', threshold: 80 }],
          vpcs: [], subnets: [], securityGroups: [], instances: [],
        },
        success: s => [
          /aws elbv2 describe-load-balancers/.test(s.history.join(' ')),
          /aws rds describe-db-instances/.test(s.history.join(' ')),
          /aws dynamodb list-tables/.test(s.history.join(' ')),
          /aws kms list-keys/.test(s.history.join(' ')),
          /aws cloudwatch describe-alarms/.test(s.history.join(' ')),
        ].every(Boolean),
        successText: '👑 <b>Complete production architecture verified!</b> ALB + ASG (8 instances, scale 5-30, multi-AZ) + Aurora Multi-AZ + S3 (encrypted) + CloudFront + Lambda + DynamoDB (sessions) + KMS + CloudWatch alarm. Yehi <b>real senior architect ka domain</b>. Tumne 3 tracks, 26 levels, 100+ challenges complete kiye — <b>Solutions Architect Mahaguru!</b> 👑',
        hints: [
          'aws elbv2 describe-load-balancers — ALB',
          'aws rds describe-db-instances — Aurora Multi-AZ',
          'aws dynamodb list-tables, aws kms list-keys, aws cloudwatch describe-alarms',
        ],
      },
    ],
    interview: {
      title: '🎤 Final Interview Marathon',
      instructions: 'Senior architect interview. SAA-ready prove karo! 🎤',
      questions: [
        {
          q: '"Ek global SaaS design karo — 10M users, 99.99% uptime, multi-region." Architecture?',
          choices: [
            'Route 53 latency routing → CloudFront (global edge) → Multi-region (us-east-1 + eu-west-1 + ap-south-1). Each region: ALB + ASG Multi-AZ + Aurora Global DB + DynamoDB Global Tables. SNS/SQS decouple. KMS + GuardDuty + WAF. DR: Multi-Site',
            'Ek region, bada EC2',
            'Sirf Lambda serverless',
            'S3 static only',
          ],
          answer: 0,
          explain: 'Senior answer: multi-region active-active, global DB sync, CDN edge, decouple, security layers, DR. 99.99% = ~52min downtime/year = multi-region must.',
        },
        {
          q: 'Scenario: $100k/mo AWS bill. Cost optimize karo (60% target).',
          choices: [
            'Cost Explorer analyze → rightsizing (CloudWatch) → Reserved (steady 72%) + Spot (batch 90%) → S3 lifecycle → delete unused EBS → tags + budgets. Portfolio. 60% achievable',
            'Sab EC2 band',
            'AWS se discount maango',
            'Region change',
          ],
          answer: 0,
          explain: 'Systematic: analyze, rightsize, commit (Reserved), spot (batch), lifecycle, clean, monitor. Real companies 40-60% save. Senior owns cost.',
        },
        {
          q: 'Interviewer: "Tumhari app pe outage. Walk me through your debugging."',
          choices: [
            'CloudWatch alarms (what broke) → metrics dashboard (CPU/latency/errors) → X-Ray trace (where slow) → CloudWatch Logs (why) → CloudTrail (who changed what) → fix → post-mortem',
            'Sab EC2 restart',
            'Users ko wait karao',
            'AWS support ko call',
          ],
          answer: 0,
            explain: 'Systematic: alarms (alert) → metrics (what) → traces (where) → logs (why) → trail (cause) → fix → post-mortem. Observability = debugging superpower.',
        },
      ],
    },
    success: [
      'Main complete production architecture (multi-region, HA, secure, cost-optimized) design kar sakta hoon',
      'Main Well-Architected 6 pillars har design pe apply kar sakta hoon',
      'Main multi-region DR failover handle kar sakta hoon (tested!)',
      'Main SAA-C03 exam ready hoon — Solutions Architect Mahaguru! 👑',
    ],
    homework: `<p>Apne complete architecture ka ADR (Architecture Decision Record) likho:</p>
      <pre># ADR-001: Multi-Region Active-Active
# Date: 2024-XX-XX
# Status: Accepted
# Context: 10M users, 99.99% uptime needed
# Decision: Route 53 latency + multi-region (us-east-1, eu-west-1, ap-south-1)
#           Aurora Global DB, DynamoDB Global Tables, CloudFront
# Consequences: +$5k/mo cost, complexity. But 99.99% achievable.
# DR: Multi-Site, tested quarterly (game days)</pre>
      <p>✅ Self-check: ADR likha? Architecture diagram banaya? <b>SAA exam book karo! 🎓</b></p>`,
    cards: [
      { front: 'Senior architect mindset?', back: 'Trade-offs (cost vs benefit), Well-Architected 6 pillars, future-proof (multi-region), document (ADRs), test (chaos/DR), iterate (quarterly review).' },
      { front: 'Global 10M users, 99.99%?', back: 'Multi-region active-active. Route 53 latency → CloudFront edge → each region (ALB+ASG+Aurora Global+DynamoDB Global). 99.99% = ~52min downtime/yr = multi-region must.' },
      { front: 'Cost optimize $100k → $40k?', back: 'Explorer analyze → rightsize → Reserved (steady) + Spot (batch) → S3 lifecycle → delete unused → tags + budgets. 60% achievable. Senior owns cost.' },
      { front: 'Outage debugging flow?', back: 'Alarms (alert) → Metrics (what) → X-Ray traces (where) → Logs (why) → CloudTrail (cause) → fix → post-mortem. Observability = superpower.' },
      { front: 'Multi-region DR?', back: 'Route 53 failover + health check = automatic. Secondary scales (ASG/CloudFront/DB). Gradual cutover back. <b>Test quarterly (game days)</b>. Untested DR = no DR.' },
    ],
  },

]);
