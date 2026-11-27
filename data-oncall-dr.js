/* 📟 On-call shift 'dr-drill' — dr level (Region gire toh business kaise chale). Engine: oncall.js.
   30 Nov, 11:00. Quarterly DR drill (asli outage NAHI — Mumbai chal raha hai). Pilot light: Hyderabad (ap-south-2) mein orders-dr
   read replica live, web ASG shop-web-dr 0 par. Drill: ASG 0 → 6, smoke test, RPO ka saboot, phir wapas pilot light.
   Teen JUDE alerts (level ke triage aur red flags se):
     1 DrillWebZeroInService  ASG desired 6, 20 min baad bhi 0 InService. Launch template ka AMI "resolve:ssm:/shopkaro/web/ami-id" se
                              aata hai — aur Hyderabad ke parameter mein MUMBAI ka AMI ID hai (AMI ID har Region mein alag). Copy kiya
                              hua AMI Hyderabad mein pehle se hai. Fix: Hyderabad ka parameter (--region ap-south-2!).
     2 DrillNoRpoProof        drill checklist: "RPO 5 min ka saboot — ReplicaLag alarm". orders-dr par alarm hai hi nahi.
                              Fix: ReplicaLag > 300 s par alarm, pager ke saath (us Region mein jahan metric hai).
     3 DrillBackToPilotLight  drill pass. Hyderabad ko wapas 0 par lao (kharcha). Replica promote MAT karo — drill hai, Mumbai live hai.
   Fixture: dr level ka ready DR account clone (drMode: multi-Region RDS, images, backup). ASG, launch template aur us parameter ke
   responses yahan asli shape mein (Region ke hisaab se). Model (har minute): parameter Hyderabad ki available image par ho toh
   ASG har minute 3 instances InService karta; warna har ~2 minute ek "image id does not exist" wali failed activity. */
(function () {
  const A = '123456789012', MUM = 'ap-south-1', HYD = 'ap-south-2', ASG = 'shop-web-dr', PARAM = '/shopkaro/web/ami-id';
  const T0 = Date.parse('2026-11-30T05:30:00Z');                     // 11:00 IST
  const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  const MUM_AMI = 'ami-0a1b2c3d4e5f60001', DR_AMI = 'ami-0d000000000000001', LT = 'lt-0a9b8c7d6e5f43210';
  const PAGER = `arn:aws:sns:${HYD}:${A}:oncall-pager`;
  const regionOf = cmd => (cmd.match(/--region\s+(\S+)/) || [])[1] || MUM;
  const flagOf = (cmd, n) => (cmd.match(new RegExp('--' + n + '\\s+(\\S+)')) || [])[1];
  const hydImage = (a, id) => (a.drImages || []).some(i => i.id === id && i.region === HYD && i.state === 'available');
  const launchOk = a => hydImage(a, a.drill.params[HYD].value);
  const lagAlarm = a => (a.alarms || []).find(al => { const d = al.definition || {}; if (al.region !== HYD) return false;
    return d.Namespace === 'AWS/RDS' && d.MetricName === 'ReplicaLag' && (d.Dimensions || []).some(x => x.Name === 'DBInstanceIdentifier' && x.Value === 'orders-dr')
      && /^GreaterThan/.test(d.ComparisonOperator) && d.Threshold <= 300 && d.ActionsEnabled !== false && (d.AlarmActions || []).includes(PAGER); });
  const ids = n => Array.from({ length: n }, (_, i) => 'i-0' + (0x5d2e7a91c4b3f60 + i * 0x1f3a2b).toString(16).padStart(16, '0').slice(-16));

  function reconcile(a, sim, clock) {
    a.now = iso(T0 + clock * 60000);
    const D = a.drill, ms = T0 + clock * 60000;
    if (D.desired > D.inService.length) {
      if (launchOk(a)) {
        const add = Math.min(3, D.desired - D.inService.length), fresh = ids(D.launched + add).slice(D.launched);
        D.launched += add; D.inService.push(...fresh);
        fresh.forEach(id => D.activities.unshift({ ok: true, at: ms - 40000, id }));
      } else if (clock % 2 === 0) D.activities.unshift({ ok: false, at: ms - 30000 });
    } else if (D.desired < D.inService.length) {
      D.inService.splice(D.desired).forEach(id => D.activities.unshift({ ok: true, at: ms - 20000, id, term: true }));
    }
    if (D.activities.length > 12) D.activities.length = 12;
    const lag = 2 + (clock * 7) % 3;
    a.capacityMetrics.forEach(s => { s.points.push(AG.oncall.point(a.now, s.key === 'lag' ? lag : D.inService.length)); if (s.points.length > 40) s.points.shift(); });
  }

  // ---------- asli shape ke responses (Region ke hisaab se) ----------
  const actId = (at, n) => { const h = ((at / 1000) * 2654435761 + n * 40503).toString(16).replace('.', '').padEnd(32, '7c2e9a41').slice(0, 32);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  const asgArn = `arn:aws:autoscaling:${HYD}:${A}:autoScalingGroup:6b2f9e1c-3a7d-4c85-9e10-d4a8b7c6f521:autoScalingGroupName/${ASG}`;
  function asgOut(sim, m) {
    if (regionOf(m.input) !== HYD) return JSON.stringify({ AutoScalingGroups: [] }, null, 4);
    const D = sim.account.drill;
    return JSON.stringify({ AutoScalingGroups: [{ AutoScalingGroupName: ASG, AutoScalingGroupARN: asgArn,
      LaunchTemplate: { LaunchTemplateId: LT, LaunchTemplateName: ASG, Version: '$Latest' }, MinSize: D.min, MaxSize: 6, DesiredCapacity: D.desired, DefaultCooldown: 300,
      AvailabilityZones: ['ap-south-2a', 'ap-south-2b'], LoadBalancerNames: [], TargetGroupARNs: [`arn:aws:elasticloadbalancing:${HYD}:${A}:targetgroup/shop-web-dr/3e9c1a7b5d2f8064`],
      HealthCheckType: 'ELB', HealthCheckGracePeriod: 300,
      Instances: D.inService.map((id, i) => ({ InstanceId: id, InstanceType: 'c6g.large', AvailabilityZone: i % 2 ? 'ap-south-2b' : 'ap-south-2a', LifecycleState: 'InService',
        HealthStatus: 'Healthy', LaunchTemplate: { LaunchTemplateId: LT, LaunchTemplateName: ASG, Version: '3' }, ProtectedFromScaleIn: false })),
      CreatedTime: '2026-03-14T09:20:11.418Z', VPCZoneIdentifier: 'subnet-0d7e2a91c4b3f5d06,subnet-0e8f3b02d5c4a6e17', TerminationPolicies: ['Default'], NewInstancesProtectedFromScaleIn: false }] }, null, 4);
  }
  function activitiesOut(sim, m) {
    if (regionOf(m.input) !== HYD) return 'An error occurred (ValidationError) when calling the DescribeScalingActivities operation: Group shop-web-dr not found';
    const D = sim.account.drill;
    return JSON.stringify({ Activities: D.activities.map((x, n) => ({ ActivityId: actId(x.at, n), AutoScalingGroupName: ASG,
      Description: x.ok ? `${x.term ? 'Terminating' : 'Launching a new'} EC2 instance: ${x.id}` : 'Launching a new EC2 instance.  Status Reason: The image id \'[' + D.params[HYD].value + ']\' does not exist. Launching EC2 instance failed.',
      Cause: `At ${iso(x.at - 1000)} ${x.term ? 'a user request update of AutoScalingGroup constraints changed the desired capacity' : 'an instance was started in response to a difference between desired and actual capacity, increasing the capacity from ' + D.inService.length + ' to ' + D.desired}.`,
      StartTime: new Date(x.at).toISOString(), EndTime: new Date(x.at + 3000).toISOString(), StatusCode: x.ok ? 'Successful' : 'Failed',
      ...(x.ok ? {} : { StatusMessage: 'The image id \'[' + D.params[HYD].value + ']\' does not exist. Launching EC2 instance failed.' }), Progress: 100,
      Details: JSON.stringify({ 'Subnet ID': 'subnet-0d7e2a91c4b3f5d06', 'Availability Zone': 'ap-south-2a' }) })) }, null, 4);
  }
  const ltOut = (sim, m) => regionOf(m.input) !== HYD
    ? 'An error occurred (InvalidLaunchTemplateName.NotFoundException) when calling the DescribeLaunchTemplateVersions operation: At least one of the launch templates specified in the request does not exist.'
    : JSON.stringify({ LaunchTemplateVersions: [{ LaunchTemplateId: LT, LaunchTemplateName: ASG, VersionNumber: 3, CreateTime: '2026-09-02T07:41:18.000Z',
      CreatedBy: `arn:aws:iam::${A}:role/infra-deployer`, DefaultVersion: true, LaunchTemplateData: { ImageId: `resolve:ssm:${PARAM}`, InstanceType: 'c6g.large',
        IamInstanceProfile: { Name: 'shop-web' }, SecurityGroupIds: ['sg-0c6d2e8f1a3b5c7d9'], MetadataOptions: { HttpTokens: 'required' } } }] }, null, 4);
  const paramGet = { re: new RegExp(`^aws ssm get-parameter\\b(?=.*--name\\s+${PARAM.replace(/\//g, '\\/')}(\\s|$))`), err: false, out(sim, m) {
    const p = sim.account.drill.params[regionOf(m.input)]; this.err = !p;
    if (!p) return 'An error occurred (ParameterNotFound) when calling the GetParameter operation: ';
    return JSON.stringify({ Parameter: { Name: PARAM, Type: 'String', Value: p.value, Version: p.version, LastModifiedDate: p.modified,
      ARN: `arn:aws:ssm:${regionOf(m.input)}:${A}:parameter${PARAM}`, DataType: 'text' } }, null, 4); } };
  const paramPut = { re: new RegExp(`^aws ssm put-parameter\\b(?=.*--name\\s+${PARAM.replace(/\//g, '\\/')}(\\s|$))`), err: false,
    mutate(sim, m) { const p = sim.account.drill.params[regionOf(m.input)], v = flagOf(m.input, 'value');
      this.err = !p || !v || !/--overwrite\b/.test(m.input) || !flagOf(m.input, 'type');
      if (!this.err) { p.value = v; p.version++; p.modified = sim.account.now; } },
    out(sim, m) { if (!flagOf(m.input, 'type') || !flagOf(m.input, 'value')) return 'aws: error: the following arguments are required: --type, --value';
      if (!/--overwrite\b/.test(m.input)) return 'An error occurred (ParameterAlreadyExists) when calling the PutParameter operation: The parameter already exists. To overwrite this value, set the overwrite option in the request to true.';
      const p = sim.account.drill.params[regionOf(m.input)]; return JSON.stringify({ Version: p.version, Tier: 'Standard' }, null, 4); } };
  const asgUpdate = { re: /^aws autoscaling update-auto-scaling-group\b/, err: false,
    mutate(sim, m) { const D = sim.account.drill, okR = regionOf(m.input) === HYD && flagOf(m.input, 'auto-scaling-group-name') === ASG;
      this.err = !okR; if (!okR) return;
      const d = flagOf(m.input, 'desired-capacity'), mn = flagOf(m.input, 'min-size');
      if (mn != null) D.min = Number(mn); if (d != null) D.desired = Number(d); },
    out(sim, m) { return this.err ? 'An error occurred (ValidationError) when calling the UpdateAutoScalingGroup operation: AutoScalingGroup name not found - null' : ''; } };

  const RUNBOOK = `# ShopKaro DR drill — quarterly (30 Nov, 11:00) · Mumbai (ap-south-1) LIVE hai, yeh sirf drill hai
Pilot light: Hyderabad (ap-south-2) mein orders-dr replica live, web ASG ${ASG} 0 par.

ASG:      aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG} --region ${HYD}
          aws autoscaling describe-scaling-activities --auto-scaling-group-name ${ASG} --region ${HYD}
          aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} [--min-size N] [--desired-capacity N] --region ${HYD}
Template: aws ec2 describe-launch-template-versions --launch-template-name ${ASG} --versions '$Latest' --region ${HYD}
AMI:      aws ssm get-parameter --name ${PARAM} --region <region>
          aws ssm put-parameter --name ${PARAM} --value <ami-id> --type String --overwrite --region <region>
          aws ec2 describe-images --owners self --region <region>
DB:       aws rds describe-db-instances --region ${HYD}
Alarms:   aws cloudwatch describe-alarms --region <region>      (alarm usi Region mein jahan metric hai)
          aws cloudwatch put-metric-alarm …  (ReplicaLag: AWS/RDS, DBInstanceIdentifier=orders-dr, Seconds)

Drill checklist:
1. ASG 0 → 6, saare InService.        2. RPO 5 min ka saboot: orders-dr par ReplicaLag alarm (> 300 s) pager ${PAGER} tak.
3. Drill ke baad wapas pilot light: min 0, desired 0. Jo theek kiya woh RAKHO.
Niyam: AMI ID har Region ka alag. Bina --region command Mumbai (ap-south-1) par jaata hai.
       Drill mein replica PROMOTE mat karo — Mumbai live hai; promote = replication hamesha ke liye toot.
`;

  AG.oncall.add({
    id: 'dr-drill', start: 11 * 60,
    INC: [
      { id: 'DrillWebZeroInService', sev: '🟠 SEV2', text: `DR drill: ${ASG} (Hyderabad) desired 6, par 20 minute se 0 InService. Drill ki ghadi chal rahi hai (RTO target 30 min).`,
        fixed: launchOk,
        verify: /^aws autoscaling describe-(auto-scaling-groups|scaling-activities)\b(?=.*--region\s+ap-south-2)/, verifyText: 'Hyderabad ka ASG ya activities dobara dekho (--region ap-south-2)',
        hints: [`cat runbook.md, phir aws autoscaling describe-scaling-activities --auto-scaling-group-name ${ASG} --region ${HYD} — StatusMessage kya kehta hai?`,
          `Image ID ka matlab: launch template "resolve:ssm:${PARAM}" se AMI leta hai. AMI ID har Region mein alag hota hai — Hyderabad ke parameter mein Mumbai ka ID hai. Hyderabad mein copy kiya AMI describe-images --region ${HYD} mein dekho. Parameter sirf Hyderabad mein badlo (--region!).`,
          `aws ssm get-parameter --name ${PARAM} --region ${HYD}, phir aws ssm put-parameter --name ${PARAM} --value ${DR_AMI} --type String --overwrite --region ${HYD}, phir aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG} --region ${HYD}`] },
      { id: 'DrillNoRpoProof', sev: '🟠 SEV2', text: 'Drill checklist #2: RPO (5 min) ka saboot chahiye — orders-dr par ReplicaLag alarm. describe-alarms mein koi nahi mila.',
        fixed: a => !!lagAlarm(a),
        verify: /^aws cloudwatch describe-alarms\b(?=.*--region\s+ap-south-2)/, verifyText: 'Hyderabad ke alarms dobara dekho (--region ap-south-2)',
        hints: ['aws rds describe-db-instances --region ap-south-2 — orders-dr kahan hai? Phir aws cloudwatch describe-alarms --region ap-south-2 — ReplicaLag ka koi alarm?',
          'Replica async hai: lag = jitna data Region girne par ja sakta hai (RPO). Lag ka alarm nahi = RPO ka koi saboot nahi. ReplicaLag metric Hyderabad mein hai, toh alarm bhi wahin (--region ap-south-2): AWS/RDS ReplicaLag (seconds), threshold 300 (5 min), pager ke saath.',
          `aws cloudwatch put-metric-alarm --alarm-name orders-dr-replica-lag --namespace AWS/RDS --metric-name ReplicaLag --dimensions Name=DBInstanceIdentifier,Value=orders-dr --statistic Maximum --threshold 300 --comparison-operator GreaterThanThreshold --period 60 --evaluation-periods 3 --datapoints-to-alarm 3 --treat-missing-data breaching --alarm-actions ${PAGER} --region ${HYD}, phir aws cloudwatch describe-alarms --region ${HYD}`] },
      { id: 'DrillBackToPilotLight', sev: '🟡 SEV3', text: 'Drill pass (RTO 24 min). Drill lead: "Hyderabad ko wapas pilot light par lao — 6 c6g.large bekaar chal rahe hain. Jo theek kiya woh rakhna."',
        fixed: a => a.drill.desired === 0 && a.drill.min === 0 && launchOk(a) && !!lagAlarm(a),
        verify: /^aws autoscaling describe-auto-scaling-groups\b(?=.*--region\s+ap-south-2)/, verifyText: 'Hyderabad ka ASG dobara dekho',
        hints: [`aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG} --region ${HYD} — MinSize aur DesiredCapacity kya hain?`,
          'Pilot light = data live (replica), compute band. ASG ko 0 par lao (min bhi 0). AMI parameter aur ReplicaLag alarm mat hatao — agli baar ka asli failover unhi par chalega. Replica promote MAT karo.',
          `aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --min-size 0 --desired-capacity 0 --region ${HYD}, phir aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG} --region ${HYD}`] },
    ],
    reconcile,
    build: ({ risky }) => {
      const level = AG.findLevel('dr'), src = level.interview.questions.find(q => q.terminal).terminal.account;
      const account = JSON.parse(JSON.stringify(src).replaceAll('333333333333', A).replaceAll('sg-0hyd0db00000000a1', 'sg-0a7d0db00000000a1'));
      Object.assign(account, { now: iso(T0), callerIdentity: { Account: A, UserId: 'AIDA4NEHAONCALL2K8P', Arn: `arn:aws:iam::${A}:role/dr-operator` },
        topics: [{ name: 'oncall-pager', arn: PAGER, topicId: 'drill-pager', attributes: {}, dedup: [], subscriptions: [] }],
        capacityMetrics: [{ key: 'lag', seriesId: 'drill-lag', version: 1, period: 60, namespace: 'AWS/RDS', metric: 'ReplicaLag', unit: 'Seconds',
          dimensions: [{ Name: 'DBInstanceIdentifier', Value: 'orders-dr' }], points: [] },
          { key: 'asg', seriesId: 'drill-asg', version: 1, period: 60, namespace: 'AWS/AutoScaling', metric: 'GroupInServiceInstances', unit: 'None',
            dimensions: [{ Name: 'AutoScalingGroupName', Value: ASG }], points: [] }],
        alarms: [], alarmRegions: [MUM, HYD],
        drill: { desired: 6, min: 0, inService: [], launched: 0,
          activities: [{ ok: false, at: T0 - 120000 }, { ok: false, at: T0 - 600000 }, { ok: false, at: T0 - 1140000 }],
          params: { [MUM]: { value: MUM_AMI, version: 7, modified: '2026-10-24T08:12:40.511Z' }, [HYD]: { value: MUM_AMI, version: 2, modified: '2026-10-24T08:12:44.902Z' } } } });
      const responses = [
        risky(/^aws rds promote-read-replica\b/, 'drill mein replica promote — Mumbai live hai; promote se replication hamesha ke liye toot jaata, asli DR kamzor.'),
        risky(/^aws rds (delete-db-instance|modify-db-instance)\b/, 'drill ke beech DB chhedna — drill sirf saboot ke liye hai.'),
        risky(/^aws ec2 deregister-image\b/, 'AMI hatana — isi image par agla asli failover chalega.'),
        risky(new RegExp(`^aws ssm put-parameter\\b(?=.*--name\\s+${PARAM.replace(/\//g, '\\/')})(?!.*--region\\s+${HYD})`), 'Mumbai ka parameter badalna — Mumbai prod ke naye instances galat AMI ID se launch nahi honge. --region ap-south-2 do.'),
        { re: /^aws autoscaling describe-auto-scaling-groups\b/, out: asgOut },
        { re: /^aws autoscaling describe-scaling-activities\b/, err: false, out(sim, m) { this.err = regionOf(m.input) !== HYD; return activitiesOut(sim, m); } },
        { re: /^aws ec2 describe-launch-template-versions\b/, err: false, out(sim, m) { this.err = regionOf(m.input) !== HYD; return ltOut(sim, m); } },
        paramGet, paramPut, asgUpdate,
        { re: /^help$/, out: 'DR drill: cat runbook.md se shuru karo. aws autoscaling describe-auto-scaling-groups / describe-scaling-activities / update-auto-scaling-group · aws ec2 describe-launch-template-versions / describe-images · aws ssm get-parameter / put-parameter · aws rds describe-db-instances · aws cloudwatch describe-alarms / put-metric-alarm. Har command = 1 minute.' },
        AG.oncall.alarmsResponse(MUM, A),
      ];
      return {
        account, files: { 'runbook.md': { desc: 'DR drill runbook', content: RUNBOOK } }, responses,
        placeholder: `cat runbook.md   (phir: aws autoscaling describe-scaling-activities --auto-scaling-group-name ${ASG} --region ${HYD})`,
        goal: 'Subah 11:00, quarterly DR drill. Mumbai live hai — yeh drill hai. Har alert ko <b>dhoondho, theek karo, phir pakka karo</b>. Runbook todne wale commands simulator rok dega.',
        successText: 'Hyderabad ka AMI parameter ab Hyderabad ki image par (<b>AMI ID har Region ka alag</b>), orders-dr par <b>ReplicaLag alarm</b> = RPO ka saboot, aur drill ke baad wapas <b>pilot light</b> — replica promote kiye bina. Yahi drill ka matlab: asli din se pehle galtiyan pakadna.',
        solution: ['cat runbook.md', `aws autoscaling describe-scaling-activities --auto-scaling-group-name ${ASG} --region ${HYD}`,
          `aws ec2 describe-launch-template-versions --launch-template-name ${ASG} --versions '$Latest' --region ${HYD}`,
          `aws ssm get-parameter --name ${PARAM} --region ${HYD}`, `aws ec2 describe-images --owners self --region ${HYD}`,
          `aws ssm put-parameter --name ${PARAM} --value ${DR_AMI} --type String --overwrite --region ${HYD}`,
          `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG} --region ${HYD}`,
          `aws cloudwatch describe-alarms --region ${HYD}`,
          `aws cloudwatch put-metric-alarm --alarm-name orders-dr-replica-lag --namespace AWS/RDS --metric-name ReplicaLag --dimensions Name=DBInstanceIdentifier,Value=orders-dr --statistic Maximum --threshold 300 --comparison-operator GreaterThanThreshold --period 60 --evaluation-periods 3 --datapoints-to-alarm 3 --treat-missing-data breaching --alarm-actions ${PAGER} --region ${HYD}`,
          `aws cloudwatch describe-alarms --region ${HYD}`,
          `aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --min-size 0 --desired-capacity 0 --region ${HYD}`,
          `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG} --region ${HYD}`],
      };
    },
  });

  AG.addLab('dr', {
    type: 'oncall', id: 'oncall-dr-drill', shift: 'dr-drill', title: '📟 On-call: DR drill ka din',
    intro: 'Subah 11:00, quarterly DR drill. Hyderabad jaagna nahi chahta. <b>Dekho → theek karo → saboot do → wapas pilot light</b>. Har command = 1 minute.',
  });
})();
