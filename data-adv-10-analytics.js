/* Advanced 9b — analytics: data lake zones, partitions + columnar, Glue catalog, Athena cost guards, streaming ingest.
   ShopKaro course story (fictional). Fixture data only; see analytics-cli.js for the bounded Glue/Athena model. */
(() => {
  const copy = x => JSON.parse(JSON.stringify(x));
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const ACCT = '555555555555', R = 'ap-south-1', MB = 1024 * 1024;
  const GLUE_ROLE = `arn:aws:iam::${ACCT}:role/glue-crawler`;
  const CURATED = 's3://shopkaro-lake/curated/orders/', RAW = 's3://shopkaro-lake/raw/orders/';
  const day = i => new Date(Date.parse('2026-10-21T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
  const DAYS = Array.from({ length: 30 }, (_, i) => day(i)); // 2026-10-21 .. 2026-11-19
  const NEWDAY = '2026-11-20';
  const STATES = ['RJ', 'MH', 'DL', 'KA', 'UP', 'GJ'], SKUS = ['kurta-blue', 'kurta-red', 'saree-silk', 'dupatta'];
  const rowsFor = d => Array.from({ length: 6 }, (_, k) => { const n = Number(d.slice(8)) * 7 + k * 13; return { dt: d, order_id: Number(d.replace(/-/g, '').slice(2)) * 10 + k, state: STATES[n % 6], sku: SKUS[(n >> 1) % 4], qty: 1 + n % 4, price: 499 + (n % 5) * 200, customer_id: 'TEST-c-' + (n % 97), channel: k % 2 ? 'app' : 'web' }; });
  const COLS = ['order_id', 'state', 'sku', 'qty', 'price', 'customer_id', 'channel', 'ts'].map(n => ({ Name: n, Type: ['order_id', 'qty', 'price'].includes(n) ? 'bigint' : 'string' }));
  const curatedTable = (db, name, parts) => ({ database: db, name, format: 'parquet', location: CURATED, columns: copy(COLS).map(c => ({ name: c.Name, Name: c.Name, Type: c.Type })), partitionKeys: ['dt'], partitions: parts.slice(), s3Partitions: DAYS.slice(), bytesPerPartition: 80 * MB, rows: DAYS.flatMap(rowsFor) });
  const rawTable = () => ({ database: 'raw_zone', name: 'orders_raw', format: 'csv', location: RAW, columns: copy(COLS).map(c => ({ name: c.Name, Name: c.Name, Type: c.Type })), partitionKeys: [], partitions: ['all'], s3Partitions: ['all'], bytesPerPartition: 10 * 1024 * MB, rows: DAYS.flatMap(rowsFor).map(r => ({ ...r, dt: 'all' })) });
  const FILES = {
    'crawler-targets.json': { content: JSON.stringify({ S3Targets: [{ Path: CURATED }] }, null, 2) },
    'workgroup.json': { content: JSON.stringify({ ResultConfiguration: { OutputLocation: 's3://shopkaro-lake/athena-results/' }, EnforceWorkGroupConfiguration: true, BytesScannedCutoffPerQuery: 1073741824 }, null, 2) },
    'lake-layout.txt': { content: 'shopkaro-lake (fictional)\n  raw/orders/            daily CSV export, ~10 GB, partition nahi (table raw_zone.orders_raw)\n  curated/orders/dt=YYYY-MM-DD/   Parquet, ek din ~80 MB, 30 din (2026-10-21 .. 2026-11-19)\n  athena-results/        query results\nNeha ka sawaal: pichhle 7 din (2026-11-13 .. 2026-11-19) mein har state mein kaunsa SKU kitna bika?\nColumns: order_id, state, sku, qty, price, customer_id, channel, ts (+ partition dt)\nCrawler role: ' + GLUE_ROLE + '\n' }
  };

  /* Crawler hook used by analytics-cli.js: the curated path yields a partitioned Parquet table. */
  AG.lakeCrawl = (a, c) => {
    const made = [];
    for (const p of c.paths) {
      if (p !== CURATED) continue;
      const name = (c.prefix || '') + 'orders';
      const t = (a.glueTables || []).find(x => x.database === c.db && x.name === name);
      if (t) { t.partitions = t.s3Partitions.slice(); made.push(name); }
      else { (a.glueTables || (a.glueTables = [])).push({ ...curatedTable(c.db, name, DAYS), s3Partitions: (a.lakeS3Partitions || DAYS).slice(), partitions: (a.lakeS3Partitions || DAYS).slice() }); made.push(name); }
    }
    return made;
  };

  const ident = { Account: ACCT, Arn: `arn:aws:iam::${ACCT}:role/data-analyst` };
  function seed() { return { lakeMode: true, region: R, callerIdentity: copy(ident), glueDatabases: [{ name: 'raw_zone' }], glueTables: [rawTable()], glueCrawlers: [], athenaWorkGroups: [{ name: 'primary', output: null, enforce: false, cutoff: null }], athenaQueries: [], lakeS3Partitions: DAYS.slice() }; }
  const base = seed();
  const WEEK = DAYS.slice(-7);
  const core = a => a.lakeMode === true && a.region === R && same(a.callerIdentity, ident) && same(a.glueTables.find(t => t.name === 'orders_raw'), base.glueTables[0]) && a.glueDatabases.some(d => d.name === 'raw_zone') && same(a.athenaWorkGroups.find(w => w.name === 'primary'), base.athenaWorkGroups[0]);
  function catalogReady(a) {
    const c = a.glueCrawlers.find(x => x.name === 'orders-curated'), t = a.glueTables.find(x => x.database === 'shop_lake' && x.name === 'orders');
    return a.glueDatabases.some(d => d.name === 'shop_lake') && !!c && c.role === GLUE_ROLE && same(c.paths, [CURATED]) && c.runs >= 1 && c.state === 'READY' && !!t && t.format === 'parquet' && same(t.partitionKeys, ['dt']) && same(t.partitions, DAYS);
  }
  function wgReady(a) { const w = a.athenaWorkGroups.find(x => x.name === 'analysts'); return !!w && w.output === 's3://shopkaro-lake/athena-results/' && w.enforce === true && !!w.cutoff && w.cutoff <= 1073741824; }
  function queryReady(a) {
    return a.athenaQueries.some(q => q.read && q.state === 'SUCCEEDED' && q.workgroup === 'analysts' && q.database === 'shop_lake' && q.result && q.result.kind === 'DML' && q.result.table === 'orders'
      && same(q.result.parts, WEEK) && same(q.result.grouped.slice().sort(), ['sku', 'state']) && /sum\(\s*qty\s*\)/i.test(q.sql) && q.scanned <= 300 * MB);
  }
  const tasks = [
    { text: 'Raw CSV table aur primary workgroup waise hi; raw data delete ya badla nahi', check: s => core(s.account) },
    { text: 'shop_lake database, orders-curated crawler chala, orders table Parquet + 30 dt partitions; analysts workgroup (results location, enforce, ≤1 GB cutoff)', check: s => core(s.account) && catalogReady(s.account) && wgReady(s.account) },
    { text: 'Pichhle 7 din ka state + SKU wise sum(qty) analysts workgroup mein SUCCEEDED, ≤300 MB scan, aur results padhe', check: s => core(s.account) && catalogReady(s.account) && wgReady(s.account) && queryReady(s.account) }
  ];
  const Q1 = 'b0a1c2d3-0000-4a4b-8c8d-000000000001';
  const SQL = "SELECT state, sku, sum(qty) AS units FROM orders WHERE dt BETWEEN '2026-11-13' AND '2026-11-19' GROUP BY state, sku ORDER BY units DESC";
  const solution = [
    'aws glue get-databases',
    'aws glue create-database --database-input Name=shop_lake',
    `aws glue create-crawler --name orders-curated --role ${GLUE_ROLE} --database-name shop_lake --targets file://crawler-targets.json`,
    'aws glue start-crawler --name orders-curated',
    'aws glue get-crawler --name orders-curated',
    'aws athena create-work-group --name analysts --configuration file://workgroup.json',
    `aws athena start-query-execution --work-group analysts --query-execution-context Database=shop_lake --query-string "${SQL}"`,
    `aws athena get-query-execution --query-execution-id ${Q1}`,
    `aws athena get-query-results --query-execution-id ${Q1}`
  ];

  /* ---------- interview: yesterday's partition missing from the catalog ---------- */
  function iseed() {
    const a = seed();
    a.glueDatabases.push({ name: 'shop_lake' });
    a.glueTables.push({ ...curatedTable('shop_lake', 'orders', DAYS), s3Partitions: [...DAYS, NEWDAY], rows: [...DAYS, NEWDAY].flatMap(rowsFor) });
    a.athenaWorkGroups.push({ name: 'analysts', output: 's3://shopkaro-lake/athena-results/', enforce: true, cutoff: 1073741824 });
    a.lakeS3Partitions = [...DAYS, NEWDAY];
    return a;
  }
  const ibase = iseed();
  const IQ = id => 'b0a1c2d3-0000-4a4b-8c8d-' + String(id).padStart(12, '0');
  function iready(a) {
    const t = a.glueTables.find(x => x.database === 'shop_lake' && x.name === 'orders');
    return core(a) && !!t && same(t.partitions, [...DAYS, NEWDAY]) && same(a.athenaWorkGroups, ibase.athenaWorkGroups) && same(t.rows, ibase.glueTables[1].rows)
      && a.athenaQueries.some(q => q.read && q.state === 'SUCCEEDED' && q.workgroup === 'analysts' && q.result && q.result.kind === 'DML' && same(q.result.parts, [NEWDAY]) && q.result.rows.length > 0);
  }
  const itasks = [
    { text: 'Wahi table, wahi data aur wahi analysts workgroup; koi table delete/recreate nahi', check: s => { const a = s.account, t = a.glueTables.find(x => x.database === 'shop_lake' && x.name === 'orders'); return core(a) && !!t && same(a.athenaWorkGroups, ibase.athenaWorkGroups) && same(t.rows, ibase.glueTables[1].rows); } },
    { text: '2026-11-20 partition catalog mein, aur us din ki query ke results padhe', check: s => iready(s.account) }
  ];
  const isolution = [
    `aws athena start-query-execution --work-group analysts --query-execution-context Database=shop_lake --query-string "SHOW PARTITIONS orders"`,
    `aws athena get-query-results --query-execution-id ${IQ(1)}`,
    `aws athena start-query-execution --work-group analysts --query-execution-context Database=shop_lake --query-string "MSCK REPAIR TABLE orders"`,
    `aws athena start-query-execution --work-group analysts --query-execution-context Database=shop_lake --query-string "SELECT state, sum(qty) AS units FROM orders WHERE dt = '2026-11-20' GROUP BY state"`,
    `aws athena get-query-results --query-execution-id ${IQ(3)}`
  ];

  /* ---------- flowlab: Athena monthly bill ---------- */
  AG.analyticsCostPlan = k => {
    const parquet = k.format === 1, parts = k.partition === 1 ? 7 : 30, cols = k.columns === 1 ? 3 : 8;
    const totalCsv = 10 * 1024, perDayCsv = totalCsv / 30, perDayParquet = 80;
    let mbPerQuery;
    if (!parquet) mbPerQuery = k.partition === 1 ? perDayCsv * parts : totalCsv;
    else mbPerQuery = perDayParquet * parts * cols / 8;
    const queries = 200 * 30, tbMonth = mbPerQuery * queries / 1024 / 1024, usd = tbMonth * 5, inr = usd * 88;
    return { mbPerQuery, perQueryUsd: mbPerQuery / 1024 / 1024 * 5, tbMonth, usd, inr, ok: inr <= 1000 };
  };

  const STAGES = [
    {
      type: 'dryrun',
      title: '🧭 Dry run: wahi sawaal, 10 GB se 210 MB tak',
      intro: 'Fictional ShopKaro data. "Agla" dabao; har kadam par dekho ki query kitna data padhti hai aur kyun.',
      goal: 'Orders RDS ko bachate hue, data lake mein wahi sawaal sasta aur tez chalao.',
      lesson: 'Report ko checkout DB se hata kar S3 data lake mein le gaye. Raw CSV par Athena poori file padhta tha; din ke hisaab se partition aur Parquet (columnar) ne sirf zaroori din aur columns padhe. Bill scan hue bytes par hai, isliye layout hi bachat hai.',
      nodes: [
        { id: 'rds', x: 120, y: 120, icon: '🗄️', label: 'Orders RDS' },
        { id: 'exp', x: 120, y: 400, icon: '📤', label: 'Daily export' },
        { id: 'raw', x: 380, y: 400, icon: '🪣', label: 'S3 raw CSV' },
        { id: 'etl', x: 600, y: 260, icon: '🧪', label: 'Glue ETL' },
        { id: 'cur', x: 820, y: 400, icon: '🧱', label: 'S3 Parquet' },
        { id: 'ath', x: 820, y: 120, icon: '🔎', label: 'Athena' },
        { id: 'cat', x: 500, y: 80, icon: '📚', label: 'Data Catalog' }
      ],
      edges: [{ from: 'rds', to: 'exp' }, { from: 'exp', to: 'raw' }, { from: 'raw', to: 'etl' }, { from: 'etl', to: 'cur' }, { from: 'cat', to: 'ath', dashed: true }, { from: 'cur', to: 'ath' }, { from: 'raw', to: 'ath', dashed: true }],
      panels: [{ id: 'scan', title: 'Query kitna padhti hai' }, { id: 'bill', title: 'Bill (lagbhag, $5/TB)' }],
      steps: [
        {
          say: 'Neha ka sawaal: "har state mein kaunsa kurta bikta hai, har hafte". Ravi yeh GROUP BY query seedha orders RDS par chalata hai, sale ke din.',
          nodes: { rds: { tone: 'bad', badge: 'CPU 95%' } },
          panels: { scan: ['Poori orders table, har baar'], bill: ['Checkout dheema = asli nuksaan'] },
          ask: {
            q: 'Yeh report orders RDS par chalana galat kyun hai?',
            choices: [
              'RDS SQL chala hi nahi sakta, woh sirf key-value reads karta hai, isliye report kabhi chalegi hi nahi',
              'RDS par har query chalane ka alag bill $5 hai, isliye report bahut mehengi padti hai',
              'RDS mein GROUP BY ka feature hi nahi hota, isliye yeh query kabhi khatam nahi hogi',
              'Badi analytics query checkout ke OLTP DB ka CPU/IO kha leti hai; report ko alag (OLAP) jagah chahiye'
            ],
            answer: 3,
            explain: 'Checkout DB chhote, tez transactions (OLTP) ke liye hai. Bade scan aur GROUP BY (OLAP) usi DB par chalana customers ko dheema karta hai. RDS SQL aur GROUP BY chalata hai; uska bill per query nahi.'
          }
        },
        {
          say: 'Roz ka export S3 raw zone mein CSV ban kar jaata hai (10 GB, ek bada folder). Glue crawler schema padh kar Data Catalog mein table bana deta hai.',
          flows: [{ from: 'rds', to: 'exp', tone: 'ok', label: 'raat ko' }, { from: 'exp', to: 'raw', tone: 'ok' }],
          nodes: { cat: { tone: 'acc', badge: 'orders_raw' } },
          panels: { scan: ['Raw: CSV, partition nahi'], bill: ['Abhi koi query nahi'] }
        },
        {
          say: 'Athena se query: SELECT state, sku, sum(qty) ... pichhle 7 din. Athena ne poora 10 GB CSV padha.',
          flows: [{ from: 'raw', to: 'ath', tone: 'bad', label: '10 GB scan' }],
          nodes: { ath: { tone: 'bad', badge: '10 GB' } },
          panels: { scan: ['10 GB (saare din, saare columns)'], bill: ['10 GB × $5/TB ≈ $0.05 per query'] },
          ask: {
            q: 'Sirf 7 din aur 3 columns chahiye the. Athena ne 10 GB kyun padha?',
            choices: [
              'Athena hamesha poora bucket padhta hai, chahe table aur folder kuch bhi ho',
              'Query mein ORDER BY tha, aur ORDER BY hamesha saara data dobara se padhta hai',
              'Data partition nahi tha aur CSV row-based hai, isliye har file aur har column padhna pada',
              'Workgroup mein result location set nahi thi, isliye Athena ne har file ka extra data padha'
            ],
            answer: 2,
            explain: 'Bina partition ke Athena din ke hisaab se files chhod nahi sakta, aur CSV mein ek column padhne ke liye poori row padhni padti hai. Bucket ki baaki files, ORDER BY ya result location wajah nahi.'
          }
        },
        {
          say: 'Glue ETL job raw CSV ko curated zone mein Parquet mein likhta hai, folder dt=YYYY-MM-DD ke hisaab se (partition). Crawler naya table orders banata hai.',
          flows: [{ from: 'raw', to: 'etl', tone: 'acc' }, { from: 'etl', to: 'cur', tone: 'acc', label: 'Parquet, dt=' }],
          nodes: { cur: { tone: 'new', badge: '30 × 80 MB' }, cat: { tone: 'new', badge: 'orders (dt)' } },
          panels: { scan: ['Curated: Parquet, din ke partitions'], bill: ['ETL ka bill ek baar per din'] }
        },
        {
          say: 'Wahi query curated table par: WHERE dt BETWEEN 7 din. Athena ne sirf 7 partitions aur 3 columns padhe: lagbhag 210 MB.',
          flows: [{ from: 'cur', to: 'ath', tone: 'ok', label: '210 MB' }],
          nodes: { ath: { tone: 'ok', badge: '210 MB' } },
          panels: { scan: ['7 din × 80 MB × 3/8 columns ≈ 210 MB'], bill: ['≈ $0.001 per query'] },
          ask: {
            q: 'Din mein 200 baar yeh query chale toh mahine ka farak lagbhag kitna?',
            choices: [
              'Koi farak nahi, kyunki Athena ka bill per query fixed hai',
              'Raw par lagbhag $300/mahina, curated par lagbhag $6/mahina',
              'Raw par lagbhag $3/mahina, curated par lagbhag $300/mahina',
              'Dono par lagbhag $300/mahina, kyunki result size same hai'
            ],
            answer: 1,
            explain: '6,000 queries × 10 GB ≈ 58.6 TB ≈ $293. 6,000 × 210 MB ≈ 1.2 TB ≈ $6. Bill scan hue bytes par hai, result size par nahi.'
          }
        },
        {
          say: 'Cost guard: analysts workgroup mein per-query scan limit 1 GB. Galti se SELECT * bina partition filter chale toh Athena use beech mein rok deta hai.',
          nodes: { ath: { tone: 'acc', badge: 'limit 1 GB' } },
          panels: { scan: ['Limit se upar wali query CANCELLED'], bill: ['Bill sirf limit tak ka'] }
        }
      ]
    },
    {
      type: 'flowlab',
      title: '🎛️ Athena ka mahine ka bill',
      goal: 'Neha ki team din mein 200 baar pichhle 7 din ki report chalati hai. Mahine ka Athena bill ₹1,000 se kam lao.',
      scenario: 'Fictional data: raw CSV 10 GB (30 din, ek din ≈ 341 MB). Parquet mein ek din ≈ 80 MB, 8 columns, report ko sirf 3 columns (state, sku, qty) chahiye. Athena lagbhag $5 per TB scanned (har query par kam se kam 10 MB); ₹88 = $1. Parquet ka saving column chhodne se aata hai; CSV mein har column padhna padta hai.',
      knobs: [
        { id: 'format', label: 'File format', min: 0, max: 1, step: 1, value: 0, labels: { 0: 'CSV', 1: 'Parquet' } },
        { id: 'partition', label: 'Partition', min: 0, max: 1, step: 1, value: 0, labels: { 0: 'Nahi (saare din padho)', 1: 'dt se (sirf 7 din)' } },
        { id: 'columns', label: 'SELECT', min: 0, max: 1, step: 1, value: 0, labels: { 0: 'SELECT * (8 columns)', 1: 'Sirf 3 columns' } }
      ],
      model: k => {
        const r = AG.analyticsCostPlan(k);
        return {
          readouts: [
            { label: 'Ek query kitna padhti hai', value: r.mbPerQuery >= 1024 ? (r.mbPerQuery / 1024).toFixed(1) + ' GB' : Math.round(r.mbPerQuery) + ' MB', tone: r.mbPerQuery <= 300 ? 'ok' : 'bad' },
            { label: 'Ek query (lagbhag)', value: '$' + r.perQueryUsd.toFixed(4), tone: 'acc' },
            { label: 'Mahine mein scan', value: r.tbMonth.toFixed(2) + ' TB', tone: 'acc' },
            { label: 'Mahine ka bill (lagbhag)', value: '$' + r.usd.toFixed(1) + ' ≈ ₹' + Math.round(r.inr).toLocaleString('en-IN'), tone: r.ok ? 'ok' : 'bad' }
          ],
          verdict: r.ok ? { ok: true, text: 'Partition + Parquet + sirf zaroori columns: mahine ka bill lagbhag ₹' + Math.round(r.inr).toLocaleString('en-IN') + '. Teeno saath mein kaam karte hain.' }
            : { ok: false, text: 'Bill lagbhag ₹' + Math.round(r.inr).toLocaleString('en-IN') + '/mahina. Socho: kitne din padhe ja rahe hain, aur kya har column padhna zaroori hai?' }
        };
      },
      check: k => AG.analyticsCostPlan(k).ok,
      lesson: 'Partition se Athena din chhod deta hai, Parquet se column chhod deta hai, aur SELECT mein sirf zaroori columns se dono ka poora fayda milta hai. CSV mein columns chhodne se bill kam nahi hota.'
    },
    {
      type: 'match',
      title: '🔗 Analytics ki zaroorat → AWS service',
      instructions: 'Har zaroorat ko us service se jodo jo use seedha poora karti hai.',
      pairs: [
        { left: 'S3 par SQL, bina server ke, per TB scanned', right: 'Athena', explain: 'Serverless SQL on S3; bill scan hue data par.' },
        { left: 'Schema dhoondhna aur ETL jobs', right: 'Glue (crawler, Data Catalog, ETL)', explain: 'Crawler schema/partitions catalog mein likhta hai; ETL format badalta hai.' },
        { left: 'Lake mein column/row level permissions', right: 'Lake Formation', explain: 'Fine-grained access aur LF-Tags.' },
        { left: 'Streaming data bina code ke S3 mein', right: 'Amazon Data Firehose', explain: 'Buffer, convert aur deliver; consumer code nahi.' },
        { left: 'Bada warehouse, BI ke liye tez joins', right: 'Redshift (Serverless)', explain: 'Petabyte warehouse; zero-ETL se DBs ka data aata hai.' },
        { left: 'Dashboards aur BI reports', right: 'QuickSight (ab AWS Quick Sight)', explain: 'BI dashboards; naam ab AWS Quick ka hissa.' },
        { left: 'Spark/Hadoop clusters bade jobs ke liye', right: 'EMR', explain: 'Managed Spark/Hadoop, Serverless option bhi.' }
      ]
    },
    {
      type: 'triage',
      title: '🩺 Athena query dheemi aur mehngi',
      symptom: 'Fictional: Ravi ki weekly report Athena par 2 minute leti hai, aur pichhle mahine Athena ka bill $310 aaya.',
      goal: 'Table ka format, partitions aur query dekho. Wajah aur sabse sahi fix chuno.',
      commands: [
        { cmd: 'aws glue get-table --database-name raw_zone --name orders_raw', out: '"Parameters": { "classification": "csv" }, "PartitionKeys": [], "Location": "s3://shopkaro-lake/raw/orders/"', clue: true, note: 'CSV aur koi partition nahi.' },
        { cmd: 'aws athena get-query-execution --query-execution-id <ravi-ki-query>', out: '"Query": "SELECT * FROM orders_raw", "DataScannedInBytes": 10737418240, "State": "SUCCEEDED"', clue: true, note: 'SELECT * aur poora 10 GB scan, har baar.' },
        { cmd: 'aws athena get-work-group --work-group primary', out: '"EnforceWorkGroupConfiguration": false (koi BytesScannedCutoffPerQuery nahi)', clue: false, note: 'Koi cost guard nahi, par yeh wajah nahi, sirf bachav ki kami hai.' }
      ],
      questions: [
        {
          q: 'Query mehngi kyun hai?',
          choices: [
            'Athena ka engine purana hai; naya engine version scan ko 10 guna kam kar deta hai',
            'CSV, bina partition aur SELECT *: har query poora 10 GB padhti hai',
            'Result location set nahi, isliye Athena har query dobara chalata hai',
            'Glue crawler roz chalta hai, aur crawler ka bill Athena mein judta hai'
          ],
          answer: 1,
          explain: 'Bill scan hue bytes par hai. Partition nahi, row format (CSV) aur SELECT * se har baar poora data padha jaata hai. Engine version, result location ya crawler ka bill yahan wajah nahi.'
        },
        {
          q: 'Sabse sahi fix?',
          choices: [
            'Data ko dt se partition karke Parquet mein likho, sirf zaroori columns maango, aur workgroup mein scan limit lagao',
            'Query ko raat mein chalao, kyunki raat mein Athena ka per-TB daam aadha ho jaata hai aur limit nahi lagti',
            'Athena chhod kar report seedha orders RDS par chalao, wahan scan ka koi bill nahi lagta aur data taaza hai',
            'LIMIT 100 laga do, kyunki LIMIT se Athena ka scan hamesha pehli 100 rows par hi ruk jaata hai'
          ],
          answer: 0,
          explain: 'Partition + columnar + column projection scan kam karte hain, aur workgroup limit galti se bachata hai. Raat ka daam alag nahi, RDS par report checkout ko dheema karti hai, aur LIMIT scan kam nahi karta.'
        }
      ]
    },
    {
      type: 'terminal',
      title: '🖥️ Data lake se Neha ki weekly report',
      instructions: 'Sirf app ka Glue/Athena fixture; koi AWS call nahi. ls/cat se lake-layout.txt aur JSON files padho. Scan bytes ek model hain.',
      goal: '<p><b>1.</b> Raw table <code>raw_zone.orders_raw</code> aur <code>primary</code> workgroup ko mat chhedo. Database <code>shop_lake</code> banao.</p><p><b>2.</b> Crawler <code>orders-curated</code> (role <code>' + GLUE_ROLE + '</code>, target <code>crawler-targets.json</code> = curated path) banao, chalao, aur <code>get-crawler</code> se READY tak dekho. Table <code>orders</code> Parquet aur 30 <code>dt</code> partitions ke saath aana chahiye.</p><p><b>3.</b> Workgroup <code>analysts</code> banao <code>workgroup.json</code> se (results location, enforce, per-query scan limit 1 GB).</p><p><b>4.</b> <code>analysts</code> mein <code>shop_lake</code> par pichhle 7 din (2026-11-13 se 2026-11-19) ka state + SKU wise <code>sum(qty)</code> chalao, scan dekho (300 MB se kam), aur results padho. SELECT * ya raw table par query limit mein ruk jaayegi.</p>',
      account: seed(),
      files: FILES,
      tasks,
      solution,
      hints: [
        'aws glue create-database --database-input Name=shop_lake; crawler ke liye --targets file://crawler-targets.json; start-crawler ke baad aws glue get-crawler.',
        'aws athena create-work-group --name analysts --configuration file://workgroup.json',
        'Query mein WHERE dt BETWEEN \'2026-11-13\' AND \'2026-11-19\' aur sirf state, sku, sum(qty). Phir get-query-execution (DataScannedInBytes) aur get-query-results.'
      ],
      success: s => tasks.every(t => t.check(s)),
      successText: 'shop_lake catalog, analysts workgroup ka scan limit, aur 7 din ki report lagbhag 210 MB scan mein. Asli AWS mein: Lake Formation se access do, crawler ko schedule ya partition projection socho, aur workgroup ke CloudWatch metrics dekho.'
    },
    {
      type: 'docker',
      title: '🐳 Lab30: Moto par chhota data lake',
      project: '30-data-lake-athena',
      goal: 'Apne thodi der ke Moto server par Firehose se raw zone, host ETL se dt= partitioned curated zone, Glue catalog, crawler aur Athena workgroup chalao, aur dekho ki emulator kya nahi karta.',
      why: 'Moto Glue catalog aur partitions rakhta hai, par crawler kuch nahi dhoondhta, Athena koi asli SQL nahi chalata (result khaali) aur Firehose ka dynamic prefix nahi badalta. Parquet ki libraries installed nahi, isliye curated zone CSV mein hai. Scan ka hisaab host par hota hai.',
      steps: [
        { text: 'aws-gurukul se README aur lab.py padho, phir exact runner chalao.', cmd: './docker-labs/.venv/bin/python -I docker-labs/30-data-lake-athena/lab.py', expect: '6 behaviour checks + cleanup = 7 PASS, phir OWNED MOTO STOPPED / LISTENER CLOSED.' },
        { text: 'GAP wali lines padho: Firehose prefix, crawler, Athena results.', expect: 'Prefix literal, crawler RUNNING par partition nahi, Athena SUCCEEDED par result khaali, pyarrow nahi.' },
        { text: 'HOST CHECK wali lines padho: partition pruning se scan aur query ka asli jawaab.', expect: '3 mein se 2 din padhne par scan 33% kam, aur state + SKU ki ginti (jaise RJ/kurta-red: 15).' }
      ],
      observe: {
        q: 'Lab30 asal mein kya saabit karti hai?',
        choices: [
          'Moto Athena ne SQL chala kar state-wise ginti nikaali aur har query ke asli scan bytes bhi bataye',
          'Glue crawler ne curated folder se schema aur saare partitions apne aap dhoondh liye',
          'Catalog/partitions/workgroup ka metadata Moto par bana; query ka jawaab aur scan host par nikaala',
          'Firehose ne dt=YYYY-MM-DD prefix sahi banaya, isliye saare partitions apne aap ban gaye'
        ],
        answer: 2,
        explain: 'Moto metadata rakhta hai: database, table, partitions, workgroup. Crawler kuch nahi dhoondhta, Athena khaali result deta hai, aur Firehose prefix literal rehta hai. Jawaab aur scan host ke Python ne nikaala.'
      }
    },
    {
      type: 'quiz',
      title: '🎓 Analytics ke faisle',
      questions: [
        {
          q: 'S3 mein pade logs par kabhi-kabhi SQL chalana hai, koi server ya cluster manage nahi karna. Kya chunoge?',
          choices: ['Redshift provisioned cluster, hamesha chalu', 'EMR cluster, din-raat chalu', 'Athena, seedha S3 par SQL', 'RDS mein import karke query'],
          answer: 2,
          explain: 'Athena serverless hai aur S3 par seedha SQL chalata hai, bill scan par. Cluster ya import is kaam ke liye zyada bhaari hain.'
        },
        {
          q: 'Athena ka bill kam karne ke liye sabse asardaar teen kadam?',
          choices: ['Partition, columnar format (Parquet/ORC), sirf zaroori columns', 'Bada workgroup, zyada results aur har query par LIMIT', 'CSV mein compression band karna, taaki CPU kam lage', 'Har query ke baad crawler chalana, taaki catalog taaza rahe'],
          answer: 0,
          explain: 'Partition din chhodta hai, columnar format column chhodta hai, aur column projection dono ka fayda leta hai. LIMIT scan kam nahi karta.'
        },
        {
          q: 'Analysts ko lake ke orders table mein customer_id column nahi dikhna chahiye. Kya lagaoge?',
          choices: ['S3 bucket policy mein column ka naam', 'IAM policy se sirf Athena access', 'Glue crawler ko us column par band karna', 'Lake Formation column-level permission'],
          answer: 3,
          explain: 'Lake Formation table/column/row level par access deta hai. Bucket policy ya IAM column nahi samajhte, aur crawler band karna data nahi chhupata.'
        },
        {
          q: 'App clickstream ko har minute S3 mein files banakar daalna hai, koi consumer code nahi likhna. Kya chunoge?',
          choices: ['Kinesis Data Streams + apna consumer', 'Amazon Data Firehose', 'SQS + Lambda jo S3 likhe', 'MSK cluster'],
          answer: 1,
          explain: 'Firehose bina code ke buffer karke S3 mein deliver karta hai (format conversion bhi). Baaki options mein consumer ya cluster chalana padta hai.'
        },
        {
          q: 'Aurora ke orders data par BI warehouse chahiye, bina ETL pipeline banaye. Aaj kya dekhoge?',
          choices: ['Har ghante CSV export aur manual load', 'Athena federated query hamesha', 'DMS full load roz', 'Aurora zero-ETL integration se Redshift'],
          answer: 3,
          explain: 'Zero-ETL Aurora/RDS/DynamoDB ka data Redshift mein lagbhag real-time laata hai, bina pipeline ke. Export/DMS roz chalana pipeline hi hai.'
        },
        {
          q: 'Naye din ka data S3 mein dt=2026-11-20 folder mein aa gaya, par Athena query 0 rows deti hai. Kya karoge?',
          choices: ['MSCK REPAIR TABLE ya naya partition add karo (ya crawler/partition projection)', 'Table delete karke naya banao, naya table saare folders padhega', 'Bucket public kar do, Athena ko folder dikhne lagega', 'Workgroup ka scan limit hata do, kyunki wahi limit naye din ka data rok rahi hai'],
          answer: 0,
          explain: 'Catalog mein naya partition nahi hai. MSCK REPAIR/ADD PARTITION (ya crawler, partition projection) jodta hai. Table delete, public bucket ya limit hatana wajah nahi.'
        },
        {
          q: 'Real-time mein payment events par 3 alag teams apna code chalayengi, aur replay bhi chahiye. Kya?',
          choices: ['Amazon Data Firehose', 'Athena', 'Glue crawler', 'Kinesis Data Streams'],
          answer: 3,
          explain: 'Kinesis Data Streams kai consumers, ordering aur retention/replay deta hai. Firehose delivery ke liye hai, Athena aur Glue streaming nahi.'
        },
        {
          q: 'Galti se koi analyst SELECT * chala de toh bill na phate. Kya lagaoge?',
          choices: ['Glue crawler ka schedule har ghante ka karo, taaki catalog hamesha taaza rahe', 'S3 lifecycle rule, purana data Glacier mein bhejo', 'CloudTrail data events on karo, har query record hogi', 'Athena workgroup mein per-query scan limit (BytesScannedCutoffPerQuery)'],
          answer: 3,
          explain: 'Workgroup ka per-query limit badi query ko beech mein rok deta hai. Lifecycle, CloudTrail ya crawler is bill ko nahi rokte.'
        }
      ]
    }
  ];

  const INTERVIEW = {
    title: 'Interview: OLTP vs OLAP, lake layout aur ek gayab partition',
    instructions: 'Chaar faisle, phir terminal mein kal ka gayab partition wapas lao.',
    questions: [
      {
        q: 'Interviewer: "OLTP aur OLAP mein farak?"',
        choices: ['OLTP chhote, tez transactions (checkout); OLAP bade scans aur reports (analytics)', 'OLTP sirf NoSQL databases hain aur OLAP sirf SQL databases; bas itna hi farak hai dono mein', 'OLTP hamesha mehenga hai aur OLAP hamesha free, isliye reports OLAP par', 'Dono same hain, bas naam alag; ek hi DB par dono chala sakte ho'],
        answer: 0,
        explain: 'OLTP har order jaise chhote reads/writes ke liye hai; OLAP bade scans, GROUP BY aur reports ke liye. Engine type ya free hona farak nahi.'
      },
      {
        q: '"Data lake mein raw, clean aur curated zones kyun?"',
        choices: ['Taaki har zone alag Region mein rahe aur ek Region band ho toh data bache', 'Raw asli copy bachata hai; clean/curated query ke liye sudhara hua, partitioned format', 'Taaki teen copies se apne aap backup ban jaaye, chahe bill teen guna ho', 'Kyunki Athena ek zone ke andar sirf ek hi table padh sakta hai, isse zyada kabhi nahi'],
        answer: 1,
        explain: 'Raw asli data hai jise dobara process kar sakte ho; curated query ke liye saaf, partitioned aur columnar hota hai. Region, bill ya Athena ki limit wajah nahi.'
      },
      {
        q: '"Athena vs Redshift kab?"',
        choices: ['Athena hamesha sasta hai, isliye Redshift ki kabhi zaroorat hi nahi padti', 'Redshift sirf streaming data ke liye hai, reports aur joins ke liye nahi', 'Athena kabhi-kabhi ki S3 queries; Redshift bhaari, baar-baar wali BI aur joins', 'Dono mein koi farak nahi, dono ka bill aur speed bilkul ek jaisa hai'],
        answer: 2,
        explain: 'Kabhi-kabhi ki queries ke liye Athena (per TB). Lagatar BI, bade joins aur concurrency ke liye Redshift. Redshift streaming tool nahi.'
      },
      {
        q: '"Glue crawler kya karta hai?"',
        choices: ['S3 data ka schema aur partitions padh kar Data Catalog mein table banata/update karta hai', 'Data ko CSV se Parquet mein badalta hai aur naye partitions folder bana deta hai', 'Athena queries ka bill kam karta hai, kyunki woh har query ko pehle se chala kar rakhta hai', 'S3 mein naya data likhta hai, jaise roz ka export'],
        answer: 0,
        explain: 'Crawler catalog likhta hai. Format badalna ETL job ka kaam hai, bill layout se kam hota hai, aur crawler data nahi likhta.'
      },
      {
        terminal: {
          title: '🖥️ Kal ka partition wapas lao',
          instructions: 'Sirf app ka Glue/Athena fixture. Dashboard mein 2026-11-20 ka data nahi aa raha. Wahi table theek karo.',
          goal: '<p><code>shop_lake.orders</code> mein S3 par 2026-11-20 ka folder aa gaya hai, par catalog mein us din ka partition nahi. <code>analysts</code> workgroup mein partitions dekho, catalog ko S3 se milao (Athena DDL free hai), phir us din ka state-wise <code>sum(qty)</code> chala kar results padho. Table delete/recreate ya workgroup badalna nahi chalega.</p>',
          account: iseed(),
          files: FILES,
          tasks: itasks,
          solution: isolution,
          hints: ['SHOW PARTITIONS orders se dekho kaunsa din gayab hai.', 'MSCK REPAIR TABLE orders (ya crawler dobara) catalog mein naya partition jodta hai; phir WHERE dt = \'2026-11-20\' wali query aur get-query-results.'],
          success: s => itasks.every(t => t.check(s)),
          successText: 'Naya partition catalog mein, aur us din ki report chal gayi. Asli AWS mein baar-baar aise partitions ke liye partition projection ya crawler schedule socho, taaki har din haath se na karna pade.'
        }
      }
    ]
  };

  AG.registerLevels('advanced', [{
    id: 'analytics',
    icon: '📊',
    title: 'Analytics — data lake, Athena ka bill aur streaming',
    badge: 'Data Darshi',
    objectives: [
      'OLTP aur OLAP ko alag rakh kar report ko checkout DB se hatana',
      'S3 data lake zones, partition aur Parquet se Athena ka scan aur bill kam karna',
      'Glue crawler/Data Catalog/ETL, Lake Formation aur Athena workgroup limits ka kaam samajhna',
      'Firehose, Kinesis Data Streams, MSK, Redshift (zero-ETL), EMR, QuickSight aur OpenSearch mein se sahi chunna'
    ],
    hook: {
      when: 'ShopKaro course ki kahani (fictional)',
      title: 'Report ne checkout dheema kar diya',
      text: 'Neha ko har hafte jaanna hai ki har state mein kaunsa kurta kitna bikta hai. Ravi yeh GROUP BY query seedha orders RDS par chalata hai, aur sale ke din checkout dheema ho jaata hai. Doosri koshish mein raw CSV par Athena chalaya, aur mahine ka bill $310 aaya.',
      mission: 'Report ko data lake mein le jao, scan kam karo aur galti se bade bill se bachao. Course ke fixtures asli AWS bill nahi.'
    },
    steps: [
      {
        q: 'OLTP aur OLAP alag kyun?',
        analogy: 'Dukaan ke counter par hisaab ki moti kitaab khologe toh line ruk jaayegi. Hisaab peeche ke kamre mein, copy par karo.',
        body: '<p><b>OLTP</b> (jaise orders RDS) chhote, tez transactions ke liye hai: ek order likho, ek order padho. <b>OLAP</b> bade scans aur reports ke liye hai: saare orders ka GROUP BY. Dono ek hi DB par chalao toh report checkout ka CPU aur IO kha leti hai. Isliye analytics ke liye data ki ek copy alag jagah (data lake ya warehouse) mein rakhte hain.</p>',
        points: ['Read replica thoda bachata hai, par bade scans ke liye bhi bana nahi', 'Copy roz export, CDC ya zero-ETL se aa sakti hai', 'Report thodi purani (jaise kal tak ki) ho, toh chalega? Yeh pehle poocho'],
        asli: 'Checkout DB par report mat chalao. Analytics ka data alag rakho.'
      },
      {
        q: 'S3 data lake ke zones aur formats',
        analogy: 'Godaam mein ek kamra aaye hue maal ka (jaisa aaya), ek saaf kiye maal ka, aur ek dukaan ke liye taiyaar maal ka.',
        body: '<p><b>Raw</b> zone mein data jaisa aaya waisa (CSV/JSON) rakho; yeh asli copy hai. <b>Clean</b> mein galat rows hata kar sahi types. <b>Curated</b> mein query ke liye taiyaar data: <b>Parquet/ORC</b> (columnar) aur <b>partitions</b> (jaise <code>dt=2026-11-19/</code>). Apache Iceberg jaise table formats (jaise S3 Tables) updates aur schema badlav aasaan karte hain.</p>',
        points: ['Raw kabhi mat badlo; galti ho toh wahin se dobara banao', 'Bahut chhoti-chhoti files query ko dheema karti hain; theek size ki files banao', 'Curated ka layout un sawaalon ke hisaab se banao jo roz poochhe jaate hain'],
        asli: 'Zones se data ka safar saaf rehta hai: raw bachao, curated se query karo.'
      },
      {
        q: 'Partition aur columnar format bill kaise ghatate hain?',
        analogy: 'Register ke panne mahine ke hisaab se alag hon toh sirf November khologe. Aur column wali register mein sirf "qty" ki line padhoge.',
        body: '<p>Athena utna padhta hai jitna zaroori ho sake. <b>Partition</b> (dt) se query <code>WHERE dt BETWEEN ...</code> par baaki din chhod deti hai. <b>Parquet</b> column-wise rakhta hai, toh 8 mein se 3 columns maango toh baaki 5 nahi padhe jaate (CSV mein poori row padhni padti hai). Example: 10 GB CSV → curated mein 7 din × 80 MB × 3/8 ≈ 210 MB.</p>',
        points: ['SELECT * columnar ka fayda khatam kar deta hai', 'LIMIT scan kam nahi karta, sirf result chhota karta hai', 'Compression (Snappy/ZSTD) bhi bytes kam karta hai'],
        asli: 'Bill scan hue bytes par hai. Layout aur query ka WHERE/SELECT hi asli bachat hai.'
      },
      {
        q: 'Glue: crawler, Data Catalog aur ETL',
        analogy: 'Library ka catalog batata hai kaunsi kitaab kis shelf par hai. Crawler woh aadmi hai jo naye shelf dekh kar catalog bharta hai.',
        body: '<p><b>Glue Data Catalog</b> tables, columns, location aur partitions ka register hai; Athena, Redshift Spectrum aur EMR isse padhte hain. <b>Crawler</b> S3 dekh kar schema aur partitions catalog mein likhta hai (lagbhag $0.44 per DPU-hour). <b>Glue ETL</b> (Spark) jobs format badalte hain, jaise CSV → Parquet. Naye din ke partitions ke liye crawler schedule, <code>MSCK REPAIR TABLE</code>, ya <b>partition projection</b> (catalog mein likhe bina din ka pattern) use karo.</p>',
        points: ['Catalog mein partition nahi toh Athena us din ka data nahi dekhega', 'Data Catalog ke pehle 10 lakh objects free (us-east-1 list price)', 'Crawler data nahi badalta; sirf catalog likhta hai'],
        asli: 'Data S3 mein hai, par Athena catalog se dekhta hai. Catalog aur S3 ko mila kar rakho.'
      },
      {
        q: 'Athena ka bill aur cost guard',
        analogy: 'Taxi meter kilometer par chalta hai. Galat raaste se bachne ke liye pehle se limit tay kar do.',
        body: '<p><b>Athena</b> lagbhag <b>$5 per TB scanned</b> leta hai, har query par kam se kam 10 MB. DDL (CREATE/MSCK) aur fail queries ka scan bill nahi; cancel hui query ka bill utna jitna padha. <b>Workgroup</b> se result location, encryption aur <b>per-query scan limit</b> (BytesScannedCutoffPerQuery) tay karo; enforce karo taaki users isse badal na sakein. Baar-baar wali same query ke liye result reuse socho.</p>',
        points: ['Example: 6,000 queries × 10 GB ≈ 58.6 TB ≈ $293/mahina', 'Limit se upar wali query CANCELLED, bill sirf limit tak', 'Workgroup ke CloudWatch metrics se dekho kaun zyada scan kar raha hai'],
        asli: 'Pehle layout se scan kam karo, phir workgroup limit se galti ka bill roko.'
      },
      {
        q: 'Lake Formation se access kaise do?',
        analogy: 'Library mein sabko poori library nahi milti: kuch ko sirf ek almari, kuch ko sirf kuch panne.',
        body: '<p><b>Lake Formation</b> Data Catalog ke tables par <b>database/table/column/row</b> level permissions deta hai, aur <b>LF-Tags</b> se bade lake mein permissions tag ke hisaab se. Analysts ko <code>customer_id</code> jaisa column chhupa kar baaki dikhana ho toh yahi. Sirf S3 bucket policy column nahi samajhti.</p>',
        points: ['Column/row level access Lake Formation se', 'Cross-account data sharing bhi Lake Formation se', 'IAM aur Lake Formation dono milkar access tay karte hain'],
        asli: 'Lake ka access table/column ke hisaab se Lake Formation mein socho, sirf bucket policy mein nahi.'
      },
      {
        q: 'Streaming data lake tak kaise aaye?',
        analogy: 'Nal ka paani balti mein bhar ke rakho (Firehose), ya paani ki line se har ghar ka apna nal (Kinesis Data Streams).',
        body: '<p><b>Amazon Data Firehose</b> bina code ke data ko buffer karke S3/Redshift/OpenSearch tak pahunchata hai; Parquet conversion aur dynamic partition prefix bhi kar sakta hai. <b>Kinesis Data Streams</b> kai consumers, ordering aur replay deta hai (apna code). <b>MSK</b> managed Kafka hai, jab Kafka ecosystem chahiye.</p>',
        points: ['Sirf deliver karna → Firehose', 'Real-time apna processing + replay → Kinesis Data Streams', 'Kafka clients/Connect → MSK'],
        asli: 'Pehle poocho: bas pahunchana hai, ya beech mein apna code chalana hai?'
      },
      {
        q: 'Warehouse aur baaki tools kab?',
        analogy: 'Rasoi ki chhoti almari (Athena) roz ke kaam ke liye; bada godaam (Redshift) jab roz bahut maal nikalna ho.',
        body: '<p><b>Redshift</b> (Serverless bhi) bhaari, baar-baar wali BI aur bade joins ke liye; <b>Spectrum</b> S3 data bhi padhta hai. <b>Zero-ETL</b> Aurora, RDS aur DynamoDB ka data Redshift mein lagbhag real-time laata hai, bina pipeline ke. <b>EMR</b> managed Spark/Hadoop hai. <b>QuickSight</b> (naam ab <b>AWS Quick Sight</b>, AWS Quick ka hissa) dashboards banata hai. <b>OpenSearch</b> search aur log analytics ke liye.</p>',
        points: ['Kabhi-kabhi ki S3 query → Athena; lagatar BI → Redshift', 'DB se warehouse bina pipeline → zero-ETL', 'Exam purana naam QuickSight le sakta hai'],
        asli: 'Tool sawaal ki frequency, size aur users ke hisaab se chuno, naam ke hisaab se nahi.'
      }
    ],
    myth: [
      { myth: 'LIMIT 100 lagane se Athena kam data padhta hai.', sach: 'LIMIT sirf result chhota karta hai. Scan partition filter aur columnar format se kam hota hai.' },
      { myth: 'Report read replica par chalao, toh analytics ki zaroorat khatam.', sach: 'Replica thoda bachata hai, par bade scans aur lambi history ke liye data lake/warehouse behtar aur sasta hai.' },
      { myth: 'Data S3 mein aate hi Athena use dekh leta hai.', sach: 'Athena catalog se dekhta hai. Naya partition catalog mein jodna padta hai (crawler, MSCK REPAIR, ADD PARTITION ya partition projection).' },
      { myth: 'Bucket policy se column chhupa sakte hain.', sach: 'Bucket policy column nahi samajhti. Column/row level access Lake Formation se hota hai.' }
    ],
    playbook: {
      title: 'Copy alag → layout sahi → catalog → guard → tool',
      use: ['S3 lake: raw bachao, curated Parquet + dt partitions', 'Athena workgroup with enforced scan limit aur result location', 'Lake Formation se column/row access'],
      avoid: ['Checkout RDS par bhaari reports', 'CSV par SELECT * bina partition filter', 'Catalog ko S3 se milaye bina "data gayab" ka darr'],
      how: ['Sawaal likho: kaunse din, kaunse columns, kitni baar', 'Curated layout us sawaal ke hisaab se (partition + columnar)', 'Crawler/partition projection se catalog taaza rakho', 'Workgroup limit, metrics aur Lake Formation access lagao'],
      redflags: ['DataScannedInBytes har query mein poora table', 'Har din haath se partition jodna pad raha hai', 'Analytics query ke time checkout latency badhti hai', 'Analysts ko sensitive column dikh raha hai'],
      rule: 'Bill scan par hai: sahi layout, sahi WHERE aur sahi SELECT se scan kam karo, aur workgroup limit se galti roko.'
    },
    exam: [
      { cue: 'S3 par SQL, serverless', pick: 'Athena' },
      { cue: 'ETL + schema catalog', pick: 'Glue (crawler, Data Catalog, ETL)' },
      { cue: 'Lake mein fine-grained (column/row) permissions', pick: 'Lake Formation' },
      { cue: 'Streaming data S3/Redshift tak bina code', pick: 'Amazon Data Firehose' },
      { cue: 'Real-time custom consumers, replay', pick: 'Kinesis Data Streams' },
      { cue: 'Managed Kafka', pick: 'Amazon MSK' },
      { cue: 'Petabyte warehouse, BI joins', pick: 'Redshift (zero-ETL se DBs ka data)' },
      { cue: 'Managed Spark/Hadoop', pick: 'EMR' },
      { cue: 'Dashboards / BI', pick: 'QuickSight (ab AWS Quick Sight)' }
    ],
    stages: STAGES,
    interview: INTERVIEW,
    success: [
      'Report ko OLTP se hata kar data lake mein chala sakta hoon, aur zones samjha sakta hoon.',
      'Partition, Parquet aur sahi SELECT se Athena ka scan aur bill kam kar sakta hoon, aur workgroup limit laga sakta hoon.',
      'Glue, Lake Formation, Firehose, Kinesis, MSK, Redshift, EMR, QuickSight aur OpenSearch mein se sawaal ke hisaab se chun sakta hoon.'
    ],
    homework: '<p>Optional, sirf approved asli-AWS sandbox mein; S3, Glue crawler/ETL, Athena scan aur Lake Formation ka bill lag sakta hai. Ek chhoti CSV file ko <code>dt=</code> folders mein S3 par rakho, Glue crawler se table banao, aur Athena workgroup (scan limit 100 MB) mein query chalao. Phir Glue job ya CTAS (<code>CREATE TABLE AS SELECT ... WITH (format=\'PARQUET\', partitioned_by=...)</code>) se Parquet table banao aur DataScannedInBytes compare karo. Cleanup: tables, crawler, Glue job, workgroup aur S3 objects delete karo; billing agle din dekho.</p>',
    cards: [
      { front: 'OLTP vs OLAP?', back: 'OLTP: chhote tez transactions (checkout DB). OLAP: bade scans/reports. Analytics ko alag copy par chalao.' },
      { front: 'Athena ka bill?', back: 'Lagbhag $5 per TB scanned, har query kam se kam 10 MB. DDL aur fail queries ka scan bill nahi.' },
      { front: 'Scan kam kaise?', back: 'Partition (WHERE dt...), columnar (Parquet/ORC), sirf zaroori columns, compression. LIMIT se nahi.' },
      { front: 'Naya din ka data query mein nahi?', back: 'Catalog mein partition nahi. MSCK REPAIR TABLE / ADD PARTITION / crawler / partition projection.' },
      { front: 'Galti ka bada bill kaise roko?', back: 'Athena workgroup: enforce + BytesScannedCutoffPerQuery.' },
      { front: 'Column chhupana?', back: 'Lake Formation column/row level permissions (LF-Tags bhi).' },
      { front: 'Firehose vs Kinesis Data Streams?', back: 'Firehose: bina code delivery. KDS: apne consumers, ordering, replay.' },
      { front: 'DB se Redshift bina pipeline?', back: 'Zero-ETL (Aurora, RDS, DynamoDB → Redshift). QuickSight ab AWS Quick Sight.' }
    ]
  }]);

  AG.analyticsFixtures = { seed, iseed, tasks, itasks, solution, isolution, FILES, Q1, IQ, SQL, DAYS, WEEK, CURATED, GLUE_ROLE };
})();
