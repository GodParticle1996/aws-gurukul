/* 📟 On-call shift 'mahasale' — boss2 (Intermediate boss). Engine: oncall.js. Terminal: awscli.js ka asli simulator.
   ShopKaro ki Mahasale raat, 20:00 se. Chaar JUDE hue alerts:
     1 ShopAlbNoHealthyHosts  15:30 ke SG cleanup mein 0.0.0.0/0:8080 hata, par ALB ke SG wala rule juda hi nahi → targets Timeout
     2 ShopWebCpuHigh         targets theek → poora sale traffic → ASG max 4 par atka (7 chahiye)
     3 OrderWorkerThrottles   7 web instances → 900 orders/min → 30 workers chahiye, reserved concurrency 20 → Throttles
     4 OrderDlqNotEmpty       throttle hue messages maxReceiveCount 1 ki wajah se seedha DLQ mein (AWS: Lambda + SQS ke saath ≥ 5)
   Model ke niyam (runbook mein bhi): 1,800 req/s · c6i.large 430 req/s par 100% CPU · target tracking CPU 60% →
   ceil(1800 / (430 × 0.6)) = 7 instances. Achhe instance 300 req/s (70%) tak poore orders. Orders: 900/min jab sab chale.
   Worker: ek invocation = 10 orders, ~20 s → ek concurrency slot = 30 orders/min. DB budget: 50 connections.
   Har alarm har minute naye CloudWatch point se AG.capacityAlarmSnapshot (capacity-cli.js) se nikalta hai. */
(function () {
  const R = 'ap-south-1', A = '123456789012';
  const ALB_ARN = `arn:aws:elasticloadbalancing:${R}:${A}:loadbalancer/app/shop-web/5f1c0a9e2b7d4c31`;
  const TG_ARN = `arn:aws:elasticloadbalancing:${R}:${A}:targetgroup/shop-web/8a2e4c6b1d3f5a70`;
  const SG_ALB = 'sg-51ab7c20', SG_APP = 'sg-6e3d9f14', ASG = 'shop-web', FN = 'order-worker', VPC = 'vpc-2f8e1a64';
  const Q = n => ({ name: n, arn: `arn:aws:sqs:${R}:${A}:${n}`, url: `https://sqs.${R}.amazonaws.com/${A}/${n}` });
  const SRC = Q('order-events'), DLQ = Q('order-events-dlq');
  const ESM = '7d1f3c2a-5b4e-4a9d-8c61-2e0f9b3a4d57';
  const RPS = 1800, PER_100 = 430, TARGET = 0.6, GOOD_RPS = 300, ORDERS = 900, PER_SLOT = 30, DB_BUDGET = 50;
  const NEED = Math.ceil(RPS / (PER_100 * TARGET));            // 7
  const T0 = Date.parse('2026-11-26T14:30:00Z');                // 20:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');

  /* ---------- account ki chhoti madad ---------- */
  const asg = a => a.asgs.find(g => g.name === ASG);
  const tg = a => a.targetGroups.find(t => t.arn === TG_ARN);
  const fn = a => a.lambdas.find(f => f.name === FN);
  const esm = a => a.eventSourceMappings.find(m => m.uuid === ESM);
  const queue = (a, q) => a.queues.find(x => x.arn === q.arn);
  const redrive = a => { try { return JSON.parse(queue(a, SRC).attributes.RedrivePolicy || '{}'); } catch (e) { return {}; } };
  const healthy = a => { const g = tg(a); return (g.targets || []).filter(t => AG.targetHealth(a, g, t).State === 'healthy').length; };

  /* ---------- ek minute ka hisaab (sirf padhta hai) ---------- */
  function model(a) {
    const h = healthy(a);
    const cpu = h ? Math.min(100, Math.round(RPS / (h * PER_100) * 1000) / 10) : 2;
    const orders = h ? Math.round(ORDERS * Math.min(1, h * GOOD_RPS / RPS)) : 0;
    const demand = Math.ceil(orders / PER_SLOT);
    const f = fn(a), m = esm(a);
    const reserved = f.reservedConcurrency == null ? Infinity : f.reservedConcurrency;
    const esmMax = (m.scalingConfig && m.scalingConfig.MaximumConcurrency) || Infinity;
    const cap = Math.min(reserved, esmMax);                     // ek saath kitne workers chal sakte hain
    const tryRun = Math.min(demand, esmMax);                    // ESM kitne chalane ki koshish karta hai
    const throttledSlots = Math.max(0, tryRun - reserved);      // reserved se upar = Throttles
    return { h, cpu, orders, demand, reserved, esmMax, cap, running: Math.min(demand, cap), throttledSlots,
      throttles: throttledSlots * 3, p95: h ? (cpu >= 100 ? 2.6 : 0.18) : null };
  }

  /* ---------- har minute: scaling, queues, CloudWatch points ---------- */
  function reconcile(a, sim, clock) {
    const s = a.sale, g = asg(a);
    a.now = iso(T0 + clock * 60000);
    // target tracking (CPU 60%): traffic aane par desired = 7, par max se upar nahi. Scale-in is raat nahi.
    if (healthy(a) > 0) {
      const want = Math.min(g.max, Math.max(g.min, NEED));
      if (want > g.desired) {
        const from = g.desired; g.desired = want;
        g.activities = g.activities || [];
        g.activities.unshift({ id: `5e0b9c1d-2a7f-4c3e-9b18-${String(clock).padStart(12, '0')}`, status: 'Successful',
          description: `Launching ${want - from} new EC2 instance(s)`,
          cause: `At ${a.now} a monitor alarm TargetTracking-shop-web-AlarmHigh in state ALARM triggered policy shop-web-cpu60 changing the desired capacity from ${from} to ${want}.` });
      }
    }
    const subs = g.vpcZone.split(',');
    while (g.instances.length < g.desired) {                    // naya instance: launch template se, TG mein register
      s.seq++;
      const sub = a.subnets.find(x => x.id === subs[s.seq % subs.length]);
      const id = 'i-07c41e2a90b3d5' + s.seq.toString(16).padStart(2, '0');   // string se: itna bada hex number JS mein sahi nahi bachta
      a.instances.push({ id, name: 'shop-web', type: 'c6i.large', state: 'running', appHealthy: true, healthPath: '/healthz', appPort: 8080,
        vpcId: VPC, subnetId: sub.id, az: sub.az, sgIds: [SG_APP], privateIp: `10.20.${sub.az.endsWith('a') ? 11 : sub.az.endsWith('b') ? 12 : 13}.${40 + s.seq}`, publicIp: null });
      g.instances.push(id);
      tg(a).targets.push({ id, port: 8080 });
    }
    const m = model(a);
    if (clock > 0) {                                            // is minute ke orders
      const done = m.running * PER_SLOT, rejected = m.throttledSlots * PER_SLOT;
      if (rejected) { if (Number(redrive(a).maxReceiveCount || 1) < 5) s.dlq += rejected; else s.backlog += rejected; }
      s.backlog = Math.max(0, s.backlog - Math.max(0, m.cap === Infinity ? s.backlog : (m.cap * PER_SLOT - done)));
      s.ordersDone += done;
      if (s.moving) { s.backlog += s.moving.count; s.moving.moved = s.moving.count; s.moving.status = 'COMPLETED'; s.moving = null; }
    }
    const values = { hosts: m.h, cpu: m.cpu, throttles: m.throttles, dlq: s.dlq };
    a.capacityMetrics.forEach(series => { series.points.push(AG.oncall.point(a.now, values[series.key])); if (series.points.length > 40) series.points.shift(); });
    s.last = m;
  }

  /* ---------- SQS views (asli AWS CLI ke format mein); alarms AG.oncall.alarmsResponse se ---------- */
  const json = v => JSON.stringify(v, null, 4);
  const flagOf = (norm, name) => { const m = norm.match(new RegExp('--' + name + '\\s+(\\S+)')); return m ? m[1] : null; };

  AG.oncall.add({
    id: 'mahasale', start: 20 * 60,
    INC: [
      { id: 'ShopAlbNoHealthyHosts', sev: '🔴 SEV1', text: 'shop-web ALB: HealthyHostCount 0 — checkout par 503. Mahasale 20:00 se live hai.',
        fixed: a => { const g = tg(a); return g.targets.length >= 2 && healthy(a) === g.targets.length; },
        verify: /^aws elbv2 describe-target-health\b/, verifyText: 'targets dobara dekho (aws elbv2 describe-target-health)',
        hints: [`aws elbv2 describe-target-health --target-group-arn ${TG_ARN} — Reason kya hai? Target.Timeout = health check instance tak pahunch hi nahi raha.`,
          'Raasta kaun rokta hai? aws ec2 describe-security-groups --group-ids sg-6e3d9f14 — aur cat sg-change-1530.txt: aaj dopahar kya hata, kya judna tha?',
          'aws ec2 authorize-security-group-ingress --group-id sg-6e3d9f14 --protocol tcp --port 8080 --source-group sg-51ab7c20 (0.0.0.0/0 NAHI), phir describe-target-health'] },
      { id: 'ShopWebCpuHigh', sev: '🟠 SEV2', text: 'shop-web CPU 100%, p95 2.6 s — Mahasale ka poora traffic aa gaya, par ASG badh nahi raha.',
        fixed: a => asg(a).max >= NEED && healthy(a) >= NEED,
        verify: /^aws autoscaling describe-auto-scaling-groups\b|^aws cloudwatch describe-alarms\b/, verifyText: 'ASG ya alarms dobara dekho',
        hints: ['aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shop-web — DesiredCapacity aur MaxSize kitne hain?',
          'Runbook: 1,800 req/s ÷ (430 × 60%) ≈ 7 instances chahiye; ASG max 4 par ruka hai. Ek AZ jaaye toh bhi bachna hai, isliye max mein jagah chhodo.',
          'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shop-web --max-size 12, phir aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shop-web'] },
      { id: 'OrderWorkerThrottles', sev: '🟠 SEV2', text: 'order-worker Lambda: har minute Throttles — orders ki confirmation late ho rahi hai.',
        fixed: a => { const m = model(a); return m.throttles === 0 && m.cap >= m.demand; },
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'alarms dobara dekho (aws cloudwatch describe-alarms)',
        hints: ['aws cloudwatch describe-alarms --state-value ALARM, phir aws lambda get-function --function-name order-worker — Concurrency mein kya likha hai?',
          'Runbook: 900 orders/min ÷ 30 orders har worker-minute = 30 workers chahiye, reserved concurrency 20 hai. Orders DB ka budget 50 tak.',
          'aws lambda put-function-concurrency --function-name order-worker --reserved-concurrent-executions 40, phir aws cloudwatch describe-alarms --alarm-names order-worker-throttles'] },
      { id: 'OrderDlqNotEmpty', sev: '🔴 SEV1', text: 'order-events-dlq mein orders jama ho gaye — yeh customers ke PAID orders hain.',
        fixed: a => Number(redrive(a).maxReceiveCount) >= 5 && a.sale.dlq === 0,
        verify: /^aws sqs (get-queue-attributes|list-message-move-tasks)\b/, verifyText: 'DLQ ki ginti dobara dekho (aws sqs get-queue-attributes)',
        hints: [`aws sqs get-queue-attributes --queue-url ${SRC.url} --attribute-names RedrivePolicy — maxReceiveCount kitna hai? Throttle hua message bhi ek "receive" ginta hai.`,
          'Do kaam: (1) source queue par maxReceiveCount kam se kam 5 (cat redrive-policy.json). (2) DLQ ke orders wapas source queue mein bhejo — purge NAHI.',
          `aws sqs set-queue-attributes --queue-url ${SRC.url} --attributes file://redrive-policy.json, phir aws sqs start-message-move-task --source-arn ${DLQ.arn}, phir aws sqs get-queue-attributes --queue-url ${DLQ.url} --attribute-names ApproximateNumberOfMessages`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const subnets = ['a', 'b', 'c'].map((z, i) => ({ id: ['subnet-04c1e7f3e8b1a2d90', 'subnet-09a72c5e1f3b8d461', 'subnet-02d5b9e7a1c4f6382'][i], vpcId: VPC, cidr: `10.20.${11 + i}.0/24`, az: R + z, name: 'shop-private-' + z, public: false }));
      const instances = [0, 1, 2, 3].map(i => ({ id: 'i-03a9d6e1f2c4b7' + String(i).padStart(2, '0'), name: 'shop-web', type: 'c6i.large', state: 'running', appHealthy: true,
        healthPath: '/healthz', appPort: 8080, vpcId: VPC, subnetId: subnets[i % 3].id, az: subnets[i % 3].az, sgIds: [SG_APP], privateIp: `10.20.${11 + i % 3}.${21 + i}`, publicIp: null }));
      const dims = { hosts: [{ Name: 'TargetGroup', Value: 'targetgroup/shop-web/8a2e4c6b1d3f5a70' }, { Name: 'LoadBalancer', Value: 'app/shop-web/5f1c0a9e2b7d4c31' }],
        cpu: [{ Name: 'AutoScalingGroupName', Value: ASG }], throttles: [{ Name: 'FunctionName', Value: FN }], dlq: [{ Name: 'QueueName', Value: DLQ.name }] };
      const series = (key, namespace, metric, unit) => ({ key, seriesId: 'mahasale-' + key, version: 1, period: 60, namespace, metric, unit, dimensions: dims[key], points: [] });
      const alarm = (name, key, namespace, metric, stat, op, threshold) => ({ name, alarmId: 'mahasale-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: namespace, MetricName: metric, Dimensions: dims[key], Statistic: stat, Threshold: threshold,
          ComparisonOperator: op, Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const queueRow = (q, attrs) => ({ name: q.name, queueId: 'mahasale-' + q.name, revision: 0, arn: q.arn, url: q.url, isFifo: false,
        visibilityTimeout: Number(attrs.VisibilityTimeout), attributes: attrs, messages: [] });
      const account = {
        region: R, callerIdentity: { Account: A, UserId: 'AIDAONCALLSHOPKARO', Arn: `arn:aws:iam::${A}:user/oncall` },
        now: iso(T0), lambdaConcurrencyQuota: 1000,
        vpcs: [{ id: VPC, cidr: '10.20.0.0/16', name: 'shopkaro-prod' }], subnets, instances,
        securityGroups: [
          { id: SG_ALB, name: 'shop-alb', vpcId: VPC, ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' }], egress: [] },
          { id: SG_APP, name: 'shop-app', vpcId: VPC, ingress: [{ protocol: 'tcp', fromPort: 22, toPort: 22, sourceGroup: 'sg-0b3f81d2' }], egress: [] },
          { id: 'sg-0b3f81d2', name: 'shop-bastion', vpcId: VPC, ingress: [], egress: [] }],
        elbs: [{ id: ALB_ARN, arn: ALB_ARN, name: 'shop-web', type: 'application', scheme: 'internet-facing', sgIds: [SG_ALB],
          listeners: [{ Port: 443, Protocol: 'HTTPS', DefaultActions: [{ Type: 'forward', TargetGroupArn: TG_ARN }] }] }],
        targetGroups: [{ arn: TG_ARN, name: 'shop-web', vpcId: VPC, loadBalancerArn: ALB_ARN, targetType: 'instance', protocol: 'HTTP', port: 8080,
          healthCheckPath: '/healthz', validHealthPath: '/healthz', matcher: '200', sgAware: true, targets: instances.map(i => ({ id: i.id, port: 8080 })) }],
        asgs: [{ name: ASG, min: 2, max: 4, desired: 4, instances: instances.map(i => i.id), vpcZone: subnets.map(s => s.id).join(','),
          healthCheckType: 'ELB', gracePeriod: 180, warmup: 120, targetGroupARNs: [TG_ARN], activities: [],
          launchTemplate: { id: 'lt-0e5a1c9b7d3f24680', version: '7', type: 'c6i.large', healthPath: '/healthz', appPort: 8080, sgIds: [SG_APP] } }],
        roles: [{ name: 'order-worker-role', lambda: { trust: 'lambda.amazonaws.com', receiveQueues: [SRC.arn] } }],
        lambdas: [{ name: FN, runtime: 'python3.12', handler: 'app.handler', roleName: 'order-worker-role', memory: 1024, timeout: 60, state: 'Active', reservedConcurrency: 20 }],
        eventSourceMappings: [{ uuid: ESM, functionName: FN, eventSourceArn: SRC.arn, batchSize: 10, responseTypes: ['ReportBatchItemFailures'], state: 'Enabled', scalingConfig: {} }],
        queues: [
          queueRow(SRC, { VisibilityTimeout: '360', MessageRetentionPeriod: '345600', ReceiveMessageWaitTimeSeconds: '20', DelaySeconds: '0', MaximumMessageSize: '1048576',
            RedrivePolicy: JSON.stringify({ deadLetterTargetArn: DLQ.arn, maxReceiveCount: 1 }) }),
          queueRow(DLQ, { VisibilityTimeout: '30', MessageRetentionPeriod: '1209600', ReceiveMessageWaitTimeSeconds: '0', DelaySeconds: '0', MaximumMessageSize: '1048576' })],
        capacityMetrics: [series('hosts', 'AWS/ApplicationELB', 'HealthyHostCount', 'Count'), series('cpu', 'AWS/EC2', 'CPUUtilization', 'Percent'),
          series('throttles', 'AWS/Lambda', 'Throttles', 'Count'), series('dlq', 'AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'Count')],
        alarms: [alarm('shop-web-no-healthy-hosts', 'hosts', 'AWS/ApplicationELB', 'HealthyHostCount', 'Minimum', 'LessThanThreshold', 2),
          alarm('shop-web-cpu-high', 'cpu', 'AWS/EC2', 'CPUUtilization', 'Average', 'GreaterThanThreshold', 65),
          alarm('order-worker-throttles', 'throttles', 'AWS/Lambda', 'Throttles', 'Sum', 'GreaterThanThreshold', 0),
          alarm('order-events-dlq-not-empty', 'dlq', 'AWS/SQS', 'ApproximateNumberOfMessagesVisible', 'Maximum', 'GreaterThanThreshold', 0)],
        sale: { seq: 0, backlog: 0, dlq: 0, ordersDone: 0, moving: null, tasks: [], last: null },
      };
      const files = {
        'runbook.md': { desc: 'On-call runbook', content: `# ShopKaro on-call runbook — Mahasale (26 Nov, 20:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Alarms:         aws cloudwatch describe-alarms --state-value ALARM
ALB targets:    aws elbv2 describe-target-health --target-group-arn ${TG_ARN}
Security groups: aws ec2 describe-security-groups --group-ids ${SG_APP} ${SG_ALB}
Web ASG:        aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG}
                aws autoscaling describe-scaling-activities --auto-scaling-group-name ${ASG}
Order worker:   aws lambda get-function --function-name ${FN}
                aws lambda list-event-source-mappings --function-name ${FN}
Queues:         aws sqs get-queue-attributes --queue-url <URL> --attribute-names All
                order-events      ${SRC.url}
                order-events-dlq  ${DLQ.url}   (ARN ${DLQ.arn})
DLQ se wapas:   aws sqs start-message-move-task --source-arn <DLQ ARN>   (orders wapas source queue mein)

Hisaab aur niyam:
- Mahasale peak ~1,800 requests/s. Ek c6i.large ~430 req/s par 100% CPU. ASG target tracking: CPU 60%.
- order-worker: ek invocation = 10 orders, ~20 s. Orders DB: worker ke liye 50 connections tak — reserved concurrency 50 se upar MAT.
- DLQ mein customers ke PAID orders hain. purge-queue kabhi nahi.
- ${SG_APP} (shop-app) par 0.0.0.0/0 NAHI — aaj 15:30 security review ne hataya (cat sg-change-1530.txt).
` },
        'sg-change-1530.txt': { desc: 'Aaj dopahar ka SG change', content: `CHG-4411 · 26 Nov 15:30 · security review (Ritu)
shop-app (${SG_APP}): HATAYA   tcp 8080 ← 0.0.0.0/0   (app port internet par seedha khula tha)
Agla kadam: ALB ke SG (${SG_ALB}) se tcp 8080 ka rule jodna — "kal subah kar denge"
` },
        'redrive-policy.json': { desc: 'Platform team ka standard redrive (Lambda + SQS)', content: JSON.stringify({ RedrivePolicy: JSON.stringify({ deadLetterTargetArn: DLQ.arn, maxReceiveCount: '5' }) }, null, 2) },
      };
      const responses = [
        risky(/^aws ec2 authorize-security-group-ingress\b(?=.*sg-6e3d9f14)(?=.*0\.0\.0\.0\/0)/, 'shop-app par 0.0.0.0/0 — wahi rule jo aaj security review ne hataya. App port internet par khul jaata; sahi source ALB ka SG hai.'),
        risky(/^aws lambda delete-function-concurrency\b/, 'reserved concurrency hatana — limit hi khatam: worker 1000 tak ja sakta hai aur orders DB (50 connections) gir jaata.'),
        risky(/^aws lambda put-function-concurrency\b(?=.*--reserved-concurrent-executions\s+(?:5[1-9]|[6-9]\d|\d{3,})\b)/, 'reserved concurrency 50 se upar — orders DB ka budget 50 connections hai (runbook).'),
        risky(/^aws sqs purge-queue\b/, 'purge-queue — queue mein customers ke PAID orders hain; purge = orders hamesha ke liye gayab.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo (ls se files). aws cloudwatch describe-alarms · aws elbv2 describe-target-health · aws ec2 describe-security-groups / authorize-security-group-ingress · aws autoscaling describe-auto-scaling-groups / update-auto-scaling-group / describe-scaling-activities · aws lambda get-function / put-function-concurrency / list-event-source-mappings · aws sqs get-queue-attributes / set-queue-attributes / start-message-move-task / list-message-move-tasks. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
        { re: /^aws sqs get-queue-attributes\b/, out: (sim, mm) => {
          const norm = mm.input, a = sim.account, url = flagOf(norm, 'queue-url'), q = a.queues.find(x => x.url === url);
          if (!q) return 'An error occurred (AWS.SimpleQueueService.NonExistentQueue) when calling the GetQueueAttributes operation: The specified queue does not exist.';
          const s = a.sale, m = s.last || model(a), src = q.arn === SRC.arn;
          const all = { ...q.attributes, QueueArn: q.arn, ApproximateNumberOfMessages: String(src ? s.backlog : s.dlq),
            ApproximateNumberOfMessagesNotVisible: String(src ? m.running * 10 : 0), ApproximateNumberOfMessagesDelayed: '0',
            CreatedTimestamp: '1767225600', LastModifiedTimestamp: String(Math.floor(Date.parse(a.now) / 1000)) };
          const names = (norm.match(/--attribute-names\s+(.+?)(?=\s--|$)/) || [, 'All'])[1].split(/\s+/);
          return json({ Attributes: names.includes('All') ? all : Object.fromEntries(names.filter(n => n in all).map(n => [n, all[n]])) });
        } },
        { re: /^aws sqs start-message-move-task\b/, out: (sim, mm) => {
          const a = sim.account, s = a.sale, src = flagOf(mm.input, 'source-arn'), dest = flagOf(mm.input, 'destination-arn');
          if (src !== DLQ.arn) return `An error occurred (InvalidParameterValue) when calling the StartMessageMoveTask operation: Source queue must be configured as a Dead Letter Queue.`;
          if (dest && dest !== SRC.arn) return `An error occurred (InvalidParameterValue) when calling the StartMessageMoveTask operation: Destination queue must be the original source queue in this runbook.`;
          if (s.moving) return 'An error occurred (UnsupportedOperation) when calling the StartMessageMoveTask operation: A message move task is already running for this source.';
          const task = { handle: `eyJ0YXNrSWQiOiJtYWhhc2FsZS0${s.tasks.length + 1}In0=`, count: s.dlq, moved: 0, status: 'RUNNING', started: Date.parse(a.now) };
          s.tasks.push(task); s.moving = task; s.dlq = 0;
          return json({ TaskHandle: task.handle });
        } },
        { re: /^aws sqs list-message-move-tasks\b/, out: sim => json({ Results: sim.account.sale.tasks.slice().reverse().map(t => ({ TaskHandle: t.status === 'RUNNING' ? t.handle : undefined,
          Status: t.status, SourceArn: DLQ.arn, DestinationArn: SRC.arn, ApproximateNumberOfMessagesMoved: t.moved, ApproximateNumberOfMessagesToMove: t.count, StartedTimestamp: t.started })) }) },
      ];
      return {
        account, files, responses, placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'Mahasale ki raat ka on-call. Pager par jo alert hai, use <b>dhoondho, theek karo, phir pakka karo</b> — agla alert aksar pichhle fix ke baad aata hai. Runbook ke niyam todne wale commands simulator rok dega aur report card mein ginega.',
        successText: 'SG mein ALB ka rule, ASG ki max, worker ki reserved concurrency aur DLQ ka maxReceiveCount — chaaron <b>config</b> the. Har fix ke baad dobara dekhna (verify) hi incident band karta hai.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM',
          `aws elbv2 describe-target-health --target-group-arn ${TG_ARN}`, `aws ec2 describe-security-groups --group-ids ${SG_APP}`, 'cat sg-change-1530.txt',
          `aws ec2 authorize-security-group-ingress --group-id ${SG_APP} --protocol tcp --port 8080 --source-group ${SG_ALB}`,
          `aws elbv2 describe-target-health --target-group-arn ${TG_ARN}`,
          `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG}`,
          `aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --max-size 12`,
          `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG}`,
          'aws cloudwatch describe-alarms --state-value ALARM', `aws lambda get-function --function-name ${FN}`,
          `aws lambda put-function-concurrency --function-name ${FN} --reserved-concurrent-executions 40`,
          'aws cloudwatch describe-alarms --alarm-names order-worker-throttles',
          `aws sqs get-queue-attributes --queue-url ${DLQ.url} --attribute-names ApproximateNumberOfMessages`,
          `aws sqs get-queue-attributes --queue-url ${SRC.url} --attribute-names RedrivePolicy`, 'cat redrive-policy.json',
          `aws sqs set-queue-attributes --queue-url ${SRC.url} --attributes file://redrive-policy.json`,
          `aws sqs start-message-move-task --source-arn ${DLQ.arn}`,
          `aws sqs get-queue-attributes --queue-url ${DLQ.url} --attribute-names ApproximateNumberOfMessages`],
      };
    },
  });

  AG.addLab('boss2', {
    type: 'oncall', id: 'oncall-mahasale', shift: 'mahasale', title: '📟 On-call: Mahasale ki raat',
    intro: 'Sale 20:00 par shuru hui aur pager baj gaya. Asli AWS CLI (simulator) se <b>dekho → theek karo → pakka karo</b>. Har command = 1 minute.',
  });
})();
