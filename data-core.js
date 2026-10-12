/* =====================================================================
   AWS Gurukul — Ranks & Tracks
   Naya track add karna ho? Yahan ek entry + ek nayi data-<track>.js file.
   ===================================================================== */

const RANKS = [
  { xp: 0,    name: 'Cloud Shishya',                 icon: '🐣' },
  { xp: 200,  name: 'Instance Initiate',             icon: '🖥️' },
  { xp: 450,  name: 'Bucket Builder',                icon: '🪣' },
  { xp: 750,  name: 'VPC Voyager',                   icon: '🌐' },
  { xp: 1100, name: 'Subnet Sadhak',                 icon: '🧘' },
  { xp: 1500, name: 'IAM Insaf',                     icon: '🔐' },
  { xp: 1950, name: 'Lambda Lila',                   icon: '⚡' },
  { xp: 2450, name: 'Dynamo Darvesh',                icon: '📊' },
  { xp: 3000, name: 'CloudFormation Chakraborty',    icon: '🏗️' },
  { xp: 3600, name: 'Well-Architected Acharya',      icon: '🏛️' },
  { xp: 4300, name: 'Solutions Architect Mahaguru',  icon: '👑' },
  { xp: 5200, name: 'Trade-off Tapasvi',             icon: '⚖️' },
  { xp: 6200, name: 'Decision Darvesh',              icon: '🧭' },
  { xp: 7400, name: 'Chief Architect Chakravarti',   icon: '🌌' },
];

/* Tracks unlock sequentially: Beginner → Intermediate → Advanced.
   `levels` resolve lazily from AG.levelSets (filled by data-*.js). */
AG.tracks = [
  {
    id: 'beginner',
    icon: '🌱',
    name: 'Beginner — Shishya Path',
    blurb: 'Cloud ka pehla word nahi aata? Yahan se shuruaat. Cloud 101, IAM, EC2, S3, VPC basics, RDS, ELB+ASG — Boss: pehla 3-tier architecture deploy.',
    certTitle: 'CLOUD PANDIT',
    certSub: 'Certificate of AWS Cloud Foundations',
    motto: 'Shared responsibility samjho — AWS ka kaam, tumhara kaam.',
    formula: 'Region ⊃ AZs ⊃ VPC ⊃ Subnets ⊃ Resources',
  },
  {
    id: 'intermediate',
    icon: '🔥',
    name: 'Intermediate — Sadhak Path',
    blurb: 'Architect ka hathiyaar-basta. VPC deep dive, Route 53, CloudFront, S3 advanced, Lambda+API Gateway, DynamoDB, SQS/SNS/Kinesis, security deep dive — Boss: multi-AZ resilient architecture.',
    certTitle: 'ARCHITECT SADHAK',
    certSub: 'Certificate of Production-Grade Architecture',
    motto: 'Decouple karo — sync chhod, async aadopt karo.',
    formula: 'Resilience = Multi-AZ + ALB + ASG + Decoupling + Backup',
  },
  {
    id: 'advanced',
    icon: '🚀',
    name: 'Advanced — Guru Path',
    blurb: 'Senior Solutions Architect ka shastra. Well-Architected Framework, DR strategies, Direct Connect, containers, IaC, cost optimization, observability, migration 7Rs — Final Boss: Senior Gauntlet.',
    certTitle: 'SOLUTIONS ARCHITECT MAHAGURU',
    certSub: 'Certificate of Cloud Architecture Mastery',
    motto: 'Git mein likho, CloudFormation/Terraform se deploy karo — console ka click band.',
    formula: 'Senior = Well-Architected + HA/DR + IaC + Cost + Observability',
  },
  {
    id: 'architect',
    icon: '🧭',
    name: 'Architect — Nirnay Path',
    blurb: 'Itne saare services... kaunsa KAB, aur kab NAHI? PixShare startup ke saath MVP se global scale tak — compute, storage/DB, messaging, EventBridge+Pipes, log-analytics ETL (CloudWatch→Firehose→OpenSearch), edge/network, cost traps, resilience — har level ek decision framework. Final Boss: poora architecture design.',
    certTitle: 'DECISION ARCHITECT',
    certSub: 'Certificate of Service-Selection Mastery',
    motto: 'Sahi service woh nahi jo powerful ho — woh jo requirement, cost aur blast-radius ko fit kare.',
    formula: 'Right service = Requirement ∩ Cost ∩ Scale ∩ Ops-load ∩ Blast-radius',
  },
];
