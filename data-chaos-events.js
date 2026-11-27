/* AWS Gurukul — refund events ki delivery.
   ShopKaro ke refund rule ka delivery review ek jagah fail hua.
   describe → Default bus, State ENABLED. Pattern refund-pattern.json se mile: shop.orders, RefundRequested, amount > 1000 INR, customer- prefix, test environment bahar aur debugToken gayab.
   targets → audit → refund-audit aur fraud → fraud-check. Dono par MaximumRetryAttempts 3, MaximumEventAgeInSeconds 3600 aur DeadLetterConfig delivery-dlq.
   permissions → refund-audit policy sirf events.amazonaws.com ko refund-orders rule ke SourceArn se sqs:SendMessage de.
   rule-off → State DISABLED
   wrong-type → detail-type RefundRequest
   no-retry → fraud.MaximumRetryAttempts 0
   no-dlq → fraud.DeadLetterConfig gayab
   audit-permission → aws:SourceArn refund-orders-old
*/
(function () {
  const mission = AG.findLevel('events').stages.find(s => s.type === 'terminal');
  const files = Object.fromEntries(['refund-pattern.json', 'targets.json', 'refund-audit-attributes.json', 'delivery-dlq-attributes.json'].map(k => [k, mission.files[k]]));
  const doc = name => JSON.parse(files[name].content);
  const account = JSON.parse(JSON.stringify(mission.account));
  const arn = 'arn:aws:events:ap-south-1:123456789012:rule/refund-orders';
  // Lesson ke pehle paanch CLI commands se bana hua rule aur delivery permissions.
  account.workflowSeq = 1;
  account.eventRules = [{ name: 'refund-orders', bus: 'default', arn, ruleId: 'rule-000001', revision: 2,
    state: 'ENABLED', description: '', pattern: doc('refund-pattern.json'), targets: doc('targets.json') }];
  for (const q of account.queues) {
    q.attributes.Policy = doc(q.name + '-attributes.json').Policy;
    q.policy = JSON.parse(q.attributes.Policy);
  }
  account.lambdas.find(f => f.name === 'fraud-check').policy = {"Version": "2012-10-17", "Statement": [{"Sid": "allow-refund-orders", "Effect": "Allow", "Principal": {"Service": "events.amazonaws.com"}, "Action": "lambda:InvokeFunction", "Resource": "arn:aws:lambda:ap-south-1:123456789012:function:fraud-check", "Condition": {"ArnLike": {"AWS:SourceArn": "arn:aws:events:ap-south-1:123456789012:rule/refund-orders"}}}]};
  const rule = a => a.eventRules.find(r => r.arn === arn);
  const audit = a => a.queues.find(q => q.name === 'refund-audit');
  const fraud = a => rule(a).targets.find(t => t.Id === 'fraud');
  // JSON object mein keys ka order permission ya pattern ka matlab nahi badalta.
  function same(x, y) {
    if (x === y) return true;
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object' || Array.isArray(x) !== Array.isArray(y)) return false;
    return Object.keys(x).length === Object.keys(y).length && Object.keys(y).every(k => same(x[k], y[k]));
  }
  const describe = "aws events describe-rule --name refund-orders";
  const targets = "aws events list-targets-by-rule --rule refund-orders";
  const permissions = "aws sqs get-queue-attributes --queue-url https://sqs.ap-south-1.amazonaws.com/123456789012/refund-audit --attribute-names Policy";
  const cards = [
    { id: "rule-off", title: "Refund rule band hai",
      break: a => { rule(a).state = 'DISABLED'; },
      probe: describe, clue: "Rule ka pattern theek ho sakta hai, par processing ke liye State ENABLED chahiye.",
      repair: ["aws events enable-rule --name refund-orders"],
      why: "<b>ENABLED</b> rule hi matching refund events ko targets tak bhejta hai." },
    { id: "wrong-type", title: "Refund event ka naam badal gaya",
      break: a => { rule(a).pattern['detail-type'] = ['RefundRequest']; },
      probe: describe, clue: "Publisher RefundRequested bhejta hai. Pattern mein detail-type ka poora naam milao.",
      repair: ["aws events put-rule --name refund-orders --event-pattern file://refund-pattern.json --state ENABLED"],
      why: "<b>detail-type</b> ka exact match chahiye. Galat naam se sahi refund event bhi miss hota hai." },
    { id: "no-retry", title: "Fraud target ka retry budget zero hai",
      break: a => { fraud(a).RetryPolicy.MaximumRetryAttempts = 0; },
      probe: targets, clue: "Retry ke laayak delivery failure par fraud target ko teen retries milni chahiye.",
      repair: ["aws events put-targets --rule refund-orders --targets file://targets.json"],
      why: "<b>MaximumRetryAttempts</b> temporary delivery failures ka retry budget hai. Event ki maximum age bhi limit lagati hai." },
    { id: "no-dlq", title: "Fraud target se failure queue hat gayi",
      break: a => { delete fraud(a).DeadLetterConfig; },
      probe: targets, clue: "Fraud target ki failed deliveries ke liye reviewed delivery-dlq ka ARN dekho.",
      repair: ["aws events put-targets --rule refund-orders --targets file://targets.json"],
      why: "<b>DeadLetterConfig</b> delivery failure ka record SQS mein bhejne ka raasta deta hai. Queue policy ko bhi allow karna hota hai." },
    { id: "audit-permission", title: "Audit queue ki policy purane rule ko allow karti hai",
      break: a => { const q = audit(a); q.policy.Statement[0].Condition.ArnEquals['aws:SourceArn'] = arn + '-old'; q.attributes.Policy = JSON.stringify(q.policy); },
      probe: permissions, clue: "Queue permission mein events service aur isi refund-orders rule ka ARN chahiye.",
      repair: ["aws sqs set-queue-attributes --queue-url https://sqs.ap-south-1.amazonaws.com/123456789012/refund-audit --attributes file://refund-audit-attributes.json"],
      why: "<b>Queue policy</b> EventBridge ko message likhne ki permission deti hai. Target register karna akela kaafi nahi hai." },
  ];
  function healthy(a) {
    const r = rule(a), expected = doc('targets.json');
    return r?.state === 'ENABLED' && same(r.pattern, doc('refund-pattern.json'))
      && r.targets.length === expected.length && expected.every(t => r.targets.some(actual => same(actual, t)))
      && same(audit(a)?.policy, JSON.parse(doc('refund-audit-attributes.json').Policy));
  }
  AG.chaos.addDeck({
    id: "events", title: "refund events ki delivery", account,
    files: files,
    alert: "ShopKaro ke refund rule ka delivery review ek jagah fail hua. Shuru karo <code>cat runbook.md</code> se.",
    runbook: `# refund events ki delivery
Har jawab ko sahi haal se milao.

1. Default bus, State ENABLED. Pattern refund-pattern.json se mile: shop.orders, RefundRequested, amount > 1000 INR, customer- prefix, test environment bahar aur debugToken gayab.
   ${describe}
2. audit → refund-audit aur fraud → fraud-check. Dono par MaximumRetryAttempts 3, MaximumEventAgeInSeconds 3600 aur DeadLetterConfig delivery-dlq.
   ${targets}
3. refund-audit policy sirf events.amazonaws.com ko refund-orders rule ke SourceArn se sqs:SendMessage de.
   ${permissions}

Sirf EK cheez galat hai. Usi ko theek karo, phir dobara jaancho.
Review hui files: refund-pattern.json, targets.json, refund-audit-attributes.json aur delivery-dlq-attributes.json.`,
    cards: cards.map(c => ({
      id: c.id, title: c.title, break: c.break, fixed: healthy,
      verify: new RegExp('^' + c.probe.split(' ').slice(0, 3).join('\\s+') + '\\b'),
      verifyText: c.probe,
      hints: ['Runbook ke sab probe chalao. Kaunsa jawab sahi haal se alag hai?', c.clue, c.repair.join(' phir ')],
      solution: ['cat runbook.md', c.probe, ...c.repair, c.probe], why: c.why,
    })),
  });
  AG.addLab("events", {
    type: "chaos", id: "chaos-events", deck: "events", title: "🎲 Chaos round: refund events ki delivery",
    intro: "Rule, target aur queue ke jawab milao. Refund event kahan ruk sakta hai?",
  });
})();
