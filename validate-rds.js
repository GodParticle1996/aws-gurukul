#!/usr/bin/env node
// RDS state and recovery regressions; no service calls.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const DIR = __dirname, source = fs.readFileSync(path.join(DIR, 'validate.js'), 'utf8');
const manifest = name => [...source.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/'([^']+\.js)'/g)].map(m => m[1]);
const ENGINE = manifest('ENGINE'), DATA = manifest('DATA'), ALL = [...ENGINE, ...DATA, 'app.js'];
const head = source.slice(source.indexOf('let FAIL = 0;'), source.indexOf('/* ================= 1. SYNTAX'));
const { mkSandbox, mkNode } = new Function('fs', 'path', 'vm', 'DIR', 'ENGINE', 'DATA', 'ALL', head + '\nreturn {mkSandbox,mkNode};')(fs, path, vm, DIR, ENGINE, DATA, ALL);
const sb = mkSandbox(false), AG = vm.runInContext('AG', sb);
const crashes = []; sb.console.error = (...args) => crashes.push(args.join(' '));
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function run(stage, commands) {
  let state, done = 0;
  const trace = [], arena = mkNode('div');
  const wrapped = { ...stage, success(s) { state = s; return stage.success(s); } };
  AG.renderers.terminal(wrapped, arena, () => done++);
  const terminal = arena._kids.find(k => k._cls.has('terminal'));
  const input = terminal.querySelector('input'), output = terminal.querySelector('.term-out');
  for (const command of commands) {
    input.value = command;
    input.fire('keydown', { key: 'Enter', preventDefault() {} });
    trace.push(done);
  }
  return { state, trace, done, text: output._kids.map(k => k.textContent).join('\n'), arena };
}
const level = AG.findLevel('rds'), mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.find(q => q.terminal).terminal;
const commands = [...mission.hints];
check(level.steps.length === 8 && level.cards.length === 8, 'eight lesson cards and flashcards');
check(level.stages.map(s => s.type).join(',') === 'dryrun,flowlab,bins,order,triage,terminal,docker,quiz', 'required stage order');
check(run(mission, commands).trace.join(',') === '0,0,0,0,0,1', 'HA/backup/replica mission requires final availability waiter');
for (let i = 0; i < commands.length; i++) check(!run(mission, commands.filter((_, j) => j !== i)).done, 'cannot omit mission action ' + i);
check(run(interview, interview.hints).trace.join(',') === '0,1', 'restore mission waits for new target');
for (let i = 0; i < interview.hints.length; i++) check(!run(interview, interview.hints.filter((_, j) => i !== j)).done, 'cannot omit restore action ' + i);
const probe = { ...mission, success: () => false };
const inspect = (cmds, account) => run({ ...probe, ...(account ? { account } : {}) }, cmds);
const main = r => r.state.account.rds.find(x => x.id === 'prod-db');
let r = inspect([commands[0]]);
check(!main(r).multiAZ && main(r).state === 'modifying' && main(r).pending.MultiAZ, 'modify creates pending state, no premature available HA');
r = inspect([commands[0].replace(' --apply-immediately', ''), commands[1]]);
check(!main(r).multiAZ && main(r).pending.MultiAZ, 'availability waiter does not apply scheduled maintenance changes');
r = inspect([commands[0], commands[1]]);
check(main(r).state === 'available' && main(r).multiAZ && main(r).backupRetention === 7, 'waiter settles immediate changes');
for (const command of [
  'aws rds modify-db-instance --db-instance-identifier prod-db --backup-retention-period NaN',
  'aws rds modify-db-instance --db-instance-identifier prod-db --backup-retention-period -1',
  'aws rds modify-db-instance --db-instance-identifier prod-db --backup-retention-period 36',
  'aws rds modify-db-instance --db-instance-identifier prod-db --backup-retention-period 3.5',
  'aws rds modify-db-instance --db-instance-identifier prod-db --multi-az true',
  'aws rds modify-db-instance --db-instance-identifier prod-db --multi-az --no-multi-az',
  'aws rds modify-db-instance --db-instance-identifier prod-db --storage-encrypted',
  'aws rds modify-db-instance --db-instance-identifier prod-db --allocated-storage 10',
  'aws rds modify-db-instance --db-instance-identifier prod-db --max-allocated-storage 10',
]) {
  const q = inspect([command]);
  check(main(q).state === 'available' && !main(q).multiAZ && !main(q).pending, 'invalid modify fails atomically: ' + command);
  check(/Invalid|error:|Unknown options/.test(q.text), 'invalid modify has useful error');
}
r = inspect([commands[2], commands[2]]);
check(r.state.account.dbSnapshots.length === 1 && /DBSnapshotAlreadyExists/.test(r.text), 'snapshots persist, duplicate IDs rejected');
r = inspect([commands[0], commands[2]]);
check(!r.state.account.dbSnapshots?.length && /InvalidDBInstanceState/.test(r.text), 'snapshot cannot skip pending source change');
r = inspect([commands[4]]);
check(r.state.account.rds.length === 1 && /enable automated backups/.test(r.text), 'replica source needs backups');
r = inspect([...commands, commands[4]]);
check(r.state.account.rds.length === 2 && /DBInstanceAlreadyExists/.test(r.text), 'replica duplicate rejected');
r = inspect([...commands.slice(0, 2), 'aws rds delete-db-instance --db-instance-identifier prod-db --skip-final-snapshot']);
check(r.state.account.rds.length === 1 && /protected/.test(r.text), 'deletion protection enforced');
const restoreWrong = 'aws rds restore-db-instance-from-db-snapshot --db-instance-identifier prod-db --db-snapshot-identifier catalog-safe';
check(!run(interview, [restoreWrong]).done, 'restore cannot overwrite original DB');
r = inspect([restoreWrong], interview.account);
check(r.state.account.rds.length === 1 && /NEW instance/.test(r.text), 'restore existing identifier error explains new target');
r = inspect(interview.hints, interview.account);
check(main(r).id === 'prod-db' && r.state.account.rds.some(x => x.id === 'catalog-recovered' && x.restoredFrom === 'catalog-safe'), 'restore keeps source and new target');
for (const command of [
  'aws rds describe-db-instances --db-instance-identifier missing',
  'aws rds describe-db-snapshots --db-snapshot-identifier missing',
  'aws rds restore-db-instance-from-db-snapshot --db-instance-identifier recovered --db-snapshot-identifier missing',
  'aws rds create-db-instance-read-replica --db-instance-identifier report --source-db-instance-identifier missing',
  'aws rds wait db-instance-available --db-instance-identifier missing',
  'aws rds wait db-snapshot-available --db-snapshot-identifier missing',
]) {
  const q = inspect([command]); check(/NotFound/.test(q.text) && q.state.account.rds.length === 1, 'missing lookup does not create resources');
}
for (const command of ['', ' ', 'sudo aws rds describe-db-instances', 'AWS RDS DESCRIBE-DB-INSTANCES', 'aws rds',
  'aws rds wait', 'aws rds wait unknown', 'aws rds modify-db-instance', 'aws rds create-db-snapshot',
  'aws rds restore-db-instance-from-db-snapshot', 'aws rds delete-db-snapshot', 'aws rds create-db-instance-read-replica',
  'aws rds describe-db-instances --db-instance-identifier "unterminated']) {
  const q = inspect(['help', command]); check(!q.done && !q.text.includes('simulator error:'), 'garbage does not crash: ' + command);
}
// Plausible shortcuts must leave real goal state unsatisfied.
for (const cmds of [
  ['aws rds describe-db-instances', 'aws rds describe-db-snapshots'],
  [commands[0].replace(' --apply-immediately', ''), ...commands.slice(1)],
  ['aws rds wait db-instance-available --db-instance-identifier prod-db'],
  ['aws rds delete-db-instance --db-instance-identifier prod-db --skip-final-snapshot', ...commands],
]) check(!run(mission, cmds).done, 'shortcut cannot win');
const flow = level.stages.find(s => s.type === 'flowlab');
for (const n of level.stages[0].nodes) {
  const half = Math.max(180, Math.round(84 + n.label.length * 12.4)) / 2;
  check(n.x - half >= 0 && n.x + half <= 1000 && n.y >= 33 && n.y <= 487, 'diagram node stays inside SVG: ' + n.id);
}
let states = 0;
for (let replicas = 0; replicas <= 3; replicas++) for (let offload = 0; offload <= 100; offload += 25) {
  for (let fastApply = 0; fastApply <= 1; fastApply++) for (let criticalPrimary = 0; criticalPrimary <= 1; criticalPrimary++) {
    const k = { replicas, offload, fastApply, criticalPrimary }, m = flow.model(k); states++;
    check(m.verdict.ok === flow.check(k), 'reader model/check agree');
    check(!JSON.stringify(m).includes('NaN') && m.readouts.every(x => x.value !== Infinity), 'readouts do not expose Infinity/NaN');
    if (!criticalPrimary || !fastApply || replicas < 2) check(!flow.check(k), 'capacity/freshness shortcut rejected');
  }
}
check(flow.check({ replicas: 2, offload: 75, fastApply: 1, criticalPrimary: 1 }), 'documented reader solution wins');
check(!run(mission, ['help']).done && !mission.account.rds[0].multiAZ, 'mission replay resets state');
check(!crashes.length, 'no swallowed engine exceptions: ' + crashes.join('\n'));
console.log(`✅ ${checks} RDS regression checks passed (pending state, backups/replicas/restore, omitted actions, ${states} reader states).`);
