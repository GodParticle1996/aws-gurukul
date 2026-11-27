/* 📟 On-call shift 'blind-alarms' — observability level (tail latency, sahi alarms, logs). Engine: oncall.js.
   29 Nov, 02:45. Level ke triage wali raat: 02:10–02:40 checkout band raha, pager CHUP raha. Checkout app mein memory leak hai —
   har ~13 minute crash, ~4 minute band, phir Auto Scaling naya instance laata hai (yeh dev team ka bug hai). On-call ka kaam:
   monitoring ko sach bolna sikhana. Teen JUDE alerts (sab support escalation se — pager kuch nahi bata raha):
     1 CheckoutOutageNoPage    heartbeat alarm TreatMissingData notBreaching: app band = metric aana band = alarm OK.
                               Fix: breaching. Jaal: put-metric-alarm POORA alarm badalta hai — --alarm-actions dobara na diya
                               toh alarm pager tak jaayega hi nahi.
     2 PaymentErrorsUncounted  metric filter '"payment gateway" error' — logs mein "ERROR" (bade akshar). Pattern case-sensitive.
                               Fix: pattern theek karo. Metric filter sirf naye log events ginta hai, purane nahi.
     3 LatencyAverageHides     latency alarm Average > 1000 ms: average 420 ms, par p99 ~8 s. Fix: ExtendedStatistic p99.
   Model (reconcile, har minute): app chalta ho toh heartbeat 1 + log lines (INFO + ERROR payment timeout) + latency datapoint
   (SampleCount 2400, Average ~420, p99 ~8200). Band ho toh kuch nahi (missing data). PaymentErrors = naye log events par
   abhi ke metric filter ki ginti (defaultValue 0). Alarms capacity-cli ke AG.capacityAlarmSnapshot se (missing data, percentiles). */
(function () {
  const R = 'ap-south-1', A = '123456789012', GROUP = '/shopkaro/checkout', NS = 'ShopKaro/Checkout';
  const T0 = Date.parse('2026-11-28T21:15:00Z');                     // 29 Nov 02:45 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const ist = ms => new Date(ms + 19800000).toISOString().replace('Z', '+05:30');
  const PAGER = `arn:aws:sns:${R}:${A}:oncall-pager`, DIMS = [{ Name: 'Service', Value: 'checkout' }];
  const down = c => c >= 4 && (c - 4) % 13 < 4;                        // 02:49–02:52, 03:02–03:05 … band
  const ERR = n => `ERROR [pay-worker-${1 + n % 4}] payment gateway timeout order=ORD-${88213 + n * 37} after=10002ms`;
  const INFO = n => `INFO  [web-${1 + n % 3}] order placed order=ORD-${88200 + n * 41} total=${899 + (n * 173) % 4000} items=${1 + n % 4}`;
  const alarm = (a, n) => a.alarms.find(x => x.name === n);
  const group = a => a.logGroups.find(g => g.name === GROUP);
  const sameMetric = (d, metric) => d.Namespace === NS && d.MetricName === metric && JSON.stringify(d.Dimensions || []) === JSON.stringify(DIMS);
  const pages = d => d.ActionsEnabled !== false && (d.AlarmActions || []).includes(PAGER);
  const errorFilter = a => (group(a).metricFilters || []).find(f => { const t = f.metricTransformations[0] || {};
    if (t.metricName !== 'PaymentErrors' || t.metricNamespace !== NS) return false;
    const m = AG.obsPattern(f.filterPattern); return m(ERR(1)) && !m(INFO(1)); });

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const g = group(a), ms = T0 + clock * 60000, L = a.blind;
    const push = (key, p) => { const s = a.capacityMetrics.find(x => x.key === key); s.points.push(p); if (s.points.length > 40) s.points.shift(); };
    if (down(clock)) {
      if (!L.crashed) { g.events.push(`FATAL [web-2] java.lang.OutOfMemoryError: Java heap space — process exiting`); g.eventTimes.push(ist(ms - 50000)); L.crashed = true; }
    } else {
      L.crashed = false;
      const lines = [INFO(clock * 3), ERR(clock * 3), INFO(clock * 3 + 1), ERR(clock * 3 + 1), INFO(clock * 3 + 2), ERR(clock * 3 + 2)];
      if (clock % 2 === 0) lines.push(ERR(clock * 3 + 7));
      lines.forEach((m, i) => { g.events.push(m); g.eventTimes.push(ist(ms - 55000 + i * 9000)); });
      push('hb', AG.oncall.point(a.now, 1));
      const avg = 410 + (clock * 13) % 30, p99 = 8100 + (clock * 97) % 400;
      push('lat', { Timestamp: a.now, SampleCount: 2400, Average: avg, Minimum: 38, Maximum: 9800, Sum: avg * 2400, p99 });
      // metric filter: sirf naye events; jo filter abhi laga hai wahi ginta hai (defaultValue 0 jab events aaye par match nahi)
      (g.metricFilters || []).forEach(f => { const t = f.metricTransformations[0]; if (t.metricName !== 'PaymentErrors' || t.metricNamespace !== NS) return;
        const n = lines.filter(AG.obsPattern(f.filterPattern)).length; push('err', AG.oncall.point(a.now, n || t.defaultValue || 0)); });
    }
    while (g.events.length > 80) { g.events.shift(); g.eventTimes.shift(); }
  }

  const RUNBOOK = `# ShopKaro on-call — monitoring ki raat (29 Nov, 02:45 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Alarms:  aws cloudwatch describe-alarms --alarm-name-prefix checkout-
         (checkout-heartbeat · checkout-payment-errors · checkout-latency)
Metrics: aws cloudwatch get-metric-statistics --namespace ${NS} --metric-name <Heartbeat|PaymentErrors|Latency>
           --dimensions Name=Service,Value=checkout --start-time <iso> --end-time <iso> --period 60 --statistics Sum
           (Latency ke liye --extended-statistics p99 bhi)
Logs:    aws logs filter-log-events --log-group-name ${GROUP} --filter-pattern ERROR
         aws logs describe-metric-filters --log-group-name ${GROUP}
         aws logs test-metric-filter --filter-pattern '<pattern>' --log-event-messages '<line>' ['<line>' …]
Badlaav: aws logs put-metric-filter --log-group-name ${GROUP} --filter-name payment-errors --filter-pattern '<pattern>'
           --metric-transformations metricName=PaymentErrors,metricNamespace=${NS},metricValue=1,defaultValue=0
         aws cloudwatch put-metric-alarm …   (POORA alarm naya likhta hai — saari settings dobara do)

Jaankari:
- Pager = SNS ${PAGER}. Har alarm ka --alarm-actions yahi ho, warna page nahi jaata.
- Checkout memory leak: dev team ka P1 ticket khula hai. Tumhara kaam: alarms sach bolein.
- Metric filter pattern case-sensitive hai. Metric filter sirf banne/badalne ke BAAD aaye logs ginta hai.
- Users ka dard p99 mein dikhta hai, average mein nahi.
`;
  const hb = `aws cloudwatch put-metric-alarm --alarm-name checkout-heartbeat --namespace ${NS} --metric-name Heartbeat --dimensions Name=Service,Value=checkout --statistic Sum --threshold 1 --comparison-operator LessThanThreshold --period 60 --evaluation-periods 2 --datapoints-to-alarm 2 --treat-missing-data breaching --alarm-actions ${PAGER}`;
  const lat = `aws cloudwatch put-metric-alarm --alarm-name checkout-latency --namespace ${NS} --metric-name Latency --dimensions Name=Service,Value=checkout --extended-statistic p99 --threshold 2000 --comparison-operator GreaterThanThreshold --period 60 --evaluation-periods 3 --datapoints-to-alarm 2 --treat-missing-data missing --alarm-actions ${PAGER}`;
  const filt = `aws logs put-metric-filter --log-group-name ${GROUP} --filter-name payment-errors --filter-pattern '"payment gateway" ERROR' --metric-transformations metricName=PaymentErrors,metricNamespace=${NS},metricValue=1,defaultValue=0`;

  AG.oncall.add({
    id: 'blind-alarms', start: 2 * 60 + 45,
    INC: [
      { id: 'CheckoutOutageNoPage', sev: '🔴 SEV1', text: 'Support escalation: 02:10–02:40 checkout band tha, par pager chup raha. checkout-heartbeat poore waqt OK tha. App abhi phir gir sakta hai.',
        fixed: a => { const d = alarm(a, 'checkout-heartbeat').definition; return sameMetric(d, 'Heartbeat') && d.TreatMissingData === 'breaching' && /^LessThan/.test(d.ComparisonOperator) && pages(d); },
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'alarms dobara dekho (describe-alarms)',
        hints: ['cat runbook.md, phir aws cloudwatch describe-alarms --alarm-names checkout-heartbeat — TreatMissingData kya hai? App band ho toh Heartbeat metric ka kya hota hai?',
          'App band = Heartbeat metric aata hi nahi = missing data. notBreaching kehta hai "missing ko theek maano" — isliye outage mein alarm OK raha. Heartbeat alarm mein missing = breaching. Dhyaan: put-metric-alarm POORA alarm naya likhta hai — --alarm-actions dobara do, warna page nahi jaayega.',
          `${hb}, phir aws cloudwatch describe-alarms --alarm-names checkout-heartbeat`] },
      { id: 'PaymentErrorsUncounted', sev: '🟠 SEV2', text: 'Support: "payment fail" ki shikayatein aa rahi hain. checkout-payment-errors alarm OK hai — metric har minute 0.',
        fixed: a => !!errorFilter(a),
        verify: /^aws cloudwatch (describe-alarms|get-metric-statistics)\b|^aws logs (test-metric-filter|describe-metric-filters)\b/, verifyText: 'alarm, metric ya filter dobara dekho',
        hints: [`aws logs filter-log-events --log-group-name ${GROUP} --filter-pattern ERROR, phir aws logs describe-metric-filters --log-group-name ${GROUP} — pattern aur asli log line milao.`,
          'Filter pattern case-sensitive hai: "error" ERROR wali line se match nahi karta. test-metric-filter se pattern ko asli line par aazmao. Naya pattern sirf aage aane wale events ginega.',
          `${filt}, phir aws cloudwatch describe-alarms --alarm-names checkout-payment-errors`] },
      { id: 'LatencyAverageHides', sev: '🟠 SEV2', text: 'Support: "checkout 8 second le raha hai". checkout-latency alarm OK — average 420 ms.',
        fixed: a => { const d = alarm(a, 'checkout-latency').definition, p = Number(String(d.ExtendedStatistic || '').slice(1));
          return sameMetric(d, 'Latency') && /^p/.test(d.ExtendedStatistic || '') && p >= 90 && d.Threshold <= 3000 && /^GreaterThan/.test(d.ComparisonOperator) && pages(d); },
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'alarms dobara dekho (describe-alarms)',
        hints: [`aws cloudwatch get-metric-statistics --namespace ${NS} --metric-name Latency --dimensions Name=Service,Value=checkout --start-time <iso> --end-time <iso> --period 60 --extended-statistics p99 — Average aur p99 milao.`,
          'Average dheemi requests ko chhupa deta hai: 99% fast hon toh average 420 ms, par 1% users 8 s dekhte hain. Alarm ko p99 par lagao (ExtendedStatistic). Phir se --alarm-actions dena mat bhoolna.',
          `${lat}, phir aws cloudwatch describe-alarms --alarm-names checkout-latency`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const series = (key, metric, unit) => ({ key, seriesId: 'blind-' + key, version: 1, period: 60, namespace: NS, metric, unit, dimensions: DIMS, points: [] });
      const def = (name, metric, stat, op, threshold, n, m, missing) => ({ name, alarmId: 'blind-' + metric, revision: 0, state: 'OK',
        definition: { AlarmName: name, Namespace: NS, MetricName: metric, Dimensions: DIMS, Statistic: stat, Threshold: threshold, ComparisonOperator: op,
          Period: 60, EvaluationPeriods: n, DatapointsToAlarm: m, TreatMissingData: missing, ActionsEnabled: true, AlarmActions: [PAGER] } });
      const seedT = T0 - 5 * 60000, seed = [], seedTimes = [];
      for (let i = 0; i < 5; i++) [INFO(200 + i), ERR(100 + i)].forEach((m, j) => { seed.push(m); seedTimes.push(ist(seedT + i * 60000 + j * 20000)); });
      const account = {
        region: R, now: iso(T0), obsMode: true, callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        topics: [{ name: 'oncall-pager', arn: PAGER, topicId: 'blind-pager', attributes: {}, dedup: [], subscriptions: [] }],
        logGroups: [{ name: GROUP, retention: 30, events: seed, eventTimes: seedTimes,
          metricFilters: [{ filterName: 'payment-errors', filterPattern: '"payment gateway" error', logGroupName: GROUP, creationTime: Date.parse('2026-10-02T06:12:00Z'),
            metricTransformations: [{ metricName: 'PaymentErrors', metricNamespace: NS, metricValue: '1', defaultValue: 0 }] }] }],
        capacityMetrics: [series('hb', 'Heartbeat', 'Count'), series('err', 'PaymentErrors', 'Count'), series('lat', 'Latency', 'Milliseconds')],
        alarms: [def('checkout-heartbeat', 'Heartbeat', 'Sum', 'LessThanThreshold', 1, 2, 2, 'notBreaching'),
          def('checkout-payment-errors', 'PaymentErrors', 'Sum', 'GreaterThanThreshold', 2, 1, 1, 'notBreaching'),
          def('checkout-latency', 'Latency', 'Average', 'GreaterThanThreshold', 1000, 3, 2, 'missing')],
        blind: { crashed: false },
      };
      const responses = [
        risky(/^aws cloudwatch (delete-alarms|disable-alarm-actions)\b/, 'alarm hatana ya uske actions band karna — pager aur bhi andha ho jaata.'),
        risky(/^aws logs (delete-metric-filter|delete-log-group|put-retention-policy)\b/, 'raat ko logs/filters mitana ya retention chhedna — incident ka saboot jaata; runbook mein nahi.'),
        risky(/^aws cloudwatch put-metric-alarm\b(?=.*--treat-missing-data\s+(notBreaching|ignore)\b)/, 'missing data ko theek maanna — app band hone par alarm phir chup rahega.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms / get-metric-statistics / put-metric-alarm · aws logs filter-log-events / describe-metric-filters / test-metric-filter / put-metric-filter. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK } }, responses,
        placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --alarm-name-prefix checkout-)',
        goal: 'Raat 02:45. Checkout aadha ghanta band raha aur pager chup raha. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b> — is baar "theek" ka matlab: alarm sach bole. Runbook todne wale commands simulator rok dega.',
        successText: 'Heartbeat par <b>missing = breaching</b>, errors ka filter asli <b>ERROR</b> line ginta hai, aur latency alarm <b>p99</b> dekhta hai — teeno ab pager tak jaate hain. Memory leak dev team ka P1 hai; ab woh jab bhi gire, pager bajega. Sabak: OK alarm ka matlab healthy system nahi.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --alarm-names checkout-heartbeat', hb, 'aws cloudwatch describe-alarms --alarm-names checkout-heartbeat',
          `aws logs filter-log-events --log-group-name ${GROUP} --filter-pattern ERROR`, `aws logs describe-metric-filters --log-group-name ${GROUP}`,
          `aws logs test-metric-filter --filter-pattern '"payment gateway" ERROR' --log-event-messages '${ERR(1)}' '${INFO(1)}'`, filt,
          'aws cloudwatch describe-alarms --alarm-names checkout-payment-errors',
          lat, 'aws cloudwatch describe-alarms --alarm-names checkout-latency'],
      };
    },
  });

  AG.addLab('observability', {
    type: 'oncall', id: 'oncall-blind-alarms', shift: 'blind-alarms', title: '📟 On-call: pager chup kyun raha?',
    intro: 'Raat 02:45. Checkout band raha, pager nahi baja. <b>Dekho → alarms ko sach bolna sikhao → pakka karo</b>. Har command = 1 minute.',
  });
})();
