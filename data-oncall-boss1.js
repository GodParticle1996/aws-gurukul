/* 📟 On-call shift 'launch' — boss1 (Beginner boss: pehla three-tier review). Engine: oncall.js. Terminal: awscli.js.
   ShopKaro ki pehli launch raat, 21:00 se. Orders DB (RDS PostgreSQL) par teen JUDE hue alerts:
     1 OrdersDbStorageFull  20 GB bhar gaya, storage autoscaling band → checkout ke saare orders fail
                            (jaal: --apply-immediately ke bina badlaav maintenance window tak latka rehta hai)
     2 OrdersDbCpuHigh      writes chalu → launch ke jama orders → db.t3.micro par CPU 100%, checkout p95 upar
     3 OrdersDbSingleAz     class badalte waqt checkout band raha → DB single-AZ, standby hi nahi
   RDS ka modify/wait asli simulator ka hai (PendingModifiedValues, modifying → wait → available).
   Model (reconcile, har minute): free = storage − used; writes chalein toh used +0.02 GB/min; class change ke dauraan
   single-AZ = checkout band; micro class par writes chalein toh CPU 100%, warna 38%. Alarms capacity-cli se. */
(function () {
  const R = 'ap-south-1', A = '123456789012', DB = 'orders-db';
  const T0 = Date.parse('2026-11-27T15:30:00Z');                     // 21:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const db = a => a.rds.find(r => r.id === DB);
  const GB = 1e9;

  function reconcile(a, sim, clock) {
    const r = db(a), L = a.launch;
    a.now = iso(T0 + clock * 60000);
    const classChange = r.state === 'modifying' && r.pending && r.pending.DBInstanceClass;
    const down = !!classChange && !r.multiAZ;                          // single-AZ par class badalna = restart
    if (down && clock > 0) L.downMin++;
    const free = Math.max(0, (r.storage || 20) - L.used);
    const writes = !down && free > 0;
    if (writes && clock > 0) L.used = Math.round((L.used + 0.02) * 100) / 100;
    const cpu = !writes ? 4 : r.class === 'db.t3.micro' ? 100 : 38;
    const errors = !writes ? 100 : cpu >= 100 ? 14 : 0;
    const values = { free: Math.round(free * GB), cpu, errors };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
    L.last = { free, cpu, errors, down };
  }

  const describe = `aws rds describe-db-instances --db-instance-identifier ${DB}`;
  const wait = `aws rds wait db-instance-available --db-instance-identifier ${DB}`;
  AG.oncall.add({
    id: 'launch', start: 21 * 60,
    INC: [
      { id: 'OrdersDbStorageFull', sev: '🔴 SEV1', text: 'orders-db FreeStorageSpace 0 — launch shuru hote hi checkout ke saare orders fail.',
        fixed: a => db(a).storage >= 100 && db(a).maxStorage >= 200,
        verify: /^aws rds describe-db-instances\b|^aws cloudwatch describe-alarms\b/, verifyText: 'DB ya alarms dobara dekho',
        hints: [`aws cloudwatch describe-alarms --state-value ALARM, phir ${describe} — AllocatedStorage aur MaxAllocatedStorage kitne hain?`,
          'Storage 20 GB poora bhara, aur MaxAllocatedStorage 0 = storage autoscaling band. Storage badhao aur autoscaling ki chhat bhi do. --apply-immediately ke bina badlaav raat ki maintenance window tak latka rahega (PendingModifiedValues dekho).',
          `aws rds modify-db-instance --db-instance-identifier ${DB} --allocated-storage 100 --max-allocated-storage 500 --apply-immediately, phir ${wait}, phir ${describe}`] },
      { id: 'OrdersDbCpuHigh', sev: '🟠 SEV2', text: 'orders-db CPU 100% — ruke hue launch orders ek saath aa rahe, checkout p95 ~3 s.',
        fixed: a => db(a).class !== 'db.t3.micro' && !(db(a).pending || {}).DBInstanceClass,
        verify: /^aws cloudwatch describe-alarms\b|^aws rds describe-db-instances\b/, verifyText: 'alarms ya DB dobara dekho',
        hints: [`aws cloudwatch describe-alarms --alarm-names orders-db-cpu, phir ${describe} — DBInstanceClass kya hai?`,
          'db.t3.micro sabse chhota class hai — launch ka load nahi sambhalta. Bada class lo (jaise db.m6g.large). Dhyaan: single-AZ DB par class badalna = restart = checkout thodi der band.',
          `aws rds modify-db-instance --db-instance-identifier ${DB} --db-instance-class db.m6g.large --apply-immediately, phir ${wait}, phir aws cloudwatch describe-alarms --alarm-names orders-db-cpu`] },
      { id: 'OrdersDbSingleAz', sev: '🟠 SEV2', text: 'Class badalte waqt checkout poora band raha — orders-db single-AZ hai, standby hi nahi. Launch ki raat aisa dobara nahi chahiye.',
        fixed: a => db(a).multiAZ === true,
        verify: /^aws rds describe-db-instances\b/, verifyText: `DB dobara dekho (${describe.replace('aws rds ', '')})`,
        hints: [`${describe} — MultiAZ kya hai? Class change ke minute mein checkout-5xx kya tha?`,
          'Multi-AZ mein doosri AZ mein standby rehta hai: class change ya AZ girne par chhota failover, poora band nahi. Single-AZ se Multi-AZ par jaane mein downtime nahi hota.',
          `aws rds modify-db-instance --db-instance-identifier ${DB} --multi-az --apply-immediately, phir ${wait}, phir ${describe}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const series = (key, namespace, metric, unit, dims) => ({ key, seriesId: 'launch-' + key, version: 1, period: 60, namespace, metric, unit, dimensions: dims, points: [] });
      const dbDims = [{ Name: 'DBInstanceIdentifier', Value: DB }], ckDims = [{ Name: 'Service', Value: 'checkout' }];
      const alarm = (name, key, ns, metric, dims, stat, op, threshold) => ({ name, alarmId: 'launch-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: dims, Statistic: stat, Threshold: threshold, ComparisonOperator: op,
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const account = {
        region: R, now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDAONCALLLAUNCH', Arn: `arn:aws:iam::${A}:user/oncall` },
        rds: [{ id: DB, name: 'orders', resourceId: 'db-ORDERS7K2M9Q4X', engine: 'postgres', class: 'db.t3.micro', state: 'available', multiAZ: false,
          storage: 20, maxStorage: 0, backupRetention: 7, encrypted: true, publicAccess: false, deletionProtection: true,
          endpoint: 'orders-db.c9xk2mzq1w3e.ap-south-1.rds.amazonaws.com', latestRestorableTime: '2026-11-27T15:25:00Z' }],
        capacityMetrics: [series('free', 'AWS/RDS', 'FreeStorageSpace', 'Bytes', dbDims), series('cpu', 'AWS/RDS', 'CPUUtilization', 'Percent', dbDims),
          series('errors', 'ShopKaro/Checkout', '5xxRate', 'Percent', ckDims)],
        alarms: [alarm('orders-db-free-storage', 'free', 'AWS/RDS', 'FreeStorageSpace', dbDims, 'Minimum', 'LessThanThreshold', 2 * GB),
          alarm('orders-db-cpu', 'cpu', 'AWS/RDS', 'CPUUtilization', dbDims, 'Average', 'GreaterThanThreshold', 80),
          alarm('checkout-5xx', 'errors', 'ShopKaro/Checkout', '5xxRate', ckDims, 'Average', 'GreaterThanThreshold', 5)],
        launch: { used: 20, downMin: 0, last: null },
      };
      const files = {
        'runbook.md': { desc: 'On-call runbook', content: `# ShopKaro on-call — launch raat (27 Nov, 21:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Alarms:    aws cloudwatch describe-alarms --state-value ALARM
           (orders-db-free-storage · orders-db-cpu · checkout-5xx)
Orders DB: ${describe}
           → DBInstanceStatus, DBInstanceClass, AllocatedStorage, MaxAllocatedStorage, MultiAZ, PendingModifiedValues
Badlaav:   aws rds modify-db-instance --db-instance-identifier ${DB} [--allocated-storage N --max-allocated-storage M]
                [--db-instance-class C] [--multi-az] --apply-immediately
           ${wait}
Niyam:
- --apply-immediately ke BINA badlaav agli maintenance window (raat 02:00) tak "pending" rehta hai.
- Single-AZ DB par class badalna = restart = checkout band jab tak DB wapas available na ho.
- Backups (retention 7) aur deletion protection launch raat ko MAT chhedna. Snapshots delete karne se DB ki storage khaali nahi hoti.
` },
      };
      const responses = [
        risky(/^aws rds delete-db-instance\b/, 'orders DB delete karna — launch raat ko poora data jaata. Kabhi nahi.'),
        risky(/^aws rds delete-db-snapshot\b/, 'snapshot delete karna — isse DB ki storage khaali nahi hoti, sirf recovery ka raasta jaata hai.'),
        risky(/^aws rds modify-db-instance\b(?=.*--backup-retention-period\s+0\b)/, 'backups band karna (retention 0) — PITR khatam; galat DELETE ka ilaaj nahi bachega.'),
        risky(/^aws rds modify-db-instance\b(?=.*--no-deletion-protection)/, 'deletion protection hatana — galti se DB delete hone ka raasta khulta hai.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms · aws rds describe-db-instances / modify-db-instance / wait db-instance-available. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, files, responses, placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'ShopKaro ki pehli launch raat ka on-call. Pager ke alert ko <b>dhoondho, theek karo, phir pakka karo</b>. Har alert pichhle fix ke baad aata hai. Runbook todne wale commands simulator rok dega.',
        successText: 'Storage + autoscaling, sahi DB class aur Multi-AZ — teeno <b>config</b> the. <b>--apply-immediately</b> aur <b>wait</b> ke bina badlaav sirf "pending" rehta hai.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', describe,
          `aws rds modify-db-instance --db-instance-identifier ${DB} --allocated-storage 100 --max-allocated-storage 500 --apply-immediately`, wait, describe,
          'aws cloudwatch describe-alarms --state-value ALARM',
          `aws rds modify-db-instance --db-instance-identifier ${DB} --db-instance-class db.m6g.large --apply-immediately`, wait,
          'aws cloudwatch describe-alarms --alarm-names orders-db-cpu', describe,
          `aws rds modify-db-instance --db-instance-identifier ${DB} --multi-az --apply-immediately`, wait, describe],
      };
    },
  });

  AG.addLab('boss1', {
    type: 'oncall', id: 'oncall-launch', shift: 'launch', title: '📟 On-call: launch ki raat',
    intro: 'Pehli badi launch, 21:00. Pager orders DB ke baare mein baj raha hai. <b>Dekho → theek karo → pakka karo</b>. Har command = 1 minute.',
  });
})();
