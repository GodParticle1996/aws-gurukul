#!/usr/bin/env bash
# Sirf isi folder ke start-moto.sh se chalu hue emulators band karo.
cd "$(dirname "$0")" || exit 1
for mode in main iam; do
  file=".moto-$mode.pid"
  [[ -f $file ]] || continue
  pid=$(cat "$file")
  port=4566
  [[ $mode == iam ]] && port=4567
  # Purani PID kisi aur program ko mil sakti hai.
  if [[ $pid =~ ^[1-9][0-9]*$ ]]; then
    command_line=$(ps -ww -p "$pid" -o args= 2>/dev/null)
    case "$command_line" in
      *" $PWD/.venv/bin/moto_server -H 127.0.0.1 -p $port") kill "$pid" && echo "⏹ $mode band" ;;
      *" .venv/bin/moto_server -H 127.0.0.1 -p $port")
        if [[ $(readlink "/proc/$pid/cwd" 2>/dev/null) == "$PWD" ]]; then kill "$pid" && echo "⏹ $mode band"; fi ;;
    esac
  fi
  rm -f "$file"
done
