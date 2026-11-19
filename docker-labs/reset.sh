#!/usr/bin/env bash
# Ek local Moto emulator ka saara data saaf karo.
set -eu
case "${1:-}" in
  '') URL="${AWS_ENDPOINT_URL:-http://127.0.0.1:4566}" ;;
  iam) URL=http://127.0.0.1:4567 ;;
  *) echo "Istemaal: ./reset.sh [iam]" >&2; exit 2 ;;
esac
URL=${URL%/}
if [[ ! $URL =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]]; then
  echo "Reset ke liye laptop wale Moto ka URL chahiye." >&2
  exit 1
fi
reset_request() {
  local response
  response=$(curl --noproxy '*' -fsS --max-time 15 -X POST "$@") &&
    [[ $response =~ \"status\"[[:space:]]*:[[:space:]]*\"ok\" ]]
}
reset_request "$URL/moto-api/reset" || { echo "Moto ne reset ki pushti nahi ki ($URL)." >&2; exit 1; }
if [[ $URL == *:4567 ]]; then
  reset_request -H 'Content-Type: text/plain' -d 3 "$URL/moto-api/reset-auth" ||
    { echo "Data saaf hua. IAM ka shuruati login reset nahi hua." >&2; exit 1; }
fi
echo "🧹 emulator reset ($URL) — sab resources gayab"
