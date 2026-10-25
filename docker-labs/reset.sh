#!/usr/bin/env bash
# Emulator ka saara state saaf — lab dobara shuru se.
#   ./reset.sh        → normal emulator (4566)
#   ./reset.sh iam    → IAM emulator (4567): state saaf + pehle 3 bina-auth requests wapas (admin bootstrap ke liye)
if [ "${1:-}" = "iam" ]; then URL=http://127.0.0.1:4567; else URL="${AWS_ENDPOINT_URL:-http://127.0.0.1:4566}"; fi
curl -s -X POST "$URL/moto-api/reset" >/dev/null || { echo "❌ emulator nahi mila ($URL)"; exit 1; }
case "$URL" in *4567*) curl -s -X POST -H 'Content-Type: text/plain' "$URL/moto-api/reset-auth" -d 3 >/dev/null ;; esac
echo "🧹 emulator reset ($URL) — sab resources gayab"
