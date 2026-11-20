# Lab13 — shared storage ki configuration inspect aur repair karo

**Pain:** ShopKaro ke seller admin ko shared Linux uploads folder chahiye. Teen AZs wali app ke liye sirf do targets aur galat SG attachments mile. NFS port ka rule, SG attachment, throughput aur application ki pehchaan alag-alag faisle hain.

**Local scope:** pehle se bana Moto 5.2.4, ek apna VPC, teen subnets, teen SGs, do EFS metadata fixtures aur ek access point. **Koi NFS server, mount hua share, asli files, TLS/IAM/POSIX enforcement, throughput ka naap ya lifecycle ka purana hona nahi.** Runtime saboot ke liye approved AWS sandbox chahiye; sirf metadata readback safal mount ka saboot nahi.

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

Scripts ko loopback 4566 aur dummy test/test chahiye. Credentials/config lab ki apni; profiles unset, metadata band. Adhoore setup ki IDs `.lab/resources.sh` mein save hoti hain; cleanup sirf save hue resources ka. Shared reset mat chalao.

Asli pakda setup output (bani IDs badalti hain):

```json
{"Mode":"bursting","Encrypted":true,"Mounts":2}
[
  {"AZ":"ap-south-1a","State":"available"},
  {"AZ":"ap-south-1b","State":"available"}
]
```

## ex1 — target SG aur NFS rule repair

`exercises.sh` padho, phir teeno exercises chalao:

```bash
bash exercises.sh
source .lab/resources.sh
aws efs describe-mount-target-security-groups --mount-target-id "$MT_A"
aws ec2 describe-security-groups --group-ids "$EFS_SG"
aws efs describe-mount-targets --file-system-id "$FS"
```

Script `APP_SG` se inbound TCP 2049 allow karti hai, dono purane targets ki SG lists badalti hai, `EFS_SG` ke saath teesra target banati hai, phir state dekhti hai. **SG attachment ke bina sirf SG rule raasta theek nahi karta.** Repair ke baad pakde target states:

```json
[
  {"AZ":"ap-south-1a","State":"available"},
  {"AZ":"ap-south-1b","State":"available"},
  {"AZ":"ap-south-1c","State":"available"}
]
```

Asli duplicate target probe ne `MountTargetConflict: mount target already exists in this AZ` diya. Har **AZ** mein ek target, har subnet mein nahi. AWS mein normal regional DNS local-AZ target expect karta hai; soch kar kiya cross-AZ IP/DNS access routes/rules ke saath chal sakta hai, par kharcha aur doosre AZ par dependency badhata hai. Local target na hona har cross-AZ mount par poori rok nahi.

## ex2 — throughput update ki limit aur sahi Archive config

Script purane Bursting file system par IA 30 save karti hai. Asli command:

```bash
aws efs update-file-system --file-system-id "$FS" --throughput-mode elastic
```

Captured Moto result:

```text
An error occurred (500) when calling the UpdateFileSystem operation (reached max retries: 0)
```

Purane mode ka readback `"bursting"` hi raha. Isliye script banate waqt hi `--throughput-mode elastic` ke saath ek **alag** file system banati hai. `ELASTIC_FS` readback mein `ThroughputMode: elastic` hai. Archive Elastic fixture par hi lagta hai:

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

Har policy object mein ek transition hota hai. Archive ko Elastic/General Purpose aur IA se baad ki threshold chahiye. Ek alag probe mein Moto ne galat `AFTER_2_DAYS` bhi maan liya; **Moto ka maanna AWS policy values ko validate nahi karta**. Repository exercises galat probe config nahi lagate. Yahan koi file asal mein storage class nahi badalti.

## ex3 — seller ka access point

Script `/seller` banati hai, maanga POSIX Uid/Gid 1001 aur CreationInfo owner 1001/perms 750 laagu karti hai. Dekho:

```bash
aws efs describe-access-points --access-point-id "$AP"
```

Captured excerpt:

```json
{"State":"available","User":{"Uid":1001,"Gid":1001},
 "Root":{"Path":"/seller","CreationInfo":{"OwnerUid":1001,"OwnerGid":1001,"Permissions":"750"}}}
```

AP SG nahi rakhta; AP mount target ka network raasta use karta hai. Asli approved client EFS mount helper `tls,iam,accesspoint=...` ke saath, sahi IAM ClientMount/ClientWrite policy aur POSIX permissions use karega. Default file-system policy IAM authentication laagu nahi karti. Sirf AP metadata tenant ka alag hona ya write access prove nahi karta.

## Cleanup

```bash
bash cleanup.sh
```

Script AP, teen save hue targets, dono save hue file systems aur apne SGs/subnets/VPC delete karti hai. Asli cleanup output do khaali arrays tha:

```json
[]
[]
```

Alag probe ne target hatane se pehle `FileSystemInUse` aur scoped deletion ke baad `FileSystemNotFound` check kiya. Shared emulator reset ya anjaana delete nahi. AWS mein runtime deletion async ho sakti hai; yeh scripts sirf test kiye Moto ke liye hain.

👉 **Asli baat:** API state ka repair aur kai clients ka safal file read alag saboot hain. App ka terminal likhe readiness badlav ka model hai; Moto lab sirf metadata APIs check karti hai. Level ka optional asli-AWS homework mount kiye bytes ka comparison aur bill hone wala cleanup samjhata hai.
