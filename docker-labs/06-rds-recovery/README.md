# 06 — RDS: standby, backups, read replica aur restore target

**Problem:** ShopKaro catalog ka EC2 disk incident repeat nahi hona chahiye. HA aur backup alag requirements hain.
Ek galat `DELETE` primary aur standby dono tak replicate hota hai; standby purani catalog copy nahi hai.

**Goal:** local RDS metadata banao, Multi-AZ + 7-day backups enable karo, manual snapshot lo,
read replica banao aur snapshot ko **new instance** mein restore karo. Real SQL ya failover timing Moto test nahi karta.

Outputs Moto **5.2.4**, awscli ke actual run se **2026-10-25** ko capture hue. IDs/endpoints environment ke saath badal sakte hain.

## Setup — commands ek hi terminal mein

Repo root `aws-gurukul` se:

```bash
cd docker-labs
./start-moto.sh
source env.sh
cd 06-rds-recovery
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials"
export AWS_CONFIG_FILE="$PWD/.lab/config"
export AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
```

Lab dummy emulator credentials use karta hai. Master password CLI/history mein nahi aata: RDS-managed Secrets Manager password request karenge.
`AWS_ENDPOINT_URL` loopback Moto par hona chahiye; role profiles aur `~/.aws` ki zaroorat nahi.

## ex1 — Deliberately weak availability/backup config inspect karo

Encryption aur private-access defaults safe rakho; exercise sirf HA/backup gaps introduce karti hai.

```bash
aws rds create-db-instance --db-instance-identifier shopkaro-rds-main \
  --engine postgres --db-instance-class db.t3.micro --allocated-storage 20 \
  --master-username shopadmin --manage-master-user-password \
  --storage-encrypted --no-publicly-accessible --backup-retention-period 0 \
  --query 'DBInstance.{Id:DBInstanceIdentifier,State:DBInstanceStatus,MultiAZ:MultiAZ,Retention:BackupRetentionPeriod,Encrypted:StorageEncrypted,Public:PubliclyAccessible,Secret:MasterUserSecret.SecretStatus}'
```

**Asli output:**

```json
{
    "Id": "shopkaro-rds-main",
    "State": "available",
    "MultiAZ": false,
    "Retention": 0,
    "Encrypted": true,
    "Public": false,
    "Secret": "creating"
}
```

👉 Retention 0 = automated backups off. `MultiAZ=false` = no synchronous standby for instance failover.
`Encrypted=true` aur `Public=false` HA/backup ki missing settings ko replace nahi karte.
Moto DB turant available dikhata hai; real RDS provisioning mein waqt lagta hai.

## ex2 — Real boolean flag se Multi-AZ + backups enable karo

```bash
aws rds modify-db-instance --db-instance-identifier shopkaro-rds-main \
  --multi-az --backup-retention-period 7 --apply-immediately \
  --query 'DBInstance.{State:DBInstanceStatus,MultiAZ:MultiAZ,Retention:BackupRetentionPeriod}'
aws rds wait db-instance-available --db-instance-identifier shopkaro-rds-main
aws rds describe-db-instances --db-instance-identifier shopkaro-rds-main \
  --query 'DBInstances[0].{Id:DBInstanceIdentifier,State:DBInstanceStatus,MultiAZ:MultiAZ,Retention:BackupRetentionPeriod,Encrypted:StorageEncrypted,Public:PubliclyAccessible,Secret:MasterUserSecret.SecretStatus}'
```

**Asli output:**

```json
{ "State": "available", "MultiAZ": true, "Retention": 7 }
```

```json
{
    "Id": "shopkaro-rds-main",
    "State": "available",
    "MultiAZ": true,
    "Retention": 7,
    "Encrypted": true,
    "Public": false,
    "Secret": "active"
}
```

👉 `--multi-az` ek boolean flag hai; `--multi-az true` real CLI syntax nahi hai.
Waiter success par output nahi aata. Moto standby replication ya production downtime simulate nahi karta.
Real AWS par `--apply-immediately` maintenance se pehle changes apply kar sakta hai; change impact review karo.
Retention 0 se nonzero change availability ko affect kar sakta hai; production change window plan karo.

## ex3 — Manual snapshot aur separate reporting replica

```bash
aws rds create-db-snapshot --db-instance-identifier shopkaro-rds-main \
  --db-snapshot-identifier shopkaro-before-catalog-change \
  --query 'DBSnapshot.{Id:DBSnapshotIdentifier,Source:DBInstanceIdentifier,State:Status,Encrypted:Encrypted}'
aws rds wait db-snapshot-available --db-snapshot-identifier shopkaro-before-catalog-change
aws rds create-db-instance-read-replica --db-instance-identifier shopkaro-rds-report \
  --source-db-instance-identifier shopkaro-rds-main --no-publicly-accessible \
  --query 'DBInstance.{Id:DBInstanceIdentifier,Source:ReadReplicaSourceDBInstanceIdentifier,State:DBInstanceStatus}'
aws rds describe-db-instances --db-instance-identifier shopkaro-rds-main \
  --query 'DBInstances[0].{Source:DBInstanceIdentifier,Replicas:ReadReplicaDBInstanceIdentifiers,Endpoint:Endpoint.Address}'
```

**Asli output:**

```json
{
    "Id": "shopkaro-before-catalog-change",
    "Source": "shopkaro-rds-main",
    "State": "available",
    "Encrypted": true
}
```

```json
{ "Id": "shopkaro-rds-report", "Source": "shopkaro-rds-main", "State": "available" }
```

```json
{
    "Source": "shopkaro-rds-main",
    "Replicas": ["shopkaro-rds-report"],
    "Endpoint": "shopkaro-rds-main.aaaaaaaaaa.ap-south-1.rds.amazonaws.com"
}
```

👉 Source backups read-replica creation se pehle enable hue. Reporting replica source se alag endpoint use karega.
Single-standby Multi-AZ instance ka standby reporting endpoint nahi hai. Replica lag aur actual query throughput Moto test nahi karta.

## ex4 — Snapshot restore source ko overwrite nahi karta

```bash
aws rds restore-db-instance-from-db-snapshot --db-instance-identifier shopkaro-rds-restore \
  --db-snapshot-identifier shopkaro-before-catalog-change --no-publicly-accessible \
  --query 'DBInstance.{Id:DBInstanceIdentifier,State:DBInstanceStatus,Encrypted:StorageEncrypted,Public:PubliclyAccessible}'
```

**Asli output:**

```json
{ "Id": "shopkaro-rds-restore", "State": "available", "Encrypted": true, "Public": false }
```

👉 Restore target ka **naya DB identifier** hai. Real AWS par restore ke baad SQL validation, missing writes ka reconciliation,
security groups/parameter groups review aur controlled endpoint cutover chahiye. Moto stored catalog rows restore nahi karta.
Snapshot time aur `LatestRestorableTime` alag hain. PITR transaction-log recovery real AWS exercise hai; Moto lab snapshot metadata tak limited hai.

## ex5 — Sirf lab ke resources delete karo

```bash
aws rds delete-db-instance --db-instance-identifier shopkaro-rds-report --skip-final-snapshot
aws rds delete-db-instance --db-instance-identifier shopkaro-rds-restore --skip-final-snapshot
aws rds delete-db-instance --db-instance-identifier shopkaro-rds-main --skip-final-snapshot
aws rds delete-db-snapshot --db-snapshot-identifier shopkaro-before-catalog-change
```

Delete calls actual run mein successful hue; DB instance responses `DBInstanceStatus: deleting` the.
Full delete responses bahut verbose hain; cleanup ke liye response fields memorize karna zaroori nahi.
`--skip-final-snapshot` disposable local lab ka choice hai; production retention policy ka default nahi.

## Emulator limits / production boundaries

- Moto RDS metadata store karta hai; PostgreSQL server, `psql`, SQL correctness, replication, read lag, real failover ya PITR replay nahi chalta.
- Moto ka default engine-version metadata old ho sakta hai. Real AWS engine version support page se current approved version select karo.
- **AWS compatibility gap:** Moto accepted a PostgreSQL read replica from the managed-master-password source in ex3. Current real RDS docs do not support that source combination (exceptions: SQL Server/Db2). Treat ex3 as emulator metadata only; for a real PostgreSQL replica lab use a separate source with a supported credential-management design. Do not copy the combined managed-master-secret + read-replica flow into production. [Current RDS limitation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html).
- `Secret: active` password-management metadata dikhata hai; actual DB login/rotation integration ka proof nahi.
- `available` waiter HA drill ya backup-restore data test ka substitute nahi. Managed database ke schema/indexes, connection pools aur application retries customer responsibilities hain.
- Real AWS practice optional aur billable hai; DB instance(s), storage, backups, Secrets Manager, Proxy aur transfer costs separately estimate karo. Local lab $0 AWS bill hai.

Sources: [Multi-AZ instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html),
[Multi-AZ DB cluster](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html),
[backups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html),
[PITR creates a new instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html),
[encryption/migration options](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html).
