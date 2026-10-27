# Lab23 — DR configuration vs asli recovery evidence

**Dard:** DR plan "ready" dikh sakta hai — vault bana, plan bana, replica ka link dikha — phir bhi asli backup job,
replication aur failover kabhi chale hi nahi. Lab dono cheezon ko alag-alag dikhata hai: kya configure hua, aur kya
sach mein prove hua.

ShopKaro course fixture: orders ke liye RTO 4 ghante, RPO 15 minute. Primary **Mumbai (ap-south-1)**, recovery
**Hyderabad (ap-south-2)** — data India mein hi rehta hai.

## Run

`docker-labs/.venv` pehle se chahiye (`./docker-labs/start-moto.sh` ek baar chala ho). `aws-gurukul` folder se,
pehle `lab.py` padho, phir launcher chalao:

```bash
./docker-labs/23-backup-restore-failover/drill.sh
```

`drill.sh` repo root dhoondhta hai aur `.venv` ka Python `-I` mode mein chalata hai. `lab.py` apna **khud ka** naya
Moto 5.2.4 server 127.0.0.1 ke ek random port par chalata hai, dummy keys aur lab-local config use karta hai, aur
har client ko explicit endpoint deta hai. Koi real AWS call, Docker, shared 4566 reset ya `~/.aws` write nahi hota.
Saare objects ek unique `lab23-...` prefix ke saath bante hain aur aakhir mein saaf hote hain.

## ex1 — plan aur "kaun sa resource" alag cheezein hain

Script dono Regions mein `create_backup_vault` karta hai, phir Mumbai mein `create_backup_plan` — roz ka cron aur
Hyderabad vault ka `CopyActions` rule. Phir `create_backup_selection` se orders DB ka ARN plan mein assign karne ki
koshish karta hai, aur `start_backup_job` se ek job.

Asli output (2026-10-27):

```text
BACKUP SELECTION UNSUPPORTED 500 An error occurred (500) when calling the CreateBackupSelection operation (reached max retries: 0): <!doctype html>
PASS 1 cross-Region plan copy rule stored; selection/job runtime unsupported
BACKUP JOB UNSUPPORTED 404 An error occurred (404) when calling the StartBackupJob operation: <!doctype html>
```

👉 Moto mein selection API NotImplemented (500) hai aur job ka URL hi nahi (404). Dono responses ko "backup ho gaya" mat samjho.
Asli AWS mein chahiye: supported resource, sahi service role, selection, poora hua job (recovery point), cross-Region
copy job, aur restore test. Roz ki copy ka RPO 24 ghante tak hai — 15 minute ke liye replica chahiye. Continuous
(PITR) backup ki cross-Region copy destination mein periodic snapshot banti hai, PITR stream nahi.

## ex2 — retention lock (governance mode)

Hyderabad vault par `put_backup_vault_lock_configuration` (MinRetentionDays 7, MaxRetentionDays 90, bina
`ChangeableForDays` = governance mode), phir `describe_backup_vault` padhta hai, phir cleanup se pehle lock config
delete karta hai.

```text
VAULT GOVERNANCE LOCK {"BackupVaultName": "lab23-1793143209082660460", "Locked": true, "MinRetentionDays": 7, "MaxRetentionDays": 90}
PASS 2 governance lock configuration readback only; no compliance immutability test
```

👉 Governance lock ko sahi IAM permission wala user hata sakta hai. Compliance mode (`ChangeableForDays` ≥ 3) grace
ke baad immutable ho jaata hai — root ya AWS bhi recovery points delete nahi kar sakta. Lab jaan-boojh kar compliance
mode nahi banata: grace ke baad ulta nahi hota aur galat retention saalon ka bill banata hai. Readback se WORM ka
asli enforcement prove nahi hota.

## ex3 — snapshot restore, cross-Region replica aur promotion

Script Mumbai DB ka `create_db_snapshot` karke `restore_db_instance_from_db_snapshot` se ek **naya** instance banata
hai. Phir Hyderabad client se source ka **poora ARN** dekar `create_db_instance_read_replica` chalata hai, aur
`promote_read_replica` ke baad dobara `describe_db_instances` padhta hai.

```text
PASS 3 separate RDS snapshot restore instance metadata; no PostgreSQL data plane
PASS 4 cross-Region replica ARN link actual metadata
PROMOTED {"DBInstanceStatus": "available", "ReadReplicaSourceDBInstanceIdentifier": "arn:aws:rds:ap-south-1:123456789012:db:lab23-1793143209082660460"}
PASS 5 Moto promotion returns available but retains source link; not actual independent writer proof
```

👉 Koi PostgreSQL process ya storage nahi chalta. Moto promotion ke baad bhi source link rakhta hai aur turant
`available` bolta hai. Asli RDS mein promotion replication rokta hai, instance reboot hota hai (pehle status
`modifying`), aur promotion undo nahi hota. Asli drill mein: purana writer fence karo, aakhri accepted order IDs
milao, app endpoints aur backup plan naye DB par lao. Failback = naye primary se reverse replication, verify, phir
planned cutover. App ke simulator mein asli RDS jaisa behaviour (source link hatna, `modifying`, default retention 1 din)
modeled hai.

## ex4 — AMI, S3 replication aur DNS failover metadata

`register_image` se Mumbai mein AMI metadata banta hai; Hyderabad client `copy_image` + `describe_images` se naya
AMI ID dikhata hai. Phir dono Regions mein versioned buckets aur S3 CRR config, ek source object, aur ek failover
record pair (PRIMARY/SECONDARY) + health check.

```text
PASS 6 destination AMI copy metadata exists; no EC2 boot
PASS 7 S3 CRR configuration readback
PASS 8 Moto CRR stores config but does not replicate object
DNS CHANGE {"Id": "/change/C2682N5HXP0BZ4", "Status": "INSYNC", "SubmittedAt": "2026-10-27 23:20:10.499506+00:00"}
PASS 9 failover pair and health-check reference metadata
DNS TEST ANSWER UNSUPPORTED 404 An error occurred (404) when calling the TestDNSAnswer operation: Not Found
```

👉 AMI copy ka naya ID Region-specific hai — DR launch template mein wahi ID chahiye. Koi EC2 boot nahi hua.
Encrypted copy ke liye asli AWS mein destination Region ki KMS key chahiye. CRR config save hua par object Hyderabad
bucket mein nahi gaya. DNS ka `INSYNC` turant metadata hai — koi public DNS query, health probe, cache expiry ya live
traffic switch nahi hua; `TestDNSAnswer` 404 deta hai. Probe documentation IPs (192.0.2.x) use karta hai.

## ex5 — asli host restore aur missing order

Python ka built-in SQLite memory mein do TEST orders likhta hai, ek asli snapshot copy leta hai, phir teesra order
accept karta hai. Snapshot ko ek alag DB mein restore karke accepted IDs se compare karta hai. Clock values ek
synthetic event timeline hain; `host_restore_seconds` sirf is laptop ka copy time hai aur har run mein badalta hai.

```text
HOST SQLITE RESTORE {"accepted": [["TEST-23-1", 8000], ["TEST-23-2", 8060], ["TEST-23-3", 8120]], "recovered": [["TEST-23-1", 8000], ["TEST-23-2", 8060]], "missing": ["TEST-23-3"], "recovery_point_age_s": 120, ...}
PASS 10 actual host SQLite backup/restore reconciles missing accepted ID; synthetic event clock, not AWS/PostgreSQL RTO/RPO
```

👉 Restore successful hai, phir bhi ek accepted order (`TEST-23-3`) gayab hai — recovery point ke baad aaya tha.
RPO ka asli matlab yahi hai: aakhri usable point ke baad ka data reconcile karna padta hai. Host SQLite restore AWS
ya PostgreSQL ki speed ka proof nahi hai.

## Cleanup aur emulator limits

Script sirf apne banaye objects saaf karta hai: DNS records/zone/health check, buckets ke saare versions, dono AMIs,
replica/restored/source DBs, snapshot, plan, vaults aur role. Phir server stop karke socket band hone ka check.

```text
BEHAVIOR CHECKS 10
PASS 11 own backup/DB/AMI/DNS/bucket/role fixtures cleaned
OWNED MOTO STOPPED / LISTENER CLOSED
```

**Emulator limits (Moto 5.2.4, is run mein dekhe):** `CreateBackupSelection` 500 NotImplemented, `StartBackupJob`
404, promotion ke baad source link bacha rehta hai, CRR object replicate nahi karta, `TestDNSAnswer` 404, DNS change
turant `INSYNC`. Unexpected API errors par script fail hota hai — sirf in jaane-pehchaane 404/500 ko "unsupported"
maana jaata hai.

**Abhi bhi unproven:** AWS Backup scheduling/jobs/copies/restore, IAM aur KMS enforcement, WORM behaviour, SQL data,
replica lag aur promotion timing, AMI boot, asli CRR/RTC, health probes aur DNS caches, ARC/DRS, app fencing,
failover/failback aur tumhara asli RTO/RPO. Real-AWS drill ke liye alag approval aur cost review chahiye. Docker
install hone par bhi in cheezon ka runtime proof is lab ka claim nahi hai.
