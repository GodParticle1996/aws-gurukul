/* Advanced 9c — appai: Cognito user pools vs identity pools, tokens, API authorizers, and an AI services picker.
   ShopKaro course story (fictional). Fixture data only; see appai-cli.js for the bounded Cognito/authorizer model. */
(() => {
  const copy = x => JSON.parse(JSON.stringify(x));
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const ACCT = '555555555555', R = 'ap-south-1', NOW = '2026-11-20T10:30:00Z';
  const ROLE_AUTH = `arn:aws:iam::${ACCT}:role/shopkaro-app-user`, ROLE_GUEST = `arn:aws:iam::${ACCT}:role/shopkaro-guest`;
  const POOL = R + '_SkPool001', CLIENT = 'skmobileappclient000200000', IPOOL = R + ':1f0e2d3c-0000-4a5b-8c9d-000000000003';
  const ident = { Account: ACCT, Arn: `arn:aws:iam::${ACCT}:role/app-platform` };
  const ROLES = [{ name: 'shopkaro-app-user', arn: ROLE_AUTH, note: 's3:PutObject sirf shopkaro-uploads/private/${cognito-identity.amazonaws.com:sub}/*' }, { name: 'shopkaro-guest', arn: ROLE_GUEST, note: 'sirf public catalog read' }];
  const FILES = {
    'password-policy.json': { content: JSON.stringify({ PasswordPolicy: { MinimumLength: 10, RequireNumbers: true, RequireSymbols: true, RequireUppercase: true, RequireLowercase: true } }, null, 2) },
    'runbook.txt': { content: 'ShopKaro app login (fictional)\n- User pool: shopkaro-customers, password policy file, MFA OPTIONAL, plan ESSENTIALS (managed login/passwordless isi se)\n- Mobile client: mobile-app, secret NAHI (app mein secret chhup nahi sakta), SRP + refresh; ADMIN flow sirf CLI smoke test ke liye\n- Test user: TEST-priya (email message SUPPRESS)\n- Identity pool: shopkaro_app, guest (unauthenticated) NAHI, authenticated role ' + ROLE_AUTH + '\n- Role sirf apne ${sub} folder mein upload deta hai\n' }
  };
  function seed() { return { authMode: true, region: R, now: NOW, callerIdentity: copy(ident), iamRoles: copy(ROLES), userPools: [], userPoolClients: [], poolUsers: [], identityPools: [], httpApis: [], jwtAuthorizers: [], authSeq: 0 }; }
  const core = a => a.authMode === true && a.region === R && same(a.callerIdentity, ident) && same(a.iamRoles, ROLES) && a.userPools.length <= 1 && a.userPoolClients.length <= 1 && a.identityPools.length <= 1;
  function poolReady(a) {
    const p = a.userPools[0], c = a.userPoolClients[0], u = a.poolUsers.find(x => x.name === 'TEST-priya');
    if (!p || p.id !== POOL || p.name !== 'shopkaro-customers') return false;
    const pol = p.policy;
    if (!(pol.MinimumLength >= 10 && pol.RequireNumbers && pol.RequireSymbols) || !['OPTIONAL', 'ON'].includes(p.mfa) || !['ESSENTIALS', 'PLUS'].includes(p.tier)) return false;
    if (!c || c.id !== CLIENT || c.pool !== POOL || c.secret || !c.flows.includes('ALLOW_USER_SRP_AUTH') || !c.flows.includes('ALLOW_REFRESH_TOKEN_AUTH') || c.flows.includes('ALLOW_USER_PASSWORD_AUTH')) return false;
    return !!u && u.status === 'CONFIRMED' && (a.authLogins || []).some(l => l.pool === POOL && l.client === CLIENT && l.user === 'TEST-priya');
  }
  function ipoolReady(a) {
    const ip = a.identityPools[0];
    return !!ip && ip.id === IPOOL && ip.unauth === false && same(ip.providers, [{ ProviderName: `cognito-idp.${R}.amazonaws.com/${POOL}`, ClientId: CLIENT }]) && same(ip.roles, { authenticated: ROLE_AUTH });
  }
  const tasks = [
    { text: 'IAM roles waise hi; ek hi user pool, ek client aur ek identity pool; guest access nahi', check: s => core(s.account) },
    { text: 'shopkaro-customers (strong password, MFA OPTIONAL, ESSENTIALS), mobile-app client bina secret aur bina plain password flow, TEST-priya CONFIRMED aur login hua', check: s => core(s.account) && poolReady(s.account) },
    { text: 'shopkaro_app identity pool sirf is user pool + client se, authenticated role mapped; aakhir mein roles ka aaj ka read', check: s => core(s.account) && poolReady(s.account) && ipoolReady(s.account) && s.account.authRead === (s.account.authRevision || 0) }
  ];
  const solution = [
    'aws cognito-idp create-user-pool --pool-name shopkaro-customers --policies file://password-policy.json --mfa-configuration OPTIONAL --user-pool-tier ESSENTIALS --auto-verified-attributes email',
    `aws cognito-idp create-user-pool-client --user-pool-id ${POOL} --client-name mobile-app --no-generate-secret --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_ADMIN_USER_PASSWORD_AUTH`,
    `aws cognito-idp admin-create-user --user-pool-id ${POOL} --username TEST-priya --message-action SUPPRESS --temporary-password Temp-Pass-12!`,
    `aws cognito-idp admin-set-user-password --user-pool-id ${POOL} --username TEST-priya --password TEST-Passw0rd!x --permanent`,
    `aws cognito-idp admin-initiate-auth --user-pool-id ${POOL} --client-id ${CLIENT} --auth-flow ADMIN_USER_PASSWORD_AUTH --auth-parameters USERNAME=TEST-priya,PASSWORD=TEST-Passw0rd!x`,
    `aws cognito-identity create-identity-pool --identity-pool-name shopkaro_app --no-allow-unauthenticated-identities --cognito-identity-providers ProviderName=cognito-idp.${R}.amazonaws.com/${POOL},ClientId=${CLIENT}`,
    `aws cognito-identity set-identity-pool-roles --identity-pool-id ${IPOOL} --roles authenticated=${ROLE_AUTH}`,
    `aws cognito-identity get-identity-pool-roles --identity-pool-id ${IPOOL}`
  ];

  /* ---------- interview: valid mobile users get 401 from the HTTP API ---------- */
  const IPOOL2 = R + '_SkPool777', WEB = 'skwebclient000700000000000', MOBILE = 'skmobileclient00080000000a', API = 'a1b2c3d4e5', ISS = `https://cognito-idp.${R}.amazonaws.com/${IPOOL2}`;
  function iseed() {
    const a = seed();
    a.userPools = [{ id: IPOOL2, name: 'shopkaro-customers', policy: { MinimumLength: 10, RequireNumbers: true, RequireSymbols: true, RequireUppercase: true, RequireLowercase: true }, mfa: 'OPTIONAL', tier: 'ESSENTIALS', autoVerified: ['email'], usernameAttrs: [] }];
    a.userPoolClients = [{ id: WEB, pool: IPOOL2, name: 'web', secret: false, flows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'] }, { id: MOBILE, pool: IPOOL2, name: 'mobile-app', secret: false, flows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'] }];
    a.httpApis = [{ id: API, name: 'shopkaro-orders-api' }];
    a.jwtAuthorizers = [{ api: API, id: 'auth01', name: 'cognito-jwt', issuer: ISS, audience: [WEB] }];
    return a;
  }
  const ibase = iseed();
  const now = Math.floor(Date.parse(NOW) / 1000);
  const mobileIdToken = AG.authJwt({ sub: 'TEST-sub-1', aud: MOBILE, token_use: 'id', 'cognito:username': 'TEST-priya', iss: ISS, iat: now, exp: now + 3600 });
  const webIdToken = AG.authJwt({ sub: 'TEST-sub-2', aud: WEB, token_use: 'id', 'cognito:username': 'TEST-ravi', iss: ISS, iat: now, exp: now + 3600 });
  function iready(a) {
    const x = a.jwtAuthorizers[0];
    return !!x && x.issuer === ISS && same(x.audience.slice().sort(), [MOBILE, WEB].sort()) && same(a.userPools, ibase.userPools) && same(a.userPoolClients, ibase.userPoolClients)
      && AG.authAuthorize(a, x, mobileIdToken).ok && AG.authAuthorize(a, x, webIdToken).ok;
  }
  const itasks = [
    { text: 'Wahi user pool, wahi clients aur wahi issuer; web app ka login chalta rahe', check: s => { const a = s.account, x = a.jwtAuthorizers[0]; return !!x && x.issuer === ISS && x.audience.includes(WEB) && same(a.userPools, ibase.userPools) && same(a.userPoolClients, ibase.userPoolClients); } },
    { text: 'Authorizer ki audience mein mobile-app client bhi; dono ke tokens pass; aaj ka authorizer read', check: s => iready(s.account) && s.account.authRead === (s.account.authRevision || 0) }
  ];
  const isolution = [
    `aws apigatewayv2 get-authorizers --api-id ${API}`,
    `aws apigatewayv2 update-authorizer --api-id ${API} --authorizer-id auth01 --jwt-configuration Audience=${WEB},${MOBILE},Issuer=${ISS}`,
    `aws apigatewayv2 get-authorizer --api-id ${API} --authorizer-id auth01`
  ];

  /* ---------- flowlab: product photo moderation thresholds ---------- */
  const UNSAFE = [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 88, 87, 85, 83, 80, 78, 74, 66, 58, 52];
  const SAFE = Array.from({ length: 180 }, (_, i) => [55, 61, 64, 70, 72, 76, 82, 86][i] ?? (i * 37) % 50);
  AG.appaiModeration = k => {
    const rej = k.rejectAt, rev = Math.min(k.reviewFrom, k.rejectAt);
    const fn = UNSAFE.filter(c => c < rev).length, fp = SAFE.filter(c => c >= rej).length;
    const review = UNSAFE.filter(c => c >= rev && c < rej).length + SAFE.filter(c => c >= rev && c < rej).length;
    const autoBlocked = UNSAFE.filter(c => c >= rej).length;
    return { fn, fp, review, autoBlocked, ok: fn === 0 && fp <= 2 && review <= 25 };
  };

  const STAGES = [
    {
      type: 'dryrun',
      title: '🧭 Dry run: login se photo upload tak, kaunsa token kahan',
      intro: 'Fictional ShopKaro app. "Agla" dabao; har kadam par dekho kaunsa token ya credential kis jagah jaata hai.',
      goal: 'Priya login kare, apne orders API se dekhe, aur apni photo seedha S3 mein sirf apne folder mein upload kare.',
      lesson: 'User pool ne pehchaan (tokens) di. API ne ID/access token ko issuer aur audience se jaancha. Identity pool ne usi login ke badle thodi der ke AWS credentials diye, jinka role sirf apne folder mein upload deta hai. Har cheez ka kaam alag hai.',
      nodes: [
        { id: 'app', x: 120, y: 260, icon: '📱', label: 'ShopKaro app' },
        { id: 'up', x: 380, y: 90, icon: '👤', label: 'User pool' },
        { id: 'api', x: 640, y: 90, icon: '🚪', label: 'HTTP API' },
        { id: 'ip', x: 380, y: 430, icon: '🎫', label: 'Identity pool' },
        { id: 's3', x: 640, y: 430, icon: '🪣', label: 'S3 uploads' },
        { id: 'svc', x: 880, y: 90, icon: '🧾', label: 'Orders service' }
      ],
      edges: [{ from: 'app', to: 'up' }, { from: 'app', to: 'api' }, { from: 'api', to: 'svc' }, { from: 'app', to: 'ip' }, { from: 'app', to: 's3' }],
      panels: [{ id: 'tok', title: 'App ke paas kya hai' }, { id: 'rule', title: 'Kaun kya jaanchta hai' }],
      steps: [
        {
          say: 'Priya email aur password se login karti hai. User pool teen tokens deta hai: ID token, access token aur refresh token.',
          flows: [{ from: 'app', to: 'up', tone: 'acc', label: 'SRP login' }],
          nodes: { up: { tone: 'ok', badge: '3 tokens' } },
          panels: { tok: ['ID token (kaun hai)', 'Access token (kya kar sakti hai)', 'Refresh token (naye tokens ke liye)'], rule: ['Password app ke paas nahi rukta'] },
          ask: {
            q: 'Mobile app ke client par "client secret" kyun nahi rakhte?',
            choices: [
              'App ka code phone par hota hai; uske andar ka secret koi bhi nikaal sakta hai',
              'Secret wala client login ko 10 guna dheema karta hai',
              'Cognito mobile apps ke liye secret banata hi nahi, sirf web ke liye',
              'Secret rakhne se MFA apne aap band ho jaata hai'
            ],
            answer: 0,
            explain: 'Public client (mobile/SPA) mein secret chhup nahi sakta, isliye bina secret ka client aur SRP/PKCE. Speed, MFA ya "mobile ke liye bana hi nahi" wajah nahi.'
          }
        },
        {
          say: 'App orders dekhne ke liye HTTP API ko token bhejti hai. JWT authorizer token ka issuer, expiry aur audience (ID token mein aud, access token mein client_id) jaanchta hai.',
          flows: [{ from: 'app', to: 'api', tone: 'acc', label: 'Bearer token' }, { from: 'api', to: 'svc', tone: 'ok' }],
          nodes: { api: { tone: 'ok', badge: '200' } },
          panels: { tok: ['Authorization: Bearer <token>'], rule: ['Issuer = is user pool ka URL', 'Audience list mein app ka client ID'] },
          ask: {
            q: 'Authorizer ki audience list mein sirf purane web app ka client ID hai. Mobile app ka token aaya toh?',
            choices: [
              '200, kyunki token usi user pool ka hai, client ID ka koi matlab nahi',
              '200, par sirf pehli baar; agli baar se 401',
              '401, kyunki token ka aud/client_id audience list mein nahi',
              '500, kyunki API Gateway mobile tokens samajh hi nahi sakta'
            ],
            answer: 2,
            explain: 'JWT authorizer audience (ID token ka aud ya access token ka client_id) ko list se milata hai. Same pool ka token bhi galat client ke liye reject hota hai.'
          }
        },
        {
          say: 'Photo upload ke liye app identity pool ko ID token deti hai. Identity pool badle mein thodi der ke AWS credentials deta hai, authenticated role ke saath.',
          flows: [{ from: 'app', to: 'ip', tone: 'acc', label: 'ID token' }],
          nodes: { ip: { tone: 'ok', badge: 'temp AWS creds' } },
          panels: { tok: ['AccessKeyId + SecretKey + SessionToken (1 ghanta)'], rule: ['Guest access band', 'Role: sirf apna ${sub} folder'] }
        },
        {
          say: 'App un credentials se S3 mein private/<apni identity id>/photo.jpg likhti hai. Kisi aur ke folder mein likhne par AccessDenied.',
          flows: [{ from: 'app', to: 's3', tone: 'ok', label: 'PutObject' }],
          nodes: { s3: { tone: 'ok', badge: 'apna folder' } },
          panels: { tok: ['Credentials 1 ghante baad bekaar'], rule: ['Policy variable ${cognito-identity.amazonaws.com:sub}'] },
          ask: {
            q: 'Ek user doosre user ke folder mein photo na daal sake, iske liye kya karoge?',
            choices: [
              'Policy Resource ko ${cognito-identity.amazonaws.com:sub} prefix tak roko',
              'App ke code mein if-condition lagao, aur role ki policy poori bucket par rahe',
              'Har naye user ke liye sign-up ke waqt ek alag S3 bucket bana do',
              'Bucket public kar do aur har file ka naam lamba random string rakho'
            ],
            answer: 0,
            explain: 'Policy variable har identity ko apne prefix tak rokta hai, AWS ke andar hi. App ki if-condition todi ja sakti hai, har user ka bucket nahi chalta, aur public bucket khatarnaak hai.'
          }
        },
        {
          say: 'Seller invoice ki photo upload karta hai. Textract text aur form fields nikaalta hai; GSTIN ka pattern app check karti hai, shak ho toh insaan dekhta hai.',
          nodes: { svc: { tone: 'acc', badge: 'Textract' } },
          panels: { tok: ['Invoice photo S3 mein'], rule: ['AI ka jawaab + confidence; kam confidence par human review'] }
        }
      ]
    },
    {
      type: 'flowlab',
      title: '🎛️ Product photo moderation: threshold aur human review',
      goal: 'Koi bhi galat (unsafe) photo publish na ho, achhi photos mein se zyada se zyada 2 galti se block hon, aur human review queue 25 se kam rahe.',
      scenario: 'Fictional labelled sample: 200 product photos, unme 20 asal mein unsafe. Model har photo ko 0–100 confidence deta hai. Confidence rejectAt ya zyada → apne aap block. reviewFrom se rejectAt ke beech → insaan dekhe. reviewFrom se kam → seedha publish. Kuch achhi photos (jaise saree ke kuch designs) par bhi model ka confidence 55–86 aata hai.',
      knobs: [
        { id: 'rejectAt', label: 'Apne aap block (confidence ≥)', min: 60, max: 99, step: 1, value: 70 },
        { id: 'reviewFrom', label: 'Human review shuru (confidence ≥)', min: 30, max: 95, step: 5, value: 30 }
      ],
      model: k => {
        const r = AG.appaiModeration(k);
        return {
          readouts: [
            { label: 'Unsafe jo publish ho gayi', value: String(r.fn), tone: r.fn === 0 ? 'ok' : 'bad' },
            { label: 'Achhi photos galti se block', value: String(r.fp), tone: r.fp <= 2 ? 'ok' : 'bad' },
            { label: 'Human review queue', value: String(r.review), tone: r.review <= 25 ? 'ok' : 'bad' },
            { label: 'Unsafe apne aap block', value: r.autoBlocked + ' / 20', tone: 'acc' }
          ],
          verdict: r.ok ? { ok: true, text: 'Koi unsafe publish nahi, ' + r.fp + ' achhi photos block, aur ' + r.review + ' photos insaan ke paas. Asli data par yeh numbers dobara naapo.' }
            : { ok: false, text: r.fn ? 'Kuch unsafe photos seedha publish ho rahi hain: review ki shuruaat neeche lao.' : r.fp > 2 ? 'Bahut achhi photos apne aap block: block ki limit upar karo.' : 'Human review queue bahut lambi: review ki shuruaat thodi upar karo.' }
        };
      },
      check: k => AG.appaiModeration(k).ok,
      lesson: 'Ek hi threshold se dono galtiyaan nahi bachti. Upar wala threshold sirf pakke cases apne aap block karta hai, beech wala band insaan ko jaata hai, aur neeche publish. Asli system mein yeh numbers apne labelled data par naapo aur samay-samay par dobara jaancho.'
    },
    {
      type: 'bins',
      title: '🗂️ Kaunsa token ya credential kis kaam ka?',
      instructions: 'Har kaam ko us cheez mein daalo jo uske liye bani hai.',
      bins: [{ id: 'id', label: 'ID token' }, { id: 'access', label: 'Access token' }, { id: 'refresh', label: 'Refresh token' }, { id: 'aws', label: 'Identity pool AWS credentials' }],
      items: [
        { text: 'App mein user ka naam aur email dikhana', bin: 'id', explain: 'ID token mein user ke claims (naam, email) hote hain.' },
        { text: 'Identity pool se AWS credentials lene ke liye login proof', bin: 'id', explain: 'Identity pool ko user pool ka ID token diya jaata hai.' },
        { text: 'API ko scopes ke saath call karna (orders:read)', bin: 'access', explain: 'Scopes access token mein hote hain; API usse permission jaanchti hai.' },
        { text: 'User ka password badalna (Cognito user API)', bin: 'access', explain: 'Cognito ki user APIs access token maangti hain.' },
        { text: 'Ghante baad bina dobara login ke naye tokens lena', bin: 'refresh', explain: 'Refresh token se naye ID/access tokens aate hain.' },
        { text: 'S3 mein seedha apne folder mein photo upload', bin: 'aws', explain: 'Thodi der ke AWS credentials + role policy.' },
        { text: 'DynamoDB mein sirf apni rows padhna (fine-grained)', bin: 'aws', explain: 'Role policy mein ${cognito-identity.amazonaws.com:sub} se.' }
      ]
    },
    {
      type: 'match',
      title: '🔗 AI ki zaroorat → AWS service',
      instructions: 'Har zaroorat ko us service se jodo jo use seedha poora karti hai.',
      pairs: [
        { left: 'Invoice photo se text aur form fields (GSTIN)', right: 'Textract', explain: 'Documents se text, forms, tables nikaalta hai.' },
        { left: 'Product photo mein unsafe content', right: 'Rekognition', explain: 'Image moderation labels, confidence ke saath.' },
        { left: 'Review text mein sentiment aur PII', right: 'Comprehend', explain: 'NLP: sentiment, entities, PII.' },
        { left: 'Customer call ki recording se text', right: 'Transcribe', explain: 'Speech-to-text.' },
        { left: 'Order status bol kar sunana', right: 'Polly', explain: 'Text-to-speech.' },
        { left: 'Hindi review ko English mein', right: 'Translate', explain: 'Machine translation.' },
        { left: 'Support chatbot (intents, slots)', right: 'Lex', explain: 'Conversational bot; Bedrock ke saath bhi jud sakta hai.' },
        { left: 'Foundation model se FAQ ke jawaab, apne docs ke saath', right: 'Bedrock (Knowledge Bases)', explain: 'Managed foundation models; Knowledge Bases apne data se jawaab.' }
      ]
    },
    {
      type: 'triage',
      title: '🩺 Sahi users ko 401',
      symptom: 'Fictional: naya mobile app release hua. Login safal hota hai, par orders API har request par 401 deti hai. Web app ke users theek hain.',
      goal: 'Authorizer ki setting aur token ke claims dekho. Wajah aur sabse chhota sahi fix chuno.',
      commands: [
        { cmd: 'aws apigatewayv2 get-authorizers --api-id a1b2c3d4e5', out: '"JwtConfiguration": { "Audience": ["skwebclient000700000000000"], "Issuer": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_SkPool777" }', clue: true, note: 'Audience mein sirf web client.' },
        { cmd: 'echo $ID_TOKEN | cut -d. -f2 | base64 -d   (mobile app ka token)', out: '{ "token_use": "id", "aud": "skmobileclient00080000000a", "iss": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_SkPool777" }', clue: true, note: 'Issuer sahi, par aud mobile client ka.' },
        { cmd: 'aws cognito-idp describe-user-pool-client --user-pool-id ap-south-1_SkPool777 --client-id skmobileclient00080000000a', out: '"ClientName": "mobile-app", "ExplicitAuthFlows": ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]', clue: false, note: 'Client theek bana hai; login isliye safal.' }
      ],
      questions: [
        {
          q: '401 ki wajah?',
          choices: [
            'User pool ka issuer badal gaya, isliye saare tokens galat hain',
            'Mobile token ka aud (client ID) authorizer ki audience list mein nahi',
            'Mobile client par secret nahi hai, isliye API uske tokens reject karti hai',
            'Token expire ho chuka hai, kyunki mobile tokens 5 minute chalte hain'
          ],
          answer: 1,
          explain: 'Issuer dono mein same hai aur web chal raha hai. Mobile token ka aud naya client ID hai jo audience list mein nahi. Secret ka API se lena-dena nahi, aur expiry ka saboot nahi.'
        },
        {
          q: 'Sabse chhota sahi fix?',
          choices: [
            'Authorizer hata do, taaki koi bhi request bina token chal sake',
            'Audience mein sirf mobile client rakho, web baad mein dekhenge',
            'Mobile app ko bhi web client ID se login karwao, taaki aud match ho jaaye',
            'Audience list mein mobile client ID jodo, web client ID bhi rakho'
          ],
          answer: 3,
          explain: 'Dono clients audience mein hon toh dono apps chalengi. Authorizer hatana API khol deta hai, sirf mobile rakhne se web toot-ta hai, aur client ID share karna alag apps ka hisaab bigaadta hai.'
        }
      ]
    },
    {
      type: 'terminal',
      title: '🖥️ ShopKaro app ka login aur upload access',
      instructions: 'Sirf app ka Cognito fixture; koi AWS call nahi. ls/cat se runbook.txt aur password-policy.json padho. Tokens course ke unsigned JWT hain.',
      goal: '<p><b>1.</b> User pool <code>shopkaro-customers</code>: <code>password-policy.json</code>, MFA <b>OPTIONAL</b>, plan <b>ESSENTIALS</b>, email auto-verify.</p><p><b>2.</b> App client <code>mobile-app</code>: <b>secret nahi</b>; flows <code>ALLOW_USER_SRP_AUTH</code>, <code>ALLOW_REFRESH_TOKEN_AUTH</code>, aur sirf CLI smoke test ke liye <code>ALLOW_ADMIN_USER_PASSWORD_AUTH</code>. Plain <code>ALLOW_USER_PASSWORD_AUTH</code> nahi.</p><p><b>3.</b> Test user <code>TEST-priya</code> (message SUPPRESS), permanent password (policy ke hisaab se), phir <code>admin-initiate-auth</code> se login karke tokens dekho.</p><p><b>4.</b> Identity pool <code>shopkaro_app</code>: guest (unauthenticated) <b>nahi</b>, sirf is user pool + client; authenticated role <code>shopkaro-app-user</code>. Aakhir mein <code>get-identity-pool-roles</code> se aaj ka read.</p>',
      account: seed(),
      files: FILES,
      tasks,
      solution,
      hints: [
        'aws cognito-idp create-user-pool --pool-name shopkaro-customers --policies file://password-policy.json --mfa-configuration OPTIONAL --user-pool-tier ESSENTIALS --auto-verified-attributes email',
        'Client: --no-generate-secret aur --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_ADMIN_USER_PASSWORD_AUTH. Password mein bada/chhota letter, number aur symbol, 10+ characters.',
        'Identity pool: --no-allow-unauthenticated-identities --cognito-identity-providers ProviderName=cognito-idp.ap-south-1.amazonaws.com/<pool-id>,ClientId=<client-id>; phir set-identity-pool-roles --roles authenticated=<role-arn>.'
      ],
      success: s => tasks.every(t => t.check(s)),
      successText: 'Strong password policy, MFA optional, bina secret ka mobile client, confirmed test user, aur sirf logged-in users ke liye identity pool. Asli AWS mein: managed login/PKCE ya SRP SDK use karo, refresh token ki validity socho, aur role policy mein ${sub} wala prefix pakka karo.'
    },
    {
      type: 'docker',
      title: '🐳 Lab31: Moto Cognito ke asli JWT decode karo',
      project: '31-cognito-app-login',
      goal: 'Apne thodi der ke Moto server par user pool, client, user aur login chalao, tokens ko Python base64 se decode karo, ek chhote authorizer se aud/client_id ka 401 dikhao, aur identity pool ki kamiyan dekho.',
      why: 'Moto Cognito asli JWT banata hai (ID token mein aud, access token mein client_id), isliye token ki banawat yahan seekh sakte ho. Par identity pool ke credentials nakli hain, aur Rekognition moderation bana hi nahi; woh GAP mein likhe hain.',
      steps: [
        { text: 'aws-gurukul se README aur lab.py padho, phir exact runner chalao.', cmd: './docker-labs/.venv/bin/python -I docker-labs/31-cognito-app-login/lab.py', expect: 'Saare behaviour checks PASS, cleanup PASS, phir OWNED MOTO STOPPED / LISTENER CLOSED.' },
        { text: 'TOKEN aur AUTHORIZER wali lines padho.', expect: 'ID token: token_use id + aud; access token: token_use access + client_id. Galat client ke token par 401.' },
        { text: 'GAP wali lines padho: identity pool credentials, Rekognition.', expect: 'Credentials static TEST values; moderation API 500.' }
      ],
      observe: {
        q: 'Lab31 asal mein kya saabit karti hai?',
        choices: [
          'Moto identity pool ne asli, role se bandhe hue thodi der ke AWS credentials diye',
          'Moto Rekognition ne saari product photos ka moderation sahi confidence ke saath kiya',
          'Token ki banawat (aud vs client_id) asli jaisi; credentials nakli, moderation missing',
          'Tokens par asli Cognito ka signature tha, isliye AWS unhe production mein maan lega'
        ],
        answer: 2,
        explain: 'Token ke claims asli jaise hain aur authorizer ka sabak yahan sach hai. Identity pool ke credentials static TEST values hain, moderation API 500 deti hai, aur Moto ki signing key nakli hai.'
      }
    },
    {
      type: 'quiz',
      title: '🎓 Login aur AI ke faisle',
      questions: [
        {
          domain: 'secure', q: 'App users ko sign-up, sign-in aur MFA chahiye. Kya?',
          choices: ['Cognito identity pool', 'Cognito user pool', 'IAM users har customer ke liye', 'IAM Identity Center'],
          answer: 1,
          explain: 'User pool app users ki directory aur login hai. Identity pool AWS credentials deta hai, IAM users customers ke liye nahi, aur Identity Center employees ke liye hai.'
        },
        {
          domain: 'secure', q: 'Logged-in app users ko seedha S3 mein apne folder mein upload karna hai, bina backend ke. Kya?',
          choices: ['App mein ek IAM access key', 'Bucket public write', 'Identity pool + ${sub} prefix wala role', 'User pool ka ID token seedha S3 ko'],
          answer: 2,
          explain: 'Identity pool thodi der ke credentials deta hai aur role policy apne prefix tak rokti hai. Access key ya public bucket khatarnaak hain, aur S3 ID token nahi samajhta.'
        },
        {
          domain: 'high-performing', q: 'Seller ki invoice photo se GSTIN aur total nikaalna hai. Kaunsi service?',
          choices: ['Amazon Textract', 'Amazon Rekognition', 'Amazon Comprehend', 'Amazon Polly'],
          answer: 0,
          explain: 'Textract documents se text, forms aur tables nikaalta hai (AnalyzeExpense invoices ke liye). Rekognition images, Comprehend text ka matlab, Polly awaaz.'
        },
        {
          domain: 'high-performing', q: 'Naye account mein (2026) apne company docs par search/Q&A chahiye. Aaj kya dekhoge?',
          choices: ['Amazon Kendra, naye index ke saath', 'Amazon Rekognition', 'Amazon Polly', 'Bedrock Knowledge Bases'],
          answer: 3,
          explain: 'Amazon Kendra 30 Jul 2026 se naye customers ke liye band hai; AWS Bedrock Knowledge Bases ki salah deta hai. Exam purana jawaab "Kendra" de sakta hai.'
        },
        {
          domain: 'high-performing', q: 'Apna custom model train karna hai, apne data aur algorithm ke saath. Kya?',
          choices: ['Amazon Bedrock prompt hi kaafi', 'Amazon SageMaker AI', 'Amazon Translate', 'Cognito'],
          answer: 1,
          explain: 'SageMaker AI custom models ki training aur deployment ke liye hai. Bedrock ready foundation models deta hai; Translate aur Cognito alag kaam ke hain.'
        },
        {
          domain: 'secure', q: 'Mobile app ke Cognito client ke liye kaunsi setting sahi hai?',
          choices: ['Client secret ke saath, secret app mein', 'Bina secret, SRP ya managed login (PKCE)', 'Plain USER_PASSWORD_AUTH, kyunki simple hai', 'Har user ke liye alag client'],
          answer: 1,
          explain: 'Public client mein secret chhup nahi sakta, isliye bina secret aur SRP/PKCE. Plain password flow kam secure hai, aur har user ka client nahi banta.'
        },
        {
          domain: 'resilient', q: 'Product photo moderation mein model kabhi galat bhi hoga. Sahi design?',
          choices: ['Sirf ek threshold rakho: upar block, neeche sab publish', 'Kuch mat karo, kyunki model hamesha 100% sahi jawaab hi deta hai', 'Har photo insaan haath se dekhe, aur model band kar do', 'Pakke cases block, beech wale insaan dekhe, baaki publish'],
          answer: 3,
          explain: 'Do thresholds ke saath human review band galtiyaan kam karta hai. Ek threshold dono taraf galti karta hai, model kabhi 100% nahi, aur sab haath se karna bahut dheema.'
        },
        {
          domain: 'secure', q: 'API Gateway HTTP API ko Cognito tokens se bachana hai. Kya lagaoge?',
          choices: ['JWT authorizer (issuer + audience)', 'Sirf WAF ka IP allow-list rule', 'CloudFront signed cookies har user ko', 'Har user ke liye ek alag API key'],
          answer: 0,
          explain: 'HTTP API ka JWT authorizer token ka issuer aur audience jaanchta hai. WAF, signed cookies ya API keys user ki pehchaan nahi jaanchte.'
        }
      ]
    }
  ];

  const INTERVIEW = {
    title: 'Interview: tokens, plans, AI choices aur ek 401',
    instructions: 'Chaar faisle, phir terminal mein woh authorizer theek karo jo mobile users ko 401 deta hai.',
    questions: [
      {
        domain: 'secure', q: 'Interviewer: "ID token aur access token mein farak?"',
        choices: ['ID: user kaun hai (aud = client); access: scopes/permissions (client_id)', 'Dono bilkul same hain; bas naam alag hai, kaam ek hi hai', 'ID token AWS ka access key hai, aur access token user ka password', 'Access token sirf naye tokens lene ke liye hota hai, API ke liye nahi'],
        answer: 0,
        explain: 'ID token pehchaan ke claims deta hai; access token API ke scopes. Koi bhi AWS credentials ya password nahi, aur refresh ka kaam refresh token ka hai.'
      },
      {
        domain: 'secure', q: '"Cognito ke Lite aur Essentials plan mein kya farak padta hai?"',
        choices: ['Lite plan mein user login hi nahi hota, sirf sign-up', 'Koi farak nahi; dono ka kaam aur daam bilkul same hai', 'Managed login, passwordless waghera Essentials se shuru', 'Essentials mein sirf SAML login chalta hai, password nahi'],
        answer: 2,
        explain: 'Lite basic sign-in aur classic hosted UI deta hai; managed login aur naye features Essentials se. Lite mein login hota hai, aur Essentials mein sirf SAML nahi.'
      },
      {
        domain: 'high-performing', q: '"Bedrock vs SageMaker AI kab?"',
        choices: ['Bedrock hamesha sasta hai, isliye SageMaker kabhi mat chuno', 'SageMaker AI sirf images aur video ke models ke liye bana hai', 'Dono ek hi service ke naam hain; koi bhi chuno', 'Ready models par app: Bedrock; apna model train: SageMaker AI'],
        answer: 3,
        explain: 'Bedrock managed foundation models (aur Knowledge Bases, Guardrails) deta hai; SageMaker AI apne models ki training/deployment. Daam aur kaam use-case par depend karte hain.'
      },
      {
        domain: 'resilient', q: '"Moderation model ka confidence 70 aaya. Kya karoge?"',
        choices: ['Hamesha publish karo, kyunki 70 toh kam number hai', 'Apne data par tay band dekho: shayad human review', 'Hamesha block karo, kyunki 70 toh bada number hai', 'Model ko hi band kar do, woh bharose ka nahi'],
        answer: 1,
        explain: 'Threshold apne labelled data par naap kar tay hota hai. Beech wale confidence par insaan ka review sabse theek raasta hai; hamesha publish ya hamesha block dono galtiyaan badhate hain.'
      },
      {
        terminal: {
          title: '🖥️ Mobile users ka 401 theek karo',
          instructions: 'Sirf app ka fixture. Orders API ka JWT authorizer sirf web client ko jaanta hai. Wahi authorizer theek karo.',
          goal: '<p>HTTP API <code>' + API + '</code> ka authorizer <code>auth01</code> abhi audience mein sirf web client <code>' + WEB + '</code> rakhta hai. Mobile client <code>' + MOBILE + '</code> ko <b>jodo</b>, web ko rakho, issuer wahi rakho. Phir authorizer dobara padho. Authorizer hatana, issuer badalna ya sirf mobile rakhna nahi chalega.</p>',
          account: iseed(),
          tasks: itasks,
          solution: isolution,
          hints: ['aws apigatewayv2 get-authorizers --api-id ' + API + ' se Audience aur Issuer dekho.', 'update-authorizer --jwt-configuration Audience=<web>,<mobile>,Issuer=<same issuer>, phir get-authorizer.'],
          success: s => itasks.every(t => t.check(s)),
          successText: 'Dono clients ke tokens ab pass hote hain, issuer wahi. Asli AWS mein naye app client ke release checklist mein authorizer ki audience bhi daalo.'
        }
      }
    ]
  };

  AG.registerLevels('advanced', [{
    id: 'appai',
    icon: '🤖',
    title: 'App login (Cognito) aur AI services ka chunav',
    badge: 'Pehchaan Pandit',
    objectives: [
      'User pool (login, tokens) aur identity pool (AWS credentials) ka farak samajhna',
      'Mobile client, tokens aur API authorizer ko sahi set karna (aud, client_id, issuer)',
      'App users ko sirf apne S3 prefix tak upload dena',
      'Textract, Rekognition, Comprehend, Transcribe, Polly, Translate, Lex, Bedrock aur SageMaker AI mein se sahi chunna, aaj ki availability ke saath'
    ],
    hook: {
      when: 'ShopKaro course ki kahani (fictional)',
      title: 'App ko login, upload aur thodi AI chahiye',
      text: 'ShopKaro ka mobile app aa raha hai. Customers ko OTP/social login chahiye. Sellers invoice ki photo upload karte hain, jisse GSTIN nikaalna hai. Product photos ka moderation chahiye. Aur ek Hindi/English support bot. Ravi ne ek IAM access key app mein daalne ka socha hai.',
      mission: 'Login ke liye user pool, upload ke liye identity pool, API ke liye sahi authorizer, aur har AI kaam ke liye sahi service chuno. Course ke fixtures asli AWS nahi.'
    },
    steps: [
      {
        q: 'User pool aur identity pool mein farak?',
        analogy: 'Mall ka entry pass batata hai aap kaun ho (user pool). Locker room ki chaabi aapko thodi der ke liye ek locker kholne deti hai (identity pool).',
        body: '<p><b>User pool</b> app users ki directory hai: sign-up, sign-in, MFA, social/OIDC/SAML login, aur <b>JWT tokens</b>. <b>Identity pool</b> kisi login (user pool, Google, ya guest) ke badle <b>thodi der ke AWS credentials</b> deta hai, ek IAM role ke saath, taaki app seedha S3/DynamoDB use kar sake. Dono saath bhi chalte hain.</p>',
        points: ['App mein IAM access key kabhi mat daalo', 'Guest (unauthenticated) access tabhi jab sach mein chahiye', 'Employees ke liye IAM Identity Center; customers ke liye Cognito'],
        asli: 'Pehchaan user pool se, AWS access identity pool se. Dono ka kaam alag hai.'
      },
      {
        q: 'Tokens: ID, access aur refresh',
        analogy: 'ID card (kaun ho), entry wristband (kahan ja sakte ho), aur counter ki parchi (naya wristband lene ke liye).',
        body: '<p>Login par user pool teen tokens deta hai. <b>ID token</b> mein user ke claims (naam, email) aur <code>aud</code> = app client ID. <b>Access token</b> mein scopes aur <code>client_id</code>. <b>Refresh token</b> se naye tokens aate hain, dobara login ke bina. ID/access tokens JWT hain (header.payload.signature) jo user pool ki public keys (JWKS) se verify hote hain; default validity 1 ghanta.</p>',
        points: ['JWT ka payload base64 hai: padh sakte ho, isliye usme secret mat rakho', 'Verify karo: signature, issuer, expiry, audience/client_id, token_use', 'Refresh token ko surakshit jagah rakho (app ka secure storage)'],
        asli: 'Token padhna aasaan hai, par bharosa sirf verify karne ke baad.'
      },
      {
        q: 'App client aur plans kaise chunein?',
        analogy: 'Ghar ki chaabi sabko nahi dete; mehmaan ko intercom se andar bulate ho.',
        body: '<p>Mobile app aur browser app <b>public clients</b> hain: inme <b>client secret nahi</b> chhup sakta. Inke liye SRP ya managed login (Authorization code + PKCE). Server-side app <b>confidential client</b> ho sakti hai (secret ke saath). Cognito ke plans: <b>Lite</b> (basic sign-in, classic hosted UI), <b>Essentials</b> (default; managed login, passwordless, access-token customization), <b>Plus</b> (threat protection jaise leaked password aur risky sign-in).</p>',
        points: ['Lite aur Essentials mein 10,000 MAU tak free tier; Plus mein nahi (aaj ki pricing dekho)', 'Plain USER_PASSWORD_AUTH kam secure; SRP/PKCE behtar', 'Social login (Google/Apple) aur OIDC/SAML federation user pool se'],
        asli: 'Public client = bina secret. Naye features ke liye Essentials se shuru.'
      },
      {
        q: 'API ko tokens se kaise bachayein?',
        analogy: 'Darwaze ka guard sirf apni building ke pass maanta hai, aur pass par likha flat number bhi jaanchta hai.',
        body: '<p><b>HTTP API</b> mein <b>JWT authorizer</b>: issuer (user pool ka URL) aur <b>audience</b> list (app client IDs) jaanchta hai; ID token ka <code>aud</code> ya access token ka <code>client_id</code> list mein hona chahiye. <b>REST API</b> mein Cognito user pool authorizer. <b>ALB</b> khud bhi Cognito se login karwa sakta hai (authenticate-cognito action). Naya app client banaya toh audience list update karo, warna sahi users ko 401.</p>',
        points: ['401 aaye toh pehle token ke iss, aud/client_id aur exp dekho', 'Scopes chahiye toh access token bhejo', 'Har naye client ko authorizer mein jodna release checklist mein'],
        asli: 'Authorizer token ki pehchaan ke saath "kis app ke liye bana" bhi jaanchta hai.'
      },
      {
        q: 'Users ko apne data tak hi kaise rokein?',
        analogy: 'Hostel mein har bachche ki chaabi sirf uske apne kamre ka taala kholti hai.',
        body: '<p>Identity pool ka authenticated role policy variable <code>${cognito-identity.amazonaws.com:sub}</code> use kar sakta hai: S3 Resource <code>private/${cognito-identity.amazonaws.com:sub}/*</code>, ya DynamoDB mein sirf apni partition key. Doosra raasta: backend se <b>presigned URL</b> (sirf ek file, thodi der ke liye). Guest role ko kabhi likhne ki permission mat do.</p>',
        points: ['App ke code ki if-condition se bharosa mat karo; policy mein roko', 'Presigned URL: backend control rakhta hai; identity pool: app seedha jaati hai', 'Credentials 1 ghante tak; kho jaayein toh nuksaan chhota'],
        asli: 'Rok AWS policy mein ho, app ke code mein nahi.'
      },
      {
        q: 'AI services: kaunsa kaam kis service se?',
        analogy: 'Hospital mein har kaam ka alag specialist: aankh ka, kaan ka, dil ka.',
        body: '<p><b>Textract</b>: documents se text/forms/tables (invoice ke liye AnalyzeExpense). <b>Rekognition</b>: image/video mein labels, faces, moderation. <b>Comprehend</b>: text ka sentiment, entities, PII. <b>Transcribe</b>: awaaz se text. <b>Polly</b>: text se awaaz. <b>Translate</b>: bhasha badalna. <b>Lex</b>: chatbot (intents, slots). <b>Bedrock</b>: foundation models, Knowledge Bases, Guardrails. <b>SageMaker AI</b>: apne models train/deploy. <b>Personalize</b>: recommendations.</p>',
        points: ['Aaj ka haal: Kendra 30 Jul 2026 se naye customers ke liye band (Bedrock Knowledge Bases dekho)', 'Rekognition ke Streaming Video aur Bulk Image Analysis 30 Apr 2026 se naye customers ke liye band; baaki features (jaise ek image ka moderation) chalu', 'Comprehend ke topic modeling, event detection aur prompt safety classification naye customers ke liye band (Bedrock aur Guardrails dekho)'],
        asli: 'Pehle ready managed AI service dekho; exam purane naam bhi le sakta hai, par naye account mein availability check karo.'
      },
      {
        q: 'Managed AI, Bedrock ya SageMaker AI?',
        analogy: 'Readymade kapde, darzi se fit karwaye kapde, ya khud kapda bunna.',
        body: '<p><b>Managed AI services</b> (Textract, Rekognition...) ek kaam ke liye taiyaar API hain: sabse kam mehnat. <b>Bedrock</b> foundation models deta hai: prompts, Knowledge Bases (apne docs se jawaab), Agents, Guardrails; model train nahi karna. <b>SageMaker AI</b> mein apna data, apna algorithm, training aur deployment: sabse zyada control aur mehnat.</p>',
        points: ['Invoice se fields → Textract, LLM nahi', 'FAQ bot apne docs ke saath → Bedrock Knowledge Bases', 'Apna fraud model apne data par → SageMaker AI'],
        asli: 'Sabse seedha tool jo kaam kar de, wahi chuno; custom model aakhri raasta hai.'
      },
      {
        q: 'AI ke jawaab par kitna bharosa?',
        analogy: 'Naya cashier galti kar sakta hai; isliye bade bill par manager dekhta hai.',
        body: '<p>AI services <b>confidence</b> deti hain. Ek hi threshold dono taraf galti karta hai: zyada block ya zyada chhoot. Behtar: pakke cases apne aap, beech wale <b>human review</b>, baaki seedhe. Thresholds apne labelled data par naapo aur samay-samay par dobara jaancho. PII aur logon ke data ke niyam (jaise consent, retention) bhi socho.</p>',
        points: ['False positive (achha block) aur false negative (bura chhoot) dono gino', 'Human review queue ki size bhi ek limit hai', 'Bedrock Guardrails se harmful output rok sakte ho'],
        asli: 'AI ka jawaab ek signal hai, faisla nahi. Galti ki keemat dekh kar threshold tay karo.'
      }
    ],
    myth: [
      { myth: 'App mein ek IAM access key daal do, sab kaam chal jaayega.', sach: 'App ka code koi bhi nikaal sakta hai. Login ke liye user pool aur AWS access ke liye identity pool ke thodi der ke credentials use karo.' },
      { myth: 'Same user pool ka token hai, toh har API maan legi.', sach: 'Authorizer audience (aud/client_id) bhi jaanchta hai. Naya client audience list mein nahi toh 401.' },
      { myth: 'JWT encrypted hota hai, usme kuch bhi rakh sakte hain.', sach: 'JWT ka payload sirf base64 hai; koi bhi padh sakta hai. Signature sirf yeh batata hai ki badla nahi gaya.' },
      { myth: 'Enterprise search ke liye aaj bhi naya Kendra index banao.', sach: 'Kendra 30 Jul 2026 se naye customers ke liye band hai. Naye account mein Bedrock Knowledge Bases dekho; exam purana jawaab de sakta hai.' }
    ],
    playbook: {
      title: 'Pehchaan → access → API → AI',
      use: ['User pool (Essentials) + bina secret ka mobile client + SRP/PKCE', 'Identity pool + ${sub} prefix wala role, guest band', 'JWT authorizer: issuer + saare app clients audience mein'],
      avoid: ['App mein IAM keys ya client secret', 'Guest role ko write permission', 'Ek threshold wala moderation bina human review'],
      how: ['User pool, password policy, MFA aur plan chuno', 'App clients (public/confidential) aur flows set karo', 'Identity pool roles aur policy variables', 'API authorizer aur release checklist; AI service availability check'],
      redflags: ['Sahi users ko 401 (audience)', 'Kisi bhi user ki file koi bhi padh sake', 'Client secret mobile app mein', 'Naye account mein band hui AI service par plan'],
      rule: 'Pehchaan, AWS access aur API ka bharosa teen alag cheezein hain; har ek ko apni jagah jaancho.'
    },
    exam: [
      { cue: 'App users ka sign-up/sign-in', pick: 'Cognito user pools' },
      { cue: 'App users ko thodi der ke AWS credentials', pick: 'Cognito identity pools' },
      { cue: 'Documents/forms se text', pick: 'Amazon Textract' },
      { cue: 'Image moderation / labels', pick: 'Amazon Rekognition' },
      { cue: 'Text mein sentiment/PII', pick: 'Amazon Comprehend' },
      { cue: 'Speech-to-text / text-to-speech', pick: 'Transcribe / Polly' },
      { cue: 'Chatbot', pick: 'Amazon Lex' },
      { cue: 'Enterprise search', pick: 'Kendra (exam); naye account mein Bedrock Knowledge Bases' },
      { cue: 'Custom models / foundation-model apps', pick: 'SageMaker AI / Amazon Bedrock' }
    ],
    stages: STAGES,
    interview: INTERVIEW,
    success: [
      'User pool aur identity pool ka farak samjha kar app login aur upload access bana sakta hoon.',
      'Tokens (aud, client_id, issuer) padh kar API authorizer ka 401 theek kar sakta hoon.',
      'AI ki zaroorat ke hisaab se service chun sakta hoon, aaj ki availability aur human review ke saath.'
    ],
    homework: '<p>Optional, sirf approved asli-AWS sandbox mein; Cognito MAU, API Gateway, S3 aur AI APIs ka bill lag sakta hai. Ek user pool (Essentials) aur bina secret ka app client banao, managed login se ek test user login karo, aur ID token ko jwt.io jaise tool ke bina, sirf base64 se padho. Ek HTTP API par JWT authorizer lagao aur galat client ke token se 401 dekho. Identity pool se ${sub} prefix wali role policy test karo. Ek test image par Rekognition DetectModerationLabels chalao. Cleanup: user pool, identity pool, API, role aur S3 objects delete karo.</p>',
    cards: [
      { front: 'User pool vs identity pool?', back: 'User pool: login + JWT tokens. Identity pool: login ke badle thodi der ke AWS credentials (role ke saath).' },
      { front: 'ID vs access token?', back: 'ID: user claims, aud = client ID. Access: scopes, client_id. Refresh: naye tokens.' },
      { front: 'Mobile client secret?', back: 'Nahi. Public client mein secret chhup nahi sakta; SRP ya managed login + PKCE.' },
      { front: 'Sahi users ko 401?', back: 'Authorizer ki audience mein naya client ID nahi, ya issuer/expiry galat. Token ke claims dekho.' },
      { front: 'Apne folder tak rokna?', back: 'Role policy mein ${cognito-identity.amazonaws.com:sub} prefix, ya backend presigned URL.' },
      { front: 'Cognito plans?', back: 'Lite (basic), Essentials (default; managed login, passwordless), Plus (threat protection).' },
      { front: 'Kendra aaj?', back: '30 Jul 2026 se naye customers ke liye band. Bedrock Knowledge Bases dekho.' },
      { front: 'Bedrock vs SageMaker AI?', back: 'Bedrock: ready foundation models, KB, Guardrails. SageMaker AI: apne models train/deploy.' }
    ]
  }]);

  AG.appaiFixtures = { seed, iseed, tasks, itasks, solution, isolution, FILES, POOL, CLIENT, IPOOL, ROLE_AUTH, ROLE_GUEST, API, WEB, MOBILE, ISS, mobileIdToken, webIdToken, UNSAFE, SAFE };
})();
