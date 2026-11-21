/* ShopKaro ka region game day. Numbers below belong to the course scenario. */
(() => {
  const { primary, standby, keyId, keyArn, secret, group } = AG.regionDrill;
  const zone = 'ZSHOP32', hc = '00000000-0000-4000-8000-000000000001';
  const probe = { Type: 'HTTPS', FullyQualifiedDomainName: 'mumbai.shopkaro.test', Port: 443, ResourcePath: '/ready', RequestInterval: 30, FailureThreshold: 3 };
  const alarm = { AlarmName: 'checkout-errors', Namespace: 'ShopKaro', MetricName: 'FailedOrders', Statistic: 'Sum',
    Period: 60, EvaluationPeriods: 1, Threshold: 5, ComparisonOperator: 'GreaterThanOrEqualToThreshold' };
  const records = ['PRIMARY', 'SECONDARY'].map((role, i) => ({
    Name: 'checkout.shopkaro.test.', Type: 'A', TTL: 30, SetIdentifier: role.toLowerCase(), Failover: role,
    ResourceRecords: [{ Value: i ? '192.0.2.20' : '192.0.2.10' }], ...(i ? {} : { HealthCheckId: hc })
  }));
  const file = value => ({ content: JSON.stringify(value, null, 2) });
  const files = {
    'probe.json': file(probe),
    'dns.json': file({ Changes: records.map(ResourceRecordSet => ({ Action: 'UPSERT', ResourceRecordSet })) }),
    'alarm.json': file(alarm),
    'runbook.txt': { content: 'Mumbai ' + primary + ' mein primary key ' + keyId + ' aur secret ' + secret +
      '. Hyderabad ' + standby + ' mein replica ARN ' + keyArn(standby) + '. Group checkout-dr ka min aur desired 3 rakho. Zone ZSHOP32 mein probe.json se check banao. dns.json ka HealthCheckId pehle check ka ID hai. DNS change ka waiter chalao. alarm.json Hyderabad ki app metric ke liye hai.' }
  };
  function seed() {
    return { region: primary, hostedZones: [{ id: zone, name: 'shopkaro.test.', records: [{ Name: 'mumbai.shopkaro.test.', Type: 'A', TTL: 30, ResourceRecords: [{ Value: '192.0.2.10' }] }] }], healthChecks: [],
      dnsHealthFixtures: { 'mumbai.shopkaro.test': true }, regionDrill: { replica: false, secretKey: '', min: 0, desired: 0, alarms: [] } };
  }
  const solution = [
    'aws kms replicate-key --region ' + primary + ' --key-id ' + keyId + ' --replica-region ' + standby,
    'aws secretsmanager replicate-secret-to-regions --region ' + primary + ' --secret-id ' + secret + ' --add-replica-regions Region=' + standby + ',KmsKeyId=' + keyArn(standby),
    'aws autoscaling update-auto-scaling-group --region ' + standby + ' --auto-scaling-group-name ' + group + ' --min-size 3 --desired-capacity 3',
    'aws route53 create-health-check --caller-reference mumbai-ready --health-check-config file://probe.json',
    'aws route53 change-resource-record-sets --hosted-zone-id ' + zone + ' --change-batch file://dns.json',
    'aws route53 wait resource-record-sets-changed --id /change/C000000001',
    'aws cloudwatch put-metric-alarm --region ' + standby + ' --cli-input-json file://alarm.json'
  ];
  const tasks = [
    { text: 'Hyderabad mein Mumbai ki multi-Region key ki replica hai', check: s => s.account.regionDrill.replica },
    { text: 'Checkout secret Hyderabad mein usi replica key ke saath hai', check: s => s.account.regionDrill.secretKey === keyArn(standby) },
    { text: 'Hyderabad ke group mein 300 orders/s ke liye kam se kam 3 servers ka floor hai', check: s => s.account.regionDrill.min >= 3 && s.account.regionDrill.desired >= 3 },
    { text: 'Mumbai ke HTTPS /ready par health check chalu hai', check: s => s.account.healthChecks.some(h => h.id === hc &&
      Object.entries(probe).every(([k,v]) => h.config[k] === v) && !h.config.IPAddress && !h.config.Disabled && !h.config.Inverted) },
    { text: 'Dono DNS records serve ho rahe hain aur primary ke saath check juda hai', check: s => {
      const z = s.account.hostedZones.find(z => z.id === zone);
      const pairReady = rows => records.every(r => (rows || []).some(a => a.Name === r.Name && a.Type === r.Type && a.Failover === r.Failover &&
        a.TTL === r.TTL && a.HealthCheckId === r.HealthCheckId && a.ResourceRecords?.length === 1 && a.ResourceRecords[0].Value === r.ResourceRecords[0].Value));
      const probeReady = rows => rows?.some(r => r.Name === 'mumbai.shopkaro.test.' && r.Type === 'A' && r.ResourceRecords?.length === 1 && r.ResourceRecords[0].Value === '192.0.2.10');
      return [z?.records, z?.servedRecords].every(rows => probeReady(rows) && pairReady(rows));
    } },
    { text: 'Hyderabad mein 1 minute mein 5 failed orders par alarm set hai', check: s => s.account.regionDrill.alarms.some(a => a.region === standby && Object.entries(alarm).every(([k,v]) => a.config[k] === v)) }
  ];
  const terminal = {
    type: 'terminal', title: 'Drill se pehle Hyderabad taiyaar karo',
    instructions: 'cat runbook.txt se IDs padho. ls aur cat se teen JSON files dekho. Har command isi browser mein chalega. Key aur secret ki copy yahan turant ready dikhti hai. AWS par key Enabled aur secret InSync hone tak check karo.',
    goal: 'Mumbai ke secret aur key ki copy Hyderabad mein rakho. checkout-dr mein 3 servers ka floor rakho. ZSHOP32 mein failover pair aur Mumbai ka /ready check jodo. DNS change serve hone do. Phir Hyderabad mein alarm.json lagao.',
    files, account: seed(), tasks, solution, success: AG.allOf(tasks),
    hints: ['cat runbook.txt mein key ID, replica ARN aur group ka naam hai.', ...solution],
    successText: 'Ab config mein checkout ka poora raasta hai. Asli drill mein role se secret padho, ek order likho aur load ke saath time naapo.'
  };
  const interviewSeed = seed();
  Object.assign(interviewSeed.regionDrill, { replica: true, secretKey: keyArn(standby), min: 3, desired: 3,
    alarms: [{ region: standby, config: { ...alarm, Threshold: 500 } }] });
  // The failover pair is already live. Its probe only checks the web process.
  interviewSeed.healthChecks.push({ id: hc, callerReference: 'mumbai-ready', version: 1,
    config: { ...probe, ResourcePath: '/ping', Disabled: false, Inverted: false }, observedHealthy: true });
  const liveZone = interviewSeed.hostedZones[0];
  liveZone.records.push(...records);
  liveZone.servedRecords = liveZone.records.slice();
  const repairs = [
    'aws route53 update-health-check --health-check-id ' + hc + ' --resource-path /ready',
    solution.at(-1)
  ];
  const interviewTerm = {
    title: 'Web server chal raha hai. Orders phir bhi fail hain.',
    instructions: 'Checkout role, secret aur teen servers pehle se taiyaar hain. Pehle se lage health check aur alarm theek karo.',
    goal: 'Mumbai ka check /ping par hai. Process chalne par bhi writer band ho sakta hai. Usi check ko /ready par lagao. Hyderabad mein checkout-errors alarm abhi 500 failures ka wait karta hai. alarm.json se limit 5 karo.',
    account: interviewSeed, files, tasks, solution: repairs, success: AG.allOf(tasks),
    hints: ['aws route53 list-health-checks', 'aws cloudwatch describe-alarms --region ' + standby, ...repairs],
    successText: 'Failover pair ab Mumbai ki checkout readiness dekhta hai. Hyderabad mein failed orders ke liye sahi limit lagi hai.'
  };

  // One fictional 60-minute Region event in a 30-day month. No AWS SLA or price inputs.
  function plan(k) {
    const standbyOn = k.regions === 2;
    const drMinutes = [55, 32, 8][k.dr];
    const recovery = standbyOn ? drMinutes : 60;
    const loss = standbyOn ? [60, 5, 1][k.dr] : 60;
    const bill = 42000 + (standbyOn ? [6000, 16000, 34000][k.dr] : 0) + (k.cache ? 4000 : 10000) - 7000 * k.commit;
    const target = k.slo === 0 ? 99.95 : 99.99;
    const availability = 100 * (1 - recovery / 43200);
    return { recovery, loss, bill, availability, target, ok: availability >= target && loss <= 5 && bill <= 75000 };
  }
  const knob = (id, label, min, max, value, format) => ({ id, label, min, max, value, step: 1, fmt: format });
  const flow = {
    type: 'flowlab', title: 'Kitna standby budget mein aayega?',
    goal: 'Kam se kam 99.95% checkout uptime, data loss 5 minute tak aur kharcha ₹75,000/mahina tak rakho.',
    scenario: 'Course ka hisaab hai. 30 din mein ek baar Mumbai 60 minute band hai. Ek Region mein repair aur backup se recovery 60 minute, data gap 60 minute hai. Do Regions mein backup, chhota standby aur poori capacity ke recovery time 55, 32 aur 8 minute hain. Data gaps 60, 5 aur 1 minute hain. Base ₹42,000/mahina hai. Doosre Region ka kharcha mode ke saath ₹6,000, ₹16,000 ya ₹34,000 judta hai. Catalogue cache ke saath reads ₹4,000 padte hain, bina cache ₹10,000. Pura use hone wale compute commitment se ₹7,000 bachte hain.',
    knobs: [knob('slo','Uptime ka target',0,1,0,v => v ? '99.99%' : '99.95%'), knob('regions','Kitne Regions?',1,2,1,String),
      knob('cache','Catalogue cache',0,1,0,v => v ? 'Chalu' : 'Band'), knob('dr','Doosre Region ki taiyaari',0,2,0,v => ['Backup','Chhota standby','Poori capacity'][v]),
      knob('commit','Pakka compute kharcha',0,1,0,v => v ? 'Commit kiya' : 'On demand')],
    model(k) {
      const p = plan(k);
      return { readouts: [{ label: 'Drill uptime', value: p.availability.toFixed(3) + '%' }, { label: 'Checkout band', value: p.recovery + ' minute' },
        { label: 'Data gap', value: p.loss + ' minute' }, { label: 'Mahine ka kharcha', value: '₹' + p.bill }],
        verdict: { ok: p.ok, text: p.ok ? 'Checkout, data aur kharcha teeno limits ke andar hain.' :
          p.availability < p.target ? 'Chune hue target ke liye checkout bahut der band hai.' : p.loss > 5 ? 'Data gap 5 minute se bada hai.' : 'Mahine ka kharcha ₹75,000 se zyada hai.' } };
    },
    check: k => plan(k).ok,
    lesson: '30 din mein 99.95% ka budget 21.6 minute hai. Team ko 8 minute ka recovery time asli order se naapna hoga. Doosre kaaran se hua downtime bhi isi budget mein judta hai.'
  };
  const q = (text, choices, answer, explain, domain = 'resilient') => ({ q: text, choices, answer, explain, domain });
  const dry = {
    type: 'dryrun', title: 'Mumbai ka Region drill, minute dar minute',
    goal: '300 orders/s ka checkout pehle se taiyaar raaste se chalao.',
    intro: 'ShopKaro ki kahani mein nayi machines launch karne aur DNS settings badalne ka raasta drill ke dauran band hai.',
    nodes: [{ id: 'shop', label: 'Buyer', icon: '🛒', x: 120, y: 245 }, { id: 'dns', label: 'Route 53', icon: '📡', x: 375, y: 245 },
      { id: 'mu', label: 'Mumbai', icon: '🏬', x: 715, y: 100 }, { id: 'hy', label: 'Hyderabad', icon: '🏬', x: 715, y: 365 }],
    edges: [{ from: 'shop', to: 'dns' }, { from: 'dns', to: 'mu' }, { from: 'dns', to: 'hy' }],
    panels: [{ id: 'log', title: 'Drill diary' }],
    steps: [
      { say: 'Drill se ek din pehle. Ek healthy server 100 orders/s leta hai. Mumbai band ho toh Hyderabad ko 300 orders/s akele lene hain.',
        flows: [{ from: 'dns', to: 'mu', label: 'Aaj ka traffic' }], panels: { log: ['EC2 launch drill mein band rahega.'] },
        ask: q('Drill se pehle kaunsa test karein?', ['Max size teen karke peak sale ke traffic ka wait karo', 'Teen healthy servers par 300 orders/s chalao', 'Ek server rakh kar scaling alarm lagao', 'DNS TTL ghata kar phir load naapna chhodo'],1,          'Teen servers tab kaafi hain jab checkout ne teeno par poora load sambhala ho. Max size badhaane se servers chalna shuru nahi karte.') },
      { say: 'Minute 0. Mumbai ka checkout readiness check fail hua. Hyderabad mein writer taiyaar hai. Purane writer par writes roke gaye hain.',
        flows: [{ from: 'dns', to: 'mu', tone: 'bad', label: 'Check fail' }], panels: { log: ['DNS pair aur health check kal se lage hain.'] },
        ask: q('Naye DNS jawaab kaun badlega?', ['Engineer ko primary DNS record abhi delete karna hoga', 'Hyderabad ka ASG hosted zone update karega', 'CloudWatch abhi ek naya DNS record banayega', 'Route 53 pehle se laga failover rule padhega'],3,          'Pehle se laga rule primary ki health par jawaab chunta hai. Incident ke beech DNS settings badalne ki zaroorat nahi padti.') },
      { say: 'Minute 2. Naye DNS jawaab Hyderabad ka address dete hain. Kuch buyers ab bhi Mumbai ko call kar rahe hain.',
        flows: [{ from: 'dns', to: 'hy', tone: 'ok', label: 'Naya jawaab' }], panels: { log: ['Kuch clients ke paas purana DNS jawaab ya khula connection hai.'] },
        ask: q('Ravi ko ab kya dekhna chahiye?', ['DNS cache aur khule connections dekhe', 'Nayi hosted zone ki monthly fee dekhe', 'Primary ko healthy mark karke phir dekhe', 'Secondary ki KMS key ko dobara copy karke dekhe'],0,          'Naya DNS jawaab pehle se khula connection nahi badalta. Alag clients ke cache aur retry ke kaaran recovery ka waqt alag ho sakta hai.') },
      { say: 'Minute 8. Hyderabad par test order save hua. Minute 40 par Mumbai ka web server bhi jawaab dene laga.',
        flows: [{ from: 'shop', to: 'dns' }, { from: 'dns', to: 'hy', label: 'Order save' }], panels: { log: ['Mumbai ke /ready ko writer aur data sync ki khabar chahiye.'] },
        ask: q('Mumbai ko phir ready kab dikhayein?', ['Jab Mumbai mein pehla TCP connection khul jaaye', 'Jab Hyderabad ki CPU girne lage', 'Jab sahi writer aur data mil jaayein', 'Jab Mumbai ka DNS TTL khatam ho'],2,          'Sirf web server uthne se Mumbai ke paas naye orders nahi aa jaate. Writer, data aur ek test order jaanch kar hi primary ko ready dikhana hai.') }
    ],
    lesson: 'Ravi ne pehle se capacity rakhi aur DNS rule banaya. Recovery ka waqt us pal tak gina jab buyer ka order sahi writer par save hua.'
  };
  const bins = { type: 'bins', title: 'Drill se pehle kya banana hai?', instructions: 'Har kaam ko sahi jagah rakho.',
    bins: [{ id: 'before', label: 'Pehle setting banao' }, { id: 'during', label: 'Drill mein chalao ya dekho' }],
    items: [
      { text: 'Hyderabad mein teen servers taiyaar rakhna', bin: 'before', explain: 'Naya server launch karne ka raasta incident mein band ho sakta hai.' },
      { text: 'Checkout ke failover records jodna', bin: 'before', explain: 'Records banane ka kaam control plane par hota hai.' },
      { text: 'Checkout role se local secret padhna', bin: 'during', explain: 'Drill ke dauran actual app role se read karne par access ka pata chalta hai.' },
      { text: 'Naye DNS jawaab aur order IDs dekhna', bin: 'during', explain: 'Jawaab ke saath order ko bhi dekho. Buyer ka kaam poora hona chahiye.' },
      { text: 'Replica key ki policy mein app role ko access dena', bin: 'before', explain: 'Doosre Region ki key policy ko pehle hi test karo.' }
    ] };
  const incident = { type: 'incident', title: 'Pager baja. Ab checkout sambhalo.', instructions: 'Har mod par buyer ke order ka raasta dekho.',
    pager: 'ShopKaro drill · Mumbai fail · Hyderabad ke teen healthy servers par load test kal hua tha.', start: 'dns',
    nodes: {
      dns: { sitrep: 'Primary ka /ready fail hai. DNS edit API drill mein band hai.', text: 'Pehle kahan dekho?',
        choices: [{ t: 'Naya DNS jawaab aur Hyderabad ka order probe dekho', good: true, next: 'writer', explain: 'Rule pehle se laga hai. Dono reads se pata chalega ki buyer kitni door pahuncha.' },
          { t: 'Hosted zone phir se banao', good: false, explain: 'Nayi zone banana isi band API par depend karta hai.' }] },
      writer: { sitrep: 'Hyderabad chal raha hai. Ek buyer ne timeout ke baad order dobara bheja.', text: 'Doosra order banne se kaise bachao?',
        choices: [{ t: 'Har retry par naya order number do', good: false, explain: 'Naya number ek hi payment ko do orders bana sakta hai.' },
          { t: 'Wahi order ID rakh kar writer par pehli entry jaancho', good: true, next: 'return', explain: 'Ek hi ID ko sirf ek baar save karne ka rule retry ko safe rakhta hai.' }] },
      return: { sitrep: 'Mumbai ka web process uth gaya. Hyderabad mein sale ke naye orders hain.', text: 'Mumbai ka health gate kab kholo?',
        choices: [{ t: 'Data sync aur writer handoff ke baad test order padho', good: true, next: 'end', explain: 'Primary healthy hote hi failover DNS phir Mumbai de sakta hai. Pehle data aur writer taiyaar karo.' },
          { t: 'Web process uthte hi /ready par 200 do', good: false, explain: 'Web process chalne par bhi primary ka writer peeche ho sakta hai.' }] },
      end: { end: true, text: 'Test order mila. Drill band karo.', summary: 'Diary mein pehla failed order, pehla sahi order aur missing IDs likho. Isi se recovery ka time aur data gap milta hai.' }
    } };
  const triage = { type: 'triage', title: 'DNS Hyderabad par hai. Checkout phir bhi fail hai.',
    symptom: 'ShopKaro ka DB Hyderabad mein copied snapshot se restore ho gaya. Hyderabad ke logs mein checkout startup fail hai. Order file ke liye replica key bani hui hai. App ab DB password maang rahi hai.',
    goal: 'App ki error aur local settings dekh kar sabse chhota fix chuno.',
    commands: [
      { cmd: 'aws secretsmanager describe-secret --region ap-south-1 --secret-id shopkaro/checkout', out: '"ReplicationStatus": []', clue: true, note: 'Primary par Hyderabad ki copy nahi dikhi.' },
      { cmd: 'aws secretsmanager describe-secret --region ap-south-2 --secret-id shopkaro/checkout', out: 'ResourceNotFoundException: Secret not found', clue: true, note: 'App ka naam sahi hai. Isi naam ka local secret nahi mila.' },
      { cmd: 'aws kms describe-key --region ap-south-2 --key-id ' + keyId, out: '"KeyState": "Enabled", "MultiRegion": true', clue: false, note: 'Enabled key hona aur local secret hona do alag checks hain.' },
      { cmd: 'aws autoscaling describe-auto-scaling-groups --region ap-south-2 --auto-scaling-group-names checkout-dr', out: '"MinSize": 3, "DesiredCapacity": 3', clue: false, note: 'Group ka floor sahi hai. Server badhaane se password nahi aayega.' }
    ],
    questions: [
      q('Sabse seedhi wajah kya mili?', ['Mumbai ke DNS cache mein puraana IP hai', 'Hyderabad mein key ki rotation band hai', 'Checkout group mein servers kam pad gaye', 'Hyderabad mein secret ki copy nahi bani'],3,        'App ne Hyderabad mein sahi naam maanga aur secret nahi mila. Mumbai ki khaali replication list bhi usi taraf ishara karti hai.'),
      q('Agli drill se pehle kaunsa proof lo?', ['Local role se secret lo aur DB login karo', 'Hosted zone ka record count dobara padho', 'Hyderabad mein checkout ASG ka max size badha do', 'Primary key par ek aur alias bana kar dekho'],0,        'Local role se secret padh kar sahi DB mein login karo. Is check mein secret ki copy, key access aur DB endpoint teeno aa jaate hain.')
    ] };
  const lab = { type: 'docker', title: 'Lab 32 · Do Regions mein checkout drill', project: '32-region-drill-terraform',
    goal: 'Terraform ke do providers se local Moto par Mumbai aur Hyderabad banao. Failover records aur standby ka readback lo.',
    why: 'Ek key ke do Regional ARN padhne aur local secret kholne se pata chalta hai ki app ki kaunsi cheez doosre Region tak pahunchi.',
    steps: [{ text: 'Project root se lab chalao.', cmd: './docker-labs/.venv/bin/python -I docker-labs/32-region-drill-terraform/lab.py', expect: 'Apna Moto port khulega. Terraform resources banayega.' },
      { text: 'Drill log mein PRIMARY healthy aur fail dono jawaab dekho.', expect: 'Host par chala model dono cases mein saved DNS records padhega.' },
      { text: 'Cleanup readback aur listener ka aakhri check dekho.', expect: 'Terraform state khaali hogi aur Moto ka port band hoga.' }],
    observe: q('HOST CHECK ka IP badalne se kya pata chala?', ['Public resolvers par ab naya IP aa chuka hai', 'Laptop ke model ne saved DNS pair se IP chuna', 'AWS probes ne Mumbai ki service check ki hai', 'EC2 ne Hyderabad mein naya order save kiya hai'],1,      'Python ne health ka input badal kar Moto se padhe records par rule lagaya. Public DNS cache, live probes aur buyer ka order alag test maangte hain.') };

  const quiz = { type: 'quiz', bonus: true, title: 'Board review ke nau sawaal', questions: [
    q('30 din ke mahine mein time-based 99.95% uptime ke liye kitni der band reh sakte hain?', ['Lagbhag 4.3 minute poore mahine mein', 'Lagbhag 43.2 minute poore mahine mein', 'Lagbhag 21.6 minute poore mahine mein', 'Lagbhag 21.6 ghante poore mahine mein'],2,      '30 din mein 43,200 minute hain. Uska 0.05% 21.6 minute hota hai. Checkout ke saare outages isi mahine ke budget mein judte hain.'),
    q('Ek AZ band hone par checkout chalna chahiye. Region outage ka target nahi hai. Pehla design?', ['Ek Region ki do AZ mein checkout chalao', 'Do Regions mein alag billing accounts banao', 'Ek AZ mein do bade servers chalao', 'Do Regions mein sirf DNS zones banao'],0,      'Do alag AZ mein app aur database ka raasta banao aur ek AZ ka load test karo. Region ki copy ka extra kharcha is sawaal ki shart nahi hai.'),
    q('Aurora Global Database mein achanak primary kho gaya. Latest orders ka risk kaise dekho?', ['Primary ka instance type aur RAM dekho', 'DNS ka TTL aur record type milaao', 'Backup ki retention aur disk size dekho', 'Replica lag aur aakhri order IDs milaao'],3,      'Cross-region copy peeche ho sakti hai. Unplanned failover par jo writes secondary tak nahi pahunchi thin unka gap lag aur order IDs se jaancho.'),
    q('DynamoDB ke do Regions mein kuch der purani read chal sakti hai. Kaunsa mode pehle dekho?', ['Ek local table par strong read rakho', 'Global table ka eventual mode dekho', 'Do tables ka roz ek backup copy karo', 'Global table ka strong mode hi rakho'],1,      'Multi-Region eventual consistency mein local writes doosre Region tak baad mein pahunch sakti hain. Requirement us delay ko maan rahi hai.'),
    q('Kal S3 Cross-Region Replication lagi. Purane invoices bhi copy karne hain. Kya karo?', ['Naya bucket bana kar DNS switch karo', 'Source ka versioning phir se chalu karo', 'Live rule par kal tak intezaar karo', 'Purane objects par Batch Replication chalao'],3,      'Live replication rule naye matching writes par lagta hai. Pehle se pade invoices ke liye S3 Batch Replication job ka scope aur result dekho.'),
    q('KMS replica ka key ID primary jaisa hai. Hyderabad mein app ko AccessDenied mila. Kahan dekho?', ['Mumbai ke DNS records ka TTL ghatao', 'Primary ka key ID Hyderabad mein badlo', 'Replica ki key policy aur app role dekho', 'Secret ka naam dono Regions mein badlo'],2,      'Related keys ka material aur ID ek hota hai. Policies aur grants har Region mein alag hote hain. App role ke decrypt access ko local key par jaancho.','secure'),
    q('Board ne 5 minute RPO diya. Drill ke baad kaunsa check karein?', ['Kaunse accepted orders recovery mein mile', 'Pehla successful HTTP response kab aaya', 'Pehli DNS query ka time kya tha', 'Naya ASG kitni der mein ready hua'],0,      'RPO data ka target hai. Aakhri bacha hua order aur outage se pehle accept hue orders milao. Pehli successful request recovery time samajhne mein madad karti hai.'),
    q('Sale ka traffic kabhi bhi badal sakta hai. Compute commitment kis hisse par socho?', ['Agle saal ki sabse badi sale par', 'Lagataar chalne wale base load par', 'Har mahine ke sabse mehenge din par', 'Sirf outage ke baad wale spike par'],1,      'Savings Plans mein har ghante ke compute kharche ka vaada hota hai. Base load ko maapne se kam traffic wale ghanton mein bhi commitment use hone ka andaaza milta hai.','cost'),
    q('Operator ko pehle se bane switch se Region badalna hai. Kaunsa raasta review kare?', ['Route 53 mein switch ke liye doosri hosted zone banao', 'Har client ko ek naya hostname bhejo', 'ARC routing control aur safety rules dekho', 'DNS fail hote hi nayi policy likho'],2,      'ARC ka routing control pehle se Route 53 health check se jodte hain. Operator data plane se switch badal sakta hai. Safety rules galat switch pair ko rok sakte hain.')
  ] };
  const interview = { title: 'Checkout design defend karo', instructions: 'Chaar faisle lo. Phir terminal mein Hyderabad ka checkout theek karo.',
    questions: [
      q('ADR mein do Regions chunne ki sabse kaam ki wajah kya hogi?', ['Region drill ka target, kharcha aur trade-off', 'Company mein ab engineers ki ginti badhi hai', 'Har doosri service par global label laga hai', 'Board ne architecture ki drawing maangi hai'],0,        'Architecture decision record mein zaroorat, doosra raasta aur chune design ka asar likho. Drill ka target aur kharcha faisle ko dobara jaanchne dete hain.'),
      q('300 orders/s aayenge. Ek healthy server 100/s leta hai. Min 1 aur max 6 hai. Launch API band hai. Kya karo?', ['Max 6 ko 9 karo aur alarm ka wait karo', 'Ek server par teen health checks laga kar peak load lo', 'Drill se pehle 3 healthy servers par load lo', 'Desired 1 rakh kar TTL ko aur ghatao'],2,        'Max ek limit hai. Launch band ho toh ek running server 300 orders/s nahi lega. Pehle se teen healthy servers aur unka load test chahiye.'),
      q('DNS failover ke baad Hyderabad mein DB login fail hai. Secret mein Mumbai ka DB host hai. Kya sudhaaro?', ['Replica ke secret ka naam badal do', 'App ko sahi Regional DB endpoint do', 'DNS ke primary ka TTL aur ghatao', 'Primary KMS key ki rotation rok do'],1,        'Secret ki copy mein primary ka host bhi copy ho sakta hai. App ko sahi writer endpoint do aur standby ke app role se actual login chalao.','secure'),
      q('Alarm OK hai aur health page 200 deta hai. Checkout recovery ka sabse achha proof?', ['Hosted zone mein DNS change ka status INSYNC dikha', 'ASG ne teen instances ki list di', 'App role ne secret ka naam padha', 'Buyer ka test order save hua aur padha gaya'],3,        'Health page aur settings ka readback sirf kuch kadam check karte hain. Order likhne aur padhne se data path bhi chalta hai. Ab recovery time note karo.'),
      { terminal: interviewTerm }
    ] };
  const card = (q, analogy, body, points, asli) => ({ q, analogy, body: '<p>' + body + '</p>', points, asli });
  AG.registerLevels('advanced', [{
    id: 'finalboss', icon: '👑', title: 'Final Boss · Mumbai band ho toh checkout kaise chalega?', badge: 'Solutions Architect Mahaguru',
    objectives: ['Region fail hone se pehle checkout ka design aur kharcha jaancho.', 'DNS, writer, secret, key aur servers ka poora raasta test karo.', 'Board ko recovery ka time aur bache hue orders dikhao.'],
    hook: { when: 'ShopKaro ki course kahani · National sale se ek din pehle', title: 'Board ko ek saved order dikhao',
      text: 'Neha poochti hai, “Mumbai band ho aur nayi machine bhi launch na ho sake, toh Priya ka payment kahan jaayega?” Ravi ke paas do Regions ka diagram hai. Board Hyderabad se ek order ki receipt maangta hai.',
      mission: '300 orders/s ka peak lo. Mumbai ko drill mein band karo. Hyderabad mein order likho, data gap gino aur mahine ka kharcha board ke saamne rakho.' },
    steps: [
      card('Review shuru kahan se karein?', 'Dukaan mein bijli jaaye toh pehle poocho ki kaunsa counter chalte rehna chahiye.',
        'Ek buyer ka raasta banao. DNS se checkout, app se secret aur writer, phir buyer ki receipt tak jao. Har kadam ka owner aur failure test likho. ADR (architecture decision record) mein chunav, wajah aur keemat likho.',
        ['RTO batata hai checkout kitni der band reh sakta hai. RPO batata hai kitne waqt ka data khona manzoor hai.', 'ShopKaro ke targets 15 minute RTO aur 5 minute RPO hain. Order IDs aur time se dono alag naapo.'], 'ADR mein woh shart likho jiske badalne par design dobara dekhoge.'),
      card('Naya server banaaye bina kaise chalega?', 'Doosra counter pehle se khula ho toh pehle counter ka cash register tootne par bhi line chalti hai.',
        'Static stability ka matlab hai ki failure ke baad zaroori load pehle se chal rahe resources utha sakein. Settings banana control plane ka kaam hai. Pehle se lagi settings se request serve karna data plane ka kaam hai.',
        ['300 orders/s aur 100 orders/s per server ke liye teen healthy servers ka load test karo.', 'ASG ka min floor batata hai. Desired count aur max dekhne ke saath running servers, quotas, DB aur payment path bhi jaancho.'], 'Min 1 ka matlab sirf ek server ka floor hai. Standby par peak ka poora load daal kar dekho.'),
      card('Ek Region ki do AZ kab kaafi hain?', 'Ek shehar ki doosri branch kholna aur doosre shehar mein poora store chalana alag kharche hain.',
        'Availability Zone (AZ) ek Region ke andar alag failure boundary hai. Ek AZ ka loss sambhalna hai toh app aur data ko kai AZ mein chala kar test karo. Poora Region khona bhi shart hai toh doosre Region mein recovery ka raasta dekho.',
        ['30 din ka time-based 99.95% target 21.6 minute band rehne deta hai.', 'Do Regions se deploy, data copy aur on-call ka kaam badhta hai. SLO (service level objective) akela Regions ki ginti tay nahi karta.'], 'Design ko buyer ke target aur drill ke khilaaf jaancho.'),
      card('Order ka kitna data doosre Region tak gaya?', 'Do khaaton mein entry ek saath na ho toh doosri dukaan ki aakhri receipt peeche reh sakti hai.',
        'Aurora Global Database ki cross-region copy async hoti hai. Achanak failover par aakhri writes chhoot sakti hain. DynamoDB global tables mein eventual mode (MREC) aur supported Regions mein strong mode (MRSC) milta hai. MRSC ko teen Regions chahiye: teen data replicas ya do replicas aur ek witness. Witness vote deta hai. App usse data nahi padhti. Mode banate waqt chuno.',
        ['MREC mein do Regions ek item badlein toh last-writer-wins se takraav sulajhta hai. MRSC ke liye teenon Regions ka support aur write latency jaancho.', 'S3 Cross-Region Replication objects ki async copy hai. Purane objects ke liye Batch Replication dekho.', 'Ek order sirf ek baar charge ho. Retry mein wahi order ID aur duplicate rokne ka rule rakho.'], 'DNS badalne se database ka writer nahi badalta. Pehle purane writer ko roko aur sahi writer taiyaar karo.'),
      card('Buyer ko Hyderabad ka address kaise milega?', 'Board par doosri branch ka pata likha ho toh naya board banwane ka wait nahi karna padta.',
        'Route 53 mein ek naam aur type ke PRIMARY aur SECONDARY failover records pehle jodo. Primary ka health check usi Region ke endpoint par ho. Primary fail ho toh is drill ka bina health check wala secondary record jawab mein aata hai.',
        ['Secondary ko unchecked rakhne par DNS uski asli health nahi jaanta. Alag se secondary checkout test chalao.', 'TTL cache ki muddat hai. Pehle se khule connections apne aap doosre Region par nahi jaate.', 'Manual switch chahiye toh ARC routing control pehle set karo. Health check se jude switch ko uske data plane par chalao.'], 'Primary phir healthy hua toh DNS wapas primary de sakta hai. /ready ko writer ke saath jodo.'),
      card('Secret aur key dono kyun dekhein?', 'Doosri dukaan ko locker ki chaabi bhi chahiye aur locker mein rakha password bhi.',
        'Secrets Manager ki replica secret value aur metadata doosre Region mein rakhti hai. Replica ko us Region ki KMS key se encrypt karo. Secret replication ke liye multi-Region key zaroori nahi. ShopKaro ek alag kaam ke liye related keys chahta hai: order file ko dono Regions mein kholna.',
        ['Related KMS keys ke key ID aur material same hain. ARN mein Region alag hai. Single-Region key ko replicate-key se badal nahi sakte.', 'Replica ki key policy, grants aur aliases alag hain. Doosre account ke app role ke liye role ki IAM policy aur resource/key access bhi jaancho.', 'Encrypted RDS snapshot ki cross-region copy ke liye destination Region ki key chuno. Snapshot copy banane se Secrets Manager mein apne aap local secret nahi banta. Secrets Manager mein copy hua password Mumbai ke DB host ki taraf ishara kar sakta hai. Regional endpoint aur app role se login test karo.'], 'Local secret milna aur app ke role se sahi DB mein order likhna do alag checks hain.'),
      card('Saste design ka poora bill kya hai?', 'Doosri branch ka kiraya dene ke baad bhi staff aur stock ki delivery ka bill aata hai.',
        'Primary compute aur DB ke saath standby servers, storage, cross-region copies, requests, DNS checks aur monitoring gino. Cache se catalogue reads kam ho sakte hain. Checkout writes phir bhi writer tak jaati hain.',
        ['Board ke model mein base ₹42,000, poori standby capacity ₹34,000 aur cached reads ₹4,000 per month hain. Kul ₹80,000 hai.', 'Base compute par poora use hua commitment ₹7,000 bachaata hai. Course ka total ₹73,000/mahina banta hai. Ye practice numbers hain.'], 'Budget bachaane ke baad dobara wahi peak load aur recovery test chalao.'),
      card('Exam mein do sahi lagte jawaab kaise chhaante hain?', 'Dukaan aaj band hai aur agle saal ka kiraya sasta chahiye. Dono sawaal ka jawaab alag hoga.',
        'Pehle target aur rok padho. “Region loss” failure ka daayra deta hai. “No new launches” available capacity ka test hai. “Least cost” tab lagao jab bachi choices recovery aur data ki shart poori karein.',
        ['15 minute mein checkout chahiye aur backup restore 55 minute leta hai toh restore choice hatao.', 'Ek bacha hua server 100 orders/s le sakta hai. 300 orders/s ke liye max size se pehle ready capacity dekho.'], 'Har bachi choice ke liye bolo ki buyer ka order kis writer par jayega.')
    ],
    myth: [
      { myth: '99.99% ka matlab hamesha do Regions hai.', sach: 'SLO ke saath failure ka daayra, dependencies aur drill ka waqt dekho. Ek AZ aur ek poora Region alag failures hain.' },
      { myth: 'ASG ka max 6 hai toh chhah servers taiyaar hain.', sach: 'Max sirf upar ki limit hai. Load abhi kitne healthy servers utha sakte hain, use test karo.' },
      { myth: 'Secret copy karte hi DB bhi fail over ho jaata hai.', sach: 'Password ki copy aur database writer ka role alag hain. Local endpoint aur role se ek order likh kar padho.' }
    ],
    playbook: { title: 'Board ke saamne checkout ka review',
      use: ['Region outage ka target ho toh doosre Region mein data, key aur traffic ka raasta taiyaar karo.'],
      avoid: ['Sirf AZ loss ka target ho toh doosri Regional copy ka extra kharcha pehle justify karo.'],
      how: ['Accepted order ka ID aur waqt likho.', 'DNS, writer, secret aur pehle se chal rahe servers jaancho.', 'Primary band karke ek order likho aur dobara padho.', 'Data mila kar hi primary ka ready gate kholo.'],
      redflags: ['Max size ko ready server maan lena', 'Secret mein purana DB host', 'Health page hara par order fail'],
      rule: 'Buyer ka order jahan save hua aur jitne minute lage, dono dikhao.' },
    exam: [
      { cue: 'Ek AZ kho sakte hain', pick: 'Pehle Multi-AZ design jaancho' },
      { cue: 'Region event aur launch API band', pick: 'Standby par peak ke liye ready capacity' },
      { cue: 'Data kitna peeche reh sakta hai?', pick: 'RPO aur replication lag' },
      { cue: 'Region badlo, DNS edit band hai', pick: 'Pehle se laga failover record aur health check' },
      { cue: 'Encrypted order file dono Regions mein khule', pick: 'Related KMS keys aur local key policy' },
      { cue: 'Hyderabad mein password padho', pick: 'Secrets Manager replica aur local access' },
      { cue: 'Haath se traffic switch karna hai', pick: 'Pehle se juda ARC routing control' }
    ],
    stages: [dry, flow, bins, incident, triage, terminal, lab, quiz], interview,
    success: ['Main 300 orders/s ke liye pehle se capacity ka hisaab de sakta hoon.', 'Main DNS failover ke baad data, key aur app role ko alag jaanch sakta hoon.', 'Main board ko drill ka time, data gap aur kharcha bata sakta hoon.'],
    homework: '<p>Lab 32 ka drill log lo. Ek page par dono Regions ke key ARN ka farak, standby capacity aur pehle teen checks likho. Optional approved AWS sandbox mein sirf team ke test resources lo. Keys, secret copies, health checks aur servers ka bill lag sakta hai. Drill ke baad records, checks, servers aur secret copies hatao. Replica phir primary key ki deletion schedule karo.</p>',
    cards: [
      { front: 'Static stability ka test?', back: 'Naya server ya DNS rule banaaye bina bache resources poora zaroori load utha sakein.' },
      { front: 'RTO kis waqt tak naapein?', back: 'Buyer ka checkout phir se sahi chalne tak. Sirf DNS jawaab milna kaafi nahi.' },
      { front: 'RPO ke liye kya gino?', back: 'Outage se pehle accept hue aur recovery mein mile order IDs ka time gap.' },
      { front: '99.95% ka 30 din ka time budget?', back: '43,200 minute ka 0.05%, yaani 21.6 minute.' },
      { front: 'Replica key ke saath kya alag rahega?', back: 'Regional ARN, key policy, grants aur aliases alag hote hain.' },
      { front: 'Secret mein password sahi, DB login fail?', back: 'Local role, key access aur secret mein diya writer endpoint dekho.' },
      { front: 'Primary ka /ready kab khule?', back: 'Jab writer handoff, data sync aur test order ki jaanch ho jaaye.' }
    ]
  }]);
})();
