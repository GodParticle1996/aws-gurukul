#!/usr/bin/env node
// Migration (DMS) fixture regressions (Advanced 9); offline only.
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
  for (const command of commands) { input.value = command; input.fire('keydown', { key: 'Enter', preventDefault() {} }); trace.push(done); }
  return { state, trace, done, text: output._kids.map(k => k.textContent).join('\n') };
}
const level = AG.findLevel('migration');
const mission = level.stages.find(s => s.type === 'terminal'), interview = level.interview.questions.find(q => q.terminal).terminal;
const F = AG.migrationFixtures, sol = mission.solution, isol = interview.solution;
const never = { ...mission, success: () => false };
const swap = (list, i, cmd) => list.map((c, j) => j === i ? cmd : c);
const loses = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(!r.done, label + ' loses'); return r; };
const wins = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(r.done === 1, label + ' wins: ' + r.text.slice(-900)); check(r.trace.slice(0, -1).every(n => !n), label + ' final-only'); return r; };
const errs = (label, cmds, re, stage = mission) => { const r = run(stage, cmds); check(re.test(r.text), label + ' error shown: ' + r.text.slice(-400)); check(!r.done, label + ' does not win'); return r; };

for (const stage of [mission, interview]) {
  const r = wins('intended ' + stage.title, stage.solution, stage);
  check(stage.tasks.every(t => t.check(r.state)), 'task agreement ' + stage.title);
  check(run(stage, stage.solution).done === 1, 'clean reset ' + stage.title);
}
for (let i = 1; i < sol.length; i++) loses('omission step' + i, sol.filter((_, j) => j !== i));
wins('without the optional first read', sol.slice(1));
for (let i = 1; i < isol.length; i++) loses('interview omission step' + i, isol.filter((_, j) => j !== i), interview);

const RI_CMD = 1, EP = 3, TASK_CMD = 7;
loses('public replication instance', swap(sol, RI_CMD, sol[RI_CMD].replace(' --no-publicly-accessible', '')));
loses('wrong instance class', swap(sol, RI_CMD, sol[RI_CMD].replace('dms.r6i.large', 'dms.t3.medium')));
errs('unknown subnet group', [swap(sol, RI_CMD, sol[RI_CMD].replace('godam-private', 'nope'))[RI_CMD]], /ReplicationSubnetGroup|subnet group/i);
errs('test-connection before instance available', [sol[1], sol[3], sol[4]], /InvalidResourceStateFault/);
loses('target with plain password', swap(sol, EP, 'aws dms create-endpoint --endpoint-identifier godam-aurora --endpoint-type target --engine-name aurora-postgresql --server-name aurora.cluster.example --port 5432 --database-name shop --username dms --password TEST'));
errs('secret plus password together', [swap(sol, EP, sol[EP] + ' --username dms --password x')[EP]], /InvalidParameterCombinationException/);
{
  const r = run(mission, swap(sol, EP, sol[EP].replace('--database-name shop', '--database-name orders')));
  check(!r.done && /does not exist/.test(r.text), 'wrong database name: connection waiter fails and mission loses');
}
loses('mapping with AUDIT_TMP', swap(sol, TASK_CMD, sol[TASK_CMD].replace('mappings-orders.json', 'mappings-all.json')));
loses('full-load only task', swap(sol, TASK_CMD, sol[TASK_CMD].replace('full-load-and-cdc', 'full-load')));
loses('task without validation settings', swap(sol, TASK_CMD, sol[TASK_CMD].replace(' --replication-task-settings file://task-settings.json', '')));
errs('start before connections tested', [...sol.slice(0, 4), sol[7], sol[8], sol[9]], /test-connection/);
errs('start before ready', [...sol.slice(0, 8), sol[9]], /InvalidResourceStateFault/);
errs('start-replication twice', [...sol, 'aws dms stop-replication-task --replication-task-arn ' + F.TASK, sol[9]], /resume-processing ya reload-target/, never);
errs('start while running', [...sol, sol[9]], /running hai/, never);
loses('stale statistics read before running', [...sol.slice(0, 9), sol[11], sol[9], sol[10]]);
errs('bad migration type', [...sol.slice(0, 7), sol[TASK_CMD].replace('full-load-and-cdc', 'everything')], /migration-type/);
errs('mapping selecting nothing', ['aws dms create-replication-task --replication-task-identifier x --source-endpoint-arn ' + F.SRC + ' --target-endpoint-arn ' + F.SRC + ' --replication-instance-arn nope --migration-type cdc --table-mappings \'{"rules":[]}\''], /could not be found|selection rule/);
errs('unknown flag', ['aws dms create-replication-instance --replication-instance-identifier x --instance-class dms.t3.medium'], /Unknown options/);

/* interview wrong paths */
loses('resume-processing instead of reload-target', swap(isol, 2, isol[2].replace('reload-target', 'resume-processing')), interview);
errs('start-replication again', [isol[1], isol[2].replace('reload-target', 'start-replication')], /resume-processing ya reload-target/, interview);
loses('new task instead of fixing', ['aws dms create-replication-task --replication-task-identifier godam-orders-cdc --source-endpoint-arn ' + F.SRC + ' --target-endpoint-arn ' + F.TGT + ' --replication-instance-arn ' + F.RI + ' --migration-type cdc --table-mappings file://mappings-orders.json --replication-task-settings file://task-settings.json', ...isol.slice(2)], interview);

/* selection rules engine */
const a = F.seed();
check(JSON.stringify(AG.dmsSelected(a, JSON.parse(F.FILES['mappings-orders.json'].content)).sort()) === JSON.stringify(['SHOP.CUSTOMERS', 'SHOP.ORDERS', 'SHOP.ORDER_ITEMS']), 'exclude rule drops AUDIT_TMP');
check(AG.dmsSelected(a, JSON.parse(F.FILES['mappings-all.json'].content)).length === 4, 'include-all selects four tables');
check(AG.dmsSelected(a, 'not json') === null, 'bad mapping JSON is rejected');

/* flowlab */
const flow = level.stages.find(s => s.type === 'flowlab');
let states = 0, winners = 0;
for (let link = 0; link < 3; link++) for (let window = 0; window < 2; window++) for (let util = 30; util <= 90; util += 10) {
  const k = { link, window, util }, r = AG.migrationTransferPlan(k);
  states++; check(flow.check(k) === r.ok && flow.model(k).verdict.ok === r.ok && Number.isFinite(r.total), 'flowlab verdict agrees');
  if (r.ok) winners++;
}
const init = Object.fromEntries(flow.knobs.map(k => [k.id, k.value]));
check(states === 42 && winners === 1 && !flow.check(init) && flow.check({ link: 1, window: 1, util: 40 }), `flowlab ${winners}/${states}: only 1 Gbps, 24 h, 40% fits`);

/* MCQ bias and positions */
const qs = [];
for (const st of level.stages) { if (st.questions) qs.push(...st.questions); if (st.observe) qs.push(st.observe); for (const step of st.steps || []) if (step.ask) qs.push(step.ask); }
qs.push(...level.interview.questions.filter(q => q.choices));
let flagged = 0; const positions = [0, 0, 0, 0];
for (const q of qs) {
  positions[q.answer]++;
  const n = q.choices.map(x => x.length), r = n[q.answer], wrong = n.filter((_, i) => i !== q.answer);
  if (r >= 1.15 * Math.max(...wrong) || r <= .85 * Math.min(...wrong)) { flagged++; console.log('BIAS', q.q, n); }
  check(q.explain.length > 80, 'meaningful explanation: ' + q.q);
}
check(flagged === 0, 'length flags ' + flagged + '/' + qs.length);
check(Math.max(...positions) - Math.min(...positions) <= 1, 'positions ' + positions);
check(!crashes.length, 'no console errors ' + crashes.join('; '));
console.log(`   ✓ ${checks} migration checks · ${states} transfer states/${winners} fit · ${qs.length} MCQs (0 length flags; positions ${positions.join(',')})`);
