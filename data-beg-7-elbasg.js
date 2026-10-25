/* Beginner 7 · ShopKaro's second Diwali · one request, several independent gates. */
(function () {
  const N = AG.aws.n;
  const LB = 'arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/shopkaro/0000000000000007';
  const TG = 'arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/shopkaro-web/0000000000000007';
  const G = s => (s.account.asgs || []).find(a => a.name === 'shopkaro-web');
  const T = s => (s.account.targetGroups || []).find(t => t.arn === TG);
  const I = (s, id) => (s.account.instances || []).find(i => i.id === id);
  const healthy = (s, id) => { const i = I(s, id), t = T(s); return !!i && !!t && i.state === 'running' && i.appHealthy !== false && i.healthPath === t.healthCheckPath && t.matcher === '200' && (!t.healthCheckPort || ['traffic-port', '8080'].includes(String(t.healthCheckPort))) && (t.targets || []).some(x => x.id === id && !x.draining && x.port === 8080); };
  function seed() {
    return {
      region: 'ap-south-1',
      subnets: [
        { id: 'subnet-app-a', vpcId: 'vpc-shop', cidr: '10.7.11.0/24', az: 'ap-south-1a', name: 'private-a', public: false },
        { id: 'subnet-app-b', vpcId: 'vpc-shop', cidr: '10.7.12.0/24', az: 'ap-south-1b', name: 'private-b', public: false },
      ],
      instances: [
        { id: 'i-good', name: 'web-a', state: 'running', type: 't3.small', appHealthy: true, appPort: 8080, healthPath: '/healthz', vpcId: 'vpc-shop', subnetId: 'subnet-app-a', az: 'ap-south-1a', sgIds: ['sg-app'], privateIp: '10.7.11.10' },
        { id: 'i-broken', name: 'web-b', state: 'running', type: 't3.small', appHealthy: false, appPort: 8080, healthPath: '/healthz', vpcId: 'vpc-shop', subnetId: 'subnet-app-b', az: 'ap-south-1b', sgIds: ['sg-app'], privateIp: '10.7.12.10' },
      ],
      elbs: [{ id: 'alb-shop', arn: LB, name: 'shopkaro', type: 'application', scheme: 'internet-facing', dns: 'shopkaro.sim.ap-south-1.elb.amazonaws.com', sgIds: ['sg-alb'],
        listeners: [{ ListenerArn: LB + '/listener/443', Protocol: 'HTTPS', Port: 443, DefaultActions: [{ Type: 'forward', TargetGroupArn: TG }] }] }],
      targetGroups: [{ arn: TG, name: 'shopkaro-web', vpcId: 'vpc-shop', loadBalancerArn: LB, targetType: 'instance', protocol: 'HTTP', port: 8080,
        healthCheckPath: '/health', validHealthPath: '/healthz', matcher: '200', interval: 30, timeout: 5, healthyThreshold: 5, unhealthyThreshold: 2,
        attributes: { 'deregistration_delay.timeout_seconds': '300' }, targets: [{ id: 'i-good', port: 8080 }, { id: 'i-broken', port: 8080 }] }],
      asgs: [{ name: 'shopkaro-web', min: 2, max: 6, desired: 2, vpcZone: 'subnet-app-a,subnet-app-b', healthCheckType: 'EC2', gracePeriod: 0,
        instances: ['i-good', 'i-broken'], targetGroupARNs: [TG], launchTemplate: { id: 'lt-shop', version: '1', type: 't3.small', healthPath: '/healthz', sgIds: ['sg-app'] }, policies: [], activities: [] }],
    };
  }
  const worker = [
    { name: 't3.small', rps: 500, price: 0.0208 },
    { name: 't3.medium', rps: 900, price: 0.0416 },
    { name: 't3.large', rps: 1400, price: 0.0832 },
  ];
  function plan(k) {
    const w = worker[k.size], needed = Math.ceil(k.peak / (w.rps * k.cpu / 100));
    const count = Math.min(k.max, Math.max(k.min, needed));
    const remaining = Math.max(0, count - Math.ceil(count / k.azs));
    const normalCPU = k.peak / (count * w.rps) * 100;
    const failureCPU = remaining ? k.peak / (remaining * w.rps) * 100 : Infinity;
    // 1 decimal KB total/request; illustration of processed-byte LCU dimension.
    const lcu = k.peak * 1000 * 3600 / 1e9;
    const cost = count * w.price + 0.0225 + Math.max(1, lcu) * 0.008;
    const ok = k.peak >= 3000 && k.min <= k.max && k.azs >= 2 && count >= k.azs && needed <= k.max && normalCPU <= 70 && failureCPU <= 70 && cost <= 0.55;
    return { needed, count, remaining, normalCPU, failureCPU, lcu, cost, ok };
  }
  AG.registerLevels('beginner', [{
    id: 'elbasg', icon: '⚖️', title: 'ALB + ASG — traffic baanto, app fail ho toh replace karo', badge: 'Scale Samrat',
    hook: {
      when: 'ShopKaro · second Diwali sale · fictional course story',
      title: '"Dusra server laga diya. Customer kaunsi IP kholega?"',
      text: 'Diwali preview mein Ravi ka ek EC2 100% CPU par pahunch gaya. Neha ne dusra EC2 launch karwaya. Ab customer Priya ko kaunsa server milega? Raat 2 baje ek server ka nginx band hua. EC2 machine running thi; team ko subah pata chala. Traffic distribute karna, application health pehchanna aur failed server replace karna teen alag jobs hain. Pehle sale-night dry run mein teen jobs ka difference dekho.',
    },
    objectives: [
      '<b>Vertical vs horizontal</b>: immediate mitigation aur sustainable capacity ko distinguish karo',
      '<b>Listener → rules → target group → targets</b>: ALB request ka poora path dekho',
      '<b>ALB vs NLB vs GWLB</b>: protocol, static IP aur inspection requirements se choose karo',
      '<b>ASG EC2 vs ELB health</b>: machine running par app dead wala trap fix karo',
      '<b>Target tracking, warmup, draining</b>: scale-out aur scale-in ki actual limits samjho',
      '<b>Real CLI + Moto</b>: capacity, replacement, health settings aur scaling policy verify karo',
    ],
    steps: [
      {
        q: 'Ek bada server ya kai chhote servers — decision kaise lo?',
        analogy: 'Ek billing counter par faster cashier = vertical scale. Mall mein kai counters aur queue guide = horizontal scale + load balancer. Naya counter khulne mein time lagta hai; queue guide cashier hire nahi karta.',
        points: [
          'Incident mein vertical resize, rate limiting ya load shedding legitimate mitigations ho sakti hain. Har problem ka immediate fix ASG banana nahi.',
          'Horizontal app tier ke liye sessions/files instance-local mat rakho. Shared state RDS/S3/session store mein rakho; requests kisi healthy app instance ko jaa sakti hain.',
          'Per-instance throughput load test se measure karo. Same-size label ka universal requests/second number nahi hota.',
          't3.small, t3.medium aur t3.large mein RAM alag hai, par teeno 2 vCPUs hain. Larger size automatic double CPU throughput promise nahi. Burstable T3 credits bhi capacity/cost affect karte hain.',
        ],
        asli: 'Emergency relief aur durable scaling plan alag likho. ASG desired capacity maintain karta hai; new capacity instant ready nahi hoti.',
      },
      {
        q: 'Load balancer request ke andar kaunse decisions leta hai?',
        analogy: 'Mall gate par protocol/port check, phir floor ka rule, phir counters ka group, phir ek available cashier: listener → rule → target group → target.',
        body: '<div class="tbl-wrap"><table><tr><th>Pick</th><th>Kab use</th><th>Kab NAHI</th></tr>' +
          '<tr><td>ALB</td><td>HTTP/HTTPS, host/path rules, WebSocket, Lambda targets</td><td>Native UDP ya fixed per-AZ IP requirement</td></tr>' +
          '<tr><td>NLB</td><td>TCP/UDP/TLS, static IP per AZ, L4 transport</td><td>HTTP URL path inspect karke route karna</td></tr>' +
          '<tr><td>GWLB</td><td>Third-party firewall/inspection appliance fleet</td><td>Normal website path routing</td></tr>' +
          '<tr><td>CLB</td><td>Existing legacy workload compatibility</td><td>New design ka default choice</td></tr></table></div>',
        points: [
          'ALB target group types: instance, IP, Lambda. S3 bucket native ALB target nahi; images ke liye CloudFront + private S3/OAC use karo.',
          'NLB ka ALB target type alag feature hai: static-IP front door ke peeche ALB HTTP routing use kar sakte ho. ALB khud ALB target type offer nahi karta.',
          'ALB routing algorithms: round robin default, least outstanding requests, weighted random. Least connections ko ALB algorithm naam mat samjho.',
        ],
        asli: 'Customer requirement se LB chuno: HTTP rule → ALB; L4/static IP → NLB; inline appliance → GWLB. Sirf "fastest" se choice mat karo.',
      },
      {
        q: 'Target unhealthy kaise banta hai — aur all-unhealthy par kya hota hai?',
        body: 'HTTP instance/IP target defaults: path <code>/</code>, interval <b>30 seconds</b>, timeout <b>5 seconds</b>, unhealthy threshold <b>2</b>, recovery healthy threshold <b>5</b>, matcher <code>200</code>. Naye registered target ko initial healthy hone ke liye first successful check kaafi hai.',
        points: [
          'Application readiness path choose karo: example /healthz returns 200 only when app traffic serve kar sakti hai. ALB → app port tak SG path allow hona chahiye.',
          'Kuch targets unhealthy hain toh ALB healthy eligible targets prefer karta hai. <b>Sab registered targets unhealthy</b> hon toh ALB <b>fails open</b>: unhealthy targets ko bhi traffic ja sakta hai.',
          'All-unhealthy ka automatic meaning ALB 503 nahi. No registered/usable targets wala 503 case alag hai; backend bhi apna 503 return kar sakta hai.',
          'New release /health ko /healthz move kare, par target group old path check kare → Target.ResponseCodeMismatch [404]. Matcher mein 404 allow karke red monitor chhupana readiness repair nahi.',
        ],
        asli: 'Health reason code padho, actual endpoint aur port verify karo. Healthy ko "process exists" ya "EC2 running" se infer mat karo.',
      },
      {
        q: 'ALB target unhealthy hai, par ASG replace kyun nahi kar raha?',
        analogy: 'Building supervisor electricity check karta hai. Queue guide cashier ka counter response check karta hai. Supervisor ko counter-health report use karne ka instruction dena padta hai.',
        points: [
          'ASG launch template se instances banata hai; min/desired/max capacity bounds hain. Subnets two or more AZs mein choose karo.',
          '<b>Default ASG health check type EC2</b> hai. Nginx dead aur EC2 running ho toh EC2 checks pass kar sakte hain.',
          '<b>ELB health checks opt in</b> karo; ASG attached load balancer health bhi use karega. ALB unhealthy target skip karta hai; ASG replacement control alag hai.',
          'Grace period new InService instance ko app initialize karne ka time deta hai. Default console/CLI se differ kar sakta hai; example explicitly 120 seconds set karta hai.',
        ],
        code: 'aws autoscaling update-auto-scaling-group \\\n  --auto-scaling-group-name shopkaro-web \\\n  --health-check-type ELB --health-check-grace-period 120',
        asli: 'Pehle health endpoint correct karo, phir ASG ELB health enable karo. Wrong global health path ke saath replacement enable karna healthy machines ko bhi churn kara sakta hai.',
      },
      {
        q: 'CPU 50% maintain karna hai — kaunsi scaling policy?',
        analogy: 'Room ka thermostat target temperature maintain karta hai. Har baar manually "temperature 70 ke upar toh ek fan" rules likhne ki jagah target choose karo.',
        body: '<div class="tbl-wrap"><table><tr><th>Policy</th><th>Kab use</th><th>Limit</th></tr><tr><td>Target tracking</td><td>Average CPU 50% ya ALBRequestCountPerTarget target</td><td>Useful load metric + sufficient max capacity chahiye</td></tr><tr><td>Step scaling</td><td>Alarm breach size ke hisaab se custom increments</td><td>More tuning; app behavior samjho</td></tr><tr><td>Scheduled</td><td>Known sale starts 8 PM; capacity pre-create</td><td>Unexpected spikes ke liye dynamic policy bhi</td></tr><tr><td>Predictive</td><td>Recurring historical demand pattern</td><td>Forecast evaluate karo; forecast-only mode actual scaling nahi</td></tr></table></div>',
        points: [
          'Target tracking CloudWatch alarms manage karta hai. CPU 50% ka matlab every instant every instance exactly 50% nahi; control loop ko time lagta hai.',
          'Warmup new InService instance ko aggregated scaling metrics mein premature contribution se delay karta hai. Warmup traffic readiness ka replacement nahi.',
          'Cooldown simple scaling ka stabilization control hai; target tracking/step scaling warmup behavior ko same single timer mat samjho.',
          'MaxSize limit hit ho toh target miss reh sakta hai. Metric, quotas, image boot time aur downstream database capacity bhi check karo.',
        ],
        asli: 'Normal default target tracking se shuru karo; known event ke liye scheduled pre-scaling add karo. Predictive forecast ko verify kiye bina instant capacity promise mat karo.',
      },
      {
        q: 'Scale-in par in-flight requests aur sticky sessions ka kya?',
        points: [
          'Target deregister hone par ALB new requests stop karta hai; existing work ko complete hone ka window milta hai. Default deregistration delay 300 seconds hai; allowed range 0–3600 seconds.',
          'Delay request duration ke hisaab se choose karo. Exercise 30 seconds use karti hai; longest legitimate requests 90 seconds hon toh 30-second choice reconsider karo.',
          'Sticky sessions client ko same target par pin kar sakti hain. Local sessions failover/scale-in par break ho sakte hain; external session state ko prefer karo.',
          'ALB cross-zone LB level par enabled hai; target-group override disable kar sakta hai. NLB/GWLB cross-zone default off hai. Cross-zone data-transfer pricing LB type ke hisaab se review karo.',
        ],
        code: 'aws elbv2 modify-target-group-attributes --target-group-arn "$TG" \\\n  --attributes Key=deregistration_delay.timeout_seconds,Value=30',
        asli: 'Healthy capacity add karna half story hai. Safe drain, shared state aur remaining-AZ capacity bhi design karo.',
      },
      {
        q: 'HTTPS certificate aur SG chain kahan lagti hai?',
        body: '<code>Internet → ALB HTTPS:443 → app HTTP:8080</code> example mein ACM certificate ALB 443 listener par attach hota hai. Port 80 listener ko HTTPS redirect do. App SG 8080 ka source <b>ALB SG</b> rakho; app port world-open nahi.',
        points: [
          'ALB aur target ke beech HTTPS bhi choose kar sakte ho; front-end TLS aur back-end TLS separate decisions hain.',
          'ALB SG ko app port/health port tak egress aur app SG ko ALB SG se ingress allow chahiye.',
          'ALB ke peeche client address X-Forwarded-For mein milta hai. Header chain sirf trusted proxy boundary se parse karo; user-supplied leftmost value blindly trust mat karo.',
          'ALB HTTP proxy behavior ko SG statefulness ke saath mix mat karo. Connection tracking security-group concept hai; sticky routing alag feature hai.',
        ],
        asli: 'Public permission sirf ingress layer ko do. App tier ALB se traffic accept kare; original client identity trusted forwarded-header policy se lo.',
      },
      {
        q: 'ALB + two servers ka monthly bill roughly kitna?',
        body: 'Approx us-east-1 list-price illustration (2025–26): ALB <b>$0.0225/hour</b> + <b>$0.008/LCU-hour</b>; NLB <b>$0.0225/hour</b> + <b>$0.006/NLCU-hour</b>. LCU bill max of new connections, active connections, processed bytes aur rule-evaluation dimensions se banta hai; dimensions ko add nahi karte.',
        example: 'Approx 730 hours/month, one ALB averaging 1 LCU + two t3.small at $0.0208/hour: ($0.0225 + $0.008 + 2×$0.0208) × 730 = <b>$52.63/month ≈ ₹4,632/month</b>, ₹88/$ par. Public IPv4, EBS, data transfer, surplus CPU credits, logs/alarms aur taxes extra. Actual traffic multiple LCUs use kar sakta hai.',
        points: ['EC2 Auto Scaling ka separate service fee nahi; launched EC2, storage, networking aur monitoring ka bill lagta hai.', 'Planner RPS/capacity toy inputs use karta hai. Real app ko benchmark karo; pricing constants aur requested resource counts alone latency/SLO guarantee nahi.'],
        asli: 'ASG khud free service hone se architecture free nahi hota. Baseline capacity + peak capacity + LB usage + data path ka total budget banao.',
      },
    ],
    myth: [
      { myth: 'ALB /static request ko native S3 target group par bhej sakta hai.', sach: 'ALB target types instance/IP/Lambda hain. Private S3 images ke liye CloudFront + OAC use karo. NLB ka ALB target type separate feature hai.' },
      { myth: 'ALB app unhealthy declare kare toh default ASG automatically replace karega.', sach: 'Default ASG EC2 health use karta hai. ELB health checks enable karo; correct endpoint aur grace period bhi chahiye.' },
      { myth: 'Sab targets unhealthy hain toh ALB guaranteed 503 dega.', sach: 'ALB all-unhealthy registered targets par fail open karta hai. Empty/no usable target 503 aur backend-generated 503 alag cases hain.' },
      { myth: 'CPU target 50% set kiya toh instantaneous overload impossible hai.', sach: 'Alarm/control loop, instance boot, warmup, MaxSize aur downstream limits still matter. Known spikes se pehle capacity ready karo.' },
    ],
    playbook: {
      title: 'LB + scaling review — protocol, readiness, headroom, drain',
      use: ['HTTP/host/path routing → ALB; L4/static per-AZ IP → NLB; inline appliance → GWLB', 'Stateless app in multiple AZs; launch template + target tracking + explicit warmup', 'ASG ELB health for application-level replacement; scheduled capacity for known events'],
      avoid: ['ALB native S3 target claims', 'World-open app port or instance-local session dependence', 'Matcher 200–499 se missing readiness endpoint hide karna', 'Scale-out ko instant response ya AZ recovery capacity guarantee samajhna'],
      how: ['Benchmark workload and AZ-loss headroom', 'Listener/rules → target group → app port → readiness path inspect karo', 'Correct health path; ELB health opt in; grace and warmup set karo', 'Drain and reconnect behavior test karo; total cost/MaxSize review karo'],
      redflags: ['ALB unhealthy + ASG EC2 Healthy disagreement', 'Target.ResponseCodeMismatch after release changed /health path', 'ASG at MaxSize during peak', 'All targets unhealthy; fail-open path ignored'],
      rule: 'ALB traffic route karta hai. ASG capacity/replacement maintain karta hai. App readiness, shared state, headroom aur safe drain customer design karta hai.',
    },
    exam: [
      { cue: '"path/host-based HTTP routing"', pick: 'ALB', why: 'Layer 7 listener rules request content inspect karte hain.' },
      { cue: '"load balancer with static IP per AZ" / "UDP"', pick: 'NLB', why: 'L4 requirement; global anycast/static front door ke liye Global Accelerator alag option.' },
      { cue: '"third-party firewall appliances inline"', pick: 'GWLB', why: 'Appliance fleet steering, normal HTTP path rule nahi.' },
      { cue: '"replace instances when application checks fail"', pick: 'Enable ASG ELB health checks', why: 'Default EC2 checks application readiness check nahi hain.' },
      { cue: '"maintain average CPU at 50%"', pick: 'Target tracking', why: 'Managed alarms and feedback scaling.' },
      { cue: '"traffic event begins at known time"', pick: 'Scheduled pre-scaling + dynamic policy', why: 'Boot capacity event se pehle ready rakho.' },
      { cue: '"requests cut off during scale-in"', pick: 'Review deregistration delay and graceful shutdown', why: 'In-flight work ko legitimate completion window chahiye.' },
      { cue: '"client IP behind ALB"', pick: 'Trusted X-Forwarded-For processing', why: 'ALB proxy address direct peer ho sakta hai; header trust boundary validate karo.' },
      { cue: '"all registered ALB targets unhealthy"', pick: 'Fail-open behavior consider karo', why: 'Traffic unhealthy targets tak bhi ja sakta hai; 503 automatic inference nahi.' },
    ],
    stages: [
      {
        type: 'dryrun', title: '🔍 Diwali night — load balancing, scaling aur app replacement',
        goal: 'Spike, new capacity, broken nginx aur scale-in ko one change per click dekho. ASG EC2 health vs ELB health ke decision par answer do.',
        nodes: [N('user', 120, 95), N('alb', 380, 95), N('asg', 770, 95), N('ec2', 290, 290, { label: 'web-a' }), N('ec2#b', 750, 290, { label: 'web-b' }), N('ec2#c', 290, 440, { label: 'new-c' }), N('ec2#d', 750, 440, { label: 'new-d' })],
        groups: [{ label: 'AZ-a · app subnet', x: 150, y: 215, w: 300, h: 290, kind: 'az' }, { label: 'AZ-b · app subnet', x: 590, y: 215, w: 330, h: 290, kind: 'az' }],
        edges: [{ from: 'user', to: 'alb' }, { from: 'alb', to: 'ec2' }, { from: 'alb', to: 'ec2#b' }, { from: 'asg', to: 'ec2#d', dashed: true }],
        panels: [{ id: 'traffic', title: 'Traffic / readiness' }, { id: 'group', title: 'ASG / application state' }],
        steps: [
          { clock: '19:55', say: 'ALB ne traffic two healthy targets web-a/web-b par route kiya. ASG desired=2 hai; app state RDS/S3 mein hai, server-local session nahi.', flows: [{ from: 'user', to: 'alb', label: 'HTTPS', tone: 'ok' }, { from: 'alb', to: 'ec2', tone: 'ok' }, { from: 'alb', to: 'ec2#b', tone: 'ok' }], nodes: { 'ec2#c': { tone: 'idle', badge: 'not launched' }, 'ec2#d': { tone: 'idle', badge: 'not launched' } }, panels: { traffic: ['2 healthy targets; traffic distributed'], group: ['Min 2 / desired 2 / max 6', 'Health source: EC2'] } },
          { clock: '20:00', say: 'Sale spike se average CPU target ke upar gaya. Target-tracking alarm/control loop ne desired capacity 2→4 ki. Scaling exact timing production workload par depend karti hai.', flows: [{ from: 'alb', to: 'asg', label: 'load signal', tone: 'slow' }], nodes: { asg: { tone: 'busy', badge: 'desired 4' } }, panels: { group: ['Desired 4; only 2 instances serving so far', 'New EC2 boot is not instantaneous'] } },
          { clock: 'boot window', say: 'ASG ne launch template se new-c/new-d launch kiye. New instances Pending/startup state mein hain; readiness pass hone se pehle useful capacity count mat karo.', nodes: { 'ec2#c': { tone: 'busy', badge: 'Pending / starting' }, 'ec2#d': { tone: 'busy', badge: 'Pending / starting' } } },
          { clock: 'ready', say: 'New-c/new-d initial health checks pass karke traffic receive kar rahe hain. ASG warmup scaling metrics ko stabilize karta hai; ALB health readiness alag gate hai.', flows: [{ from: 'alb', to: 'ec2#c', tone: 'ok' }, { from: 'alb', to: 'ec2#d', tone: 'ok' }], nodes: { 'ec2#c': { tone: 'ok', badge: 'healthy' }, 'ec2#d': { tone: 'ok', badge: 'healthy' } }, panels: { traffic: ['4 targets now serve; headroom increased'] } },
          { clock: '02:00', say: 'Web-b ka nginx crash hua. Two consecutive failed checks ke baad ALB ne web-b ko unhealthy mark kiya; doosre healthy targets traffic lete hain. EC2 machine running hai.', nodes: { 'ec2#b': { tone: 'bad', badge: 'app dead; EC2 running' } }, panels: { traffic: ['web-b unhealthy; 3 healthy targets still eligible'], group: ['ASG health source EC2: web-b still appears Healthy'] }, ask: { q: 'Default EC2-health ASG broken nginx ko automatically replace karega?', choices: ['Application failure ke liye ASG ELB health enable karna hoga; ALB target skipping aur ASG replacement alag hain', 'ALB unhealthy target ko khud terminate karke EC2 launch karega', 'EC2 running status har HTTP readiness failure detect karta hai', 'Deregistration delay badhane se nginx process restart ho jayega'], answer: 0, explain: 'ALB routing handle karta hai, instance lifecycle ASG. EC2 status check app readiness nahi. Delay drain window hai, process supervisor nahi.' } },
          { clock: 'repair', say: 'Correct readiness endpoint ke saath team ne ASG ELB health enable ki. Grace period expire hone ke baad app-unhealthy instance replacement eligible hua. Real replacement asynchronous hai.', nodes: { asg: { tone: 'ok', badge: 'ELB health enabled' }, 'ec2#b': { tone: 'new', badge: 'replacement booting' } }, panels: { group: ['ELB application signal now participates', 'Launch template recreates instance; desired remains 4'] } },
          { clock: 'scale-in', say: 'Sale traffic kam hua. Scaling stabilization ke baad ASG scale-in karta hai. ALB selected target ko deregister/drain karta hai; new requests rukti hain, existing requests ko configured window milta hai.', nodes: { 'ec2#d': { tone: 'slow', badge: 'draining' } }, panels: { traffic: ['No new requests to draining target', 'In-flight work may complete within configured delay'] }, ask: { q: '90-second legitimate requests hain, par deregistration delay 30 seconds hai. Kya review karoge?', choices: ['Drain/shutdown budget request duration se align karo; 30 seconds universal safe choice nahi', 'Every request ko same local session target par permanently pin karo', 'ASG health check type EC2 kar do, drain timing irrelevant ho jayegi', 'MaxSize badhaane se selected target ki in-flight request immortal ho jayegi'], answer: 0, explain: 'Graceful shutdown aur deregistration window actual request lifetime se relate karte hain. Sticky sessions, health source aur MaxSize existing connection ko guaranteed completion nahi dete.' } },
          { clock: 'recap', say: 'ALB ne traffic route kiya, ASG ne capacity/replacement manage kiya, app ne readiness aur shared state provide ki. Agar sab registered targets unhealthy hon, ALB fail open kar sakta hai; example mein three healthy targets the.', panels: { group: ['Routing ≠ replacement ≠ readiness', 'Test headroom, DNS/listener, health, drain and state separately'] } },
        ],
        lesson: 'App failure detect karne ke liye correct endpoint + ASG ELB health chahiye. Scaling aur draining ka time real measurements se choose karo.',
      },
      {
        type: 'flowlab', title: '🎛️ Peak planner — ek AZ jaaye tab bhi capacity bache',
        goal: '<b>At least 3,000 requests/second</b> serve karo; normal aur worst single-AZ-loss utilization <b>≤70%</b>; model cost <b>≤approx $0.55/hour</b>. Demand slider kam karke goal bypass nahi hoga.',
        scenario: 'Toy load-test capacities: small 500, medium 900, large 1,400 requests/second at 100% modeled utilization. Values AWS ratings nahi hain. Balanced placement, no rebalance during AZ loss, 1 decimal KB total/request. Byte LCU dimension used; other LCU dimensions, credits, storage/networking/taxes extra ho sakte hain.',
        knobs: [
          { id: 'peak', label: 'Peak demand', min: 200, max: 5000, step: 200, value: 3000, unit: ' requests/s' },
          { id: 'cpu', label: 'Target utilization', min: 30, max: 80, step: 10, value: 80, unit: '%' },
          { id: 'size', label: 'Worker example', min: 0, max: 2, step: 1, value: 0, labels: { 0: 't3.small / toy 500 RPS', 1: 't3.medium / toy 900 RPS', 2: 't3.large / toy 1400 RPS' } },
          { id: 'min', label: 'ASG minimum', min: 1, max: 4, step: 1, value: 1, unit: ' instances' },
          { id: 'max', label: 'ASG maximum', min: 2, max: 24, step: 2, value: 4, unit: ' instances' },
          { id: 'azs', label: 'Availability Zones', min: 1, max: 3, step: 1, value: 1 },
        ],
        model: k => { const p = plan(k); return { readouts: [
          { label: 'Needed / actual capacity', value: p.needed + ' / ' + p.count + ' instances', tone: p.needed <= k.max && k.min <= k.max ? 'ok' : 'bad' },
          { label: 'Normal utilization', value: p.normalCPU.toFixed(1) + '%', tone: p.normalCPU <= 70 ? 'ok' : 'bad' },
          { label: 'After worst AZ loss', value: Number.isFinite(p.failureCPU) ? p.remaining + ' instances · ' + p.failureCPU.toFixed(1) + '%' : 'no surviving capacity', tone: p.failureCPU <= 70 ? 'ok' : 'bad' },
          { label: 'Approx modeled subtotal', value: '$' + p.cost.toFixed(4) + '/hour · ₹' + (p.cost * 88).toFixed(2) + '/hour', tone: p.cost <= 0.55 ? 'ok' : 'bad' },
        ], verdict: { ok: p.ok, text: p.ok ? 'Model passes fixed peak + AZ-loss headroom + subtotal budget. Real workload, startup time and full bill still require verification.' : 'Keep peak ≥3,000 requests/s. Increase max/headroom, choose 2+ AZs, respect 70% after loss and budget. Example: medium, 40%, min 2, max 12, 3 AZs.' } }; },
        check: k => plan(k).ok,
        lesson: 'Example 3,000 RPS, medium, target 40%, min 2/max 12, 3 AZs → 9 instances; worst loss leaves 6, utilization ~55.6%, approximate modeled subtotal $0.4833/hour. Extra real costs remain.',
      },
      {
        type: 'match', title: '🧩 Requirement → right component', instructions: 'Protocol aur job se component chuno; brand name se guess mat karo.',
        pairs: [
          { left: 'ALB', right: 'HTTP host/path rules and Lambda targets', explain: 'ALB Layer 7 request-aware proxy hai.' },
          { left: 'NLB', right: 'Native TCP/UDP and static IP per AZ', explain: 'NLB Layer 4 transport requirements ka fit hai.' },
          { left: 'GWLB', right: 'Inline third-party appliance fleet', explain: 'GWLB traffic ko inspection appliances se steer karta hai.' },
          { left: 'ASG', right: 'Launch template se desired EC2 capacity maintain', explain: 'ASG lifecycle/replacement handle karta hai; HTTP path routing nahi.' },
          { left: 'Target group', right: 'Backend registration + readiness check settings', explain: 'Listener rule target group choose karta hai; target group eligible targets define karta hai.' },
        ],
      },
      {
        type: 'bins', title: '🧭 ALB, NLB, dono ya koi nahi?', instructions: 'Native feature ya transport support ke exact wording par dhyan do.',
        bins: [{ id: 'alb', label: 'ALB' }, { id: 'nlb', label: 'NLB' }, { id: 'both', label: 'Dono' }, { id: 'neither', label: 'Koi nahi' }],
        items: [
          { text: 'Inspect HTTP URL path to select backend', bin: 'alb', explain: 'ALB Layer 7 rule; NLB opaque L4 connection route karta hai.' },
          { text: 'Native UDP listener', bin: 'nlb', explain: 'ALB UDP listener support nahi karta.' },
          { text: 'Static IP per enabled AZ for network allow-list', bin: 'nlb', explain: 'ALB DNS front door deta hai; NLB static per-AZ address requirement meet kar sakta hai.' },
          { text: 'TLS termination: ALB HTTPS listener or NLB TLS listener', bin: 'both', explain: 'Dono TLS terminate kar sakte hain; protocol/routing capabilities alag hain.' },
          { text: 'WebSocket: ALB HTTP upgrade or NLB opaque TCP transport', bin: 'both', explain: 'WebSocket app protocol ALB samajh sakta hai; NLB TCP connection transport kar sakta hai.' },
          { text: 'Lambda function as native target type', bin: 'alb', explain: 'ALB Lambda target type provide karta hai.' },
          { text: 'S3 bucket as native target group type', bin: 'neither', explain: 'Private S3/OAC ke liye CloudFront origin choose karo; ALB/NLB bucket target type nahi.' },
          { text: 'Create more EC2 instances from a launch template', bin: 'neither', explain: 'Instance lifecycle ASG ka job hai; LB instance fleet create nahi karta.' },
        ],
      },
      {
        type: 'triage', title: '🩺 Release ke baad targets red — missing health endpoint',
        symptom: 'Release ne readiness endpoint /health se /healthz move kiya. Monitoring all targets unhealthy dikhati hai, par website ke kuch requests abhi bhi work kar rahe hain. Pehle reason code inspect karo; all-unhealthy ko automatic 503 mat samjho.',
        commands: [
          { cmd: 'aws elbv2 describe-target-health --target-group-arn ' + TG, out: '{"TargetHealthDescriptions":[{"Target":{"Id":"i-web-a","Port":8080},"TargetHealth":{"State":"unhealthy","Reason":"Target.ResponseCodeMismatch","Description":"Health checks failed with these codes: [404]"}}]}', clue: true, note: 'Health endpoint 404 return kar raha hai; timeout/security-group hypothesis se alag signal hai.' },
          { cmd: 'aws elbv2 describe-target-groups --target-group-arns ' + TG, out: '{"TargetGroups":[{"HealthCheckPath":"/health","Port":8080,"Matcher":{"HttpCode":"200"}}]}', clue: true, note: 'Target group old readiness path probe karta hai. Release contract /healthz hai.' },
          { cmd: 'aws ec2 describe-security-groups --group-ids sg-app', out: '{"SecurityGroups":[{"GroupId":"sg-app","IpPermissions":[{"FromPort":8080,"ToPort":8080,"UserIdGroupPairs":[{"GroupId":"sg-alb"}]}]}]}', clue: false, note: 'ALB → app port allowed hai. Health check ko actual 404 response bhi mil raha hai.' },
          { cmd: 'aws ec2 describe-instances --instance-ids i-web-a', out: '{"Reservations":[{"Instances":[{"InstanceId":"i-web-a","State":{"Name":"running"}}]}]}', clue: false, note: 'Running EC2 application endpoint success prove nahi karta.' },
        ],
        questions: [
          { q: 'Most direct repair?', choices: ['HealthCheckPath /healthz set karo, readiness 200 validate karo', 'Matcher 200–499 karo taaki 404 ko healthy maan le', 'HealthyThresholdCount ko 2 karke missing path ignore karo', 'App SG ka 8080 source ALB SG se world-open karo'], answer: 0, explain: 'Correct path actual readiness probe restore karta hai. 404 accept karna red flag hide karta hai; thresholds wrong path ko correct nahi banate. SG already response allow kar raha hai.' },
          { q: 'All targets unhealthy hote hue kuch website requests work kyun kar rahe hain?', choices: ['ALB fail-open behavior unhealthy registered targets ko bhi traffic bhej sakta hai', 'ASG EC2 health automatically ALB health result override karta hai', 'Deregistration delay every unhealthy target ko healthy mark karta hai', 'Unhealthy label sirf DNS cache hai, backend routing unaffected by design'], answer: 0, explain: 'ALB all-unhealthy fallback consider karo. ASG health source, draining aur DNS caching target-readiness state override nahi karte.' },
        ],
      },
      (function () {
        const TASKS = [
          { text: 'Target group /healthz + matcher 200; all desired targets correctly registered/healthy', check: s => { const t = T(s), a = G(s); return !!t && !!a && t.healthCheckPath === '/healthz' && t.matcher === '200' && (t.targets || []).length === a.desired && a.instances.every(id => healthy(s, id)); } },
          { text: 'ASG ELB health + 120-second grace; desired/min 2 and max 6 preserve', check: s => { const a = G(s); return !!a && a.healthCheckType === 'ELB' && a.gracePeriod === 120 && a.min === 2 && a.desired === 2 && a.max === 6; } },
          { text: 'TargetTrackingScaling cpu50 policy: ASGAverageCPUUtilization target 50%, scale-in enabled', check: s => { const a = G(s); return !!a && (a.policies || []).some(p => p.PolicyName === 'cpu50' && p.PolicyType === 'TargetTrackingScaling' && p.TargetTrackingConfiguration.TargetValue === 50 && p.TargetTrackingConfiguration.PredefinedMetricSpecification.PredefinedMetricType === 'ASGAverageCPUUtilization' && p.TargetTrackingConfiguration.DisableScaleIn !== true); } },
          { text: 'Deregistration delay exactly 30 seconds', check: s => { const t = T(s); return !!t && t.attributes['deregistration_delay.timeout_seconds'] === '30'; } },
          { text: 'Broken i-broken replaced; original i-good preserved; successful modeled replacement activity exists', check: s => { const a = G(s); return !!a && a.instances.includes('i-good') && healthy(s, 'i-good') && !a.instances.includes('i-broken') && I(s, 'i-broken') && I(s, 'i-broken').state === 'terminated' && (a.activities || []).some(v => v.oldId === 'i-broken' && v.newId && a.instances.includes(v.newId) && v.status === 'Successful'); } },
        ];
        return { type: 'terminal', title: '🖥️ Mission — readiness repair, app-health replacement aur CPU target',
          instructions: 'Pehle path fix karo; wrong global path ke saath ELB health enable karoge toh healthy server bhi replace ho sakta hai. Reset ke liye level replay fresh state deta hai.',
          goal: '<code>shopkaro-web</code> target group par readiness <code>/healthz</code>, matcher 200 rakho. ASG <code>shopkaro-web</code> par ELB health + grace 120 seconds; CPU target-tracking policy <code>cpu50</code> at 50%; drain 30 seconds. Broken <code>i-broken</code> replace ho, original healthy <code>i-good</code> aur capacity bounds preserve hon. Simulator health transitions immediate model hain; real AWS timing alag hai.',
          account: seed(), tasks: TASKS, success: AG.allOf(TASKS),
          successText: 'Correct endpoint + two healthy targets, ELB health opt-in, 120-second grace, CPU50 target policy aur 30-second drain ready. Modeled replacement activity real state transition se bani. Production mein actual health checks, startup/warmup, drain duration aur alarms verify karne hain.',
          hints: [
            'aws elbv2 modify-target-group --target-group-arn ' + TG + ' --health-check-path /healthz',
            'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-web --health-check-type ELB --health-check-grace-period 120',
            'aws autoscaling put-scaling-policy --auto-scaling-group-name shopkaro-web --policy-name cpu50 --policy-type TargetTrackingScaling --target-tracking-configuration \'{"PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},"TargetValue":50}\' --estimated-instance-warmup 120',
            'aws elbv2 modify-target-group-attributes --target-group-arn ' + TG + ' --attributes Key=deregistration_delay.timeout_seconds,Value=30',
          ],
        };
      })(),
      {
        type: 'docker', title: '🐳 Real Moto lab — scale 2→3, replace one, inspect limits', project: '07-alb-asg-selfheal',
        goal: 'README setup + ex1–ex5 run karo. ASG desired count badhao, instance replace karo without decrement, health/policy/draining config inspect karo, then scoped cleanup.',
        why: 'Real CLI API state test hota hai. Moto static health aur empty activity history ko actual nginx readiness/self-healing timing mat samjho.',
        steps: [
          { text: 'README Setup follow karo: Moto env + bash setup.sh + source .lab/resources.sh.', cmd: 'cd aws-gurukul/docker-labs\n./start-moto.sh\nsource env.sh\ncd 07-alb-asg-selfheal\nbash setup.sh\nsource .lab/resources.sh' },
          { text: 'ex1–ex2: health source EC2 dekho; desired count 3 karo.', cmd: 'aws autoscaling set-desired-capacity --auto-scaling-group-name shopkaro-lab07 --desired-capacity 3\naws autoscaling describe-auto-scaling-groups --auto-scaling-group-names shopkaro-lab07 --query \'AutoScalingGroups[0].{Desired:DesiredCapacity,Count:length(Instances)}\'', expect: '{ "Desired": 3, "Count": 3 }' },
          { text: 'ex3: OLD ID output se lo; terminate without decrement; count 3 aur old ID count 0 verify karo.', cmd: 'aws autoscaling terminate-instance-in-auto-scaling-group --instance-id "$OLD" --no-should-decrement-desired-capacity --query \'Activity.{Status:StatusCode,Description:Description}\'', expect: '{ "Status": "InProgress", "Description": "Terminating EC2 instance: i-c09f335f26e1a7830" }' },
          { text: 'ex4: /healthz, ELB health, cpu50 policy aur drain 30 configure karo; policy inspect karo.', cmd: 'aws autoscaling describe-policies --auto-scaling-group-name shopkaro-lab07 --query \'ScalingPolicies[0].{Type:PolicyType,Target:TargetTrackingConfiguration.TargetValue,Metric:TargetTrackingConfiguration.PredefinedMetricSpecification.PredefinedMetricType}\'', expect: '{ "Type": "TargetTrackingScaling", "Target": 50.0, "Metric": "ASGAverageCPUUtilization" }' },
          { text: 'ex4–ex5: empty Moto activity history note karo, then bash cleanup.sh.', cmd: 'aws autoscaling describe-scaling-activities --auto-scaling-group-name shopkaro-lab07 --query \'Activities[].{Status:StatusCode,Description:Description}\'\nbash cleanup.sh', expect: '[]\n[]\n[]\n[]' },
        ],
        observe: { q: 'Moto target health healthy aur activities [] dikhata hai. Correct conclusion?', choices: ['API metadata/config verified; actual HTTP probes, metric-driven scaling aur production replacement timing unverified hain', 'Healthy output se nginx/TLS/production drain behavior prove ho gaya', 'Empty history proves instance replacement membership check invalid hai', 'TargetTracking policy stored hone se real CloudWatch traffic alarm fire hona prove ho gaya'], answer: 0, explain: 'Different evidence layers alag hain. ASG membership count/old ID absence replacement config show karte hain; Moto no OS/static health aur missing history full runtime proof nahi.' },
      },
      {
        type: 'quiz', bonus: true, title: '📝 SAA-style decisions — ALB + Auto Scaling',
        questions: [
          { q: 'HTTP /api aur /admin ko alag backends bhejna hai. Most direct LB?', choices: ['ALB listener rules + separate target groups', 'NLB TCP listener with URL path condition', 'GWLB appliance endpoint for every HTTP route', 'ASG policy with a path-based TargetValue'], answer: 0, domain: 'high-performing', explain: 'ALB HTTP path inspect karta hai. NLB L4 content rules nahi; GWLB inline appliances; ASG capacity policy URL router nahi.' },
          { q: 'Consumer firewall ko load balancer ke fixed per-AZ IPs allow-list karne hain; TCP service hai.', choices: ['NLB with static per-AZ addresses', 'ALB current DNS-resolved IPs hard-code karo', 'Target group mein fixed instance names likho', 'ASG desired capacity fixed 2 rakho'], answer: 0, domain: 'secure', explain: 'NLB network/static address requirement meet karta hai. ALB node IPs change ho sakte hain. Target names aur desired count front-door IP contract nahi.' },
          { q: 'Nginx down, EC2 running, ALB target unhealthy. ASG default EC2 health use karta hai.', choices: ['Correct app health endpoint + ASG ELB health opt-in verify karo', 'ALB deregistration delay ko instance launch timer samjho', 'CPU target 50% alone application failure replacement guarantee karega', 'Route table default gateway change karo taaki nginx restart ho'], answer: 0, domain: 'resilient', explain: 'EC2 status app health nahi. ALB routes, ASG replaces. Draining/CPU target/network route nginx supervisor nahi hain.' },
          { q: 'All registered targets unhealthy hain. ALB behavior ka important exception?', choices: ['ALB fail open karke unhealthy targets ko route kar sakta hai', 'ALB guaranteed 503 return karega before contacting any target', 'ALB launch template se fresh EC2s create karega', 'ALB health matcher automatically every response accept karega'], answer: 0, domain: 'resilient', explain: 'Fail-open all-unhealthy behavior documented hai. No registered/usable target 503 alag. LB instance lifecycle ya matcher auto-rewrite nahi karta.' },
          { q: 'Average CPU around 50% maintain karna hai; scaling alarms manually tune nahi karne.', choices: ['Target tracking on ASGAverageCPUUtilization', 'Scheduled scaling alone at arbitrary fixed times', 'Health-check grace period permanently 50 seconds', 'Sticky-session duration 50 seconds'], answer: 0, domain: 'high-performing', explain: 'Target tracking metric target se capacity adjust karta hai. Schedule known events, grace startup protection aur cookie duration session affinity solve karte hain.' },
          { q: 'Sale every evening 8 PM sharp start hoti hai; boot 4 minutes leta hai. Best addition?', choices: ['Scheduled pre-scaling before 8 PM plus dynamic policy', 'Only raise CPU threshold so fewer instances launch', 'Only extend deregistration delay to four minutes', 'Only enable sticky sessions on current one-instance fleet'], answer: 0, domain: 'resilient', explain: 'Known event se pehle capacity ready honi chahiye. Higher trigger threshold readiness delay badha sakta hai. Drain/session affinity extra capacity create nahi karte.' },
          { q: 'Scale-in ke waqt requests cut hoti hain; longest legit request 90 seconds, drain 30 seconds hai.', choices: ['Graceful app shutdown + drain window request lifetime se align karo', 'Health matcher 200–499 karke lost responses ko ignore karo', 'ASG EC2 health par switch karke ALB drain bypass karo', 'Instance-local sessions pin karke instance termination prevent karo'], answer: 0, domain: 'resilient', explain: 'Request completion window aur shutdown behavior review karo. Matcher lost connections fix nahi. EC2 health/cookies termination safety mechanism nahi.' },
          { q: 'Public ALB HTTPS 443 → private app HTTP 8080. App SG ka least-privilege source?', choices: ['ALB security group on app/health port', '0.0.0.0/0 on 8080, kyunki ALB already public hai', 'Customer CIDRs only, because ALB never proxies TCP', 'RDS security group, because app database use karta hai'], answer: 0, domain: 'secure', explain: 'App peer ALB hai. App SG ALB SG allow kare; customer identity forwarded header se separately validate hoti hai. RDS source web traffic path nahi.' },
          { q: 'ALB usage bill mein 4 LCU dimensions measure hue. Cost calculation ka correct direction?', choices: ['Maximum consumed dimension use karo; hourly ALB charge separately add', 'Four dimensions add karo, phir hourly charge remove karo', 'Only request count count karo; bytes/connections ignore karo', 'ASG service free hai, isliye ALB usage free ho gaya'], answer: 0, domain: 'cost', explain: 'LCU metering highest dimension use karta hai. Separate LB-hour charge aur related resources remain; ASG fee policy ALB meter ko free nahi banati.' },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — readiness, capacity aur safe replacement', instructions: 'Four architecture decisions, phir desired capacity preserve karke instance replace karo.',
      questions: [
        { q: 'ALB versus NLB ka useful decision criterion?', choices: ['HTTP request-aware routing versus L4/static-address requirements', 'ALB always faster than every NLB workload', 'NLB automatically supplies CPU auto scaling alarms', 'ALB and NLB use identical native target types'], answer: 0, explain: 'Protocol/features se decide karo. Universal speed, implicit scaling aur same target-type claims wrong hain.' },
        { q: 'Traffic incident mein vertical resize ko categorically wrong kyun nahi kehna chahiye?', choices: ['Vertical relief can be legitimate; assess downtime, limits and follow with measured horizontal plan', 'Vertical resize always makes app stateless automatically', 'Vertical resize always preserves every active network connection', 'Vertical resize means load balancer becomes unnecessary for all future growth'], answer: 0, explain: 'Mitigation context matters. Resize state architecture, connection continuity ya unlimited growth guarantee nahi.' },
        { q: 'ASG health grace versus default instance warmup?', choices: ['Grace delays premature unhealthy replacement; warmup stabilizes scaling metric contribution', 'Dono every case mein same readiness probe timeout hain', 'Warmup automatically starts nginx while grace adjusts DNS TTL', 'Grace specifies ALB LCU billing units and warmup is a cookie lifetime'], answer: 0, explain: 'Startup protection aur scaling stabilization distinct controls hain; app boot/readiness aur request drain alag evaluate karo.' },
        { q: 'ALB ke peeche client IP logging secure kaise karoge?', choices: ['Trusted proxy boundary define karke X-Forwarded-For chain parse karo', 'User-supplied first X-Forwarded-For entry ko authentication identity maan lo', 'ALB peer address ko har request ka original customer address maan lo', 'All headers remove karke static ASG ID ko client IP field mein log karo'], answer: 0, explain: 'Forwarded header provenance important hai. Arbitrary client-supplied entries spoof ho sakti hain; proxy peer original customer nahi.' },
        { terminal: (function () {
          const a = seed(); a.targetGroups[0].healthCheckPath = '/healthz';
          const TASKS = [
            { text: 'Desired 4, four registered/running targets, max 6/min 2 preserve', check: s => { const a = G(s); return !!a && a.min === 2 && a.max === 6 && a.desired === 4 && a.instances.length === 4 && a.instances.every(id => healthy(s, id)); } },
            { text: 'i-broken terminated/replaced; keep original i-good running', check: s => { const a = G(s), old = I(s, 'i-broken'); return !!a && !!old && old.state === 'terminated' && !a.instances.includes(old.id) && a.instances.includes('i-good') && healthy(s, 'i-good') && (a.activities || []).some(v => v.oldId === old.id && v.newId && a.instances.includes(v.newId)); } },
          ];
          return { goal: 'ASG <code>shopkaro-web</code> desired capacity 2→4 karo. Broken <code>i-broken</code> ko <code>terminate-instance-in-auto-scaling-group --no-should-decrement-desired-capacity</code> se replace karo. Four healthy targets, min2/max6 aur original i-good preserve hone chahiye. ELB health automatic reconciliation off hai; exercise explicit lifecycle API practice karti hai.',
            account: a, tasks: TASKS, success: AG.allOf(TASKS), successText: 'Desired capacity 4 preserve hui; broken instance replaced aur modeled targets healthy hain. ASG activity mein replacement ID inspect kar sakte ho; real boot/drain/health timing separately verify karo.',
            hints: ['aws autoscaling set-desired-capacity --auto-scaling-group-name shopkaro-web --desired-capacity 4', 'aws autoscaling terminate-instance-in-auto-scaling-group --instance-id i-broken --no-should-decrement-desired-capacity'],
          };
        })() },
      ],
    },
    success: ['Requirement se ALB/NLB/GWLB choose kar sakta hoon', 'Readiness reason code aur ASG health source ka difference debug kar sakta hoon', 'Peak + worst-AZ-loss headroom budget model kar sakta hoon', 'Real API syntax se policy, health config aur replacement change kar sakta hoon; emulator/runtime difference jaanta hoon'],
    homework: '<p><b>Optional real AWS, billable:</b> approved sandbox mein two-AZ ALB + private ASG deploy karo. Current AMI, instance role, ACM cert, 443 listener/80 redirect aur SG chain use karo. Actual /healthz endpoint validate karo. Approved game-day window mein app process stop karke ELB-health replacement, request draining aur client IP logging test karo. ALB/EC2/EBS/public IPv4/logging/transfer ka cost estimate pehle karo; lab resources cleanup checklist follow karo. Real AWS execution agent ki default scope mein nahi hai.</p>',
    cards: [
      { front: 'ALB vs NLB vs GWLB?', back: 'ALB HTTP host/path; NLB TCP/UDP/TLS/static IP per AZ; GWLB inline inspection appliances. Native S3 target ALB/NLB feature nahi.' },
      { front: 'Default ASG health source?', back: 'EC2 checks. App failure replacement ke liye ELB health opt in; correct readiness endpoint + grace period choose karo.' },
      { front: 'All ALB registered targets unhealthy?', back: 'ALB fail open karke unhealthy targets ko route kar sakta hai. Empty/no usable target 503 alag case hai.' },
      { front: 'Target tracking kya karta hai?', back: 'Metric + target choose karo, e.g. ASGAverageCPUUtilization 50%. ASG managed alarms se capacity adjust karta hai; MaxSize/warmup/startup limits remain.' },
      { front: 'Grace, warmup, deregistration delay?', back: 'Grace premature replacement prevent; warmup scaling metrics stabilize; deregistration delay in-flight request drain. Teen alag jobs.' },
      { front: 'ALB HTTP instance-target defaults?', back: 'Path /, interval30s, timeout5s, unhealthy2, healthy5, matcher200. Newly registered target first successful initial check se healthy ho sakta hai.' },
      { front: 'ASG terminate without reducing capacity?', back: 'terminate-instance-in-auto-scaling-group --instance-id ID --no-should-decrement-desired-capacity. ASG desired preserve karke replacement launch karta hai.' },
      { front: 'ALB approximate cost model?', back: 'us-east-1 2025–26 approx $0.0225/LB-hour + $0.008/LCU-hour; highest LCU dimension. EC2, IPv4, storage, transfer and taxes separately.' },
    ],
  }]);
})();
