/* Advanced 8 — observability: tail latency, honest alarms, log cost and audit evidence.
   ShopKaro course story (fictional). Fixture data only; see observability-cli.js and capacity-cli.js for the bounded model. */
(() => {
  const copy = x => JSON.parse(JSON.stringify(x));
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const ACCT = '555555555555', R = 'ap-south-1', NOW = '2026-11-20T10:30:00Z', LB = 'app/shopkaro-alb/0123456789abcdef';
  const TOPIC = `arn:aws:sns:${R}:${ACCT}:checkout-oncall`;
  const START = 1795167000, END = 1795170600; // 2026-11-20 09:30:00Z .. 10:30:00Z
  const at = m => new Date(Date.parse('2026-11-20T09:30:00Z') + m * 60000).toISOString().replace('.000Z', 'Z');
  const ev = (m, o) => ({ t: at(m), m: JSON.stringify(o) });

  /* ---------- seeded logs (TEST data) ---------- */
  const checkout = [
    ev(5, { level: 'INFO', route: '/checkout', orderId: 'TEST-o-101', latencyMs: 180 }),
    ev(12, { level: 'INFO', route: '/checkout', orderId: 'TEST-o-102', latencyMs: 210, msg: 'retry budget ok; no ERROR seen' }),
    ev(21, { level: 'WARN', route: '/checkout', orderId: 'TEST-o-103', latencyMs: 2600, msg: 'slow payment response' }),
    ev(33, { level: 'ERROR', route: '/checkout', orderId: 'TEST-o-104', latencyMs: 7900, msg: 'payment call failed after retry' }),
    ev(41, { level: 'INFO', route: '/checkout', orderId: 'TEST-o-105', latencyMs: 190 }),
    ev(56, { level: 'ERROR', route: '/checkout', orderId: 'TEST-o-106', latencyMs: 8100, msg: 'payment call failed after retry' }),
    ev(58, { level: 'ERROR', route: '/checkout', orderId: 'TEST-o-107', latencyMs: 7800, msg: 'payment call failed after retry' })
  ];
  const payment = [
    { t: '2026-11-19T21:10:00Z', m: JSON.stringify({ level: 'WARN', gateway: 'card-beta', status: 'TIMEOUT', latencyMs: 5000, attempt: 1, orderId: 'TEST-o-090' }) },
    ev(4, { level: 'INFO', gateway: 'card-beta', status: 'OK', latencyMs: 240, attempt: 1, orderId: 'TEST-o-101' }),
    ev(20, { level: 'WARN', gateway: 'upi-alpha', status: 'TIMEOUT', latencyMs: 5000, attempt: 1, orderId: 'TEST-o-103' }),
    ev(21, { level: 'INFO', gateway: 'upi-alpha', status: 'OK', latencyMs: 2400, attempt: 2, orderId: 'TEST-o-103' }),
    ev(32, { level: 'WARN', gateway: 'upi-alpha', status: 'TIMEOUT', latencyMs: 5000, attempt: 1, orderId: 'TEST-o-104' }),
    ev(33, { level: 'WARN', gateway: 'upi-alpha', status: 'TIMEOUT', latencyMs: 5000, attempt: 2, orderId: 'TEST-o-104' }),
    ev(40, { level: 'INFO', gateway: 'card-beta', status: 'OK', latencyMs: 230, attempt: 1, orderId: 'TEST-o-105' }),
    ev(55, { level: 'WARN', gateway: 'upi-alpha', status: 'TIMEOUT', latencyMs: 5000, attempt: 1, orderId: 'TEST-o-106' }),
    ev(56, { level: 'WARN', gateway: 'upi-alpha', status: 'TIMEOUT', latencyMs: 5000, attempt: 2, orderId: 'TEST-o-106' }),
    ev(57, { level: 'WARN', gateway: 'upi-alpha', status: 'TIMEOUT', latencyMs: 5000, attempt: 1, orderId: 'TEST-o-107' })
  ];
  const audit = [ev(2, { eventName: 'ConsoleLogin', user: 'neha', result: 'Success', note: 'TEST-audit-1' }), ev(30, { eventName: 'UpdateFunctionConfiguration', user: 'ravi', note: 'TEST-audit-2' })];
  const group = (name, rows, retention, storedBytes) => ({ name, retention, storedBytes, stream: 'app', events: rows.map(r => r.m), eventTimes: rows.map(r => r.t), metricFilters: [] });
  const series = (pts) => ({ seriesId: 'alb-trt-p99', version: 1, namespace: 'AWS/ApplicationELB', metric: 'TargetResponseTime', dimensions: [{ Name: 'LoadBalancer', Value: LB }], unit: 'Seconds', period: 60, points: pts });
  const albPoints = [[51, .38, .9], [52, .40, 1.0], [53, .37, .8], [54, .41, 1.1], [55, .39, .9], [56, .46, 7.8], [57, .40, 1.0], [58, .47, 8.1], [59, .46, 7.9], [60, .41, 1.2]]
    .map(([m, avg, p99]) => ({ Timestamp: at(m), Average: avg, p99, SampleCount: 1800 }));
  const ident = { Account: ACCT, Arn: `arn:aws:iam::${ACCT}:role/sre-oncall` };
  function seed() {
    return {
      obsMode: true, region: R, now: NOW, callerIdentity: copy(ident),
      logGroups: [group('/shopkaro/checkout', checkout, null, 21e12), group('/shopkaro/payment', payment, null, 9e12), group('/shopkaro/audit', audit, 365, 3e9)],
      topics: [{ name: 'checkout-oncall', arn: TOPIC }],
      alarms: [], compositeAlarms: [], capacityMetrics: [series(albPoints)]
    };
  }
  const base = seed();
  const timeouts = new Set(payment.map((r, i) => ({ r, i })).filter(({ r }) => JSON.parse(r.m).status === 'TIMEOUT' && Date.parse(r.t) / 1000 >= START && Date.parse(r.t) / 1000 <= END).map(({ i }) => '/shopkaro/payment#' + i));
  const errorIdx = checkout.map((r, i) => JSON.parse(r.m).level === 'ERROR' ? i : -1).filter(i => i >= 0);
  const g = (a, n) => (a.logGroups || []).find(x => x.name === n);
  const alarm = (a, n) => (a.alarms || []).find(x => x.name === n);

  /* ---------- mission predicates ---------- */
  function core(a) {
    if (a.obsMode !== true || a.region !== R || !same(a.callerIdentity, ident) || !same(a.topics, base.topics) || !same(a.capacityMetrics, base.capacityMetrics)) return false;
    if ((a.logGroups || []).length !== 3) return false;
    for (const b of base.logGroups) { const x = g(a, b.name); if (!x || !same(x.events, b.events) || !same(x.eventTimes, b.eventTimes)) return false; }
    if (g(a, '/shopkaro/audit').retention !== 365) return false;
    return (a.alarms || []).every(m => !m.manual);
  }
  function filterReady(a) {
    const f = (g(a, '/shopkaro/checkout').metricFilters || []).filter(x => x && typeof x === 'object');
    return f.length === 1 && (() => {
      const x = f[0], t = x.metricTransformations[0];
      let hit; try { hit = AG.obsPattern(x.filterPattern); } catch (e) { return false; }
      const idx = checkout.map((r, i) => hit(r.m) ? i : -1).filter(i => i >= 0);
      return same(idx, errorIdx) && t.metricName === 'CheckoutErrors' && t.metricNamespace === 'ShopKaro/Checkout' && t.metricValue === '1' && t.defaultValue === 0;
    })();
  }
  const queryReady = a => (a.obsQueries || []).some(q => q.read && q.groups.length === 1 && q.groups[0] === '/shopkaro/payment' && q.matched.length === timeouts.size && q.matched.every(id => timeouts.has(id)));
  const retentionReady = a => g(a, '/shopkaro/checkout').retention === 30 && g(a, '/shopkaro/payment').retention === 30;
  function defIs(m, want) { return !!m && !!m.definition && Object.entries(want).every(([k, v]) => same(m.definition[k], v)); }
  function alarmsReady(a) {
    const p = alarm(a, 'checkout-p99'), e = alarm(a, 'checkout-errors'), c = (a.compositeAlarms || []).find(x => x.name === 'checkout-page');
    if ((a.alarms || []).length !== 2 || (a.compositeAlarms || []).length !== 1) return false;
    const pOk = defIs(p, { Namespace: 'AWS/ApplicationELB', MetricName: 'TargetResponseTime', Dimensions: [{ Name: 'LoadBalancer', Value: LB }], ExtendedStatistic: 'p99', Threshold: 2, ComparisonOperator: 'GreaterThanThreshold', Period: 60, EvaluationPeriods: 5, DatapointsToAlarm: 3, AlarmActions: [] }) && !p.definition.Statistic && (p.definition.TreatMissingData || 'missing') === 'missing';
    const eOk = defIs(e, { Namespace: 'ShopKaro/Checkout', MetricName: 'CheckoutErrors', Statistic: 'Sum', Threshold: 5, ComparisonOperator: 'GreaterThanOrEqualToThreshold', Period: 60, EvaluationPeriods: 3, DatapointsToAlarm: 2, TreatMissingData: 'notBreaching', AlarmActions: [], Dimensions: [] });
    if (!pOk || !eOk || !c || !same(c.actions, [TOPIC]) || c.actionsEnabled !== true) return false;
    let rule; try { rule = AG.obsRuleOf(c.rule); } catch (x) { return false; }
    if (!same(rule.refs.slice().sort(), ['checkout-errors', 'checkout-p99'])) return false;
    const truth = [['OK', 'OK', false], ['ALARM', 'OK', true], ['OK', 'ALARM', true], ['ALARM', 'ALARM', true]];
    if (!truth.every(([sp, se, want]) => rule.fn(n => n === 'checkout-p99' ? sp : se) === want)) return false;
    return AG.capacityAlarmSnapshot(a, p).state === 'ALARM' && AG.obsCompositeState(a, c) === 'ALARM';
  }
  const tasks = [
    { text: 'Purane log events, audit ki 365 din retention, ALB metrics aur on-call topic bache rahein; koi manual alarm state nahi', check: s => core(s.account) },
    { text: 'Checkout par sirf level ERROR ginne wala metric filter (defaultValue 0), payment timeouts ki Logs Insights query padhi, app logs 30 din par', check: s => core(s.account) && filterReady(s.account) && queryReady(s.account) && retentionReady(s.account) },
    { text: 'p99 + errors alarms bina actions, checkout-page composite on-call topic ko; aakhir mein dono alarm types ka aaj ka read', check: s => core(s.account) && filterReady(s.account) && queryReady(s.account) && retentionReady(s.account) && alarmsReady(s.account) && AG.obsCurrentRead(s.account) }
  ];
  const solution = [
    'aws logs describe-log-groups',
    'aws logs test-metric-filter --filter-pattern \'{ $.level = "ERROR" }\' --log-event-messages \'{"level":"ERROR","msg":"payment call failed"}\' \'{"level":"INFO","msg":"retry budget ok; no ERROR seen"}\'',
    'aws logs put-metric-filter --log-group-name /shopkaro/checkout --filter-name checkout-errors --filter-pattern \'{ $.level = "ERROR" }\' --metric-transformations metricName=CheckoutErrors,metricNamespace=ShopKaro/Checkout,metricValue=1,defaultValue=0',
    `aws logs start-query --log-group-name /shopkaro/payment --start-time ${START} --end-time ${END} --query-string 'filter status = "TIMEOUT" | stats count(*) as timeouts, max(latencyMs) as worstMs by gateway'`,
    'aws logs get-query-results --query-id 8f2c1a3e-0000-4a6b-9c1d-000000000001',
    'aws logs put-retention-policy --log-group-name /shopkaro/checkout --retention-in-days 30',
    'aws logs put-retention-policy --log-group-name /shopkaro/payment --retention-in-days 30',
    `aws cloudwatch put-metric-alarm --alarm-name checkout-p99 --namespace AWS/ApplicationELB --metric-name TargetResponseTime --dimensions Name=LoadBalancer,Value=${LB} --extended-statistic p99 --period 60 --evaluation-periods 5 --datapoints-to-alarm 3 --threshold 2 --comparison-operator GreaterThanThreshold --treat-missing-data missing`,
    'aws cloudwatch put-metric-alarm --alarm-name checkout-errors --namespace ShopKaro/Checkout --metric-name CheckoutErrors --statistic Sum --period 60 --evaluation-periods 3 --datapoints-to-alarm 2 --threshold 5 --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching',
    `aws cloudwatch put-composite-alarm --alarm-name checkout-page --alarm-rule 'ALARM("checkout-p99") OR ALARM("checkout-errors")' --alarm-actions ${TOPIC}`,
    'aws cloudwatch describe-alarms --alarm-types MetricAlarm CompositeAlarm'
  ];

  /* ---------- interview repair: heartbeat alarm that stayed OK during an outage ---------- */
  const HB = { AlarmName: 'checkout-heartbeat', Namespace: 'AWS/ApplicationELB', MetricName: 'RequestCount', Dimensions: [{ Name: 'LoadBalancer', Value: LB }], Statistic: 'Sum', Threshold: 1, ComparisonOperator: 'LessThanThreshold', Period: 60, EvaluationPeriods: 3, DatapointsToAlarm: 3, TreatMissingData: 'notBreaching', AlarmActions: [TOPIC], ActionsEnabled: true };
  const hbPoints = [51, 52, 53, 54, 55].map(m => ({ Timestamp: at(m), Sum: 1200 + m, SampleCount: 1 }));
  function iseed() {
    return {
      obsMode: true, region: R, now: NOW, callerIdentity: copy(ident), logGroups: [group('/shopkaro/checkout', checkout.slice(0, 2), 30, 2e9)], topics: [{ name: 'checkout-oncall', arn: TOPIC }],
      alarms: [{ name: 'checkout-heartbeat', alarmId: 'obs-hb-1', revision: 1, state: 'OK', definition: copy(HB) }], compositeAlarms: [],
      capacityMetrics: [{ seriesId: 'alb-requests', version: 1, namespace: 'AWS/ApplicationELB', metric: 'RequestCount', dimensions: [{ Name: 'LoadBalancer', Value: LB }], unit: 'Count', period: 60, points: hbPoints }]
    };
  }
  const ibase = iseed();
  function iready(a) {
    const m = alarm(a, 'checkout-heartbeat');
    if (!m || (a.alarms || []).length !== 1 || m.manual || !same(a.capacityMetrics, ibase.capacityMetrics) || !same(a.topics, ibase.topics) || !same(a.logGroups, ibase.logGroups)) return false;
    const want = { ...copy(HB), TreatMissingData: 'breaching' };
    return Object.entries(want).every(([k, v]) => same(m.definition[k], v)) && AG.capacityAlarmSnapshot(a, m).state === 'ALARM';
  }
  const itasks = [
    { text: 'Wahi alarm, wahi metric, threshold aur on-call action; ALB data aur logs waise hi; koi manual state nahi', check: s => { const a = s.account, m = alarm(a, 'checkout-heartbeat'); return !!m && !m.manual && same(a.capacityMetrics, ibase.capacityMetrics) && same(a.topics, ibase.topics) && ['Namespace', 'MetricName', 'Dimensions', 'Statistic', 'Threshold', 'ComparisonOperator', 'AlarmActions'].every(k => same(m.definition[k], HB[k])); } },
    { text: 'Missing data ab breaching; alarm ALARM mein, aur aaj ka describe-alarms read', check: s => iready(s.account) && AG.obsCurrentRead(s.account) }
  ];
  const isolution = [
    'aws cloudwatch describe-alarms --alarm-names checkout-heartbeat',
    `aws cloudwatch put-metric-alarm --alarm-name checkout-heartbeat --namespace AWS/ApplicationELB --metric-name RequestCount --dimensions Name=LoadBalancer,Value=${LB} --statistic Sum --period 60 --evaluation-periods 3 --datapoints-to-alarm 3 --threshold 1 --comparison-operator LessThanThreshold --treat-missing-data breaching --alarm-actions ${TOPIC}`,
    'aws cloudwatch describe-alarms --alarm-names checkout-heartbeat'
  ];

  /* ---------- flowlab: alarm tuning on one fixed synthetic week ---------- */
  let WEEK = null;
  function week() {
    if (WEEK) return WEEK;
    const avg = [], p99 = [];
    for (let d = 0; d < 7; d++) for (let t = 0; t < 1440; t++) {
      const busy = t >= 19 * 60 && t < 22 * 60;
      let a = busy ? 0.44 : 0.34 + 0.02 * ((t * 7) % 5) / 4, p = busy ? 1.2 : 0.9;
      if (t === 13 * 60) { a = 0.42; p = 3.2; }
      if (t === 21 * 60 + 30) { a = 0.45; p = 2.6; }
      if (t >= 2 * 60 && t < 2 * 60 + 6) { a = null; p = null; }
      if (d === 4 && t >= 20 * 60 && t < 20 * 60 + 12) { a = 0.47; p = 8.0; }
      avg.push(a); p99.push(p);
    }
    return (WEEK = { avg, p99, incStart: 4 * 1440 + 20 * 60, incEnd: 4 * 1440 + 20 * 60 + 12 });
  }
  AG.obsAlarmTuning = k => {
    const W = week(), src = k.stat === 1 ? W.p99 : W.avg, len = k.period === 1 ? 5 : 1, n = k.n, m = Math.min(k.m, k.n), miss = ['missing', 'notBreaching', 'breaching', 'ignore'][k.miss];
    const per = [];
    for (let i = 0; i + len <= src.length; i += len) {
      const vals = src.slice(i, i + len).filter(v => v !== null);
      let v = null;
      if (vals.length) { if (k.stat === 1 && len > 1) { const s = vals.slice().sort((x, y) => y - x); v = s[Math.min(1, s.length - 1)]; } else v = vals.reduce((x, y) => x + y, 0) / vals.length; }
      per.push({ end: i + len, v });
    }
    let state = 'INSUFFICIENT_DATA', falseAlarms = 0, detect = null, alarmPeriods = 0;
    for (let i = 0; i < per.length; i++) {
      const win = per.slice(Math.max(0, i - n + 1), i + 1);
      const isBad = x => x.v === null ? miss === 'breaching' : x.v > k.thr;
      let next;
      if (miss === 'ignore' && per[i].v === null) next = state;
      else if (miss === 'missing' && win.every(x => x.v === null)) next = 'INSUFFICIENT_DATA';
      else {
        const pool = miss === 'missing' || miss === 'ignore' ? win.filter(x => x.v !== null) : win;
        next = pool.filter(isBad).length >= m ? 'ALARM' : 'OK';
      }
      if (next === 'ALARM') alarmPeriods++;
      if (next === 'ALARM' && state !== 'ALARM') {
        const t = per[i].end;
        if (t > W.incStart && t <= W.incEnd + 15) { if (detect === null) detect = t - W.incStart; }
        else falseAlarms++;
      }
      state = next;
    }
    const caught = detect !== null && detect <= 5, ok = caught && falseAlarms <= 1;
    return { falseAlarms, detect, caught, ok, alarmPeriods };
  };

  /* ---------- stages ---------- */
  const STAGES = [
    {
      type: 'dryrun',
      title: '🧭 Dry run: 8 second ka checkout kahan atka?',
      intro: 'Fictional ShopKaro data. "Agla" dabao; har kadam par signal badalta hai. Jahan sawaal aaye, pehle socho phir chuno.',
      goal: 'Average se aage dekh kar dheemi request ka hissa pakdo, aur sahi alarm tak pahuncho.',
      lesson: 'Average ne tail chhupa di. p99 ne batata ki gadbad hai, trace ne bataya kahan (payment timeout), aur Logs Insights ne bataya kis gateway par. Fix aur alarm dono us saboot par bane.',
      nodes: [
        { id: 'user', x: 110, y: 260, icon: '🧑', label: 'Customer' },
        { id: 'alb', x: 320, y: 260, icon: '⚖️', label: 'ALB' },
        { id: 'app', x: 530, y: 260, icon: '🛒', label: 'Checkout app' },
        { id: 'pay', x: 780, y: 260, icon: '💳', label: 'Payment API' },
        { id: 'rds', x: 780, y: 440, icon: '🗄️', label: 'RDS' },
        { id: 'cw', x: 320, y: 80, icon: '📊', label: 'Metrics' },
        { id: 'logs', x: 530, y: 80, icon: '📜', label: 'Logs' },
        { id: 'trace', x: 780, y: 80, icon: '🔍', label: 'Trace' }
      ],
      edges: [{ from: 'user', to: 'alb' }, { from: 'alb', to: 'app' }, { from: 'app', to: 'pay' }, { from: 'app', to: 'rds' }, { from: 'alb', to: 'cw', dashed: true }, { from: 'app', to: 'logs', dashed: true }, { from: 'app', to: 'trace', dashed: true }],
      panels: [{ id: 'signal', title: 'Signal kya dikhata hai' }, { id: 'next', title: 'Agla sawaal' }],
      steps: [
        {
          say: 'Customer checkout karta hai. Dashboard par ALB ka average TargetResponseTime 0.4 second hai. Koi alarm nahi bajaa.',
          flows: [{ from: 'user', to: 'alb', tone: 'ok' }, { from: 'alb', to: 'app', tone: 'ok' }],
          nodes: { cw: { tone: 'ok', badge: 'avg 0.4 s' } },
          panels: { signal: ['Average 0.4 s', 'Koi alarm nahi'], next: ['Kya har user ko 0.4 s mil raha hai?'] },
          ask: {
            q: 'Average 0.4 second hai, phir bhi log shikayat kar rahe hain. Average yahan kya chhupa sakta hai?',
            choices: [
              'Thodi si bahut dheemi requests; 1% requests 8 s ki hon tab bhi average kam dikhta hai',
              'Average hamesha sabse dheemi request ke barabar hota hai, isliye sab requests tez hain',
              'Average sirf errors ginta hai, latency nahi, isliye yeh number kuch nahi batata',
              'Average sirf ALB ka apna time hai; app ka time CloudWatch kabhi nahi dikhata'
            ],
            answer: 0,
            explain: 'Average sab requests ka beech ka number hai. 99 tez requests ek dheemi request ko chhupa deti hain. Isliye latency SLO ke liye p99 dekho.'
          }
        },
        {
          say: 'Usi metric ka p99 dekha: 10:26, 10:28 aur 10:29 par 7.8–8.1 second. Har minute lagbhag 1,800 requests aati hain, toh 1% matlab har minute lagbhag 18 customers.',
          nodes: { cw: { tone: 'bad', badge: 'p99 ≈ 8 s' } },
          panels: { signal: ['p99: 7.8 / 1.0 / 8.1 / 7.9 / 1.2 s', 'Average phir bhi 0.4–0.47 s'], next: ['Alarm kaise banayein ki ek spike par page na jaaye?'] }
        },
        {
          say: 'p99 > 2 s par alarm, 5 mein se 3 periods (M of N). Yeh alarm ALARM mein jaata. Par alarm sirf batata hai ki gadbad hai, yeh nahi ki kahan.',
          nodes: { cw: { tone: 'bad', badge: 'ALARM 3/5' } },
          panels: { signal: ['checkout-p99: ALARM'], next: ['8 second kis hisse mein gaye?'] },
          ask: {
            q: 'p99 alarm baj gaya. Wajah dhoondhne ke liye sabse pehle kya dekhoge?',
            choices: [
              'App server ka CPU, kyunki dheemi request ka matlab hamesha CPU poora bhara hona hai',
              'Dheemi requests ka trace, taaki pata chale ki 8 second kis service ke hisse mein gaye',
              'RDS ka storage, kyunki dheemi checkout ka matlab hamesha disk ka bhar jaana hota hai',
              'ALB ki access permissions, kyunki latency hamesha IAM policy ki galti se aati hai'
            ],
            answer: 1,
            explain: 'Trace har hisse ka time dikhata hai. CPU, disk ya IAM ka andaaza bina saboot ke galat raaste par le ja sakta hai.'
          }
        },
        {
          say: 'Trace: app se Payment API ka call 5 second par timeout hua, phir retry 2.4 second mein chala. RDS sirf 40 ms.',
          flows: [{ from: 'app', to: 'pay', tone: 'bad', label: '5 s timeout + retry' }, { from: 'app', to: 'rds', tone: 'ok', label: '40 ms' }, { from: 'app', to: 'trace', tone: 'acc' }],
          nodes: { pay: { tone: 'bad', badge: 'timeout' }, rds: { tone: 'ok', badge: '40 ms' }, trace: { tone: 'acc', badge: 'segment' } },
          panels: { signal: ['8 s ≈ 5 s timeout + 2.4 s retry + baaki'], next: ['Kaunsa payment gateway?'] }
        },
        {
          say: 'Logs Insights se payment logs par query: filter status = "TIMEOUT" | stats count(*) by gateway. Pichhle 1 ghante mein upi-alpha par 6 timeouts, card-beta par 0.',
          flows: [{ from: 'app', to: 'logs', tone: 'acc', label: 'query' }],
          nodes: { logs: { tone: 'acc', badge: 'upi-alpha: 6' } },
          panels: { signal: ['upi-alpha: 6 TIMEOUT', 'card-beta: 0 (pichhle 1 ghante mein)'], next: ['Time range kyun zaroori hai?'] },
          ask: {
            q: 'Query mein pichhle 1 ghante ki time range kyun di?',
            choices: [
              'Time range ke bina query chalti hi nahi, aur range ka result par koi asar nahi padta',
              'Range sirf dashboard ka rang badalti hai; Logs Insights hamesha sirf aaj ke logs hi padhta hai, kal ke nahi',
              'Range dene se Logs Insights apne aap metric filter bana deta hai aur alarm on ho jaata hai',
              'Bina range ke kal ka purana timeout bhi gina jaayega, aur zyada data scan karne ka bill bhi lagega'
            ],
            answer: 3,
            explain: 'Logs Insights utna hi data padhta hai jitni range do. Galat range purane events gin leti hai, aur scan hue GB ke hisaab se bill lagta hai.'
          }
        },
        {
          say: 'Fix ka plan: payment client ka timeout chhota (jaise 2 s) aur sirf idempotent retry. Saath mein errors ka metric filter, p99 alarm aur ek composite page.',
          nodes: { cw: { tone: 'new', badge: 'p99 + errors' }, logs: { tone: 'new', badge: 'metric filter' } },
          panels: { signal: ['checkout-p99, checkout-errors'], next: ['On-call ko ek hi page kaise jaaye?'] },
          ask: {
            q: 'Ek incident par on-call ko teen alag pages na jaayein, iske liye kya karoge?',
            choices: [
              'Har alarm par on-call ka action lagao, aur page aane ke baad baaki alarms ko haath se ek-ek karke band karo',
              'Saare alarms delete karke sirf ek Average latency alarm rakho jo kam bajta hai',
              'Child alarms bina action rakho, aur ek composite alarm (p99 OR errors) on-call topic ko bheje',
              'Alarms ka period 1 din kar do, taaki din mein zyada se zyada ek hi page aa sake'
            ],
            answer: 2,
            explain: 'Composite alarm kai signals ko ek rule mein jodta hai. Child alarms bina action rehte hain, aur on-call ko ek hi kaam ka page jaata hai.'
          }
        }
      ]
    },
    {
      type: 'flowlab',
      title: '🎛️ Alarm tuning: ek hafte ka fixed data',
      goal: 'Incident ko 5 minute ke andar pakdo, aur hafte mein 1 se zyada false alarm nahi.',
      scenario: 'Fictional course data: 7 din, har minute ka average aur p99. Har din 13:00 par 1 minute ka spike (p99 3.2 s) aur 21:30 par 1 minute (p99 2.6 s). Raat 02:00 par 6 minute deploy ke dauran data nahi aata. Shukravaar 20:00–20:12 asli incident: p99 8 s, par average sirf 0.47 s. Is model mein 5-minute period ka p99 un 5 minutes ki doosri sabse badi value maana gaya hai; yeh asli CloudWatch ka exact math nahi.',
      knobs: [
        { id: 'stat', label: 'Statistic', min: 0, max: 1, step: 1, value: 0, labels: { 0: 'Average', 1: 'p99' } },
        { id: 'thr', label: 'Threshold', min: 0.5, max: 5, step: 0.5, value: 1, unit: ' s' },
        { id: 'period', label: 'Period', min: 0, max: 1, step: 1, value: 1, labels: { 0: '1 minute', 1: '5 minute' } },
        { id: 'n', label: 'Evaluation periods (N)', min: 1, max: 5, step: 1, value: 1 },
        { id: 'm', label: 'Datapoints to alarm (M)', min: 1, max: 5, step: 1, value: 1, note: 'M kabhi N se bada nahi hota; bada M diya toh N maana jaata hai.' },
        { id: 'miss', label: 'Missing data', min: 0, max: 3, step: 1, value: 2, labels: { 0: 'missing', 1: 'notBreaching', 2: 'breaching', 3: 'ignore' } }
      ],
      model: k => {
        const r = AG.obsAlarmTuning(k);
        return {
          readouts: [
            { label: 'False alarms / hafta', value: String(r.falseAlarms), tone: r.falseAlarms <= 1 ? 'ok' : 'bad' },
            { label: 'Incident', value: r.detect === null ? 'nahi pakda' : r.detect + ' min baad pakda', tone: r.caught ? 'ok' : 'bad' },
            { label: 'Statistic', value: k.stat === 1 ? 'p99' : 'Average', tone: k.stat === 1 ? 'ok' : 'acc' },
            { label: 'Alarm ka bill (lagbhag)', value: '$0.10/mahina standard', tone: 'acc' }
          ],
          verdict: r.ok ? { ok: true, text: 'Incident ' + r.detect + ' minute mein pakda, false alarms ' + r.falseAlarms + '/hafta. Asli data par bhi yahi jaanch karo.' }
            : { ok: false, text: !r.caught ? 'Incident 5 minute mein nahi pakda. Average tail chhupata hai, aur bada M ya 5-minute period der karta hai.' : 'False alarms ' + r.falseAlarms + '/hafta. Akele spikes ya deploy ke missing data par page ja raha hai.' }
        };
      },
      check: k => AG.obsAlarmTuning(k).ok,
      lesson: 'p99 ne incident pakda jo Average se dikhta hi nahi. M of N (ya thoda upar ka threshold) ne akele spikes rok diye, aur missing data ko breaching na rakhne se deploy ke gap par page nahi gaya. Heartbeat alarm alag hota hai: wahan missing data hi outage ka signal hai.'
    },
    {
      type: 'bins',
      title: '🗂️ Sawaal → signal',
      instructions: 'Har sawaal ko us signal mein daalo jo sabse seedha jawaab deta hai.',
      bins: [{ id: 'metric', label: 'Metric / alarm' }, { id: 'log', label: 'Logs' }, { id: 'trace', label: 'Trace' }, { id: 'audit', label: 'Audit (CloudTrail)' }, { id: 'config', label: 'Config' }],
      items: [
        { text: 'Pichhle 10 minute ka p99 checkout latency kitna hai?', bin: 'metric', explain: 'Number jo time ke saath badalta hai: metric. Alarm isi par lagta hai.' },
        { text: 'Order TEST-o-104 par exact error message kya tha?', bin: 'log', explain: 'Ek event ki detail log mein hoti hai.' },
        { text: 'Ek dheemi request ke 8 second kis service mein gaye?', bin: 'trace', explain: 'Trace har hisse ka time dikhata hai.' },
        { text: 'Raat 2 baje kisne S3 bucket delete kiya?', bin: 'audit', explain: 'API call ka record CloudTrail mein hota hai.' },
        { text: 'Security group mein port 22 kab khula, aur kya yeh rule ke khilaf hai?', bin: 'config', explain: 'Config resource ki setting ka history aur compliance rules rakhta hai.' },
        { text: 'Kitne checkouts mein payment timeout hua, gateway ke hisaab se?', bin: 'log', explain: 'Logs Insights query logs se ginti nikaalti hai.' },
        { text: 'Kisi ne Lambda ka timeout setting kab aur kis role se badla?', bin: 'audit', explain: 'UpdateFunctionConfiguration ek management event hai.' },
        { text: 'Kya saare EBS volumes encrypted hain, aur kaun se nahi?', bin: 'config', explain: 'Config rule poore account mein compliance check karta hai.' },
        { text: 'Errors ki ginti 5 se upar jaaye toh page bhejo', bin: 'metric', explain: 'Metric filter + alarm: ginti ek metric hai.' },
        { text: 'Payment API call aur RDS query mein se kaun dheema tha?', bin: 'trace', explain: 'Trace ke segments dono ka time alag dikhate hain.' }
      ]
    },
    {
      type: 'match',
      title: '🔗 Zaroorat → AWS tool',
      instructions: 'Har zaroorat ko us tool se jodo jo use seedha poora karta hai.',
      pairs: [
        { left: 'EC2 ki memory usage chahiye', right: 'CloudWatch agent', explain: 'Memory/disk default EC2 metrics mein nahi; agent bhejta hai.' },
        { left: 'Logs par turant ad-hoc query', right: 'Logs Insights', explain: 'Koi setup nahi; scan hue GB ka bill.' },
        { left: 'Logs ko OpenSearch tak stream karna', right: 'Subscription filter + Firehose', explain: 'Subscription filter log events ko aage bhejta hai.' },
        { left: 'Raat ko bhi checkout page lagatar test karna', right: 'Synthetics canary', explain: 'Script har kuch minute endpoint chalati hai.' },
        { left: 'Asli browser users ka page load time', right: 'CloudWatch RUM', explain: 'RUM asli users ke browser se data leta hai.' },
        { left: 'IP traffic ACCEPT/REJECT ka record', right: 'VPC Flow Logs', explain: 'Flow Logs metadata likhte hain, content nahi.' }
      ]
    },
    {
      type: 'triage',
      title: '🩺 Outage mein alarm bajaa hi nahi',
      symptom: 'Fictional: raat 02:10 se 02:40 tak checkout poora band tha. On-call ko koi page nahi gaya. checkout-heartbeat alarm poore samay OK dikhata raha.',
      goal: 'Alarm ki config aur metric data dekho. Pehle wajah pakdo, phir sabse chhota sahi fix chuno.',
      commands: [
        { cmd: 'aws cloudwatch describe-alarms --alarm-names checkout-heartbeat', out: '"MetricName": "RequestCount", "Statistic": "Sum", "ComparisonOperator": "LessThanThreshold", "Threshold": 1, "EvaluationPeriods": 3, "TreatMissingData": "notBreaching", "StateValue": "OK"', clue: true, note: 'Missing data ko "sab theek" maana ja raha hai.' },
        { cmd: 'aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name RequestCount --statistics Sum --period 60 --start-time 2026-11-20T02:00:00Z --end-time 2026-11-20T02:45:00Z', out: 'Datapoints 02:00–02:09 tak (Sum ~1,200/min); 02:10–02:40 ka koi datapoint nahi', clue: true, note: 'ALB metric tabhi bhejta hai jab requests aati hain. Zero traffic par 0 nahi aata, datapoint hi nahi aata.' },
        { cmd: 'aws logs filter-log-events --log-group-name /shopkaro/checkout --filter-pattern ERROR --start-time 1795140600000', out: '"events": [] (app process band tha, isliye logs bhi nahi aaye)', clue: false, note: 'Khaali logs bhi health ka saboot nahi.' }
      ],
      questions: [
        {
          q: 'Alarm OK kyun rahi?',
          choices: [
            'ALB ne outage mein RequestCount 0 bheja, aur 0 threshold 1 se bada hota hai',
            'Traffic na hone par datapoints aaye hi nahi, aur notBreaching ne missing data ko theek maana',
            'Alarm ka period 60 second hai, aur CloudWatch 60 second wale alarms ko raat mein kabhi evaluate nahi karta',
            'Log group par retention 30 din thi, isliye alarm ne raat ka data padha hi nahi'
          ],
          answer: 1,
          explain: 'Zero traffic par ALB metric hi nahi bhejta. notBreaching ke saath missing data "theek" gina gaya, isliye alarm OK raha. 60s period aur log retention ka isse lena-dena nahi.'
        },
        {
          q: 'Sabse chhota sahi fix kya hai?',
          choices: [
            'Isi heartbeat alarm mein TreatMissingData breaching karo, baaki definition aur on-call action wahi rakho',
            'Alarm ko set-alarm-state se ALARM kar do, taaki agli baar on-call ko page pakka mile aur sab theek dikhe',
            'Threshold 1 se 1000 kar do, taaki thoda bhi kam traffic aate hi alarm baj jaaye aur outage chhoot na sake',
            'Alarm delete karke sirf logs par bharosa karo, kyunki logs hamesha aate rehte hain'
          ],
          answer: 0,
          explain: 'Heartbeat ke liye missing data hi outage ka signal hai, isliye breaching. set-alarm-state sirf test hai, bada threshold false alarms laata hai, aur logs bhi outage mein band ho sakte hain.'
        }
      ]
    },
    {
      type: 'terminal',
      title: '🖥️ Checkout ko dikhne layak banao',
      instructions: 'Sirf app ka CloudWatch fixture; koi AWS call nahi. ls/cat se runbook.txt padho. Log events aur ALB metrics pehle se di gayi TEST training data hain.',
      goal: '<p><b>1.</b> <code>/shopkaro/checkout</code> par metric filter <code>checkout-errors</code> banao jo sirf <b>level ERROR</b> wale events gine (INFO message mein "ERROR" shabd ho toh nahi). Metric: <code>ShopKaro/Checkout</code> / <code>CheckoutErrors</code>, value 1, <b>defaultValue 0</b>. Pehle <code>test-metric-filter</code> se pattern jaancho.</p><p><b>2.</b> Logs Insights se <code>/shopkaro/payment</code> par pichhle 1 ghante (' + START + '–' + END + ') ke <code>status = "TIMEOUT"</code> events gateway ke hisaab se gino, aur results padho.</p><p><b>3.</b> <code>/shopkaro/checkout</code> aur <code>/shopkaro/payment</code> par 30 din retention. <code>/shopkaro/audit</code> ki 365 din wahi rahe.</p><p><b>4.</b> Alarms, bina actions: <code>checkout-p99</code> (AWS/ApplicationELB TargetResponseTime, LoadBalancer=' + LB + ', p99 &gt; 2 s, 60s, 5 mein se 3, missing data missing) aur <code>checkout-errors</code> (CheckoutErrors Sum ≥ 5, 60s, 3 mein se 2, notBreaching). Phir composite <code>checkout-page</code> = p99 OR errors, action sirf on-call topic.</p><p>Aakhir mein dono alarm types ka aaj ka <code>describe-alarms</code> read. set-alarm-state se banaya state, purane log events delete karna ya audit retention chhoti karna nahi chalega.</p>',
      account: seed(),
      files: {
        'runbook.txt': { content: 'ShopKaro checkout on-call runbook (fictional)\n- On-call SNS topic: ' + TOPIC + '\n- ALB: ' + LB + '\n- SLO: p99 checkout < 2 s\n- Audit logs: 365 din rakhne hain (policy)\n- App logs (checkout, payment): 30 din kaafi\n- Child alarms par action nahi; sirf composite page bhejta hai\n' }
      },
      tasks,
      solution,
      hints: [
        'JSON pattern { $.level = "ERROR" } sirf level field dekhta hai; term pattern ERROR har us line ko gin lega jisme yeh shabd ho. test-metric-filter se dono jaancho.',
        'aws logs start-query ka --start-time/--end-time epoch seconds hai; uske diye queryId se aws logs get-query-results chalao.',
        'p99 ke liye --extended-statistic p99 do (--statistic nahi). Composite: --alarm-rule \'ALARM("checkout-p99") OR ALARM("checkout-errors")\'. Aakhir mein aws cloudwatch describe-alarms --alarm-types MetricAlarm CompositeAlarm.'
      ],
      success: s => tasks.every(t => t.check(s)),
      successText: 'Purane logs aur audit retention bache. ERROR-level filter, timeout query, 30 din app retention aur p99 + errors + composite page set hue; aaj ka read hua. Asli AWS mein: naye events se metric aata hai ya nahi dekho, SNS subscription confirm karo, aur payment timeout ka fix deploy karke p99 phir naapo.'
    },
    {
      type: 'docker',
      title: '🐳 Lab28: asli Moto par logs, filters aur alarms',
      project: '28-logs-metrics-alarms',
      goal: 'Apne thodi der ke Moto server par asli AWS CLI se log group, retention, metric filter, Logs Insights aur alarms chalao, aur dekho ki emulator kya nahi karta.',
      why: 'Moto config save kar leta hai, par metric filter se metric nahi banata, p99 nahi nikaalta, alarms evaluate nahi karta aur composite alarm bana hi nahi. Lab saaf batati hai ki kaunsa hissa host par Python se jaancha gaya.',
      steps: [
        { text: 'aws-gurukul se README aur lab.py padho, phir exact runner chalao.', cmd: './docker-labs/.venv/bin/python -I docker-labs/28-logs-metrics-alarms/lab.py', expect: '11 behaviour checks + cleanup = 12 PASS, phir OWNED MOTO STOPPED / LISTENER CLOSED.' },
        { text: 'GAP wali lines padho: retention 31, metric filter ka metric, JSON pattern, Insights stats, p99, composite.', expect: 'Har GAP line batati hai ki Moto ne kya maana ya kya nahi kiya.' },
        { text: 'HOST CHECK wali lines padho: same samples par Python se average vs p99 aur M-of-N.', expect: 'Average 0.446 s, par teen minutes ka p99 8 s; aakhri 5 mein 3 breach → ALARM (host reference). Moto ka alarm OK hi rehta hai.' }
      ],
      observe: {
        q: 'Lab28 ka result asal mein kya saabit karta hai?',
        choices: [
              'Asli CloudWatch ne metric filter se metric banaya, aur p99 alarm ne on-call ko sach mein page bheja',
              'Moto ki ALARM state prove karti hai ki production checkout ka p99 sach mein 8 second hai',
              'Moto ne config APIs chalaye; metric banana, p99 aur alarm evaluation host par alag jaanche gaye',
              'Composite alarm Moto par bana aur uska state child alarms se apne aap sahi nikla'
            ],
        answer: 2,
        explain: 'Moto config save karta hai, par metric filter se metric, p99 aur alarm evaluation nahi karta, aur composite alarm 500 deta hai. Woh hisse host ke Python reference se jaanche gaye; production ka koi daava nahi.'
      }
    },
    {
      type: 'quiz',
      title: '🎓 Observability ke faisle',
      questions: [
        {
          q: 'Checkout ka average 0.4 s hai, par 1% users 8 s dekhte hain. SLO p99 < 2 s hai. Alarm kis statistic par?',
          choices: ['Average, kyunki woh sab requests ka sach batata hai', 'Maximum, kyunki sabse dheemi request hi zaroori hai', 'p99 (ExtendedStatistic), kyunki SLO bhi p99 par hai', 'SampleCount, kyunki zyada requests matlab dheemapan'],
          answer: 2,
          explain: 'SLO p99 par hai, toh alarm bhi p99 par. Average tail chhupata hai, Maximum ek akeli request par bajega, aur SampleCount latency nahi naapta.'
        },
        {
          q: 'Team ko EC2 instances ki memory usage par alarm chahiye. Pehla kadam?',
          choices: ['Detailed monitoring on karo; usme memory metric aata hai', 'CloudWatch agent install karke memory metric bhejo', 'CloudTrail data events on karo, woh memory record karte hain', 'VPC Flow Logs on karo, unme har instance ki memory hoti hai'],
          answer: 1,
          explain: 'Memory/disk hypervisor se nahi dikhti, isliye default metrics mein nahi. CloudWatch agent bhejta hai. Detailed monitoring sirf granularity 1 minute karta hai.'
        },
        {
          q: 'Kal ek metric filter banaya. Ab pichhle hafte ke errors ki ginti chahiye. Kya karoge?',
          choices: ['Metric filter ka metric dekho; woh pichhle hafte ke logs bhi gin leta hai', 'Metric filter dobara same naam se banao, taaki woh purane logs bhi gine', 'Log group ki retention badha do, isse purane errors metric mein aa jaate hain', 'Logs Insights query chalao, pichhle hafte ki sahi time range ke saath'],
          answer: 3,
          explain: 'Metric filter sirf banne ke baad ke events ginta hai, dobara banane se bhi backfill nahi hota. Purane logs ke liye Logs Insights query chalao. Retention se metric nahi banta.'
        },
        {
          q: 'Saare log groups "never expire" par hain aur bill badh raha hai. Audit logs 365 din rakhne ki policy hai. Sahi kadam?',
          choices: ['App log groups par tay retention (jaise 30 din), audit par 365 din hi', 'Saare log groups par 1 din retention, taaki bill turant kam ho jaaye', 'Saare log groups delete karke naye bana do, purana bill isse khatam hota hai', 'Retention ko 31 din karo; yeh 30 se thoda zyada aur safe hai'],
          answer: 0,
          explain: 'App logs ko zaroorat jitni retention do, audit ki policy wali retention rakho. 1 din audit todta hai, delete se saboot jaata hai, aur 31 din valid value hi nahi.'
        },
        {
          q: 'Security team jaanna chahti hai ki kisne invoices bucket ki ek file padhi. Trail sirf default settings par tha. Kya milega?',
          choices: ['Kuch nahi, kyunki CloudTrail kabhi bhi S3 ki activity record nahi karta', 'Poora GetObject record, kyunki trail har S3 object read default mein bhi likhta hai', 'Sirf management events; object read ke liye data events pehle se on hone chahiye the', 'Config history mein har object read ka user aur time milta hai, alag setup ke bina'],
          answer: 2,
          explain: 'Default trail management events likhta hai. S3 GetObject ek data event hai, jo alag se on karna padta hai; baad mein on karne se purana record nahi banta. Config reads record nahi karta.'
        },
        {
          q: 'Microservices mein ek request dheemi hai. Naya instrumentation shuru karna hai. Kya chunoge?',
          choices: ['OpenTelemetry (ADOT/CloudWatch agent) se traces, X-Ray mein dekho', 'Naye project mein bhi X-Ray SDK lagao, kyunki uska koi end date nahi hai', 'Sirf VPC Flow Logs, kyunki unme har request ki latency hoti hai', 'CloudTrail, kyunki woh har HTTP request ka time likhta hai'],
          answer: 0,
          explain: 'X-Ray SDKs maintenance mode mein hain aur 25 Feb 2027 ko support khatam hai; naye kaam ke liye OpenTelemetry. Flow Logs aur CloudTrail request ki latency nahi naapte.'
        },
        {
          q: 'Raat mein traffic zero hota hai, par checkout page ka chalna har 5 minute check karna hai. Kya lagaoge?',
          choices: ['RUM, kyunki woh raat mein bhi asli users ka data deta hai', 'CloudWatch Synthetics canary jo script se page chalaye', 'Average latency alarm, kyunki zero traffic par woh 0 dikhata hai', 'Logs Insights ki ek baar ki query, raat ke shuru mein'],
          answer: 1,
          explain: 'Canary bina asli users ke bhi script se page chalata hai. RUM ko asli users chahiye, zero traffic par latency metric aata hi nahi, aur ek baar ki query lagatar check nahi.'
        },
        {
          q: 'Teen alarms (p99, errors, 5xx) ek hi incident par teen pages bhejte hain. Noise kam karne ka sahi tareeka?',
          choices: ['Teeno alarms delete karo aur sirf CPU alarm rakho', 'Har alarm ka threshold double kar do taaki kam bajein', 'Har alarm par set-alarm-state OK chala do, jab bhi page aaye', 'Child alarms bina action, ek composite alarm (OR) on-call ko'],
          answer: 3,
          explain: 'Composite alarm signals ko jodta hai aur ek hi page bhejta hai. Delete ya double threshold asli incidents chhupa dete hain, aur set-alarm-state sirf test hai.'
        }
      ]
    }
  ];

  const INTERVIEW = {
    title: 'Interview: signals, alarms aur ek toota heartbeat',
    instructions: 'Chaar faisle, phir terminal mein woh heartbeat alarm theek karo jo outage mein OK rahi.',
    questions: [
      {
        q: 'Interviewer: "Metrics, logs aur traces mein se on-call ko page kis par jaana chahiye?"',
        choices: ['Har log line par, taaki koi bhi error chhoot na jaaye', 'User ke SLI wale metric alarms par; logs aur traces wajah dhoondhne ke liye', 'Sirf traces par, kyunki traces har request ka poora sach batate hain, sab ke liye', 'Sirf CloudTrail par, kyunki har outage kisi API call se hota hai'],
        answer: 1,
        explain: 'Page user ke dard (SLI) par jaaye. Logs aur traces diagnosis ke liye hain; har log line par page noise hai, traces sampled hote hain, aur har outage API call nahi.'
      },
      {
        q: '"Average latency alarm kabhi nahi bajta, phir bhi shikayatein aati hain. Kyun?"',
        choices: ['Average tail chhupata hai; p99 jaisa percentile SLO ke hisaab se dekho', 'Average alarm ko CloudWatch evaluate hi nahi karta, sirf store karta hai', 'Average sirf errors par chalta hai, latency par nahi', 'Average ko high-resolution par rakhne se tail apne aap dikhne lagti hai'],
        answer: 0,
        explain: 'Kam dheemi requests average ko mushkil se hilaati hain. Percentile alarm tail ko pakadta hai; resolution badhane se average ka swabhaav nahi badalta.'
      },
      {
        q: '"Logs ka bill ₹80,000 mahina hai. Pehla kadam?"',
        choices: ['Saare logs band kar do; observability ka bill zero aur dashboard bhi saaf ho jaayega', 'Har log line ko custom metric bana do, kyunki metrics logs se hamesha sasti hoti hain', 'Retention aur log volume dekho: app logs par tay retention, zaroorat ho toh IA class', 'Audit logs ki retention 1 din kar do, woh sabse zyada jagah lete hain'],
        answer: 2,
        explain: 'Never-expire retention aur zyada DEBUG logs bill badhate hain. Tay retention, kam volume aur jahan theek ho wahan Infrequent Access. Logs band karna ya audit todna galat hai.'
      },
      {
        q: '"Composite alarm kab use karoge?"',
        choices: ['Jab ek hi metric ka average aur maximum dono ek saath dekhna ho', 'Jab logs ko S3 mein near real-time stream karke rakhna ho', 'Jab metric filter bina kisi log group ke seedha banana ho', 'Jab kai signals ko jod kar on-call ko ek hi kaam ka page bhejna ho'],
        answer: 3,
        explain: 'Composite alarm kai alarms ko AND/OR se jodta hai aur noise kam karta hai. Statistics, streaming aur metric filter alag cheezein hain.'
      },
      {
        terminal: {
          title: '🖥️ Heartbeat alarm theek karo',
          instructions: 'Sirf app ka fixture. checkout-heartbeat outage mein OK raha. Wahi alarm theek karo; naya alarm ya manual state nahi.',
          goal: '<p>checkout-heartbeat (AWS/ApplicationELB RequestCount Sum &lt; 1, LoadBalancer=' + LB + ', 60s, 3 mein se 3, action on-call topic) abhi missing data ko notBreaching maanta hai, aur 10:28 se datapoints nahi aaye. Poori definition wahi rakh kar sirf missing data <b>breaching</b> karo (put-metric-alarm poori definition maangta hai), phir describe-alarms se aaj ki state padho. Expected: ALARM. set-alarm-state, threshold badalna ya action hatana nahi chalega.</p>',
          account: iseed(),
          tasks: itasks,
          solution: isolution,
          hints: ['Pehle aws cloudwatch describe-alarms --alarm-names checkout-heartbeat se poori definition dekho.', 'put-metric-alarm poora alarm replace karta hai: --alarm-actions aur baaki fields bhi dobara do, sirf --treat-missing-data breaching badlo.'],
          success: s => itasks.every(t => t.check(s)),
          successText: 'Wahi heartbeat alarm, wahi threshold aur action; missing data ab breaching aur state ALARM. Asli AWS mein ek planned test se dekho ki page on-call tak pahunchta hai.'
        }
      }
    ]
  };

  /* ---------- level ---------- */
  AG.registerLevels('advanced', [{
    id: 'observability',
    icon: '👁️',
    title: 'Observability — tail latency, sahi alarms, logs ka bill aur audit',
    badge: 'Drashta Dev',
    objectives: [
      'Metrics, logs, traces, audit aur config ko unke apne sawaal se jodna',
      'Average ki jagah p99, M-of-N aur missing data ke saath sahi alarm banana',
      'Metric filter, Logs Insights, retention aur log class se log ka kaam aur bill sambhalna',
      'CloudTrail management/data events, Config, Flow Logs aur Synthetics ki limits pehchaanna'
    ],
    hook: {
      when: 'ShopKaro course ki kahani (fictional)',
      title: 'Checkout kabhi-kabhi 8 second leta hai',
      text: 'Series A ke baad ShopKaro ke 40 engineers hain. Customers bolte hain ki checkout kabhi-kabhi 8 second leta hai. Dashboard par average latency 0.4 second dikhti hai, koi alarm nahi bajaa, aur koi bug dobara bana nahi pa raha. Upar se logs ka bill ₹80,000 mahina hai, kyunki har log group "never expire" par hai.',
      mission: 'Sahi signal chuno, tail latency pakdo, log ka bill kam karo aur on-call ko sirf kaam ka page bhejo. Course ke fixtures asli AWS bill ya live traffic nahi.'
    },
    steps: [
      {
        q: 'Metrics, logs aur traces mein farak kya hai?',
        analogy: 'Hospital mein monitor par heartbeat aur BP dikhta hai (metrics). Doctor ke notes batate hain ki kya hua (logs). CT scan dikhata hai ki andar dard kahan hai (trace).',
        body: '<p><b>Metric</b> ek number hai jo time ke saath badalta hai: latency, errors, CPU. <b>Log</b> ek event ka record hai: kis order par kya error aaya. <b>Trace</b> ek request ka poora safar hai: ALB → app → payment API → RDS, har hisse ka time. <b>SLI</b> woh number hai jo user ka anubhav naapta hai (jaise p99 checkout latency). <b>SLO</b> uska target hai (jaise 99% checkouts 2 second ke andar).</p>',
        points: ['Metric batata hai "kuch gadbad hai"; log batata hai "kya hua"; trace batata hai "kahan atka"', 'Audit (CloudTrail) batata hai kisne kaunsi API call ki; Config batata hai resource ki setting kab badli', 'Ek tool sab sawaalon ka jawaab nahi: sawaal se tool chuno'],
        asli: 'Pehle user ka SLI tay karo. Phir dekho kaunsa signal us SLI ko sach mein naapta hai.'
      },
      {
        q: 'CloudWatch metrics kaise bante hain, aur kya apne aap nahi aata?',
        analogy: 'Gaadi ka speedometer company deti hai, par tyre ka pressure dekhne ke liye alag sensor lagana padta hai.',
        body: '<p>Har metric ka <b>namespace</b> (jaise AWS/EC2, AWS/ApplicationELB) aur <b>dimensions</b> (jaise InstanceId, LoadBalancer) hote hain. EC2 basic monitoring 5 minute mein ek datapoint deta hai; <b>detailed monitoring</b> 1 minute deta hai (extra charge). Custom metrics 1 second tak ki <b>high resolution</b> par bhej sakte ho. EC2 ki <b>memory aur disk usage</b> default mein nahi aati: iske liye <b>CloudWatch agent</b> chahiye.</p>',
        points: ['Basic EC2: 5 minute; detailed: 1 minute; high-resolution custom: 1 second tak', 'Custom metric ka lagbhag $0.30/metric/mahina (pehle 10,000 metrics, us-east-1 list price)', 'Har nayi dimension value (jaise orderId) ek naya metric hai: high cardinality bill badhati hai'],
        asli: 'Memory alarm chahiye toh pehle CloudWatch agent lagao. Bina data ke alarm sirf INSUFFICIENT_DATA dikhayega.'
      },
      {
        q: 'Alarm kab bajta hai, aur average kyun dhokha deta hai?',
        analogy: 'Class ka average marks 70 ho, tab bhi 2 bachche fail ho sakte hain. Average un 2 bachchon ko chhupa deta hai.',
        body: '<p>Alarm ke teen state hain: <b>OK</b>, <b>ALARM</b>, <b>INSUFFICIENT_DATA</b>. Alarm har <b>period</b> (jaise 60 second) ka ek datapoint dekhta hai. <b>M of N</b> ka matlab: pichhle N periods mein se M breach hon toh ALARM (jaise 5 mein se 3). <b>Missing data</b> ka treatment tum chunte ho: missing, notBreaching, breaching ya ignore. Latency ke liye <b>p99</b> (ExtendedStatistic) dekho: 100 mein se sabse dheemi 1 request kitni dheemi hai. <b>Composite alarm</b> kai alarms ko AND/OR se jodta hai, taaki on-call ko kam aur kaam ke page jaayein.</p>',
        points: ['Average 0.4 s ho sakta hai jabki p99 8 s ho: dheemi requests average mein chhup jaati hain', 'M of N akele spike par page rokta hai; bahut bada N pakadne mein der karta hai', 'Lagbhag: standard alarm $0.10/mahina, high-resolution $0.30, composite $0.50 (us-east-1 list price)'],
        asli: 'User ka dard tail mein hota hai. SLO wali latency par p99 ka alarm lagao, average ka nahi.'
      },
      {
        q: 'Logs ka bill aur kaam kaise sambhalein?',
        analogy: 'Ghar ki har purani rasid hamesha rakhoge toh almari bhar jaayegi. Zaroori kaagaz rakho, baaki tay waqt par phenko.',
        body: '<p>Naya log group default mein <b>never expire</b> hota hai. Retention sirf tay values mein set hoti hai (1, 3, 5, 7, 14, 30, 60, 90 ... 3653 din). <b>Metric filter</b> log events se metric banata hai, par sirf filter banne ke <b>baad</b> aaye events se; purane logs ka backfill nahi hota. <b>defaultValue 0</b> do, taaki jis period mein logs aaye par koi match nahi, wahan 0 likha jaaye. <b>Logs Insights</b> ad-hoc query chalata hai (lagbhag $0.005 per GB scanned). <b>Subscription filter</b> logs ko Firehose/Lambda/OpenSearch tak stream karta hai. <b>Infrequent Access</b> class mein ingestion sasta hai (lagbhag $0.25/GB vs $0.50/GB), par kuch features kam hain.</p>',
        points: ['Example: 30 TB rakhe logs × lagbhag $0.03/GB-mahina ≈ $900/mahina ≈ ₹79,000', '30 din retention par lagbhag 1.8 TB bachta hai ≈ $54/mahina (60 GB/din ingestion maan kar)', 'Audit/compliance logs ki retention business rule se aati hai: unhe 30 din par mat kaato'],
        asli: 'App logs ki retention tay karo, audit logs ki zaroorat alag rakho, aur alarm ke liye metric filter ya seedha metric bhejo.'
      },
      {
        q: 'Trace request ka raasta kaise dikhata hai?',
        analogy: 'Courier ke tracking page par har hub ka time dikhta hai. Parcel kahan ruka, ek nazar mein pata chalta hai.',
        body: '<p><b>AWS X-Ray</b> traces jodta hai aur <b>service map</b> dikhata hai: kaunsi service dheemi ya fail hai. Har request ke hisse (segments) ka time dikhta hai, jaise payment call 5 second ka timeout. <b>Sampling</b> se sab requests trace nahi hoti, sirf kuch. X-Ray SDKs aur Daemon 25 Feb 2026 se maintenance mode mein hain, aur 25 Feb 2027 ko unka support khatam hoga. Naye kaam ke liye <b>OpenTelemetry</b> (ADOT ya CloudWatch agent) se traces X-Ray tak bhejo; X-Ray service khud chalti rahegi.</p>',
        points: ['Trace batata hai ki 8 second mein se 5 second payment API ke timeout mein gaye', 'Sampling kharcha kam karta hai, par har dheemi request trace mein nahi aayegi', 'Naye instrumentation ke liye OpenTelemetry chuno, purana X-Ray SDK nahi'],
        asli: 'Metric alarm "kuch dheema hai" batata hai; trace se pata chalta hai kaunsa hissa dheema hai.'
      },
      {
        q: 'CloudTrail aur Config kya saboot dete hain?',
        analogy: 'Bank ki passbook batati hai kisne kab paisa nikala. Ghar ka naksha register batata hai ki deewar kab todi gayi.',
        body: '<p><b>CloudTrail</b> API calls record karta hai. <b>Management events</b> (jaise DeleteBucket, RunInstances) ki 90 din ki <b>Event history</b> free milti hai. Lambe samay ke liye <b>trail</b> S3 mein logs bhejta hai. <b>Data events</b> (jaise S3 GetObject/PutObject, Lambda Invoke) default mein off hote hain aur alag se paise lagte hain (lagbhag $0.10 per 1,00,000 events). <b>AWS Config</b> resource ki setting ka itihaas (history) rakhta hai aur <b>rules</b> se compliance check karta hai. CloudTrail Lake 31 May 2026 se naye customers ke liye band hai; naye account mein CloudWatch ya trail + S3 + Athena jaisa raasta dekho.</p>',
        points: ['"Bucket kisne delete kiya?" → CloudTrail management event', '"Invoice object kisne padha?" → S3 data events on hone chahiye the', '"Security group kab khula aur kya woh rule ke khilaf hai?" → AWS Config'],
        asli: 'Audit ka saboot tabhi milta hai jab woh event pehle se record ho raha ho. Data events baad mein on karne se purana record nahi banta.'
      },
      {
        q: 'Flow Logs, Synthetics aur RUM kya pakadte hain, kya nahi?',
        analogy: 'Gate ka register batata hai kaun andar aaya, par yeh nahi ki usne andar kya baat ki.',
        body: '<p><b>VPC Flow Logs</b> IP traffic ka metadata (source, destination, port, ACCEPT/REJECT) likhte hain, packet ka content nahi. Kuch traffic record nahi hota: Route 53 Resolver ko DNS queries, DHCP, instance metadata (169.254.169.254), Amazon Time Sync, Windows license activation aur mirrored traffic. <b>CloudWatch Synthetics canaries</b> har kuch minute mein script se endpoint check karte hain, chahe asli users na hon. <b>CloudWatch RUM</b> asli browser users ka page load time naapta hai.</p>',
        points: ['Flow Logs mein REJECT dikhe toh SG/NACL dekho; DNS ki problem Flow Logs mein nahi dikhegi', 'Canary raat mein bhi checkout page chala kar dekhta hai; zero traffic par bhi signal milta hai', 'RUM asli users ka anubhav dikhata hai, jo server-side metric se chhoot sakta hai'],
        asli: 'Har tool ka andha hissa (blind spot) jaano. Ek tool ka khaali result health ka saboot nahi.'
      },
      {
        q: 'Observability ka kharcha kahan se aata hai?',
        analogy: 'CCTV har kone mein lagao aur sab recording hamesha rakho, toh hard disk ka bill chori se bhi bada ho sakta hai.',
        body: '<p>Kharcha mostly teen jagah se aata hai: <b>log ingestion</b> (per GB), <b>log storage</b> (per GB-mahina, retention par depend) aur <b>custom metrics/alarms</b> (per metric, per alarm). Traces mein sampling kharcha kam karta hai. Debug-level logs production mein hamesha on rakhna, ya har orderId ko metric dimension banana, bill bahut badhata hai. Pehle tay karo ki kaunsa sawaal poochna hai, phir utna hi data rakho.</p>',
        points: ['Example: 60 GB/din × 30 din × lagbhag $0.50/GB = $900/mahina sirf ingestion', 'INFO/DEBUG logs kam karo; ERROR aur zaroori business events rakho', 'Metric filter ka metric mostly sasta hai, har log line ko custom metric bhejne se'],
        asli: 'Observability ka goal sawaal ka jawaab hai, sab kuch hamesha rakhna nahi. Retention aur sampling soch kar chuno.'
      }
    ],
    myth: [
      { myth: 'Average latency theek hai toh users khush hain.', sach: 'Average dheemi requests ko chhupa deta hai. 0.4 s average ke saath bhi 1% users 8 s dekh sakte hain; p99 dekho.' },
      { myth: 'Alarm OK hai matlab system healthy hai.', sach: 'Agar metric aana band ho jaaye aur missing data notBreaching ho, toh outage mein bhi alarm OK rehta hai. Heartbeat alarm mein missing data breaching rakho.' },
      { myth: 'Metric filter banate hi pichhle hafte ke errors gin lega.', sach: 'Metric filter sirf banne ke baad aaye log events ginta hai. Purane logs ke liye Logs Insights query chalao.' },
      { myth: 'CloudTrail default mein har S3 object read record karta hai.', sach: 'Default mein sirf management events hote hain. S3 object-level reads ke liye data events alag se on karne padte hain, aur unka alag kharcha hai.' }
    ],
    playbook: {
      title: 'Signal → alarm → saboot → kharcha',
      use: ['User ke SLI par p99 alarm, M of N ke saath', 'Composite alarm, taaki on-call ko ek hi kaam ka page jaaye', 'App logs par tay retention aur metric filter (defaultValue 0)'],
      avoid: ['Latency par sirf Average ka alarm', 'Heartbeat alarm par missing data notBreaching', 'Har log group never expire, ya audit logs ko app jaisi chhoti retention'],
      how: ['SLI aur SLO likho (jaise p99 < 2 s)', 'Metric chuno, statistic aur M of N tay karo, missing data ka matlab socho', 'Logs Insights se pattern dhoondho; zaroorat ho toh metric filter banao', 'Alarm ko asli data par jaancho; manual set-alarm-state sirf notification test hai, health ka saboot nahi'],
      redflags: ['Dashboard hara hai par customers shikayat kar rahe hain', 'Alarm INSUFFICIENT_DATA ya OK, jabki logs aana band hai', 'Logs ka bill har mahine badh raha hai aur retention set nahi', '"Kisne delete kiya?" ka jawaab nahi, kyunki trail ya data events on nahi the'],
      rule: 'Pehle sawaal, phir signal: user ka dard p99 mein, wajah logs/traces mein, "kisne kiya" CloudTrail mein, aur bill retention mein.'
    },
    exam: [
      { cue: 'EC2 memory/disk utilization ka metric chahiye', pick: 'CloudWatch agent install karo (default metrics mein nahi aata)' },
      { cue: 'EC2 metrics 1 minute ki granularity par', pick: 'Detailed monitoring on karo' },
      { cue: 'Log mein "ERROR" aaye toh alert', pick: 'Metric filter + CloudWatch alarm' },
      { cue: 'Logs par ad-hoc query, koi setup nahi', pick: 'CloudWatch Logs Insights' },
      { cue: 'Logs ko OpenSearch/S3 mein near real-time stream karo', pick: 'Subscription filter + Amazon Data Firehose' },
      { cue: 'Kisne S3 bucket delete kiya?', pick: 'CloudTrail (management events)' },
      { cue: 'Resource config ka history aur compliance rules', pick: 'AWS Config' },
      { cue: 'Microservices mein latency kahan atki, poora raasta', pick: 'X-Ray traces (naye kaam ke liye OpenTelemetry se)' },
      { cue: 'Endpoint ko lagatar script se test karo, chahe traffic na ho', pick: 'CloudWatch Synthetics canary' }
    ],
    stages: STAGES,
    interview: INTERVIEW,
    success: [
      'Average aur p99 ka farak samjha kar user ke SLI par sahi alarm bana sakta hoon.',
      'Metric filter, Logs Insights, retention aur composite alarm se on-call ko kaam ka signal de sakta hoon.',
      'CloudTrail, Config, Flow Logs, traces aur Synthetics mein se sawaal ke hisaab se sahi tool chun sakta hoon.'
    ],
    homework: '<p>Optional, sirf approved asli-AWS sandbox mein; CloudWatch alarms, logs, Synthetics aur custom metrics ka bill lagta hai. Ek test log group banao, 7 din retention lagao, aur ek JSON log line bhejo. <code>{ $.level = "ERROR" }</code> metric filter (defaultValue 0) banao, phir naye ERROR events bhej kar metric dekho. Ek p99 alarm (5 mein se 3) aur ek composite alarm banao; on-call email ke liye SNS subscription confirm karo. Notification ka test <code>set-alarm-state</code> se karo, aur yaad rakho ki yeh health ka saboot nahi. Cleanup: alarms, metric filter, log group, canary (agar banaya) aur SNS topic delete karo; billing dashboard agle din dobara dekho.</p>',
    cards: [
      { front: 'Latency alarm ke liye Average ya p99?', back: 'p99 (ExtendedStatistic). Average dheemi requests ko chhupa deta hai; user ka dard tail mein hota hai.' },
      { front: 'M of N ka matlab?', back: 'Pichhle N periods mein se M breach hon toh ALARM. Akele spike par page rukta hai; bahut bada N der karta hai.' },
      { front: 'Heartbeat alarm mein missing data?', back: 'breaching. Zero traffic par ALB metric bhejta hi nahi; notBreaching outage mein bhi OK dikhayega.' },
      { front: 'Metric filter purane logs ginta hai?', back: 'Nahi. Sirf filter banne ke baad aaye events. Purane logs ke liye Logs Insights. defaultValue 0 do.' },
      { front: 'Log group ki default retention?', back: 'Never expire. Tay values (1, 3, 5, 7, 14, 30 ... 3653 din) mein se chuno; audit ki zaroorat alag rakho.' },
      { front: 'EC2 memory metric?', back: 'Default mein nahi. CloudWatch agent chahiye. 1-minute EC2 metrics ke liye detailed monitoring.' },
      { front: 'CloudTrail management vs data events?', back: 'Management (DeleteBucket) default + 90 din Event history. Data events (S3 GetObject) alag se on, alag kharcha.' },
      { front: 'X-Ray SDK aaj?', back: 'Maintenance mode (25 Feb 2026), support 25 Feb 2027 tak. Naye kaam ke liye OpenTelemetry; X-Ray service chalti rehti hai.' }
    ]
  }]);

  AG.obsFixtures = { seed, iseed, tasks, itasks, solution, isolution, TOPIC, LB, START, END };
})();
