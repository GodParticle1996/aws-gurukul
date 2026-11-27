/* 🎲 Chaos deck 'elbasg' — Beginner track, level elbasg (ALB + ASG). Engine: chaos.js. Terminal: awscli.js ka simulator.
   Swasth base: shop-web ALB → target group (path /healthz, matcher 200, traffic-port, sgAware) → 4 instances (ASG, ELB health),
   app SG mein sirf ALB ke SG se 8080. Target health AG.targetHealth (awscli.js) nikaalta hai.
   Probe (base par): curl → 200 · describe-target-health → 4/4 healthy · describe-auto-scaling-groups → 4 Healthy, type ELB.
   ALB ka fail-open (level mein sikhaya): saare targets laal hon toh bhi ALB sab ko bhejta hai — isliye health check ki galti
   mein curl 200 deta hai; sirf asli raasta band ho (SG) toh 504.
   Har card EK config badlaav (simulator par chala ke dekha, 2026-11-26):
     hc-path     4/4 unhealthy · Target.ResponseCodeMismatch [404] · curl 200 (fail-open)
     hc-matcher  4/4 unhealthy · Target.ResponseCodeMismatch [200] · curl 200
     hc-port     4/4 unhealthy · Target.Timeout · HealthCheckPort 9090 · curl 200
     sg-rule     4/4 unhealthy · Target.Timeout · curl 504
     asg-ec2     1/4 unhealthy (Target.FailedHealthChecks) par ASG mein sab Healthy · curl 200 */
(function () {
  const R = 'ap-south-1', A = '123456789012', VPC = 'vpc-0e71c4a2';
  const ALB = `arn:aws:elasticloadbalancing:${R}:${A}:loadbalancer/app/shopkaro-web/3c9e1b7a5d2f4e60`;
  const TG = `arn:aws:elasticloadbalancing:${R}:${A}:targetgroup/shopkaro-web/6b2d8f4a1e9c7305`;
  const SG_ALB = 'sg-07d3b9f2', SG_APP = 'sg-0a4c2e81', ASG = 'shopkaro-web', URL = 'https://shop.shopkaro.in/';
  const tg = a => a.targetGroups.find(t => t.arn === TG);
  const asg = a => a.asgs.find(g => g.name === ASG);
  const appSg = a => a.securityGroups.find(g => g.id === SG_APP);
  const allHealthy = a => { const g = tg(a); return g.targets.length >= 2 && g.targets.every(t => AG.targetHealth(a, g, t).State === 'healthy'); };
  const worldOn8080 = a => (appSg(a).ingress || []).some(r => r.cidr === '0.0.0.0/0' && (r.protocol === '-1' || (r.fromPort <= 8080 && 8080 <= r.toPort)));
  const H1 = 'Runbook ke teeno probe chalao: curl, describe-target-health, describe-auto-scaling-groups. Kaunsa jawab galat hai? Uska Reason/field dhyaan se padho.';
  const health = `aws elbv2 describe-target-health --target-group-arn ${TG}`;
  const groups = `aws elbv2 describe-target-groups --target-group-arns ${TG}`;
  const asgShow = `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${ASG}`;

  // ALB ka jawab: healthy targets ko; koi healthy nahi toh fail-open (sab registered ko) — tab asli raasta (SG, port, app) chahiye
  function curl(sim) {
    const a = sim.account, g = tg(a), ts = g.targets || [];
    const date = 'date: ' + new Date(Date.parse('2026-11-26T05:10:00Z') + sim.history.length * 60000).toUTCString();
    if (!ts.length) return `HTTP/2 503\nserver: awselb/2.0\n${date}\ncontent-type: text/html\n\n<html><body><center><h1>503 Service Temporarily Unavailable</h1></center></body></html>`;
    const up = ts.filter(t => AG.targetHealth(a, g, t).State === 'healthy');
    const pool = up.length ? up : ts;
    const t = pool[sim.history.length % pool.length], i = a.instances.find(x => x.id === t.id);
    const serves = i && i.state === 'running' && i.appHealthy !== false && i.appPort === (t.port || g.port) && AG.albReachable(a, g, i, t.port || g.port);
    if (!serves) return `HTTP/2 504\nserver: awselb/2.0\n${date}\ncontent-type: text/html\n\n<html><head><title>504 Gateway Time-out</title></head><body><center><h1>504 Gateway Time-out</h1></center></body></html>`;
    return `HTTP/2 200\n${date}\ncontent-type: text/html; charset=utf-8\nx-served-by: ${t.id}\n\n<!doctype html><title>ShopKaro</title><h1>ShopKaro — Diwali sale</h1>`;
  }

  const subnets = ['a', 'b'].map((z, i) => ({ id: ['subnet-0d4e7a19c3b2f8a51', 'subnet-06b1f9e2d7a4c3e80'][i], vpcId: VPC, cidr: `10.30.${11 + i}.0/24`, az: R + z, name: 'shopkaro-private-' + z, public: false }));
  const instances = [0, 1, 2, 3].map(i => ({ id: 'i-0b5e9d2c71a4f3e' + i, name: 'shopkaro-web', type: 't3.medium', state: 'running', appHealthy: true,
    healthPath: '/healthz', appPort: 8080, vpcId: VPC, subnetId: subnets[i % 2].id, az: subnets[i % 2].az, sgIds: [SG_APP], privateIp: `10.30.${11 + i % 2}.${31 + i}`, publicIp: null }));

  AG.chaos.addDeck({
    id: 'elbasg', title: 'ALB health deck',
    account: {
      region: R, callerIdentity: { Account: A, UserId: 'AIDASHOPKAROOPS', Arn: `arn:aws:iam::${A}:user/ops` },
      vpcs: [{ id: VPC, cidr: '10.30.0.0/16', name: 'shopkaro' }], subnets, instances,
      securityGroups: [
        { id: SG_ALB, name: 'shopkaro-alb', vpcId: VPC, ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' }], egress: [] },
        { id: SG_APP, name: 'shopkaro-app', vpcId: VPC, ingress: [{ protocol: 'tcp', fromPort: 8080, toPort: 8080, sourceGroup: SG_ALB }], egress: [] }],
      elbs: [{ id: ALB, arn: ALB, name: 'shopkaro-web', type: 'application', scheme: 'internet-facing', sgIds: [SG_ALB],
        listeners: [{ Port: 443, Protocol: 'HTTPS', DefaultActions: [{ Type: 'forward', TargetGroupArn: TG }] }] }],
      targetGroups: [{ arn: TG, name: 'shopkaro-web', vpcId: VPC, loadBalancerArn: ALB, targetType: 'instance', protocol: 'HTTP', port: 8080,
        healthCheckPath: '/healthz', validHealthPath: '/healthz', matcher: '200', sgAware: true, targets: instances.map(i => ({ id: i.id, port: 8080 })) }],
      asgs: [{ name: ASG, min: 2, max: 6, desired: 4, instances: instances.map(i => i.id), vpcZone: subnets.map(s => s.id).join(','),
        healthCheckType: 'ELB', gracePeriod: 180, warmup: 120, targetGroupARNs: [TG], activities: [],
        launchTemplate: { id: 'lt-0c7a3e9b51d2f4e86', version: '12', type: 't3.medium', healthPath: '/healthz', appPort: 8080, sgIds: [SG_APP] } }],
    },
    responses: [{ re: /^curl\b/, out: sim => curl(sim) }],
    alert: '<b>📟 10:40 — ShopKaro.</b> Kal raat load balancer aur Auto Scaling ki settings ek naye template se dobara lagi. Aaj subah ke dashboard par ek nishaan laal hai. <b>Ek</b> config galat hai. Shuru: <code>cat runbook.md</code>.',
    placeholder: 'cat runbook.md   (phir: curl -i ' + URL + ')',
    runbook: `# ShopKaro web — "naye template ke baad" jaanch
1. Customer ki nazar:  curl -i ${URL}                → HTTP 200
2. ALB ki nazar:       ${health}
                       → saare targets "healthy"
3. ASG ki nazar:       ${asgShow}
                       → har instance Healthy, HealthCheckType ELB
Settings:  ${groups}   (HealthCheckPath / HealthCheckPort / Matcher)
           aws ec2 describe-security-groups --group-ids ${SG_APP} ${SG_ALB}
Badlaav:   aws elbv2 modify-target-group --target-group-arn <TG> --health-check-path|--health-check-port|--matcher ...
           aws ec2 authorize-security-group-ingress ... · aws autoscaling update-auto-scaling-group ...
Niyam:     app /healthz par 200 deti hai, port 8080. App SG par 0.0.0.0/0 nahi. Ek baar mein EK badlaav, phir probe dobara.
Yaad:      saare targets laal hon toh ALB fail-open karta hai — curl 200 ka matlab "sab theek" nahi.`,
    cards: [
      { id: 'hc-path', title: 'Target group ka health check path /healthz se /health ho gaya',
        break: a => { tg(a).healthCheckPath = '/health'; },
        fixed: a => tg(a).healthCheckPath === '/healthz' && allHealthy(a),
        verify: /^aws elbv2 describe-target-health\b/, verifyText: 'targets dobara dekho (describe-target-health)',
        hints: [H1, 'Reason Target.ResponseCodeMismatch, codes [404]: checker jis path par jaata hai, woh app mein hai hi nahi. describe-target-groups mein HealthCheckPath dekho.',
          `aws elbv2 modify-target-group --target-group-arn ${TG} --health-check-path /healthz, phir describe-target-health`],
        solution: ['cat runbook.md', 'curl -i ' + URL, health, groups, `aws elbv2 modify-target-group --target-group-arn ${TG} --health-check-path /healthz`, health],
        why: 'App <b>/healthz</b> par jawab deti hai; check /health maang raha tha → 404 → <b>ResponseCodeMismatch</b>. Sab targets laal par ALB fail-open, isliye curl 200 tha. ELB health wala ASG aise targets ko replace bhi karne lagta.' },
      { id: 'hc-matcher', title: 'Health check ka success code 200 se 301 ho gaya',
        break: a => { tg(a).matcher = '301'; },
        fixed: a => ['200', '200-299'].includes(String(tg(a).matcher)) && allHealthy(a),
        verify: /^aws elbv2 describe-target-health\b/, verifyText: 'targets dobara dekho (describe-target-health)',
        hints: [H1, 'Reason ResponseCodeMismatch, codes [200]: app ne 200 diya, phir bhi fail? describe-target-groups mein Matcher kya maangta hai?',
          `aws elbv2 modify-target-group --target-group-arn ${TG} --matcher HttpCode=200, phir describe-target-health`],
        solution: ['cat runbook.md', 'curl -i ' + URL, health, groups, `aws elbv2 modify-target-group --target-group-arn ${TG} --matcher HttpCode=200`, health],
        why: 'App 200 de rahi thi, par matcher sirf <b>301</b> ko safal maanta tha → codes [200] par fail. Matcher wahi rakho jo health endpoint sach mein deta hai; 200-499 jaisi chaudi range toote app ko bhi hara dikhati.' },
      { id: 'hc-port', title: 'Health check port traffic-port se 9090 ho gaya',
        break: a => { tg(a).healthCheckPort = '9090'; },
        fixed: a => ['traffic-port', '8080', undefined].includes(tg(a).healthCheckPort) && allHealthy(a),
        verify: /^aws elbv2 describe-target-health\b/, verifyText: 'targets dobara dekho (describe-target-health)',
        hints: [H1, 'Reason Target.Timeout, par curl 200 — asli traffic pahunch raha hai. describe-target-health mein HealthCheckPort kitna hai? App kis port par sunti hai?',
          `aws elbv2 modify-target-group --target-group-arn ${TG} --health-check-port traffic-port, phir describe-target-health`],
        solution: ['cat runbook.md', 'curl -i ' + URL, health, groups, `aws elbv2 modify-target-group --target-group-arn ${TG} --health-check-port traffic-port`, health],
        why: 'Har target par <b>HealthCheckPort 9090</b> tha; app 8080 par sunti hai aur SG sirf 8080 kholta hai → check timeout. <b>traffic-port</b> rakho, taaki check wahi port dekhe jahan asli traffic jaata hai.' },
      { id: 'sg-rule', title: 'App SG se ALB wala 8080 ka rule hat gaya',
        break: a => { appSg(a).ingress = []; },
        fixed: a => allHealthy(a) && !worldOn8080(a),
        verify: /^aws elbv2 describe-target-health\b|^curl\b/, verifyText: 'targets ya curl dobara dekho',
        hints: [H1, 'Reason Target.Timeout aur curl 504: health check hi nahi, asli traffic bhi nahi pahunch raha. Instances ke SG mein 8080 kaun kholta hai?',
          `aws ec2 authorize-security-group-ingress --group-id ${SG_APP} --protocol tcp --port 8080 --source-group ${SG_ALB} (0.0.0.0/0 nahi), phir describe-target-health`],
        solution: ['cat runbook.md', 'curl -i ' + URL, health, `aws ec2 describe-security-groups --group-ids ${SG_APP}`,
          `aws ec2 authorize-security-group-ingress --group-id ${SG_APP} --protocol tcp --port 8080 --source-group ${SG_ALB}`, health],
        why: 'Health check aur asli traffic dono ALB ke SG se aate hain. Rule hata toh dono <b>timeout</b>: sab targets laal aur fail-open bhi kaam nahi aaya — curl <b>504</b>. Source mein ALB ka SG do, 0.0.0.0/0 nahi.' },
      { id: 'asg-ec2', title: 'ASG ka health check type ELB se EC2 ho gaya',
        break: a => { asg(a).healthCheckType = 'EC2'; a.instances[1].appHealthy = false; },
        fixed: a => asg(a).healthCheckType === 'ELB' && allHealthy(a),
        verify: /^aws elbv2 describe-target-health\b|^aws autoscaling describe-auto-scaling-groups\b/, verifyText: 'targets ya ASG dobara dekho',
        hints: [H1, 'Ek target FailedHealthChecks par laal, par ASG usi instance ko Healthy bolta hai. ASG kiski baat sunta hai — EC2 status check ya ALB?',
          `aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --health-check-type ELB, phir describe-target-health`],
        solution: ['cat runbook.md', 'curl -i ' + URL, health, asgShow, `aws autoscaling update-auto-scaling-group --auto-scaling-group-name ${ASG} --health-check-type ELB`, health],
        why: 'Raat ko ek instance ka app gira, par machine chal rahi thi — <b>EC2</b> health wala ASG use Healthy maanta raha. <b>ELB</b> health check se ASG app ki failure par instance badal deta hai. curl 200 tha kyunki ALB baaki 3 par bhej raha tha.' },
    ],
  });

  AG.addLab('elbasg', {
    type: 'chaos', id: 'chaos-elbasg', deck: 'elbasg', title: '🎲 Chaos round: naya ALB/ASG template',
    intro: 'Teen probe, ek galat config. Dhoondho, <b>EK badlaav</b> se theek karo, pakka karo — phir batao kya toota tha.',
  });
})();
