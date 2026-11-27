/* 📟 On-call shift 'invoices' — s3 level (S3: kaun dekhe, aur galti kaise wapas lo). Engine: oncall.js. Terminal: awscli.js.
   28 Nov, 22:00. Level ke triage wali kahani aage: Priya ne INV-10231 ke link mein number badla aur kisi aur ka invoice khul gaya.
   Teen JUDE alerts:
     1 InvoicesAnonymousRead  bucket policy "Principal": "*" + purane 2025 invoices par object ACL public-read.
                              Sirf policy hatane se ACL wala raasta khula rehta hai → Block Public Access (RestrictPublicBuckets
                              policy wala, IgnorePublicAcls ACL wala raasta band karta hai)
     2 InvoiceDownload404     alert aate hi Ravi ghabra kar leak hue 2 invoices "delete" kar deta hai (versioning ON → sirf
                              delete marker) → marker ki version-id se marker hatao, file wapas
     3 GstExportFailed        Ravi ne ek purana invoice version-id ke saath delete kiya = hamesha ke liye. Replication ne
                              copy rakhi thi: version-id wala delete replica tak nahi jaata, aur is rule mein delete-marker
                              replication band hai → backup se usi key ki copy
   Model (reconcile, har minute): anonymous reads = scrapers (policy khuli ~110/min, ACL khule ~14/min); 404 = jin 2 invoices
   ka latest delete marker hai unke customers (6/min har ek); GST export har minute retry, file na mile toh fail.
   curl (bina login) aur get-object-acl shift ke responses hain, asli S3 shape mein. */
(function () {
  const R = 'ap-south-1', A = '123456789012', BUCKET = 'shopkaro-invoices', BACKUP = 'shopkaro-invoices-backup';
  const T0 = Date.parse('2026-11-28T16:30:00Z');                     // 22:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const stamp = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  const OWNER = '7c1e3f5a9b2d4c6e8f0a1b3c5d7e9f2a4b6c8d0e1f3a5b7c9d2e4f6a8b0c1d3e';
  const K = n => `invoices/${n < 10000 ? '2025/03' : '2026/11'}/INV-${String(n).padStart(5, '0')}.pdf`;
  const HOT = [K(10231), K(10232)], OLD = K(8817);
  const VID = { 10230: 'kT9xQm2LrV7bWc4NdF6hJp1YsA8eZu3G', 10231: 'Rb3uX8vNq6LmT1cHs9WdK4yPz7eFa2Jg', 10232: 'Wn5cJ2rTk8YbQx1Ma7LvH3sDf9GpU6Ze',
    10233: 'Hq7mZ4wPd1KsVn8Xc3RbT6yLa9FuJ2Eg', 8817: 'Cx2vN9qLs5WmY8bTr1HkJ4dPf7ZaG3Ue', 8818: 'Pf6aK3zXm9RtQ2wLc8VbN5sHd1YgJ7Eu' };
  const SIZE = { 10230: 48212, 10231: 48650, 10232: 51377, 10233: 47904, 8817: 39561, 8818: 40218 };
  const MARK = { [HOT[0]]: 'Zs1dF7kQx4NvP9mLb2TcW6rHy3JaG8Ue', [HOT[1]]: 'Lm8bR2xKt5WqZ1nVc7PdJ3sGh9YaF4Eu' };
  const ACL_PUBLIC = [VID[8817], VID[8818]];                           // purane app ne public-read ACL se upload kiye
  const bucket = (a, n) => a.buckets.find(b => b.name === n);
  const current = (b, key) => { const vs = (b.versions || {})[key]; return Array.isArray(vs) && vs[0] && !vs[0].deleteMarker ? vs[0] : null; };
  const policyPublic = b => ((b.policy || {}).Statement || []).some(s => s.Effect === 'Allow'
    && (s.Principal === '*' || (s.Principal || {}).AWS === '*') && [].concat(s.Action).some(x => ['s3:GetObject', 's3:*', '*'].includes(x)));
  // RestrictPublicBuckets: public policy wali bucket tak sirf account ke log aur AWS services — ACL wala raasta bhi band
  const restricted = b => !!(b.bpa || {}).RestrictPublicBuckets && policyPublic(b);
  const policyOpen = b => policyPublic(b) && !restricted(b);
  const aclOpen = (b, key) => { const v = current(b, key); return !!v && !(b.bpa || {}).IgnorePublicAcls && !restricted(b) && ACL_PUBLIC.includes(v.versionId); };
  const readable = (b, key) => !!current(b, key) && (policyOpen(b) || aclOpen(b, key));
  const anyAcl = b => Object.keys(b.versions || {}).some(k => aclOpen(b, k));

  function metrics(a, replace) {
    const b = bucket(a, BUCKET), t = a.inv.tick;
    const v = { anon: (policyOpen(b) ? 108 + (t * 29) % 23 : 0) + (anyAcl(b) ? 14 : 0),
      nf: HOT.filter(k => !current(b, k)).length * 6, gst: a.inv.panic && !current(b, OLD) ? 1 : 0 };
    a.capacityMetrics.forEach(s => {
      const p = AG.oncall.point(a.now, v[s.key]);
      if (replace && s.points.length) s.points[s.points.length - 1] = p;
      else { s.points.push(p); if (s.points.length > 40) s.points.shift(); }
    });
  }
  function reconcile(a, sim, clock) { a.now = iso(T0 + clock * 60000); a.inv.tick = clock; metrics(a, false); }

  // INC 2 aate hi: Ravi ki ghabraahat (Slack: "leak hue invoices maine delete kar diye")
  function panic(a) {
    const b = bucket(a, BUCKET), ms = Date.parse(a.now) - 25000;
    HOT.forEach((k, i) => b.versions[k].unshift({ versionId: MARK[k], deleteMarker: true, lastModified: stamp(ms + i * 4000) }));
    delete b.versions[OLD];                                            // version-id ke saath delete: is key ka akela version gaya
    a.inv.panic = true;
    metrics(a, true);
  }

  // bina login (anonymous) HTTP request — asli S3 ke headers
  function curl(sim, m) {
    const a = sim.account, flags = m[1] || '', url = m[2], head = /I/.test(flags), inc = /i/.test(flags) || head;
    const u = url.match(/^https:\/\/([a-z0-9.-]+?)\.s3(?:\.ap-south-1)?\.amazonaws\.com\/(.+)$/);
    if (!u) return `curl: (6) Could not resolve host: ${url.replace(/^https?:\/\//, '').split('/')[0]}`;
    const b = bucket(a, u[1]), key = decodeURIComponent(u[2]), n = ++a.inv.rq, hx = x => (x >>> 0).toString(16).toUpperCase().padStart(8, '0'), id = hx(n * 2654435761) + hx(n * 40503 + 12345);
    const date = new Date(a.now).toUTCString(), hid = 'Kq3V8nR2xT5wZ1mL7cP4dJ9sGh6YaF0bN8eQ2rW5tX1uZ7vC3mB9kD4fH6jL2pS0aE=';
    const ok = b && b.name === BUCKET && readable(b, key), v = ok && current(b, key);
    const hdr = ok ? ['HTTP/1.1 200 OK', `x-amz-id-2: ${hid}`, `x-amz-request-id: ${id}`, `Date: ${date}`, `Last-Modified: ${new Date(v.lastModified.replace(' ', 'T') + 'Z').toUTCString()}`,
      `ETag: "${(v.versionId.charCodeAt(0) * 99991).toString(16).padEnd(32, '7c2e9a41')}"`, 'x-amz-server-side-encryption: AES256', `x-amz-version-id: ${v.versionId}`,
      'Accept-Ranges: bytes', 'Content-Type: application/pdf', `Content-Length: ${v.size}`, 'Server: AmazonS3']
      : ['HTTP/1.1 403 Forbidden', `x-amz-request-id: ${id}`, `x-amz-id-2: ${hid}`, 'Content-Type: application/xml', 'Transfer-Encoding: chunked', `Date: ${date}`, 'Server: AmazonS3'];
    const body = ok ? `%PDF-1.7 … (${v.size} bytes: ShopKaro tax invoice ${key.split('/').pop().replace('.pdf', '')} — naam, pata, order)`
      : `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>AccessDenied</Code><Message>Access Denied</Message><RequestId>${id}</RequestId><HostId>${hid}</HostId></Error>`;
    return head ? hdr.join('\n') : inc ? hdr.join('\n') + '\n\n' + body : body;
  }
  const objectAcl = { re: /^aws s3api get-object-acl\b(.*)$/, err: false, out(sim, m) {
    const bn = (m[1].match(/--bucket\s+(\S+)/) || [])[1], key = (m[1].match(/--key\s+(\S+)/) || [])[1], vid = (m[1].match(/--version-id\s+(\S+)/) || [])[1], b = bn && bucket(sim.account, bn);
    const all = b && key && Array.isArray((b.versions || {})[key]) ? b.versions[key] : [], v = vid ? all.find(x => x.versionId === vid && !x.deleteMarker) : b && key && current(b, key);
    this.err = !v;
    if (vid && b && key && !v) return `An error occurred (NoSuchVersion) when calling the GetObjectAcl operation: The specified version does not exist.`;
    if (!bn || !key) return 'aws: error: the following arguments are required: --bucket, --key';
    if (!b) return 'An error occurred (NoSuchBucket) when calling the GetObjectAcl operation: The specified bucket does not exist';
    if (!v) return 'An error occurred (NoSuchKey) when calling the GetObjectAcl operation: The specified key does not exist.';
    const grants = [{ Grantee: { ID: OWNER, Type: 'CanonicalUser' }, Permission: 'FULL_CONTROL' }];
    if (ACL_PUBLIC.includes(v.versionId)) grants.push({ Grantee: { Type: 'Group', URI: 'http://acs.amazonaws.com/groups/global/AllUsers' }, Permission: 'READ' });
    return JSON.stringify({ Owner: { ID: OWNER }, Grants: grants }, null, 4);
  } };

  const RUNBOOK = `# ShopKaro on-call — invoices raat (28 Nov, 22:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Alarms:  aws cloudwatch describe-alarms --state-value ALARM
         (invoices-anonymous-reads · invoice-download-404 · gst-export-failed)
Bucket:  aws s3api get-bucket-policy --bucket ${BUCKET}
         aws s3api get-public-access-block --bucket ${BUCKET}
         aws s3api get-object-acl --bucket ${BUCKET} --key <key>
         aws s3api list-object-versions --bucket ${BUCKET} --prefix invoices/2026/
         aws s3api head-object --bucket ${BUCKET} --key <key>
         aws s3api get-bucket-replication --bucket ${BUCKET}
Bahar se (bina login): curl -I https://${BUCKET}.s3.ap-south-1.amazonaws.com/<key>
Keys:    ${K(10231)} (2026, naya app) · ${K(8818)} (2025, purana app)

Jaankari:
- App customers ko 15 minute ka presigned URL deta hai. Bucket ko public hone ki zaroorat NAHI.
- 2025 tak purana app invoices "public-read" object ACL ke saath upload karta tha.
- Versioning ON. Replication: har invoice ${BACKUP} mein bhi copy hota hai (same version-id).
- Kabhi nahi: bucket delete, versioning Suspended, asli data wale version ka version-id delete.
`;

  AG.oncall.add({
    id: 'invoices', start: 22 * 60,
    INC: [
      { id: 'InvoicesAnonymousRead', sev: '🔴 SEV1', text: `Customer ka email: "Link se lambe signing parameters hata diye, number 10231 se 10232 kiya — bina login kisi aur ka invoice khul gaya." ${BUCKET} par anonymous reads ~120/min.`,
        fixed: a => { const b = bucket(a, BUCKET); return !policyOpen(b) && !anyAcl(b); },
        verify: /^curl\b|^aws cloudwatch describe-alarms\b/, verifyText: 'bina login curl ya alarms dobara dekho',
        hints: [`cat runbook.md, phir aws s3api get-bucket-policy --bucket ${BUCKET} aur aws s3api get-public-access-block --bucket ${BUCKET}. Phir curl -I se bina login ek 2026 aur ek 2025 invoice kholo.`,
          'Do raaste khule hain: bucket policy mein "Principal": "*", aur purane 2025 invoices par object ACL public-read (get-object-acl dekho). Sirf policy hatana kaafi nahi. Block Public Access ke chaaron switch ON karo: RestrictPublicBuckets policy wala raasta band karta hai, IgnorePublicAcls ACL wala.',
          `aws s3api delete-bucket-policy --bucket ${BUCKET}, phir aws s3api put-public-access-block --bucket ${BUCKET} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true, phir curl -I https://${BUCKET}.s3.ap-south-1.amazonaws.com/${K(8818)}`] },
      { id: 'InvoiceDownload404', sev: '🟠 SEV2', text: 'Ravi ne Slack par likha: "leak hue invoices maine delete kar diye." Ab INV-10231 aur INV-10232 ke customers ko download par 404.',
        onFire: panic,
        fixed: a => HOT.every(k => (current(bucket(a, BUCKET), k) || {}).versionId === VID[k.match(/INV-0*(\d+)/)[1]]),
        verify: /^aws s3api (head-object|list-object-versions)\b|^aws cloudwatch describe-alarms\b/, verifyText: 'head-object, list-object-versions ya alarms dobara dekho',
        hints: [`aws s3api list-object-versions --bucket ${BUCKET} --prefix invoices/2026/ — DeleteMarkers mein IsLatest: true kiska hai?`,
          'Versioning ON hai: bina version-id ka delete sirf delete marker lagata hai, file neeche bachi hai. Marker ko USKI VersionId se delete karo — file phir current ho jaati hai. Asli data wale version ko mat chhuo.',
          `aws s3api delete-object --bucket ${BUCKET} --key ${HOT[0]} --version-id ${MARK[HOT[0]]}, wahi ${HOT[1]} ke liye --version-id ${MARK[HOT[1]]}, phir aws s3api head-object --bucket ${BUCKET} --key ${HOT[1]}`] },
      { id: 'GstExportFailed', sev: '🟠 SEV2', text: `Raat ka GST export job har minute fail: NoSuchKey ${OLD}. Finance ko yeh invoice kal subah audit mein chahiye.`,
        fixed: a => (current(bucket(a, BUCKET), OLD) || {}).size === SIZE[8817],
        verify: /^aws s3api head-object\b|^aws cloudwatch describe-alarms\b/, verifyText: 'head-object ya alarms dobara dekho',
        hints: [`aws s3api list-object-versions --bucket ${BUCKET} --prefix invoices/2025/ — INV-08817 ka koi version ya delete marker bacha hai?`,
          'Ravi ne yeh file version-id ke saath delete ki — woh delete hamesha ke liye hai, versioning bhi nahi bachata. Par replication chalu thi, aur version-id wala delete replica tak nahi jaata. get-bucket-replication se backup bucket dekho aur wahan se USI key ki copy wapas lao (doosre invoice ki nahi).',
          `aws s3 cp s3://${BACKUP}/${OLD} s3://${BUCKET}/${OLD}, phir aws s3api head-object --bucket ${BUCKET} --key ${OLD}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const series = (key, namespace, metric, dims) => ({ key, seriesId: 'invoices-' + key, version: 1, period: 60, namespace, metric, unit: 'Count', dimensions: dims, points: [] });
      const alarm = (name, key, ns, metric, dims) => ({ name, alarmId: 'invoices-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: dims, Statistic: 'Sum', Threshold: 0, ComparisonOperator: 'GreaterThanThreshold',
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const appDims = [{ Name: 'Service', Value: 'invoices' }], finDims = [{ Name: 'Job', Value: 'gst-export' }];
      const versions = () => Object.fromEntries(Object.keys(VID).map(Number).map(n => [K(n), [{ versionId: VID[n], deleteMarker: false, size: SIZE[n],
        lastModified: n < 10000 ? `2025-03-${String(n - 8800).padStart(2, '0')} 11:42:07` : `2026-11-${String(n - 10206).padStart(2, '0')} 13:0${n % 10}:31`,
        serverSideEncryption: 'AES256' }]]));
      const off = { BlockPublicAcls: false, IgnorePublicAcls: false, BlockPublicPolicy: false, RestrictPublicBuckets: false };
      const on = { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true };
      const account = {
        region: R, now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        buckets: [
          { name: BUCKET, region: R, versioning: true, versions: versions(), bpa: off, public: true,
            policy: { Version: '2012-10-17', Statement: [{ Sid: 'TempPublicInvoiceLinks', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${BUCKET}/invoices/*` }] },
            replication: { Role: `arn:aws:iam::${A}:role/s3-invoices-replication`, Rules: [{ ID: 'invoices-to-backup', Priority: 1, Status: 'Enabled', Filter: { Prefix: 'invoices/' },
              DeleteMarkerReplication: { Status: 'Disabled' }, Destination: { Bucket: `arn:aws:s3:::${BACKUP}`, StorageClass: 'STANDARD_IA' } }] } },
          { name: BACKUP, region: R, versioning: true, versions: versions(), bpa: on, public: false },
        ],
        capacityMetrics: [series('anon', 'CloudTrailMetrics', 'AnonymousInvoiceReads', []), series('nf', 'ShopKaro/Invoices', 'DownloadNotFound', appDims),
          series('gst', 'ShopKaro/Finance', 'GstExportFailures', finDims)],
        alarms: [alarm('invoices-anonymous-reads', 'anon', 'CloudTrailMetrics', 'AnonymousInvoiceReads', []),
          alarm('invoice-download-404', 'nf', 'ShopKaro/Invoices', 'DownloadNotFound', appDims),
          alarm('gst-export-failed', 'gst', 'ShopKaro/Finance', 'GstExportFailures', finDims)],
        inv: { tick: 0, panic: false, rq: 0 },
      };
      const DATA = Object.values(VID).join('|');
      const responses = [
        risky(/^aws s3api delete-bucket(?:\s|$)|^aws s3 rb\b/, 'invoices ki bucket delete karna — exposure ke saath saare invoices bhi jaate.'),
        risky(/^aws s3 rm\b/, 'invoices delete karna — exposure nahi rukta, customer ka invoice gayab hota hai (yahi Ravi ki galti thi).'),
        risky(new RegExp(`^aws s3api delete-object\\b(?=.*--version-id\\s+(${DATA})\\b)`), 'asli data wale version ko version-id se delete karna — woh hamesha ke liye jaata hai.'),
        risky(/^aws s3api delete-object\b(?!.*--version-id)/, 'bina version-id ka delete — ek aur delete marker lagta hai, invoice aur chhup jaata hai.'),
        risky(/^aws s3api put-bucket-versioning\b(?=.*Suspended)/, 'versioning suspend karna — aage ke uploads null version par overwrite ho sakte hain (pehle ke numbered versions bache rehte hain). Incident ke beech mat chhedo.'),
        { re: /^curl((?:\s+-[a-zA-Z]+)*)\s+(\S+)\s*$/, out: curl },
        objectAcl,
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms · aws s3api get-bucket-policy / get-public-access-block / get-object-acl / list-object-versions / head-object / get-bucket-replication · curl -I <url> (bina login). Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      const url = k => `https://${BUCKET}.s3.ap-south-1.amazonaws.com/${k}`;
      return {
        account, files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK } }, responses,
        placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'Raat 22:00, ShopKaro ke invoices ki bucket. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b>. Har alert pichhle fix ke baad aata hai. Runbook todne wale commands simulator rok dega.',
        successText: 'Bucket private: <b>Block Public Access</b> ne policy aur purane ACL, dono raaste band kiye. Delete marker hata kar 2 invoices wapas aaye, aur version-id se mita invoice <b>replica</b> se aaya. Kal ka kaam: humans ke liye <code>s3:DeleteObjectVersion</code> par Deny, aur account-level Block Public Access.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', `aws s3api get-bucket-policy --bucket ${BUCKET}`,
          `aws s3api get-public-access-block --bucket ${BUCKET}`, `curl -I ${url(K(10232))}`, `aws s3api delete-bucket-policy --bucket ${BUCKET}`,
          `curl -I ${url(K(8818))}`, `aws s3api get-object-acl --bucket ${BUCKET} --key ${K(8818)}`,
          `aws s3api put-public-access-block --bucket ${BUCKET} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`,
          `curl -I ${url(K(8818))}`,
          `aws s3api list-object-versions --bucket ${BUCKET} --prefix invoices/2026/`,
          `aws s3api delete-object --bucket ${BUCKET} --key ${HOT[0]} --version-id ${MARK[HOT[0]]}`,
          `aws s3api delete-object --bucket ${BUCKET} --key ${HOT[1]} --version-id ${MARK[HOT[1]]}`,
          `aws s3api head-object --bucket ${BUCKET} --key ${HOT[1]}`,
          `aws s3api list-object-versions --bucket ${BUCKET} --prefix invoices/2025/`, `aws s3api get-bucket-replication --bucket ${BUCKET}`,
          `aws s3 cp s3://${BACKUP}/${OLD} s3://${BUCKET}/${OLD}`, `aws s3api head-object --bucket ${BUCKET} --key ${OLD}`],
      };
    },
  });

  AG.addLab('s3', {
    type: 'oncall', id: 'oncall-invoices', shift: 'invoices', title: '📟 On-call: invoices bahar aa gaye',
    intro: 'Raat 22:00. Customer ne kisi aur ka invoice dekh liya. <b>Dekho → band karo → pakka karo</b>, aur ghabraahat mein hue delete wapas lao. Har command = 1 minute.',
  });
})();
