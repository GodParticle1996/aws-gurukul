/* 🎲 Chaos deck 'iam' — Beginner level iam. Engine: chaos.js. Faisla awscli.js ke mini IAM evaluator se
   (simulate-principal-policy: default deny → Allow → explicit Deny sabse upar).
   Kahani: purana CI user "ci-invoices" sirf shopkaro-invoices bucket mein invoices padhta/likhta hai.
   Swasth base: customer managed policy invoices-rw (Get/Put objects par, ListBucket bucket par) + group deployers ka
   guardrail (Deny s3:DeleteBucket). Probe (base par): zaroori actions allowed · archive bucket, iam:CreateUser,
   DeleteBucket denied · koi inline policy nahi.
   Har card EK badlaav (simulator par chala ke dekha, 2026-11-27):
     inline-freeze      PutObject → explicitDeny (inline "temp-freeze" incident ke baad bachi)
     admin-attached     archive GetObject aur iam:CreateUser → allowed
     wildcard-resource  archive bucket GetObject → allowed (Resource shopkaro-invoices*)
     listbucket-arn     ListBucket bucket par → implicitDeny (Resource objects wala /*)
     policy-detached    Get/Put/List → implicitDeny (invoices-rw juda hi nahi) */
(function () {
  const A = '123456789012', USER = 'ci-invoices', BUCKET = 'shopkaro-invoices';
  const POLICY_ARN = `arn:aws:iam::${A}:policy/invoices-rw`, USER_ARN = `arn:aws:iam::${A}:user/${USER}`;
  const reviewed = () => ({ Version: '2012-10-17', Statement: [
    { Sid: 'InvoiceObjects', Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: `arn:aws:s3:::${BUCKET}/*` },
    { Sid: 'InvoiceList', Effect: 'Allow', Action: 's3:ListBucket', Resource: `arn:aws:s3:::${BUCKET}` }] });
  const user = a => a.users.find(u => u.name === USER);
  const policy = a => a.policies.find(p => p.arn === POLICY_ARN);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const H1 = 'Runbook ke teeno probe chalao: zaroori actions (allowed?), mana actions (denied?), aur user par kya-kya juda hai. Kaunsa jawab galat hai?';
  const simAllow1 = `aws iam simulate-principal-policy --policy-source-arn ${USER_ARN} --action-names s3:GetObject s3:PutObject --resource-arns arn:aws:s3:::${BUCKET}/2026/inv-2201.pdf`;
  const simAllow2 = `aws iam simulate-principal-policy --policy-source-arn ${USER_ARN} --action-names s3:ListBucket --resource-arns arn:aws:s3:::${BUCKET}`;
  const simDeny = `aws iam simulate-principal-policy --policy-source-arn ${USER_ARN} --action-names s3:GetObject --resource-arns arn:aws:s3:::${BUCKET}-archive/2019/old.pdf`;
  const simDenyIam = `aws iam simulate-principal-policy --policy-source-arn ${USER_ARN} --action-names iam:CreateUser`;
  const listAttached = `aws iam list-attached-user-policies --user-name ${USER}`;
  const listInline = `aws iam list-user-policies --user-name ${USER}`;
  const getVersion = `aws iam get-policy-version --policy-arn ${POLICY_ARN} --version-id v2`;
  const newVersion = `aws iam create-policy-version --policy-arn ${POLICY_ARN} --policy-document file://invoices-rw-reviewed.json --set-as-default`;

  AG.chaos.addDeck({
    id: 'iam', title: 'IAM access deck',
    account: {
      region: 'ap-south-1', callerIdentity: { Account: A, UserId: 'AIDASECURITYREVIEW', Arn: `arn:aws:iam::${A}:user/security-review` },
      users: [{ name: USER, arn: USER_ARN, groups: ['deployers'], mfa: false, attachedPolicies: ['invoices-rw'], inline: {}, lastActive: '2026-11-26',
        keys: [{ id: 'AKIAQX7CIINVOICES01', status: 'Active', created: '2026-08-01T09:00:00Z' }] }],
      groups: [{ name: 'deployers', users: [USER], inline: { 'no-bucket-delete': { Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: 's3:DeleteBucket', Resource: '*' }] } } }],
      policies: [{ name: 'invoices-rw', arn: POLICY_ARN, type: 'Customer Managed', attached: 1, defaultVersion: 'v2', versions: 2, document: reviewed(),
        versionDocs: { v1: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 's3:GetObject', Resource: `arn:aws:s3:::${BUCKET}/*` }] } } }],
      roles: [],
    },
    files: {
      'invoices-rw-reviewed.json': { desc: 'Review kiya invoices-rw (least privilege)', content: JSON.stringify(reviewed(), null, 2) },
    },
    responses: [
      { re: /^aws iam create-policy-version\b/, out: (sim, m) => {
        const cmd = m.input, arnM = cmd.match(/--policy-arn\s+(\S+)/), docM = cmd.match(/--policy-document\s+file:\/\/(\S+)/);
        const p = arnM && sim.account.policies.find(x => x.arn === arnM[1]);
        if (!p) return 'An error occurred (NoSuchEntity) when calling the CreatePolicyVersion operation: Policy ' + (arnM ? arnM[1] : '') + ' does not exist or is not attachable.';
        const f = docM && sim.files[docM[1]];
        if (!f) return 'An error occurred (MalformedPolicyDocument) when calling the CreatePolicyVersion operation: use --policy-document file://<ls wali file>';
        p.versions = (p.versions || 1) + 1;
        const v = 'v' + p.versions, isDefault = /--set-as-default\b/.test(cmd);
        p.versionDocs = p.versionDocs || {};
        p.versionDocs[p.defaultVersion] = p.versionDocs[p.defaultVersion] || p.document;
        p.versionDocs[v] = JSON.parse(f.content);
        if (isDefault) { p.document = p.versionDocs[v]; p.defaultVersion = v; }
        return JSON.stringify({ PolicyVersion: { VersionId: v, IsDefaultVersion: isDefault, CreateDate: '2026-11-27T05:20:00Z' } }, null, 4);
      } },
      { re: /^aws iam get-policy-version\b/, out: (sim, m) => {
        const cmd = m.input, arnM = cmd.match(/--policy-arn\s+(\S+)/), vM = cmd.match(/--version-id\s+(\S+)/);
        const p = arnM && sim.account.policies.find(x => x.arn === arnM[1]);
        if (!p) return 'An error occurred (NoSuchEntity) when calling the GetPolicyVersion operation: Policy does not exist.';
        const v = vM ? vM[1] : p.defaultVersion, doc = v === p.defaultVersion ? p.document : (p.versionDocs || {})[v];
        if (!doc) return `An error occurred (NoSuchEntity) when calling the GetPolicyVersion operation: Policy ${p.arn} version ${v} does not exist or is not attachable.`;
        return JSON.stringify({ PolicyVersion: { Document: doc, VersionId: v, IsDefaultVersion: v === p.defaultVersion, CreateDate: '2026-11-20T10:00:00Z' } }, null, 4);
      } },
      { re: /^aws iam get-policy\b/, out: (sim, m) => {
        const arnM = m.input.match(/--policy-arn\s+(\S+)/), p = arnM && sim.account.policies.find(x => x.arn === arnM[1]);
        if (!p) return 'An error occurred (NoSuchEntity) when calling the GetPolicy operation: Policy does not exist.';
        return JSON.stringify({ Policy: { PolicyName: p.name, Arn: p.arn, DefaultVersionId: p.defaultVersion, AttachmentCount: p.attached, IsAttachable: true } }, null, 4);
      } },
      { re: /^aws iam list-user-policies\b/, out: sim => JSON.stringify({ PolicyNames: Object.keys(user(sim.account).inline || {}) }, null, 4) },
    ],
    alert: '<b>📟 12:30 — ShopKaro security review.</b> Kal raat CI pipeline ke IAM permissions ek naye template se dobara lage. Aaj review mein ek jawab galat hai. <b>Ek</b> setting galat hai. Shuru: <code>cat runbook.md</code>.',
    placeholder: 'cat runbook.md   (phir: aws iam simulate-principal-policy …)',
    runbook: `# CI user "ci-invoices" — access review
1. Zaroori kaam (allowed aana chahiye):
   ${simAllow1}
   ${simAllow2}
2. Mana kaam (denied aana chahiye — archive bucket aur IAM ko chhoona nahi):
   ${simDeny}
   ${simDenyIam}
3. User par kya juda hai:
   ${listAttached}      → sirf invoices-rw
   ${listInline}             → koi inline policy nahi
   aws iam get-policy --policy-arn ${POLICY_ARN}   (DefaultVersionId)
   ${getVersion}   (us version ka document)
Badlaav:  aws iam attach-user-policy | detach-user-policy --user-name ${USER} --policy-arn <ARN>
          aws iam delete-user-policy --user-name ${USER} --policy-name <naam>
          ${newVersion}
Niyam:    ek baar mein EK badlaav, phir simulate dobara. EvalDecision aur MatchedStatements dono padho.`,
    cards: [
      { id: 'inline-freeze', title: 'User par "temp-freeze" naam ki inline Deny policy reh gayi',
        break: a => { user(a).inline['temp-freeze'] = { Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: 's3:PutObject', Resource: '*' }] }; },
        fixed: a => !user(a).inline['temp-freeze'],
        verify: /^aws iam simulate-principal-policy\b/, verifyText: 'simulate dobara chalao',
        hints: [H1, 'PutObject ka EvalDecision explicitDeny hai — Allow hone par bhi. MatchedStatements mein Deny kis policy se aa raha? User ki inline policies dekho.',
          `aws iam delete-user-policy --user-name ${USER} --policy-name temp-freeze, phir simulate`],
        solution: ['cat runbook.md', simAllow1, listInline, `aws iam get-user-policy --user-name ${USER} --policy-name temp-freeze`, `aws iam delete-user-policy --user-name ${USER} --policy-name temp-freeze`, simAllow1],
        why: '<b>Explicit Deny</b> har Allow ko kaat deta hai. Incident ke waqt lagi "temp-freeze" policy hatana bhool gaye, toh CI ka PutObject ruk gaya. Temporary guardrail ki expiry aur owner likho.' },
      { id: 'admin-attached', title: 'CI user par AdministratorAccess jud gaya',
        break: a => { user(a).attachedPolicies.push('AdministratorAccess'); },
        fixed: a => !user(a).attachedPolicies.includes('AdministratorAccess') && user(a).attachedPolicies.includes('invoices-rw'),
        verify: /^aws iam simulate-principal-policy\b/, verifyText: 'mana actions ka simulate dobara chalao',
        hints: [H1, 'Zaroori kaam theek, par archive ka GetObject aur iam:CreateUser bhi "allowed"! Kaunsi attached policy itna sab de rahi hai?',
          `aws iam detach-user-policy --user-name ${USER} --policy-arn arn:aws:iam::aws:policy/AdministratorAccess, phir mana actions ka simulate`],
        solution: ['cat runbook.md', simAllow1, simDenyIam, listAttached, `aws iam detach-user-policy --user-name ${USER} --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`, simDenyIam],
        why: 'Kaam chal raha tha, isliye kisi ne dekha nahi — par <b>AdministratorAccess</b> se CI key leak = poora account. Mana-kaam wala probe yahi pakadta hai. Sirf zaroori, scoped policy rakho.' },
      { id: 'wildcard-resource', title: 'invoices-rw ka Resource shopkaro-invoices* ho gaya (archive bhi match)',
        break: a => { policy(a).document.Statement[0].Resource = `arn:aws:s3:::${BUCKET}*/*`; },
        fixed: a => same(policy(a).document, reviewed()),
        verify: /^aws iam simulate-principal-policy\b/, verifyText: 'mana actions ka simulate dobara chalao',
        hints: [H1, 'Archive bucket ka GetObject "allowed", aur MatchedStatements mein invoices-rw hi hai. Uske Resource mein * kahan laga hai?',
          `${newVersion}, phir mana actions ka simulate`],
        solution: ['cat runbook.md', simAllow1, simDeny, getVersion, newVersion, simDeny],
        why: '<b>shopkaro-invoices*</b> mein * bucket ke naam par laga — shopkaro-invoices-archive bhi match. Resource ko exact bucket ARN tak baandho. Naya version <b>--set-as-default</b> ke saath hi lagta hai.' },
      { id: 'listbucket-arn', title: 'ListBucket ka Resource bucket ki jagah objects (/*) par chala gaya',
        break: a => { policy(a).document.Statement[1].Resource = `arn:aws:s3:::${BUCKET}/*`; },
        fixed: a => same(policy(a).document, reviewed()),
        verify: /^aws iam simulate-principal-policy\b/, verifyText: 'ListBucket ka simulate dobara chalao',
        hints: [H1, 'GetObject/PutObject allowed, par ListBucket implicitDeny. s3:ListBucket kis ARN par lagta hai — bucket par ya objects par?',
          `${newVersion}, phir ListBucket ka simulate`],
        solution: ['cat runbook.md', simAllow1, simAllow2, getVersion, newVersion, simAllow2],
        why: '<b>s3:ListBucket</b> bucket ARN (arn:aws:s3:::shopkaro-invoices) par lagta hai, objects (/*) par nahi. Galat ARN = "policy likhi thi, phir bhi AccessDenied".' },
      { id: 'policy-detached', title: 'CI user se invoices-rw policy hat gayi',
        break: a => { user(a).attachedPolicies = []; },
        fixed: a => user(a).attachedPolicies.includes('invoices-rw') && !user(a).attachedPolicies.includes('AdministratorAccess'),
        verify: /^aws iam simulate-principal-policy\b/, verifyText: 'zaroori actions ka simulate dobara chalao',
        hints: [H1, 'Sab kuch implicitDeny — koi Deny match nahi, bas koi Allow hi nahi. User par kaunsi policy judi hai?',
          `aws iam attach-user-policy --user-name ${USER} --policy-arn ${POLICY_ARN}, phir simulate`],
        solution: ['cat runbook.md', simAllow1, listAttached, `aws iam attach-user-policy --user-name ${USER} --policy-arn ${POLICY_ARN}`, simAllow1],
        why: '<b>implicitDeny</b> = koi Allow match hi nahi hua (default deny); explicitDeny matlab kisi ne mana kiya. Yahan policy hi nahi judi thi. Admin jodna galat ilaaj — sirf scoped policy wapas jodo.' },
    ],
  });

  AG.addLab('iam', {
    type: 'chaos', id: 'chaos-iam', deck: 'iam', title: '🎲 Chaos round: CI permissions ka naya template',
    intro: 'Teen probe, ek galat permission. <b>EvalDecision</b> aur <b>MatchedStatements</b> padho, EK badlaav se theek karo.',
  });
})();
