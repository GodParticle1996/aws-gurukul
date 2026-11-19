#!/usr/bin/env python3
"""Run the local, Docker-free Bash steps of one lab README in order, in one shell.

Why this exists: a lab can pass `node validate.js` and still be broken for a learner (a wrong path, a placeholder,
a command the emulator rejects). The log includes commands, output, intermediate failures and the final shell status.

    cd aws-gurukul/docker-labs
    ./start-moto.sh && ./start-moto.sh iam          # labs that use the shared emulator
    ./reset.sh && python3 run-readme.py 06-rds-recovery /tmp/06.log
    START_DIR=.. python3 run-readme.py 21-wellarch-risk-scan /tmp/21.log   # labs written "from aws-gurukul"

Notes:
  * A bash block marked <!-- run-readme: docker-only --> is skipped together with its preparation and cleanup.
  * `docker ...`, `cd docker-labs` and `cd aws-gurukul/docker-labs` lines are skipped (the runner already starts there); `<tumhara-naam>` becomes `neha`.
    Any other <placeholder> is left as is, so that command fails loudly — read the log.
  * Terraform labs need terraform on PATH. With the provider already cached in some .terraform/providers folder,
    point TF_CLI_CONFIG_FILE at a file with `provider_installation { filesystem_mirror { path = "..." } }`
    and set TF_CLI_ARGS_apply=-auto-approve TF_CLI_ARGS_destroy=-auto-approve.
  * An `An error occurred` line is not automatically a bug: several labs show AccessDenied or a documented Moto gap
    on purpose. Compare the log with the README's "Asli output".
"""
import os, re, shlex, signal, subprocess, sys

if len(sys.argv) != 3:
    sys.exit(__doc__)
root = os.path.dirname(os.path.abspath(__file__))
lab, out = sys.argv[1], sys.argv[2]
text = open(os.path.join(root, lab, 'README.md'), encoding='utf-8').read()
start = os.path.abspath(os.path.join(root, os.environ.get('START_DIR', '.')))
script = [
    'export PS4="\\n+ $ "', 'set -E',
    'trap \'echo "<<< command exit=$? line=$LINENO" >&2\' ERR', 'set -x',
]
heading, in_bash, n = '(top)', False, 0
skip_block = False
for line in text.split('\n'):
    if line.strip() == '<!-- run-readme: docker-only -->':
        skip_block = True
        continue
    if line.startswith('```bash'):
        n += 1
        if skip_block:
            script.append("echo " + shlex.quote("SKIPPED Docker-only block %d — %s" % (n, heading)))
            continue
        in_bash = True
        script.append("set +x; echo; echo " + shlex.quote("######## block %d — %s" % (n, heading)) + "; set -x")
        continue
    if line.startswith('```'):
        in_bash = False; skip_block = False; continue
    if not in_bash:
        m = re.match(r'#{2,3} (.*)', line)
        if m: heading = m.group(1)
        continue
    if re.match(r'\s*(docker |cd (aws-gurukul/)?docker-labs\s*$)', line):
        script.append(': SKIPPED ' + re.sub(r'[^A-Za-z0-9 ._/-]', '', line)); continue
    script.append(line.replace('<tumhara-naam>', 'neha'))
with open(out + '.sh', 'w', encoding='utf-8') as f:
    f.write('\n'.join(script) + '\n')
with open(out, 'w', encoding='utf-8') as f:
    proc = subprocess.Popen(['bash', os.path.abspath(out + '.sh')], cwd=start,
                            stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                            start_new_session=True)
    try:
        status = proc.wait(timeout=int(os.environ.get('LAB_TIMEOUT', '1200')))
    except subprocess.TimeoutExpired:
        # Timed-out CLI commands should stop along with the shell that started them.
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
        f.write('\n!!! TIMEOUT\n')
        status = 124
    f.write('\n<<< exit=%s\n' % status)
print('log: %s  (commands: %s.sh)' % (out, out))
sys.exit(status)
