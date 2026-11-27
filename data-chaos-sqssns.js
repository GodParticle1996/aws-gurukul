/* 🎲 Chaos deck 'sqssns' — Intermediate level sqssns. Engine: chaos.js. SNS → SQS delivery awscli.js ka asli model
   (filter, queue policy, raw delivery, DelaySeconds); account ka shape asli commands se banaya (scratchpad build-account.cjs).
   Swasth base: topic order-events → email-queue (sab events) aur invoice-queue (sirf OrderPlaced, raw body).
   invoice-queue: policy sirf order-events se SendMessage, RedrivePolicy maxReceiveCount 5 → invoice-dlq, delay 0.
   Probe (base par): publish → email delivered, invoice delivered · receive invoice → raw OrderPlaced JSON · attributes sahi.
   Har card EK badlaav (simulator par chala ke dekha, 2026-11-27):
     filter-typo      publish → invoice-queue filtered (policy "OrderPlace")
     policy-old-topic publish → invoice-queue denied-policy (SourceArn order-events-v1)
     raw-off          receive → SNS envelope JSON (Type, MessageId, Message …), raw body nahi
     redrive-one      get-queue-attributes → maxReceiveCount 1
     delay-900        publish delivered, par receive khaali (DelaySeconds 900) */
(function () {
  const R = 'ap-south-1', A = '123456789012', T = `arn:aws:sns:${R}:${A}:order-events`;
  const arn = n => `arn:aws:sqs:${R}:${A}:${n}`, url = n => `https://sqs.${R}.amazonaws.com/${A}/${n}`;
  const SUB_E = T + ':subscription-000005', SUB_I = T + ':subscription-000006';
  const policyDoc = (q, src) => ({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' }, Action: 'sqs:SendMessage',
    Resource: arn(q), Condition: { ArnEquals: { 'aws:SourceArn': src } } }] });
  const FILTER = JSON.stringify({ type: ['OrderPlaced'] });
  const REDRIVE = n => JSON.stringify({ deadLetterTargetArn: arn('invoice-dlq'), maxReceiveCount: String(n) });
  const queue = (name, id, extra, pol) => ({ name, url: url(name), arn: arn(name), queueId: id, messages: [], dedup: [], created: 1795755600000, revision: 2,
    attributes: { VisibilityTimeout: '120', ReceiveMessageWaitTimeSeconds: '20', MessageRetentionPeriod: '345600', DelaySeconds: '0', MaximumMessageSize: '1048576',
      ...(pol ? { Policy: JSON.stringify(pol) } : {}), ...extra }, visibilityTimeout: 120, isFifo: false, ...(pol ? { policy: pol } : {}) });
  const q = (a, name) => a.queues.find(x => x.name === name);
  const sub = a => a.topics[0].subscriptions.find(s => s.subscriptionArn === SUB_I);
  const allowsTopic = a => JSON.stringify(q(a, 'invoice-queue').policy) === JSON.stringify(policyDoc('invoice-queue', T));
  const attrs = a => q(a, 'invoice-queue').attributes;
  const H1 = 'Runbook ke teeno probe chalao: publish (delivery observation lines padho), invoice-queue se receive, aur invoice-queue ke attributes. Kaunsa jawab alag hai?';
  const publish = `aws sns publish --topic-arn ${T} --message file://order.json`;
  const receive = `aws sqs receive-message --queue-url ${url('invoice-queue')} --max-number-of-messages 1 --wait-time-seconds 20`;
  const getAttrs = `aws sqs get-queue-attributes --queue-url ${url('invoice-queue')} --attribute-names All`;
  const getSub = `aws sns get-subscription-attributes --subscription-arn ${SUB_I}`;

  AG.chaos.addDeck({
    id: 'sqssns', title: 'Order events deck',
    account: {
      region: R, callerIdentity: { Account: A, UserId: 'AIDASHOPKAROOPS', Arn: `arn:aws:iam::${A}:user/ops` }, now: '2026-11-27T05:00:00Z', messagingSeq: 6,
      queues: [queue('invoice-dlq', 'queue-000001', { MessageRetentionPeriod: '1209600', VisibilityTimeout: '30', ReceiveMessageWaitTimeSeconds: '0' }),
        queue('email-queue', 'queue-000002', {}, policyDoc('email-queue', T)),
        queue('invoice-queue', 'queue-000003', { RedrivePolicy: REDRIVE(5) }, policyDoc('invoice-queue', T))],
      topics: [{ name: 'order-events', arn: T, topicId: 'topic-000004', attributes: { MaximumMessageSize: '262144' }, dedup: [], subscriptions: [
        { subscriptionArn: SUB_E, protocol: 'sqs', endpoint: arn('email-queue'), confirmed: true, revision: 1, attributes: { RawMessageDelivery: 'true', FilterPolicyScope: 'MessageAttributes' } },
        { subscriptionArn: SUB_I, protocol: 'sqs', endpoint: arn('invoice-queue'), confirmed: true, revision: 1, attributes: { RawMessageDelivery: 'true', FilterPolicyScope: 'MessageBody', FilterPolicy: FILTER } }] }],
    },
    files: {
      'order.json': { desc: 'Test order event', content: JSON.stringify({ type: 'OrderPlaced', eventId: 'evt-chaos-1', orderId: 'order-2201', total: 799 }, null, 2) },
      'invoice-queue-policy.json': { desc: 'Review kiya invoice-queue policy', content: JSON.stringify({ Policy: JSON.stringify(policyDoc('invoice-queue', T)) }, null, 2) },
      'invoice-redrive.json': { desc: 'Review kiya redrive (5 koshish)', content: JSON.stringify({ RedrivePolicy: REDRIVE(5) }, null, 2) },
    },
    alert: '<b>📟 11:20 — ShopKaro.</b> Kal raat messaging ki settings ek naye template se lagi. Aaj kuch customers ko invoice nahi mila. <b>Ek</b> setting galat hai. Shuru: <code>cat runbook.md</code>.',
    placeholder: 'cat runbook.md   (phir: aws sns publish …)',
    runbook: `# ShopKaro order events — "naye template ke baad"
1. Bhejo aur dekho:  ${publish}
                     → har queue ki "delivery observation" line: email-queue aur invoice-queue dono "delivered"
2. Invoice worker ki nazar:
                     ${receive}
                     → Body seedha order JSON ho (raw), SNS ka envelope nahi
3. Invoice queue:    ${getAttrs}
                     → RedrivePolicy maxReceiveCount 5, DelaySeconds 0, Policy ka SourceArn = order-events
Settings: ${getSub}
Badlaav:  aws sns set-subscription-attributes --subscription-arn <ARN> --attribute-name FilterPolicy|RawMessageDelivery --attribute-value ...
          aws sqs set-queue-attributes --queue-url <URL> --attributes file://... ya '{"DelaySeconds":"0"}'
Niyam:    ek baar mein EK badlaav, phir probe dobara.`,
    cards: [
      { id: 'filter-typo', title: 'Invoice subscription ke filter mein OrderPlaced ki jagah OrderPlace',
        break: a => { sub(a).attributes.FilterPolicy = JSON.stringify({ type: ['OrderPlace'] }); },
        fixed: a => sub(a).attributes.FilterPolicy === FILTER,
        verify: /^aws sns publish\b|^aws sqs receive-message\b/, verifyText: 'dobara publish ya receive karo',
        hints: [H1, 'Publish ki line kehti hai invoice-queue "filtered". Subscription ka FilterPolicy padho — order ka type usse match karta hai?',
          `aws sns set-subscription-attributes --subscription-arn ${SUB_I} --attribute-name FilterPolicy --attribute-value '${FILTER}', phir ${publish}`],
        solution: ['cat runbook.md', publish, getSub, `aws sns set-subscription-attributes --subscription-arn ${SUB_I} --attribute-name FilterPolicy --attribute-value '${FILTER}'`, publish],
        why: 'Publish safal tha, par invoice subscription ka <b>filter</b> "OrderPlace" maangta tha — "OrderPlaced" match hi nahi hua, toh <b>filtered</b>. MessageId milna delivery ka saboot nahi; delivery line padho.' },
      { id: 'policy-old-topic', title: 'Invoice queue ki policy purane topic (order-events-v1) ko allow karti hai',
        break: a => { const x = q(a, 'invoice-queue'); x.policy = policyDoc('invoice-queue', T + '-v1'); x.attributes.Policy = JSON.stringify(x.policy); },
        fixed: allowsTopic,
        verify: /^aws sns publish\b|^aws sqs receive-message\b/, verifyText: 'dobara publish ya receive karo',
        hints: [H1, 'Delivery line: invoice-queue "denied-policy". Queue ki Policy mein aws:SourceArn kaunse topic ka hai?',
          `aws sqs set-queue-attributes --queue-url ${url('invoice-queue')} --attributes file://invoice-queue-policy.json, phir ${publish}`],
        solution: ['cat runbook.md', publish, getAttrs, `aws sqs set-queue-attributes --queue-url ${url('invoice-queue')} --attributes file://invoice-queue-policy.json`, publish],
        why: 'Queue policy sirf <b>order-events-v1</b> (purana topic) ko SendMessage deti thi — naye topic ki delivery <b>denied</b>. SourceArn sahi topic ka rakho; Principal * se kholna har kisi ko likhne deta.' },
      { id: 'raw-off', title: 'Invoice subscription par RawMessageDelivery band ho gaya',
        break: a => { sub(a).attributes.RawMessageDelivery = 'false'; },
        fixed: a => sub(a).attributes.RawMessageDelivery === 'true',
        verify: /^aws sqs receive-message\b/, verifyText: 'invoice-queue se dobara receive karo',
        hints: [H1, 'Delivery "delivered", par worker ko Body mein Type, TopicArn, Message wala JSON mila — order seedha nahi. Subscription ki kaunsi setting body ko lapet-ti hai?',
          `aws sns set-subscription-attributes --subscription-arn ${SUB_I} --attribute-name RawMessageDelivery --attribute-value true, phir publish aur receive`],
        solution: ['cat runbook.md', publish, receive, getSub, `aws sns set-subscription-attributes --subscription-arn ${SUB_I} --attribute-name RawMessageDelivery --attribute-value true`, publish, receive],
        why: 'Bina <b>RawMessageDelivery</b> ke SNS body ko apne <b>envelope</b> (Type, MessageId, Message…) mein lapet-ta hai. Worker raw order JSON maangta tha, toh parse fail. Raw on karo, worker mein jugaad nahi.' },
      { id: 'redrive-one', title: 'Invoice queue ka maxReceiveCount 5 se 1 ho gaya',
        break: a => { attrs(a).RedrivePolicy = REDRIVE(1); },
        fixed: a => Number(JSON.parse(attrs(a).RedrivePolicy || '{}').maxReceiveCount) >= 5,
        verify: /^aws sqs get-queue-attributes\b/, verifyText: 'invoice-queue ke attributes dobara dekho',
        hints: [H1, 'Delivery aur body dono theek. Attributes mein RedrivePolicy dekho — ek chhoti si galti par message kitni jaldi DLQ jaayega?',
          `aws sqs set-queue-attributes --queue-url ${url('invoice-queue')} --attributes file://invoice-redrive.json, phir ${getAttrs}`],
        solution: ['cat runbook.md', publish, receive, getAttrs, `aws sqs set-queue-attributes --queue-url ${url('invoice-queue')} --attributes file://invoice-redrive.json`, getAttrs],
        why: '<b>maxReceiveCount 1</b> = pehli hi nakaam koshish par DLQ — thode der ke glitch mein achhe invoices bhi chale jaate. Receive budget (yahan 5) se retry ka mauka milta hai.' },
      { id: 'delay-900', title: 'Invoice queue par DelaySeconds 0 se 900 ho gaya',
        break: a => { attrs(a).DelaySeconds = '900'; },
        fixed: a => attrs(a).DelaySeconds === '0',
        verify: /^aws sqs receive-message\b/, verifyText: 'publish karke invoice-queue se dobara receive karo',
        hints: [H1, 'Delivery line "delivered", phir bhi receive khaali. Message queue mein hai par dikhta nahi — attributes mein kaunsi setting pehli delivery taalti hai?',
          `aws sqs set-queue-attributes --queue-url ${url('invoice-queue')} --attributes '{"DelaySeconds":"0"}', phir publish aur receive`],
        solution: ['cat runbook.md', publish, receive, getAttrs, `aws sqs set-queue-attributes --queue-url ${url('invoice-queue')} --attributes '{"DelaySeconds":"0"}'`, publish, receive],
        why: '<b>DelaySeconds 900</b> har naye message ko 15 minute chhupa deta hai — delivery hui, par worker ko dikha hi nahi. Delay 0 karo; pehle aaye messages apna 15 minute poora karke aayenge.' },
    ],
  });

  AG.addLab('sqssns', {
    type: 'chaos', id: 'chaos-sqssns', deck: 'sqssns', title: '🎲 Chaos round: messaging ka naya template',
    intro: 'Teen probe, ek galat setting. Delivery ki line, worker ki body aur queue ke attributes padho — <b>EK badlaav</b> se theek karo.',
  });
})();
