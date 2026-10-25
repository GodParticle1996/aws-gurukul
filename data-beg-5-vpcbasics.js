/* AWS Gurukul · Beginner 5 · VPC basics · 2026-10-25
   ShopKaro story fictional hai. Real incident aur AWS sources neeche linked hain.
   Every sentence names the actor; helpers stay inside this IIFE. */
(function () {
  const N = AG.aws.n;
  const effectiveTable = (s, subnetId) => {
    const subnet = (s.account.subnets || []).find(x => x.id === subnetId);
    if (!subnet) return null;
    const tables = (s.account.routeTables || []).filter(t => t.vpcId === subnet.vpcId);
    return tables.find(t => (t.associations || []).some(a => a.subnetId === subnetId)) ||
      tables.find(t => t.main || (t.associations || []).some(a => a.main)) || null;
  };
  const localOK = t => !!t && (t.routes || []).some(r => r.destination === '10.0.0.0/16' && r.target === 'local' && r.state !== 'blackhole');
  const internet = t => !!t && (t.routes || []).some(r => r.destination === '0.0.0.0/0' && r.target === 'igw-shop' && r.state !== 'blackhole');
  const noEgress = t => !!t && (t.routes || []).length === 1 && localOK(t);
  function account() {
    return {
      region: 'ap-south-1',
      callerIdentity: { Account: '123456789012', UserId: 'AIDARAVI', Arn: 'arn:aws:iam::123456789012:user/ravi' },
      vpcs: [{ id: 'vpc-shop', cidr: '10.0.0.0/16', name: 'shopkaro', default: false, igw: 'igw-shop' }],
      internetGateways: [{ id: 'igw-shop', vpcId: 'vpc-shop' }],
      subnets: [
        { id: 'subnet-web-a', vpcId: 'vpc-shop', cidr: '10.0.1.0/24', az: 'ap-south-1a', name: 'web-a', public: false },
        { id: 'subnet-db-a', vpcId: 'vpc-shop', cidr: '10.0.21.0/24', az: 'ap-south-1a', name: 'db-a', public: false },
      ],
      routeTables: [
        { id: 'rtb-main', vpcId: 'vpc-shop', main: true,
          routes: [{ destination: '10.0.0.0/16', target: 'local' }],
          associations: [{ id: 'rtbassoc-main', main: true }] },
        { id: 'rtb-public', vpcId: 'vpc-shop', routes: [
          { destination: '10.0.0.0/16', target: 'local' }, { destination: '0.0.0.0/0', target: 'igw-shop' },
        ], associations: [{ id: 'rtbassoc-db-a', subnetId: 'subnet-db-a', main: false }] },
        { id: 'rtb-private', vpcId: 'vpc-shop', routes: [{ destination: '10.0.0.0/16', target: 'local' }],
          associations: [{ id: 'rtbassoc-web-a', subnetId: 'subnet-web-a', main: false }] },
      ],
      securityGroups: [
        { id: 'sg-web', vpcId: 'vpc-shop', name: 'web', ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' }] },
        { id: 'sg-db', vpcId: 'vpc-shop', name: 'db', ingress: [{ protocol: 'tcp', fromPort: 5432, toPort: 5432, cidr: '0.0.0.0/0' }] },
      ],
      instances: [
        { id: 'i-web', name: 'web-1', state: 'running', type: 't3.small', vpcId: 'vpc-shop', subnetId: 'subnet-web-a', az: 'ap-south-1a', privateIp: '10.0.1.10', publicIp: '13.234.10.5', sgIds: ['sg-web'] },
        { id: 'i-db', name: 'db-1', state: 'running', type: 't3.small', vpcId: 'vpc-shop', subnetId: 'subnet-db-a', az: 'ap-south-1a', privateIp: '10.0.21.10', publicIp: '13.234.10.9', sgIds: ['sg-db'] },
      ],
      networkAcls: [{ id: 'acl-default', vpcId: 'vpc-shop', default: true, entries: [
        { RuleNumber: 100, Egress: false, Protocol: '-1', RuleAction: 'allow', CidrBlock: '0.0.0.0/0' },
        { RuleNumber: 32767, Egress: false, Protocol: '-1', RuleAction: 'deny', CidrBlock: '0.0.0.0/0' },
        { RuleNumber: 100, Egress: true, Protocol: '-1', RuleAction: 'allow', CidrBlock: '0.0.0.0/0' },
        { RuleNumber: 32767, Egress: true, Protocol: '-1', RuleAction: 'deny', CidrBlock: '0.0.0.0/0' },
      ] }],
    };
  }

  AG.registerLevels('beginner', [{
    id: 'vpcbasics', icon: '🌐', badge: 'VPC Voyager',
    title: 'VPC — website khule, database internet par na dikhe',
    hook: {
      when: 'ShopKaro · S3 leak ke agle hafte · fictional practice story',
      title: '"Database par ransom note — private cloud mein public darwaza kaise?"',
      text: 'Ravi ne catalog database EC2 par chalaya. Ravi ne default VPC aur default subnet chuna; EC2 ko public IPv4 mila. Office access ke liye Ravi ne SG mein PostgreSQL port <code>5432</code> ko <code>0.0.0.0/0</code> par khola. Chhe din baad catalog ki jagah ransom note mila. ShopKaro ki timeline practice story hai; har exposed DB ki same timeline nahi hoti. Neha ka sawal: "Kaunsa server internet se dikh sakta hai — route table, public IP ya firewall?" Pehle packet ko website aur database tak bhej kar dekho.',
    },
    objectives: [
      '<b>VPC → subnet → AZ</b>: ShopKaro ka web, app aur data layout plan karo',
      '<b>CIDR</b>: /16, /24, /28 aur har subnet ke 5 reserved IPs calculate karo',
      '<b>Public subnet</b> route se pehchano; auto public IP flag se guess mat karo',
      '<b>Route table association + longest prefix</b>: wrong table dhoondo aur repair karo',
      '<b>SG vs NACL</b>: stateful reply, stateless return ports aur explicit deny chuno',
      '<b>CLI + Terraform</b>: Moto par same two-AZ network banao; emulator limits pehchano',
    ],
    steps: [
      {
        q: 'Private cloud ke andar database public kaise ho gaya?',
        analogy: 'Gated society ki boundary <b>VPC</b> hai. Blocks <b>subnets</b> hain. Main gate <b>IGW</b> hai. Society ka direction map <b>route table</b> hai. Block ka guard <b>NACL</b> hai. Flat ke darwaze ka guard <b>SG</b> hai. Society ki boundary internet ka darwaza apne aap band nahi karti.',
        points: [
          'Naya custom VPC: AWS main route table aur local route banata hai. AWS custom VPC ke saath IGW attach nahi karta.',
          'Unmodified <b>default VPC</b>: har AZ mein default public subnet, attached IGW, main table mein internet route; default subnets auto public IPv4 assignment enable karte hain.',
          'Default VPC ka default SG internet se sab ports allow nahi karta. Ravi ne SG rule badal kar 5432 internet ke liye khola.',
          'VPC network isolation aur database authentication alag controls hain. Private route stolen IAM keys ya compromised app ko automatically block nahi karta.',
        ],
        example: '<b>Real incident:</b> January 2017 ke MongoDB ransom attacks ne internet-exposed, insecure databases ko wipe karke ransom notes chhode. Published research ne campaign ko MongoDB Apocalypse kaha. Vulnerable deployments ka lesson network restriction + authentication + tested backups hai; encryption-at-rest open database API ko band nahi karti. <a href="https://arxiv.org/abs/1907.06775" target="_blank" rel="noopener">Research source</a>.',
        asli: 'Database ko direct internet route mat do. Database SG sirf app SG ko allow kare. Database authentication aur backups bhi rakho.',
      },
      {
        q: 'CIDR mein /24 ka matlab 24 IPs kyun nahi?',
        analogy: 'Society ki plot-number book mein kuch digits block ke naam ke liye fixed hain. Bache digits ghar ke number hain. IPv4 mein 32 bits hain: prefix bada → ghar ke number kam.',
        body: '<div class="tbl-wrap"><table><tr><th>Prefix</th><th>Total addresses</th><th>Usable per ordinary AWS subnet</th></tr><tr><td>/16</td><td>2^(32−16) = 65,536</td><td>65,531, agar poora /16 ek subnet ho</td></tr><tr><td>/24</td><td>256</td><td>251</td></tr><tr><td>/28</td><td>16</td><td>11</td></tr></table></div>' +
          '<b>10.0.1.0/24</b> mein reserved addresses: <code>.0</code> network, <code>.1</code> VPC router, <code>.2</code> AWS-reserved, <code>.3</code> future use, <code>.255</code> broadcast-reserved. VPC broadcast support nahi karta. Amazon DNS resolver primary VPC base + 2 par milta hai: <code>10.0.0.2</code>. Har subnet ka base + 2 bhi reserved hai; har subnet ka .2 alag DNS server nahi hai.',
        code: '# VPC /16 ke andar /24 subnets that fit: 2^(24−16) = 256\n# 3 tiers × 3 AZs = 9 subnets\n# IP allocation: 9 × 256 / 65,536 = 3.52%\n# Usable addresses across 9 subnets: 9 × 251 = 2,259',
        asli: '5 addresses <b>per subnet</b> subtract karo, poore VPC par sirf ek baar nahi. Office, VPN aur future VPC ke saath non-overlapping CIDRs plan karo.',
      },
      {
        q: 'Ek subnet dono AZs mein failover kyun nahi karta?',
        analogy: 'Ek society block ek physical campus mein hota hai. Ek block ko do shehron mein stretch nahi kar sakte. AZ-a fail ho toh AZ-b ka alag block chahiye.',
        body: '<b>VPC region-wide</b> hai; <b>har subnet exactly ek AZ</b> mein hai. ShopKaro ka two-AZ target layout:' +
          '<div class="tbl-wrap"><table><tr><th>Tier</th><th>AZ-a</th><th>AZ-b</th><th>Internet route</th></tr>' +
          '<tr><td>Public ingress</td><td>10.0.1.0/24</td><td>10.0.2.0/24</td><td>0.0.0.0/0 → IGW</td></tr>' +
          '<tr><td>Private app</td><td>10.0.11.0/24</td><td>10.0.12.0/24</td><td>Optional NAT for outbound</td></tr>' +
          '<tr><td>Isolated data</td><td>10.0.21.0/24</td><td>10.0.22.0/24</td><td>Local only</td></tr></table></div>',
        points: [
          'Beginner lab pehle four subnets banati hai: public + private across two AZs. Data tier ko add karna same CIDR/association pattern hai.',
          'Har tier ke subnets ka size future instances, load balancer interfaces aur failover capacity ke liye rakho.',
          'Public ingress ke peeche app private subnets mein rakhna normal production pattern hai. Beginner packet walk public EC2 ko routing samjhane ke liye use karta hai.',
        ],
        asli: 'Do subnets banana availability guarantee nahi. Application aur database ki AZ redundancy bhi configure karni padti hai.',
      },
      {
        q: 'Public subnet kaun banata hai — route ya public IP flag?',
        body: '<b>Public subnet = associated route table mein internet gateway tak direct route.</b> General IPv4 internet ke liye route <code>0.0.0.0/0 → igw</code> hota hai. <b>Internet se EC2 tak successful connection</b> ke liye chaar alag checks hain:',
        points: [
          'Route table: subnet ka effective table attached IGW tak route deta hai.',
          'Address: EC2 ke paas public IPv4 ya Elastic IP hai. IGW EC2 public IPv4 ko EC2 private IPv4 se map karta hai.',
          'Filters: SG inbound destination port allow karta hai; NACL request aur return traffic allow karta hai.',
          'Service: EC2 OS par process expected port par listen karta hai; host firewall aur authentication bhi sahi hain.',
        ],
        code: '# Auto public IP assignment false reh sakta hai:\naws ec2 describe-subnets --subnet-ids "$WEB_A" \\\n  --query Subnets[0].MapPublicIpOnLaunch\n# Effective public route alag inspect karo:\naws ec2 describe-route-tables --filters "Name=association.subnet-id,Values=$WEB_A"',
        asli: 'Public subnet mein private-IP-only EC2 directly internet reachable nahi. Private subnet mein public IP assign karne se missing IGW route repair nahi hota. IPv6 ka ::/0 aur egress-only IGW alag design hai.',
      },
      {
        q: 'Packet route kaise chunta hai, aur main table kab lagta hai?',
        analogy: 'Courier ke paas general rule "baaki parcels main gate" aur specific rule "society ke parcels society mein" hai. Courier specific address rule pehle chunta hai.',
        code: '# Har table mein VPC-local route:\n10.0.0.0/16  -> local\n# Sirf public table mein:\n0.0.0.0/0    -> igw-shop\n# 10.0.21.10 /16 aur /0 dono match karta hai: /16 wins.\n# 203.0.113.8 sirf /0 match karta hai: IGW wins.',
        points: [
          '<b>Longest prefix match</b>: sabse specific matching destination select hota hai. Table ki display order route priority nahi hai.',
          'Explicit subnet association missing ho toh subnet <b>main route table</b> inherit karta hai. Implicit subnet ka alag association row output mein nahi dikhta.',
          'Ek subnet ek waqt mein ek subnet route table use karta hai. Ek table kai subnets serve kar sakta hai.',
          'AWS local route delete nahi karne deta. Advanced appliance designs mein local route ka target replace ho sakta hai; normal design local target rakhta hai.',
          'Main table local-only rakho. Public table sirf selected ingress subnets se associate karo. Galti se unassociated naya subnet private rahega.',
        ],
        asli: 'Route sahi table mein hona kaafi nahi. Subnet ka <b>effective association</b> sahi table tak pahunchna chahiye.',
      },
      {
        q: 'SG aur NACL dono kyun — response packet kahan atakta hai?',
        analogy: 'Flat ka guard approved guest ko pehchanta hai: reply ko dobara pass nahi chahiye. Block ka guard har direction par pass check karta hai.',
        body: '<div class="tbl-wrap"><table><tr><th>Decision</th><th>Security group</th><th>Network ACL</th></tr>' +
          '<tr><td>Scope</td><td>Resource network interface</td><td>Subnet boundary</td></tr>' +
          '<tr><td>Rules</td><td>Allow only; all applicable rules combine</td><td>Allow + deny; lowest-number matching rule wins</td></tr>' +
          '<tr><td>State</td><td>Stateful: tracked connection replies auto-allowed</td><td>Stateless: inbound + outbound rules separately</td></tr>' +
          '<tr><td>Default</td><td>New custom SG: no inbound, allow outbound</td><td>Default NACL allows; new custom NACL denies</td></tr>' +
          '<tr><td>Kab use</td><td>Web 443; DB 5432 from app SG</td><td>Subnet-wide bad IP deny / extra guardrail</td></tr></table></div>',
        example: 'Client <code>203.0.113.8:53000</code> → web <code>10.0.1.10:443</code>. NACL inbound destination 443 allow kare. Reply web:443 → client:53000 hai; NACL outbound destination <b>53000</b> allow kare. Broad client compatibility ke example mein <b>1024–65535</b> return range use hoti hai; exact ephemeral range client OS par depend karti hai.',
        asli: 'SG stateful hone se NACL stateful nahi banta. DB SG ka source app SG rakho; 0.0.0.0/0 mat rakho. SG reference app identity ka network filter hai, database password ka replacement nahi.',
      },
      {
        q: 'Private app ko updates ya S3 chahiye — NAT kab, endpoint kab?',
        analogy: 'Private block ka resident bahar shopping karne ja sakta hai; bahar ka stranger resident ke ghar naya connection nahi khol sakta. NAT outbound connection ka return address sambhalta hai.',
        body: '<div class="tbl-wrap"><table><tr><th>Need</th><th>Pick</th><th>Kab NAHI</th></tr>' +
          '<tr><td>General IPv4 internet outbound</td><td>Public NAT Gateway + private default route → NAT</td><td>Sirf S3/DynamoDB access ke liye NAT bill mat jodo</td></tr>' +
          '<tr><td>Same-region S3/DynamoDB private access</td><td>Gateway VPC endpoint + route-table association</td><td>Arbitrary external API ko gateway endpoint serve nahi karta</td></tr>' +
          '<tr><td>Other AWS services privately</td><td>Evaluate interface VPC endpoint</td><td>Interface endpoints free nahi; per-AZ hourly/data cost compare karo</td></tr></table></div>',
        points: [
          'Classic zonal public NAT Gateway public subnet mein EIP + IGW use karta hai. Multi-AZ zonal design mein har AZ ka app same-AZ NAT use kare. Regional NAT Gateway bhi available hai; regional availability aur per-AZ billing Intermediate level mein compare honge.',
          'Approx us-east-1 list-price illustration (2025–26): NAT ~$0.045/hour + ~$0.045/GB. 730 hours ≈ $32.85 ≈ ₹2,891 per NAT-month, ₹88/$ par; data processing, public IPv4 aur transfer extra.',
          'S3/DynamoDB <b>gateway</b> endpoints ka separate hourly/data-processing charge nahi. Usual S3/DynamoDB request/storage charges remain.',
          'Isolated DB ko internet route ki requirement nahi ho toh default route mat add karo. Managed RDS patching ko EC2 package-download model se confuse mat karo.',
        ],
        asli: 'General internet chahiye → NAT evaluate karo. Sirf S3/DynamoDB chahiye → gateway endpoint. External access chahiye hi nahi → local-only table. Lab NAT create nahi karti.',
      },
    ],
    myth: [
      { myth: 'MapPublicIpOnLaunch=true se subnet public ho gaya.', sach: 'Flag auto-address assignment control karta hai. Direct IGW route subnet ko public banata hai. EC2 reachability ke liye address, filters aur service bhi chahiye.' },
      { myth: 'Public table ka local route subnet /24 hota hai.', sach: 'Local route VPC CIDR hota hai: 10.0.0.0/16. Har VPC CIDR ka local route har table mein hota hai.' },
      { myth: 'SG 443 allow kare toh NACL outbound 443 enough hai.', sach: 'HTTPS reply ka destination client ka ephemeral port hai, example 53000. Stateless NACL return direction separately check karta hai.' },
      { myth: 'Private subnet database ko har attack se safe bana deta hai.', sach: 'Private subnet direct internet path remove karta hai. Compromised app, permissive internal SG, weak DB auth aur stolen credentials ke liye extra controls chahiye.' },
    ],
    playbook: {
      title: 'VPC review — address → route → association → filters',
      use: ['Internet-facing ingress: public subnets in two or more AZs', 'App/backend: private subnets; DB: isolated data subnets when outbound internet unnecessary', 'SG for app-to-DB allow; NACL for subnet-wide explicit deny'],
      avoid: ['Database direct IGW route + public IP + world-open DB port', 'Public/private guess from Name tags or MapPublicIpOnLaunch', 'Overlapping CIDRs with office, VPN or future peer VPC', 'NAT Gateway for S3-only traffic without evaluating gateway endpoints'],
      how: ['Non-overlapping VPC CIDR, tiers across AZs, capacity + spare IP budget', 'Main table local-only; public table default → attached IGW', 'Public associations explicitly inspect; DB table has no IGW default', 'SG least privilege; custom NACL request + return path; service listening verify'],
      redflags: ['Main route table mein 0.0.0.0/0 → IGW', '0.0.0.0/0 on port 5432/3306/27017', '/28 subnet nearly full before failover', 'NACL allows inbound 443 but blocks outbound client ephemeral ports'],
      rule: 'Internet connection? Route + public address + filters + service. DB isolation? Local/private route + app-only SG + authentication + backups.',
    },
    exam: [
      { cue: '"subnet must be public"', pick: 'Direct route to an attached internet gateway', why: 'Auto public IP flag route definition nahi hai.' },
      { cue: '"allow replies without additional outbound firewall rules"', pick: 'Security group stateful connection tracking', why: 'NACL ka return path alag allow hota hai.' },
      { cue: '"deny one malicious IP for every resource in a subnet"', pick: 'Lower-number NACL deny rule before broad allow', why: 'SG explicit deny support nahi karta; NACL first-match numbered rules use karta hai.' },
      { cue: '"private EC2 instances download updates from internet"', pick: 'Public NAT Gateway and private route → NAT', why: 'NAT established outbound connections ke replies allow karta hai; unsolicited inbound nahi.' },
      { cue: '"private S3 access without NAT hourly/data-processing charges"', pick: 'S3 gateway VPC endpoint associated with route tables', why: 'Gateway endpoint S3/DynamoDB-specific hai; arbitrary internet endpoint nahi.' },
      { cue: '"/24 ordinary IPv4 AWS subnet usable addresses"', pick: '251', why: '256 − 5 reserved per subnet.' },
      { cue: '"subnet not explicitly associated with any custom route table"', pick: 'Main route table applies implicitly', why: 'Subnet ka effective table hamesha hota hai; missing association row empty routing nahi hai.' },
      { cue: '"10.0.0.0/16 and 0.0.0.0/0 both match destination"', pick: '/16 route wins', why: 'Longest prefix match; display order irrelevant.' },
    ],
    stages: [
      {
        type: 'dryrun', title: '🔍 Packet walk — website ka reply, database ka locked route',
        goal: 'Client port <code>53000</code> se web port <code>443</code> tak request bhejo. Reply ke NACL port aur database ke internet path par decisions lo.',
        nodes: [N('user', 130, 85, { label: 'Client' }), N('igw', 130, 245, { label: 'IGW' }), N('rt', 410, 75, { label: 'Routes' }),
          N('nacl', 405, 235), N('sg', 630, 235, { label: 'web SG' }), N('ec2', 845, 235, { label: 'web :443' }),
          N('attacker', 130, 430), N('sg#db', 540, 420, { label: 'DB SG' }), N('ec2#db', 845, 420, { label: 'DB :5432' })],
        groups: [{ label: 'VPC 10.0.0.0/16', x: 265, y: 10, w: 720, h: 500, kind: 'vpc' },
          { label: 'Public subnet 10.0.1.0/24', x: 285, y: 145, w: 680, h: 190, kind: 'public' },
          { label: 'Isolated data subnet 10.0.21.0/24', x: 285, y: 355, w: 680, h: 140, kind: 'private' }],
        edges: [{ from: 'user', to: 'igw' }, { from: 'igw', to: 'rt', dashed: true }, { from: 'igw', to: 'nacl' },
          { from: 'nacl', to: 'sg' }, { from: 'sg', to: 'ec2' }, { from: 'sg#db', to: 'ec2#db' }],
        panels: [{ id: 'packet', title: 'Packet tuple / next decision' }, { id: 'routes', title: 'Effective routes / filters' }],
        steps: [
          { say: 'Client ne <code>203.0.113.8:53000 → 13.234.10.5:443</code> request bheji. Web EC2 ke paas public IPv4 hai; public route table attached IGW use karta hai.',
            flows: [{ from: 'user', to: 'igw', label: 'TCP dst 443', tone: 'busy' }],
            panels: { packet: ['203.0.113.8:53000 → 13.234.10.5:443'], routes: ['Public table: 10.0.0.0/16 → local', 'Public table: 0.0.0.0/0 → IGW'] } },
          { say: 'IGW ne EC2 public IPv4 <code>13.234.10.5</code> ko EC2 private IPv4 <code>10.0.1.10</code> se map kiya. Packet walk conceptual hai; AWS router aur filters physical serial appliances nahi hain.',
            flows: [{ from: 'igw', to: 'rt', label: 'routing context', tone: 'ok' }], nodes: { igw: { tone: 'ok', badge: '1:1 IPv4 mapping' } },
            panels: { packet: ['203.0.113.8:53000 → 10.0.1.10:443'] } },
          { say: 'VPC routing mein <code>10.0.1.10</code> ke liye <code>10.0.0.0/16 → local</code> zyada specific match hai. <code>/0</code> internal packet ko internet nahi bhejta.',
            flows: [{ from: 'igw', to: 'nacl', label: 'toward web subnet', tone: 'ok' }], nodes: { rt: { tone: 'ok', badge: '/16 wins' } } },
          { say: 'Public subnet NACL ka inbound rule 100 destination TCP 443 allow karta hai. NACL ne request allow ki; NACL ne connection state remember nahi ki.',
            flows: [{ from: 'nacl', to: 'sg', label: 'inbound 443 allowed', tone: 'ok' }], nodes: { nacl: { tone: 'ok', badge: 'inbound 443 ✓' } },
            panels: { routes: ['NACL inbound 100: TCP 443 allow', 'NACL outbound: return ports needed'] } },
          { say: 'Web SG ne inbound TCP 443 allow kiya. Nginx port 443 par listen karta hai. Web response <code>10.0.1.10:443 → 203.0.113.8:53000</code> hai. SG tracked response auto-allow karta hai.',
            flows: [{ from: 'sg', to: 'ec2', label: 'HTTPS request', tone: 'ok' }], nodes: { sg: { tone: 'ok', badge: 'tracked connection' }, ec2: { tone: 'ok', badge: 'reply src 443' } },
            panels: { packet: ['Reply: 10.0.1.10:443 → 203.0.113.8:53000'] },
            ask: { q: 'NACL outbound mein reply ke destination kaunsa port allow hona chahiye?',
              choices: ['TCP 53000; broad client compatibility ke liye 1024–65535 range evaluate karo', 'TCP 443, kyunki website HTTPS hai', 'Koi outbound rule nahi; SG stateful hai', 'TCP 5432, kyunki database use hota hai'], answer: 0,
              explain: 'Reply destination client ephemeral port 53000 hai. 443 server source port hai. SG connection state NACL ko bypass nahi karti; 5432 database connection ka alag port hai.' } },
          { say: 'NACL outbound ne client port 53000 allow kiya. Public table ka internet destination <code>/0 → IGW</code> match hua. IGW ne response source ko public IPv4 mein map kiya; client ko page mila.',
            flows: [{ from: 'ec2', to: 'sg', label: 'tracked reply', tone: 'ok' }, { from: 'sg', to: 'nacl', label: 'dst 53000', tone: 'ok' }, { from: 'nacl', to: 'igw', tone: 'ok' }, { from: 'igw', to: 'user', label: 'HTTPS response', tone: 'ok' }],
            nodes: { user: { tone: 'ok', badge: 'page received' } } },
          { say: 'Attacker ne internet se <code>10.0.21.10:5432</code> try kiya. Data subnet local-only table use karta hai. DB ke paas public IPv4 nahi. Internet private RFC1918 destination ko ShopKaro VPC tak route nahi karta.',
            nodes: { attacker: { tone: 'bad', badge: 'no direct path' }, 'ec2#db': { tone: 'ok', badge: 'private IPv4 only' } },
            panels: { routes: ['Data table: 10.0.0.0/16 → local', 'No IGW default; DB has no public IPv4', 'DB SG: 5432 only from app SG'] },
            ask: { q: 'DB SG galti se world-open ho jaaye toh internet attacker ko direct DB connection mil jayega?',
              choices: ['Direct path abhi bhi missing hai; internal attackers se risk badhega, SG phir bhi repair karo', 'Haan, SG automatically private IP ko public banata hai', 'Haan, local route internet gateway ban jaata hai', 'Nahi, private subnet database passwords ko enforce karta hai'], answer: 0,
              explain: 'SG route/public address create nahi karta. Private network direct internet path remove karta hai; authentication aur internal least privilege phir bhi zaroori hain.' } },
          { say: 'Ravi ke original default-VPC setup mein DB EC2 ke paas public IPv4, IGW route aur world-open 5432 tha. Internet packet ke saare network gates khule the. Route isolation + app-only SG + DB authentication + backup milkar protection dete hain.',
            nodes: { 'ec2#db': { tone: 'bad', badge: 'original setup: exposed' } },
            panels: { routes: ['Original: public IP ✓ + IGW route ✓ + 5432 world-open ✓', 'Target: isolated route + app-only SG + authentication', 'Real AWS packets not executed by this dry run'] } },
        ],
        lesson: 'Address, route, SG, NACL aur listening service alag gates hain. Har failed connection ka gate evidence se dhoondo.',
      },
      {
        type: 'flowlab', title: '🎛️ Subnet planner — growth ke liye jagah bachao',
        goal: '<b>3 AZs × 3 tiers</b> plan karo. Har subnet mein <b>≥250 usable IPs</b>; allocation <b>≤50% VPC space</b>; saare subnets VPC mein fit hon.',
        scenario: 'ShopKaro app AZ failure ke waqt spare IPs maangta hai. Prefix sliders move karo; available addresses aur fit count turant dekho. Public/private routes address math se alag configure hote hain.',
        knobs: [
          { id: 'vpcPrefix', label: 'VPC prefix /', min: 16, max: 24, step: 1, value: 24 },
          { id: 'subnetPrefix', label: 'Subnet prefix /', min: 18, max: 28, step: 1, value: 26 },
          { id: 'azs', label: 'Availability Zones', min: 2, max: 3, step: 1, value: 2 },
        ],
        model: k => {
          const valid = k.subnetPrefix > k.vpcPrefix;
          const usable = 2 ** (32 - k.subnetPrefix) - 5, needed = k.azs * 3;
          const fit = valid ? 2 ** (k.subnetPrefix - k.vpcPrefix) : 0;
          const used = valid ? needed / fit * 100 : 0;
          const ok = valid && k.azs === 3 && fit >= needed && usable >= 250 && used <= 50;
          return { readouts: [
            { label: 'Usable IPs / subnet', value: usable, tone: usable >= 250 ? 'ok' : 'bad' },
            { label: 'Subnets needed', value: needed },
            { label: 'Subnets that fit', value: valid ? fit : 'invalid prefixes', tone: fit >= needed ? 'ok' : 'bad' },
            { label: 'VPC space allocated', value: valid ? used.toFixed(2) + '%' : 'invalid', tone: valid && used <= 50 ? 'ok' : 'bad' },
          ], bars: [{ label: 'Allocated VPC space', pct: valid ? Math.min(100, used) : 0, tone: ok ? 'ok' : 'bad', text: valid ? needed + ' subnets / ' + fit + ' possible' : 'Subnet prefix must exceed VPC prefix' }],
          verdict: { ok, text: !valid ? 'Invalid: subnet prefix VPC prefix se bada rakho; planner ko multiple smaller subnets chahiye.' : ok ? 'Capacity plan ready: 9 subnets, enough usable IPs aur growth space. Routes/firewalls agla separate task hain.' : '3 AZs chuno; 9 subnets fit karao; ≥250 usable IPs/subnet aur ≤50% allocation rakho. /16 VPC + /24 subnets try karo.' } };
        },
        check: k => k.azs === 3 && k.subnetPrefix > k.vpcPrefix && 2 ** (32 - k.subnetPrefix) - 5 >= 250 && 9 / 2 ** (k.subnetPrefix - k.vpcPrefix) <= 0.5,
        lesson: 'Working example: /16 VPC, /24 subnets, 3 AZs = 9 subnets × 251 usable; VPC allocation 3.52%. Address capacity availability guarantee nahi hai.',
      },
      {
        type: 'order', title: '🧱 Build runbook — dependency order',
        instructions: 'ShopKaro runbook ka chosen sequence lagao. AWS kuch independent actions parallel allow karta hai; exercise main steps ki dependencies practice karti hai.',
        steps: [
          { text: 'Non-overlapping CIDR ke saath VPC banao', explain: 'Subnets, IGW attachment aur route tables ko VPC ID chahiye.' },
          { text: 'Har AZ ke liye non-overlapping public/private subnets banao', explain: 'Subnet CIDR VPC range mein fit hona chahiye; subnet ek AZ mein hota hai.' },
          { text: 'IGW create karke VPC se attach karo', explain: 'Public route attached IGW target use karega.' },
          { text: 'Public route table banao aur 0.0.0.0/0 → IGW route add karo', explain: 'Local route AWS pehle se add karta hai. Internet route manually add hota hai.' },
          { text: 'Sirf public subnets public table se explicitly associate karo', explain: 'Route wrong table mein reh gaya toh subnet main table use karega.' },
          { text: 'SG/NACL rules verify karo; request + return path test karo', explain: 'Routing connection permission nahi hai. Default NACL allow-all aur SG least privilege ko inspect karo.' },
        ],
      },
      {
        type: 'bins', title: '🛡️ Kaunsa guard — SG ya NACL?', instructions: 'Har property ko SG ya NACL mein place karo. Dono controls ka scope alag hai.',
        bins: [{ id: 'sg', label: 'Security group' }, { id: 'nacl', label: 'Network ACL' }],
        items: [
          { text: 'Tracked connection ka reply automatically allow', bin: 'sg', explain: 'SG stateful hai; NACL return direction separately evaluate karta hai.' },
          { text: 'Explicit deny a malicious source IP across a subnet', bin: 'nacl', explain: 'NACL allow + deny support karta hai; lower-number deny broad allow se pehle rakho.' },
          { text: 'Rule number 90 ka match rule 100 se pehle', bin: 'nacl', explain: 'NACL ascending rule number mein first match use karta hai.' },
          { text: 'All applicable allow rules combine; no numbered first-match', bin: 'sg', explain: 'SG allow-only hai. Multiple attached SGs ki permissions combine hoti hain.' },
          { text: 'DB port 5432 ka allowed source app SG', bin: 'sg', explain: 'SG references app resource interfaces ko allow kar sakte hain; database auth alag hai.' },
          { text: 'Request inbound 443; reply outbound client ephemeral port', bin: 'nacl', explain: 'NACL stateless hai. Reply destination client port hai.' },
          { text: 'Resource network-interface-level filtering', bin: 'sg', explain: 'SG resource ke network interface par attached hota hai.' },
          { text: 'New custom control has no allow rules and denies both directions', bin: 'nacl', explain: 'Custom NACL deny-all se start hota hai; default VPC NACL allow-all se alag hai.' },
        ],
      },
      {
        type: 'triage', title: '🩺 Site down — public IP aur SG sahi, phir bhi timeout',
        symptom: 'ShopKaro web EC2 running hai. Ravi ne <code>subnet-web-a</code> ko public naam diya. Public IPv4 aur SG 443 allow hai, par internet connection timeout hai. Pehle evidence cards kholo; missing path select karo.',
        commands: [
          { cmd: 'aws ec2 describe-instances --instance-ids i-web', out: '{"Reservations":[{"Instances":[{"InstanceId":"i-web","SubnetId":"subnet-web-a","PublicIpAddress":"13.234.10.5","State":{"Name":"running"}}]}]}', clue: true, note: 'Instance running + public IP present. Public IP missing wali hypothesis reject karo.' },
          { cmd: 'aws ec2 describe-route-tables --filters Name=association.subnet-id,Values=subnet-web-a', out: '{"RouteTables":[]}', clue: true, note: 'Explicit association nahi. Subnet main table inherit karta hai; route tables completely missing nahi hain.' },
          { cmd: 'aws ec2 describe-route-tables --filters Name=vpc-id,Values=vpc-shop Name=association.main,Values=true', out: '{"RouteTables":[{"RouteTableId":"rtb-main","Associations":[{"Main":true,"RouteTableAssociationId":"rtbassoc-main"}],"Routes":[{"DestinationCidrBlock":"10.0.0.0/16","GatewayId":"local"}]}]}', clue: true, note: 'Effective main table mein internet route nahi. Name tag public hone se main table route nahi badalta.' },
          { cmd: 'aws ec2 describe-route-tables --route-table-ids rtb-public', out: '{"RouteTables":[{"RouteTableId":"rtb-public","Routes":[{"DestinationCidrBlock":"10.0.0.0/16","GatewayId":"local"},{"DestinationCidrBlock":"0.0.0.0/0","GatewayId":"igw-shop"}],"Associations":[]}]}', clue: true, note: 'Public route correct table mein hai; web subnet public table se associated nahi.' },
          { cmd: 'aws ec2 describe-security-groups --group-ids sg-web', out: '{"SecurityGroups":[{"GroupId":"sg-web","IpPermissions":[{"IpProtocol":"tcp","FromPort":443,"ToPort":443,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]}]}', clue: false, note: 'SG 443 correct hai. SG ko all-ports open karke route fix nahi hoga.' },
          { cmd: 'aws ec2 describe-internet-gateways', out: '{"InternetGateways":[{"InternetGatewayId":"igw-shop","Attachments":[{"VpcId":"vpc-shop","State":"available"}]}]}', clue: false, note: 'IGW attached hai. Subnet ka effective route phir bhi missing hai.' },
          { cmd: 'aws ec2 describe-subnets --subnet-ids subnet-web-a', out: '{"Subnets":[{"SubnetId":"subnet-web-a","MapPublicIpOnLaunch":false}]}', clue: false, note: 'Auto public IP flag existing instance ke public IP ya route ko decide nahi karta.' },
        ],
        questions: [
          { q: 'Evidence se sabse direct root cause?', choices: ['Web subnet implicit main/local-only table use karta hai', 'SG mein 443 missing hai', 'IGW VPC se attached nahi hai', 'Auto public IP flag existing public IP ko block karta hai'], answer: 0,
            explain: 'Explicit association empty hai aur main table local-only hai. SG/IGW evidence healthy hai. MapPublicIpOnLaunch future automatic address assignment hai, packet filter nahi.' },
          { q: 'Private-by-default main table preserve karke fix?', choices: ['associate-route-table se web subnet ko existing rtb-public se jodo', 'Main table mein IGW default sab subnets ke liye add karo', 'SG mein all protocols world-open karo', 'EC2 reboot karo aur same route table rakho'], answer: 0,
            explain: 'Explicit public association web subnet ko intended internet route deta hai. Main table public karna future implicit subnets ka exposure badhata hai. SG widening aur reboot missing route repair nahi karte.' },
          { q: 'Naya unassociated data subnet private kyun rahega?', choices: ['Main table local-only hai; explicit public association nahi milegi', 'Data name tag internet traffic deny karta hai', 'Har new subnet ko private SG milta hai', 'VPC local route public IPv4 allocate karta hai'], answer: 0,
            explain: 'Implicit main association routing default decide karta hai. Name tags firewall nahi. SG resource interfaces par attach hota hai. Local route address allocate nahi karta.' },
        ],
      },
      (function () {
        const TASKS = [
          { text: 'subnet-web-a ko rtb-public se associate karo; attached IGW default + local route preserve karo', check: s => {
            const t = effectiveTable(s, 'subnet-web-a');
            return !!t && t.id === 'rtb-public' && localOK(t) && internet(t) && (s.account.internetGateways || []).some(g => g.id === 'igw-shop' && g.vpcId === t.vpcId) && (s.account.instances || []).some(i => i.id === 'i-web' && i.state === 'running' && i.publicIp && i.subnetId === 'subnet-web-a' && (i.sgIds || []).includes('sg-web')) && (s.account.securityGroups || []).some(g => g.id === 'sg-web' && (g.ingress || []).some(r => r.protocol === 'tcp' && r.fromPort <= 443 && r.toPort >= 443 && r.cidr === '0.0.0.0/0'));
          } },
          { text: 'subnet-db-a ko rtb-private se associate karo; DB table local-only rakho', check: s => {
            const t = effectiveTable(s, 'subnet-db-a'); return !!t && t.id === 'rtb-private' && noEgress(t) && (s.account.instances || []).some(i => i.id === 'i-db' && i.state === 'running' && i.subnetId === 'subnet-db-a');
          } },
          { text: 'Main table local-only preserve karo; DB aur web resources delete mat karo', check: s => (s.account.routeTables || []).some(t => t.id === 'rtb-main' && t.main && noEgress(t)) && (s.account.subnets || []).length === 2 },
        ];
        return { type: 'terminal', title: '🖥️ Mission — web down, DB exposed: dono associations swap karo',
          instructions: 'In-app simulator, real AWS CLI syntax. describe-route-tables output se <b>association IDs</b> padho; route table ID aur association ID alag hain.',
          goal: '<code>subnet-web-a</code> galti se <code>rtb-private</code> par hai. <code>subnet-db-a</code> galti se <code>rtb-public</code> par hai; DB EC2 public IPv4 + open 5432 ki wajah se exposed hai. <b>replace-route-table-association</b> se web → public, DB → private karo. Routes intact rakho; main table local-only rakho; EC2 instances running rakho. Mission route containment test karti hai; DB SG hardening interview terminal mein karoge.',
          account: account(), tasks: TASKS, success: AG.allOf(TASKS),
          successText: 'Web subnet ka effective route table public hai. DB subnet ka effective route table local-only hai, isliye DB public IP ke bawajood direct internet path band hai. Main table private-by-default hai. DB SG abhi wide hai: interview terminal mein DB SG ko app CIDR tak restrict karo. Real AWS par Reachability Analyzer/config checks aur actual service test bhi chahiye.',
          hints: [
            'aws ec2 describe-route-tables — Associations mein rtbassoc-web-a aur rtbassoc-db-a padho',
            'aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-public',
            'aws ec2 replace-route-table-association --association-id rtbassoc-db-a --route-table-id rtb-private',
          ],
        };
      })(),
      {
        type: 'docker', title: '🐳 Real CLI + Terraform — two-AZ VPC banao, route association todo aur jodo',
        project: '05-vpc-build',
        goal: 'README ke ex1–ex5 follow karo: VPC + four subnets + IGW route, two public associations, default NACL inspect, association swap/repair, same layout Terraform apply + destroy. All expected excerpts real Moto runs se captured hain.',
        why: 'Diagram packet decisions dikhata hai. Moto actual CLI requests ka configuration state store karta hai; Moto real packets ya DB reachability execute nahi karta.',
        steps: [
          { text: 'Setup + ex1: emulator env set karo, README commands se VPC aur chaar subnets banao.', cmd: 'cd aws-gurukul/docker-labs\n./start-moto.sh\nsource env.sh\ncd 05-vpc-build\n# README Setup aur ex1 commands isi terminal mein chalao.',
            expect: '10.0.1.0/24     ap-south-1a    False    251\n10.0.11.0/24    ap-south-1a    False    251\n10.0.12.0/24    ap-south-1b    False    251\n10.0.2.0/24     ap-south-1b    False    251' },
          { text: 'ex2: IGW attach, public route + associations. Web-a auto-address flag ko false hi rehne do.',
            cmd: 'aws ec2 describe-route-tables --route-table-ids "$PUBLIC_RT" \\\n  --query \'RouteTables[0].Routes[].{Destination:DestinationCidrBlock,Target:GatewayId}\'\naws ec2 describe-subnets --subnet-ids "$WEB_A" --query Subnets[0].MapPublicIpOnLaunch',
            expect: '[\n  { "Destination": "10.0.0.0/16", "Target": "local" },\n  { "Destination": "0.0.0.0/0", "Target": "igw-cf84201064440abf0" }\n]\nfalse' },
          { text: 'ex3–ex4: NACL inspect karo; web-a association main par shift karo, count 1 dekho; NEW association ID se public table par restore karo, count 2 dekho.',
            cmd: 'aws ec2 describe-network-acls --filters "Name=vpc-id,Values=$VPC" \\\n  --query \'NetworkAcls[0].Entries[].[RuleNumber,Egress,Protocol,RuleAction,CidrBlock]\' --output text',
            expect: '100      True     -1    allow    0.0.0.0/0\n32767    True     -1    deny     0.0.0.0/0\n100      False    -1    allow    0.0.0.0/0\n32767    False    -1    deny     0.0.0.0/0' },
          { text: 'ex5: Terraform init/validate/apply; repeat plan mein no changes dekho. Terraform destroy aur README CLI cleanup chalao.',
            cmd: 'terraform init\nterraform validate\nterraform apply\nterraform plan\nterraform destroy',
            expect: 'Apply complete! Resources: 10 added, 0 changed, 0 destroyed.\nNo changes. Your infrastructure matches the configuration.\nDestroy complete! Resources: 10 destroyed.' },
        ],
        observe: { q: 'Ex2 mein WEB_A MapPublicIpOnLaunch=false tha. WEB_A phir bhi public subnet kyun tha?',
          choices: ['Associated route table ka direct IGW route public subnet define karta hai', 'Name tag web-a ne internet access automatically enable kiya', 'Default NACL allow-all ne IGW route create kar diya', 'Terraform har subnet ka auto public IP flag true karta hai'], answer: 0,
          explain: 'Route + association subnet classification decide karte hain. Auto public IP flag sirf new instance automatic address assignment hai. Name tag aur NACL routes create nahi karte; main.tf flag false rakhta hai. EC2 packet delivery Moto test nahi karta.' },
      },
      {
        type: 'quiz', bonus: true, title: '📝 SAA-style decisions — VPC',
        questions: [
          { q: 'EC2 public IPv4 assigned hai, SG 443 allow hai. Subnet main table use karta hai; main table local-only hai. Least-scope fix?',
            choices: ['Subnet ko existing IGW-route public table se explicitly associate karo', 'MapPublicIpOnLaunch flag true karo aur existing route rakho', 'SG outbound mein client port 53000 allow karo', 'Main table se local route delete karo'], answer: 0,
            explain: 'Effective IGW route missing hai. Explicit public association selected subnet repair karti hai. Auto-address flag existing route nahi banata; SG stateful replies allow karta hai; local route delete nahi hota.' },
          { q: 'Ordinary /28 IPv4 AWS subnet mein kitne usable addresses milte hain?',
            choices: ['11: 16 total se 5 reserved subtract', '14: sirf network aur broadcast subtract', '16: AWS koi address reserve nahi karta', '251: /28 mein bhi /24 jitne usable'], answer: 0,
            explain: '/28 = 2^4 = 16 total, 5 AWS-reserved → 11. 14 generic network/broadcast subtraction hai; AWS 5 reserve karta hai. 251 /24 ka result hai.' },
          { q: 'NACL inbound TCP 443 allow hai. HTTPS reply client port 53000 par jaata hai. SG stateful hai. NACL outbound kis destination ko allow kare?',
            choices: ['Client TCP 53000, ya policy ke mutabik client ephemeral range', 'Server TCP 443 ko destination rakho', 'NACL outbound deny-all rakho, SG connection yaad rakhega', 'Database TCP 5432 destination allow karo'], answer: 0,
            explain: 'Return packet ka source 443 aur destination 53000 hai. NACL stateless hai; SG state NACL ko override nahi karti. Database port independent connection hai.' },
          { q: 'Specific malicious IP ko subnet ke sab resources se block karna hai; broad allow rule 100 present hai.',
            choices: ['NACL deny rule 90 mein malicious IP /32 add karo', 'SG deny rule mein malicious IP /32 add karo', 'NACL deny rule 110 mein malicious IP /32 add karo', 'Route table ke Name tag mein blocked IP likho'], answer: 0,
            explain: 'NACL lowest-number first-match use karta hai: 90 deny 100 allow se pehle. SG explicit deny nahi karta. Rule 110 tak broad match ke baad evaluation nahi jaayega; tag enforcement nahi hai.' },
          { q: 'Private EC2 app ko sirf same-region S3 bucket access chahiye. NAT processing cost avoid karna hai.',
            choices: ['S3 gateway endpoint aur relevant route-table associations configure karo', 'Har AZ mein public NAT Gateway create karo', 'S3 ke liye internet-facing ALB create karo', 'App ko public IPv4 aur world-open SG do'], answer: 0,
            explain: 'Gateway endpoint private S3 path deta hai aur endpoint hourly/processing fee nahi leta. NAT ka hourly/data bill hai; ALB S3 private endpoint replacement nahi; app public karna unnecessary exposure hai.' },
          { q: 'Destination 10.0.21.10 ke liye local 10.0.0.0/16 aur default 0.0.0.0/0 → IGW dono match hain.',
            choices: ['/16 local route choose hoga, kyunki prefix zyada specific hai', '/0 choose hoga, kyunki internet gateway priority leta hai', 'Route table mein pehle listed rule choose hoga', 'Dono routes par duplicate packet send hoga'], answer: 0,
            explain: 'Route selection longest prefix match hai. IGW ko automatic priority nahi; display order NACL-style routing rule nahi; packet routing duplicate requests nahi bhejti.' },
          { q: 'Unmodified default VPC mein default subnet ka characteristic kya hai?',
            choices: ['IGW route + automatic public IPv4 assignment enabled; SG permission separately needed', 'Default subnet local-only table use karta hai aur IGW absent hai', 'Default subnet mein har port world-open SG automatically milta hai', 'Default subnet ek saath region ke sab AZs span karta hai'], answer: 0,
            explain: 'Default VPC quick public launch ke liye preconfigured hai. SG inbound permission phir bhi separate hai. Custom VPC local-only start se confuse mat karo; har subnet single-AZ hai.' },
          { q: '3 AZs × 3 tiers, har subnet ≥250 usable IPs. /16 VPC + /24 subnets ka valid capacity result?',
            choices: ['9 subnets × 251 usable, VPC space allocation about 3.52%', '3 subnets × 251 usable, kyunki ek subnet multiple AZs span karta hai', '9 subnets × 256 usable, kyunki reserve sirf VPC par lagta hai', '9 subnets × 11 usable, kyunki /24 smallest subnet hai'], answer: 0,
            explain: 'Har tier ko har AZ mein separate subnet: 9. /24 usable 256−5=251. Allocation 9×256/65536=3.515625%. /28 smallest ordinary IPv4 subnet hai, /24 nahi.' },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — route evidence se decision', instructions: 'Four network decisions, phir DB route + SG containment ko CLI se implement karo.',
      questions: [
        { q: 'Interviewer: public subnet mein EC2 ke paas sirf private IPv4 hai. Direct internet clients EC2 tak kyun nahi pahunchte?',
          choices: ['IGW route alone public address mapping create nahi karta; EC2 ko public IPv4/EIP bhi chahiye', 'Public subnet har EC2 ko bina public IP direct route karta hai', 'SG stateful hai, isliye inbound internet unsupported hai', 'Private IPv4 internet par globally unique aur routable hota hai'], answer: 0,
          explain: 'IPv4 internet clients public destination use karte hain. IGW EC2 public/private mapping karta hai. SG filtering addresses allocate nahi karti; RFC1918 globally routable nahi hai.' },
        { q: 'App private subnet se third-party API call karta hai. Unsolicited inbound internet connections allow nahi karne. IPv4 design?',
          choices: ['Private default route → public NAT Gateway; NAT has public subnet + EIP + IGW', 'Private default route → IGW, bina instance public IPv4', 'S3 gateway endpoint ko third-party hostname ke liye use karo', 'NACL allow-all se private subnet ko internet mil jayega'], answer: 0,
          explain: 'Public NAT outbound IPv4 translate karta hai. Direct IGW path ko EC2 public address chahiye; S3 gateway endpoint arbitrary API nahi; NACL route translation nahi karta.' },
        { q: 'New data subnet ke liye explicit route-table association output empty hai. Kya verify karoge?',
          choices: ['Same VPC ka main route table; subnet implicit association use kar sakta hai', 'Naya EC2 key pair; route table key pair se choose hota hai', 'Har route table mein data subnet ka /24 local route add karunga', 'Empty association ka matlab subnet ke packets default-deny ho gaye'], answer: 0,
          explain: 'Implicit main association subnet routing provide karta hai. Key pair routing nahi; local route VPC CIDR ka hota hai; absence of explicit association absence of routes nahi hai.' },
        { q: 'DB private route par hai. Compromised app DB par unauthorized queries chala raha hai. Network isolation enough kyun nahi?',
          choices: ['Allowed app path still exists; DB authentication/authorization, secret rotation aur backup controls bhi chahiye', 'Private subnet compromised app ke credentials automatically revoke karta hai', 'NACL stateful tracking unauthorized SQL statements block karta hai', 'Local route automatically every database write encrypt karta hai'], answer: 0,
          explain: 'Network filters packet path/ports control karte hain, SQL permissions nahi. Private subnet credentials revoke nahi karta; NACL SQL inspect/stateful tracking nahi; local route encryption control nahi.' },
        { terminal: (function () {
          const a = account();
          // Both subnets inherit main; public table has no default route yet.
          a.routeTables[1].routes = [{ destination: '10.0.0.0/16', target: 'local' }];
          a.routeTables[1].associations = []; a.routeTables[2].associations = [];
          const TASKS = [
            { text: 'Public table mein attached IGW ka default route banao aur web subnet associate karo', check: s => { const t = effectiveTable(s, 'subnet-web-a'); return !!t && t.id === 'rtb-public' && localOK(t) && internet(t); } },
            { text: 'DB subnet main/local-only table par preserve karo', check: s => { const t = effectiveTable(s, 'subnet-db-a'); return !!t && t.id === 'rtb-main' && noEgress(t); } },
            { text: 'DB SG se world-open 5432 revoke karo; app tier 10.0.11.0/24 ko 5432 allow karo', check: s => {
              const sg = (s.account.securityGroups || []).find(g => g.id === 'sg-db');
              return !!sg && Array.isArray(sg.ingress) && sg.ingress.length === 1 && sg.ingress[0].protocol === 'tcp' && sg.ingress[0].fromPort === 5432 && sg.ingress[0].toPort === 5432 && sg.ingress[0].cidr === '10.0.11.0/24';
            } },
            { text: 'Web aur DB instances running rakho; resources delete karna fix nahi', check: s => ['i-web', 'i-db'].every(id => (s.account.instances || []).some(i => i.id === id && i.state === 'running')) },
          ];
          return { goal: 'Missing IGW route banao, web subnet explicitly associate karo, DB subnet main/local-only rakho. DB SG <code>sg-db</code>: 5432 world-open rule revoke karo; 5432 sirf app tier <code>10.0.11.0/24</code> allow karo. Production mein stable app SG reference prefer karo; exercise CIDR rule syntax practice karti hai.',
            account: a, tasks: TASKS, success: AG.allOf(TASKS),
            successText: 'Public route + association fixed; DB main/local-only preserved; DB SG accepts only app CIDR 5432. Running resources preserve hue. Route aur firewall dono independent layers verify hue.',
            hints: [
              'aws ec2 describe-route-tables',
              'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0 --gateway-id igw-shop',
              'aws ec2 associate-route-table --route-table-id rtb-public --subnet-id subnet-web-a',
              'aws ec2 revoke-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --cidr 0.0.0.0/0',
              'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --cidr 10.0.11.0/24',
            ],
          };
        })() },
      ],
    },
    success: ['CIDR math aur 5 reserved addresses per subnet calculate kar sakta hoon', 'Effective route table se public/private classify kar sakta hoon', 'SG/NACL return path aur explicit deny choose kar sakta hoon', 'Association ID use karke route containment repair kar sakta hoon', 'Moto par CLI + Terraform configuration verify kar sakta hoon; packet limits jaanta hoon'],
    homework: '<p><b>Optional real AWS:</b> pehle account/region verify karo. VPC and more wizard mein CIDR 10.0.0.0/16, 2 AZs, 2 public + 2 private subnets chuno. NAT gateways <b>None</b> rakho; EC2/public IPv4 allocate karna exercise ko zaroori nahi.</p><pre>aws sts get-caller-identity\naws ec2 describe-vpcs\naws ec2 describe-route-tables --filters Name=vpc-id,Values=YOUR_VPC_ID</pre><p>Console output mein public table ke 0.0.0.0/0 → IGW, correct public associations aur private table ke local-only route inspect karo. YOUR_VPC_ID ko actual output se replace karo. Resources review karke lab VPC delete karo. Approx NAT rates us-east-1 2025–26 illustration hain; current region price verify karo. <a href="https://aws.amazon.com/vpc/pricing/" target="_blank" rel="noopener">VPC pricing</a>.</p>',
    cards: [
      { front: 'Subnet public hone ki IPv4 routing condition?', back: 'Associated route table ka attached IGW tak direct route, normally 0.0.0.0/0. MapPublicIpOnLaunch sirf auto address assignment hai.' },
      { front: 'VPC /16 aur subnet /24 — total/usable kaise?', back: 'VPC /16 = 65,536 address space. Ordinary /24 subnet = 256 total − 5 reserved = 251 usable. Reserve per subnet subtract hota hai.' },
      { front: '10.0.1.0/24 ke five reserved addresses?', back: '.0 network, .1 router, .2 AWS-reserved, .3 future, .255 broadcast-reserved. Primary VPC 10.0.0.0/16 ka Amazon DNS resolver 10.0.0.2 hai.' },
      { front: 'SG stateful, NACL stateless — practical meaning?', back: 'SG tracked reply auto-allow karta hai. NACL request + return separately allow karta hai. Web:443 → client:53000 ke liye outbound NACL destination 53000 allow hona chahiye.' },
      { front: 'Explicit association missing toh subnet ka route table?', back: 'VPC main table implicitly applies. Main table local-only rakhna private-by-default routing deta hai.' },
      { front: 'Route table local destination /24 ya /16?', back: 'VPC CIDR: 10.0.0.0/16, har table mein. /16 local default /0 se zyada specific hai. Local route delete nahi hota.' },
      { front: 'Private EC2 internet vs S3-only access?', back: 'General IPv4 internet → public NAT Gateway. Same-region S3/DynamoDB → gateway endpoint evaluate karo; endpoint hourly/processing fee nahi.' },
      { front: 'Public database incident ka layered fix?', back: 'Direct IGW path remove karo; app-only DB SG, DB auth, secret rotation, tested backups aur incident review karo. Private route compromised app ko automatically neutralize nahi karta.' },
    ],
  }]);
})();
