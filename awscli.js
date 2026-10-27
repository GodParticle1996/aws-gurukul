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

// Bounded authoritative-answer model. No recursive cache, network probe or real DNS.
// Shared by the CLI and mission predicates so a win checks serving state.
AG.dnsAnswer = function (account, zone, name, type, cursor = 0) {
  const canonical = x => String(x || '').toLowerCase().replace(/\.$/, '') + '.';
  const records = (zone.servedRecords || zone.records || []).filter(r => canonical(r.Name || r.name) === canonical(name) && (r.Type || r.type) === type);
  const healthy = r => {
    if (r.HealthCheckId) {
      const h = (account.healthChecks || []).find(h => h.id === r.HealthCheckId);
      if (!h) return false;
      const c = h.config || {};
      const up = c.Disabled ? true : c.Inverted ? !h.observedHealthy : h.observedHealthy;
      if (!up) return false;
    }
    if (r.AliasTarget && r.AliasTarget.EvaluateTargetHealth) {
      const a = (account.dnsAliases || []).find(a => canonical(a.dnsName) === canonical(r.AliasTarget.DNSName));
      return !!a && a.healthy;
    }
    return true;
  };
  let chosen = records;
  if (records.some(r => r.Failover)) {
    const primary = records.find(r => r.Failover === 'PRIMARY'), secondary = records.find(r => r.Failover === 'SECONDARY');
    chosen = primary && healthy(primary) ? [primary] : secondary && healthy(secondary) ? [secondary] : primary ? [primary] : [];
  } else if (records.some(r => r.Weight !== undefined)) {
    let pool = records.filter(r => r.Weight > 0 && healthy(r));
    if (!pool.length) pool = records.filter(healthy);
    if (!pool.length) pool = records; // all unhealthy: fail-open, not empty answer
    const sum = pool.reduce((n, r) => n + r.Weight, 0);
    let ticket = cursor % (sum || pool.length || 1);
    chosen = pool.length ? [pool.find(r => { ticket -= sum ? r.Weight : 1; return ticket < 0; })] : [];
  }
  return chosen.flatMap(r => r.AliasTarget ? (((account.dnsAliases || []).find(a => canonical(a.dnsName) === canonical(r.AliasTarget.DNSName)) || {}).addresses || []).filter(ip => type === 'AAAA' ? ip.includes(':') : !ip.includes(':')) : (r.ResourceRecords || [{ Value: r.value }]).map(v => v.Value)).filter(Boolean);
};

// Small S3/OAC teaching fixture, not a general IAM evaluator or HTTP client.
AG.cdnResponse = function (account, distribution, path) {
  if(!distribution)return {status:503,reason:'Distribution missing'};
  const cfg=distribution.deployedConfig||(distribution.status==='Deployed'?distribution.config:null);
  if(!cfg)return {status:503,reason:'No deployed configuration yet'};
  if(!cfg||!cfg.Enabled)return {status:403,reason:'Distribution disabled'};
  const origin=(cfg.Origins.Items||[]).find(o=>o.Id===cfg.DefaultCacheBehavior.TargetOriginId);
  const bucket=origin&&(account.buckets||[]).find(b=>origin.DomainName===b.name+'.s3.ap-south-1.amazonaws.com');
  if(!bucket)return {status:502,reason:'Fixture S3 REST origin missing'};
  const cached=(distribution.edgeCache||[]).find(c=>c.path===path);
  if(cached)return {status:200,version:cached.version,source:'edge fixture'};
  const control=(account.originAccessControls||[]).find(o=>o.id===origin.OriginAccessControlId);
  if(!control||control.config.SigningBehavior!=='always'||control.config.SigningProtocol!=='sigv4'||control.config.OriginAccessControlOriginType!=='s3')return {status:403,reason:'Signing OAC not attached'};
  const arn='arn:aws:cloudfront::123456789012:distribution/'+distribution.id,resource='arn:aws:s3:::'+bucket.name+path;
  const arr=x=>Array.isArray(x)?x:[x],match=(pattern,value)=>typeof pattern==='string'&&(pattern==='*'||pattern===value||pattern.endsWith('*')&&value.startsWith(pattern.slice(0,-1)));
  const statements=Array.isArray((bucket.policy||{}).Statement)?bucket.policy.Statement:[];
  const relevant=s=>s&&arr(s.Action).some(a=>a==='s3:GetObject'||a==='s3:*'||a==='*')&&arr(s.Resource).some(r=>match(r,resource));
  if(statements.some(s=>relevant(s)&&s.Effect==='Deny'&&(s.Principal==='*'||s.Principal&&s.Principal.Service==='cloudfront.amazonaws.com')&&!s.Condition))return {status:403,reason:'Explicit policy Deny'};
  if(!statements.some(s=>relevant(s)&&s.Effect==='Allow'&&s.Principal&&s.Principal.Service==='cloudfront.amazonaws.com'&&s.Condition&&s.Condition.StringEquals&&(s.Condition.StringEquals['AWS:SourceArn']||s.Condition.StringEquals['aws:SourceArn'])===arn))return {status:403,reason:'Scoped service/SourceArn allow missing in fixture'};
  const object=(bucket.objects||[]).find(o=>o.key===path.replace(/^\//,''));
  return object?{status:200,version:object.version,source:'origin fixture'}:{status:404,reason:'Object missing'};
};

// Bounded CPU/IO benchmark fixture, not an AWS latency prediction.
AG.lambdaTiming = function (fn) {
  const workload = fn.workload || {}, memory = fn.memory || 128;
  const floor = workload.ioFloorMs || 300, base = workload.baseMs || 800;
  return { warmMs: Math.round(floor + Math.max(0, base - floor) * Math.pow(1024 / memory, 0.8)),
    initMs: Math.round((workload.initMs || 300) * Math.sqrt(1024 / memory)) };
};

// Typed EventBridge Classic pattern subset; all helpers stay on AG or inside this IIFE.
(function(){
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const fail=m=>{throw Error('InvalidEventPatternException: '+m);};
  const scalar=v=>v===null||['string','boolean'].includes(typeof v)||typeof v==='number'&&Number.isFinite(v);
  AG.validateEventPattern=function(pattern){
    function walk(p,depth){if(!object(p)||!Object.keys(p).length||depth>16)fail('Nonempty JSON object required; simulator nesting limit16');for(const [key,value]of Object.entries(p)){
      if(['__proto__','constructor','prototype'].includes(key)||key.includes('.'))fail('Simulator subset: ordinary nested keys only; dotted/prototype keys unsupported');
      if(object(value)){walk(value,depth+1);continue;}
      if(!Array.isArray(value)||!value.length)fail('Each leaf must have a nonempty alternatives array');
      for(const term of value){if(scalar(term))continue;if(!object(term)||Object.keys(term).length!==1)fail('Use one supported operator per alternative');const [op,v]=Object.entries(term)[0];
        if(op==='exists'){if(typeof v!=='boolean')fail('exists requires true/false');}
        else if(op==='prefix'){if(typeof v!=='string')fail('prefix requires a string');}
        else if(op==='anything-but'){const values=Array.isArray(v)?v:[v];if(!values.length||values.some(x=>!['string','number'].includes(typeof x)||typeof x==='number'&&!Number.isFinite(x)))fail('anything-but supports strings/numbers or lists');}
        else if(op==='numeric'){if(!Array.isArray(v)||!v.length||v.length%2)fail('numeric requires operator/value pairs');for(let i=0;i<v.length;i+=2)if(!['>','>=','<','<=','='].includes(v[i])||typeof v[i+1]!=='number'||!Number.isFinite(v[i+1]))fail('numeric needs supported comparison and finite number');}
        else fail('Unsupported operator '+op+'; this model supports scalar/numeric/prefix/anything-but/exists');
      }
    }}walk(pattern,0);return pattern;
  };
  AG.eventPatternMatch=function(pattern,event){
    AG.validateEventPattern(pattern);
    const term=(rule,value,present)=>{if(!object(rule))return present&&rule===value;const [op,target]=Object.entries(rule)[0];if(op==='exists')return present===target;if(!present)return false;if(op==='prefix')return typeof value==='string'&&value.startsWith(target);if(op==='anything-but')return ['string','number'].includes(typeof value)&&!(Array.isArray(target)?target:[target]).some(v=>v===value);if(typeof value!=='number'||!Number.isFinite(value))return false;for(let i=0;i<target.length;i+=2){const n=target[i+1],s=target[i];if(!(s==='>'?value>n:s==='>='?value>=n:s==='<'?value<n:s==='<='?value<=n:value===n))return false;}return true;};
    function matches(p,e){if(!object(e))return false;return Object.entries(p).every(([key,rules])=>{const present=own(e,key),value=present?e[key]:undefined;if(object(rules))return present&&(Array.isArray(value)?value:[value]).some(v=>matches(rules,v));return rules.some(rule=>object(rule)&&own(rule,'exists')?term(rule,value,present):(Array.isArray(value)?value:[value]).some(v=>term(rule,v,present)));});}
    return matches(pattern,event);
  };
  // TEST worker domain model, corresponding to lab18's durable-phase host reference.
  // No Python, external gateway, Lambda runtime, IAM enforcement or timing benchmark.
  AG.sagaWorker=function(account,fn,input){
    const fail=(type,message)=>{const error=Error(type+': '+message);error.type=type;throw error;};
    const f=account.sagaFixture,op=fn?.sagaOperation;if(!f||!Array.isArray(f.orders)||!Array.isArray(f.stock)||!['capture','reserve','refund'].includes(op)||f.workerIds?.[op]!==fn.fixtureId)fail('ResourceNotFoundException','Known original TEST worker fixture required');
    if(fn.pendingConfig||fn.lastUpdateStatus==='InProgress')fail('ResourceConflictException','Worker configuration update is pending; wait function-updated-v2');
    if(fn.state&&fn.state!=='Active')fail('ResourceNotReadyException','Worker must be Active');
    if(fn.handler!=='app.handler')fail('Runtime.HandlerNotFound','TEST worker entry point is app.handler');
    if(fn.reservedConcurrency===0)fail('Lambda.TooManyRequestsException','TEST worker reserved concurrency is zero');
    const timing=AG.lambdaTiming(fn);if(timing.warmMs+timing.initMs>(fn.timeout||3)*1000)fail('Sandbox.Timedout','TEST worker bounded timing exceeds configured timeout; no business effect committed');
    if(!object(input)||typeof input.orderId!=='string')fail('InvalidOrder','orderId string required');
    const row=f.orders.find(r=>r.orderId===input.orderId);if(!row)fail('InvalidOrder','Original order does not exist');
    for(const key of ['amount','quantity','sku'])if(own(input,key)&&input[key]!==row[key])fail('IntentConflict','Conflicting '+key+' for existing orderId; preserve intent');
    const stock=f.stock.find(s=>s.sku===row.sku);if(!stock)fail('InventoryUnavailable','Original stock row missing');
    if(!Number.isInteger(stock.available)||stock.available<0||!Number.isInteger(row.quantity)||row.quantity<1||!Number.isInteger(row.amount)||row.amount<1||['captureCount','reserveCount','refundCount'].some(k=>!Number.isInteger(row[k])||row[k]<0))fail('InvalidOrderState','Corrupt original stock, quantity, amount or counters; preserve ledger and investigate');
    const result=()=>({orderId:row.orderId,phase:row.phase,captureCount:row.captureCount,reserveCount:row.reserveCount,refundCount:row.refundCount,available:stock.available,testLedger:true});
    if(op==='capture'){
      if(row.phase==='NEW'){row.phase='CAPTURED';row.captureCount++;}
      else if(!['CAPTURED','READY','REFUNDED'].includes(row.phase))fail('InvalidOrderState','Unknown durable phase');
    }else if(op==='reserve'){
      if(['READY','REFUNDED'].includes(row.phase))return result();
      if(row.phase!=='CAPTURED')fail('InvalidOrderState','Reservation requires durable TEST capture');
      if(stock.available<row.quantity){row.stockFailures=(row.stockFailures||0)+1;fail('OutOfStock','Stock condition rejected; stock and READY phase remain unchanged');}
      stock.available-=row.quantity;row.phase='READY';row.reserveCount++; // one atomic fixture transition
    }else{
      if(row.phase==='REFUNDED')return result();
      if(row.phase!=='CAPTURED')fail('InvalidOrderState','Refund requires unresolved CAPTURED intent');
      if(fn.environment?.Variables?.PROVIDER_AVAILABLE!=='true')fail('RefundUnavailable','TEST refund unavailable; keep pending intent for monitored recovery');
      row.phase='REFUNDED';row.refundCount++;
    }
    return result();
  };
})();

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
    const value=v=>v===null?{NULL:true}:typeof v==='number'?{N:String(v)}:typeof v==='boolean'?{BOOL:v}:Array.isArray(v)?{L:v.map(value)}:v&&typeof v==='object'?{M:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,value(x)]))}:{S:String(v)};
    return Object.fromEntries(Object.entries(item||{}).map(([k,v])=>[k,value(v)]));
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
  const s3Now = () => new Date(sim.account.now || '2026-10-26T00:00:00Z');
  const s3Encryption = b => ({ serverSideEncryption: b.encryption === 'kms' ? 'aws:kms' : 'AES256', ...(b.encryption === 'kms' ? { kmsKey: b.kmsKey || 'alias/aws/s3', bucketKey: !!b.bucketKey } : {}) });
  function s3VersionLocked(v, bypass) {
    if(v.legalHold==='ON')return true;
    const r=v.retention;
    return !!r&&new Date(r.RetainUntilDate)>s3Now()&&(r.Mode==='COMPLIANCE'||!(bypass&&sim.account.canBypassGovernance));
  }
  function ensureVersions(b) {
    if (b.versions) return b.versions=Object.assign(Object.create(null),b.versions);
    b.versions = Object.create(null);
    (b.objects || []).forEach(o => { b.versions[o.key] = [{ ...o, versionId: 'null', deleteMarker: false, size: o.size || 1024, lastModified: o.lastModified || '2026-10-01 10:00:00' }]; });
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
      const fresh={ versionId: b.versioning === true ? vid() : 'null', deleteMarker: false, size, lastModified: now, ...s3Encryption(b) };
      const retention=b.objectLock&&b.objectLock.Rule&&b.objectLock.Rule.DefaultRetention;
      if(retention){const until=s3Now();if(retention.Years)until.setUTCFullYear(until.getUTCFullYear()+retention.Years);else until.setUTCDate(until.getUTCDate()+retention.Days);fresh.retention={Mode:retention.Mode,RetainUntilDate:until.toISOString()};}
      (vs[key] = Array.isArray(vs[key])?vs[key]:[]).unshift(fresh);
      if (b.versioning !== true) vs[key] = vs[key].slice(0, 1);
    } else {
      b.objects = (b.objects || []).filter(o => o.key !== key);
      b.objects.push({ key, size, lastModified: now, ...s3Encryption(b) });
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
    try { exec(raw.trim()); }
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
        '  aws lambda list-functions / get-function-configuration / update-function-configuration --function-name <fn> --memory-size <MB> --timeout <seconds>',
        '  aws lambda wait function-updated-v2 --function-name <fn> / get-function-concurrency / put-function-concurrency --reserved-concurrent-executions <n>',
        '  aws lambda put-function-event-invoke-config --function-name <fn> --destination-config file://destination.json / create-event-source-mapping / list-event-source-mappings',
        '  aws lambda invoke --function-name <fn> --cli-binary-format raw-in-base64-out --payload file://event.json output.json; inspect FunctionError/body, not status alone',
        '  aws elasticache create-replication-group / describe-replication-groups / modify-replication-group --replication-group-id <id>',
        '  aws elasticache wait replication-group-available --replication-group-id <id> / describe-cache-clusters --show-cache-node-info',
        '  aws dax create-cluster / describe-clusters --cluster-names <name> / delete-cluster (metadata only; no cache protocol/failover runtime)',
        '  aws dynamodb list-tables / create-table / wait table-exists / describe-table --table-name <t> / query / scan',
        '  aws dynamodb put-item --item file://item.json [--condition-expression <condition>] / get-item --key <typed JSON> / batch-write-item --request-items file://backfill.json',
        '  aws dynamodb update-table --global-secondary-index-updates file://index.json / update-continuous-backups / update-time-to-live / transact-write-items',
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
        '  aws sqs send-message / receive-message / purge-queue / delete-message / set-queue-attributes --queue-url <url>',
        '  aws sns create-topic --name <n>  |  aws sns list-topics  |  aws sns unsubscribe --subscription-arn <arn>',
        '  aws sns subscribe --topic-arn <arn> --protocol sqs --notification-endpoint <queue-arn>',
        '  aws sns publish --topic-arn <arn> --message <text>  (fan-out: pushes to all SQS subscribers)',
        '  aws efs describe-file-systems / describe-mount-targets --file-system-id <fs> / create-mount-target --file-system-id <fs> --subnet-id <s> --security-groups <sg>',
        '  aws efs describe-mount-target-security-groups / modify-mount-target-security-groups --mount-target-id <mt> [--security-groups <sg>]',
        '  aws efs update-file-system --file-system-id <fs> --throughput-mode elastic / describe-lifecycle-configuration / put-lifecycle-configuration --lifecycle-policies file://lifecycle.json',
        '  aws efs create-access-point --file-system-id <fs> --client-token <token> --posix-user file://user.json --root-directory file://root.json / describe-access-points --file-system-id <fs>',
        '  aws organizations describe-organization / list-accounts / list-organizational-units-for-parent',
        '  aws organizations list-policies / describe-policy --policy-id <p> / attach-policy --policy-id <p> --target-id <ou>',
        '  aws events list-rules / describe-rule --name <n> / list-targets-by-rule --rule <n>',
        '  aws events put-rule --name <n> --event-pattern <json>  |  aws events put-targets --rule <n> --targets file://targets.json',
        '  aws stepfunctions start-execution --state-machine-arn <arn> --name <execution-name> / get-execution-history --execution-arn <arn>',
        '  aws logs put-subscription-filter --log-group-name <g> --filter-name <n> --filter-pattern "" --destination-arn <arn>',
        '  aws logs describe-subscription-filters --log-group-name <g>  |  aws logs put-metric-filter ...',
        '  aws kinesis list-streams / describe-stream --stream-name <s> / create-stream --stream-name <s> --shard-count <n>',
        '  aws firehose list-delivery-streams / describe-delivery-stream --delivery-stream-name <d>',
        '  aws opensearch list-domain-names / describe-domain --domain-name <d>   (alias: aws es ...)',
        '  aws pipes list-pipes / describe-pipe --name <p> / create-pipe --name <p> --source <arn> --target <arn> [--enrichment <arn>]',
        '  aws configure get region / list / set region <r>',
        '  terraform init / plan / apply / validate / destroy / state list',
        '  apply -f <file>   (ls se files dekho — non-tf files ke liye)',
        '  aws route53 create-health-check --caller-reference <unique> --health-check-config file://<json>',
        '  aws route53 change-resource-record-sets --hosted-zone-id <zone> --change-batch file://<json>',
        '  aws route53 get-change --id <change> / wait resource-record-sets-changed --id <change>',
        '  aws route53 test-dns-answer --hosted-zone-id <zone> --record-name <name> --record-type A',
        '  ls · cat <mission-file> · clear · hint · help',
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

    // Messaging exercises advance a virtual clock; no real shell/process sleeps.
    if (toks[0] === 'sleep') {
      if (toks.length !== 2 || !/^\d+$/.test(toks[1]) || Number(toks[1]) > 1209600)
        return print('err', 'sleep: use an integer0..1209600 seconds; this simulator advances only its messaging clock instantly.');
      sim.account.messagingClock = (sim.account.messagingClock || 0) + Number(toks[1]);
      return print('sys', `Messaging teaching clock advanced ${Number(toks[1])} seconds instantly. Real shell sleep waits elapsed time.`);
    }

    if (toks[0] === 'cat') {
      if (toks.length !== 2) return print('err', 'usage: cat <mission-file> (ls lists available files)');
      const f = Object.prototype.hasOwnProperty.call(sim.files, toks[1]) && sim.files[toks[1]];
      return print(f && typeof f.content === 'string' ? 'ok' : 'err', f && typeof f.content === 'string' ? f.content : `cat: ${toks[1]}: No readable mission file`);
    }

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
    if (['elbv2', 'autoscaling', 'ec2', 's3api', 'rds', 'route53', 'cloudfront', 'efs', 'lambda', 'dynamodb', 'elasticache', 'dax', 'sqs', 'sns', 'events', 'scheduler', 'stepfunctions'].includes(service)) {
      const specs = {
        events: {
          'list-rules':['event-bus-name','name-prefix'], 'describe-rule':['name','event-bus-name'],
          'put-rule':['name','event-bus-name','event-pattern','schedule-expression','state','description'], 'delete-rule':['name','event-bus-name','force!'],
          'put-targets':['rule','event-bus-name','targets*'], 'list-targets-by-rule':['rule','event-bus-name'], 'remove-targets':['rule','event-bus-name','ids*','force!'],
          'enable-rule':['name','event-bus-name'], 'disable-rule':['name','event-bus-name'], 'put-events':['entries'], 'test-event-pattern':['event-pattern','event'],
          'list-event-buses':[], 'create-event-bus':['name'], 'describe-event-bus':['name'], 'delete-event-bus':['name'],
        },
        scheduler: {
          'create-schedule':['name','group-name','schedule-expression','schedule-expression-timezone','flexible-time-window','target','state','client-token','description'],
          'update-schedule':['name','group-name','schedule-expression','schedule-expression-timezone','flexible-time-window','target','state','client-token','description'],
          'get-schedule':['name','group-name'], 'delete-schedule':['name','group-name','client-token'], 'list-schedules':['group-name','name-prefix','state'],
          'create-schedule-group':['name','client-token'], 'get-schedule-group':['name'], 'delete-schedule-group':['name','client-token'], 'list-schedule-groups':['name-prefix'],
        },
        stepfunctions: {
          'create-state-machine':['name','definition','role-arn','type'], 'update-state-machine':['state-machine-arn','definition','role-arn'],
          'list-state-machines':[], 'describe-state-machine':['state-machine-arn'], 'delete-state-machine':['state-machine-arn'],
          'start-execution':['state-machine-arn','name','input'], 'start-sync-execution':['state-machine-arn','name','input'], 'list-executions':['state-machine-arn','status-filter'],
          'describe-execution':['execution-arn'], 'get-execution-history':['execution-arn','reverse-order!'], 'stop-execution':['execution-arn','error','cause'],
        },
        sqs: {
          'create-queue':['queue-name','attributes'], 'list-queues':['queue-name-prefix'], 'get-queue-url':['queue-name','queue-owner-aws-account-id'],
          'get-queue-attributes':['queue-url','attribute-names*'], 'set-queue-attributes':['queue-url','attributes'],
          'send-message':['queue-url','message-body','message-attributes','message-group-id','message-deduplication-id','delay-seconds'],
          'receive-message':['queue-url','max-number-of-messages','visibility-timeout','wait-time-seconds','message-system-attribute-names*','attribute-names*','message-attribute-names*'],
          'delete-message':['queue-url','receipt-handle'], 'change-message-visibility':['queue-url','receipt-handle','visibility-timeout'], 'purge-queue':['queue-url'], 'delete-queue':['queue-url'],
        },
        sns: {
          'create-topic':['name','attributes'], 'list-topics':[], 'delete-topic':['topic-arn'], 'get-topic-attributes':['topic-arn'],
          'set-topic-attributes':['topic-arn','attribute-name','attribute-value'],
          'subscribe':['topic-arn','protocol','notification-endpoint','attributes','return-subscription-arn!'], 'list-subscriptions-by-topic':['topic-arn'], 'list-subscriptions':[],
          'get-subscription-attributes':['subscription-arn'], 'set-subscription-attributes':['subscription-arn','attribute-name','attribute-value'], 'unsubscribe':['subscription-arn'],
          'publish':['topic-arn','message','subject','message-attributes','message-group-id','message-deduplication-id'],
        },
        elasticache: {
          'create-replication-group':['replication-group-id','replication-group-description','engine','engine-version','cache-node-type','cache-subnet-group-name','security-group-ids*','preferred-cache-cluster-azs*','num-cache-clusters','port','automatic-failover-enabled!','no-automatic-failover-enabled!','multi-az-enabled!','no-multi-az-enabled!','transit-encryption-enabled!','no-transit-encryption-enabled!','at-rest-encryption-enabled!','no-at-rest-encryption-enabled!','user-group-ids*'],
          'modify-replication-group':['replication-group-id','replication-group-description','automatic-failover-enabled!','no-automatic-failover-enabled!','multi-az-enabled!','no-multi-az-enabled!','apply-immediately!','no-apply-immediately!'],
          'describe-replication-groups':['replication-group-id'], 'describe-cache-clusters':['cache-cluster-id','show-cache-node-info!','no-show-cache-node-info!'], 'describe-cache-subnet-groups':['cache-subnet-group-name'],
          'delete-replication-group':['replication-group-id','retain-primary-cluster!','no-retain-primary-cluster!'], 'wait':['replication-group-id'],
        },
        dax: {
          'create-cluster':['cluster-name','node-type','replication-factor','iam-role-arn','subnet-group-name','security-group-ids*','availability-zones*','sse-specification','cluster-endpoint-encryption-type'],
          'describe-clusters':['cluster-names*'], 'delete-cluster':['cluster-name'],
        },
        dynamodb: {
          'list-tables': [], 'describe-table':['table-name'], 'delete-table':['table-name'], 'wait':['table-name'],
          'create-table':['table-name','attribute-definitions*','key-schema*','billing-mode','provisioned-throughput','global-secondary-indexes','local-secondary-indexes'],
          'update-table':['table-name','attribute-definitions*','billing-mode','provisioned-throughput','global-secondary-index-updates'],
          'batch-write-item':['request-items'], 'transact-write-items':['transact-items','client-request-token'],
          'update-continuous-backups':['table-name','point-in-time-recovery-specification'], 'describe-continuous-backups':['table-name'],
          'update-time-to-live':['table-name','time-to-live-specification'], 'describe-time-to-live':['table-name'],
          'get-item':['table-name','key','consistent-read!','no-consistent-read!'],
          'put-item':['table-name','item','condition-expression','expression-attribute-names','expression-attribute-values','return-values'],
          'delete-item':['table-name','key','condition-expression','expression-attribute-names','expression-attribute-values','return-values'],
          'update-item':['table-name','key','update-expression','condition-expression','expression-attribute-names','expression-attribute-values','return-values'],
          'query':['table-name','index-name','key-condition-expression','expression-attribute-names','expression-attribute-values','filter-expression','projection-expression','consistent-read!','no-consistent-read!','scan-index-forward!','no-scan-index-forward!','limit','exclusive-start-key','select','return-consumed-capacity'],
          'scan':['table-name','index-name','expression-attribute-names','expression-attribute-values','filter-expression','projection-expression','consistent-read!','no-consistent-read!','limit','exclusive-start-key','select','return-consumed-capacity'],
        },
        lambda: {
          'list-functions': [], 'get-function': ['function-name','qualifier'], 'get-function-configuration': ['function-name','qualifier'],
          'update-function-configuration': ['function-name','memory-size','timeout','handler','architectures*','environment'], 'wait': ['function-name','qualifier'],
          'put-function-concurrency': ['function-name','reserved-concurrent-executions'], 'get-function-concurrency': ['function-name'], 'delete-function-concurrency': ['function-name'],
          'put-function-event-invoke-config': ['function-name','qualifier','maximum-retry-attempts','maximum-event-age-in-seconds','destination-config'], 'get-function-event-invoke-config': ['function-name','qualifier'],
          'create-event-source-mapping': ['function-name','event-source-arn','batch-size','function-response-types*','enabled!','no-enabled!'],
          'update-event-source-mapping': ['uuid','batch-size','function-response-types*','enabled!','no-enabled!'], 'get-event-source-mapping': ['uuid'], 'delete-event-source-mapping': ['uuid'], 'list-event-source-mappings': ['function-name','event-source-arn'],
          'invoke': ['function-name','qualifier','invocation-type','payload','cli-binary-format','log-type'],
          'put-provisioned-concurrency-config': ['function-name','qualifier','provisioned-concurrent-executions'], 'get-provisioned-concurrency-config': ['function-name','qualifier'], 'delete-provisioned-concurrency-config': ['function-name','qualifier'], 'publish-version': ['function-name'],
          'add-permission': ['function-name','statement-id','action','principal','source-arn','source-account'], 'get-policy': ['function-name'], 'delete-function': ['function-name'],
        },
        efs: {
          'describe-file-systems':['file-system-id','creation-token'], 'create-file-system':['creation-token','encrypted!','no-encrypted!','performance-mode','throughput-mode','provisioned-throughput-in-mibps','availability-zone-name','tags*'],
          'delete-file-system':['file-system-id'], 'update-file-system':['file-system-id','throughput-mode','provisioned-throughput-in-mibps'],
          'describe-mount-targets':['file-system-id','mount-target-id','access-point-id'], 'create-mount-target':['file-system-id','subnet-id','security-groups*'], 'delete-mount-target':['mount-target-id'],
          'describe-mount-target-security-groups':['mount-target-id'], 'modify-mount-target-security-groups':['mount-target-id','security-groups*'],
          'put-lifecycle-configuration':['file-system-id','lifecycle-policies'], 'describe-lifecycle-configuration':['file-system-id'],
          'create-access-point':['file-system-id','client-token','posix-user','root-directory','tags*'], 'describe-access-points':['access-point-id','file-system-id'], 'delete-access-point':['access-point-id'],
        },
        cloudfront: {
          'list-distributions': [], 'get-distribution': ['id'], 'get-distribution-config': ['id'],
          'update-distribution': ['id','if-match','distribution-config'], 'delete-distribution': ['id','if-match'],
          'create-origin-access-control': ['origin-access-control-config'], 'list-origin-access-controls': [],
          'update-origin-access-control': ['id','if-match','origin-access-control-config'],
          'get-origin-access-control': ['id'], 'delete-origin-access-control': ['id','if-match'],
          'create-invalidation': ['distribution-id','paths*','invalidation-batch'], 'get-invalidation': ['distribution-id','id'],
          'list-invalidations': ['distribution-id'], 'list-cache-policies': ['type'], 'get-cache-policy': ['id'],
          'wait': ['id','distribution-id'],
        },
        route53: {
          'list-hosted-zones': [], 'get-hosted-zone': ['id'], 'create-hosted-zone': ['name','caller-reference','hosted-zone-config','vpc'], 'delete-hosted-zone': ['id'],
          'list-resource-record-sets': ['hosted-zone-id'], 'change-resource-record-sets': ['hosted-zone-id','change-batch'],
          'list-health-checks': [], 'get-health-check': ['health-check-id'], 'get-health-check-status': ['health-check-id'],
          'create-health-check': ['caller-reference','health-check-config'], 'delete-health-check': ['health-check-id'],
          'update-health-check': ['health-check-id','health-check-version','disabled!','no-disabled!','inverted!','no-inverted!','failure-threshold','resource-path'],
          'get-change': ['id'], 'wait': ['id'], 'test-dns-answer': ['hosted-zone-id','record-name','record-type','resolver-ip','edns0-client-subnet-ip','edns0-client-subnet-mask'],
        },
        ec2: {
          'allocate-address': ['domain', 'dry-run!', 'no-dry-run!'], 'release-address': ['allocation-id', 'dry-run!', 'no-dry-run!'],
          'create-nat-gateway': ['subnet-id','allocation-id','connectivity-type','client-token', 'dry-run!', 'no-dry-run!'], 'delete-nat-gateway': ['nat-gateway-id', 'dry-run!', 'no-dry-run!'], 'describe-nat-gateways': ['nat-gateway-ids*','filters*'],
          'create-vpc-endpoint': ['vpc-id','vpc-endpoint-type','service-name','route-table-ids*','subnet-ids*','security-group-ids*','private-dns-enabled!','no-private-dns-enabled!','policy-document','client-token', 'dry-run!', 'no-dry-run!'],
          'modify-vpc-endpoint': ['vpc-endpoint-id','add-route-table-ids*','remove-route-table-ids*','add-subnet-ids*','remove-subnet-ids*','add-security-group-ids*','remove-security-group-ids*','private-dns-enabled!','no-private-dns-enabled!','policy-document', 'dry-run!', 'no-dry-run!'],
          'describe-vpc-endpoints': ['vpc-endpoint-ids*','filters*'], 'delete-vpc-endpoints': ['vpc-endpoint-ids*', 'dry-run!', 'no-dry-run!'], 'describe-prefix-lists': ['prefix-list-ids*','filters*'],
          'create-vpc-peering-connection': ['vpc-id','peer-vpc-id','peer-region', 'dry-run!', 'no-dry-run!'], 'accept-vpc-peering-connection': ['vpc-peering-connection-id', 'dry-run!', 'no-dry-run!'], 'delete-vpc-peering-connection': ['vpc-peering-connection-id', 'dry-run!', 'no-dry-run!'], 'describe-vpc-peering-connections': ['vpc-peering-connection-ids*','filters*'],
          'create-flow-logs': ['resource-type','resource-ids*','traffic-type','log-destination-type','log-destination', 'dry-run!', 'no-dry-run!'], 'describe-flow-logs': ['flow-log-ids*','filters*'], 'delete-flow-logs': ['flow-log-ids*', 'dry-run!', 'no-dry-run!'],
          'wait': ['nat-gateway-ids*'],
          'create-route': ['route-table-id','destination-cidr-block','destination-prefix-list-id','gateway-id','nat-gateway-id','vpc-peering-connection-id','vpc-endpoint-id','dry-run!'],
          'replace-route': ['route-table-id','destination-cidr-block','gateway-id','nat-gateway-id','vpc-peering-connection-id','dry-run!'],
          'delete-route': ['route-table-id','destination-cidr-block','destination-prefix-list-id','dry-run!'],
          'describe-security-groups': ['group-ids*', 'group-names*', 'filters*'],
          'authorize-security-group-ingress': ['group-id', 'group-name', 'protocol', 'port', 'cidr', 'source-group', 'ip-permissions', 'dry-run!', 'no-dry-run!'],
          'revoke-security-group-ingress': ['group-id', 'group-name', 'protocol', 'port', 'cidr', 'source-group', 'ip-permissions', 'dry-run!', 'no-dry-run!'],
        },
        s3api: {
          'put-public-access-block': ['bucket', 'public-access-block-configuration', 'expected-bucket-owner'], 'get-public-access-block': ['bucket', 'expected-bucket-owner'],
          'put-bucket-lifecycle-configuration': ['bucket','lifecycle-configuration','transition-default-minimum-object-size'], 'get-bucket-lifecycle-configuration': ['bucket'], 'delete-bucket-lifecycle': ['bucket'],
          'put-bucket-replication': ['bucket','replication-configuration'], 'get-bucket-replication': ['bucket'], 'delete-bucket-replication': ['bucket'],
          'put-object-lock-configuration': ['bucket','object-lock-configuration'], 'get-object-lock-configuration': ['bucket'],
          'put-object-retention': ['bucket','key','version-id','retention','bypass-governance-retention!'], 'get-object-retention': ['bucket','key','version-id'],
          'put-object-legal-hold': ['bucket','key','version-id','legal-hold'], 'get-object-legal-hold': ['bucket','key','version-id'],
          'put-bucket-intelligent-tiering-configuration': ['bucket','id','intelligent-tiering-configuration'], 'get-bucket-intelligent-tiering-configuration': ['bucket','id'],
          'get-bucket-versioning': ['bucket'], 'put-bucket-versioning': ['bucket','versioning-configuration'],
          'head-object': ['bucket','key','version-id'], 'get-object': ['bucket','key','version-id'],
          'restore-object': ['bucket','key','version-id','restore-request'], 'delete-object': ['bucket','key','version-id','bypass-governance-retention!'],
        },
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
        let positionalSeen=false; const seenOptions=new Set();
        for (let i = op === 'wait' ? 4 : 3; i < toks.length;) {
          if((service==='s3api'&&op==='get-object'||service==='lambda'&&op==='invoke')&&!toks[i].startsWith('--')&&!positionalSeen){positionalSeen=true;i++;continue;}
          const name = toks[i].startsWith('--') ? toks[i].slice(2) : '';
          const spec = allowed.find(a => a.replace(/[*!]$/, '') === name);
          if (!spec) return print('err', `Unknown options: ${toks[i]}. This simulator models the documented flags listed by help.`);
          if(['elasticache','dax','sqs','sns','events','scheduler','stepfunctions'].includes(service)&&seenOptions.has(name))return print('err','Duplicate options are not modeled: --'+name+'; supply one explicit value.');
          seenOptions.add(name);
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
      catch (e) { print('err', 'Invalid --query for this simulator subset: ' + e.message + '. Supported: dotted paths, [0], [], length(), object projections. Omit --query for full JSON.'); return false; }
      const output = flag('output') || 'json';
      if (output === 'json') { print('ok', prettyJson(result)); return true; }
      if (output === 'text') {
        const row = x => Array.isArray(x) ? x.map(z => z == null ? 'None' : String(z)).join('\t') : x && typeof x === 'object' ? Object.keys(x).sort().map(k => String(x[k])).join('\t') : x == null ? 'None' : String(x);
        print('ok', Array.isArray(result) && result.some(x => x && typeof x === 'object') ? result.map(row).join('\n') : row(result)); return true;
      }
      print('err', 'Simulator output support: --output json or text. Table/YAML formatting is not implemented.'); return false;
    }

    if (AG.securityCLI && AG.securityCLI({service,op,toks,flag,flags,sim,list,print,resultJson,s3Encryption})) return;

    if(service==='s3api'&&['put-bucket-lifecycle-configuration','get-bucket-lifecycle-configuration','delete-bucket-lifecycle','put-bucket-replication','get-bucket-replication','delete-bucket-replication','put-object-lock-configuration','get-object-lock-configuration','put-object-retention','get-object-retention','put-object-legal-hold','get-object-legal-hold','put-bucket-intelligent-tiering-configuration','get-bucket-intelligent-tiering-configuration','get-bucket-versioning','put-bucket-versioning','head-object','get-object','restore-object'].includes(op)){
      const clone=x=>JSON.parse(JSON.stringify(x)),object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
      const required=n=>{const v=flag(n);if(!v)throw Error(`aws: error: the following arguments are required: --${n}`);return v;};
      const doc=n=>{let raw=required(n);if(raw.startsWith('file://')){const f=Object.prototype.hasOwnProperty.call(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!f||typeof f.content!=='string')throw Error(`Error parsing parameter --${n}: Unable to load paramfile; use ls/cat`);raw=f.content;}try{const v=JSON.parse(raw);if(!object(v))throw Error('object required');return v;}catch(e){throw Error(`Error parsing parameter --${n}: simulator supports a JSON object/file (${e.message})`);}};
      const bucket=()=>{const name=required('bucket'),b=list('buckets').find(b=>b.name===name);if(!b)throw Error(`NoSuchBucket: ${name}`);return b;};
      const int=(n,min=1)=>Number.isInteger(n)&&n>=min;
      const version=b=>{const key=required('key'),id=flag('version-id'),all=(b.versions||{})[key],vs=Array.isArray(all)?all:[],v=id?vs.find(v=>v.versionId===id):vs[0]||(b.objects||[]).find(v=>v.key===key);if(!v)throw Error(id?`NoSuchVersion: ${id}`:`NoSuchKey: ${key}`);if(v.deleteMarker)throw Error(id?'MethodNotAllowed: Requested version is a delete marker':'NoSuchKey: Current version is a delete marker; list-object-versions to find retained data');return v;};
      const lockEnabled=b=>b.objectLock&&b.objectLock.ObjectLockEnabled==='Enabled';
      const lockCheck=b=>{if(!lockEnabled(b))throw Error('InvalidRequest: Bucket Object Lock must be enabled first');};
      const prefix=f=>f.Prefix!==undefined?f.Prefix:f.And&&f.And.Prefix;
      const validateFilter=f=>{if(!object(f))throw Error('MalformedXML: Filter must be an object');if(f.Prefix!==undefined&&typeof f.Prefix!=='string')throw Error('InvalidArgument: Prefix must be string');if(f.And!==undefined){if(!object(f.And)||typeof f.And.Prefix!=='string')throw Error('Simulator scope: And filter needs Prefix plus object-size condition');for(const k of ['ObjectSizeGreaterThan','ObjectSizeLessThan'])if(f.And[k]!==undefined&&!int(f.And[k],0))throw Error('InvalidArgument: Object size must be a nonnegative integer');if(f.And.ObjectSizeGreaterThan===undefined&&f.And.ObjectSizeLessThan===undefined)throw Error('InvalidArgument: And needs more than one predicate');}if(f.ObjectSizeGreaterThan!==undefined&&!int(f.ObjectSizeGreaterThan,0))throw Error('InvalidArgument: Object size must be a nonnegative integer');if(f.Tag||f.Tags||f.And&&(f.And.Tag||f.And.Tags))throw Error('Simulator scope: Prefix/object-size filters only; tag-based rules are not evaluated here');};
      const classes=['STANDARD_IA','ONEZONE_IA','INTELLIGENT_TIERING','GLACIER_IR','GLACIER','DEEP_ARCHIVE'];
      const minimum={STANDARD_IA:30,ONEZONE_IA:30,GLACIER_IR:90,GLACIER:90,DEEP_ARCHIVE:180,INTELLIGENT_TIERING:0};
      function transitions(rows,daysField){if(!Array.isArray(rows)||!rows.length)throw Error('MalformedXML: Transitions must be a nonempty array');let last=-1,previous;for(const t of rows){if(!object(t)||!classes.includes(t.StorageClass)||!int(t[daysField],0))throw Error('InvalidArgument: Transition needs a supported StorageClass and integer days; date-based transitions outside this simulator subset');if(t[daysField]<=last)throw Error('InvalidArgument: Transition days must increase');if(daysField==='Days'&&['STANDARD_IA','ONEZONE_IA'].includes(t.StorageClass)&&t.Days<30)throw Error('InvalidArgument: Standard-IA/One Zone-IA transition requires object age at least30days');if(previous&&t[daysField]-last<(minimum[previous]||0))throw Error('InvalidArgument: One-rule transition chain must respect source storage-class minimum duration');last=t[daysField];previous=t.StorageClass;}}
      try{
        const b=bucket();
        if(op==='get-bucket-versioning')return resultJson(b.versioning===undefined?{}:{Status:b.versioning?'Enabled':'Suspended'});
        if(op==='put-bucket-versioning'){
          const raw=required('versioning-configuration'),m=raw.match(/^Status=(Enabled|Suspended)$/),status=m?m[1]:doc('versioning-configuration').Status;
          if(!['Enabled','Suspended'].includes(status))throw Error('InvalidArgument: Status must be Enabled or Suspended');if(status==='Suspended'&&lockEnabled(b))throw Error('InvalidBucketState: Cannot suspend versioning on Object Lock enabled bucket');if(status==='Enabled')ensureVersions(b);b.versioning=status==='Enabled';return print('ok','');
        }
        if(op==='put-bucket-lifecycle-configuration'){
          const cfg=doc('lifecycle-configuration');if(!Array.isArray(cfg.Rules)||!cfg.Rules.length||cfg.Rules.length>1000)throw Error('MalformedXML: Rules must contain1..1000 rules');const ids=new Set();
          for(const r of cfg.Rules){if(!object(r)||!['Enabled','Disabled'].includes(r.Status))throw Error('MalformedXML: Each rule needs Enabled/Disabled Status');if(r.ID!==undefined){if(typeof r.ID!=='string'||!r.ID||ids.has(r.ID))throw Error('InvalidArgument: Rule IDs must be unique nonempty strings');ids.add(r.ID);}if(r.Filter!==undefined)validateFilter(r.Filter);else if(typeof r.Prefix!=='string')throw Error('MalformedXML: Rule needs Filter or legacy Prefix');if(r.Filter!==undefined&&r.Prefix!==undefined)throw Error('InvalidArgument: Use Filter or Prefix, not both');
            if(r.Transitions)transitions(r.Transitions,'Days');if(r.NoncurrentVersionTransitions)transitions(r.NoncurrentVersionTransitions,'NoncurrentDays');
            if(r.NoncurrentVersionExpiration&&(!object(r.NoncurrentVersionExpiration)||!int(r.NoncurrentVersionExpiration.NoncurrentDays)))throw Error('InvalidArgument: NoncurrentDays must be positive');
            if(r.AbortIncompleteMultipartUpload&&(!object(r.AbortIncompleteMultipartUpload)||!int(r.AbortIncompleteMultipartUpload.DaysAfterInitiation)))throw Error('InvalidArgument: DaysAfterInitiation must be positive');
            if(r.Expiration){if(!object(r.Expiration)||(!int(r.Expiration.Days)&&r.Expiration.ExpiredObjectDeleteMarker!==true))throw Error('InvalidArgument: Expiration requires positive Days or ExpiredObjectDeleteMarker');if(r.Transitions&&r.Expiration.Days<=r.Transitions.at(-1).Days)throw Error('InvalidArgument: Expiration must follow last transition');}
            if(!['Transitions','NoncurrentVersionTransitions','NoncurrentVersionExpiration','AbortIncompleteMultipartUpload','Expiration'].some(k=>r[k]))throw Error('MalformedXML: Lifecycle rule needs an action');
          }
          const size=flag('transition-default-minimum-object-size')||'all_storage_classes_128K';if(!['all_storage_classes_128K','varies_by_storage_class'].includes(size))throw Error('InvalidArgument: Unknown transition-default-minimum-object-size');b.lifecycle=clone(cfg);b.lifecycleMinimum=size;return print('ok','');
        }
        if(op==='get-bucket-lifecycle-configuration'){if(!b.lifecycle)throw Error('NoSuchLifecycleConfiguration: No lifecycle configuration found');return resultJson({...clone(b.lifecycle),TransitionDefaultMinimumObjectSize:b.lifecycleMinimum||'all_storage_classes_128K'});}
        if(op==='delete-bucket-lifecycle'){delete b.lifecycle;return print('ok','');}
        if(op==='put-object-lock-configuration'){
          const cfg=doc('object-lock-configuration');if(cfg.ObjectLockEnabled!=='Enabled')throw Error('InvalidRequest: Object Lock cannot be disabled once enabled');if(!b.versioning)throw Error('InvalidBucketState: Versioning must be Enabled before Object Lock');
          if(cfg.Rule!==undefined){const r=cfg.Rule&&cfg.Rule.DefaultRetention;if(!object(r)||!['GOVERNANCE','COMPLIANCE'].includes(r.Mode)||(r.Days===undefined)===(r.Years===undefined)||!int(r.Days===undefined?r.Years:r.Days))throw Error('InvalidArgument: DefaultRetention needs Mode and exactly one positive Days/Years value');}
          b.objectLock=clone(cfg);return print('ok','');
        }
        if(op==='get-object-lock-configuration'){if(!lockEnabled(b))throw Error('ObjectLockConfigurationNotFoundError: Object Lock is not enabled');return resultJson({ObjectLockConfiguration:clone(b.objectLock)});}
        if(op==='put-object-retention'){
          lockCheck(b);const v=version(b),r=doc('retention'),date=new Date(r.RetainUntilDate);
          if(!['COMPLIANCE','GOVERNANCE'].includes(r.Mode)||!Number.isFinite(date.getTime())||date<=s3Now())throw Error('InvalidArgument: Retention needs Mode and future RetainUntilDate');
          const old=v.retention;if(old&&new Date(old.RetainUntilDate)>s3Now()&&(r.Mode!==old.Mode||date<new Date(old.RetainUntilDate))){if(old.Mode==='COMPLIANCE'||!(toks.includes('--bypass-governance-retention')&&sim.account.canBypassGovernance))throw Error('AccessDenied: Cannot shorten/change active retention without allowed governance bypass; compliance cannot be bypassed');}
          v.retention={Mode:r.Mode,RetainUntilDate:date.toISOString()};return print('ok','');
        }
        if(op==='get-object-retention'){lockCheck(b);const v=version(b);return resultJson({Retention:v.retention?clone(v.retention):{}});}
        if(op==='put-object-legal-hold'){
          lockCheck(b);const v=version(b),raw=required('legal-hold'),m=raw.match(/^Status=(ON|OFF)$/),status=m?m[1]:doc('legal-hold').Status;if(!['ON','OFF'].includes(status))throw Error('InvalidArgument: LegalHold Status must be ON/OFF');v.legalHold=status;return print('ok','');
        }
        if(op==='get-object-legal-hold'){lockCheck(b);return resultJson({LegalHold:{Status:version(b).legalHold||'OFF'}});}
        if(op==='put-bucket-replication'){
          if(!b.versioning)throw Error("InvalidRequest: Versioning must be 'Enabled' on source bucket to apply replication configuration");
          const cfg=doc('replication-configuration'),match=typeof cfg.Role==='string'&&cfg.Role.match(/^arn:aws:iam::123456789012:role\/(.+)$/),role=match&&(sim.account.roles||[]).find(r=>r.name===match[1]);
          if(!role||!role.replication||role.replication.trust!=='s3.amazonaws.com')throw Error('InvalidRequest: Existing S3-trusted replication role required; inspect mission role-policy.json');
          if(!Array.isArray(cfg.Rules)||!cfg.Rules.length)throw Error('MalformedXML: Replication Rules required');const ids=new Set();
          for(const r of cfg.Rules){if(!object(r)||typeof r.ID!=='string'||ids.has(r.ID)||!['Enabled','Disabled'].includes(r.Status)||!int(r.Priority,0)||!object(r.Destination)||typeof r.Destination.Bucket!=='string')throw Error('InvalidRequest: Replication rule ID/Priority/Status/Destination required');ids.add(r.ID);if(r.Filter)validateFilter(r.Filter);const pre=r.Filter?prefix(r.Filter):r.Prefix;if(typeof pre!=='string')throw Error('Simulator scope: replication rule needs Prefix filter');const name=r.Destination.Bucket.replace(/^arn:aws:s3:::/,''),d=list('buckets').find(x=>x.name===name);if(!d||d===b)throw Error('InvalidArgument: Destination bucket must exist and differ from source');if(!d.versioning)throw Error('InvalidRequest: Destination bucket versioning must be Enabled');if(lockEnabled(b)&&!lockEnabled(d))throw Error('InvalidRequest: Object Lock source requires Object Lock destination');if(role.replication.source!==b.name||role.replication.destination!==d.name||!role.replication.readRetention||!role.replication.readLegalHold)throw Error('AccessDenied: Replication role fixture lacks scoped source/destination/retention permissions');if(!r.DeleteMarkerReplication||!['Enabled','Disabled'].includes(r.DeleteMarkerReplication.Status))throw Error('InvalidRequest: Filtered replication rule needs DeleteMarkerReplication Enabled/Disabled');}
          b.replication=clone(cfg);return print('ok','');
        }
        if(op==='get-bucket-replication'){if(!b.replication)throw Error('ReplicationConfigurationNotFoundError: No replication configuration');return resultJson({ReplicationConfiguration:clone(b.replication)});}
        if(op==='delete-bucket-replication'){delete b.replication;return print('ok','');}
        if(op==='put-bucket-intelligent-tiering-configuration'){
          const id=required('id'),cfg=doc('intelligent-tiering-configuration');if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||cfg.Id!==id||!['Enabled','Disabled'].includes(cfg.Status))throw Error('InvalidArgument: Matching valid Id and Enabled/Disabled Status required');if(cfg.Filter)validateFilter(cfg.Filter);if(!Array.isArray(cfg.Tierings)||!cfg.Tierings.length)throw Error('InvalidArgument: Optional archive Tierings array required');const seen=new Set();for(const t of cfg.Tierings){if(!object(t)||!['ARCHIVE_ACCESS','DEEP_ARCHIVE_ACCESS'].includes(t.AccessTier)||!int(t.Days,t.AccessTier==='ARCHIVE_ACCESS'?90:180)||t.Days>730||seen.has(t.AccessTier))throw Error('InvalidArgument: Unique ARCHIVE_ACCESS90..730 / DEEP_ARCHIVE_ACCESS180..730 day tiers required');seen.add(t.AccessTier);}const tiers=b.intelligentTiering||{};tiers[id]=clone(cfg);b.intelligentTiering=tiers;return print('ok','');
        }
        if(op==='get-bucket-intelligent-tiering-configuration'){const id=required('id'),cfg=b.intelligentTiering&&Object.prototype.hasOwnProperty.call(b.intelligentTiering,id)&&b.intelligentTiering[id];if(!cfg)throw Error('NoSuchConfiguration: Intelligent-Tiering configuration not found');return resultJson({IntelligentTieringConfiguration:clone(cfg)});}
        if(op==='restore-object'){
          const v=version(b);if(!['GLACIER','DEEP_ARCHIVE'].includes(v.storageClass))throw Error('InvalidObjectState: Restore applies to archived GLACIER/DEEP_ARCHIVE in this simulator');const raw=required('restore-request'),m=raw.match(/^Days=(\d+),GlacierJobParameters=\{Tier=(Standard|Bulk|Expedited)\}$/),r=m?{Days:Number(m[1]),GlacierJobParameters:{Tier:m[2]}}:doc('restore-request');
          const tier=r.GlacierJobParameters&&r.GlacierJobParameters.Tier;if(!int(r.Days)||!['Standard','Bulk','Expedited'].includes(tier)||v.storageClass==='DEEP_ARCHIVE'&&tier==='Expedited')throw Error('InvalidArgument: Restore needs positive Days and valid retrieval tier; no Expedited for Deep Archive');if(v.restore&&v.restore.pollsRemaining>0)throw Error('RestoreAlreadyInProgress: Poll head-object; repeated submission does not speed restoration');v.restore={pollsRemaining:2,expires:new Date(s3Now().getTime()+r.Days*86400000).toISOString(),tier};return print('ok','');
        }
        if(op==='head-object'||op==='get-object'){
          const v=version(b);if(op==='head-object'&&v.restore&&v.restore.pollsRemaining>0)v.restore.pollsRemaining--;
          const restored=v.restore&&v.restore.pollsRemaining===0&&new Date(v.restore.expires)>s3Now();
          const encryption=v.serverSideEncryption ? v : s3Encryption(b);
          const result={ContentLength:v.size||0,VersionId:v.versionId||'null',StorageClass:v.storageClass||'STANDARD',ETag:v.etag||'"fixture"',ServerSideEncryption:encryption.serverSideEncryption,...(encryption.serverSideEncryption==='aws:kms'?{SSEKMSKeyId:encryption.kmsKey,BucketKeyEnabled:!!encryption.bucketKey}:{}),...(v.retention?{ObjectLockMode:v.retention.Mode,ObjectLockRetainUntilDate:v.retention.RetainUntilDate}:{}),...(v.legalHold?{ObjectLockLegalHoldStatus:v.legalHold}:{}),...(v.restore?{Restore:'ongoing-request="'+(v.restore.pollsRemaining>0?'true':'false')+'", expiry-date="'+v.restore.expires+'"'}:{})};
          if(op==='get-object'){
            if(['GLACIER','DEEP_ARCHIVE'].includes(v.storageClass)&&!restored)throw Error('InvalidObjectState: Archived version not restored; poll Restore metadata until ongoing-request=false');
            let outfile;for(let i=3;i<toks.length;i++){if(toks[i].startsWith('--')){if(!['--no-cli-pager','--no-paginate'].includes(toks[i]))i++;}else outfile=toks[i];}if(!outfile)throw Error('aws: error: outfile is required for get-object');if(['__proto__','constructor','prototype'].includes(outfile))throw Error('Simulator: choose an ordinary output filename');
            (sim.downloads||(sim.downloads={}))[outfile]={versionId:v.versionId||'null',body:v.body||'',etag:v.etag||'"fixture"'};
          }
          return resultJson(result);
        }
      }catch(e){return print('err',e.message);}
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

    // VPC deep-dive API subset. Metadata transitions are modeled, not packet simulation.
    if (service === 'ec2' && ['create-nat-gateway','delete-nat-gateway','describe-nat-gateways','wait','create-vpc-endpoint','modify-vpc-endpoint','delete-vpc-endpoints','describe-vpc-endpoints','describe-prefix-lists','create-vpc-peering-connection','accept-vpc-peering-connection','delete-vpc-peering-connection','describe-vpc-peering-connections','create-flow-logs','describe-flow-logs','delete-flow-logs','release-address'].includes(op)) {
      const vpc = id => list('vpcs').find(v => v.id === id);
      const sub = id => list('subnets').find(v => v.id === id);
      const next = (key, prefix, coll) => {
        let id; do { sim[key] = (sim[key] || 0) + 1; id = prefix + String(sim[key]).padStart(9, '0'); } while (list(coll).some(x => x.id === id)); return id;
      };
      const select = (coll, arg, filterKeys) => {
        let rows = list(coll); const ids = flags(arg);
        if (ids.some(id => !rows.some(x => x.id === id))) throw Error(`InvalidParameterValue: one or more --${arg} IDs do not exist`);
        if (ids.length) rows = rows.filter(x => ids.includes(x.id));
        for (const f of flags('filters')) {
          const m = f.match(/^Name=([^,]+),Values=(.+)$/);
          if (!m || !Object.prototype.hasOwnProperty.call(filterKeys, m[1])) throw Error('InvalidParameterValue: unsupported or malformed filter; omit --filters to inspect full metadata');
          rows = rows.filter(x => m[2].split(',').includes(String(filterKeys[m[1]](x))));
        }
        return rows;
      };
      const natJSON = n => ({ NatGatewayId:n.id, VpcId:sub(n.subnetId) && sub(n.subnetId).vpcId, SubnetId:n.subnetId, State:n.state, ConnectivityType:n.connectivityType || 'public', NatGatewayAddresses:n.allocationId ? [{AllocationId:n.allocationId,PublicIp:n.publicIp}] : [] });
      const endpointJSON = e => ({VpcEndpointId:e.id,VpcEndpointType:e.type,VpcId:e.vpcId,ServiceName:e.serviceName,State:e.state,RouteTableIds:e.routeTableIds||[],SubnetIds:e.subnetIds||[],PrivateDnsEnabled:!!e.privateDnsEnabled,NetworkInterfaceIds:e.networkInterfaceIds||[],Groups:(e.sgIds||[]).map(id=>({GroupId:id})),PolicyDocument:JSON.stringify(e.policy||{Statement:[{Effect:'Allow',Principal:'*',Action:'*',Resource:'*'}]})});
      const peerJSON = p => ({VpcPeeringConnectionId:p.id,Status:{Code:p.state},RequesterVpcInfo:{VpcId:p.requester,CidrBlock:(vpc(p.requester)||{}).cidr},AccepterVpcInfo:{VpcId:p.accepter,CidrBlock:(vpc(p.accepter)||{}).cidr}});
      const flowJSON = f => ({FlowLogId:f.id,ResourceId:f.resourceId,TrafficType:f.trafficType,FlowLogStatus:f.state,LogDestinationType:f.destinationType,LogDestination:f.destination});
      const updateEndpointRoutes = e => {
        for (const rt of networkTables()) rt.routes = rt.routes.filter(r => r.target !== e.id);
        if (e.type === 'Gateway' && e.state !== 'deleted') for (const id of e.routeTableIds) networkTables().find(t=>t.id===id).routes.push({prefixListId:e.prefixListId,target:e.id,type:'endpoint',state:'active',managed:true});
      };
      try {
        if(toks.includes('--dry-run')&&!op.startsWith('describe-')) {print('err','DryRunOperation: Request would have succeeded, but DryRun flag is set.');return;}
        if (op === 'describe-nat-gateways') return resultJson({NatGateways:select('natGateways','nat-gateway-ids',{'vpc-id':n=>(sub(n.subnetId)||{}).vpcId,'state':n=>n.state,'subnet-id':n=>n.subnetId}).map(natJSON)});
        if (op === 'describe-vpc-endpoints') return resultJson({VpcEndpoints:select('vpcEndpoints','vpc-endpoint-ids',{'vpc-id':e=>e.vpcId,'vpc-endpoint-state':e=>e.state,'service-name':e=>e.serviceName}).map(endpointJSON)});
        if (op === 'describe-vpc-peering-connections') return resultJson({VpcPeeringConnections:select('vpcPeerings','vpc-peering-connection-ids',{'status-code':p=>p.state,'requester-vpc-info.vpc-id':p=>p.requester,'accepter-vpc-info.vpc-id':p=>p.accepter}).map(peerJSON)});
        if (op === 'describe-flow-logs') return resultJson({FlowLogs:select('flowLogs','flow-log-ids',{'resource-id':f=>f.resourceId,'flow-log-id':f=>f.id}).map(flowJSON)});
        if (op === 'describe-prefix-lists') {
          const region=sim.account.region||'us-east-1';
          for(const service of ['s3','dynamodb']) if(!list('prefixLists').some(p=>p.name===`com.amazonaws.${region}.${service}`))list('prefixLists').push({id:'pl-'+service,name:`com.amazonaws.${region}.${service}`});
          return resultJson({PrefixLists:select('prefixLists','prefix-list-ids',{'prefix-list-name':p=>p.name}).map(p=>({PrefixListId:p.id,PrefixListName:p.name,Cidrs:p.cidrs||[]}))});
        }
        if (op === 'release-address') {
          const id=flag('allocation-id'), a=list('addresses').find(a=>a.allocationId===id);
          if(!a) throw Error('InvalidAllocationID.NotFound: allocation ID does not exist');
          if(a.natId||a.instanceId) throw Error('InvalidIPAddress.InUse: disassociate/delete the associated resource before releasing this address');
          sim.account.addresses=list('addresses').filter(x=>x!==a); return print('ok','');
        }
        if(op==='wait') {
          const waiter=toks[3];
          if(!['nat-gateway-available','nat-gateway-deleted'].includes(waiter)) throw Error('Simulator models nat-gateway-available and nat-gateway-deleted EC2 waiters here');
          const ids=flags('nat-gateway-ids'); if(!ids.length) throw Error('aws: error: --nat-gateway-ids is required');
          const nats=ids.map(id=>list('natGateways').find(n=>n.id===id));
          if(nats.some(n=>!n)) throw Error('InvalidNatGatewayID.NotFound: NAT ID does not exist');
          if(nats.some(n=>waiter==='nat-gateway-available' ? !['pending','available'].includes(n.state) : !['deleting','deleted'].includes(n.state))) throw Error('WaiterError: NAT is not in a state that can satisfy this waiter');
          nats.forEach(n=>{n.state=waiter.endsWith('available')?'available':'deleted';if(n.state==='deleted') {const a=list('addresses').find(a=>a.allocationId===n.allocationId);if(a) delete a.natId;}});
          print('sys','Simulator waiter reconciled NAT metadata immediately; real AWS polls asynchronously.'); return;
        }
        if(op==='create-nat-gateway') {
          const subnet=sub(flag('subnet-id')), type=flag('connectivity-type')||'public', a=list('addresses').find(a=>a.allocationId===flag('allocation-id'));
          if(!subnet) throw Error('InvalidSubnetID.NotFound: subnet ID does not exist');
          if(!['public','private'].includes(type)) throw Error('InvalidParameterValue: ConnectivityType must be public or private');
          if(type==='public'&&!a) throw Error('InvalidAllocationID.NotFound: public NAT requires an existing --allocation-id');
          if(type==='private'&&flag('allocation-id')) throw Error('InvalidParameterCombination: private NAT does not use an Elastic IP');
          const token=flag('client-token'), existing=token&&list('natGateways').find(n=>n.clientToken===token);
          if(existing) {if(existing.subnetId!==subnet.id||(existing.allocationId||null)!==flag('allocation-id')||existing.connectivityType!==type) throw Error('IdempotentParameterMismatch: client token was used with different parameters');return resultJson({NatGateway:natJSON(existing)});}
          if(a&&(a.natId||a.instanceId)) throw Error('Resource.AlreadyAssociated: Elastic IP is already associated');
          const n={id:next('natSeq','nat-','natGateways'),subnetId:subnet.id,allocationId:a&&a.allocationId,publicIp:a&&a.publicIp,connectivityType:type,state:'pending',clientToken:token};
          list('natGateways').push(n); if(a) a.natId=n.id; return resultJson({NatGateway:natJSON(n)});
        }
        if(op==='delete-nat-gateway') {
          const n=list('natGateways').find(n=>n.id===flag('nat-gateway-id'));if(!n) throw Error('InvalidNatGatewayID.NotFound: NAT ID does not exist');
          if(n.state!=='deleted') n.state='deleting';
          networkTables().forEach(rt=>rt.routes.forEach(r=>{if(r.target===n.id)r.state='blackhole';}));return resultJson({NatGatewayId:n.id});
        }
        if(op==='create-vpc-endpoint'||op==='modify-vpc-endpoint') {
          const modifying=op==='modify-vpc-endpoint', old=modifying&&list('vpcEndpoints').find(e=>e.id===flag('vpc-endpoint-id')&&e.state!=='deleted');
          if(modifying&&!old) throw Error('InvalidVpcEndpointId.NotFound: endpoint ID does not exist');
          const type=old?old.type:(flag('vpc-endpoint-type')||'Gateway'), vid=old?old.vpcId:flag('vpc-id'), v=vpc(vid), serviceName=old?old.serviceName:flag('service-name');
          const region=sim.account.region||'us-east-1';
          if(!v) throw Error('InvalidVpcID.NotFound: VPC does not exist');
          if(!['Gateway','Interface'].includes(type)) throw Error('Simulator models Gateway and Interface endpoint types here');
          const gatewayService=['s3','dynamodb'].find(x=>serviceName===`com.amazonaws.${region}.${x}`);
          if(type==='Gateway'&&!gatewayService) throw Error('InvalidServiceName: Gateway endpoint supports same-region S3 or DynamoDB in this simulator');
          if(type==='Interface'&&!['secretsmanager','ssm','ssmmessages','ec2messages','ecr.api','ecr.dkr','kms','sqs','logs','sts'].some(x=>serviceName===`com.amazonaws.${region}.${x}`)) throw Error('Simulator: service endpoint not modeled; supported local AWS Interface services include secretsmanager, ssm, ecr.api, ecr.dkr, kms, sqs, logs and sts');
          const nextIDs=(current,add,remove)=>[...new Set([...current.filter(x=>!remove.includes(x)),...add])];
          const routes=modifying?nextIDs(old.routeTableIds||[],flags('add-route-table-ids'),flags('remove-route-table-ids')):flags('route-table-ids');
          const subs=modifying?nextIDs(old.subnetIds||[],flags('add-subnet-ids'),flags('remove-subnet-ids')):flags('subnet-ids');
          const groups=modifying?nextIDs(old.sgIds||[],flags('add-security-group-ids'),flags('remove-security-group-ids')):flags('security-group-ids');
          if(routes.some(id=>!networkTables().some(t=>t.id===id&&t.vpcId===vid))) throw Error('InvalidRouteTableID.NotFound: endpoint route tables must exist in the same VPC');
          if(subs.some(id=>!sub(id)||sub(id).vpcId!==vid)||new Set(subs.map(id=>sub(id).az)).size!==subs.length) throw Error('InvalidSubnet: interface endpoint uses at most one existing subnet per AZ in the same VPC');
          if(groups.some(id=>!list('securityGroups').some(g=>g.id===id&&g.vpcId===vid))) throw Error('InvalidGroup.NotFound: endpoint security groups must exist in the same VPC');
          if(type==='Gateway'&&(subs.length||groups.length)) throw Error('InvalidParameterCombination: Gateway endpoint uses route tables, not subnet/SG ENIs');
          if(type==='Interface'&&(routes.length||!subs.length)) throw Error('InvalidParameterCombination: Interface endpoint needs subnet IDs, not route table IDs');
          if(toks.includes('--private-dns-enabled')&&toks.includes('--no-private-dns-enabled')) throw Error('InvalidParameterCombination: private DNS flags are mutually exclusive');
          if(type==='Interface'&&!modifying&&!toks.includes('--private-dns-enabled')&&!toks.includes('--no-private-dns-enabled'))throw Error('Simulator: specify --private-dns-enabled or --no-private-dns-enabled explicitly for Interface endpoints.');
          const privateDNS=toks.includes('--private-dns-enabled')?true:toks.includes('--no-private-dns-enabled')?false:old?old.privateDnsEnabled:false;
          if(type==='Gateway'&&privateDNS) throw Error('InvalidParameterCombination: private DNS toggle is modeled only for Interface endpoints');
          if(privateDNS&&(!v.dnsSupport||!v.dnsHostnames)) throw Error('InvalidParameter: private DNS requires enableDnsSupport and enableDnsHostnames');
          let policy=old&&old.policy;
          if(flag('policy-document')) {try{policy=JSON.parse(flag('policy-document'));}catch(e){throw Error('InvalidPolicyDocument: policy must be valid JSON');} if(!policy||typeof policy!=='object'||!Array.isArray(policy.Statement))throw Error('InvalidPolicyDocument: policy needs a Statement array');}
          const token=flag('client-token'), prior=token&&list('vpcEndpoints').find(e=>e.clientToken===token);
          if(prior){if(prior.vpcId!==vid||prior.serviceName!==serviceName||JSON.stringify(prior.routeTableIds)!==JSON.stringify(routes)||JSON.stringify(prior.subnetIds)!==JSON.stringify(subs)||prior.type!==type||JSON.stringify(prior.sgIds)!==JSON.stringify(groups)||prior.privateDnsEnabled!==privateDNS||JSON.stringify(prior.policy)!==JSON.stringify(policy))throw Error('IdempotentParameterMismatch: endpoint client token parameters changed');return resultJson({VpcEndpoint:endpointJSON(prior)});}
          if(type==='Gateway') for(const id of routes) if(networkTables().find(t=>t.id===id).routes.some(r=>r.prefixListId&&r.target!==(old&&old.id)&&list('vpcEndpoints').some(e=>e.id===r.target&&e.serviceName===serviceName&&e.state!=='deleted'))) throw Error('RouteAlreadyExists: route table already uses another endpoint for this service');
          const e=old||{id:next('endpointSeq','vpce-','vpcEndpoints'),clientToken:token};
          Object.assign(e,{type,vpcId:vid,serviceName,state:'available',routeTableIds:routes,subnetIds:subs,sgIds:groups,privateDnsEnabled:privateDNS,policy});
          if(type==='Gateway') {
            let p=list('prefixLists').find(p=>p.name===serviceName);if(!p){p={id:gatewayService==='s3'?'pl-s3':'pl-dynamodb',name:serviceName};list('prefixLists').push(p);}e.prefixListId=p.id;
          } else e.networkInterfaceIds=subs.map((id,i)=>'eni-'+e.id.slice(5)+String(i).padStart(8,'0'));
          if(!old)list('vpcEndpoints').push(e);updateEndpointRoutes(e);return resultJson(modifying?{Return:true}:{VpcEndpoint:endpointJSON(e)});
        }
        if(op==='delete-vpc-endpoints') {
          const ids=flags('vpc-endpoint-ids');if(!ids.length)throw Error('aws: error: --vpc-endpoint-ids is required');
          const endpoints=ids.map(id=>list('vpcEndpoints').find(e=>e.id===id));if(endpoints.some(e=>!e))throw Error('InvalidVpcEndpointId.NotFound: endpoint ID does not exist');
          endpoints.forEach(e=>{e.state='deleted';updateEndpointRoutes(e);});return resultJson({Unsuccessful:[]});
        }
        if(op==='create-vpc-peering-connection') {
          const a=vpc(flag('vpc-id')), b=vpc(flag('peer-vpc-id'));
          if(!a||!b)throw Error('InvalidVpcID.NotFound: requester and peer VPC IDs must exist');
          if(flag('peer-region')&&flag('peer-region')!==(sim.account.region||'us-east-1'))throw Error('Simulator models same-region peering here; real AWS also supports inter-region peering');
          if(a===b)throw Error('InvalidParameterValue: a VPC cannot peer with itself');
          const range=c=>{const canonical=ipv4Cidr(c);if(!canonical)throw Error('InvalidParameterValue: VPC IPv4 CIDR missing');const [ip,bits]=canonical.split('/'),start=ip.split('.').reduce((n,x)=>n*256+Number(x),0);return [start,start+2**(32-Number(bits))-1];};
          const [a0,a1]=range(a.cidr),[b0,b1]=range(b.cidr);if(a0<=b1&&b0<=a1)throw Error('InvalidParameterValue: overlapping VPC CIDRs cannot be peered');
          if(list('vpcPeerings').some(p=>p.state!=='deleted'&&[p.requester,p.accepter].includes(a.id)&&[p.requester,p.accepter].includes(b.id)))throw Error('VpcPeeringConnectionAlreadyExists: active or pending peer already exists');
          const p={id:next('peerSeq','pcx-','vpcPeerings'),requester:a.id,accepter:b.id,state:'pending-acceptance'};list('vpcPeerings').push(p);return resultJson({VpcPeeringConnection:peerJSON(p)});
        }
        if(op==='accept-vpc-peering-connection'||op==='delete-vpc-peering-connection') {
          const p=list('vpcPeerings').find(p=>p.id===flag('vpc-peering-connection-id'));if(!p)throw Error('InvalidVpcPeeringConnectionID.NotFound: peer ID does not exist');
          if(op==='accept-vpc-peering-connection') {
            if(p.state!=='pending-acceptance')throw Error('InvalidStateTransition: peer must be pending-acceptance');p.state='active';
            networkTables().forEach(t=>t.routes.forEach(r=>{if(r.target===p.id)r.state='active';}));return resultJson({VpcPeeringConnection:peerJSON(p)});
          }
          p.state='deleted';networkTables().forEach(t=>t.routes.forEach(r=>{if(r.target===p.id)r.state='blackhole';}));return resultJson({Return:true});
        }
        if(op==='create-flow-logs') {
          const resources=flags('resource-ids'), traffic=flag('traffic-type'), destinationType=flag('log-destination-type')||'cloud-watch-logs', destination=flag('log-destination');
          if(flag('resource-type')!=='VPC'||!resources.length||resources.some(id=>!vpc(id)))throw Error('Simulator: Flow Log creation here requires --resource-type VPC and existing --resource-ids');
          if(!['ALL','ACCEPT','REJECT'].includes(traffic))throw Error('InvalidParameterValue: traffic-type must be ALL, ACCEPT or REJECT');
          if(destinationType!=='s3')throw Error('Simulator: S3 Flow Log destination is modeled here; CloudWatch needs a delivery role/log group');
          const match=destination&&destination.match(/^arn:aws:s3:::([a-z0-9.-]+)(?:\/.*)?$/);if(!match||!list('buckets').some(b=>b.name===match[1]))throw Error('InvalidParameterValue: S3 log destination must name an existing lab bucket ARN');
          const made=resources.map(resourceId=>({id:next('flowSeq','fl-','flowLogs'),resourceId,trafficType:traffic,state:'ACTIVE',destinationType,destination}));list('flowLogs').push(...made);return resultJson({FlowLogIds:made.map(f=>f.id),Unsuccessful:[]});
        }
        if(op==='delete-flow-logs') {
          const ids=flags('flow-log-ids');if(!ids.length||ids.some(id=>!list('flowLogs').some(f=>f.id===id)))throw Error('InvalidFlowLogId.NotFound: existing --flow-log-ids required');
          sim.account.flowLogs=list('flowLogs').filter(f=>!ids.includes(f.id));return resultJson({Unsuccessful:[]});
        }
      } catch(e) {print('err',e.message);return;}
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
            const all = (b.versions || {})[key];
            const list = Array.isArray(all) ? all : [];
            const idx = list.findIndex(x => x.versionId === v);
            if (idx < 0) return print('err', `An error occurred (InvalidArgument) when calling the DeleteObject operation: Invalid version id specified`);
            if(s3VersionLocked(list[idx],toks.includes('--bypass-governance-retention')))return print('err','An error occurred (AccessDenied) when calling the DeleteObject operation: Protected object version cannot be deleted; compliance/legal hold cannot be bypassed.');
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
          const b=buckets[idx];
          const nonempty=b.versions?Object.values(b.versions).some(v=>Array.isArray(v)&&v.length):(b.objects||[]).length>0;
          if(nonempty)return print('err','An error occurred (BucketNotEmpty) when calling the DeleteBucket operation: Delete all objects, versions and delete markers first; active retention still protects locked versions.');
          buckets.splice(idx, 1);
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
          if(toks.includes('--dry-run'))return print('err','DryRunOperation: Request would have succeeded, but DryRun flag is set.');
          if(flag('domain')&&flag('domain')!=='vpc')return print('err','Simulator models VPC Elastic IP allocations; use --domain vpc.');
          const n = sim.eipSeq = Math.max(sim.eipSeq || 0, ...list('addresses').map(a => Number((a.allocationId.match(/(\d+)$/) || [0,0])[1]) || 0)) + 1; // deterministic, never reuse released IDs
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
              'route.gateway-id': rt => rt.routes.filter(r => !/^(nat-|pcx-)/.test(r.target)).map(r => r.target),
              'route.nat-gateway-id': rt => rt.routes.filter(r => /^nat-/.test(r.target)).map(r => r.target),
              'route.vpc-peering-connection-id': rt => rt.routes.filter(r => /^pcx-/.test(r.target)).map(r => r.target),
              'association.subnet-id': rt => rt.associations.map(a => a.subnetId),
              'association.route-table-association-id': rt => rt.associations.map(a => a.id),
              'association.main': rt => rt.associations.map(a => String(!!a.main)),
            };
            if (!Object.prototype.hasOwnProperty.call(getters, m[1])) return print('err', `InvalidParameterValue: filter '${m[1]}' is not supported in this simulator`);
            rts = rts.filter(rt => getters[m[1]](rt).some(value => values.includes(value)));
          }
          return resultJson({ RouteTables: rts.map(rt => ({
            RouteTableId: rt.id, VpcId: rt.vpcId,
            Routes: rt.routes.map(r => ({ ...(r.prefixListId ? {DestinationPrefixListId:r.prefixListId} : {DestinationCidrBlock:r.destination}),
              [/^nat-/.test(r.target) ? 'NatGatewayId' : /^pcx-/.test(r.target) ? 'VpcPeeringConnectionId' : 'GatewayId']: r.target,
              State: r.state || 'active', Origin: r.target === 'local' ? 'CreateRouteTable' : 'CreateRoute' })),
            Associations: rt.associations.map(a => ({ Main: !!a.main, SubnetId: a.subnetId,
              RouteTableAssociationId: a.id, RouteTableId: rt.id, AssociationState: { State: 'associated' } })),
          })) });
        } else if (op === 'create-route' || op === 'replace-route' || op === 'delete-route') {
          const id = flag('route-table-id'), destination = ipv4Cidr(flag('destination-cidr-block'));
          if(flag('destination-prefix-list-id')||flag('vpc-endpoint-id')) return print('err','Simulator: S3/DynamoDB gateway prefix routes are managed through create/modify-vpc-endpoint route-table associations; manual endpoint-target routes are not modeled here.');
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
          const targets = ['gateway-id', 'nat-gateway-id', 'vpc-peering-connection-id'].filter(name => flag(name));
          if (targets.length !== 1) return print('err', 'InvalidParameterCombination: specify exactly one target: --gateway-id, --nat-gateway-id or --vpc-peering-connection-id');
          const target = flag(targets[0]);
          if (targets[0] === 'gateway-id') {
            const igw = list('internetGateways').find(g => g.id === target);
            if (!igw) return print('err', `InvalidInternetGatewayID.NotFound: Internet gateway '${target}' does not exist`);
            if (igw.vpcId !== rt.vpcId) return print('err', `InvalidParameterValue: gateway '${target}' is not attached to VPC '${rt.vpcId}'`);
          } else if(targets[0]==='vpc-peering-connection-id') {
            const peer=list('vpcPeerings').find(p=>p.id===target&&p.state!=='deleted');
            if(!peer)return print('err','InvalidVpcPeeringConnectionID.NotFound: peering connection does not exist');
            if(![peer.requester,peer.accepter].includes(rt.vpcId))return print('err','InvalidParameterValue: route table VPC must be a participant in this peer');
          } else {
            const nat = list('natGateways').find(g => g.id === target);
            if (!nat) return print('err', `InvalidNatGatewayID.NotFound: NAT gateway '${target}' does not exist`);
            const subnet = list('subnets').find(s => s.id === nat.subnetId);
            if (!subnet || subnet.vpcId !== rt.vpcId || (nat.state && nat.state !== 'available')) return print('err', 'InvalidParameterValue: NAT gateway must be available in the same VPC');
          }
          if (existing && op !== 'replace-route') return print('err', `RouteAlreadyExists: The route identified by ${destination} already exists`);
          if(op==='replace-route'&&(!existing||existing.target==='local'))return print('err','InvalidParameterValue: replace-route needs an existing nonlocal route');
          if (toks.includes('--dry-run')) return print('err', 'DryRunOperation: Request would have succeeded, but DryRun flag is set.');
          const route={destination,target,type:targets[0]==='gateway-id'?'igw':targets[0]==='nat-gateway-id'?'nat':'peering',state:targets[0]==='vpc-peering-connection-id'&&list('vpcPeerings').find(p=>p.id===target).state!=='active'?'blackhole':'active'};
          if(existing)Object.assign(existing,route);else rt.routes.push(route);
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
      case 'lambda': {
        const clone=x=>JSON.parse(JSON.stringify(x));
        const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
        const required=n=>{const value=flag(n);if(!value)throw Error(`aws: error: the following arguments are required: --${n}`);return value;};
        function read(n, fallback) {
          let raw=flag(n);if(raw===null)return fallback;
          if(raw.startsWith('file://')||raw.startsWith('fileb://')) {
            const name=raw.slice(raw.startsWith('fileb://')?8:7);
            const f=Object.prototype.hasOwnProperty.call(sim.files,name)&&sim.files[name];
            if(!f||typeof f.content!=='string')throw Error(`Error parsing parameter --${n}: Unable to load paramfile; use ls/cat`);
            raw=f.content;
          }
          try{return JSON.parse(raw);}catch(e){throw Error(`InvalidRequestContentException: --${n} must contain valid JSON`);}
        }
        const functions=()=>list('lambdas'),mappings=()=>list('eventSourceMappings');
        function getFn() {
          const raw=required('function-name');
          const match=raw.match(/^(?:arn:aws:lambda:([a-z0-9-]+):123456789012:function:)?([A-Za-z0-9_-]+)(?::([A-Za-z0-9_$-]+))?$/);
          if(!match||match[1]&&match[1]!==sim.account.region)throw Error('ResourceNotFoundException: Function name/ARN not found in this fixture Region');
          const fn=functions().find(f=>f.name===match[2]);if(!fn)throw Error(`ResourceNotFoundException: Function '${match[2]}' not found`);
          const qualifier=flag('qualifier')||match[3];return {fn,qualifier};
        }
        const role=f=>list('roles').find(r=>r.name===f.roleName);
        const queue=arn=>list('queues').find(q=>q.arn===arn);
        const mapping=()=>{const id=required('uuid'),m=mappings().find(m=>m.uuid===id);if(!m)throw Error('ResourceNotFoundException: Unknown event source mapping');return m;};
        const numeric=(name,min,max)=>{const raw=required(name),v=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(v)||v<min||v>max)throw Error(`InvalidParameterValueException: --${name} must be integer ${min}..${max}`);return v;};
        const revision=f=>f.revisionId||'r0';
        function completeUpdate(f) {if(f.pendingConfig){Object.assign(f,f.pendingConfig);delete f.pendingConfig;f.lastUpdateStatus='Successful';f.revisionId='r'+((f.revisionCounter||0)+1);f.revisionCounter=(f.revisionCounter||0)+1;}}
        function config(f,version) {return {FunctionName:f.name,Runtime:f.runtime,Handler:f.handler,MemorySize:f.memory||128,Timeout:f.timeout||3,State:f.state||'Active',LastUpdateStatus:f.pendingConfig?'InProgress':f.lastUpdateStatus||'Successful',RevisionId:revision(f),Version:f._version||version||'$LATEST',Architectures:f.architectures||['x86_64'],Environment:clone(f.environment||{Variables:{}})};}
        const mapView=m=>({UUID:m.uuid,FunctionArn:`arn:aws:lambda:${sim.account.region}:123456789012:function:${m.functionName}`,EventSourceArn:m.eventSourceArn,BatchSize:m.batchSize,FunctionResponseTypes:clone(m.responseTypes),State:m.state});
        const advanceMap=m=>{if(m.pendingState){m.state=m.pendingState;delete m.pendingState;}};
        function selected(f,q) {if(!q||q==='$LATEST')return f;const v=f.aliases&&f.aliases[q]||q;const saved=f.versions&&Object.prototype.hasOwnProperty.call(f.versions,v)&&f.versions[v];if(!saved)throw Error('ResourceNotFoundException: Published version/alias not found');return {...saved,name:f.name,roleName:f.roleName,workload:f.workload,_version:v};}
        function validateMapping(f,arn,batch,types) {
          const q=queue(arn);if(!q)throw Error('InvalidParameterValueException: EventSourceArn must identify an existing SQS queue in this bounded simulator');
          if(arn.split(':')[3]!==sim.account.region)throw Error('InvalidParameterValueException: SQS and function must use same Region');
          if(q.isFifo)throw Error('Simulator scope: This SVG batch fixture uses Standard SQS; FIFO needs ordering-aware failure handling');
          if((q.visibilityTimeout===undefined?30:q.visibilityTimeout)<(f.timeout||3))throw Error('InvalidParameterValueException: Function timeout cannot exceed queue visibility timeout; AWS recommends visibility at least6x timeout plus batch window');
          if(!Number.isInteger(batch)||batch<1||batch>10)throw Error('Simulator scope: SQS batch-size1..10 here; larger Standard batches require a batching window');
          if(!Array.isArray(types)||types.some(t=>t!=='ReportBatchItemFailures')||new Set(types).size!==types.length)throw Error('InvalidParameterValueException: Use distinct supported FunctionResponseTypes');
          const r=role(f);if(!r||!r.lambda||r.lambda.trust!=='lambda.amazonaws.com'||!(r.lambda.receiveQueues||[]).includes(arn))throw Error('InvalidParameterValueException: Execution role lacks required SQS permissions in fixture');
        }
        try {
          if(op==='list-functions')return resultJson({Functions:functions().map(f=>config(f))});
          if(op==='get-function'||op==='get-function-configuration') {
            const {fn,qualifier}=getFn(),c=config(selected(fn,qualifier),qualifier);
            return resultJson(op==='get-function'?{Configuration:c,Concurrency:fn.reservedConcurrency===undefined?{}:{ReservedConcurrentExecutions:fn.reservedConcurrency}}:c);
          }
          if(op==='update-function-configuration') {
            const {fn,qualifier}=getFn();if(qualifier)throw Error('InvalidParameterValueException: Published versions are immutable; update $LATEST');
            if(fn.pendingConfig)throw Error('ResourceConflictException: Function update in progress; wait function-updated-v2');
            const pending={};
            if(flag('memory-size')!==null)pending.memory=numeric('memory-size',128,10240);
            if(flag('timeout')!==null)pending.timeout=numeric('timeout',1,900);
            if(flag('handler')!==null)pending.handler=required('handler');
            if(flag('environment')!==null){const env=read('environment');if(!object(env)||Object.keys(env).some(k=>k!=='Variables')||!object(env.Variables)||Object.entries(env.Variables).some(([k,v])=>!/^[A-Za-z][A-Za-z0-9_]+$/.test(k)||typeof v!=='string'||k.startsWith('AWS_')))throw Error('InvalidParameterValueException: Environment needs Variables string map; reserved AWS_ keys unsupported');pending.environment=clone(env);}
            if(flag('architectures')!==null){const values=flags('architectures');if(values.length!==1||!['x86_64','arm64'].includes(values[0]))throw Error('InvalidParameterValueException: Choose one x86_64 or arm64 architecture');pending.architectures=values;}
            if(!Object.keys(pending).length)throw Error('InvalidParameterValueException: Supply supported configuration changes');
            fn.pendingConfig=pending;fn.lastUpdateStatus='InProgress';return resultJson(config(fn));
          }
          if(op==='wait') {
            if(!['function-updated','function-updated-v2','function-active','function-active-v2'].includes(toks[3]))throw Error('Unknown Lambda waiter; use function-updated-v2 or function-active-v2');
            const {fn}=getFn();completeUpdate(fn);return print('ok','');
          }
          if(['put-function-concurrency','get-function-concurrency','delete-function-concurrency'].includes(op)) {
            const {fn}=getFn();
            if(op==='put-function-concurrency') {
              const value=numeric('reserved-concurrent-executions',0,100000),quota=sim.account.lambdaConcurrencyQuota||1000;
              const other=functions().filter(f=>f!==fn).reduce((n,f)=>n+(f.reservedConcurrency||0),0);
              if(value+other>quota-100)throw Error('InvalidParameterValueException: Leave at least100 regional concurrent executions unreserved');
              const pc=Object.values(fn.provisioned||{}).reduce((n,p)=>n+p.requested,0);if(value<pc)throw Error('InvalidParameterValueException: Reserved concurrency cannot be below allocated provisioned concurrency');
              fn.reservedConcurrency=value;
            }
            if(op==='delete-function-concurrency'){delete fn.reservedConcurrency;return print('ok','');}
            return resultJson(fn.reservedConcurrency===undefined?{}:{ReservedConcurrentExecutions:fn.reservedConcurrency});
          }
          if(['put-function-event-invoke-config','get-function-event-invoke-config'].includes(op)) {
            const {fn,qualifier}=getFn(),key=qualifier||'$LATEST';selected(fn,qualifier);
            if(op==='get-function-event-invoke-config'){const cfg=fn.asyncConfigs&&fn.asyncConfigs[key];if(!cfg)throw Error('ResourceNotFoundException: No async invoke configuration');return resultJson(clone(cfg));}
            const cfg={};
            if(flag('maximum-retry-attempts')!==null)cfg.MaximumRetryAttempts=numeric('maximum-retry-attempts',0,2);
            if(flag('maximum-event-age-in-seconds')!==null)cfg.MaximumEventAgeInSeconds=numeric('maximum-event-age-in-seconds',60,21600);
            if(flag('destination-config')!==null) {
              const d=read('destination-config');if(!object(d)||Object.keys(d).some(k=>!['OnFailure','OnSuccess'].includes(k)))throw Error('InvalidParameterValueException: DestinationConfig needs supported OnFailure/OnSuccess objects');
              for(const [kind,value] of Object.entries(d)) {
                if(!object(value)||typeof value.Destination!=='string')throw Error('InvalidParameterValueException: Destination ARN string required');
                const q=queue(value.Destination),r=role(fn);
                if(!q||!r||!r.lambda||!(r.lambda.sendQueues||[]).includes(q.arn))throw Error('InvalidParameterValueException: This simulator supports existing permitted SQS destinations; execution role needs SendMessage');
                if(value.Destination===fn.name)throw Error('InvalidParameterValueException: Invalid destination');
              }
              cfg.DestinationConfig=clone(d);
            }
            if(!Object.keys(cfg).length)throw Error('InvalidParameterValueException: Provide async invocation settings');
            (fn.asyncConfigs||(fn.asyncConfigs={}))[key]=cfg;return resultJson(clone(cfg));
          }
          if(op==='create-event-source-mapping') {
            const {fn}=getFn(),arn=required('event-source-arn'),batch=flag('batch-size')===null?10:numeric('batch-size',1,10000),types=flags('function-response-types');
            validateMapping(fn,arn,batch,types);
            if(toks.includes('--enabled')&&toks.includes('--no-enabled'))throw Error('InvalidParameterValueException: Mutually exclusive enable flags');
            if(mappings().some(m=>m.functionName===fn.name&&m.eventSourceArn===arn))throw Error('ResourceConflictException: Mapping for this function/event source already exists; update the mapping');
            const seq=(sim.account.lambdaMappingSequence||0)+1,uuid='11111111-0000-4000-8000-'+String(seq).padStart(12,'0');
            const m={uuid,functionName:fn.name,eventSourceArn:arn,batchSize:batch,responseTypes:types,state:'Creating',pendingState:toks.includes('--no-enabled')?'Disabled':'Enabled'};
            sim.account.lambdaMappingSequence=seq;mappings().push(m);return resultJson(mapView(m));
          }
          if(op==='update-event-source-mapping') {
            const m=mapping(),f=functions().find(f=>f.name===m.functionName);if(!f)throw Error('ResourceNotFoundException: Mapping function missing');
            const batch=flag('batch-size')===null?m.batchSize:numeric('batch-size',1,10000),types=flag('function-response-types')===null?m.responseTypes:flags('function-response-types');
            validateMapping(f,m.eventSourceArn,batch,types);
            if(toks.includes('--enabled')&&toks.includes('--no-enabled'))throw Error('InvalidParameterValueException: Mutually exclusive enable flags');
            m.batchSize=batch;m.responseTypes=types;m.pendingState=toks.includes('--no-enabled')?'Disabled':toks.includes('--enabled')?'Enabled':m.pendingState||m.state;m.state='Updating';return resultJson(mapView(m));
          }
          if(op==='get-event-source-mapping'){const m=mapping();advanceMap(m);return resultJson(mapView(m));}
          if(op==='list-event-source-mappings') {
            const f=flag('function-name')?getFn().fn:null,arn=flag('event-source-arn');
            const rows=mappings().filter(m=>(!f||m.functionName===f.name)&&(!arn||m.eventSourceArn===arn));rows.forEach(advanceMap);return resultJson({EventSourceMappings:rows.map(mapView)});
          }
          if(op==='delete-event-source-mapping'){const m=mapping();mappings().splice(mappings().indexOf(m),1);return resultJson({...mapView(m),State:'Deleting'});}
          if(op==='publish-version') {
            const {fn}=getFn();if(fn.pendingConfig)throw Error('ResourceConflictException: Finish configuration update before publishing');
            const versions=fn.versions||(fn.versions={}),number=String(Math.max(0,...Object.keys(versions).map(Number).filter(Number.isFinite))+1);
            versions[number]={runtime:fn.runtime,handler:fn.handler,memory:fn.memory,timeout:fn.timeout,architectures:clone(fn.architectures||['x86_64']),revisionId:revision(fn),state:'Active'};
            return resultJson({...config(fn),Version:number});
          }
          if(['put-provisioned-concurrency-config','get-provisioned-concurrency-config','delete-provisioned-concurrency-config'].includes(op)) {
            const {fn}=getFn(),qualifier=required('qualifier');if(qualifier==='$LATEST')throw Error('InvalidParameterValueException: Provisioned concurrency requires published version or alias, not $LATEST');selected(fn,qualifier);
            const all=fn.provisioned||(fn.provisioned={});
            if(op==='put-provisioned-concurrency-config') {
              const amount=numeric('provisioned-concurrent-executions',1,100000),other=Object.entries(all).filter(([q])=>q!==qualifier).reduce((n,[,p])=>n+p.requested,0);
              if(other+amount>(fn.reservedConcurrency===undefined?(sim.account.lambdaConcurrencyQuota||1000)-100:fn.reservedConcurrency))throw Error('InvalidParameterValueException: Provisioned concurrency exceeds available reserved/regional capacity');
              all[qualifier]={requested:amount,allocated:0,status:'IN_PROGRESS'};
            }
            if(op==='delete-provisioned-concurrency-config'){delete all[qualifier];return print('ok','');}
            const p=all[qualifier];if(!p)throw Error('ProvisionedConcurrencyConfigNotFoundException: No configuration for qualifier');
            if(op==='get-provisioned-concurrency-config'){p.allocated=p.requested;p.status='READY';}
            return resultJson({RequestedProvisionedConcurrentExecutions:p.requested,AvailableProvisionedConcurrentExecutions:p.allocated,AllocatedProvisionedConcurrentExecutions:p.allocated,Status:p.status});
          }
          if(op==='get-policy') {
            const {fn}=getFn();if(!fn.policy)throw Error('ResourceNotFoundException: Function policy does not exist');return resultJson({Policy:typeof fn.policy==='string'?fn.policy:JSON.stringify(fn.policy),RevisionId:'policy-fixture'});
          }
          if(op==='add-permission') {
            const {fn}=getFn(),sid=required('statement-id'),action=required('action'),principal=required('principal');
            if(action!=='lambda:InvokeFunction'||!['s3.amazonaws.com','sns.amazonaws.com','events.amazonaws.com'].includes(principal))throw Error('Simulator scope: InvokeFunction service permissions for S3/SNS/EventBridge only');
            if(!/^[A-Za-z0-9_-]{1,100}$/.test(sid))throw Error('InvalidParameterValueException: Invalid statement ID');
            const policy=typeof fn.policy==='string'?JSON.parse(fn.policy):clone(fn.policy||{Version:'2012-10-17',Statement:[]});
            if(!Array.isArray(policy.Statement))throw Error('InvalidParameterValueException: Policy Statement must be array');
            if(policy.Statement.some(s=>s.Sid===sid))throw Error('ResourceConflictException: Statement ID already exists');
            const st={Sid:sid,Effect:'Allow',Principal:{Service:principal},Action:action,Resource:`arn:aws:lambda:${sim.account.region}:123456789012:function:${fn.name}`};
            const account=flag('source-account'),arn=flag('source-arn');if(account&&!/^\d{12}$/.test(account))throw Error('InvalidParameterValueException: SourceAccount must be12 digits');
            if(account||arn)st.Condition={...(account?{StringEquals:{'AWS:SourceAccount':account}}:{}),...(arn?{ArnLike:{'AWS:SourceArn':arn}}:{})};
            policy.Statement.push(st);fn.policy=policy;return resultJson({Statement:JSON.stringify(st)});
          }
          if(op==='delete-function'){const {fn}=getFn();functions().splice(functions().indexOf(fn),1);return print('ok','');}
          if(op==='invoke') {
            const {fn,qualifier}=getFn(),target=selected(fn,qualifier),type=flag('invocation-type')||'RequestResponse';
            if(!['RequestResponse','Event','DryRun'].includes(type))throw Error('InvalidParameterValueException: InvocationType must be RequestResponse, Event or DryRun');
            if(flag('log-type')&&flag('log-type')!=='None')throw Error('Simulator scope: use logs tail for fixture logs; encoded LogResult is not modeled');
            let outfile;
            for(let i=3;i<toks.length;i++){if(toks[i].startsWith('--')){if(!['--no-cli-pager','--no-paginate'].includes(toks[i]))i++;}else outfile=toks[i];}
            if(!outfile)throw Error('aws: error: outfile is required for invoke');
            if(['__proto__','constructor','prototype'].includes(outfile))throw Error('Simulator: choose an ordinary output filename');
            const payload=read('payload',{}),raw=JSON.stringify(payload);let bytes=0;
            for(const char of raw){const cp=char.codePointAt(0);bytes+=cp<128?1:cp<2048?2:cp<65536?3:4;}
            if(bytes>(type==='Event'?1:6)*1024*1024)throw Error('RequestTooLargeException: Payload exceeds invocation limit');
            if(type==='DryRun')return resultJson({StatusCode:204});
            if(fn.reservedConcurrency===0||(fn.busyConcurrent||0)>=(fn.reservedConcurrency===undefined?sim.account.lambdaConcurrencyQuota||1000:fn.reservedConcurrency))throw Error('TooManyRequestsException: ReservedFunctionConcurrentInvocationLimitExceeded');
            if(type==='Event'){(fn.pendingEvents||(fn.pendingEvents=[])).push(clone(payload));return resultJson({StatusCode:202});}
            const metrics=AG.lambdaTiming(target),pc=qualifier&&fn.provisioned&&fn.provisioned[qualifier];
            const prepared=pc&&pc.status==='READY'&&pc.allocated>(fn.busyConcurrent||0);
            const duration=metrics.warmMs+(prepared?0:metrics.initMs),number=(fn.invocationSequence||0)+1,requestId='fixture-request-'+number;
            fn.invocationSequence=number;
            let body,error=false;
            const processRecord=record=>{
              const work=target.workload,r=role(fn);
              if(!work||work.kind!=='svg-fixture')throw Error('Simulator scope: No runnable SVG workload fixture on this function');
              if(target.handler!=='app.handler')throw Error('Runtime.HandlerNotFound: app.handler is the fixture entry point');
              if(!r||!r.lambda||r.lambda.trust!=='lambda.amazonaws.com'||r.lambda.sourceBucket!==work.sourceBucket||r.lambda.outputBucket!==work.outputBucket)throw Error('AccessDenied: Execution role lacks reviewed source/output permissions');
              if(!object(record)||record.eventSource!=='aws:s3'||!object(record.s3)||!object(record.s3.bucket)||!object(record.s3.object))throw Error('ValueError: Expected S3 bucket/object event record');
              const info=record.s3.object;if(typeof info.key!=='string'||typeof info.versionId!=='string')throw Error('ValueError: URL-encoded key and exact VersionId required');
              let key;try{key=decodeURIComponent(info.key.replace(/\+/g,' '));}catch(e){throw Error('ValueError: Invalid URL-encoded S3 object key');}
              if(record.s3.bucket.name!==work.sourceBucket||key!==work.sourceKey)throw Error('ValueError: Event does not match fixture input bucket/key; inspect source filter');
              if(work.sourceBucket===work.outputBucket)throw Error('ValueError: Separate source/output buckets required by this fixture; avoid recursion');
              const source=list('buckets').find(b=>b.name===work.sourceBucket),output=list('buckets').find(b=>b.name===work.outputBucket);
              const rows=source&&(source.versions||{})[key],v=Array.isArray(rows)&&rows.find(v=>v.versionId===info.versionId&&!v.deleteMarker);
              if(!v||typeof v.body!=='string')throw Error('NoSuchVersion: Source version/body not available');
              if(!output)throw Error('NoSuchBucket: Output bucket not found');
              if(!/^<svg\b[^>]*viewBox="0 0 320 240"/.test(v.body))throw Error('Simulator scope: Only seeded trusted SVG viewBox fixture is transformed; generic image codecs not modeled');
              let written=0,duplicates=0;output.objects=output.objects||[];
              for(const size of [64,128,256]) {
                const name='thumbs/'+encodeURIComponent(work.sourceBucket+'/'+key+'/'+info.versionId)+'/'+size+'.svg';
                const transformed=v.body.replace(/\bwidth="[0-9]+"/,'width="'+size+'"').replace(/\bheight="[0-9]+"/,'height="'+size+'"');
                const existing=output.objects.find(o=>o.key===name);
                if(existing){if(existing.body!==transformed)throw Error('ValueError: Existing derivative differs; do not acknowledge corrupt output');duplicates++;}
                else{output.objects.push({key:name,size:transformed.length,body:transformed,sourceVersion:info.versionId,width:size,height:size});written++;}
              }
              return {sourceVersion:info.versionId,written,duplicates};
            };
            try {
              if(duration>(target.timeout||3)*1000)throw Error('Sandbox.Timedout: '+requestId+' Task timed out after '+Number(target.timeout||3).toFixed(2)+' seconds');
              if(target.sagaOperation)body=AG.sagaWorker(sim.account,target,payload);
              else if(!target.workload){try{body=JSON.parse(target.invokeResult||'{"status":"ok"}');}catch(e){body=target.invokeResult;}}
              else {
                if(!object(payload)||!Array.isArray(payload.Records)||!payload.Records.length)throw Error('ValueError: Invoke payload must contain nonempty Records');
                const records=payload.Records;
                if(records[0]&&records[0].eventSource==='aws:sqs') {
                  const failures=[];
                  for(const record of records){if(!object(record)||typeof record.messageId!=='string'||!record.messageId)throw Error('ValueError: SQS messageId required for partial response');try{if(record.eventSource!=='aws:sqs')throw Error('ValueError: Mixed event sources unsupported');const event=JSON.parse(record.body);if(!object(event)||!Array.isArray(event.Records)||!event.Records.length)throw Error('ValueError: SQS body needs S3 Records');event.Records.forEach(processRecord);}catch(e){failures.push({itemIdentifier:record.messageId});}}
                  body={batchItemFailures:failures};
                }else body={results:records.map(processRecord)};
              }
            }catch(e){error=true;body={errorType:e.message.split(':')[0],errorMessage:e.message};}
            const report={functionName:fn.name,revisionId:revision(target),executedVersion:target._version||qualifier||'$LATEST',body:clone(body),error,durationMs:duration};
            (sim.downloads||(sim.downloads={}))[outfile]=report;fn.lastInvoke=clone(report);
            const logs=list('logGroups');let group=logs.find(g=>g.name==='/aws/lambda/'+fn.name);if(!group){group={name:'/aws/lambda/'+fn.name,events:[]};logs.push(group);}
            group.events.push('START RequestId: '+requestId,...(error?[body.errorMessage]:[]),'REPORT RequestId: '+requestId+' Duration: '+duration.toFixed(2)+' ms Memory Size: '+target.memory+' MB (bounded benchmark fixture)');
            print('sys','In-memory response '+outfile+': '+JSON.stringify(body));
            return resultJson({StatusCode:200,...(error?{FunctionError:'Unhandled'}:{}),ExecutedVersion:report.executedVersion});
          }
          return print('err','Unknown Lambda operation: '+op+'; use help for supported API scope');
        }catch(e){return print('err',e.message);}
      }

      /* ===================== DYNAMODB ===================== */
      case 'elasticache':
      case 'dax': {
        // Control-plane fixture only. No Redis protocol, cache hits, failover, TLS or IAM runtime.
        const clone=x=>JSON.parse(JSON.stringify(x)),object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
        const required=name=>{const x=flag(name);if(!x)throw Error('aws: error: the following arguments are required: --'+name);return x;};
        const bad=message=>{throw Error('InvalidParameterValue: '+message);},validId=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(x)&&!x.endsWith('-')&&!x.includes('--')&&!['constructor','prototype'].includes(x);
        const json=name=>{let raw=required(name);if(raw.startsWith('file://')){const f=Object.prototype.hasOwnProperty.call(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!f||typeof f.content!=='string')throw Error('Error parsing parameter --'+name+': Unable to load paramfile');raw=f.content;}try{return JSON.parse(raw);}catch(e){throw Error('Error parsing parameter --'+name+': Invalid JSON');}};
        const toggle=(name,fallback=false)=>{if(toks.includes('--'+name)&&toks.includes('--no-'+name))bad('Conflicting boolean flags: '+name);return toks.includes('--'+name)?true:toks.includes('--no-'+name)?false:fallback;};
        const integer=(name,fallback,min,max)=>{const raw=flag(name),n=raw===null?fallback:Number(raw);if(!Number.isInteger(n)||n<min||n>max)bad(name+' must be an integer '+min+'..'+max);return n;};
        const groupKind=service==='elasticache'?'cacheGroups':'daxClusters',subnetKind=service==='elasticache'?'cacheSubnetGroups':'daxSubnetGroups';
        const listSafe=kind=>{const v=list(kind);if(!Array.isArray(v))bad('Invalid simulator fixture: '+kind+' must be an array');return v;};
        function lookup(id){const g=listSafe(groupKind).find(g=>g.id===id);if(!g)throw Error((service==='elasticache'?'ReplicationGroupNotFoundFault':'ClusterNotFoundFault')+': '+id+' not found');return g;}
        function network(name,securityIds){const sub=listSafe(subnetKind).find(g=>g.name===name);if(!sub||!Array.isArray(sub.subnetIds)||!sub.subnetIds.length)throw Error((service==='elasticache'?'CacheSubnetGroupNotFoundFault':'SubnetGroupNotFoundFault')+': '+name);const subnets=sub.subnetIds.map(id=>listSafe('subnets').find(s=>s.id===id));if(subnets.some(s=>!s)||new Set(subnets.map(s=>s.vpcId)).size!==1)bad('Subnet group requires existing subnets from one VPC');if(!securityIds.length||new Set(securityIds).size!==securityIds.length)bad('Supply unique security-group-ids');for(const id of securityIds){const sg=listSafe('securityGroups').find(s=>s.id===id);if(!sg||sg.vpcId!==subnets[0].vpcId)bad('Security group and subnet group must belong to the same VPC');}return {subnets,vpcId:subnets[0].vpcId,azs:[...new Set(subnets.map(s=>s.az))]};}
        const currentNodes=g=>(g.nodes||[]).filter(n=>n.status==='available'),hasReplica=g=>currentNodes(g).some(n=>n.role==='replica'),crossAZ=g=>new Set(currentNodes(g).map(n=>n.az)).size>=2;
        const endpoint=(g,reader=false)=>({Address:g.id+(reader?'.reader':'.primary')+'.local-fixture.cache.amazonaws.com',Port:g.port||6379});
        function viewCache(g){return {ReplicationGroupId:g.id,Description:g.description,Status:g.status,Engine:g.engine,CacheNodeType:g.nodeType,ClusterEnabled:false,AutomaticFailover:g.automaticFailover?'enabled':'disabled',MultiAZ:g.multiAZ?'enabled':'disabled',MemberClusters:(g.nodes||[]).map(n=>n.id),TransitEncryptionEnabled:!!g.transitEncryption,AtRestEncryptionEnabled:!!g.atRestEncryption,UserGroupIds:g.userGroupIds||[],CacheSubnetGroupName:g.subnetGroup,PendingModifiedValues:g.pending?clone(g.pending):{},NodeGroups:[{NodeGroupId:'0001',Status:g.status,PrimaryEndpoint:endpoint(g),ReaderEndpoint:endpoint(g,true),NodeGroupMembers:(g.nodes||[]).map(n=>({CacheClusterId:n.id,CacheNodeId:'0001',PreferredAvailabilityZone:n.az,CurrentRole:n.role,ReadEndpoint:{Address:n.id+'.local-fixture.cache.amazonaws.com',Port:g.port||6379}}))}]};}
        function viewDax(g){return {ClusterName:g.id,Status:g.status,NodeType:g.nodeType,TotalNodes:g.nodes.length,ActiveNodes:currentNodes(g).length,IamRoleArn:g.roleArn,SubnetGroup:g.subnetGroup,SecurityGroups:g.securityGroupIds.map(SecurityGroupIdentifier=>({SecurityGroupIdentifier,Status:'active'})),ClusterEndpointEncryptionType:g.tls?'TLS':'NONE',SSEDescription:{Status:g.sse?'ENABLED':'DISABLED'},ClusterDiscoveryEndpoint:{Address:g.id+'.local-fixture.dax-clusters.amazonaws.com',Port:g.tls?9111:8111,URL:(g.tls?'daxs://':'dax://')+g.id+'.local-fixture.dax-clusters.amazonaws.com'},Nodes:g.nodes.map(n=>({NodeId:n.id,NodeStatus:n.status,AvailabilityZone:n.az,Endpoint:{Address:n.id+'.local-fixture.dax-clusters.amazonaws.com',Port:g.tls?9111:8111}}))};}
        function observe(groups,result){sim.cacheRead=null;if(resultJson(result)===true)sim.cacheRead={service,groups:groups.map(g=>({id:g.id,revision:g.revision||0,record:service==='elasticache'?viewCache(g):viewDax(g)}))};}
        function userGroups(ids,engine){if(!ids.length||new Set(ids).size!==ids.length)bad('This private fixture requires explicit RBAC user-group-ids; auth is not implied by TLS');for(const id of ids){const u=listSafe('cacheUserGroups').find(u=>u.id===id);if(!u||u.engine!==engine||u.status!=='active')throw Error('UserGroupNotFound: compatible active RBAC group required: '+id);}}
        function ready(g){g.status='available';for(const n of g.nodes)n.status='available';if(g.pending){Object.assign(g,g.pending);delete g.pending;}g.revision=(g.revision||0)+1;}
        try {
          if(service==='elasticache'){
            if(op==='describe-replication-groups'){const id=flag('replication-group-id'),groups=id?[lookup(id)]:listSafe(groupKind);return observe(groups,{ReplicationGroups:groups.map(viewCache)});}
            if(op==='describe-cache-clusters'){const rows=listSafe('cacheGroups').flatMap(g=>(g.nodes||[]).map(n=>({CacheClusterId:n.id,CacheClusterStatus:n.status,Engine:g.engine,EngineVersion:g.engineVersion,CacheNodeType:g.nodeType,PreferredAvailabilityZone:n.az,CacheSubnetGroupName:g.subnetGroup,SecurityGroups:g.securityGroupIds.map(SecurityGroupId=>({SecurityGroupId,Status:'active'})),TransitEncryptionEnabled:g.transitEncryption,AtRestEncryptionEnabled:g.atRestEncryption,...(toks.includes('--show-cache-node-info')?{CacheNodes:[{CacheNodeId:'0001',CacheNodeStatus:n.status,Endpoint:{Address:n.id+'.local-fixture.cache.amazonaws.com',Port:g.port||6379}}]}:{})})));const id=flag('cache-cluster-id');if(id&&!rows.some(r=>r.CacheClusterId===id))throw Error('CacheClusterNotFound: '+id);return resultJson({CacheClusters:id?rows.filter(r=>r.CacheClusterId===id):rows});}
            if(op==='describe-cache-subnet-groups'){const name=flag('cache-subnet-group-name'),rows=name?listSafe(subnetKind).filter(g=>g.name===name):listSafe(subnetKind);if(name&&!rows.length)throw Error('CacheSubnetGroupNotFoundFault: '+name);return resultJson({CacheSubnetGroups:rows.map(g=>({CacheSubnetGroupName:g.name,Subnets:g.subnetIds.map(id=>({SubnetIdentifier:id}))}))});}
            if(op==='create-replication-group'){
              const id=required('replication-group-id'),description=required('replication-group-description'),engine=required('engine'),nodeType=required('cache-node-type'),version=flag('engine-version')||'8.0';if(!validId(id))bad('Valid lowercase replication-group-id required');if(listSafe(groupKind).some(g=>g.id===id))throw Error('ReplicationGroupAlreadyExists: '+id);if(!['valkey','redis'].includes(engine))bad('Replication groups support valkey/redis; node-based Memcached uses a different API');if(!['cache.t4g.small','cache.r7g.large','cache.m7g.large'].includes(nodeType))bad('Simulator node types: cache.t4g.small / cache.r7g.large / cache.m7g.large');if(!/^\d+\.\d+(?:\.\d+)?$/.test(version))bad('Invalid engine-version');
              const count=integer('num-cache-clusters',1,1,6),subnetGroup=required('cache-subnet-group-name'),securityGroupIds=flags('security-group-ids'),net=network(subnetGroup,securityGroupIds),zones=flags('preferred-cache-cluster-azs');if(zones.length&&zones.length!==count||zones.some(az=>!net.azs.includes(az)))bad('Provide one supported subnet-group AZ per requested cache cluster');const placements=zones.length?zones:Array.from({length:count},(_,i)=>net.azs[i%net.azs.length]);const automaticFailover=toggle('automatic-failover-enabled'),multiAZ=toggle('multi-az-enabled'),transitEncryption=toggle('transit-encryption-enabled'),atRestEncryption=toggle('at-rest-encryption-enabled',engine==='valkey'),userGroupIds=flags('user-group-ids');if((automaticFailover||multiAZ)&&count<2)bad('Automatic failover/Multi-AZ requires at least one replica');if(multiAZ&&(!automaticFailover||new Set(placements).size<2))bad('Multi-AZ requires automatic failover and a replica in a different AZ');if(userGroupIds.length){userGroups(userGroupIds,engine);if(!transitEncryption)bad('RBAC fixture requires transit encryption');}
              const g={id,description,engine,engineVersion:version,nodeType,subnetGroup,securityGroupIds:clone(securityGroupIds),vpcId:net.vpcId,automaticFailover,multiAZ,transitEncryption,atRestEncryption,userGroupIds:clone(userGroupIds),port:integer('port',6379,1,65535),status:'creating',revision:1,nodes:placements.map((az,i)=>({id:id+'-'+String(i+1).padStart(3,'0'),az,role:i?'replica':'primary',status:'creating'}))};listSafe(groupKind).push(g);return resultJson({ReplicationGroup:viewCache(g)});
            }
            if(op==='wait'){if(toks[3]!=='replication-group-available')bad('Simulator waiter: replication-group-available');const g=lookup(required('replication-group-id'));if(g.status==='deleting')throw Error('Waiter ReplicationGroupAvailable failed: group is deleting');if(g.status!=='available')ready(g);return print('ok','');}
            if(op==='modify-replication-group'){
              const g=lookup(required('replication-group-id'));if(g.status!=='available')throw Error('InvalidReplicationGroupState: Wait for available before another modification');const automaticFailover=toggle('automatic-failover-enabled',g.automaticFailover),multiAZ=toggle('multi-az-enabled',g.multiAZ);if((automaticFailover||multiAZ)&&!hasReplica(g))bad('At least one available replica is required');if(multiAZ&&(!automaticFailover||!crossAZ(g)))bad('Multi-AZ requires automatic failover and a replica in a different AZ');const pending={automaticFailover,multiAZ};if(flag('replication-group-description'))pending.description=required('replication-group-description');if(!toks.includes('--apply-immediately'))bad('Simulator models immediate modification request; supply --apply-immediately (still wait for readiness)');g.pending=pending;g.status='modifying';g.revision=(g.revision||0)+1;return resultJson({ReplicationGroup:viewCache(g)});
            }
            if(op==='delete-replication-group'){const g=lookup(required('replication-group-id'));if(toks.includes('--retain-primary-cluster'))bad('Retained-primary conversion not modeled; no resources changed');listSafe(groupKind).splice(listSafe(groupKind).indexOf(g),1);return resultJson({ReplicationGroup:{...viewCache(g),Status:'deleting'}});}
            return print('err','Unsupported ElastiCache operation: '+op+'. This fixture models private node-based replication group metadata, not serverless/durable runtime.');
          }
          if(op==='create-cluster'){
            const id=required('cluster-name'),nodeType=required('node-type');if(!validId(id))bad('Valid lowercase cluster-name required');if(listSafe(groupKind).some(g=>g.id===id))throw Error('ClusterAlreadyExistsFault: '+id);if(!['dax.t3.small','dax.r5.large','dax.r5.xlarge'].includes(nodeType))bad('Simulator node types: dax.t3.small / dax.r5.large / dax.r5.xlarge');required('replication-factor');const count=integer('replication-factor',1,1,11),subnetGroup=required('subnet-group-name'),securityGroupIds=flags('security-group-ids'),net=network(subnetGroup,securityGroupIds),zones=flags('availability-zones');if(new Set(zones).size!==zones.length||zones.length>count||zones.some(z=>!net.azs.includes(z)))bad('Unique supported availability-zones cannot exceed replication-factor');const roleArn=required('iam-role-arn'),role=listSafe('roles').find(r=>r.arn===roleArn);if(!role||role.daxTrust!=='dax.amazonaws.com'||!Array.isArray(role.daxReadTables)||!role.daxReadTables.length)throw Error('InvalidParameterValueException: DAX role requires dax.amazonaws.com trust and scoped DynamoDB read permissions in this fixture');const tls=flag('cluster-endpoint-encryption-type')||'NONE';if(!['TLS','NONE'].includes(tls))bad('ClusterEndpointEncryptionType must be TLS or NONE');const rawSSE=flag('sse-specification');const sse=rawSSE&&/^Enabled=(true|false)$/.test(rawSSE)?{Enabled:rawSSE==='Enabled=true'}:rawSSE?json('sse-specification'):{Enabled:false};if(!object(sse)||Object.keys(sse).some(k=>k!=='Enabled')||typeof sse.Enabled!=='boolean')bad('Use JSON SSESpecification {"Enabled":true/false}');const azs=zones.length?zones:net.azs,g={id,nodeType,roleArn,subnetGroup,securityGroupIds:clone(securityGroupIds),vpcId:net.vpcId,tls:tls==='TLS',sse:sse.Enabled,status:'creating',revision:1,polls:0,nodes:Array.from({length:count},(_,i)=>({id:id+'-'+String(i+1).padStart(3,'0'),az:azs[i%azs.length],status:'creating',role:i?'replica':'primary'}))};listSafe(groupKind).push(g);return resultJson({Cluster:viewDax(g)});
          }
          if(op==='describe-clusters'){const names=flags('cluster-names'),groups=names.length?names.map(lookup):listSafe(groupKind);for(const g of groups)if(g.status==='creating'){g.polls=(g.polls||0)+1;if(g.polls>=2)ready(g);}return observe(groups,{Clusters:groups.map(viewDax)});}
          if(op==='delete-cluster'){const g=lookup(required('cluster-name'));listSafe(groupKind).splice(listSafe(groupKind).indexOf(g),1);return resultJson({Cluster:{...viewDax(g),Status:'deleting'}});}
          return print('err','Unsupported DAX operation: '+op+'. Create/describe/delete cluster metadata only; no cache protocol or IAM/network execution.');
        }catch(e){return print('err',e.message);}
      }

      case 'dynamodb': {
        // Bounded data/metadata engine: no physical throughput, replication or TTL clock.
        const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k),clone=x=>JSON.parse(JSON.stringify(x));
        const invalid=message=>{throw Error('ValidationException: '+message);},required=name=>{const x=flag(name);if(x==null||x==='')throw Error('aws: error: the following arguments are required: --'+name);return x;};
        const safeName=x=>typeof x==='string'&&x.length>0&&!['__proto__','constructor','prototype'].includes(x);
        const bytes=x=>unescape(encodeURIComponent(String(x))).length;
        const sizeValue=x=>x===null?1:typeof x==='string'?bytes(x):typeof x==='number'?Math.ceil(String(x).replace(/[^0-9]/g,'').length/2)+1:typeof x==='boolean'?1:Array.isArray(x)?3+x.reduce((n,v)=>n+1+sizeValue(v),0):3+Object.entries(x).reduce((n,[k,v])=>n+bytes(k)+1+sizeValue(v),0);
        const itemSize=x=>Object.entries(x).reduce((n,[k,v])=>n+bytes(k)+sizeValue(v),0);
        function parseText(raw,name){let text=raw;if(raw.startsWith('file://')){const file=own(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!file||typeof file.content!=='string')throw Error('Error parsing parameter --'+name+': Unable to load paramfile '+raw);text=file.content;}try{return JSON.parse(text);}catch(e){throw Error('Error parsing parameter --'+name+': Invalid JSON');}}
        const doc=name=>parseText(required(name),name);
        function structure(name,many=false){const raw=required(name);if(raw.startsWith('file://')||raw.startsWith('{')||raw.startsWith('['))return parseText(raw,name);const entries=many?flags(name):[raw];const rows=entries.map(entry=>{const row={};for(const pair of entry.split(',')){const m=pair.match(/^([A-Za-z][A-Za-z0-9]*)=([^,=]+)$/);if(!m)invalid('Invalid shorthand for --'+name);row[m[1]]=m[2]==='true'?true:m[2]==='false'?false:/^\d+$/.test(m[2])?Number(m[2]):m[2];}return row;});return many?rows:rows[0];}
        function typedValue(v,depth=0){if(depth>32)invalid('Nesting Levels have exceeded supported limits');if(!object(v)||Object.keys(v).length!==1)invalid('Supplied AttributeValue must contain exactly one supported datatype');const [type]=Object.keys(v),value=v[type];if(type==='S'&&typeof value==='string')return value;if(type==='BOOL'&&typeof value==='boolean')return value;if(type==='NULL'&&value===true)return null;if(type==='N'&&typeof value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(value)){const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER||value.replace(/^[+-]?0*|[.eE+-]/g,'').length>15)invalid('Simulator numeric subset: use finite numbers with at most15 significant digits within safe range; AWS supports up to38 digits');return n;}if(type==='L'&&Array.isArray(value))return value.map(x=>typedValue(x,depth+1));if(type==='M'&&object(value))return plain(value,depth+1);invalid('Unsupported or invalid AttributeValue; simulator models S/N/BOOL/NULL/L/M, not binary/sets');}
        function plain(value,depth=0){if(!object(value))invalid('Expected an attribute map');const out={};for(const [k,v]of Object.entries(value)){if(!safeName(k))invalid('Invalid attribute name for simulator');out[k]=typedValue(v,depth);}return out;}
        function definitions(value){if(!Array.isArray(value)||!value.length||value.some(v=>!object(v)||!safeName(v.AttributeName)||!['S','N'].includes(v.AttributeType))||new Set(value.map(v=>v.AttributeName)).size!==value.length)invalid('Unique AttributeDefinitions with S/N key types required; binary keys not modeled');return Object.fromEntries(value.map(v=>[v.AttributeName,v.AttributeType]));}
        function schema(value,defs){if(!Array.isArray(value)||!value.length||value.length>2||value.some(v=>!object(v)||!safeName(v.AttributeName)||!defs[v.AttributeName]||!['HASH','RANGE'].includes(v.KeyType))||value.filter(v=>v.KeyType==='HASH').length!==1||value.filter(v=>v.KeyType==='RANGE').length>1||new Set(value.map(v=>v.AttributeName)).size!==value.length)invalid('KeySchema requires one HASH and optional distinct RANGE with matching AttributeDefinitions');return {partitionKey:value.find(v=>v.KeyType==='HASH').AttributeName,sortKey:value.find(v=>v.KeyType==='RANGE')?.AttributeName||null};}
        const keys=t=>[t.partitionKey,t.sortKey].filter(Boolean),defs=t=>t.attributeTypes||Object.fromEntries(keys(t).map(k=>[k,'S']));
        function validateItem(t,row,keyOnly=false){for(const k of keys(t)){const v=row[k],type=defs(t)[k];if(v===undefined||v===null||type==='S'&&(typeof v!=='string'||!v.length)||type==='N'&&typeof v!=='number')invalid('The provided key element does not match the schema: '+k);if(typeof v==='string'&&bytes(v)>(k===t.partitionKey?2048:1024))invalid('Key attribute exceeds maximum length: '+k);}if(keyOnly&&Object.keys(row).length!==keys(t).length)invalid('The provided key element does not match the schema');if(!keyOnly&&itemSize(row)>400*1024)invalid('Item size has exceeded the maximum allowed size400KB');for(const index of [...(t.gsis||[]),...(t.lsis||[])])for(const k of keys(index)){if(row[k]!==undefined&&(row[k]===null||typeof row[k]!==((defs(t)[k]||'S')==='N'?'number':'string')||row[k]===''||typeof row[k]==='string'&&bytes(row[k])>(k===index.partitionKey?2048:1024)))invalid('Type mismatch, size violation or empty index key: '+k);}return row;}
        const equalKey=(t,a,b)=>keys(t).every(k=>typeof a[k]===typeof b[k]&&a[k]===b[k]),keyOf=(t,row)=>Object.fromEntries(keys(t).map(k=>[k,row[k]]));
        function table(name=required('table-name'),active=true){const t=list('tables').find(t=>t.name===name);if(!t)throw Error('ResourceNotFoundException: Requested resource not found: Table '+name);if(active&&t.status&&t.status!=='ACTIVE'&&!(active==='data'&&t.status==='UPDATING'))throw Error('ResourceInUseException: Table '+name+' is '+t.status+'; wait for ACTIVE');return t;}
        const touch=t=>{t.revision=(t.revision||0)+1;t.lastRead=null;};
        function cap(value){if(!object(value)||!Number.isInteger(value.ReadCapacityUnits)||value.ReadCapacityUnits<1||!Number.isInteger(value.WriteCapacityUnits)||value.WriteCapacityUnits<1)invalid('ReadCapacityUnits and WriteCapacityUnits must be positive integers');return {rcu:value.ReadCapacityUnits,wcu:value.WriteCapacityUnits};}
        function indexView(i){return {IndexName:i.name,KeySchema:keys(i).map((k,j)=>({AttributeName:k,KeyType:j?'RANGE':'HASH'})),Projection:clone(i.projection),IndexStatus:i.status||'ACTIVE',...(i.rcu?{ProvisionedThroughput:{ReadCapacityUnits:i.rcu,WriteCapacityUnits:i.wcu}}:{})};}
        function view(t){return {TableName:t.name,TableId:t.tableId,TableStatus:t.status||'ACTIVE',AttributeDefinitions:Object.entries(defs(t)).map(([AttributeName,AttributeType])=>({AttributeName,AttributeType})),KeySchema:keys(t).map((AttributeName,i)=>({AttributeName,KeyType:i?'RANGE':'HASH'})),BillingModeSummary:{BillingMode:t.billing||'PROVISIONED'},ProvisionedThroughput:{ReadCapacityUnits:t.billing==='PAY_PER_REQUEST'?0:t.rcu||5,WriteCapacityUnits:t.billing==='PAY_PER_REQUEST'?0:t.wcu||5},ItemCount:(t.items||[]).length,...(t.gsis?.length?{GlobalSecondaryIndexes:t.gsis.map(indexView)}:{}),...(t.lsis?.length?{LocalSecondaryIndexes:t.lsis.map(indexView)}:{})};}
        function expressionContext(names={},values={}){if(!object(names)||Object.entries(names).some(([k,v])=>!/^#\w+$/.test(k)||!safeName(v))||!object(values)||Object.keys(values).some(k=>!/^:\w+$/.test(k)))invalid('Invalid expression attribute names/values map');const parsed=plain(values),used=[];return {used,attr(token){let a=token;if(token.startsWith('#')){if(!own(names,token))invalid('Expression attribute name not defined: '+token);a=names[token];}else if(DDB_RESERVED.includes(token.toUpperCase()))invalid('Attribute name is a reserved keyword: '+token+'; use --expression-attribute-names');if(!safeName(a)||!/^#?\w+$/.test(token))invalid('Invalid attribute path; nested paths not modeled');used.push(a);return a;},value(token){if(!own(parsed,token))invalid('Expression attribute value not defined: '+token);return parsed[token];}};}
        const compare=(a,op,b)=>a!==undefined&&typeof a===typeof b&&(op==='='?JSON.stringify(a)===JSON.stringify(b):op==='<>'?JSON.stringify(a)!==JSON.stringify(b):op==='<'?a<b:op==='<='?a<=b:op==='>'?a>b:a>=b);
        function predicate(raw,ctx){if(!raw)return ()=>true;const clauses=raw.split(/\s+AND\s+/i),tests=clauses.map(clause=>{let m=clause.trim().match(/^(attribute_not_exists|attribute_exists)\s*\(\s*([#\w]+)\s*\)$/);if(m){const a=ctx.attr(m[2]);return row=>m[1]==='attribute_exists'?own(row,a):!own(row,a);}m=clause.trim().match(/^([#\w]+)\s*(<=|>=|<>|=|<|>)\s*(:\w+)$/);if(!m)invalid('Unsupported condition/filter expression; simulator supports AND, scalar comparisons and attribute_exists/not_exists');const a=ctx.attr(m[1]),v=ctx.value(m[3]);return row=>compare(row[a],m[2],v);});return row=>tests.every(test=>test(row||{}));}
        const flagContext=()=>expressionContext(flag('expression-attribute-names')?doc('expression-attribute-names'):{},flag('expression-attribute-values')?doc('expression-attribute-values'):{});
        function condition(t,row,raw,ctx){const old=(t.items||[]).find(x=>equalKey(t,x,row));return {old,ok:predicate(raw,ctx)(old||{})};}
        function write(t,row,kind='put'){const index=(t.items||[]).findIndex(x=>equalKey(t,x,row));t.items=t.items||[];if(kind==='delete'){if(index>=0)t.items.splice(index,1);}else if(index>=0)t.items[index]=clone(row);else t.items.push(clone(row));touch(t);}
        function projected(t,index,row){if(!index||index.projection.ProjectionType==='ALL')return clone(row);const attrs=new Set([...keys(t),...keys(index),...(index.projection.NonKeyAttributes||[])]);return Object.fromEntries(Object.entries(row).filter(([k])=>attrs.has(k)));}
        function gsi(value,t,types,kind='gsi'){if(!object(value)||!safeName(value.IndexName)||!/^[A-Za-z0-9_.-]{3,255}$/.test(value.IndexName))invalid('Invalid index name');const key=schema(value.KeySchema,types),projection=value.Projection;if(!object(projection)||!['ALL','KEYS_ONLY','INCLUDE'].includes(projection.ProjectionType)||projection.ProjectionType==='INCLUDE'&&(!Array.isArray(projection.NonKeyAttributes)||!projection.NonKeyAttributes.length||projection.NonKeyAttributes.some(x=>!safeName(x))||projection.NonKeyAttributes.length>20)||projection.ProjectionType!=='INCLUDE'&&projection.NonKeyAttributes)invalid('Valid index Projection required');if(kind==='lsi'&&(key.partitionKey!==t.partitionKey||!key.sortKey||!t.sortKey))invalid('LSI requires the table partition key and an alternate sort key on a composite-key table');let capacity={};if(t.billing==='PROVISIONED'&&kind==='gsi')capacity=cap(value.ProvisionedThroughput);else if(value.ProvisionedThroughput)invalid('ProvisionedThroughput not supported on this index/billing mode');return {name:value.IndexName,...key,projection:clone(projection),status:'CREATING',...capacity};}
        function updateRow(t,key,raw,ctx){const row=clone((t.items||[]).find(x=>equalKey(t,x,key))||key);let m=String(raw||'').match(/^SET\s+([#\w]+)\s*=\s*([#\w]+)\s*([+-])\s*(:\w+)$/i);if(m){const target=ctx.attr(m[1]),source=ctx.attr(m[2]),n=ctx.value(m[4]);if(keys(t).includes(target))invalid('Cannot update attribute in the primary key');if(typeof row[source]!=='number'||typeof n!=='number')invalid('Arithmetic operands must be numbers');row[target]=row[source]+(m[3]==='+'?n:-n);}else{m=String(raw||'').match(/^(SET|ADD)\s+([#\w]+)\s*(?:=\s*)?(:\w+)$/i);if(!m)invalid('Simulator UpdateExpression subset: SET attr = :v, SET attr = attr +/- :n, ADD attr :n');const target=ctx.attr(m[2]),v=ctx.value(m[3]);if(keys(t).includes(target))invalid('Cannot update attribute in the primary key');if(m[1].toUpperCase()==='ADD'){if(typeof v!=='number'||row[target]!==undefined&&typeof row[target]!=='number')invalid('ADD requires numeric operands in simulator');row[target]=(row[target]||0)+v;}else row[target]=v;}return validateItem(t,row);}
        try {
          if(op==='list-tables')return resultJson({TableNames:list('tables').map(t=>t.name).sort()});
          if(op==='wait'){const name=required('table-name'),t=list('tables').find(t=>t.name===name);if(toks[3]==='table-not-exists'){if(t)throw Error('Waiter TableNotExists failed: table still exists');return print('ok','');}if(toks[3]!=='table-exists')invalid('Supported DynamoDB waiters: table-exists / table-not-exists');if(!t)throw Error('Waiter TableExists failed: ResourceNotFoundException');if(t.status!=='ACTIVE'){t.status='ACTIVE';touch(t);}return print('ok','');}
          if(op==='create-table'){
            const name=required('table-name');if(!/^[A-Za-z0-9_.-]{3,255}$/.test(name)||!safeName(name))invalid('TableName must be3..255 letters/digits/_.-');if(list('tables').some(t=>t.name===name))throw Error('ResourceInUseException: Table already exists: '+name);
            const types=definitions(structure('attribute-definitions',true)),key=schema(structure('key-schema',true),types),billing=flag('billing-mode')||'PROVISIONED';if(!['PROVISIONED','PAY_PER_REQUEST'].includes(billing))invalid('BillingMode must be PROVISIONED or PAY_PER_REQUEST');const tableId='00000000-0000-4000-8000-'+String(sim.ddbTableSequence=(sim.ddbTableSequence||0)+1).padStart(12,'0');const t={name,tableId,...key,billing,attributeTypes:types,status:'CREATING',items:[],revision:1,gsis:[],lsis:[]};if(billing==='PROVISIONED')Object.assign(t,cap(structure('provisioned-throughput')));else if(flag('provisioned-throughput'))invalid('ProvisionedThroughput cannot be specified with PAY_PER_REQUEST');
            for(const [name,target,kind,limit]of [['global-secondary-indexes','gsis','gsi',20],['local-secondary-indexes','lsis','lsi',5]])if(flag(name)){const indexes=doc(name);if(!Array.isArray(indexes)||indexes.length>limit)invalid('Invalid index array or default quota exceeded');t[target]=indexes.map(x=>gsi(x,t,types,kind));}
            const allIndexes=[...t.gsis,...t.lsis];if(new Set(allIndexes.map(i=>i.name)).size!==allIndexes.length)invalid('Duplicate index name');const used=new Set([...keys(t),...allIndexes.flatMap(keys)]);if(Object.keys(types).some(k=>!used.has(k)))invalid('AttributeDefinitions must contain only table/index key attributes');list('tables').push(t);return resultJson({TableDescription:view(t)});
          }
          if(op==='batch-write-item'){
            const requests=doc('request-items');if(!object(requests)||!Object.keys(requests).length)invalid('RequestItems must be a nonempty map');const operations=[];
            for(const [name,rows]of Object.entries(requests)){const t=table(name,'data');if(!Array.isArray(rows)||!rows.length)invalid('Each RequestItems table must contain requests');const seen=new Set();for(const request of rows){if(!object(request)||Object.keys(request).length!==1)invalid('Expected one PutRequest or DeleteRequest');const kind=own(request,'PutRequest')?'put':own(request,'DeleteRequest')?'delete':null,v=kind&&request[kind==='put'?'PutRequest':'DeleteRequest'];if(!kind||!object(v)||Object.keys(v).length!==1||!own(v,kind==='put'?'Item':'Key'))invalid('Batch writes accept Item/Key only; conditions require PutItem or transactions');const row=validateItem(t,plain(v[kind==='put'?'Item':'Key']),kind==='delete'),id=JSON.stringify(keyOf(t,row));if(seen.has(id))invalid('Provided list of item keys contains duplicates');seen.add(id);operations.push({t,row,kind});}}
            if(operations.length>25)invalid('Too many items requested for the BatchWriteItem call; maximum25');if(bytes(JSON.stringify(requests))>16*1024*1024)invalid('Request size exceeds16MB');operations.forEach(x=>write(x.t,x.row,x.kind));return resultJson({UnprocessedItems:{}});
          }
          if(op==='transact-write-items'){
            const transactions=doc('transact-items');if(!Array.isArray(transactions)||!transactions.length||transactions.length>100)invalid('TransactItems must contain1..100 actions');const token=flag('client-request-token'),now=Date.parse(sim.account.now||'2026-10-26T00:00:00Z');if(token&&(!/^[A-Za-z0-9_-]{1,36}$/.test(token)||!safeName(token)))invalid('ClientRequestToken must be1..36 safe characters');const signature=JSON.stringify(transactions),cached=token&&sim.ddbTokens&&sim.ddbTokens[token];if(cached&&now-cached.at<600000){if(cached.signature!==signature)throw Error('IdempotentParameterMismatchException: Token reused with different request parameters');return resultJson({});}
            const actions=[],seen=new Set(),reasons=[];let totalSize=0;
            for(const action of transactions){if(!object(action)||Object.keys(action).length!==1)invalid('Each transaction action must contain exactly one operation');const [kind]=Object.keys(action),v=action[kind];if(!['Put','Delete','Update','ConditionCheck'].includes(kind)||!object(v))invalid('Unsupported transaction action');const t=table(v.TableName||'','data'),row=validateItem(t,plain(kind==='Put'?v.Item:v.Key),kind!=='Put'),id=t.name+JSON.stringify(keyOf(t,row));if(seen.has(id))invalid('Transaction cannot include multiple operations on one item');seen.add(id);const ctx=expressionContext(v.ExpressionAttributeNames||{},v.ExpressionAttributeValues||{});if(kind==='ConditionCheck'&&!v.ConditionExpression)invalid('ConditionExpression required for ConditionCheck');const c=condition(t,row,v.ConditionExpression,ctx);let next=row;if(kind==='Update')next=updateRow(t,row,v.UpdateExpression,ctx);totalSize+=Math.max(itemSize(next),c.old?itemSize(c.old):0);actions.push({t,row:next,kind,old:c.old});reasons.push(c.ok?'None':'ConditionalCheckFailed');}
            if(totalSize>4*1024*1024)invalid('Transaction aggregate item size exceeds4MB');if(reasons.some(r=>r!=='None')){sim.ddbLastFailedTransaction={reasons:clone(reasons),tables:clone(list('tables')),items:clone(transactions)};throw Error('TransactionCanceledException: Transaction cancelled, please refer cancellation reasons ['+reasons.join(', ')+']');}
            actions.filter(a=>a.kind!=='ConditionCheck').forEach(a=>write(a.t,a.row,a.kind==='Delete'?'delete':'put'));sim.ddbLastTransaction={items:clone(transactions),tables:clone(list('tables'))};if(token){sim.ddbTokens=sim.ddbTokens||{};sim.ddbTokens[token]={signature,at:now};}return resultJson({});
          }
          const t=table(undefined,false);
          if(op==='describe-table'){if(t.status&&t.status!=='ACTIVE'){t.status='ACTIVE';touch(t);}else{let changed=false;for(const i of [...(t.gsis||[]),...(t.lsis||[])])if(i.status!=='ACTIVE'){i.status='ACTIVE';changed=true;}if(changed)touch(t);}return resultJson({Table:view(t)});}
          if(op==='delete-table'){list('tables').splice(list('tables').indexOf(t),1);return resultJson({TableDescription:{...view(t),TableStatus:'DELETING'}});}
          table(t.name,['get-item','put-item','delete-item','update-item','query','scan'].includes(op)?'data':true);
          if(op==='update-table'){
            const next={...clone(t),billing:t.billing||'PROVISIONED'},billing=flag('billing-mode');if(billing&&!['PROVISIONED','PAY_PER_REQUEST'].includes(billing))invalid('BillingMode must be PROVISIONED or PAY_PER_REQUEST');if(billing)next.billing=billing;if(flag('provisioned-throughput')){if(next.billing==='PAY_PER_REQUEST')invalid('ProvisionedThroughput cannot be specified in PAY_PER_REQUEST mode');Object.assign(next,cap(structure('provisioned-throughput')));}if(next.billing!=='PAY_PER_REQUEST'&&(!next.rcu||!next.wcu))invalid('ProvisionedThroughput required when switching to PROVISIONED');
            if(flag('attribute-definitions')&&!flag('global-secondary-index-updates'))invalid('AttributeDefinitions cannot change primary key schema; create a new table');
            if(flag('global-secondary-index-updates')){const updates=doc('global-secondary-index-updates');if(!Array.isArray(updates)||updates.length!==1||!object(updates[0])||Object.keys(updates[0]).length!==1)invalid('Simulator supports one GSI Create/Delete per update');const change=updates[0];if(change.Create){const types={...defs(t),...definitions(structure('attribute-definitions',true))};for(const k of Object.keys(defs(t)))if(types[k]!==defs(t)[k])invalid('Cannot change existing key attribute type');if((next.gsis||[]).some(i=>i.status!=='ACTIVE'))throw Error('ResourceInUseException: Another GSI is building');const i=gsi(change.Create,next,types);if([...(next.gsis||[]),...(next.lsis||[])].some(x=>x.name===i.name))invalid('Index already exists');if((next.gsis||[]).length>=20)throw Error('LimitExceededException: Default GSI quota20 exceeded');const used=new Set([...keys(t),...(next.gsis||[]).flatMap(keys),...(next.lsis||[]).flatMap(keys),...keys(i)]);if(Object.keys(types).some(k=>!used.has(k)))invalid('AttributeDefinitions must contain only key attributes');next.attributeTypes=types;next.gsis=[...(next.gsis||[]),i];for(const row of next.items||[])validateItem(next,row);}else if(change.Delete&&safeName(change.Delete.IndexName)){const found=(next.gsis||[]).find(i=>i.name===change.Delete.IndexName);if(!found)invalid('Index not found');next.gsis=next.gsis.filter(i=>i!==found);const used=new Set([...keys(next),...next.gsis.flatMap(keys),...(next.lsis||[]).flatMap(keys)]);next.attributeTypes=Object.fromEntries(Object.entries(defs(next)).filter(([k])=>used.has(k)));}else invalid('Simulator supports GSI Create or Delete, not an in-place key change');}
            if(!billing&&!flag('provisioned-throughput')&&!flag('global-secondary-index-updates'))invalid('No supported update requested');next.status='UPDATING';Object.assign(t,next);touch(t);return resultJson({TableDescription:view(t)});
          }
          if(op==='update-continuous-backups'||op==='describe-continuous-backups'){if(op.startsWith('update')){const p=structure('point-in-time-recovery-specification');if(!object(p)||typeof p.PointInTimeRecoveryEnabled!=='boolean'||p.RecoveryPeriodInDays!==undefined&&(!Number.isInteger(p.RecoveryPeriodInDays)||p.RecoveryPeriodInDays<1||p.RecoveryPeriodInDays>35))invalid('PITR requires boolean PointInTimeRecoveryEnabled and optional RecoveryPeriodInDays1..35');t.pitr={enabled:p.PointInTimeRecoveryEnabled,days:p.RecoveryPeriodInDays||t.pitr?.days||35};touch(t);}return resultJson({ContinuousBackupsDescription:{ContinuousBackupsStatus:'ENABLED',PointInTimeRecoveryDescription:{PointInTimeRecoveryStatus:t.pitr?.enabled?'ENABLED':'DISABLED',...(t.pitr?.enabled?{RecoveryPeriodInDays:t.pitr.days}:{})}}});}
          if(op==='update-time-to-live'){const p=structure('time-to-live-specification');if(!object(p)||typeof p.Enabled!=='boolean'||!safeName(p.AttributeName))invalid('TimeToLiveSpecification requires Enabled boolean and AttributeName');if(t.ttl&&['ENABLING','DISABLING'].includes(t.ttl.status))throw Error('ResourceInUseException: TimeToLive is being modified');if(t.ttl?.status==='ENABLED'&&p.Enabled&&t.ttl.attribute!==p.AttributeName)invalid('Disable current TTL before changing the attribute');t.ttl={attribute:p.AttributeName,status:p.Enabled?'ENABLING':'DISABLING'};touch(t);return resultJson({TimeToLiveSpecification:p});}
          if(op==='describe-time-to-live'){if(t.ttl&&['ENABLING','DISABLING'].includes(t.ttl.status)){t.ttl.status=t.ttl.status==='ENABLING'?'ENABLED':'DISABLED';touch(t);}return resultJson({TimeToLiveDescription:{TimeToLiveStatus:t.ttl?.status||'DISABLED',...(t.ttl?{AttributeName:t.ttl.attribute}:{})}});}
          if(['get-item','put-item','delete-item','update-item'].includes(op)){
            const put=op==='put-item',row=validateItem(t,plain(doc(put?'item':'key')),!put),old=(t.items||[]).find(x=>equalKey(t,x,row));
            if(op==='get-item'){const proof={op,revision:t.revision||0,key:keyOf(t,row),items:old?[clone(old)]:[],consistent:toks.includes('--consistent-read')};t.lastRead=null;if(resultJson(old?{Item:ddbTyped(old)}:{})===true)t.lastRead=proof;return;}
            const ctx=flagContext(),c=condition(t,row,flag('condition-expression'),ctx),returnValues=flag('return-values')||'NONE';if(!['NONE','ALL_OLD',...(op==='update-item'?['ALL_NEW']:[])].includes(returnValues))invalid('Unsupported ReturnValues for operation');let next=row;if(op==='update-item')next=updateRow(t,row,required('update-expression'),ctx);
            if(!c.ok){t.lastCondition={key:keyOf(t,row),applied:false,attempted:clone(next),existing:clone(c.old||{}),revision:t.revision||0};throw Error('ConditionalCheckFailedException: The conditional request failed; existing item preserved');}
            write(t,next,op==='delete-item'?'delete':'put');if(flag('condition-expression'))t.lastCondition={key:keyOf(t,row),applied:true,attempted:clone(next),revision:t.revision||0};return resultJson(returnValues==='ALL_NEW'?{Attributes:ddbTyped(next)}:returnValues==='ALL_OLD'&&old?{Attributes:ddbTyped(old)}:{});
          }
          if(op==='query'||op==='scan'){
            const name=flag('index-name'),index=name&&[...(t.gsis||[]),...(t.lsis||[])].find(i=>i.name===name),isGsi=!!index&&(t.gsis||[]).includes(index),strong=toks.includes('--consistent-read');if(name&&!index)invalid('The table does not have the specified index: '+name);if(index&&index.status!=='ACTIVE')throw Error('ResourceNotFoundException: Index '+name+' is not ACTIVE');if(isGsi&&strong)invalid('Consistent reads are not supported on global secondary indexes');const ctx=flagContext(),key=index||t;let rows=(t.items||[]).filter(row=>!index||keys(index).every(k=>row[k]!==undefined));
            if(op==='query'){const raw=required('key-condition-expression'),m=raw.match(/^\s*([#\w]+)\s*=\s*(:\w+)(?:\s+AND\s+([\s\S]+))?\s*$/i);if(!m)invalid('Query requires partition-key equality and optional sort-key condition');const attr=ctx.attr(m[1]),value=ctx.value(m[2]);if(attr!==key.partitionKey)invalid('Query condition missed key schema element: '+key.partitionKey);if(typeof value!==((defs(t)[attr]||'S')==='N'?'number':'string'))invalid('Condition parameter type does not match schema');rows=rows.filter(row=>row[attr]===value);if(m[3]){const term=m[3].trim();let sm=term.match(/^([#\w]+)\s+BETWEEN\s+(:\w+)\s+AND\s+(:\w+)$/i),test;if(sm){const a=ctx.attr(sm[1]),lo=ctx.value(sm[2]),hi=ctx.value(sm[3]);if(a!==key.sortKey)invalid('Sort condition must target sort key');test=row=>compare(row[a],'>=',lo)&&compare(row[a],'<=',hi);}else if((sm=term.match(/^begins_with\(\s*([#\w]+)\s*,\s*(:\w+)\s*\)$/))){const a=ctx.attr(sm[1]),prefix=ctx.value(sm[2]);if(a!==key.sortKey||typeof prefix!=='string')invalid('begins_with requires a string sort key');test=row=>typeof row[a]==='string'&&row[a].startsWith(prefix);}else{sm=term.match(/^([#\w]+)\s*(<=|>=|=|<|>)\s*(:\w+)$/);if(!sm)invalid('Invalid sort-key condition');const a=ctx.attr(sm[1]),v=ctx.value(sm[3]);if(a!==key.sortKey)invalid('Sort condition must target sort key');test=row=>compare(row[a],sm[2],v);}rows=rows.filter(test);}}
            if(op==='query'){const sk=key.sortKey;rows.sort((a,b)=>sk?(a[sk]<b[sk]?-1:a[sk]>b[sk]?1:0):0);if(toks.includes('--no-scan-index-forward'))rows.reverse();}
            if(flag('exclusive-start-key')){const start=plain(doc('exclusive-start-key'));validateItem(t,Object.fromEntries(keys(t).map(k=>[k,start[k]])),true);const i=rows.findIndex(row=>equalKey(t,row,start));if(i<0)invalid('ExclusiveStartKey outside this query fixture');rows=rows.slice(i+1);}
            const filterCtx=flagContext(),filter=predicate(flag('filter-expression'),filterCtx);if(op==='query'&&filterCtx.used.some(k=>keys(key).includes(k)))invalid('FilterExpression can only contain non-primary-key attributes');const limitRaw=flag('limit'),limit=limitRaw===null?Infinity:Number(limitRaw);if(!(limit>0)||limit!==Infinity&&!Number.isInteger(limit))invalid('Limit must be a positive integer');let total=0,count=0;while(count<rows.length&&count<limit){const size=itemSize(projected(t,index,rows[count]));if(count&&total+size>1024*1024)break;total+=size;count++;}const evaluated=rows.slice(0,count),more=count<rows.length;
            const selection=flag('select');if(selection&&!['ALL_ATTRIBUTES','ALL_PROJECTED_ATTRIBUTES','COUNT','SPECIFIC_ATTRIBUTES'].includes(selection))invalid('Unknown Select value');if(isGsi&&selection==='ALL_ATTRIBUTES'&&index.projection.ProjectionType!=='ALL')invalid('GSI cannot fetch nonprojected attributes from table');if(selection==='SPECIFIC_ATTRIBUTES'&&!flag('projection-expression'))invalid('SPECIFIC_ATTRIBUTES requires ProjectionExpression');let items=evaluated.filter(filter).map(row=>projected(t,index,row));if(flag('projection-expression')){if(selection&&selection!=='SPECIFIC_ATTRIBUTES')invalid('ProjectionExpression requires SPECIFIC_ATTRIBUTES when Select is supplied');const attrs=required('projection-expression').split(',').map(a=>ctx.attr(a.trim()));items=items.map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>attrs.includes(k))));}
            const result={...(selection==='COUNT'?{}:{Items:items.map(ddbTyped)}),Count:items.length,ScannedCount:evaluated.length};if(more&&evaluated.length){const last=evaluated.at(-1);result.LastEvaluatedKey=ddbTyped(Object.fromEntries([...new Set([...keys(t),...keys(key)])].map(k=>[k,last[k]])));}
            const capacity=flag('return-consumed-capacity');if(capacity&&!['NONE','TOTAL','INDEXES'].includes(capacity))invalid('ReturnConsumedCapacity must be NONE/TOTAL/INDEXES');if(capacity&&capacity!=='NONE')result.ConsumedCapacity={TableName:t.name,CapacityUnits:Math.max(1,Math.ceil(total/4096))*(strong?1:.5)};
            const proof={op,index:name||null,revision:t.revision||0,items:selection==='COUNT'?[]:clone(items),keyCondition:flag('key-condition-expression'),scannedCount:evaluated.length,hasMore:more,consistent:strong};t.lastRead=null;if(resultJson(result)===true)t.lastRead=proof;return;
          }
          return print('err','Unknown DynamoDB operation: '+op+'. Use help for modeled operations.');
        } catch(e){return print('err',e.message);}
      }

      /* ===================== ROUTE 53 ===================== */
      case 'route53': {
        const clone = v => JSON.parse(JSON.stringify(v));
        const canonical = x => String(x || '').toLowerCase().replace(/\.$/, '') + '.';
        const ipv4 = x => typeof x === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(x) && x.split('.').every(n => Number(n) <= 255);
        const ipv6 = x => {
          if(typeof x!=='string'||!/^[0-9a-f:]+$/i.test(x)||x.includes(':::'))return false;
          const halves=x.split('::'); if(halves.length>2)return false;
          const groups=x.split(':').filter(Boolean);
          return groups.every(g=>g.length<=4)&&(halves.length===2?groups.length<8:groups.length===8&&!x.startsWith(':')&&!x.endsWith(':'));
        };
        const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
        const required = name => { const v=flag(name); if(!v) throw Error(`aws: error: the following arguments are required: --${name}`); return v; };
        const doc = name => {
          const raw=required(name);
          let text=raw;
          if(raw.startsWith('file://')) {
            const file=Object.prototype.hasOwnProperty.call(sim.files,raw.slice(7)) && sim.files[raw.slice(7)];
            if(!file || typeof file.content!=='string') throw Error(`Error parsing parameter --${name}: Unable to load paramfile ${raw}; use ls and cat.`);
            text=file.content;
          }
          try { const v=JSON.parse(text); if(!object(v)) throw Error('expected an object'); return v; }
          catch(e) { throw Error(`Error parsing parameter --${name}: Invalid JSON object (${e.message})`); }
        };
        const zones=()=>list('hostedZones'), checks=()=>list('healthChecks'), changes=()=>list('dnsChanges');
        const zone = name => { const id=required(name).replace(/^\/hostedzone\//,''); const z=zones().find(z=>z.id===id); if(!z) throw Error(`NoSuchHostedZone: ${id}`); return z; };
        const hc = () => { const id=required('health-check-id'), h=checks().find(h=>h.id===id); if(!h) throw Error(`NoSuchHealthCheck: ${id}`); return h; };
        const record = r => r.Name ? clone(r) : {Name:canonical(r.name),Type:r.type,TTL:r.ttl===undefined?300:r.ttl,ResourceRecords:[{Value:r.value}]};
        const records = z => (z.records||[]).map(record);
        const info = z => ({Id:'/hostedzone/'+z.id,Name:canonical(z.name),CallerReference:z.callerReference||'course-fixture',Config:{PrivateZone:!!z.private},ResourceRecordSetCount:records(z).length});
        const healthInfo = h => ({Id:h.id,CallerReference:h.callerReference||'course-fixture',HealthCheckVersion:h.version||1,HealthCheckConfig:h.config||{Type:h.type||'HTTPS',FullyQualifiedDomainName:h.fqdn||''}});
        const sameKey = (a,b) => a.Name===b.Name && a.Type===b.Type && a.SetIdentifier===b.SetIdentifier;
        const stable = x => JSON.stringify(x && typeof x==='object' ? Array.isArray(x) ? x.map(v=>JSON.parse(stable(v))) : Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(stable(x[k]))])) : x);
        const nextChange = (z,snapshot,comment) => {
          const seq=(sim.account.dnsChangeCounter||0)+1; sim.account.dnsChangeCounter=seq;
          const c={Id:'/change/C'+String(seq).padStart(9,'0'),Status:'PENDING',SubmittedAt:'2026-01-01T00:00:00Z',Comment:comment||'',zoneId:z.id,seq,snapshot:clone(snapshot)};
          changes().push(c); return c;
        };
        const changeInfo = c => ({Id:c.Id,Status:c.Status,SubmittedAt:c.SubmittedAt,Comment:c.Comment});
        try {
          if(op==='list-hosted-zones') return resultJson({HostedZones:zones().map(info),IsTruncated:false,MaxItems:'100'});
          if(op==='get-hosted-zone') {const z=zone('id');return resultJson({HostedZone:info(z),DelegationSet:{NameServers:z.private?[]:['ns-1.sim.invalid','ns-2.sim.invalid']}});}
          if(op==='create-hosted-zone') {
            const name=canonical(required('name')), caller=required('caller-reference');
            if(name.length>254 || !/^(?:[a-z0-9_*-]+\.)+$/.test(name)) throw Error('InvalidInput: Invalid domain name');
            if(caller.length>128) throw Error('InvalidInput: CallerReference exceeds 128 characters');
            if(zones().some(z=>z.callerReference===caller)||(sim.account.dnsUsedZoneCallers||[]).includes(caller)) throw Error('HostedZoneAlreadyExists: CallerReference was already used; inspect existing zones.');
            let cfg={}; if(flag('hosted-zone-config')) {cfg=doc('hosted-zone-config');if(cfg.PrivateZone!==undefined&&typeof cfg.PrivateZone!=='boolean')throw Error('InvalidInput: PrivateZone must be boolean');}
            if(cfg.PrivateZone||flag('vpc')) throw Error('Simulator scope: create-hosted-zone supports public zones only; private VPC associations are taught separately.');
            const seq=(sim.account.dnsZoneCounter||0)+1,id='Z'+String(seq).padStart(9,'0');
            const z={id,name,callerReference:caller,private:false,records:[{Name:name,Type:'NS',TTL:172800,ResourceRecords:[{Value:'ns-1.sim.invalid.'},{Value:'ns-2.sim.invalid.'}]},{Name:name,Type:'SOA',TTL:900,ResourceRecords:[{Value:'ns-1.sim.invalid. hostmaster.sim.invalid. 1 7200 900 1209600 86400'}]}]};
            sim.account.dnsZoneCounter=seq; zones().push(z); z.servedRecords=clone(z.records);
            return resultJson({HostedZone:info(z),ChangeInfo:changeInfo(nextChange(z,z.records)),DelegationSet:{NameServers:['ns-1.sim.invalid','ns-2.sim.invalid']}});
          }
          if(op==='delete-hosted-zone') {
            const z=zone('id'); if(records(z).some(r=>!['NS','SOA'].includes(r.Type))) throw Error('HostedZoneNotEmpty: Delete non-default record sets before deleting the hosted zone.');
            zones().splice(zones().indexOf(z),1); (sim.account.dnsUsedZoneCallers||(sim.account.dnsUsedZoneCallers=[])).push(z.callerReference);
            return resultJson({ChangeInfo:changeInfo(nextChange(z,[]))});
          }
          if(op==='list-resource-record-sets') {const z=zone('hosted-zone-id'); return resultJson({ResourceRecordSets:records(z),IsTruncated:false,MaxItems:'300'});}
          if(op==='change-resource-record-sets') {
            const z=zone('hosted-zone-id'), batch=doc('change-batch'), before=records(z), draft=clone(before);
            if(!Array.isArray(batch.Changes)||!batch.Changes.length) throw Error('InvalidChangeBatch: Changes must be a nonempty array');
            for(const change of batch.Changes) {
              if(!object(change)||!['CREATE','UPSERT','DELETE'].includes(change.Action)||!object(change.ResourceRecordSet)) throw Error('InvalidChangeBatch: Each change needs Action CREATE/UPSERT/DELETE and ResourceRecordSet');
              const r=clone(change.ResourceRecordSet);
              if(typeof r.Name!=='string'||typeof r.Type!=='string') throw Error('InvalidChangeBatch: Record Name and Type required');
              r.Name=canonical(r.Name);
              if(r.Name.length>254||r.Name.split('.').some(l=>l.length>63)||!/^(?:[a-z0-9_*-]+\.)+$/.test(r.Name))throw Error('InvalidChangeBatch: Invalid DNS record name');
              if(r.Name!==canonical(z.name)&&!r.Name.endsWith('.'+canonical(z.name))) throw Error(`InvalidChangeBatch: ${r.Name} is not permitted in zone ${z.name}`);
              if(!['A','AAAA','CNAME','TXT','MX','NS','SOA'].includes(r.Type)) throw Error('Simulator scope: supported record types A, AAAA, CNAME, TXT, MX, NS, SOA');
              if(r.Type==='CNAME'&&r.Name===canonical(z.name)) throw Error('InvalidChangeBatch: CNAME at the zone apex is not permitted; use an Alias A/AAAA for a supported target.');
              if(r.SetIdentifier!==undefined&&(typeof r.SetIdentifier!=='string'||!r.SetIdentifier.length)) throw Error('InvalidChangeBatch: SetIdentifier must be a nonempty string');
              if(['Region','GeoLocation','GeoProximityLocation','CidrRoutingConfig','MultiValueAnswer'].some(k=>r[k]!==undefined)) throw Error('Simulator scope: simple, weighted and failover record writes only; other policies are lesson decisions.');
              if(r.Weight!==undefined&&(!Number.isInteger(r.Weight)||r.Weight<0||r.Weight>255||!r.SetIdentifier)) throw Error('InvalidChangeBatch: Weighted records require SetIdentifier and integer Weight 0..255');
              if(r.Failover!==undefined&&(!['PRIMARY','SECONDARY'].includes(r.Failover)||!r.SetIdentifier)) throw Error('InvalidChangeBatch: Failover records require SetIdentifier and PRIMARY/SECONDARY');
              if(r.Weight!==undefined&&r.Failover!==undefined) throw Error('InvalidChangeBatch: Cannot combine Weight and Failover');
              if(r.SetIdentifier!==undefined&&r.Weight===undefined&&r.Failover===undefined) throw Error('InvalidChangeBatch: SetIdentifier needs a routing policy');
              if(r.HealthCheckId&&!checks().some(h=>h.id===r.HealthCheckId)) throw Error(`NoSuchHealthCheck: ${r.HealthCheckId}`);
              if(r.HealthCheckId&&r.Weight===undefined&&!r.Failover) throw Error('InvalidChangeBatch: Simple routing does not support associated record health checks; use a supported health-aware policy.');
              if(r.AliasTarget!==undefined) {
                const a=r.AliasTarget;
                if(!object(a)||!['A','AAAA'].includes(r.Type)||typeof a.DNSName!=='string'||typeof a.HostedZoneId!=='string'||typeof a.EvaluateTargetHealth!=='boolean') throw Error('InvalidChangeBatch: Alias A/AAAA requires DNSName, HostedZoneId and boolean EvaluateTargetHealth');
                if(r.TTL!==undefined||r.ResourceRecords!==undefined) throw Error('InvalidChangeBatch: Alias record must not contain TTL or ResourceRecords');
                const target=(sim.account.dnsAliases||[]).find(t=>canonical(t.dnsName)===canonical(a.DNSName)&&t.hostedZoneId===a.HostedZoneId);
                if(!target) throw Error('InvalidChangeBatch: Alias target DNSName/HostedZoneId is not an available target in this mission. Read ALB metadata.');
              } else {
                if(!Number.isInteger(r.TTL)||r.TTL<0||r.TTL>2147483647||!Array.isArray(r.ResourceRecords)||!r.ResourceRecords.length||r.ResourceRecords.some(v=>!object(v)||typeof v.Value!=='string'||!v.Value.length)) throw Error('InvalidChangeBatch: Non-alias record requires integer TTL and nonempty ResourceRecords Value strings');
                if(r.Type==='A'&&r.ResourceRecords.some(v=>!ipv4(v.Value))) throw Error('InvalidChangeBatch: ARRDATAIllegalIPv4Address; A ResourceRecords require IPv4 addresses, not ALB hostnames.');
                if(r.Type==='AAAA'&&r.ResourceRecords.some(v=>!ipv6(v.Value))) throw Error('InvalidChangeBatch: Invalid IPv6 hextet address (mapped IPv4 syntax is outside this simulator subset)');
                if(r.Type==='CNAME'&&r.ResourceRecords.length!==1) throw Error('InvalidChangeBatch: CNAME requires exactly one value');
                if(r.Weight!==undefined&&r.ResourceRecords.length!==1) throw Error('InvalidChangeBatch: Weighted record requires a single resource record value');
              }
              const idx=draft.findIndex(x=>sameKey(x,r));
              if(change.Action==='CREATE'&&idx>=0) throw Error('InvalidChangeBatch: Record set already exists; use UPSERT for replacement');
              if(change.Action==='DELETE') {
                if(idx<0||stable(draft[idx])!==stable(r)) throw Error('InvalidChangeBatch: Tried to delete record set, but values do not match current values');
                if(r.Name===canonical(z.name)&&['NS','SOA'].includes(r.Type)) throw Error('InvalidChangeBatch: Cannot delete the zone apex NS/SOA record set');
                draft.splice(idx,1);
              } else if(idx<0) draft.push(r); else draft[idx]=r;
              // Route53 aligns a weighted non-alias group's TTL to the last
              // specified value; rejecting a mismatch would teach a false API rule.
              if(change.Action!=='DELETE'&&r.Weight!==undefined&&!r.AliasTarget) draft.filter(x=>x.Name===r.Name&&x.Type===r.Type&&x.Weight!==undefined&&!x.AliasTarget).forEach(x=>x.TTL=r.TTL);
            }
            for(const r of draft) {
              const group=draft.filter(x=>x.Name===r.Name&&x.Type===r.Type);
              if(r.Type==='CNAME'&&draft.some(x=>x.Name===r.Name&&x.Type!=='CNAME')) throw Error('InvalidChangeBatch: CNAME cannot coexist with other records at the same name');
              const policy=x=>x.Weight!==undefined?'weighted':x.Failover?'failover':'simple';
              if(group.some(x=>policy(x)!==policy(r))) throw Error('InvalidChangeBatch: Cannot mix routing policies for the same name and type');
              if(r.Failover&&group.filter(x=>x.Failover===r.Failover).length>1) throw Error('InvalidChangeBatch: Only one PRIMARY and one SECONDARY permitted per failover group');
            }
            // Atomic validation above. Desired config and serving snapshot are separate.
            if(!z.servedRecords) z.servedRecords=clone(before);
            z.records=draft; const c=nextChange(z,draft,batch.Comment); return resultJson({ChangeInfo:changeInfo(c)});
          }
          if(op==='get-change'||op==='wait') {
            if(op==='wait'&&toks[3]!=='resource-record-sets-changed') throw Error('aws: error: supported waiter: resource-record-sets-changed');
            const id=required('id').replace(/^\/change\//,''), c=changes().find(c=>c.Id.replace(/^\/change\//,'')===id);
            if(!c) throw Error(`NoSuchChange: ${id}`);
            if(op==='get-change') return resultJson({ChangeInfo:changeInfo(c)});
            const z=zones().find(z=>z.id===c.zoneId);
            if(z&&(!z.servedSequence||z.servedSequence<c.seq)) {z.servedRecords=clone(c.snapshot);z.servedSequence=c.seq;}
            changes().filter(x=>x.zoneId===c.zoneId&&x.seq<=c.seq).forEach(x=>x.Status='INSYNC');
            return print('ok',''); // explicit teaching transition, not a real propagation timer
          }
          if(op==='list-health-checks') return resultJson({HealthChecks:checks().map(healthInfo),IsTruncated:false,MaxItems:'100'});
          if(op==='get-health-check') return resultJson({HealthCheck:healthInfo(hc())});
          if(op==='create-health-check') {
            const caller=required('caller-reference'), input=doc('health-check-config');
            if(caller.length>64) throw Error('InvalidInput: CallerReference exceeds 64 characters');
            if(!['HTTP','HTTPS','TCP'].includes(input.Type)) throw Error('Simulator scope: endpoint HTTP/HTTPS/TCP checks only; calculated and CloudWatch checks are not executed here.');
            if(input.IPAddress!==undefined&&!ipv4(input.IPAddress)) throw Error('Simulator scope: health-check IPAddress supports IPv4 in this mission.');
            if(!input.IPAddress&&!input.FullyQualifiedDomainName) throw Error('InvalidInput: IPAddress or FullyQualifiedDomainName required');
            if(input.FullyQualifiedDomainName!==undefined&&(typeof input.FullyQualifiedDomainName!=='string'||!input.FullyQualifiedDomainName.length)) throw Error('InvalidInput: FullyQualifiedDomainName must be a nonempty string');
            const cfg={Port:input.Type==='HTTPS'?443:80,ResourcePath:'/',RequestInterval:30,FailureThreshold:3,Inverted:false,Disabled:false,...input};
            if(![10,30].includes(cfg.RequestInterval)||!Number.isInteger(cfg.FailureThreshold)||cfg.FailureThreshold<1||cfg.FailureThreshold>10||!Number.isInteger(cfg.Port)||cfg.Port<1||cfg.Port>65535||typeof cfg.Inverted!=='boolean'||typeof cfg.Disabled!=='boolean') throw Error('InvalidInput: RequestInterval 10/30 seconds, FailureThreshold 1..10, valid Port and boolean flags required');
            if(input.Type==='TCP'&&input.Port===undefined) throw Error('InvalidInput: TCP requires Port');
            if(typeof cfg.ResourcePath!=='string'||!cfg.ResourcePath.startsWith('/')) throw Error('InvalidInput: ResourcePath must start with /');
            const old=checks().find(h=>h.callerReference===caller);
            if(old) {if(stable(old.config)!==stable(cfg)) throw Error('HealthCheckAlreadyExists: CallerReference reused with different configuration');return resultJson({HealthCheck:healthInfo(old)});}
            if((sim.account.dnsUsedHealthCallers||[]).includes(caller)) throw Error('HealthCheckAlreadyExists: CallerReference belongs to a deleted health check');
            const seq=(sim.account.dnsHealthCounter||0)+1,id='00000000-0000-4000-8000-'+String(seq).padStart(12,'0');
            const fixture=(sim.account.dnsHealthFixtures||{})[cfg.IPAddress||cfg.FullyQualifiedDomainName];
            const h={id,callerReference:caller,config:cfg,version:1,observedHealthy:fixture===true};
            sim.account.dnsHealthCounter=seq;checks().push(h);return resultJson({HealthCheck:healthInfo(h)});
          }
          if(op==='update-health-check') {
            const h=hc(), cfg=clone(h.config||{});
            if(flag('health-check-version')!==null&&Number(flag('health-check-version'))!==(h.version||1)) throw Error('HealthCheckVersionMismatch: Read current version before update');
            if(toks.includes('--disabled'))cfg.Disabled=true; if(toks.includes('--no-disabled'))cfg.Disabled=false;
            if(toks.includes('--inverted'))cfg.Inverted=true; if(toks.includes('--no-inverted'))cfg.Inverted=false;
            if(flag('failure-threshold')!==null) {const n=Number(flag('failure-threshold'));if(!Number.isInteger(n)||n<1||n>10)throw Error('InvalidInput: FailureThreshold must be 1..10');cfg.FailureThreshold=n;}
            if(flag('resource-path')!==null) {if(!flag('resource-path').startsWith('/'))throw Error('InvalidInput: ResourcePath must start with /');cfg.ResourcePath=flag('resource-path');}
            h.config=cfg;h.version=(h.version||1)+1; return resultJson({HealthCheck:healthInfo(h)});
          }
          if(op==='delete-health-check') {
            const h=hc();
            checks().splice(checks().indexOf(h),1);(sim.account.dnsUsedHealthCallers||(sim.account.dnsUsedHealthCallers=[])).push(h.callerReference);return print('ok','');
          }
          if(op==='get-health-check-status') {
            const h=hc(),cfg=h.config||{},healthy=cfg.Disabled|| (cfg.Inverted?!h.observedHealthy:h.observedHealthy);
            return resultJson({HealthCheckObservations:[{Region:'ap-south-1',IPAddress:'192.0.2.53',StatusReport:{Status:healthy?'Success: HTTP Status Code: 200 (mission fixture)':'Failure: HTTP connection failed (mission fixture)',CheckedTime:'2026-01-01T00:00:00Z'}}]});
          }
          if(op==='test-dns-answer') {
            const z=zone('hosted-zone-id'),name=required('record-name'),type=required('record-type');
            if(z.private) throw Error('InvalidInput: TestDNSAnswer supports public hosted zones only');
            if(flag('resolver-ip')||flag('edns0-client-subnet-ip')||flag('edns0-client-subnet-mask')) throw Error('Simulator scope: resolver/EDNS location policies not modeled. Omit optional location flags.');
            const rs=(z.servedRecords||records(z)).filter(r=>canonical(r.Name||r.name)===canonical(name)&&(r.Type||r.type)===type);
            if(rs.some(r=>r.HealthCheckId&&!checks().some(h=>h.id===r.HealthCheckId)))throw Error('Simulator: referenced health check was deleted. Real AWS permits deletion, but future routing health is unpredictable. Repair/remove the stale HealthCheckId; no fabricated answer returned.');
            if(rs.some(r=>['Region','GeoLocation','GeoProximityLocation','CidrRoutingConfig','MultiValueAnswer'].some(k=>r[k]!==undefined))) throw Error('Simulator scope: test-dns-answer supports simple/weighted/failover only.');
            const cursor=sim.account.dnsAnswerCursor||0, data=AG.dnsAnswer(sim.account,z,name,type,cursor);sim.account.dnsAnswerCursor=cursor+1;
            const exists=(z.servedRecords||records(z)).some(r=>canonical(r.Name||r.name)===canonical(name));
            return resultJson({Nameserver:'ns-1.sim.invalid',RecordName:canonical(name),RecordType:type,RecordData:data,ResponseCode:exists?'NOERROR':'NXDOMAIN',Protocol:'UDP'});
          }
          throw Error(`aws: error: unknown Route 53 operation '${op}'. Try list-hosted-zones or help.`);
        } catch(e) { return print('err',e.message); }
      }

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

      /* ===================== CLOUDWATCH LOGS ===================== */
      case 'logs':
        if (op === 'tail') {
          const name=toks[3],group=list('logGroups').find(g=>g.name===name);
          if(!group)return print('err','ResourceNotFoundException: Log group not found; inspect exact /aws/lambda/function name');
          return print('ok',(group.events||[]).join('\n')||'(no events in this fixture)');
        } else if (op === 'describe-log-groups') {
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
      case 'cloudfront': {
        const clone=x=>JSON.parse(JSON.stringify(x)),object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
        const required=n=>{const v=flag(n);if(!v)throw Error(`aws: error: the following arguments are required: --${n}`);return v;};
        const doc=n=>{let raw=required(n);if(raw.startsWith('file://')){const f=Object.prototype.hasOwnProperty.call(sim.files,raw.slice(7))&&sim.files[raw.slice(7)];if(!f||typeof f.content!=='string')throw Error(`Error parsing parameter --${n}: Unable to load paramfile; use ls/cat`);raw=f.content;}try{const v=JSON.parse(raw);if(!object(v))throw Error('object required');return v;}catch(e){throw Error(`Error parsing parameter --${n}: Invalid JSON object (${e.message})`);}};
        const policies=[{Id:'658327ea-f89d-4fab-a63d-7e88639e58f6',Name:'Managed-CachingOptimized',MinTTL:1,DefaultTTL:86400,MaxTTL:31536000},{Id:'4135ea2d-6df8-44a3-9df3-4b5a84be39ad',Name:'Managed-CachingDisabled',MinTTL:0,DefaultTTL:0,MaxTTL:0}];
        const controls=()=>list('originAccessControls'),distributions=()=>list('cloudfront');
        const getDist=(name='id')=>{const id=required(name),c=distributions().find(c=>c.id===id);if(!c)throw Error(`NoSuchDistribution: ${id}`);return c;};
        const getOac=()=>{const id=required('id'),c=controls().find(c=>c.id===id);if(!c)throw Error(`NoSuchOriginAccessControl: ${id}`);return c;};
        const config=c=>c.config||{CallerReference:'legacy-'+c.id,Comment:'Legacy read fixture',Enabled:!!c.enabled,Origins:{Quantity:(c.origins||[]).length,Items:(c.origins||[]).map((o,i)=>({Id:'origin-'+i,DomainName:o}))},DefaultCacheBehavior:{TargetOriginId:'origin-0',ViewerProtocolPolicy:'redirect-to-https'}};
        const etag=c=>c.etag||'E1',arn=c=>'arn:aws:cloudfront::123456789012:distribution/'+c.id;
        const distJson=c=>({Id:c.id,ARN:arn(c),DomainName:c.domain,Status:c.status||'Deployed',LastModifiedTime:'2026-01-01T00:00:00Z',DistributionConfig:clone(config(c))});
        const controlJson=c=>({Id:c.id,OriginAccessControlConfig:clone(c.config)});
        const validateControl=cfg=>{if(typeof cfg.Name!=='string'||!cfg.Name||cfg.Name.length>64||(cfg.Description!==undefined&&typeof cfg.Description!=='string')||!['always','never','no-override'].includes(cfg.SigningBehavior)||cfg.SigningProtocol!=='sigv4'||cfg.OriginAccessControlOriginType!=='s3')throw Error('InvalidArgument: This mission supports S3 OAC, Name, optional Description, SigningProtocol sigv4 and SigningBehavior always/never/no-override');};
        const policyJson=p=>{const {Id,...cfg}=p;return {Id,CachePolicyConfig:{...cfg,ParametersInCacheKeyAndForwardedToOrigin:{EnableAcceptEncodingGzip:Id===policies[0].Id,EnableAcceptEncodingBrotli:Id===policies[0].Id,HeadersConfig:{HeaderBehavior:'none'},CookiesConfig:{CookieBehavior:'none'},QueryStringsConfig:{QueryStringBehavior:'none'}}}};};
        const qty=(v,name,minimum=0)=>{if(!object(v)||!Number.isInteger(v.Quantity)||v.Quantity<minimum||v.Quantity!==(v.Items||[]).length||v.Items!==undefined&&!Array.isArray(v.Items))throw Error(`InconsistentQuantities: ${name} Quantity must match Items`);return v.Items||[];};
        const validateConfig=(cfg,c)=>{
          if(cfg.CallerReference!==config(c).CallerReference)throw Error('IllegalUpdate: CallerReference cannot be changed');
          if(typeof cfg.Enabled!=='boolean'||typeof cfg.Comment!=='string')throw Error('InvalidArgument: Enabled boolean and Comment string required');
          const origins=qty(cfg.Origins,'Origins',1),ids=origins.map(o=>o&&o.Id);
          if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error('InvalidArgument: Origin IDs must be unique nonempty strings');
          for(const o of origins){
            if(typeof o.DomainName!=='string'||!o.DomainName||/\s|:\/\//.test(o.DomainName))throw Error('InvalidArgument: Origin DomainName must be a hostname');
            if(o.OriginAccessControlId){const a=controls().find(a=>a.id===o.OriginAccessControlId);if(!a)throw Error('InvalidOriginAccessControl: Referenced OAC does not exist');if(!o.S3OriginConfig||o.DomainName.includes('s3-website')||o.S3OriginConfig.OriginAccessIdentity)throw Error('InvalidArgument: S3 OAC needs REST S3 origin; cannot combine OAI and OAC');}
          }
          const behaviors=[cfg.DefaultCacheBehavior,...(cfg.CacheBehaviors?qty(cfg.CacheBehaviors,'CacheBehaviors'):[])];
          for(const b of behaviors){if(!object(b)||!ids.includes(b.TargetOriginId))throw Error('NoSuchOrigin: Cache behavior TargetOriginId must reference an origin');if(!['redirect-to-https','https-only','allow-all'].includes(b.ViewerProtocolPolicy))throw Error('InvalidArgument: Invalid ViewerProtocolPolicy');if(!policies.some(p=>p.Id===b.CachePolicyId))throw Error('NoSuchCachePolicy: This simulator supports the two documented managed policies; use list-cache-policies');if(b.AllowedMethods)qty(b.AllowedMethods,'AllowedMethods',1);if(b.TrustedKeyGroups)qty(b.TrustedKeyGroups,'TrustedKeyGroups');}
          const patterns=behaviors.slice(1).map(b=>b.PathPattern);if(patterns.some(p=>typeof p!=='string'||!p)||new Set(patterns).size!==patterns.length)throw Error('InvalidArgument: Ordered cache behaviors need unique PathPattern');
          if(cfg.Aliases){const aliases=qty(cfg.Aliases,'Aliases');if(aliases.length){const cert=cfg.ViewerCertificate||{};if(typeof cert.ACMCertificateArn!=='string'||!cert.ACMCertificateArn.startsWith('arn:aws:acm:us-east-1:'))throw Error('InvalidViewerCertificate: Custom viewer ACM certificate must be in us-east-1');}}
          if(cfg.PriceClass&&!['PriceClass_All','PriceClass_100','PriceClass_200'].includes(cfg.PriceClass))throw Error('InvalidArgument: Unsupported PriceClass');
        };
        const getInvalid=c=>{const id=required('id'),i=(c.invalidations||[]).find(i=>i.Id===id);if(!i)throw Error(`NoSuchInvalidation: ${id}`);return i;};
        try {
          if(op==='list-distributions')return resultJson({DistributionList:{Quantity:distributions().length,IsTruncated:false,Items:distributions().map(c=>({...distJson(c),Enabled:config(c).Enabled}))}});
          if(op==='get-distribution') {const c=getDist();return resultJson({ETag:etag(c),Distribution:distJson(c)});}
          if(op==='get-distribution-config'){const c=getDist();return resultJson({ETag:etag(c),DistributionConfig:clone(config(c))});}
          if(op==='update-distribution'){
            const c=getDist(),match=required('if-match');if(match!==etag(c))throw Error('PreconditionFailed: The precondition in the If-Match header failed. Read get-distribution-config and merge with current ETag.');
            const cfg=doc('distribution-config');validateConfig(cfg,c);
            if(!c.deployedConfig)c.deployedConfig=clone(config(c));c.config=clone(cfg);c.enabled=cfg.Enabled;c.status='InProgress';c.version=(c.version||1)+1;c.etag='E'+c.version;
            return resultJson({ETag:c.etag,Distribution:distJson(c)});
          }
          if(op==='disable-distribution')throw Error('aws: error: disable-distribution is not an AWS operation. Get config, set Enabled=false in JSON, update-distribution with current --if-match, then wait deployed.');
          if(op==='delete-distribution'){
            const c=getDist();if(required('if-match')!==etag(c))throw Error('PreconditionFailed: Current ETag required');if(config(c).Enabled)throw Error('DistributionNotDisabled: Update config Enabled=false first');if(c.status!=='Deployed')throw Error('DistributionNotDisabled: Wait for the disabled configuration to deploy before deletion');distributions().splice(distributions().indexOf(c),1);return print('ok','');
          }
          if(op==='create-origin-access-control'){
            const cfg=doc('origin-access-control-config');validateControl(cfg);
            if(controls().some(c=>c.config.Name===cfg.Name))throw Error('OriginAccessControlAlreadyExists: Name already exists');
            const seq=(sim.account.cdnOacCounter||0)+1,c={id:'OAC'+String(seq).padStart(6,'0'),etag:'O1',config:clone(cfg)};sim.account.cdnOacCounter=seq;controls().push(c);return resultJson({ETag:c.etag,OriginAccessControl:controlJson(c)});
          }
          if(op==='list-origin-access-controls')return resultJson({OriginAccessControlList:{Quantity:controls().length,Items:controls().map(controlJson),IsTruncated:false}});
          if(op==='get-origin-access-control'){const c=getOac();return resultJson({ETag:c.etag,OriginAccessControl:controlJson(c)});}
          if(op==='update-origin-access-control'){
            const c=getOac();if(required('if-match')!==c.etag)throw Error('PreconditionFailed: Read current OAC ETag before update');const cfg=doc('origin-access-control-config');validateControl(cfg);
            if(controls().some(other=>other!==c&&other.config.Name===cfg.Name))throw Error('OriginAccessControlAlreadyExists: Name already exists');c.config=clone(cfg);c.version=(c.version||1)+1;c.etag='O'+c.version;return resultJson({ETag:c.etag,OriginAccessControl:controlJson(c)});
          }
          if(op==='delete-origin-access-control'){
            const c=getOac();if(required('if-match')!==c.etag)throw Error('PreconditionFailed: Current OAC ETag required');if(distributions().some(d=>[config(d),d.deployedConfig].filter(Boolean).some(cfg=>(cfg.Origins.Items||[]).some(o=>o.OriginAccessControlId===c.id))))throw Error('OriginAccessControlInUse: Detach OAC and wait for deployment before deletion');controls().splice(controls().indexOf(c),1);return print('ok','');
          }
          if(op==='list-cache-policies'){if(flag('type')&&flag('type')!=='managed')throw Error('Simulator scope: managed cache policies only');return resultJson({CachePolicyList:{Quantity:policies.length,Items:policies.map(p=>({Type:'managed',CachePolicy:policyJson(p)}))}});}
          if(op==='get-cache-policy'){const id=required('id'),p=policies.find(p=>p.Id===id);if(!p)throw Error(`NoSuchCachePolicy: ${id}`);return resultJson({ETag:'managed',CachePolicy:policyJson(p)});}
          if(op==='create-invalidation'){
            const c=getDist('distribution-id');if(flag('paths')&&flag('invalidation-batch'))throw Error('aws: error: choose --paths or --invalidation-batch, not both');
            let batch;if(flag('invalidation-batch'))batch=doc('invalidation-batch');else{const paths=flags('paths');if(!paths.length)throw Error('aws: error: --paths or --invalidation-batch required');batch={CallerReference:'sim-cli-'+((sim.account.cdnInvalidationCounter||0)+1),Paths:{Quantity:paths.length,Items:paths}};}
            const paths=qty(batch.Paths,'Paths',1);if(typeof batch.CallerReference!=='string'||!batch.CallerReference||paths.some(p=>typeof p!=='string'||!p.startsWith('/')||p.includes('*')&&!p.endsWith('*')||p.indexOf('*')!==p.lastIndexOf('*')))throw Error('InvalidArgument: Invalidation paths start with /; optional single wildcard must be last; CallerReference required');
            const old=(c.invalidations||[]).find(i=>i.InvalidationBatch.CallerReference===batch.CallerReference);if(old){if(JSON.stringify(old.InvalidationBatch.Paths)!==JSON.stringify(batch.Paths))throw Error('InvalidationBatchAlreadyExists: CallerReference reused with different paths');return resultJson({Invalidation:clone(old)});}
            const seq=(sim.account.cdnInvalidationCounter||0)+1,i={Id:'I'+String(seq).padStart(6,'0'),Status:'InProgress',CreateTime:'2026-01-01T00:00:00Z',InvalidationBatch:clone(batch)};sim.account.cdnInvalidationCounter=seq;(c.invalidations||(c.invalidations=[])).push(i);return resultJson({Invalidation:clone(i)});
          }
          if(op==='get-invalidation'){const c=getDist('distribution-id');return resultJson({Invalidation:clone(getInvalid(c))});}
          if(op==='list-invalidations'){const c=getDist('distribution-id');return resultJson({InvalidationList:{Quantity:(c.invalidations||[]).length,Items:clone(c.invalidations||[])}});}
          if(op==='wait'){
            if(toks[3]==='distribution-deployed'){const c=getDist();c.status='Deployed';c.deployedConfig=clone(config(c));return print('ok','');}
            if(toks[3]==='invalidation-completed'){const c=getDist('distribution-id'),i=getInvalid(c);i.Status='Completed';const paths=i.InvalidationBatch.Paths.Items;c.edgeCache=(c.edgeCache||[]).filter(e=>!paths.some(p=>p===e.path||p.endsWith('*')&&e.path.startsWith(p.slice(0,-1))));return print('ok','');}
            throw Error('aws: error: supported waiters: distribution-deployed, invalidation-completed');
          }
          throw Error(`aws: error: unknown CloudFront operation '${op}'`);
        } catch(e){return print('err',e.message);}
      }

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
            LoadBalancerName: l.name, Type: l.type, Scheme: l.scheme, DNSName: l.dns, CanonicalHostedZoneId: l.canonicalHostedZoneId,
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

      /* SQS/SNS teaching subset: real identities/flags, virtual time, actual delivery state.
         No wire checksum, stochastic duplicate scheduling, network/IAM/KMS runtime or retry timer simulation. */
      case 'sqs':
      case 'sns': {
        const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),clone=v=>JSON.parse(JSON.stringify(v));
        const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k),bad=m=>{throw Error('InvalidParameterValue: '+m);};
        const required=n=>{const v=flag(n);if(v===null)throw Error('aws: error: the following arguments are required: --'+n);return v;};
        const text=n=>{let v=required(n);if(v.startsWith('file://')){const f=own(sim.files,v.slice(7))&&sim.files[v.slice(7)];if(!f||typeof f.content!=='string')throw Error('Error parsing parameter --'+n+': Unable to load paramfile; use ls/cat');v=f.content;}return v;};
        const json=(raw,label)=>{try{return JSON.parse(raw);}catch(e){throw Error('Error parsing parameter '+label+': Invalid JSON');}};
        const doc=n=>{const raw=text(n);if(!raw.startsWith('{')&&!raw.startsWith('[')&&raw.includes('=')){const pairs=raw.split(',').map(p=>p.match(/^([A-Za-z][A-Za-z0-9]*)=([^,]*)$/));if(pairs.some(p=>!p))bad('Invalid shorthand; use a JSON object/file for nested attributes');return Object.fromEntries(pairs.map(p=>[p[1],p[2]]));}return json(raw,'--'+n);};
        const map=n=>{const v=doc(n);if(!object(v)||Object.values(v).some(x=>typeof x!=='string'))bad('--'+n+' must be a JSON string map');return v;};
        const integer=(v,lo,hi,label)=>{if(typeof v!=='string'||!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<lo||Number(v)>hi)bad(label+' must be integer '+lo+'..'+hi);return Number(v);};
        const boolean=(v,label)=>{if(!['true','false'].includes(v))bad(label+' must be string true/false');return v==='true';};
        const bytes=v=>{let size=0;for(const c of v){const p=c.codePointAt(0);if(p>=0xd800&&p<=0xdfff)bad('Invalid Unicode surrogate');size+=p<128?1:p<2048?2:p<65536?3:4;}return size;};
        const now=()=>Date.parse(sim.account.now||'2026-10-26T00:00:00Z')+(sim.account.messagingClock||0)*1000;
        const next=kind=>kind+'-'+String(sim.account.messagingSeq=(sim.account.messagingSeq||0)+1).padStart(6,'0');
        const account=sim.account.callerIdentity?.Account||'123456789012',region=sim.account.region||'us-east-1';
        const qdefaults={VisibilityTimeout:'30',ReceiveMessageWaitTimeSeconds:'0',MessageRetentionPeriod:'345600',DelaySeconds:'0',MaximumMessageSize:'1048576'};
        function normalize(q){q.messages=q.messages||[];q.attributes={...qdefaults,...(q.policy?{Policy:JSON.stringify(q.policy)}:{}),...(q.isFifo?{FifoQueue:'true'}:{}),VisibilityTimeout:String(q.visibilityTimeout??30),...q.attributes};q.visibilityTimeout=Number(q.attributes.VisibilityTimeout);q.queueId=q.queueId||'seed:'+q.arn;q.created=q.created??now();q.revision=q.revision||0;q.dedup=q.dedup||[];for(const m of q.messages){m.sentAt=m.sentAt??now();m.visibleAt=m.visibleAt??m.sentAt;m.receiveCount=m.receiveCount||0;}return q;}
        const queues=()=>list('queues').map(normalize);
        const queue=()=>{const url=required('queue-url'),q=queues().find(q=>q.url===url);if(!q)throw Error('QueueDoesNotExist: The specified queue does not exist; use get-queue-url and the full QueueUrl');return q;};
        const topic=()=>{const arn=required('topic-arn'),t=list('topics').find(t=>t.arn===arn);if(!t)throw Error('NotFound: Topic does not exist; use the full TopicArn');t.subscriptions=t.subscriptions||[];t.attributes=t.attributes||{};t.dedup=t.dedup||[];return t;};
        function policy(raw){const p=json(raw,'Policy');if(!object(p)||!Array.isArray(p.Statement)||!p.Statement.length)bad('Policy needs a Statement array');for(const s of p.Statement){if(!object(s)||!['Allow','Deny'].includes(s.Effect)||!s.Action||!s.Resource||!s.Principal)bad('Policy statement requires Effect/Action/Resource/Principal');if(Object.keys(s).some(k=>!['Sid','Effect','Action','Resource','Principal','Condition'].includes(k)))bad('Simulator policy subset: no NotAction/NotPrincipal or other unsupported fields');if(arr(s.Action).some(x=>typeof x!=='string')||arr(s.Resource).some(x=>typeof x!=='string'))bad('Policy Action/Resource must be strings');if(s.Principal!=='*'&&(!object(s.Principal)||Object.keys(s.Principal).some(k=>!['Service','AWS'].includes(k))||Object.values(s.Principal).some(v=>arr(v).some(x=>typeof x!=='string'))))bad('Simulator policy subset supports Service/AWS principal strings');if(s.Condition&&(!object(s.Condition)||Object.entries(s.Condition).some(([k,v])=>!['ArnEquals','ArnLike','StringEquals','StringLike'].includes(k)||!object(v)||Object.entries(v).some(([key,val])=>!['aws:sourcearn','aws:sourceaccount'].includes(key.toLowerCase())||arr(val).some(x=>typeof x!=='string')))))bad('Simulator policy conditions: SourceArn/SourceAccount equality or wildcard only');}return p;}
        const policyMatch=(pattern,value)=>typeof pattern==='string'&&new RegExp('^'+pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$').test(value);
        function allowed(q,t){let allow=false,deny=false;for(const s of (q.policy?.Statement||[])){const principal=s.Principal==='*'||arr(s.Principal?.Service).includes('sns.amazonaws.com');if(!principal||!arr(s.Action).some(a=>wild(a,'sqs:SendMessage'))||!arr(s.Resource).some(a=>policyMatch(a,q.arn)))continue;let cond=true;for(const [op,c] of Object.entries(s.Condition||{}))for(const [key,values] of Object.entries(c)){const actual=key.toLowerCase()==='aws:sourcearn'?t.arn:account;cond=cond&&arr(values).some(v=>op.endsWith('Like')?policyMatch(v,actual):v===actual);}if(cond){if(s.Effect==='Deny')deny=true;else allow=true;}}return allow&&!deny;}
        function validateQueue(attrs,q){const out={...qdefaults,...q?.attributes,...attrs};for(const [k,v] of Object.entries(attrs)){if(!own(qdefaults,k)&&!['FifoQueue','ContentBasedDeduplication','DeduplicationScope','FifoThroughputLimit','RedrivePolicy','RedriveAllowPolicy','Policy'].includes(k))bad('Unsupported queue attribute '+k+' in this simulator');if(typeof v!=='string')bad('Queue attribute '+k+' must be string');}
          integer(out.VisibilityTimeout,0,43200,'VisibilityTimeout');integer(out.ReceiveMessageWaitTimeSeconds,0,20,'ReceiveMessageWaitTimeSeconds');integer(out.MessageRetentionPeriod,60,1209600,'MessageRetentionPeriod');integer(out.DelaySeconds,0,900,'DelaySeconds');integer(out.MaximumMessageSize,1024,1048576,'MaximumMessageSize');
          if(out.FifoQueue!==undefined)boolean(out.FifoQueue,'FifoQueue');const fifo=out.FifoQueue==='true';if(q&&fifo!==q.isFifo)bad('FifoQueue cannot change; create a new queue');if(out.ContentBasedDeduplication!==undefined){boolean(out.ContentBasedDeduplication,'ContentBasedDeduplication');if(!fifo)bad('ContentBasedDeduplication is FIFO-only');}
          if(out.DeduplicationScope!==undefined&&(!fifo||!['queue','messageGroup'].includes(out.DeduplicationScope)))bad('FIFO DeduplicationScope must be queue/messageGroup');if(out.FifoThroughputLimit!==undefined&&(!fifo||!['perQueue','perMessageGroupId'].includes(out.FifoThroughputLimit)))bad('FIFO FifoThroughputLimit invalid');if(out.FifoThroughputLimit==='perMessageGroupId'&&out.DeduplicationScope!=='messageGroup')bad('perMessageGroupId throughput requires messageGroup dedup scope');
          if(out.Policy)policy(out.Policy);
          if(out.RedriveAllowPolicy){const r=json(out.RedriveAllowPolicy,'RedriveAllowPolicy');if(!object(r)||!['allowAll','denyAll','byQueue'].includes(r.redrivePermission)||Object.keys(r).some(k=>!['redrivePermission','sourceQueueArns'].includes(k)))bad('Invalid RedriveAllowPolicy');if(r.redrivePermission==='byQueue'&&(!Array.isArray(r.sourceQueueArns)||!r.sourceQueueArns.length||r.sourceQueueArns.length>10||r.sourceQueueArns.some(a=>typeof a!=='string'||!a.startsWith(`arn:aws:sqs:${region}:${account}:`))))bad('byQueue needs1..10 same Region/account queue ARNs');}
          if(out.RedrivePolicy){const r=json(out.RedrivePolicy,'RedrivePolicy');if(!object(r)||Object.keys(r).some(k=>!['deadLetterTargetArn','maxReceiveCount'].includes(k)))bad('RedrivePolicy needs deadLetterTargetArn/maxReceiveCount');integer(String(r.maxReceiveCount),1,1000,'maxReceiveCount');const d=queues().find(d=>d.arn===r.deadLetterTargetArn);if(!d||d===q||d.isFifo!==fifo||!d.arn.startsWith(`arn:aws:sqs:${region}:${account}:`))bad('DLQ must exist, differ from source and match Region/account/queue type');const permit=d.attributes.RedriveAllowPolicy&&json(d.attributes.RedriveAllowPolicy,'RedriveAllowPolicy');if(permit&&(permit.redrivePermission==='denyAll'||permit.redrivePermission==='byQueue'&&!permit.sourceQueueArns.includes(q?.arn)))bad('DLQ RedriveAllowPolicy denies this source');}
          return out;
        }
        function applyQueue(q,attrs){q.attributes=attrs;q.visibilityTimeout=Number(attrs.VisibilityTimeout);q.isFifo=attrs.FifoQueue==='true';q.policy=attrs.Policy?policy(attrs.Policy):undefined;q.revision++;}
        function sweep(q){q.messages=q.messages.filter(m=>now()-m.sentAt<Number(q.attributes.MessageRetentionPeriod)*1000);q.dedup=q.dedup.filter(d=>now()-d.at<300000);}
        function attributes(raw){if(!object(raw))bad('MessageAttributes must be an object');for(const [k,v] of Object.entries(raw)){if(!/^[A-Za-z0-9_.-]{1,256}$/.test(k)||!object(v)||!['String','String.Array','Number'].includes(v.DataType)||typeof v.StringValue!=='string'||Object.keys(v).some(k=>!['DataType','StringValue'].includes(k)))bad('Simulator message attributes support named String/String.Array/Number values');if(v.DataType==='Number'&&!Number.isFinite(Number(v.StringValue)))bad('Number attribute invalid');if(v.DataType==='String.Array'&&!Array.isArray(json(v.StringValue,k)))bad('String.Array attribute requires JSON array');}return clone(raw);}
        const messageBytes=(body,attrs)=>bytes(body)+Object.entries(attrs).reduce((n,[k,v])=>n+bytes(k)+bytes(v.DataType)+bytes(v.StringValue),0);
        function dedup(entity,body,group,id,scope){entity.dedup=(entity.dedup||[]).filter(d=>now()-d.at<300000);const token=id===null?'body:'+body:'id:'+id,key=scope==='messageGroup'?group:null,prior=entity.dedup.find(d=>d.token===token&&d.group===key);if(prior)return prior;const record={token,group:key,at:now(),id:next('message'),sequence:String(sim.account.messagingSeq)};return record;}
        function enqueue(q,body,attrs,group,id,delay,provenance){sweep(q);let d;if(q.isFifo){d=dedup(q,body,group,id,q.attributes.DeduplicationScope);if(q.dedup.includes(d))return {messageId:d.id,sequenceNumber:d.sequence,deduplicated:true};q.dedup.push(d);}const m={messageId:d?.id||next('message'),body,messageAttributes:clone(attrs),groupId:group||undefined,deduplicationId:id??undefined,sequenceNumber:d?.sequence,sentAt:now(),visibleAt:now()+delay*1000,receiveCount:0,provenance:provenance?clone(provenance):undefined};q.messages.push(m);return m;}
        function filter(raw){const f=json(raw,'FilterPolicy');if(!object(f)||Object.keys(f).length>5)bad('FilterPolicy must be object with at most5 top-level keys');let combos=1;for(const v of Object.values(f)){if(!Array.isArray(v)||!v.length||v.some(x=>x!==null&&!['string','number','boolean'].includes(typeof x)))bad('Simulator filters support top-level scalar equality lists only; AWS also supports nested/operator filters');combos*=v.length;}if(combos>150)bad('FilterPolicy combination limit150 exceeded');return f;}
        function subscriptionAttrs(attrs,existing={}){const a={RawMessageDelivery:'false',FilterPolicyScope:'MessageAttributes',...existing,...attrs};for(const k of Object.keys(attrs))if(!['RawMessageDelivery','FilterPolicyScope','FilterPolicy'].includes(k))bad('Unsupported subscription attribute '+k+' in simulator');boolean(a.RawMessageDelivery,'RawMessageDelivery');if(!['MessageBody','MessageAttributes'].includes(a.FilterPolicyScope))bad('FilterPolicyScope must be MessageBody/MessageAttributes');if(a.FilterPolicy)filter(a.FilterPolicy);return a;}
        function topicAttrs(attrs,existing={}){const a={MaximumMessageSize:'262144',...existing,...attrs};for(const k of Object.keys(attrs))if(!['FifoTopic','ContentBasedDeduplication','FifoThroughputScope','DisplayName','MaximumMessageSize'].includes(k))bad('Unsupported topic attribute '+k+' in simulator');for(const k of ['FifoTopic','ContentBasedDeduplication'])if(a[k]!==undefined)boolean(a[k],k);if(a.ContentBasedDeduplication!==undefined&&a.FifoTopic!=='true')bad('ContentBasedDeduplication needs FIFO topic');if(a.FifoThroughputScope!==undefined&&(a.FifoTopic!=='true'||!['Topic','MessageGroup'].includes(a.FifoThroughputScope)))bad('FIFO throughput scope invalid');integer(a.MaximumMessageSize,1024,1048576,'MaximumMessageSize');return a;}
        function matches(sub,body,attrs){const a=sub.attributes||{},f=a.FilterPolicy?filter(a.FilterPolicy):{};if(!Object.keys(f).length)return true;let v;if(a.FilterPolicyScope==='MessageBody'){try{v=JSON.parse(body);}catch(e){return false;}if(!object(v))return false;}else{v={};for(const [k,a] of Object.entries(attrs)){const value=a.DataType==='Number'?Number(a.StringValue):a.DataType==='String.Array'?json(a.StringValue,k):a.StringValue;Object.defineProperty(v,k,{value,enumerable:true});}}return Object.entries(f).every(([k,values])=>own(v,k)&&arr(v[k]).some(x=>values.some(y=>x===y)));}
        function moveToDlq(q,m){if(!q.attributes.RedrivePolicy)return false;const r=json(q.attributes.RedrivePolicy,'RedrivePolicy');if(m.receiveCount<Number(r.maxReceiveCount))return false;const d=queues().find(d=>d.arn===r.deadLetterTargetArn);if(!d)return false;const permit=d.attributes.RedriveAllowPolicy&&json(d.attributes.RedriveAllowPolicy,'RedriveAllowPolicy');if(permit&&(permit.redrivePermission==='denyAll'||permit.redrivePermission==='byQueue'&&!permit.sourceQueueArns.includes(q.arn)))return false;q.messages.splice(q.messages.indexOf(m),1);m.deadLetterSourceArn=q.arn;m.deadLetterSourceId=q.queueId;m.visibleAt=now();m.receiptHandle=undefined;if(q.isFifo)m.sentAt=now();d.messages.push(m);return true;}
        try {
          if(service==='sqs'){
            if(op==='create-queue'){
              const name=required('queue-name'),raw=flag('attributes')===null?{}:map('attributes');if(!/^[A-Za-z0-9_-]{1,80}(\.fifo)?$/.test(name)||name.length>80)bad('Queue name must contain1..80 letters/numbers/hyphen/underscore and optional .fifo suffix');const attrs=validateQueue(raw,{arn:`arn:aws:sqs:${region}:${account}:${name}`,isFifo:raw.FifoQueue==='true'});if(name.endsWith('.fifo')!==(attrs.FifoQueue==='true'))bad('.fifo suffix and FifoQueue=true must both be specified');const existing=queues().find(q=>q.name===name);if(existing){if(Object.entries(raw).some(([k,v])=>existing.attributes[k]!==v))throw Error('QueueNameExists: Existing queue has different requested attributes');return resultJson({QueueUrl:existing.url});}
              const q={name,url:`https://sqs.${region}.amazonaws.com/${account}/${name}`,arn:`arn:aws:sqs:${region}:${account}:${name}`,queueId:next('queue'),messages:[],dedup:[],created:now(),revision:0};applyQueue(q,attrs);list('queues').push(q);return resultJson({QueueUrl:q.url});
            }
            if(op==='list-queues')return resultJson({QueueUrls:queues().filter(q=>q.name.startsWith(flag('queue-name-prefix')||'')).map(q=>q.url)});
            if(op==='get-queue-url'){const name=required('queue-name'),q=queues().find(q=>q.name===name);if(!q||flag('queue-owner-aws-account-id')&&flag('queue-owner-aws-account-id')!==account)throw Error('QueueDoesNotExist: The specified queue does not exist');return resultJson({QueueUrl:q.url});}
            if(!['get-queue-attributes','set-queue-attributes','send-message','receive-message','delete-message','change-message-visibility','purge-queue','delete-queue'].includes(op))return print('err','Simulator scope: unsupported SQS operation '+op+'; help lists implemented operations');
            const q=queue();
            if(op==='set-queue-attributes'){const raw=map('attributes'),attrs=validateQueue(raw,q);applyQueue(q,attrs);return print('ok','');}
            if(op==='get-queue-attributes'){
              const names=flags('attribute-names'),known={...q.attributes,QueueArn:q.arn,CreatedTimestamp:String(Math.floor(q.created/1000)),ApproximateNumberOfMessages:String(q.messages.filter(m=>m.visibleAt<=now()&&now()-m.sentAt<Number(q.attributes.MessageRetentionPeriod)*1000).length),ApproximateNumberOfMessagesNotVisible:String(q.messages.filter(m=>m.receiveCount>0&&m.visibleAt>now()).length),ApproximateNumberOfMessagesDelayed:String(q.messages.filter(m=>!m.receiveCount&&m.visibleAt>now()).length)};
              if(names.some(n=>n!=='All'&&!own(known,n)&&!['Policy','RedrivePolicy','RedriveAllowPolicy'].includes(n)))bad('Invalid queue attribute name');return resultJson({Attributes:names.includes('All')?known:Object.fromEntries(names.filter(n=>own(known,n)).map(n=>[n,known[n]]))});
            }
            if(op==='delete-queue'){list('queues').splice(list('queues').indexOf(q),1);return print('ok','');}
            if(op==='purge-queue'){q.messages=[];q.revision++;return print('ok','');}
            if(op==='send-message'){
              const body=text('message-body'),attrs=flag('message-attributes')===null?{}:attributes(doc('message-attributes')),group=flag('message-group-id'),id=flag('message-deduplication-id'),delay=flag('delay-seconds')===null?Number(q.attributes.DelaySeconds):integer(flag('delay-seconds'),0,900,'DelaySeconds');
              if(!body||messageBytes(body,attrs)>Number(q.attributes.MaximumMessageSize)||Object.keys(attrs).length>10)bad('Message must be nonempty and fit queue size/10-attribute limit');for(const c of body){const p=c.codePointAt(0);if(p<32&&![9,10,13].includes(p)||p===0xfffe||p===0xffff)bad('InvalidMessageContents: body contains disallowed Unicode');}
              for(const [v,label] of [[group,'MessageGroupId'],[id,'MessageDeduplicationId']])if(v!==null&&(!v.length||bytes(v)>128||/[^\x21-\x7e]/.test(v)))bad(label+' must be1..128 printable non-space ASCII characters');
              if(q.isFifo){if(!group||id===null&&q.attributes.ContentBasedDeduplication!=='true')bad('FIFO requires MessageGroupId plus deduplication ID or ContentBasedDeduplication');if(flag('delay-seconds')!==null)bad('Per-message DelaySeconds is unsupported for FIFO; set queue DelaySeconds');}else if(id!==null)bad('MessageDeduplicationId is FIFO-only; Standard MessageGroupId enables fair queues');
              const m=enqueue(q,body,attrs,group,id,delay);return resultJson({MessageId:m.messageId,...(q.isFifo?{SequenceNumber:m.sequenceNumber}:{})});
            }
            if(op==='receive-message'){
              const maximum=flag('max-number-of-messages')===null?1:integer(flag('max-number-of-messages'),1,10,'MaxNumberOfMessages'),visibility=flag('visibility-timeout')===null?q.visibilityTimeout:integer(flag('visibility-timeout'),0,43200,'VisibilityTimeout');if(flag('wait-time-seconds')!==null)integer(flag('wait-time-seconds'),0,20,'WaitTimeSeconds');
              sweep(q);const blocked=new Set(q.isFifo?q.messages.filter(m=>m.visibleAt>now()&&m.receiveCount>0).map(m=>m.groupId):[]),selected=[];let total=0;
              for(const m of q.messages.slice()){if(selected.length>=maximum)break;if(m.visibleAt>now()||q.isFifo&&blocked.has(m.groupId))continue;if(moveToDlq(q,m))continue;if(total+messageBytes(m.body,m.messageAttributes||{})>1048576)break;total+=messageBytes(m.body,m.messageAttributes||{});m.receiveCount++;m.receivedAt=now();m.firstReceiveAt=m.firstReceiveAt??now();m.receiptHandle=next('receipt');m.visibleAt=now()+visibility*1000;selected.push(m);}
              const sysNames=[...flags('message-system-attribute-names'),...flags('attribute-names')],attrNames=flags('message-attribute-names');const rows=selected.map(m=>{const attrs={ApproximateReceiveCount:String(m.receiveCount),SentTimestamp:String(m.sentAt),ApproximateFirstReceiveTimestamp:String(m.firstReceiveAt),...(m.groupId?{MessageGroupId:m.groupId}:{}),...(m.sequenceNumber?{SequenceNumber:m.sequenceNumber}:{}),...(m.deduplicationId?{MessageDeduplicationId:m.deduplicationId}:{}),...(m.deadLetterSourceArn?{DeadLetterQueueSourceArn:m.deadLetterSourceArn}:{})};return {MessageId:m.messageId,ReceiptHandle:m.receiptHandle,Body:m.body,...(sysNames.length?{Attributes:Object.fromEntries(Object.entries(attrs).filter(([k])=>sysNames.includes('All')||sysNames.includes(k)))}:{}),...(attrNames.length?{MessageAttributes:Object.fromEntries(Object.entries(m.messageAttributes||{}).filter(([k])=>attrNames.includes('All')||attrNames.includes('.*')||attrNames.includes(k)))}:{})};});
              if(resultJson(rows.length?{Messages:rows}:{} )&&flag('query')===null){sim.account.messagingReads=sim.account.messagingReads||[];sim.account.messagingReads=sim.account.messagingReads.filter(r=>r.queueId!==q.queueId);sim.account.messagingReads.push({queueId:q.queueId,revision:q.revision,at:now(),messages:clone(rows)});}return;
            }
            const receipt=required('receipt-handle'),m=q.messages.find(m=>m.receiptHandle===receipt&&m.receiveCount>0&&m.visibleAt>now());if(!m)throw Error('ReceiptHandleIsInvalid: Use the latest unexpired receipt from this queue; receive again after visibility expiry');
            if(op==='change-message-visibility'){const seconds=integer(required('visibility-timeout'),0,43200,'VisibilityTimeout');if(now()+seconds*1000>m.receivedAt+43200000)bad('Visibility cannot exceed12hours from initial receive in this teaching subset');m.visibleAt=now()+seconds*1000;return print('ok','');}
            q.messages.splice(q.messages.indexOf(m),1);return print('ok','');
          }
          if(op==='create-topic'){
            const name=required('name'),attrs=topicAttrs(flag('attributes')===null?{}:map('attributes'));if(!/^[A-Za-z0-9_-]+(\.fifo)?$/.test(name)||name.length>256||name.endsWith('.fifo')!==(attrs.FifoTopic==='true'))bad('Topic name and FifoTopic=true/.fifo suffix must agree');const old=list('topics').find(t=>t.name===name);if(old)return resultJson({TopicArn:old.arn});const t={name,arn:`arn:aws:sns:${region}:${account}:${name}`,topicId:next('topic'),attributes:attrs,subscriptions:[],dedup:[]};list('topics').push(t);return resultJson({TopicArn:t.arn});
          }
          if(op==='list-topics')return resultJson({Topics:list('topics').map(t=>({TopicArn:t.arn}))});
          if(op==='list-subscriptions')return resultJson({Subscriptions:list('topics').flatMap(t=>(t.subscriptions||[]).map(s=>({SubscriptionArn:s.subscriptionArn,TopicArn:t.arn,Protocol:s.protocol,Endpoint:s.endpoint})))});
          if(['unsubscribe','get-subscription-attributes','set-subscription-attributes'].includes(op)){
            const arn=required('subscription-arn'),t=list('topics').find(t=>(t.subscriptions||[]).some(s=>s.subscriptionArn===arn)),s=t&&t.subscriptions.find(s=>s.subscriptionArn===arn);if(!s)throw Error('NotFound: Subscription does not exist');
            if(op==='unsubscribe'){t.subscriptions.splice(t.subscriptions.indexOf(s),1);return print('ok','');}
            if(op==='set-subscription-attributes'){const a=subscriptionAttrs({[required('attribute-name')]:required('attribute-value')},s.attributes);s.attributes=a;s.revision=(s.revision||0)+1;return print('ok','');}
            return resultJson({Attributes:{...s.attributes,SubscriptionArn:s.subscriptionArn,TopicArn:t.arn,Protocol:s.protocol,Endpoint:s.endpoint,PendingConfirmation:String(!s.confirmed)}});
          }
          if(!['subscribe','list-subscriptions-by-topic','get-topic-attributes','set-topic-attributes','delete-topic','publish'].includes(op))return print('err','Simulator scope: unsupported SNS operation '+op+'; help lists implemented operations');
          const t=topic();
          if(op==='get-topic-attributes')return resultJson({Attributes:{MaximumMessageSize:'262144',...t.attributes,TopicArn:t.arn,SubscriptionsConfirmed:String(t.subscriptions.filter(s=>s.confirmed).length)}});
          if(op==='set-topic-attributes'){const key=required('attribute-name'),val=required('attribute-value');if(key==='FifoTopic')bad('FifoTopic cannot change after creation');if(key==='FifoThroughputScope'&&t.attributes.FifoThroughputScope==='MessageGroup'&&val==='Topic')bad('MessageGroup throughput scope cannot be reverted to Topic');const a=topicAttrs({[key]:val},t.attributes);if(Number(a.MaximumMessageSize)>262144&&(t.subscriptions.length>100||t.subscriptions.some(s=>!['sqs','lambda','firehose'].includes(s.protocol))))bad('Large-message topic supports at most100 SQS/Lambda/Firehose subscriptions');t.attributes=a;return print('ok','');}
          if(op==='delete-topic'){list('topics').splice(list('topics').indexOf(t),1);return print('ok','');}
          if(op==='list-subscriptions-by-topic')return resultJson({Subscriptions:t.subscriptions.map(s=>({SubscriptionArn:s.subscriptionArn,TopicArn:t.arn,Protocol:s.protocol,Endpoint:s.endpoint}))});
          if(op==='subscribe'){
            const protocol=required('protocol'),endpoint=required('notification-endpoint'),attrs=subscriptionAttrs(flag('attributes')===null?{}:map('attributes'));if(protocol!=='sqs')bad('Simulator supports confirmed same-account SQS subscriptions only; other real SNS protocols need their own confirmation/delivery model');const q=queues().find(q=>q.arn===endpoint);if(!q)bad('SQS endpoint must be an existing full queue ARN');if(q.isFifo&&t.attributes.FifoTopic!=='true')bad('FIFO queue requires FIFO SNS topic');if(Number(t.attributes.MaximumMessageSize)>262144&&t.subscriptions.length>=100)bad('Large-message topic subscription limit100');const old=t.subscriptions.find(s=>s.protocol===protocol&&s.endpoint===endpoint);if(old)return resultJson({SubscriptionArn:old.subscriptionArn});const s={subscriptionArn:t.arn+':'+next('subscription'),protocol,endpoint,confirmed:true,attributes:attrs,revision:1};t.subscriptions.push(s);return resultJson({SubscriptionArn:s.subscriptionArn});
          }
          const body=text('message'),attrs=flag('message-attributes')===null?{}:attributes(doc('message-attributes')),group=flag('message-group-id'),id=flag('message-deduplication-id');if(!body||messageBytes(body,attrs)>Number(t.attributes.MaximumMessageSize||262144))bad('Message exceeds configured SNS MaximumMessageSize or is empty');if(flag('subject')!==null&&(bytes(flag('subject'))>=100||/[\r\n]/.test(flag('subject'))))bad('Subject must be under100 characters without newlines');for(const v of [group,id])if(v!==null&&(!v.length||bytes(v)>128||/[^\x21-\x7e]/.test(v)))bad('Group/dedup IDs must be1..128 printable non-space ASCII characters');
          let d;if(t.attributes.FifoTopic==='true'){if(!group||id===null&&t.attributes.ContentBasedDeduplication!=='true')bad('FIFO topic requires MessageGroupId and dedup ID or content-based dedup');d=dedup(t,body,group,id,t.attributes.FifoThroughputScope==='MessageGroup'?'messageGroup':'queue');if(t.dedup.includes(d))return resultJson({MessageId:d.id,SequenceNumber:d.sequence});}else if(id!==null)bad('MessageDeduplicationId is FIFO-only');
          const messageId=d?.id||next('publish');if(d)t.dedup.push(d);sim.account.snsDeliveries=sim.account.snsDeliveries||[];
          for(const s of t.subscriptions){if(s.protocol!=='sqs'||!s.confirmed)continue;const q=queues().find(q=>q.arn===s.endpoint);let status='delivered';if(!matches(s,body,attrs))status='filtered';else if(!q)status='missing-queue';else if(!allowed(q,t))status='denied-policy';else if(s.attributes?.RawMessageDelivery==='true'&&Object.keys(attrs).length>10)status='raw-attribute-limit';
            let m;if(status==='delivered'){const raw=s.attributes?.RawMessageDelivery==='true',payload=raw?body:JSON.stringify({Type:'Notification',MessageId:messageId,TopicArn:t.arn,Message:body,Timestamp:new Date(now()).toISOString(),...(flag('subject')!==null?{Subject:flag('subject')}:{})});if(bytes(payload)>Number(q.attributes.MaximumMessageSize))status='queue-payload-limit';else m=enqueue(q,payload,raw?attrs:{},group,id,Number(q.attributes.DelaySeconds),{topicArn:t.arn,topicId:t.topicId,subscriptionArn:s.subscriptionArn,publicationId:messageId});}
            sim.account.snsDeliveries.push({publicationId:messageId,topicArn:t.arn,queueId:q?.queueId,subscriptionArn:s.subscriptionArn,status,messageId:m?.messageId});print('sys',`Teaching delivery observation: ${s.endpoint} → ${status}. Publish acceptance is separate; real SNS uses delivery metrics/logs/subscription DLQ.`);
          }
          return resultJson({MessageId:messageId,...(d?{SequenceNumber:d.sequence}:{})});
        } catch(e){return print('err',e.message);}
      }

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
      case 'efs': {
        const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),clone=x=>JSON.parse(JSON.stringify(x));
        const required=n=>{const v=flag(n);if(!v)throw Error(`aws: error: the following arguments are required: --${n}`);return v;};
        const read=n=>{let v=required(n);if(v.startsWith('file://')){const f=Object.prototype.hasOwnProperty.call(sim.files,v.slice(7))&&sim.files[v.slice(7)];if(!f||typeof f.content!=='string')throw Error(`Error parsing parameter --${n}: Unable to load paramfile; use ls/cat`);v=f.content;}try{return JSON.parse(v);}catch(e){
          let m;if(n==='posix-user'&&(m=v.match(/^Uid=(\d+),Gid=(\d+)$/)))return {Uid:Number(m[1]),Gid:Number(m[2])};
          if(n==='root-directory'&&(m=v.match(/^Path=(\/[^,]*),CreationInfo=\{OwnerUid=(\d+),OwnerGid=(\d+),Permissions=([0-7]{3,4})\}$/)))return {Path:m[1],CreationInfo:{OwnerUid:Number(m[2]),OwnerGid:Number(m[3]),Permissions:m[4]}};
          throw Error(`Error parsing parameter --${n}: Use valid JSON/file; simulator supports the documented Uid/Gid and root-directory shorthand examples`);
        }};
        const fs=n=>{const id=n||required('file-system-id'),f=list('fileSystems').find(f=>f.id===id);if(!f)throw Error(`FileSystemNotFound: ${id}`);return f;};
        const mt=()=>{const id=required('mount-target-id'),m=list('mountTargets').find(m=>m.id===id);if(!m)throw Error(`MountTargetNotFound: ${id}`);return m;};
        const available=f=>{if(f.state!=='available')throw Error('IncorrectFileSystemLifeCycleState: Observe describe-file-systems until available');};
        const id=(prefix,rows)=>{let n=(sim.account.efsSequence||0)+1;while(rows.some(r=>r.id===prefix+String(n).padStart(9,'0')))n++;sim.account.efsSequence=n;return prefix+String(n).padStart(9,'0');};
        const advance=r=>{if(r.pollsRemaining>0&&--r.pollsRemaining===0){r.state='available';if(r.pendingThroughput){Object.assign(r,r.pendingThroughput);delete r.pendingThroughput;}}};
        const fileView=f=>({FileSystemId:f.id,CreationToken:f.creationToken,Name:f.name||'',LifeCycleState:f.state,PerformanceMode:f.performanceMode||'generalPurpose',ThroughputMode:f.throughputMode||'bursting',Encrypted:!!f.encrypted,SizeInBytes:{Value:f.sizeBytes||0},NumberOfMountTargets:list('mountTargets').filter(m=>m.fileSystemId===f.id).length,...(f.provisionedThroughputInMibps?{ProvisionedThroughputInMibps:f.provisionedThroughputInMibps}:{}),...(f.az?{AvailabilityZoneName:f.az}:{})});
        const mountView=m=>({MountTargetId:m.id,FileSystemId:m.fileSystemId,SubnetId:m.subnetId,AvailabilityZoneName:m.az,LifeCycleState:m.state,IpAddress:m.ip||'10.213.3.50',VpcId:m.vpcId});
        const accessView=a=>({AccessPointId:a.id,AccessPointArn:`arn:aws:elasticfilesystem:${sim.account.region||'us-east-1'}:123456789012:access-point/${a.id}`,FileSystemId:a.fileSystemId,ClientToken:a.clientToken,LifeCycleState:a.state,...(a.posixUser?{PosixUser:clone(a.posixUser)}:{}),RootDirectory:clone(a.rootDirectory)});
        const groups=vpc=>{const ids=flags('security-groups');if(!ids.length)throw Error('Simulator scope: explicitly supply --security-groups; real AWS otherwise uses the VPC default group');if(ids.length>5||new Set(ids).size!==ids.length)throw Error('BadRequest: Use one to five distinct security groups');for(const g of ids){const sg=list('securityGroups').find(s=>s.id===g);if(!sg)throw Error(`SecurityGroupNotFound: ${g}`);if(sg.vpcId!==vpc)throw Error('BadRequest: Security groups must belong to the mount target VPC');}return ids;};
        const throughput=(f,creating=false)=>{const mode=flag('throughput-mode')||(creating?'bursting':f.throughputMode),raw=flag('provisioned-throughput-in-mibps');if(!['elastic','bursting','provisioned'].includes(mode))throw Error('BadRequest: ThroughputMode must be elastic, bursting or provisioned');if(mode==='elastic'&&f.performanceMode==='maxIO')throw Error('BadRequest: Elastic throughput requires General Purpose performance mode');if(mode!=='elastic'&&(f.lifecyclePolicies||[]).some(p=>p.TransitionToArchive))throw Error('BadRequest: Remove Archive lifecycle before leaving Elastic throughput; review existing Archive data');let provisioned=mode==='provisioned'?Number(raw===null?f.provisionedThroughputInMibps:raw):undefined;if(mode==='provisioned'&&(!Number.isFinite(provisioned)||provisioned<1))throw Error('BadRequest: Provisioned throughput requires positive --provisioned-throughput-in-mibps');if(mode!=='provisioned'&&raw!==null)throw Error('BadRequest: ProvisionedThroughputInMibps only applies to provisioned mode');return {throughputMode:mode,provisionedThroughputInMibps:provisioned};};
        try {
          if(op==='describe-file-systems'){const fid=flag('file-system-id'),token=flag('creation-token');if(fid&&token)throw Error('BadRequest: Choose FileSystemId or CreationToken');const rows=fid?[fs(fid)]:list('fileSystems').filter(f=>!token||f.creationToken===token);rows.forEach(advance);return resultJson({FileSystems:rows.map(fileView)});}
          if(op==='create-file-system'){const token=required('creation-token');if(list('fileSystems').some(f=>f.creationToken===token))throw Error('FileSystemAlreadyExists: CreationToken already used; describe by creation-token');const perf=flag('performance-mode')||'generalPurpose';if(!['generalPurpose','maxIO'].includes(perf))throw Error('BadRequest: PerformanceMode must be generalPurpose or maxIO');if(toks.includes('--encrypted')&&toks.includes('--no-encrypted'))throw Error('BadRequest: Mutually exclusive encryption flags');const f={performanceMode:perf,az:flag('availability-zone-name')||undefined};if(f.az&&perf==='maxIO')throw Error('BadRequest: One Zone supports General Purpose only');const config=throughput(f,true);const fresh={...f,...config,id:id('fs-',list('fileSystems')),creationToken:token,encrypted:toks.includes('--encrypted'),sizeBytes:0,state:'creating',pollsRemaining:1};list('fileSystems').push(fresh);return resultJson(fileView(fresh));}
          if(op==='delete-file-system'){const f=fs();if(list('mountTargets').some(m=>m.fileSystemId===f.id)||list('accessPoints').some(a=>a.fileSystemId===f.id))throw Error('FileSystemInUse: Remove mount targets/access points before deleting file system');list('fileSystems').splice(list('fileSystems').indexOf(f),1);return print('ok','');}
          if(op==='update-file-system'){const f=fs();available(f);if(flag('throughput-mode')===null&&flag('provisioned-throughput-in-mibps')===null)throw Error('BadRequest: Provide throughput mode or provisioned capacity');const pending=throughput(f);f.pendingThroughput=pending;f.state='updating';f.pollsRemaining=1;return resultJson(fileView(f));}
          if(op==='describe-mount-targets'){const keys=['file-system-id','mount-target-id','access-point-id'].filter(k=>flag(k)!==null);if(keys.length!==1)throw Error('BadRequest: Specify exactly one FileSystemId, MountTargetId or AccessPointId');let rows;if(keys[0]==='mount-target-id')rows=[mt()];else {let fid=flag('file-system-id');if(!fid){const a=list('accessPoints').find(a=>a.id===flag('access-point-id'));if(!a)throw Error('AccessPointNotFound: Unknown access point');fid=a.fileSystemId;}fs(fid);rows=list('mountTargets').filter(m=>m.fileSystemId===fid);}rows.forEach(advance);return resultJson({MountTargets:rows.map(mountView)});}
          if(op==='create-mount-target'){const f=fs();available(f);const subnet=required('subnet-id'),s=list('subnets').find(s=>s.id===subnet);if(!s)throw Error(`SubnetNotFound: ${subnet}`);const rows=list('mountTargets').filter(m=>m.fileSystemId===f.id);if(rows.some(m=>m.az===s.az))throw Error('MountTargetConflict: A mount target already exists in this Availability Zone (one per AZ, not per subnet)');if(f.az&&f.az!==s.az)throw Error('BadRequest: One Zone mount target must use the file system Availability Zone');if(rows.some(m=>{const old=list('subnets').find(s=>s.id===m.subnetId);return old&&old.vpcId!==s.vpcId;}))throw Error('BadRequest: All mount targets for one file system must use one VPC');const sgIds=groups(s.vpcId);const m={id:id('fsmt-',list('mountTargets')),fileSystemId:f.id,subnetId:s.id,az:s.az,vpcId:s.vpcId,sgIds,state:'creating',pollsRemaining:1};list('mountTargets').push(m);return resultJson(mountView(m));}
          if(op==='delete-mount-target'){const m=mt();list('mountTargets').splice(list('mountTargets').indexOf(m),1);return print('ok','');}
          if(op==='describe-mount-target-security-groups'){const m=mt();return resultJson({SecurityGroups:m.sgIds||[]});}
          if(op==='modify-mount-target-security-groups'){const m=mt(),s=list('subnets').find(s=>s.id===m.subnetId);if(!s)throw Error('SubnetNotFound: Mount target subnet missing');const ids=groups(s.vpcId);m.sgIds=ids;return print('ok','');}
          if(op==='describe-lifecycle-configuration')return resultJson({LifecyclePolicies:clone(fs().lifecyclePolicies||[])});
          if(op==='put-lifecycle-configuration'){const f=fs();available(f);const rows=read('lifecycle-policies'),valid=['AFTER_1_DAY','AFTER_7_DAYS','AFTER_14_DAYS','AFTER_30_DAYS','AFTER_60_DAYS','AFTER_90_DAYS','AFTER_180_DAYS','AFTER_270_DAYS','AFTER_365_DAYS'],seen=new Set();if(!Array.isArray(rows)||rows.length>3)throw Error('BadRequest: LifecyclePolicies must be array of up to three separate transitions (empty clears configuration)');for(const r of rows){if(!object(r)||Object.keys(r).length!==1)throw Error('BadRequest: Each lifecycle policy must contain exactly one transition');const k=Object.keys(r)[0];if(!['TransitionToIA','TransitionToArchive','TransitionToPrimaryStorageClass'].includes(k)||seen.has(k)||(k==='TransitionToPrimaryStorageClass'?r[k]!=='AFTER_1_ACCESS':!valid.includes(r[k])))throw Error('BadRequest: Use distinct transition types and documented AFTER_* values');seen.add(k);}const ia=rows.find(r=>r.TransitionToIA),ar=rows.find(r=>r.TransitionToArchive);if(ar){if(f.throughputMode!=='elastic'||f.performanceMode!=='generalPurpose'||f.az)throw Error('BadRequest: Archive needs Regional, General Purpose, Elastic throughput');if(!ia||Number(ar.TransitionToArchive.split('_')[1])<=Number(ia.TransitionToIA.split('_')[1]))throw Error('BadRequest: Archive must be later than TransitionToIA');}f.lifecyclePolicies=clone(rows);return resultJson({LifecyclePolicies:clone(rows)});}
          if(op==='create-access-point') {
            const f=fs(); available(f);
            const token=flag('client-token');
            if(!token) throw Error('Simulator scope: supply --client-token for predictable replay; AWS CLI can generate a token');
            if(token.length>64) throw Error('BadRequest: ClientToken maximum64 characters');
            const user=flag('posix-user')===null?undefined:read('posix-user');
            const root=flag('root-directory')===null?{Path:'/'}:read('root-directory');
            const uint=x=>Number.isInteger(x)&&x>=0&&x<=4294967295;
            if(user!==undefined&&(!object(user)||Object.keys(user).some(k=>!['Uid','Gid','SecondaryGids'].includes(k))||!uint(user.Uid)||!uint(user.Gid)||user.SecondaryGids!==undefined&&(!Array.isArray(user.SecondaryGids)||user.SecondaryGids.some(g=>!uint(g)))))
              throw Error('BadRequest: PosixUser needs integer Uid/Gid (optional SecondaryGids array)');
            if(!object(root)||Object.keys(root).some(k=>!['Path','CreationInfo'].includes(k))||typeof root.Path!=='string'||!root.Path.startsWith('/')||root.Path.length>100)
              throw Error('BadRequest: RootDirectory needs an absolute path up to100 characters');
            const c=root.CreationInfo;
            if(c!==undefined&&(!object(c)||Object.keys(c).some(k=>!['OwnerUid','OwnerGid','Permissions'].includes(k))||!uint(c.OwnerUid)||!uint(c.OwnerGid)||typeof c.Permissions!=='string'||!/^0?[0-7]{3}$/.test(c.Permissions)))
              throw Error('BadRequest: CreationInfo needs OwnerUid, OwnerGid and octal Permissions');
            const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
            const equal=(x,y)=>JSON.stringify(canonical(x))===JSON.stringify(canonical(y));
            const existing=list('accessPoints').find(a=>a.clientToken===token);
            if(existing) {
              if(existing.fileSystemId!==f.id||!equal(existing.posixUser,user)||!equal(existing.rootDirectory,root))
                throw Error('AccessPointAlreadyExists: ClientToken is already associated with different configuration');
              return resultJson(accessView(existing));
            }
            const a={id:id('fsap-',list('accessPoints')),fileSystemId:f.id,clientToken:token,...(user!==undefined?{posixUser:clone(user)}:{}),rootDirectory:clone(root),state:'creating',pollsRemaining:1};
            list('accessPoints').push(a);
            return resultJson(accessView(a));
          }
          if(op==='describe-access-points'){if(flag('access-point-id')&&flag('file-system-id'))throw Error('BadRequest: Choose AccessPointId or FileSystemId');let rows;if(flag('access-point-id')){const a=list('accessPoints').find(a=>a.id===flag('access-point-id'));if(!a)throw Error('AccessPointNotFound: Unknown access point');rows=[a];}else {if(flag('file-system-id'))fs();rows=list('accessPoints').filter(a=>!flag('file-system-id')||a.fileSystemId===flag('file-system-id'));}rows.forEach(advance);return resultJson({AccessPoints:rows.map(accessView)});}
          if(op==='delete-access-point'){const aid=required('access-point-id'),a=list('accessPoints').find(a=>a.id===aid);if(!a)throw Error('AccessPointNotFound: '+aid);list('accessPoints').splice(list('accessPoints').indexOf(a),1);return print('ok','');}
          return print('err',`Unknown EFS operation: ${op}. Use help for supported API commands; EFS has no modeled CLI waiter, observe describe state.`);
        }catch(e){return print('err',e.message);}
      }

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

      /* EventBridge Classic / Scheduler / bounded Step Functions ASL model.
         Configuration, delivery acceptance and TEST business state are distinct proofs. */
      case 'events':
      case 'scheduler':
      case 'stepfunctions': {
        const clone=v=>JSON.parse(JSON.stringify(v)),object=v=>!!v&&typeof v==='object'&&!Array.isArray(v),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
        const bad=m=>{throw Error('ValidationException: '+m);},required=n=>{const v=flag(n);if(v===null)throw Error('aws: error: the following arguments are required: --'+n);return v;};
        const text=n=>{let v=required(n);if(v.startsWith('file://')){const f=own(sim.files,v.slice(7))&&sim.files[v.slice(7)];if(!f||typeof f.content!=='string')throw Error('Error parsing parameter --'+n+': Unable to load paramfile; use ls/cat');v=f.content;}return v;};
        const json=(s,label)=>{try{return JSON.parse(s);}catch(e){throw Error('Error parsing parameter '+label+': Invalid JSON');}},doc=n=>json(text(n),'--'+n);
        const integer=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)bad(label+' must be integer'+min+'..'+max);return v;};
        const bytes=s=>{let n=0;for(const c of s){const p=c.codePointAt(0);if(p>=0xd800&&p<=0xdfff)bad('Invalid Unicode surrogate');n+=p<128?1:p<2048?2:p<65536?3:4;}return n;};
        const account=sim.account.callerIdentity?.Account||'123456789012',region=sim.account.region||'us-east-1',clock=()=>new Date(Date.parse(sim.account.now||'2026-10-26T00:00:00Z')+(sim.account.messagingClock||0)*1000).toISOString();
        const next=prefix=>prefix+'-'+String(sim.account.workflowSeq=(sim.account.workflowSeq||0)+1).padStart(6,'0');
        const glob=(p,v)=>typeof p==='string'&&new RegExp('^'+p.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$').test(v);
        function policyAllows(policy,principal,action,resource,source){let allow=false,deny=false;let d=policy;if(typeof d==='string'){try{d=JSON.parse(d);}catch(e){return false;}}if(!object(d)||!Array.isArray(d.Statement))return false;
          for(const s of d.Statement){if(!object(s)||!['Allow','Deny'].includes(s.Effect))continue;const p=principal===null||s.Principal==='*'||arr(s.Principal?.Service).includes(principal)||arr(s.Principal?.AWS).includes('*');if(!p||!arr(s.Action).some(v=>wild(v,action))||!arr(s.Resource||'*').some(v=>glob(v,resource)))continue;let match=true;for(const [op,entries] of Object.entries(s.Condition||{})){if(!['ArnEquals','ArnLike','StringEquals','StringLike'].includes(op)||!object(entries)){match=false;continue;}for(const [key,values] of Object.entries(entries)){const value=key.toLowerCase()==='aws:sourcearn'?source:key.toLowerCase()==='aws:sourceaccount'?account:null;match=match&&value!==null&&arr(values).some(v=>op.endsWith('Like')?glob(v,value):v===value);}}if(match){if(s.Effect==='Deny')deny=true;else allow=true;}}
          return allow&&!deny;
        }
        function roleAllows(arn,principal,action,resource,source){const r=list('roles').find(r=>r.arn===arn||`arn:aws:iam::${account}:role/${r.name}`===arn);return !!r&&policyAllows(r.trustPolicy,principal,'sts:AssumeRole','*',source)&&policyAllows({Statement:Object.values(r.inline||{}).flatMap(d=>{try{const p=typeof d==='string'?JSON.parse(d):d;return Array.isArray(p?.Statement)?p.Statement:[];}catch(e){return [];}})},null,action,resource,source);}
        const busArn=n=>`arn:aws:events:${region}:${account}:event-bus/${n}`,ruleArn=(b,n)=>`arn:aws:events:${region}:${account}:rule/${b==='default'?'':b+'/'}${n}`;
        const buses=()=>[{name:'default',arn:busArn('default'),busId:'builtin-default'},...list('eventBuses')];
        function bus(value='default',requiredExists=true){const b=buses().find(b=>b.name===value||b.arn===value);if(!b&&requiredExists)throw Error('ResourceNotFoundException: Event bus does not exist in this Region/account');return b;}
        function rules(){return list('eventRules').map(r=>{r.bus=r.bus||'default';r.arn=r.arn||ruleArn(r.bus,r.name);r.ruleId=r.ruleId||'seed:'+r.arn;r.revision=r.revision||1;r.targets=(r.targets||[]).map((t,i)=>typeof t==='string'?{Id:'target-'+(i+1),Arn:t}:t);return r;});}
        function rule(){const b=bus(flag('event-bus-name')||'default'),name=required(op==='list-targets-by-rule'||op==='put-targets'||op==='remove-targets'?'rule':'name'),r=rules().find(r=>r.name===name&&r.bus===b.name);if(!r)throw Error('ResourceNotFoundException: Exact rule/bus not found');return r;}
        const lambdaArn=f=>`arn:aws:lambda:${region}:${account}:function:${f.name}`;
        const lambda=arn=>list('lambdas').find(f=>lambdaArn(f)===arn||f.name===arn);
        function retry(p){if(!object(p)||Object.keys(p).some(k=>!['MaximumRetryAttempts','MaximumEventAgeInSeconds'].includes(k)))bad('RetryPolicy supports MaximumRetryAttempts/MaximumEventAgeInSeconds');if(p.MaximumRetryAttempts!==undefined)integer(p.MaximumRetryAttempts,0,185,'MaximumRetryAttempts');if(p.MaximumEventAgeInSeconds!==undefined)integer(p.MaximumEventAgeInSeconds,60,86400,'MaximumEventAgeInSeconds');return clone(p);}
        function dlq(config){if(!object(config)||Object.keys(config).some(k=>k!=='Arn')||typeof config.Arn!=='string')bad('DeadLetterConfig needs Arn');const q=list('queues').find(q=>q.arn===config.Arn);if(!q||q.isFifo||!q.arn.startsWith(`arn:aws:sqs:${region}:${account}:`))bad('Simulator requires existing same-Region/account Standard SQS delivery DLQ');return q;}
        function queueSend(q,event,provenance,attributes={}){q.messages=q.messages||[];q.queueId=q.queueId||'seed:'+q.arn;const now=Date.parse(clock()),m={messageId:next('event-message'),body:JSON.stringify(event),messageAttributes:clone(attributes),sentAt:now,visibleAt:now+Number(q.attributes?.DelaySeconds||0)*1000,receiveCount:0,provenance:clone(provenance)};q.messages.push(m);return m;}
        function targetAllowed(t,r){if(t.RoleArn)return roleAllows(t.RoleArn,'events.amazonaws.com',t.Arn.includes(':lambda:')?'lambda:InvokeFunction':'sqs:SendMessage',t.Arn,r.arn);const fn=lambda(t.Arn),q=list('queues').find(q=>q.arn===t.Arn);return fn?policyAllows(fn.policy,'events.amazonaws.com','lambda:InvokeFunction',t.Arn,r.arn):q?policyAllows(q.policy||q.attributes?.Policy,'events.amazonaws.com','sqs:SendMessage',t.Arn,r.arn):false;}
        function dispatch(r,t,event){const fn=lambda(t.Arn),q=list('queues').find(q=>q.arn===t.Arn),provenance={ruleArn:r.arn,ruleId:r.ruleId,ruleRevision:r.revision,eventId:event.id,targetId:t.Id};let outcome=!fn&&!q?'NO_RESOURCE':targetAllowed(t,r)?'ACCEPTED':'NO_PERMISSIONS',m;
          if(outcome==='ACCEPTED'){if(q)m=queueSend(q,event,provenance);else if(fn.pendingConfig||fn.state&&fn.state!=='Active')outcome='RESOURCE_NOT_READY';else{fn.pendingEvents=fn.pendingEvents||[];fn.pendingEvents.push(clone(event));}}
          const record={...provenance,targetArn:t.Arn,status:outcome,messageId:m?.messageId,queueId:q?.queueId};
          if(['NO_RESOURCE','NO_PERMISSIONS'].includes(outcome)&&t.DeadLetterConfig){const dead=list('queues').find(q=>q.arn===t.DeadLetterConfig.Arn);if(dead&&policyAllows(dead.policy||dead.attributes?.Policy,'events.amazonaws.com','sqs:SendMessage',dead.arn,r.arn)){const message=queueSend(dead,event,{...provenance,deliveryFailure:outcome},{ERROR_CODE:{DataType:'String',StringValue:outcome},RULE_ARN:{DataType:'String',StringValue:r.arn},TARGET_ARN:{DataType:'String',StringValue:t.Arn}});record.deadLetterMessageId=message.messageId;}else record.deadLetterFailure='NO_PERMISSIONS_OR_RESOURCE';}
          (sim.account.eventDeliveries||(sim.account.eventDeliveries=[])).push(record);print('sys',`Teaching delivery observation ${t.Id}: ${outcome}. Async Lambda acceptance is not handler/business completion; retry timing is not modeled.`);
        }
        function scheduleArn(g,n){return `arn:aws:scheduler:${region}:${account}:schedule/${g}/${n}`;}
        const groupArn=n=>`arn:aws:scheduler:${region}:${account}:schedule-group/${n}`;
        function groups(){return [{name:'default',arn:groupArn('default'),groupId:'builtin-default'},...list('scheduleGroups')];}
        function group(n){const g=groups().find(g=>g.name===n);if(!g)throw Error('ResourceNotFoundException: Schedule group not found');return g;}
        function expression(value){let m;if((m=value.match(/^rate\((\d+) (minute|minutes|hour|hours|day|days)\)$/))){if(!Number.isSafeInteger(Number(m[1]))||Number(m[1])<1||Number(m[1])===1&&m[2].endsWith('s')||Number(m[1])!==1&&!m[2].endsWith('s'))bad('Rate value/unit singular-plural mismatch');return;}if((m=value.match(/^cron\(([^)]+)\)$/))){const parts=m[1].split(/\s+/);if(parts.length!==6||parts.some(s=>!/^[A-Za-z0-9*?,/\-LW#]+$/.test(s))||!((parts[2]==='?')!==(parts[4]==='?')))bad('Cron needs6 fields and exactly one day-of-month/day-of-week ?');const ranges=[[0,59],[0,23],[1,31],[1,12],[1,7],[1970,2199]],aliases=[[],[],[],['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],['SUN','MON','TUE','WED','THU','FRI','SAT'],[]];for(let i=0;i<parts.length;i++){if(parts[i]==='?'){if(i!==2&&i!==4)bad('? allowed only in cron day fields');continue;}for(const token of parts[i].split(',')){const [base,step,...extra]=token.split('/');if(extra.length||step!==undefined&&(!/^\d+$/.test(step)||Number(step)<1))bad('Invalid cron step');if(base==='*')continue;const limit=base.split('-');if(limit.length>2)bad('Invalid cron range');const ns=limit.map(v=>{if(/^\d+$/.test(v))return Number(v);const alias=aliases[i].indexOf(v.toUpperCase());return alias<0?NaN:alias+1;});if(ns.some(n=>!Number.isFinite(n))||ns.some(n=>n<ranges[i][0]||n>ranges[i][1])||ns.length===2&&ns[1]<ns[0])bad('Cron field outside range; special L/W/# syntax outside this local subset');}}return;}if(/^at\(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\)$/.test(value)&&Number.isFinite(Date.parse(value.slice(3,-1)+'Z'))&&new Date(value.slice(3,-1)+'Z').toISOString().slice(0,19)===value.slice(3,-1))return;bad('Use documented rate(...), six-field cron(...) or at(YYYY-MM-DDThh:mm:ss) expression; no shell cron');}
        function schedule(){const name=required('name'),g=group(flag('group-name')||'default'),s=list('schedules').find(s=>s.name===name&&s.group===g.name);if(!s)throw Error('ResourceNotFoundException: Exact schedule/group not found');return s;}
        function scheduleView(s){return {Arn:s.arn,Name:s.name,GroupName:s.group,ScheduleExpression:s.expression,ScheduleExpressionTimezone:s.timezone,State:s.state,FlexibleTimeWindow:clone(s.window),Target:clone(s.target),Description:s.description||''};}
        function scheduleConfig(){const expr=required('schedule-expression'),zone=flag('schedule-expression-timezone')||'UTC',window=doc('flexible-time-window'),target=doc('target'),state=flag('state')||'ENABLED';expression(expr);try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}catch(e){bad('Unknown IANA schedule-expression-timezone');}if(!['ENABLED','DISABLED'].includes(state)||!object(window)||!['OFF','FLEXIBLE'].includes(window.Mode)||Object.keys(window).some(k=>!['Mode','MaximumWindowInMinutes'].includes(k)))bad('State or FlexibleTimeWindow invalid');if(window.Mode==='FLEXIBLE')integer(window.MaximumWindowInMinutes,1,1440,'MaximumWindowInMinutes');else if(window.MaximumWindowInMinutes!==undefined)bad('OFF window has no MaximumWindowInMinutes');if(!object(target)||typeof target.Arn!=='string'||(typeof target.RoleArn!=='string'||!/^arn:aws:iam::\d{12}:role\/.+/.test(target.RoleArn))||Object.keys(target).some(k=>!['Arn','RoleArn','Input','RetryPolicy','DeadLetterConfig'].includes(k)))bad('Simulator Scheduler targets need Arn/RoleArn and optional Input/retry/DLQ');const fn=lambda(target.Arn),q=list('queues').find(q=>q.arn===target.Arn);if(!fn&&!q)bad('Simulator supports existing Lambda/Standard SQS schedule targets');if(q?.isFifo)bad('FIFO scheduler SqsParameters are outside this model');if(target.Input!==undefined&&(typeof target.Input!=='string'||bytes(target.Input)>262144))bad('Target Input must be string within256KiB');if(target.RetryPolicy)retry(target.RetryPolicy);if(target.DeadLetterConfig)dlq(target.DeadLetterConfig);return {expression:expr,timezone:zone,window:clone(window),target:clone(target),state,description:flag('description')||''};}
        const machineArn=n=>`arn:aws:states:${region}:${account}:stateMachine:${n}`;
        function machines(){return list('stateMachines').map(m=>{m.arn=m.arn||machineArn(m.name);m.machineId=m.machineId||'seed:'+m.arn;m.revision=m.revision||1;m.type=m.type||'STANDARD';return m;});}
        function machine(){const arn=required('state-machine-arn'),m=machines().find(m=>m.arn===arn);if(!m)throw Error('StateMachineDoesNotExist: Use exact state-machine ARN');return m;}
        function pathRead(root,path,missing=false){if(path==='$')return {present:true,value:root};if(typeof path!=='string'||!/^\$\.[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path))throw Error('States.Runtime: Simulator JSONPath supports $ or dotted ordinary keys');let value=root;for(const key of path.slice(2).split('.')){if(['__proto__','constructor','prototype'].includes(key))throw Error('States.Runtime: Unsafe path key');if(!object(value)||!own(value,key)){if(missing)return {present:false};throw Error('States.Runtime: Missing JSONPath '+path);}value=value[key];}return {present:true,value};}
        const bounded=v=>{if(bytes(JSON.stringify(v))>262144)throw Error('States.DataLimitExceeded: State payload exceeds256KiB; use a reference');return v;};
        function mergeResult(input,path,result){if(path===null)return bounded(input);if(path===undefined||path==='$')return bounded(clone(result));if(typeof path!=='string'||!/^\$\.[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path))throw Error('States.Runtime: Unsupported ResultPath');const output=clone(input);if(!object(output))throw Error('States.Runtime: ResultPath requires object input');const keys=path.slice(2).split('.');let cursor=output;for(const key of keys.slice(0,-1)){if(['__proto__','constructor','prototype'].includes(key))throw Error('States.Runtime: Unsafe ResultPath');if(!own(cursor,key))cursor[key]={};if(!object(cursor[key]))throw Error('States.Runtime: Cannot write ResultPath through scalar');cursor=cursor[key];}const key=keys.at(-1);if(['__proto__','constructor','prototype'].includes(key))throw Error('States.Runtime: Unsafe ResultPath');cursor[key]=clone(result);return bounded(output);}
        function parameters(template,input,depth=0){if(depth>16)throw Error('States.Runtime: Simulator Parameters nesting limit16');if(Array.isArray(template))return template.map(v=>parameters(v,input,depth+1));if(!object(template))return template;const out=Object.create(null);for(const [key,value]of Object.entries(template)){const dynamic=key.endsWith('.$'),name=dynamic?key.slice(0,-2):key;if(['__proto__','constructor','prototype'].includes(name))throw Error('States.Runtime: Unsafe Parameters key');out[name]=dynamic?clone(pathRead(input,value).value):parameters(value,input,depth+1);}return out;}
        function choice(c,input){if(!object(c))throw Error('States.Runtime: Invalid Choice');if(c.And)return Array.isArray(c.And)&&c.And.every(n=>choice(n,input));if(c.Or)return Array.isArray(c.Or)&&c.Or.some(n=>choice(n,input));if(c.Not)return !choice(c.Not,input);const value=pathRead(input,c.Variable,true);if(c.IsPresent!==undefined)return value.present===c.IsPresent;if(!value.present)return false;if(c.StringEquals!==undefined)return typeof value.value==='string'&&value.value===c.StringEquals;if(c.BooleanEquals!==undefined)return typeof value.value==='boolean'&&value.value===c.BooleanEquals;if(c.NumericGreaterThan!==undefined)return typeof value.value==='number'&&value.value>c.NumericGreaterThan;throw Error('States.Runtime: Unsupported Choice comparator');}
        function parameterSchema(p,depth=0){if(depth>16)throw Error('InvalidDefinition: Parameters nesting exceeds local16level limit');if(Array.isArray(p)){p.forEach(v=>parameterSchema(v,depth+1));return;}if(!object(p))return;const names=new Set();for(const [key,value]of Object.entries(p)){const name=key.endsWith('.$')?key.slice(0,-2):key;if(names.has(name)||['__proto__','constructor','prototype'].includes(name))throw Error('InvalidDefinition: Duplicate/unsafe resolved Parameters key');names.add(name);if(key.endsWith('.$')){try{pathRead({},value,true);}catch(e){throw Error('InvalidDefinition: This model supports only dotted JSONPath Parameters, no intrinsics');}}else parameterSchema(value,depth+1);}}
        function choiceSchema(c,top=false,depth=0){if(!object(c)||depth>16)throw Error('InvalidDefinition: Invalid/beyond-scope Choice');if(!top&&own(c,'Next'))throw Error('InvalidDefinition: Nested Choice condition cannot have Next');const keys=Object.keys(c).filter(k=>k!=='Next'&&k!=='Comment'),logic=['And','Or','Not'].find(k=>own(c,k));if(top&&typeof c.Next!=='string')throw Error('InvalidDefinition: Choice Next required');if(logic){if(keys.length!==1)throw Error('InvalidDefinition: One Choice boolean operator required');if(logic==='Not')choiceSchema(c.Not,false,depth+1);else{if(!Array.isArray(c[logic])||!c[logic].length)throw Error('InvalidDefinition: And/Or needs conditions');c[logic].forEach(n=>choiceSchema(n,false,depth+1));}return;}const ops=['StringEquals','BooleanEquals','NumericGreaterThan','IsPresent'].filter(k=>own(c,k));if(keys.length!==2||!keys.includes('Variable')||ops.length!==1||typeof c.Variable!=='string')throw Error('InvalidDefinition: Unsupported Choice comparator');try{pathRead({},c.Variable,true);}catch(e){throw Error('InvalidDefinition: Unsupported Choice JSONPath');}const op=ops[0],value=c[op];if(op==='StringEquals'&&typeof value!=='string'||['BooleanEquals','IsPresent'].includes(op)&&typeof value!=='boolean'||op==='NumericGreaterThan'&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('InvalidDefinition: Wrong comparator value type');}
        function definition(d){if(!object(d)||typeof d.StartAt!=='string'||!object(d.States)||!own(d.States,d.StartAt)||!Object.keys(d.States).length)throw Error('InvalidDefinition: StartAt and matching States object required');if(d.TimeoutSeconds!==undefined)throw Error('Simulator ASL scope: workflow timeout scheduling is not modeled; verify deadlines in runtime');if(bytes(JSON.stringify(d))>1048576)throw Error('InvalidDefinition: Definition exceeds1MiB');if(Object.keys(d).some(k=>!['StartAt','States','Comment','Version','TimeoutSeconds'].includes(k)))throw Error('InvalidDefinition: Unsupported top-level ASL field in this model');if(d.Version!==undefined&&d.Version!=='1.0'||d.Comment!==undefined&&typeof d.Comment!=='string')throw Error('InvalidDefinition: Version1.0 and string Comment required when present');const refs=[];
          for(const [name,s]of Object.entries(d.States)){if(['__proto__','constructor','prototype'].includes(name)||!object(s)||!['Pass','Task','Choice','Succeed','Fail'].includes(s.Type))throw Error('InvalidDefinition: Simulator supports Pass/Task/Choice/Succeed/Fail and ordinary state names');const allowed={Pass:['Type','Next','End','Comment','Result','ResultPath','Parameters'],Task:['Type','Next','End','Comment','Parameters','ResultPath','Resource','Retry','Catch'],Choice:['Type','Comment','Choices','Default'],Succeed:['Type','Comment'],Fail:['Type','Error','Cause','Comment']}[s.Type];if(Object.keys(s).some(k=>!allowed.includes(k)))throw Error('InvalidDefinition: Unsupported field for '+s.Type+'; timeout/other ASL features are not silently emulated');if(s.Parameters!==undefined){if(!object(s.Parameters))throw Error('InvalidDefinition: Parameters object required');parameterSchema(s.Parameters);}
            if(s.Next!==undefined)refs.push(s.Next);if(['Pass','Task'].includes(s.Type)&&(s.End===true)===(typeof s.Next==='string'))throw Error('InvalidDefinition: Pass/Task needs exactly one Next or End=true');if(s.End!==undefined&&typeof s.End!=='boolean')throw Error('InvalidDefinition: End must be boolean');if(['Succeed','Fail','Choice'].includes(s.Type)&&(s.Next!==undefined||s.End!==undefined))throw Error('InvalidDefinition: Choice/Succeed/Fail cannot use Next/End');
            if(s.Type==='Task'){if(s.Resource!=='arn:aws:states:::lambda:invoke'||!object(s.Parameters))throw Error('InvalidDefinition: This ASL model supports optimized lambda:invoke Tasks with Parameters only');if(!own(s.Parameters,'FunctionName')&&!own(s.Parameters,'FunctionName.$'))throw Error('InvalidDefinition: Task FunctionName required');if(Object.keys(s.Parameters).some(k=>!['FunctionName','FunctionName.$','Payload','Payload.$'].includes(k)))throw Error('Simulator ASL scope: synchronous optimized Lambda FunctionName/Payload only; async InvocationType and other parameters unsupported');if(own(s.Parameters,'FunctionName')&&typeof s.Parameters.FunctionName!=='string')throw Error('InvalidDefinition: FunctionName must be string');}
            if(s.Type==='Choice'){if(!Array.isArray(s.Choices)||!s.Choices.length)throw Error('InvalidDefinition: Choice requires Choices');for(const c of s.Choices){choiceSchema(c,true);refs.push(c.Next);}if(s.Default!==undefined)refs.push(s.Default);}
            for(const kind of ['Retry','Catch'])if(s[kind]!==undefined){if(s.Type!=='Task'||!Array.isArray(s[kind]))throw Error('InvalidDefinition: Retry/Catch arrays supported on Task only');for(let i=0;i<s[kind].length;i++){const r=s[kind][i];if(!object(r)||!Array.isArray(r.ErrorEquals)||!r.ErrorEquals.length||r.ErrorEquals.some(n=>typeof n!=='string'||!n))throw Error('InvalidDefinition: ErrorEquals nonempty string list required');if(r.ErrorEquals.includes('States.ALL')&&(r.ErrorEquals.length!==1||i!==s[kind].length-1))throw Error('InvalidDefinition: States.ALL must be alone in final retrier/catcher');if(Object.keys(r).some(k=>!(kind==='Catch'?['ErrorEquals','Next','ResultPath']:['ErrorEquals','MaxAttempts','IntervalSeconds','BackoffRate']).includes(k)))throw Error('InvalidDefinition: Unsupported retrier/catcher field in local subset');if(kind==='Catch'){if(typeof r.Next!=='string')throw Error('InvalidDefinition: Catch requires Next');refs.push(r.Next);}else{if(r.MaxAttempts!==undefined&&(!Number.isInteger(r.MaxAttempts)||r.MaxAttempts<0||r.MaxAttempts>8))throw Error('Simulator ASL scope: MaxAttempts0..8 to bound local replay; AWS permits larger budgets');if(r.IntervalSeconds!==undefined&&(!Number.isInteger(r.IntervalSeconds)||r.IntervalSeconds<1))throw Error('InvalidDefinition: IntervalSeconds positive integer');if(r.BackoffRate!==undefined&&(typeof r.BackoffRate!=='number'||!Number.isFinite(r.BackoffRate)||r.BackoffRate<1))throw Error('InvalidDefinition: BackoffRate must be finite>=1');}}}
          }
          if(refs.some(n=>typeof n!=='string'||!own(d.States,n)))throw Error('InvalidDefinition: Every Next/Default/Catch target must exist');return clone(d);
        }
        function errorsMatch(list,type){return list.includes(type)||list.includes('States.ALL')&&!['States.Runtime','States.DataLimitExceeded'].includes(type)||list.includes('States.TaskFailed')&&!['States.Timeout','States.Runtime','States.DataLimitExceeded'].includes(type);}
        function execute(m,name,input,inputText){const arn=`arn:aws:states:${region}:${account}:execution:${m.name}:${name}`,e={name,arn,executionId:next('execution'),machineId:m.machineId,machineArn:m.arn,machineRevision:m.revision,stateMachine:m.name,type:m.type,input:clone(input),inputText,status:'RUNNING',startDate:clock(),events:[],trace:[]};
          const add=(type,details={})=>{const id=e.events.length+1;e.events.push({id,previousEventId:id-1,type,timestamp:clock(),...clone(details)});};add('ExecutionStarted',{executionStartedEventDetails:{input:inputText,roleArn:m.roleArn}});
          let current=m.definition.StartAt,data=clone(input),budget=0;
          try{while(current){if(++budget>128)throw Error('Simulator.ScopeLimit: Local interpreter transition budget128 exceeded');const s=m.definition.States[current];if(!s)throw Error('States.Runtime: State missing');add(s.Type+'StateEntered',{stateEnteredEventDetails:{name:current,input:JSON.stringify(data)}});
              if(s.Type==='Fail')throw Error((s.Error||'States.Failed')+': '+(s.Cause||'Fail state reached'));
              if(s.Type==='Succeed'){add('SucceedStateExited',{stateExitedEventDetails:{name:current,output:JSON.stringify(data)}});current=null;continue;}
              if(s.Type==='Choice'){const c=s.Choices.find(c=>choice(c,data)),to=c?c.Next:s.Default;if(!to)throw Error('States.NoChoiceMatched: No Choice or Default matched');add('ChoiceStateExited',{stateExitedEventDetails:{name:current,output:JSON.stringify(data)}});current=to;continue;}
              if(s.Type==='Pass'){const result=s.Parameters?parameters(s.Parameters,data):own(s,'Result')?clone(s.Result):data;data=mergeResult(data,s.ResultPath,result);add('PassStateExited',{stateExitedEventDetails:{name:current,output:JSON.stringify(data)}});current=s.End?null:s.Next;continue;}
              const retried=new Map();let caught=false;
              while(true){if(++budget>128)throw Error('Simulator.ScopeLimit: Local interpreter attempt budget128 exceeded');const p=parameters(s.Parameters,data),fn=lambda(p.FunctionName);add('TaskScheduled',{taskScheduledEventDetails:{resourceType:'lambda',resource:'invoke',parameters:JSON.stringify(p)}});
                try{if(!fn)throw Error('Lambda.ResourceNotFoundException: Original Task function missing');if(!roleAllows(m.roleArn,'states.amazonaws.com','lambda:InvokeFunction',lambdaArn(fn),m.arn))throw Error('States.Permissions: Workflow role lacks scoped trust/invoke permission');const payload=own(p,'Payload')?p.Payload:{},output=AG.sagaWorker(sim.account,fn,payload);add('TaskSucceeded',{taskSucceededEventDetails:{resourceType:'lambda',resource:'invoke',output:JSON.stringify({Payload:output,StatusCode:200,ExecutedVersion:'$LATEST'})}});e.trace.push({state:current,type:'TaskSucceeded',operation:fn.sagaOperation,functionId:fn.fixtureId,output:clone(output)});data=mergeResult(data,s.ResultPath,{Payload:output,StatusCode:200,ExecutedVersion:'$LATEST'});break;
                }catch(error){const type=error.type||error.message.split(':')[0],cause=error.message;add('TaskFailed',{taskFailedEventDetails:{resourceType:'lambda',resource:'invoke',error:type,cause}});e.trace.push({state:current,type:'TaskFailed',operation:fn?.sagaOperation,error:type,functionId:fn?.fixtureId});const r=(s.Retry||[]).find(r=>errorsMatch(r.ErrorEquals,type));if(r&&(retried.get(r)||0)<(r.MaxAttempts??3)){retried.set(r,(retried.get(r)||0)+1);continue;}const c=(s.Catch||[]).find(c=>errorsMatch(c.ErrorEquals,type));if(!c)throw error;data=mergeResult(data,c.ResultPath,{Error:type,Cause:cause});current=c.Next;caught=true;break;}
              }
              if(!caught){add('TaskStateExited',{stateExitedEventDetails:{name:current,output:JSON.stringify(data)}});current=s.End?null:s.Next;}
            }
            e.status='SUCCEEDED';e.output=clone(data);add('ExecutionSucceeded',{executionSucceededEventDetails:{output:JSON.stringify(data)}});
          }catch(error){e.status='FAILED';e.error=error.type||error.message.split(':')[0];e.cause=error.message;add('ExecutionFailed',{executionFailedEventDetails:{error:e.error,cause:e.cause}});}
          e.stopDate=clock();list('executions').push(e);return e;
        }
        try {
          if(flag('region')&&flag('region')!==region)bad('Simulator mission is scoped to '+region+'; use that Region with the exact fixture ARNs');
          if(service==='events'){
            if(op==='list-event-buses')return resultJson({EventBuses:buses().map(b=>({Name:b.name,Arn:b.arn}))});
            if(op==='create-event-bus'){const name=required('name');if(!/^[A-Za-z0-9_.-]{1,256}$/.test(name)||name==='default')bad('Use ordinary custom Classic bus name; default already exists');if(buses().some(b=>b.name===name))throw Error('ResourceAlreadyExistsException: Event bus exists');const b={name,arn:busArn(name),busId:next('bus')};list('eventBuses').push(b);return resultJson({EventBusArn:b.arn});}
            if(op==='describe-event-bus'){const b=bus(flag('name')||'default');return resultJson({Name:b.name,Arn:b.arn});}
            if(op==='delete-event-bus'){const b=bus(required('name'));if(b.name==='default'||rules().some(r=>r.bus===b.name))bad('Cannot delete default bus or bus with rules');list('eventBuses').splice(list('eventBuses').indexOf(b),1);return print('ok','');}
            if(op==='test-event-pattern'){const pattern=doc('event-pattern'),event=doc('event');if(!object(event)||['id','account','source','detail-type','time','region','resources'].some(k=>!own(event,k)))bad('Test event needs complete EventBridge envelope: id/account/source/detail-type/time/region/resources');return resultJson({Result:AG.eventPatternMatch(pattern,event)});}
            if(op==='list-rules'){const b=bus(flag('event-bus-name')||'default');return resultJson({Rules:rules().filter(r=>r.bus===b.name&&r.name.startsWith(flag('name-prefix')||'')).map(r=>({Name:r.name,Arn:r.arn,State:r.state||'ENABLED',EventBusName:r.bus,...(r.pattern?{EventPattern:JSON.stringify(r.pattern)}:{}),...(r.schedule?{ScheduleExpression:r.schedule}:{})}))});}
            if(op==='put-rule'){
              const name=required('name'),b=bus(flag('event-bus-name')||'default'),state=flag('state')||'ENABLED',pattern=flag('event-pattern')===null?undefined:AG.validateEventPattern(doc('event-pattern')),schedule=flag('schedule-expression')===null?undefined:required('schedule-expression');if(!/^[A-Za-z0-9_.-]{1,64}$/.test(name)||!['ENABLED','DISABLED'].includes(state)||!pattern&&!schedule)bad('Valid rule name/state and event pattern or schedule required');if(schedule){if(b.name!=='default')bad('Legacy scheduled rules use default bus only; prefer Scheduler');expression(schedule);}
              let r=rules().find(r=>r.name===name&&r.bus===b.name);if(!r){r={name,bus:b.name,arn:ruleArn(b.name,name),ruleId:next('rule'),targets:[],revision:0};list('eventRules').push(r);}r.pattern=pattern?clone(pattern):undefined;r.schedule=schedule;r.state=state;r.description=flag('description')||'';r.revision++;return resultJson({RuleArn:r.arn});
            }
            if(op==='put-events'){
              const entries=doc('entries');if(!Array.isArray(entries)||!entries.length||entries.length>10)bad('Classic PutEvents requires1..10entries (new Custom Event Bus V2 has separate quotas)');let total=0;for(const entry of entries){if(!object(entry))bad('Every entry must be object');total+=bytes(String(entry.Source||''))+bytes(String(entry.DetailType||''))+bytes(String(entry.Detail||''))+(entry.Time===undefined?0:14)+(Array.isArray(entry.Resources)?entry.Resources.reduce((n,v)=>n+bytes(String(v)),0):0);}if(total>=1048576)bad('Classic PutEvents total entry bytes must be less than1MiB');
              const entryTime=e=>{if(e.Time===undefined)return clock();const ms=typeof e.Time==='number'?e.Time*1000:typeof e.Time==='string'?Date.parse(e.Time):NaN;if(!Number.isFinite(ms)||!Number.isFinite(new Date(ms).getTime()))bad('Time must be a valid ISO date string or Unix seconds');return new Date(ms).toISOString();};for(const entry of entries)entryTime(entry);
              const outcomes=[];for(const entry of entries){let detail;try{if(typeof entry.Source!=='string'||!entry.Source||typeof entry.DetailType!=='string'||!entry.DetailType||typeof entry.Detail!=='string')throw Error('Source/DetailType/JSON-string Detail required');if(entry.Source.startsWith('aws.'))throw Error('Custom publisher cannot spoof reserved aws. source');detail=JSON.parse(entry.Detail);if(!object(detail)||entry.Resources!==undefined&&(!Array.isArray(entry.Resources)||entry.Resources.some(v=>typeof v!=='string')))throw Error('Detail object/Resources string array required');}catch(error){outcomes.push({ErrorCode:entry.Source?.startsWith?.('aws.')?'NotAuthorizedForSourceException':'MalformedDetail',ErrorMessage:error.message});continue;}
                const b=bus(entry.EventBusName||'default',false),id=next('event'),event={version:'0',id,account,source:entry.Source,'detail-type':entry.DetailType,time:entryTime(entry),region,resources:entry.Resources||[],detail};outcomes.push({EventId:id});if(!b){print('sys','Teaching observation: nonexistent bus accepted then dropped, without FailedEntryCount (documented AWS behavior). Verify bus and delivery.');continue;}for(const r of rules().filter(r=>r.bus===b.name&&r.state!=='DISABLED'&&r.pattern&&AG.eventPatternMatch(r.pattern,event)))for(const t of r.targets)dispatch(r,t,event);
              }return resultJson({FailedEntryCount:outcomes.filter(r=>r.ErrorCode).length,Entries:outcomes});
            }
            if(!['describe-rule','put-targets','list-targets-by-rule','remove-targets','delete-rule','enable-rule','disable-rule'].includes(op))return print('err','Simulator scope: unsupported Classic EventBridge op '+op);
            const r=rule();
            if(op==='describe-rule')return resultJson({Name:r.name,Arn:r.arn,EventBusName:r.bus,State:r.state||'ENABLED',...(r.pattern?{EventPattern:JSON.stringify(r.pattern)}:{}),...(r.schedule?{ScheduleExpression:r.schedule}:{})});
            if(op==='list-targets-by-rule')return resultJson({Targets:clone(r.targets)});
            if(op==='put-targets'){
              const raw=text('targets');let targets;if(raw.startsWith('['))targets=json(raw,'--targets');else targets=flags('targets').map(value=>{const m=value.match(/^Id=([A-Za-z0-9_.-]+),Arn=(arn:aws:[^,\s]+)$/);if(!m)bad('Use --targets JSON/file or Id=target-id,Arn=full-arn; bare ARN is not AWS target syntax');return {Id:m[1],Arn:m[2]};});
              if(!Array.isArray(targets)||!targets.length)bad('Targets must be nonempty array');const ids=new Set();for(const t of targets){if(!object(t)||typeof t.Id!=='string'||!/^[A-Za-z0-9_.-]{1,64}$/.test(t.Id)||ids.has(t.Id)||typeof t.Arn!=='string'||!new RegExp(`^arn:aws:(lambda|sqs):${region}:${account}:`).test(t.Arn))bad('Unique target Id and supported same-Region/account Lambda/SQS Arn required');ids.add(t.Id);if(Object.keys(t).some(k=>!['Id','Arn','RoleArn','RetryPolicy','DeadLetterConfig'].includes(k)))bad('Simulator target subset supports Id/Arn/RoleArn/RetryPolicy/DeadLetterConfig');if(t.RetryPolicy)retry(t.RetryPolicy);if(t.DeadLetterConfig)dlq(t.DeadLetterConfig);if(t.RoleArn!==undefined&&(typeof t.RoleArn!=='string'||!/^arn:aws:iam::\d{12}:role\/.+/.test(t.RoleArn)))bad('RoleArn must be IAM role ARN');if(list('queues').some(q=>q.arn===t.Arn&&q.isFifo))bad('Simulator Classic SQS targets are Standard; FIFO SqsParameters are not modeled');}
              const merged=r.targets.filter(t=>!ids.has(t.Id)).concat(clone(targets));if(merged.length>5)throw Error('LimitExceededException: Classic rule supports at most5targets');r.targets=merged;r.revision++;return resultJson({FailedEntryCount:0,FailedEntries:[]});
            }
            if(op==='remove-targets'){const ids=flags('ids');if(!ids.length)bad('--ids required');r.targets=r.targets.filter(t=>!ids.includes(t.Id));r.revision++;return resultJson({FailedEntryCount:0,FailedEntries:[]});}
            if(op==='delete-rule'){if(r.targets.length&&!toks.includes('--force'))bad('Remove targets before deleting rule');list('eventRules').splice(list('eventRules').indexOf(r),1);return print('ok','');}
            r.state=op==='enable-rule'?'ENABLED':'DISABLED';r.revision++;return print('ok','');
          }
          if(service==='scheduler'){
            if(op==='list-schedule-groups')return resultJson({ScheduleGroups:groups().filter(g=>g.name.startsWith(flag('name-prefix')||'')).map(g=>({Name:g.name,Arn:g.arn,State:'ACTIVE'}))});
            if(op==='create-schedule-group'){const name=required('name');if(!/^[A-Za-z0-9_.-]{1,64}$/.test(name))bad('Valid schedule group name required');if(groups().some(g=>g.name===name))throw Error('ConflictException: Schedule group exists');const g={name,arn:groupArn(name),groupId:next('schedule-group')};list('scheduleGroups').push(g);return resultJson({ScheduleGroupArn:g.arn});}
            if(op==='get-schedule-group'){const g=group(required('name'));return resultJson({Name:g.name,Arn:g.arn,State:'ACTIVE'});}
            if(op==='delete-schedule-group'){const g=group(required('name'));if(g.name==='default')bad('Default group cannot be deleted');if(list('schedules').some(s=>s.group===g.name))bad('Simulator requires deleting owned schedules before deleting group');list('scheduleGroups').splice(list('scheduleGroups').indexOf(g),1);return print('ok','');}
            if(op==='list-schedules')return resultJson({Schedules:list('schedules').filter(s=>(flag('group-name')===null||s.group===flag('group-name'))&&s.name.startsWith(flag('name-prefix')||'')&&(flag('state')===null||s.state===flag('state'))).map(s=>({Arn:s.arn,Name:s.name,GroupName:s.group,State:s.state,Target:{Arn:s.target.Arn}}))});
            if(op==='create-schedule'||op==='update-schedule'){const name=required('name'),g=group(flag('group-name')||'default');if(!/^[A-Za-z0-9_.-]{1,64}$/.test(name))bad('Valid schedule name required');const cfg=scheduleConfig();let s=list('schedules').find(s=>s.name===name&&s.group===g.name);if(op==='create-schedule'&&s)throw Error('ConflictException: Schedule exists; use update-schedule');if(op==='update-schedule'&&!s)throw Error('ResourceNotFoundException: Schedule missing');if(!s){s={name,group:g.name,arn:scheduleArn(g.name,name),scheduleId:next('schedule'),revision:0};list('schedules').push(s);}Object.assign(s,cfg);s.revision++;return resultJson({ScheduleArn:s.arn});}
            if(!['get-schedule','delete-schedule'].includes(op))return print('err','Simulator scope: unsupported Scheduler op '+op);const s=schedule();if(op==='delete-schedule'){list('schedules').splice(list('schedules').indexOf(s),1);return print('ok','');}const view=scheduleView(s);if(resultJson(view)&&flag('query')===null){sim.account.scheduleReads=(sim.account.scheduleReads||[]).filter(r=>r.scheduleId!==s.scheduleId);sim.account.scheduleReads.push({scheduleId:s.scheduleId,revision:s.revision,view:clone(view)});}return;
          }
          if(op==='list-state-machines')return resultJson({stateMachines:machines().map(m=>({name:m.name,stateMachineArn:m.arn,type:m.type}))});
          if(op==='create-state-machine'){
            const name=required('name'),type=flag('type')||'STANDARD',roleArn=required('role-arn'),def=definition(doc('definition'));if(!/^[A-Za-z0-9_.-]{1,80}$/.test(name)||!['STANDARD','EXPRESS'].includes(type)||!/^arn:aws:iam::\d{12}:role\/.+/.test(roleArn))bad('Valid state machine name/type/role-arn required');const old=machines().find(m=>m.name===name);if(old){if(old.type!==type)throw Error('StateMachineAlreadyExists: Immutable type differs');return resultJson({stateMachineArn:old.arn,creationDate:old.created||clock()});}const m={name,arn:machineArn(name),type,roleArn,definition:def,machineId:next('machine'),revision:1,created:clock()};list('stateMachines').push(m);return resultJson({stateMachineArn:m.arn,creationDate:m.created});
          }
          if(['describe-execution','get-execution-history','stop-execution'].includes(op)){
            const arn=required('execution-arn'),e=list('executions').find(e=>e.arn===arn);if(!e)throw Error('ExecutionDoesNotExist: Exact execution ARN not found');if(e.type==='EXPRESS')throw Error('InvalidArn: Express histories are in configured CloudWatch Logs; use StartSyncExecution result for synchronous Express');
            if(op==='stop-execution'){if(e.status!=='RUNNING')throw Error('ExecutionNotRunning: Execution already closed');e.status='ABORTED';e.error=flag('error')||'Aborted';e.cause=flag('cause')||'';e.stopDate=clock();e.events.push({id:e.events.length+1,previousEventId:e.events.length,type:'ExecutionAborted',timestamp:clock(),executionAbortedEventDetails:{error:e.error,cause:e.cause}});return resultJson({stopDate:e.stopDate});}
            if(op==='describe-execution')return resultJson({executionArn:e.arn,stateMachineArn:e.machineArn,name:e.name,status:e.status,input:e.inputText,...(e.output!==undefined?{output:JSON.stringify(e.output)}:{}),...(e.error?{error:e.error,cause:e.cause}:{}),startDate:e.startDate,stopDate:e.stopDate});
            const events=clone(e.events);if(toks.includes('--reverse-order'))events.reverse();if(resultJson({events})&&flag('query')===null)sim.account.workflowRead={executionArn:e.arn,executionId:e.executionId,machineId:e.machineId,machineRevision:e.machineRevision,status:e.status,events:clone(events)};return;
          }
          if(!['describe-state-machine','update-state-machine','delete-state-machine','start-execution','start-sync-execution','list-executions'].includes(op))return print('err','Simulator scope: unsupported Step Functions op '+op);
          const m=machine();
          if(op==='describe-state-machine')return resultJson({stateMachineArn:m.arn,name:m.name,type:m.type,roleArn:m.roleArn,status:'ACTIVE',definition:JSON.stringify(m.definition||{}),revisionId:String(m.revision)});
          if(op==='update-state-machine'){const def=flag('definition')===null?m.definition:definition(doc('definition')),roleArn=flag('role-arn')||m.roleArn;if(flag('definition')===null&&flag('role-arn')===null)bad('Supply definition or role-arn');if(typeof roleArn!=='string'||!/^arn:aws:iam::\d{12}:role\/.+/.test(roleArn))bad('Valid role-arn required');m.definition=clone(def);m.roleArn=roleArn;m.revision++;return resultJson({updateDate:clock(),revisionId:String(m.revision)});}
          if(op==='delete-state-machine'){list('stateMachines').splice(list('stateMachines').indexOf(m),1);return print('ok','');}
          if(op==='list-executions'){if(m.type==='EXPRESS')throw Error('InvalidArn: ListExecutions does not provide Express history; configure CloudWatch Logs');return resultJson({executions:list('executions').filter(e=>e.machineId===m.machineId&&(flag('status-filter')===null||e.status===flag('status-filter'))).map(e=>({executionArn:e.arn,stateMachineArn:e.machineArn,name:e.name,status:e.status,startDate:e.startDate,stopDate:e.stopDate}))});}
          if(op==='start-sync-execution'&&m.type!=='EXPRESS')throw Error('StateMachineTypeNotSupported: StartSyncExecution requires EXPRESS');
          const raw=flag('input')===null?'{}':text('input'),input=json(raw,'--input'),name=flag('name')||next('run');if(!object(input)||bytes(raw)>262144||!/^[A-Za-z0-9_.-]{1,80}$/.test(name))bad('Simulator requires object input within256KiB and valid execution name');definition(m.definition);
          const prior=list('executions').find(e=>e.machineId===m.machineId&&e.name===name);if(prior&&m.type==='STANDARD'){if(prior.status==='RUNNING'&&prior.inputText===raw)return resultJson({executionArn:prior.arn,startDate:prior.startDate});throw Error('ExecutionAlreadyExists: Standard execution name cannot be reused after closure or with different input; choose a fresh execution name and retain the same business orderId');}
          const e=execute(m,name,input,raw);if(op==='start-sync-execution')return resultJson({executionArn:e.arn,stateMachineArn:m.arn,name,status:e.status,input:raw,...(e.output!==undefined?{output:JSON.stringify(e.output)}:{error:e.error,cause:e.cause}),startDate:e.startDate,stopDate:e.stopDate});
          return resultJson({executionArn:e.arn,startDate:e.startDate});
        }catch(error){return print('err',error.message);}
      }

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
