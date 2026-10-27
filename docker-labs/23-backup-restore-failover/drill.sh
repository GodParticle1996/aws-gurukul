#!/usr/bin/env bash
set -euo pipefail
LAB23_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LAB23_ROOT="$LAB23_DIR"
while [[ ! -f "$LAB23_ROOT/index.html" || ! -d "$LAB23_ROOT/docker-labs/.venv" ]]; do
  if [[ "$LAB23_ROOT" == / ]]; then
    echo "AWS Gurukul root with docker-labs/.venv was not found" >&2
    exit 1
  fi
  LAB23_ROOT="$(dirname -- "$LAB23_ROOT")"
done
exec "$LAB23_ROOT/docker-labs/.venv/bin/python" -I "$LAB23_DIR/lab.py"
