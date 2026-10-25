# 🪣 Lab 04 — S3: galti wapas lo, private file ek customer ko do, aur bill saaf rakho

Level: 🌱 Beginner → 🪣 S3

Chaar exercises:

1. `ex1-versioning-undo` — intern ne photo overwrite ki, phir kisi ne delete ki. Versioning se dono galtiyan wapas.
2. `ex2-presigned-invoice` — private invoice sirf us customer ko, 5 minute ke link se
3. `ex3-sse-kms` — invoices bucket par KMS key se default encryption (+ Bucket Key)
4. `ex4-lifecycle` — purane versions aur adhoore uploads apne aap saaf (warna versioning ka bill badhta rehta hai)

```bash
cd aws-gurukul/docker-labs
./start-moto.sh            # ya: docker compose up -d
source env.sh
cd 04-s3-safety
```

Output **asli run** ka hai (Moto 5.2.4, aws-cli 1.46). Version IDs tumhare run mein alag honge.

> Emulator ki seemayein (honest): Moto **Block Public Access ko enforce nahi karta** aur bina signature ki request ko
> bhi file de deta hai. Asli S3 mein private bucket par unsigned request = `403 AccessDenied`, expire hua presigned
> link = `403`, aur Block Public Access ON hone par public bucket policy lagti hi nahi. Public access wala hissa app
> ki live lab aur simulator mein hai. Asli S3 har nayi bucket par default SSE-S3 encryption dikhata hai — Moto nahi.

---

## ex1-versioning-undo — overwrite aur delete, dono wapas

```bash
aws s3 mb s3://shopkaro-product-images
aws s3api put-bucket-versioning --bucket shopkaro-product-images --versioning-configuration Status=Enabled
aws s3 cp kurta-red.jpg       s3://shopkaro-product-images/images/kurta-red.jpg     # asli photo (v1)
aws s3 cp kurta-red-wrong.jpg s3://shopkaro-product-images/images/kurta-red.jpg     # intern ki galti (v2)
aws s3 cp s3://shopkaro-product-images/images/kurta-red.jpg -
aws s3 rm s3://shopkaro-product-images/images/kurta-red.jpg                          # delete
aws s3 ls s3://shopkaro-product-images/images/
aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/kurta-red.jpg \
  --query '[Versions[].{Id:VersionId,Latest:IsLatest,Size:Size}, DeleteMarkers[].{Id:VersionId,Latest:IsLatest}]'
```

Asli output:

```
upload: ./kurta-red.jpg to s3://shopkaro-product-images/images/kurta-red.jpg
upload: ./kurta-red-wrong.jpg to s3://shopkaro-product-images/images/kurta-red.jpg
WRONG IMAGE — intern ne galti se upload ki
delete: s3://shopkaro-product-images/images/kurta-red.jpg
                                                     ← ls khaali: photo "gayab"
[
    [
        { "Id": "88238470-76b6-401d-8ab5-4616a8203465", "Latest": false, "Size": 45 },   ← v2 (galat)
        { "Id": "bdb15366-4b36-4c68-ae8c-699e49344fbc", "Latest": false, "Size": 30 }    ← v1 (asli)
    ],
    [
        { "Id": "b89a5af4-2056-4ad0-933e-ef3932285ecf", "Latest": true }                 ← DELETE MARKER
    ]
]
```

👉 Versioning on bucket mein `delete` file mitata nahi — sabse upar ek **delete marker** rakh deta hai. Dono versions
pade hain.

Ab dono galtiyan ek-ek karke ulto:

```bash
DM=$(aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/kurta-red.jpg \
      --query 'DeleteMarkers[0].VersionId' --output text)
aws s3api delete-object --bucket shopkaro-product-images --key images/kurta-red.jpg --version-id $DM   # marker hatao
aws s3 cp s3://shopkaro-product-images/images/kurta-red.jpg -

BAD=$(aws s3api list-object-versions --bucket shopkaro-product-images --prefix images/kurta-red.jpg \
      --query 'Versions[?IsLatest].VersionId' --output text)
aws s3api delete-object --bucket shopkaro-product-images --key images/kurta-red.jpg --version-id $BAD  # galat version hatao
aws s3 cp s3://shopkaro-product-images/images/kurta-red.jpg -
```

Asli output:

```
{ "VersionId": "b89a5af4-2056-4ad0-933e-ef3932285ecf" }
WRONG IMAGE — intern ne galti se upload ki          ← marker hata, par sabse naya version toh galat wala hai
{ "VersionId": "88238470-76b6-401d-8ab5-4616a8203465" }
red kurta — asli photo (v1)                         ← ab asli photo wapas ✅
```

👉 **Delete marker hatana** = delete ulta. **Specific version-id delete karna** = woh version hamesha ke liye gaya
(isliye galat version hatane mein kaam aaya — aur isliye attacker ke liye bhi khatarnak hai).
👉 Attacker bhi version-id se delete kar sakta hai. Asli bachav: **MFA Delete** ya **S3 Object Lock** (WORM —
retention tak koi delete nahi kar sakta, root bhi nahi in compliance mode) + doosre account mein backup.
👉 IAM level ki kahani: attacker ne bucket khaali ki thi, aur versioning off thi — isliye kuch wapas nahi aaya.

---

## ex2-presigned-invoice — private file, 5 minute ka link

Invoices alag bucket mein (images ke saath kabhi nahi). Bucket private. Customer ko app ek **presigned URL** deti hai:

```bash
aws s3 mb s3://shopkaro-invoices
aws s3 cp INV-10231.pdf s3://shopkaro-invoices/2026/10/INV-10231.pdf
URL=$(aws s3 presign s3://shopkaro-invoices/2026/10/INV-10231.pdf --expires-in 300)
echo "$URL" | tr '?&' '\n\n'
curl -s "$URL"
```

Asli output:

```
http://127.0.0.1:4566/shopkaro-invoices/2026/10/INV-10231.pdf
X-Amz-Algorithm=AWS4-HMAC-SHA256
X-Amz-Credential=...
X-Amz-Date=20261024T002528Z
X-Amz-Expires=300                 ← 300 second baad link bekaar
X-Amz-SignedHeaders=host
X-Amz-Signature=...               ← URL badla (jaise INV-10232 kiya) toh signature match nahi → 403
INVOICE 10231 — Priya Sharma, Jaipur — Rs 2,499
```

👉 Link un credentials ki **permission** se sign hota hai jinhone banaya — app ke role ke paas `s3:GetObject` hona
chahiye. Role credentials expire hue toh link bhi pehle hi mar jaata hai.
👉 Customer ko bucket ki koi permission nahi chahiye, AWS account nahi chahiye — sirf link.
👉 Sequential naam (INV-10231, INV-10232) + public bucket = koi bhi doosre ka invoice padh le. Presigned URL mein
naam badalne se signature toot jaata hai.

---

## ex3-sse-kms — invoices apni KMS key se

```bash
KEY=$(aws kms create-key --description "shopkaro invoices" --query KeyMetadata.KeyId --output text)
aws s3api put-bucket-encryption --bucket shopkaro-invoices --server-side-encryption-configuration \
  "{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"$KEY\"},\"BucketKeyEnabled\":true}]}"
aws s3 cp INV-10231.pdf s3://shopkaro-invoices/2026/10/INV-10232.pdf
aws s3api head-object --bucket shopkaro-invoices --key 2026/10/INV-10232.pdf --query '{SSE:ServerSideEncryption,BucketKey:BucketKeyEnabled}'
```

```
{
    "SSE": "aws:kms",
    "BucketKey": true
}
```

👉 SSE-S3 (default) bhi encrypt karta hai. SSE-KMS tab jab chahiye: key policy se control (kaun decrypt kar sakta
hai), har decrypt ka CloudTrail audit, key disable karke data "band". **Bucket Key** KMS ke API calls (aur bill) ko
bahut kam kar deta hai.

---

## ex4-lifecycle — versioning ka chhupa bill saaf

Versioning har overwrite ki purani copy rakhta hai — har copy ka storage bill. `lifecycle.json`:

- `images/` ke purane (noncurrent) versions 30 din baad delete
- 7 din se adhoore multipart uploads saaf (yeh bhi chupchaap bill hote hain)

```bash
aws s3api put-bucket-lifecycle-configuration --bucket shopkaro-product-images --lifecycle-configuration file://lifecycle.json
aws s3api get-bucket-lifecycle-configuration --bucket shopkaro-product-images --query 'Rules[].[ID,Status]' --output text
```

```
purane-versions-30-din-baad-saaf	Enabled
adhoore-uploads-saaf	Enabled
```

👉 Versioning on karo → saath mein noncurrent-version lifecycle bhi lagao. 30 din = galti pakadne ka time, phir safai.

---

Saaf karke niklo: `../reset.sh`
