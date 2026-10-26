#!/usr/bin/env bash
source "$(dirname "$0")/lab-env.sh"
source .lab/resources.sh
if [ -n "${AP:-}" ]; then aws efs delete-access-point --access-point-id "$AP"; fi
for mt in "${MT_A:-}" "${MT_B:-}" "${MT_C:-}"; do
 if [ -n "$mt" ]; then aws efs delete-mount-target --mount-target-id "$mt"; fi
done
for fs in "${FS:-}" "${ELASTIC_FS:-}"; do
 if [ -n "$fs" ]; then aws efs delete-file-system --file-system-id "$fs"; fi
done
for sg in "${EFS_SG:-}" "${WRONG_SG:-}" "${APP_SG:-}"; do
 if [ -n "$sg" ]; then aws ec2 delete-security-group --group-id "$sg"; fi
done
for subnet in "${SUB_A:-}" "${SUB_B:-}" "${SUB_C:-}"; do
 if [ -n "$subnet" ]; then aws ec2 delete-subnet --subnet-id "$subnet"; fi
done
if [ -n "${VPC:-}" ]; then aws ec2 delete-vpc --vpc-id "$VPC"; fi
aws efs describe-file-systems --query "FileSystems[?CreationToken=='$TOKEN-burst'||CreationToken=='$TOKEN-elastic'].FileSystemId"
aws ec2 describe-vpcs --filters "Name=vpc-id,Values=${VPC:-vpc-no-match}" --query 'Vpcs[].VpcId'
mv .lab/resources.sh .lab/last-cleaned-resources.sh
