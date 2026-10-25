# 🔐 Lab 02 — IAM: root se admin, admin se least privilege, aur Deny hamesha jeetta hai

Level: 🌱 Beginner → 🔐 IAM

Is lab ka emulator **sach mein har request ki IAM policy check karta hai** (port 4567).
Policy mein permission nahi = asli AWS jaisa `AccessDenied`. Chaar exercises:

1. `ex1-root-to-admin` — naye account mein root se sirf ek admin banao
2. `ex2-least-privilege` — group + policy se ravi ko sirf reports padhne do, phir khud deny hote dekho
3. `ex3-deny-wins` — kisi ne galti se `s3:*` de diya; explicit Deny phir bhi prod backups bachata hai
4. `ex4-role-temp-creds` — role assume karke temporary (`ASIA…`) credentials, jo khud expire hote hain

```bash
cd aws-gurukul/docker-labs
./start-moto.sh iam          # ya: docker compose up -d   (dono emulators chalu)
cd 02-iam-least-privilege
./setup.sh                   # ex1 — har baar fresh account
source lab-env.sh            # profiles is lab ke .lab/ folder mein — tumhari ~/.aws ko haath nahi lagta
```

Neeche ka output **asli run** ka hai (Moto 5.2.4, aws-cli 1.46). Keys aur timestamps tumhare run mein alag honge.

---

## ex1-root-to-admin — root se sirf ek kaam: admin banana

Naya AWS account = sirf **root user**, jiske paas har power hai (billing, account close, sab).
Root se roz kaam karna = master key jeb mein le ke ghoomna. `setup.sh` wahi karta hai jo asli account mein day 1 par
karna chahiye: root se ek **admin** banao, phir root ko taale mein band karo.

```
▶ (root jaisa, 1/3) admin user
arn:aws:iam::123456789012:user/admin
▶ (root jaisa, 2/3) admin ko full policy
▶ (root jaisa, 3/3) admin ki access key
✅ admin ready. Ab: source lab-env.sh
```

```bash
aws sts get-caller-identity --query Arn --output text
```
```
arn:aws:iam::123456789012:user/admin
```

👉 Emulator ne sirf pehli 3 requests bina login ke chalne di. Ab har request kisi identity ke naam se aur us identity
ki policy ke hisaab se chalti hai.
👉 Asli account mein: root par **MFA**, root ki **access keys nahi**, aur insaanon ke liye **IAM Identity Center**
(ya chhote setup mein IAM user + MFA).

---

## ex2-least-privilege — ravi sirf reports padhe, aur kuch nahi

Admin ke naam se do buckets aur ek file banao, phir `developers` group + read-only policy:

```bash
aws s3 mb s3://shopkaro-reports
aws s3 mb s3://shopkaro-prod-backups
aws s3 cp q3.csv s3://shopkaro-reports/q3.csv
aws iam create-group --group-name developers
aws iam put-group-policy --group-name developers --policy-name reports-read \
  --policy-document file://policies/reports-read.json
aws iam create-user --user-name ravi
aws iam add-user-to-group --user-name ravi --group-name developers
read -r K S < <(aws iam create-access-key --user-name ravi --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
aws configure set aws_access_key_id $K --profile ravi
aws configure set aws_secret_access_key $S --profile ravi
```

`policies/reports-read.json` mein teen statements hain — har ek ka kaam alag:

| Sid | Action | Resource | Kyun alag? |
|---|---|---|---|
| SeeBucketNames | `s3:ListAllMyBuckets` | `*` | buckets ki list account-level action hai |
| ListReports | `s3:ListBucket` | `arn:aws:s3:::shopkaro-reports` | bucket ke andar list = **bucket** ka ARN (bina `/*`) |
| ReadReportFiles | `s3:GetObject` | `arn:aws:s3:::shopkaro-reports/*` | file padhna = **objects** ka ARN (`/*` ke saath) |

Ab ravi bano (`--profile ravi`) aur sab try karo:

```bash
aws sts get-caller-identity --profile ravi --query Arn --output text
aws s3 ls --profile ravi
aws s3 cp s3://shopkaro-reports/q3.csv - --profile ravi
aws s3 cp q3.csv s3://shopkaro-reports/q4.csv --profile ravi      # likhna
aws s3 rm s3://shopkaro-reports/q3.csv --profile ravi             # delete
aws s3 ls s3://shopkaro-prod-backups/ --profile ravi              # doosri bucket
aws iam list-users --profile ravi                                 # IAM
```

Asli output:

```
arn:aws:iam::123456789012:user/ravi
2026-10-23 20:04:08 shopkaro-reports
2026-10-23 20:04:08 shopkaro-prod-backups
q3 sales: 4,12,000
upload failed: ./q3.csv to s3://shopkaro-reports/q4.csv An error occurred (AccessDenied) when calling the PutObject operation: Access Denied
delete failed: s3://shopkaro-reports/q3.csv An error occurred (AccessDenied) when calling the DeleteObject operation: Access Denied
An error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied
An error occurred (AccessDenied) when calling the ListUsers operation: User: arn:aws:iam::123456789012:user/ravi is not authorized to perform: iam:ListUsers
```

👉 Policy mein jo **nahi likha**, woh **deny** hai (implicit deny). Ravi ke paas sirf 3 actions hain — baaki sab band.
👉 Ravi ki key leak ho jaaye toh attacker sirf reports padh sakta hai. Yahi least privilege ka asli fayda: **blast radius chhota**.

---

## ex3-deny-wins — kisi ne galti se `s3:*` de diya

Admin galti se ravi ko `s3:*` on `*` de deta hai (sabse common real-world galti — "abhi ke liye full de do, baad mein
theek karenge"):

```bash
aws iam put-user-policy --user-name ravi --policy-name oops-s3-full --policy-document file://policies/oops-s3-full.json
aws s3 cp q3.csv s3://shopkaro-reports/q4.csv --profile ravi
aws s3 ls s3://shopkaro-prod-backups/ --profile ravi
```
```
upload: ./q3.csv to s3://shopkaro-reports/q4.csv
                                     ← prod-backups ki listing bhi chal gayi (khaali bucket, par access mil gaya!)
```

Ab group par ek **explicit Deny** lagao (`policies/deny-prod-backups.json`) — ravi ki `s3:*` Allow ko haath lagaye bina:

```bash
aws iam put-group-policy --group-name developers --policy-name deny-prod-backups \
  --policy-document file://policies/deny-prod-backups.json
aws s3 ls s3://shopkaro-prod-backups/ --profile ravi
```
```
An error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied
```

👉 AWS ka faisla: (1) shuru mein sab **deny**, (2) kahin **Allow** mila toh allow, (3) par kahin bhi **explicit Deny**
mila toh **Deny** — chahe kitne bhi Allow hon. Explicit Deny = guardrail jo galat Allow ko bhi rok deta hai.

Saaf karo: `aws iam delete-user-policy --user-name ravi --policy-name oops-s3-full`

---

## ex4-role-temp-creds — role: koi permanent key nahi

Ravi ko kabhi-kabhi reports **likhne** bhi hain. Ravi ki permanent key ko likhne ki power dene ke bajaye ek **role**
banao. Role ki do policies hoti hain:

- **Trust policy** (`policies/trust-ravi.json`) — *kaun* is role ko pehen sakta hai (sirf ravi)
- **Permission policy** (`policies/reports-writer.json`) — role pehen ke *kya* kar sakte ho (reports par Get + Put, delete nahi)

```bash
aws iam create-role --role-name reports-writer --assume-role-policy-document file://policies/trust-ravi.json \
  --max-session-duration 3600
aws iam put-role-policy --role-name reports-writer --policy-name write-reports \
  --policy-document file://policies/reports-writer.json
aws iam put-user-policy --user-name ravi --policy-name may-assume --policy-document file://policies/ravi-may-assume.json
```

(Teesri command ravi ki taraf ki permission hai: "ravi `sts:AssumeRole` kar sakta hai". Doosre account ka role ho toh
**dono taraf** ki permission zaroori hoti hai — isliye yahan bhi dono rakhte hain.)

Ab ravi role assume kare aur temporary credentials se kaam kare:

```bash
read -r AK SK ST < <(aws sts assume-role --role-arn arn:aws:iam::123456789012:role/reports-writer \
  --role-session-name ravi-upload --profile ravi \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text)
echo "temporary key: $AK   (session token: ${#ST} characters)"

( export AWS_ACCESS_KEY_ID=$AK AWS_SECRET_ACCESS_KEY=$SK AWS_SESSION_TOKEN=$ST; unset AWS_PROFILE
  aws sts get-caller-identity --query Arn --output text
  aws s3 cp q3.csv s3://shopkaro-reports/q4.csv
  aws s3 rm s3://shopkaro-reports/q3.csv )
```

Asli output:

```
temporary key: ASIARZPUZDIKLLDSVE3Z   (session token: 356 characters)
arn:aws:sts::123456789012:assumed-role/reports-writer/ravi-upload
upload: ./q3.csv to s3://shopkaro-reports/q4.csv
delete failed: s3://shopkaro-reports/q3.csv An error occurred (AccessDenied) when calling the DeleteObject operation: Access Denied
```

Aur koi aur (jo trust policy mein nahi hai) role pehenne ki koshish kare:

```bash
aws iam create-user --user-name freelancer
read -r K S < <(aws iam create-access-key --user-name freelancer --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
aws configure set aws_access_key_id $K --profile freelancer; aws configure set aws_secret_access_key $S --profile freelancer
aws sts assume-role --role-arn arn:aws:iam::123456789012:role/reports-writer --role-session-name sneaky --profile freelancer
```
```
An error occurred (AccessDenied) when calling the AssumeRole operation: User: arn:aws:iam::123456789012:user/freelancer is not authorized to perform: sts:AssumeRole
```

👉 **`AKIA…`** = permanent key (IAM user). **`ASIA…`** = temporary key + session token (role) — khud expire hoti hai
(default 1 ghanta). Leak hui temporary key ki umar ghanton mein hai, permanent key ki mahinon mein.
👉 EC2, Lambda, ECS par app ko kabhi key file mat do — instance profile / execution role yahi temporary credentials
apne aap deta aur rotate karta hai.
👉 Roz ke kaam mein role pehenne ke liye `~/.aws/config` mein **role profile** banate hain — CLI khud assume karta hai:

```ini
[profile writer]
role_arn = arn:aws:iam::123456789012:role/reports-writer
source_profile = ravi
```

(Is lab mein role profile nahi chalaya kyunki CLI temporary credentials `~/.aws/cli/cache` mein cache karta hai —
emulator reset ke baad purane cached credentials galat ho jaate hain.)

---

Saaf karke niklo: `../reset.sh iam`
