# Lab13 — shared storage ki configuration inspect aur repair karo

**Pain:** ShopKaro seller admin ko shared Linux uploads folder chahiye. Teen AZs ki app ke liye do targets aur wrong SG attachments mile. NFS port rule, SG attachment, throughput aur application identity alag decisions hain.

**Local scope:** existing Moto5.2.4, one owned VPC, three subnets, three SGs, two EFS metadata fixtures and one access point. **No NFS server, mounted share, actual files, TLS/IAM/POSIX enforcement, throughput measurement or lifecycle ageing.** Runtime evidence requires approved AWS sandbox; metadata readback alone successful mount ka proof nahi.

## Setup

```bash
cd aws-gurukul/docker-labs
# Existing Moto ho toh launcher skip karo.
./start-moto.sh
source env.sh
cd 13-efs-shared-storage
bash setup.sh
source .lab/resources.sh
```

Scripts require loopback4566 and dummy test/test. Credentials/config lab-local; profiles unset, metadata disabled. Partial setup IDs saved in `.lab/resources.sh`; cleanup only saved resources. Shared reset mat chalao.

Asli captured setup output (generated IDs vary):

```json
{"Mode":"bursting","Encrypted":true,"Mounts":2}
[
  {"AZ":"ap-south-1a","State":"available"},
  {"AZ":"ap-south-1b","State":"available"}
]
```

## ex1 — target SG aur NFS rule repair

Read `exercises.sh`, then run all three exercises:

```bash
bash exercises.sh
source .lab/resources.sh
aws efs describe-mount-target-security-groups --mount-target-id "$MT_A"
aws ec2 describe-security-groups --group-ids "$EFS_SG"
aws efs describe-mount-targets --file-system-id "$FS"
```

Script authorizes inbound TCP2049 from `APP_SG`, replaces both old target SG lists, creates third target with `EFS_SG`, then inspects state. **SG rule without SG attachment does not repair the path.** Captured target states after repair:

```json
[
  {"AZ":"ap-south-1a","State":"available"},
  {"AZ":"ap-south-1b","State":"available"},
  {"AZ":"ap-south-1c","State":"available"}
]
```

Actual duplicate target probe returned `MountTargetConflict: mount target already exists in this AZ`. One target per **AZ**, not every subnet. In AWS, normal regional DNS expects local-AZ target; deliberate cross-AZ IP/DNS access can work with routes/rules, but adds cost and a dependency on another AZ. Missing local target is not an absolute ban on all cross-AZ mounting.

## ex2 — throughput update limitation aur valid Archive configuration

The script stores IA30 on the original Bursting file system. Real command:

```bash
aws efs update-file-system --file-system-id "$FS" --throughput-mode elastic
```

Captured Moto result:

```text
An error occurred (500) when calling the UpdateFileSystem operation (reached max retries: 0)
```

Original mode readback stayed `"bursting"`. Script therefore creates a **separate** file system with `--throughput-mode elastic` at creation. `ELASTIC_FS` readback contains `ThroughputMode: elastic`. Archive belongs to the Elastic fixture:

```bash
aws efs describe-lifecycle-configuration --file-system-id "$ELASTIC_FS"
```

Asli output:

```json
{"LifecyclePolicies":[
  {"TransitionToIA":"AFTER_30_DAYS"},
  {"TransitionToArchive":"AFTER_90_DAYS"},
  {"TransitionToPrimaryStorageClass":"AFTER_1_ACCESS"}
]}
```

Each policy object has one transition. Archive needs Elastic/General Purpose and later threshold than IA. Moto also accepted invalid `AFTER_2_DAYS` in an isolated probe; **Moto acceptance does not validate AWS policy values**. Invalid probe config is not applied by repository exercises. No files actually change storage class here.

## ex3 — seller access point

Script creates `/seller`, enforces requested POSIX Uid/Gid1001 and CreationInfo owner1001/perms750. Inspect:

```bash
aws efs describe-access-points --access-point-id "$AP"
```

Captured excerpt:

```json
{"State":"available","User":{"Uid":1001,"Gid":1001},
 "Root":{"Path":"/seller","CreationInfo":{"OwnerUid":1001,"OwnerGid":1001,"Permissions":"750"}}}
```

AP SG nahi rakhta; AP mount target ki network path use karta hai. Real approved client would use EFS mount helper with `tls,iam,accesspoint=...`, correct IAM ClientMount/ClientWrite policy and POSIX permissions. Default file-system policy IAM authentication enforce nahi karti. AP metadata alone does not prove tenant isolation or write access.

## Cleanup

```bash
bash cleanup.sh
```

Script deletes AP, three saved targets, both saved file systems, owned SGs/subnets/VPC. Actual cleanup output was two empty arrays:

```json
[]
[]
```

Separate probe verified `FileSystemInUse` before target removal and `FileSystemNotFound` after scoped deletion. No shared emulator reset or unrelated resource deletion. Runtime AWS deletion can be asynchronous; these scripts target tested Moto only.

👉 **Asli baat:** API state repair and a successful multi-client file read are different evidence. In-app terminal models documented readiness transitions; Moto lab verifies only metadata APIs. Optional real-AWS homework in the level explains mounted byte comparison and billable cleanup.
