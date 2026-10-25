#!/usr/bin/env bash
# Docker ke bina emulator chalao (sirf Python 3.9+ chahiye).
#   ./start-moto.sh        → normal emulator, port 4566
#   ./start-moto.sh iam    → IAM-enforcing emulator, port 4567
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-main}"
if [ ! -x .venv/bin/moto_server ]; then
  echo "▶ pehli baar: .venv mein moto[server] + awscli install ho rahe hain (1–2 minute)..."
  python3 -m venv .venv
  .venv/bin/pip install -q "moto[server]==5.2.4" awscli
fi
if [ "$MODE" = "iam" ]; then PORT=4567; HINT="source env.sh iam"; export INITIAL_NO_AUTH_ACTION_COUNT=3; else PORT=4566; HINT="source env.sh"; fi
if curl -s "http://127.0.0.1:$PORT/moto-api/" >/dev/null 2>&1; then
  echo "✅ emulator pehle se chal raha hai — port $PORT"; exit 0
fi
nohup .venv/bin/moto_server -H 127.0.0.1 -p "$PORT" > ".moto-$MODE.log" 2>&1 &
echo $! > ".moto-$MODE.pid"
for i in $(seq 1 20); do
  if curl -s "http://127.0.0.1:$PORT/moto-api/" >/dev/null 2>&1; then
    echo "✅ Moto chalu — http://127.0.0.1:$PORT   (agla kadam: $HINT)"; exit 0
  fi
  sleep 0.5
done
echo "❌ emulator start nahi hua — .moto-$MODE.log dekho"; exit 1
