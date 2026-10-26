#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ "${AWS_ENDPOINT_URL:-}" = 'http://127.0.0.1:4566' ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] || { echo 'Loopback Moto and dummy test keys required'; exit 1; }
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
source .lab/resources.sh
python3 - <<'PY'
import json,os,subprocess
for name in ['SRC','DR','LOCK']:
 bucket=os.environ.get(name)
 if not bucket or os.environ.get(name+'_CREATED')!='true':continue
 response=json.loads(subprocess.check_output(['aws','s3api','list-object-versions','--bucket',bucket],text=True))
 for v in response.get('Versions',[])+response.get('DeleteMarkers',[]):
  # Lab creates only bypassable GOVERNANCE retention; legal hold was removed in exercises.
  subprocess.run(['aws','s3api','delete-object','--bucket',bucket,'--key',v['Key'],'--version-id',v['VersionId'],'--bypass-governance-retention'],check=True)
 subprocess.run(['aws','s3api','delete-bucket','--bucket',bucket],check=True)
PY
if [ "${ROLE_POLICY_CREATED:-false}" = true ]; then
 aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name replication
fi
if [ "${ROLE_CREATED:-false}" = true ]; then
 aws iam delete-role --role-name "$ROLE_NAME"
fi
aws s3api list-buckets --query "Buckets[?Name=='$SRC'||Name=='$DR'||Name=='$LOCK'].Name"
aws iam list-roles --query "Roles[?RoleName=='${ROLE_NAME:-}'].RoleName"
mv .lab/resources.sh .lab/last-cleaned-resources.sh
