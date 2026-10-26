#!/usr/bin/env bash
source "$(dirname "$0")/lab-env.sh"
source .lab/resources.sh
save() { for key in TOKEN VPC SUB_A SUB_B SUB_C APP_SG EFS_SG WRONG_SG FS ELASTIC_FS MT_A MT_B MT_C AP; do printf 'export %s=%q\n' "$key" "${!key:-}"; done > .lab/resources.sh; }
trap save EXIT
# ex1: SG attachment and SG rule are separate state.
aws efs describe-mount-target-security-groups --mount-target-id "$MT_A"
aws ec2 authorize-security-group-ingress --group-id "$EFS_SG" --protocol tcp --port 2049 --source-group "$APP_SG"
aws efs modify-mount-target-security-groups --mount-target-id "$MT_A" --security-groups "$EFS_SG"
aws efs modify-mount-target-security-groups --mount-target-id "$MT_B" --security-groups "$EFS_SG"
MT_C=$(aws efs create-mount-target --file-system-id "$FS" --subnet-id "$SUB_C" --security-groups "$EFS_SG" --query MountTargetId --output text)
aws efs describe-mount-target-security-groups --mount-target-id "$MT_A"
aws ec2 describe-security-groups --group-ids "$EFS_SG" --query 'SecurityGroups[0].IpPermissions'
aws efs describe-mount-targets --file-system-id "$FS" --query 'MountTargets[].{AZ:AvailabilityZoneName,State:LifeCycleState}'
# ex2: API supports IA metadata; no real files or ageing in Moto.
aws efs put-lifecycle-configuration --file-system-id "$FS" --lifecycle-policies '[{"TransitionToIA":"AFTER_30_DAYS"}]'
if aws efs update-file-system --file-system-id "$FS" --throughput-mode elastic; then
 echo 'Update API succeeded; inspect mode before Archive.'
else
 echo 'Moto5.2.4 UpdateFileSystem unsupported (500); original remains bursting. Create separate Elastic metadata fixture.'
fi
aws efs describe-file-systems --file-system-id "$FS" --query 'FileSystems[0].ThroughputMode'
ELASTIC_FS=$(aws efs create-file-system --creation-token "$TOKEN-elastic" --encrypted --performance-mode generalPurpose --throughput-mode elastic --query FileSystemId --output text)
aws efs put-lifecycle-configuration --file-system-id "$ELASTIC_FS" --lifecycle-policies file://lifecycle.json
aws efs describe-lifecycle-configuration --file-system-id "$ELASTIC_FS"
# ex3: An application entry point, not another mount target / proof of POSIX enforcement.
AP=$(aws efs create-access-point --file-system-id "$FS" --client-token "$TOKEN-seller" --posix-user Uid=1001,Gid=1001 --root-directory 'Path=/seller,CreationInfo={OwnerUid=1001,OwnerGid=1001,Permissions=750}' --query AccessPointId --output text)
aws efs describe-access-points --access-point-id "$AP" --query 'AccessPoints[0].{State:LifeCycleState,User:PosixUser,Root:RootDirectory}'
