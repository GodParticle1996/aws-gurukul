#!/usr/bin/env bash
# Lab 02 setup — "root se sirf admin banao".
# IAM emulator (port 4567) har request ki policy check karta hai. Shuru ki sirf 3 requests
# bina login ke chalti hain — bilkul naye AWS account ke root jaisi. Un 3 requests se hum
# ek admin user aur uski key banate hain; baaki saara lab admin aur ravi ke naam se chalta hai.
set -euo pipefail
cd "$(dirname "$0")"
URL=http://127.0.0.1:4567
curl -s "$URL/moto-api/" >/dev/null 2>&1 || { echo "❌ IAM emulator band hai. Pehle: ../start-moto.sh iam  (ya docker compose up -d)"; exit 1; }
../reset.sh iam >/dev/null
AWS="aws"; [ -x ../.venv/bin/aws ] && AWS=../.venv/bin/aws
export AWS_ENDPOINT_URL=$URL AWS_DEFAULT_REGION=ap-south-1 AWS_ACCESS_KEY_ID=root AWS_SECRET_ACCESS_KEY=root
unset AWS_PROFILE AWS_SHARED_CREDENTIALS_FILE AWS_CONFIG_FILE
echo "▶ (root jaisa, 1/3) admin user"; $AWS iam create-user --user-name admin --query User.Arn --output text
echo "▶ (root jaisa, 2/3) admin ko full policy"; $AWS iam put-user-policy --user-name admin --policy-name admin-full --policy-document file://policies/admin-full.json
echo "▶ (root jaisa, 3/3) admin ki access key"
read -r KEY SECRET < <($AWS iam create-access-key --user-name admin --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
mkdir -p .lab
printf '[admin]\naws_access_key_id = %s\naws_secret_access_key = %s\n' "$KEY" "$SECRET" > .lab/credentials
printf '[default]\nregion = ap-south-1\n[profile admin]\nregion = ap-south-1\n' > .lab/config
chmod 600 .lab/credentials .lab/config     # keys sirf tumhare user ko padhne do (asli ~/.aws par bhi yahi)
echo "✅ admin ready. Ab: source lab-env.sh"
