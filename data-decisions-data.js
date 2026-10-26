/* =====================================================================
   AWS Gurukul — 🧭 Decision Dojo trees: STORAGE + DATA
   storage (file kahan rakhun?) · s3class (kaunsi S3 class?) ·
   database (kaunsa database?) · caching (cache kahan lagaun?)
   Prices: us-east-1 list price (2025–26), approx.
   ✍️ Niyam: "yeh / woh / isse / uska" ki jagah naam dobara likho.
   ===================================================================== */
AG.registerDecisions([

  /* ------------------------------------------------------------------ */
  {
    id: 'storage',
    icon: '💾',
    title: 'Data kahan rakhun? — S3, EBS, EFS, FSx, Instance Store',
    short: 'Storage type',
    tldr: 'Teen sawal: kitne servers ek saath padhenge? OS storage ko disk ki tarah dekhega ya app HTTP se object maangegi? Server band hone par data bachna chahiye?',
    levels: ['s3', 's3adv', 'ec2', 'efs'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'App data ko kaise access karti hai?',
        why: 'General-purpose S3 object API uses whole-object replacement and range reads; disk/POSIX mutation semantics assume mat karo. Specialized directory-bucket append/file interfaces separate designs hain. Block storage (EBS) OS ko ek hard disk dikhta hai. File storage (EFS/FSx) ek shared folder hai jise kai servers mount karte hain.',
        options: [
          { t: 'HTTP API se poori files (images, backups, logs, static website)', next: 's3' },
          { t: 'Ek server ki hard disk ki tarah (OS, database files)', next: 'q2' },
          { t: 'Kai servers ek hi folder share karein (mount)', next: 'q3' },
        ],
      },
      q2: {
        q: 'Server band/replace hone par disk ka data bachna chahiye?',
        why: 'Instance store server ke andar laga physical NVMe hai — sabse tez, par instance stop/terminate hote hi data gayab. EBS network disk hai — instance se alag zinda rehti hai.',
        options: [
          { t: 'Haan — database, OS, kuch bhi jo khona nahi', next: 'ebs' },
          { t: 'Nahi — sirf temp cache/scratch, sabse tez IOPS chahiye', next: 'istore' },
        ],
      },
      q3: {
        q: 'Servers kaunse OS / workload ke hain?',
        options: [
          { t: 'Linux (NFS) — web servers, CMS uploads, containers', next: 'efs' },
          { t: 'Windows (SMB) + Active Directory', next: 'fsxw' },
          { t: 'HPC / ML training — hazaaron cores, GB/s throughput, S3 data par', next: 'fsxl' },
          { t: 'NetApp ONTAP features / NFS + SMB dono / on-prem NetApp se migrate', next: 'fsxn' },
          { t: 'NFS workflow specifically requiring OpenZFS snapshots/clones', next: 'fsxz' },
        ],
      },
      s3: {
        leaf: true, icon: '🪣', pick: 'Amazon S3',
        one: 'Scalable total object storage; individual objects documented up to50TB; durability/class and access semantics choose karo.',
        why: 'Poori files store/serve karni hain. S3 Standard designed across at least3AZs; one-zone classes have different failure scope. Region/class/pricing and retrieval behavior verify karo.',
        when: ['User uploads, images, videos, backups, logs, data lake', 'Static website + CloudFront', 'Bahut zyada data jo dheere-dheere thanda ho jaata hai (lifecycle → Glacier)'],
        avoid: ['Database ki data files ya OS disk (block access chahiye)', 'File ke beech mein baar-baar chhote edits (S3 poora object replace karta hai)'],
        gotchas: ['Bucket naming namespace, Region and ownership verify karo', 'Block Public Access ON rakho — public data CloudFront + OAC se do', 'At least3,500 writes/s and5,500 reads/s per partitioned prefix guidance; gradual scaling/retries and parallelism review karo'],
        cost: 'Standard ~$0.023/GB-mahina. 1 TB ≈ $23/mahina. Requests aur data-transfer-out alag.',
        exam: '"durable", "unlimited", "static content", "data lake" → S3.',
        level: 's3',
      },
      ebs: {
        leaf: true, icon: '💽', pick: 'Amazon EBS (gp3)',
        one: 'Network block disk — ek EC2 se attach, ek AZ ke andar.',
        when: ['EC2 ka root/OS volume', 'Self-managed database (MySQL/Postgres EC2 par)', 'Low-latency block storage jo instance se alag zinda rahe'],
        avoid: ['Kai servers ek saath read/write (EBS ek AZ, ek instance — Multi-Attach sirf io1/io2 aur cluster-aware software ke saath)', 'Doosre AZ mein seedha attach — pehle snapshot, phir naye AZ mein volume'],
        gotchas: ['EBS ek AZ mein rehta hai — AZ failure se bachne ke liye snapshots (S3 mein, regional)', 'gp3: 3,000 IOPS + 125 MB/s baseline free, alag se badha sakte ho — gp2 se sasta'],
        cost: 'gp3 ~$0.08/GB-mahina. 100 GB ≈ $8/mahina. io2 mehenga par 64,000+ IOPS.',
        exam: '"block storage for EC2", "database on EC2" → EBS. "highest IOPS" → io2 Block Express. "lowest cost, infrequent" → sc1/st1.',
        level: 'ec2',
      },
      istore: {
        leaf: true, icon: '⚡', pick: 'Instance Store (local NVMe)',
        one: 'Server ke andar ki disk — sabse tez, par instance band = data gayab.',
        when: ['Cache, buffer, scratch space', 'Data jo kahin aur replicate hai (Cassandra/Kafka nodes jo khud replicate karte hain)'],
        avoid: ['Koi bhi data jo khona nahi — stop/terminate/host failure par chala jaata hai'],
        gotchas: ['Sirf kuch instance types (i4i, d3, m7gd...) mein hota hai', 'Reboot par data bachta hai, stop/terminate par nahi'],
        cost: 'Instance price mein shamil.',
        exam: '"temporary", "highest I/O", "data loss acceptable / replicated" → instance store.',
        level: 'ec2',
      },
      efs: {
        leaf: true, icon: '📁', pick: 'Amazon EFS',
        one: 'Managed NFS; choose Regional for the required multi-AZ shared-file design, or review One Zone failure scope.',
        when: ['WordPress/CMS uploads jo ASG ke saare servers ko dikhne chahiye', 'ECS/EKS/Lambda containers ka shared storage', 'Home directories'],
        avoid: ['Windows servers (SMB) — FSx for Windows', 'Single-server database — EBS sasta aur tez', 'Archive data — S3 bahut sasta'],
        gotchas: ['One target per required AZ, not per same-AZ subnet. Deliberate cross-AZ access can work with added cost/dependency; normal DNS expects local target', 'Attach intended target SG and allow inbound TCP2049 from app SG; verify client outbound, TLS/IAM/POSIX separately', 'General Purpose + Elastic for variable activity; IA/Archive minimums and access/throughput costs can erase storage-only savings'],
        cost: 'Approx US East Standard $0.30/GB-month; IA $0.016 with Elastic or $0.025 legacy; Archive $0.008 with supported Elastic config. Actual I/O, minimums, backup/transfer add cost.',
        exam: '"shared file system for Linux", "multiple EC2 across AZs", "POSIX" → EFS.',
        level: 'efs',
      },
      fsxw: { leaf: true, icon: '🪟', pick: 'FSx for Windows File Server', one: 'Managed Windows file share (SMB) — Active Directory ke saath.', when: ['Windows apps, home folders, SharePoint, .NET apps jo SMB maangte hain'], avoid: ['Linux-only NFS — EFS'], gotchas: ['Multi-AZ deployment option chuno production ke liye'], cost: 'Per GB + throughput capacity.', exam: '"SMB", "Windows", "Active Directory", "DFS" → FSx for Windows.', level: 'efs' },
      fsxl: { leaf: true, icon: '🏎️', pick: 'FSx for Lustre', one: 'HPC file system — sub-ms latency, sau GB/s throughput, S3 se link.', when: ['ML training, genomics, rendering, financial simulation'], avoid: ['General-purpose shared folder — EFS simple'], gotchas: ['Scratch deployment = sasta par replicate nahi; Persistent = durable'], cost: 'Per GB-mahina, throughput tier ke hisaab se.', exam: '"HPC", "high-performance computing", "Lustre", "ML training on S3 data" → FSx for Lustre.', level: 'efs' },
      fsxn: { leaf: true, icon: '🗂️', pick: 'FSx for NetApp ONTAP', one: 'NetApp ka managed version — NFS + SMB + iSCSI, snapshots, dedup.', when: ['On-prem NetApp se lift-and-shift', 'Ek hi data Linux aur Windows dono se'], avoid: ['Simple Linux shared folder — EFS'], gotchas: ['Storage efficiency (dedup/compression) se bill kaafi kam ho sakta hai'], cost: 'SSD + capacity pool tier.', exam: '"NetApp", "multi-protocol NFS and SMB" → FSx for ONTAP.', level: 'efs' },
      fsxz: { leaf: true, icon: '📂', pick: 'FSx for OpenZFS', one: 'Managed OpenZFS for NFS workflows needing ZFS features.', when: ['ZFS snapshots/clones and supported NFS applications'], avoid: ['Assumed SMB/AD or ONTAP multiprotocol contract'], gotchas: ['Choose supported deployment, backup and performance configuration; snapshots alone are not a tested recovery plan'], exam: '"OpenZFS", "NFS with ZFS snapshots/clones" → FSx OpenZFS.', level: 'efs' },
    },
    compare: {
      cols: ['', 'S3', 'EBS', 'EFS', 'FSx Windows', 'Instance store'],
      rows: [
        ['Type', 'object', 'block', 'file (NFS)', 'file (SMB)', 'block (local)'],
        ['Kitne servers', 'unlimited (HTTP)', '1 (ek AZ)', 'hazaaron, multi-AZ', 'bahut', '1'],
        ['Durability scope', 'region (3+ AZ)', 'ek AZ', 'region', 'AZ ya multi-AZ', 'instance tak'],
        ['~$/GB-mahina', '0.023', '0.08', '0.30 (IA ~0.016)', 'tier-wise', 'instance mein'],
      ],
    },
    scenarios: [
      { s: 'Auto Scaling group ke 8 Linux web servers ko ek hi "uploads/" folder chahiye jo saare servers dekhein.', answer: 'efs', explain: 'Shared Linux file system, multi-AZ → EFS.' },
      { s: 'User ki profile photos aur 5 saal ke backups.', answer: 's3', explain: 'Poori files, HTTP access, sasta durable → S3.' },
      { s: 'EC2 par self-managed PostgreSQL ki data directory.', answer: 'ebs', explain: 'Ek server ki block disk jo instance se alag zinda rahe → EBS gp3/io2.' },
      { s: 'Windows .NET app ko \\\\fileshare\\reports SMB path chahiye, AD login ke saath.', answer: 'fsxw', explain: 'SMB + AD → FSx for Windows.' },
      { s: 'Linux NFS workflow specifically requires managed OpenZFS snapshots and clones.', answer: 'fsxz', explain: 'Explicit ZFS/NFS feature requirement → FSx OpenZFS; select deployment and backup separately.' },
      { s: 'ML training cluster S3 ke 200 TB dataset ko 100 GB/s se padhna chahta hai.', answer: 'fsxl', explain: 'HPC throughput + S3 link → FSx for Lustre.' },
      { s: 'Ek cache layer jo har server apne liye rakhta hai — data kho jaaye toh dobara ban jaata hai, sabse zyada IOPS chahiye.', answer: 'istore', explain: 'Temporary + max I/O → instance store.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 's3class',
    icon: '🧊',
    title: 'Kaunsi S3 storage class? — Standard, Intelligent-Tiering, IA, Glacier',
    short: 'S3 class',
    tldr: 'Teen numbers dekho: data kitni baar padha jaata hai, padhte waqt kitna intezaar chalega (ms ya ghante), aur kitne din rakhna hai. Pattern pata nahi → Intelligent-Tiering.',
    levels: ['s3', 's3adv'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Access pattern pata hai?',
        why: 'Intelligent-Tiering har object ko dekh ke khud sasti tier mein bhejta hai (30 din bina access → Infrequent tier). Pattern pata ho toh seedha class chuno aur monitoring fee bachao.',
        options: [
          { t: 'Nahi pata / badalta rehta hai', next: 'intel' },
          { t: 'Haan pata hai', next: 'q2' },
        ],
      },
      q2: {
        q: 'Data kitni baar padha jaata hai?',
        options: [
          { t: 'Roz / har ghante (hot)', next: 'std' },
          { t: 'Mahine mein ek-do baar, par turant (ms) chahiye', next: 'q3' },
          { t: 'Saal mein ek-do baar ya kabhi nahi (archive)', next: 'q4' },
        ],
      },
      q3: {
        q: 'Ek AZ ke dher (fire/flood) mein data khoya toh chalega? (Data dobara ban sakta hai)',
        options: [
          { t: 'Nahi — original data hai', next: 'ia' },
          { t: 'Haan — copy hai / dobara generate ho sakta hai', next: 'oz' },
        ],
      },
      q4: {
        q: 'Zaroorat padne par kitna intezaar chalega?',
        options: [
          { t: 'Milliseconds — kabhi kabhi turant chahiye (medical images, news archive)', next: 'gir' },
          { t: 'Minutes se ghante', next: 'gfr' },
          { t: '12–48 ghante chalega — compliance archive 7–10 saal', next: 'gda' },
        ],
      },
      std: { leaf: true, icon: '🔥', pick: 'S3 Standard', one: 'Hot data — koi retrieval fee nahi, koi minimum days nahi.', when: ['Website assets, active uploads, data lake ka hot data'], avoid: ['Mahinon se untouched data — lifecycle se neeche bhejo'], gotchas: ['Lifecycle rule lagao warna sab Standard mein pada rehta hai'], cost: '~$0.023/GB-mahina.', exam: '"frequently accessed" → Standard.', level: 's3adv' },
      intel: { leaf: true, icon: '🤖', pick: 'S3 Intelligent-Tiering', one: 'S3 khud har object ko access ke hisaab se tiers mein move karta hai — retrieval fee nahi.', when: ['Access pattern unknown ya badalta', 'Data lake jahan kuch files hot, kuch thandi'], avoid: ['Lakhon chhote objects (<128 KB) — chhote objects auto-tier nahi hote', 'Pattern pakka pata ho — seedha class chuno'], gotchas: ['Monitoring fee ~$0.0025 per 1,000 objects/mahina', 'Archive tiers optional hain — opt-in karna padta hai'], cost: 'Approx online storage rates:Frequent$0.023, after30days Infrequent$0.0125, after90days Archive Instant$0.004 per GB-month; eligible-object monitoring extra.', exam: '"unknown or changing access patterns" → Intelligent-Tiering.', level: 's3adv' },
      ia: { leaf: true, icon: '❄️', pick: 'S3 Standard-IA', one: 'Kam padha jaane wala data, par turant chahiye — 3+ AZs.', when: ['Backups jo kabhi-kabhi restore hote hain', 'Purane user files (mahine mein ek baar)'], avoid: ['Roz padha jaane wala data (retrieval fee lagti hai)', '30 din se pehle delete hone wala data (30-day minimum)'], gotchas: ['Minimum billable size 128 KB, minimum 30 din', 'Per-GB retrieval fee ~$0.01'], cost: '~$0.0125/GB-mahina.', exam: '"infrequently accessed" + "rapid access" + "resilient" → Standard-IA.', level: 's3adv' },
      oz: { leaf: true, icon: '1️⃣', pick: 'S3 One Zone-IA', one: 'IA jaisa, par sirf ek AZ — 20% aur sasta.', when: ['Thumbnails jo original se dobara ban sakte hain', 'Doosre region ki replica copy'], avoid: ['Original, irreplaceable data'], gotchas: ['AZ destroy = data gaya'], cost: '~$0.01/GB-mahina.', exam: '"infrequent" + "can be recreated" + "lowest cost" → One Zone-IA.', level: 's3adv' },
      gir: { leaf: true, icon: '🧊', pick: 'S3 Glacier Instant Retrieval', one: 'Archive ka daam, par milliseconds mein read.', when: ['Quarter mein ek baar padha jaane wala data jo turant chahiye'], avoid: ['Mahine mein kai baar access — retrieval fee mehengi'], gotchas: ['Minimum90days and128KB billed-size minimum; reads charge'], cost: '~$0.004/GB-mahina, retrieval ~$0.03/GB.', exam: '"archive" + "milliseconds retrieval" → Glacier Instant Retrieval.', level: 's3adv' },
      gfr: { leaf: true, icon: '🏔️', pick: 'S3 Glacier Flexible Retrieval', one: 'Archive — minutes se ghante mein restore.', when: ['Backups jo DR mein hi restore hote hain'], avoid: ['Turant chahiye'], gotchas: ['Expedited 1–5 min (mehenga), Standard 3–5 ghante, Bulk 5–12 ghante; minimum 90 din'], cost: '~$0.0036/GB-mahina.', exam: '"archive" + "retrieval within hours" → Glacier Flexible.', level: 's3adv' },
      gda: { leaf: true, icon: '🗄️', pick: 'S3 Glacier Deep Archive', one: 'Sabse sasta storage — 12–48 ghante mein restore.', when: ['Compliance archive 7–10 saal (bank, hospital)', 'Tape library ki jagah'], avoid: ['Kuch bhi jo jaldi chahiye'], gotchas: ['Minimum180days; typical Standard12h/Bulk48h, large objects/capacity can take longer;40KB metadata/object'], cost: '~$0.00099/GB-month raw archive rate; metadata/requests/restore/transfer/minimums extra.', exam: '"lowest cost" + "rarely accessed" + "retrieval within 12/48 hours" → Deep Archive.', level: 's3adv' },
    },
    compare: {
      cols: ['', 'Standard', 'Int-Tiering', 'Standard-IA', 'One Zone-IA', 'Glacier IR', 'Glacier Flexible', 'Deep Archive'],
      rows: [
        ['$/GB-mahina', '0.023', '0.023→auto', '0.0125', '0.01', '0.004', '0.0036', '0.00099'],
        ['Read speed', 'ms', 'ms', 'ms', 'ms', 'ms', 'min–ghante', '12–48 ghante'],
        ['Min days', '—', '—', '30', '30', '90', '90', '180'],
        ['AZs', '3+', '3+', '3+', '1', '3+', '3+', '3+'],
      ],
    },
    scenarios: [
      { s: 'Bank ko transaction records 10 saal rakhne hain, auditor saal mein ek baar maangta hai aur 2 din ka time deta hai.', answer: 'gda', explain: 'Rare access and reviewed48h restore tolerance → Deep Archive candidate; WORM retention/access/key controls separate.' },
      { s: 'Data lake ki files — kuch roz padhi jaati hain, kuch mahinon untouched, pattern pata nahi.', answer: 'intel', explain: 'Unknown pattern → Intelligent-Tiering.' },
      { s: 'Original photos se bane thumbnails ki 90 din purani copies, kabhi-kabhi chahiye.', answer: 'oz', explain: 'Dobara ban sakte hain + infrequent → One Zone-IA.' },
      { s: 'Hospital X-ray images: 1 saal baad shayad hi koi khole, par doctor khole toh turant dikhni chahiye.', answer: 'gir', explain: 'Archive cost + millisecond read → Glacier Instant Retrieval.' },
      { s: 'Monthly backups jo sirf disaster mein restore hote hain, 4–5 ghante chalega.', answer: 'gfr', explain: 'Ghanton ka restore OK → Glacier Flexible Retrieval.' },
      { s: 'Ecommerce product images jo website roz serve karti hai.', answer: 'std', explain: 'Hot data → Standard (CloudFront ke peeche).' },
      { s: 'Customer invoices30days old, retained>1year, occasional ms downloads, irreplaceable originals.', answer: 'ia', explain: 'Infrequent + rapid + original → Standard-IA (ya lifecycle Standard → IA after 30 days).' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'database',
    icon: '🗄️',
    title: 'Kaunsa database? — RDS, Aurora, DynamoDB, ElastiCache, Redshift, Athena...',
    short: 'Database chuno',
    tldr: 'Pehle query ka shape: ek row by key (OLTP) ya lakhon rows ka aggregate (analytics)? Phir: joins/transactions chahiye (SQL) ya fixed access pattern par massive scale (DynamoDB)?',
    levels: ['rds', 'dynamodb', 'datastore'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Query kaisi hai?',
        why: 'OLTP = "order #123 do" (chhoti, bahut saari, ms mein). OLAP/analytics = "pichhle saal har city ki revenue" (lakhon rows scan). Ek database dono achhe se nahi karta.',
        options: [
          { t: 'App ki roz ki queries — ek user/order by id, insert/update (OLTP)', next: 'q2' },
          { t: 'Reports/dashboards — billions rows ka SUM/GROUP BY (analytics)', next: 'q5' },
          { t: 'Full-text search, log search, "kuch milta-julta dhoondo"', next: 'opensearch' },
          { t: 'Microsecond reads — session, leaderboard, cache', next: 'elasticache' },
        ],
      },
      q2: {
        q: 'Joins, transactions across tables, ya complex ad-hoc SQL chahiye?',
        options: [
          { t: 'Haan — relational data (orders ↔ customers ↔ payments)', next: 'q3' },
          { t: 'Nahi — access patterns fix hain (get by key, query by partition), scale bahut bada', next: 'dynamodb' },
          { t: 'Graph (friends-of-friends, fraud rings)', next: 'neptune' },
        ],
      },
      q3: {
        q: 'Scale aur availability ki zaroorat?',
        why: 'RDS ek instance + standby. Aurora storage ko 3 AZs mein 6 copies rakhta hai, 15 tak read replicas, failover ~30 second. Aurora mehenga, par bade production par simple.',
        options: [
          { t: 'Normal — ek primary kaafi hai, Multi-AZ standby chahiye', next: 'rds' },
          { t: 'Bada read scale, fast failover, ya global (multi-region) reads', next: 'aurora' },
          { t: 'Traffic bahut unpredictable / dev-test DB jo raat ko idle', next: 'aurorasl' },
        ],
      },
      q5: {
        q: 'Data kahan pada hai aur kitni baar query hota hai?',
        options: [
          { t: 'S3 mein (logs, CSV, Parquet) — kabhi-kabhi ad-hoc query', next: 'athena' },
          { t: 'Har roz dashboards, BI tools, complex joins TBs par', next: 'redshift' },
        ],
      },
      rds: {
        leaf: true, icon: '🗄️', pick: 'Amazon RDS (MySQL/PostgreSQL) Multi-AZ',
        one: 'Managed relational DB — backups, patching, Multi-AZ failover AWS sambhalta hai.',
        when: ['Normal web app ka main database', 'Joins + transactions', 'Existing MySQL/Postgres app migrate karna'],
        avoid: ['Lakhon writes/second (DynamoDB)', 'Analytics/BI on TBs (Redshift)'],
        gotchas: ['Multi-AZ standby read traffic nahi leta (Multi-AZ DB cluster wala option 2 readable standbys deta hai)', 'Read scale = read replicas (async — replica par data thoda purana ho sakta hai)', 'Storage auto-scaling on rakho'],
        cost: 'db.m7g.large ≈ $0.17/ghanta Single-AZ; Multi-AZ ≈ 2×.',
        exam: '"relational", "managed", "Multi-AZ for HA" → RDS. "read-heavy" → read replicas. "failover" → Multi-AZ.',
        iac: `resource "aws_db_instance" "main" {
  identifier          = "orders-db"
  engine              = "postgres"
  instance_class      = "db.m7g.large"
  allocated_storage   = 100
  multi_az            = true        # standby doosre AZ mein
  backup_retention_period = 7
  deletion_protection = true
  storage_encrypted   = true
}`,
        level: 'rds',
      },
      aurora: {
        leaf: true, icon: '🌟', pick: 'Amazon Aurora (MySQL/PostgreSQL compatible)',
        one: 'AWS ka cloud-native SQL — 6 copies 3 AZs mein, 15 read replicas, fast failover, Global Database.',
        when: ['Bada production SQL workload', 'Read-heavy (15 replicas, ek reader endpoint)', 'Multi-region DR with <1 s replication lag (Global Database)'],
        avoid: ['Chhota/dev DB jahan RDS sasta', 'NoSQL key-value scale (DynamoDB)'],
        gotchas: ['I/O-Optimized config choose karo agar I/O bill 25%+ hai', 'Global Database secondary region read-only — failover manual/managed switchover'],
        cost: 'Instance ghante + storage (~$0.10/GB-mahina) + I/O (Standard config).',
        exam: '"MySQL/PostgreSQL compatible" + "high performance" + "up to 15 read replicas" / "cross-region <1 second" → Aurora (Global Database).',
        level: 'rds',
      },
      aurorasl: {
        leaf: true, icon: '🎚️', pick: 'Aurora Serverless v2',
        one: 'Aurora jo capacity (ACUs) traffic ke hisaab se khud upar-neeche karta hai.',
        when: ['Unpredictable spiky SQL traffic', 'Dev/test DBs jo raat ko idle hain', 'Multi-tenant SaaS jahan har tenant ka load alag'],
        avoid: ['24×7 steady bhaari load — provisioned Aurora sasta'],
        gotchas: ['Min/Max ACU set karo — min bahut kam hua toh pehli bhaari query slow'],
        cost: 'Per ACU-ghanta (~$0.12 per ACU-ghanta).',
        exam: '"unpredictable workload" + "relational" + "minimal management" → Aurora Serverless v2.',
        level: 'rds',
      },
      dynamodb: {
        leaf: true, icon: '📊', pick: 'Amazon DynamoDB',
        one: 'Serverless key-value/document DB — single-digit ms latency kisi bhi scale par.',
        when: ['Access patterns pehle se pata (get user by id, orders by customer)', 'Millions requests/second, spiky traffic (on-demand mode)', 'Serverless apps (Lambda + DynamoDB)', 'Shopping cart, session, IoT, gaming state'],
        avoid: ['Ad-hoc SQL, joins, reporting', 'Access pattern pata nahi — table design galat hoga'],
        gotchas: ['Partition key high-cardinality rakho (user_id), low-cardinality (status) = hot partition', 'Item max 400 KB', 'Scan poori table padhta hai — mehenga; Query use karo', 'GSI eventually consistent'],
        cost: 'On-demand ~$0.625 per 10 lakh writes, ~$0.125 per 10 lakh reads; storage ~$0.25/GB-mahina.',
        exam: '"key-value", "single-digit millisecond", "serverless", "massive scale" → DynamoDB. "microseconds" → DAX lagao.',
        iac: `resource "aws_dynamodb_table" "sessions" {
  name         = "user-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "session_id"
  attribute { name = "user_id"    type = "S" }
  attribute { name = "session_id" type = "S" }
  ttl { attribute_name = "expires_at" enabled = true }
  point_in_time_recovery { enabled = true }
}`,
        level: 'dynamodb',
      },
      elasticache: {
        leaf: true, icon: '⚡', pick: 'ElastiCache (Valkey / Redis OSS / Memcached)',
        one: 'In-memory cache — microsecond reads, DB ka load kam.',
        when: ['Session store, leaderboard (sorted sets), rate limiting', 'DB ke saamne cache (cache-aside)'],
        avoid: ['Primary source of truth jahan data khona mana hai (persistence limited)'],
        gotchas: ['TTL + invalidation strategy pehle socho', 'Valkey engine Redis OSS se sasta'],
        cost: 'Node ghante (ya Serverless per GB + ECPU).',
        exam: '"sub-millisecond", "caching", "session state", "leaderboard" → ElastiCache.',
        level: 'datastore',
      },
      redshift: {
        leaf: true, icon: '🏛️', pick: 'Amazon Redshift',
        one: 'Columnar data warehouse — TBs–PBs par complex SQL analytics, BI dashboards.',
        when: ['Roz ke BI dashboards, complex joins, TBs data', 'Data warehouse jahan bahut users query karte hain'],
        avoid: ['OLTP app ka main DB', 'Kabhi-kabhi ki ad-hoc query on S3 (Athena sasta)'],
        gotchas: ['Redshift Serverless se cluster sizing ka jhanjhat khatam', 'Redshift Spectrum S3 data bhi query kar sakta hai'],
        cost: 'Node ghante ya Serverless RPU-ghante.',
        exam: '"data warehouse", "OLAP", "BI", "petabyte-scale analytics" → Redshift.',
        level: 'datastore',
      },
      athena: {
        leaf: true, icon: '🔎', pick: 'Amazon Athena',
        one: 'S3 par seedha SQL — server nahi, per TB scanned bill.',
        when: ['Logs (CloudTrail, ALB, VPC Flow Logs) S3 mein — ad-hoc investigation', 'Data lake par kabhi-kabhi query'],
        avoid: ['Har second chalne wale dashboards par bahut bade scans', 'OLTP'],
        gotchas: ['Parquet + partitioning se scan 10–100× kam = bill kam', 'Glue Data Catalog mein table schema'],
        cost: '~$5 per TB scanned.',
        exam: '"query data in S3 using SQL", "serverless", "ad-hoc" → Athena.',
        level: 'datastore',
      },
      opensearch: {
        leaf: true, icon: '🔍', pick: 'Amazon OpenSearch Service',
        one: 'Full-text search + log analytics (Elasticsearch-compatible).',
        when: ['Product search with typo tolerance, relevance', 'Log/observability search dashboards'],
        avoid: ['Primary transactional DB', 'Simple key lookups'],
        gotchas: ['Production: 3 AZ, dedicated masters, hot data short retention + UltraWarm/S3 cold'],
        cost: 'Instance ghante + EBS storage (ya Serverless OCUs).',
        exam: '"full-text search", "log analytics", "Elasticsearch" → OpenSearch.',
        level: 'logsetl',
      },
      neptune: {
        leaf: true, icon: '🕸️', pick: 'Amazon Neptune',
        one: 'Graph database — relationships par queries (Gremlin / openCypher / SPARQL).',
        when: ['Social graph, fraud rings, recommendation engine, knowledge graph'],
        avoid: ['Normal relational data — RDS/Aurora'],
        gotchas: ['Graph query language seekhni padti hai'],
        cost: 'Instance ghante + storage + I/O.',
        exam: '"graph", "highly connected data", "relationships" → Neptune.',
        level: 'datastore',
      },
    },
    compare: {
      cols: ['', 'RDS', 'Aurora', 'DynamoDB', 'ElastiCache', 'Redshift', 'Athena'],
      rows: [
        ['Model', 'SQL', 'SQL', 'key-value', 'in-memory', 'columnar SQL', 'SQL on S3'],
        ['Workload', 'OLTP', 'OLTP bada', 'OLTP massive', 'cache', 'OLAP', 'ad-hoc OLAP'],
        ['Latency', 'ms', 'ms', 'single-digit ms', 'µs', 'seconds', 'seconds'],
        ['Scale', 'vertical + replicas', '15 replicas, global', 'virtually unlimited', 'cluster shards', 'nodes/RPU', 'serverless'],
        ['Bill', 'instance', 'instance+IO', 'request/capacity', 'node', 'node/RPU', 'per TB scanned'],
      ],
    },
    scenarios: [
      { s: 'Ecommerce: orders, customers, payments — joins aur transactions chahiye, ek region, normal traffic.', answer: 'rds', explain: 'Relational + transactions + normal scale → RDS Multi-AZ.' },
      { s: 'Mobile game: 20 lakh players ka state, har request "player_id se get/put", traffic event ke din 50×.', answer: 'dynamodb', explain: 'Fixed key access + massive spiky scale → DynamoDB on-demand.' },
      { s: 'CloudTrail logs S3 mein hain. Security team mahine mein 2 baar "kisne bucket delete kiya" dhoondti hai.', answer: 'athena', explain: 'S3 data, kabhi-kabhi ad-hoc SQL → Athena.' },
      { s: 'Finance team ke 40 analysts roz 5 TB sales data par complex joins wale dashboards chalate hain.', answer: 'redshift', explain: 'Roz ke BI, TBs, complex joins → Redshift.' },
      { s: 'MySQL app ko 10 read replicas aur doosre region mein <1 second lag wali copy chahiye.', answer: 'aurora', explain: '15 replicas + Global Database → Aurora MySQL.' },
      { s: 'Dev team ke 30 test databases jo sirf office hours mein use hote hain.', answer: 'aurorasl', explain: 'Idle raat, unpredictable → Aurora Serverless v2.' },
      { s: 'Product catalog mein "iphne 15 case" type karne par bhi "iPhone 15 case" milna chahiye.', answer: 'opensearch', explain: 'Full-text search + typo tolerance → OpenSearch.' },
      { s: 'Login session tokens microsecond mein padhne hain, 30 min TTL.', answer: 'elasticache', explain: 'Session store, µs latency, TTL → ElastiCache.' },
      { s: 'Bank fraud team ko "kaun se accounts 3 hops mein ek hi device se jude hain" dhoondna hai.', answer: 'neptune', explain: 'Relationship traversal → Neptune graph DB.' },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'caching',
    icon: '⚡',
    title: 'Cache kahan lagaun? — CloudFront, API Gateway cache, ElastiCache, DAX',
    short: 'Caching layer',
    tldr: 'Cache user ke jitna paas, utna tez aur sasta. Static/public content → CloudFront edge. Har user ka alag data → app ke paas ElastiCache. DynamoDB reads → DAX.',
    levels: ['cloudfront', 'dynamodb', 'datastore'],
    start: 'q1',
    nodes: {
      q1: {
        q: 'Kya cache karna hai?',
        options: [
          { t: 'Static files ya same-for-everyone responses (images, JS, product page)', next: 'cfc' },
          { t: 'API responses jo kai users ke liye same hain (GET /products)', next: 'q2' },
          { t: 'DB query results / session / per-user data', next: 'q3' },
        ],
      },
      q2: {
        q: 'API kis par bani hai?',
        options: [
          { t: 'API Gateway REST API', next: 'apigwc' },
          { t: 'ALB / custom origin — global users', next: 'cfc' },
        ],
      },
      q3: {
        q: 'Database kaunsa hai?',
        options: [
          { t: 'DynamoDB — sirf reads tez karne hain, code kam badle', next: 'dax' },
          { t: 'RDS/Aurora/any — ya session, leaderboard, rate-limit', next: 'ecache' },
        ],
      },
      cfc: { leaf: true, icon: '🌍', pick: 'CloudFront (edge cache)', one: 'User ke shehar ke edge location par cache — origin tak request hi nahi jaati.', when: ['Images, videos, JS/CSS, downloads', 'Public GET API responses with Cache-Control'], avoid: ['Har user ka personalised data (cache key mein user id = cache bekaar)'], gotchas: ['Cache key mein sirf zaroori headers/query strings — warna hit ratio gir jaata hai', 'Deploy ke baad invalidation ya versioned file names (app.v42.js)'], cost: 'Data transfer out CloudFront se S3/EC2 direct se sasta; S3→CloudFront transfer free.', exam: '"global users", "static content", "reduce latency and origin load" → CloudFront.', level: 'cloudfront' },
      apigwc: { leaf: true, icon: '🚪', pick: 'API Gateway stage cache', one: 'REST API ke stage par response cache (0.5–237 GB).', when: ['REST API ke GET responses jo baar-baar same hain'], avoid: ['HTTP API (cache support nahi)', 'Global users — CloudFront better'], gotchas: ['Per-ghanta cache size ka bill chahe hit ho ya na ho'], cost: '0.5 GB ≈ $0.02/ghanta se shuru.', exam: '"API Gateway" + "reduce backend calls" → enable API caching.', level: 'lambda' },
      dax: { leaf: true, icon: '🚀', pick: 'DynamoDB Accelerator (DAX)', one: 'DynamoDB ke saamne in-memory cache — ms → microseconds, API same.', when: ['Read-heavy DynamoDB, hot items', 'Code change kam chahiye (DAX client same API)'], avoid: ['Write-heavy', 'Strongly consistent reads chahiye (DAX ko bypass karte hain)'], gotchas: ['DAX cluster VPC ke andar chalta hai'], cost: 'Node ghante.', exam: '"DynamoDB" + "microsecond" + "minimal code changes" → DAX.', level: 'dynamodb' },
      ecache: { leaf: true, icon: '⚡', pick: 'ElastiCache (Valkey/Redis OSS)', one: 'App aur DB ke beech general-purpose cache.', when: ['RDS ke repeated queries', 'Sessions, leaderboards, rate limiting'], avoid: ['Static public content — CloudFront'], gotchas: ['Cache-aside: miss par DB padho, cache mein likho, TTL lagao', 'Write par invalidate karna bhoolna = stale data'], cost: 'Node ghante ya Serverless.', exam: '"in-memory cache for RDS", "session store" → ElastiCache.', level: 'datastore' },
    },
    scenarios: [
      { s: 'Ecommerce product images duniya bhar ke users ko slow load ho rahe hain.', answer: 'cfc', explain: 'Static + global → CloudFront edge cache.' },
      { s: 'DynamoDB par "trending products" item har second 50,000 baar padha jaata hai; latency microseconds chahiye, code kam badle.', answer: 'dax', explain: 'DynamoDB read-heavy + µs → DAX.' },
      { s: 'RDS par same "top 10 categories" query har page load par chalti hai, CPU 90%.', answer: 'ecache', explain: 'DB ke saamne cache-aside → ElastiCache.' },
      { s: 'API Gateway REST API ka GET /exchange-rates har request par Lambda chalata hai; rate 5 minute mein ek baar badalta hai.', answer: 'apigwc', explain: 'Same response baar-baar → API Gateway stage cache (TTL 300 s).' },
    ],
  },
]);
