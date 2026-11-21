#!/usr/bin/env node
// Regional checkout drill. Run the real terminal renderer in the offline validator sandbox.
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
const level = AG.findLevel('finalboss');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;
const { keyId, primary, standby, keyArn } = AG.regionDrill;
const sol = mission.solution;
const reads = [
  'aws kms describe-key --key-id ' + keyId + ' --region ' + standby,
  'aws secretsmanager describe-secret --secret-id shopkaro/checkout --region ' + standby,
  'aws autoscaling describe-auto-scaling-groups --region ' + standby,
  'aws route53 list-resource-record-sets --hosted-zone-id ZSHOP32',
  'aws cloudwatch describe-alarms --region ' + standby
];
for (const stage of [mission, interview]) {
  for (let replay = 0; replay < 2; replay++) {
    const r = run(stage, stage.solution);
    check(r.done === 1 && r.trace.slice(0, -1).every(n => n === 0), 'wins on last command: ' + r.text.slice(-900));
    check(stage.tasks.every(task => task.check(r.state)), 'checklist matches win');
  }
  check(!run(stage, reads).done, 'reads alone cannot win');
  for (let i = 0; i < stage.solution.length; i++) {
    check(!run(stage, stage.solution.filter((_, j) => j !== i)).done, 'required step ' + i);
  }
}
check(!run(interview, [interview.solution[0].replace('/ready', '/ping'), interview.solution[1]]).done, 'process-only probe cannot win');
check(!run(interview, [interview.solution[0], interview.solution[1].replace(standby, primary)]).done, 'repair the standby alarm in place');
const open = { ...mission, success: () => false };
function inspect(commands) { return run(open, commands); }
for (const [command, expected] of [
  [sol[0].replace(keyId, '12345678-1234-4000-8000-000000000032'), 'UnsupportedOperationException'],
  [sol[0].replace('--replica-region ' + standby, '--replica-region ' + primary), 'ValidationException'],
  [sol[0].replace('--region ' + primary, '--region ' + standby), 'NotFoundException'],
  [sol[0].replace('--replica-region ' + standby, ''), 'required'],
  [sol[0] + ' --replica-now true', 'Unknown'],
  [sol[1], 'replica KMS key unavailable'],
  [sol[2].replace(standby, primary), 'group not found'],
  [sol[2].replace('--min-size 3', '--min-size 7'), 'ValidationError'],
  [sol[6].replace('alarm.json', 'missing.json'), 'Unable to load'],
]) {
  const r = inspect([command]);
  check(r.text.includes(expected), command + '\n' + r.text);
  check(JSON.stringify(r.state.account.regionDrill) === JSON.stringify(mission.account.regionDrill), 'rejected before mutation');
}
const all = inspect([...sol, ...reads]);
check(all.text.includes(keyArn(standby)) && all.text.includes('"PrimaryRegion": "' + primary + '"'), 'regional key and secret readback');
check(all.text.includes('"MinSize": 3') && all.text.includes('"MetricName": "FailedOrders"'), 'capacity and alarm readback');
const again = inspect([...sol, ...sol]);
check(again.text.includes('AlreadyExistsException') && mission.success(again.state), 'replay cannot duplicate replicas or damage solved state');
check(again.state.account.healthChecks.length === 1 && again.state.account.regionDrill.alarms.length === 1, 'stable resource counts');

const wrongKey = sol[1].split(',KmsKeyId=')[0];
const removeReplica = 'aws secretsmanager remove-regions-from-replication --secret-id shopkaro/checkout --remove-replica-regions ' + standby;
check(!run(mission, [sol[0], wrongKey, ...sol.slice(2)]).done, 'default destination key misses course requirement');
check(run(mission, [sol[0], wrongKey, removeReplica, ...sol.slice(1)]).done === 1, 'incorrect key can be repaired');
check(!run(mission, sol.map(c => c.replace('--min-size 3', '--min-size 1'))).done, 'one warm server cannot handle peak');
check(!run(mission, sol.map(c => c === sol[6] ? c.replace(standby, primary) : c)).done, 'alarm in Mumbai cannot win');
function withFile(name, update) {
  const value = JSON.parse(mission.files[name].content);
  update(value);
  return { ...mission, files: { ...mission.files, [name]: { content: JSON.stringify(value) } } };
}
for (const [name, update] of [
  ['probe.json', p => { p.Inverted = true; }],
  ['probe.json', p => { p.FullyQualifiedDomainName = 'checkout.shopkaro.test'; }],
  ['dns.json', d => { delete d.Changes[0].ResourceRecordSet.HealthCheckId; }],
  ['dns.json', d => { d.Changes[1].ResourceRecordSet.ResourceRecords[0].Value = '192.0.2.10'; }],
  ['alarm.json', a => { a.Period = 300; }],
  ['alarm.json', a => { a.Threshold = 50; }],
  ['alarm.json', a => { a.Namespace = 'OtherApp'; }]
]) check(!run(withFile(name, update), sol).done, 'incorrect ' + name + ' loses');

const flow = level.stages.find(s => s.type === 'flowlab');
let states = 0, fits = 0;
for (const slo of [0,1]) for (const regions of [1,2]) for (const cache of [0,1]) for (const dr of [0,1,2]) for (const commit of [0,1]) {
  const k = { slo, regions, cache, dr, commit };
  const target = slo ? 99.99 : 99.95;
  const downtime = regions === 1 ? 60 : [55,32,8][dr];
  const bill = (cache ? 46000 : 52000) - commit * 7000 + (regions === 1 ? 0 : [6000,16000,34000][dr]);
  const expected = downtime <= (100 - target) * 432 && regions === 2 && dr > 0 && bill <= 75000;
  check(flow.check(k) === expected && flow.model(k).verdict.ok === expected, 'board ' + JSON.stringify(k));
  check(flow.model(k).readouts.at(-1).value === '₹' + bill, 'bill includes every selected component');
  states++;
  if (expected) fits++;
}
check(fits === 1, 'unique budget fit');
const qs = level.stages.flatMap(s => [...(s.questions || []), ...(s.steps || []).flatMap(t => t.ask ? [t.ask] : []), ...(s.observe ? [s.observe] : [])])
  .concat(level.interview.questions.filter(q => q.choices));
const positions = [0,0,0,0];
let longest = 0;
for (const q of qs) {
  const right = q.choices[q.answer].length, wrong = q.choices.filter((_, i) => i !== q.answer).map(c => c.length);
  check(right < 1.15 * Math.max(...wrong) && right > .85 * Math.min(...wrong), q.q);
  check(q.explain.length > 80, 'explanation: ' + q.q);
  positions[q.answer]++;
  if (right > Math.max(...wrong)) longest++;
}
check(Math.max(...positions) - Math.min(...positions) <= 1 && longest / qs.length >= .17 && longest / qs.length <= .32, 'MCQ positions and lengths');
check(crashes.length === 0, crashes.join('\n'));
console.log(`   ✓ ${checks} finalboss checks · ${states} board states/${fits} fit · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join('/')}`);
