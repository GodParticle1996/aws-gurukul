/* Advanced 9 — migration: 7 Rs, MGN, DMS full load + CDC, file transfer maths and an honest cutover.
   ShopKaro buys GodamTech (fictional). Fixture data only; see migration-cli.js for the bounded DMS model. */
(() => {
  const copy = x => JSON.parse(JSON.stringify(x));
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const ACCT = '555555555555', R = 'ap-south-1', NOW = '2026-11-20T10:30:00Z';
  const ROLE = `arn:aws:iam::${ACCT}:role/dms-secrets-access`;
  const SRC_SECRET = `arn:aws:secretsmanager:${R}:${ACCT}:secret:godam/oracle/dms-AbC123`;
  const TGT_SECRET = `arn:aws:secretsmanager:${R}:${ACCT}:secret:godam/aurora/dms-XyZ789`;
  const SRC = `arn:aws:dms:${R}:${ACCT}:endpoint:GODAMORACLESRC`;
  const RI = `arn:aws:dms:${R}:${ACCT}:rep:GODAMRI0001`, TGT = `arn:aws:dms:${R}:${ACCT}:endpoint:GODAMEP0002`, TASK = `arn:aws:dms:${R}:${ACCT}:task:GODAMTASK0003`;
  const TABLES = [
    { schema: 'SHOP', name: 'ORDERS', rows: 1840000, cdc: { inserts: 4210, updates: 1980, deletes: 12 } },
    { schema: 'SHOP', name: 'ORDER_ITEMS', rows: 5210000, cdc: { inserts: 11040, updates: 0, deletes: 30 } },
    { schema: 'SHOP', name: 'CUSTOMERS', rows: 420000, cdc: { inserts: 310, updates: 880, deletes: 0 } },
    { schema: 'SHOP', name: 'AUDIT_TMP', rows: 96000000, cdc: { inserts: 250000, updates: 0, deletes: 250000 } }
  ];
  const WANT = ['SHOP.CUSTOMERS', 'SHOP.ORDERS', 'SHOP.ORDER_ITEMS'];
  const ident = { Account: ACCT, Arn: `arn:aws:iam::${ACCT}:role/migration-lead` };
  const srcEndpoint = { id: 'godam-oracle', type: 'source', engine: 'oracle', server: '10.40.8.15', port: 1521, database: 'SHOP', settings: { SecretsManagerSecretId: SRC_SECRET, SecretsManagerAccessRoleArn: ROLE }, settingsKey: 'OracleSettings', plainPassword: false, ssl: 'none', arn: SRC };
  const secrets = [{ name: 'godam/oracle/dms', arn: SRC_SECRET }, { name: 'godam/aurora/dms', arn: TGT_SECRET }];
  const file = x => ({ content: JSON.stringify(x, null, 2) });
  const FILES = {
    'mappings-all.json': file({ rules: [{ 'rule-type': 'selection', 'rule-id': '1', 'rule-name': 'all-shop', 'object-locator': { 'schema-name': 'SHOP', 'table-name': '%' }, 'rule-action': 'include' }] }),
    'mappings-orders.json': file({ rules: [{ 'rule-type': 'selection', 'rule-id': '1', 'rule-name': 'all-shop', 'object-locator': { 'schema-name': 'SHOP', 'table-name': '%' }, 'rule-action': 'include' }, { 'rule-type': 'selection', 'rule-id': '2', 'rule-name': 'skip-scratch', 'object-locator': { 'schema-name': 'SHOP', 'table-name': 'AUDIT_TMP' }, 'rule-action': 'exclude' }] }),
    'task-settings.json': file({ ValidationSettings: { EnableValidation: true }, Logging: { EnableLogging: true } }),
    'aurora-settings.json': file({ SecretsManagerSecretId: TGT_SECRET, SecretsManagerAccessRoleArn: ROLE }),
    'runbook.txt': { content: 'GodamTech orders DB move (fictional)\n- Source: Oracle SHOP (endpoint godam-oracle, DBA ne bana diya; supplemental logging ON)\n- Target: Aurora PostgreSQL database "shop", secret godam/aurora/dms\n- AUDIT_TMP sirf scratch data (96M rows) hai: migrate NAHI karna\n- Replication instance private subnet group godam-private mein, public IP nahi\n- Validation ON; cutover se pehle CDC lag 0 aur validation Validated\n' }
  };

  /* Fixture hooks used by migration-cli.js */
  AG.dmsConnectionProblem = (a, e) => {
    if (e.type !== 'target') return '';
    if (e.engine !== 'aurora-postgresql') return 'Test connection failed: target engine aurora-postgresql hona chahiye';
    if (e.database !== 'shop') return 'FATAL: database "' + (e.database || '') + '" does not exist';
    if (!e.settings || e.settings.SecretsManagerSecretId !== TGT_SECRET) return 'FATAL: password authentication failed (galat secret ya credentials)';
    return '';
  };
  AG.dmsTableStats = (a, t) => {
    let validation = false; try { validation = JSON.parse(t.settings).ValidationSettings?.EnableValidation === true; } catch (e) { validation = false; }
    const names = AG.dmsSelected(a, t.mappings) || [], cdc = t.type !== 'full-load' && a.sourceLogging === true && t.status === 'running';
    return (a.sourceTables || []).filter(x => names.includes(x.schema + '.' + x.name)).map(x => ({
      SchemaName: x.schema, TableName: x.name,
      Inserts: cdc ? x.cdc.inserts : 0, Deletes: cdc ? x.cdc.deletes : 0, Updates: cdc ? x.cdc.updates : 0, Ddls: 0,
      FullLoadRows: t.type === 'cdc' ? 0 : x.rows, FullLoadCondtnlChkFailedRows: 0, FullLoadErrorRows: 0,
      LastUpdateTime: NOW, TableState: 'Table completed',
      ValidationPendingRecords: 0, ValidationFailedRecords: 0, ValidationSuspendedRecords: 0,
      ValidationState: validation ? 'Validated' : 'Not enabled'
    }));
  };

  function seed() {
    return { dmsMode: true, region: R, now: NOW, callerIdentity: copy(ident), dmsSubnetGroups: ['godam-private'], secrets: copy(secrets), sourceTables: copy(TABLES), sourceLogging: true, dmsEndpoints: [copy(srcEndpoint)], dmsInstances: [], dmsTasks: [], dmsConnections: [], dmsSeq: 0 };
  }
  const base = seed();
  const settingsOf = t => { try { return JSON.parse(t.settings); } catch (e) { return {}; } };
  function core(a) {
    return a.dmsMode === true && a.region === R && same(a.callerIdentity, ident) && same(a.secrets, secrets) && same(a.sourceTables, TABLES) && a.sourceLogging === true
      && same(a.dmsEndpoints.find(e => e.id === 'godam-oracle'), srcEndpoint) && a.dmsEndpoints.length <= 2 && a.dmsInstances.length <= 1 && a.dmsTasks.length <= 1;
  }
  function instanceReady(a) {
    const i = a.dmsInstances[0];
    return !!i && i.id === 'godam-ri' && i.arn === RI && i.cls === 'dms.r6i.large' && i.subnetGroup === 'godam-private' && i.public === false && i.status === 'available';
  }
  function targetReady(a) {
    const e = a.dmsEndpoints.find(x => x.id === 'godam-aurora');
    if (!e || e.arn !== TGT || e.type !== 'target' || e.engine !== 'aurora-postgresql' || e.database !== 'shop' || e.plainPassword || !same(e.settings, { SecretsManagerSecretId: TGT_SECRET, SecretsManagerAccessRoleArn: ROLE })) return false;
    return [SRC, TGT].every(ep => a.dmsConnections.some(c => c.instance === RI && c.endpoint === ep && c.status === 'successful'));
  }
  function taskReady(a) {
    const t = a.dmsTasks[0];
    if (!t || t.id !== 'godam-orders' || t.arn !== TASK || t.source !== SRC || t.target !== TGT || t.instance !== RI) return false;
    const names = (AG.dmsSelected(a, t.mappings) || []).slice().sort();
    return t.type === 'full-load-and-cdc' && same(names, WANT) && settingsOf(t).ValidationSettings?.EnableValidation === true && t.status === 'running' && !!t.stats;
  }
  const statsRead = a => !!a.dmsStatsRead && a.dmsStatsRead.arn === TASK && a.dmsStatsRead.revision === (a.dmsRevision || 0);
  const tasks = [
    { text: 'DBA ka source endpoint, secrets aur source tables waise hi; sirf ek instance, ek target aur ek task', check: s => core(s.account) },
    { text: 'Private godam-ri (dms.r6i.large, godam-private, public IP nahi) available; Aurora target secret se; dono connections successful', check: s => core(s.account) && instanceReady(s.account) && targetReady(s.account) },
    { text: 'godam-orders: full-load-and-cdc, AUDIT_TMP ke bina, validation ON, running; aakhir mein aaj ki table statistics padhi', check: s => core(s.account) && instanceReady(s.account) && targetReady(s.account) && taskReady(s.account) && statsRead(s.account) }
  ];
  const solution = [
    'aws dms describe-endpoints',
    'aws dms create-replication-instance --replication-instance-identifier godam-ri --replication-instance-class dms.r6i.large --allocated-storage 100 --replication-subnet-group-identifier godam-private --no-publicly-accessible',
    'aws dms wait replication-instance-available --filters Name=replication-instance-id,Values=godam-ri',
    'aws dms create-endpoint --endpoint-identifier godam-aurora --endpoint-type target --engine-name aurora-postgresql --database-name shop --postgre-sql-settings file://aurora-settings.json',
    `aws dms test-connection --replication-instance-arn ${RI} --endpoint-arn ${SRC}`,
    `aws dms test-connection --replication-instance-arn ${RI} --endpoint-arn ${TGT}`,
    `aws dms wait test-connection-succeeds --filters Name=endpoint-arn,Values=${SRC},${TGT}`,
    `aws dms create-replication-task --replication-task-identifier godam-orders --source-endpoint-arn ${SRC} --target-endpoint-arn ${TGT} --replication-instance-arn ${RI} --migration-type full-load-and-cdc --table-mappings file://mappings-orders.json --replication-task-settings file://task-settings.json`,
    'aws dms wait replication-task-ready --filters Name=replication-task-id,Values=godam-orders',
    `aws dms start-replication-task --replication-task-arn ${TASK} --start-replication-task-type start-replication`,
    'aws dms wait replication-task-running --filters Name=replication-task-id,Values=godam-orders',
    `aws dms describe-table-statistics --replication-task-arn ${TASK}`
  ];

  /* ---------- interview: a full-load-only task that never picked up new orders ---------- */
  function iseed() {
    const a = seed();
    a.dmsInstances = [{ id: 'godam-ri', cls: 'dms.r6i.large', storage: 100, subnetGroup: 'godam-private', multiAz: false, public: false, status: 'available', arn: RI }];
    a.dmsEndpoints.push({ id: 'godam-aurora', type: 'target', engine: 'aurora-postgresql', server: undefined, port: undefined, database: 'shop', settings: { SecretsManagerSecretId: TGT_SECRET, SecretsManagerAccessRoleArn: ROLE }, settingsKey: 'PostgreSQLSettings', plainPassword: false, ssl: 'none', arn: TGT });
    a.dmsConnections = [SRC, TGT].map(ep => ({ instance: RI, endpoint: ep, endpointId: ep === SRC ? 'godam-oracle' : 'godam-aurora', instanceId: 'godam-ri', status: 'successful', reason: '' }));
    a.dmsTasks = [{ id: 'godam-orders', source: SRC, target: TGT, instance: RI, type: 'full-load', mappings: FILES['mappings-orders.json'].content, settings: FILES['task-settings.json'].content, status: 'stopped', stopReason: 'Stop Reason FULL_LOAD_ONLY_FINISHED', arn: TASK, starts: 1, stats: { FullLoadProgressPercent: 100, TablesLoaded: 3, TablesLoading: 0, TablesQueued: 0, TablesErrored: 0, ElapsedTimeMillis: 5400000 } }];
    a.dmsSeq = 3;
    return a;
  }
  const ibase = iseed();
  function iready(a) {
    const t = a.dmsTasks[0];
    return core(a) && same(a.dmsInstances, ibase.dmsInstances) && same(a.dmsEndpoints, ibase.dmsEndpoints) && !!t && t.arn === TASK && t.type === 'full-load-and-cdc' && t.status === 'running' && t.startKind === 'reload-target'
      && same((AG.dmsSelected(a, t.mappings) || []).slice().sort(), WANT) && settingsOf(t).ValidationSettings?.EnableValidation === true;
  }
  const itasks = [
    { text: 'Wahi instance, endpoints aur task; AUDIT_TMP bahar aur validation ON', check: s => { const a = s.account, t = a.dmsTasks[0]; return core(a) && same(a.dmsInstances, ibase.dmsInstances) && same(a.dmsEndpoints, ibase.dmsEndpoints) && !!t && t.arn === TASK && same((AG.dmsSelected(a, t.mappings) || []).slice().sort(), WANT) && settingsOf(t).ValidationSettings?.EnableValidation === true; } },
    { text: 'Task ab full-load-and-cdc, reload-target se running, aur aaj ki table statistics padhi', check: s => iready(s.account) && statsRead(s.account) }
  ];
  const isolution = [
    'aws dms describe-replication-tasks --filters Name=replication-task-id,Values=godam-orders --without-settings',
    `aws dms modify-replication-task --replication-task-arn ${TASK} --migration-type full-load-and-cdc`,
    `aws dms start-replication-task --replication-task-arn ${TASK} --start-replication-task-type reload-target`,
    'aws dms wait replication-task-running --filters Name=replication-task-id,Values=godam-orders',
    `aws dms describe-table-statistics --replication-task-arn ${TASK}`
  ];

  /* ---------- flowlab: 30 TB NAS copy planner ---------- */
  const LINKS = [{ mbps: 200, label: 'Abhi ka 200 Mbps', inr: 0, lead: 0 }, { mbps: 1000, label: '1 Gbps upgrade (1 mahina)', inr: 60000, lead: 0 }, { mbps: 10000, label: '10 Gbps Direct Connect', inr: 400000, lead: 30 }];
  AG.migrationTransferPlan = k => {
    const L = LINKS[k.link], hours = k.window === 1 ? 24 : 10, util = k.util / 100;
    const tbPerDay = L.mbps * 1e6 * util * hours * 3600 / 8 / 1e12;
    const days = 30 / tbPerDay, total = L.lead + days;
    const businessHit = k.window === 1 && k.util > 40;
    const deltaHours = 0.2 * 8e12 / (L.mbps * 1e6 * util) / 3600;
    const ok = total <= 7 && !businessHit && k.link === 1;
    return { L, days, total, tbPerDay, businessHit, deltaHours, ok, datasyncUsd: Math.round(30720 * 0.0125) };
  };

  /* ---------- stages ---------- */
  const STAGES = [
    {
      type: 'dryrun',
      title: '🧭 Dry run: Oracle se Aurora PostgreSQL, bina lamba downtime',
      intro: 'Fictional GodamTech orders DB. "Agla" dabao; har kadam par socho ki data kahan hai aur rollback kaise hoga.',
      goal: 'Schema convert, full load, CDC aur validation ke baad ek chhote cutover window mein app ko switch karo, rollback raasta rakhte hue.',
      lesson: 'Schema pehle, phir full load, phir CDC se lagatar sync. Cutover sirf tab jab writes rukein, CDC lag 0 ho aur validation Validated ho. Source ko read-only rakh kar rollback ka raasta khula rakha.',
      nodes: [
        { id: 'app', x: 130, y: 260, icon: '🛒', label: 'GodamTech app' },
        { id: 'ora', x: 360, y: 110, icon: '🗄️', label: 'Oracle (on-prem)' },
        { id: 'dms', x: 600, y: 260, icon: '🔁', label: 'DMS task' },
        { id: 'aur', x: 850, y: 110, icon: '🐘', label: 'Aurora PG' },
        { id: 'sc', x: 360, y: 430, icon: '🧩', label: 'Schema Conv.' },
        { id: 'val', x: 850, y: 430, icon: '✅', label: 'Validation' }
      ],
      edges: [{ from: 'app', to: 'ora' }, { from: 'ora', to: 'dms' }, { from: 'dms', to: 'aur' }, { from: 'sc', to: 'aur', dashed: true }, { from: 'dms', to: 'val', dashed: true }, { from: 'app', to: 'aur', dashed: true }],
      panels: [{ id: 'state', title: 'Data kahan hai' }, { id: 'risk', title: 'Risk / rollback' }],
      steps: [
        {
          say: 'Pehle DMS Schema Conversion ka assessment: 92% objects apne aap convert hote hain; 14 PL/SQL packages haath se badalne honge.',
          flows: [{ from: 'sc', to: 'aur', tone: 'acc', label: 'schema' }],
          nodes: { sc: { tone: 'acc', badge: '92% auto' } },
          panels: { state: ['Data abhi sirf Oracle mein'], risk: ['14 packages ka manual kaam'] },
          ask: {
            q: 'Oracle se Aurora PostgreSQL (alag engine) mein schema kaun badlega?',
            choices: [
              'DMS task khud, kyunki full load ke dauran har PL/SQL package apne aap PostgreSQL ban jaata hai',
              'MGN, kyunki server replicate karne se database ka schema bhi badal jaata hai',
              'Kuch nahi, kyunki Aurora PostgreSQL Oracle ke packages seedhe chala leta hai',
              'DMS Schema Conversion (zaroorat ho toh AWS SCT); jo bacha woh team haath se theek kare'
            ],
            answer: 3,
            explain: 'Alag engine (heterogeneous) mein schema conversion alag kadam hai. DMS data chalata hai, schema nahi badalta; Aurora Oracle PL/SQL nahi chalata; MGN server copy karta hai.'
          }
        },
        {
          say: 'Full load: 1.84M orders, 5.21M items, 0.42M customers. AUDIT_TMP (96M scratch rows) ko exclude rule se chhoda.',
          flows: [{ from: 'ora', to: 'dms', tone: 'busy', label: 'full load' }, { from: 'dms', to: 'aur', tone: 'busy' }],
          nodes: { dms: { tone: 'busy', badge: 'full load' } },
          panels: { state: ['Oracle: live writes chal rahe', 'Aurora: copy ban rahi'], risk: ['Load ke dauran naye orders bhi aa rahe'] }
        },
        {
          say: 'Full load ke dauran aur baad ke changes CDC se aate hain: Oracle ke redo logs padh kar DMS inserts/updates/deletes Aurora par lagata hai.',
          flows: [{ from: 'ora', to: 'dms', tone: 'ok', label: 'CDC' }, { from: 'dms', to: 'aur', tone: 'ok', label: 'lag 4 s' }],
          nodes: { dms: { tone: 'ok', badge: 'CDC lag 4 s' } },
          panels: { state: ['Dono jagah lagbhag same data'], risk: ['Supplemental logging off ho toh CDC changes nahi milte'] },
          ask: {
            q: 'Downtime bahut chhota rakhna hai. Kaunsa migration type chunoge?',
            choices: [
              'full-load, phir cutover ke din dobara poora full-load chalao',
              'cdc only, bina full load ke, kyunki CDC purana data bhi copy karta hai',
              'full-load-and-cdc, taaki load ke baad bhi naye changes lagte rahein',
              'Koi DMS nahi; raat ko app band karke export/import, chahe 2 din lagen'
            ],
            answer: 2,
            explain: 'Full load + CDC se target lagatar sync rehta hai, aur cutover window sirf lag drain karne jitni chhoti hoti hai. CDC-only purana data nahi laata; dobara full load ya export/import lamba downtime deta hai.'
          }
        },
        {
          say: 'Validation: DMS source aur target ki rows compare karta hai. Teeno tables Validated; ValidationFailedRecords 0.',
          flows: [{ from: 'dms', to: 'val', tone: 'ok' }],
          nodes: { val: { tone: 'ok', badge: 'Validated' } },
          panels: { state: ['Rows match'], risk: ['Validation business logic test nahi karta'] }
        },
        {
          say: 'Cutover window (raat 1 baje): app mein writes roko, CDC lag 0 tak wait, aakhri validation, phir app ka DB endpoint Aurora par.',
          flows: [{ from: 'app', to: 'aur', tone: 'new', label: 'switch' }],
          nodes: { app: { tone: 'new', badge: 'writes rukein' }, aur: { tone: 'new', badge: 'naya primary' } },
          panels: { state: ['Ab writes sirf Aurora mein'], risk: ['Oracle read-only, rollback ke liye'] },
          ask: {
            q: 'Cutover ke baad koi badi gadbad mile toh rollback kaise sambhav rahega?',
            choices: [
              'Oracle ko turant delete karo, taaki team ke paas wapas jaane ka koi raasta na bache aur sab Aurora par rahein',
              'Oracle ko kuch din read-only rakho aur rollback ka tareeka (reverse sync ya data plan) pehle tay karo',
              'Rollback ki zaroorat nahi, kyunki validation ne har business rule aur report bhi pehle hi test kar liya',
              'Aurora ka snapshot lo; snapshot restore karne se Oracle bhi apne aap purani state mein bhar jaata hai'
            ],
            answer: 1,
            explain: 'Rollback ka plan cutover se pehle banta hai: source bacha rahe aur naye writes ka kya hoga, yeh tay ho. Validation rows compare karta hai, business logic nahi; Aurora snapshot Oracle ko nahi bharta.'
          }
        },
        {
          say: 'Agle din: app Aurora par, CDC task band, Oracle read-only. Do hafte baad sign-off ke baad Oracle aur DMS resources retire.',
          nodes: { ora: { tone: 'idle', badge: 'read-only' }, dms: { tone: 'idle', badge: 'stopped' } },
          panels: { state: ['Aurora primary'], risk: ['Sign-off ke baad hi purana hatao'] }
        }
      ]
    },
    {
      type: 'flowlab',
      title: '🎛️ 30 TB NAS copy: link, window aur deadline',
      goal: '30 TB ka pehla poora copy 7 din ke andar (10 din ki cutover window mein 30% buffer), business traffic slow kiye bina, sabse saste link se.',
      scenario: 'Fictional GodamTech data: NAS par 30 TB, roz lagbhag 200 GB naya data. Abhi ka link 200 Mbps hai. Din mein business ko link ka 60% chahiye, isliye 24 ghante copy chalaoge toh copy 40% se zyada nahi le sakti. Raat ke 10 ghante 90% tak chalega. DataSync basic mode lagbhag $0.0125/GB (30 TB ≈ $384). Link ke daam fictional hain. ISP 1 Gbps upgrade agle din kar deta hai; 10 Gbps Direct Connect ke naye port mein lagbhag 30 din (lead time) lagte hain.',
      knobs: [
        { id: 'link', label: 'Link', min: 0, max: 2, step: 1, value: 0, labels: { 0: '200 Mbps (abhi)', 1: '1 Gbps upgrade', 2: '10 Gbps Direct Connect' } },
        { id: 'window', label: 'Copy kab chale', min: 0, max: 1, step: 1, value: 0, labels: { 0: 'Sirf raat (10 ghante)', 1: '24 ghante' } },
        { id: 'util', label: 'Link ka kitna hissa copy le', min: 30, max: 90, step: 10, value: 90, unit: '%' }
      ],
      model: k => {
        const r = AG.migrationTransferPlan(k);
        return {
          readouts: [
            { label: 'Poora copy (din)', value: r.total.toFixed(1) + (r.L.lead ? ' (lead time ' + r.L.lead + ' din samet)' : ''), tone: r.total <= 7 ? 'ok' : 'bad' },
            { label: 'Roz kitna copy', value: r.tbPerDay.toFixed(2) + ' TB/din', tone: 'acc' },
            { label: 'Business traffic', value: r.businessHit ? 'din mein slow' : 'theek', tone: r.businessHit ? 'bad' : 'ok' },
            { label: 'Link ka extra kharcha', value: r.L.inr ? '₹' + r.L.inr.toLocaleString('en-IN') + ' (fictional)' : '₹0', tone: r.L.inr > 100000 ? 'bad' : 'acc' },
            { label: 'Aakhri 200 GB delta sync', value: r.deltaHours.toFixed(1) + ' ghante', tone: 'acc' },
            { label: 'DataSync (lagbhag)', value: '$' + r.datasyncUsd + ' ≈ ₹' + (r.datasyncUsd * 88).toLocaleString('en-IN'), tone: 'acc' }
          ],
          verdict: r.ok ? { ok: true, text: 'Poora copy ' + r.total.toFixed(1) + ' din mein, business theek, aur sabse sasta link jo kaam karta hai. Aakhri delta sync cutover window mein ' + r.deltaHours.toFixed(1) + ' ghante ka hai.' }
            : { ok: false, text: r.businessHit ? 'Din mein copy 40% se zyada link le rahi hai: business slow hoga.' : r.total > 7 ? 'Poora copy ' + r.total.toFixed(1) + ' din: 7 din ki deadline se zyada.' : 'Kaam toh hota hai, par isse sasta link bhi deadline poori kar deta hai.' }
        };
      },
      check: k => AG.migrationTransferPlan(k).ok,
      lesson: 'Maths pehle: 30 TB = 2.4 × 10¹⁴ bits. 1 Gbps par 40% din-raat ≈ 4.3 TB/din ≈ 6.9 din. 200 Mbps hafton leta hai, aur 10 Gbps Direct Connect ka lead time hi deadline kha jaata hai. Online copy nahi ho paaye tabhi physical raasta socho (aaj Snowball naye customers ke liye band hai; AWS Data Transfer Terminal ki availability dekho).'
    },
    {
      type: 'bins',
      title: '🗂️ 7 Rs: har app ka raasta',
      instructions: 'GodamTech ke har system ko us R mein daalo jo sabse theek baithta hai.',
      bins: [{ id: 'rehost', label: 'Rehost' }, { id: 'replatform', label: 'Replatform' }, { id: 'refactor', label: 'Refactor' }, { id: 'repurchase', label: 'Repurchase' }, { id: 'relocate', label: 'Relocate' }, { id: 'retain', label: 'Retain' }, { id: 'retire', label: 'Retire' }],
      items: [
        { text: 'Inventory app ke 12 Linux VMs, code nahi badalna, deadline tight', bin: 'rehost', explain: 'Server jaisa hai waisa EC2 par: MGN se lift-and-shift.' },
        { text: 'Oracle orders DB ko managed Aurora PostgreSQL par, app mein thode badlav', bin: 'replatform', explain: 'Engine/platform badla, app ka design wahi: replatform.' },
        { text: 'Monolith ka pricing hissa event-driven microservice banana', bin: 'refactor', explain: 'Architecture badalna refactor hai; lamba aur mehenga, par fayda bhi.' },
        { text: 'Purana HR software chhod kar SaaS HR tool lena', bin: 'repurchase', explain: 'Product badal kar SaaS lena repurchase hai.' },
        { text: '20 VMware VMs ko VMware platform par hi AWS mein chalana, hypervisor badle bina', bin: 'relocate', explain: 'VMware jaisa hai waisa AWS par (jaise Amazon EVS): relocate. EC2 par le jaana rehost hota.' },
        { text: 'Factory floor ka scanner server jo local hardware se juda hai', bin: 'retain', explain: 'Abhi on-prem rakhna hi theek: retain.' },
        { text: 'Report server jise 14 mahine se kisi ne nahi khola', bin: 'retire', explain: 'Bina use ka system band karo: retire. Sabse sasta migration.' },
        { text: 'Self-managed MySQL ko RDS for MySQL par, same engine', bin: 'replatform', explain: 'Same engine, managed service: replatform (lift, tinker, shift).' }
      ]
    },
    {
      type: 'order',
      title: '🧾 DMS cutover runbook ka order',
      instructions: 'Cutover raat ke kadam sahi order mein lagao.',
      steps: [
        { text: 'DNS/connection TTL pehle se kam karo aur rollback plan likho', explain: 'Switch jaldi faile, aur wapas jaane ka raasta pehle tay ho.' },
        { text: 'App mein writes roko (maintenance mode)', explain: 'Naye writes rukenge tabhi lag 0 tak pahunchega.' },
        { text: 'CDC lag 0 hone ka wait karo', explain: 'Saare aakhri changes target par lag jaayein.' },
        { text: 'Validation aur row counts ka aakhri check', explain: 'Mismatch ho toh yahin rukna sasta hai.' },
        { text: 'App ka DB endpoint Aurora par switch karo, writes wapas kholo', explain: 'Ab Aurora primary hai.' },
        { text: 'Source ko read-only rakh kar smoke tests aur monitoring', explain: 'Rollback window ke dauran purana data bacha rahe.' }
      ]
    },
    {
      type: 'triage',
      title: '🩺 DMS task chala, par target mein naye orders nahi',
      symptom: 'Fictional: godam-orders ka full load 2 din pehle poora hua. Tab se Oracle mein 4,210 naye orders aaye, par Aurora mein ek bhi nahi.',
      goal: 'Task ki setting aur source ki CDC taiyaari dekho. Wajah aur sahi fix chuno.',
      commands: [
        { cmd: 'aws dms describe-replication-tasks --filters Name=replication-task-id,Values=godam-orders --without-settings', out: '"MigrationType": "full-load", "Status": "stopped", "StopReason": "Stop Reason FULL_LOAD_ONLY_FINISHED"', clue: true, note: 'Task sirf full load ke liye bana tha; CDC kabhi chala hi nahi.' },
        { cmd: 'aws dms describe-table-statistics --replication-task-arn ' + TASK, out: 'ORDERS: FullLoadRows 1840000, Inserts 0, Updates 0; ORDER_ITEMS: FullLoadRows 5210000, Inserts 0', clue: true, note: 'Full load ke baad koi change nahi laga.' },
        { cmd: "SELECT supplemental_log_data_min FROM v$database;  (DBA, Oracle par)", out: 'SUPPLEMENTAL_LOG_DATA_MIN: YES', clue: false, note: 'Source CDC ke liye taiyaar hai; dikkat task ke type mein hai.' }
      ],
      questions: [
        {
          q: 'Naye orders Aurora mein kyun nahi aaye?',
          choices: [
            'Aurora ka storage bhar gaya, isliye naye orders reject ho rahe hain',
            'Task full-load type ka tha; load ke baad woh ruk gaya aur CDC chala hi nahi',
            'Oracle mein supplemental logging band hai, isliye DMS changes nahi padh pa raha',
            'Replication instance public subnet mein hai, isliye CDC traffic block hai'
          ],
          answer: 1,
          explain: 'StopReason FULL_LOAD_ONLY_FINISHED aur Inserts 0 dikhate hain ki task ka type full-load tha. DBA ne supplemental logging YES dikhaya; storage ya subnet ka koi saboot nahi.'
        },
        {
          q: 'Sabse sahi fix kya hai?',
          choices: [
            'Task ko full-load-and-cdc mein badlo aur reload-target se chalao, taaki koi change chhoote nahi',
            'Wahi full-load task resume-processing se dobara chalao, CDC apne aap shuru ho jaayega',
            'Naye orders ko CSV mein nikaal kar haath se Aurora mein daalo, har din',
            'Task delete karke sirf cdc type ka naya task banao, aaj ke time se shuru'
          ],
          answer: 0,
          explain: 'Type badal kar reload-target se full load + CDC dobara chalta hai aur beech ke changes bhi aate hain. Resume full-load task mein CDC nahi laata; haath se copy galti wala hai; aaj se CDC beech ke 4,210 orders chhod dega.'
        }
      ]
    },
    {
      type: 'terminal',
      title: '🖥️ GodamTech orders ka DMS migration chalao',
      instructions: 'Sirf app ka DMS fixture; koi AWS call nahi, koi data copy nahi. ls/cat se runbook.txt aur JSON files padho.',
      goal: '<p><b>1.</b> DBA ka source endpoint <code>godam-oracle</code> pehle se hai; use mat badlo. Private replication instance <code>godam-ri</code> banao: <code>dms.r6i.large</code>, 100 GB, subnet group <code>godam-private</code>, <b>public IP nahi</b>. Available hone ka wait karo.</p><p><b>2.</b> Target endpoint <code>godam-aurora</code>: aurora-postgresql, database <code>shop</code>, credentials <code>aurora-settings.json</code> ke Secrets Manager secret se (command line par password nahi). Dono endpoints par <code>test-connection</code>, phir <code>wait test-connection-succeeds</code>.</p><p><b>3.</b> Task <code>godam-orders</code>: <b>full-load-and-cdc</b>, <code>mappings-orders.json</code> (AUDIT_TMP bahar), <code>task-settings.json</code> (validation ON). Ready ka wait, <code>start-replication</code>, running ka wait.</p><p><b>4.</b> Aakhir mein <code>describe-table-statistics</code> se aaj ki statistics padho: teen tables, full load rows, CDC changes aur ValidationState Validated.</p>',
      account: seed(),
      files: FILES,
      tasks,
      solution,
      hints: [
        'Pehle aws dms describe-endpoints se source ka ARN dekho. Instance ke liye --no-publicly-accessible aur --replication-subnet-group-identifier godam-private do.',
        'Target ke liye --postgre-sql-settings file://aurora-settings.json; test-connection har endpoint par alag, phir aws dms wait test-connection-succeeds --filters Name=endpoint-arn,Values=<src>,<tgt>.',
        'Task mein --migration-type full-load-and-cdc aur --table-mappings file://mappings-orders.json. Waiters: replication-task-ready, phir start, phir replication-task-running.'
      ],
      success: s => tasks.every(t => t.check(s)),
      successText: 'Private instance, secret wala target, dono connections successful; godam-orders full load + CDC ke saath running, AUDIT_TMP bahar aur validation Validated. Asli AWS mein: CDC latency aur validation failures monitor karo, cutover runbook ki practice karo, aur source ko rollback window tak read-only rakho.'
    },
    {
      type: 'docker',
      title: '🐳 Lab29: SQLite se mini migration aur cutover',
      project: '29-migration-cutover',
      goal: 'Bina Docker ke ek asli chhota migration: SQLite "on-prem" source se Moto DynamoDB mein full load, change log ka CDC replay, counts aur checksums se validation, aur cutover runbook. Saath mein NAS folder ka aws s3 sync aur DMS metadata.',
      why: 'Moto DMS sirf metadata rakhta hai: koi data nahi chalta, table statistics aur modify 500 dete hain. Isliye data ka hissa host par Python (sqlite3 + boto3) se chalta hai, aur lab saaf batati hai ki kaunsa hissa Moto ka hai.',
      steps: [
        { text: 'aws-gurukul se README aur lab.py padho, phir exact runner chalao.', cmd: './docker-labs/.venv/bin/python -I docker-labs/29-migration-cutover/lab.py', expect: '10 behaviour checks + cleanup = 11 PASS, phir OWNED MOTO STOPPED / LISTENER CLOSED.' },
        { text: 'FULL LOAD, CDC REPLAY aur VALIDATION wali lines padho.', expect: 'Sirf full load ke baad 30 rows alag; CDC replay (do baar) ke baad 0 mismatches aur poore table ka fingerprint same.' },
        { text: 'GAP aur S3 SYNC wali lines padho.', expect: 'DMS metadata Moto par bana, par table statistics aur modify GAP (500); dusre sync mein sirf 1 badli file gayi.' }
      ],
      observe: {
        q: 'Lab29 asal mein kya saabit karti hai?',
        choices: [
          'Moto DMS ne SQLite ka data DynamoDB mein copy kiya aur CDC khud chalaya',
          'Asli AWS DMS ne GodamTech ka Oracle data Aurora mein migrate kar diya',
          'Host par full load, CDC replay aur checksum validation chale; Moto DMS sirf metadata tha',
          'S3 sync ne har baar saari files dobara bheji, isliye delta sync ka koi fayda nahi'
        ],
        answer: 2,
        explain: 'Data ka kaam host ke Python ne kiya aur checksums se jaancha. Moto DMS sirf metadata rakhta hai; asli AWS ya Oracle nahi chala; dusre sync mein sirf badli file gayi.'
      }
    },
    {
      type: 'quiz',
      title: '🎓 Migration ke faisle',
      questions: [
        {
          q: '40 Linux/Windows VMs ko 3 mahine mein EC2 par le jaana hai, code badle bina, kam downtime ke saath. Kya chunoge?',
          choices: ['DMS, kyunki woh poore server copy karta hai', 'Sirf AMI export, bina replication ke', 'Har server ko haath se dobara banana', 'Application Migration Service (MGN) se rehost'],
          answer: 3,
          explain: 'MGN servers ko lagatar block-level replicate karta hai aur test/cutover instances launch karta hai. DMS sirf databases ke liye hai; haath se banana dheema aur galti wala; bina replication ka export downtime badhata hai.'
        },
        {
          q: 'Oracle se Aurora PostgreSQL, downtime minutes mein. Sahi jodi?',
          choices: ['MGN + snapshot restore, engine wahi rehta hai', 'DataSync + S3 sync, phir Aurora mein import', 'DMS Schema Conversion + DMS full load + CDC', 'Transfer Family se SFTP par dump upload'],
          answer: 2,
          explain: 'Alag engine ke liye schema conversion aur data ke liye DMS full load + CDC. MGN/snapshot engine nahi badalte, DataSync files ke liye hai, aur Transfer Family file upload ka raasta hai.'
        },
        {
          q: '20 VMware VMs ko VMware platform par hi AWS mein chalana hai, hypervisor ya app badle bina. Yeh kaunsa R hai?',
          choices: ['Relocate (jaise Amazon EVS par chalana)', 'Rehost, har VM EC2 instance banta hai', 'Refactor, platform badal raha hai', 'Repurchase, VMware ek product hai'],
          answer: 0,
          explain: 'VMware jaisa hai waisa AWS par chalana relocate hai. VM ko EC2 instance banana rehost hota; design badalna refactor; SaaS lena repurchase.'
        },
        {
          q: '30 TB data, 1 Gbps link par 40% din-raat. Lagbhag kitne din?',
          choices: ['Lagbhag 1 din', 'Lagbhag 30 din', 'Lagbhag 2 ghante', 'Lagbhag 7 din'],
          answer: 3,
          explain: '30 TB × 8 = 240 Tb. 1 Gbps × 40% = 0.4 Gbps ≈ 34.6 Tb/din. 240 ÷ 34.6 ≈ 6.9 din. Ek din ya 2 ghante ke liye link 10 guna se zyada tez chahiye hota.'
        },
        {
          q: 'GodamTech ke partners roz SFTP se files bhejte hain, aur files S3 mein chahiye. Kya lagaoge?',
          choices: ['AWS Transfer Family (SFTP endpoint, S3 backend)', 'DataSync agent har partner ke office mein', 'DMS task jo SFTP ko source maane', 'CloudFront distribution upload ke liye'],
          answer: 0,
          explain: 'Transfer Family managed SFTP/FTPS/FTP/AS2 deta hai aur S3/EFS mein likhta hai. DataSync partner ke office mein nahi lagta, DMS SFTP nahi padhta, CloudFront upload server nahi.'
        },
        {
          q: 'DMS task running hai par Oracle ke naye changes target tak nahi aa rahe. Task full-load-and-cdc hai. Pehle kya check karoge?',
          choices: ['Aurora ka instance size badha do, taaki changes tezi se apply ho sakein', 'Oracle par supplemental logging aur archive logs (CDC ki zarooratein)', 'Replication instance ko public subnet mein le jao, taaki Oracle tak pahunch sake', 'Task delete karke naya full-load task banao, woh changes bhi le aayega'],
          answer: 1,
          explain: 'Oracle CDC ke liye supplemental logging aur archivelog chahiye. Size badhana ya public subnet wajah nahi; naya full-load task CDC nahi laata.'
        },
        {
          q: 'Naye AWS account mein migration ki discovery aur planning shuru karni hai (2026). Aaj kya dekhoge?',
          choices: ['Sirf Migration Hub, kyunki 2025 ke baad bhi naye customers ke liye wahi khula hai', 'Snowball Edge mangwao, kyunki discovery aur server inventory bhi wahi device karta hai', 'AWS Transform; Migration Hub aur Application Discovery Service naye customers ke liye band hain', 'CloudTrail on karo, kyunki on-prem servers aur unki dependencies ki list wahi deta hai'],
          answer: 2,
          explain: 'Migration Hub aur Application Discovery Service 7 Nov 2025 se naye customers ke liye band hain; AWS Transform unki jagah hai. Snowball transfer device hai (woh bhi naye customers ke liye band), aur CloudTrail AWS API calls likhta hai.'
        },
        {
          q: 'Cutover ke baad Oracle ka kya karoge?',
          choices: ['Usi raat delete karo, taaki licence ka paisa turant bache', 'Read-only rakho, rollback window aur sign-off ke baad retire', 'Dono DBs mein writes hamesha chalu rakho, dono jagah data rahe', 'Usse naye DMS task ka target bana kar data wapas bhejo'],
          answer: 1,
          explain: 'Source rollback ka raasta hai; sign-off ke baad hi retire karo. Usi raat delete risk hai, dono jagah writes data ko alag kar dete hain, aur source ko target banana gadbad karta hai.'
        }
      ]
    }
  ];

  const INTERVIEW = {
    title: 'Interview: 7 Rs, transfer maths aur ek adhoora DMS task',
    instructions: 'Chaar faisle, phir terminal mein woh task theek karo jo full load ke baad ruk gaya.',
    questions: [
      {
        q: 'Interviewer: "200 apps hain. Sabko ek hi strategy se migrate karein?"',
        choices: ['Haan, sab rehost karo; sabse tez aur sabse sasta raasta yahi hai har app ke liye', 'Haan, sab refactor karo; cloud ka poora fayda isi se milta hai, deadline chahe jo ho', 'Nahi; har app ke liye 7 Rs mein se R, waves mein, business value ke hisaab se', 'Nahi; pehle saari apps retire karo, phir dekhenge kya bacha'],
        answer: 2,
        explain: 'Portfolio mein har app alag hai: kuch retire, kuch rehost, kuch replatform/refactor. Ek hi R sab par lagana ya sab retire karna sahi nahi.'
      },
      {
        q: '"DMS ke CDC ka fayda kya hai?"',
        choices: ['Schema apne aap convert ho jaata hai, isliye Schema Conversion ki zaroorat nahi', 'Full load ke baad naye changes lagte rehte hain, isliye cutover window chhoti', 'Network bandwidth zero lagti hai, kyunki CDC sirf metadata bhejta hai', 'Source database ki zaroorat khatam ho jaati hai, load ke turant baad'],
        answer: 1,
        explain: 'CDC source ke changes lagatar target par lagata hai, isliye downtime sirf lag drain karne jitna. Schema conversion alag tool hai, bandwidth lagti hai, aur source cutover tak chahiye.'
      },
      {
        q: '"80 TB, 100 Mbps link, 2 hafte. Online ho jaayega?"',
        choices: ['Haan, 100 Mbps par 80 TB lagbhag ek din mein chala jaata hai', 'Haan, DataSync compression se link 10 guna tez ho jaata hai', 'Nahi pata, kyunki transfer ka andaaza maths se nahi lagta', 'Nahi; lagbhag 74 din lagenge, physical ya bada link socho'],
        answer: 3,
        explain: '80 TB × 8 = 640 Tb; 100 Mbps poore din ≈ 8.64 Tb/din ≈ 74 din. Do hafte mein online nahi hoga.'
      },
      {
        q: '"Cutover se pehle kya pakka hona chahiye?"',
        choices: ['Writes ruke, CDC lag 0, validation theek, rollback plan likha', 'Source DB pehle hi delete ho chuka ho, taaki confusion na rahe', 'Saare alarms band hon, taaki cutover ke dauran noise na ho', 'Target par koi test na chala ho, taaki data bilkul saaf rahe'],
        answer: 0,
        explain: 'Cutover tab jab target poora aur jaancha hua ho, aur wapas jaane ka raasta ho. Source delete, alarms band ya bina test switch risk badhate hain.'
      },
      {
        terminal: {
          title: '🖥️ Full-load task ko CDC par lao',
          instructions: 'Sirf app ka DMS fixture. godam-orders full load ke baad ruk gaya aur naye orders nahi aaye. Wahi task theek karo.',
          goal: '<p>godam-orders abhi <code>full-load</code> type ka hai aur <code>stopped</code> (FULL_LOAD_ONLY_FINISHED). Ise <b>full-load-and-cdc</b> mein badlo, <b>reload-target</b> se chalao taaki beech ke changes bhi aayein, running ka wait karo, aur aakhir mein aaj ki table statistics padho. Naya task, naya endpoint ya resume-processing nahi chalega.</p>',
          account: iseed(),
          files: FILES,
          tasks: itasks,
          solution: isolution,
          hints: ['aws dms describe-replication-tasks se task ka ARN aur MigrationType dekho.', 'modify-replication-task --migration-type full-load-and-cdc, phir start-replication-task --start-replication-task-type reload-target, phir aws dms wait replication-task-running.'],
          success: s => itasks.every(t => t.check(s)),
          successText: 'Wahi task ab full load + CDC ke saath reload-target se chal raha hai; beech ke changes bhi aayenge. Asli AWS mein reload target tables ko dobara bharta hai: iska time aur load pehle socho.'
        }
      }
    ]
  };

  AG.registerLevels('advanced', [{
    id: 'migration',
    icon: '🚚',
    title: 'Migration — 7 Rs, MGN, DMS aur cutover',
    badge: 'Migration Maha',
    objectives: [
      'Har app ke liye 7 Rs mein se sahi raasta chunna (relocate ka sahi matlab samet)',
      'Rehost ke liye MGN aur databases ke liye DMS Schema Conversion + DMS full load + CDC ka flow samajhna',
      'TB aur Mbps se transfer ka time nikaal kar DataSync, Transfer Family ya physical raasta chunna',
      'Writes rok kar, lag 0 aur validation ke baad, rollback raasta rakhte hue cutover karna'
    ],
    hook: {
      when: 'ShopKaro course ki kahani (fictional)',
      title: 'GodamTech ki lease 9 mahine mein khatam',
      text: 'ShopKaro ne warehouse company GodamTech khareedi. Unke datacenter mein 40 VMware VMs, ek Oracle orders DB aur NAS par 30 TB files hain. Lease 9 mahine mein khatam hoti hai. Ravi kehta hai "sab kuch ek weekend mein EC2 par utha do". Neha ko downtime aur data loss ka darr hai.',
      mission: 'Har system ka raasta chuno, data move ka maths karo, aur orders DB ko kam downtime ke saath Aurora par le jao, rollback raasta rakhte hue. Course fixtures asli migration nahi.'
    },
    steps: [
      {
        q: '7 Rs mein se kaunsa raasta kab?',
        analogy: 'Ghar shift karna: wahi furniture le jao (rehost), naya fridge le lo (replatform), ghar ka naksha badlo (refactor), purana furniture becho (retire), kuch purane ghar mein chhodo (retain), furniture kiraye par lo (repurchase), ya poora container jaisa hai waisa jahaz par chadha do (relocate).',
        body: '<p><b>Rehost</b>: server jaisa hai waisa EC2 par. <b>Replatform</b>: thoda badlav, jaise self-managed DB se RDS/Aurora. <b>Refactor</b>: design badalna, jaise monolith se microservices. <b>Repurchase</b>: SaaS product lena. <b>Retire</b>: band karna. <b>Retain</b>: abhi on-prem rakhna. <b>Relocate</b>: VMware jaisa platform jaisa hai waisa AWS par (jaise <b>Amazon EVS</b>, Aug 2025 se GA); VM ko EC2 banana relocate nahi, rehost hai.</p>',
        points: ['Retire sabse sasta migration hai: pehle bina use ke systems dhoondho', 'Deadline tight ho toh rehost, baad mein modernize', 'Ek portfolio mein kai Rs saath chalte hain'],
        asli: 'Har app ke liye R alag chuno: business value, deadline, risk aur team ki taakat dekh kar.'
      },
      {
        q: 'Discovery aur waves kyun?',
        analogy: 'Shift karne se pehle ghar ki har cheez ki list banate ho, aur kaunsa dabba kis ke saath jaayega, yeh tay karte ho.',
        body: '<p>Pehle inventory: servers, unka size, kaun kisse baat karta hai (dependencies). Phir <b>waves</b>: saath mein jaane wale systems ek group mein. Naye account mein planning ke liye <b>AWS Transform</b> dekho; <b>Migration Hub</b> aur <b>Application Discovery Service</b> 7 Nov 2025 se naye customers ke liye band hain (purane customers ke liye chalte hain). Exam ke purane sawaal inke naam le sakte hain.</p>',
        points: ['Dependency map ke bina ek server move karne se doosra toot sakta hai', 'Pehli wave chhoti aur kam risk wali rakho, seekhne ke liye', 'Business case mein licence, hardware aur team ka kharcha bhi gino'],
        asli: 'Pehle list aur rishton ka naksha, phir waves. Bina discovery ke "ek weekend mein sab" hamesha toot-ta hai.'
      },
      {
        q: 'MGN se rehost kaise hota hai?',
        analogy: 'Ghar ka saamaan pehle se naye ghar mein copy hota rehta hai; shift wale din sirf aakhri dabba aur chaabi badalni hai.',
        body: '<p><b>Application Migration Service (MGN)</b> (docs mein ab "AWS Transform MGN" naam) source server par replication agent lagata hai. Disk ka data lagatar block-level AWS mein replicate hota hai. Phir <b>test instance</b> launch karke app jaancho, aur cutover par aakhri sync ke baad <b>cutover instance</b> chalu karo. Har source server ke liye 2,160 ghante (lagbhag 90 din) MGN ki fee nahi lagti; replication servers, EBS aur test/cutover instances ka bill alag lagta hai.</p>',
        points: ['Downtime sirf cutover ke minutes ka, kyunki data pehle se sync hai', 'Test instance par app ko poora chala kar dekho, cutover se pehle', 'Server Migration Service (SMS) band ho chuka hai; aaj MGN'],
        asli: 'Lift-and-shift ka matlab bina test ke switch nahi. Test launch karo, phir cutover.'
      },
      {
        q: 'Databases kaise move karein?',
        analogy: 'Almari ko naye ghar le jaate hue usme kapde rakhte rehna: pehle bada saamaan, phir naye kapde jo aate rahe.',
        body: '<p>Same engine (homogeneous) mein native tools (jaise pg_dump, Data Pump, replication) ya DMS. Alag engine (heterogeneous) mein pehle <b>DMS Schema Conversion</b> (AWS ki aaj ki salah; AWS SCT purana/offline raasta) se schema, phir <b>DMS</b> se data. DMS <b>full load</b> purana data laata hai aur <b>CDC</b> naye changes lagata rehta hai. <b>Validation</b> rows compare karta hai. Oracle CDC ke liye supplemental logging aur archive logs chahiye.</p>',
        points: ['Migration types: full-load, cdc, full-load-and-cdc', 'Table mappings se scratch/temp tables bahar rakho', 'Replication instance private subnet mein, credentials Secrets Manager mein'],
        asli: 'DMS data chalata hai, schema nahi badalta aur business logic test nahi karta. Teeno alag kadam hain.'
      },
      {
        q: 'Files aur bada data kaise jaaye?',
        analogy: 'Thoda saamaan apni gaadi mein, bahut saara truck mein; truck mangwane ka time bhi ginna padta hai.',
        body: '<p><b>DataSync</b> online copy karta hai (NFS/SMB/HDFS/object → S3/EFS/FSx), verification aur scheduling ke saath; basic mode lagbhag $0.0125/GB. <b>Transfer Family</b> partners ko SFTP/FTPS/FTP/AS2 se S3/EFS mein files bhejne deta hai. <b>Storage Gateway</b> on-prem apps ko cloud storage se jodta hai (hybrid). Physical raasta: Snowball Edge 7 Nov 2025 se naye customers ke liye band hai (purane customers ka support 31 Dec 2026 tak); naye account mein AWS Data Transfer Terminal ki availability dekho.</p>',
        points: ['Pehle maths: link par kitne din lagenge', 'Aakhri delta sync cutover window mein fit hona chahiye', 'Partner uploads ke liye Transfer Family, migration copy ke liye DataSync'],
        asli: 'Online copy deadline mein ho jaaye toh wahi sabse simple hai. Physical raasta tabhi jab maths mana kare.'
      },
      {
        q: 'Transfer ka time kaise nikaalein?',
        analogy: 'Paani ki tanki kitni der mein bharegi: tanki ka size ÷ nal ki speed. Nal poora khula nahi hota, toh time aur badhta hai.',
        body: '<p>Formula: <b>din = (TB × 8 × 10¹²) ÷ (Mbps × 10⁶ × utilisation × 86,400)</b>. Example: 30 TB, 1 Gbps, 40% → 2.4 × 10¹⁴ ÷ (4 × 10⁸ × 86,400) ≈ 6.9 din. 200 Mbps par 90% sirf raat ke 10 ghante → lagbhag 37 din. 10 Gbps Direct Connect tez hai, par naye port mein hafte lag sakte hain.</p>',
        points: ['Byte mein 8 bits: TB ko bits mein badlo', 'Utilisation 100% kabhi nahi; business ko bhi link chahiye', 'Lead time (naya link ya device) bhi deadline mein gino'],
        asli: 'Pehle maths, phir tool. Andaaze se chuna raasta deadline par toot-ta hai.'
      },
      {
        q: 'Cutover aur rollback kaise plan karein?',
        analogy: 'Shift wale din purane ghar ki chaabi tab tak mat do jab tak naye ghar mein bijli-paani chalu na ho jaaye.',
        body: '<p>Pehle se TTL kam karo aur rollback ka tareeka likho. Cutover raat: writes roko, CDC lag 0, aakhri validation, phir app ka endpoint switch. Source ko kuch din <b>read-only</b> rakho. Rollback ka matlab tay karo: naye writes ka kya hoga (reverse sync ya data plan). Sign-off ke baad hi source aur DMS resources retire.</p>',
        points: ['Cutover ka dry run pehle karo, time naapo', 'Go/No-Go ke saaf niyam likho (lag, validation, errors)', 'Switch ke baad monitoring aur smoke tests'],
        asli: 'Cutover ek din ka kaam nahi, ek practice ki hui script hai, jisme wapas jaane ka raasta bhi hai.'
      },
      {
        q: 'Migration ke baad kya?',
        analogy: 'Naye ghar mein saamaan rakh diya; ab dekho kaunsa kamra kaise behtar banega.',
        body: '<p>Rehost ke baad <b>right-size</b> karo (CloudWatch data se), purane VMs/licence band karo, aur backups/alarms lagao. Phir modernize: EC2 par chalta DB → RDS/Aurora (replatform), bhaari hisse → containers ya serverless (refactor). Sabse pehle wahi badlo jiska business fayda sabse zyada hai.</p>',
        points: ['Move ke baad bill dekho; bina right-size rehost mehenga ho sakta hai', 'Purana datacenter aur licence sahi samay par band karo', 'Modernization ko waves mein, measure karke'],
        asli: 'Migration finish line nahi. Move ke baad hi asli bachat aur sudhaar shuru hote hain.'
      }
    ],
    myth: [
      { myth: 'Relocate ka matlab VMware VMs ko EC2 par le jaana.', sach: 'VM ko EC2 instance banana rehost hai. Relocate ka matlab VMware platform jaisa hai waisa AWS par chalana (jaise Amazon EVS).' },
      { myth: 'DMS Oracle ka schema bhi apne aap PostgreSQL bana deta hai.', sach: 'DMS data chalata hai. Alag engine ke schema ke liye DMS Schema Conversion (ya AWS SCT) aur kuch haath ka kaam chahiye.' },
      { myth: 'Full-load task ke baad naye changes apne aap aate rehte hain.', sach: 'Sirf full-load-and-cdc ya cdc task changes lagata hai, aur source par CDC ki zarooratein (jaise supplemental logging) on honi chahiye.' },
      { myth: '30 TB toh 1 Gbps par ek raat mein chala jaayega.', sach: '30 TB = 240 Tb. 1 Gbps poora bhi chale toh lagbhag 2.8 din; 40% par lagbhag 6.9 din. Maths pehle karo.' }
    ],
    playbook: {
      title: 'Discovery → R chuno → maths → sync → cutover',
      use: ['MGN se rehost, test instance ke saath', 'DMS Schema Conversion + DMS full load + CDC + validation', 'DataSync online copy, jab maths deadline mein fit ho'],
      avoid: ['Bina dependency map ke "ek weekend mein sab"', 'Full-load-only task par cutover ki planning', 'Cutover ki raat source delete karna'],
      how: ['Inventory aur dependencies, phir waves', 'Har app ke liye R aur success ke niyam', 'Data ke liye maths, tool, aur aakhri delta ka time', 'Cutover runbook ki practice, Go/No-Go, rollback, phir sign-off ke baad retire'],
      redflags: ['CDC lag badhta ja raha hai', 'ValidationFailedRecords 0 nahi', 'Replication instance public subnet mein, ya password command line par', 'Transfer ka andaaza bina maths ke'],
      rule: 'Har app ka apna R, har data ka apna maths, aur har cutover ka apna rollback.'
    },
    exam: [
      { cue: 'Servers ko lift-and-shift, kam downtime', pick: 'Application Migration Service (MGN)' },
      { cue: 'VMware workloads bina badlav ke AWS par', pick: 'Relocate: Amazon EVS (ya VMware Cloud on AWS)' },
      { cue: 'Alag engine ka DB migration (Oracle → PostgreSQL)', pick: 'DMS Schema Conversion (ya SCT) + DMS' },
      { cue: 'DB migration, minimum downtime', pick: 'DMS full load + CDC' },
      { cue: 'Bahut TB, deadline, link kaafi hai', pick: 'DataSync' },
      { cue: 'Bahut TB, link kam, deadline paas', pick: 'Physical transfer (Snowball purane customers ke liye; naye account mein Data Transfer Terminal dekho)' },
      { cue: 'On-prem servers ki inventory aur dependencies', pick: 'AWS Transform (Application Discovery Service purane customers ke liye)' },
      { cue: 'Partners SFTP se S3 mein files bhejein', pick: 'AWS Transfer Family' },
      { cue: 'On-prem app ko S3 par file share chahiye (hybrid)', pick: 'Storage Gateway (S3 File Gateway)' }
    ],
    stages: STAGES,
    interview: INTERVIEW,
    success: [
      'Har app ke liye 7 Rs mein se sahi raasta, relocate ke sahi matlab ke saath, chun sakta hoon.',
      'MGN, DMS Schema Conversion aur DMS full load + CDC + validation ka flow samjha kar chala sakta hoon.',
      'Transfer ka maths karke DataSync/Transfer Family/physical raasta chun sakta hoon aur rollback ke saath cutover plan kar sakta hoon.'
    ],
    homework: '<p>Optional, sirf approved asli-AWS sandbox mein; DMS instance, endpoints, Aurora/RDS aur data transfer ka bill lagta hai. Ek chhota RDS for MySQL (source) aur ek Aurora PostgreSQL ya RDS PostgreSQL (target) banao, credentials Secrets Manager mein rakho. Private subnet mein DMS replication instance, dono endpoints, test-connection, aur ek full-load-and-cdc task (validation ON) chalao. Source par kuch rows daalo/badlo aur target par dekho. Cutover ka chhota dry run karo: writes roko, lag 0, switch. Cleanup: task, endpoints, replication instance, dono databases, secrets aur subnet group delete karo; billing dashboard agle din dekho.</p>',
    cards: [
      { front: 'Relocate ka sahi matlab?', back: 'VMware platform jaisa hai waisa AWS par (jaise Amazon EVS). VM → EC2 instance banana rehost hai.' },
      { front: 'MGN kya karta hai?', back: 'Server ka lagatar block-level replication, test aur cutover instances. Har server 2,160 ghante fee-free; infra ka bill alag.' },
      { front: 'Heterogeneous DB migration?', back: 'DMS Schema Conversion (ya SCT) se schema, DMS se data: full load + CDC + validation.' },
      { front: 'full-load vs full-load-and-cdc?', back: 'full-load purana data laakar ruk jaata hai. full-load-and-cdc uske baad naye changes bhi lagata rehta hai.' },
      { front: 'Oracle CDC ki zaroorat?', back: 'Supplemental logging aur archivelog. Iske bina CDC changes nahi padh sakta.' },
      { front: 'Transfer ka formula?', back: 'Din = TB × 8 × 10¹² ÷ (Mbps × 10⁶ × utilisation × 86,400). 30 TB, 1 Gbps, 40% ≈ 6.9 din.' },
      { front: 'Discovery tools aaj?', back: 'AWS Transform. Migration Hub aur Application Discovery Service 7 Nov 2025 se naye customers ke liye band.' },
      { front: 'Cutover se pehle?', back: 'Writes roko, CDC lag 0, validation theek, rollback plan. Source read-only rakho; sign-off ke baad retire.' }
    ]
  }]);

  AG.migrationFixtures = { seed, iseed, tasks, itasks, solution, isolution, FILES, RI, TGT, TASK, SRC, LINKS };
})();
