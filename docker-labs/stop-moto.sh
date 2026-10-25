#!/usr/bin/env bash
# ./start-moto.sh se chalaye emulators band karo (saara data gayab).
cd "$(dirname "$0")"
for m in main iam; do
  if [ -f ".moto-$m.pid" ]; then kill "$(cat ".moto-$m.pid")" 2>/dev/null && echo "⏹ $m band"; rm -f ".moto-$m.pid"; fi
done
