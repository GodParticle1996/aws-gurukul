/* 🎲 Chaos deck 'observability' — Advanced level observability. Engine: chaos.js. Alarm ka state capacity-cli.js ka asli
   evaluator (AG.capacityAlarmSnapshot) metric points se nikaalta hai.
   Kahani: game day — team ne jaan-boojh kar checkout ka p99 badhaya, heartbeat band kiya, orders DB ka CPU 95% kiya.
   Swasth base: teeno alarms (checkout-p99, checkout-heartbeat, orders-db-cpu) ALARM, actions on, ops-pager par.
   Har card EK badlaav (simulator par chala ke dekha, 2026-11-27):
     p99-average         checkout-p99 OK — Statistic Average (0.31 s), p99 2.4 s chhup gaya
     missing-notbreaching checkout-heartbeat OK — heartbeat band, par missing data "achha" maana
     db-old-dimension    orders-db-cpu INSUFFICIENT_DATA — dimension purane DB (orders-db-old) ki
     actions-off         checkout-p99 ALARM par ActionsEnabled false — page jaata hi nahi
     threshold-99        orders-db-cpu OK — threshold 80 se 99, CPU 95% par chup */
(function () {
  const R = 'ap-south-1', A = '123456789012', PAGER = `arn:aws:sns:${R}:${A}:ops-pager`;
  const NOW = Date.parse('2026-11-27T03:00:00Z'), at = m => new Date(NOW - m * 60000).toISOString().replace('.000Z', 'Z');
  const LB = [{ Name: 'LoadBalancer', Value: 'app/checkout/7d2c9e41a3b5f608' }];
  const HB = [{ Name: 'Service', Value: 'checkout' }];
  const DB = id => [{ Name: 'DBInstanceIdentifier', Value: id }];
  const pts = (mins, f) => mins.map(m => ({ Timestamp: at(m), SampleCount: 600, ...f(m) }));
  const series = [
    { seriesId: 'gd-latency', version: 1, period: 60, namespace: 'AWS/ApplicationELB', metric: 'TargetResponseTime', unit: 'Seconds', dimensions: LB,
      points: pts([9, 8, 7, 6, 5, 4, 3, 2, 1, 0], m => m <= 3 ? { Average: 0.31, p99: 2.4, Maximum: 3.1 } : { Average: 0.12, p99: 0.35, Maximum: 0.6 }) },
    { seriesId: 'gd-heartbeat', version: 1, period: 60, namespace: 'ShopKaro/Checkout', metric: 'Heartbeat', unit: 'Count', dimensions: HB,
      points: pts([9, 8, 7, 6, 5], () => ({ Sum: 60, Average: 1 })) },
    { seriesId: 'gd-db', version: 1, period: 60, namespace: 'AWS/RDS', metric: 'CPUUtilization', unit: 'Percent', dimensions: DB('orders-db'),
      points: pts([9, 8, 7, 6, 5, 4, 3, 2, 1, 0], m => ({ Average: m <= 3 ? 95 : 41, Maximum: m <= 3 ? 98 : 47 })) }];
  const defs = {
    'checkout-p99': { AlarmName: 'checkout-p99', AlarmDescription: 'Checkout p99 > 1 s, 3 mein se 3 minute', Namespace: 'AWS/ApplicationELB', MetricName: 'TargetResponseTime',
      Dimensions: LB, ExtendedStatistic: 'p99', Threshold: 1, ComparisonOperator: 'GreaterThanThreshold', Period: 60, EvaluationPeriods: 3, DatapointsToAlarm: 3,
      TreatMissingData: 'missing', EvaluateLowSampleCountPercentile: 'evaluate', ActionsEnabled: true, AlarmActions: [PAGER] },
    'checkout-heartbeat': { AlarmName: 'checkout-heartbeat', AlarmDescription: 'Checkout heartbeat band = page', Namespace: 'ShopKaro/Checkout', MetricName: 'Heartbeat',
      Dimensions: HB, Statistic: 'Sum', Threshold: 1, ComparisonOperator: 'LessThanThreshold', Period: 60, EvaluationPeriods: 3, DatapointsToAlarm: 3,
      TreatMissingData: 'breaching', ActionsEnabled: true, AlarmActions: [PAGER] },
    'orders-db-cpu': { AlarmName: 'orders-db-cpu', AlarmDescription: 'Orders DB CPU > 80%, 3 mein se 3 minute', Namespace: 'AWS/RDS', MetricName: 'CPUUtilization',
      Dimensions: DB('orders-db'), Statistic: 'Average', Threshold: 80, ComparisonOperator: 'GreaterThanThreshold', Period: 60, EvaluationPeriods: 3, DatapointsToAlarm: 3,
      TreatMissingData: 'missing', ActionsEnabled: true, AlarmActions: [PAGER] } };
  const clone = x => JSON.parse(JSON.stringify(x));
  const alarm = a => (n => a.alarms.find(x => x.name === n));
  const def = (a, n) => alarm(a)(n).definition;
  const reviewed = (a, n) => JSON.stringify(def(a, n)) === JSON.stringify(defs[n]);
  const state = (a, n) => AG.capacityAlarmSnapshot(a, alarm(a)(n)).state;
  const H1 = 'Game day mein teeno alarm ALARM hone chahiye aur ops-pager tak jaane chahiye. describe-alarms padho: StateValue, statistic, dimension, missing data, actions — kaunsa alag hai?';
  const desc = 'aws cloudwatch describe-alarms';
  const descOne = n => `aws cloudwatch describe-alarms --alarm-names ${n}`;
  const put = n => `aws cloudwatch put-metric-alarm --cli-input-json file://${n}.json`;
  const stats = (ns, m, dims, s) => `aws cloudwatch get-metric-statistics --namespace ${ns} --metric-name ${m} --dimensions ${dims} --start-time ${at(5)} --end-time ${at(-1)} --period 60 ${s}`;
  const p99stats = stats('AWS/ApplicationELB', 'TargetResponseTime', 'Name=LoadBalancer,Value=app/checkout/7d2c9e41a3b5f608', '--extended-statistics p99');
  const dbstats = stats('AWS/RDS', 'CPUUtilization', 'Name=DBInstanceIdentifier,Value=orders-db', '--statistics Average');

  AG.chaos.addDeck({
    id: 'observability', title: 'Game day alarm deck',
    account: {
      region: R, now: '2026-11-27T03:00:00Z', callerIdentity: { Account: A, UserId: 'AIDAOBSERVE', Arn: `arn:aws:iam::${A}:user/oncall` },
      capacityMetrics: series,
      alarms: Object.keys(defs).map((n, i) => ({ name: n, alarmId: 'gd-alarm-' + (i + 1), revision: 0, state: 'OK', definition: clone(defs[n]), metric: defs[n].MetricName, namespace: defs[n].Namespace })),
      topics: [{ name: 'ops-pager', arn: PAGER, topicId: 'topic-gd', attributes: { MaximumMessageSize: '262144' }, dedup: [], subscriptions: [] }],
    },
    files: Object.fromEntries(Object.keys(defs).map(n => [n + '.json', { desc: 'Review kiya alarm: ' + n, content: JSON.stringify(defs[n], null, 2) }])),
    alert: '<b>📟 03:00 — ShopKaro game day.</b> Team ne jaan-boojh kar checkout ka p99 badhaya, heartbeat band kiya aur orders DB ka CPU 95% kiya. Kal raat alarms ek naye template se dobara bane. <b>Ek</b> alarm galat hai. Shuru: <code>cat runbook.md</code>.',
    placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms)',
    runbook: `# Game day — teeno alarm bajne chahiye
1. Alarms:    ${desc}
              → checkout-p99, checkout-heartbeat, orders-db-cpu: teeno StateValue ALARM,
                ActionsEnabled true, AlarmActions mein ops-pager
2. Asli data: ${p99stats}
              ${dbstats}
              (heartbeat 02:55 ke baad band hai — wahi drill hai)
3. Reviewed alarm files: ls → checkout-p99.json, checkout-heartbeat.json, orders-db-cpu.json
Badlaav:  aws cloudwatch put-metric-alarm --cli-input-json file://<alarm>.json
          aws cloudwatch enable-alarm-actions --alarm-names <alarm>
Niyam:    ek baar mein EK badlaav, phir describe-alarms dobara.`,
    cards: [
      { id: 'p99-average', title: 'checkout-p99 alarm p99 ki jagah Average dekhne laga',
        break: a => { const d = def(a, 'checkout-p99'); delete d.ExtendedStatistic; delete d.EvaluateLowSampleCountPercentile; d.Statistic = 'Average'; },
        fixed: a => reviewed(a, 'checkout-p99') && state(a, 'checkout-p99') === 'ALARM',
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'describe-alarms dobara chalao',
        hints: [H1, 'checkout-p99 OK hai jabki p99 2.4 s hai. Alarm kaunsa statistic dekh raha hai? get-metric-statistics se Average aur p99 milao.',
          `${put('checkout-p99')}, phir ${descOne('checkout-p99')}`],
        solution: ['cat runbook.md', desc, p99stats, put('checkout-p99'), descOne('checkout-p99')],
        why: '<b>Average</b> 0.31 s tha — dheemi requests ko chhupa liya — jabki <b>p99</b> 2.4 s. User ka dard p99 mein dikhta hai; latency alarm p99 par rakho.' },
      { id: 'missing-notbreaching', title: 'Heartbeat alarm mein missing data ko notBreaching maana gaya',
        break: a => { def(a, 'checkout-heartbeat').TreatMissingData = 'notBreaching'; },
        fixed: a => reviewed(a, 'checkout-heartbeat') && state(a, 'checkout-heartbeat') === 'ALARM',
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'describe-alarms dobara chalao',
        hints: [H1, 'Heartbeat 02:55 se band hai, phir bhi checkout-heartbeat OK. Data aana hi band ho jaaye toh alarm use kya maanta hai — TreatMissingData?',
          `${put('checkout-heartbeat')}, phir ${descOne('checkout-heartbeat')}`],
        solution: ['cat runbook.md', desc, put('checkout-heartbeat'), descOne('checkout-heartbeat')],
        why: 'Heartbeat ka chup hona hi khabar hai. <b>notBreaching</b> ne missing data ko "theek" maan liya — outage mein bhi OK. Heartbeat alarm mein missing = <b>breaching</b>.' },
      { id: 'db-old-dimension', title: 'orders-db-cpu alarm ki dimension purane DB (orders-db-old) ki ho gayi',
        break: a => { def(a, 'orders-db-cpu').Dimensions = DB('orders-db-old'); },
        fixed: a => reviewed(a, 'orders-db-cpu') && state(a, 'orders-db-cpu') === 'ALARM',
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'describe-alarms dobara chalao',
        hints: [H1, 'orders-db-cpu INSUFFICIENT_DATA — usse data mil hi nahi raha, jabki get-metric-statistics orders-db ka 95% dikhata hai. Alarm ki Dimensions kis DB ki hain?',
          `${put('orders-db-cpu')}, phir ${descOne('orders-db-cpu')}`],
        solution: ['cat runbook.md', desc, dbstats, put('orders-db-cpu'), descOne('orders-db-cpu')],
        why: 'Alarm ka naam sahi tha, par <b>dimension</b> purane DB ki — us metric mein data hi nahi, toh <b>INSUFFICIENT_DATA</b>. Naya DB aaye toh alarm ki dimension bhi badlo aur test karo.' },
      { id: 'actions-off', title: 'checkout-p99 alarm ke actions band (ActionsEnabled false) ho gaye',
        break: a => { def(a, 'checkout-p99').ActionsEnabled = false; },
        fixed: a => def(a, 'checkout-p99').ActionsEnabled === true && reviewed(a, 'checkout-p99'),
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'describe-alarms dobara chalao',
        hints: [H1, 'Teeno ALARM mein hain — par kisi ko page gaya? Har alarm ka ActionsEnabled aur AlarmActions padho.',
          `aws cloudwatch enable-alarm-actions --alarm-names checkout-p99, phir ${descOne('checkout-p99')}`],
        solution: ['cat runbook.md', desc, 'aws cloudwatch enable-alarm-actions --alarm-names checkout-p99', descOne('checkout-p99')],
        why: 'Alarm <b>ALARM</b> mein tha, par <b>ActionsEnabled false</b> — SNS tak kuch gaya hi nahi. State aur notification alag saboot hain; maintenance ke baad actions wapas on karna runbook mein likho.' },
      { id: 'threshold-99', title: 'orders-db-cpu ka threshold 80 se 99 ho gaya',
        break: a => { def(a, 'orders-db-cpu').Threshold = 99; },
        fixed: a => reviewed(a, 'orders-db-cpu') && state(a, 'orders-db-cpu') === 'ALARM',
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'describe-alarms dobara chalao',
        hints: [H1, 'orders-db-cpu OK, jabki DB CPU 95% par hai. Alarm kis number ke upar bajta hai?',
          `${put('orders-db-cpu')}, phir ${descOne('orders-db-cpu')}`],
        solution: ['cat runbook.md', desc, dbstats, put('orders-db-cpu'), descOne('orders-db-cpu')],
        why: '<b>Threshold 99</b> par 95% CPU kabhi alarm nahi banata — DB dab raha tha aur sab "hara". Threshold wahan rakho jahan se pehle kaam karna hai (yahan 80).' },
    ],
  });

  AG.addLab('observability', {
    type: 'chaos', id: 'chaos-observability', deck: 'observability', title: '🎲 Chaos round: game day ke alarms',
    intro: 'Galti jaan-boojh kar daali gayi hai — teeno alarm bajne chahiye. Jo nahi baja, uski <b>ek</b> setting dhoondho aur theek karo.',
  });
})();
