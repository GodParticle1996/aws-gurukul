/* =====================================================================
   AWS Gurukul — 🌱 Beginner · Level 3: EC2 (v2, 2026-10-23)
   ShopKaro ka pehla cloud server — aur ek hafte mein teen classic galtiyan.
   Theme: server ke saath kya marta hai, kya bachta hai.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho. Chhote vaakya.
   Prices: us-east-1 Linux On-Demand (~2025–26), approx.
   ===================================================================== */
(function () {
  const N = AG.aws.n;

  /* T-family credits vs general purpose — mahine ka bill (730 ghante) */
  const INST = [
    { name: 't4g.large · unlimited', rate: 0.0672, burst: true, mode: 'unlimited' },
    { name: 't4g.large · standard', rate: 0.0672, burst: true, mode: 'standard' },
    { name: 'm7g.large (Graviton)', rate: 0.0816 },
    { name: 'm7i.large (Intel)', rate: 0.1008 },
  ];
  const BASELINE = 30, SURPLUS = 0.04, VCPU = 2, HRS = 730;
  function cpuModel(k) {
    const rows = INST.map((it, i) => {
      const over = Math.max(0, k.cpu - BASELINE) / 100;
      let cost = it.rate * HRS, throttled = false;
      if (it.burst && it.mode === 'unlimited') cost += over * VCPU * HRS * SURPLUS;
      if (it.burst && it.mode === 'standard' && k.cpu > BASELINE) throttled = true;
      return { i, name: it.name, cost, throttled };
    });
    const ok = rows.filter(r => !r.throttled);
    const cheapest = ok.reduce((a, b) => (b.cost < a.cost ? b : a));
    return { rows, cheapest, me: rows[k.inst] };
  }

  AG.registerLevels('beginner', [{
    id: 'ec2',
    icon: '🖥️',
    title: 'EC2 — server kiraye par, aur uske saath kya marta hai',
    badge: 'Instance Nawab',
    hook: {
      when: 'ShopKaro · cloud par pehla hafta',
      title: 'Teen din, teen jhatke',
      text: 'Ravi ne ShopKaro ko office server se ek EC2 instance par shift kiya. <b>Somvaar:</b> security group mein port 22 "sabke liye" khula tha. Server ke login log mein ek din mein 14,000 galat password attempts — duniya bhar ke bots. <b>Budhvaar:</b> sale se pehle server bada karne ke liye Ravi ne instance stop kiya, type badla, start kiya. Site 3 ghante band rahi — instance ka public IP badal gaya tha aur <code>shopkaro.in</code> ka DNS purane IP par point kar raha tha. <b>Shukravaar:</b> safai mein Ravi ne ek "test" server terminate kiya. Product catalog ka database usi server ki root disk par tha. Catalog gaya — koi snapshot nahi tha. Neha ka sawal: "Server ke saath kaunsi cheez marti hai aur kaunsi bachti hai? Yeh kahin likha kyun nahi hota?"',
    },
    objectives: [
      'EC2 launch ke <b>saare choices</b> — AMI, instance type, network, security group, storage, IAM role, user data',
      'Instance type ka <b>naam padhna</b> (m7g.large) aur <b>Graviton / T-family credits</b> ka paisa',
      '<b>Reboot / stop / hibernate / terminate</b> — kya bachta hai, kya marta hai, kiska bill chalta rehta hai',
      '<b>Security group</b> ka sahi istemaal, aur SSH ki jagah <b>SSM Session Manager</b>',
      '<b>IMDSv2</b> kyun zaroori hai (Capital One wala raasta band)',
      '<b>EBS</b> — AZ mein bandha disk, snapshots, DeleteOnTermination — aur exam ke <b>placement groups</b>',
    ],
    steps: [
      {
        q: 'EC2 instance hota kya hai — launch karte waqt kya-kya chunte ho?',
        analogy: 'Hotel ka kamra book karna. <b>Room type</b> (single/suite) = instance type. <b>Kamre mein pehle se rakha saamaan</b> (bed, TV, software) = AMI. <b>Kamra kis floor/wing mein</b> = VPC + subnet. <b>Darwaze ka guard</b> = security group. <b>Locker</b> jo checkout ke baad bhi rakh sakte ho = EBS volume. <b>Room service ka order</b> jo check-in par apne aap aa jaaye = user data.',
        body: '<div class="tbl-wrap"><table><tr><th>Choice</th><th>Kya hai</th><th>ShopKaro ka faisla</th></tr>' +
          '<tr><td><b>AMI</b></td><td>OS + pre-installed software ki image</td><td>Amazon Linux 2023</td></tr>' +
          '<tr><td><b>Instance type</b></td><td>vCPU + RAM + network ka size</td><td>m7g.large (2 vCPU, 8 GB)</td></tr>' +
          '<tr><td><b>Network</b></td><td>VPC, subnet (AZ yahi decide karta hai), public IP chahiye ya nahi</td><td>public subnet, ap-south-1a</td></tr>' +
          '<tr><td><b>Security group</b></td><td>Instance ka stateful firewall</td><td>sirf 443 inbound</td></tr>' +
          '<tr><td><b>Storage</b></td><td>Root EBS volume + extra volumes</td><td>gp3 root + alag data volume</td></tr>' +
          '<tr><td><b>IAM role</b></td><td>Instance profile — app ke temporary credentials</td><td>S3 read + SSM access</td></tr>' +
          '<tr><td><b>User data</b></td><td>Pehli boot par chalne wala script</td><td>nginx install</td></tr></table></div>',
        asli: 'EC2 = virtual machine AWS ke physical server (Nitro host) par. Shared responsibility: OS se upar sab tumhara — patching, firewall rules, data.',
      },
      {
        q: 'Instance type ka naam kaise padhein? (m7g.large)',
        body: '<code>m</code> <b>7</b> <code>g</code> . <code>large</code> = family · generation · attributes · size.' +
          '<div class="tbl-wrap"><table><tr><th>Hissa</th><th>Matlab</th></tr>' +
          '<tr><td><b>Family</b></td><td><code>t</code> burstable (credits) · <code>m</code> general · <code>c</code> compute (CPU zyada) · <code>r</code> memory (RAM zyada) · <code>x</code> bahut zyada RAM · <code>i</code> local NVMe storage · <code>g</code>/<code>p</code> GPU</td></tr>' +
          '<tr><td><b>Generation</b></td><td>Number jitna bada, utna naya (aksar sasta aur tez)</td></tr>' +
          '<tr><td><b>Attributes</b></td><td><code>g</code> = AWS Graviton (ARM) · <code>i</code> = Intel · <code>a</code> = AMD · <code>d</code> = local NVMe disk · <code>n</code> = zyada network</td></tr>' +
          '<tr><td><b>Size</b></td><td>nano → micro → small → medium → large → xlarge → 2xlarge… har step lagbhag 2× CPU/RAM aur 2× daam</td></tr></table></div>',
        example: 'Same size, alag chip: m7g.large ≈ $0.0816/ghanta, m7i.large ≈ $0.1008/ghanta. Graviton ~19% sasta. App ARM par chalti ho (Java, Node, Python, Go — aksar haan), toh Graviton pehli pasand.',
        asli: 'Pehle family chuno (kaam kis cheez ka bhooka hai — CPU, RAM, disk?), phir size. Har family ka latest generation lo.',
      },
      {
        q: 'T-family (burstable) ka jhol kya hai?',
        analogy: 'Mobile ka data pack jisme rollover hai. Roz ka quota (baseline) se kam use kiya toh bacha hua jama hota hai (credits). Kisi din zyada chahiye toh jama data kharch hota hai. Jama khatam → ya toh speed ghat jaati hai (standard), ya extra data ka alag bill (unlimited).',
        body: '<code>t4g.large</code> / <code>t3.large</code> ka <b>baseline 30%</b> CPU (har vCPU par). Baseline se neeche chalo toh credits jama. Upar chalo toh credits kharch.',
        points: [
          '<b>Standard mode:</b> credits khatam → CPU baseline (30%) par <b>throttle</b>. Site slow, aur CloudWatch CPU graph 30% par flat line dikhata hai — dhokha deta hai.',
          '<b>Unlimited mode</b> (t3/t4g ka default): throttle nahi, par baseline ke upar ka CPU <b>extra bill</b> (Graviton ~$0.04 per vCPU-ghanta).',
          'Average CPU baseline se kaafi upar rehta hai → T-family galat chuni. <code>m</code>/<code>c</code> family lo.',
        ],
        asli: 'T-family = dev servers, chhote spiky apps. 24×7 bhaari kaam = m/c family. Neeche wali live lab mein break-even khud dhoondo.',
      },
      {
        q: 'Reboot, stop, hibernate, terminate — kya bachta hai, kya marta hai?',
        body: '<div class="tbl-wrap"><table><tr><th></th><th>Reboot</th><th>Stop</th><th>Hibernate</th><th>Terminate</th></tr>' +
          '<tr><td>EBS root disk ka data</td><td>✅</td><td>✅</td><td>✅</td><td>❌ (DeleteOnTermination default true)</td></tr>' +
          '<tr><td>Extra EBS volume</td><td>✅</td><td>✅</td><td>✅</td><td>✅ (default false) — par bill chalta rehta hai</td></tr>' +
          '<tr><td>Instance store (local NVMe)</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td></tr>' +
          '<tr><td>RAM (memory)</td><td>❌</td><td>❌</td><td>✅ (disk par save)</td><td>❌</td></tr>' +
          '<tr><td>Public IPv4 (auto)</td><td>✅ same</td><td>❌ naya milega</td><td>❌ naya milega</td><td>❌</td></tr>' +
          '<tr><td>Private IP</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td></tr>' +
          '<tr><td>Elastic IP</td><td>✅</td><td>✅ juda rehta</td><td>✅</td><td>alag ho jaata hai — <b>bill chalta rehta</b></td></tr>' +
          '<tr><td>Compute bill</td><td>chalta</td><td>band</td><td>band</td><td>band</td></tr></table></div>',
        asli: 'Ravi ki dono galtiyan isi table mein thi: stop/start → naya public IP (DNS toota). Terminate → root disk gayi (catalog gaya). Data kabhi root disk par mat rakho, aur users ko IP nahi, load balancer/DNS naam do.',
      },
      {
        q: 'Security group — instance ka darwaza kaise band karein?',
        points: [
          '<b>Stateful:</b> andar aayi request ka jawab apne aap bahar jaata hai — return rule nahi likhna padta',
          '<b>Sirf Allow:</b> deny rule nahi hota (deny ke liye NACL — VPC level)',
          '<b>SG se SG:</b> "database sirf web-SG se 5432 par" — IP likhne ki zaroorat nahi, servers badlein tab bhi rule sahi',
          '<b>Port 22/3389 kabhi 0.0.0.0/0 nahi.</b> Shell chahiye → <b>SSM Session Manager</b>: koi inbound port nahi, IAM se control, har session ka log',
        ],
        example: 'ShopKaro web-SG: 443 from 0.0.0.0/0 (ya sirf load balancer ke SG se). DB-SG: 5432 from web-SG. Admin access: Session Manager — port 22 band.',
        asli: 'Internet par khula SSH port minutes mein mil jaata hai. Ravi ke log mein 14,000 attempts/din normal baat hai, koi khaas attack nahi.',
      },
      {
        q: 'User data aur instance metadata (IMDSv2) kya hain?',
        body: '<b>User data</b> = script jo instance ki <b>pehli boot</b> par ek baar chalta hai (software install, config). Har naya server khud taiyaar ho jaata hai — Auto Scaling ke liye zaroori.<br><br><b>Instance metadata</b> = server ke andar se <code>http://169.254.169.254</code> par instance ki jaankari — instance id, AZ, aur <b>IAM role ke temporary credentials</b>.',
        code: `# IMDSv2: pehle token lo (PUT), phir token ke saath maango
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \\
        -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \\
     http://169.254.169.254/latest/meta-data/placement/availability-zone

# IMDSv1 (purana) band karo — sirf token wali requests chalein:
aws ec2 modify-instance-metadata-options --instance-id i-0abc --http-tokens required`,
        asli: 'Capital One (2019): attacker ne app ke SSRF bug se server ko <code>169.254.169.254</code> par seedha GET bhejne par majboor kiya (IMDSv1) aur role credentials le liye. IMDSv2 ka PUT + token step SSRF se aksar ho hi nahi paata. Naye servers par <code>HttpTokens=required</code>.',
      },
      {
        q: 'EBS — disk jo instance se alag zinda rehti hai',
        points: [
          '<b>Network disk</b> — instance se attach, instance badlo toh disk doosre instance par laga sakte ho',
          '<b>Ek AZ mein bandhi</b> — ap-south-1a ki disk ap-south-1b ke server par nahi lagegi. Raasta: snapshot → naye AZ mein volume',
          '<b>Snapshot</b> = incremental backup, poore region mein (S3 ke andar) — AZ failure se bachta hai',
          '<b>Types:</b> gp3 (default SSD, 3,000 IOPS free baseline, ~$0.08/GB-mahina) · io2 (bhaari database IOPS) · st1/sc1 (sasta HDD, bade sequential files)',
          '<b>DeleteOnTermination:</b> root = true (default), extra volumes = false (default)',
        ],
        asli: 'Database/catalog ko alag EBS volume par rakho (ya RDS par — agla-agla level), aur AWS Backup / Data Lifecycle Manager se roz snapshot.',
      },
      {
        q: 'Placement groups — servers ko paas rakhein ya door? (exam favourite)',
        body: '<div class="tbl-wrap"><table><tr><th>Type</th><th>Kya karta hai</th><th>Kab</th></tr>' +
          '<tr><td><b>Cluster</b></td><td>Saare instances ek AZ mein, paas-paas — sabse kam latency, sabse zyada network</td><td>HPC, tightly-coupled jobs</td></tr>' +
          '<tr><td><b>Spread</b></td><td>Har instance alag rack/hardware par (ek AZ mein max 7 per group)</td><td>Kuch critical servers jo ek saath fail na hon</td></tr>' +
          '<tr><td><b>Partition</b></td><td>Instances partitions mein, har partition alag racks</td><td>Kafka, HDFS, Cassandra — rack-aware distributed systems</td></tr></table></div>',
        asli: 'Cluster = speed, par ek rack/AZ ka risk. Spread = alag-alag, kam scale. Partition = bade distributed systems.',
      },
    ],
    myth: [
      { myth: 'Stop karke start kiya, server bilkul waisa hi rahega.', sach: 'Public IP badal jaata hai, instance store saaf ho jaata hai, RAM ka data gaya. Sirf EBS disk aur private IP bachte hain.' },
      { myth: 'T3/T4g sabse sasta hai, toh hamesha wahi.', sach: 'Average CPU baseline se upar rehta hai toh unlimited mode extra bill deta hai, standard mode throttle karta hai. Steady kaam par m/c family sasti aur tez.' },
      { myth: 'Terminate sirf server band karta hai, disk toh bach jaati hai.', sach: 'Root disk ka DeleteOnTermination default true hai — terminate par root disk delete. Extra volumes bachte hain (aur bill hote rehte hain).' },
      { myth: 'Strong password hai, toh port 22 sabke liye khula chalega.', sach: 'Bots din-raat try karte hain, aur SSH/OS ke bugs password nahi poochte. Session Manager se port 22 ki zaroorat hi khatam.' },
    ],
    playbook: {
      title: 'EC2 sahi tarike se',
      use: [
        'Full OS control, legacy app, special hardware (GPU, bahut RAM, local NVMe), per-core licence',
        'Steady 24×7 kaam (Savings Plan ke saath)',
        'Auto Scaling group ke andar — ek instance ho tab bhi (khud replace ho jaata hai)',
      ],
      avoid: [
        'Spiky chhote event jobs — Lambda',
        'Container app jahan servers manage nahi karne — Fargate',
        'Data/database root disk par bina snapshot',
        'Users ko seedha instance ka public IP dena',
      ],
      how: [
        'AMI: Amazon Linux 2023 (ya company ka hardened AMI); Graviton jahan app support kare',
        'Launch template mein: IMDSv2 required, gp3 + encryption, IAM role, tags (owner, env)',
        'Security group: sirf zaroori ports; SG-to-SG rules; admin ke liye Session Manager',
        'Data alag volume par + AWS Backup / DLM snapshots',
        'Users ke saamne load balancer (DNS naam) — IP par kuch mat bandho',
      ],
      redflags: [
        'Port 22/3389 0.0.0.0/0',
        'HttpTokens = optional (IMDSv1 khula)',
        'T-family instance ka CPU graph baseline par flat',
        'Unattached EBS volumes aur unassociated Elastic IPs (chupchaap bill)',
        'Instance par koi owner tag nahi',
      ],
      rule: 'Server ko pashu samjho, pet nahi: kabhi bhi marne do, data alag rakho, naya server user data se khud taiyaar ho.',
    },
    exam: [
      { cue: '"lowest network latency / highest throughput between instances (HPC)"', pick: 'Cluster placement group', why: 'Ek AZ mein paas-paas.' },
      { cue: '"small number of critical instances must not fail together"', pick: 'Spread placement group', why: 'Har instance alag hardware.' },
      { cue: '"HDFS / Cassandra / Kafka, rack awareness"', pick: 'Partition placement group', why: 'Partitions alag racks par.' },
      { cue: '"preserve in-memory state; instance stops overnight"', pick: 'EC2 Hibernate', why: 'RAM encrypted root EBS par save.' },
      { cue: '"temporary data, highest IOPS, data loss acceptable"', pick: 'Instance store', why: 'Local NVMe, stop par saaf.' },
      { cue: '"static public IP that survives stop/start"', pick: 'Elastic IP (behtar: load balancer)', why: 'Auto public IP stop par chala jaata hai.' },
      { cue: '"shell access without opening port 22 / no bastion host"', pick: 'SSM Session Manager', why: 'IAM-based, logged, koi inbound port nahi.' },
      { cue: '"run a script automatically at first launch"', pick: 'User data', why: 'Pehli boot par cloud-init chalata hai.' },
      { cue: '"protect role credentials from SSRF via metadata"', pick: 'IMDSv2 (HttpTokens=required)', why: 'Token-based metadata.' },
    ],
    stages: [
      /* ---------- 1. DRY RUN ---------- */
      {
        type: 'dryrun',
        title: '🔍 Dry run — ek server ki zindagi: kya bachta, kya marta',
        goal: 'web-1 ko launch se terminate tak le jao. Har click par ek kaam — dekho disk, IP aur bill par kya asar hota hai.',
        groups: [
          { label: 'AZ ap-south-1a', x: 238, y: 18, w: 512, h: 484, kind: 'az' },
          { label: 'Public subnet', x: 256, y: 52, w: 476, h: 170, kind: 'public' },
        ],
        nodes: [
          N('user', 105, 120, { label: 'Shoppers' }),
          N('r53', 105, 380, { label: 'shopkaro.in DNS' }),
          N('ec2', 494, 140, { label: 'web-1' }),
          N('ebs#root', 380, 400, { label: 'root 8 GB' }),
          N('ebs#data', 615, 400, { label: 'data 50 GB' }),
          N('s3', 880, 400, { label: 'Snapshot' }),
        ],
        edges: [
          { from: 'user', to: 'ec2' }, { from: 'r53', to: 'ec2', dashed: true },
          { from: 'ec2', to: 'ebs#root' }, { from: 'ec2', to: 'ebs#data' }, { from: 'ebs#data', to: 's3', dashed: true },
        ],
        panels: [{ id: 'st', title: 'web-1 ki haalat' }, { id: 'bill', title: 'Bill abhi kis cheez ka chal raha hai' }],
        steps: [
          {
            say: 'Launch. User data ne nginx install kiya. Instance ko auto public IP mila <code>13.233.40.7</code>. DNS ka A record <code>shopkaro.in → 13.233.40.7</code>. Root disk ka DeleteOnTermination = true, data disk ka = false.',
            flows: [{ from: 'user', to: 'ec2', label: 'https', tone: 'ok' }, { from: 'r53', to: 'ec2', label: '→ 13.233.40.7', tone: 'acc' }],
            nodes: { ec2: { tone: 'ok', badge: 'running · 13.233.40.7' }, 'ebs#root': { tone: 'ok', badge: 'DeleteOnTerm: true' }, 'ebs#data': { tone: 'ok', badge: 'DeleteOnTerm: false' }, r53: { tone: 'ok' }, user: { tone: 'ok' } },
            panels: { st: ['state: running', 'public IP: 13.233.40.7', 'private IP: 10.0.1.10'], bill: ['EC2 compute ✅', 'EBS 8 + 50 GB ✅', 'Public IPv4 ✅ (~$0.005/ghanta)'] },
          },
          {
            say: '<b>Reboot</b> (OS restart). Same physical host, same disks, same IPs. Sirf RAM saaf hui aur processes dobara shuru hue.',
            nodes: { ec2: { tone: 'ok', badge: 'rebooted · 13.233.40.7' } },
            panels: { st: ['state: running', 'public IP: 13.233.40.7 (same)', 'RAM: saaf'] },
            ask: {
              q: 'Reboot ke baad public IP?',
              choices: ['Wahi rehta hai — reboot instance ko host par hi rakhta hai', 'Naya milta hai', 'IP hat jaata hai', 'Elastic IP ban jaata hai'],
              answer: 0,
              explain: 'Reboot sirf OS restart hai. IP sirf stop/start ya terminate par jaata hai.',
            },
          },
          {
            say: 'Ravi server bada karne ke liye <b>stop</b> karta hai (type badalna sirf stopped instance par hota hai). Auto public IP AWS wapas le leta hai. Compute ka bill band — par EBS disks ka bill chalta rehta hai.',
            flows: [{ from: 'r53', to: 'ec2', label: '→ 13.233.40.7 (ab kisi ka nahi)', tone: 'slow' }],
            nodes: { ec2: { tone: 'idle', badge: 'stopped · no public IP' }, user: { tone: 'slow', badge: 'site band (maintenance)' } },
            panels: { st: ['state: stopped', 'public IP: — (wapas AWS ko)', 'private IP: 10.0.1.10 (same)'], bill: ['EC2 compute ❌ band', 'EBS 8 + 50 GB ✅ chalu', 'Public IPv4 ❌'] },
          },
          {
            say: 'Type badal ke <b>start</b>. Instance ko <b>naya</b> public IP mila: <code>13.233.87.21</code>. DNS abhi bhi purane <code>13.233.40.7</code> par point kar raha hai.',
            flows: [{ from: 'user', to: 'r53', label: 'shopkaro.in?', tone: 'acc' }, { from: 'r53', to: 'ec2', label: '→ 13.233.40.7 ❌', tone: 'bad' }],
            nodes: { ec2: { tone: 'ok', badge: 'running · 13.233.87.21' }, r53: { tone: 'bad', badge: 'purana IP' }, user: { tone: 'bad', badge: 'site nahi khul rahi' } },
            panels: { st: ['state: running', 'public IP: 13.233.87.21 (NAYA)', 'private IP: 10.0.1.10'] },
            ask: {
              q: 'Server chal raha hai, phir bhi site kyun nahi khul rahi?',
              choices: [
                'DNS purane public IP par point kar raha hai; stop/start par auto public IP badal gaya',
                'Nginx crash ho gaya',
                'Security group delete ho gaya',
                'Naya instance type slow hai',
              ],
              answer: 0,
              explain: 'Auto-assigned public IPv4 instance ka nahi, AWS ka hai — stop par wapas chala jaata hai. Users ko kabhi instance ka IP mat do.',
            },
          },
          {
            say: 'Fix: <b>Elastic IP</b> allocate karke web-1 se jodo (<code>13.234.10.5</code>), DNS ek baar update. Elastic IP stop/start mein saath rehta hai. (Behtar production fix: users ke saamne load balancer — agle levels mein.)',
            flows: [{ from: 'r53', to: 'ec2', label: '→ 13.234.10.5 (Elastic IP)', tone: 'ok' }, { from: 'user', to: 'ec2', label: 'https', tone: 'ok' }],
            nodes: { ec2: { tone: 'ok', badge: 'running · EIP 13.234.10.5' }, r53: { tone: 'ok', badge: 'EIP par' }, user: { tone: 'ok', badge: 'site chalu' } },
            panels: { st: ['public IP: 13.234.10.5 (Elastic, stop/start mein same)'], bill: ['EC2 compute ✅', 'EBS ✅', 'Elastic IP ✅ (instance stopped ho tab bhi)'] },
          },
          {
            say: 'Safai se pehle data disk ka <b>snapshot</b>. Snapshot poore region mein store hota hai — ek AZ gire tab bhi bachta hai, aur kisi bhi AZ mein naya volume ban sakta hai.',
            flows: [{ from: 'ebs#data', to: 's3', label: 'snapshot', tone: 'acc' }],
            nodes: { s3: { tone: 'ok', badge: 'catalog backup' } },
            panels: { bill: ['EC2 compute ✅', 'EBS ✅', 'Elastic IP ✅', 'Snapshot storage ✅ (sirf badle blocks)'] },
          },
          {
            say: 'Ab web-1 <b>terminate</b>. Root disk (DeleteOnTermination true) <b>delete</b>. Data disk (false) bachi — "available" haalat mein. Snapshot bacha. Elastic IP instance se alag hua — par account mein allocated hai.',
            flows: [],
            nodes: { ec2: { tone: 'bad', badge: 'terminated' }, 'ebs#root': { tone: 'bad', badge: 'DELETE ho gayi' }, 'ebs#data': { tone: 'slow', badge: 'available (bacha)' }, r53: { tone: 'slow', badge: 'EIP kisi se juda nahi' }, user: { tone: 'idle', badge: '' } },
            panels: { st: ['state: terminated'], bill: ['EC2 compute ❌', 'root EBS ❌ (delete)', 'data EBS 50 GB ✅ abhi bhi!', 'Snapshot ✅', 'Elastic IP ✅ abhi bhi!'] },
            ask: {
              q: 'Terminate ke baad bhi kin cheezon ka bill aata rahega (agar bhool gaye)?',
              choices: [
                'Bachi hui data EBS volume, snapshot, aur allocated Elastic IP',
                'Kisi ka nahi — terminate sab saaf kar deta hai',
                'Sirf root disk ka',
                'Sirf compute ka',
              ],
              answer: 0,
              explain: 'Classic "zombie bill". Har mahine unattached volumes aur unassociated Elastic IPs ki list dekho (Trusted Advisor / Cost Explorer / CLI).',
            },
          },
        ],
        lesson: '<b>Asli baat:</b> instance mar sakta hai — data aur pehchaan (IP/DNS) instance se alag rakho. Root disk terminate par jaati hai, auto public IP stop par jaata hai, aur bachi hui cheezon (volumes, snapshots, Elastic IPs) ka bill chalta rehta hai.',
      },

      /* ---------- 2. LIVE LAB ---------- */
      {
        type: 'flowlab',
        title: '🎛️ Live lab — T-family credits vs general purpose: sasta kaun?',
        goal: 'ShopKaro ki API ka <b>average CPU 70%</b> hai, 24×7. CPU knob 60% ya upar rakho aur <b>sabse sasta instance chuno jo throttle na kare</b>.',
        scenario: 'Teeno instances 2 vCPU, 8 GB. t4g.large ka baseline 30% (har vCPU). Unlimited mode mein baseline se upar ka CPU extra bill (~$0.04 per vCPU-ghanta); standard mode mein credits khatam hone par CPU 30% par atak jaata hai. Daam us-east-1 approx.',
        knobs: [
          { id: 'cpu', label: 'Average CPU (24×7)', min: 10, max: 90, step: 10, value: 70, unit: '%' },
          { id: 'inst', label: 'Instance', min: 0, max: 3, step: 1, value: 0, labels: { 0: INST[0].name, 1: INST[1].name, 2: INST[2].name, 3: INST[3].name } },
        ],
        model: k => {
          const m = cpuModel(k);
          const max = Math.max(...m.rows.map(r => r.cost));
          return {
            readouts: [
              { label: 'Tumhara instance — mahine ka bill', value: '$' + m.me.cost.toFixed(2), tone: m.me.throttled ? 'bad' : m.me.i === m.cheapest.i ? 'ok' : 'warn' },
              { label: 'Performance', value: m.me.throttled ? `CPU 30% par atka (chahiye ${k.cpu}%) — site slow` : 'poora CPU milega', tone: m.me.throttled ? 'bad' : 'ok' },
              { label: 'Sabse sasta (bina throttle)', value: m.cheapest.name, tone: 'ok' },
              { label: 'Unka bill', value: '$' + m.cheapest.cost.toFixed(2), tone: 'ok' },
            ],
            bars: m.rows.map(r => ({ label: r.name + (r.throttled ? ' — ⚠️ throttle' : ''), pct: r.cost / max * 100, tone: r.throttled ? 'bad' : r.i === m.cheapest.i ? 'ok' : 'warn', text: '$' + r.cost.toFixed(2) })),
            verdict: m.me.throttled
              ? { ok: false, text: `Standard mode: average ${k.cpu}% baseline 30% se upar hai — credits khatam hote hi CPU 30% par atkega. Sasta dikhta hai, site slow hogi.` }
              : m.me.i === m.cheapest.i
                ? { ok: true, text: `${m.me.name} is load par sabse sasta hai jo throttle nahi karta — $${m.me.cost.toFixed(2)}/mahina.` }
                : { ok: false, text: `${m.me.name} chal jayega par ${m.cheapest.name} $${(m.me.cost - m.cheapest.cost).toFixed(2)}/mahina sasta hai is load par.` },
          };
        },
        check: k => k.cpu >= 60 && k.inst === 2,
        lesson: '🎯 70% average par t4g unlimited ka extra CPU bill m7g.large se zyada pada, aur standard mode throttle karta. Break-even lagbhag <b>48% average CPU</b> par hai: usse neeche T-family sasti, upar m-family. <b>Asli baat:</b> T-family ka daam sirf tab sasta hai jab average CPU baseline ke aas-paas ya neeche ho.',
        quiz: {
          q: 'Ek dev server ka average CPU 10–15% hai, kabhi-kabhi build ke time 100% ke spikes. Kaunsa?',
          choices: [
            'T-family (t4g) — baseline se neeche credits jama, spikes credits se chalenge',
            'm7i.large — sabse tez',
            'c7g.4xlarge — spikes ke liye bada',
            'Koi farak nahi',
          ],
          answer: 0,
          explain: 'Low average + short spikes = T-family ka asli use case. Slider 10–20% par le jaake bars dekho — t4g sabse sasta.',
        },
      },

      /* ---------- 3. MATCH ---------- */
      {
        type: 'match',
        title: 'Instance type ka naam padho',
        instructions: 'Har instance type ko uske sahi kaam se jodo.',
        pairs: [
          { left: 't4g.micro', right: 'Burstable — dev/test, chhota spiky load, CPU credits', explain: 't = burstable, g = Graviton.' },
          { left: 'm7g.large', right: 'General purpose — CPU aur RAM balanced (web/app server)', explain: 'm = general. Graviton = sasta.' },
          { left: 'c7i.2xlarge', right: 'Compute optimized — CPU-heavy (encoding, batch, game server)', explain: 'c = compute. i = Intel.' },
          { left: 'r7g.xlarge', right: 'Memory optimized — RAM zyada (cache, in-memory DB)', explain: 'r = RAM ke liye.' },
          { left: 'i4i.large', right: 'Storage optimized — local NVMe, bahut zyada IOPS', explain: 'i family = local SSD. Data stop par saaf!' },
          { left: 'g5.xlarge', right: 'GPU — ML inference, graphics', explain: 'g/p families = GPU.' },
        ],
      },

      /* ---------- 4. BINS ---------- */
      {
        type: 'bins',
        title: 'Stop ke baad — kya wahi rehta hai, kya kho jaata hai?',
        instructions: 'Instance ko stop karke start kiya. Har cheez ko sahi bin mein daalo.',
        bins: [
          { id: 'stay', label: '✅ Wahi rehta hai' },
          { id: 'lost', label: '❌ Kho jaata / badal jaata hai' },
        ],
        items: [
          { text: 'EBS root volume ka data', bin: 'stay', explain: 'EBS network disk hai — instance stop hone se data nahi jaata.' },
          { text: 'Auto-assigned public IPv4', bin: 'lost', explain: 'Stop par AWS wapas le leta hai, start par naya milta hai.' },
          { text: 'Private IP address', bin: 'stay', explain: 'VPC mein private IP instance ke saath rehta hai.' },
          { text: 'Instance store (local NVMe) ka data', bin: 'lost', explain: 'Local disk physical host ka hai — stop par host chhoot jaata hai, data saaf.' },
          { text: 'Juda hua Elastic IP', bin: 'stay', explain: 'Elastic IP account ka hai, stop/start mein instance se juda rehta hai.' },
          { text: 'RAM mein pada data (bina hibernate)', bin: 'lost', explain: 'RAM sirf hibernate mein disk par save hota hai.' },
          { text: 'Instance ID', bin: 'stay', explain: 'Stop/start mein instance wahi hai — ID same. Terminate par khatam.' },
          { text: 'Physical host (kis server par chal raha tha)', bin: 'lost', explain: 'Start par aksar naye host par jaata hai — isliye instance store saaf hota hai.' },
        ],
      },

      /* ---------- 5. TRIAGE ---------- */
      {
        type: 'triage',
        title: '🩺 Triage — "CPU sirf 30% hai, phir site slow kyun?"',
        symptom: 'Sale ka doosra din, dopahar 2 baje. ShopKaro checkout 6–8 second le raha hai. Ravi CloudWatch dekhta hai: CPU <b>30%</b>. "CPU toh aadha bhi nahi, AWS ki galti hai." Ticket khula. Tum dekho.',
        commands: [
          { cmd: 'aws ec2 describe-instances --instance-ids i-0web01 --query "Reservations[0].Instances[0].[InstanceType,State.Name]" --output text', out: 't3.large\trunning', clue: true, note: 'T-family (burstable). Credits ka khel shuru ho sakta hai.' },
          { cmd: 'aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUUtilization --dimensions Name=InstanceId,Value=i-0web01 --start-time 2026-10-22T10:00:00Z --end-time 2026-10-22T14:00:00Z --period 3600 --statistics Average --query "Datapoints[].[Timestamp,Average]" --output text', out: '2026-10-22T10:00:00Z\t88.4\n2026-10-22T11:00:00Z\t71.2\n2026-10-22T12:00:00Z\t30.1\n2026-10-22T13:00:00Z\t30.0', clue: true, note: 'Subah 88%, phir 12 baje se <b>bilkul 30.0 par flat</b>. Asli load kam nahi hua — graph ek chhat se takra raha hai. 30% = t3.large ka baseline.' },
          { cmd: 'aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUCreditBalance --dimensions Name=InstanceId,Value=i-0web01 --start-time 2026-10-22T10:00:00Z --end-time 2026-10-22T14:00:00Z --period 3600 --statistics Average --query "Datapoints[].[Timestamp,Average]" --output text', out: '2026-10-22T10:00:00Z\t412.0\n2026-10-22T11:00:00Z\t95.5\n2026-10-22T12:00:00Z\t0.0\n2026-10-22T13:00:00Z\t0.0', clue: true, note: 'Credits 412 → 0. 12 baje credits khatam — usi waqt CPU 30% par atka.' },
          { cmd: 'aws ec2 describe-instance-credit-specifications --instance-ids i-0web01', out: '{\n    "InstanceCreditSpecifications": [\n        { "InstanceId": "i-0web01", "CpuCredits": "standard" }\n    ]\n}', clue: true, note: 'Purane launch template ne <b>standard</b> mode set kiya tha → credits khatam = throttle.' },
          { cmd: 'aws ec2 describe-volumes --filters Name=attachment.instance-id,Values=i-0web01 --query "Volumes[].[VolumeId,VolumeType,Iops]" --output text', out: 'vol-0aa11\tgp3\t3000', clue: false, note: 'Disk theek hai — gp3 3,000 IOPS. Disk bottleneck nahi.' },
          { cmd: 'aws logs filter-log-events --log-group-name /shopkaro/nginx --filter-pattern "ERROR" --max-items 3', out: '{\n    "events": []\n}', clue: false, note: 'Koi app error nahi — requests bas dheere process ho rahi hain.' },
        ],
        questions: [
          {
            q: 'Root cause kya hai?',
            choices: [
              't3.large standard mode: sale ke load ne CPU credits khatam kar diye, ab CPU 30% baseline par throttle ho raha hai',
              'Disk slow hai',
              'AWS ka outage',
              'App mein memory leak',
            ],
            answer: 0,
            explain: 'Flat line exactly baseline par + CreditBalance 0 + standard mode = throttling. Graph "30%" dikhata hai kyunki CPU ko isse zyada milta hi nahi.',
          },
          {
            q: 'Abhi (sale ke beech) sabse tez relief?',
            choices: [
              'Credit specification ko unlimited karo (modify-instance-credit-specification) — turant throttle khatam, extra CPU ka bill',
              'Instance terminate karke naya',
              'CloudWatch alarm hata do',
              'Disk ko io2 karo',
            ],
            answer: 0,
            explain: 'Unlimited mode bina restart ke lagta hai. Lambi fix: steady load ke liye m7g/c7g family par shift (stop → type change → start, ya naya launch template + ASG).',
          },
          {
            q: 'Aage ke liye kaunsa alarm hona chahiye tha?',
            choices: ['CPUCreditBalance low par alarm (T-family ke liye)', 'Sirf CPUUtilization > 90%', 'Disk full alarm', 'Koi nahi'],
            answer: 0,
            explain: 'T-family par CPUUtilization alarm dhokha de sakta hai (throttle par 30% dikhata hai). Credit balance asli warning hai.',
          },
        ],
      },

      /* ---------- 6. TERMINAL ---------- */
      (function () {
        const web = s => (s.account.instances || []).find(i => i.id === 'i-0web01');
        const TASKS = [
          { text: 'web-sg se port 22 ka 0.0.0.0/0 rule hatao (revoke-security-group-ingress)', check: s => !((s.account.securityGroups || []).find(g => g.id === 'sg-web') || { ingress: [] }).ingress.some(r => r.fromPort === 22 && r.cidr === '0.0.0.0/0') },
          { text: 'web-1 par IMDSv2 required karo (modify-instance-metadata-options)', check: s => !!web(s) && web(s).imds === 'required' },
          { text: 'catalog data volume vol-0data ka snapshot lo (create-snapshot)', check: s => (s.account.snapshots || []).some(x => x.volumeId === 'vol-0data') },
          { text: 'Elastic IP allocate karke web-1 se jodo (allocate-address + associate-address)', check: s => !!web(s) && !!web(s).eip },
        ];
        return {
          type: 'terminal',
          title: '🖥️ Mission: web-1 ko harden karo (asli EC2 commands)',
          instructions: 'In-app simulator, asli CLI syntax. <code>help</code> se list. Allocation ID ke liye pehle <code>allocate-address</code> ka output padho.',
          goal: 'Ravi ki teeno galtiyan theek karo: <b>(1)</b> <code>sg-web</code> se SSH (22) ka <code>0.0.0.0/0</code> rule hatao. <b>(2)</b> <code>i-0web01</code> par IMDSv2 required. <b>(3)</b> catalog wali volume <code>vol-0data</code> ka snapshot. <b>(4)</b> Elastic IP allocate karke <code>i-0web01</code> se jodo — DNS ab stop/start par nahi tootega.',
          tasks: TASKS,
          account: {
            region: 'ap-south-1',
            callerIdentity: { Account: '123456789012', UserId: 'AIDARAVI', Arn: 'arn:aws:iam::123456789012:user/ravi' },
            instances: [{ id: 'i-0web01', name: 'web-1', type: 'm7g.large', state: 'running', az: 'ap-south-1a', vpcId: 'vpc-0shop', subnetId: 'subnet-0pub-a', sgIds: ['sg-web'], publicIp: '13.233.40.7', privateIp: '10.0.1.10', imds: 'optional' }],
            volumes: [
              { id: 'vol-0root', size: 8, type: 'gp3', state: 'in-use', attachedTo: 'i-0web01', deleteOnTermination: true, device: '/dev/xvda' },
              { id: 'vol-0data', size: 50, type: 'gp3', state: 'in-use', attachedTo: 'i-0web01', deleteOnTermination: false, device: '/dev/sdf' },
            ],
            securityGroups: [{ id: 'sg-web', vpcId: 'vpc-0shop', name: 'web-sg', ingress: [
              { protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' },
              { protocol: 'tcp', fromPort: 22, toPort: 22, cidr: '0.0.0.0/0' },
            ] }],
          },
          responses: [],
          success: AG.allOf(TASKS),
          successText: '🛡️ web-1 ab theek: <b>SSH duniya ke liye band</b> (admin Session Manager se), <b>IMDSv2</b> se metadata credentials SSRF se surakshit, <b>catalog ka snapshot</b> region mein, aur <b>Elastic IP</b> se stop/start par IP nahi badlega. Agla kadam (agle levels): users ke saamne load balancer, catalog RDS par.',
          hints: [
            'aws ec2 describe-security-groups',
            'aws ec2 revoke-security-group-ingress --group-id sg-web --protocol tcp --port 22 --cidr 0.0.0.0/0',
            'aws ec2 modify-instance-metadata-options --instance-id i-0web01 --http-tokens required --http-endpoint enabled',
            'aws ec2 create-snapshot --volume-id vol-0data --description catalog-backup',
            'aws ec2 allocate-address phir aws ec2 associate-address --allocation-id eipalloc-000000001 --instance-id i-0web01',
          ],
        };
      })(),

      /* ---------- 7. REAL LAB ---------- */
      {
        type: 'docker',
        title: '🐳 Real lab — EC2 lifecycle asli CLI se',
        project: '03-ec2-lifecycle',
        goal: 'Asli <code>aws</code> CLI se: port 22 ke bina SG + IMDSv2 + user data ke saath launch, stop/start par public IP badalte dekho, terminate par root disk marte aur data volume + snapshot bachte dekho, aur khule SSH wale security groups dhoondho.',
        steps: [
          { text: 'Emulator + env.', cmd: 'cd aws-gurukul/docker-labs\n./start-moto.sh\nsource env.sh\ncd 03-ec2-lifecycle' },
          { text: 'ex1 — sahi launch (README ke commands).', cmd: "aws ec2 describe-instances --instance-ids $I --query 'Reservations[0].Instances[0].{State:State.Name,PublicIp:PublicIpAddress,IMDS:MetadataOptions.HttpTokens}'", expect: '{\n    "State": "running",\n    "PublicIp": "54.214.153.144",\n    "IMDS": "required"\n}' },
          { text: 'ex2 — stop, phir start. Public IP dekho.', cmd: "aws ec2 stop-instances --instance-ids $I\naws ec2 start-instances --instance-ids $I\naws ec2 describe-instances --instance-ids $I --query 'Reservations[0].Instances[0].[State.Name,PublicIpAddress,PrivateIpAddress]' --output text", expect: 'stopped\tNone\t10.160.17.71        ← stop ke baad\nrunning\t54.214.130.115\t10.160.17.71   ← start ke baad: public IP NAYA, private same' },
          { text: 'ex3 — data volume + snapshot, phir terminate. Kaunsi volume bachi?', cmd: "aws ec2 terminate-instances --instance-ids $I\naws ec2 describe-volumes --query 'Volumes[].[VolumeId,Size,VolumeType,State]' --output text", expect: 'vol-d13dfb14608cb7617\t20\tgp3\tavailable   ← sirf data disk; root disk delete' },
          { text: 'ex4 — khule SSH wale security groups ka audit.', cmd: "aws ec2 describe-security-groups --filters Name=ip-permission.from-port,Values=22 Name=ip-permission.cidr,Values=0.0.0.0/0 --query 'SecurityGroups[].[GroupId,GroupName]' --output text", expect: 'sg-26ed3cf66308f71a7\told-admin-sg' },
        ],
        observe: {
          q: 'ex3 mein terminate ke baad root volume gayab thi par 20 GB data volume "available" thi. Kyun?',
          choices: [
            'Root volume ka DeleteOnTermination default true hai; baad mein attach ki volume ka default false',
            'Emulator ka bug',
            'Data volume encrypted thi isliye',
            'Snapshot ne volume ko bacha liya',
          ],
          answer: 0,
          explain: 'DeleteOnTermination flag decide karta hai. Snapshot ek alag backup hai — volume ko delete hone se nahi rokta.',
        },
      },

      /* ---------- 8. EXAM QUIZ ---------- */
      {
        type: 'quiz',
        bonus: true,
        title: '📝 SAA-style quick-fire — EC2',
        questions: [
          {
            q: 'HPC application ke nodes ke beech sabse kam latency aur sabse zyada network throughput chahiye.',
            choices: ['Cluster placement group', 'Spread placement group', 'Partition placement group', 'Har node alag AZ mein'],
            answer: 0,
            explain: 'Cluster = ek AZ mein paas-paas. Multi-AZ latency badhata hai.',
          },
          {
            q: 'Ek app ko raat ko band karna hai par subah RAM mein loaded cache ke saath turant wapas chalna hai.',
            choices: ['EC2 Hibernate', 'Stop/start', 'Reboot', 'Instance store'],
            answer: 0,
            explain: 'Hibernate RAM ko encrypted root EBS par save karta hai aur start par wapas load.',
          },
          {
            q: 'Video transcoding ke liye temporary scratch space chahiye — sabse zyada IOPS, data kho jaaye toh chalega.',
            choices: ['Instance store (NVMe)', 'EBS io2', 'EFS', 'S3'],
            answer: 0,
            explain: 'Temporary + max I/O + data loss OK = instance store.',
          },
          {
            q: 'Security team chahti hai engineers servers par shell lein bina port 22 khole aur bina bastion host ke, aur har session ka log rahe.',
            choices: ['AWS Systems Manager Session Manager', 'SSH key rotation', 'Security group mein office IP', 'EC2 Instance Connect public endpoint'],
            answer: 0,
            explain: 'Session Manager: IAM-based, koi inbound port nahi, logging S3/CloudWatch mein.',
          },
          {
            q: 'Naye EC2 instances launch hote hi khud web server install karein, bina manual login ke.',
            choices: ['User data script (launch template mein)', 'AMI ko har baar manually update', 'CloudWatch alarm', 'Elastic IP'],
            answer: 0,
            explain: 'User data pehli boot par chalta hai. Aur bhi tez: pre-baked AMI + chhota user data.',
          },
          {
            q: 'Kaunsa setting SSRF ke through instance metadata se role credentials churane ka risk sabse zyada kam karta hai?',
            choices: ['IMDSv2 required (HttpTokens=required)', 'Security group outbound band', 'Bada instance', 'Termination protection'],
            answer: 0,
            explain: 'IMDSv2 token-based hai — simple GET forward karne wala SSRF metadata nahi pad paata.',
          },
          {
            q: 'EBS volume ap-south-1a mein hai. Isse ap-south-1b ke instance par chahiye.',
            choices: ['Snapshot lo, phir ap-south-1b mein snapshot se naya volume', 'Volume seedha 1b ke instance se attach', 'Volume ko S3 mein copy', 'Possible nahi'],
            answer: 0,
            explain: 'EBS AZ-scoped; snapshot regional.',
          },
          {
            q: 'Do critical domain controllers ek hi hardware failure mein ek saath nahi girne chahiye (ek AZ ke andar).',
            choices: ['Spread placement group', 'Cluster placement group', 'Same instance type', 'Dedicated Instance'],
            answer: 0,
            explain: 'Spread = har instance alag rack/hardware.',
          },
        ],
      },
    ],
    interview: {
      title: 'Interview Round — EC2',
      instructions: 'EC2 round — har jawab mein "kya bachta hai, kya marta hai" aur security bolo. 🎤',
      questions: [
        {
          q: '"Stop aur terminate mein kya farak hai?"',
          choices: [
            'Stop: instance rehta hai, EBS data bachta hai, compute bill band, public IP chala jaata hai, instance store saaf. Terminate: instance khatam, root EBS default delete, extra volumes bachte hain',
            'Dono same hain',
            'Terminate temporary hai',
            'Stop mein EBS delete hota hai',
          ],
          answer: 0,
          explain: 'Bonus: "data root disk par mat rakho, aur users ko IP nahi, load balancer do."',
        },
        {
          q: '"Security group stateful hai — iska practical matlab?"',
          choices: [
            'Andar aayi allowed request ka jawab apne aap bahar jaata hai; return traffic ke liye alag rule nahi. NACL stateless hai — dono taraf rule',
            'Har request ka state AWS save karta hai',
            'SG mein deny rules hote hain',
            'SG subnet par lagta hai',
          ],
          answer: 0,
          explain: 'SG = instance/ENI level, allow-only, stateful. NACL = subnet level, allow+deny, stateless.',
        },
        {
          q: '"API server ka average CPU 75% hai, t3.large par hai, aur peak par slow ho jaata hai. Kya karoge?"',
          choices: [
            'Credit balance aur mode check; steady load hai toh m7g/c7g family par shift (Graviton = sasta) — T-family baseline ke upar mehenga/throttle',
            'Sabse bada instance',
            't3.nano par shift',
            'Kuch nahi',
          ],
          answer: 0,
          explain: 'Right family > bada size. Data se baat karo: CPUCreditBalance, CPUUtilization flat line.',
        },
        {
          q: '"IMDSv2 kya hai aur kyun?"',
          choices: [
            'Metadata service ka token-based version: pehle PUT se session token, phir token ke saath GET. SSRF se role credentials churana mushkil — Capital One 2019 isi raaste se hua tha',
            'Naya instance type',
            'Monitoring agent',
            'IAM ka naya version',
          ],
          answer: 0,
          explain: 'HttpTokens=required launch template mein default rakho.',
        },
        {
          terminal: {
            goal: '🎛️ Hands-on: audit report — "production par SSH internet se khula". <b>(1)</b> Security groups dekho. <b>(2)</b> Jis SG mein 22 → 0.0.0.0/0 hai, woh rule hatao. <b>(3)</b> Instances dekh ke confirm karo kaunsa server us SG par tha.',
            tasks: [
              { text: 'aws ec2 describe-security-groups', check: s => s.history.some(h => /aws ec2 describe-security-groups/.test(h)) },
              { text: 'sg-api se 22/0.0.0.0/0 revoke', check: s => !((s.account.securityGroups || []).find(g => g.id === 'sg-api') || { ingress: [] }).ingress.some(r => r.fromPort === 22 && r.cidr === '0.0.0.0/0') },
              { text: 'aws ec2 describe-instances', check: s => s.history.some(h => /aws ec2 describe-instances/.test(h)) },
            ],
            account: {
              region: 'ap-south-1',
              callerIdentity: { Account: '123456789012', UserId: 'AIDAOPS', Arn: 'arn:aws:iam::123456789012:user/ops' },
              securityGroups: [
                { id: 'sg-api', vpcId: 'vpc-0shop', name: 'api-sg', ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, cidr: '0.0.0.0/0' }, { protocol: 'tcp', fromPort: 22, toPort: 22, cidr: '0.0.0.0/0' }] },
                { id: 'sg-db', vpcId: 'vpc-0shop', name: 'db-sg', ingress: [{ protocol: 'tcp', fromPort: 5432, toPort: 5432, cidr: '10.0.1.0/24' }] },
              ],
              instances: [
                { id: 'i-0api01', name: 'api-1', type: 'm7g.large', state: 'running', az: 'ap-south-1a', vpcId: 'vpc-0shop', subnetId: 'subnet-0pub-a', sgIds: ['sg-api'], publicIp: '13.233.50.9', privateIp: '10.0.1.20', imds: 'required' },
                { id: 'i-0db01', name: 'db-1', type: 'r7g.large', state: 'running', az: 'ap-south-1b', vpcId: 'vpc-0shop', subnetId: 'subnet-0priv-b', sgIds: ['sg-db'], publicIp: null, privateIp: '10.0.2.20', imds: 'required' },
              ],
            },
            success: s => s.history.some(h => /aws ec2 describe-security-groups/.test(h)) && s.history.some(h => /aws ec2 describe-instances/.test(h)) && !((s.account.securityGroups || []).find(g => g.id === 'sg-api') || { ingress: [] }).ingress.some(r => r.fromPort === 22 && r.cidr === '0.0.0.0/0'),
            successText: 'Fixed. <b>api-sg</b> ka SSH internet se band; <b>api-1</b> (13.233.50.9) us SG par tha. <b>db-sg</b> pehle se sahi tha — 5432 sirf app subnet se. Interview mein add karo: "admin access ke liye Session Manager, aur Config rule <code>restricted-ssh</code> se aage aisa SG banne par alert."',
            hints: [
              'aws ec2 describe-security-groups',
              'aws ec2 revoke-security-group-ingress --group-id sg-api --protocol tcp --port 22 --cidr 0.0.0.0/0',
              'aws ec2 describe-instances',
            ],
          },
        },
      ],
    },
    success: [
      'Main EC2 launch ke saare choices bata sakta hoon aur instance type ka naam padh sakta hoon (m7g.large)',
      'Main T-family credits ka break-even samjhta hoon aur steady load par sahi family chun sakta hoon',
      'Main reboot/stop/hibernate/terminate mein kya bachta hai, kya marta hai — aur kiska bill chalta rehta hai — bata sakta hoon',
      'Main security group, Session Manager aur IMDSv2 se server harden kar sakta hoon',
      'Main EBS snapshots se data bacha sakta hoon aur AZ badal sakta hoon; placement groups ka farak jaanta hoon',
    ],
    homework: `<p><b>Asli account (optional — Free plan credits):</b></p>
      <pre>1. EC2 → Launch instance: Amazon Linux 2023, t4g.micro (ya t3.micro), network settings mein
   "Allow SSH" UNCHECK; Advanced → Metadata version: V2 only; IAM instance profile: AmazonSSMManagedInstanceCore wala role
2. Systems Manager → Session Manager → Start session (port 22 ke bina shell!)
3. Shell mein IMDSv2 se AZ nikaalo (step 6 ka code)
4. Instance stop → start → public IP compare karo
5. Terminate. Phir: aws ec2 describe-volumes --filters Name=status,Values=available   (koi zombie volume?)</pre>
      <p>✅ Self-check: bina port 22 khole shell mila? Terminate ke baad koi "available" volume ya unassociated Elastic IP to nahi bacha?</p>`,
    cards: [
      { front: 'Stop/start ke baad kya badalta hai?', back: 'Auto <b>public IP naya</b>, instance store saaf, RAM saaf, aksar naya host. EBS data, private IP, Elastic IP, instance ID same.' },
      { front: 'Terminate par root EBS ka kya hota hai?', back: 'Root volume ka DeleteOnTermination default <b>true</b> → delete. Extra attached volumes default <b>false</b> → bachte (aur bill hote rehte).' },
      { front: 'T-family: standard vs unlimited?', back: 'Credits khatam → <b>standard</b> = CPU baseline par throttle; <b>unlimited</b> (t3/t4g default) = throttle nahi, extra CPU ka bill. Average CPU baseline se upar → m/c family.' },
      { front: 'm7g.large ka matlab?', back: 'm = general purpose, 7 = generation, g = Graviton (ARM), large = size (2 vCPU / 8 GB).' },
      { front: 'IMDSv2 kya bachata hai?', back: 'Token-based metadata (PUT token → GET with token). SSRF se role credentials churana mushkil. Setting: <code>HttpTokens=required</code>.' },
      { front: 'Placement groups — cluster vs spread vs partition?', back: '<b>Cluster</b> = ek AZ paas-paas, low latency (HPC). <b>Spread</b> = har instance alag hardware (max 7/AZ). <b>Partition</b> = rack groups (Kafka/HDFS/Cassandra).' },
      { front: 'Port 22 khole bina server par shell?', back: '<b>SSM Session Manager</b> — IAM-controlled, logged, koi inbound port nahi.' },
      { front: 'EBS volume doosre AZ mein kaise le jaayein?', back: 'Snapshot (regional) → naye AZ mein snapshot se volume. EBS volume AZ-scoped hai.' },
    ],
  }]);
})();
