/* 📟 On-call shift 'bill-shock' — cost level (Cost: waste hatao, value bachao). Engine: oncall.js.
   30 Nov, 09:30. Mahine ka aakhri din, AWS Budgets ka forecast alert aur ek CloudWatch alarm. Teen JUDE alerts:
     1 OrdersApiLogFlood   kal ke deploy ne orders-api (Lambda) par LOG_LEVEL=DEBUG chhod diya → CloudWatch Logs ingestion ~40×.
                           Fix: LOG_LEVEL=INFO. Jaal: --environment POORA Variables map badalta hai — sirf LOG_LEVEL diya toh DB_HOST
                           waghera gayab, orders-api toot jaata. Review hui file env-prod.json mein saari values hain.
     2 GpuPocIdle          Budgets forecast: g5.12xlarge "reco-poc" Friday se chal raha, CPU ~0.4%. Owner (Ravi) ka jawab: "stop kar do,
                           data EBS par hai, Monday chahiye". Fix: STOP (terminate nahi). Stop par compute ka bill rukta, EBS ka chalta.
     3 IdleElasticIps      purane experiments ke Elastic IPs kisi se jude nahi. Public IPv4 address ka ghante ka charge lagta hai, chahe
                           juda ho ya nahi. Fix: sirf bina-jude IPs release; NAT wala IP chalu raasta hai.
   Model (reconcile, har minute): IncomingBytes = DEBUG ho toh ~620 MB/min warna ~15 MB/min. orders-api ko DB_HOST, DB_NAME,
   PAYMENT_URL chahiye — koi bhi gayab = har invocation error. Budgets/EIP alert email se aate hain (CloudWatch alarm nahi). */
(function () {
  const R = 'ap-south-1', A = '123456789012', FN = 'orders-api', GPU = 'i-0e7c4a2f9b1d3c586', LOGS = `/aws/lambda/${FN}`;
  const T0 = Date.parse('2026-11-30T04:00:00Z');                     // 09:30 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const ENV = { DB_HOST: 'orders.cluster-c9xk2mzq1w3e.ap-south-1.rds.amazonaws.com', DB_NAME: 'orders', PAYMENT_URL: 'https://payments.shopkaro.example/v2', LOG_LEVEL: 'DEBUG' };
  const NEED = ['DB_HOST', 'DB_NAME', 'PAYMENT_URL'];
  const IDLE = ['eipalloc-0a4c7e2b9d1f30561', 'eipalloc-0b8d3f6a2c4e17902', 'eipalloc-0c1e5a9d7b3f28643'];
  const fn = a => a.lambdas.find(f => f.name === FN);
  const vars = a => ((fn(a).environment || {}).Variables) || {};
  const envOk = a => NEED.every(k => vars(a)[k] === ENV[k]);
  const quiet = a => !fn(a).pendingConfig && ['INFO', 'WARN', 'ERROR'].includes(vars(a).LOG_LEVEL) && envOk(a);

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const f = fn(a), v = vars(a), calls = 900 + (clock * 37) % 120;
    const bytes = !envOk(a) ? 4e6 : v.LOG_LEVEL === 'DEBUG' ? 6.2e8 + (clock * 7e6) % 3e7 : 1.5e7 + (clock * 3e5) % 2e6;
    const errors = envOk(a) ? 0 : calls;
    const gpu = a.instances.find(i => i.id === GPU);
    const values = { bytes, errors, gpucpu: gpu && gpu.state === 'running' ? 0.4 : null };
    a.capacityMetrics.forEach(s => { if (values[s.key] == null) return; s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
    void f;
  }

  const getCfg = `aws lambda get-function-configuration --function-name ${FN}`;
  const RUNBOOK = `# ShopKaro on-call — mahine ka aakhri din (30 Nov, 09:30 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo. Value bachao, waste hatao.

Alarms:  aws cloudwatch describe-alarms --state-value ALARM
         (orders-api-log-ingestion · orders-api-errors)
Lambda:  ${getCfg}       (Environment.Variables)
         aws lambda update-function-configuration --function-name ${FN} --environment file://env-prod.json
         aws lambda wait function-updated-v2 --function-name ${FN}
EC2:     aws ec2 describe-instances --instance-ids ${GPU}
         aws ec2 stop-instances --instance-ids <id>
EIP:     aws ec2 describe-addresses
         aws ec2 release-address --allocation-id <id>

Jaankari:
- --environment POORA Variables map badalta hai. Jo key nahi doge woh mit jaayegi.
- env-prod.json = dev team ki review hui prod environment (LOG_LEVEL=INFO, baaki wahi).
- reco-poc GPU (owner Ravi): "stop kar do, data EBS par hai, Monday chahiye." Terminate MAT.
- Public IPv4 address ka ghante ka charge lagta hai. Jo IP kisi instance/NAT se juda hai, woh chalu raasta hai.
`;

  AG.oncall.add({
    id: 'bill-shock', start: 9 * 60 + 30,
    INC: [
      { id: 'OrdersApiLogFlood', sev: '🟠 SEV2', text: 'orders-api ke logs ~620 MB/minute (normal ~15). CloudWatch Logs ka bill kal se kai guna. Kal shaam orders-api ka deploy hua tha.',
        fixed: quiet,
        verify: /^aws cloudwatch describe-alarms\b|^aws lambda get-function-configuration\b/, verifyText: 'alarms ya function config dobara dekho',
        hints: [`cat runbook.md, phir ${getCfg} — Environment.Variables mein LOG_LEVEL kya hai? Aur kaunsi keys hain?`,
          'DEBUG logging har request ki poori detail likh rahi hai — logs ka ingestion GB ke hisaab se lagta hai. LOG_LEVEL=INFO karo. Dhyaan: --environment poora map badalta hai; sirf LOG_LEVEL diya toh DB_HOST waghera mit jaayenge. Review hui env-prod.json use karo, phir wait.',
          `aws lambda update-function-configuration --function-name ${FN} --environment file://env-prod.json, phir aws lambda wait function-updated-v2 --function-name ${FN}, phir aws cloudwatch describe-alarms --state-value ALARM`] },
      { id: 'GpuPocIdle', sev: '🟡 SEV3', text: 'AWS Budgets: mahine ka forecast budget se ~60% upar. Sabse bada naya kharcha: EC2 g5.12xlarge "reco-poc", Friday se chal raha.',
        fixed: a => (a.instances.find(i => i.id === GPU) || {}).state === 'stopped',
        verify: /^aws ec2 describe-instances\b/, verifyText: 'instance dobara dekho (describe-instances)',
        hints: [`aws ec2 describe-instances --instance-ids ${GPU} — State aur Tags dekho. Runbook mein owner ne kya kaha?`,
          'Owner ko Monday data chahiye, aur data EBS par hai. Stop par compute ka bill rukta hai, EBS ka chalta rehta hai, data bachta hai. Terminate se data bhi ja sakta hai — mana hai.',
          `aws ec2 stop-instances --instance-ids ${GPU}, phir aws ec2 describe-instances --instance-ids ${GPU}`] },
      { id: 'IdleElasticIps', sev: '🟡 SEV3', text: 'Billing: "Public IPv4 address" ki line badh rahi hai. Purane experiments ke Elastic IPs bache hue lagte hain.',
        fixed: a => !(a.addresses || []).some(x => IDLE.includes(x.allocationId)),
        verify: /^aws ec2 describe-addresses\b/, verifyText: 'addresses dobara dekho (describe-addresses)',
        hints: ['aws ec2 describe-addresses — kaunse IPs ke saath InstanceId/AssociationId nahi hai? Tags kya kehte hain?',
          'Public IPv4 address ka ghante ka charge lagta hai — juda ho ya nahi. Jo kisi se jude nahi aur jinke Tags purane experiment ke hain, unhe release karo. NAT wala IP chalu raasta hai, use mat chhuo.',
          `aws ec2 release-address --allocation-id ${IDLE[0]} (phir ${IDLE[1]} aur ${IDLE[2]}), phir aws ec2 describe-addresses`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const series = (key, ns, metric, unit, d) => ({ key, seriesId: 'bill-' + key, version: 1, period: 60, namespace: ns, metric, unit, dimensions: d, points: [] });
      const alarm = (name, key, ns, metric, d, threshold) => ({ name, alarmId: 'bill-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: d, Statistic: 'Sum', Threshold: threshold, ComparisonOperator: 'GreaterThanThreshold',
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const lg = [{ Name: 'LogGroupName', Value: LOGS }], fd = [{ Name: 'FunctionName', Value: FN }], gd = [{ Name: 'InstanceId', Value: GPU }];
      const eip = (id, ip, tags, extra) => ({ allocationId: id, publicIp: ip, tags, instanceId: null, natId: null, ...extra });
      const account = {
        region: R, now: iso(T0), lambdaConcurrencyQuota: 1000, callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        roles: [{ name: 'orders-api-role', lambda: { trust: 'lambda.amazonaws.com' } }],
        lambdas: [{ name: FN, runtime: 'nodejs22.x', handler: 'index.handler', roleName: 'orders-api-role', memory: 512, timeout: 10, state: 'Active',
          lastUpdateStatus: 'Successful', architectures: ['arm64'], revisionId: 'r88', environment: { Variables: { ...ENV } } }],
        instances: [{ id: GPU, name: 'reco-poc', type: 'g5.12xlarge', state: 'running', az: 'ap-south-1b', subnetId: 'subnet-0f2b3c4d5e6f7a812', vpcId: 'vpc-0c4f2a9e7b1d3e5f6',
          sgIds: ['sg-0c3d4e5f6071829a3'], privateIp: '10.0.12.44', publicIp: null }],
        volumes: [{ id: 'vol-0d5e7f9a1b3c24680', size: 500, type: 'gp3', state: 'in-use', attachedTo: GPU, deleteOnTermination: true, encrypted: true }],
        addresses: [eip(IDLE[0], '13.234.90.17', { Project: 'reco-poc-v1', Owner: 'ravi' }), eip(IDLE[1], '13.234.91.204', { Project: 'load-test-oct', Owner: 'amit' }),
          eip(IDLE[2], '65.0.118.9', { Project: 'demo-diwali', Owner: 'neha' }),
          eip('eipalloc-0d4c3b2a1f0e9d876', '13.234.66.10', { Name: 'nat-a' }, { natId: 'nat-0f6e5d4c3b2a19087', associationId: 'eipassoc-0f1e2d3c4b5a69788' })],
        capacityMetrics: [series('bytes', 'AWS/Logs', 'IncomingBytes', 'Bytes', lg), series('errors', 'AWS/Lambda', 'Errors', 'Count', fd),
          series('gpucpu', 'AWS/EC2', 'CPUUtilization', 'Percent', gd)],
        alarms: [alarm('orders-api-log-ingestion', 'bytes', 'AWS/Logs', 'IncomingBytes', lg, 1e8), alarm('orders-api-errors', 'errors', 'AWS/Lambda', 'Errors', fd, 0)],
      };
      const prodEnv = JSON.stringify({ Variables: { ...ENV, LOG_LEVEL: 'INFO' } }, null, 2);
      const responses = [
        risky(new RegExp(`^aws ec2 terminate-instances\\b(?=.*${GPU})`), 'reco-poc terminate karna — owner ne STOP kaha tha; root EBS (DeleteOnTermination) ke saath data bhi jaata.'),
        risky(/^aws ec2 delete-volume\b/, 'volume delete — owner ka data; is incident mein nahi.'),
        risky(/^aws lambda (delete-function|put-function-concurrency)\b/, 'orders-api ko hatana/rokna — logs ka bill bachane ke liye orders band nahi karte.'),
        risky(/^aws logs (delete-log-group|put-retention-policy)\b/, 'logs mitana / retention chhedna — ingestion ka bill isse nahi rukta, aur audit ka saboot jaata.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms · aws lambda get-function-configuration / update-function-configuration / wait function-updated-v2 · aws ec2 describe-instances / stop-instances / describe-addresses / release-address. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, responses, placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK }, 'env-prod.json': { desc: 'Review hui orders-api environment (LOG_LEVEL=INFO)', content: prodEnv } },
        goal: 'Subah 09:30, mahine ka aakhri din, bill ka alert. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b> — waste hatao, value bachao. Runbook todne wale commands simulator rok dega.',
        successText: '<b>LOG_LEVEL=INFO</b> poori environment ke saath (koi key nahi mitayi), GPU <b>stop</b> (data bacha, compute ka bill ruka), aur sirf bina-jude <b>Elastic IPs</b> release. Agla kadam: deploy pipeline mein LOG_LEVEL ka check, aur reco-poc par schedule (raat/weekend band).',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', getCfg,
          `aws lambda update-function-configuration --function-name ${FN} --environment file://env-prod.json`, `aws lambda wait function-updated-v2 --function-name ${FN}`,
          'aws cloudwatch describe-alarms --state-value ALARM',
          `aws ec2 describe-instances --instance-ids ${GPU}`, `aws ec2 stop-instances --instance-ids ${GPU}`, `aws ec2 describe-instances --instance-ids ${GPU}`,
          'aws ec2 describe-addresses', ...IDLE.map(id => `aws ec2 release-address --allocation-id ${id}`), 'aws ec2 describe-addresses'],
      };
    },
  });

  AG.addLab('cost', {
    type: 'oncall', id: 'oncall-bill-shock', shift: 'bill-shock', title: '📟 On-call: bill ka jhatka',
    intro: 'Subah 09:30, mahine ka aakhri din. Bill ke alerts. <b>Dekho → waste hatao, value bachao → pakka karo</b>. Har command = 1 minute.',
  });
})();
