# 🧪 Lab 01 — First contact: main kaun hoon, kahan hoon, aur bill kahan se aaya?

Level: 🌱 Beginner → ☁️ Cloud 101

Teen exercises. Har exercise ek sawal ka jawab **asli `aws` CLI** se deti hai.
Emulator (Moto) laptop par chalta hai — bill $0.

```bash
cd aws-gurukul/docker-labs
# Docker hai toh neeche ./start-moto.sh ki jagah docker compose up -d chalao.
./start-moto.sh             # Docker nahi hai toh (sirf Python chahiye)
source env.sh               # ab `aws` laptop wale emulator se baat karega
cd 01-first-contact
```

Neeche jo output likha hai woh **19 November 2026 ke run** ka hai (Moto 5.2.4, AWS CLI 1.46.2).
Bucket ka suffix, instance IDs aur timestamps tumhare run mein alag honge — baaki shape wahi rahega.

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
👉 Is Moto run mein Mumbai ke 3 AZ dikhe. AWS mein Mumbai ka AZ naam sab accounts mein ek hi jagah dikhata hai.
Kuch purane Regions mein November 2025 se pehle bane accounts ki mapping alag ho sakti hai. Do accounts mein jagah milane ke liye AZ ID dekho. [AWS ka AZ ID guide](https://docs.aws.amazon.com/global-infrastructure/latest/regions/az-ids.html)

---

## ex2-first-bucket — pehli bucket, pehli file

```bash
BUCKET="shopkaro-assets-$(date +%s)-$RANDOM"
aws s3 mb "s3://$BUCKET"
aws s3 cp hello.txt "s3://$BUCKET/"
aws s3 ls "s3://$BUCKET/"
aws s3api get-bucket-location --bucket "$BUCKET"
```

Asli output:

```
make_bucket: shopkaro-assets-1795111884-8753
upload: ./hello.txt to s3://shopkaro-assets-1795111884-8753/hello.txt
2026-11-19 13:11:25         15 hello.txt
{
    "LocationConstraint": "ap-south-1"
}
```

👉 Is command se bani general purpose bucket ka naam AWS ki us partition ke shared namespace mein unique hona chahiye. Suffix se ek naya naam milta hai. [S3 bucket names](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)
👉 Bucket **ek region** mein rehti hai (`ap-south-1`). `aws s3 ls` saari buckets dikhata hai, par har bucket ka data
apne Region mein rehta hai. Doosre Region mein copy banane ke liye alag se transfer ya replication chahiye.

---

## ex3-invisible-bill — "bill aaya, par EC2 dikh hi nahi raha"

Asli kahani: intern ne testing ke liye 3 `t3.large` launch kiye, par console ka region **N. Virginia (us-east-1)**
chhoda hua tha. Team Mumbai region dekhti rahi — "koi instance nahi hai" — aur mahine ke end mein bill aaya.

Pehle galti dobara banao:

```bash
AMI=$(aws ec2 describe-images --region us-east-1 --owners amazon --query 'Images[0].ImageId' --output text)
LAUNCH=$(aws ec2 run-instances --region us-east-1 --image-id "$AMI" --instance-type t3.large --count 3 \
  --query 'Instances[].[InstanceId,State.Name]' --output text)
printf '%s\n' "$LAUNCH"
```

Ab team ki tarah dhoondo:

```bash
aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId' --output text     # default region
aws ec2 describe-instances --region us-east-1 \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]' --output table
```

Asli output:

```
i-4d20db4a66d576f4f	pending
i-88698430c3cfccd63	pending
i-7b4c36f7f796d5b18	pending
------------------------------------------------
|               DescribeInstances              |
+----------------------+------------+----------+
|  i-4d20db4a66d576f4f |  t3.large  |  running |
|  i-88698430c3cfccd63 |  t3.large  |  running |
|  i-7b4c36f7f796d5b18 |  t3.large  |  running |
+----------------------+------------+----------+
```

Mumbai ki list is run mein khaali thi. Upar ki table us-east-1 ki hai.

Har region scan karne ka loop (yeh loop yaad rakho — asli account audit mein kaam aata hai):

```bash
for r in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do
  if n=$(aws ec2 describe-instances --region "$r" --filters Name=instance-state-name,Values=running \
      --query 'length(Reservations[].Instances[])' --output text); then
    if (( n > 0 )); then echo "$r: $n running"; fi
  else
    echo "$r ka count nahi mila." >&2
  fi
done
```

Is saaf Moto emulator par chale loop ka output:

```
us-east-1: 3 running
```

Saaf karo. Bash ki list mein sirf isi run ki teen IDs rakho.

```bash
mapfile -t INSTANCE_IDS < <(awk 'NF {print $1}' <<< "$LAUNCH")
aws ec2 terminate-instances --region us-east-1 --instance-ids "${INSTANCE_IDS[@]}" \
  --query 'TerminatingInstances[].[InstanceId,PreviousState.Name,CurrentState.Name]' --output text
```

```
i-4d20db4a66d576f4f	running	shutting-down
i-88698430c3cfccd63	running	shutting-down
i-7b4c36f7f796d5b18	running	shutting-down
```

👉 Yeh EC2 command chune hue Region ke instances dikhaati hai. Khaali list mile toh Region check karo.
👉 Asli account mein $10 ka budget alert laga sakte ho. Kharcha badhne aur email aane ke beech der ho sakti hai. [AWS Budgets guide](https://docs.aws.amazon.com/cost-management/latest/userguide/bcm-lite-use-budget.html)
👉 Company apne member accounts mein kuch Regions ka istemaal rokne ke liye **Service Control Policy** (SCP) laga sakti hai.

---

Apni file aur bucket bhi hatao.

```bash
aws s3 rm "s3://$BUCKET/hello.txt"
aws s3 rb "s3://$BUCKET"
```
