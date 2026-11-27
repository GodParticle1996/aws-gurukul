/* 📟 On-call shift 'vpc-cleanup' — vpcbasics level (VPC: website khule, database internet par na dikhe). Engine: oncall.js.
   28 Nov, 23:10. 23:00 par Ravi ka "VPC cleanup" change chala: web subnet ki explicit route-table association hata di
   (subnet chupchaap MAIN table par aa gaya — usme sirf local route) aur app table se NAT route delete kar diya ("NAT ka bill").
   Teen JUDE alerts (har ek pichhle fix ka nateeja):
     1 HomeCanaryFailing    web subnet ka effective table = main (local-only) → site timeout. Fix: subnet ko rtb-public se jodo
     2 PaymentApiTimeouts   site chalte hi orders aaye; private app workers payment gateway tak nahi pahunchte (0.0.0.0/0 → NAT gayab)
                            Jaal: app table par IGW route — workers ke paas public IP nahi, kaam nahi karega aur subnet public ban jaata
     3 NatBytesHigh         NAT route aate hi raat ka S3 image-sync backlog NAT se behne laga (har GB ka processing charge)
                            → S3 gateway endpoint app table par (prefix-list route 0.0.0.0/0 se zyada specific)
   Model (reconcile, har minute): effective table = explicit association, warna main table. Canary = web table mein IGW route +
   web instance ka public IP. Payments = site chale toh orders; app table mein available NAT ka route na ho toh timeout.
   NAT bytes = payments ka thoda traffic + S3 sync (jab tak app table par S3 endpoint route na ho). Ravi ke 2 API calls
   CloudTrail Event history mein asli shape mein. */
(function () {
  const R = 'ap-south-1', A = '123456789012';
  const T0 = Date.parse('2026-11-28T17:40:00Z');                     // 23:10 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const VPC = 'vpc-0c4f2a9e7b1d3e5f6', IGW = 'igw-0a7d3c9e5b1f24680', NAT = 'nat-0f6e5d4c3b2a19087', EIP = 'eipalloc-0d4c3b2a1f0e9d876';
  const SN_WEB = 'subnet-0e1a2b3c4d5e6f701', SN_NAT = 'subnet-0f2b3c4d5e6f7a812', SN_APP = 'subnet-0a9b8c7d6e5f4a321';
  const RT_MAIN = 'rtb-0a1b2c3d4e5f60789', RT_PUB = 'rtb-0b2c3d4e5f6071890', RT_APP = 'rtb-0c3d4e5f607182901';
  const AS_APP = 'rtbassoc-0d4e5f60718293a4b', WEB_I = 'i-0a3f9c21d4e5b6071', APP_I = 'i-0b7e2d18c9a4f3052';
  const SITE = 'https://www.shopkaro.example/';
  const S3SVC = `com.amazonaws.${R}.s3`;
  const tables = a => a.routeTables || [];
  const effective = (a, sid) => tables(a).find(t => (t.associations || []).some(x => x.subnetId === sid)) || tables(a).find(t => t.main);
  const route = (t, dst) => ((t || {}).routes || []).find(r => r.destination === dst);
  const webOk = a => { const r = route(effective(a, SN_WEB), '0.0.0.0/0'), w = a.instances.find(i => i.id === WEB_I);
    return !!r && r.target === IGW && (a.internetGateways || []).some(g => g.id === IGW && g.vpcId === VPC) && !!w && w.state === 'running' && !!w.publicIp; };
  const natOk = a => { const r = route(effective(a, SN_APP), '0.0.0.0/0'); const n = r && (a.natGateways || []).find(x => x.id === r.target);
    return !!n && n.state === 'available'; };
  const s3Endpoint = a => { const t = effective(a, SN_APP);
    return (t.routes || []).some(r => r.type === 'endpoint' && (a.vpcEndpoints || []).some(e => e.id === r.target && e.serviceName === S3SVC && e.state === 'available')); };

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const web = webOk(a), nat = natOk(a), ep = s3Endpoint(a), L = a.cleanup;
    const orders = web ? 40 + (clock * 7) % 9 : 0;
    if (nat && !ep && L.backlogGb > 0) L.backlogGb = Math.max(0, Math.round((L.backlogGb - 2.1) * 10) / 10);
    const values = { canary: web ? 100 : 0, pay: nat ? 0 : orders,
      nat: nat ? Math.round((orders * 0.08 + (ep || L.backlogGb <= 0 ? 0 : 2100)) * 1e6) : 0 };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
  }

  function event(id, ms, name, req) {
    const body = { eventVersion: '1.09', userIdentity: { type: 'IAMUser', principalId: 'AIDA4RAVIDEV0M3Q7T', arn: `arn:aws:iam::${A}:user/ravi`, accountId: A,
      accessKeyId: 'ASIA4RAVICONSOLE7K2Q', userName: 'ravi', sessionContext: { attributes: { creationDate: '2026-11-28T17:21:09Z', mfaAuthenticated: 'true' } } },
      eventTime: iso(ms), eventSource: 'ec2.amazonaws.com', eventName: name, awsRegion: R, sourceIPAddress: '49.36.112.18',
      userAgent: 'aws-cli/2.17.0 Python/3.11.8 Linux/6.5.0 exe/x86_64', requestParameters: req, responseElements: { _return: true },
      eventID: id, readOnly: false, eventType: 'AwsApiCall', managementEvent: true, recipientAccountId: A, eventCategory: 'Management' };
    return { EventId: id, EventName: name, ReadOnly: 'false', AccessKeyId: 'ASIA4RAVICONSOLE7K2Q', EventTime: iso(ms).replace('Z', '+00:00'),
      EventSource: 'ec2.amazonaws.com', Username: 'ravi', Resources: [], CloudTrailEvent: JSON.stringify(body) };
  }

  const RUNBOOK = `# ShopKaro on-call — VPC raat (28 Nov, 23:10 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Alarms:   aws cloudwatch describe-alarms --state-value ALARM
          (shopkaro-home-canary · payment-gateway-timeouts · nat-bytes-high)
Bahar se: curl -I ${SITE}
Kya badla: aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=ravi
Network:  aws ec2 describe-route-tables   (Associations + Routes; jis subnet ki association nahi, woh MAIN table use karta hai)
          aws ec2 describe-subnets · aws ec2 describe-instances
          aws ec2 describe-nat-gateways · aws ec2 describe-vpc-endpoints
Badlaav:  aws ec2 associate-route-table --subnet-id S --route-table-id T
          aws ec2 create-route --route-table-id T --destination-cidr-block 0.0.0.0/0 --nat-gateway-id N
          aws ec2 create-vpc-endpoint --vpc-id ${VPC} --service-name ${S3SVC} --route-table-ids T

Subnets:  web-a ${SN_WEB} (website, public)  ·  nat-a ${SN_NAT} (NAT, public)  ·  app-a ${SN_APP} (workers, PRIVATE)
Niyam:
- Main table private rehti hai (sirf local route). Usme IGW route KABHI nahi.
- App workers ke paas public IP nahi. Bahar ka raasta sirf NAT se. App table par IGW route nahi.
- NAT har GB par processing charge leta hai. S3 ka traffic NAT se nahi jaana chahiye.
`;

  AG.oncall.add({
    id: 'vpc-cleanup', start: 23 * 60 + 10,
    INC: [
      { id: 'HomeCanaryFailing', sev: '🔴 SEV1', text: 'Canary shopkaro-home 0% — website timeout. 23:00 par Ravi ka "VPC cleanup" change chala tha.',
        fixed: webOk,
        verify: /^curl\b|^aws cloudwatch describe-alarms\b/, verifyText: 'curl ya alarms dobara dekho',
        hints: [`cat runbook.md, phir curl -I ${SITE} aur aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=ravi — Ravi ne kaunse 2 API calls kiye?`,
          `aws ec2 describe-route-tables — web-a (${SN_WEB}) ki explicit association kisi table mein hai? Nahi hai toh subnet MAIN table use karta hai, jisme sirf local route hai. Main table mein IGW route mat daalo — use rtb-public se jodo.`,
          `aws ec2 associate-route-table --subnet-id ${SN_WEB} --route-table-id ${RT_PUB}, phir curl -I ${SITE}`] },
      { id: 'PaymentApiTimeouts', sev: '🔴 SEV1', text: 'Site wapas aayi, orders aa rahe hain — par app workers ki payment gateway calls timeout ho rahi hain. Orders "payment pending" mein atke.',
        fixed: natOk,
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'alarms dobara dekho (payment-gateway-timeouts)',
        hints: [`aws ec2 describe-route-tables --route-table-ids ${RT_APP} — app table mein 0.0.0.0/0 ka route hai? Phir aws ec2 describe-nat-gateways`,
          'Ravi ne NAT ka route delete kiya tha, NAT khud abhi available hai. Workers ke paas public IP nahi, isliye IGW route kaam nahi karega — aur private subnet ko public bana dega. Route NAT par lagao.',
          `aws ec2 create-route --route-table-id ${RT_APP} --destination-cidr-block 0.0.0.0/0 --nat-gateway-id ${NAT}, phir aws cloudwatch describe-alarms --alarm-names payment-gateway-timeouts`] },
      { id: 'NatBytesHigh', sev: '🟠 SEV2', text: 'NAT gateway se ~2 GB/min bahar ja raha hai. Raat ka S3 image-sync backlog ab NAT se beh raha hai — har GB ka paisa.',
        fixed: s3Endpoint,
        verify: /^aws cloudwatch describe-alarms\b/, verifyText: 'alarms dobara dekho (nat-bytes-high)',
        hints: ['aws ec2 describe-vpc-endpoints — S3 ka koi endpoint hai? Workers ka S3 traffic abhi kis route se jaata hai?',
          'S3 (aur DynamoDB) ke liye Gateway endpoint aata hai: app table mein S3 prefix-list ka route judta hai, jo 0.0.0.0/0 se zyada specific hai — S3 traffic NAT ko chhod deta hai. NAT delete mat karo, payments ko woh chahiye.',
          `aws ec2 create-vpc-endpoint --vpc-id ${VPC} --service-name ${S3SVC} --route-table-ids ${RT_APP}, phir aws cloudwatch describe-alarms --alarm-names nat-bytes-high`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const series = (key, namespace, metric, unit, dims) => ({ key, seriesId: 'vpc-' + key, version: 1, period: 60, namespace, metric, unit, dimensions: dims, points: [] });
      const alarm = (name, key, ns, metric, dims, stat, op, threshold) => ({ name, alarmId: 'vpc-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: dims, Statistic: stat, Threshold: threshold, ComparisonOperator: op,
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const canary = [{ Name: 'CanaryName', Value: 'shopkaro-home' }], pay = [{ Name: 'Service', Value: 'payments' }], nat = [{ Name: 'NatGatewayId', Value: NAT }];
      const local = { destination: '10.0.0.0/16', target: 'local' };
      const account = {
        region: R, now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        vpcs: [{ id: VPC, cidr: '10.0.0.0/16', name: 'shopkaro', default: false, igw: IGW, dnsSupport: true, dnsHostnames: true }],
        internetGateways: [{ id: IGW, vpcId: VPC }],
        subnets: [
          { id: SN_WEB, vpcId: VPC, cidr: '10.0.1.0/24', az: 'ap-south-1a', name: 'web-a', public: true },
          { id: SN_NAT, vpcId: VPC, cidr: '10.0.2.0/24', az: 'ap-south-1a', name: 'nat-a', public: true },
          { id: SN_APP, vpcId: VPC, cidr: '10.0.11.0/24', az: 'ap-south-1a', name: 'app-a', public: false },
        ],
        routeTables: [
          { id: RT_MAIN, vpcId: VPC, main: true, routes: [{ ...local }], associations: [{ id: 'rtbassoc-0a1b2c3d4e5f60789', main: true }] },
          { id: RT_PUB, vpcId: VPC, routes: [{ ...local }, { destination: '0.0.0.0/0', target: IGW }],
            associations: [{ id: 'rtbassoc-0b2c3d4e5f607189a', subnetId: SN_NAT, main: false }] },
          { id: RT_APP, vpcId: VPC, routes: [{ ...local }], associations: [{ id: AS_APP, subnetId: SN_APP, main: false }] },
        ],
        addresses: [{ allocationId: EIP, publicIp: '13.234.66.10', instanceId: null, natId: NAT }],
        natGateways: [{ id: NAT, subnetId: SN_NAT, allocationId: EIP, publicIp: '13.234.66.10', connectivityType: 'public', state: 'available', clientToken: null }],
        vpcEndpoints: [],
        securityGroups: [
          { id: 'sg-0a1b2c3d4e5f60718', vpcId: VPC, name: 'web', ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' }] },
          { id: 'sg-0b2c3d4e5f6071829', vpcId: VPC, name: 'app', ingress: [{ protocol: 'tcp', fromPort: 8080, toPort: 8080, sourceGroup: 'sg-0a1b2c3d4e5f60718' }] },
        ],
        instances: [
          { id: WEB_I, name: 'shopkaro-web', type: 't3.medium', state: 'running', az: 'ap-south-1a', subnetId: SN_WEB, vpcId: VPC, sgIds: ['sg-0a1b2c3d4e5f60718'], privateIp: '10.0.1.21', publicIp: '13.234.71.22', eip: true },
          { id: APP_I, name: 'shopkaro-worker', type: 't3.medium', state: 'running', az: 'ap-south-1a', subnetId: SN_APP, vpcId: VPC, sgIds: ['sg-0b2c3d4e5f6071829'], privateIp: '10.0.11.37', publicIp: null },
        ],
        managementEvents: [
          event('c1f3a9e2-7b4d-4e61-9a2c-5d8f0b3e6a71', T0 - 588000, 'DeleteRoute', { routeTableId: RT_APP, destinationCidrBlock: '0.0.0.0/0' }),
          event('8e2d6b4f-1a3c-4f75-b9d0-2c7e5a9f1b38', T0 - 603000, 'DisassociateRouteTable', { associationId: 'rtbassoc-0e5f6071829a3b4c5' }),
        ],
        capacityMetrics: [series('canary', 'CloudWatchSynthetics', 'SuccessPercent', 'Percent', canary),
          series('pay', 'ShopKaro/Payments', 'GatewayTimeouts', 'Count', pay), series('nat', 'AWS/NATGateway', 'BytesOutToDestination', 'Bytes', nat)],
        alarms: [alarm('shopkaro-home-canary', 'canary', 'CloudWatchSynthetics', 'SuccessPercent', canary, 'Average', 'LessThanThreshold', 90),
          alarm('payment-gateway-timeouts', 'pay', 'ShopKaro/Payments', 'GatewayTimeouts', pay, 'Sum', 'GreaterThanThreshold', 0),
          alarm('nat-bytes-high', 'nat', 'AWS/NATGateway', 'BytesOutToDestination', nat, 'Sum', 'GreaterThanThreshold', 1e9)],
        cleanup: { backlogGb: 400 },
      };
      const responses = [
        risky(new RegExp(`^aws ec2 create-route\\b(?=.*--route-table-id\\s+${RT_MAIN}\\b)(?=.*--gateway-id\\s+igw-)`), 'MAIN table mein IGW route — har naya ya bina-association subnet (DB bhi) chupchaap public ho jaata.'),
        risky(new RegExp(`^aws ec2 create-route\\b(?=.*--route-table-id\\s+${RT_APP}\\b)(?=.*--gateway-id\\s+igw-)`), 'private app table mein IGW route — workers ke paas public IP nahi, kaam nahi karega, aur subnet public ban jaata.'),
        risky(new RegExp(`^aws ec2 replace-route-table-association\\b(?=.*--association-id\\s+${AS_APP}\\b)(?=.*--route-table-id\\s+${RT_PUB}\\b)`), 'private app subnet ko public table par daalna — workers internet ke saamne.'),
        risky(/^aws ec2 delete-nat-gateway\b/, 'NAT delete karna — payments ka bahar ka raasta phir band.'),
        risky(/^aws ec2 (allocate-address|associate-address)\b/, 'worker ko public IP dena — private subnet ka matlab hi khatam.'),
        { re: /^curl((?:\s+-[a-zA-Z]+)*)\s+https:\/\/www\.shopkaro\.example\/?\s*$/, out: sim => webOk(sim.account)
          ? `HTTP/2 200\ndate: ${new Date(sim.account.now).toUTCString()}\ncontent-type: text/html; charset=utf-8\nserver: nginx\ncache-control: no-cache`
          : 'curl: (28) Failed to connect to www.shopkaro.example port 443 after 10002 ms: Timeout was reached' },
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms · aws cloudtrail lookup-events · aws ec2 describe-route-tables / describe-nat-gateways / describe-vpc-endpoints / associate-route-table / create-route / create-vpc-endpoint · curl -I <site>. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      return {
        account, files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK } }, responses,
        placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'Raat 23:10. Ek "cleanup" change ke baad pager baja. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b>. Har alert pichhle fix ke baad aata hai. Runbook todne wale commands simulator rok dega.',
        successText: 'Web subnet phir <b>rtb-public</b> par (main table private hi rahi), workers ka bahar ka raasta <b>NAT</b> se, aur S3 ka traffic <b>gateway endpoint</b> se — NAT ka bill nahi. Sabak: association hatane se subnet chupchaap MAIN table par aa jaata hai.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', `curl -I ${SITE}`,
          'aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=ravi', 'aws ec2 describe-route-tables',
          `aws ec2 associate-route-table --subnet-id ${SN_WEB} --route-table-id ${RT_PUB}`, `curl -I ${SITE}`,
          `aws ec2 describe-route-tables --route-table-ids ${RT_APP}`, 'aws ec2 describe-nat-gateways',
          `aws ec2 create-route --route-table-id ${RT_APP} --destination-cidr-block 0.0.0.0/0 --nat-gateway-id ${NAT}`,
          'aws cloudwatch describe-alarms --alarm-names payment-gateway-timeouts',
          'aws ec2 describe-vpc-endpoints', `aws ec2 create-vpc-endpoint --vpc-id ${VPC} --service-name ${S3SVC} --route-table-ids ${RT_APP}`,
          'aws cloudwatch describe-alarms --alarm-names nat-bytes-high'],
      };
    },
  });

  AG.addLab('vpcbasics', {
    type: 'oncall', id: 'oncall-vpc-cleanup', shift: 'vpc-cleanup', title: '📟 On-call: VPC cleanup ke baad',
    intro: 'Raat 23:10. Ek "cleanup" change ke baad website band. <b>Dekho kya badla → theek karo → pakka karo</b>. Har command = 1 minute.',
  });
})();
