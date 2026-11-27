/* 📟 On-call shift 'refunds' — lambda level (Lambda: retries, limits aur output ka saboot). Engine: oncall.js.
   29 Nov, 01:00. Sale ke return window ke refunds: SQS refund-queue → event source mapping → Lambda refund-worker → payment gateway.
   Har batch = 10 refunds, har refund ek gateway call (~240 ms, ek ke baad ek) — kaam I/O par atka hai, CPU par nahi.
   Teen JUDE alerts:
     1 RefundWorkerErrors   timeout 3 s, par ek batch ko ~5.6 s chahiye → har invocation "Task timed out", backlog 1.5 lakh.
                            Jaal: sirf memory badhana — CPU badhta hai, gateway ka intezaar nahi ghatta. Fix: timeout 30
                            (queue visibility 180 = 6 × 30, AWS ki salah)
     2 RefundsDroppedUnpaid kaam chalte hi dikha: code v42 fail hue refunds ki IDs batchItemFailures mein lautata hai, par mapping par
                            ReportBatchItemFailures OFF hai → Lambda poora batch safal maan ke DELETE karta hai → refund kabhi nahi hota.
                            Fix: mapping par ReportBatchItemFailures (Updating → Enabled hone tak get-event-source-mapping)
     3 GatewayRateLimited   backlog nikalte waqt mapping 60 tak scale hoti hai; gateway 20 se zyada saath ke calls par 429.
                            Fix: mapping ScalingConfig MaximumConcurrency 15. Jaal: function par reserved concurrency — SQS mapping
                            ke saath throttle hue messages queue mein wapas jaate, receive count badhta, refunds DLQ mein.
   Model (reconcile, har minute): duration = AG.lambdaTiming (ioFloor 2400 ms). duration > timeout → sab fail. Warna
   saath ke invocations = cap (MaximumConcurrency, warna 60) jab tak backlog hai; gateway 20 se upar 429; 2% refunds par gateway 5xx. */
(function () {
  const R = 'ap-south-1', A = '123456789012', FN = 'refund-worker';
  const T0 = Date.parse('2026-11-28T19:30:00Z');                     // 29 Nov 01:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const Q = n => ({ name: n, arn: `arn:aws:sqs:${R}:${A}:${n}`, url: `https://sqs.${R}.amazonaws.com/${A}/${n}` });
  const SRC = Q('refund-queue'), DLQ = Q('refund-queue-dlq');
  const ESM = '3b9e7c1d-4f2a-4e8b-9d6c-0a5f1e7b2c84', GATEWAY_MAX = 20, DEFAULT_SCALE = 60;
  const fn = a => a.lambdas.find(f => f.name === FN);
  const esm = a => a.eventSourceMappings.find(m => m.uuid === ESM);
  const live = a => { const m = esm(a); return m && m.state === 'Enabled' ? m : null; };   // Updating ke dauraan purani config chalti hai
  const timing = f => AG.lambdaTiming(f).warmMs;
  const healthy = a => { const f = fn(a); return !f.pendingConfig && timing(f) <= 0.5 * f.timeout * 1000; };
  const partial = a => { const m = live(a); return !!m && (m.responseTypes || []).includes('ReportBatchItemFailures'); };
  const capped = a => { const m = live(a), c = m && (m.scalingConfig || {}).MaximumConcurrency; return !!c && c <= GATEWAY_MAX; };

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const f = fn(a), L = a.refunds, t = timing(f), tmo = f.timeout * 1000;
    let errors = 0, dropped = 0, r429 = 0, conc;
    if (t > tmo) { conc = 5; errors = conc * Math.round(60000 / tmo); L.backlog += L.incoming; }
    else {
      const m = live(a), cap = (m && (m.scalingConfig || {}).MaximumConcurrency) || DEFAULT_SCALE;
      conc = L.backlog > 0 ? cap : 3;
      const perConc = Math.round(600000 / t);                          // refund calls har minute, har invocation slot
      r429 = Math.max(0, conc - GATEWAY_MAX) * perConc;
      const served = Math.min(conc, GATEWAY_MAX) * perConc, failed5xx = Math.round(served * 0.02);
      if (!partial(a)) dropped = failed5xx + r429;                     // flag OFF: poora batch "safal" → fail hue bhi delete
      L.paid += served - failed5xx;
      L.backlog = Math.max(0, L.backlog + L.incoming - (served - failed5xx) - dropped);
      errors = t > 0.5 * tmo ? Math.round(conc * 60000 / t * 0.15) : 0;   // p99 tail abhi bhi timeout ke paas
    }
    const values = { errors, dropped, r429, duration: Math.min(t, tmo), backlog: L.backlog };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
  }

  const getEsm = `aws lambda get-event-source-mapping --uuid ${ESM}`;
  const RUNBOOK = `# ShopKaro on-call — refunds raat (29 Nov, 01:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Raasta:   SQS refund-queue → event source mapping (${ESM}) → Lambda ${FN} → payment gateway
Alarms:   aws cloudwatch describe-alarms --state-value ALARM
          (refund-worker-errors · refunds-dropped-unpaid · gateway-rate-limited)
Metrics:  aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Duration --dimensions Name=FunctionName,Value=${FN}
            --start-time <iso> --end-time <iso> --period 60 --statistics Maximum
Function: aws lambda get-function-configuration --function-name ${FN}
          aws lambda update-function-configuration --function-name ${FN} [--timeout S] [--memory-size MB]
          aws lambda wait function-updated-v2 --function-name ${FN}
Mapping:  ${getEsm}
          aws lambda update-event-source-mapping --uuid ${ESM} [--function-response-types ReportBatchItemFailures]
               [--scaling-config '{"MaximumConcurrency":N}']   (badlaav ke baad State Updating → Enabled)
Queue:    aws sqs get-queue-attributes --queue-url ${SRC.url} --attribute-names All

Jaankari:
- Har batch 10 refunds. Har refund ek gateway call (~240 ms), ek ke baad ek.
- Code v42 fail hue refunds ki IDs "batchItemFailures" mein lautata hai.
- Payment gateway: ek saath 20 se zyada calls par HTTP 429.
- Queue VisibilityTimeout 180 s. AWS ki salah: visibility ≥ 6 × function timeout.
- Kabhi nahi: queue purge, mapping delete, function par reserved concurrency (SQS mapping ke saath throttle → refunds DLQ mein).
`;

  AG.oncall.add({
    id: 'refunds', start: 60,
    INC: [
      { id: 'RefundWorkerErrors', sev: '🔴 SEV1', text: 'refund-worker ka har invocation fail. Refund backlog 1.5 lakh aur badh raha hai.',
        fixed: healthy,
        verify: /^aws cloudwatch (describe-alarms|get-metric-statistics)\b|^aws lambda get-function-configuration\b/, verifyText: 'alarms, Duration ya function config dobara dekho',
        hints: [`cat runbook.md, phir aws lambda get-function-configuration --function-name ${FN} — Timeout aur MemorySize kitne hain? Duration ka Maximum dekho (runbook ka get-metric-statistics).`,
          'Duration ka maximum theek timeout (3000 ms) par ruk raha hai = "Task timed out". Ek batch mein 10 gateway calls ek ke baad ek — yeh intezaar hai, CPU nahi. Memory badhane se yeh kam nahi hota. Timeout badhao, par queue visibility (180 s) ka 1/6 tak.',
          `aws lambda update-function-configuration --function-name ${FN} --timeout 30, phir aws lambda wait function-updated-v2 --function-name ${FN}, phir aws cloudwatch describe-alarms --alarm-names refund-worker-errors`] },
      { id: 'RefundsDroppedUnpaid', sev: '🔴 SEV1', text: 'Worker chal pada — par reconciliation job keh raha hai: kuch refunds queue se DELETE hue, aur customer ko paisa gaya hi nahi.',
        fixed: partial,
        verify: /^aws cloudwatch describe-alarms\b|^aws lambda get-event-source-mapping\b/, verifyText: 'alarms ya mapping dobara dekho',
        hints: [`${getEsm} — FunctionResponseTypes mein kya hai? Runbook: code v42 fail hue refunds ki IDs kaise batata hai?`,
          'Code fail hue IDs "batchItemFailures" mein lautata hai, par mapping par ReportBatchItemFailures OFF hai. Tab Lambda yeh jawab nazarandaaz karke POORA batch safal maanta aur queue se delete kar deta hai. Flag ON karo; State Updating se Enabled hone tak mapping dobara padho.',
          `aws lambda update-event-source-mapping --uuid ${ESM} --function-response-types ReportBatchItemFailures, phir ${getEsm} (State: Enabled), phir aws cloudwatch describe-alarms --alarm-names refunds-dropped-unpaid`] },
      { id: 'GatewayRateLimited', sev: '🟠 SEV2', text: 'Payment gateway se HTTP 429 (rate limit) — har minute hazaaron. Gateway team ne warning bheji hai.',
        fixed: capped,
        verify: /^aws cloudwatch describe-alarms\b|^aws lambda get-event-source-mapping\b/, verifyText: 'alarms ya mapping dobara dekho',
        hints: [`${getEsm} — ScalingConfig khaali hai? Backlog nikalte waqt mapping 60 invocations tak chalati hai, gateway 20 sambhalta hai.`,
          'Is source ki speed mapping par roko: ScalingConfig MaximumConcurrency (2–1000). Function par reserved concurrency MAT lagao — SQS mapping ke saath throttle hue messages queue mein laut kar receive count badhate hain aur refunds DLQ mein chale jaate hain.',
          `aws lambda update-event-source-mapping --uuid ${ESM} --scaling-config '{"MaximumConcurrency":15}', phir ${getEsm} (State: Enabled), phir aws cloudwatch describe-alarms --alarm-names gateway-rate-limited`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const dims = [{ Name: 'FunctionName', Value: FN }];
      const series = (key, namespace, metric, unit, d) => ({ key, seriesId: 'refunds-' + key, version: 1, period: 60, namespace, metric, unit, dimensions: d, points: [] });
      const alarm = (name, key, ns, metric, d, threshold) => ({ name, alarmId: 'refunds-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: d, Statistic: 'Sum', Threshold: threshold, ComparisonOperator: 'GreaterThanThreshold',
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const recon = [{ Name: 'Job', Value: 'refund-reconcile' }], gw = [{ Name: 'Gateway', Value: 'payments' }], q = [{ Name: 'QueueName', Value: SRC.name }];
      const queueRow = (x, attrs) => ({ name: x.name, queueId: 'refunds-' + x.name, revision: 0, arn: x.arn, url: x.url, isFifo: false,
        visibilityTimeout: Number(attrs.VisibilityTimeout), attributes: attrs, messages: [] });
      const account = {
        region: R, now: iso(T0), lambdaConcurrencyQuota: 1000, callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        roles: [{ name: 'refund-worker-role', lambda: { trust: 'lambda.amazonaws.com', receiveQueues: [SRC.arn] } }],
        lambdas: [{ name: FN, runtime: 'python3.12', handler: 'app.handler', roleName: 'refund-worker-role', memory: 128, timeout: 3, state: 'Active',
          lastUpdateStatus: 'Successful', architectures: ['x86_64'], revisionId: 'r42', environment: { Variables: { CODE_VERSION: 'v42', GATEWAY: 'payments' } },
          workload: { kind: 'refund-batch', ioFloorMs: 2400, baseMs: 3000, initMs: 400 } }],
        eventSourceMappings: [{ uuid: ESM, functionName: FN, eventSourceArn: SRC.arn, batchSize: 10, responseTypes: [], state: 'Enabled', scalingConfig: {} }],
        queues: [queueRow(SRC, { VisibilityTimeout: '180', MessageRetentionPeriod: '345600', ReceiveMessageWaitTimeSeconds: '20', DelaySeconds: '0', MaximumMessageSize: '262144',
            RedrivePolicy: JSON.stringify({ deadLetterTargetArn: DLQ.arn, maxReceiveCount: 5 }) }),
          queueRow(DLQ, { VisibilityTimeout: '30', MessageRetentionPeriod: '1209600', ReceiveMessageWaitTimeSeconds: '0', DelaySeconds: '0', MaximumMessageSize: '262144' })],
        capacityMetrics: [series('errors', 'AWS/Lambda', 'Errors', 'Count', dims), series('dropped', 'ShopKaro/Refunds', 'RefundsDroppedUnpaid', 'Count', recon),
          series('r429', 'ShopKaro/Payments', 'GatewayRateLimited', 'Count', gw), series('duration', 'AWS/Lambda', 'Duration', 'Milliseconds', dims),
          series('backlog', 'AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'Count', q)],
        alarms: [alarm('refund-worker-errors', 'errors', 'AWS/Lambda', 'Errors', dims, 0),
          alarm('refunds-dropped-unpaid', 'dropped', 'ShopKaro/Refunds', 'RefundsDroppedUnpaid', recon, 0),
          alarm('gateway-rate-limited', 'r429', 'ShopKaro/Payments', 'GatewayRateLimited', gw, 50)],
        refunds: { backlog: 150000, incoming: 150, paid: 0 },
      };
      const responses = [
        risky(/^aws sqs purge-queue\b/, 'refund queue purge karna — 1.5 lakh customers ke refund hamesha ke liye gaye.'),
        risky(/^aws lambda delete-event-source-mapping\b/, 'mapping delete karna — refunds bilkul rukk jaate, backlog aur badhta.'),
        risky(/^aws lambda put-function-concurrency\b/, 'refund-worker par reserved concurrency — SQS mapping ke saath throttle hue messages laut kar receive count badhate, refunds DLQ mein. Source ki speed mapping ke MaximumConcurrency se roko.'),
        risky(/^aws lambda update-function-configuration\b(?=.*--timeout\s+(18[1-9]|19\d|[2-9]\d\d|\d{4,})\b)/, 'timeout queue ki visibility (180 s) se zyada — refund chalte-chalte message phir dikhega aur doosra worker wahi refund dobara bhejega.'),
        risky(/^aws sqs (set-queue-attributes|delete-queue)\b(?=.*refund-queue(?!-dlq))/, 'raat ko refund queue ki settings/queue chhedna — runbook mein nahi; masla function aur mapping mein hai.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms / get-metric-statistics · aws lambda get-function-configuration / update-function-configuration / wait function-updated-v2 / get-event-source-mapping / update-event-source-mapping · aws sqs get-queue-attributes. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      const t1 = iso(T0 - 10 * 60000), t2 = iso(T0 + 10 * 60000);
      return {
        account, files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK } }, responses,
        placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'Raat 01:00, refunds ki raat. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b>. Har alert pichhle fix ke baad aata hai. Runbook todne wale commands simulator rok dega.',
        successText: 'Timeout kaam ke hisaab se (memory nahi — kaam gateway ka intezaar tha), mapping par <b>ReportBatchItemFailures</b> taaki sirf fail hue refunds dobara aayein, aur <b>MaximumConcurrency</b> se gateway ki limit ki izzat. Kal ka kaam: refund idempotency key, taaki retry kabhi do baar paisa na bheje.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', `aws lambda get-function-configuration --function-name ${FN}`,
          `aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Duration --dimensions Name=FunctionName,Value=${FN} --start-time ${t1} --end-time ${t2} --period 60 --statistics Maximum`,
          `aws lambda update-function-configuration --function-name ${FN} --timeout 30`, `aws lambda wait function-updated-v2 --function-name ${FN}`,
          'aws cloudwatch describe-alarms --alarm-names refund-worker-errors',
          getEsm, `aws lambda update-event-source-mapping --uuid ${ESM} --function-response-types ReportBatchItemFailures`, getEsm,
          'aws cloudwatch describe-alarms --alarm-names refunds-dropped-unpaid',
          `aws lambda update-event-source-mapping --uuid ${ESM} --scaling-config '{"MaximumConcurrency":15}'`, getEsm,
          'aws cloudwatch describe-alarms --alarm-names gateway-rate-limited'],
      };
    },
  });

  AG.addLab('lambda', {
    type: 'oncall', id: 'oncall-refunds', shift: 'refunds', title: '📟 On-call: refunds ki raat',
    intro: 'Raat 01:00. Sale ke refunds atke hain. <b>Dekho → theek karo → pakka karo</b> — function, mapping aur gateway ki limit. Har command = 1 minute.',
  });
})();
