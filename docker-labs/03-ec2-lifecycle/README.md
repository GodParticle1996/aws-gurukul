# 🖥️ Lab 03 — EC2: sahi launch, aur server ke saath kya marta hai, kya bachta hai

Level: 🌱 Beginner → 🖥️ EC2

Chaar exercises:

1. `ex1-launch-right` — port 22 ke bina security group, IMDSv2 required, user data, tags
2. `ex2-stop-start-ip` — stop/start par public IP badalta hai, private IP nahi
3. `ex3-terminate-what-dies` — terminate par root disk marti hai, data volume + snapshot bachte hain
4. `ex4-sg-audit` — account mein "port 22 duniya ke liye khula" wale security groups dhoondo aur band karo

```bash
cd aws-gurukul/docker-labs
./start-moto.sh            # ya: docker compose up -d
source env.sh
cd 03-ec2-lifecycle
```

Output **asli run** ka hai (Moto 5.2.4, aws-cli 1.46). IDs aur IPs tumhare run mein alag honge.

> Emulator ki seema: instances "chalte" hain par andar OS nahi — SSH/curl nahi hoga, user data execute nahi hota
> (sirf store hota hai). Elastic IP ka stop/start behaviour emulator sahi nahi dikhata, isliye woh hissa app ke
> dry run mein hai.

---

## ex1-launch-right — launch ke waqt hi 3 galtiyan band

```bash
AMI=$(aws ec2 describe-images --owners amazon --query 'Images[0].ImageId' --output text)
SG=$(aws ec2 create-security-group --group-name shopkaro-web --description "ShopKaro web - sirf HTTPS" \
      --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 443 --cidr 0.0.0.0/0 \
  --query 'SecurityGroupRules[].[IpProtocol,FromPort,ToPort,CidrIpv4]' --output text

I=$(aws ec2 run-instances --image-id $AMI --instance-type t3.micro --security-group-ids $SG \
      --metadata-options HttpTokens=required,HttpEndpoint=enabled \
      --user-data file://userdata.sh \
      --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-1},{Key=owner,Value=ravi}]' \
      --query 'Instances[0].InstanceId' --output text)

aws ec2 describe-instances --instance-ids $I --query 'Reservations[0].Instances[0].{State:State.Name,Type:InstanceType,AZ:Placement.AvailabilityZone,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,IMDS:MetadataOptions.HttpTokens}'
```

Asli output:

```
tcp	443	443	0.0.0.0/0
{
    "State": "running",
    "Type": "t3.micro",
    "AZ": "ap-south-1a",
    "PublicIp": "54.214.153.144",
    "PrivateIp": "10.160.17.71",
    "IMDS": "required"
}
```

👉 **Port 22 khola hi nahi.** Server par shell chahiye toh SSM Session Manager (koi inbound port nahi, IAM se control,
har session log). Asli AWS par iske liye instance par `AmazonSSMManagedInstanceCore` wala role chahiye.
👉 **`HttpTokens=required` = IMDSv2.** Server ke andar se `169.254.169.254` (instance metadata) ab sirf session token
ke saath jawab deta hai. Capital One (2019) mein attacker ne app ke SSRF bug se metadata ko seedha GET bhej ke role
credentials churaye the — IMDSv2 wahi raasta band karta hai.
👉 **User data** (`userdata.sh`) pehli boot par ek baar chalta hai — nginx install, page likhna. Asli server par
yahi tareeka "har naya server khud taiyaar ho" ka hai.
👉 **Tags** (`owner=ravi`) — lab 01 ke "invisible bill" mein sabse pehla sawal yahi tha: yeh server kiska hai?

---

## ex2-stop-start-ip — public IP kiraye ka hai

```bash
aws ec2 stop-instances --instance-ids $I --query 'StoppingInstances[0].[PreviousState.Name,CurrentState.Name]' --output text
aws ec2 describe-instances --instance-ids $I --query 'Reservations[0].Instances[0].[State.Name,PublicIpAddress,PrivateIpAddress]' --output text
aws ec2 start-instances --instance-ids $I --query 'StartingInstances[0].CurrentState.Name' --output text
aws ec2 describe-instances --instance-ids $I --query 'Reservations[0].Instances[0].[State.Name,PublicIpAddress,PrivateIpAddress]' --output text
```

Asli output:

```
running	stopping
stopped	None	10.160.17.71
pending
running	54.214.130.115	10.160.17.71
```

👉 Public IP `54.214.153.144` → stop par **None** → start par **naya** `54.214.130.115`. Private IP wahi.
Agar `shopkaro.in` ka DNS purane IP par point karta, toh site start ke baad bhi band dikhti.
👉 Fix: production mein users ke saamne **load balancer** (DNS naam stable) — ya kam se kam **Elastic IP**
(stop/start mein saath rehta hai). Dhyaan do: 2024 se har public IPv4 (Elastic IP bhi) ka ~$0.005/ghanta lagta hai,
aur bina instance ke pada Elastic IP bhi bill hota hai.

---

## ex3-terminate-what-dies — root disk marti hai, data volume bachta hai

```bash
AZ=$(aws ec2 describe-instances --instance-ids $I --query 'Reservations[0].Instances[0].Placement.AvailabilityZone' --output text)
V=$(aws ec2 create-volume --availability-zone $AZ --size 20 --volume-type gp3 \
      --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=catalog-data}]' --query VolumeId --output text)
aws ec2 attach-volume --volume-id $V --instance-id $I --device /dev/sdf --query State --output text
aws ec2 describe-instances --instance-ids $I \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[].[DeviceName,Ebs.VolumeId,Ebs.DeleteOnTermination]' --output text
SNAP=$(aws ec2 create-snapshot --volume-id $V --description "catalog backup before cleanup" --query SnapshotId --output text)
aws ec2 terminate-instances --instance-ids $I --query 'TerminatingInstances[0].[PreviousState.Name,CurrentState.Name]' --output text
aws ec2 describe-volumes --query 'Volumes[].[VolumeId,Size,VolumeType,State]' --output text
aws ec2 describe-snapshots --filters Name=volume-id,Values=$V --query 'Snapshots[].[SnapshotId,VolumeId,VolumeSize,State]' --output text
```

Asli output:

```
attaching
/dev/sda1	vol-a193029fffc0efa1c	True        ← root disk: DeleteOnTermination = True
/dev/sdf	vol-d13dfb14608cb7617	False       ← data disk: False
running	shutting-down
vol-d13dfb14608cb7617	20	gp3	available   ← sirf data disk bacha; root disk gayab
snap-4140b7234bff39769	vol-d13dfb14608cb7617	20	completed
```

Snapshot se **doosre AZ** mein naya volume (EBS volume ek AZ mein bandha hota hai; snapshot poore region ka):

```bash
NEWV=$(aws ec2 create-volume --availability-zone ap-south-1b --snapshot-id $SNAP --volume-type gp3 --query VolumeId --output text)
aws ec2 describe-volumes --volume-ids $NEWV --query 'Volumes[0].[VolumeId,AvailabilityZone,SnapshotId,State]' --output text
```
```
vol-507ab29d3d0e90ee1	ap-south-1b	snap-4140b7234bff39769	available
```

👉 Root volume ka `DeleteOnTermination` default **True** hai. ShopKaro ka catalog root disk par tha — test server
terminate kiya, catalog gaya. Database/data hamesha alag volume (ya RDS) par, aur snapshot schedule (AWS Backup /
Data Lifecycle Manager).
👉 EBS volume ek AZ mein rehta hai. AZ badalna = snapshot → naye AZ mein volume.

---

## ex4-sg-audit — "port 22 duniya ke liye khula" dhoondo

```bash
BAD=$(aws ec2 create-security-group --group-name old-admin-sg --description "kisi ne 2024 mein banaya tha" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $BAD --protocol tcp --port 22 --cidr 0.0.0.0/0 --query 'Return' --output text

aws ec2 describe-security-groups \
  --filters Name=ip-permission.from-port,Values=22 Name=ip-permission.cidr,Values=0.0.0.0/0 \
  --query 'SecurityGroups[].[GroupId,GroupName,Description]' --output text
aws ec2 revoke-security-group-ingress --group-id $BAD --protocol tcp --port 22 --cidr 0.0.0.0/0 --query 'Return' --output text
aws ec2 describe-security-groups \
  --filters Name=ip-permission.from-port,Values=22 Name=ip-permission.cidr,Values=0.0.0.0/0 \
  --query 'SecurityGroups[].GroupId' --output text
```

Asli output:

```
True
sg-26ed3cf66308f71a7	old-admin-sg	kisi ne 2024 mein banaya tha
True
                                          ← doosri baar: kuch nahi mila ✅
```

👉 Yeh filter wala command asli accounts ke audit mein seedha kaam aata hai (3389 = RDP ke liye bhi chalao).
👉 Internet par khule SSH ports par bots din-raat password try karte hain. Rule: 22/3389 kabhi `0.0.0.0/0` nahi.

---

Saaf karke niklo: `../reset.sh`
