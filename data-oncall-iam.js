/* 📟 On-call shift 'keyleak' — iam level (IAM: kaun, kya, kis par). Engine: oncall.js. Terminal: awscli.js.
   28 Nov, 02:00. CI user deploy-bot ki permanent access key (AKIA…) 01:40 par ek public GitHub commit mein chali gayi.
   deploy-bot par AdministratorAccess tha (level ka red flag) — attacker ne usi se backdoor user bana liya. Teen JUDE alerts:
     1 DeployBotKeyAbuse       leak hui key se CI ke bahar ke IP se ~300 calls/min → key Inactive (delete baad mein)
     2 RunInstancesByIamUser   key band hote hi attacker backdoor user support-ops (admin + 2 keys) par chala gaya,
                               har minute RunInstances → DONO keys Inactive (ek user ki 2 keys ho sakti hain), admin hatao
     3 Ec2VcpuUsageHigh        attacker ke c5.4xlarge instances abhi bhi chal rahe → sirf unhe terminate (prod web nahi)
   Model (reconcile, har minute): deploy-bot ki key Active = foreign calls; key band + support-ops ki koi key Active =
   ek RunInstances call (2 × c5.4xlarge). Admin hata ho toh UnauthorizedOperation; vCPU quota 96 bhar jaaye toh
   VcpuLimitExceeded (asli EC2 error). Har call CloudTrail Event history (managementEvents) mein asli shape mein judti hai.
   Inactive key ki request authentication par hi ruk jaati hai — woh Event history mein nahi aati. Alarms capacity-cli se. */
(function () {
  const R = 'ap-south-1', A = '123456789012';
  const T0 = Date.parse('2026-11-27T20:30:00Z');                     // 28 Nov 02:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const ct = ms => new Date(ms).toISOString().replace('.000Z', '+00:00');
  const DEPLOY = 'deploy-bot', BACKDOOR = 'support-ops';
  const DEPLOY_KEY = 'AKIA4SHOPDEPLOYB7Q2X', K1 = 'AKIA4SUPPORTK1N8WZ3R', K2 = 'AKIA4SUPPORTK2Q5HV7T';
  const ATTACKER_IP = '203.0.113.77', CI_IP = '13.235.40.10', QUOTA = 96;
  const ADMIN = 'arn:aws:iam::aws:policy/AdministratorAccess';
  const WEB = ['i-0a3f9c21d4e5b6071', 'i-0b7e2d18c9a4f3052', 'i-0c5d4e3f2a1b09683'];
  const MINERS = ['i-0f91c4a7e2d3b5068', 'i-07d2e8b3c6a1f9e04', 'i-0e64a1c9b8d7f2a35', 'i-03b8f5d2a7c4e6019',
    'i-0c27e9a4d1f8b3c76', 'i-09a5d3f7e2b6c8d41', 'i-0d81b6e4c3a9f2e57', 'i-06f3c8a2e5d4b7a90'];
  const VCPU = { 't3.medium': 2, 'c5.4xlarge': 16 };
  const user = (a, n) => (a.users || []).find(u => u.name === n);
  const active = (a, n) => ((user(a, n) || {}).keys || []).filter(k => (k.status || 'Active') === 'Active');
  const vcpu = a => a.instances.filter(i => i.state === 'running' || i.state === 'pending').reduce((s, i) => s + (VCPU[i.type] || 2), 0);
  const uuid = n => { const h = x => (x >>> 0).toString(16).padStart(8, '0'); const p = h(n * 2654435761), q = h(n * 40503 + 977);
    return `${p}-${q.slice(0, 4)}-4${q.slice(4, 7)}-a${p.slice(1, 4)}-${q}${p.slice(4, 8)}`; };

  // Event history ki ek row — asli lookup-events shape (CloudTrailEvent = JSON string)
  function event(n, ms, name, source, who, key, ip, extra) {
    const u = who === BACKDOOR ? 'AIDA4SUPPORTOPS9W3M' : 'AIDA4DEPLOYBOT7Q2XK', ro = /^(Get|List|Describe)/.test(name);
    const body = { eventVersion: '1.09', userIdentity: { type: 'IAMUser', principalId: u, arn: `arn:aws:iam::${A}:user/${who}`, accountId: A, accessKeyId: key, userName: who },
      eventTime: iso(ms), eventSource: source, eventName: name, awsRegion: source === 'iam.amazonaws.com' ? 'us-east-1' : R, sourceIPAddress: ip,
      userAgent: ip === CI_IP ? 'aws-cli/2.17.0 md/ci#github-actions' : 'Boto3/1.34.0 Python/3.11.4 Linux/5.15', ...(extra.err ? { errorCode: extra.err[0], errorMessage: extra.err[1] } : {}),
      requestParameters: extra.req || null, responseElements: extra.res || null, eventID: uuid(n), readOnly: ro, eventType: 'AwsApiCall', managementEvent: true,
      recipientAccountId: A, eventCategory: 'Management' };
    return { EventId: uuid(n), EventName: name, ReadOnly: String(ro), AccessKeyId: key, EventTime: ct(ms), EventSource: source, Username: who,
      Resources: extra.resources || [], CloudTrailEvent: JSON.stringify(body) };
  }

  function reconcile(a, sim, clock) {
    const L = a.leak;
    a.now = iso(T0 + clock * 60000);
    const dep = active(a, DEPLOY).length > 0;
    const foreign = dep ? 296 + (clock * 37) % 41 : 0;
    let run = 0;
    const key = !dep && active(a, BACKDOOR)[0];
    if (key && clock > 0) {
      run = 1;
      const ms = T0 + clock * 60000 - 21000, admin = (user(a, BACKDOOR).attachedPolicies || []).includes('AdministratorAccess');
      const req = { instancesSet: { items: [{ imageId: 'ami-0f58b397bc5c1f2e8', minCount: 2, maxCount: 2 }] }, instanceType: 'c5.4xlarge' };
      let err = null, ids = [];
      if (!admin) err = ['Client.UnauthorizedOperation', 'You are not authorized to perform this operation.'];
      else if (vcpu(a) + 32 > QUOTA || L.launched + 2 > MINERS.length) err = ['Client.VcpuLimitExceeded', `You have requested more vCPU capacity than your current vCPU limit of ${QUOTA} allows for the instance bucket that the specified instance type belongs to. Please visit http://aws.amazon.com/contact-us/ec2-request to request an adjustment to this limit.`];
      else {
        ids = MINERS.slice(L.launched, L.launched + 2); L.launched += 2;
        ids.forEach((id, j) => a.instances.push({ id, name: '', type: 'c5.4xlarge', state: 'running', az: 'ap-south-1a', subnetId: 'subnet-0e1a2b3c4d5e6f701',
          vpcId: 'vpc-0c4f2a9e7b1d3e5f6', sgIds: ['sg-0d3c2b1a0f9e8d7c6'], privateIp: `10.0.1.${140 + L.launched + j}`, publicIp: `13.233.${88 + L.launched}.${17 + j * 9}` }));
        L.miners.push(...ids);
      }
      a.managementEvents.unshift(event(100 + clock, ms, 'RunInstances', 'ec2.amazonaws.com', BACKDOOR, key.id, ATTACKER_IP, { req, err,
        res: ids.length ? { instancesSet: { items: ids.map(instanceId => ({ instanceId, instanceType: 'c5.4xlarge', currentState: { code: 0, name: 'pending' } })) } } : null,
        resources: ids.map(id => ({ ResourceType: 'AWS::EC2::Instance', ResourceName: id })) }));
    }
    const values = { foreign, run, vcpu: vcpu(a) };
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, values[s.key])); if (s.points.length > 40) s.points.shift(); });
  }

  const RUNBOOK = `# ShopKaro on-call — security raat (28 Nov, 02:00 se)
Pehle dekho, phir chhuo. Har fix ke BAAD pakka karo.

Alarms:     aws cloudwatch describe-alarms --state-value ALARM
            (deploy-bot-foreign-ip · runinstances-by-iam-user · ec2-vcpu-usage)
CloudTrail: aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=<user>
            (ya AttributeKey=EventName,AttributeValue=RunInstances · AttributeKey=AccessKeyId,AttributeValue=<key>)
            → EventTime, Username, AccessKeyId; CloudTrailEvent ke andar sourceIPAddress aur errorCode
            IAM ke events (CreateUser, CreateAccessKey …) sirf us-east-1 mein: … --region us-east-1
IAM:        aws iam list-users · aws iam list-access-keys --user-name U · aws iam list-attached-user-policies --user-name U
            aws iam update-access-key --user-name U --access-key-id K --status Inactive
            aws iam detach-user-policy --user-name U --policy-arn ${ADMIN}
EC2:        aws ec2 describe-instances · aws ec2 terminate-instances --instance-ids <id> [<id> ...]

Jaankari:
- deploy-bot = CI ka IAM user. CI sirf ${CI_IP} se chalta hai.
- Servers sirf Auto Scaling launch karta hai (service-linked role). Koi IAM user RunInstances nahi chalata.
- Prod: shopkaro-web ke 3 instances (t3.medium). Inhe kabhi terminate mat karo.
- Leak hui key: pehle Inactive (saboot bachta hai, zaroorat pade toh wapas li ja sakti hai), delete baad mein.
  Leak hui key ko wapas Active kabhi nahi.
- CloudTrail band mat karna — wahi saboot hai.
`;

  AG.oncall.add({
    id: 'keyleak', start: 2 * 60,
    INC: [
      { id: 'DeployBotKeyAbuse', sev: '🔴 SEV1', text: 'deploy-bot ki access key se CI ke bahar ke IP se ~300 calls/min. 01:40 par yeh key ek public GitHub commit mein dikhi thi.',
        fixed: a => active(a, DEPLOY).length === 0,
        verify: /^aws cloudwatch describe-alarms\b|^aws iam list-access-keys\b(?=.*--user-name\s+deploy-bot\b)/, verifyText: 'alarms ya deploy-bot ki keys dobara dekho',
        hints: [`cat runbook.md, phir aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=${DEPLOY} — sourceIPAddress kya hai, aur 01:47 ke baad kaunse EventName hue?`,
          'Pehle khoon roko: leak hui key turant Inactive karo. Inactive key ki har request ruk jaati hai, par key aur uska saboot bachta hai. User ya policy abhi mat chhedo.',
          `aws iam list-access-keys --user-name ${DEPLOY}, phir aws iam update-access-key --user-name ${DEPLOY} --access-key-id ${DEPLOY_KEY} --status Inactive, phir aws cloudwatch describe-alarms --state-value ALARM`] },
      { id: 'RunInstancesByIamUser', sev: '🔴 SEV1', text: 'Ek IAM user har minute RunInstances chala raha hai. Hamare servers sirf Auto Scaling launch karta hai, koi IAM user nahi.',
        fixed: a => !user(a, BACKDOOR) || active(a, BACKDOOR).length === 0,
        verify: /^aws iam list-access-keys\b(?=.*--user-name\s+support-ops\b)|^aws cloudwatch describe-alarms\b/, verifyText: 'support-ops ki keys ya alarms dobara dekho',
        hints: [`aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=RunInstances — Username aur AccessKeyId kaun hai? Yeh user kisne banaya? IAM ke events us-east-1 mein hain: ${'aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=' + DEPLOY} --region us-east-1`,
          'deploy-bot par AdministratorAccess tha, isliye attacker ne us key se backdoor user support-ops bana liya — admin policy aur 2 access keys ke saath. Ek user ki 2 keys ho sakti hain: DONO band karo, phir admin policy hatao.',
          `aws iam list-access-keys --user-name ${BACKDOOR}, phir update-access-key --status Inactive dono keys par (${K1}, ${K2}), phir aws iam detach-user-policy --user-name ${BACKDOOR} --policy-arn ${ADMIN}, phir aws iam list-access-keys --user-name ${BACKDOOR}`] },
      { id: 'Ec2VcpuUsageHigh', sev: '🟠 SEV2', text: 'EC2 vCPU usage 70 — hamara normal 6 hai. Attacker ke chalaye instances abhi bhi chal rahe hain, aur har ghante ka paisa lag raha hai.',
        fixed: a => a.leak.miners.every(id => (a.instances.find(i => i.id === id) || {}).state === 'terminated'),
        verify: /^aws ec2 describe-instances\b|^aws cloudwatch describe-alarms\b/, verifyText: 'instances ya alarms dobara dekho',
        hints: ['aws ec2 describe-instances — kaunse instances c5.4xlarge hain aur bina Name tag ke? RunInstances ke CloudTrail events ke Resources mein bhi wahi instance IDs hain.',
          'Sirf attacker ke instances terminate karo. shopkaro-web ke 3 t3.medium prod hain — unhe mat chhedo. Stop kaafi nahi: stopped instance ki EBS ka paisa lagta rehta hai, aur use koi phir start kar sakta hai.',
          `aws ec2 terminate-instances --instance-ids ${MINERS.slice(0, 4).join(' ')}, phir aws ec2 describe-instances`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const series = (key, namespace, metric, unit, dims) => ({ key, seriesId: 'keyleak-' + key, version: 1, period: 60, namespace, metric, unit, dimensions: dims, points: [] });
      const usage = [{ Name: 'Service', Value: 'EC2' }, { Name: 'Type', Value: 'Resource' }, { Name: 'Resource', Value: 'vCPU' }, { Name: 'Class', Value: 'Standard/OnDemand' }];
      const alarm = (name, key, ns, metric, dims, stat, threshold) => ({ name, alarmId: 'keyleak-' + key, revision: 0, state: 'INSUFFICIENT_DATA',
        definition: { AlarmName: name, Namespace: ns, MetricName: metric, Dimensions: dims, Statistic: stat, Threshold: threshold, ComparisonOperator: 'GreaterThanThreshold',
          Period: 60, EvaluationPeriods: 1, DatapointsToAlarm: 1, TreatMissingData: 'missing' } });
      const web = (id, n, az) => ({ id, name: 'shopkaro-web', type: 't3.medium', state: 'running', az, subnetId: az === 'ap-south-1a' ? 'subnet-0e1a2b3c4d5e6f701' : 'subnet-0f2b3c4d5e6f7a812',
        vpcId: 'vpc-0c4f2a9e7b1d3e5f6', sgIds: ['sg-0a1b2c3d4e5f60718'], privateIp: `10.0.${az === 'ap-south-1a' ? 1 : 2}.${20 + n}`, publicIp: null });
      const T = ms => T0 + ms * 1000;
      const seed = [
        event(7, T(-422), 'CreateAccessKey', 'iam.amazonaws.com', DEPLOY, DEPLOY_KEY, ATTACKER_IP, { req: { userName: BACKDOOR },
          res: { accessKey: { userName: BACKDOOR, accessKeyId: K2, status: 'Active', createDate: 'Nov 27, 2026 8:22:58 PM' } },
          resources: [{ ResourceType: 'AWS::IAM::AccessKey', ResourceName: K2 }, { ResourceType: 'AWS::IAM::User', ResourceName: BACKDOOR }] }),
        event(6, T(-428), 'CreateAccessKey', 'iam.amazonaws.com', DEPLOY, DEPLOY_KEY, ATTACKER_IP, { req: { userName: BACKDOOR },
          res: { accessKey: { userName: BACKDOOR, accessKeyId: K1, status: 'Active', createDate: 'Nov 27, 2026 8:22:52 PM' } },
          resources: [{ ResourceType: 'AWS::IAM::AccessKey', ResourceName: K1 }, { ResourceType: 'AWS::IAM::User', ResourceName: BACKDOOR }] }),
        event(5, T(-433), 'AttachUserPolicy', 'iam.amazonaws.com', DEPLOY, DEPLOY_KEY, ATTACKER_IP, { req: { userName: BACKDOOR, policyArn: ADMIN },
          resources: [{ ResourceType: 'AWS::IAM::Policy', ResourceName: ADMIN }, { ResourceType: 'AWS::IAM::User', ResourceName: BACKDOOR }] }),
        event(4, T(-439), 'CreateUser', 'iam.amazonaws.com', DEPLOY, DEPLOY_KEY, ATTACKER_IP, { req: { userName: BACKDOOR },
          res: { user: { path: '/', userName: BACKDOOR, userId: 'AIDA4SUPPORTOPS9W3M', arn: `arn:aws:iam::${A}:user/${BACKDOOR}`, createDate: 'Nov 27, 2026 8:22:41 PM' } },
          resources: [{ ResourceType: 'AWS::IAM::User', ResourceName: BACKDOOR }] }),
        event(3, T(-711), 'ListBuckets', 's3.amazonaws.com', DEPLOY, DEPLOY_KEY, ATTACKER_IP, { req: { Host: 's3.ap-south-1.amazonaws.com' } }),
        event(2, T(-747), 'GetCallerIdentity', 'sts.amazonaws.com', DEPLOY, DEPLOY_KEY, ATTACKER_IP, {}),
        event(1, T(-2928), 'UpdateFunctionCode20150331v2', 'lambda.amazonaws.com', DEPLOY, DEPLOY_KEY, CI_IP, { req: { functionName: 'shopkaro-api', publish: true },
          resources: [{ ResourceType: 'AWS::Lambda::Function', ResourceName: 'shopkaro-api' }] }),
      ];
      const account = {
        region: R, now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:user/neha` },
        trailByRegion: true,
        trailNote: 'Training Event history: sirf management events, sirf us Region ke jo --region mein ho (warna ap-south-1). IAM jaisi global service ke events us-east-1 mein dikhte hain. Shift mein events har minute judte hain; asli AWS mein aksar kuch minute der se aate hain. S3 GetObject jaise data events Event history mein nahi aate.',
        users: [
          { name: 'neha', id: 'AIDA4NEHAONCALL2K8P', created: '2025-06-03T08:30:00Z', attachedPolicies: ['AdministratorAccess'], keys: [] },
          { name: 'ravi', id: 'AIDA4RAVIDEV0M3Q7T', created: '2025-09-14T06:05:00Z', groups: ['developers'], attachedPolicies: [], keys: [{ id: 'AKIA4RAVIDEVK8P2M6LQ', status: 'Active', created: '2026-08-01T09:41:00Z' }] },
          { name: DEPLOY, id: 'AIDA4DEPLOYBOT7Q2XK', created: '2026-03-02T10:12:00Z', attachedPolicies: ['AdministratorAccess'], keys: [{ id: DEPLOY_KEY, status: 'Active', created: '2026-03-02T10:14:00Z' }] },
          { name: BACKDOOR, id: 'AIDA4SUPPORTOPS9W3M', created: '2026-11-27T20:22:41Z', attachedPolicies: ['AdministratorAccess'],
            keys: [{ id: K1, status: 'Active', created: '2026-11-27T20:22:52Z' }, { id: K2, status: 'Active', created: '2026-11-27T20:22:58Z' }] },
        ],
        groups: [{ name: 'developers', users: ['ravi'], inline: { 'reports-read': { Version: '2012-10-17', Statement: [
          { Effect: 'Allow', Action: 's3:ListBucket', Resource: 'arn:aws:s3:::shopkaro-reports' },
          { Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::shopkaro-reports/*' }] } } }],
        instances: [web(WEB[0], 1, 'ap-south-1a'), web(WEB[1], 2, 'ap-south-1b'), web(WEB[2], 3, 'ap-south-1a')],
        managementEvents: seed,
        capacityMetrics: [series('foreign', 'CloudTrailMetrics', 'DeployBotForeignIpCalls', 'Count', []),
          series('run', 'CloudTrailMetrics', 'RunInstancesByIamUser', 'Count', []),
          series('vcpu', 'AWS/Usage', 'ResourceCount', 'None', usage)],
        alarms: [alarm('deploy-bot-foreign-ip', 'foreign', 'CloudTrailMetrics', 'DeployBotForeignIpCalls', [], 'Sum', 10),
          alarm('runinstances-by-iam-user', 'run', 'CloudTrailMetrics', 'RunInstancesByIamUser', [], 'Sum', 0),
          alarm('ec2-vcpu-usage', 'vcpu', 'AWS/Usage', 'ResourceCount', usage, 'Maximum', 32)],
        leak: { launched: 0, miners: [] },
      };
      const KEYS = 'AKIA4SHOPDEPLOYB7Q2X|AKIA4SUPPORTK1N8WZ3R|AKIA4SUPPORTK2Q5HV7T';
      const responses = [
        risky(new RegExp(`^aws ec2 terminate-instances\\b(?=.*\\b(${WEB.join('|')})\\b)`), 'prod ka shopkaro-web instance terminate karna — site gir jaati, attacker ka kuch nahi bigadta.'),
        risky(/^aws cloudtrail (stop-logging|delete-trail)\b/, 'CloudTrail band karna — attacker ka saboot hi mit jaata. Yahi kaam attacker khud karna chahta hai.'),
        risky(new RegExp(`^aws iam update-access-key\\b(?=.*\\b(${KEYS})\\b)(?=.*--status\\s+Active\\b)`), 'leak hui key wapas Active karna — attacker ka darwaza phir khul jaata.'),
        risky(/^aws iam attach-user-policy\b(?=.*AdministratorAccess)/, 'kisi user ko AdministratorAccess dena — incident ke beech nayi power nahi, kam karni hai.'),
        { re: /^help$/, out: 'On-call: cat runbook.md se shuru karo. aws cloudwatch describe-alarms · aws cloudtrail lookup-events · aws iam list-users / list-access-keys / update-access-key / detach-user-policy · aws ec2 describe-instances / terminate-instances. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(R, A),
      ];
      const look = (k, v) => `aws cloudtrail lookup-events --lookup-attributes AttributeKey=${k},AttributeValue=${v}`;
      return {
        account, files: { 'runbook.md': { desc: 'On-call runbook', content: RUNBOOK } }, responses,
        placeholder: 'cat runbook.md   (phir: aws cloudwatch describe-alarms --state-value ALARM)',
        goal: 'Raat 02:00, security ka pager. CI ki access key public GitHub par leak hui. Har alert ko <b>dhoondho, band karo, phir pakka karo</b>. Har alert pichhle fix ke baad aata hai. Runbook todne wale commands simulator rok dega.',
        successText: 'Leak hui key Inactive, backdoor user ki <b>dono</b> keys band aur admin policy hati, attacker ke instances khatam. Jad ki wajah: CI user par <b>AdministratorAccess</b> aur permanent key. Kal ka kaam: CI ko role (temporary credentials) par le jao, deploy-bot ki policy scoped karo, purani keys delete karo.',
        solution: ['cat runbook.md', 'aws cloudwatch describe-alarms --state-value ALARM', look('Username', DEPLOY),
          `aws iam list-access-keys --user-name ${DEPLOY}`, `aws iam update-access-key --user-name ${DEPLOY} --access-key-id ${DEPLOY_KEY} --status Inactive`,
          'aws cloudwatch describe-alarms --state-value ALARM',
          look('EventName', 'RunInstances'), look('Username', DEPLOY) + ' --region us-east-1', `aws iam list-access-keys --user-name ${BACKDOOR}`,
          `aws iam update-access-key --user-name ${BACKDOOR} --access-key-id ${K1} --status Inactive`,
          `aws iam update-access-key --user-name ${BACKDOOR} --access-key-id ${K2} --status Inactive`,
          `aws iam detach-user-policy --user-name ${BACKDOOR} --policy-arn ${ADMIN}`, `aws iam list-access-keys --user-name ${BACKDOOR}`,
          'aws ec2 describe-instances', `aws ec2 terminate-instances --instance-ids ${MINERS.slice(0, 4).join(' ')}`, 'aws ec2 describe-instances'],
      };
    },
  });

  AG.addLab('iam', {
    type: 'oncall', id: 'oncall-keyleak', shift: 'keyleak', title: '📟 On-call: leak hui access key',
    intro: 'Raat 02:00. CI ki access key public GitHub par chali gayi. <b>Dekho → band karo → pakka karo</b>. Har command = 1 minute.',
  });
})();
