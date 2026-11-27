/* 📟 On-call shift 'invoice-fanout' — sqssns level (SQS / SNS: queue, fan-out aur retries). Engine: oncall.js.
   29 Nov, 10:00. OrderPlaced → SNS order-events → do SQS copies: email-queue (SSE-SQS) aur invoice-queue (customer managed
   KMS key, audit ka niyam). Kal raat security team ne invoice key ki policy "saaf" ki. Teen JUDE alerts:
     1 OrderEventsSnsFailed  SNS publish safal, email pahunchi, par invoice-queue khaali. Key policy mein sns.amazonaws.com nahi —
                             SNS encrypted queue mein likh hi nahi sakta. Fix: reviewed key policy (SNS service principal,
                             kms:GenerateDataKey* + kms:Decrypt, aws:SourceArn = topic). KMS ka mana karna SNS ke liye client-side
                             error hai — un messages ko SNS dobara nahi bhejta.
     2 DuplicateInvoices     delivery chalte hi: ek invoice PDF banane mein ~45 s, queue VisibilityTimeout 30 s → delete se pehle
                             message phir dikhta, doosra worker wahi invoice dobara banata. Fix: VisibilityTimeout 300.
     3 PoisonInvoicesVanish  3 baar fail hue invoices DLQ mein jaate hain par turant gayab: DLQ ki retention 300 s. Standard
                             queue mein DLQ message ki PURANI enqueue time rakhta hai → retention source se lambi chahiye. Fix: 14 din.
   Model (reconcile, har minute): 40 orders/min. Invoice delivery = key policy SNS ko allow kare. Duplicates: visibility < 45 s
   par ~90%, < 60 s par ~10% (p99 tail). Har ~7 minute ek poison invoice (galat GSTIN). Alarms capacity-cli se. */
(function () {
  const R = 'ap-south-1', A = '123456789012';
  const T0 = Date.parse('2026-11-29T04:30:00Z');                     // 10:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const TOPIC = `arn:aws:sns:${R}:${A}:order-events`;
  const Q = n => ({ name: n, arn: `arn:aws:sqs:${R}:${A}:${n}`, url: `https://sqs.${R}.amazonaws.com/${A}/${n}` });
  const EMAIL = Q('email-queue'), INV = Q('invoice-queue'), DLQ = Q('invoice-dlq');
  const KEY_ID = '3f8a2c1e-7b5d-4e9f-a0c6-1d2e3f4a5b6c', KEY_ARN = `arn:aws:kms:${R}:${A}:key/${KEY_ID}`, ROOT = `arn:aws:iam::${A}:root`;
  const WORKER_ROLE = `arn:aws:iam::${A}:role/invoice-worker`;
  const queue = (a, q) => a.queues.find(x => x.name === q.name);
  const attr = (a, q, k) => Number(queue(a, q).attributes[k]);
  const arr = x => Array.isArray(x) ? x : x == null ? [] : [x];
  const glob = (p, v) => p === '*' || p === v || (p.endsWith('*') && v.startsWith(p.slice(0, -1)));
  const snsAllowed = a => {
    const k = a.kmsKeys.find(x => x.id === KEY_ID), st = (k.policy || {}).Statement || [];
    const lets = act => st.some(s => s.Effect === 'Allow' && arr((s.Principal || {}).Service).includes('sns.amazonaws.com') && arr(s.Action).some(p => glob(p, act))
      && Object.values(s.Condition || {}).every(c => Object.entries(c).every(([n, v]) => n.toLowerCase() !== 'aws:sourcearn' || arr(v).includes(TOPIC))));
    const denied = st.some(s => s.Effect === 'Deny' && (s.Principal === '*' || arr((s.Principal || {}).Service).includes('sns.amazonaws.com')));
    return lets('kms:GenerateDataKey') && lets('kms:Decrypt') && !denied;
  };

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const L = a.fanout, orders = 38 + (clock * 5) % 7, ok = snsAllowed(a), vis = attr(a, INV, 'VisibilityTimeout');
    const failed = ok ? 0 : orders;
    const dup = !ok ? 0 : vis < 45 ? Math.round(orders * 0.9) : vis < 60 ? Math.round(orders * 0.1) : 0;
    if (ok && clock > 0 && clock % 7 === 3) L.poison++;
    const values = { failed, dup };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
  }

  const goodPolicy = { Version: '2012-10-17', Id: 'invoice-queue-key', Statement: [
    { Sid: 'AccountAdmin', Effect: 'Allow', Principal: { AWS: ROOT }, Action: 'kms:*', Resource: '*' },
    { Sid: 'InvoiceWorkerDecrypt', Effect: 'Allow', Principal: { AWS: WORKER_ROLE }, Action: ['kms:Decrypt'], Resource: '*' },
    { Sid: 'AllowSnsOrderEvents', Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' }, Action: ['kms:GenerateDataKey*', 'kms:Decrypt'], Resource: '*',
      Condition: { ArnEquals: { 'aws:SourceArn': TOPIC } } }] };
  const cleaned = { ...goodPolicy, Statement: goodPolicy.Statement.slice(0, 2) };
  const getAttrs = q => `aws sqs get-queue-attributes --queue-url ${q.url} --attribute-names All`;
  const keyPolicy = `aws kms get-key-policy --key-id ${KEY_ID} --policy-name default`;
  const RUNBOOK = `# ShopKaro on-call — order fan-out (29 Nov, 10:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Raasta:  OrderPlaced → SNS order-events → email-queue (SSE-SQS) + invoice-queue (KMS key alias/invoice-queue)
Alarms:  aws cloudwatch describe-alarms --state-value ALARM
         (order-events-sns-failed · duplicate-invoices)
SNS:     aws sns list-subscriptions-by-topic --topic-arn ${TOPIC}
SQS:     ${getAttrs(INV)}
         ${getAttrs(DLQ)}
         aws sqs set-queue-attributes --queue-url <url> --attributes '{"Key":"Value"}'
KMS:     aws kms describe-key --key-id alias/invoice-queue
         ${keyPolicy}
         aws kms put-key-policy --key-id ${KEY_ID} --policy-name default --policy file://invoice-key-policy.json
         (invoice-key-policy.json = security team ki review hui policy)

Jaankari:
- invoice-queue par customer managed key zaroori hai (audit). Encryption hatana ya badalna mana hai.
- Invoice worker: ek invoice PDF ~45 s (kabhi ~55 s). MaxReceiveCount 3 ke baad message invoice-dlq mein.
- Standard queues: DLQ mein message apni PURANI enqueue time ke saath jaata hai.
- Prod topic/queue par test message mat bhejo — customer ko nakli email/invoice jaata hai.
`;

  AG.oncall.add({
    id: 'invoice-fanout', start: 10 * 60,
    INC: [
      { id: 'OrderEventsSnsFailed', sev: '🔴 SEV1', text: 'SNS order-events: NumberOfNotificationsFailed ~40/min. Order emails ja rahe hain, par invoices nahi ban rahe. Kal raat invoice key ki policy "saaf" hui thi.',
        fixed: snsAllowed,
        verify: /^aws cloudwatch describe-alarms\b|^aws kms get-key-policy\b/, verifyText: 'alarms ya key policy dobara dekho',
        hints: [`cat runbook.md, phir ${getAttrs(INV)} — KmsMasterKeyId kya hai? Email queue par kya hai?`,
          'SNS ko encrypted queue mein likhne ke liye us KMS key ki policy mein sns.amazonaws.com ko kms:GenerateDataKey* aur kms:Decrypt chahiye. Kal ki "safai" mein woh statement hat gaya. Encryption mat hatao — review hui policy wapas lagao.',
          `${keyPolicy}, phir aws kms put-key-policy --key-id ${KEY_ID} --policy-name default --policy file://invoice-key-policy.json, phir aws cloudwatch describe-alarms --alarm-names order-events-sns-failed`] },
      { id: 'DuplicateInvoices', sev: '🟠 SEV2', text: 'Invoices ban rahe hain — par ek hi order ke DO invoice. Customers ke emails aa rahe hain: "do baar GST invoice?"',
        fixed: a => attr(a, INV, 'VisibilityTimeout') >= 60,
        verify: /^aws cloudwatch describe-alarms\b|^aws sqs get-queue-attributes\b/, verifyText: 'alarms ya queue attributes dobara dekho',
        hints: [`${getAttrs(INV)} — VisibilityTimeout kitna hai? Runbook: ek invoice banane mein kitna time?`,
          'Receive ke baad message utni der chhupa rehta hai jitna VisibilityTimeout. Kaam 45 s ka aur timeout 30 s → delete se pehle message phir dikhta, doosra worker wahi invoice banata. Timeout kaam ke sabse lambe samay se kaafi upar rakho.',
          `aws sqs set-queue-attributes --queue-url ${INV.url} --attributes '{"VisibilityTimeout":"300"}', phir aws cloudwatch describe-alarms --alarm-names duplicate-invoices`] },
      { id: 'PoisonInvoicesVanish', sev: '🟠 SEV2', text: 'Worker logs: kuch invoices 3 baar fail hue (galat GSTIN) — par invoice-dlq khaali hai. Finance ko woh list chahiye.',
        fixed: a => attr(a, DLQ, 'MessageRetentionPeriod') > attr(a, INV, 'MessageRetentionPeriod'),
        verify: /^aws sqs get-queue-attributes\b(?=.*invoice-dlq)/, verifyText: 'invoice-dlq ke attributes dobara dekho',
        hints: [`${getAttrs(DLQ)} — MessageRetentionPeriod kitna hai? invoice-queue ka kitna hai?`,
          'Standard queue mein DLQ message ki PURANI enqueue time rakhta hai. Teesri koshish tak message minute bhar purana ho chuka — DLQ ki retention 300 s ho toh woh aate hi expire. DLQ ki retention source (4 din) se lambi rakho: 14 din (sabse zyada).',
          `aws sqs set-queue-attributes --queue-url ${DLQ.url} --attributes '{"MessageRetentionPeriod":"1209600"}', phir ${getAttrs(DLQ)}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const series = (key, namespace, metric, dims) => ({ key, seriesId: 'fanout-' + key, version: 1, period: 60, namespace, metric, unit: 'Count', dimensions: dims, points: [] });
      const alarm = (name, key, ns, metric, dims) => ({ name, alarmId: 'fanout-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: dims, Statistic: 'Sum', Threshold: 0, ComparisonOperator: 'GreaterThanThreshold',
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const topicDims = [{ Name: 'TopicName', Value: 'order-events' }], invDims = [{ Name: 'Service', Value: 'invoices' }];
      const queueRow = (q, id, attrs) => ({ name: q.name, url: q.url, arn: q.arn, queueId: id, messages: [], dedup: [], created: 1764300000000, revision: 1,
        attributes: { VisibilityTimeout: '30', ReceiveMessageWaitTimeSeconds: '20', MessageRetentionPeriod: '345600', DelaySeconds: '0', MaximumMessageSize: '262144', ...attrs },
        visibilityTimeout: Number(attrs.VisibilityTimeout || 30), isFifo: false });
      const sqsPolicy = q => JSON.stringify({ Version: '2012-10-17', Statement: [{ Sid: 'FromOrderEvents', Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' },
        Action: 'sqs:SendMessage', Resource: q.arn, Condition: { ArnEquals: { 'aws:SourceArn': TOPIC } } }] });
      const sub = (n, q) => ({ subscriptionArn: `${TOPIC}:${n}`, protocol: 'sqs', endpoint: q.arn, confirmed: true, attributes: { RawMessageDelivery: 'true' }, revision: 1 });
      const account = {
        region: R, now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        queues: [
          queueRow(EMAIL, 'fanout-email', { SqsManagedSseEnabled: 'true', Policy: sqsPolicy(EMAIL) }),
          queueRow(INV, 'fanout-invoice', { KmsMasterKeyId: 'alias/invoice-queue', KmsDataKeyReusePeriodSeconds: '300', Policy: sqsPolicy(INV),
            RedrivePolicy: JSON.stringify({ deadLetterTargetArn: DLQ.arn, maxReceiveCount: 3 }) }),
          queueRow(DLQ, 'fanout-dlq', { KmsMasterKeyId: 'alias/invoice-queue', KmsDataKeyReusePeriodSeconds: '300', MessageRetentionPeriod: '300', ReceiveMessageWaitTimeSeconds: '0' }),
        ],
        topics: [{ name: 'order-events', arn: TOPIC, topicId: 'fanout-topic', attributes: { MaximumMessageSize: '262144' }, dedup: [],
          subscriptions: [sub('5c2e8a1f-3d7b-4f96-b0a4-8e1c6d2f9a37', EMAIL), sub('a91d4f6e-2b8c-4e53-9f17-6c3a0e5d8b24', INV)] }],
        kmsKeys: [{ id: KEY_ID, arn: KEY_ARN, alias: 'invoice-queue', description: 'invoice-queue SSE (audit)', state: 'Enabled', manager: 'CUSTOMER', policy: cleaned }],
        kmsAliases: [{ name: 'alias/invoice-queue', arn: `arn:aws:kms:${R}:${A}:alias/invoice-queue`, keyId: KEY_ID }],
        capacityMetrics: [series('failed', 'AWS/SNS', 'NumberOfNotificationsFailed', topicDims), series('dup', 'ShopKaro/Invoices', 'DuplicateInvoices', invDims)],
        alarms: [alarm('order-events-sns-failed', 'failed', 'AWS/SNS', 'NumberOfNotificationsFailed', topicDims),
          alarm('duplicate-invoices', 'dup', 'ShopKaro/Invoices', 'DuplicateInvoices', invDims)],
        fanout: { poison: 0 },
      };
      const responses = [
        risky(/^aws sns publish\b/, 'prod topic par test publish — customer ko nakli order email aur invoice jaata.'),
        risky(/^aws sqs send-message(-batch)?\b/, 'prod queue mein test message — worker nakli invoice bana deta.'),
        risky(/^aws sqs (purge-queue|delete-queue)\b/, 'queue purge/delete — invoices (aur poison ka saboot) hamesha ke liye gaye.'),
        risky(/^aws kms (disable-key|schedule-key-deletion)\b/, 'invoice key band/delete — queue ke saare messages padhne layak nahi rehte.'),
        risky(/^aws sns unsubscribe\b/, 'subscription hatana — invoices ka raasta hi band.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms · aws sns list-subscriptions-by-topic · aws sqs get-queue-attributes / set-queue-attributes · aws kms describe-key / get-key-policy / put-key-policy. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, responses, placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK },
          'invoice-key-policy.json': { desc: 'Security team ki review hui key policy', content: JSON.stringify(goodPolicy, null, 2) } },
        goal: 'Subah 10:00, order fan-out ka pager. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b>. Har alert pichhle fix ke baad aata hai. Runbook todne wale commands simulator rok dega.',
        successText: 'Key policy mein <b>SNS service principal</b> wapas (encryption bacha), <b>VisibilityTimeout</b> kaam ke samay se upar, aur DLQ ki retention source se lambi. Kal subah: outage ke dauraan jo invoices fail hue unhe SNS ne dobara nahi bheja (KMS ka mana = client-side error) — order DB se milaan karke dobara banao.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', `aws sns list-subscriptions-by-topic --topic-arn ${TOPIC}`, getAttrs(INV),
          keyPolicy, `aws kms put-key-policy --key-id ${KEY_ID} --policy-name default --policy file://invoice-key-policy.json`,
          'aws cloudwatch describe-alarms --alarm-names order-events-sns-failed',
          getAttrs(INV), `aws sqs set-queue-attributes --queue-url ${INV.url} --attributes '{"VisibilityTimeout":"300"}'`,
          'aws cloudwatch describe-alarms --alarm-names duplicate-invoices',
          getAttrs(DLQ), `aws sqs set-queue-attributes --queue-url ${DLQ.url} --attributes '{"MessageRetentionPeriod":"1209600"}'`, getAttrs(DLQ)],
      };
    },
  });

  AG.addLab('sqssns', {
    type: 'oncall', id: 'oncall-invoice-fanout', shift: 'invoice-fanout', title: '📟 On-call: invoices nahi ban rahe',
    intro: 'Subah 10:00. Order emails ja rahe hain, invoices nahi. <b>Dekho → theek karo → pakka karo</b> — key policy, visibility aur DLQ. Har command = 1 minute.',
  });
})();
