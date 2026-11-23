/* README titles and first setup blocks are checked by validate-labhub.js. Commands start at the repo root. */
AG.labIndex = [
  {
    "folder": "01-first-contact",
    "title": "🧪 Lab 01 — First contact: main kaun hoon, kahan hoon, aur bill kahan se aaya?",
    "setup": "cd docker-labs\n# Docker hai toh neeche ./start-moto.sh ki jagah docker compose up -d chalao.\n./start-moto.sh             # Docker nahi hai toh (sirf Python chahiye)\nsource env.sh               # ab `aws` laptop wale emulator se baat karega\ncd 01-first-contact",
    "limit": "Moto AZ names aur IAM identity dikhaata hai. Is lab mein AWS billing report nahi banti."
  },
  {
    "folder": "02-iam-least-privilege",
    "title": "🔐 Lab 02 — IAM: root se admin, admin se least privilege, aur Deny hamesha jeetta hai",
    "setup": "cd docker-labs\n./start-moto.sh iam          # ya: docker compose up -d   (dono emulators chalu)\ncd 02-iam-least-privilege\n./setup.sh                   # ex1 — har baar fresh account\nsource lab-env.sh            # profiles is lab ke .lab/ folder mein — tumhari ~/.aws ko haath nahi lagta",
    "limit": "IAM waale Moto par policy aur AccessDenied check hote hain. Setup port 4567 ke emulator ka purana data mitaata hai."
  },
  {
    "folder": "03-ec2-lifecycle",
    "title": "🖥️ Lab 03 — EC2: sahi launch, aur server ke saath kya marta hai, kya bachta hai",
    "setup": "cd docker-labs\n./start-moto.sh            # ya: docker compose up -d\nsource env.sh\ncd 03-ec2-lifecycle",
    "limit": "Moto instance ki state, IP aur volume dikhata hai. Guest OS aur SSH session nahi chalte."
  },
  {
    "folder": "04-s3-safety",
    "title": "🪣 Lab 04 — S3: galti wapas lo, private file ek customer ko do, aur bill saaf rakho",
    "setup": "cd docker-labs\n./start-moto.sh            # ya: docker compose up -d\nsource env.sh\ncd 04-s3-safety",
    "limit": "Versions aur delete marker padhe ja sakte hain. Moto par KMS permission ka poora check nahi hota."
  },
  {
    "folder": "05-vpc-build",
    "title": "05 — ShopKaro ka VPC: public web, private app",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 05-vpc-build\nmkdir -p .lab\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN\naws sts get-caller-identity --query Account --output text",
    "limit": "Route-table settings padhi jaati hain. Moto actual packets nahi bhejta."
  },
  {
    "folder": "06-rds-recovery",
    "title": "06 — RDS: standby, backups, read replica aur restore target",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 06-rds-recovery\nmkdir -p .lab\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN",
    "limit": "Restore ka naya DB dikhta hai. SQL connections aur failover time ke liye asli runtime chahiye."
  },
  {
    "folder": "07-alb-asg-selfheal",
    "title": "07 — ALB + ASG: scale karo aur instance replace karo",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 07-alb-asg-selfheal\nbash setup.sh\nsource .lab/resources.sh\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN",
    "limit": "Health aur scaling settings milti hain. Moto par nginx traffic ya metric-driven scaling nahi chalti."
  },
  {
    "folder": "08-three-tier-terraform",
    "title": "08 — ShopKaro ka first three-tier review, Terraform se",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 08-three-tier-terraform\nmkdir -p .lab\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN\nexport TF_VAR_moto_ami_id=$(aws ec2 describe-images --query 'Images[0].ImageId' --output text)",
    "limit": "Terraform resources aur links banata hai. Web request ya SQL query ka result alag test hai."
  },
  {
    "folder": "09-nat-endpoint-peering",
    "title": "09 — Outbound path, S3 shortcut aur analytics VPC",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 09-nat-endpoint-peering\nmkdir -p .lab\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN",
    "limit": "Route aur endpoint IDs milte hain. Moto data transfer ya NAT bill nahi naapta."
  },
  {
    "folder": "10-route53-routing",
    "title": "Lab10 — Route53 records: Alias, weighted aur failover health association",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 10-route53-routing\nmkdir -p .lab\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN",
    "limit": "Health check aur DNS record ki settings milti hain. Public DNS aur resolver cache test alag hai."
  },
  {
    "folder": "11-cloudfront-oac",
    "title": "Lab11 — CloudFront JSON, OAC policy aur invalidation metadata",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 11-cloudfront-oac\nmkdir -p .lab\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN",
    "limit": "Distribution ki setting aur invalidation milti hai. Edge hit aur OAC access check alag hai."
  },
  {
    "folder": "12-s3-lifecycle-lock-replication",
    "title": "Lab12 — lifecycle, Object Lock, replication aur archive restore",
    "setup": "cd docker-labs\n./start-moto.sh\nsource env.sh\ncd 12-s3-lifecycle-lock-replication\nmkdir -p .lab\nexport AWS_SHARED_CREDENTIALS_FILE=\"$PWD/.lab/credentials\"\nexport AWS_CONFIG_FILE=\"$PWD/.lab/config\"\nexport AWS_EC2_METADATA_DISABLED=true\nunset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN\nbash setup.sh\nsource .lab/resources.sh",
    "limit": "Retention aur replication ki settings padhi jaati hain. Background copy aur tier change ka poora runtime nahi chalta."
  },
  {
    "folder": "13-efs-shared-storage",
    "title": "Lab13 — shared storage ki configuration inspect aur repair karo",
    "setup": "cd docker-labs\n# Existing Moto ho toh launcher skip karo.\n./start-moto.sh\nsource env.sh\ncd 13-efs-shared-storage\nbash setup.sh\nsource .lab/resources.sh",
    "limit": "Mount target aur access point milte hain. Actual NFS mount ke liye alag runtime chahiye."
  },
  {
    "folder": "14-lambda-handler-config",
    "title": "Lab14 — handler bytes, duplicate events aur Lambda configuration",
    "setup": "cd docker-labs\n# Existing Moto absent ho tab launcher; shared reset mat chalao.\n./start-moto.sh\nsource env.sh\ncd 14-lambda-handler-config",
    "limit": "Laptop par image handler chalta hai. Lambda runtime aur provisioned concurrency ka test alag hai."
  },
  {
    "folder": "15-dynamodb-access-patterns",
    "title": "Lab 15 — cart keys, safe backfill aur atomic checkout",
    "setup": "cd docker-labs\n# Existing Moto absent ho tab ./start-moto.sh; shared reset mat chalao.\nsource env.sh\ncd 15-dynamodb-access-patterns\n../.venv/bin/python -I lab.py setup",
    "limit": "Table par reads aur writes chalti hain. Emulator se production capacity ya real TTL cleanup time ka andaaza mat lagao."
  },
  {
    "folder": "16-cache-aside",
    "title": "Lab16 — cache-aside, invalidation aur thundering herd",
    "setup": "cd docker-labs\nsource env.sh\ncd 16-cache-aside",
    "limit": "Cache hit aur origin reads laptop par gine jaate hain. Moto par DAX node aur cache engine nahi chalte."
  },
  {
    "folder": "17-sqs-sns-fanout-dlq",
    "title": "Lab17 — SNS fan-out, SQS retries aur durable intent",
    "setup": "cd docker-labs\nsource env.sh\ncd 17-sqs-sns-fanout-dlq\n../.venv/bin/python -I lab.py",
    "limit": "Queue se delivery aur DLQ read milte hain. Moto ka policy aur FIFO dedup check AWS se alag ho sakta hai."
  },
  {
    "folder": "18-eventbridge-stepfunctions",
    "title": "Lab18 — routing, schedules aur compensation ka asli saboot",
    "setup": "cd docker-labs\nsource env.sh\ncd 18-eventbridge-stepfunctions\n../.venv/bin/python -I metadata.py\n../.venv/bin/python -I test_saga.py",
    "limit": "Rule se queue tak event milta hai. Order ka saga laptop par chalta hai. Moto ki history poore workflow ka saboot nahi hai."
  },
  {
    "folder": "19-kms-secrets-waf",
    "title": "Lab19 — data keys, secret versions aur protection metadata",
    "setup": "cd docker-labs\nsource env.sh\npython -I 19-kms-secrets-waf/lab.py",
    "limit": "Encryption ka tamper test laptop par chalta hai. WAF traffic aur GuardDuty detection alag runtime hain."
  },
  {
    "folder": "20-mahasale-terraform",
    "title": "Lab20 — Mahasale readiness: config, channel test aur limit wala kaam",
    "setup": "cd docker-labs\nsource env.sh\n# Terraform pehle install karo. Yeh command uska version dikhaati hai.\nterraform version\npython -I 20-mahasale-terraform/lab.py\npython -I 20-mahasale-terraform/metadata.py\npython -I 20-mahasale-terraform/load.py",
    "limit": "Terraform config aur test intents padhe jaate hain. Asli storefront, CloudWatch se alert aur email delivery alag checks hain."
  },
  {
    "folder": "21-wellarch-risk-scan",
    "title": "Lab21 — risky configuration se review evidence tak",
    "setup": "./docker-labs/21-wellarch-risk-scan/seed.sh",
    "limit": "Scanner DB, alarm aur trail ki settings padhta hai. Log delivery aur restore drill alag test hain."
  },
  {
    "folder": "22-org-scp-guardrails",
    "title": "Lab22 — organization metadata aur asli SCP enforcement ki kami",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/22-org-scp-guardrails/lab.py",
    "limit": "SCP attach hota hai. Moto member account ki woh write bhi maan sakta hai jo AWS policy rokegi."
  },
  {
    "folder": "23-backup-restore-failover",
    "title": "Lab23 — DR configuration vs asli recovery evidence",
    "setup": "./docker-labs/23-backup-restore-failover/drill.sh",
    "limit": "Backup aur DNS settings padhi jaati hain. Restore ki order list laptop par milti hai. Live DNS switch alag hai."
  },
  {
    "folder": "24-hybrid-tgw-segments",
    "title": "Lab24 — TGW segments, VPN aur hybrid DNS metadata",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/24-hybrid-tgw-segments/lab.py",
    "limit": "Transit Gateway ki tables milti hain. Route ka faisla local model karta hai. VPN packets nahi bheje jaate."
  },
  {
    "folder": "25-ecs-fargate-service",
    "title": "Lab25 — ECR, dono ECS roles aur Fargate service ka start contract",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/25-ecs-fargate-service/lab.py",
    "limit": "ECR aur ECS ki settings milti hain. Actual task aur HTTP response ke liye container runtime chahiye."
  },
  {
    "folder": "26-terraform-drift-import",
    "title": "Lab26 — Terraform drift, import, moved aur S3 native lock",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/26-terraform-drift-import/lab.py --terraform \"$(command -v terraform)\" --plugin-dir docker-labs/08-three-tier-terraform/.terraform/providers",
    "limit": "Terraform ka plan aur state padhe jaate hain. DB traffic aur failover ka time alag test hai."
  },
  {
    "folder": "27-cost-waste-hunter",
    "title": "Lab27 — apna kharcha saaf karo, value bachate hue",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/27-cost-waste-hunter/lab.py",
    "limit": "Resources aur budget settings padhi jaati hain. AWS ka asli bill aur notification delivery alag hain."
  },
  {
    "folder": "28-logs-metrics-alarms",
    "title": "Lab28 — logs, metric filters, Logs Insights aur alarms (asli Moto par)",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/28-logs-metrics-alarms/lab.py",
    "limit": "Filter aur alarm ki settings milti hain. Query stats aur alarm transition ka hissa Moto par adhura hai."
  },
  {
    "folder": "29-migration-cutover",
    "title": "Lab29 — chhota asli migration: full load, CDC, validation aur cutover",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/29-migration-cutover/lab.py",
    "limit": "Cutover ka data laptop ki SQLite par check hota hai. Moto poora migration engine nahi chalaata."
  },
  {
    "folder": "30-data-lake-athena",
    "title": "Lab30 — chhota data lake: Firehose, partitions, Glue catalog aur Athena",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/30-data-lake-athena/lab.py",
    "limit": "S3 data aur catalog ki settings milti hain. Athena ka asli SQL scan aur bill alag hain."
  },
  {
    "folder": "31-cognito-app-login",
    "title": "Lab31 — app login: Cognito user pool, asli JWT, authorizer ka 401 aur identity pool",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/31-cognito-app-login/lab.py",
    "limit": "Login ke kuch API calls chalte hain. Moto ka model response asli AI accuracy nahi dikhata."
  },
  {
    "folder": "32-region-drill-terraform",
    "title": "Lab 32 · Mumbai se Hyderabad ka checkout drill",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/32-region-drill-terraform/lab.py",
    "limit": "Do Regions ki settings milti hain. DNS switch laptop par chalta hai. Moto ka cross-Region KMS decrypt adhura hai."
  },
  {
    "folder": "33-compute-breakeven",
    "title": "Lab 33 · PixShare ka thumbnail aur compute bill",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/33-compute-breakeven/lab.py",
    "limit": "Laptop dono handlers par image ke pixels milaata hai. Moto Lambda aur ECS ki settings rakhta hai."
  },
  {
    "folder": "34-polyglot-data",
    "title": "Lab 34 · Asha ki 12 posts",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/34-polyglot-data/lab.py",
    "limit": "Table ki Query aur Scan chalti hain. Aurora SQL writer aur Athena query engine alag test hain."
  },
  {
    "folder": "35-fifo-ordering-fanout",
    "title": "Lab 35 · Ek photo ki edits aur analytics ka replay",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/35-fifo-ordering-fanout/lab.py",
    "limit": "FIFO deliveries aur stream replay padhe jaate hain. Production throughput aur consumer lag alag se naapna hoga."
  },
  {
    "folder": "36-event-bus-replay",
    "title": "Lab 36 · PixShare ka review phir chalao",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/36-event-bus-replay/lab.py",
    "limit": "Queue delivery chalti hai. Moto replay extra events bhej sakta hai. Pipe ki setting workflow execution nahi dikhaati."
  },
  {
    "folder": "37-log-pipeline-firehose",
    "title": "Lab 37 · PixShare ki teen log lines kahan gayin?",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/37-log-pipeline-firehose/lab.py",
    "limit": "S3 ka gzip batch milta hai. Moto filter mein INFO bhi aa sakta hai. Search index par write alag test hai."
  },
  {
    "folder": "38-edge-entry-points",
    "title": "Lab 38 · Photo aur personal feed ka entry point",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/38-edge-entry-points/lab.py",
    "limit": "Moto par CloudFront, ALB aur WAF settings milti hain. VPC origin, Global Accelerator aur live traffic mein gaps hain."
  },
  {
    "folder": "39-nat-vs-endpoint-bill",
    "title": "Lab 39 · S3 ka raasta badalne par kaunsi fee bachi?",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/39-nat-vs-endpoint-bill/lab.py",
    "limit": "Route tables milti hain. Mahine ka NAT bill local model se nikalta hai. AWS billing data nahi aata."
  },
  {
    "folder": "40-idempotent-consumer",
    "title": "Lab 40 · Wahi thumbnail do baar mila. Usage kitna hai?",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/40-idempotent-consumer/lab.py",
    "limit": "Queue aur DynamoDB par duplicate check chalta hai. Production traffic aur retry timing alag se naapni hogi."
  },
  {
    "folder": "41-pixshare-terraform",
    "title": "Lab 41 · PixShare core ko Terraform se banao aur review karo",
    "setup": "./docker-labs/.venv/bin/python -I docker-labs/41-pixshare-terraform/lab.py",
    "limit": "Terraform aur host worker ka test chalta hai. Moto par live edge request, Lambda execution aur global failover test nahi hote."
  }
];
