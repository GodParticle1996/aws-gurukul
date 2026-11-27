/* 📟 On-call shift 'mumbai-down' — finalboss (Advanced boss: Mumbai band ho toh checkout kaise chalega?). Engine: oncall.js.
   14:00 se ap-south-1 (Mumbai) mein Region event. DR plan: pilot light ap-south-2 (Hyderabad). Teen JUDE hue alerts:
     1 CheckoutRegionDown       DNS abhi bhi Mumbai deta hai — Hyderabad ASG 0 par (pilot light), DR ALB ka alias unhealthy,
                                failover pair dono unhealthy → fail-open Mumbai. Fix: Hyderabad ASG scale-out.
     2 CheckoutWritesReadOnly   traffic Hyderabad aaya, par orders-hyd read replica hai → "read-only transaction". Fix: promote.
     3 OrdersHydBackupsShort    promote ke baad orders-hyd naya primary; retention sirf 1 din (promote ka default), policy 7 din.
   DNS ka jawab AG.dnsAnswer (failover + health check + alias EvaluateTargetHealth); ASG scale-out asli simulator (settleGroup →
   target group mein naye instances → AG.targetHealth). Reconcile har minute DR ALB alias ki health, checkout logs aur
   5xx metric banata hai. Control plane edits (Route 53 records haath se) runbook ke khilaaf — simulator rokta hai. */
(function () {
  const A = '123456789012', ZONE = 'Z05CHECKOUTSHOPKARO', HC = '4f1d2c8a-6b3e-4a7d-9c51-e0b2a7f3d916';
  const MUM_DNS = 'checkout-mum-1427365890.ap-south-1.elb.amazonaws.com', HYD_DNS = 'checkout-hyd-907134256.ap-south-2.elb.amazonaws.com';
  const TG_HYD = `arn:aws:elasticloadbalancing:ap-south-2:${A}:targetgroup/checkout-hyd/5c8e2a1f7d3b9046`;
  const ALB_HYD = `arn:aws:elasticloadbalancing:ap-south-2:${A}:loadbalancer/app/checkout-hyd/2e7b9c4a1d5f8036`;
  const VPC = 'vpc-0a7d7c2a91e4f5b60', SG_APP = 'sg-0a7da9e41c3b5d2f8', ASG = 'checkout-hyd', DB = 'orders-hyd', LOGS = '/shopkaro/checkout-hyd';
  const T0 = Date.parse('2026-11-27T08:30:00Z');                        // 14:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const zone = a => a.hostedZones.find(z => z.id === ZONE);
  const db = a => a.rds.find(r => r.id === DB);
  const tg = a => a.targetGroups.find(t => t.arn === TG_HYD);
  const healthyHyd = a => (tg(a).targets || []).filter(t => AG.targetHealth(a, tg(a), t).State === 'healthy').length;
  const toHyd = a => JSON.stringify(AG.dnsAnswer(a, zone(a), 'checkout.shopkaro.in.', 'A')) === JSON.stringify(['18.60.20.20']);
  const writable = a => !db(a).source && db(a).state === 'available';

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    a.dnsAliases.find(x => x.dnsName === HYD_DNS).healthy = healthyHyd(a) >= 2;   // ALB ke peeche healthy targets
    const traffic = toHyd(a), ok = traffic && writable(a);
    const errors = ok ? 0 : 100;
    const stamp = a.now.slice(11, 19);
    const g = a.logGroups.find(x => x.name === LOGS);
    if (clock > 0 && traffic) g.events.push(ok ? `${stamp} INFO POST /checkout 200 order=ord-${9100 + clock}`
      : `${stamp} ERROR POST /checkout 500 — psycopg2.errors.ReadOnlySqlTransaction: cannot execute INSERT in a read-only transaction`);
    if (g.events.length > 12) g.events.splice(0, g.events.length - 12);
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, errors)); if (s.points.length > 40) s.points.shift(); });
  }

  const dns = `aws route53 test-dns-answer --hosted-zone-id ${ZONE} --record-name checkout.shopkaro.in --record-type A`;
  const hcStatus = `aws route53 get-health-check-status --health-check-id ${HC}`;
  const asgShow = `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG}`;
  const health = `aws elbv2 describe-target-health --target-group-arn ${TG_HYD}`;
  const describe = `aws rds describe-db-instances --db-instance-identifier ${DB}`;
  const wait = `aws rds wait db-instance-available --db-instance-identifier ${DB}`;
  const logs = `aws logs tail ${LOGS}`;

  AG.oncall.add({
    id: 'mumbai-down', start: 14 * 60,
    INC: [
      { id: 'CheckoutRegionDown', sev: '🔴 SEV1', text: 'ap-south-1 (Mumbai) mein Region event — checkout 100% fail. DR plan: pilot light, ap-south-2 (Hyderabad).',
        fixed: a => toHyd(a),
        verify: /^aws route53 test-dns-answer\b/, verifyText: 'DNS jawab dobara dekho (test-dns-answer)',
        hints: [`${dns} — jawab kis Region ka IP hai? ${hcStatus} — Mumbai ka health check kya kehta hai?`,
          `Mumbai unhealthy, phir bhi DNS Mumbai deta hai = SECONDARY bhi unhealthy (fail-open). Hyderabad ALB ke peeche koi target hai? ${asgShow} — pilot light mein app servers 0 rehte hain.`,
          `aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --min-size 4 --desired-capacity 4, phir ${health}, phir ${dns}`] },
      { id: 'CheckoutWritesReadOnly', sev: '🔴 SEV1', text: 'Traffic Hyderabad par aa gaya, par checkout 500 — orders likhe hi nahi ja rahe.',
        fixed: a => writable(a),
        verify: /^aws logs tail\b|^aws rds describe-db-instances\b/, verifyText: 'checkout logs ya DB dobara dekho',
        hints: [`${logs} — error kya kehta hai? Phir ${describe} — ReadReplicaSourceDBInstanceIdentifier?`,
          'orders-hyd abhi Mumbai ka read replica hai — usme INSERT nahi hota. Region event mein DR ka DB promote karna runbook ka doosra kadam hai (Mumbai wapas aane par data reconcile alag se).',
          `aws rds promote-read-replica --db-instance-identifier ${DB}, phir ${wait}, phir ${logs}`] },
      { id: 'OrdersHydBackupsShort', sev: '🟠 SEV2', text: 'orders-hyd ab akela primary hai — automated backup retention sirf 1 din; data policy 7 din maangti hai.',
        fixed: a => db(a).backupRetention >= 7 && !(db(a).pending || {}).BackupRetentionPeriod,
        verify: /^aws rds describe-db-instances\b/, verifyText: 'DB dobara dekho (describe-db-instances)',
        hints: [`${describe} — BackupRetentionPeriod kitna hai? promote-read-replica ka default kya hota hai?`,
          'Promote ke baad yahi naya primary hai — agli galti (galat DELETE) ka ilaaj iske PITR backups se hoga. Retention policy ke hisaab se 7 din karo, turant laagu karke.',
          `aws rds modify-db-instance --db-instance-identifier ${DB} --backup-retention-period 7 --apply-immediately, phir ${wait}, phir ${describe}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const subnets = ['a', 'b'].map((z, i) => ({ id: ['subnet-0a7d1a7c3e9b2f4d6', 'subnet-0a7d2b9d4f1c3e5a7'][i], vpcId: VPC, cidr: `10.60.${11 + i}.0/24`, az: 'ap-south-2' + z, name: 'checkout-hyd-' + z, public: false }));
      const record = (id, role, dnsName, extra) => ({ Name: 'checkout.shopkaro.in.', Type: 'A', SetIdentifier: id, Failover: role,
        AliasTarget: { HostedZoneId: role === 'PRIMARY' ? 'ZP97RAFLXTNZK' : 'Z0173938T07WNTVAEPZN', DNSName: dnsName, EvaluateTargetHealth: true }, ...extra });
      const records = [{ Name: 'shopkaro.in.', Type: 'NS', TTL: 172800, ResourceRecords: [{ Value: 'ns-1.sim.invalid.' }, { Value: 'ns-2.sim.invalid.' }] },
        { Name: 'shopkaro.in.', Type: 'SOA', TTL: 900, ResourceRecords: [{ Value: 'ns-1.sim.invalid. hostmaster.sim.invalid. 1 7200 900 1209600 86400' }] },
        record('mumbai', 'PRIMARY', MUM_DNS, { HealthCheckId: HC }), record('hyderabad', 'SECONDARY', HYD_DNS, {})];
      const account = {
        region: 'ap-south-2', now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDAONCALLDR', Arn: `arn:aws:iam::${A}:user/oncall` },
        hostedZones: [{ id: ZONE, name: 'shopkaro.in.', callerReference: 'shopkaro-checkout', records, servedRecords: JSON.parse(JSON.stringify(records)) }],
        healthChecks: [{ id: HC, callerReference: 'checkout-mumbai', version: 2, observedHealthy: false,
          config: { Type: 'HTTPS', FullyQualifiedDomainName: MUM_DNS, Port: 443, ResourcePath: '/healthz', RequestInterval: 30, FailureThreshold: 3, Inverted: false, Disabled: false } }],
        dnsChanges: [], dnsAliases: [{ dnsName: MUM_DNS, healthy: false, addresses: ['13.232.10.10'] }, { dnsName: HYD_DNS, healthy: false, addresses: ['18.60.20.20'] }],
        vpcs: [{ id: VPC, cidr: '10.60.0.0/16', name: 'checkout-hyd' }], subnets, instances: [],
        securityGroups: [{ id: SG_APP, name: 'checkout-hyd-app', vpcId: VPC, ingress: [{ protocol: 'tcp', fromPort: 8080, toPort: 8080, sourceGroup: 'sg-0a7dab12c4e6f8091' }], egress: [] },
          { id: 'sg-0a7dab12c4e6f8091', name: 'checkout-hyd-alb', vpcId: VPC, ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' }], egress: [] }],
        elbs: [{ id: ALB_HYD, arn: ALB_HYD, name: 'checkout-hyd', type: 'application', scheme: 'internet-facing', sgIds: ['sg-0a7dab12c4e6f8091'], dns: HYD_DNS,
          listeners: [{ Port: 443, Protocol: 'HTTPS', DefaultActions: [{ Type: 'forward', TargetGroupArn: TG_HYD }] }] }],
        targetGroups: [{ arn: TG_HYD, name: 'checkout-hyd', vpcId: VPC, loadBalancerArn: ALB_HYD, targetType: 'instance', protocol: 'HTTP', port: 8080,
          healthCheckPath: '/healthz', validHealthPath: '/healthz', matcher: '200', sgAware: true, targets: [] }],
        asgs: [{ name: ASG, min: 0, max: 8, desired: 0, instances: [], vpcZone: subnets.map(s => s.id).join(','), healthCheckType: 'ELB', gracePeriod: 120, warmup: 120,
          targetGroupARNs: [TG_HYD], activities: [], launchTemplate: { id: 'lt-0a7dc4ec6a7f3b291', version: '3', type: 'c6i.large', healthPath: '/healthz', appPort: 8080, sgIds: [SG_APP] } }],
        rds: [{ id: DB, name: 'orders', resourceId: 'db-ORDERSHYD3F8Q', engine: 'postgres', class: 'db.r6g.large', state: 'available', multiAZ: false, storage: 200, maxStorage: 1000,
          backupRetention: 0, encrypted: true, publicAccess: false, deletionProtection: true, source: 'orders-mum',
          endpoint: 'orders-hyd.k3v8x1q2z7aa.ap-south-2.rds.amazonaws.com', latestRestorableTime: '2026-11-27T08:29:00Z' }],
        logGroups: [{ name: LOGS, retention: 30, events: [], subscriptionFilters: [], metricFilters: [] }],
        capacityMetrics: [{ key: 'errors', seriesId: 'dr-errors', version: 1, period: 60, namespace: 'ShopKaro/Checkout', metric: '5xxRate', unit: 'Percent',
          dimensions: [{ Name: 'Service', Value: 'checkout' }], points: [] }],
        alarms: [{ name: 'checkout-5xx', alarmId: 'dr-5xx', revision: 0, state: 'ALARM', definition: { AlarmName: 'checkout-5xx', Namespace: 'ShopKaro/Checkout', MetricName: '5xxRate',
          Dimensions: [{ Name: 'Service', Value: 'checkout' }], Statistic: 'Average', Threshold: 5, ComparisonOperator: 'GreaterThanThreshold', Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'breaching' } }],
      };
      const files = {
        'runbook.md': { desc: 'DR runbook', content: `# Checkout DR runbook — Mumbai (ap-south-1) gire toh
DR plan: PILOT LIGHT ap-south-2 (Hyderabad). DNS failover pehle se bana hai — Region event mein records HAATH SE MAT badlo.

1. DNS kya de raha:     ${dns}
                        Mumbai health: ${hcStatus}
2. DR app servers:      ${asgShow}
                        (pilot light: normally 0 — event mein pehla kadam: min aur desired 4)
                        ${health}
3. DR database:         ${describe}
                        (normally Mumbai ka read replica — event mein promote karo: aws rds promote-read-replica)
                        ${wait}
4. Checkout:            ${logs}
                        aws cloudwatch describe-alarms --alarm-names checkout-5xx
Policy: har primary DB par automated backups kam se kam 7 din.
Mat chhedna: Route 53 records (control plane), Mumbai ke resources, kisi DB ka delete.
` },
      };
      const responses = [
        risky(/^aws route53 change-resource-record-sets\b/, 'Region event mein DNS records haath se badalna — control plane par bharosa mat karo; failover pehle se bana hai, use chalne do.'),
        risky(/^aws rds delete-db-instance\b/, 'DB delete karna — Region event mein bacha hua data hi sab kuch hai.'),
        risky(/^aws route53 (update|delete)-health-check\b/, 'Mumbai ka health check chhedna — wahi failover ka signal hai.'),
        { re: /^aws rds promote-read-replica\b/, out: (sim, m) => {
          const cmd = m.input, id = (cmd.match(/--db-instance-identifier\s+(\S+)/) || [])[1], r = sim.account.rds.find(x => x.id === id);
          if (!r) return `An error occurred (DBInstanceNotFound) when calling the PromoteReadReplica operation: DBInstance ${id} not found.`;
          if (!r.source) return 'An error occurred (InvalidDBInstanceState) when calling the PromoteReadReplica operation: DB Instance is not a read replica.';
          const brp = (cmd.match(/--backup-retention-period\s+(\d+)/) || [])[1];
          delete r.source; r.state = 'modifying'; r.backupRetention = brp != null ? Number(brp) : 1;
          return JSON.stringify({ DBInstance: { DBInstanceIdentifier: r.id, DBInstanceClass: r.class, Engine: r.engine, DBInstanceStatus: 'modifying',
            BackupRetentionPeriod: r.backupRetention, MultiAZ: !!r.multiAZ, ReadReplicaSourceDBInstanceIdentifier: 'orders-mum' } }, null, 4);
        } },
        { re: /^help$/, out: 'DR on-call: cat runbook.md. aws route53 test-dns-answer / get-health-check-status · aws autoscaling describe-auto-scaling-groups / update-auto-scaling-group · aws elbv2 describe-target-health · aws rds describe-db-instances / promote-read-replica / modify-db-instance / wait db-instance-available · aws logs tail · aws cloudwatch describe-alarms. Har command = 1 minute.' },
        AG.oncall.alarmsResponse('ap-south-2', A),
      ];
      return {
        account, files, responses, placeholder: 'cat runbook.md   (phir: test-dns-answer)',
        goal: 'Mumbai Region gir gaya. DR runbook se checkout Hyderabad par lao: <b>dekho → theek karo → pakka karo</b>. Region event mein naya kuch mat banao aur DNS haath se mat badlo — simulator rokega.',
        successText: 'Pilot light ko scale karna, DR DB promote karna aur naye primary ke backups — teeno <b>pehle se likhe runbook ke kadam</b> the. Failover DNS ne khud kiya, kisi ne records nahi chhede.',
        solution: ['cat runbook.md', dns, hcStatus, asgShow,
          `aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --min-size 4 --desired-capacity 4`, health, dns,
          logs, describe, `aws rds promote-read-replica --db-instance-identifier ${DB}`, wait, logs,
          describe, `aws rds modify-db-instance --db-instance-identifier ${DB} --backup-retention-period 7 --apply-immediately`, wait, describe],
      };
    },
  });

  AG.addLab('finalboss', {
    type: 'oncall', id: 'oncall-mumbai-down', shift: 'mumbai-down', title: '📟 On-call: Mumbai Region down',
    intro: 'Asli Region event, 14:00. DR plan pilot light hai. <b>Runbook ke pehle se likhe kadam</b> chalao — har command = 1 minute.',
  });
})();
