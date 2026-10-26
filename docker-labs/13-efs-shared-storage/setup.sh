#!/usr/bin/env bash
source "$(dirname "$0")/lab-env.sh"
[ ! -f .lab/resources.sh ] || { echo 'Clean saved lab resources first'; exit 1; }
TOKEN="lab13-$(date +%s%N)"
VPC= SUB_A= SUB_B= SUB_C= APP_SG= EFS_SG= WRONG_SG= FS= ELASTIC_FS= MT_A= MT_B= MT_C= AP=
save() { for key in TOKEN VPC SUB_A SUB_B SUB_C APP_SG EFS_SG WRONG_SG FS ELASTIC_FS MT_A MT_B MT_C AP; do printf 'export %s=%q\n' "$key" "${!key:-}"; done > .lab/resources.sh; }
trap save EXIT
VPC=$(aws ec2 create-vpc --cidr-block 10.213.0.0/16 --query Vpc.VpcId --output text)
for suffix in A B C; do
 case "$suffix" in A) az=a; octet=1;; B) az=b; octet=2;; C) az=c; octet=3;; esac
 value=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block "10.213.$octet.0/24" --availability-zone "ap-south-1$az" --query Subnet.SubnetId --output text)
 printf -v "SUB_$suffix" '%s' "$value"
done
for role in APP EFS WRONG; do
 value=$(aws ec2 create-security-group --vpc-id "$VPC" --group-name "$TOKEN-$role" --description 'Lab13 EFS metadata' --query GroupId --output text)
 printf -v "${role}_SG" '%s' "$value"
done
FS=$(aws efs create-file-system --creation-token "$TOKEN-burst" --encrypted --performance-mode generalPurpose --throughput-mode bursting --tags Key=Name,Value="$TOKEN" --query FileSystemId --output text)
MT_A=$(aws efs create-mount-target --file-system-id "$FS" --subnet-id "$SUB_A" --security-groups "$WRONG_SG" --query MountTargetId --output text)
MT_B=$(aws efs create-mount-target --file-system-id "$FS" --subnet-id "$SUB_B" --security-groups "$WRONG_SG" --query MountTargetId --output text)
aws efs describe-file-systems --file-system-id "$FS" --query 'FileSystems[0].{Mode:ThroughputMode,Encrypted:Encrypted,Mounts:NumberOfMountTargets}'
aws efs describe-mount-targets --file-system-id "$FS" --query 'MountTargets[].{AZ:AvailabilityZoneName,State:LifeCycleState}'
