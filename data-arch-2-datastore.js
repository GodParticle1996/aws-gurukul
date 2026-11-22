/* PixShare D2. Data paths start with the question on the screen. */
(() => {
  const name = 'pix-feed', bucket = 'pix-report-lab34', acct = '123456789012', region = 'us-east-1';
  const arn = 'arn:aws:dynamodb:' + region + ':' + acct + ':table/' + name;
  const exportArn = arn + '/export/01690000000000-00000001';
  const sample = [
    { userId: 'u07', postKey: '2026-11-20#p1', creatorId: 'c4', country: 'IN' },
    { userId: 'u07', postKey: '2026-11-21#p2', creatorId: 'c8', country: 'CA' },
    { userId: 'u18', postKey: '2026-11-21#p3', creatorId: 'c4', country: 'IN' }
  ];
  const index = { IndexName: 'byCreator', KeySchema: [{ AttributeName: 'creatorId', KeyType: 'HASH' },
    { AttributeName: 'postKey', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } };
  const file = data => ({ content: JSON.stringify(data, null, 2) });
  const files = { 'index.json': file([index]), 'add-index.json': file([{ Create: index }]),
    'posts.json': file({ [name]: sample.map(row => ({ PutRequest: { Item: Object.fromEntries(Object.entries(row).map(([k,v]) => [k,{ S: v }])) } })) }),
    'release.txt': { content: 'Viewer ka userId aur postKey feed ki keys hain. Doosra raasta creatorId aur postKey hai. Teen test posts save karo. Weekly full export ke liye pix-report-lab34 mein weekly prefix lo. Accounts ke liye pix-accounts, aurora-postgresql, pixadmin, managed password aur encrypted storage chahiye.' } };
  const account = () => ({ region, callerIdentity: { Account: acct, Arn: 'arn:aws:iam::' + acct + ':role/pix-data' },
    tables: [], buckets: [{ name: bucket, region, objects: [] }], pixData: { clusters: [], exports: [] } });
  const feed = s => s.account.tables.find(t => t.name === name);
  const baseReady = s => { const t = feed(s); return t?.status === 'ACTIVE' && t.billing === 'PAY_PER_REQUEST' &&
    t.partitionKey === 'userId' && t.sortKey === 'postKey' && t.attributeTypes.userId === 'S' && t.attributeTypes.postKey === 'S'; };
  const indexReady = s => { const t = feed(s), i = t?.gsis?.find(i => i.name === 'byCreator');
    return baseReady(s) && i?.status === 'ACTIVE' && i.partitionKey === 'creatorId' && i.sortKey === 'postKey' &&
      t.attributeTypes.creatorId === 'S' && i.projection.ProjectionType === 'ALL'; };
  const contains = (rows, wanted) => wanted.every(row => rows?.some(x => Object.entries(row).every(([k,v]) => x[k] === v)));
  const postsReady = s => contains(feed(s)?.items, sample);
  const exportReady = s => { const t = feed(s), b = s.account.buckets.find(b => b.name === bucket);
    return t?.pitr?.enabled && s.account.pixData.exports.some(e => e.view.TableId === t.tableId &&
      e.view.TableArn === arn && e.view.ExportStatus === 'COMPLETED' && e.view.ExportFormat === 'DYNAMODB_JSON' &&
      e.view.S3Bucket === bucket && e.view.S3Prefix === 'weekly' && contains(e.rows, sample) &&
      b?.objects?.some(o => o.key === e.view.ExportManifest && o.body && o.body.includes(e.view.ExportArn))); };
  const clusterReady = s => s.account.pixData.clusters.some(c => c.DBClusterIdentifier === 'pix-accounts' &&
    c.Engine === 'aurora-postgresql' && c.MasterUsername === 'pixadmin' && ['sse-rds','sse-kms'].includes(c.StorageEncryptionType) && c.Status === 'available');
  const commands = [
    'aws dynamodb create-table --table-name pix-feed --billing-mode PAY_PER_REQUEST --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=postKey,AttributeType=S AttributeName=creatorId,AttributeType=S --key-schema AttributeName=userId,KeyType=HASH AttributeName=postKey,KeyType=RANGE --global-secondary-indexes file://index.json',
    'aws dynamodb wait table-exists --table-name pix-feed', 'aws dynamodb describe-table --table-name pix-feed',
    'aws dynamodb batch-write-item --request-items file://posts.json',
    'aws dynamodb update-continuous-backups --table-name pix-feed --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true',
    'aws dynamodb export-table-to-point-in-time --table-arn ' + arn + ' --s3-bucket ' + bucket + ' --s3-prefix weekly --export-format DYNAMODB_JSON --client-token pix-week-34',
    'aws dynamodb describe-export --export-arn ' + exportArn,
    'aws rds create-db-cluster --db-cluster-identifier pix-accounts --engine aurora-postgresql --master-username pixadmin --manage-master-user-password --storage-encrypted',
    'aws rds wait db-cluster-available --db-cluster-identifier pix-accounts'
  ];
  const tasks = [{ text: 'Viewer ki feed aur creator ka index dono ACTIVE hain', check: indexReady },
    { text: 'Teen test posts apne viewer aur creator ke saath bachi hain', check: postsReady },
    { text: 'PITR chalu hai. Weekly snapshot mein teenon posts aur S3 mein manifest hai', check: exportReady },
    { text: 'Accounts ka encrypted Aurora PostgreSQL cluster available hai', check: clusterReady }];
  const terminal = { type: 'terminal', title: 'Feed, report aur accounts ko apni jagah do',
    goal: 'cat release.txt padho. Feed table aur index banao. Test posts daalo. PITR chalu karke weekly export lo. Jawaab se ExportArn lekar describe-export karo. Pehle galat snapshot liya ho toh sudhre data par naya token lo. Accounts cluster banao aur ready hone tak ruko.',
    instructions: 'PITR se pichhle waqt ke data ki copy mil sakti hai. Simulator ek full export ka snapshot aur manifest rakhta hai. Lab 34 asli gzip file bhi kholti hai.',
    account: account(), files, tasks, hints: ['ls aur cat index.json se keys padho.', ...commands], solution: commands, success: AG.allOf(tasks),
    successText: 'Feed aur creator index ready hain. Report ko table padhe bina snapshot mila. Aurora cluster ban gaya. SQL connection ke liye abhi writer DB instance chahiye.' };
  // The same post can appear in a second viewer's feed. Only its original row enters byCreator.
  const viewerCopy = { userId: 'u42', postKey: sample[0].postKey, authorId: 'c4', country: 'IN' };
  const ivAccount = account();
  ivAccount.tables.push({ name, tableId: '11111111-1111-4111-8111-111111111134', status: 'ACTIVE', billing: 'PAY_PER_REQUEST',
    partitionKey: 'userId', sortKey: 'postKey', attributeTypes: { userId: 'S', postKey: 'S' }, items: [...sample, viewerCopy], gsis: [], lsis: [], revision: 1 });
  const ivTasks = [{ text: 'Wahi table, teen posts aur doosre viewer ki copy bachi hai', check: s => feed(s)?.tableId === ivAccount.tables[0].tableId && postsReady(s) && contains(feed(s).items, [viewerCopy]) },
    tasks[0], { text: 'byCreator ki Query mein c4 ki dono poori posts mili hain', check: s => {
      const t = feed(s), r = t?.lastRead;
      return indexReady(s) && r?.op === 'query' && r.index === 'byCreator' && r.revision === t.revision &&
        !r.hasMore && r.items.length === 2 && contains(r.items, [sample[0],sample[2]]);
    } }];
  const ivCommands = ['aws dynamodb update-table --table-name pix-feed --attribute-definitions AttributeName=creatorId,AttributeType=S AttributeName=postKey,AttributeType=S --global-secondary-index-updates file://add-index.json',
    commands[1], commands[2], `aws dynamodb query --table-name pix-feed --index-name byCreator --key-condition-expression 'creatorId = :c' --expression-attribute-values '{":c":{"S":"c4"}}'`];
  const ivTerm = { title: 'Creator page se table scan hatao', goal: 'Feed pehle se live hai. Teen posts aur u42 ki feed copy bachao. byCreator index jodo. Index ACTIVE dekh kar creator c4 ki posts key se padho.',
    instructions: 'cat add-index.json se shuru karo. Table ka userId raasta bhi chalna chahiye.',
    account: ivAccount, files, tasks: ivTasks, hints: ivCommands, solution: ivCommands, success: AG.allOf(ivTasks),
    successText: 'c4 ki dono posts index ki Query se mili. Viewer ki table dobara banaani nahi padi.' };

  // These are PixShare budget inputs for five independent features. They are not AWS quotes.
  const patterns = [
    ['joins','Accounts aur orders ke joins','Aurora',720 * .5 * .12,'0.5 ACU × 720 ghante × $0.12'],
    ['key','Viewer ID se feed','DynamoDB',10 * .125 + 2 * .625,'10M read units × $0.125/M + 2M write units × $0.625/M'],
    ['report','S3 par weekly SQL','Athena',4 * 5,'4 TB scan × $5/TB'],
    ['graph','Teen hops ka follow graph','Neptune',720 * .20,'720 instance-ghante × $0.20'],
    ['text','Caption ke lafz dhoondo','OpenSearch',720 * .15,'720 node-ghante × $0.15']
  ];
  const fits = k => k.joins === 1 && k.key === 1 && k.report === 1 && k.graph === 0 && k.text === 0;
  const flow = { type: 'flowlab', title: 'Har nayi query ka monthly kharcha dekho',
    goal: 'Is release mein accounts ke joins, viewer ki feed aur S3 par weekly SQL chahiye. Sirf in teen needs ko chuno.',
    scenario: '30 din ka course budget hai. Har switch alag feature ka kharcha jodta hai. Rates PixShare ke budget examples hain. Graph aur search ke ghante team ki maani hui quotes hain. DynamoDB units mein index writes bhi gine hain. Athena ke 4 TB pehle se S3 par hain. Storage, PITR, export, network aur extra replicas ka bill alag hai.',
    knobs: patterns.map(([id,label]) => ({ id, label, min: 0, max: 1, step: 1, value: 0, labels: ['Band','Chalu'] })),
    check: fits, model(k) {
      const picks = patterns.filter(([id]) => k[id]), total = picks.reduce((sum,p) => sum+p[3],0);
      return { readouts: [{ label: 'Store chuno', value: picks.map(p => p[2]).join(' + ') || 'Pehle ek query chuno' },
          { label: '30 din ka chuna kharcha', value: '≈ $' + total.toFixed(2) }, ...picks.map(p => ({ label: p[2] + ' ka hisaab', value: p[4] }))],
        verdict: { ok: fits(k), text: fits(k) ? 'Teen queries ke liye mahine ka model ≈ $65.70 hai.' : 'Sirf wahi features chalu karo jo is release mein chahiye.' } };
    }, lesson: 'Naya store chalaane se copy, access aur recovery ka kaam bhi badhega. Do query ek store par sahi chalti hon toh doosre store ka poora kharcha pehle dekho.' };
  const q = (q, choices, answer, explain, domain='performance') => ({ q, choices, answer, explain, domain });

  const edges = ['sql','cache','feed'].map(to => ({ from: 'api', to }));
  const dry = { type: 'dryrun', title: 'Asha ne feed kholi. Kaunsa store kab laga?',
    goal: 'Feed ki pehli aur doosri read dekho. Phir weekly report ki read units gino.',
    intro: 'PixShare story ke example times hain. Requests ek ke baad ek chalti hain. Phone ka network aur app ka apna waqt alag hai.',
    nodes: [{ id: 'api', label: 'Feed API', icon: '📱', x: 145, y: 210 }, { id: 'sql', label: 'Aurora', icon: '🔐', x: 690, y: 85 },
      { id: 'cache', label: 'Cache', icon: '⚡', x: 690, y: 230 }, { id: 'feed', label: 'DynamoDB', icon: '📰', x: 690, y: 375 }],
    edges, panels: [{ id: 'trace', title: 'Request ka raasta' }, { id: 'bill', title: 'Kya padha?' }],
    steps: [
      { say: 'Asha ki pehli request par Aurora ne account access dekha. Viewer ki cache key khaali thi. DynamoDB ne 12 post keys lautayi. Cache fill baad mein hota hai.',
        flows: edges, panels: { trace: ['Aurora mein 4 ms → cache par 1 ms → feed Query mein 6 ms'], bill: ['userId = u07, postKey ke order mein 12 posts'] },
        ask: q('Jawaab se pehle teen reads mein kitna waqt laga?', ['Teen reads ka kul waqt 11 ms','Teen reads ka kul waqt 6 ms','Teen reads ka kul waqt 5 ms','Teen reads ka kul waqt 24 ms'],0,
          'Is trace mein koi read saath nahi chali. Access ko 4 ms, cache ko 1 ms aur feed ko 6 ms lage. Teenon ko jodne par 11 ms mile.') },
      { say: 'Asha ne phir feed kholi. Access ab bhi sahi hai. Usi viewer aur access version ki cache key mili.',
        flows: edges.slice(0,2), panels: { trace: ['Aurora 4 ms → cache hit 1 ms = 5 ms'], bill: ['Is baar feed table ko Query nahi gayi'] },
        ask: q('Doosri request mein kaunsa kaam bacha?', ['Account access ki SQL read bachi','Feed table ki key Query bachi','Cache key ki pehli read bachi','Account ki login jaanch bachi'],1,
          'Cache mein viewer ke liye taiyaar feed mili. API ne account access phir bhi check kiya. DynamoDB tak ki 6 ms wali Query bach gayi.') },
      { say: 'Ab manager ne country report kholi. Ek Scan page mein 4 KiB ke 256 items padhe. Aakhir mein filter ke baad sirf do items mile.',
        flows: [edges[2]], panels: { trace: ['Eventually consistent read, 256 × 4 KiB = 1 MiB'], bill: ['Is model mein har 4 KiB ke liye 0.5 read unit'] },
        ask: q('Is bhare page ka read kharcha kitna hai?', ['Filter ke baad bas 1 read unit','Poore page ki 256 read units','Poore page ki 128 read units','Sirf 2 items ki 2 read units'],2,
          'Filter lagne se pehle 1 MiB padha gaya. Eventually consistent read mein 256 × 0.5 = 128 read units lage. Do matches se bill tay nahi hota.','cost') }
    ], lesson: 'Feed mein key se chhota hissa padho. Report ke liye S3 ki copy par SQL chalao. Har dashboard refresh par live feed dobara padhne ka kharcha bachega.' };
  const decide = { type: 'decide', title: 'Decision Dojo · Kaunsi query, kaunsa store?', tree: 'database', scenarios: 4 };
  const triage = { type: 'triage', title: 'Weekly report ne live feed ko dheema kar diya',
    symptom: 'PixShare story · Report teen ghante chali. Dashboard ne wahi 4 TiB table 12 baar padhi. Report ko hafte ke ant tak ka data chalega.',
    goal: 'Trace aur CloudWatch se report ka raasta chuno.',
    commands: [
      { cmd: 'cat report-trace.txt', out: 'operation=Scan  table=pix-feed  pages_per_pass=4194304  evaluated_per_pass=4 TiB  passes=12  filter=country',
        clue: true, note: 'Full pages par 4 TiB ka data read hua. Country ka filter bytes padhne ke baad laga.' },
      { cmd: 'cat cloudwatch-window.txt', out: 'pix-feed: ConsumedReadCapacityUnits ↑  ReadThrottleEvents ↑  report start=08:00',
        clue: true, note: 'Report ke waqt table ki reads aur throttles badhe. Trace ne mehenga caller dikhaya.' },
      { cmd: 'cat media-upload.txt', out: 'S3 PutObject success. Upload queue age: 1 s.', clue: false, note: 'Photo upload ka raasta alag hai. Report ke Scan ka saboot trace mein hai.' }
    ], questions: [
      q('Report mein sirf do countries dikhti hain. Bill kyun badha?', ['Har photo ki S3 copy padh li gayi','Cache mein dono keys expire ho gayin','Index par strong read chali thi','Filter se pehle poori table padhi'],3,
        'Scan ne har pass mein 4 TiB dekha. Filter ne output chhota kiya. Read units pehle padhe bytes par lage aur live feed se capacity share hui.','cost'),
      q('Hafte ki copy chalegi. Agli report ka raasta kya ho?', ['PITR export lo, S3 par Athena chalao','Scan ke har page ki limit aadhi karo','Har refresh se pehle cache saaf karo','Wahi Scan chaar workers mein baanto'],0,
        'Point-in-time export live table ki read units use nahi karta. S3 ke data ke liye schema banao aur Athena se report padho. Export aur SQL ka apna bill hai.','cost')
    ] };
  const lab = { type: 'docker', title: 'Lab 34 · Wahi 12 posts do tareekon se padho', project: '34-polyglot-data',
    goal: 'Query aur Scan ke items, pages, consumed capacity aur laptop ka time milao. S3 ki export file bhi kholo.',
    why: 'Output milne se sirf jawaab sahi dikhta hai. ScannedCount aur LastEvaluatedKey dikhate hain ki jawaab tak pahunchne mein kitna data padha.',
    steps: [{ text: 'Project root se Lab 34 chalao.', cmd: './docker-labs/.venv/bin/python -I docker-labs/34-polyglot-data/lab.py', expect: 'Apne Moto port par 32 viewers ki 384 posts banengi.' },
      { text: 'HOST CHECK ki dono lines dekho.', expect: 'Query mein 12 items padhe. Filtered Scan mein 384 items padhe. Dono ne wahi 12 posts lautayi.' },
      { text: 'Export, cluster aur cleanup padho.', expect: 'S3 file mein 384 rows milengi. Cluster mein writer zero hai. Aakhir mein Moto ka port band milega.' }],
    observe: q('Kaunsi sankhya batati hai ki Scan ne zyada kaam kiya?', ['Dono reads ke returned rows dekho','Har page ka ScannedCount jodo','Sirf pehle page ki Count padho','Dono calls ka status code dekho'],1,
      'Returned rows dono baar 12 hain. Har page ka ScannedCount jodne par 384 aur 12 ka farak milta hai. Moto ka time laptop par badal sakta hai.') };
  const quiz = { type: 'quiz', bonus: true, title: 'PixShare ke aath data faisle', questions: [
    q('Viewer ka feed sabse nayi post pehle dikhata hai. Primary key kaun si lo?', ['PK country, SK display name','PK postKey, SK creator name','PK userId, SK time aur post ID','PK caption, SK upload size'],2,
      'userId se viewer ka hissa milta hai. Ek hi format ka UTC time aur unique post ID saath rakhne se order banta hai. Query ulte order mein bhi padh sakti hai.'),
    q('Maya ko follow karne walon ke teen hops par common creators chahiye. Kya test karo?', ['Athena par raw photo list','DynamoDB par caption filter','S3 ke prefix par object count','Neptune par graph traversal'],3,
      'Teen hops mein har follow link agle links tak le jaata hai. Neptune par nodes aur edges rakh kar teen hops ki query ko peak load par test kar sakte ho.'),
    q('Creator naya post likhta hai. byCreator GSI turant khaali dikha. Pehle kya samjho?', ['Index tak write pahunch rahi hai','Table ki primary key badal gayi','Index mein strong read chalao','PITR ka purana backup hatao'],0,
      'Global secondary index ko table ke badlaav thodi der baad mil sakte hain. Nayi post turant dikhani ho toh app ka read path alag design karo.','resilient'),
    q('Device app ke paas Cassandra CQL drivers aur query patterns hain. Kaunsa fit pehle jaancho?', ['Amazon Neptune graph store','Amazon Keyspaces ka CQL API','OpenSearch ka search index','Aurora ka SQL reader endpoint'],1,
      'Keyspaces Cassandra ke CQL clients ke saath kaam karta hai. App ke data types, statements aur limits ka supported subset pehle test karo.'),
    q('Support ko caption mein spelling ki chhoti galti par bhi photo dhoondni hai. Kya chune?', ['Aurora ka doosra read endpoint','DynamoDB ki ek aur sort key','OpenSearch ka text index','S3 ki object version list'],2,
      'Search index mein caption ke words aur fuzzy matching ka rule rakh sakte ho. Search ka result refresh hone mein der ho sakti hai.'),
    q('Naya customer sensor metrics time ke hisaab se padhega. Timestream family mein kya dekhe?', ['LiveAnalytics par naya DB','Cassandra ka ek counter column','Aurora mein read-only replica','Timestream for InfluxDB'],3,
      '20 June 2025 se Timestream for LiveAnalytics naye customers ke liye band hai. AWS naye time-series projects ke liye Timestream for InfluxDB dekhne ko kehta hai.'),
    q('Document app MongoDB driver use karti hai. Migration se pehle kya karo?', ['DocumentDB par app ki queries chalao','Pehle sabhi photos BSON mein rakho','Sirf driver ka version naam milao','Document rows ko CSV mein badlo'],0,
      'DocumentDB MongoDB API ke saath compatible hai. Har operator aur index ka support ek jaisa maan lene se app toot sakti hai. Apni query list test karo.'),
    q('Weekly S3 export pichhle Sunday ka hai. Analyst abhi tak ke orders maangta hai. Kya dekho?', ['S3 object ki filename length dekho','Copy ka waqt aur chahiye freshness','Athena ka result font size dekho','Feed ka sort order phir palat do'],1,
      'Athena export ke waqt tak ka data padhega. Naye orders chahiye toh copy ko refresh karo ya lag ki shart poori karne wala doosra raasta lo.','resilient')
  ] };
  const interview = { title: 'PixShare ka data review', instructions: 'Chaar faisle lo. Phir creator page ki Query theek karo.',
    questions: [
      q('Aurora writer busy hai. Readers aur khaali hain. Pehle kya dekho?', ['Har read ke liye writer hi chuno','Sirf aur reader instances jodo','Slow writes, locks aur indexes dekho','Har order ko cache mein hi rakho'],2,
        'Aam Aurora cluster mein writes ek writer par jaati hain. Pehle write ka waqt, locks, indexes aur capacity naapo. Readers badhaane se writes divide nahi hoti.'),
      q('Leaderboard ka primary data memory mein chahiye. Acknowledged write bachni chahiye. Kaunsa fit jaancho?', ['Sirf client ki local cache','Sirf CDN mein sorted list','Temporary worker ki RAM','MemoryDB ka durable log'],3,
        'MemoryDB durable in-memory database hai. Multi-AZ log, client ki retry aur recovery ka test karo. Leaderboard ki copy cache mein rakhna alag zaroorat hai.','resilient'),
      q('Accounts ka Aurora cluster CLI se bana. Members list khaali hai. SQL ka agla kadam?', ['Cluster mein writer instance banao','Aurora ka reader endpoint badlo','Cluster ke snapshot ko tag karo','Cluster ka backup time badal do'],0,
        'CLI se Aurora cluster banne par pehla DB instance alag banaana padta hai. Pehla instance writer banta hai. Tab endpoint se login aur write check karo.'),
      q('Har din kai teams DynamoDB data par joins chalaati hain. Managed warehouse copy chahiye. Kya dekho?', ['OpenSearch par caption analyzer badlo','DynamoDB se Redshift zero-ETL dekho','Athena ka result bucket badal do','Base table par weekly Scan badhao'],1,
        'DynamoDB ki Redshift zero-ETL integration pehle copy banaati hai aur baad mein updates laati hai. PITR, permissions, Region aur copy ka lag pehle jaancho.','cost'), { terminal: ivTerm }
    ] };

  const card = (q, analogy, body, points, asli) => ({ q, analogy, body: '<p>' + body + '</p>', points, asli });
  AG.registerLevels('architect', [{
    id: 'datastore', icon: '🗄️', title: 'PixShare ki feed aur weekly report kahan padhein?', badge: 'Data Shape Darshi',
    objectives: ['Viewer, creator aur report ke liye alag read paths banao.', 'Query aur Scan ke padhe items aur units milao.', 'Feed ka index, weekly export aur accounts cluster banao.'],
    hook: { when: 'PixShare story · Sale ke baad pehla Monday', title: 'Asha ko 12 posts chahiye. Manager ko poora hafta.',
      text: 'Asha phone par feed kholti hai. Usi waqt manager poochta hai ki har country mein kis creator ki sabse zyada posts thin. Report teen ghante leti hai. Asha ki feed bhi dheemi padti hai.',
      mission: 'Pata lagao har sawaal kitne items padhta hai. Asha ke feed ko viewer ki key do. Manager ko S3 par hafte ki copy do.' },
    steps: [
      card('Pehli query kaise likhein?', 'Library mein card number se ek kitaab mil jaati hai. Har shehar ke sabse padhe gaye lekhak ki list alag kaam hai.',
        'Pehle input aur chahiye output likho. Viewer u07 ki aakhri 12 posts aur har country ke top 10 creators alag reads hain. Pehli screen ko turant jawaab chahiye. Manager Sunday tak ka data maan sakta hai.',
        ['Photo ke bytes S3 mein aur object key post ke metadata mein rakho.', 'Account update jaise chhote writes ko OLTP kehte hain. Bahut rows par report nikaalna OLAP hai.'], 'Agar ek hi SQL store dono targets poore kare toh pehle wahi rakho. Nayi copy ke saath sync aur recovery ka kaam judta hai.'),
      card('Viewer aur creator dono ko posts kaise milengi?', 'Register viewer ke naam se rakha hai. Creator ke naam ka doosra index usi post tak le jaata hai.',
        'DynamoDB table ki partition key userId hai. Sort key postKey mein ek hi UTC format ka time aur alag post ID hai. Query ek viewer ki key leti hai. Wahi time hone par bhi do alag posts ki keys alag rahengi. Creator page ke liye byCreator global secondary index (GSI) mein creatorId aur postKey rakho.',
        ['Post do viewers ko dikhe toh creator page par do copies nahi chahiye. Sirf ek asli row par indexed creatorId rakho. Viewer copy mein authorId likho. creatorId ke bina copy is GSI mein nahi aati.', 'GSI apni keys aur chune attributes project karta hai. Extra writes aur storage ka kharcha gino. GSI ki reads eventually consistent hain.', 'Ek hi popular creator par load jam sakta hai. Key ka bantwaara aur throttles naapo. Har Query aur Scan mein agla page LastEvaluatedKey se padho jab tak key milna band ho.'], 'Ek viewer ki 12 posts ke liye poori table ka Scan usi output tak pahunchne mein zyada data padh sakta hai.'),
      card('Accounts par SQL kab rakhein?', 'Ek transfer mein ek khaate se paisa ghate aur doosre mein badhe. Dono entries saath honi chahiye.',
        'Users, plans aur invoices ko join karna hai. Aurora PostgreSQL ya RDS PostgreSQL par constraints aur transactions kaam aate hain. Aam Aurora cluster mein ek writer hota hai. Read replicas reads baant sakti hain. Serverless v2 mein har DB instance ki capacity min aur max ACU ke beech load par badalti hai.',
        ['Writer pehle se busy ho toh slow SQL, locks, indexes aur CPU jaancho. Phir size aur write batching test karo.', 'Phir bhi write target na mile toh tenant key se shards banaane ka faisla dekho. Cross-shard joins, transactions aur ek hot tenant ka kharcha badh sakta hai.'], 'Badi table akeli database badalne ki wajah nahi hai. Write bottleneck aur latency ka saboot lo.'),
      card('Cache par feed kab deni hai?', 'Aaj ke menu ki copy counter par milti hai. Naya menu aaye toh purani copy badalni padti hai.',
        'ElastiCache mein viewer aur access version ke naam se feed rakho. Cache miss par DynamoDB padho. Chhoti TTL yani copy ki umr rakho. Hit par bhi account access check karo. Unfollow ya private post ke baad purani copy ka raasta band karo.',
        ['PixShare trace mein pehli feed 11 ms aur dobara kholne par 5 ms hai. Asli app mein dono time naapo.', 'MemoryDB par primary state aur durable log chahiye ho toh write aur restore test karo. DAX DynamoDB ki supported reads ke liye cache ka ek aur raasta hai.'], 'Cache saaf hone par Asha ki asli posts table mein milni chahiye.'),
      card('Follow graph aur caption search kahan jaayenge?', 'Ek sawaal logon ke rishte follow karta hai. Doosra caption ke lafz dhoondta hai.',
        'Seedha “main kise follow karti hoon” ek key ya SQL index se mil sakta hai. Teen hops par common follows ya fraud links baar-baar dhoondne hon toh Neptune graph test karo. Caption mein lafz, spelling aur relevance chahiye toh OpenSearch mein text index banao.',
        ['MongoDB API wali document app ke liye DocumentDB par queries aur operators test karo. Cassandra CQL wali app ke liye Keyspaces ka support dekho.', 'Time ke saath device readings poochni hain toh Timestream family dekho. LiveAnalytics naye customers ke liye 20 June 2025 se band hai. AWS naye customers ko Timestream for InfluxDB dekhne ko kehta hai.'], 'Har naya index ya store data ki copy rakhta hai. Permission badle ya post delete ho toh copy tak badlaav pahunchna bhi test karo.'),
      card('Manager ki report ko feed se kaise hataayein?', 'Sunday ko register ki copy accounts team ko do. Dukaan ki live line apna register use kar sakegi.',
        'Point-in-time recovery (PITR) chalu karo. DynamoDB Export to S3 se chune waqt ka full snapshot lo. Export table ki read capacity use nahi karta. Export ka alag bill hai. COMPLETED status aur manifest dekho. Athena ki table ko export ke data files par point karo. DynamoDB JSON ke typed fields ko schema mein padho ya Parquet mein badlo.',
        ['Athena mein SQL se country aur creator par group karo. Date partition aur Parquet se zaroori columns aur dates ke bytes kam padh sakte hain.', 'Baar-baar warehouse joins ke liye DynamoDB zero-ETL integration with Amazon Redshift dekho. Search ki copy ke liye DynamoDB zero-ETL integration with Amazon OpenSearch Service bhi hai. Dono ka lag aur access alag se jaancho.'], 'Weekly snapshot ka time report par likho. Manager ko aaj ka data chahiye toh Sunday ka export purana padega.'),
      card('Scan ke bill ka andaaza kaise lagaayein?', 'Do matching slips nikaalne ke liye agar sab 256 slips palatni padin toh kaam sab slips ka hua.',
        'Scan mein filter data padhne ke baad lagta hai. Ek full 1 MiB page mein 4 KiB ke 256 items hon toh eventual read ka model 128 units hai. Har page ki units jodo. Projection se jawaab chhota hota hai. Base table Scan ki read units padhe gaye items ke size par rehti hain.',
        ['PixShare story mein 4 TiB ke full pages ki ek pass lagbhag 537 million eventual read units hai. 12 passes aur approx $0.125/million units par kareeb $805 read charge hai. US East Standard on-demand ka example hai.', 'Ek chhoti table par ek baar ka Scan chal sakta hai. Frequency, size aur feed ka peak dekh kar report copy ka poora kharcha milao.'], 'Latency, returned items aur evaluated items teen alag cheezein hain. Lab mein teenon dekho.')
    ],
    myth: [
      { myth: 'Users badhe toh RDS zaroor tootega.', sach: 'Reads, writes, locks aur query plan naapo. Reader, writer tuning ya sharding ka chunav bottleneck se hota hai.' },
      { myth: 'Filter se do posts mili toh bill do posts ka hai.', sach: 'Filter lagne se pehle items padhe jaate hain. Har page ka ScannedCount aur consumed capacity dekho.' },
      { myth: 'S3 export ke liye apna Streams worker likhna hi padega.', sach: 'PITR ke saath managed export milta hai. Continuous copy chahiye toh destination aur freshness dekh kar integration chuno.' }
    ],
    playbook: { title: 'Har screen ka data path likho', use: ['Known viewer key ke liye DynamoDB Query.', 'Ek hi transaction mein kai relational updates ke liye SQL.'],
      avoid: ['Har dashboard refresh par live table ka Scan.', 'Kisi aur viewer ki cached private feed dikhaana.'],
      how: ['Key, rows, freshness aur access likho.', 'Expected rows ko padhe items se milao.', 'Export ka waqt, manifest aur sample rows padho.', 'Ek mahine ka read, copy aur storage bill jodo.'],
      redflags: ['Count chhota, ScannedCount bada', 'Readers khaali aur writer par locks', 'Search ya cache mein deleted post'],
      rule: 'Pehle sawaal aur freshness likho. Phir ek sahi jawaab ka poora waqt aur bill gino.' },
    exam: [
      { cue: 'Accounts, joins aur ek saath updates', pick: 'RDS ya Aurora' },
      { cue: 'SQL load upar neeche hota hai', pick: 'Aurora Serverless v2' },
      { cue: 'Viewer key aur time order', pick: 'DynamoDB partition aur sort key' },
      { cue: 'Hafte ki S3 copy par kabhi-kabhi SQL', pick: 'Athena' },
      { cue: 'Teen hops par common follows', pick: 'Neptune' },
      { cue: 'Caption par lafz aur fuzzy search', pick: 'OpenSearch' },
      { cue: 'MongoDB driver ya Cassandra CQL', pick: 'DocumentDB ya Keyspaces ka support jaancho' },
      { cue: 'Durable primary data memory mein', pick: 'MemoryDB ka write contract dekho' }
    ],
    stages: [dry, flow, decide, triage, terminal, lab, quiz], interview,
    success: ['Main feed Query aur report Scan ka kaam naap sakta hoon.', 'Main viewer aur creator ke liye alag keys chun sakta hoon.', 'Main export ke waqt aur report ki freshness ka farak bata sakta hoon.'],
    homework: '<p>Lab 34 ke dono reads ka returned count, evaluated count, pages aur units likho. Optional AWS sandbox mein apni chhoti test table par Query aur filtered Scan ke consumed units milao. Reads, writes aur storage ka bill aa sakta hai. Kaam ke baad apni test table hatao.</p>',
    cards: [
      { front: 'PixShare mein userId aur postKey kyun?', back: 'Viewer ki partition chuno. Us partition mein time aur unique post ID ke order se feed padho.' },
      { front: 'byCreator GSI ki nayi row turant kyun nahi mili?', back: 'GSI async update hota hai aur eventual reads deta hai. Nayi write dikhne mein der ho sakti hai.' },
      { front: 'Scan filter se bill kab ghatega?', back: 'Filter khud padhne ka bill nahi ghataata. Key se chhota hissa padho ya report copy use karo.' },
      { front: 'Aurora readers badhaane par writer ka kya hoga?', back: 'Readers par bheji reads ka load hat sakta hai. Writes phir bhi writer par jaati hain.' },
      { front: 'Ek follow list aur teen-hop graph mein farak?', back: 'Ek list key se mil sakti hai. Baar-baar kai links paar karne hon toh Neptune test karo.' },
      { front: 'Weekly export ka pehla aur aakhri check?', back: 'PITR enabled ho. COMPLETED status, export ka waqt, S3 manifest aur sample data milao.' },
      { front: 'S3 data par SQL aur lagataar warehouse joins?', back: 'Kabhi-kabhi S3 SQL ke liye Athena. Warehouse copy ke liye Redshift zero-ETL ka lag aur bill jaancho.' }
    ]
  }]);
})();
