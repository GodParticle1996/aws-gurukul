/* =====================================================================
   AWS Gurukul — Concept Visuals
   Har level ka ek signature diagram, style.css ke .dg-* primitives se.
   Pure HTML/CSS/emoji — koi dependency nahi.
   Entry: { t: chhota title, html: diagram markup }
   Hotspot games ke liye clickable nodes par data-hs="<target>" hota hai.
   ===================================================================== */

const VISUALS = {

  /* ================= TRACK 1 — BEGINNER ================= */

  cloud101: {
    t: 'On-prem vs Cloud — aur Region/AZ ka khel',
    html: `
      <div class="dg-split">
        <div class="dg-box is-bad"><span class="bx-label">🏚️ On-prem (apna server)</span>
          <div class="dg-col">
            <div class="dg-node is-bad"><span class="ni">🖥️</span><span class="nl">Server kharido</span><span class="ns">3-6 weeks lead time</span></div>
            <span class="dg-pill bad">💰 capacity guess — zyada ya kam?</span>
            <span class="dg-pill bad">🔧 hardware maintenance tumhara</span>
            <span class="dg-pill bad">⚡ scaling = nayi machine kharido</span>
          </div>
        </div>
        <div class="dg-box is-good"><span class="bx-label">☁️ Cloud (AWS)</span>
          <div class="dg-col">
            <div class="dg-node is-good pulse"><span class="ni">🚀</span><span class="nl">Minutes mein launch</span><span class="ns">pay-as-you-go</span></div>
            <span class="dg-pill good">💰 pay for what you use</span>
            <span class="dg-pill good">🔧 AWS manages hardware</span>
            <span class="dg-pill good">⚡ scaling = API call (seconds)</span>
          </div>
        </div>
      </div>
      <div class="dg-flow" style="margin-top:14px">
        <div class="dg-box is-accent"><span class="bx-label">🌍 Region: ap-south-1 (Mumbai)</span>
          <div class="dg-flow">
            <div class="dg-node is-accent" data-hs="az"><span class="ni">🏢</span><span class="nl">ap-south-1a</span><span class="ns">alag bijli + network</span></div>
            <div class="dg-node is-accent" data-hs="az"><span class="ni">🏢</span><span class="nl">ap-south-1b</span><span class="ns">alag bijli + network</span></div>
            <div class="dg-node is-accent" data-hs="az"><span class="ni">🏢</span><span class="nl">ap-south-1c</span><span class="ns">alag bijli + network</span></div>
          </div>
        </div>
      </div>
      <div class="dg-cap"><b>Region</b> = shehar (data kahan rahega). <b>AZ</b> = shehar ke alag godown (ek gire toh doosra chale). Multi-AZ = AZ failure se bachav. <b>Shared responsibility:</b> datacenter AWS ka, data + access + config tumhara.AWS cloud ka security, tumhare data ka security tumhara.</div>`,
  },

  iam: {
    t: 'IAM — kaun kya kar sakta hai?',
    html: `
      <div class="dg-flow">
        <div class="dg-node is-bad" data-hs="root"><span class="ni">👑</span><span class="nl">Root user</span><span class="ns">sab power — band karo!</span></div>
        <div class="dg-link"><span class="dg-pill bad">MFA on, use rarely</span><div class="dg-arrow bad"></div></div>
        <div class="dg-col">
          <div class="dg-box is-accent"><span class="bx-label">🔐 IAM</span>
            <div class="dg-flow">
              <div class="dg-node is-accent" data-hs="user"><span class="ni">👤</span><span class="nl">User</span><span class="ns">1 insaan</span></div>
              <div class="dg-node is-gold" data-hs="role"><span class="ni">🎭</span><span class="nl">Role</span><span class="ns">temporary power</span></div>
              <div class="dg-node" data-hs="group"><span class="ni">👥</span><span class="nl">Group</span><span class="ns">users ka dabba</span></div>
            </div>
            <div class="dg-flow" style="margin-top:10px">
              <div class="dg-node is-good" data-hs="policy"><span class="ni">📜</span><span class="nl">Policy</span><span class="ns">JSON rules: Allow/Deny</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="dg-cap"><b>Least privilege</b> — sirf utna power jitna zaroori. Role = app ko temporary power dene ka tarika (EC2 ko S3 access chahiye? role lagao). <b>Root user daily use mat karo!</b></div>`,
  },

  ec2: {
    t: 'EC2 — virtual machine AWS par',
    html: `
      <div class="dg-flow">
        <div class="dg-col">
          <div class="dg-node is-accent pulse"><span class="ni">🖥️</span><span class="nl">EC2 Instance</span><span class="ns">t2.micro / m5.large</span></div>
          <div class="dg-stack" style="margin-top:8px">
            <span class="dg-pill acc" data-hs="ami">AMI = image (OS + software)</span>
            <span class="dg-pill acc" data-hs="type">Instance type = CPU/RAM size</span>
            <span class="dg-pill gold" data-hs="keypair">Key pair = SSH access</span>
          </div>
        </div>
        <div class="dg-link"><span class="dg-pill acc">attach</span><div class="dg-arrow flow"></div></div>
        <div class="dg-col">
          <div class="dg-node" data-hs="ebs"><span class="ni">💾</span><span class="nl">EBS Volume</span><span class="ns">persistent disk</span></div>
          <div class="dg-node is-good" data-hs="sg"><span class="ni">🛡️</span><span class="nl">Security Group</span><span class="ns">firewall</span></div>
        </div>
      </div>
      <div class="dg-cap">EC2 = tumhari virtual machine. <b>AMI</b> = OS+software ka image, <b>instance type</b> = CPU/RAM, <b>EBS</b> = disk (instance mara toh bhi disk rehta), <b>Security Group</b> = firewall (allow rules, deny default).</div>`,
  },

  s3: {
    t: 'S3 — object storage, files ka mighty dabba',
    html: `
      <div class="dg-flow">
        <div class="dg-col">
          <div class="dg-node is-accent pulse" data-hs="bucket"><span class="ni">🪣</span><span class="nl">S3 Bucket</span><span class="ns">globally unique naam</span></div>
          <div class="dg-col" style="margin-top:8px">
            <div class="dg-node" data-hs="key"><span class="ni">📄</span><span class="nl">object</span><span class="ns">key + data + metadata</span></div>
            <div class="dg-node" data-hs="key"><span class="ni">🖼️</span><span class="nl">object</span><span class="ns">key = path/filename</span></div>
            <div class="dg-node" data-hs="key"><span class="ni">🎬</span><span class="nl">object</span><span class="ns">5 TB tak</span></div>
          </div>
        </div>
        <div class="dg-link"><span class="dg-pill acc">permissions</span><div class="dg-arrow flow"></div></div>
        <div class="dg-col">
          <div class="dg-node is-good" data-hs="policy"><span class="ni">📜</span><span class="nl">Bucket Policy</span><span class="ns">who can access</span></div>
          <div class="dg-node is-gold" data-hs="encryption"><span class="ni">🔒</span><span class="nl">Encryption</span><span class="ns">SSE-S3 / SSE-KMS</span></div>
        </div>
      </div>
      <div class="dg-cap"><b>Bucket</b> = top-level container (globally unique naam). <b>Key</b> = file ka path. <b>Object</b> = file + metadata. S3 = 11 nines durability (99.999999999%). Static website host bhi kar sakte ho!</div>`,
  },

  vpcbasics: {
    t: 'VPC — tumhare cloud ka private network',
    html: `
      <div class="dg-box is-accent"><span class="bx-label">🌐 VPC 10.0.0.0/16</span>
        <div class="dg-split">
          <div class="dg-box is-good"><span class="bx-label">AZ-a · Public subnet</span>
            <div class="dg-flow">
              <div class="dg-node is-good" data-hs="igw"><span class="ni">🌍</span><span class="nl">IGW</span><span class="ns">internet gateway</span></div>
              <div class="dg-arrow good flow"></div>
              <div class="dg-node"><span class="ni">🖥️</span><span class="nl">EC2 web</span><span class="ns">public IP</span></div>
            </div>
          </div>
          <div class="dg-box is-gold" data-hs="privatesubnet"><span class="bx-label">AZ-b · Private subnet</span>
            <div class="dg-flow">
              <div class="dg-node is-muted"><span class="ni">🗄️</span><span class="nl">RDS / EC2</span><span class="ns">no public IP</span></div>
            </div>
          </div>
        </div>
        <div class="dg-flow" style="margin-top:8px">
          <div class="dg-node" data-hs="rt"><span class="ni">🗺️</span><span class="nl">Route Table</span><span class="ns">traffic kahan jaaye</span></div>
        </div>
      </div>
      <div class="dg-cap"><b>VPC</b> = region ka isolated network. <b>Subnet</b> = exactly ek AZ. <b>Public subnet</b> = associated route table ka direct IGW route; auto public IP flag alag hai. EC2 internet reachability ko public IPv4, SG/NACL aur listening service bhi chahiye. Har table ka <b>local route = VPC CIDR 10.0.0.0/16</b>. DB ko local/private route + app-only SG do.</div>`,
  },

  rds: {
    t: 'RDS Multi-AZ DB instance — one synchronous standby',
    html: `
      <div class="dg-flow">
        <div class="dg-col">
          <div class="dg-box is-good"><span class="bx-label">AZ-a (Primary)</span>
            <div class="dg-node is-good pulse" data-hs="primary"><span class="ni">🗄️</span><span class="nl">RDS Primary</span><span class="ns">writes + reads</span></div>
          </div>
        </div>
        <div class="dg-link"><span class="dg-pill good">sync replication</span><div class="dg-arrow good flow two"></div></div>
        <div class="dg-col">
          <div class="dg-box is-gold"><span class="bx-label">AZ-b (Standby)</span>
            <div class="dg-node is-gold" data-hs="standby"><span class="ni">🗄️</span><span class="nl">Standby</span><span class="ns">failover ke liye</span></div>
          </div>
        </div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill good" data-hs="multiaz">Multi-AZ = automatic failover</span>
        <span class="dg-pill acc" data-hs="readreplica">Read Replica = scaling reads (async)</span>
        <span class="dg-pill gold" data-hs="backup">Automated backups + snapshots</span>
      </div>
      <div class="dg-cap"><b>Multi-AZ DB instance</b>: one synchronous standby, automatic AZ failover; standby reporting reads serve nahi karta. <b>Multi-AZ DB cluster</b>: two readable standbys, alag deployment. <b>Read replica</b>: async readable copy, lag possible. Customer schema, queries, access, reconnect aur restore validation sambhalta hai.</div>`,
  },

  elbasg: {
    t: 'ELB + Auto Scaling — traffic handle karo automatically',
    html: `
      <div class="dg-flow">
        <div class="dg-node"><span class="ni">👤</span><span class="nl">Users</span></div>
        <div class="dg-link"><span class="dg-pill acc">DNS</span><div class="dg-arrow flow"></div></div>
        <div class="dg-node is-accent pulse" data-hs="alb"><span class="ni">⚖️</span><span class="nl">ALB</span><span class="ns">Application Load Balancer</span></div>
        <div class="dg-down flow"></div>
        <div class="dg-box is-good"><span class="bx-label" data-hs="asg">Auto Scaling Group</span>
          <div class="dg-flow">
            <div class="dg-node is-good" data-hs="instance"><span class="ni">🖥️</span><span class="nl">EC2</span><span class="ns">healthy</span></div>
            <div class="dg-node is-good" data-hs="instance"><span class="ni">🖥️</span><span class="nl">EC2</span><span class="ns">healthy</span></div>
            <div class="dg-node is-bad" data-hs="instance"><span class="ni">💀</span><span class="nl">EC2</span><span class="ns">health fail</span></div>
            <div class="dg-node is-good pulse"><span class="ni">✨</span><span class="nl">EC2</span><span class="ns">auto-spawn</span></div>
          </div>
        </div>
      </div>
      <div class="dg-cap"><b>ALB</b> HTTP listener/rules se target group choose karta hai; all-registered-targets-unhealthy par fail open kar sakta hai. <b>ASG</b> desired capacity maintain karta hai. Default ASG <b>EC2 health</b> hai; app failure replacement ke liye <b>ELB health opt-in</b> chahiye. App readiness, warmup aur request draining alag controls hain.</div>`,
  },

  boss1: {
    t: 'Boss — 3-tier web architecture (complete)',
    html: `
      <div class="dg-flow">
        <div class="dg-node"><span class="ni">🌐</span><span class="nl">Users</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-box is-accent"><span class="bx-label">🌐 VPC (Multi-AZ)</span>
          <div class="dg-stack" style="margin-top:8px">
            <div class="dg-flow">
              <div class="dg-node is-accent pulse"><span class="ni">⚖️</span><span class="nl">ALB</span><span class="ns">public subnets</span></div>
            </div>
            <div class="dg-flow">
              <div class="dg-node is-good"><span class="ni">🖥️</span><span class="nl">EC2</span><span class="ns">AZ-a · private app</span></div>
              <div class="dg-node is-good"><span class="ni">🖥️</span><span class="nl">EC2</span><span class="ns">AZ-b · private app</span></div>
            </div>
            <div class="dg-flow">
              <div class="dg-arrow good" style="flex-basis:30px"></div>
              <div class="dg-node is-gold"><span class="ni">🗄️</span><span class="nl">RDS Primary</span><span class="ns">AZ-a · private app</span></div>
              <div class="dg-arrow good two" style="flex-basis:30px"></div>
              <div class="dg-node is-gold"><span class="ni">🗄️</span><span class="nl">RDS Standby</span><span class="ns">AZ-b (failover)</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="dg-cap">Boss architecture: <b>Users → ALB (public) → EC2 ASG (Multi-AZ, private) → RDS Multi-AZ</b>. Surviving app capacity, DB DNS/reconnect aur independent egress test karo; Multi-AZ zero downtime guarantee nahi. Zonal NAT per AZ, private S3 + OAC, role/secret aur tested backups supporting dependencies hain.</div>`,
  },

  /* ================= TRACK 2 — INTERMEDIATE ================= */

  vpcdeep: {
    t: 'VPC Deep Dive — destination ke hisaab se path chuno',
    html: `
      <div class="dg-split">
        <div class="dg-box is-good"><span class="bx-label">Zonal egress · each active AZ</span>
          <div class="dg-flow"><div class="dg-node is-good"><span class="ni">🖥️</span><span class="nl">Private app</span><span class="ns">no public IPv4</span></div>
          <div class="dg-arrow good flow"></div><div class="dg-node is-gold"><span class="ni">🔁</span><span class="nl">Own AZ NAT</span><span class="ns">public subnet + EIP</span></div></div>
          <div class="dg-flow"><span class="dg-pill good">NAT subnet route → IGW → internet</span></div>
        </div>
        <div class="dg-box is-accent"><span class="bx-label">Service / network path</span>
          <div class="dg-stack"><span class="dg-pill good">Same-region S3/DynamoDB → gateway endpoint</span>
          <span class="dg-pill acc">Supported service → interface endpoint ENIs</span>
          <span class="dg-pill gold">Analytics VPC ↔ active peer + both routes</span></div>
        </div>
      </div>
      <div class="dg-cap">Destination decide karta hai: <b>internet egress</b>, <b>service endpoint</b> ya <b>private VPC route</b>. Zonal NAT per-AZ dependency hai; <b>Regional NAT</b> current automatic multi-AZ alternative hai. Endpoint/peer state alone IAM, DNS, packet delivery ya app success prove nahi karta.</div>`,
  },

  route53: {
    t: 'Route 53 — DNS + routing policies',
    html: `
      <div class="dg-flow">
        <div class="dg-node"><span class="ni">🌐</span><span class="nl">user types</span><span class="ns">app.com</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-accent pulse" data-hs="r53"><span class="ni">📡</span><span class="nl">Route 53</span><span class="ns">hosted zone</span></div>
        <div class="dg-down flow"></div>
        <div class="dg-split">
          <div class="dg-node is-good" data-hs="simple"><span class="ni">➡️</span><span class="nl">Simple</span><span class="ns">one record</span></div>
          <div class="dg-node is-gold" data-hs="weighted"><span class="ni">⚖️</span><span class="nl">Weighted</span><span class="ns">90/10 DNS weights</span></div>
          <div class="dg-node is-accent" data-hs="latency"><span class="ni">⚡</span><span class="nl">Latency</span><span class="ns">lowest measured latency</span></div>
          <div class="dg-node is-bad" data-hs="failover"><span class="ni">🔄</span><span class="nl">Failover</span><span class="ns">health signal + cache delay</span></div>
        </div>
      </div>
      <div class="dg-cap"><b>Route 53</b> authoritative DNS answers choose karta hai. <b>Alias</b> eligible apex AWS targets ke liye; <b>Weighted</b> DNS-answer proportions, <b>Latency</b> AWS measured regional latency, <b>Failover</b> health + cache/data runbook. Geolocation user location; geoproximity distance+bias; IP-based CIDRs; multivalue up to8 healthy answers. DNS client cache flush ya DB replication nahi karta.</div>`,
  },

  cloudfront: {
    t: 'CloudFront — CDN, content edge par',
    html: `
      <div class="dg-flow">
        <div class="dg-col">
          <div class="dg-node"><span class="ni">👤</span><span class="nl">User (India)</span></div>
          <div class="dg-arrow flow"></div>
          <div class="dg-node is-accent pulse" data-hs="edge"><span class="ni">📍</span><span class="nl">Selected PoP</span><span class="ns">cache hit ⚡</span></div>
        </div>
        <div class="dg-link"><span class="dg-pill acc">cache miss?</span><div class="dg-arrow flow"></div></div>
        <div class="dg-col">
          <div class="dg-node is-gold" data-hs="origin"><span class="ni">🗄️</span><span class="nl">Origin</span><span class="ns">S3 / ALB</span></div>
          <span class="dg-pill gold">Chosen origin region</span>
        </div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill acc" data-hs="distribution">Distribution = CDN config</span>
        <span class="dg-pill good" data-hs="behavior">Cache behavior = rules per path</span>
        <span class="dg-pill gold" data-hs="signedurl">Signed URLs = private content</span>
      </div>
      <div class="dg-cap"><b>CloudFront</b> = 750+ PoPs par eligible HTTP responses cache karta hai. Origin permission: S3 REST + attached OAC + scoped policy. Dynamic API can use no-cache behavior; hit ratio and latency workload par depend karte hain. <b>Signed URLs/cookies</b> = app-authorized viewer access. Invalidation browser cache clear nahi karta.</div>`,
  },

  s3adv: {
    t:'S3 — access class, tiny-object cost and version retention',
    html:`<div class="dg-ladder">
      <div class="dg-rung"><span class="lv">Hot</span><span class="cmd">Standard / Intelligent-Tiering</span><span class="q">Known frequent / changing access; optional archive tiers separate</span></div>
      <div class="dg-rung"><span class="lv">ms</span><span class="cmd">Standard-IA / One Zone-IA</span><span class="q">30day/128KB minimum; one-zone only with accepted recoverability</span></div>
      <div class="dg-rung g"><span class="lv">ms</span><span class="cmd">Glacier Instant Retrieval</span><span class="q">Quarterly online archive;90day/128KB minimum + retrieval fee</span></div>
      <div class="dg-rung g"><span class="lv">h</span><span class="cmd">Flexible / Deep Archive</span><span class="q">Restore first;90/180day minimum +40KB metadata/object</span></div>
      <div class="dg-rung a"><span class="lv">WORM</span><span class="cmd">Object Lock on exact versions</span><span class="q">Class is not retention; default future vs explicit existing protection</span></div>
      </div><div class="dg-cap">Lifecycle default skips tiny transitions&lt;128KB unless overridden. Compare per-object fees, reads and minimum duration. <b>CRR/SRR</b> configuration is not verified copy; restore submission is not readable recovery. Compliance, legal hold, encryption-key access and latest-key visibility are separate boundaries.</div>`,
  },

  efs: {
    t: 'Shared files — protocol, AZ path, identity aur total cost',
    html: `<div class="dg-col">
      <div class="dg-node is-accent"><span class="nl">Block · EBS</span><span class="ns">One AZ · Multi-Attach has coordinated-write constraints</span></div>
      <div class="dg-node is-good"><span class="nl">NFS · Regional EFS</span><span class="ns">Local target per required AZ → attached SG → TCP2049 → IAM/POSIX</span></div>
      <div class="dg-node is-gold"><span class="nl">FSx family</span><span class="ns">Windows SMB/AD · Lustre HPC · ONTAP multiprotocol · OpenZFS NFS</span></div>
      <div class="dg-node"><span class="nl">Object · S3</span><span class="ns">HTTP object contract; review specialized interfaces separately</span></div>
      <div class="dg-node"><span class="nl">Hybrid / transfer</span><span class="ns">Gateway ongoing · DataSync online copy · Transfer Family partner protocol</span></div>
    </div><div class="dg-cap">General Purpose + Elastic is a recommended variable-workload starting point. Storage minimums, activity/throughput and cold access add cost. Local Moto lab proves metadata only; actual NFS bytes/permissions require real clients. Offline transfer: current eligibility/support review; retired Snow offerings are not new-project defaults.</div>`,
  },

  events: {
    t: 'Events — routing, workflow aur business outcome',
    html: `<div class="dg-flow"><div class="dg-node is-accent"><span class="ni">🔔</span><span class="nl">Classic rule</span><span class="ns">typed pattern + target permission</span></div><span class="dg-arrow">→</span><div class="dg-node is-gold"><span class="ni">🪜</span><span class="nl">Workflow</span><span class="ns">Task, Retry, Catch</span></div><span class="dg-arrow">→</span><div class="dg-node is-good"><span class="ni">📊</span><span class="nl">Durable outcome</span><span class="ns">ready / refunded / unresolved</span></div></div><div class="dg-flow"><span class="dg-pill gold">Accepted ≠ completed</span><span class="dg-pill acc">Scheduler: timezone + scoped role</span><span class="dg-pill good">External effects need idempotency</span></div><div class="dg-cap">Conceptual routing can start a workflow with the required role; the mission separately verifies audit/fraud target acceptance and starts the TEST saga explicitly. Classic rules differ from current retained-event subscribers. Stored configuration and synthetic emulator history are not runtime proof.</div>`,
  },

  lambda: {
    t: 'Lambda — invocation contract, bounded capacity aur verified output',
    html: `<div class="dg-col">
      <div class="dg-node is-accent"><span class="nl">Sync / async / poll mapping</span><span class="ns">Caller retry · Lambda event queue · source-specific batch/redrive</span></div>
      <div class="dg-node is-gold"><span class="nl">Standard Event Function</span><span class="ns">Code + execution role + trigger · memory/CPU, deadline, INIT and quotas</span></div>
      <div class="dg-node is-good"><span class="nl">Output evidence</span><span class="ns">Exact source VersionId → stable keys → conditional writes → verified bytes</span></div>
      <div class="dg-node"><span class="nl">HTTP door</span><span class="ns">HTTP / REST / WebSocket / function URL: auth, feature and timeout decision</span></div>
    </div><div class="dg-cap">Reserved concurrency caps/isolates capacity; provisioned concurrency prepares qualified environments with extra costs. HTTP200 can contain FunctionError; inspect body and actual data. In-app SVG runtime and latency are bounded fixtures; local host handler tests actual Moto S3 bytes. Docker invocation remains unverified.</div>`,
  },

  dynamodb: {
    t: 'DynamoDB — access pattern aur actual data proof',
    html: `<div class="dg-flow"><div class="dg-node is-accent" data-hs="table"><span class="ni">📊</span><span class="nl">cartId HASH</span><span class="ns">Separate carts-v2 table</span></div><span class="dg-arrow">→</span><div class="dg-node is-good" data-hs="gsi"><span class="ni">📑</span><span class="nl">bySeller GSI</span><span class="ns">sellerId + updatedAt; eventual</span></div></div><div class="dg-flow"><span class="dg-pill acc" data-hs="item">Item≤400KB incl.names</span><span class="dg-pill gold" data-hs="rcu">Read rounds4KB</span><span class="dg-pill gold" data-hs="wcu">Write rounds1KB</span><span class="dg-pill good" data-hs="sortkey">Full HASH+RANGE unique</span><span class="dg-pill acc" data-hs="dax">DAX: reviewed eventual-read cache</span></div><div class="dg-cap">Primary key immutable. Verify backfill + index ACTIVE + request-level condition + actual query rows. Hot keys, quotas, replica consistency and complete cost still matter.</div>`,
  },

  caching: {
    t: 'Caching — scope, origin aur refill',
    html: `<div class="dg-flow"><div class="dg-node is-accent"><span class="ni">📱</span><span class="nl">Scoped request</span><span class="ns">tenant + product + response variation</span></div><span class="dg-arrow">→</span><div class="dg-node is-good"><span class="ni">⚡</span><span class="nl">Cache</span><span class="ns">TTL, eviction, coalescing</span></div><span class="dg-arrow">→</span><div class="dg-node"><span class="ni">🗄️</span><span class="nl">Origin</span><span class="ns">authoritative transaction path</span></div></div><div class="dg-flow"><span class="dg-pill gold">Hit ≠ fresh/authorized</span><span class="dg-pill acc">DB commit → invalidate; race handling</span><span class="dg-pill good">Actual nodes/AZs, not HA flag alone</span></div><div class="dg-cap">Repeated catalogue reads reuse data; checkout invariants remain authoritative. TTL/replica age, refill failures and durability/eviction contracts need separate proof.</div>`,
  },

  sqssns: {
    t: 'Messaging — acceptance, delivery aur business proof',
    html: `<div class="dg-flow"><div class="dg-node is-accent"><span class="ni">📤</span><span class="nl">Order + outbox</span><span class="ns">stable eventId</span></div><span class="dg-arrow">→</span><div class="dg-node is-gold"><span class="ni">📣</span><span class="nl">SNS</span><span class="ns">filter + delivery policy</span></div><span class="dg-arrow">→</span><div class="dg-node is-good"><span class="ni">📨</span><span class="nl">Per-service SQS</span><span class="ns">receive → durable intent → delete</span></div></div><div class="dg-flow"><span class="dg-pill gold">Publish accepted ≠ queue delivered</span><span class="dg-pill acc">Receipt ≠ business effect</span><span class="dg-pill good">FIFO group order +5min dedup</span></div><div class="dg-cap">Competing workers share one queue; independent services need copies. Visibility expiry permits retry; actual poison goes to processing DLQ. SNS delivery DLQ handles a different failure boundary. Durable intent and provider idempotency/reconciliation protect external effects.</div>`,
  },

  security: {
    t: 'Security — entry path, data authorization and response evidence',
    html: `<div class="dg-flow"><div class="dg-node"><span class="nl">HTTP client</span></div><div class="dg-arrow flow"></div><div class="dg-node is-accent"><span class="nl">WAF on entry resource</span><span class="ns">Count / enforce; actual association</span></div><div class="dg-arrow flow"></div><div class="dg-node is-good"><span class="nl">App role</span><span class="ns">Narrow IAM / network paths</span></div></div><div class="dg-flow" style="margin-top:12px"><span class="dg-pill gold">KMS: usable key + policy/context</span><span class="dg-pill acc">Secrets: versions + backend test</span><span class="dg-pill good">GuardDuty: covered signal + response owner</span></div><div class="dg-cap">Protection configuration, permitted plaintext access and measured runtime outcomes have separate evidence. KMS/Secrets Manager are regional services, not appliances inside the app subnet. Local WAF/rotation/detector metadata does not prove runtime enforcement.</div>`,
  },

  boss2: {
    t: 'Mahasale — requirements, boundaries, evidence',
    html: `<div class="dg-grid">
      <div class="dg-rung a"><span class="lv">1</span><span class="cmd">Offered peak + AZ loss</span><span class="q">fictional course input: 2000 requests/s; 12 workers; 3 AZ</span></div>
      <div class="dg-rung g"><span class="lv">2</span><span class="cmd">Writer / routed reader</span><span class="q">HA, async consistency and connection budgets differ</span></div>
      <div class="dg-rung a"><span class="lv">3</span><span class="cmd">Durable work + bounded consumer</span><span class="q">pending intent is not external email delivery</span></div>
      <div class="dg-rung g"><span class="lv">4</span><span class="cmd">Fresh tail / business evidence</span><span class="q">manual alert-route test is not a customer SLO</span></div>
    </div><div class="dg-cap">One-Region Multi-AZ can fit the requirements. Real launch needs measured gates, preserved work, owners and rollback; a service diagram alone cannot prove readiness.</div>`,
  },

  /* ================= TRACK 3 — ADVANCED ================= */

  wellarch: {
    t: 'Well-Architected Framework — 6 pillars',
    html: `
      <div class="dg-grid">
        <div class="dg-rung g"><span class="lv">1</span><span class="cmd">Operational Excellence</span><span class="q">run & monitor, IaC, small frequent changes</span></div>
        <div class="dg-rung a"><span class="lv">2</span><span class="cmd">Security</span><span class="q">least privilege, all layers, encrypt</span></div>
        <div class="dg-rung g"><span class="lv">3</span><span class="cmd">Reliability</span><span class="q">multi-AZ, auto-recover, test failures</span></div>
        <div class="dg-rung a"><span class="lv">4</span><span class="cmd">Performance</span><span class="q">right resource, scale to demand</span></div>
        <div class="dg-rung g"><span class="lv">5</span><span class="cmd">Cost Optimization</span><span class="q">pay for value, rightsize, reserved</span></div>
        <div class="dg-rung a"><span class="lv">6</span><span class="cmd">Sustainability</span><span class="q">min resources, max benefit</span></div>
      </div>
      <div class="dg-cap"><b>Well-Architected Tool</b> = Workload scope + applicable lens + evidence → prioritized improvement plan and milestones. Constructive review; no automatic runtime test or certification.</div>`,
  },

  orgs: {
    t: 'Organizations — tree, grants and ceilings',
    html: `<div class="dg-grid">
      <div class="dg-rung a"><span class="lv">1</span><span class="cmd">Management account</span><span class="q">privileged org tasks; SCP exemption</span></div>
      <div class="dg-rung g"><span class="lv">2</span><span class="cmd">Root → Workloads</span><span class="q">applicable Allow required at each level</span></div>
      <div class="dg-rung a"><span class="lv">3</span><span class="cmd">Production / Sandbox</span><span class="q">separate accounts, reviewed scoped ceilings</span></div>
      <div class="dg-rung g"><span class="lv">4</span><span class="cmd">Security accounts</span><span class="q">log ownership / service-specific audit delegate</span></div>
      <div class="dg-rung a"><span class="lv">5</span><span class="cmd">Grant + request context</span><span class="q">IAM/resource path, boundary and explicit Deny</span></div>
      <div class="dg-rung g"><span class="lv">6</span><span class="cmd">Canary + exception owner</span><span class="q">verify actual service enforcement and recovery</span></div>
    </div><div class="dg-cap">Strong account isolation still needs narrow cross-account trust. SCPs never grant permission; management identities and service-linked roles have exemptions. Delegation, workforce access, resource sharing and billing have distinct contracts.</div>`,
  },

  dr: {
    t: 'Disaster Recovery — 4 strategies by RTO/RPO',
    html: `
      <div class="dg-ladder">
        <div class="dg-rung g"><span class="lv">1</span><span class="cmd">Backup & Restore</span><span class="q">RPO: hrs · RTO: hrs · cheapest</span></div>
        <div class="dg-rung a"><span class="lv">2</span><span class="cmd">Pilot Light</span><span class="q">RPO: mins · core running, scale on DR</span></div>
        <div class="dg-rung g"><span class="lv">3</span><span class="cmd">Warm Standby</span><span class="q">RPO: secs · scaled-down replica running</span></div>
        <div class="dg-rung a"><span class="lv">4</span><span class="cmd">Multi-Site Active-Active</span><span class="q">RPO: 0 · full dual, instant failover · $$$</span></div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill acc" data-hs="rto">RTO = Recovery Time Objective (kitni der down)</span>
        <span class="dg-pill gold" data-hs="rpo">RPO = Recovery Point Objective (kitna data loss)</span>
      </div>
      <div class="dg-cap"><b>RTO</b> = how fast you recover. <b>RPO</b> = how much data you lose. Backup&Restore cheapest/slowest. Multi-Site priciest/instant. Choice = cost vs downtime tradeoff.</div>`,
  },

  advnet: {
    t: 'Advanced Networking — Direct Connect + PrivateLink',
    html: `
      <div class="dg-split">
        <div class="dg-box is-accent"><span class="bx-label">🏢 On-prem datacenter</span>
          <div class="dg-flow">
            <div class="dg-node is-accent" data-hs="dx"><span class="ni">🔌</span><span class="nl">Direct Connect</span><span class="ns">dedicated line · 1/10 Gbps</span></div>
            <div class="dg-arrow flow"></div>
            <div class="dg-node is-gold" data-hs="tgw"><span class="ni">🌐</span><span class="nl">Transit Gateway</span><span class="ns">hub</span></div>
          </div>
        </div>
        <div class="dg-box is-good"><span class="bx-label">AWS</span>
          <div class="dg-flow">
            <div class="dg-node is-good"><span class="ni">🌐</span><span class="nl">VPC-A</span></div>
            <div class="dg-node is-good"><span class="ni">🌐</span><span class="nl">VPC-B</span></div>
            <div class="dg-node is-good"><span class="ni">🌐</span><span class="nl">VPC-C</span></div>
          </div>
          <div class="dg-flow" style="margin-top:8px">
            <div class="dg-node is-gold" data-hs="privatelink"><span class="ni">🔗</span><span class="nl">PrivateLink</span><span class="ns">private access to service</span></div>
            <div class="dg-node" data-hs="endpoint"><span class="ni">🔌</span><span class="nl">VPC Endpoint</span><span class="ns">no public internet</span></div>
          </div>
        </div>
      </div>
      <div class="dg-cap"><b>Direct Connect</b> = dedicated line on-prem → AWS (consistent, private, no internet). <b>Transit Gateway</b> = hub connecting many VPCs + on-prem. <b>PrivateLink</b> = access AWS services privately (no public IP). <b>VPC Endpoint</b> = gateway to AWS service.</div>`,
  },

  containers: {
    t: 'Containers — ECS / EKS / ECR',
    html: `
      <div class="dg-flow">
        <div class="dg-node is-accent" data-hs="ecr"><span class="ni">📦</span><span class="nl">ECR</span><span class="ns">image registry</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-split">
          <div class="dg-box is-good"><span class="bx-label">ECS (AWS native)</span>
            <div class="dg-flow">
              <div class="dg-node is-good" data-hs="fargate"><span class="ni">🚀</span><span class="nl">Fargate</span><span class="ns">serverless</span></div>
              <div class="dg-node is-good"><span class="ni">🖥️</span><span class="nl">EC2</span><span class="ns">you manage</span></div>
            </div>
          </div>
          <div class="dg-box is-gold"><span class="bx-label">EKS (Kubernetes)</span>
            <div class="dg-node is-gold" data-hs="eks"><span class="ni">☸️</span><span class="nl">EKS</span><span class="ns">managed K8s</span></div>
          </div>
        </div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill good" data-hs="fargate">Fargate = no EC2 to manage (serverless containers)</span>
        <span class="dg-pill gold" data-hs="eks">EKS = portability, multi-cloud K8s</span>
        <span class="dg-pill acc">Lambda vs containers = long-running/stateful → containers</span>
      </div>
      <div class="dg-cap"><b>ECR</b> = store container images. <b>ECS</b> = AWS's container orchestrator (Fargate = serverless, EC2 = you manage). <b>EKS</b> = managed Kubernetes. Use containers for long-running/stateful/multi-cloud. Lambda for short/event-driven.</div>`,
  },

  iac: {
    t: 'Infrastructure as Code — CloudFormation vs Terraform',
    html: `
      <div class="dg-split">
        <div class="dg-box is-accent"><span class="bx-label">CloudFormation (AWS)</span>
          <div class="dg-col">
            <div class="dg-node is-accent" data-hs="template"><span class="ni">📄</span><span class="nl">Template (YAML/JSON)</span></div>
            <div class="dg-arrow flow"></div>
            <div class="dg-node is-gold" data-hs="stack"><span class="ni">📚</span><span class="nl">Stack</span><span class="ns">resources group</span></div>
            <div class="dg-arrow flow"></div>
            <div class="dg-node is-good"><span class="ni">✨</span><span class="nl">Resources created</span></div>
          </div>
        </div>
        <div class="dg-box is-good"><span class="bx-label">Terraform (HashiCorp)</span>
          <div class="dg-col">
            <div class="dg-node is-good" data-hs="tfconfig"><span class="ni">📄</span><span class="nl">.tf (HCL)</span></div>
            <div class="dg-arrow good flow"></div>
            <div class="dg-node is-gold"><span class="ni">🗺️</span><span class="nl">State file</span><span class="ns">tfstate</span></div>
            <div class="dg-arrow good flow"></div>
            <div class="dg-node is-good"><span class="ni">✨</span><span class="nl">Multi-cloud</span></div>
          </div>
        </div>
      </div>
      <div class="dg-cap"><b>IaC</b> = infrastructure code mein (Git-tracked, repeatable). <b>CloudFormation</b> = AWS-only, free, stacks. <b>Terraform</b> = multi-cloud, state file, HCL. <b>Drift detection</b> = console vs code difference. No more manual clicks!</div>`,
  },

  cost: {
    t: 'Cost Optimization — pay less, same value',
    html: `
      <div class="dg-ladder">
        <div class="dg-rung g"><span class="lv">1</span><span class="cmd">Right-size</span><span class="q">CPU/RAM monitor, big instance → small</span></div>
        <div class="dg-rung a"><span class="lv">2</span><span class="cmd">Reserved / Savings Plans</span><span class="q">1-3 yr commit, up to 72% off</span></div>
        <div class="dg-rung g"><span class="lv">3</span><span class="cmd">Spot Instances</span><span class="q">90% off · interruptible workloads (batch)</span></div>
        <div class="dg-rung a"><span class="lv">4</span><span class="cmd">Cost Allocation Tags</span><span class="q">team/project cost breakdown</span></div>
        <div class="dg-rung g"><span class="lv">5</span><span class="cmd">Lifecycle + S3 classes</span><span class="q">old data → Glacier (auto)</span></div>
        <div class="dg-rung a"><span class="lv">6</span><span class="cmd">Auto Scaling</span><span class="q">scale down at night = $ saved</span></div>
      </div>
      <div class="dg-cap"><b>On-demand</b> = expensive (default). <b>Reserved/Savings</b> = commit for discount. <b>Spot</b> = spare capacity, can be killed (batch jobs). <b>Cost Explorer</b> + <b>Budgets</b> = track & alert. Well-Architected Cost pillar.</div>`,
  },

  observability: {
    t: 'Observability — metrics, logs, traces, audit',
    html: `
      <div class="dg-flow">
        <div class="dg-col">
          <div class="dg-node is-accent" data-hs="cwmetrics"><span class="ni">📊</span><span class="nl">CloudWatch Metrics</span><span class="ns">numbers over time</span></div>
          <div class="dg-node is-gold" data-hs="cwlogs"><span class="ni">📜</span><span class="nl">CloudWatch Logs</span><span class="ns">app output</span></div>
          <div class="dg-node is-bad" data-hs="alarm"><span class="ni">🚨</span><span class="nl">Alarms</span><span class="ns">threshold → SNS</span></div>
        </div>
        <div class="dg-link"><span class="dg-pill acc">debug</span><div class="dg-arrow flow"></div></div>
        <div class="dg-col">
          <div class="dg-node is-good" data-hs="xray"><span class="ni">🔍</span><span class="nl">X-Ray</span><span class="ns">distributed tracing</span></div>
          <div class="dg-node" data-hs="cloudtrail"><span class="ni">👁️</span><span class="nl">CloudTrail</span><span class="ns">API audit</span></div>
          <div class="dg-node is-gold" data-hs="flowlogs"><span class="ni">🌐</span><span class="nl">VPC Flow Logs</span><span class="ns">network traffic</span></div>
        </div>
      </div>
      <div class="dg-cap"><b>Metrics</b> = numbers (CPU, latency). <b>Logs</b> = text. <b>Traces (X-Ray)</b> = request ka poora safar across services. <b>CloudTrail</b> = kaunne API call kiye (security). <b>Flow Logs</b> = network. Observability = debugging superpower.</div>`,
  },

  migration: {
    t: 'Migration — 7Rs strategy',
    html: `
      <div class="dg-grid">
        <div class="dg-rung g"><span class="lv">1</span><span class="cmd">Rehost ("lift & shift")</span><span class="q">as-is move · fastest · least refactor</span></div>
        <div class="dg-rung a"><span class="lv">2</span><span class="cmd">Replatform ("lift & reshape")</span><span class="q">minor tweaks (e.g. RDS vs self-managed)</span></div>
        <div class="dg-rung g"><span class="lv">3</span><span class="cmd">Refactor / Re-architect</span><span class="q">reimagine (monolith → microservices)</span></div>
        <div class="dg-rung a"><span class="lv">4</span><span class="cmd">Repurchase</span><span class="q">move to SaaS (e.g. CRM → Salesforce)</span></div>
        <div class="dg-rung g"><span class="lv">5</span><span class="cmd">Retain</span><span class="q">keep on-prem (compliance, not worth)</span></div>
        <div class="dg-rung a"><span class="lv">6</span><span class="cmd">Retire</span><span class="q">app no longer needed — turn off</span></div>
        <div class="dg-rung g"><span class="lv">7</span><span class="cmd">Relocate</span><span class="q">move within AWS (e.g. VMware to EC2)</span></div>
      </div>
      <div class="dg-flow" style="margin-top:10px">
        <span class="dg-pill acc" data-hs="dms">DMS = Database Migration Service</span>
        <span class="dg-pill gold" data-hs="mgh">Migration Hub = track all migrations</span>
      </div>
      <div class="dg-cap"><b>7Rs</b> = strategy per app. <b>Rehost</b> = quick win. <b>Refactor</b> = long-term best. <b>DMS</b> = DB migration (homogeneous/heterogeneous). <b>Migration Hub</b> = central tracking.</div>`,
  },

  finalboss: {
    t: 'Final Boss — Senior Solutions Architect Gauntlet',
    html: `
      <div class="dg-ladder">
        <div class="dg-rung"><span class="lv">1</span><span class="cmd">Design: scalable web app</span><span class="q">multi-AZ, ALB, ASG, cache, RDS</span></div>
        <div class="dg-rung"><span class="lv">2</span><span class="cmd">Harden: security</span><span class="q">least privilege, KMS, WAF, GuardDuty</span></div>
        <div class="dg-rung g"><span class="lv">3</span><span class="cmd">Optimize: cost</span><span class="q">reserved, spot, rightsize, lifecycle</span></div>
        <div class="dg-rung a"><span class="lv">4</span><span class="cmd">Recover: DR plan</span><span class="q">RTO/RPO, Multi-Site, backups</span></div>
        <div class="dg-rung g"><span class="lv">5</span><span class="cmd">Observe: monitoring</span><span class="q">CloudWatch + X-Ray + CloudTrail</span></div>
        <div class="dg-rung a"><span class="lv">6</span><span class="cmd">Migrate: 7Rs decision</span><span class="q">per-app strategy, DMS</span></div>
        <div class="dg-rung"><span class="lv">🎤</span><span class="cmd">Interview Marathon</span><span class="q">architecture + incident + hands-on</span></div>
        <div class="dg-rung a"><span class="lv">👑</span><span class="cmd">Mahaguru Certificate</span><span class="q">SAA ready!</span></div>
      </div>
      <div class="dg-cap">Yehi hai senior architect ka din: design → secure → optimize → recover → observe → migrate. Har pillar ek challenge. Pass = tum SAA exam ready ho!</div>`,
  },

  /* ================= TRACK 4 — ARCHITECT (Nirnay Path) ================= */

  compute: {
    t: 'Compute chuno — Lambda vs Fargate vs ECS/EC2 vs Batch',
    html: `
      <div class="dg-flow">
        <div class="dg-node is-good" data-hs="lambda"><span class="ni">⚡</span><span class="nl">Lambda</span><span class="ns">event/spiky · &lt;15 min · idle=$0</span></div>
        <div class="dg-node is-accent" data-hs="fargate"><span class="ni">📦</span><span class="nl">Fargate</span><span class="ns">container, no server mgmt · steady</span></div>
        <div class="dg-node is-gold" data-hs="ec2"><span class="ni">🖥️</span><span class="nl">EC2 / ASG</span><span class="ns">full control · GPU · always-on heavy</span></div>
        <div class="dg-node" data-hs="batch"><span class="ni">🧮</span><span class="nl">Batch / Spot</span><span class="ns">bulk offline jobs · sasta</span></div>
      </div>
      <div class="dg-split" style="margin-top:14px">
        <div class="dg-box is-good"><span class="bx-label">✅ Lambda kab</span>
          <div class="dg-col">
            <span class="dg-pill good">spiky/event-driven traffic (S3 upload, API burst)</span>
            <span class="dg-pill good">idle time zyada — pay-per-invoke</span>
            <span class="dg-pill bad" data-hs="lambdano">❌ &gt;15 min job, heavy steady load (mehnga), &lt;10ms latency chahiye</span>
          </div>
        </div>
        <div class="dg-box is-accent"><span class="bx-label">✅ Fargate/ECS kab</span>
          <div class="dg-col">
            <span class="dg-pill acc">long-running service, steady traffic</span>
            <span class="dg-pill acc">container hai, par node manage nahi karna</span>
            <span class="dg-pill bad" data-hs="ec2yes">❌ GPU/very-high-throughput/licensing → EC2</span>
          </div>
        </div>
      </div>
      <div class="dg-cap"><b>Sawal poocho:</b> traffic spiky hai ya steady? Job kitni lambi? Server manage karne ki fursat hai? <b>Default: Lambda (spiky) → Fargate (steady service) → EC2 (control/GPU) → Batch+Spot (bulk).</b> Har jagah <b>Graviton</b> = ~20% sasta, <b>Spot</b> = ~70% sasta fault-tolerant loads par.</div>`,
  },

  datastore: {
    t: 'Data store chuno — right tool for the shape',
    html: `
      <div class="dg-grid" style="grid-template-columns:1fr 1fr">
        <div class="dg-box is-accent"><span class="bx-label">🗄️ Relational</span>
          <div class="dg-col">
            <span class="dg-pill acc" data-hs="rds">RDS / Aurora — joins, transactions, complex queries</span>
            <span class="dg-pill">Aurora = MySQL/PG compat, auto-scale storage, 15 replicas</span>
          </div>
        </div>
        <div class="dg-box is-good"><span class="bx-label">🔑 Key-value / NoSQL</span>
          <div class="dg-col">
            <span class="dg-pill good" data-hs="dynamo">DynamoDB — single-digit ms, infinite scale, known access pattern</span>
            <span class="dg-pill bad" data-hs="dynamono">❌ ad-hoc analytical queries, joins</span>
          </div>
        </div>
        <div class="dg-box is-gold"><span class="bx-label">⚡ Cache</span>
          <div class="dg-col">
            <span class="dg-pill gold" data-hs="cache">ElastiCache (Redis) / DAX — sub-ms, hot reads</span>
            <span class="dg-pill">read-heavy, DB ko relief</span>
          </div>
        </div>
        <div class="dg-box is-muted"><span class="bx-label">📊 Analytics</span>
          <div class="dg-col">
            <span class="dg-pill" data-hs="warehouse">Redshift — big scans/BI · Athena — S3 par SQL, serverless</span>
            <span class="dg-pill">OLAP, columnar, reporting</span>
          </div>
        </div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill acc" data-hs="s3">S3 — objects/media/data-lake (DB nahi!)</span>
        <span class="dg-pill">OLTP (transactions) ≠ OLAP (analytics) — alag tools</span>
      </div>
      <div class="dg-cap"><b>Data ka shape decide karta hai, popularity nahi.</b> Rishtey+transactions = RDS/Aurora. Known key-based access at scale = DynamoDB. Hot reads = cache. Bade scans/BI = Redshift/Athena. <b>Ek app aksar 3-4 stores use karti hai</b> — "sab DynamoDB" ya "sab RDS" dono galat hain.</div>`,
  },

  messaging: {
    t: 'Decouple kaise — SQS vs SNS vs Kinesis vs Step Functions',
    html: `
      <div class="dg-flow">
        <div class="dg-node is-accent" data-hs="sqs"><span class="ni">📨</span><span class="nl">SQS</span><span class="ns">queue · 1 consumer group · buffer+retry</span></div>
        <div class="dg-node is-good" data-hs="sns"><span class="ni">📢</span><span class="nl">SNS</span><span class="ns">pub/sub fan-out · push · N subscribers</span></div>
        <div class="dg-node is-gold" data-hs="kinesis"><span class="ni">🌊</span><span class="nl">Kinesis</span><span class="ns">ordered stream · replay · many readers</span></div>
        <div class="dg-node" data-hs="sfn"><span class="ni">🪜</span><span class="nl">Step Functions</span><span class="ns">workflow · retry/catch · saga</span></div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <div class="dg-box is-gold"><span class="bx-label">🍟 Classic combo: SNS + SQS fan-out</span>
          <div class="dg-flow">
            <div class="dg-node"><span class="ni">🛒</span><span class="nl">Order</span></div>
            <div class="dg-arrow flow"></div>
            <div class="dg-node is-good" data-hs="fanout"><span class="ni">📢</span><span class="nl">SNS topic</span></div>
            <div class="dg-arrow flow"></div>
            <div class="dg-col">
              <div class="dg-node is-accent"><span class="ni">📨</span><span class="nl">email-queue</span></div>
              <div class="dg-node is-accent"><span class="ni">📨</span><span class="nl">analytics-queue</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="dg-cap"><b>SQS</b> = kaam ek baar ho (buffer/retry). <b>SNS</b> = ek event, kai subscribers (fan-out). <b>Kinesis</b> = ordered + replayable stream (clickstream/IoT, kai consumers same data). <b>Step Functions</b> = multi-step workflow with rollback. <b>Sync call ko async bana do</b> — checkout tez + resilient.</div>`,
  },

  eventbridge: {
    t: 'EventBridge & Pipes — event backbone',
    html: `
      <div class="dg-flow">
        <div class="dg-node"><span class="ni">🛠️</span><span class="nl">Producers</span><span class="ns">apps · AWS services · SaaS</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-box is-accent"><span class="bx-label">🔔 EventBridge Bus</span>
          <div class="dg-col">
            <div class="dg-node is-accent pulse" data-hs="bus"><span class="ni">🚌</span><span class="nl">Event bus</span><span class="ns">default / custom / partner</span></div>
            <div class="dg-flow">
              <div class="dg-node is-good" data-hs="rule"><span class="ni">🧭</span><span class="nl">Rule</span><span class="ns">content pattern match</span></div>
              <div class="dg-node is-gold" data-hs="schedule"><span class="ni">⏰</span><span class="nl">Scheduler</span><span class="ns">cron/rate</span></div>
            </div>
          </div>
        </div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-good" data-hs="target"><span class="ni">🎯</span><span class="nl">Targets</span><span class="ns">Lambda · SQS · SFN · 20+</span></div>
      </div>
      <div class="dg-box is-gold" style="margin-top:14px"><span class="bx-label">🔧 EventBridge Pipes — point-to-point ETL glue</span>
        <div class="dg-flow">
          <div class="dg-node" data-hs="psource"><span class="ni">📥</span><span class="nl">Source</span><span class="ns">SQS/Kinesis/DDB stream</span></div>
          <div class="dg-arrow flow"></div>
          <div class="dg-node is-bad" data-hs="pfilter"><span class="ni">🧹</span><span class="nl">Filter</span><span class="ns">chhaan lo</span></div>
          <div class="dg-arrow flow"></div>
          <div class="dg-node is-gold" data-hs="penrich"><span class="ni">✨</span><span class="nl">Enrich</span><span class="ns">Lambda/API se data jodo</span></div>
          <div class="dg-arrow flow"></div>
          <div class="dg-node is-good" data-hs="ptarget"><span class="ni">🎯</span><span class="nl">Target</span></div>
        </div>
      </div>
      <div class="dg-cap"><b>EventBridge Bus</b> = many-to-many router (content-based rules, SaaS/AWS events, schema registry). <b>Pipes</b> = ek source→ek target ka managed glue with filter+enrich — woh "SQS se padho, transform karo, bhejo" wala Lambda <b>khatam</b> kar deta hai. <b>SNS</b> se farak: EventBridge content par filter karta hai + schema/replay deta hai.</div>`,
  },

  logsetl: {
    t: 'Log analytics ETL — CloudWatch → Firehose → OpenSearch',
    html: `
      <div class="dg-flow">
        <div class="dg-node is-muted" data-hs="cwlogs"><span class="ni">📜</span><span class="nl">CloudWatch Logs</span><span class="ns">Lambda/ECS/app logs yahan</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-accent" data-hs="subfilter"><span class="ni">🔎</span><span class="nl">Subscription Filter</span><span class="ns">pattern → real-time stream</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-gold" data-hs="firehose"><span class="ni">🚿</span><span class="nl">Kinesis Firehose</span><span class="ns">buffer + transform, no code</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-good" data-hs="opensearch"><span class="ni">🔍</span><span class="nl">OpenSearch</span><span class="ns">index + Dashboards</span></div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <div class="dg-down flow"></div>
        <div class="dg-node" data-hs="s3backup"><span class="ni">🪣</span><span class="nl">S3 (raw backup)</span><span class="ns">Firehose ka doosra haath — Athena se query, cheap archive</span></div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill acc" data-hs="metricfilter">Metric Filter — log se metric+alarm (count of ERROR)</span>
        <span class="dg-pill gold">Firehose = fully managed (no shards to manage) · near-real-time (buffer)</span>
        <span class="dg-pill bad">❌ CloudWatch Logs Insights theek hai chhote ke liye — bade/cross-service search par OpenSearch</span>
      </div>
      <div class="dg-cap"><b>Pipeline:</b> Logs → <b>Subscription Filter</b> (real-time tap) → <b>Firehose</b> (managed buffer+transform) → <b>OpenSearch</b> (search/dashboards) + <b>S3</b> (sasta raw backup, Athena se query). <b>Firehose kyun, Kinesis Streams nahi?</b> — Firehose fully managed, shards nahi sambhalne, seedha delivery. Sirf custom real-time processing chahiye toh Kinesis Streams.</div>`,
  },

  edge: {
    t: 'Edge & Network — ALB vs NLB vs API GW, CloudFront vs GA',
    html: `
      <div class="dg-split">
        <div class="dg-box is-accent"><span class="bx-label">🚦 Load balancer / entry</span>
          <div class="dg-col">
            <span class="dg-pill acc" data-hs="alb">ALB — L7 (HTTP), path/host routing, WAF</span>
            <span class="dg-pill gold" data-hs="nlb">NLB — L4 (TCP/UDP), ultra-low latency, static IP, millions rps</span>
            <span class="dg-pill good" data-hs="apigw">API Gateway — REST/HTTP APIs, auth/throttle/keys, serverless</span>
          </div>
        </div>
        <div class="dg-box is-good"><span class="bx-label">🌍 Global reach</span>
          <div class="dg-col">
            <span class="dg-pill good" data-hs="cloudfront">CloudFront — CDN, cache static+dynamic, edge</span>
            <span class="dg-pill" data-hs="ga">Global Accelerator — anycast IP, non-HTTP/TCP, fast failover</span>
          </div>
        </div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill bad" data-hs="nlbno">❌ L7 path routing chahiye? NLB nahi, ALB</span>
        <span class="dg-pill bad" data-hs="cfno">❌ cacheable content? CloudFront; ❌ raw TCP game server? Global Accelerator</span>
      </div>
      <div class="dg-cap"><b>ALB</b> = HTTP smart routing (microservices, path-based). <b>NLB</b> = raw speed/TCP/static-IP. <b>API Gateway</b> = managed API front (auth, throttle, Lambda). <b>CloudFront</b> = cache + HTTPS edge (websites, media). <b>Global Accelerator</b> = non-cacheable global TCP/UDP with instant failover. Wrong pick = latency, cost, ya missing features.</div>`,
  },

  costdec: {
    t: 'Cost traps — sasta lagta, mehnga nikla',
    html: `
      <div class="dg-grid" style="grid-template-columns:1fr 1fr">
        <div class="dg-box is-bad"><span class="bx-label">💸 Chhupe kharche</span>
          <div class="dg-col">
            <span class="dg-pill bad" data-hs="nat">NAT Gateway — per-GB + hourly; S3/DDB ke liye VPC endpoint use karo</span>
            <span class="dg-pill bad" data-hs="egress">Data egress — internet + cross-AZ transfer</span>
            <span class="dg-pill bad" data-hs="idle">Idle resources — un-attached EBS, old snapshots, idle RDS</span>
          </div>
        </div>
        <div class="dg-box is-good"><span class="bx-label">💰 Lever</span>
          <div class="dg-col">
            <span class="dg-pill good" data-hs="commit">Savings Plans / RI — steady load −40-70%</span>
            <span class="dg-pill good" data-hs="spot">Spot — fault-tolerant/batch −70-90%</span>
            <span class="dg-pill good" data-hs="lifecycle">S3 lifecycle + Graviton + right-size</span>
          </div>
        </div>
      </div>
      <div class="dg-flow" style="margin-top:12px">
        <span class="dg-pill acc" data-hs="breakeven">Lambda sasta jab spiky/idle; steady 24×7 par Fargate/EC2 sasta (break-even socho)</span>
      </div>
      <div class="dg-cap"><b>"Serverless hamesha sasta" — myth.</b> Lambda spiky par sasta, steady heavy par mehnga. Sabse bade chhupe bill: <b>NAT Gateway</b>, <b>cross-AZ/egress transfer</b>, <b>idle/orphaned</b> resources. Levers: <b>commit</b> (SP/RI) steady par, <b>Spot</b> fault-tolerant par, <b>lifecycle+right-size</b> hamesha. Cost = architecture decision, baad ki safai nahi.</div>`,
  },

  resilience: {
    t: 'Resilience — fault tolerance & blast radius',
    html: `
      <div class="dg-ladder">
        <div class="dg-rung g" data-hs="multiaz"><span class="lv">1</span><span class="cmd">Multi-AZ</span><span class="q">AZ fail survive — baseline for prod (RDS Multi-AZ, ASG across AZs)</span></div>
        <div class="dg-rung a" data-hs="decouple"><span class="lv">2</span><span class="cmd">Decouple + queue</span><span class="q">consumer gira → messages SQS mein safe, retry</span></div>
        <div class="dg-rung g" data-hs="idempotent"><span class="lv">3</span><span class="cmd">Retry + backoff + idempotency</span><span class="q">at-least-once = duplicate; idempotent bnao</span></div>
        <div class="dg-rung a" data-hs="degrade"><span class="lv">4</span><span class="cmd">Graceful degradation</span><span class="q">recommendations down → default feed dikhao, error nahi</span></div>
        <div class="dg-rung g" data-hs="multiregion"><span class="lv">5</span><span class="cmd">Multi-region (DR)</span><span class="q">RTO/RPO ke hisaab se: backup→pilot light→warm→active-active</span></div>
      </div>
      <div class="dg-flow" style="margin-top:10px">
        <span class="dg-pill bad" data-hs="singlepoint">❌ Single-AZ prod DB, ek Lambda sab kuch, sync chain — ek fail = sab fail</span>
        <span class="dg-pill acc" data-hs="blast">Blast radius chhota rakho — alag accounts/AZ/cell</span>
      </div>
      <div class="dg-cap"><b>Fault tolerance = maan lo cheezein tootengi.</b> Multi-AZ baseline, decouple taaki ek component gire toh baaki chale, retry+idempotency (at-least-once duplicates deta hai), graceful degradation (feature gaya ≠ app gaya), aur cost ke hisaab se DR strategy. <b>Blast radius</b> = ek galti kitna tod sakti hai — use chhota rakho.</div>`,
  },

  archboss: {
    t: 'Final Boss — PixShare global architecture',
    html: `
      <div class="dg-flow">
        <div class="dg-node" data-hs="user"><span class="ni">📱</span><span class="nl">Users (global)</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-good"><span class="ni">🌍</span><span class="nl">CloudFront + S3</span><span class="ns">media/static</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-accent"><span class="ni">🚪</span><span class="nl">API GW / ALB</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-gold"><span class="ni">⚡</span><span class="nl">Lambda / Fargate</span></div>
      </div>
      <div class="dg-flow" style="margin-top:10px">
        <div class="dg-node"><span class="ni">🖼️</span><span class="nl">S3 upload</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-good"><span class="ni">📢</span><span class="nl">SNS/EventBridge</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-accent"><span class="ni">📨</span><span class="nl">SQS → thumbnails</span></div>
        <div class="dg-arrow flow"></div>
        <div class="dg-node is-gold"><span class="ni">🗄️</span><span class="nl">DynamoDB + Aurora + ElastiCache</span></div>
      </div>
      <div class="dg-flow" style="margin-top:10px">
        <span class="dg-pill acc">Logs → Firehose → OpenSearch + S3</span>
        <span class="dg-pill good">Multi-AZ · Savings Plans + Spot · Well-Architected</span>
      </div>
      <div class="dg-cap">Sab kuch ek saath: <b>compute + storage/DB + messaging + events + observability + edge + cost + resilience</b>. Har layer ka service <b>requirement, cost aur blast-radius</b> ke hisaab se chuna gaya. Yehi Decision Architect ka kaam hai.</div>`,
  },
};
