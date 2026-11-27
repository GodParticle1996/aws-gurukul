/* 📟 On-call shift 'recs-down' — resilience level (Architect: duplicate, retries aur kharaab dependency). Engine: oncall.js.
   29 Nov, 20:00, PixShare ka shaam ka peak. Recommendation service (recs-api, ek OPTIONAL dependency) 18:35 se 503 de rahi hai.
   Teen JUDE alerts — sab "recovery" ke sabak:
     1 FeedErrors5xx          feed-api har request mein recs ko sync bulata (timeout 10 s) → feed 5xx ~38%. Optional service gire toh
                              default feed: kill switch /pixshare/feed/recs-mode = fallback (trending, cache se).
     2 RecsWarmupStaleRetries recs-warmup (async Lambda) ke fail hue events default niyam se 6 ghante tak retry hote rehte hain. recs
                              wapas aate hi 90+ minute purane events ka toofan. Fix: event invoke config — MaximumEventAgeInSeconds
                              chhota (600) aur MaximumRetryAttempts 0; purane warmups bekaar hain.
     3 RecsBackRollout        recs theek hua. Seedha personalized = thande cache par poora load (recovery spike). Runbook: pehle
                              canary-10, phir canary-50, phir personalized. Is shift mein pehla kadam.
   Model (reconcile, har minute): mode personalized + recs down → 5xx 38%, p99 10 s; fallback → 0. Warmup events ki umar = outage ki
   umar, MaximumEventAgeInSeconds tak. INC 3 aate hi recs theek ho jaata hai (onFire). */
(function () {
  const R = 'ap-south-1', A = '123456789012', FLAG = '/pixshare/feed/recs-mode', WARM = 'recs-warmup';
  const T0 = Date.parse('2026-11-29T14:30:00Z');                     // 20:00 IST
  const OUTAGE = Date.parse('2026-11-29T13:05:00Z');                 // 18:35 IST se recs-api 503
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const mode = a => ((a.parameters || []).find(p => p.name === FLAG) || {}).value;
  const fn = a => a.lambdas.find(f => f.name === WARM);
  const asyncCfg = a => (fn(a).asyncConfigs || {})['$LATEST'] || {};
  const maxAge = a => asyncCfg(a).MaximumEventAgeInSeconds ?? 21600;

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const L = a.recs, m = mode(a), ms = T0 + clock * 60000;
    let fivexx = 0, p99 = 180 + (clock * 11) % 40;
    if (!L.up && m !== 'fallback') { fivexx = 36 + (clock * 3) % 5; p99 = 10000; }
    if (L.up && m === 'personalized' && L.coldSince != null && clock - L.coldSince < 10) { fivexx = 22; p99 = 6400; }   // thanda cache, poora load
    const age = L.up ? Math.min(maxAge(a), 120) * 1000 : Math.min(ms - OUTAGE, maxAge(a) * 1000);
    const values = { fivexx, p99, age };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
  }

  const getFlag = `aws ssm get-parameter --name ${FLAG}`;
  const setFlag = v => `aws ssm put-parameter --name ${FLAG} --value ${v} --type String --overwrite`;
  const getAsync = `aws lambda get-function-event-invoke-config --function-name ${WARM}`;
  const RUNBOOK = `# PixShare on-call — shaam ka peak (29 Nov, 20:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Alarms:   aws cloudwatch describe-alarms --state-value ALARM
          (feed-5xx · recs-warmup-event-age)
Feed:     feed-api har request par recs-api (OPTIONAL) ko bulata hai.
Kill switch (SSM):  ${getFlag}
          ${setFlag('<mode>')}
          modes: personalized | fallback (trending, cache se — recs ki zaroorat nahi) | canary-10 | canary-50
Warmup:   ${WARM} = async Lambda (S3 upload → recs cache garam). Uske fail hue events Lambda khud retry karta hai.
          ${getAsync}
          aws lambda put-function-event-invoke-config --function-name ${WARM} --maximum-event-age-in-seconds N --maximum-retry-attempts N
          aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name AsyncEventAge --dimensions Name=FunctionName,Value=${WARM}
            --start-time <iso> --end-time <iso> --period 60 --statistics Maximum

Niyam:
- Optional dependency gire toh core raasta (feed) default par chalao. Dependency ka intezaar nahi.
- Recovery dheere: fallback → canary-10 → canary-50 → personalized (har kadam 10 min dekh kar). Seedha personalized MAT.
- recs-api team ka kaam unka; feed-api ka timeout/size badhana is incident ka hal nahi.
`;

  AG.oncall.add({
    id: 'recs-down', start: 20 * 60,
    INC: [
      { id: 'FeedErrors5xx', sev: '🔴 SEV1', text: 'PixShare feed 5xx ~38%, p99 10 s. recs-api (recommendations) 18:35 se 503 de raha hai — uski team dekh rahi hai.',
        fixed: a => mode(a) === 'fallback',
        verify: /^aws cloudwatch describe-alarms\b|^aws ssm get-parameter\b/, verifyText: 'alarms ya flag dobara dekho',
        hints: [`cat runbook.md, phir ${getFlag} — feed abhi kis mode mein hai? recs-api feed ke liye zaroori hai ya optional?`,
          'Recommendations optional hain, feed core hai. Feed har request par gire hue recs ka 10 s intezaar karta hai. Kill switch se feed ko default (fallback) par daalo — recs ke bina trending feed. feed-api ka timeout ya instances badhana hal nahi.',
          `${setFlag('fallback')}, phir aws cloudwatch describe-alarms --alarm-names feed-5xx`] },
      { id: 'RecsWarmupStaleRetries', sev: '🟠 SEV2', text: 'recs team: "recs-api 15 minute mein wapas aayega — par recs-warmup ke 90+ minute purane retries ek saath aaye toh hum phir gir jaayenge."',
        fixed: a => maxAge(a) <= 900,
        verify: /^aws cloudwatch (describe-alarms|get-metric-statistics)\b|^aws lambda get-function-event-invoke-config\b/, verifyText: 'event age ya async config dobara dekho',
        hints: [`${getAsync} — koi config hai? Nahi toh default: 2 retries, 6 ghante (21600 s) tak event rakhna. Phir AsyncEventAge dekho (runbook).`,
          'Lambda async events fail hone par khud retry karta hai aur default 6 ghante tak rakhta hai. Warmup purana ho toh bekaar hai — par recs ke wapas aate hi sab ek saath aayenge. Event ki umar chhoti karo (600 s) aur retries 0: purane warmups chhod do.',
          `aws lambda put-function-event-invoke-config --function-name ${WARM} --maximum-event-age-in-seconds 600 --maximum-retry-attempts 0, phir ${getAsync}`] },
      { id: 'RecsBackRollout', sev: '🟡 SEV3', text: 'recs-api wapas healthy. Product: "personalized feed wapas chahiye" — runbook ke hisaab se wapas lao.',
        onFire: a => { a.recs.up = true; a.recs.coldSince = a.shift.clock; },
        fixed: a => mode(a) === 'canary-10',
        verify: /^aws ssm get-parameter\b|^aws cloudwatch describe-alarms\b/, verifyText: 'flag ya alarms dobara dekho',
        hints: [`${getFlag} — abhi fallback hai. Runbook ka recovery kram kya hai?`,
          'Recs ka cache abhi thanda hai. Seedha personalized = poora traffic ek jhatke mein = recovery spike, aur recs phir gir sakta hai. Pehla kadam canary-10: 10% users, 10 minute dekho, phir aage.',
          `${setFlag('canary-10')}, phir ${getFlag}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const feed = [{ Name: 'Service', Value: 'feed-api' }], fdims = [{ Name: 'FunctionName', Value: WARM }];
      const series = (key, ns, metric, unit, d) => ({ key, seriesId: 'recs-' + key, version: 1, period: 60, namespace: ns, metric, unit, dimensions: d, points: [] });
      const alarm = (name, key, ns, metric, d, stat, threshold) => ({ name, alarmId: 'recs-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: d, Statistic: stat, Threshold: threshold, ComparisonOperator: 'GreaterThanThreshold',
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const account = {
        region: R, now: iso(T0), lambdaConcurrencyQuota: 1000, callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        parameters: [{ name: FLAG, type: 'String', value: 'personalized', version: 3, tier: 'Standard' }],
        roles: [{ name: 'recs-warmup-role', lambda: { trust: 'lambda.amazonaws.com' } }],
        lambdas: [{ name: WARM, runtime: 'python3.12', handler: 'warm.handler', roleName: 'recs-warmup-role', memory: 256, timeout: 30, state: 'Active',
          lastUpdateStatus: 'Successful', architectures: ['arm64'], revisionId: 'r17' }],
        capacityMetrics: [series('fivexx', 'PixShare/Feed', '5xxRate', 'Percent', feed), series('p99', 'PixShare/Feed', 'LatencyP99', 'Milliseconds', feed),
          series('age', 'AWS/Lambda', 'AsyncEventAge', 'Milliseconds', fdims)],
        alarms: [alarm('feed-5xx', 'fivexx', 'PixShare/Feed', '5xxRate', feed, 'Average', 5),
          alarm('recs-warmup-event-age', 'age', 'AWS/Lambda', 'AsyncEventAge', fdims, 'Maximum', 1800000)],
        recs: { up: false, coldSince: null },
      };
      const responses = [
        risky(new RegExp(`^aws ssm put-parameter\\b(?=.*--name\\s+${FLAG.replace(/\//g, '\\/')}\\b)(?=.*--value\\s+personalized\\b)`), 'seedha personalized — thande recs cache par poora traffic ek jhatke mein (recovery spike). Runbook: pehle canary-10.'),
        risky(/^aws ssm delete-parameter\b/, 'kill switch ka parameter hi mita dena — feed default value par atak jaata.'),
        risky(/^aws lambda (delete-function|put-function-concurrency)\b/, 'warmup function hatana / roko — runbook mein nahi; event ki umar chhoti karo.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms / get-metric-statistics · aws ssm get-parameter / put-parameter · aws lambda get-function-event-invoke-config / put-function-event-invoke-config. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK } }, responses,
        placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'Shaam 20:00, PixShare ka peak. Ek optional service giri hai. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b> — aur recovery dheere. Runbook todne wale commands simulator rok dega.',
        successText: 'Feed <b>default (fallback)</b> par chala jab optional recs gira; purane async retries ki <b>umar chhoti</b> ki taaki recovery par toofan na aaye; aur recs ko <b>canary-10</b> se dheere wapas laaye. Agle 20 minute: canary-50, phir personalized — har kadam ke baad feed-5xx aur recs ki latency dekh kar.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', getFlag, setFlag('fallback'), 'aws cloudwatch describe-alarms --alarm-names feed-5xx',
          getAsync.replace('get-function-event-invoke-config', 'get-function-configuration'),
          `aws lambda put-function-event-invoke-config --function-name ${WARM} --maximum-event-age-in-seconds 600 --maximum-retry-attempts 0`, getAsync,
          getFlag, setFlag('canary-10'), getFlag],
      };
    },
  });

  AG.addLab('resilience', {
    type: 'oncall', id: 'oncall-recs-down', shift: 'recs-down', title: '📟 On-call: recommendations gir gaye',
    intro: 'Shaam 20:00, PixShare ka peak. Optional service giri, feed atka. <b>Default par chalao → purane retries roko → dheere wapas lao</b>. Har command = 1 minute.',
  });
})();
