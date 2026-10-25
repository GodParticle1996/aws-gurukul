# 🧪 Lab 01 — First contact: main kaun hoon, kahan hoon, aur bill kahan se aaya?

Level: 🌱 Beginner → ☁️ Cloud 101

Teen exercises. Har exercise ek sawal ka jawab **asli `aws` CLI** se deti hai.
Emulator (Moto) laptop par chalta hai — bill $0.

```bash
cd aws-gurukul/docker-labs
docker compose up -d        # Docker hai toh
./start-moto.sh             # Docker nahi hai toh (sirf Python chahiye)
source env.sh               # ab `aws` laptop wale emulator se baat karega
cd 01-first-contact
```

Neeche jo output likha hai woh **asli run** ka hai (Moto 5.2.4, aws-cli 1.46).
Instance IDs aur timestamps tumhare run mein alag honge — baaki shape wahi rahega.

---

## ex1-who-where — main kaun hoon, kis region mein hoon?

Har AWS kaam se pehle do sawal: **kaunsi identity** se command chal rahi hai, aur **kaunse region** mein.
Galat account ya galat region = sabse common beginner galti.

```bash
aws sts get-caller-identity
aws configure list
aws ec2 describe-availability-zones --query 'AvailabilityZones[].[ZoneName,ZoneId,State]' --output table
```

Asli output:

```
{
    "UserId": "AKIAIOSFODNN7EXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:user/moto"
}
      Name                    Value             Type    Location
      ----                    -----             ----    --------
   profile                <not set>             None    None
access_key     ****************test              env
secret_key     ****************test              env
    region               ap-south-1              env    AWS_DEFAULT_REGION
------------------------------------------
|        DescribeAvailabilityZones       |
+-------------+------------+-------------+
|  ap-south-1a|  aps1-az1  |  available  |
|  ap-south-1b|  aps1-az3  |  available  |
|  ap-south-1c|  aps1-az2  |  available  |
+-------------+------------+-------------+
```

👉 **ARN** (`arn:aws:sts::123456789012:user/moto`) poori identity hai: partition · service · account · kaun.
👉 Mumbai (`ap-south-1`) mein **3 AZs**. Dhyaan do: `ap-south-1b` ka ZoneId `aps1-az3` hai.
AWS har account mein AZ ke **naam** shuffle karta hai — tumhara `ap-south-1a` aur mere account ka
`ap-south-1a` alag physical building ho sakti hai. **ZoneId** (`aps1-az1`) physical zone ka pakka naam hai.
Do accounts ke beech "same AZ" chahiye (latency, cost) toh ZoneId milao, naam nahi.

---

## ex2-first-bucket — pehli bucket, pehli file

```bash
aws s3 mb s3://shopkaro-assets-<tumhara-naam>
aws s3 cp hello.txt s3://shopkaro-assets-<tumhara-naam>/
aws s3 ls s3://shopkaro-assets-<tumhara-naam>/
aws s3api get-bucket-location --bucket shopkaro-assets-<tumhara-naam>
```

Asli output:

```
make_bucket: shopkaro-assets-neha
upload: ./hello.txt to s3://shopkaro-assets-neha/hello.txt
2026-10-23 19:51:56         15 hello.txt
{
    "LocationConstraint": "ap-south-1"
}
```

👉 Bucket ka naam **duniya bhar mein unique** hota hai (asli AWS par `test` naam kabhi nahi milega) — isliye naam mein
apna naam/company jodo.
👉 Bucket **ek region** mein rehti hai (`ap-south-1`). `aws s3 ls` saari buckets dikhata hai, par har bucket ka data
apne region mein hi pada hai.

---

## ex3-invisible-bill — "bill aaya, par EC2 dikh hi nahi raha"

Asli kahani: intern ne testing ke liye 3 `t3.large` launch kiye, par console ka region **N. Virginia (us-east-1)**
chhoda hua tha. Team Mumbai region dekhti rahi — "koi instance nahi hai" — aur mahine ke end mein bill aaya.

Pehle galti dobara banao:

```bash
AMI=$(aws ec2 describe-images --region us-east-1 --owners amazon --query 'Images[0].ImageId' --output text)
aws ec2 run-instances --region us-east-1 --image-id $AMI --instance-type t3.large --count 3 \
  --query 'Instances[].[InstanceId,State.Name]' --output text
```

Ab team ki tarah dhoondo:

```bash
aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId' --output text     # default region
aws ec2 describe-instances --region us-east-1 \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]' --output table
```

Asli output:

```
i-55a139a20eb92a99c	pending
i-33a0749506f3d9817	pending
i-9fef9bff287deb89d	pending
                                                  ← default region (ap-south-1): kuch nahi!
------------------------------------------------
|               DescribeInstances              |
+----------------------+------------+----------+
|  i-55a139a20eb92a99c |  t3.large  |  running |
|  i-33a0749506f3d9817 |  t3.large  |  running |
|  i-9fef9bff287deb89d |  t3.large  |  running |
+----------------------+------------+----------+
```

Har region scan karne ka loop (yeh loop yaad rakho — asli account audit mein kaam aata hai):

```bash
for r in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do
  n=$(aws ec2 describe-instances --region $r --filters Name=instance-state-name,Values=running \
      --query 'length(Reservations[].Instances[])' --output text 2>/dev/null)
  [ -n "$n" ] && [ "$n" != "0" ] && echo "$r: $n running"
done
```

Asli output (38 regions, ~19 second):

```
us-east-1: 3 running
```

Saaf karo:

```bash
aws ec2 terminate-instances --region us-east-1 --instance-ids <teeno ids> \
  --query 'TerminatingInstances[].[InstanceId,PreviousState.Name,CurrentState.Name]' --output text
```

```
i-55a139a20eb92a99c	running	shutting-down
i-33a0749506f3d9817	running	shutting-down
i-9fef9bff287deb89d	running	shutting-down
```

👉 **Console aur CLI dono sirf ek region dikhate hain.** "Kuch nahi chal raha" bolne se pehle region check karo.
👉 Asli account mein day 1 par **AWS Budgets alarm** lagao (e.g. $10) — bill aane se pehle email aa jayega.
👉 Bade setups mein Organizations ka **SCP** un regions ko block kar deta hai jahan company kaam nahi karti.

---

Saaf karke niklo: `../reset.sh` (emulator ka saara state saaf).
