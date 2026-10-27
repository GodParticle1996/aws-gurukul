#!/usr/bin/env bash
set -euo pipefail
LAB21_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$LAB21_DIR/../env.sh"
# Owned fixture lifetime: seed -> scan -> repair -> scan -> cleanup.
exec "$LAB21_DIR/../.venv/bin/python" -I "$LAB21_DIR/lab.py"
