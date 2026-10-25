/* =====================================================================
   AWS Gurukul — aws CLI + Terraform Simulator (terminal missions)

   Mission stage shape (data files mein):
   {
     type: 'terminal', title, instructions,
     goal: 'HTML — kya karna hai',
     account: {
       callerIdentity: { Account, UserId, Arn },
       region: 'us-east-1',
       users: [{ name, groups, mfa, policies, attachedPolicies, lastActive }],
       roles: [{ name, path, trustPolicy, maxSession, lastUsed }],
       groups: [{ name, users, policies }],
       policies: [{ name, arn, type, attached, document }],
       buckets: [{ name, region, encryption, public, objects: [{key,size,lastModified}] }],
       vpcs: [{ id, cidr, region, name, default, igw }],
       subnets: [{ id, vpcId, cidr, az, name, public, routeTable }],
       securityGroups: [{ id, vpcId, name, ingress: [], egress: [] }],
       instances: [{ id, name, type, state, az, vpcId, subnetId, sgIds, publicIp, privateIp }],
       volumes: [{ id, size, type, state, attachedTo }],
       rds: [{ id, name, engine, class, state, multiAZ, endpoint, storage }],
       lambdas: [{ name, runtime, handler, lastModified, state, memory, timeout }],
       tables: [{ name, partitionKey, sortKey, rcu, wcu, items: [] }],
       hostedZones: [{ id, name, records: [{name,type,value}] }],
       stacks: [{ id, name, status, events: [] }],
       alarms: [{ name, metric, namespace, state, threshold }],
       kmsKeys: [{ id, alias, state }],
       logGroups: [{ name, retention, events: [], subscriptionFilters: [{name, pattern, destinationArn}], metricFilters: [] }],
       cloudfront: [{ id, domain, origins, status, enabled }],
       elbs: [{ id, name, type, scheme, dns, targetGroups: [], listeners: [] }],
       asgs: [{ name, min, max, desired, instances, vpcZone, lb }],
       repositories: [{ name, registryId, uri, imageCount, createdAt, images: [{imageTag, imageDigest, imageSizeInBytes, imagePushedAt}] }],
       queues: [{ name, url, arn, messages: [{messageId, body, receiptHandle}], isFifo, visibilityTimeout }],
       topics: [{ name, arn, subscriptions: [{subscriptionArn, protocol, endpoint, confirmed}] }],
       routeTables: [{ id, vpcId, main?, routes: [{destination, target, type, state?}], associations: [{id, subnetId?, main?}] }],
       natGateways: [{ id, subnetId, state, publicIp }],
       internetGateways: [{ id, vpcId }],
       healthChecks: [{ id, type, fqdn, status }],
       fileSystems: [{ id, name, state, performanceMode, throughputMode, encrypted, sizeBytes }],
       mountTargets: [{ id, fileSystemId, subnetId, az, state, ip }],
       organization: { id, managementAccountId, email, featureSet },
       orgAccounts: [{ id, name, email, status, ou }],
       orgUnits: [{ id, name }],
       scps: [{ id, name, awsManaged, targets: [], document }],
       eventRules: [{ name, bus, state, pattern, schedule, targets: [] }],
       stateMachines: [{ name, type, states: [], failAt, definition }],
       executions: [{ name, stateMachine, status, failedState, input }],
       kinesisStreams: [{ name, shards, status, mode, retentionHours }],
       deliveryStreams: [{ name, status, source, destination, domain, backupS3, backupAll, bufferMB, bufferSec }],
       opensearchDomains: [{ name, version, instanceType, instanceCount, multiAZ, dedicatedMaster, volumeGB, encrypted, status }],
       pipes: [{ name, state, source, enrichment, target, filter, targetParams }],
     },
     files: { 'fix.tf': { desc, apply(sim) -> 'message' } },   // terraform apply ke liye
     responses: [ { re: /regex/, out: 'text' | fn(sim, m), mutate?: fn(sim, m) } ],
     tasks: [ { text, check(sim) -> bool } ],                    // checklist (optional)
     success: fn(sim) -> bool,  successText: 'HTML',
     hints: ['pehla hint', 'doosra hint', ...],
   }
   ===================================================================== */

/* DynamoDB ke reserved words (poori list 570+ hai — yahan woh jo log sach mein attribute naam rakhte hain) */
const DDB_RESERVED = ['STATUS', 'NAME', 'DATE', 'USER', 'TIMESTAMP', 'DATA', 'COUNT', 'SIZE', 'VALUE', 'KEY', 'TYPE',
  'ORDER', 'YEAR', 'TIME', 'ZONE', 'COMMENT', 'GROUP', 'LEVEL', 'LIMIT', 'NUMBER', 'PATH', 'ROLE', 'SESSION', 'STATE', 'TTL', 'URL',
  'ITEMS', 'TOTAL', 'SOURCE', 'REGION', 'TOKEN', 'TEXT', 'USERS', 'HASH', 'RANGE'];

AG.renderers.terminal = function renderTerminal(stage, arena, onDone) {
  // deep-clone the account so replays start fresh
  const sim = {
    account: JSON.parse(JSON.stringify(stage.account || {})),
    history: [],       // executed commands (normalized)
    hintsUsed: 0,
    done: false,
    stage,
  };
  // non-serializable bits (functions) survive via reference to the stage
  sim.files = stage.files || {};
  sim.responses = stage.responses || [];

  /* ---------- UI ---------- */
  const goalBox = AG.el('div', 'term-goal');
  goalBox.innerHTML = `<h4>🎯 Mission</h4><div>${stage.goal}</div>`;
  const taskList = AG.el('ul', 'term-tasks');
  (stage.tasks || []).forEach(t => taskList.appendChild(AG.el('li', '', t.text)));
  if (stage.tasks) goalBox.appendChild(taskList);

  const term = AG.el('div', 'terminal');
  term.innerHTML = `
    <div class="term-bar">
      <span class="dot" style="background:#f87171"></span>
      <span class="dot" style="background:#ffb347"></span>
      <span class="dot" style="background:#34d399"></span>
      <span>&nbsp;shishya@awsgurukul — aws cli</span>
    </div>
    <div class="term-out"></div>
    <div class="term-in"><span class="ps1">$</span><input type="text" autocomplete="off"
      spellcheck="false" placeholder="aws s3 ls   (madad ke liye: help)"></div>`;
  const out = term.querySelector('.term-out');
  const input = term.querySelector('input');

  const btns = AG.el('div', 'term-btns');
  const hintBtn = AG.el('button', 'btn small ghost', `💡 Hint (−${AG.HINT_COST} XP)`);
  hintBtn.onclick = () => giveHint();
  btns.appendChild(hintBtn);

  arena.append(goalBox, term, btns);
  print('sys', `Mock AWS account ready. Commands type karo — 'help' se list milegi.`);
  setTimeout(() => input.focus(), 100);

  const cmdHistory = [];
  let histIdx = -1;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const raw = input.value.trim();
      input.value = '';
      if (raw) { cmdHistory.push(raw); histIdx = cmdHistory.length; run(raw); }
    } else if (e.key === 'ArrowUp') {
      if (histIdx > 0) { histIdx--; input.value = cmdHistory[histIdx] || ''; }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (histIdx < cmdHistory.length) { histIdx++; input.value = cmdHistory[histIdx] || ''; }
      e.preventDefault();
    }
  });

  function print(kind, text) {
    const div = AG.el('div', 't-' + kind);
    div.textContent = text;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  }
  function giveHint() {
    const hints = stage.hints || [];
    if (sim.hintsUsed >= hints.length) { print('hint', '💡 Aur hints nahi hain — tum kar sakte ho!'); return; }
    print('hint', `💡 Hint ${sim.hintsUsed + 1}: ${hints[sim.hintsUsed]}`);
    sim.hintsUsed++;
  }

  /* ---------- resource lookup ----------
     list() auto-vivifies: agar mission ke account mein `queues: []` likhna
     bhool gaye, tab bhi create-* commands ka result persist ho (warna push
     ek throwaway array par jaata tha aur resource gayab ho jaata tha). */
  function list(kind) {
    if (!sim.account[kind]) sim.account[kind] = [];
    return sim.account[kind];
  }
  function find(kind, name) {
    if (!name) return null;
    const items = list(kind);
    const hit = items.find(r => r.name === name || r.id === name);
    if (hit) return hit;
    // learning-friendly: naam ka prefix bhi chalega (pehla match) — par batao
    // ki kaunsa resource pakda, warna "orders" likh ke "orders-dlq" par kaam ho jaata
    const pre = items.find(r => (r.name || r.id || '').startsWith(name));
    if (pre) print('sys', `(note: '${name}' naam ka resource nahi mila — prefix se '${pre.name || pre.id}' liya. Asli AWS poora naam maangta hai.)`);
    return pre || null;
  }

  // Route-table associations are independent of MapPublicIpOnLaunch.
  // Old fixtures may store subnet.routeTable; preserve that schema during migration.
  function networkTables() {
    const tables = list('routeTables');
    for (const rt of tables) {
      if (!Array.isArray(rt.routes)) rt.routes = [];
      if (!Array.isArray(rt.associations)) rt.associations = [];
      if (rt.main && !rt.associations.some(a => a.main)) {
        rt.associations.push({ id: nextAssociationId(), main: true });
      }
    }
    for (const subnet of list('subnets')) {
      if (!subnet.routeTable || tables.some(rt => rt.associations.some(a => a.subnetId === subnet.id))) continue;
      const rt = tables.find(t => t.id === subnet.routeTable && t.vpcId === subnet.vpcId);
      if (rt) rt.associations.push({ id: nextAssociationId(), subnetId: subnet.id, main: false });
    }
    return tables;
  }
  function nextAssociationId() {
    let id;
    do { id = 'rtbassoc-' + String(sim.routeAssociationSeq = (sim.routeAssociationSeq || 0) + 1).padStart(9, '0'); }
    while (list('routeTables').some(rt => (rt.associations || []).some(a => a.id === id)));
    return id;
  }
  function ipv4Cidr(value) {
    const m = typeof value === 'string' && value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
    if (!m || m.slice(1, 5).some(n => Number(n) > 255) || Number(m[5]) > 32) return null;
    const ip = m.slice(1, 5).reduce((n, octet) => n * 256 + Number(octet), 0);
    const size = 2 ** (32 - Number(m[5]));
    const network = Math.floor(ip / size) * size;
    return [24, 16, 8, 0].map(shift => Math.floor(network / 2 ** shift) % 256).join('.') + '/' + Number(m[5]);
  }

  /* ---------- shell jaisa tokenizer ----------
     Pehle command sirf space par toot-ti thi: --filter-pattern "ERROR" ka value
     quote ke saath "ERROR" ban jaata tha aur kuch match nahi hota tha, aur
     --message "hello world" aadha kat jaata tha. Ab "..." aur '...' ek token hain,
     aur --flag=value bhi --flag value jaisa hi samjha jaata hai. */
  function tokenize(line) {
    const toks = [];
    let cur = '', quote = null, started = false;
    for (const ch of line) {
      if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
      if (ch === ' ' || ch === '\t') { if (started) toks.push(cur); cur = ''; started = false; continue; }
      cur += ch; started = true;
    }
    if (quote) return { error: `quote band nahi hua — ${quote} khola par band nahi kiya. Poora value ${quote}...${quote} ke andar likho.` };
    if (started) toks.push(cur);
    const out = [];
    toks.forEach(t => {
      const m = t.match(/^(--[a-z0-9-]+)=(.*)$/i);
      if (m) out.push(m[1], m[2]); else out.push(t);
    });
    return { toks: out };
  }
  /* string ko JSON ke andar safe tarike se likho (quotes/backslash escape) */
  const J = v => JSON.stringify(String(v == null ? '' : v));
  /* DynamoDB ka asli wire format: { "user_id": { "S": "42" } } */
  function ddbTyped(item) {
    const o = {};
    Object.entries(item || {}).forEach(([k, v]) => {
      o[k] = typeof v === 'number' ? { N: String(v) } : typeof v === 'boolean' ? { BOOL: v } : { S: String(v) };
    });
    return o;
  }
  function ddbPlain(typed) {
    const o = {};
    Object.entries(typed || {}).forEach(([k, v]) => {
      if (v && typeof v === 'object') {
        if ('S' in v) o[k] = v.S; else if ('N' in v) o[k] = Number(v.N); else if ('BOOL' in v) o[k] = v.BOOL;
        else o[k] = JSON.stringify(v);
      } else o[k] = v;
    });
    return o;
  }

  /* ---------- mini IAM policy evaluator (simulate-principal-policy) ----------
     AWS jaisa order: (1) default deny, (2) koi Allow match → allowed,
     (3) koi bhi explicit Deny match → explicitDeny (Allow ko bhi kaat deta hai). */
  const MANAGED_DOCS = {
    AdministratorAccess: { Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] },
    AmazonS3FullAccess: { Statement: [{ Effect: 'Allow', Action: 's3:*', Resource: '*' }] },
    AmazonS3ReadOnlyAccess: { Statement: [{ Effect: 'Allow', Action: ['s3:Get*', 's3:List*'], Resource: '*' }] },
    ReadOnlyAccess: { Statement: [{ Effect: 'Allow', Action: ['*:Get*', '*:List*', '*:Describe*'], Resource: '*' }] },
  };
  const wild = (pat, val) => new RegExp('^' + String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(val);
  const arr = x => (Array.isArray(x) ? x : x == null ? [] : [x]);
  function policyDocsFor(u) {
    const docs = [];
    (u.attachedPolicies || []).forEach(n => {
      const p = list('policies').find(x => x.name === n && x.document);
      const d = p ? p.document : MANAGED_DOCS[n];
      if (d) docs.push({ src: n, doc: d });
    });
    Object.entries(u.inline || {}).forEach(([n, d]) => docs.push({ src: n, doc: d }));
    (u.groups || []).forEach(gn => {
      const g = list('groups').find(x => x.name === gn);
      if (!g) return;
      Object.entries(g.inline || {}).forEach(([n, d]) => docs.push({ src: `${gn}/${n}`, doc: d }));
      (g.attachedPolicies || []).forEach(n => { const d = MANAGED_DOCS[n]; if (d) docs.push({ src: `${gn}/${n}`, doc: d }); });
    });
    return docs;
  }
  function evalIam(u, action, resource) {
    let allowed = false, denied = false;
    const matched = [];
    policyDocsFor(u).forEach(({ src, doc }) => arr(doc.Statement).forEach(st => {
      const actOk = st.NotAction ? !arr(st.NotAction).some(a => wild(a, action)) : arr(st.Action).some(a => wild(a, action));
      const resOk = arr(st.Resource || '*').some(r => wild(r, resource));
      if (!actOk || !resOk) return;
      matched.push({ SourcePolicyId: src, Effect: st.Effect });
      if (st.Effect === 'Deny') denied = true; else if (st.Effect === 'Allow') allowed = true;
    }));
    return { decision: denied ? 'explicitDeny' : allowed ? 'allowed' : 'implicitDeny', matched };
  }

  /* ---------- S3 object model (versions + delete markers) ----------
     bucket.versions = { key: [ {versionId, deleteMarker, size, lastModified}, ... ] }  (naya pehle)
     versions na ho toh purana bucket.objects list chalta hai. */
  let s3seq = 0;
  const vid = () => 'v' + String(++s3seq).padStart(3, '0') + '-' + Math.random().toString(36).slice(2, 8);
  function ensureVersions(b) {
    if (b.versions) return b.versions;
    b.versions = {};
    (b.objects || []).forEach(o => { b.versions[o.key] = [{ versionId: 'null', deleteMarker: false, size: o.size || 1024, lastModified: o.lastModified || '2026-10-01 10:00:00' }]; });
    return b.versions;
  }
  function objectsOf(b) {
    if (!b.versions) return b.objects || [];
    return Object.entries(b.versions)
      .filter(([, vs]) => vs.length && !vs[0].deleteMarker)
      .map(([key, vs]) => ({ key, size: vs[0].size, lastModified: vs[0].lastModified }));
  }
  function putObject(b, key, size) {
    const now = '2026-10-23 ' + new Date().toTimeString().slice(0, 8);
    if (b.versioning === true || b.versions) {
      const vs = ensureVersions(b);
      (vs[key] = vs[key] || []).unshift({ versionId: b.versioning === true ? vid() : 'null', deleteMarker: false, size, lastModified: now });
      if (b.versioning !== true) vs[key] = vs[key].slice(0, 1);
    } else {
      b.objects = (b.objects || []).filter(o => o.key !== key);
      b.objects.push({ key, size, lastModified: now });
    }
  }
  function isPublicPolicy(doc) {
    try {
      const d = typeof doc === 'string' ? JSON.parse(doc) : doc;
      return arr(d.Statement).some(st => st.Effect === 'Allow' && !st.Condition &&
        (st.Principal === '*' || (st.Principal && (st.Principal.AWS === '*' || arr(st.Principal.AWS).includes('*')))));
    } catch (e) { return false; }
  }

  /* ---------- table printers ---------- */
  function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(1, n - s.length)); }
  function table(rows) {
    if (!rows.length) return 'No resources found.';
    const widths = rows[0].map((_, c) => Math.max(...rows.map(r => String(r[c]).length)) + 3);
    return rows.map(r => r.map((cell, c) => pad(cell, widths[c])).join('').trimEnd()).join('\n');
  }

  /* JSON pretty-print (for policy documents etc.) */
  function prettyJson(obj) {
    try { return JSON.stringify(obj, null, 2); } catch (e) { return String(obj); }
  }

  /* ---------- checks after every command ---------- */
  function refresh() {
    if (stage.tasks) {
      stage.tasks.forEach((t, i) => {
        if (t.check && t.check(sim)) taskList.children[i].classList.add('done');
        else taskList.children[i].classList.remove('done');
      });
    }
    if (!sim.done && stage.success && stage.success(sim)) {
      sim.done = true;
      input.disabled = true;
      const xp = Math.max(10, AG.TERMINAL_XP - sim.hintsUsed * AG.HINT_COST);
      AG.addXP(xp);
      const win = AG.el('div', 'stage-summary pop');
      win.innerHTML = `
        <div class="sum-emoji">🎉</div>
        <div class="sum-title">Mission complete! +${xp} XP${sim.hintsUsed ? ` (${sim.hintsUsed} hint use hue)` : ' — bina hint ke! 🔥'}</div>
        <div class="sum-detail" style="text-align:left;line-height:1.6;margin-top:8px">${stage.successText || ''}</div>`;
      arena.appendChild(win);
      win.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => onDone({ firstTry: sim.hintsUsed === 0 ? 1 : 0, total: 1 }), 300);
    }
  }

  /* ---------- command execution ---------- */
  function run(raw) {
    print('cmd', raw);
    if (sim.done) return;
    const norm = raw.replace(/\s+/g, ' ').trim();
    sim.history.push(norm);
    // simulator ka koi bhi crash mission ko freeze na kare — error dikhao aur chalte raho
    try { exec(norm); }
    catch (e) {
      console.error('awscli sim error:', e);
      print('err', `simulator error: ${e.message} — command dobara try karo ya 'help' dekho`);
    }
    refresh();   // har command ke baad — error paths ke baad bhi tasks/success update hon
  }

  function exec(norm) {
    // mission-scripted overrides pehle
    for (const r of sim.responses) {
      const m = norm.match(r.re);
      if (m) {
        if (r.mutate) r.mutate(sim, m);
        const text = typeof r.out === 'function' ? r.out(sim, m) : r.out;
        if (text) print(r.err ? 'err' : 'ok', text);
        return;
      }
    }

    // shell-ish extras
    if (norm === 'help') {
      print('sys', [
        'Supported commands (is mission mein):',
        '  aws sts get-caller-identity',
        '  aws iam list-users / list-roles / list-groups / list-policies',
        '  aws iam get-user --user-name <name>    |  aws iam list-attached-user-policies --user-name <n>',
        '  aws iam list-groups-for-user / list-user-policies / list-access-keys --user-name <n>',
        '  aws iam attach-user-policy / detach-user-policy --user-name <n> --policy-arn <arn>',
        '  aws iam update-access-key --user-name <n> --access-key-id <id> --status Inactive  |  delete-access-key  |  delete-user',
        '  aws iam simulate-principal-policy --policy-source-arn <user-arn> --action-names s3:GetObject s3:PutObject --resource-arns <arn>',
        '  aws s3 ls / ls s3://<bucket> / mb s3://<bucket> / mb s3://<bucket> --region <r>',
        '  aws s3 cp <file> s3://<bucket>/<key>  |  aws s3 rm s3://<bucket>/<key>  |  aws s3 presign s3://<bucket>/<key> --expires-in <sec>',
        '  aws s3api list-buckets / get-bucket-encryption / put-bucket-encryption / get-bucket-versioning / put-bucket-versioning --bucket <b>',
        '  aws s3api list-object-versions --bucket <b> --prefix <p>  |  delete-object --bucket <b> --key <k> [--version-id <v>]',
        '  aws s3api put-public-access-block / get-public-access-block / put-bucket-policy / get-bucket-policy / delete-bucket-policy --bucket <b>',
        '  aws ec2 describe-instances / describe-vpcs / describe-subnets / describe-security-groups / describe-volumes / describe-route-tables / describe-nat-gateways',
        '  aws ec2 create-route / delete-route --route-table-id <rtb> --destination-cidr-block <cidr> [--gateway-id <igw>]',
        '  aws ec2 associate-route-table --route-table-id <rtb> --subnet-id <subnet>',
        '  aws ec2 replace-route-table-association --association-id <rtbassoc> --route-table-id <rtb>   |   describe-network-acls',
        '  aws ec2 describe-instances --instance-ids <id>   |  ... --filters Name=tag:Name,Values=<n>',
        '  aws ec2 authorize-security-group-ingress / revoke-security-group-ingress --group-id <sg> --protocol tcp --port <n> --cidr <cidr> (ya --source-group <sg>; JSON --ip-permissions bhi supported)',
        '  aws ec2 stop-instances / start-instances / reboot-instances / terminate-instances --instance-ids <id>',
        '  aws ec2 modify-instance-metadata-options --instance-id <id> --http-tokens required  |  modify-instance-attribute --instance-type Value=<t>',
        '  aws ec2 create-snapshot --volume-id <vol> --description <d>  |  describe-snapshots  |  allocate-address / associate-address / describe-addresses',
        '  aws rds describe-db-instances / modify-db-instance --db-instance-identifier <id> / create-db-snapshot',
        '  aws lambda list-functions / invoke / get-function / update-function-configuration / get-policy --function-name <fn>',
        '  aws dynamodb list-tables / describe-table --table-name <t> / scan / query / put-item / update-table',
        '  aws route53 list-hosted-zones / list-resource-record-sets --hosted-zone-id <id> / list-health-checks',
        '  aws cloudformation describe-stacks / describe-stack-events --stack-name <s>',
        '  aws cloudwatch describe-alarms / put-metric-alarm --alarm-name <n> / delete-alarms / set-alarm-state',
        '  aws kms list-keys / describe-key --key-id <id> / create-key / enable-key / disable-key / schedule-key-deletion',
        '  aws logs describe-log-groups / filter-log-events --log-group-name <g> / create-log-group / put-retention-policy',
        '  aws cloudfront list-distributions / get-distribution --id <id> / get-distribution-config / create-invalidation',
        '  aws elbv2 describe-load-balancers / describe-target-groups',
        '  aws autoscaling describe-auto-scaling-groups',
        '  aws ecr create-repository --repository-name <n>  |  aws ecr describe-repositories [--repository-names <n>]',
        '  aws ecr list-images --repository-name <n>  |  aws ecr get-login-password',
        '  aws sqs create-queue --queue-name <n>  |  aws sqs list-queues [--queue-name-prefix <p>]',
        '  aws sqs send-message / receive-message / purge-queue / delete-message / set-queue-attributes --queue-name <n>',
        '  aws sns create-topic --name <n>  |  aws sns list-topics  |  aws sns unsubscribe --subscription-arn <arn>',
        '  aws sns subscribe --topic-arn <arn> --protocol sqs --notification-endpoint <queue-arn>',
        '  aws sns publish --topic-arn <arn> --message <text>  (fan-out: pushes to all SQS subscribers)',
        '  aws efs describe-file-systems / describe-mount-targets --file-system-id <fs> / create-mount-target --file-system-id <fs> --subnet-id <s>',
        '  aws organizations describe-organization / list-accounts / list-organizational-units-for-parent',
        '  aws organizations list-policies / describe-policy --policy-id <p> / attach-policy --policy-id <p> --target-id <ou>',
        '  aws events list-rules / describe-rule --name <n> / list-targets-by-rule --rule <n>',
        '  aws events put-rule --name <n> --event-pattern <json>  |  aws events put-targets --rule <n> --targets <arn>',
        '  aws stepfunctions list-state-machines / start-execution --name <sm> / get-execution-history',
        '  aws logs put-subscription-filter --log-group-name <g> --filter-name <n> --filter-pattern "" --destination-arn <arn>',
        '  aws logs describe-subscription-filters --log-group-name <g>  |  aws logs put-metric-filter ...',
        '  aws kinesis list-streams / describe-stream --stream-name <s> / create-stream --stream-name <s> --shard-count <n>',
        '  aws firehose list-delivery-streams / describe-delivery-stream --delivery-stream-name <d>',
        '  aws opensearch list-domain-names / describe-domain --domain-name <d>   (alias: aws es ...)',
        '  aws pipes list-pipes / describe-pipe --name <p> / create-pipe --name <p> --source <arn> --target <arn> [--enrichment <arn>]',
        '  aws configure get region / list / set region <r>',
        '  terraform init / plan / apply / validate / destroy / state list',
        '  apply -f <file>   (ls se files dekho — non-tf files ke liye)',
        '  ls · clear · hint · help',
      ].join('\n'));
      return;
    }
    if (norm === 'clear') { out.innerHTML = ''; return; }
    if (norm === 'hint') { giveHint(); return; }
    if (norm === 'ls') {
      const names = Object.keys(sim.files);
      print('ok', names.length ? names.join('\n') : '(koi files nahi hain is mission mein)');
      return;
    }

    /* ---------- TERRAFORM ---------- */
    if (norm === 'terraform' || norm.startsWith('terraform ')) {
      return execTerraform(norm);
    }

    /* ---------- tokenise (once — apply block + AWS CLI dono use karte hain) ---------- */
    const tk = tokenize(norm);
    if (tk.error) { print('err', tk.error); return; }
    const toks = tk.toks;

    /* ---------- GENERIC FILE APPLY (apply -f <file>) ----------
       Non-Terraform files (e.g. fix-policy.json, fix-sg.json) ke liye.
       terraform apply sirf .tf files chalata hai; yeh kisi bhi file ko apply kar sakta hai. */
    if (toks[0] === 'apply') {
      const fi = toks.indexOf('-f');
      const fname = fi > -1 ? toks[fi + 1] : null;
      if (fname) return applyFile(fname);
      print('err', 'usage: apply -f <file>   (ls se files dekho)');
      return;
    }
    if (toks[0] !== 'aws') {
      print('err', `bash: ${toks[0]}: command not found — yahan sirf 'aws' aur 'terraform' chalte hain 🙂 ('help' try karo)`);
      return;
    }
    const service = toks[1];
    const op = toks[2];
    if (!service || !op) { print('err', `usage: aws <service> <operation> [options]   (e.g. aws s3 ls)`); return; }

    /* ----- flag parser ----- */
    function flag(name) {
      const i = toks.indexOf('--' + name);
      if (i < 0) return null;
      const v = toks[i + 1];
      if (v === undefined || /^--[a-z]/i.test(v)) return null;
      return v;            // "" (khaali quote) bhi ek valid value hai, jaise --filter-pattern ""
    }
    /* --action-names s3:GetObject s3:PutObject → saare values agle --flag tak */
    function flags(name) {
      const i = toks.indexOf('--' + name);
      if (i < 0) return [];
      const out = [];
      for (let j = i + 1; j < toks.length && !/^--[a-z]/i.test(toks[j]); j++) out.push(toks[j]);
      return out;
    }
    for (const arg of ['query', 'output']) {
      if (toks.includes('--' + arg) && flag(arg) === null) return print('err', `aws: error: argument --${arg}: expected one argument`);
    }
    // Fail before mutation on misspelled flags or stray positional values.
    if (['elbv2', 'autoscaling', 'ec2', 's3api', 'rds'].includes(service)) {
      const specs = {
        ec2: {
          'describe-security-groups': ['group-ids*', 'group-names*', 'filters*'],
          'authorize-security-group-ingress': ['group-id', 'group-name', 'protocol', 'port', 'cidr', 'source-group', 'ip-permissions', 'dry-run!', 'no-dry-run!'],
          'revoke-security-group-ingress': ['group-id', 'group-name', 'protocol', 'port', 'cidr', 'source-group', 'ip-permissions', 'dry-run!', 'no-dry-run!'],
        },
        s3api: { 'put-public-access-block': ['bucket', 'public-access-block-configuration', 'expected-bucket-owner'], 'get-public-access-block': ['bucket', 'expected-bucket-owner'] },
        rds: {
          'modify-db-instance': ['db-instance-identifier', 'multi-az!', 'no-multi-az!', 'publicly-accessible!', 'no-publicly-accessible!', 'deletion-protection!', 'no-deletion-protection!', 'apply-immediately!', 'no-apply-immediately!', 'backup-retention-period', 'allocated-storage', 'max-allocated-storage', 'db-instance-class'],
        },
        elbv2: {
          'describe-load-balancers': ['load-balancer-arns*', 'names*'], 'describe-listeners': ['load-balancer-arn'],
          'describe-target-groups': ['target-group-arns*', 'names*', 'load-balancer-arn'], 'describe-target-health': ['target-group-arn', 'targets*'],
          'modify-target-group': ['target-group-arn', 'health-check-path', 'health-check-port', 'health-check-interval-seconds', 'health-check-timeout-seconds', 'healthy-threshold-count', 'unhealthy-threshold-count', 'matcher'],
          'describe-target-group-attributes': ['target-group-arn'], 'modify-target-group-attributes': ['target-group-arn', 'attributes*'],
          'register-targets': ['target-group-arn', 'targets*'], 'deregister-targets': ['target-group-arn', 'targets*'], 'wait': ['target-group-arn', 'targets*'],
        },
        autoscaling: {
          'describe-auto-scaling-groups': ['auto-scaling-group-names*'], 'describe-auto-scaling-instances': ['instance-ids*'],
          'describe-policies': ['auto-scaling-group-name'], 'describe-scaling-activities': ['auto-scaling-group-name'],
          'put-scaling-policy': ['auto-scaling-group-name', 'policy-name', 'policy-type', 'target-tracking-configuration', 'estimated-instance-warmup'],
          'update-auto-scaling-group': ['auto-scaling-group-name', 'min-size', 'max-size', 'desired-capacity', 'health-check-type', 'health-check-grace-period', 'default-instance-warmup', 'vpc-zone-identifier'],
          'set-desired-capacity': ['auto-scaling-group-name', 'desired-capacity', 'honor-cooldown!', 'no-honor-cooldown!'],
          'terminate-instance-in-auto-scaling-group': ['instance-id', 'should-decrement-desired-capacity!', 'no-should-decrement-desired-capacity!'],
        },
      };
      const serviceSpec = specs[service];
      if (Object.prototype.hasOwnProperty.call(serviceSpec, op)) {
        const allowed = serviceSpec[op].concat(['query', 'output', 'region', 'profile', 'endpoint-url', 'no-cli-pager!', 'no-paginate!']);
        for (let i = op === 'wait' ? 4 : 3; i < toks.length;) {
          const name = toks[i].startsWith('--') ? toks[i].slice(2) : '';
          const spec = allowed.find(a => a.replace(/[*!]$/, '') === name);
          if (!spec) return print('err', `Unknown options: ${toks[i]}. This simulator models the documented flags listed by help.`);
          if (spec.endsWith('!')) { i++; continue; }
          if (!toks[i + 1] || toks[i + 1].startsWith('--')) return print('err', `aws: error: argument --${name}: expected one argument`);
          i += 2;
          if (spec.endsWith('*')) while (i < toks.length && !toks[i].startsWith('--')) i++;
        }
      }
    }

    // New service handlers share an explicit, bounded JMESPath subset. Unsupported
    // expressions fail visibly; --query is never silently ignored in these handlers.
    function resultJson(value) {
      function query(v, expression) {
        const e = expression.trim();
        const length = e.match(/^length\((.*)\)$/);
        if (length) { const r = query(v, length[1]); if (!Array.isArray(r) && typeof r !== 'string') throw Error('length() needs an array/string'); return r.length; }
        const hash = e.match(/^(?:(.*)\.)?\{([^{}]+)\}$/);
        if (hash) {
          const target = hash[1] ? query(v, hash[1]) : v;
          const fields = hash[2].split(',').map(f => f.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+)$/));
          if (fields.some(f => !f)) throw Error('invalid object projection');
          const one = x => Object.fromEntries(fields.map(f => [f[1], query(x, f[2])]));
          return Array.isArray(target) ? target.map(one) : one(target);
        }
        const tokens = e.match(/[A-Za-z_][A-Za-z0-9_]*|\[\d*\]/g) || [];
        if (!tokens.length || tokens.join('.').replace(/\.\[/g, '[') !== e || tokens.some(t => ['__proto__', 'constructor', 'prototype'].includes(t))) throw Error('unsupported expression');
        function walk(x, i) {
          if (i === tokens.length) return x == null ? null : x;
          const t = tokens[i];
          if (t === '[]') return Array.isArray(x) ? x.flat(1).map(z => walk(z, i + 1)).filter(z => z != null) : null;
          if (t[0] === '[') return Array.isArray(x) ? walk(x[Number(t.slice(1, -1))], i + 1) : null;
          return x && Object.prototype.hasOwnProperty.call(x, t) ? walk(x[t], i + 1) : null;
        }
        return walk(v, 0);
      }
      let result = value;
      try { if (flag('query') != null) result = query(value, flag('query')); }
      catch (e) { return print('err', 'Invalid --query for this simulator subset: ' + e.message + '. Supported: dotted paths, [0], [], length(), object projections. Omit --query for full JSON.'); }
      const output = flag('output') || 'json';
      if (output === 'json') return print('ok', prettyJson(result));
      if (output === 'text') {
        const row = x => Array.isArray(x) ? x.map(z => z == null ? 'None' : String(z)).join('\t') : x && typeof x === 'object' ? Object.keys(x).sort().map(k => String(x[k])).join('\t') : x == null ? 'None' : String(x);
        return print('ok', Array.isArray(result) && result.some(x => x && typeof x === 'object') ? result.map(row).join('\n') : row(result));
      }
      print('err', 'Simulator output support: --output json or text. Table/YAML formatting is not implemented.');
    }

    // Deterministic configuration model, not real EC2 boot/HTTP/time simulation.
    function groupTargets() { return list('targetGroups'); }
    function targetHealth(tg, target) {
      if (target.draining) return { State: 'draining', Reason: 'Target.DeregistrationInProgress' };
      const i = list('instances').find(i => i.id === target.id);
      if (!i || i.state !== 'running') return { State: 'unused', Reason: 'Target.InvalidState' };
      if (i.appHealthy === false) return { State: 'unhealthy', Reason: 'Target.FailedHealthChecks', Description: 'Application process failed the modeled health check.' };
      const port = tg.healthCheckPort && tg.healthCheckPort !== 'traffic-port' ? Number(tg.healthCheckPort) : target.port || tg.port;
      if (i.appPort && port !== i.appPort) return { State: 'unhealthy', Reason: 'Target.Timeout', Description: 'Modeled app is not listening on the health-check port.' };
      const code = (tg.healthCheckPath || '/') === (i.healthPath || tg.validHealthPath || '/') ? 200 : 404;
      const matches = String(tg.matcher || '200').split(',').some(part => { const range = part.split('-').map(Number); return code >= range[0] && code <= (range[1] == null ? range[0] : range[1]); });
      if (!matches) return { State: 'unhealthy', Reason: 'Target.ResponseCodeMismatch', Description: `Health checks failed with these codes: [${code}]` };
      return { State: 'healthy' };
    }
    function activity(a, description, extra) {
      a.activities = a.activities || [];
      const id = '00000000-0000-4000-8000-' + String(sim.activitySeq = (sim.activitySeq || 0) + 1).padStart(12, '0');
      const v = { id, description, status: 'Successful', ...extra };
      a.activities.unshift(v); return v;
    }
    function addGroupInstance(a) {
      let id;
      do { sim.instanceSeq = (sim.instanceSeq || 0) + 1; id = 'i-' + sim.instanceSeq.toString(16).padStart(17, '0'); }
      while (list('instances').some(i => i.id === id));
      const zones = String(a.vpcZone || '').split(',').filter(Boolean);
      const members = (a.instances || []).map(id => list('instances').find(i => i.id === id)).filter(Boolean);
      const azOf = id => (list('subnets').find(s => s.id === id) || {}).az;
      zones.sort((x, y) => members.filter(i => i.az === azOf(x)).length - members.filter(i => i.az === azOf(y)).length || members.filter(i => i.subnetId === x).length - members.filter(i => i.subnetId === y).length);
      const sub = list('subnets').find(s => s.id === zones[0]);
      const spec = a.launchTemplate || {}, sample = members[0] || {};
      const cidr = sub && sub.cidr && sub.cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
      const baseIP = cidr ? cidr.slice(1, 5).reduce((n, x) => n * 256 + Number(x), 0) : 168234752;
      const block = cidr ? 2 ** (32 - Number(cidr[5])) : 256;
      const hostIP = Math.floor(baseIP / block) * block + 4 + (sim.instanceSeq % Math.max(1, block - 5));
      const privateIP = [24, 16, 8, 0].map(b => Math.floor(hostIP / 2 ** b) % 256).join('.');
      const instance = { id, name: a.name + '-' + sim.instanceSeq, type: spec.type || sample.type || 't3.small', state: 'running', appHealthy: true,
        healthPath: spec.healthPath || '/healthz', appPort: spec.appPort || sample.appPort || 8080, vpcId: sub ? sub.vpcId : sample.vpcId, subnetId: sub ? sub.id : sample.subnetId,
        az: sub ? sub.az : sample.az, sgIds: spec.sgIds || sample.sgIds || [], role: spec.role || sample.role, privateIp: privateIP, publicIp: null };
      list('instances').push(instance); a.instances.push(id);
      groupTargets().filter(tg => (a.targetGroupARNs || []).includes(tg.arn)).forEach(tg => {
        tg.targets = tg.targets || []; tg.targets.push({ id, port: tg.port || 8080 });
      });
      return id;
    }
    function removeGroupInstance(a, id) {
      const i = list('instances').find(i => i.id === id); if (i) i.state = 'terminated';
      a.instances = (a.instances || []).filter(x => x !== id);
      groupTargets().forEach(tg => { tg.targets = (tg.targets || []).filter(t => t.id !== id); });
    }
    function settleGroup(a, inspectHealth) {
      a.instances = a.instances || [];
      if (inspectHealth) {
        const tgs = groupTargets().filter(tg => (a.targetGroupARNs || []).includes(tg.arn));
        const unhealthy = a.instances.filter(id => {
          const i = list('instances').find(i => i.id === id);
          return !i || i.state !== 'running' || (a.healthCheckType === 'ELB' && tgs.some(tg => (tg.targets || []).some(t => t.id === id && targetHealth(tg, t).State === 'unhealthy')));
        });
        unhealthy.forEach(oldId => {
          removeGroupInstance(a, oldId); const newId = addGroupInstance(a);
          activity(a, `Terminating EC2 instance: ${oldId}; launching replacement: ${newId}`, { oldId, newId, cause: 'Modeled ELB health reconciliation' });
        });
      }
      while (a.instances.length < a.desired) { const newId = addGroupInstance(a); activity(a, 'Launching a new EC2 instance: ' + newId, { newId }); }
      while (a.instances.length > a.desired) { const id = a.instances[a.instances.length - 1]; removeGroupInstance(a, id); activity(a, 'Terminating EC2 instance: ' + id, { oldId: id }); }
    }

    switch (service) {

      /* ===================== STS ===================== */
      case 'sts':
        if (op === 'get-caller-identity') {
          const id = sim.account.callerIdentity || {
            Account: '123456789012', UserId: 'AIDASAMPLEUSERID', Arn: 'arn:aws:iam::123456789012:user/shishya',
          };
          print('ok', [
            '{',
            `    "UserId": "${id.UserId}",`,
            `    "Account": "${id.Account}",`,
            `    "Arn": "${id.Arn}"`,
            '}',
          ].join('\n'));
        } else print('err', `unknown STS op: ${op}`);
        return;

      /* ===================== IAM ===================== */
      case 'iam':
        if (op === 'list-users') {
          const users = list('users');
          if (!users.length) return print('ok', '{}');
          print('ok', '{\n    "Users": [\n' +
            users.map(u => `        { "UserName": "${u.name}", "UserId": "${u.id || 'AIDA' + u.name.toUpperCase().slice(0, 8)}", "Arn": "arn:aws:iam::123456789012:user/${u.name}", "CreateDate": "2024-01-15T10:00:00Z" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-roles') {
          const roles = list('roles');
          if (!roles.length) return print('ok', '{}');
          print('ok', '{\n    "Roles": [\n' +
            roles.map(r => `        { "RoleName": "${r.name}", "Arn": "arn:aws:iam::123456789012:role/${r.name}", "MaxSessionDuration": ${r.maxSession || 3600} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-groups') {
          const groups = list('groups');
          if (!groups.length) return print('ok', '{}');
          print('ok', '{\n    "Groups": [\n' +
            groups.map(g => `        { "GroupName": "${g.name}", "GroupId": "AGPA${g.name.toUpperCase().slice(0, 8)}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-policies') {
          const policies = list('policies');
          if (!policies.length) return print('ok', '{}');
          print('ok', '{\n    "Policies": [\n' +
            policies.map(p => `        { "PolicyName": "${p.name}", "PolicyId": "ANPA${p.name.toUpperCase().slice(0, 8)}", "Arn": "${p.arn || (p.type === 'customer' ? 'arn:aws:iam::123456789012:policy/' : 'arn:aws:iam::aws:policy/') + p.name}", "AttachmentCount": ${p.attached || 0} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'get-user') {
          const name = flag('user-name');
          if (!name) return print('err', 'error: --user-name required');
          const u = find('users', name);
          if (!u) return print('err', `Error: User '${name}' not found`);
          print('ok', '{\n' +
            `    "User": {\n` +
            `        "UserName": "${u.name}",\n` +
            `        "Arn": "arn:aws:iam::123456789012:user/${u.name}",\n` +
            `        "UserId": "${u.id || 'AIDA' + u.name.toUpperCase().slice(0, 8)}"\n` +
            `    }\n}`);
        } else if (op === 'list-attached-user-policies') {
          const name = flag('user-name');
          if (!name) return print('err', 'error: --user-name required');
          const u = find('users', name);
          if (!u) return print('err', `Error: User '${name}' not found`);
          const attached = u.attachedPolicies || [];
          print('ok', '{\n    "AttachedPolicies": [\n' +
            attached.map(p => `        { "PolicyName": "${p}", "PolicyArn": "arn:aws:iam::aws:policy/${p}" }`).join(',\n') +
            (attached.length ? '' : '        ') + '\n    ]\n}');
        } else if (op === 'get-role') {
          const name = flag('role-name');
          if (!name) return print('err', 'error: --role-name required');
          const r = find('roles', name);
          if (!r) return print('err', `Error: Role '${name}' not found`);
          print('ok', '{\n' +
            `    "Role": {\n` +
            `        "RoleName": "${r.name}",\n` +
            `        "Arn": "arn:aws:iam::123456789012:role/${r.name}",\n` +
            `        "MaxSessionDuration": ${r.maxSession || 3600},\n` +
            `        "LastUsed": ${r.lastUsed ? `"${r.lastUsed}"` : 'null'}\n` +
            `    }\n}`);
        } else if (op === 'get-policy' || op === 'get-policy-version') {
          const arn = flag('policy-arn') || flag('arn');
          const policies = list('policies');
          const p = policies.find(x => !arn || x.arn === arn || x.name === (arn.split('/').pop()));
          if (!p) return print('err', `Error: Policy not found`);
          if (p.document) {
            print('ok', prettyJson(p.document));
          } else {
            print('ok', '{\n    "Policy": {\n' +
              `        "PolicyName": "${p.name}",\n` +
              `        "DefaultVersionId": "v1",\n` +
              `        "AttachmentCount": ${p.attached || 0}\n` +
              `    }\n}`);
          }
        } else if (op === 'list-groups-for-user') {
          const u = find('users', flag('user-name'));
          if (!u) return print('err', `NoSuchEntity: The user with name ${flag('user-name')} cannot be found.`);
          print('ok', prettyJson({ Groups: (u.groups || []).map(g => ({ GroupName: g, Arn: `arn:aws:iam::123456789012:group/${g}` })) }));
        } else if (op === 'list-user-policies') {
          const u = find('users', flag('user-name'));
          if (!u) return print('err', `NoSuchEntity: The user with name ${flag('user-name')} cannot be found.`);
          print('ok', prettyJson({ PolicyNames: Object.keys(u.inline || {}) }));
        } else if (op === 'get-user-policy') {
          const u = find('users', flag('user-name'));
          const pn = flag('policy-name');
          if (!u || !(u.inline || {})[pn]) return print('err', `NoSuchEntity: The user policy with name ${pn} cannot be found.`);
          print('ok', prettyJson({ UserName: u.name, PolicyName: pn, PolicyDocument: u.inline[pn] }));
        } else if (op === 'list-access-keys') {
          const u = find('users', flag('user-name'));
          if (!u) return print('err', `NoSuchEntity: The user with name ${flag('user-name')} cannot be found.`);
          print('ok', prettyJson({ AccessKeyMetadata: (u.keys || []).map(k => ({ UserName: u.name, AccessKeyId: k.id, Status: k.status || 'Active', CreateDate: k.created || '2026-01-10T09:00:00Z' })) }));
        } else if (op === 'update-access-key') {
          const u = find('users', flag('user-name'));
          const kid = flag('access-key-id'), st = flag('status');
          const k = u && (u.keys || []).find(x => x.id === kid);
          if (!k) return print('err', `NoSuchEntity: The Access Key with id ${kid} cannot be found.`);
          if (!/^(Active|Inactive)$/.test(st || '')) return print('err', 'error: --status Active | Inactive');
          k.status = st;
          print('ok', '');
          if (st === 'Inactive') print('sys', `(key ${kid} ab kisi request par kaam nahi karegi — par delete nahi hui. Pehle Inactive, check karo kuch toota toh nahi, phir delete.)`);
        } else if (op === 'delete-access-key') {
          const u = find('users', flag('user-name'));
          const kid = flag('access-key-id');
          if (!u || !(u.keys || []).some(x => x.id === kid)) return print('err', `NoSuchEntity: The Access Key with id ${kid} cannot be found.`);
          u.keys = u.keys.filter(x => x.id !== kid);
          print('ok', '');
        } else if (op === 'attach-user-policy' || op === 'detach-user-policy') {
          const u = find('users', flag('user-name'));
          const arn = flag('policy-arn');
          if (!u) return print('err', `NoSuchEntity: The user with name ${flag('user-name')} cannot be found.`);
          if (!arn) return print('err', 'error: --policy-arn required   (e.g. arn:aws:iam::aws:policy/AdministratorAccess)');
          const pname = arn.split('/').pop();
          u.attachedPolicies = u.attachedPolicies || [];
          if (op === 'attach-user-policy') { if (!u.attachedPolicies.includes(pname)) u.attachedPolicies.push(pname); }
          else {
            if (!u.attachedPolicies.includes(pname)) return print('err', `NoSuchEntity: Policy ${arn} was not found or is not attached to user ${u.name}.`);
            u.attachedPolicies = u.attachedPolicies.filter(x => x !== pname);
          }
          print('ok', '');
        } else if (op === 'delete-user-policy') {
          const u = find('users', flag('user-name'));
          const pn = flag('policy-name');
          if (!u || !(u.inline || {})[pn]) return print('err', `NoSuchEntity: The user policy with name ${pn} cannot be found.`);
          delete u.inline[pn];
          print('ok', '');
        } else if (op === 'delete-user') {
          const name = flag('user-name');
          const users = list('users');
          const u = users.find(x => x.name === name);
          if (!u) return print('err', `NoSuchEntity: The user with name ${name} cannot be found.`);
          const blockers = [];
          if ((u.keys || []).length) blockers.push('access keys');
          if ((u.attachedPolicies || []).length) blockers.push('attached policies');
          if (Object.keys(u.inline || {}).length) blockers.push('inline policies');
          if ((u.groups || []).length) blockers.push('group memberships');
          if (blockers.length) return print('err', `DeleteConflict: Cannot delete entity, must remove ${blockers.join(', ')} first.`);
          users.splice(users.indexOf(u), 1);
          print('ok', '');
        } else if (op === 'simulate-principal-policy') {
          const src = flag('policy-source-arn') || '';
          const uname = src.split('/').pop();
          const u = list('users').find(x => x.name === uname);
          if (!u) return print('err', `NoSuchEntity: --policy-source-arn ${src} not found`);
          const actions = flags('action-names');
          const resources = flags('resource-arns');
          if (!actions.length) return print('err', 'error: --action-names required (e.g. --action-names s3:GetObject s3:PutObject)');
          const res = resources.length ? resources : ['*'];
          const results = [];
          actions.forEach(a => res.forEach(r => {
            const d = evalIam(u, a, r);
            results.push({ EvalActionName: a, EvalResourceName: r, EvalDecision: d.decision, MatchedStatements: d.matched });
          }));
          print('ok', prettyJson({ EvaluationResults: results }));
        } else if (op === 'create-role' || op === 'create-user' || op === 'create-group' || op === 'create-policy' || op === 'attach-role-policy') {
          print('err', `'${op}' is mission mein scripted nahi hai. Mission ka goal dekho — koi file apply karni ho sakti hai (ls se dekho).`);
        } else {
          print('err', `unknown IAM op: ${op} ('help' dekho)`);
        }
        return;

      /* ===================== S3 ===================== */
      case 's3':
        if (op === 'ls') {
          const arg = toks[3];
          if (!arg) {
            // list buckets
            const buckets = list('buckets');
            if (!buckets.length) return print('ok', '(no buckets)');
            print('ok', buckets.map(b => `${b.creationDate || '2024-03-10 10:20:00'}  ${b.name}`).join('\n'));
          } else if (arg.startsWith('s3://')) {
            const rest = arg.slice(5);
            const bname = rest.split('/')[0];
            const prefix = rest.slice(bname.length + 1);
            const b = find('buckets', bname);
            if (!b) return print('err', `NoSuchBucket: The specified bucket does not exist (bucket: ${bname})`);
            const objs = objectsOf(b).filter(o => o.key.startsWith(prefix));
            if (!objs.length) return print('ok', '');
            print('ok', objs.map(o => `${o.lastModified || '2026-10-01 10:00:00'} ${String(o.size || 1024).padStart(10)} ${o.key.slice(prefix.lastIndexOf('/') + 1)}`).join('\n'));
          } else print('err', 'usage: aws s3 ls   |   aws s3 ls s3://bucket');
        } else if (op === 'mb') {
          const arg = toks.find(t => t.startsWith('s3://'));
          if (!arg) return print('err', 'usage: aws s3 mb s3://<bucket-name> [--region <r>]');
          const bname = arg.slice(5);
          const region = flag('region') || sim.account.region || 'us-east-1';
          const buckets = list('buckets');
          if (buckets.find(b => b.name === bname)) return print('err', `BucketAlreadyOwnedByYou: ${bname}`);
          buckets.push({ name: bname, region, encryption: false, public: false, objects: [] });
          print('ok', `make_bucket: ${bname}`);
        } else if (op === 'rb') {
          print('err', `'rb' is mission mein scripted nahi hai.`);
        } else if (op === 'cp') {
          const src = toks[3], dst = toks[4];
          if (!src || !dst) return print('err', 'usage: aws s3 cp <file> s3://bucket/   |   aws s3 cp s3://bucket/key <file>');
          if (dst.startsWith('s3://')) {
            const bname = dst.slice(5).split('/')[0];
            const b = find('buckets', bname);
            if (!b) return print('err', `upload failed: ${src} to ${dst} An error occurred (NoSuchBucket) when calling the PutObject operation: The specified bucket does not exist`);
            let key = dst.slice(5 + bname.length + 1);
            if (!key || key.endsWith('/')) key += src.split('/').pop();
            putObject(b, key, 1024 + src.length * 37);
            print('ok', `upload: ./${src.split('/').pop()} to s3://${bname}/${key}`);
          } else if (src.startsWith('s3://')) {
            const bname = src.slice(5).split('/')[0];
            const b = find('buckets', bname);
            const key = src.slice(5 + bname.length + 1);
            if (!b || !objectsOf(b).some(o => o.key === key)) return print('err', `fatal error: An error occurred (404) when calling the HeadObject operation: Key "${key}" does not exist`);
            print('ok', `download: s3://${bname}/${key} to ${dst}`);
          } else print('err', 'usage: aws s3 cp <file> s3://bucket/key');
        } else if (op === 'rm') {
          const arg = toks[3] || '';
          if (!arg.startsWith('s3://')) return print('err', 'usage: aws s3 rm s3://bucket/key');
          const bname = arg.slice(5).split('/')[0];
          const b = find('buckets', bname);
          const key = arg.slice(5 + bname.length + 1);
          if (!b) return print('err', `NoSuchBucket: ${bname}`);
          if (b.versioning === true) {
            const vs = ensureVersions(b);
            (vs[key] = vs[key] || []).unshift({ versionId: vid(), deleteMarker: true, lastModified: '2026-10-23 ' + new Date().toTimeString().slice(0, 8) });
          } else if (b.versions) { delete b.versions[key]; }
          else b.objects = (b.objects || []).filter(o => o.key !== key);
          print('ok', `delete: s3://${bname}/${key}`);
        } else if (op === 'sync') {
          print('ok', 'sync: complete (mocked — mission ke liye ok)');
        } else if (op === 'website') {
          const b = find('buckets', toks.find(t => t.startsWith('s3://'))?.slice(5));
          if (!b) return print('err', 'bucket not found');
          print('ok', `Successfully configured ${b.name} as static website. Endpoint: http://${b.name}.s3-website-${b.region || 'us-east-1'}.amazonaws.com`);
        } else if (op === 'presign') {
          const target = toks.find(t => t.startsWith('s3://')) || 's3://example-bucket/file.pdf';
          const bname = target.slice(5).split('/')[0], key = target.slice(5 + bname.length + 1);
          const exp = Number(flag('expires-in') || 3600);
          if (exp > 604800) return print('err', 'An error occurred (ParamValidation): expires-in max 604800 seconds (7 din)');
          print('ok', `https://${bname}.s3.${sim.account.region || 'ap-south-1'}.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIA...%2F${sim.account.region || 'ap-south-1'}%2Fs3%2Faws4_request&X-Amz-Date=20261023T120000Z&X-Amz-Expires=${exp}&X-Amz-SignedHeaders=host&X-Amz-Signature=5f1c...e9`);
          print('sys', `(link ${exp} second tak valid. Key badli → signature toot → 403. Link banane wale credentials ke paas s3:GetObject hona chahiye.)`);
        } else {
          print('err', `unknown S3 op: ${op}`);
        }
        return;

      case 's3api':
        if (op === 'list-buckets') {
          const buckets = list('buckets');
          print('ok', '{\n    "Buckets": [\n' +
            buckets.map(b => `        { "Name": "${b.name}", "CreationDate": "${b.creationDate || '2024-03-10T10:20:00.000Z'}" }`).join(',\n') +
            (buckets.length ? '' : '        ') + '\n    ]\n}');
        } else if (op === 'get-bucket-encryption') {
          const bname = flag('bucket');
          if (!bname) return print('err', 'error: --bucket required');
          const b = find('buckets', bname);
          if (!b) return print('err', `NoSuchBucket: ${bname}`);
          // Jan 2023 se har bucket par default SSE-S3 (AES256) lagta hai — "unencrypted bucket" ab hota hi nahi
          const kms = b.encryption === 'kms';
          print('ok', prettyJson({ ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: kms ? { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: b.kmsKey || 'alias/aws/s3' } : { SSEAlgorithm: 'AES256' }, BucketKeyEnabled: kms ? !!b.bucketKey : false }] } }));
        } else if (op === 'get-bucket-policy') {
          const bname = flag('bucket');
          const b = find('buckets', bname);
          if (!b) return print('err', `NoSuchBucket: ${bname}`);
          if (b.policy) print('ok', prettyJson({ Policy: JSON.stringify(b.policy) }));
          else if (b.public) print('ok', prettyJson({ Policy: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${b.name}/*` }] }) }));
          else print('err', 'An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist');
        } else if (op === 'get-bucket-versioning') {
          const bname = flag('bucket');
          const b = find('buckets', bname);
          if (!b) return print('err', `NoSuchBucket: ${bname}`);
          // asli AWS: kabhi enable nahi kiya = khaali {} ; enable karke band kiya = "Suspended"
          if (b.versioning === undefined || b.versioning === null) print('ok', '{}   ← versioning kabhi on hi nahi hua (delete/overwrite = data hamesha ke liye gaya)');
          else print('ok', `{\n    "Status": "${b.versioning ? 'Enabled' : 'Suspended'}"\n}`);
        } else if (op === 'put-bucket-versioning') {
          const bname = flag('bucket');
          const status = flag('versioning-configuration');
          if (!bname) return print('err', 'error: --bucket required');
          const b = find('buckets', bname);
          if (!b) return print('err', `NoSuchBucket: ${bname}`);
          if (status) {
            const on = /Enabled|Status=Enabled/i.test(status);
            if (on) ensureVersions(b);
            else if (b.versioning === true) b.versioning = false;   // Suspended — purane versions rehte hain
            if (on) b.versioning = true;
          }
          print('ok', '');
        } else if (op === 'list-object-versions') {
          const b = find('buckets', flag('bucket'));
          if (!b) return print('err', `NoSuchBucket: ${flag('bucket')}`);
          const prefix = flag('prefix') || '';
          const vs = b.versions || {};
          const V = [], D = [];
          Object.entries(vs).filter(([k]) => k.startsWith(prefix)).forEach(([key, list]) => list.forEach((v, i) => {
            const row = { Key: key, VersionId: v.versionId, IsLatest: i === 0, LastModified: v.lastModified };
            if (v.deleteMarker) D.push(row); else V.push({ ...row, Size: v.size });
          }));
          if (!b.versions) objectsOf(b).filter(o => o.key.startsWith(prefix)).forEach(o => V.push({ Key: o.key, VersionId: 'null', IsLatest: true, Size: o.size || 1024 }));
          print('ok', prettyJson({ Versions: V.length ? V : undefined, DeleteMarkers: D.length ? D : undefined }));
        } else if (op === 'delete-object') {
          const b = find('buckets', flag('bucket'));
          const key = flag('key');
          if (!b || !key) return print('err', 'error: --bucket and --key required');
          const v = flag('version-id');
          if (v) {
            const list = (b.versions || {})[key] || [];
            const idx = list.findIndex(x => x.versionId === v);
            if (idx < 0) return print('err', `An error occurred (InvalidArgument) when calling the DeleteObject operation: Invalid version id specified`);
            const wasMarker = list[idx].deleteMarker;
            list.splice(idx, 1);
            print('ok', prettyJson(wasMarker ? { DeleteMarker: true, VersionId: v } : { VersionId: v }));
            print('sys', wasMarker ? '(delete marker hata — neeche wala version ab phir se "current" hai)' : '(yeh version HAMESHA ke liye gaya — version-id wala delete wapas nahi hota)');
          } else if (b.versioning === true) {
            const vs = ensureVersions(b);
            const m = vid();
            (vs[key] = vs[key] || []).unshift({ versionId: m, deleteMarker: true, lastModified: '2026-10-23 12:00:00' });
            print('ok', prettyJson({ DeleteMarker: true, VersionId: m }));
          } else {
            b.objects = (b.objects || []).filter(o => o.key !== key);
            if (b.versions) delete b.versions[key];
            print('ok', '');
          }
        } else if (op === 'put-public-access-block') {
          const b = find('buckets', flag('bucket'));
          if (!b) return print('err', `NoSuchBucket: ${flag('bucket')}`);
          const raw = flag('public-access-block-configuration');
          if (!raw) return print('err', 'aws: error: --public-access-block-configuration is required');
          const keys = ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'];
          let config;
          try {
            if (raw.trim().startsWith('{')) config = JSON.parse(raw);
            else {
              config = {};
              for (const pair of raw.split(',')) {
                const m = pair.trim().match(/^(\w+)=(true|false)$/);
                if (!m || Object.prototype.hasOwnProperty.call(config, m[1])) throw Error('Use Key=true/false pairs or a JSON object with boolean values');
                config[m[1]] = m[2] === 'true';
              }
            }
            if (!config || Array.isArray(config) || typeof config !== 'object' || !Object.keys(config).length || Object.keys(config).some(k => !keys.includes(k) || typeof config[k] !== 'boolean')) throw Error('Only the four documented Block Public Access keys with boolean values are accepted');
          } catch (e) { return print('err', 'Error parsing parameter --public-access-block-configuration: ' + e.message); }
          b.bpa = Object.fromEntries(keys.map(k => [k, config[k] === true]));
          if (b.policy) b.public = isPublicPolicy(b.policy) && !b.bpa.RestrictPublicBuckets;
          else if (b.bpa.IgnorePublicAcls) b.public = false;
          print('ok', '');
        } else if (op === 'get-public-access-block') {
          const b = find('buckets', flag('bucket'));
          if (!b) return print('err', `NoSuchBucket: ${flag('bucket')}`);
          if (!b.bpa) return print('err', 'An error occurred (NoSuchPublicAccessBlockConfiguration) when calling the GetPublicAccessBlock operation: The public access block configuration was not found');
          print('ok', prettyJson({ PublicAccessBlockConfiguration: b.bpa }));
        } else if (op === 'put-bucket-policy') {
          const b = find('buckets', flag('bucket'));
          if (!b) return print('err', `NoSuchBucket: ${flag('bucket')}`);
          let pol = flag('policy') || '';
          if (pol.startsWith('file://')) { const f = sim.files[pol.slice(7)]; pol = f && f.content ? f.content : ''; }
          let doc;
          try { doc = JSON.parse(pol); } catch (e) { return print('err', 'An error occurred (MalformedPolicy) when calling the PutBucketPolicy operation: Policies must be valid JSON'); }
          if (isPublicPolicy(doc) && b.bpa && b.bpa.BlockPublicPolicy)
            return print('err', 'An error occurred (AccessDenied) when calling the PutBucketPolicy operation: Access Denied\n(Block Public Access ka BlockPublicPolicy ON hai — public policy lag hi nahi sakti ✅)');
          b.policy = doc; b.public = isPublicPolicy(doc) && !(b.bpa && b.bpa.RestrictPublicBuckets);
          print('ok', '');
        } else if (op === 'delete-bucket-policy') {
          const b = find('buckets', flag('bucket'));
          if (!b) return print('err', `NoSuchBucket: ${flag('bucket')}`);
          delete b.policy; b.public = false;
          print('ok', '');
        } else if (op === 'get-bucket-location') {
          const bname = flag('bucket');
          const b = find('buckets', bname);
          if (!b) return print('err', `NoSuchBucket: ${bname}`);
          print('ok', `{ "LocationConstraint": "${b.region || 'us-east-1'}" }`);
        } else if (op === 'get-bucket-acl') {
          const bname = flag('bucket');
          const b = find('buckets', bname);
          if (!b) return print('err', `NoSuchBucket: ${bname}`);
          print('ok', '{\n    "Grants": [\n        { "Grantee": { "Type": "CanonicalUser", "DisplayName": "shishya" }, "Permission": "FULL_CONTROL" }\n    ]\n}');
        } else if (op === 'delete-bucket') {
          const bname = flag('bucket');
          if (!bname) return print('err', 'error: --bucket required');
          const buckets = list('buckets');
          const idx = buckets.findIndex(b => b.name === bname);
          if (idx < 0) return print('err', `NoSuchBucket: ${bname}`);
          buckets.splice(idx, 1);
          print('ok', '');
        } else if (op === 'put-bucket-encryption') {
          const b = find('buckets', flag('bucket'));
          if (!b) return print('err', `NoSuchBucket: ${flag('bucket')}`);
          const c = flag('server-side-encryption-configuration') || '';
          if (/aws:kms/.test(c)) { b.encryption = 'kms'; b.kmsKey = (c.match(/KMSMasterKeyID"?\s*:\s*"([^"]+)/) || [])[1] || 'alias/aws/s3'; b.bucketKey = /BucketKeyEnabled"?\s*:\s*true/.test(c); }
          else if (/AES256/.test(c)) b.encryption = true;
          else return print('err', 'error: --server-side-encryption-configuration JSON mein SSEAlgorithm AES256 ya aws:kms do');
          print('ok', '');
        } else {
          print('err', `unknown S3API op: ${op}`);
        }
        return;

      /* ===================== EC2 ===================== */
      case 'ec2':
        if (op === 'describe-instances') {
          const insts = list('instances');
          if (!insts.length) return print('ok', '{\n    "Reservations": []\n}');
          const iidFilter = flag('instance-ids');
          // tag:Name filter — real CLI passes 'Name=tag:Name,Values=web-server' as ONE token
          const fIdx = toks.findIndex(t => t.startsWith('Name=tag:Name,Values='));
          let nameFilter = null;
          if (fIdx > -1) nameFilter = toks[fIdx].split('Values=')[1].replace(/,.*$/, '');
          const filtered = insts.filter(i => (!iidFilter || i.id === iidFilter) && (!nameFilter || i.name === nameFilter));
          if (!filtered.length) return print('ok', '{\n    "Reservations": []\n}');
          print('ok', filtered.map(i =>
            `{ "InstanceId": "${i.id}", "State": { "Name": "${i.state}" }, "InstanceType": "${i.type}", "PublicIpAddress": ${i.publicIp ? `"${i.publicIp}"` : 'null'}, "PrivateIpAddress": "${i.privateIp}", "SubnetId": "${i.subnetId || 'subnet-0a1b2c3d'}", "VpcId": "${i.vpcId || 'vpc-0a1b2c3d'}", "SecurityGroups": [${(i.sgIds || []).map(g => `{ "GroupId": "${g}" }`).join(', ')}], "MetadataOptions": { "HttpTokens": "${i.imds || 'optional'}" }, "BlockDeviceMappings": [${list('volumes').filter(v => v.attachedTo === i.id).map(v => `{ "DeviceName": "${v.device || '/dev/xvda'}", "Ebs": { "VolumeId": "${v.id}", "DeleteOnTermination": ${v.deleteOnTermination ? 'true' : 'false'} } }`).join(', ')}], "Tags": [{ "Key": "Name", "Value": "${i.name}" }], "Placement": { "AvailabilityZone": "${i.az}" } }`).join('\n'));
        } else if (op === 'describe-vpcs') {
          const vpcs = list('vpcs');
          if (!vpcs.length) return print('ok', '{\n    "Vpcs": []\n}');
          print('ok', '{\n    "Vpcs": [\n' +
            vpcs.map(v => `        { "VpcId": "${v.id}", "CidrBlock": "${v.cidr}", "IsDefault": ${v.default ? 'true' : 'false'}, "Tags": [{ "Key": "Name", "Value": "${v.name}" }] }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-subnets') {
          const subs = list('subnets');
          if (!subs.length) return print('ok', '{\n    "Subnets": []\n}');
          print('ok', '{\n    "Subnets": [\n' +
            subs.map(s => `        { "SubnetId": "${s.id}", "VpcId": "${s.vpcId}", "CidrBlock": "${s.cidr}", "AvailabilityZone": "${s.az}", "MapPublicIpOnLaunch": ${s.public ? 'true' : 'false'}, "Tags": [{ "Key": "Name", "Value": "${s.name}" }] }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-security-groups') {
          let sgs = list('securityGroups');
          const ids = flags('group-ids'), names = flags('group-names');
          if (ids.some(id => !sgs.some(g => g.id === id))) return print('err', 'InvalidGroup.NotFound: one or more security group IDs do not exist');
          if (ids.length) sgs = sgs.filter(g => ids.includes(g.id));
          if (names.length) sgs = sgs.filter(g => names.includes(g.name));
          for (const filter of flags('filters')) {
            const m = filter.match(/^Name=(group-id|group-name|vpc-id),Values=(.+)$/);
            if (!m) return print('err', 'Simulator supports group-id, group-name and vpc-id security-group filters; omit --filters for full state.');
            const key = { 'group-id': 'id', 'group-name': 'name', 'vpc-id': 'vpcId' }[m[1]], values = m[2].split(',');
            sgs = sgs.filter(g => values.includes(g[key]));
          }
          return resultJson({ SecurityGroups: sgs.map(sg => ({ GroupId: sg.id, GroupName: sg.name, VpcId: sg.vpcId,
            IpPermissions: (sg.ingress || []).map(r => ({ IpProtocol: r.protocol || 'tcp', ...(r.protocol === '-1' ? {} : { FromPort: r.fromPort, ToPort: r.toPort }),
              IpRanges: r.cidr ? [{ CidrIp: r.cidr }] : [], UserIdGroupPairs: r.sourceGroup ? [{ GroupId: r.sourceGroup, UserId: '123456789012' }] : [] })) })) });
        } else if (op === 'describe-volumes') {
          const vols = list('volumes');
          if (!vols.length) return print('ok', '{\n    "Volumes": []\n}');
          print('ok', '{\n    "Volumes": [\n' +
            vols.map(v => `        { "VolumeId": "${v.id}", "Size": ${v.size}, "VolumeType": "${v.type}", "State": "${v.state}"${v.attachedTo ? `, "Attachments": [{ "InstanceId": "${v.attachedTo}" }]` : ''} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-availability-zones') {
          const region = sim.account.region || 'us-east-1';
          print('ok', '{\n    "AvailabilityZones": [\n' +
            [`        { "ZoneName": "${region}a", "State": "available" }`, `        { "ZoneName": "${region}b", "State": "available" }`, `        { "ZoneName": "${region}c", "State": "available" }`].join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-regions') {
          print('ok', '{\n    "Regions": [\n        { "RegionName": "us-east-1" }, { "RegionName": "us-west-2" }, { "RegionName": "ap-south-1" }, { "RegionName": "eu-west-1" }\n    ]\n}');
        } else if (op === 'authorize-security-group-ingress' || op === 'revoke-security-group-ingress') {
          const gid = flag('group-id'), name = flag('group-name');
          if (!gid && !name) return print('err', 'aws: error: --group-id or --group-name is required');
          const sg = list('securityGroups').find(g => gid ? g.id === gid : g.name === name);
          if (!sg) return print('err', `InvalidGroup.NotFound: The security group '${gid || name}' does not exist`);
          function normalizeCIDR(raw) {
            const m = typeof raw === 'string' && raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
            if (!m || m[1].split('.').some(x => Number(x) > 255) || Number(m[2]) > 32) throw Error('InvalidParameterValue: CIDR must be a valid IPv4 range such as 10.8.0.0/16');
            const bits = Number(m[2]), n = m[1].split('.').reduce((n, x) => n * 256 + Number(x), 0), block = 2 ** (32 - bits), base = Math.floor(n / block) * block;
            return [24, 16, 8, 0].map(b => Math.floor(base / 2 ** b) % 256).join('.') + '/' + bits;
          }
          let rules = [];
          try {
            const raw = flag('ip-permissions');
            if (raw && ['protocol', 'port', 'cidr', 'source-group'].some(x => toks.includes('--' + x))) throw Error('InvalidParameterCombination: use --ip-permissions or individual rule flags');
            let permissions;
            if (raw) {
              try { permissions = JSON.parse(raw); } catch (e) { throw Error('Simulator: --ip-permissions supports a JSON array; use --source-group for one shorthand rule'); }
              if (!Array.isArray(permissions) || !permissions.length) throw Error('InvalidParameterValue: --ip-permissions must be a nonempty JSON array');
            } else {
              const port = flag('port'), m = port && port.match(/^(\d+)(?:-(\d+))?$/);
              const cidr = flag('cidr'), group = flag('source-group');
              if ((!cidr && !group) || (cidr && group)) throw Error('InvalidParameterCombination: specify exactly one of --cidr or --source-group');
              permissions = [{ IpProtocol: flag('protocol'), FromPort: m ? Number(m[1]) : undefined, ToPort: m ? Number(m[2] || m[1]) : undefined,
                IpRanges: cidr ? [{ CidrIp: cidr }] : [], UserIdGroupPairs: group ? [{ GroupId: group }] : [] }];
            }
            for (const p of permissions) {
              if (!p || typeof p !== 'object') throw Error('InvalidParameterValue: each permission must be an object');
              const protocol = ({ '6': 'tcp', '17': 'udp' })[p.IpProtocol] || p.IpProtocol;
              if (!['tcp', 'udp', '-1'].includes(protocol)) throw Error('Simulator supports TCP, UDP and all-protocol (-1) SG rules here; ICMP/prefix-list/IPv6 rules are not modeled');
              if (protocol !== '-1' && (!Number.isInteger(p.FromPort) || !Number.isInteger(p.ToPort) || p.FromPort < 0 || p.ToPort > 65535 || p.FromPort > p.ToPort)) throw Error('InvalidParameterValue: TCP/UDP ports must be an ordered range within 0–65535');
              if (p.Ipv6Ranges || p.PrefixListIds) throw Error('Simulator: IPv6 and prefix-list permissions are not modeled');
              if ((p.IpRanges !== undefined && !Array.isArray(p.IpRanges)) || (p.UserIdGroupPairs !== undefined && !Array.isArray(p.UserIdGroupPairs))) throw Error('InvalidParameterValue: source permissions must be arrays');
              const peers = [...(p.IpRanges || []).map(x => ({ cidr: normalizeCIDR(x && x.CidrIp) })), ...(p.UserIdGroupPairs || []).map(x => {
                const source = x && list('securityGroups').find(g => g.id === x.GroupId);
                if (!source) throw Error('InvalidGroup.NotFound: source security group does not exist');
                if (source.vpcId !== sg.vpcId) throw Error('Simulator: cross-VPC security-group references require connectivity not modeled here');
                return { sourceGroup: source.id };
              })];
              if (!peers.length) throw Error('InvalidParameterValue: at least one source range/group is required');
              rules.push(...peers.map(peer => ({ protocol, ...(protocol === '-1' ? {} : { fromPort: p.FromPort, toPort: p.ToPort }), ...peer })));
            }
          } catch (e) { return print('err', e.message); }
          const same = (a, b) => (a.protocol || 'tcp') === b.protocol && a.fromPort === b.fromPort && a.toPort === b.toPort && a.cidr === b.cidr && a.sourceGroup === b.sourceGroup;
          const ingress = sg.ingress || [], adding = op === 'authorize-security-group-ingress';
          for (let i = 0; i < rules.length; i++) {
            const exists = ingress.some(r => same(r, rules[i]));
            if (adding && (exists || rules.slice(0, i).some(r => same(r, rules[i])))) return print('err', 'InvalidPermission.Duplicate: The specified rule already exists');
            if (!adding && !exists) return print('err', 'InvalidPermission.NotFound: The specified rule does not exist in this security group');
          }
          if (toks.includes('--dry-run') && toks.includes('--no-dry-run')) return print('err', 'aws: error: --dry-run and --no-dry-run are mutually exclusive');
          if (toks.includes('--dry-run')) return print('err', 'DryRunOperation: Request would have succeeded, but DryRun flag is set.');
          sg.ingress = adding ? [...ingress, ...rules] : ingress.filter(r => !rules.some(x => same(r, x)));
          return resultJson({ Return: true });
        } else if (op === 'modify-instance-metadata-options') {
          const inst = list('instances').find(i => i.id === flag('instance-id'));
          if (!inst) return print('err', `InvalidInstanceID.NotFound: The instance ID '${flag('instance-id')}' does not exist`);
          const t = flag('http-tokens');
          if (t) inst.imds = t;
          print('ok', prettyJson({ InstanceId: inst.id, InstanceMetadataOptions: { State: 'pending', HttpTokens: inst.imds || 'optional', HttpEndpoint: flag('http-endpoint') || 'enabled' } }));
        } else if (op === 'stop-instances' || op === 'start-instances' || op === 'reboot-instances' || op === 'terminate-instances') {
          const ids = flags('instance-ids');
          if (!ids.length) return print('err', 'error: --instance-ids <id> [<id> ...] required');
          const out = [];
          for (const id of ids) {
            const inst = list('instances').find(i => i.id === id);
            if (!inst) return print('err', `InvalidInstanceID.NotFound: The instance ID '${id}' does not exist`);
            const prev = inst.state;
            if (op === 'stop-instances') {
              inst.state = 'stopped';
              if (!inst.eip) inst.publicIp = null;          // auto-assigned public IP wapas AWS ko
              out.push({ InstanceId: id, PreviousState: { Name: prev }, CurrentState: { Name: 'stopping' } });
            } else if (op === 'start-instances') {
              if (prev === 'terminated') return print('err', `IncorrectInstanceState: The instance '${id}' is not in a state from which it can be started.`);
              inst.state = 'running';
              if (!inst.eip && inst.publicIp !== undefined && inst.hadPublic !== false) inst.publicIp = `13.233.${10 + Math.floor(Math.random() * 240)}.${1 + Math.floor(Math.random() * 250)}`;
              out.push({ InstanceId: id, PreviousState: { Name: prev }, CurrentState: { Name: 'pending' } });
            } else if (op === 'reboot-instances') {
              // reboot: same host, same IPs — sirf OS restart
            } else {
              inst.state = 'terminated';
              inst.publicIp = null;
              const vols = list('volumes');
              for (let j = vols.length - 1; j >= 0; j--) {
                const v = vols[j];
                if (v.attachedTo !== id) continue;
                if (v.deleteOnTermination) vols.splice(j, 1); else { v.attachedTo = null; v.state = 'available'; }
              }
              (list('addresses')).forEach(a => { if (a.instanceId === id) a.instanceId = null; });
              out.push({ InstanceId: id, PreviousState: { Name: prev }, CurrentState: { Name: 'shutting-down' } });
            }
          }
          if (op === 'reboot-instances') return print('ok', '');
          const key = { 'stop-instances': 'StoppingInstances', 'start-instances': 'StartingInstances', 'terminate-instances': 'TerminatingInstances' }[op];
          print('ok', prettyJson({ [key]: out }));
        } else if (op === 'modify-instance-attribute') {
          const inst = list('instances').find(i => i.id === flag('instance-id'));
          if (!inst) return print('err', `InvalidInstanceID.NotFound: The instance ID '${flag('instance-id')}' does not exist`);
          const t = (flag('instance-type') || '').replace(/^Value=/, '');
          if (!t) return print('err', 'error: --instance-type Value=<type> (is simulator mein sirf instance type change)');
          if (inst.state !== 'stopped') return print('err', `IncorrectInstanceState: The instance '${inst.id}' is not in the 'stopped' state. (Pehle stop-instances — type change sirf stopped instance par.)`);
          inst.type = t;
          print('ok', '');
        } else if (op === 'describe-instance-credit-specifications') {
          const ids = flags('instance-ids');
          const insts = list('instances').filter(i => !ids.length || ids.includes(i.id));
          print('ok', prettyJson({ InstanceCreditSpecifications: insts.filter(i => /^t\d/.test(i.type || '')).map(i => ({ InstanceId: i.id, CpuCredits: i.cpuCredits || 'unlimited' })) }));
        } else if (op === 'create-snapshot') {
          const vid = flag('volume-id');
          const v = list('volumes').find(x => x.id === vid);
          if (!v) return print('err', `InvalidVolume.NotFound: The volume '${vid}' does not exist.`);
          const sid = 'snap-' + Date.now().toString(16).slice(-12);
          list('snapshots').push({ id: sid, volumeId: vid, size: v.size, description: flag('description') || '', state: 'completed' });
          print('ok', prettyJson({ SnapshotId: sid, VolumeId: vid, VolumeSize: v.size, State: 'pending', Description: flag('description') || '' }));
        } else if (op === 'describe-snapshots') {
          const snaps = list('snapshots');
          print('ok', prettyJson({ Snapshots: snaps.map(x => ({ SnapshotId: x.id, VolumeId: x.volumeId, VolumeSize: x.size, State: x.state || 'completed', Description: x.description || '' })) }));
        } else if (op === 'allocate-address') {
          const n = list('addresses').length + 1;          // deterministic — hints/validator exact id likh sakein
          const ip = `13.234.10.${4 + n}`;
          const id = 'eipalloc-' + String(n).padStart(9, '0');
          list('addresses').push({ allocationId: id, publicIp: ip, instanceId: null });
          print('ok', prettyJson({ PublicIp: ip, AllocationId: id, Domain: 'vpc' }));
          print('sys', '(Elastic IP allocate ho gaya — instance se juda ho ya na ho, har public IPv4 ka ~$0.005/ghanta bill hota hai)');
        } else if (op === 'associate-address') {
          const a = list('addresses').find(x => x.allocationId === flag('allocation-id'));
          const inst = list('instances').find(i => i.id === flag('instance-id'));
          if (!a) return print('err', `InvalidAllocationID.NotFound: The allocation ID '${flag('allocation-id')}' does not exist`);
          if (!inst) return print('err', `InvalidInstanceID.NotFound: The instance ID '${flag('instance-id')}' does not exist`);
          a.instanceId = inst.id; inst.eip = a.publicIp; inst.publicIp = a.publicIp;
          print('ok', prettyJson({ AssociationId: 'eipassoc-' + Date.now().toString(16).slice(-10) }));
        } else if (op === 'describe-addresses') {
          print('ok', prettyJson({ Addresses: list('addresses').map(a => ({ PublicIp: a.publicIp, AllocationId: a.allocationId, InstanceId: a.instanceId || undefined, Domain: 'vpc' })) }));
        } else if (op === 'run-instances' || op === 'create-vpc' || op === 'create-subnet' || op === 'create-security-group') {
          print('err', `'${op}' is mission mein scripted nahi hai — file apply karo (ls dekho).`);
        } else if (op === 'describe-route-tables') {
          let rts = networkTables();
          const ids = flags('route-table-ids');
          if (toks.includes('--route-table-ids') && !ids.length) return print('err', 'error: --route-table-ids requires at least one route table ID');
          if (ids.some(id => !rts.some(rt => rt.id === id))) return print('err', 'InvalidRouteTableID.NotFound: The route table ID does not exist');
          if (ids.length) rts = rts.filter(rt => ids.includes(rt.id));
          for (const filter of flags('filters')) {
            const m = filter.match(/^Name=([^,]+),Values=(.+)$/);
            if (!m) return print('err', 'error: --filters uses Name=vpc-id,Values=vpc-id shorthand in this simulator');
            const values = m[2].split(',');
            const getters = {
              'vpc-id': rt => [rt.vpcId],
              'route-table-id': rt => [rt.id],
              'route.gateway-id': rt => rt.routes.filter(r => !/^nat-/.test(r.target)).map(r => r.target),
              'association.subnet-id': rt => rt.associations.map(a => a.subnetId),
              'association.route-table-association-id': rt => rt.associations.map(a => a.id),
              'association.main': rt => rt.associations.map(a => String(!!a.main)),
            };
            if (!Object.prototype.hasOwnProperty.call(getters, m[1])) return print('err', `InvalidParameterValue: filter '${m[1]}' is not supported in this simulator`);
            rts = rts.filter(rt => getters[m[1]](rt).some(value => values.includes(value)));
          }
          print('ok', prettyJson({ RouteTables: rts.map(rt => ({
            RouteTableId: rt.id, VpcId: rt.vpcId,
            Routes: rt.routes.map(r => ({ DestinationCidrBlock: r.destination,
              [/^nat-/.test(r.target) ? 'NatGatewayId' : 'GatewayId']: r.target,
              State: r.state || 'active', Origin: r.target === 'local' ? 'CreateRouteTable' : 'CreateRoute' })),
            Associations: rt.associations.map(a => ({ Main: !!a.main, SubnetId: a.subnetId,
              RouteTableAssociationId: a.id, RouteTableId: rt.id, AssociationState: { State: 'associated' } })),
          })) }));
        } else if (op === 'create-route' || op === 'delete-route') {
          const id = flag('route-table-id'), destination = ipv4Cidr(flag('destination-cidr-block'));
          if (!id || !flag('destination-cidr-block')) return print('err', 'error: --route-table-id and --destination-cidr-block are required');
          const rt = networkTables().find(t => t.id === id);
          if (!rt) return print('err', `InvalidRouteTableID.NotFound: The route table '${id}' does not exist`);
          if (!destination) return print('err', 'InvalidParameterValue: destination must be a valid IPv4 CIDR, for example 0.0.0.0/0');
          const existing = rt.routes.find(r => r.destination === destination);
          if (op === 'delete-route') {
            if (!existing) return print('err', `InvalidRoute.NotFound: no route with destination ${destination}`);
            if (existing.target === 'local' || existing.type === 'local') return print('err', 'InvalidParameterValue: cannot remove the local route. VPC-internal routing must remain.');
            if (toks.includes('--dry-run')) return print('err', 'DryRunOperation: Request would have succeeded, but DryRun flag is set.');
            rt.routes.splice(rt.routes.indexOf(existing), 1);
            return print('ok', ''); // AWS DeleteRoute has no response body.
          }
          const targets = ['gateway-id', 'nat-gateway-id'].filter(name => flag(name));
          if (targets.length !== 1) return print('err', 'InvalidParameterCombination: specify exactly one supported target, --gateway-id or --nat-gateway-id');
          const target = flag(targets[0]);
          if (targets[0] === 'gateway-id') {
            const igw = list('internetGateways').find(g => g.id === target);
            if (!igw) return print('err', `InvalidInternetGatewayID.NotFound: Internet gateway '${target}' does not exist`);
            if (igw.vpcId !== rt.vpcId) return print('err', `InvalidParameterValue: gateway '${target}' is not attached to VPC '${rt.vpcId}'`);
          } else {
            const nat = list('natGateways').find(g => g.id === target);
            if (!nat) return print('err', `InvalidNatGatewayID.NotFound: NAT gateway '${target}' does not exist`);
            const subnet = list('subnets').find(s => s.id === nat.subnetId);
            if (!subnet || subnet.vpcId !== rt.vpcId || (nat.state && nat.state !== 'available')) return print('err', 'InvalidParameterValue: NAT gateway must be available in the same VPC');
          }
          if (existing) return print('err', `RouteAlreadyExists: The route identified by ${destination} already exists`);
          if (toks.includes('--dry-run')) return print('err', 'DryRunOperation: Request would have succeeded, but DryRun flag is set.');
          rt.routes.push({ destination, target, type: targets[0] === 'gateway-id' ? 'igw' : 'nat', state: 'active' });
          print('ok', prettyJson({ Return: true }));
        } else if (op === 'associate-route-table' || op === 'replace-route-table-association') {
          const id = flag('route-table-id'), tables = networkTables();
          const rt = tables.find(t => t.id === id);
          if (!id) return print('err', 'error: --route-table-id is required');
          if (!rt) return print('err', `InvalidRouteTableID.NotFound: The route table '${id}' does not exist`);
          let subnet = null, oldTable = null, oldAssoc = null;
          if (op === 'associate-route-table') {
            const sid = flag('subnet-id');
            if (!sid) return print('err', 'error: --subnet-id is required');
            subnet = list('subnets').find(s => s.id === sid);
            if (!subnet) return print('err', `InvalidSubnetID.NotFound: The subnet '${sid}' does not exist`);
            if (tables.some(t => t.associations.some(a => a.subnetId === sid))) return print('err', 'Resource.AlreadyAssociated: subnet already has an explicit association. Use replace-route-table-association with the current association ID.');
          } else {
            const aid = flag('association-id');
            if (!aid) return print('err', 'error: --association-id is required. Read Associations in describe-route-tables.');
            oldTable = tables.find(t => t.associations.some(a => a.id === aid));
            oldAssoc = oldTable && oldTable.associations.find(a => a.id === aid);
            if (!oldAssoc) return print('err', `InvalidAssociationID.NotFound: The association ID '${aid}' does not exist. A replace returns a NEW association ID.`);
            if (oldTable.vpcId !== rt.vpcId) return print('err', 'InvalidParameterValue: route tables must belong to the same VPC');
            if (oldAssoc.subnetId) subnet = list('subnets').find(s => s.id === oldAssoc.subnetId);
            if (!oldAssoc.main && !subnet) return print('err', 'InvalidSubnetID.NotFound: associated subnet does not exist');
          }
          if (subnet && subnet.vpcId !== rt.vpcId) return print('err', 'InvalidParameterValue: subnet and route table must belong to the same VPC');
          if (toks.includes('--dry-run')) return print('err', 'DryRunOperation: Request would have succeeded, but DryRun flag is set.');
          const aid = nextAssociationId();
          if (oldAssoc) oldTable.associations.splice(oldTable.associations.indexOf(oldAssoc), 1);
          rt.associations.push({ id: aid, main: !!(oldAssoc && oldAssoc.main), ...(subnet ? { subnetId: subnet.id } : {}) });
          if (oldAssoc && oldAssoc.main) { oldTable.main = false; rt.main = true; }
          if (subnet) subnet.routeTable = rt.id;
          print('ok', prettyJson({ [op === 'associate-route-table' ? 'AssociationId' : 'NewAssociationId']: aid, AssociationState: { State: 'associated' } }));
        } else if (op === 'describe-network-acls') {
          let acls = list('networkAcls');
          for (const filter of flags('filters')) {
            const m = filter.match(/^Name=vpc-id,Values=(.+)$/);
            if (!m) return print('err', 'error: this simulator supports --filters Name=vpc-id,Values=vpc-id for network ACLs');
            acls = acls.filter(a => m[1].split(',').includes(a.vpcId));
          }
          print('ok', prettyJson({ NetworkAcls: acls.map(a => ({ NetworkAclId: a.id, VpcId: a.vpcId,
            IsDefault: !!a.default, Entries: a.entries || [], Associations: a.associations || [] })) }));
        } else if (op === 'describe-nat-gateways') {
          const nats = list('natGateways');
          if (!nats.length) return print('ok', '{\n    "NatGateways": []\n}');
          print('ok', '{\n    "NatGateways": [\n' +
            nats.map(n => `        { "NatGatewayId": "${n.id}", "SubnetId": "${n.subnetId}", "State": "${n.state || 'available'}", "NatGatewayAddresses": [{ "PublicIp": "${n.publicIp || '203.0.113.10'}" }] }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-internet-gateways') {
          const igws = list('internetGateways');
          if (!igws.length) return print('ok', '{\n    "InternetGateways": []\n}');
          print('ok', '{\n    "InternetGateways": [\n' +
            igws.map(i => `        { "InternetGatewayId": "${i.id}", "Attachments": [{ "VpcId": "${i.vpcId}", "State": "available" }] }`).join(',\n') +
            '\n    ]\n}');
        } else {
          print('err', `unknown EC2 op: ${op}`);
        }
        return;

      /* ===================== RDS ===================== */
      case 'rds': {
        const dbJson = r => ({ DBInstanceIdentifier: r.id, DBInstanceClass: r.class, Engine: r.engine,
          DBInstanceStatus: r.state, MultiAZ: !!r.multiAZ, BackupRetentionPeriod: r.backupRetention == null ? 1 : r.backupRetention,
          StorageEncrypted: !!r.encrypted, PubliclyAccessible: !!r.publicAccess, DeletionProtection: !!r.deletionProtection,
          AllocatedStorage: r.storage || 20, MaxAllocatedStorage: r.maxStorage || 0,
          ReadReplicaSourceDBInstanceIdentifier: r.source,
          ReadReplicaDBInstanceIdentifiers: list('rds').filter(x => x.source === r.id).map(x => x.id),
          Endpoint: { Address: r.endpoint, Port: /postgres/.test(r.engine || '') ? 5432 : /sqlserver/.test(r.engine || '') ? 1433 : /oracle/.test(r.engine || '') ? 1521 : 3306 },
          PendingModifiedValues: r.pending || {}, LatestRestorableTime: r.latestRestorableTime });
        const snapshotJson = x => ({ DBSnapshotIdentifier: x.id, DBInstanceIdentifier: x.source, Status: x.state,
          Engine: x.db.engine, AllocatedStorage: x.db.storage, Encrypted: !!x.db.encrypted, SnapshotType: 'manual' });
        const identifierOK = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9-]{0,62}$/.test(id) && !/--|-$/.test(id);
        const exactDB = id => list('rds').find(r => r.id === id);
        if (op === 'describe-db-instances') {
          const id = flag('db-instance-identifier');
          if (id && !exactDB(id)) return print('err', `DBInstanceNotFound: DBInstance ${id} not found`);
          print('ok', prettyJson({ DBInstances: list('rds').filter(r => !id || r.id === id).map(dbJson) }));
        } else if (op === 'describe-db-snapshots') {
          const sid = flag('db-snapshot-identifier'), id = flag('db-instance-identifier');
          if (sid && !list('dbSnapshots').some(x => x.id === sid)) return print('err', `DBSnapshotNotFound: ${sid} not found`);
          print('ok', prettyJson({ DBSnapshots: list('dbSnapshots').filter(x => (!sid || x.id === sid) && (!id || x.source === id)).map(snapshotJson) }));
        } else if (op === 'modify-db-instance') {
          const id = flag('db-instance-identifier'), r = exactDB(id);
          if (!id) return print('err', 'error: --db-instance-identifier is required');
          if (!r) return print('err', `DBInstanceNotFound: ${id} not found`);
          if (r.state !== 'available') return print('err', 'InvalidDBInstanceState: wait for the DB instance to become available');
          if (toks.includes('--storage-encrypted')) return print('err', 'Unknown options: --storage-encrypted. Existing DB encryption is not an in-place toggle; use a supported migration.');
          const pending = { ...(r.pending || {}) };
          const booleans = [['multi-az', 'MultiAZ'], ['publicly-accessible', 'PubliclyAccessible'], ['deletion-protection', 'DeletionProtection']];
          for (const [arg, key] of booleans) {
            const yes = toks.includes('--' + arg), no = toks.includes('--no-' + arg);
            if (yes && no) return print('err', `error: --${arg} and --no-${arg} are mutually exclusive`);
            if ((yes && flag(arg) !== null) || (no && flag('no-' + arg) !== null)) return print('err', `error: --${arg} is a boolean flag, without true/false. Use --no-${arg} to disable.`);
            if (yes || no) pending[key] = yes;
          }
          for (const [arg, key, min, max] of [['backup-retention-period', 'BackupRetentionPeriod', 0, 35], ['allocated-storage', 'AllocatedStorage', r.storage || 20, 65536], ['max-allocated-storage', 'MaxAllocatedStorage', 0, 65536]]) {
            if (!toks.includes('--' + arg)) continue;
            const value = Number(flag(arg));
            if (flag(arg) === null || flag(arg) === '' || !Number.isInteger(value) || value < min || value > max) return print('err', `InvalidParameterValue: --${arg} requires an integer in ${min}–${max}`);
            pending[key] = value;
          }
          const storage = pending.AllocatedStorage || r.storage || 20;
          const maxStorage = pending.MaxAllocatedStorage === undefined ? r.maxStorage || 0 : pending.MaxAllocatedStorage;
          if (maxStorage && maxStorage < storage) return print('err', 'InvalidParameterCombination: MaxAllocatedStorage cannot be less than AllocatedStorage');
          if (toks.includes('--db-instance-class')) {
            const cls = flag('db-instance-class');
            if (!cls || !/^db\.[a-z0-9]+\.[a-z0-9]+$/.test(cls)) return print('err', 'InvalidParameterValue: --db-instance-class must name a DB class, for example db.t3.micro');
            pending.DBInstanceClass = cls;
          }
          if (!Object.keys(pending).length) return print('err', 'error: specify a supported modification, such as --multi-az --backup-retention-period 7');
          r.pending = pending; r.pendingApply = toks.includes('--apply-immediately') ? 'immediate' : 'maintenance';
          if (r.pendingApply === 'immediate') r.state = 'modifying';
          print('ok', prettyJson({ DBInstance: dbJson(r) }));
          print('sys', r.pendingApply === 'immediate' ? 'Simulator: modification pending. Run aws rds wait db-instance-available; real AWS duration varies.' : 'Changes queued for maintenance. --apply-immediately applies pending changes sooner and can cause downtime.');
        } else if (op === 'wait') {
          const waiter = toks[3];
          if (waiter === 'db-instance-available') {
            const r = exactDB(flag('db-instance-identifier'));
            if (!r) return print('err', 'DBInstanceNotFound: specify an existing --db-instance-identifier');
            if (r.pendingApply === 'immediate') {
              const mapping = { MultiAZ: 'multiAZ', BackupRetentionPeriod: 'backupRetention', PubliclyAccessible: 'publicAccess', DeletionProtection: 'deletionProtection', DBInstanceClass: 'class', AllocatedStorage: 'storage', MaxAllocatedStorage: 'maxStorage' };
              Object.entries(r.pending || {}).forEach(([key, value]) => { if (mapping[key]) r[mapping[key]] = value; });
              r.pending = {}; delete r.pendingApply;
            }
            if (r.state === 'creating' || r.state === 'modifying') r.state = 'available';
            if (r.state !== 'available') return print('err', `Waiter DBInstanceAvailable failed: DB instance state is '${r.state}'`);
            print('sys', 'Simulator waiter: DB instance available. Real AWS waiter polls actual service state; no real SQL/failover test ran.');
          } else if (waiter === 'db-snapshot-available') {
            const x = list('dbSnapshots').find(x => x.id === flag('db-snapshot-identifier'));
            if (!x) return print('err', 'DBSnapshotNotFound: specify an existing --db-snapshot-identifier');
            x.state = 'available'; print('sys', 'Simulator waiter: snapshot available; real AWS data restore still needs validation.');
          } else print('err', 'error: supported RDS waiters: db-instance-available, db-snapshot-available');
        } else if (op === 'create-db-snapshot') {
          const id = flag('db-instance-identifier'), sid = flag('db-snapshot-identifier'), r = exactDB(id);
          if (!id || !sid) return print('err', 'error: --db-instance-identifier and --db-snapshot-identifier required');
          if (!r) return print('err', `DBInstanceNotFound: ${id} not found`);
          if (!identifierOK(sid)) return print('err', 'InvalidParameterValue: invalid DB snapshot identifier');
          if (r.state !== 'available') return print('err', 'InvalidDBInstanceState: snapshot requires an available source');
          if (list('dbSnapshots').some(x => x.id === sid)) return print('err', `DBSnapshotAlreadyExists: ${sid}`);
          const x = { id: sid, source: id, state: 'creating', db: JSON.parse(JSON.stringify(r)) };
          list('dbSnapshots').push(x); print('ok', prettyJson({ DBSnapshot: snapshotJson(x) }));
        } else if (op === 'create-db-instance-read-replica' || op === 'restore-db-instance-from-db-snapshot') {
          if (toks.includes('--publicly-accessible') && toks.includes('--no-publicly-accessible')) return print('err', 'error: --publicly-accessible and --no-publicly-accessible are mutually exclusive');
          const id = flag('db-instance-identifier');
          if (!identifierOK(id)) return print('err', 'InvalidParameterValue: --db-instance-identifier must be a valid new DB identifier');
          if (exactDB(id)) return print('err', `DBInstanceAlreadyExists: ${id}. Restore creates a NEW instance; source is not overwritten.`);
          let source;
          if (op === 'create-db-instance-read-replica') {
            source = exactDB(flag('source-db-instance-identifier'));
            if (!source) return print('err', 'DBInstanceNotFound: --source-db-instance-identifier must exist');
            if (!((source.backupRetention == null ? 1 : source.backupRetention) > 0)) return print('err', 'InvalidDBInstanceState: enable automated backups on the source before creating a read replica');
          } else {
            const x = list('dbSnapshots').find(x => x.id === flag('db-snapshot-identifier'));
            if (!x) return print('err', 'DBSnapshotNotFound: --db-snapshot-identifier must exist');
            if (x.state !== 'available') return print('err', 'InvalidDBSnapshotState: wait for the snapshot to become available');
            source = x.db;
          }
          if (source.state !== 'available') return print('err', 'InvalidDBInstanceState: source must be available');
          const r = JSON.parse(JSON.stringify(source));
          r.id = id; r.name = id; r.state = 'creating'; r.pending = {}; delete r.pendingApply;
          r.endpoint = `${id}.sim.${sim.account.region || 'us-east-1'}.rds.amazonaws.com`;
          r.deletionProtection = false; r.class = flag('db-instance-class') || r.class;
          if (op === 'create-db-instance-read-replica') { r.source = source.id; r.multiAZ = false; }
          else { delete r.source; r.restoredFrom = flag('db-snapshot-identifier'); }
          if (toks.includes('--no-publicly-accessible')) r.publicAccess = false;
          if (toks.includes('--publicly-accessible')) r.publicAccess = true;
          list('rds').push(r); print('ok', prettyJson({ DBInstance: dbJson(r) }));
        } else if (op === 'delete-db-snapshot') {
          const snaps = list('dbSnapshots'), idx = snaps.findIndex(x => x.id === flag('db-snapshot-identifier'));
          if (idx < 0) return print('err', 'DBSnapshotNotFound: specify an existing snapshot identifier');
          print('ok', prettyJson({ DBSnapshot: snapshotJson(snaps.splice(idx, 1)[0]) }));
        } else if (op === 'delete-db-instance') {
          const id = flag('db-instance-identifier'), r = exactDB(id);
          if (!r) return print('err', `DBInstanceNotFound: ${id || '(missing identifier)'} not found`);
          if (r.deletionProtection) return print('err', 'InvalidParameterCombination: Cannot delete protected DB Instance; disable deletion protection first.');
          if (!toks.includes('--skip-final-snapshot')) return print('err', 'error: final snapshot deletion path is not modeled here. Disposable fixtures require --skip-final-snapshot; production backup policy must be reviewed.');
          list('rds').splice(list('rds').indexOf(r), 1);
          print('ok', prettyJson({ DBInstance: { DBInstanceIdentifier: id, DBInstanceStatus: 'deleting' } }));
        } else if (op === 'describe-db-engine-versions') {
          print('sys', 'Engine/version availability changes. Use real AWS describe-db-engine-versions for the selected region; simulator does not publish a current support matrix.');
        } else print('err', `unknown RDS op: ${op}`);
        return;
      }

      /* ===================== LAMBDA ===================== */
      case 'lambda':
        if (op === 'list-functions') {
          const fns = list('lambdas');
          if (!fns.length) return print('ok', '{\n    "Functions": []\n}');
          print('ok', '{\n    "Functions": [\n' +
            fns.map(f => `        { "FunctionName": "${f.name}", "Runtime": "${f.runtime}", "Handler": "${f.handler}", "LastModified": "${f.lastModified || '2024-03-20T00:00:00.000+0000'}", "State": "${f.state || 'Active'}", "MemorySize": ${f.memory || 128}, "Timeout": ${f.timeout || 3} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'invoke') {
          const name = flag('function-name');
          if (!name) return print('err', 'error: --function-name required');
          const fn = find('lambdas', name);
          if (!fn) return print('err', `ResourceNotFoundException: Function '${name}' not found`);
          print('ok', `{ "StatusCode": 200, "ExecutedVersion": "$LATEST" }\n${fn.invokeResult || '{"status":"ok"}'}`);
        } else if (op === 'get-function') {
          const name = flag('function-name');
          const fn = find('lambdas', name);
          if (!fn) return print('err', `ResourceNotFoundException: Function '${name}' not found`);
          print('ok', `{ "Configuration": { "FunctionName": "${fn.name}", "Runtime": "${fn.runtime}", "Handler": "${fn.handler}", "State": "${fn.state || 'Active'}", "MemorySize": ${fn.memory || 128}, "Timeout": ${fn.timeout || 3} } }`);
        } else if (op === 'update-function-configuration') {
          const name = flag('function-name');
          const fn = find('lambdas', name);
          if (!fn) return print('err', `ResourceNotFoundException: Function '${name}' not found`);
          const mem = flag('memory-size');
          const to = flag('timeout');
          if (mem) fn.memory = Number(mem);
          if (to) fn.timeout = Number(to);
          print('ok', `{ "FunctionName": "${fn.name}", "MemorySize": ${fn.memory||128}, "Timeout": ${fn.timeout||3} }`);
        } else if (op === 'get-policy') {
          const name = flag('function-name');
          const fn = find('lambdas', name);
          if (!fn) return print('err', `ResourceNotFoundException: Function '${name}' not found`);
          if (fn.policy) print('ok', fn.policy);
          else print('err', `ResourceNotFoundException: The resource you requested does not exist`);
        } else if (op === 'delete-function') {
          const name = flag('function-name');
          const fns = list('lambdas');
          const idx = fns.findIndex(f => f.name === name);
          if (idx < 0) return print('err', `ResourceNotFoundException: Function '${name}' not found`);
          fns.splice(idx, 1);
          print('ok', '');
        } else {
          print('err', `unknown Lambda op: ${op}`);
        }
        return;

      /* ===================== DYNAMODB ===================== */
      case 'dynamodb':
        if (op === 'list-tables') {
          const tables = list('tables');
          if (!tables.length) return print('ok', '{\n    "TableNames": []\n}');
          print('ok', '{\n    "TableNames": [\n' + tables.map(t => `        "${t.name}"`).join(',\n') + '\n    ]\n}');
        } else if (op === 'describe-table') {
          const name = flag('table-name');
          if (!name) return print('err', 'error: --table-name required');
          const t = find('tables', name);
          if (!t) return print('err', `ResourceNotFoundException: Table '${name}' not found`);
          const attrDefs = [`{ "AttributeName": "${t.partitionKey}", "AttributeType": "S" }`];
          const keySchema = [`{ "AttributeName": "${t.partitionKey}", "KeyType": "HASH" }`];
          if (t.sortKey) {
            attrDefs.push(`{ "AttributeName": "${t.sortKey}", "AttributeType": "S" }`);
            keySchema.push(`{ "AttributeName": "${t.sortKey}", "KeyType": "RANGE" }`);
          }
          const cap = t.billing === 'PAY_PER_REQUEST'
            ? `"BillingModeSummary": { "BillingMode": "PAY_PER_REQUEST" }`
            : `"ProvisionedThroughput": { "ReadCapacityUnits": ${t.rcu || 5}, "WriteCapacityUnits": ${t.wcu || 5} }`;
          print('ok', `{ "Table": {
    "TableName": "${t.name}",
    "AttributeDefinitions": [${attrDefs.join(', ')}],
    "KeySchema": [${keySchema.join(', ')}],
    ${cap},
    "ItemCount": ${t.items ? t.items.length : 0},
    "TableStatus": "ACTIVE"
} }`);
        } else if (op === 'scan') {
          const name = flag('table-name');
          if (!name) return print('err', 'error: --table-name required');
          const t = find('tables', name);
          if (!t) return print('err', `ResourceNotFoundException: Table '${name}' not found`);
          const items = t.items || [];
          print('ok', `{ "Items": [${items.map(it => JSON.stringify(ddbTyped(it))).join(', ')}], "Count": ${items.length}, "ScannedCount": ${items.length} }`);
          if (items.length) print('sys', `(scan ne poori table padhi — ${items.length} items ka read capacity kharch. Badi table par scan = mehenga + slow; query use karo)`);
        } else if (op === 'get-item') {
          const name = flag('table-name');
          const t = find('tables', name);
          if (!t) return print('err', `ResourceNotFoundException: Table '${name}' not found`);
          const keyRaw = flag('key');
          if (!keyRaw) return print('err', `error: --key required   (e.g. --key '{"${t.partitionKey}":{"S":"42"}}')`);
          let key;
          try { key = ddbPlain(JSON.parse(keyRaw)); } catch (e) { return print('err', `Error parsing parameter '--key': Invalid JSON — single quotes ke andar likho: --key '{"${t.partitionKey}":{"S":"42"}}'`); }
          if (key[t.partitionKey] == null) return print('err', `ValidationException: The provided key element does not match the schema (partition key '${t.partitionKey}' chahiye)`);
          const hit = (t.items || []).find(it => String(it[t.partitionKey]) === String(key[t.partitionKey]) && (!t.sortKey || key[t.sortKey] == null || String(it[t.sortKey]) === String(key[t.sortKey])));
          print('ok', hit ? `{ "Item": ${JSON.stringify(ddbTyped(hit))} }` : '{}   ← item nahi mila (get-item khaali {} deta hai, error nahi)');
        } else if (op === 'query') {
          const name = flag('table-name');
          if (!name) return print('err', 'error: --table-name required');
          const t = find('tables', name);
          if (!t) return print('err', `ResourceNotFoundException: Table '${name}' not found`);
          let pkVal = null;
          const kce = flag('key-condition-expression');
          if (kce != null) {
            // asli syntax: --key-condition-expression "user_id = :u" --expression-attribute-values '{":u":{"S":"42"}}'
            let names = {}, values = {};
            try { names = JSON.parse(flag('expression-attribute-names') || '{}'); } catch (e) { return print('err', "Error parsing parameter '--expression-attribute-names': Invalid JSON"); }
            try { values = JSON.parse(flag('expression-attribute-values') || '{}'); } catch (e) { return print('err', "Error parsing parameter '--expression-attribute-values': Invalid JSON"); }
            const m = kce.match(/^\s*([#\w]+)\s*=\s*(:\w+)/);
            if (!m) return print('err', 'ValidationException: Invalid KeyConditionExpression (format: "<partition key> = :v")');
            let attr = m[1];
            if (attr.startsWith('#')) {
              if (!names[attr]) return print('err', `ValidationException: An expression attribute name used in the document path is not defined; attribute name: ${attr}`);
              attr = names[attr];
            } else if (DDB_RESERVED.includes(attr.toUpperCase())) {
              return print('err', `ValidationException: Invalid KeyConditionExpression: Attribute name is a reserved keyword; reserved keyword: ${attr}\n(fix: --key-condition-expression "#k = :v" --expression-attribute-names '{"#k":"${attr}"}')`);
            }
            if (attr !== t.partitionKey) return print('err', `ValidationException: Query condition missed key schema element: ${t.partitionKey}`);
            const v = values[m[2]];
            if (!v) return print('err', `ValidationException: An expression attribute value used in expression is not defined; attribute value: ${m[2]}`);
            pkVal = String(ddbPlain({ x: v }).x);
          } else {
            pkVal = flag('partition-key') || flag('key-value');
            if (pkVal == null) return print('err', `error: --key-condition-expression required\n(e.g. --key-condition-expression "${t.partitionKey} = :v" --expression-attribute-values '{":v":{"S":"..."}}')`);
            print('sys', `(simulator shortcut — asli CLI: aws dynamodb query --table-name ${t.name} --key-condition-expression "#k = :v" --expression-attribute-names '{"#k":"${t.partitionKey}"}' --expression-attribute-values '{":v":{"S":"${pkVal}"}}')`);
          }
          const items = (t.items || []).filter(it => String(it[t.partitionKey]) === pkVal);
          print('ok', `{ "Items": [${items.map(it => JSON.stringify(ddbTyped(it))).join(', ')}], "Count": ${items.length}, "ScannedCount": ${items.length} }`);
        } else if (op === 'put-item') {
          const name = flag('table-name');
          if (!name) return print('err', 'error: --table-name required');
          const t = find('tables', name);
          if (!t) return print('err', `ResourceNotFoundException: Table '${name}' not found`);
          let item = {};
          const itemRaw = flag('item');
          if (itemRaw != null) {
            try { item = ddbPlain(JSON.parse(itemRaw)); }
            catch (e) { return print('err', `Error parsing parameter '--item': Invalid JSON — poora JSON single quotes mein: --item '{"${t.partitionKey}":{"S":"1"}}'`); }
          } else {
            // purana shortcut: user_id=42 name=Ravi
            toks.filter(tk => /^[a-zA-Z_]+=/.test(tk)).forEach(a => { const eq = a.indexOf('='); item[a.slice(0, eq)] = a.slice(eq + 1); });
          }
          if (item[t.partitionKey] == null) return print('err', `ValidationException: One of the required keys was not given a value (partition key '${t.partitionKey}')   e.g. --item '{"${t.partitionKey}":{"S":"1"}}'`);
          t.items = t.items || [];
          const existing = t.items.findIndex(it => String(it[t.partitionKey]) === String(item[t.partitionKey]) && (!t.sortKey || String(it[t.sortKey]) === String(item[t.sortKey])));
          const cond = flag('condition-expression');
          if (cond && /attribute_not_exists/.test(cond) && existing > -1)
            return print('err', 'An error occurred (ConditionalCheckFailedException) when calling the PutItem operation: The conditional request failed\n← item pehle se hai — duplicate likha nahi gaya (idempotency kaam kar gayi ✅)');
          if (existing > -1) t.items[existing] = item; else t.items.push(item);
          print('ok', '');
        } else if (op === 'delete-item') {
          const name = flag('table-name');
          const t = find('tables', name);
          if (!t) return print('err', `ResourceNotFoundException: Table '${name}' not found`);
          let pkVal = flag('partition-key') || flag('key-value');
          const keyRaw = flag('key');
          if (keyRaw) { try { pkVal = String(ddbPlain(JSON.parse(keyRaw))[t.partitionKey]); } catch (e) { return print('err', "Error parsing parameter '--key': Invalid JSON"); } }
          if (!pkVal) return print('err', `error: --key required   (e.g. --key '{"${t.partitionKey}":{"S":"42"}}')`);
          t.items = (t.items || []).filter(it => String(it[t.partitionKey]) !== pkVal);
          print('ok', '');
        } else if (op === 'update-table') {
          const name = flag('table-name');
          const t = find('tables', name);
          if (!t) return print('err', `ResourceNotFoundException: Table '${name}' not found`);
          // asli: --provisioned-throughput ReadCapacityUnits=50,WriteCapacityUnits=50   |  --billing-mode PAY_PER_REQUEST
          const pt = flag('provisioned-throughput') || '';
          const rcu = (pt.match(/ReadCapacityUnits=(\d+)/) || [])[1] || flag('read-capacity');
          const wcu = (pt.match(/WriteCapacityUnits=(\d+)/) || [])[1] || flag('write-capacity');
          const bm = flag('billing-mode');
          if (bm) t.billing = bm.toUpperCase();
          if (rcu) { t.rcu = Number(rcu); t.billing = 'PROVISIONED'; }
          if (wcu) { t.wcu = Number(wcu); t.billing = 'PROVISIONED'; }
          if (!pt && (flag('read-capacity') || flag('write-capacity')))
            print('sys', `(simulator shortcut — asli CLI: --provisioned-throughput ReadCapacityUnits=${t.rcu || 5},WriteCapacityUnits=${t.wcu || 5})`);
          const cap = t.billing === 'PAY_PER_REQUEST'
            ? `"BillingModeSummary": { "BillingMode": "PAY_PER_REQUEST" }`
            : `"ProvisionedThroughput": { "ReadCapacityUnits": ${t.rcu || 5}, "WriteCapacityUnits": ${t.wcu || 5} }`;
          print('ok', `{ "TableDescription": { "TableName": "${t.name}", ${cap}, "TableStatus": "UPDATING" } }`);
        } else {
          print('err', `unknown DynamoDB op: ${op}`);
        }
        return;

      /* ===================== ROUTE 53 ===================== */
      case 'route53':
        if (op === 'list-hosted-zones') {
          const zones = list('hostedZones');
          if (!zones.length) return print('ok', '{\n    "HostedZones": []\n}');
          print('ok', '{\n    "HostedZones": [\n' +
            zones.map(z => `        { "Id": "/hostedzone/${z.id}", "Name": "${z.name}.", "Config": { "PrivateZone": false }, "ResourceRecordSetCount": ${(z.records || []).length} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-resource-record-sets') {
          const zid = (flag('hosted-zone-id') || '').replace('/hostedzone/', '');
          const z = list('hostedZones').find(x => x.id === zid);
          if (!z) return print('err', 'NoSuchHostedZone');
          print('ok', '{\n    "ResourceRecordSets": [\n' +
            (z.records || []).map(r => `        { "Name": "${r.name}", "Type": "${r.type}", "TTL": 300, "ResourceRecords": [{ "Value": "${r.value}" }] }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-health-checks') {
          const hcs = list('healthChecks');
          if (!hcs.length) return print('ok', '{\n    "HealthChecks": []\n}');
          print('ok', '{\n    "HealthChecks": [\n' +
            hcs.map(h => `        { "Id": "${h.id}", "Type": "${h.type || 'HTTPS'}", "FullyQualifiedDomainName": "${h.fqdn || ''}", "HealthCheckStatus": "${h.status || 'Healthy'}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'get-health-check') {
          const id = flag('health-check-id');
          if (!id) return print('err', 'error: --health-check-id required');
          const h = list('healthChecks').find(x => x.id === id);
          if (!h) return print('err', `NoSuchHealthCheck: ${id}`);
          print('ok', `{ "HealthCheck": { "Id": "${h.id}", "Type": "${h.type || 'HTTPS'}", "FullyQualifiedDomainName": "${h.fqdn || ''}" } }`);
        } else if (op === 'create-health-check') {
          const fqdn = flag('fqdn');
          if (!fqdn) return print('err', 'error: --fqdn required');
          const hcs = list('healthChecks');
          const id = 'hc-' + Date.now().toString(36);
          hcs.push({ id, type: 'HTTPS', fqdn, status: 'Healthy' });
          print('ok', `{ "HealthCheck": { "Id": "${id}", "Type": "HTTPS", "FullyQualifiedDomainName": "${fqdn}" } }`);
        } else {
          print('err', `unknown Route53 op: ${op}`);
        }
        return;

      /* ===================== CLOUDFORMATION ===================== */
      case 'cloudformation':
        if (op === 'describe-stacks') {
          const stacks = list('stacks');
          if (!stacks.length) return print('ok', '{\n    "Stacks": []\n}');
          print('ok', '{\n    "Stacks": [\n' +
            stacks.map(s => `        { "StackName": "${s.name}", "StackId": "arn:aws:cloudformation:${sim.account.region || 'us-east-1'}:123456789012:stack/${s.name}/abc", "StackStatus": "${s.status}", "CreationTime": "2024-04-01T10:00:00.000Z" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-stack-events') {
          const name = flag('stack-name');
          if (!name) return print('err', 'error: --stack-name required');
          const s = list('stacks').find(x => x.name === name);
          if (!s) return print('err', `ValidationError: Stack [${name}] does not exist`);
          const events = s.events || [];
          if (!events.length) return print('ok', '{\n    "StackEvents": []\n}');
          print('ok', '{\n    "StackEvents": [\n' +
            events.map((e, i) => `        { "EventId": "EventId${i}", "StackName": "${name}", "LogicalResourceId": "${e.logical || 'Stack'}", "ResourceStatus": "${e.status}", "ResourceStatusReason": "${e.reason || ''}", "Timestamp": "${e.time || '2024-04-01T10:00:00.000Z'}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-stack-resources') {
          const name = flag('stack-name');
          const s = list('stacks').find(x => x.name === name);
          if (!s) return print('err', `ValidationError: Stack [${name}] does not exist`);
          print('ok', '{ "StackResources": [] }');
        } else if (op === 'create-stack' || op === 'update-stack' || op === 'delete-stack') {
          print('err', `'${op}' is mission mein scripted nahi hai — file apply karo (ls dekho) ya terraform use karo.`);
        } else {
          print('err', `unknown CloudFormation op: ${op}`);
        }
        return;

      /* ===================== CLOUDWATCH ===================== */
      case 'cloudwatch':
        if (op === 'describe-alarms') {
          const alarms = list('alarms');
          if (!alarms.length) return print('ok', '{\n    "MetricAlarms": []\n}');
          print('ok', '{\n    "MetricAlarms": [\n' +
            alarms.map(a => `        { "AlarmName": "${a.name}", "StateValue": "${a.state}", "MetricName": "${a.metric}", "Namespace": "${a.namespace || 'AWS/EC2'}", "Threshold": ${a.threshold} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-alarms-for-metric') {
          print('ok', '{\n    "MetricAlarms": []\n}');
        } else if (op === 'put-metric-alarm') {
          const name = flag('alarm-name');
          if (!name) return print('err', 'error: --alarm-name required');
          const alarms = list('alarms');
          if (alarms.find(a => a.name === name)) return print('err', `Alarm '${name}' already exists`);
          alarms.push({ name, metric: flag('metric-name') || 'CPUUtilization', namespace: flag('namespace') || 'AWS/EC2', threshold: Number(flag('threshold') || 80), state: 'INSUFFICIENT_DATA' });
          print('ok', `Alarm created: ${name}`);
        } else if (op === 'delete-alarms') {
          const name = flag('alarm-names');
          if (!name) return print('err', 'error: --alarm-names required');
          const alarms = list('alarms');
          const idx = alarms.findIndex(a => a.name === name);
          if (idx < 0) return print('err', `ResourceNotFound: Alarm '${name}' not found`);
          alarms.splice(idx, 1);
          print('ok', '');
        } else if (op === 'set-alarm-state') {
          const name = flag('alarm-name');
          const state = flag('state-value');
          if (!name || !state) return print('err', 'error: --alarm-name and --state-value required');
          const a = find('alarms', name);
          if (!a) return print('err', `ResourceNotFound: Alarm '${name}' not found`);
          a.state = state.toUpperCase();
          print('ok', '');
        } else if (op === 'get-metric-statistics') {
          print('ok', '{\n    "Datapoints": []\n}');
        } else {
          print('err', `unknown CloudWatch op: ${op}`);
        }
        return;

      /* ===================== KMS ===================== */
      case 'kms':
        if (op === 'list-keys') {
          const keys = list('kmsKeys');
          if (!keys.length) return print('ok', '{\n    "Keys": []\n}');
          print('ok', '{\n    "Keys": [\n' +
            keys.map(k => `        { "KeyId": "${k.id}", "KeyArn": "arn:aws:kms:${sim.account.region || 'us-east-1'}:123456789012:key/${k.id}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-key') {
          const id = flag('key-id');
          if (!id) return print('err', 'error: --key-id required');
          const k = list('kmsKeys').find(x => x.id === id);
          if (!k) return print('err', `NotFoundException: Key '${id}' does not exist`);
          print('ok', `{ "KeyMetadata": { "KeyId": "${k.id}", "KeyState": "${k.state || 'Enabled'}", "Description": "${k.alias}" } }`);
        } else if (op === 'list-aliases') {
          const keys = list('kmsKeys');
          print('ok', '{\n    "Aliases": [\n' +
            keys.map(k => `        { "AliasName": "alias/${k.alias}", "TargetKeyId": "${k.id}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'create-key') {
          const keys = list('kmsKeys');
          const id = 'key-' + Date.now().toString(36);
          const desc = flag('description') || 'aws-managed';
          keys.push({ id, alias: desc, state: 'Enabled' });
          print('ok', `{ "KeyMetadata": { "KeyId": "${id}", "KeyState": "Enabled", "Description": "${desc}" } }`);
        } else if (op === 'enable-key') {
          const id = flag('key-id');
          const k = list('kmsKeys').find(x => x.id === id);
          if (!k) return print('err', `NotFoundException: Key '${id}' does not exist`);
          k.state = 'Enabled';
          print('ok', '');
        } else if (op === 'disable-key') {
          const id = flag('key-id');
          const k = list('kmsKeys').find(x => x.id === id);
          if (!k) return print('err', `NotFoundException: Key '${id}' does not exist`);
          k.state = 'Disabled';
          print('ok', '');
        } else if (op === 'schedule-key-deletion') {
          const id = flag('key-id');
          const k = list('kmsKeys').find(x => x.id === id);
          if (!k) return print('err', `NotFoundException: Key '${id}' does not exist`);
          // asli default 30 din (minimum 7, maximum 30) — is beech key wapas cancel-key-deletion se bach sakti hai
          const days = Math.min(30, Math.max(7, Number(flag('pending-window-in-days') || 30)));
          k.state = 'PendingDeletion';
          print('ok', `{ "KeyId": "${id}", "KeyState": "PendingDeletion", "PendingWindowInDays": ${days}, "DeletionDate": "${new Date(Date.now() + days * 86400000).toISOString()}" }`);
        } else if (op === 'cancel-key-deletion') {
          const id = flag('key-id');
          const k = list('kmsKeys').find(x => x.id === id);
          if (!k) return print('err', `NotFoundException: Key '${id}' does not exist`);
          k.state = 'Disabled';
          print('ok', `{ "KeyId": "${id}" }   ← key bach gayi, par state Disabled hai — enable-key se wapas on karo`);
        } else if (op === 'get-key-policy') {
          const id = flag('key-id');
          const k = list('kmsKeys').find(x => x.id === id);
          if (!k) return print('err', `NotFoundException: Key '${id}' does not exist`);
          // AWS ka default key policy: account root ko poora control, phir IAM policies decide karti hain
          print('ok', prettyJson({ Version: '2012-10-17', Id: 'key-default-1', Statement: [{ Sid: 'Enable IAM User Permissions', Effect: 'Allow', Principal: { AWS: `arn:aws:iam::${sim.account.callerIdentity?.Account || '123456789012'}:root` }, Action: 'kms:*', Resource: '*' }] }));
        } else {
          print('err', `unknown KMS op: ${op}`);
        }
        return;

      /* ===================== CLOUDWATCH LOGS ===================== */
      case 'logs':
        if (op === 'describe-log-groups') {
          const lgs = list('logGroups');
          if (!lgs.length) return print('ok', '{\n    "logGroups": []\n}');
          print('ok', '{\n    "logGroups": [\n' +
            lgs.map(l => `        { "logGroupName": "${l.name}", "retentionInDays": ${l.retention || 'null'} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-log-streams') {
          print('ok', '{\n    "logStreams": []\n}');
        } else if (op === 'get-log-events') {
          const name = flag('log-group-name');
          const lg = list('logGroups').find(x => x.name === name);
          if (!lg) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
          const events = (lg.events || []).map(e => `    { "timestamp": ${Date.now()}, "message": ${J(e)} }`).join(',\n');
          print('ok', `{\n    "events": [\n${events}\n    ]\n}`);
        } else if (op === 'filter-log-events') {
          const name = flag('log-group-name');
          const pattern = flag('filter-pattern');
          const lgs = list('logGroups');
          let events = [];
          if (name) {
            const lg = lgs.find(x => x.name === name);
            if (!lg) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
            (lg.events || []).forEach(e => events.push({ group: lg.name, msg: e }));
          } else {
            lgs.forEach(lg => (lg.events || []).forEach(e => events.push({ group: lg.name, msg: e })));
          }
          // CloudWatch filter pattern (simple form): "ERROR timeout" = dono words (AND),
          // "?ERROR ?WARN" = koi bhi ek (OR), "" = sab
          if (pattern && pattern !== '*') {
            const terms = pattern.match(/\?"[^"]*"|\?\S+|"[^"]*"|\S+/g) || [];
            const any = terms.filter(t => t.startsWith('?')).map(t => t.slice(1).replace(/"/g, ''));
            const all = terms.filter(t => !t.startsWith('?')).map(t => t.replace(/"/g, ''));
            events = events.filter(e => {
              const m = String(e.msg);
              return all.every(t => m.includes(t)) && (!any.length || any.some(t => m.includes(t)));
            });
          }
          if (!events.length) return print('ok', '{\n    "events": []\n}');
          print('ok', '{\n    "events": [\n' + events.map(e => `        { "logGroupName": ${J(e.group)}, "message": ${J(e.msg)} }`).join(',\n') + '\n    ]\n}');
        } else if (op === 'create-log-group') {
          const name = flag('log-group-name');
          if (!name) return print('err', 'error: --log-group-name required');
          const lgs = list('logGroups');
          if (lgs.find(l => l.name === name)) return print('err', `ResourceAlreadyExistsException: log group '${name}' already exists`);
          lgs.push({ name, retention: null, events: [] });
          print('ok', '');
        } else if (op === 'put-retention-policy') {
          const name = flag('log-group-name');
          const days = flag('retention-in-days');
          if (!name || !days) return print('err', 'error: --log-group-name and --retention-in-days required');
          const lg = list('logGroups').find(x => x.name === name);
          if (!lg) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
          lg.retention = Number(days);
          print('ok', '');
        } else if (op === 'delete-log-group') {
          const name = flag('log-group-name');
          if (!name) return print('err', 'error: --log-group-name required');
          const lgs = list('logGroups');
          const idx = lgs.findIndex(l => l.name === name);
          if (idx < 0) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
          lgs.splice(idx, 1);
          print('ok', '');
        } else if (op === 'describe-subscription-filters') {
          const name = flag('log-group-name');
          const lg = list('logGroups').find(x => x.name === name);
          if (!lg) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
          const subs = lg.subscriptionFilters || [];
          if (!subs.length) return print('ok', '{\n    "subscriptionFilters": []\n}   ← koi subscription nahi = logs kahin stream nahi ho rahe (sirf CloudWatch mein pade hain)');
          print('ok', '{\n    "subscriptionFilters": [\n' +
            subs.map(f => `        { "filterName": "${f.name}", "logGroupName": "${lg.name}", "filterPattern": "${f.pattern || ''}", "destinationArn": "${f.destinationArn}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'put-subscription-filter') {
          const name = flag('log-group-name');
          const fname = flag('filter-name');
          const pattern = flag('filter-pattern');
          const dest = flag('destination-arn');
          if (!name || !fname || dest == null) return print('err', 'error: --log-group-name, --filter-name, --destination-arn required (--filter-pattern "" = sab logs)');
          const lg = list('logGroups').find(x => x.name === name);
          if (!lg) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
          lg.subscriptionFilters = lg.subscriptionFilters || [];
          const ex = lg.subscriptionFilters.find(f => f.name === fname);
          if (!ex && lg.subscriptionFilters.length >= 2)
            return print('err', 'LimitExceededException: Resource limit exceeded. (ek log group par maximum 2 subscription filters — purana delete karo ya same --filter-name se update karo)');
          const f = ex || { name: fname };
          f.pattern = pattern || ''; f.destinationArn = dest;
          if (!ex) lg.subscriptionFilters.push(f);
          print('ok', '');
        } else if (op === 'delete-subscription-filter') {
          const name = flag('log-group-name');
          const fname = flag('filter-name');
          const lg = list('logGroups').find(x => x.name === name);
          if (!lg) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
          lg.subscriptionFilters = (lg.subscriptionFilters || []).filter(f => f.name !== fname);
          print('ok', '');
        } else if (op === 'put-metric-filter') {
          const name = flag('log-group-name');
          const fname = flag('filter-name');
          if (!name || !fname) return print('err', 'error: --log-group-name and --filter-name required');
          const lg = list('logGroups').find(x => x.name === name);
          if (!lg) return print('err', `ResourceNotFoundException: log group '${name}' not found`);
          lg.metricFilters = lg.metricFilters || [];
          if (!lg.metricFilters.includes(fname)) lg.metricFilters.push(fname);
          print('ok', '');
        } else {
          print('err', `unknown logs op: ${op}`);
        }
        return;

      /* ===================== CLOUDFRONT ===================== */
      case 'cloudfront':
        if (op === 'list-distributions') {
          const cfs = list('cloudfront');
          if (!cfs.length) return print('ok', '{\n    "DistributionList": { "Items": [] }\n}');
          print('ok', '{\n    "DistributionList": {\n        "Items": [\n' +
            cfs.map(c => `            { "Id": "${c.id}", "DomainName": "${c.domain}", "Status": "${c.status}", "Enabled": ${c.enabled ? 'true' : 'false'} }`).join(',\n') +
            '\n        ]\n    }\n}');
        } else if (op === 'get-distribution') {
          const id = flag('id');
          const c = list('cloudfront').find(x => x.id === id);
          if (!c) return print('err', `NoSuchDistribution: ${id}`);
          print('ok', `{ "Distribution": { "Id": "${c.id}", "DomainName": "${c.domain}", "Status": "${c.status}", "Enabled": ${c.enabled} } }`);
        } else if (op === 'get-distribution-config') {
          const id = flag('id');
          const c = list('cloudfront').find(x => x.id === id);
          if (!c) return print('err', `NoSuchDistribution: ${id}`);
          print('ok', `{ "DistributionConfig": { "Id": "${c.id}", "Enabled": ${c.enabled}, "Origins": { "Items": [${(c.origins||[]).map(o => `{ "DomainName": "${o}" }`).join(', ')}] }, "DefaultCacheBehavior": { "ViewerProtocolPolicy": "redirect-to-https" } } }`);
        } else if (op === 'create-invalidation') {
          const id = flag('distribution-id');
          const paths = flag('paths') || '/*';
          const c = list('cloudfront').find(x => x.id === id);
          if (!c) return print('err', `NoSuchDistribution: ${id}`);
          print('ok', `{ "Invalidation": { "Id": "I${Date.now()}", "Status": "InProgress", "InvalidationBatch": { "Paths": { "Items": ["${paths}"] } } } }`);
        } else if (op === 'disable-distribution' || op === 'delete-distribution') {
          const id = flag('id');
          const cfs = list('cloudfront');
          const c = cfs.find(x => x.id === id);
          if (!c) return print('err', `NoSuchDistribution: ${id}`);
          if (op === 'delete-distribution' && c.enabled) return print('err', `DistributionNotDisabled: Disable karo pehle (aws cloudfront disable-distribution --id ${id})`);
          if (op === 'disable-distribution') { c.enabled = false; print('ok', `Distribution ${id} disabled.`); }
          else { cfs.splice(cfs.indexOf(c), 1); print('ok', `Distribution ${id} deleted.`); }
        } else {
          print('err', `unknown CloudFront op: ${op}`);
        }
        return;

      /* ===================== ELBV2 ===================== */
      case 'elbv2': {
        const tgArn = flag('target-group-arn');
        const tg = groupTargets().find(t => t.arn === tgArn);
        const jsonTG = t => ({ TargetGroupArn: t.arn, TargetGroupName: t.name, VpcId: t.vpcId,
          Protocol: t.protocol || 'HTTP', Port: t.port || 8080, TargetType: t.targetType || 'instance',
          HealthCheckPath: t.healthCheckPath || '/', HealthCheckProtocol: t.healthCheckProtocol || 'HTTP', HealthCheckPort: t.healthCheckPort || 'traffic-port',
          HealthCheckIntervalSeconds: t.interval || 30, HealthCheckTimeoutSeconds: t.timeout || 5,
          HealthyThresholdCount: t.healthyThreshold || 5, UnhealthyThresholdCount: t.unhealthyThreshold || 2,
          Matcher: { HttpCode: t.matcher || '200' }, LoadBalancerArns: t.loadBalancerArn ? [t.loadBalancerArn] : [] });
        if (op === 'describe-load-balancers') {
          let lbs = list('elbs');
          const names = flags('names'), arns = flags('load-balancer-arns');
          if (names.length) lbs = lbs.filter(l => names.includes(l.name));
          if (arns.length) lbs = lbs.filter(l => arns.includes(l.arn || l.id));
          if ((names.length || arns.length) && !lbs.length) return print('err', 'LoadBalancerNotFound: One or more load balancers not found');
          return resultJson({ LoadBalancers: lbs.map(l => ({ LoadBalancerArn: l.arn || `arn:aws:elasticloadbalancing:${sim.account.region || 'us-east-1'}:123456789012:loadbalancer/app/${l.name}/0000000000000001`,
            LoadBalancerName: l.name, Type: l.type, Scheme: l.scheme, DNSName: l.dns,
            State: { Code: 'active' }, SecurityGroups: l.sgIds || [], AvailabilityZones: (l.subnetIds || []).map(id => { const sub = list('subnets').find(s => s.id === id); return { SubnetId: id, ZoneName: sub && sub.az }; }) })) });
        }
        if (op === 'describe-listeners') {
          const lb = list('elbs').find(l => (l.arn || l.id) === flag('load-balancer-arn'));
          if (!lb) return print('err', 'LoadBalancerNotFound: Specify an existing --load-balancer-arn');
          return resultJson({ Listeners: lb.listeners || [] });
        }
        if (op === 'describe-target-groups') {
          const arns = flags('target-group-arns'), names = flags('names');
          if (arns.some(arn => !groupTargets().some(t => t.arn === arn))) return print('err', 'TargetGroupNotFound: One or more target groups not found');
          const groups = groupTargets().filter(t => (!arns.length || arns.includes(t.arn)) && (!names.length || names.includes(t.name)) && (!flag('load-balancer-arn') || t.loadBalancerArn === flag('load-balancer-arn')));
          return resultJson({ TargetGroups: groups.map(jsonTG) });
        }
        if (!tgArn) return print('err', 'aws: error: the following arguments are required: --target-group-arn');
        if (!tg) return print('err', `TargetGroupNotFound: Target group '${tgArn}' not found`);
        if (op === 'describe-target-health') {
          let targets = tg.targets || [];
          if (toks.includes('--targets')) {
            const selectors = flags('targets').map(s => s.match(/^Id=([^,]+)(?:,Port=(\d+))?$/));
            if (!selectors.length || selectors.some(m => !m)) return print('err', 'error: --targets uses Id=instance-id,Port=8080 shorthand in this simulator');
            targets = selectors.map(m => targets.find(t => t.id === m[1] && (!m[2] || t.port === Number(m[2]))) || { id: m[1], port: Number(m[2]) || tg.port, unregistered: true });
          }
          return resultJson({ TargetHealthDescriptions: targets.map(t => ({ Target: { Id: t.id, Port: t.port || tg.port }, HealthCheckPort: tg.healthCheckPort || 'traffic-port',
            TargetHealth: t.unregistered ? { State: 'unused', Reason: 'Target.NotRegistered' } : targetHealth(tg, t) })) });
        }
        if (op === 'modify-target-group') {
          const change = {};
          if (toks.includes('--health-check-path')) {
            const path = flag('health-check-path');
            if (!path || !/^\/\S*$/.test(path) || path.length > 1024) return print('err', 'ValidationError: HealthCheckPath must start with / and contain no spaces');
            change.healthCheckPath = path;
          }
          for (const [arg, key, lo, hi] of [['health-check-interval-seconds', 'interval', 5, 300], ['health-check-timeout-seconds', 'timeout', 2, 120], ['healthy-threshold-count', 'healthyThreshold', 2, 10], ['unhealthy-threshold-count', 'unhealthyThreshold', 2, 10]]) {
            if (!toks.includes('--' + arg)) continue;
            const n = Number(flag(arg));
            if (!flag(arg) || !Number.isInteger(n) || n < lo || n > hi) return print('err', `ValidationError: --${arg} must be an integer ${lo}–${hi}`);
            change[key] = n;
          }
          if (toks.includes('--health-check-port')) {
            const port = flag('health-check-port');
            if (port !== 'traffic-port' && (!/^\d+$/.test(port || '') || Number(port) < 1 || Number(port) > 65535)) return print('err', 'ValidationError: HealthCheckPort must be traffic-port or a port 1–65535');
            change.healthCheckPort = port;
          }
          if (toks.includes('--matcher')) {
            const m = (flag('matcher') || '').match(/^HttpCode=(\d{3})(?:-(\d{3}))?$/);
            if (!m || Number(m[1]) < 200 || Number(m[1]) > 499 || (m[2] && (Number(m[2]) < Number(m[1]) || Number(m[2]) > 499))) return print('err', 'ValidationError: this HTTP matcher subset accepts HttpCode=200 or HttpCode=200-299');
            change.matcher = m[1] + (m[2] ? '-' + m[2] : '');
          }
          if (!Object.keys(change).length) return print('err', 'error: specify supported health-check settings such as --health-check-path /healthz');
          Object.assign(tg, change); return resultJson({ TargetGroups: [jsonTG(tg)] });
        }
        if (op === 'describe-target-group-attributes') return resultJson({ Attributes: Object.entries({ 'deregistration_delay.timeout_seconds': '300', ...(tg.attributes || {}) }).map(([Key, Value]) => ({ Key, Value })) });
        if (op === 'modify-target-group-attributes') {
          const values = flags('attributes'), changes = {};
          if (!values.length) return print('err', 'aws: error: the following arguments are required: --attributes');
          for (const raw of values) {
            const m = raw.match(/^Key=([^,]+),Value=(.+)$/);
            if (!m) return print('err', 'error: use --attributes Key=deregistration_delay.timeout_seconds,Value=30');
            const [key, value] = [m[1], m[2]];
            const supported = {
              'deregistration_delay.timeout_seconds': v => /^\d+$/.test(v) && Number(v) <= 3600,
              'stickiness.enabled': v => ['true', 'false'].includes(v),
              'stickiness.type': v => ['lb_cookie', 'app_cookie'].includes(v),
              'load_balancing.algorithm.type': v => ['round_robin', 'least_outstanding_requests', 'weighted_random'].includes(v),
              'load_balancing.cross_zone.enabled': v => ['true', 'false', 'use_load_balancer_configuration'].includes(v),
            };
            if (!Object.prototype.hasOwnProperty.call(supported, key) || !supported[key](value)) return print('err', `InvalidConfigurationRequest: invalid or unsupported target group attribute '${key}=${value}'`);
            changes[key] = value;
          }
          tg.attributes = { ...(tg.attributes || {}), ...changes };
          return resultJson({ Attributes: Object.entries(tg.attributes).map(([Key, Value]) => ({ Key, Value })) });
        }
        if (op === 'register-targets' || op === 'deregister-targets') {
          const values = flags('targets'), targets = [];
          if (!values.length) return print('err', 'aws: error: the following arguments are required: --targets');
          for (const raw of values) {
            const m = raw.match(/^Id=([^,]+)(?:,Port=(\d+))?$/);
            if (!m) return print('err', 'error: use --targets Id=instance-id,Port=8080');
            const port = Number(m[2] || tg.port || 8080), inst = list('instances').find(i => i.id === m[1]);
            if (port < 1 || port > 65535) return print('err', 'ValidationError: target port must be 1–65535');
            if (op === 'register-targets' && (!inst || inst.state !== 'running' || (tg.vpcId && inst.vpcId !== tg.vpcId))) return print('err', 'InvalidTarget: target must be a running instance in the target group VPC');
            targets.push({ id: m[1], port });
          }
          tg.targets = tg.targets || [];
          targets.forEach(t => {
            const existing = tg.targets.find(x => x.id === t.id && x.port === t.port);
            if (op === 'register-targets') { if (existing) delete existing.draining; else tg.targets.push(t); }
            else if (existing) existing.draining = true;
          });
          if (op === 'deregister-targets') print('sys', 'Simulator: targets marked draining; target-deregistered waiter completes the modeled delay. Real in-flight requests are not simulated.');
          return;
        }
        if (op === 'wait' && toks[3] === 'target-deregistered') {
          tg.targets = (tg.targets || []).filter(t => !t.draining);
          return print('sys', 'Simulator waiter: modeled deregistration completed; no real elapsed delay or connections tested.');
        }
        print('err', `unknown ELBv2 op: ${op}`); return;
      }

      /* ===================== AUTOSCALING ===================== */
      case 'autoscaling': {
        const name = flag('auto-scaling-group-name');
        const group = list('asgs').find(a => a.name === name);
        const jsonActivity = v => ({ ActivityId: v.id, Description: v.description, Cause: v.cause || 'Deterministic simulator transition', StatusCode: v.status, Progress: 100 });
        const jsonGroup = a => ({ AutoScalingGroupName: a.name, MinSize: a.min, MaxSize: a.max, DesiredCapacity: a.desired,
          VPCZoneIdentifier: a.vpcZone || 'subnet-1,subnet-2', HealthCheckType: a.healthCheckType || 'EC2', HealthCheckGracePeriod: a.gracePeriod == null ? 0 : a.gracePeriod,
          DefaultInstanceWarmup: a.warmup, TargetGroupARNs: a.targetGroupARNs || [],
          LaunchTemplate: a.launchTemplate ? { LaunchTemplateId: a.launchTemplate.id, Version: a.launchTemplate.version || '1' } : undefined,
          Instances: (a.instances || []).map(id => {
            const i = list('instances').find(i => i.id === id);
            const elbBad = a.healthCheckType === 'ELB' && groupTargets().filter(tg => (a.targetGroupARNs || []).includes(tg.arn)).some(tg => (tg.targets || []).some(t => t.id === id && targetHealth(tg, t).State === 'unhealthy'));
            return { InstanceId: id, LifecycleState: 'InService', HealthStatus: !i || i.state !== 'running' || elbBad ? 'Unhealthy' : 'Healthy', AvailabilityZone: i && i.az };
          }) });
        if (op === 'describe-auto-scaling-groups') {
          const names = flags('auto-scaling-group-names');
          return resultJson({ AutoScalingGroups: list('asgs').filter(a => !names.length || names.includes(a.name)).map(jsonGroup) });
        }
        if (op === 'describe-auto-scaling-instances') {
          const ids = flags('instance-ids');
          return resultJson({ AutoScalingInstances: list('asgs').flatMap(a => jsonGroup(a).Instances.filter(i => !ids.length || ids.includes(i.InstanceId)).map(i => ({ ...i, AutoScalingGroupName: a.name }))) });
        }
        if (op === 'terminate-instance-in-auto-scaling-group' || op === 'set-instance-health') {
          const id = flag('instance-id'), a = list('asgs').find(a => (a.instances || []).includes(id));
          if (!id) return print('err', 'aws: error: the following arguments are required: --instance-id');
          if (!a) return print('err', `ValidationError: Instance ${id} is not part of an Auto Scaling group`);
          if (op === 'set-instance-health') return print('err', 'Simulator: custom health events are not modeled; use the seeded app failure or terminate-instance-in-auto-scaling-group.');
          const decrement = toks.includes('--should-decrement-desired-capacity'), preserve = toks.includes('--no-should-decrement-desired-capacity');
          if (decrement === preserve) return print('err', 'aws: error: specify exactly one of --should-decrement-desired-capacity or --no-should-decrement-desired-capacity');
          if (decrement && a.desired <= a.min) return print('err', 'ValidationError: Cannot decrement desired capacity below MinSize');
          removeGroupInstance(a, id); if (decrement) a.desired--;
          const before = new Set(a.instances); settleGroup(a, false);
          const newId = a.instances.find(x => !before.has(x));
          const act = activity(a, `Terminating EC2 instance: ${id}` + (newId ? '; launching replacement: ' + newId : ''), { oldId: id, newId });
          print('sys', 'Simulator completed the modeled ASG transition immediately; real AWS activity is asynchronous.');
          return resultJson({ Activity: jsonActivity(act) });
        }
        if (!name) return print('err', 'aws: error: the following arguments are required: --auto-scaling-group-name');
        if (!group) return print('err', `ValidationError: AutoScalingGroup name not found - AutoScalingGroup ${name} not found`);
        if (op === 'describe-policies') return resultJson({ ScalingPolicies: group.policies || [] });
        if (op === 'describe-scaling-activities') return resultJson({ Activities: (group.activities || []).map(jsonActivity) });
        if (op === 'put-scaling-policy') {
          const policyName = flag('policy-name'), type = flag('policy-type'), raw = flag('target-tracking-configuration');
          if (!policyName || !raw || !type) return print('err', 'aws: error: --policy-name, --policy-type and --target-tracking-configuration required');
          if (type !== 'TargetTrackingScaling') return print('err', 'Simulator supports TargetTrackingScaling policies here; other AWS policy types are taught in the lesson.');
          let config; try { config = JSON.parse(raw); } catch (e) { return print('err', 'Error parsing parameter --target-tracking-configuration: Invalid JSON'); }
          const metric = config && config.PredefinedMetricSpecification && config.PredefinedMetricSpecification.PredefinedMetricType;
          if (!config || typeof config.TargetValue !== 'number' || !Number.isFinite(config.TargetValue) || config.TargetValue <= 0 || !['ASGAverageCPUUtilization', 'ASGAverageNetworkIn', 'ASGAverageNetworkOut', 'ALBRequestCountPerTarget'].includes(metric)) return print('err', 'ValidationError: positive numeric TargetValue and supported PredefinedMetricSpecification required');
          if (config.DisableScaleIn !== undefined && typeof config.DisableScaleIn !== 'boolean') return print('err', 'ValidationError: DisableScaleIn must be a JSON boolean');
          if (metric === 'ASGAverageCPUUtilization' && config.TargetValue > 100) return print('err', 'ValidationError: CPU target must be <= 100 percent');
          if (metric === 'ALBRequestCountPerTarget' && !config.PredefinedMetricSpecification.ResourceLabel) return print('err', 'ValidationError: ResourceLabel is required for ALBRequestCountPerTarget');
          let warmup;
          if (toks.includes('--estimated-instance-warmup')) {
            warmup = Number(flag('estimated-instance-warmup'));
            if (!flag('estimated-instance-warmup') || !Number.isInteger(warmup) || warmup < 0) return print('err', 'ValidationError: EstimatedInstanceWarmup must be a nonnegative integer seconds');
          }
          const policy = { PolicyName: policyName, AutoScalingGroupName: name, PolicyType: type, TargetTrackingConfiguration: config, EstimatedInstanceWarmup: warmup };
          group.policies = (group.policies || []).filter(p => p.PolicyName !== policyName); group.policies.push(policy);
          return resultJson({ PolicyARN: `arn:aws:autoscaling:${sim.account.region || 'us-east-1'}:123456789012:scalingPolicy:00000000-0000-4000-8000-000000000001:autoScalingGroupName/${name}:policyName/${policyName}` });
        }
        if (op === 'update-auto-scaling-group' || op === 'set-desired-capacity') {
          const next = { ...group }; let touched = false;
          const numbers = op === 'set-desired-capacity' ? [['desired-capacity', 'desired']] : [['min-size', 'min'], ['max-size', 'max'], ['desired-capacity', 'desired'], ['health-check-grace-period', 'gracePeriod'], ['default-instance-warmup', 'warmup']];
          for (const [arg, key] of numbers) {
            if (!toks.includes('--' + arg)) continue;
            const value = Number(flag(arg));
            if (!flag(arg) || !Number.isInteger(value) || value < 0) return print('err', `ValidationError: --${arg} must be a nonnegative integer`);
            if (['min', 'max', 'desired'].includes(key) && value > 1000) return print('err', 'Simulator budget: capacity above 1000 instances is not modeled. Real AWS quotas must be reviewed separately.');
            next[key] = value; touched = true;
          }
          if (op === 'set-desired-capacity' && !toks.includes('--desired-capacity')) return print('err', 'aws: error: the following arguments are required: --desired-capacity');
          if (next.min > next.max) return print('err', 'ValidationError: MinSize cannot be greater than MaxSize');
          if (!toks.includes('--desired-capacity') && op === 'update-auto-scaling-group') next.desired = Math.min(next.max, Math.max(next.min, next.desired));
          if (next.desired < next.min || next.desired > next.max) return print('err', 'ValidationError: Desired capacity must be between MinSize and MaxSize');
          if (toks.includes('--health-check-type')) {
            if (!['EC2', 'ELB'].includes(flag('health-check-type'))) return print('err', 'ValidationError: modeled HealthCheckType values are EC2 or ELB');
            next.healthCheckType = flag('health-check-type'); touched = true;
          }
          if (toks.includes('--vpc-zone-identifier')) {
            const ids = String(flag('vpc-zone-identifier') || '').split(',');
            const subs = ids.map(id => list('subnets').find(s => s.id === id));
            if (subs.some(s => !s) || new Set(ids).size !== ids.length || new Set(subs.map(s => s.vpcId)).size !== 1) return print('err', 'ValidationError: VPCZoneIdentifier must list unique existing subnets in one VPC');
            const existing = list('subnets').find(s => String(group.vpcZone || '').split(',').includes(s.id));
            if (existing && subs[0].vpcId !== existing.vpcId) return print('err', 'ValidationError: cannot move this existing Auto Scaling group into another VPC');
            next.vpcZone = ids.join(','); touched = true;
          }
          if (!touched) return print('err', 'error: specify a supported Auto Scaling group setting');
          Object.assign(group, next); settleGroup(group, true);
          if (toks.includes('--vpc-zone-identifier')) {
            const ids = group.vpcZone.split(','), azs = [...new Set(ids.map(id => list('subnets').find(s => s.id === id).az))];
            for (let pass = 0; pass < group.desired; pass++) {
              const members = group.instances.map(id => list('instances').find(i => i.id === id)).filter(Boolean);
              const counts = azs.map(az => ({ az, count: members.filter(i => i.az === az).length })).sort((a, b) => a.count - b.count);
              const outside = members.find(i => !ids.includes(i.subnetId));
              const old = outside || (counts.length > 1 && counts[counts.length - 1].count - counts[0].count > 1 ? members.find(i => i.az === counts[counts.length - 1].az) : null);
              if (!old) break;
              const newId = addGroupInstance(group); removeGroupInstance(group, old.id);
              activity(group, `Rebalancing AZ placement: launching ${newId}; terminating ${old.id}`, { oldId: old.id, newId, cause: 'Modeled AZRebalance' });
            }
            print('sys', 'Simulator reconciled AZ placement immediately with launch-before-terminate. Real AZRebalance requires capacity, health checks and time.');
          }
          if (next.healthCheckType === 'ELB') print('sys', 'Simulator reconciled modeled ELB health immediately. Real AWS observes health/grace periods asynchronously.');
          return;
        }
        print('err', `unknown AutoScaling op: ${op}`); return;
      }

      /* ===================== SQS ===================== */
      case 'sqs':
        if (op === 'create-queue') {
          const name = flag('queue-name');
          if (!name) return print('err', 'error: --queue-name required');
          const queues = list('queues');
          if (queues.find(q => q.name === name))
            return print('err', `QueueAlreadyExists: A queue with name '${name}' already exists`);
          const acct = sim.account.callerIdentity?.Account || '123456789012';
          const region = sim.account.region || 'us-east-1';
          const url = `https://sqs.${region}.amazonaws.com/${acct}/${name}`;
          const queue = {
            name,
            url,
            arn: `arn:aws:sqs:${region}:${acct}:${name}`,
            messages: [],
            isFifo: name.endsWith('.fifo'),
            visibilityTimeout: 30,
          };
          queues.push(queue);
          print('ok', `{ "QueueUrl": "${url}" }`);
        } else if (op === 'list-queues') {
          const prefix = flag('queue-name-prefix');
          const queues = list('queues');
          const filtered = prefix ? queues.filter(q => q.name.startsWith(prefix)) : queues;
          if (!filtered.length) return print('ok', '{\n    "QueueUrls": []\n}');
          print('ok', '{\n    "QueueUrls": [\n' +
            filtered.map(q => `        "${q.url}"`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'get-queue-url') {
          const name = flag('queue-name');
          if (!name) return print('err', 'error: --queue-name required');
          const q = find('queues', name);
          if (!q) return print('err', `QueueDoesNotExist: The specified queue does not exist`);
          print('ok', `{ "QueueUrl": "${q.url}" }`);
        } else if (op === 'send-message') {
          const name = flag('queue-name');
          if (!name) return print('err', 'error: --queue-name required');
          const msg = flag('message-body') || flag('message');
          if (msg == null) return print('err', 'error: --message-body required');
          const q = find('queues', name);
          if (!q) return print('err', `QueueDoesNotExist: The specified queue '${name}' does not exist`);
          const id = 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
          q.messages = q.messages || [];
          q.messages.push({ messageId: id, body: msg, receiptHandle: 'receipt-' + id });
          print('ok', `{\n    "MessageId": "${id}",\n    "MD5OfMessageBody": "${Math.random().toString(36).slice(2, 14)}"\n}`);
        } else if (op === 'receive-message') {
          const name = flag('queue-name');
          if (!name) return print('err', 'error: --queue-name required');
          const q = find('queues', name);
          if (!q) return print('err', `QueueDoesNotExist: The specified queue '${name}' does not exist`);
          const msgs = q.messages || [];
          if (!msgs.length) return print('ok', '{\n    "Messages": []\n}');
          // Pop the first message (at-least-once, visibility timeout simulated)
          const m = msgs[0];
          print('ok', '{\n    "Messages": [\n' +
            `        { "MessageId": "${m.messageId}", "ReceiptHandle": "${m.receiptHandle}", "MD5OfBody": "${Math.random().toString(36).slice(2, 14)}", "Body": ${J(m.body)} }` +
            '\n    ]\n}');
        } else if (op === 'delete-queue') {
          const name = flag('queue-name');
          if (!name) return print('err', 'error: --queue-name required');
          const queues = list('queues');
          const idx = queues.findIndex(q => q.name === name);
          if (idx < 0) return print('err', `QueueDoesNotExist: The specified queue does not exist`);
          queues.splice(idx, 1);
          print('ok', '');
        } else if (op === 'get-queue-attributes') {
          const name = flag('queue-name');
          const q = find('queues', name);
          if (!q) return print('err', `QueueDoesNotExist: The specified queue does not exist`);
          print('ok', `{\n    "Attributes": {\n        "QueueArn": "${q.arn}",\n        "ApproximateNumberOfMessages": "${(q.messages || []).length}",\n        "VisibilityTimeout": "${q.visibilityTimeout || 30}",\n        "CreatedTimestamp": "${Date.now()}"\n    }\n}`);
        } else if (op === 'purge-queue') {
          const name = flag('queue-name');
          const q = find('queues', name);
          if (!q) return print('err', `QueueDoesNotExist: The specified queue does not exist`);
          q.messages = [];
          print('ok', '');
        } else if (op === 'delete-message') {
          const name = flag('queue-name');
          const q = find('queues', name);
          if (!q) return print('err', `QueueDoesNotExist: The specified queue does not exist`);
          const rh = flag('receipt-handle');
          if (!rh) return print('err', 'error: --receipt-handle required');
          q.messages = (q.messages || []).filter(m => m.receiptHandle !== rh);
          print('ok', '');
        } else if (op === 'set-queue-attributes') {
          const name = flag('queue-name');
          const q = find('queues', name);
          if (!q) return print('err', `QueueDoesNotExist: The specified queue does not exist`);
          const vt = flag('visibility-timeout');
          if (vt) q.visibilityTimeout = Number(vt);
          print('ok', '');
        } else {
          print('err', `unknown SQS op: ${op} ('help' dekho)`);
        }
        return;

      /* ===================== SNS ===================== */
      case 'sns':
        if (op === 'create-topic') {
          const name = flag('name');
          if (!name) return print('err', 'error: --name required');
          const topics = list('topics');
          if (topics.find(t => t.name === name))
            return print('err', `Topic already exists with name '${name}'`);
          const acct = sim.account.callerIdentity?.Account || '123456789012';
          const region = sim.account.region || 'us-east-1';
          const arn = `arn:aws:sns:${region}:${acct}:${name}`;
          const topic = { name, arn, subscriptions: [] };
          topics.push(topic);
          print('ok', `{ "TopicArn": "${arn}" }`);
        } else if (op === 'list-topics') {
          const topics = list('topics');
          if (!topics.length) return print('ok', '{\n    "Topics": []\n}');
          print('ok', '{\n    "Topics": [\n' +
            topics.map(t => `        { "TopicArn": "${t.arn}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'subscribe') {
          const topicArn = flag('topic-arn');
          const protocol = flag('protocol');
          const endpoint = flag('notification-endpoint');
          if (!topicArn || !protocol || !endpoint)
            return print('err', 'error: --topic-arn, --protocol, --notification-endpoint all required');
          const topicName = topicArn.split(':').pop();
          const t = find('topics', topicName);
          if (!t) return print('err', `NotFound: Topic with arn '${topicArn}' does not exist`);
          const subArn = `arn:aws:sns:${sim.account.region || 'us-east-1'}:${sim.account.callerIdentity?.Account || '123456789012'}:${topicName}:${Date.now()}`;
          t.subscriptions = t.subscriptions || [];
          t.subscriptions.push({ subscriptionArn: subArn, protocol, endpoint, confirmed: protocol === 'sqs' });
          print('ok', `{ "SubscriptionArn": "${subArn}" }`);
        } else if (op === 'list-subscriptions-by-topic') {
          const topicArn = flag('topic-arn');
          if (!topicArn) return print('err', 'error: --topic-arn required');
          const topicName = topicArn.split(':').pop();
          const t = find('topics', topicName);
          if (!t) return print('err', `NotFound: Topic '${topicArn}' does not exist`);
          const subs = t.subscriptions || [];
          if (!subs.length) return print('ok', '{\n    "Subscriptions": []\n}');
          print('ok', '{\n    "Subscriptions": [\n' +
            subs.map(s => `        { "SubscriptionArn": "${s.subscriptionArn}", "Protocol": "${s.protocol}", "Endpoint": "${s.endpoint}", "TopicArn": "${t.arn}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'publish') {
          const topicArn = flag('topic-arn');
          const msg = flag('message');
          if (!topicArn || msg == null)
            return print('err', 'error: --topic-arn and --message required');
          const topicName = topicArn.split(':').pop();
          const t = find('topics', topicName);
          if (!t) return print('err', `NotFound: Topic '${topicArn}' does not exist`);
          const messageId = 'msg-' + Date.now();
          // FAN-OUT: push message to each SQS-subscribed queue
          const sqsSubs = (t.subscriptions || []).filter(s => s.protocol === 'sqs');
          let delivered = 0;
          sqsSubs.forEach(sub => {
            // endpoint is queue ARN or queue name; resolve via find
            const queueName = sub.endpoint.split(':').pop();
            const q = find('queues', queueName);
            if (q) {
              q.messages = q.messages || [];
              const id = 'msg-' + Date.now() + '-' + delivered;
              q.messages.push({ messageId: id, body: msg, receiptHandle: 'receipt-' + id });
              delivered++;
            }
          });
          print('ok', `{\n    "MessageId": "${messageId}"\n}`);
          print('sys', `(simulator: message ${delivered} SQS subscriber queue(s) mein copy hua)`);
        } else if (op === 'delete-topic') {
          const topicArn = flag('topic-arn');
          if (!topicArn) return print('err', 'error: --topic-arn required');
          const topicName = topicArn.split(':').pop();
          const topics = list('topics');
          const idx = topics.findIndex(t => t.name === topicName);
          if (idx < 0) return print('err', `NotFound: Topic does not exist`);
          topics.splice(idx, 1);
          print('ok', '');
        } else if (op === 'unsubscribe') {
          const subArn = flag('subscription-arn');
          if (!subArn) return print('err', 'error: --subscription-arn required');
          const subId = subArn.split(':').pop();
          let removed = false;
          list('topics').forEach(t => {
            const before = (t.subscriptions || []).length;
            t.subscriptions = (t.subscriptions || []).filter(s => s.subscriptionArn !== subArn && !s.subscriptionArn.endsWith(subId));
            if (t.subscriptions.length < before) removed = true;
          });
          if (!removed) return print('err', `NotFound: Subscription '${subArn}' does not exist`);
          print('ok', '');
        } else if (op === 'get-topic-attributes') {
          const topicArn = flag('topic-arn');
          const t = find('topics', topicArn && topicArn.split(':').pop());
          if (!t) return print('err', `NotFound: Topic does not exist`);
          print('ok', `{\n    "Attributes": {\n        "TopicArn": "${t.arn}",\n        "SubscriptionsConfirmed": "${(t.subscriptions||[]).length}",\n        "DisplayName": ""\n    }\n}`);
        } else {
          print('err', `unknown SNS op: ${op} ('help' dekho)`);
        }
        return;

      /* ===================== ECR ===================== */
      case 'ecr':
        if (op === 'create-repository') {
          const name = flag('repository-name');
          if (!name) return print('err', 'error: --repository-name required');
          const repos = list('repositories');
          if (repos.find(r => r.name === name))
            return print('err', `RepositoryAlreadyExistsException: The repository named '${name}' already exists in the registry with id ${sim.account.callerIdentity?.Account || '123456789012'}`);
          const acct = sim.account.callerIdentity?.Account || '123456789012';
          const region = sim.account.region || 'us-east-1';
          const repo = {
            name,
            registryId: acct,
            uri: `${acct}.dkr.ecr.${region}.amazonaws.com/${name}`,
            imageCount: 0,
            createdAt: new Date().toISOString(),
            images: [],
          };
          repos.push(repo);
          print('ok', '{\n' +
            `    "repository": {\n` +
            `        "repositoryName": "${name}",\n` +
            `        "repositoryArn": "arn:aws:ecr:${region}:${acct}:repository/${name}",\n` +
            `        "repositoryUri": "${repo.uri}",\n` +
            `        "registryId": "${acct}",\n` +
            `        "createdAt": "${repo.createdAt}"\n` +
            '    }\n}');
        } else if (op === 'describe-repositories') {
          const repos = list('repositories');
          const nameFilter = flag('repository-names');
          const filtered = nameFilter ? repos.filter(r => r.name === nameFilter) : repos;
          if (!filtered.length) {
            if (nameFilter) return print('err', `RepositoryNotFoundException: The repository with name '${nameFilter}' does not exist`);
            return print('ok', '{\n    "repositories": []\n}');
          }
          print('ok', '{\n    "repositories": [\n' +
            filtered.map(r => `        { "repositoryName": "${r.name}", "repositoryArn": "arn:aws:ecr:${sim.account.region || 'us-east-1'}:${r.registryId}:repository/${r.name}", "repositoryUri": "${r.uri}", "registryId": "${r.registryId}", "imageCount": ${r.imageCount || 0}, "createdAt": "${r.createdAt}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-images') {
          const name = flag('repository-name');
          if (!name) return print('err', 'error: --repository-name required');
          const r = find('repositories', name);
          if (!r) return print('err', `RepositoryNotFoundException: The repository with name '${name}' does not exist`);
          const imgs = r.images || [];
          if (!imgs.length) return print('ok', '{\n    "imageIds": []\n}');
          print('ok', '{\n    "imageIds": [\n' +
            imgs.map(im => `        { "imageDigest": "${im.imageDigest}", "imageTag": "${im.imageTag}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'delete-repository') {
          const name = flag('repository-name');
          if (!name) return print('err', 'error: --repository-name required');
          const repos = list('repositories');
          const idx = repos.findIndex(r => r.name === name);
          if (idx < 0) return print('err', `RepositoryNotFoundException: The repository with name '${name}' does not exist`);
          repos.splice(idx, 1);
          print('ok', '{\n    "repository": {\n' +
            `        "repositoryName": "${name}",\n` +
            `        "registryId": "${sim.account.callerIdentity?.Account || '123456789012'}"\n` +
            '    }\n}');
        } else if (op === 'get-login-password') {
          print('ok', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.eyJzdWIiOiJzaGlzaHlhIiwiaWF0Ijox...  (fake token — docker login ke liye pipe: aws ecr get-login-password | docker login --username AWS --password-stdin <registry-uri>)');
        } else if (op === 'describe-images') {
          const name = flag('repository-name');
          if (!name) return print('err', 'error: --repository-name required');
          const r = find('repositories', name);
          if (!r) return print('err', `RepositoryNotFoundException: The repository with name '${name}' does not exist`);
          const imgs = r.images || [];
          if (!imgs.length) return print('ok', '{\n    "imageDetails": []\n}');
          print('ok', '{\n    "imageDetails": [\n' +
            imgs.map(im => `        { "registryId": "${r.registryId}", "repositoryName": "${r.name}", "imageDigest": "${im.imageDigest}", "imageTags": ["${im.imageTag}"], "imageSizeInBytes": ${im.imageSizeInBytes || 50000000}, "imagePushedAt": "${im.imagePushedAt || r.createdAt}" }`).join(',\n') +
            '\n    ]\n}');
        } else {
          print('err', `unknown ECR op: ${op} ('help' dekho)`);
        }
        return;

      /* ===================== EFS ===================== */
      case 'efs':
        if (op === 'describe-file-systems') {
          const fss = list('fileSystems');
          if (!fss.length) return print('ok', '{\n    "FileSystems": []\n}');
          print('ok', '{\n    "FileSystems": [\n' +
            fss.map(f => `        { "FileSystemId": "${f.id}", "Name": "${f.name || ''}", "LifeCycleState": "${f.state || 'available'}", "PerformanceMode": "${f.performanceMode || 'generalPurpose'}", "ThroughputMode": "${f.throughputMode || 'bursting'}", "Encrypted": ${f.encrypted ? 'true' : 'false'}, "SizeInBytes": { "Value": ${f.sizeBytes || 0} }, "NumberOfMountTargets": ${(list('mountTargets').filter(m => m.fileSystemId === f.id)).length} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-mount-targets') {
          const fsId = flag('file-system-id');
          if (!fsId) return print('err', 'error: --file-system-id required');
          const mts = list('mountTargets').filter(m => m.fileSystemId === fsId);
          if (!mts.length) return print('ok', '{\n    "MountTargets": []\n}   ← ek bhi mount target nahi = koi EC2 mount nahi kar sakta!');
          print('ok', '{\n    "MountTargets": [\n' +
            mts.map(m => `        { "MountTargetId": "${m.id}", "FileSystemId": "${m.fileSystemId}", "SubnetId": "${m.subnetId}", "AvailabilityZoneName": "${m.az}", "LifeCycleState": "${m.state || 'available'}", "IpAddress": "${m.ip || '10.0.1.50'}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'create-file-system') {
          const fss = list('fileSystems');
          const id = 'fs-' + Date.now().toString(36).slice(-8);
          fss.push({ id, name: flag('tags') || 'new-efs', state: 'available', performanceMode: flag('performance-mode') || 'generalPurpose', throughputMode: flag('throughput-mode') || 'bursting', encrypted: toks.includes('--encrypted'), sizeBytes: 6144 });
          print('ok', `{ "FileSystemId": "${id}", "LifeCycleState": "creating", "Encrypted": ${toks.includes('--encrypted')} }`);
        } else if (op === 'create-mount-target') {
          const fsId = flag('file-system-id');
          const subnetId = flag('subnet-id');
          if (!fsId || !subnetId) return print('err', 'error: --file-system-id and --subnet-id required');
          const f = list('fileSystems').find(x => x.id === fsId);
          if (!f) return print('err', `FileSystemNotFound: ${fsId}`);
          const sub = list('subnets').find(s => s.id === subnetId);
          const mts = list('mountTargets');
          if (mts.find(m => m.fileSystemId === fsId && m.subnetId === subnetId))
            return print('err', `MountTargetConflict: is subnet mein already ek mount target hai`);
          const id = 'fsmt-' + Date.now().toString(36).slice(-8);
          mts.push({ id, fileSystemId: fsId, subnetId, az: sub ? sub.az : 'us-east-1a', state: 'available' });
          print('ok', `{ "MountTargetId": "${id}", "FileSystemId": "${fsId}", "SubnetId": "${subnetId}", "LifeCycleState": "creating" }`);
        } else if (op === 'put-lifecycle-configuration') {
          const fsId = flag('file-system-id');
          const f = list('fileSystems').find(x => x.id === fsId);
          if (!f) return print('err', `FileSystemNotFound: ${fsId}`);
          f.lifecycle = flag('lifecycle-policies') || 'AFTER_30_DAYS';
          print('ok', `{ "LifecyclePolicies": [{ "TransitionToIA": "${f.lifecycle}" }] }`);
        } else {
          print('err', `unknown EFS op: ${op}`);
        }
        return;

      /* ===================== ORGANIZATIONS ===================== */
      case 'organizations':
        if (op === 'describe-organization') {
          const o = sim.account.organization || {};
          print('ok', `{ "Organization": { "Id": "${o.id || 'o-exampleorgid'}", "MasterAccountId": "${o.managementAccountId || '111111111111'}", "MasterAccountEmail": "${o.email || 'root@company.com'}", "FeatureSet": "${o.featureSet || 'ALL'}" } }`);
        } else if (op === 'list-accounts') {
          const accts = list('orgAccounts');
          if (!accts.length) return print('ok', '{\n    "Accounts": []\n}');
          print('ok', '{\n    "Accounts": [\n' +
            accts.map(a => `        { "Id": "${a.id}", "Name": "${a.name}", "Email": "${a.email || a.name + '@company.com'}", "Status": "${a.status || 'ACTIVE'}", "OrganizationalUnit": "${a.ou || 'Root'}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-organizational-units-for-parent' || op === 'list-organizational-units') {
          const ous = list('orgUnits');
          if (!ous.length) return print('ok', '{\n    "OrganizationalUnits": []\n}');
          print('ok', '{\n    "OrganizationalUnits": [\n' +
            ous.map(u => `        { "Id": "${u.id}", "Name": "${u.name}", "Arn": "arn:aws:organizations::111111111111:ou/o-exampleorgid/${u.id}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'list-policies') {
          const scps = list('scps');
          if (!scps.length) return print('ok', '{\n    "Policies": []\n}');
          print('ok', '{\n    "Policies": [\n' +
            scps.map(p => `        { "Id": "${p.id}", "Name": "${p.name}", "Type": "SERVICE_CONTROL_POLICY", "AwsManaged": ${p.awsManaged ? 'true' : 'false'} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-policy') {
          const id = flag('policy-id');
          if (!id) return print('err', 'error: --policy-id required');
          const p = list('scps').find(x => x.id === id || x.name === id);
          if (!p) return print('err', `PolicyNotFoundException: ${id}`);
          print('ok', prettyJson({ Policy: { PolicySummary: { Id: p.id, Name: p.name, Type: 'SERVICE_CONTROL_POLICY' }, Content: p.document || {} } }));
        } else if (op === 'list-targets-for-policy') {
          const id = flag('policy-id');
          const p = list('scps').find(x => x.id === id || x.name === id);
          if (!p) return print('err', `PolicyNotFoundException: ${id}`);
          const targets = p.targets || [];
          print('ok', '{\n    "Targets": [\n' +
            targets.map(t => `        { "TargetId": "${t}", "Type": "ORGANIZATIONAL_UNIT" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'attach-policy') {
          const id = flag('policy-id');
          const target = flag('target-id');
          if (!id || !target) return print('err', 'error: --policy-id and --target-id required');
          const p = list('scps').find(x => x.id === id || x.name === id);
          if (!p) return print('err', `PolicyNotFoundException: ${id}`);
          p.targets = p.targets || [];
          if (!p.targets.includes(target)) p.targets.push(target);
          print('ok', `SCP ${p.name} attached to ${target}`);
        } else if (op === 'detach-policy') {
          const id = flag('policy-id');
          const target = flag('target-id');
          const p = list('scps').find(x => x.id === id || x.name === id);
          if (!p) return print('err', `PolicyNotFoundException: ${id}`);
          p.targets = (p.targets || []).filter(t => t !== target);
          print('ok', '');
        } else {
          print('err', `unknown Organizations op: ${op}`);
        }
        return;

      /* ===================== EVENTBRIDGE ===================== */
      case 'events':
        if (op === 'list-rules') {
          const rules = list('eventRules');
          if (!rules.length) return print('ok', '{\n    "Rules": []\n}');
          print('ok', '{\n    "Rules": [\n' +
            rules.map(r => `        { "Name": "${r.name}", "EventBusName": "${r.bus || 'default'}", "State": "${r.state || 'ENABLED'}", ${r.schedule ? `"ScheduleExpression": "${r.schedule}"` : `"EventPattern": ${JSON.stringify(JSON.stringify(r.pattern || {}))}`} }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-rule') {
          const name = flag('name');
          if (!name) return print('err', 'error: --name required');
          const r = find('eventRules', name);
          if (!r) return print('err', `ResourceNotFoundException: Rule '${name}' does not exist`);
          print('ok', prettyJson({ Name: r.name, EventBusName: r.bus || 'default', State: r.state || 'ENABLED', EventPattern: r.pattern, ScheduleExpression: r.schedule }));
        } else if (op === 'list-targets-by-rule') {
          const name = flag('rule');
          if (!name) return print('err', 'error: --rule required');
          const r = find('eventRules', name);
          if (!r) return print('err', `ResourceNotFoundException: Rule '${name}' does not exist`);
          const targets = r.targets || [];
          if (!targets.length) return print('ok', '{\n    "Targets": []\n}   ← rule match toh hoga, par jaayega kahin nahi!');
          print('ok', '{\n    "Targets": [\n' +
            targets.map((t, i) => `        { "Id": "target-${i + 1}", "Arn": "${t}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'put-rule') {
          const name = flag('name');
          if (!name) return print('err', 'error: --name required');
          const rules = list('eventRules');
          let r = rules.find(x => x.name === name);
          if (!r) { r = { name, bus: flag('event-bus-name') || 'default', state: 'ENABLED', targets: [] }; rules.push(r); }
          const sched = flag('schedule-expression');
          const pat = flag('event-pattern');
          if (sched) r.schedule = sched;
          if (pat) { try { r.pattern = JSON.parse(pat); } catch (e) { r.pattern = pat; } }
          print('ok', `{ "RuleArn": "arn:aws:events:${sim.account.region || 'us-east-1'}:123456789012:rule/${name}" }`);
        } else if (op === 'put-targets') {
          const name = flag('rule');
          let arn = flag('targets') || flag('target-arn');
          if (!name || !arn) return print('err', 'error: --rule and --targets required   (asli syntax: --targets Id=1,Arn=<target-arn>)');
          // asli CLI: --targets Id=1,Arn=arn:aws:... ya JSON [{"Id":"1","Arn":"..."}]
          const am = arn.match(/Arn=([^,\s]+)/i);
          if (am) arn = am[1];
          else if (/^\s*\[/.test(arn)) { try { arn = JSON.parse(arn)[0].Arn || arn; } catch (e) { /* raw rakho */ } }
          const r = find('eventRules', name);
          if (!r) return print('err', `ResourceNotFoundException: Rule '${name}' does not exist`);
          r.targets = r.targets || [];
          if (!r.targets.includes(arn)) r.targets.push(arn);
          print('ok', '{ "FailedEntryCount": 0, "FailedEntries": [] }');
        } else if (op === 'disable-rule' || op === 'enable-rule') {
          const name = flag('name');
          const r = find('eventRules', name);
          if (!r) return print('err', `ResourceNotFoundException: Rule '${name}' does not exist`);
          r.state = op === 'enable-rule' ? 'ENABLED' : 'DISABLED';
          print('ok', '');
        } else {
          print('err', `unknown EventBridge op: ${op}`);
        }
        return;

      /* ===================== STEP FUNCTIONS ===================== */
      case 'stepfunctions':
        if (op === 'list-state-machines') {
          const sms = list('stateMachines');
          if (!sms.length) return print('ok', '{\n    "stateMachines": []\n}');
          print('ok', '{\n    "stateMachines": [\n' +
            sms.map(m => `        { "stateMachineArn": "arn:aws:states:${sim.account.region || 'us-east-1'}:123456789012:stateMachine:${m.name}", "name": "${m.name}", "type": "${m.type || 'STANDARD'}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-state-machine') {
          const arn = flag('state-machine-arn') || flag('name');
          const m = find('stateMachines', arn && arn.split(':').pop());
          if (!m) return print('err', `StateMachineDoesNotExist: ${arn}`);
          print('ok', prettyJson({ name: m.name, type: m.type || 'STANDARD', status: 'ACTIVE', definition: m.definition || {} }));
        } else if (op === 'start-execution') {
          const arn = flag('state-machine-arn') || flag('name');
          const m = find('stateMachines', arn && arn.split(':').pop());
          if (!m) return print('err', `StateMachineDoesNotExist: ${arn}`);
          const execs = list('executions');
          const name = 'exec-' + Date.now().toString(36).slice(-6);
          execs.push({ name, stateMachine: m.name, status: m.failAt ? 'FAILED' : 'SUCCEEDED', failedState: m.failAt || null, input: flag('input') || '{}' });
          print('ok', `{ "executionArn": "arn:aws:states:${sim.account.region || 'us-east-1'}:123456789012:execution:${m.name}:${name}", "startDate": "${new Date().toISOString()}" }`);
        } else if (op === 'list-executions') {
          const execs = list('executions');
          if (!execs.length) return print('ok', '{\n    "executions": []\n}');
          print('ok', '{\n    "executions": [\n' +
            execs.map(e => `        { "name": "${e.name}", "stateMachineName": "${e.stateMachine}", "status": "${e.status}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-execution' || op === 'get-execution-history') {
          const arn = flag('execution-arn') || flag('name');
          const execs = list('executions');
          const e = execs.find(x => !arn || x.name === arn || (arn || '').endsWith(x.name)) || execs[execs.length - 1];
          if (!e) return print('err', 'ExecutionDoesNotExist: pehle start-execution chalao');
          if (op === 'describe-execution') {
            print('ok', prettyJson({ name: e.name, stateMachineName: e.stateMachine, status: e.status, input: e.input }));
          } else {
            const m = find('stateMachines', e.stateMachine);
            const states = (m && m.states) || ['ValidateOrder', 'ChargePayment', 'ShipOrder'];
            const lines = [];
            for (const st of states) {
              if (e.failedState && st === e.failedState) { lines.push(`  ${st}: TaskFailed  ← yahan toota (retry/catch dekho)`); break; }
              lines.push(`  ${st}: TaskSucceeded`);
            }
            print('ok', `Execution ${e.name} (${e.status}):\n` + lines.join('\n'));
          }
        } else {
          print('err', `unknown Step Functions op: ${op}`);
        }
        return;

      /* ===================== KINESIS (data streams) ===================== */
      case 'kinesis':
        if (op === 'list-streams') {
          const st = list('kinesisStreams');
          if (!st.length) return print('ok', '{\n    "StreamNames": []\n}');
          print('ok', '{\n    "StreamNames": [\n' + st.map(s => `        "${s.name}"`).join(',\n') + '\n    ]\n}');
        } else if (op === 'describe-stream' || op === 'describe-stream-summary') {
          const name = flag('stream-name');
          const s = find('kinesisStreams', name);
          if (!s) return print('err', `ResourceNotFoundException: Stream ${name} under account not found.`);
          print('ok', prettyJson({ StreamDescription: {
            StreamName: s.name, StreamStatus: s.status || 'ACTIVE',
            StreamModeDetails: { StreamMode: s.mode || 'PROVISIONED' },
            Shards: Array.from({ length: s.shards || 1 }, (_, i) => ({ ShardId: `shardId-${String(i).padStart(12, '0')}` })),
            RetentionPeriodHours: s.retentionHours || 24,
          } }));
        } else if (op === 'create-stream') {
          const name = flag('stream-name');
          if (!name) return print('err', 'error: --stream-name required');
          const st = list('kinesisStreams');
          if (st.find(x => x.name === name)) return print('err', `ResourceInUseException: Stream ${name} already exists`);
          st.push({ name, shards: Number(flag('shard-count') || 1), status: 'ACTIVE', retentionHours: 24 });
          print('ok', '');
        } else if (op === 'put-record' || op === 'get-records') {
          print('ok', prettyJson({ ShardId: 'shardId-000000000000', SequenceNumber: '4966' + Date.now() }));
        } else {
          print('err', `unknown Kinesis op: ${op}`);
        }
        return;

      /* ===================== FIREHOSE (delivery streams) ===================== */
      case 'firehose':
        if (op === 'list-delivery-streams') {
          const ds = list('deliveryStreams');
          if (!ds.length) return print('ok', '{\n    "DeliveryStreamNames": []\n}');
          print('ok', '{\n    "DeliveryStreamNames": [\n' + ds.map(d => `        "${d.name}"`).join(',\n') + '\n    ]\n}');
        } else if (op === 'describe-delivery-stream') {
          const name = flag('delivery-stream-name');
          const d = find('deliveryStreams', name);
          if (!d) return print('err', `ResourceNotFoundException: Firehose ${name} not found.`);
          print('ok', prettyJson({ DeliveryStreamDescription: {
            DeliveryStreamName: d.name,
            DeliveryStreamStatus: d.status || 'ACTIVE',
            DeliveryStreamType: d.source === 'kinesis' ? 'KinesisStreamAsSource' : 'DirectPut',
            Destinations: [{
              DestinationId: 'destinationId-000000000001',
              [d.destination === 'opensearch' ? 'AmazonOpenSearchServiceDestinationDescription'
                : d.destination === 's3' ? 'S3DestinationDescription' : 'DestinationDescription']: {
                DomainARN: d.destination === 'opensearch' ? `arn:aws:es:us-east-1:123456789012:domain/${d.domain || 'logs'}` : undefined,
                BucketARN: d.backupS3 ? `arn:aws:s3:::${d.backupS3}` : undefined,
                BufferingHints: { SizeInMBs: d.bufferMB || 5, IntervalInSeconds: d.bufferSec || 300 },
                S3BackupMode: d.backupS3 ? (d.backupAll ? 'AllDocuments' : 'FailedDocumentsOnly') : undefined,
              },
            }],
          } }));
        } else if (op === 'create-delivery-stream') {
          const name = flag('delivery-stream-name');
          if (!name) return print('err', 'error: --delivery-stream-name required');
          const ds = list('deliveryStreams');
          if (ds.find(x => x.name === name)) return print('err', `ResourceInUseException: ${name} already exists`);
          ds.push({ name, status: 'ACTIVE', source: 'directput', destination: flag('destination') || 's3', bufferMB: 5, bufferSec: 300 });
          print('ok', prettyJson({ DeliveryStreamARN: `arn:aws:firehose:us-east-1:123456789012:deliverystream/${name}` }));
        } else {
          print('err', `unknown Firehose op: ${op}`);
        }
        return;

      /* ===================== OPENSEARCH (Elasticsearch) ===================== */
      case 'opensearch':
      case 'es':
        if (op === 'list-domain-names') {
          const ds = list('opensearchDomains');
          print('ok', prettyJson({ DomainNames: ds.map(d => ({ DomainName: d.name, EngineType: 'OpenSearch' })) }));
        } else if (op === 'describe-domain' || op === 'describe-elasticsearch-domain') {
          const name = flag('domain-name') || flag('domain-names');
          const d = find('opensearchDomains', name);
          if (!d) return print('err', `ResourceNotFoundException: Domain not found: ${name}`);
          print('ok', prettyJson({ DomainStatus: {
            DomainName: d.name,
            EngineVersion: d.version || 'OpenSearch_2.11',
            ClusterConfig: {
              InstanceType: d.instanceType || 'r6g.large.search',
              InstanceCount: d.instanceCount || 3,
              ZoneAwarenessEnabled: d.multiAZ !== false,
              DedicatedMasterEnabled: d.dedicatedMaster || false,
            },
            EBSOptions: { EBSEnabled: true, VolumeSize: d.volumeGB || 100 },
            EncryptionAtRestOptions: { Enabled: d.encrypted !== false },
            Processing: d.status === 'processing',
          } }));
        } else {
          print('err', `unknown OpenSearch op: ${op}`);
        }
        return;

      /* ===================== EVENTBRIDGE PIPES ===================== */
      case 'pipes':
        if (op === 'list-pipes') {
          const ps = list('pipes');
          if (!ps.length) return print('ok', '{\n    "Pipes": []\n}');
          print('ok', '{\n    "Pipes": [\n' +
            ps.map(p => `        { "Name": "${p.name}", "CurrentState": "${p.state || 'RUNNING'}", "Source": "${p.source}", "Target": "${p.target}" }`).join(',\n') +
            '\n    ]\n}');
        } else if (op === 'describe-pipe') {
          const name = flag('name');
          const p = find('pipes', name);
          if (!p) return print('err', `NotFoundException: Pipe ${name} not found`);
          print('ok', prettyJson({
            Name: p.name, CurrentState: p.state || 'RUNNING',
            Source: p.source, SourceParameters: p.filter ? { FilterCriteria: { Filters: [{ Pattern: p.filter }] } } : {},
            Enrichment: p.enrichment || null,
            Target: p.target, TargetParameters: p.targetParams || {},
          }));
        } else if (op === 'create-pipe') {
          const name = flag('name');
          if (!name) return print('err', 'error: --name required');
          const ps = list('pipes');
          if (ps.find(x => x.name === name)) return print('err', `ConflictException: Pipe ${name} already exists`);
          ps.push({ name, state: 'RUNNING', source: flag('source') || '', target: flag('target') || '', enrichment: flag('enrichment') || null });
          print('ok', prettyJson({ Name: name, CurrentState: 'CREATING', Arn: `arn:aws:pipes:us-east-1:123456789012:pipe/${name}` }));
        } else {
          print('err', `unknown Pipes op: ${op}`);
        }
        return;

      /* ===================== CONFIGURE ===================== */
      case 'configure':
        if (op === 'list') {
          print('ok', `      name      value\n      ----      -----\n      region    ${sim.account.region || 'us-east-1'}\n      output    json`);
        } else if (op === 'get') {
          const what = toks[3];
          if (what === 'region') print('ok', sim.account.region || 'us-east-1');
          else print('ok', '');
        } else if (op === 'set') {
          const what = toks[3], val = toks[4];
          if (what === 'region' && val) { sim.account.region = val; print('sys', `region set to ${val}`); }
          else print('ok', '');
        } else print('err', `unknown configure op: ${op}`);
        return;

      default:
        print('err', `aws: '${service}' service is mission mein supported nahi ('help' dekho)`);
    }
  }

  /* ---------- TERRAFORM handler ---------- */
  function execTerraform(norm) {
    const tfToks = norm.split(' ');
    const sub = tfToks[1] || '';
    if (sub === 'plan') {
      print('ok', [
        'Terraform used the selected providers to generate the following execution plan.',
        'Resource actions are indicated with the following symbols:',
        '  + create',
        '',
        'Terraform will perform the following actions:',
        '',
        ...Object.keys(sim.files).filter(f => /\.(tf|hcl)$/.test(f) && typeof sim.files[f].apply === 'function').map(f => `  # ${f}: + resource as per ${f}`),
        '',
        'Plan: ' + Object.keys(sim.files).filter(f => /\.(tf|hcl)$/.test(f) && typeof sim.files[f].apply === 'function').length + ' to add, 0 to change, 0 to destroy.',
      ].join('\n'));
    } else if (sub === 'apply') {
      // collect .tf/.hcl files in sim.files whose apply() exists and run each
      const tfFiles = Object.keys(sim.files).filter(f => /\.(tf|hcl)$/.test(f) && typeof sim.files[f].apply === 'function');
      if (!tfFiles.length) {
        print('err', 'Error: No .tf/.hcl files to apply. (ls dekho — koi files hain?)');
      } else {
        const msgs = tfFiles.map(fname => {
          const msg = sim.files[fname].apply(sim);
          return msg ? `${fname}: ${msg}` : null;
        }).filter(Boolean);
        print('ok', [
          'Apply complete! Resources: ' + tfFiles.length + ' added, 0 changed, 0 destroyed.',
          ...msgs,
        ].join('\n'));
      }
    } else if (sub === 'validate') {
      print('ok', 'Success! The configuration is valid.');
    } else if (sub === 'destroy') {
      print('ok', 'Destroy complete! Resources: 0 destroyed. (mocked)');
    } else if (sub === 'init') {
      print('ok', [
        'Initializing the backend...',
        'Initializing provider plugins...',
        '- Reusing previous version of hashicorp/aws from the dependency lock file',
        'Terraform has been successfully initialized!',
      ].join('\n'));
    } else if (sub === 'fmt') {
      print('ok', 'main.tf\nvars.tf');
    } else if (sub === 'show') {
      print('ok', '# Terraform show (mocked)');
    } else if (sub === 'version') {
      print('ok', 'Terraform v1.7.0 on linux_amd64');
    } else if (sub === 'state' && tfToks[2] === 'list') {
      print('ok', Object.keys(sim.files).filter(f => /\.(tf|hcl)$/.test(f)).map(f => 'aws_resource.' + f.replace(/\.\w+$/, '')).join('\n') || '(no state)');
    } else if (sub === '' || sub === 'help') {
      print('sys', [
        'Terraform commands (is mission mein):',
        '  terraform init / validate / plan / apply / destroy / fmt / version',
        '  terraform state list',
      ].join('\n'));
    } else {
      print('err', `terraform: unknown subcommand '${sub}'`);
    }
  }

  /* ---------- generic file apply (non-Terraform: fix-policy.json etc.) ---------- */
  function applyFile(fname) {
    const f = sim.files[fname];
    if (!f) { print('err', `error: the path "${fname}" does not exist ('ls' se files dekho)`); return; }
    const msg = typeof f.apply === 'function' ? f.apply(sim) : (f.desc || `${fname} applied`);
    print('ok', msg || `${fname} applied`);
  }
};
