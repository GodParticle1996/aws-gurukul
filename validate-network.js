#!/usr/bin/env node
// Focused regressions for the real-syntax VPC simulator. No AWS or Moto calls.
// Reuse validate.js's DOM/load manifest so fixtures exercise the shipped engine.
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
const level = AG.findLevel('vpcbasics'), mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.find(q => q.terminal).terminal;
const repair = [
  'aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-public',
  'aws ec2 replace-route-table-association --association-id rtbassoc-db-a --route-table-id rtb-private',
];
check(level.steps.length === 7 && level.cards.length === 8, 'seven lesson cards, eight flashcards');
check(level.stages.map(s => s.type).join(',') === 'dryrun,flowlab,order,bins,triage,terminal,docker,quiz', 'interaction-first stage order');
const good = run(mission, repair);
check(good.trace.join(',') === '0,1', 'mission wins only after both associations are repaired');
check(good.done === 1, 'one completion callback');
for (let omit = 0; omit < repair.length; omit++) {
  check(!run(mission, repair.filter((_, i) => i !== omit)).done, 'cannot skip association ' + omit);
}
const interviewCommands = interview.hints.slice(1);
check(run(interview, interviewCommands).trace.join(',') === '0,0,0,1', 'interview requires route, association and both SG changes');
for (let omit = 0; omit < interviewCommands.length; omit++) {
  check(!run(interview, interviewCommands.filter((_, i) => i !== omit)).done, 'cannot skip interview action ' + omit);
}
for (const commands of [
  ['aws ec2 describe-route-tables', 'aws ec2 describe-subnets'],
  ['apply -f fix-routes.json'],
  ['aws ec2 delete-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0'],
  ['aws ec2 terminate-instances --instance-ids i-db', ...repair],
  ['aws ec2 stop-instances --instance-ids i-web', ...repair],
  ['aws ec2 revoke-security-group-ingress --group-id sg-web --protocol tcp --port 443 --cidr 0.0.0.0/0', ...repair],
  ['aws ec2 delete-route --route-table-id rtb-main --destination-cidr-block 10.0.0.0/16'],
  ['aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-public --dry-run', repair[1]],
  ['aws ec2 replace-route-table-association --association-id rtbassoc-db-a --route-table-id rtb-public', repair[0]],
]) check(!run(mission, commands).done, 'wrong approach must not win: ' + commands[0]);

// Probe commands never finish a mission; the callback still exposes actual mutable state.
const probe = { ...mission, success: () => false };
function probeRun(commands, account) { return run({ ...probe, ...(account ? { account } : {}) }, commands); }
const table = (r, id) => r.state.account.routeTables.find(t => t.id === id);
let result = probeRun([
  repair[0],
  'aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-private',
]);
check(/InvalidAssociationID.NotFound/.test(result.text), 'replaced association ID becomes stale');
check(table(result, 'rtb-public').associations.some(a => a.id === 'rtbassoc-000000001' && a.subnetId === 'subnet-web-a'), 'new deterministic ID persists');
check(result.state.account.subnets.find(s => s.id === 'subnet-web-a').public === false, 'routing does not change auto public IP flag');
result = probeRun(['aws ec2 associate-route-table --subnet-id subnet-web-a --route-table-id rtb-public']);
check(/Resource.AlreadyAssociated/.test(result.text), 'explicit association requires replace');
result = probeRun(['aws ec2 delete-route --route-table-id rtb-public --destination-cidr-block 10.0.0.0/16']);
check(/cannot remove the local route/.test(result.text) && table(result, 'rtb-public').routes.length === 2, 'local route deletion rejected atomically');
result = probeRun(['aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0 --gateway-id igw-shop']);
check(/RouteAlreadyExists/.test(result.text) && table(result, 'rtb-public').routes.length === 2, 'duplicate route rejected');
result = probeRun(['aws ec2 delete-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0 --dry-run']);
check(/DryRunOperation/.test(result.text) && table(result, 'rtb-public').routes.length === 2, 'delete dry-run does not mutate');
result = probeRun(['aws ec2 create-route --gateway-id=igw-shop --destination-cidr-block=203.0.113.7/24 --route-table-id=rtb-public']);
check(table(result, 'rtb-public').routes.some(r => r.destination === '203.0.113.0/24'), 'equals flags/order and canonical CIDR work');
result = probeRun(['aws ec2 delete-route --destination-cidr-block 0.0.0.0/0 --route-table-id rtb-public']);
check(table(result, 'rtb-public').routes.length === 1 && !/Invalid/.test(result.text), 'default route deletion is real state change');
for (const command of [
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 300.0.0.0/24 --gateway-id igw-shop',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 10.0.0.0/33 --gateway-id igw-shop',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id igw-missing',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id local',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id igw-shop --nat-gateway-id nat-missing',
]) {
  const r = probeRun([command]);
  check(table(r, 'rtb-public').routes.length === 2 && /Invalid|error:/.test(r.text), 'invalid route does not mutate: ' + command);
}
const other = JSON.parse(JSON.stringify(mission.account));
other.routeTables.push({ id: 'rtb-other', vpcId: 'vpc-other', associations: [], routes: [] });
other.internetGateways.push({ id: 'igw-other', vpcId: 'vpc-other' });
for (const command of [
  'aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-other',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id igw-other',
]) check(/InvalidParameterValue/.test(probeRun([command], other).text), 'cross-VPC mutation rejected');
const implicit = JSON.parse(JSON.stringify(interview.account));
result = probeRun(['aws ec2 associate-route-table --route-table-id rtb-public --subnet-id subnet-web-a'], implicit);
check(table(result, 'rtb-public').associations.length === 1, 'implicit main can become explicit public association');
result = probeRun(['aws ec2 replace-route-table-association --association-id rtbassoc-main --route-table-id rtb-private'], implicit);
check(table(result, 'rtb-private').main && !table(result, 'rtb-main').main, 'main association replacement preserves exactly one main table');
result = probeRun(['aws ec2 describe-route-tables --filters Name=association.subnet-id,Values=subnet-web-a']);
check(result.text.includes('rtb-private') && !result.text.includes('"RouteTableId": "rtb-public"'), 'association filter returns effective explicit table');
result = probeRun(['aws ec2 describe-route-tables --route-table-ids rtb-public']);
check(result.text.includes('"Main": false') && result.text.includes('rtbassoc-db-a'), 'describe exposes actual association IDs');
result = probeRun(['aws ec2 describe-network-acls --filters Name=vpc-id,Values=vpc-shop']);
check(result.text.includes('"RuleNumber": 32767') && result.text.includes('"IsDefault": true'), 'default NACL output contains real rules');

const garbage = ['', ' ', 'AWS EC2 DESCRIBE-ROUTE-TABLES', 'sudo aws ec2 describe-route-tables', 'aws ec2',
  'aws ec2 describe-route-tables --filters', 'aws ec2 describe-route-tables --filters "unterminated',
  'aws ec2 describe-route-tables --filters Name=__proto__,Values=x', 'aws ec2 describe-route-tables --filters garbage',
  'aws ec2 create-route', 'aws ec2 delete-route', 'aws ec2 associate-route-table', 'aws ec2 replace-route-table-association',
  'aws ec2 describe-route-tables --route-table-ids', 'aws ec2 describe-network-acls --filters garbage',
  ...['gateway-id', 'route-table-id', 'association-id', 'subnet-id', 'destination-cidr-block'].map(f => 'aws ec2 create-route --' + f)];
for (const command of garbage) {
  const r = probeRun(['help', command]);
  check(!r.done && !r.text.includes('simulator error:'), 'malformed command never crashes: ' + command);
}
const flow = level.stages.find(s => s.type === 'flowlab');
const nodes = level.stages[0].nodes;
for (const n of nodes) {
  const half = Math.max(180, Math.round(84 + n.label.length * 12.4)) / 2;
  check(n.x - half >= 0 && n.x + half <= 1000 && n.y >= 33 && n.y <= 487, 'packet node stays inside SVG: ' + n.id);
}
for (let vpcPrefix = 16; vpcPrefix <= 24; vpcPrefix++) {
  for (let subnetPrefix = 18; subnetPrefix <= 28; subnetPrefix++) {
    for (let azs = 2; azs <= 3; azs++) {
      const k = { vpcPrefix, subnetPrefix, azs }, m = flow.model(k);
      check(m.verdict.ok === flow.check(k), 'planner check matches model');
      check(!JSON.stringify(m).includes('NaN') && m.readouts.every(r => r.value !== Infinity), 'planner readouts finite');
    }
  }
}
check(!flow.check({ vpcPrefix: 24, subnetPrefix: 26, azs: 2 }), 'planner unsolved at defaults');
check(flow.check({ vpcPrefix: 16, subnetPrefix: 24, azs: 3 }), 'documented planner solution wins');
check(!crashes.length, 'no swallowed simulator exceptions: ' + crashes.join('\n'));
// Fresh render gets original state even after successful repairs.
check(!run(mission, ['help']).done && mission.account.routeTables[1].associations[0].id === 'rtbassoc-db-a', 'mission fixtures never mutated by replay');
console.log(`✅ ${checks} VPC regression checks passed (route state, wrong paths, parser inputs, all 198 planner states).`);
