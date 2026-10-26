#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[ "${AWS_ENDPOINT_URL:-}" = http://127.0.0.1:4566 ] && [ "${AWS_ACCESS_KEY_ID:-}" = test ] && [ "${AWS_SECRET_ACCESS_KEY:-}" = test ] || { echo 'Existing loopback Moto + dummy test/test keys required'; exit 1; }
mkdir -p .lab
export AWS_SHARED_CREDENTIALS_FILE="$PWD/.lab/credentials" AWS_CONFIG_FILE="$PWD/.lab/config" AWS_EC2_METADATA_DISABLED=true AWS_MAX_ATTEMPTS=1 AWS_PAGER=''
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN
