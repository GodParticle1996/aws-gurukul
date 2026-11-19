#!/usr/bin/env bash
# Lab 02 setup — "root se sirf admin banao".
# IAM emulator (port 4567) har request ki policy check karta hai. Shuru ki sirf 3 requests
# bina login ke chalti hain — bilkul naye AWS account ke root jaisi. Un 3 requests se hum
# ek admin user aur uski key banate hain; baaki saara lab admin aur ravi ke naam se chalta hai.
set -euo pipefail
cd "$(dirname "$0")"
source ../env.sh iam >/dev/null
../reset.sh iam >/dev/null
export AWS_ACCESS_KEY_ID=root AWS_SECRET_ACCESS_KEY=root
export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null
umask 077
echo "▶ (root jaisa, 1/3) admin user"; aws iam create-user --user-name admin --query User.Arn --output text
echo "▶ (root jaisa, 2/3) admin ko full policy"; aws iam put-user-policy --user-name admin --policy-name admin-full --policy-document file://policies/admin-full.json
echo "▶ (root jaisa, 3/3) admin ki access key"
read -r KEY SECRET < <(aws iam create-access-key --user-name admin --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
mkdir -p .lab
printf '[admin]\naws_access_key_id = %s\naws_secret_access_key = %s\n' "$KEY" "$SECRET" > .lab/credentials
printf '[default]\nregion = ap-south-1\n[profile admin]\nregion = ap-south-1\n' > .lab/config
chmod 600 .lab/credentials .lab/config     # keys sirf tumhare user ko padhne do (asli ~/.aws par bhi yahi)
echo "✅ admin ready. Ab: source lab-env.sh"
