/* =====================================================================
   AWS Gurukul — 🧭 Decision Dojo trees: SECURITY + GOVERNANCE
   identity (kaun login kare, kaise?) · secrets (password kahan rakhun?) ·
   encryption (kaunsi key?) · multiaccount (kitne accounts, kaise control?)
   Prices: us-east-1 list price (2025–26), approx.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho.
   ===================================================================== */
AG.registerDecisions([

  /* ------------------------------------------------------------------ */
  {
    id: 'identity',
    icon: '🪪',
    title: 'Access kaise doon? — IAM role, IAM user, IAM Identity Center, Cognito, cross-account role',
    short: 'Identity chuno',
    tldr: 'Code/AWS service ko → IAM role (temporary credentials, koi key nahi). Company ke employees ko → IAM Identity Center (SSO). App ke customers ko → Cognito. Doosre account ko → cross-account role. IAM user + access key = aakhri option.',
    levels: ['iam', 'orgs', 'security'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Access kisko chahiye?',
        why: 'Long-term access keys leak hoti hain (GitHub, laptop). Roles temporary credentials dete hain (STS, 1 ghanta default) jo khud expire hote hain.',
        options: [
          { t: 'AWS ke andar chalne wala code (EC2, Lambda, ECS task)', next: 'role' },
          { t: 'Company ke employees / developers (console + CLI)', next: 'sso' },
          { t: 'App ke end-users (mobile/web login, social login)', next: 'cognito' },
          { t: 'Doosre AWS account ka code/user', next: 'xacct' },
          { t: 'AWS ke bahar ka system (on-prem server, GitHub Actions)', next: 'q2' },
        ],
      },
      q2: {
        q: 'External system kaunsa hai?',
        options: [
          { t: 'CI/CD jo OIDC support karta hai (GitHub Actions, GitLab)', next: 'oidc' },
          { t: 'On-prem servers', next: 'rolesany' },
          { t: 'Purana third-party tool jo sirf access key leta hai', next: 'iamuser' },
        ],
      },
      role: { leaf: true, icon: '🎭', pick: 'IAM Role (instance profile / Lambda execution role / ECS task role)', one: 'Code ko temporary credentials automatically — koi key file nahi.', when: ['EC2 → S3, Lambda → DynamoDB, ECS task → SQS'], avoid: ['Code mein access keys hardcode karna'], gotchas: ['ECS: task role (app ke permissions) ≠ task execution role (image pull, logs)', 'Least privilege: specific actions + specific resource ARNs'], cost: 'Free.', exam: '"EC2 needs access to S3" → IAM role (instance profile), keys NAHI.', level: 'iam' },
      sso: { leaf: true, icon: '🏢', pick: 'IAM Identity Center (SSO)', one: 'Ek login se saare accounts — Okta/Entra ID/AD se users, permission sets.', when: ['Multi-account org mein employees', 'Joiner/leaver ek jagah se manage'], avoid: ['Har employee ka alag IAM user har account mein'], gotchas: ['CLI: aws configure sso — short-lived credentials'], cost: 'Free.', exam: '"workforce single sign-on across multiple accounts" → IAM Identity Center.', level: 'orgs' },
      cognito: { leaf: true, icon: '📱', pick: 'Amazon Cognito', one: 'Customer identity — user pools (sign-up/sign-in, social, MFA) + identity pools (AWS credentials).', when: ['Mobile/web app login, Google/Apple sign-in', 'App users ko seedha S3 par apni folder upload (identity pool)'], avoid: ['Employees ka AWS console access (Identity Center)'], gotchas: ['User pool JWT ko API Gateway / ALB authorizer seedha verify kar sakte hain'], cost: 'MAU-based tiers.', exam: '"user sign-up/sign-in for mobile app", "social identity providers" → Cognito.', level: 'security' },
      xacct: { leaf: true, icon: '🔀', pick: 'Cross-account IAM Role (sts:AssumeRole)', one: 'Account B mein role, trust policy mein Account A — A ka code AssumeRole karke temporary access leta hai.', when: ['Central CI account se prod mein deploy', 'Audit account se saare accounts read'], avoid: ['Account A ko B ki access keys dena'], gotchas: ['Third-party vendor ke liye ExternalId condition (confused deputy se bachav)'], cost: 'Free.', exam: '"access resources in another account securely" → cross-account role + AssumeRole.', level: 'iam' },
      oidc: { leaf: true, icon: '🔑', pick: 'IAM OIDC provider + role (web identity federation)', one: 'GitHub Actions ka OIDC token → AssumeRoleWithWebIdentity → short-lived credentials.', when: ['CI/CD pipelines bina stored secrets'], avoid: ['Repo secrets mein AWS keys rakhna'], gotchas: ['Trust policy mein repo + branch condition (token.actions.githubusercontent.com:sub) — warna koi bhi repo role le lega'], cost: 'Free.', exam: '"CI/CD without long-term credentials" → OIDC federation.', level: 'iam' },
      rolesany: { leaf: true, icon: '🖧', pick: 'IAM Roles Anywhere', one: 'On-prem servers X.509 certificates se temporary AWS credentials lete hain.', when: ['On-prem/hybrid workloads jo AWS APIs call karte hain'], avoid: ['Servers par long-term keys'], gotchas: ['Apni PKI (ya AWS Private CA) chahiye'], cost: 'Free (Private CA ka alag bill).', exam: '"on-premises workloads temporary credentials" → IAM Roles Anywhere.', level: 'iam' },
      iamuser: { leaf: true, icon: '👤', pick: 'IAM User + access key (aakhri option)', one: 'Long-term key — sirf jab koi aur option kaam na kare.', when: ['Legacy tool jo sirf access key/secret leta hai'], avoid: ['Insaan ke liye (Identity Center)', 'AWS ke andar ka code (role)'], gotchas: ['Least privilege, key rotation (90 din), unused keys disable, MFA'], cost: 'Free.', exam: 'Exam mein "store access keys on EC2" hamesha GALAT jawab hai.', level: 'iam' },
    },
    scenarios: [
      { s: 'Lambda function ko DynamoDB table mein likhna hai.', answer: 'role', explain: 'Lambda execution role with dynamodb:PutItem on that table ARN.' },
      { s: '200 developers, 30 AWS accounts, login company ke Okta se.', answer: 'sso', explain: 'Workforce SSO across accounts → IAM Identity Center.' },
      { s: 'Food delivery app ke customers Google se login karein.', answer: 'cognito', explain: 'Customer identity + social login → Cognito user pool.' },
      { s: 'GitHub Actions se terraform apply chalana hai, repo mein koi AWS key nahi rakhni.', answer: 'oidc', explain: 'OIDC federation → short-lived role credentials.' },
      { s: 'Security account ka scanner saare 50 accounts ka config padhe.', answer: 'xacct', explain: 'Har account mein read-only role, trust security account.' },
      { s: 'On-prem batch servers S3 par upload karte hain; abhi keys config file mein hain.', answer: 'rolesany', explain: 'Certificates → temporary credentials via IAM Roles Anywhere.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'secrets',
    icon: '🤫',
    title: 'Password / API key kahan rakhun? — Secrets Manager, Parameter Store, env vars',
    short: 'Secrets storage',
    tldr: 'Auto-rotation chahiye (DB passwords) → Secrets Manager. Config + kabhi-kabhi secret, rotation nahi, free chahiye → SSM Parameter Store (SecureString). Code ya plain env var mein secret = galat.',
    levels: ['security', 'iam', 'boss1'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Secret automatically rotate hona chahiye?',
        why: 'Supported managed integrations or reviewed Lambda rotation coordinate backend and secret versions. Configure permissions/connectivity and validate success; Parameter Store has no built-in credential rotation.',
        options: [
          { t: 'Haan — reviewed backend rotation schedule plus app credential refresh/recovery', next: 'sm' },
          { t: 'Nahi — config values, feature flags, kabhi-kabhi API key', next: 'ps' },
          { t: 'Doosre region mein bhi same secret chahiye (DR)', next: 'sm' },
        ],
      },
      sm: { leaf: true, icon: '🔐', pick: 'AWS Secrets Manager', one: 'Encrypted secrets + automatic rotation + cross-region replication + fine IAM.', when: ['RDS/Aurora credentials (managed rotation)', 'Third-party API keys jinhe rotate karna hai', 'Multi-region apps'], avoid: ['Hazaaron non-secret config values (Parameter Store free)'], gotchas: ['Cache secrets with bounded refresh/recovery; stale credentials after rotation can break authentication', 'Rotation ke baad purane connections — app ko re-fetch karna aana chahiye'], cost: '$0.40 per secret/mahina + $0.05 per 10,000 API calls.', exam: '"automatically rotate database credentials" → Secrets Manager.', iac: `resource "aws_db_instance" "main" {
  # ...
  manage_master_user_password = true   # Secrets Manager mein password + rotation
}`, level: 'security' },
      ps: { leaf: true, icon: '🗒️', pick: 'SSM Parameter Store (SecureString)', one: 'Hierarchical config (/prod/app/db_url) — SecureString KMS se encrypted, standard tier free.', when: ['App config, feature flags, AMI ids, non-rotating secrets'], avoid: ['Auto-rotation chahiye'], gotchas: ['Standard: 4 KB, 10,000 params free; Advanced: 8 KB + policies (paid)', 'Throughput limit — high-traffic app caching kare'], cost: 'Standard free; Advanced $0.05 per param/mahina.', exam: '"store configuration data and secrets", "no rotation", "lowest cost" → Parameter Store.', level: 'security' },
    },
    scenarios: [
      { s: 'Aurora master password har 30 din rotate hona chahiye, compliance ke liye.', answer: 'sm', explain: 'Managed rotation → Secrets Manager.' },
      { s: '300 config values (feature flags, URLs) har environment ke liye, budget zero.', answer: 'ps', explain: 'Config + free tier → Parameter Store.' },
      { s: 'Payment gateway API key primary aur DR dono regions mein chahiye.', answer: 'sm', explain: 'Cross-region replication → Secrets Manager.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'encryption',
    icon: '🔑',
    title: 'Data encrypt kaise karun? — SSE-S3, SSE-KMS (AWS managed / customer managed), CloudHSM, client-side',
    short: 'Encryption / KMS',
    tldr: 'Basic at-rest → SSE-S3 (default, free). Key-use audit with request/cache scope + key policy control → SSE-KMS customer managed key. Dedicated single-tenant HSM/control requirement → CloudHSM. Payload upload se pehle encrypt karna ho → client-side encryption; app/key environment ka trust alag review karo.',
    levels: ['security', 's3adv'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Key par kitna control chahiye?',
        options: [
          { t: 'Bas "data encrypted at rest" checkbox — kuch manage nahi karna', next: 'sses3' },
          { t: 'Key policy khud likhni hai, CloudTrail mein appropriate key-use audit scope, rotation control, key lifecycle/revocation control with service cache behavior reviewed', next: 'q2' },
          { t: 'Regulator kehta hai keys dedicated HSM mein, AWS ke paas bhi access nahi', next: 'hsm' },
          { t: 'Data AWS par pahunchne se pehle hi encrypted ho (AWS ko plaintext kabhi na mile)', next: 'cse' },
        ],
      },
      q2: {
        q: 'Doosre accounts ko share karna hai ya multi-region?',
        why: 'AWS managed key (aws/s3) ki key policy tum edit nahi kar sakte — cross-account share nahi hoti. Customer managed key (CMK) ki policy tumhari.',
        options: [
          { t: 'Haan — cross-account share / multi-Region key', next: 'cmk' },
          { t: 'Nahi — bas ek account, audit chahiye, policy control nahi', next: 'awsmanaged' },
        ],
      },
      sses3: { leaf: true, icon: '🔒', pick: 'SSE-S3 (S3 managed keys)', one: 'S3 khud AES-256 se encrypt karta hai — 2023 se har naye object par default ON.', when: ['General data jahan key control ki requirement nahi'], avoid: ['Key usage audit / key policy / cross-account control chahiye'], gotchas: ['Use appropriately enabled S3 data events for object access; encryption metadata is a separate proof'], cost: 'Free.', exam: '"encrypt at rest with minimal effort" → SSE-S3.', level: 's3adv' },
      awsmanaged: { leaf: true, icon: '🗝️', pick: 'SSE-KMS with AWS managed key (aws/s3)', one: 'KMS key AWS banata aur rotate karta hai; CloudTrail mein usage dikhta hai.', when: ['Audit chahiye par key management nahi'], avoid: ['Cross-account access, custom key policy, rotation schedule control'], gotchas: ['Policy edit nahi hoti'], cost: 'Key free; Approx eligible symmetric KMS requests $0.03/10000; Bucket Key savings up to99% depend on requester/cache/workload.', exam: '"audit trail of key usage" + "AWS manages key" → SSE-KMS (AWS managed).', level: 'security' },
      cmk: { leaf: true, icon: '🔑', pick: 'SSE-KMS with customer managed key', one: 'Tumhari KMS key — key policy, grants, rotation, disable/delete, cross-account, multi-Region.', when: ['Compliance: key policy control + audit + separation of duties', 'Encrypted snapshots/AMIs doosre account ko share', 'Multi-Region keys for DR'], avoid: ['Bas checkbox chahiye (SSE-S3 free)'], gotchas: ['Key policy mein lockout mat karo (root/admin access rakho)', 'Delete = 7–30 din waiting period — us beech cancel ho sakta hai; delete ke baad data hamesha ke liye unreadable', 'S3 Bucket Key ON karo — KMS bill kam'], cost: 'Approx $1/key/month; first two material rotations add $1/month each, plus eligible symmetric API $0.03/10000. Other meters/allowances differ.', exam: '"control over encryption keys", "rotate keys", "share encrypted snapshot cross-account" → customer managed KMS key.', iac: `resource "aws_kms_key" "data" {
  description             = "orders data key"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}`, level: 'security' },
      hsm: { leaf: true, icon: '🏦', pick: 'AWS CloudHSM', one: 'Dedicated single-tenant HSM; review selected HSM generation/compliance, client integration and HA operations.', when: ['Regulator: dedicated HSM, AWS ka koi access nahi', 'Oracle TDE, custom PKCS#11 apps'], avoid: ['Normal compliance (KMS khud FIPS-validated HSMs use karta hai)'], gotchas: ['HA ke liye 2+ HSMs alag AZs mein — cluster tumhe manage karna', 'Keys kho gayi = data gaya (AWS recover nahi kar sakta)'], cost: 'Hourly per HSM; verify current Region/model pricing and HA cluster size.', exam: '"dedicated HSM", "single-tenant", "customer-only control of keys" → CloudHSM.', level: 'security' },
      cse: { leaf: true, icon: '🧳', pick: 'Client-side encryption', one: 'App upload se pehle khud encrypt karti hai (e.g. AWS Encryption SDK + KMS).', when: ['AWS par sirf ciphertext chahiye'], avoid: ['Server-side readers such as Athena need compatible plaintext/decryption integration'], gotchas: ['Key management app ki zimmedari'], cost: 'SDK free, KMS calls ka bill.', exam: '"encrypt before sending to AWS" → client-side encryption.', level: 'security' },
    },
    scenarios: [
      { s: 'Startup ko bas "S3 data encrypted at rest" chahiye, koi audit requirement nahi.', answer: 'sses3', explain: 'Default SSE-S3, free.' },
      { s: 'Encrypted RDS snapshot doosre AWS account ko share karna hai.', answer: 'cmk', explain: 'AWS managed key se share nahi hota — customer managed key + key policy mein doosra account.' },
      { s: 'Bank regulator: encryption keys single-tenant HSM mein, AWS employees ka bhi koi access nahi.', answer: 'hsm', explain: 'CloudHSM.' },
      { s: 'Healthcare app: data AWS tak plaintext mein kabhi nahi pahunchna chahiye.', answer: 'cse', explain: 'Client-side encryption.' },
      { s: 'Audit team ko CloudTrail mein dekhna hai kab-kab key use hui; key management ka koi kaam nahi karna.', answer: 'awsmanaged', explain: 'SSE-KMS with AWS managed key — audit milta hai, manage kuch nahi.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'multiaccount',
    icon: '🏛️',
    title: 'Ek account ya kai? — Organizations, SCPs, Control Tower',
    short: 'Multi-account setup',
    tldr: 'Blast radius aur billing alag karne ke liye accounts alag (prod, dev, security, logs). Organizations + SCP guardrails (maximum permissions). Naya setup best-practice ke saath jaldi → Control Tower landing zone.',
    levels: ['orgs'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kitne teams/environments?',
        options: [
          { t: 'Ek chhota project, 1–2 log', next: 'single' },
          { t: 'Kai teams, prod/dev alag, security/audit chahiye', next: 'q2' },
        ],
      },
      q2: {
        q: 'Shuru se setup kar rahe ho ya existing accounts hain aur custom control chahiye?',
        options: [
          { t: 'Naya — best practice landing zone jaldi chahiye (log archive, audit account, guardrails)', next: 'ct' },
          { t: 'Existing / custom — Organizations + SCPs khud design', next: 'orgscp' },
        ],
      },
      single: { leaf: true, icon: '1️⃣', pick: 'Single account (strong IAM + budgets)', one: 'Chhote project ke liye ek account kaafi — root MFA, IAM roles, budget alarm.', when: ['Personal/learning, PoC'], avoid: ['Prod aur dev saath (ek galti dono ko giraye)'], gotchas: ['Aage multi-account mein shift ka plan rakho'], cost: 'Free.', level: 'iam' },
      ct: { leaf: true, icon: '🗼', pick: 'AWS Control Tower', one: 'Organizations ke upar automated landing zone — log archive + audit accounts, controls (guardrails), Account Factory.', when: ['Naye multi-account setup, governance jaldi', 'Har naya account baseline (CloudTrail, Config) ke saath'], avoid: ['Bahut custom existing org jahan Control Tower ka structure fit nahi'], gotchas: ['Control Tower ke banaye resources manually mat badlo — drift aata hai'], cost: 'Free; andar ke services (Config, CloudTrail) ka bill.', exam: '"set up and govern a multi-account environment quickly with best practices" → Control Tower.', level: 'orgs' },
      orgscp: { leaf: true, icon: '🏛️', pick: 'AWS Organizations + SCPs (+ RCPs)', one: 'OUs mein accounts; SCP = account mein maximum allowed actions (guardrail), RCP = resources par guardrail.', when: ['"Prod OU mein koi bhi region ap-south-1 ke bahar resource na banaye"', '"Koi CloudTrail band na kar sake"', 'Consolidated billing + volume discounts'], avoid: ['Galat soch: "SCP permission grant karta hai". SCP sirf upper limit lagata hai — allow hamesha IAM policy se aata hai'], gotchas: ['SCP management account par lagta hi nahi', 'Pehle test OU par lagao — galat SCP prod ko rok sakta hai', 'Region-deny SCP mein global services (IAM, STS, Route 53, CloudFront, Organizations, Support) ko NotAction se chhodo — warna IAM role banana bhi band ho jaata hai'], cost: 'Free.', exam: '"restrict what member accounts can do", "guardrails", "centrally deny" → SCP.', iac: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyOutsideMumbai",
    "Effect": "Deny",
    "NotAction": ["iam:*", "sts:*", "organizations:*", "route53:*",
                  "cloudfront:*", "support:*", "budgets:*", "waf:*"],
    "Resource": "*",
    "Condition": { "StringNotEquals": { "aws:RequestedRegion": "ap-south-1" } }
  }]
}`, level: 'orgs' },
    },
    scenarios: [
      { s: 'Nayi fintech: 6 teams, prod/dev/staging; jaldi se audit-ready setup with central logs.', answer: 'ct', explain: 'Best-practice landing zone jaldi → Control Tower.' },
      { s: 'Existing 30 accounts; policy chahiye ki koi bhi account us-east-1 ke bahar resources na banaye.', answer: 'orgscp', explain: 'Region-deny SCP on OU.' },
      { s: 'Ek student ka learning project.', answer: 'single', explain: 'Single account + root MFA + budget alarm.' },
    ],
  },
]);
