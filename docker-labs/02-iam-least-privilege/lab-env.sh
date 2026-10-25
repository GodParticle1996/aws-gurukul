# source lab-env.sh — is lab ke liye CLI profiles (admin, ravi, writer) lab ke apne files mein.
# Tumhari asli ~/.aws ko haath bhi nahi lagta.
_d="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_ENDPOINT_URL=http://127.0.0.1:4567
export AWS_SHARED_CREDENTIALS_FILE="$_d/.lab/credentials" AWS_CONFIG_FILE="$_d/.lab/config"
export AWS_PROFILE=admin AWS_DEFAULT_REGION=ap-south-1 AWS_PAGER=""
[ -x "$_d/../.venv/bin/aws" ] && export PATH="$_d/../.venv/bin:$PATH"
echo "🔐 IAM lab: aws → $AWS_ENDPOINT_URL, default profile = admin (doosra: --profile ravi / --profile writer)"
