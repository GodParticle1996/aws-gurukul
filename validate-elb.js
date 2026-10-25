#!/usr/bin/env node
// ALB/ASG state regressions, using the shipped renderer and simulator.
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
const level = AG.findLevel('elbasg'), mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.find(q => q.terminal).terminal;
const solution = mission.hints, TG = mission.account.targetGroups[0].arn;
const probe = { ...mission, success: () => false };
const inspect = (commands, account) => run({ ...probe, ...(account ? { account } : {}) }, commands);
const group = r => r.state.account.asgs[0], target = r => r.state.account.targetGroups[0];
check(level.steps.length === 8 && level.cards.length === 8, 'eight lesson cards and flashcards');
check(level.stages.map(s => s.type).join(',') === 'dryrun,flowlab,match,bins,triage,terminal,docker,quiz', 'stage order');
check(run(mission, solution).trace.join(',') === '0,0,0,1', 'mission wins only after final drain attribute');
for (let i = 0; i < solution.length; i++) check(!run(mission, solution.filter((_, j) => i !== j)).done, 'cannot omit step ' + i);
check(run(interview, interview.hints).trace.join(',') === '0,1', 'interview needs scale-out and replacement');
for (let i = 0; i < interview.hints.length; i++) check(!run(interview, interview.hints.filter((_, j) => i !== j)).done, 'cannot omit interview action ' + i);
let r = inspect(solution);
check(group(r).instances.includes('i-good') && !group(r).instances.includes('i-broken'), 'replace broken, preserve healthy original');
check(r.state.account.instances.find(i => i.id === 'i-broken').state === 'terminated', 'EC2 history keeps terminated old instance');
check(group(r).activities.some(a => a.oldId === 'i-broken' && a.newId === 'i-00000000000000001' && a.status === 'Successful'), 'deterministic replacement activity');
check(group(r).instances.length === 2 && target(r).targets.length === 2, 'registration follows replacement');
const q = command => inspect([command]);
r = q('aws elbv2 describe-target-health --target-group-arn ' + TG);
check(r.text.includes('Target.ResponseCodeMismatch') && r.text.includes('Target.FailedHealthChecks'), 'path versus app-process errors distinguished');
r = inspect([solution[0], 'aws autoscaling describe-auto-scaling-groups']);
check(group(r).instances.includes('i-broken') && r.text.includes('"HealthCheckType": "EC2"'), 'default EC2 health does not replace dead application');
r = inspect([solution[1], solution[0]]);
check(!group(r).instances.includes('i-good'), 'enabling ELB against a wrong global path can churn original healthy instance');
check(!run(mission, [solution[1], solution[0], ...solution.slice(2)]).done, 'churn-everything shortcut cannot win');
for (const commands of [
  ['aws elbv2 describe-target-groups', 'aws autoscaling describe-auto-scaling-groups'],
  ['apply -f fix-asg.json'],
  [solution[0], solution[2], solution[3]],
  [solution[0], 'aws elbv2 modify-target-group --target-group-arn ' + TG + ' --matcher HttpCode=200-499', ...solution.slice(1)],
  [solution[0], 'aws elbv2 modify-target-group --target-group-arn ' + TG + ' --health-check-port 8888', ...solution.slice(1)],
  [solution[0], ...solution.slice(1, 3), 'aws elbv2 modify-target-group-attributes --target-group-arn ' + TG + ' --attributes Key=deregistration_delay.timeout_seconds,Value=0'],
  ['aws ec2 terminate-instances --instance-ids i-good', ...solution],
  ['aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-web --min-size 0 --desired-capacity 0', ...solution],
]) check(!run(mission, commands).done, 'wrong-but-plausible solution does not win');
const decrement = interview.hints[1].replace('--no-should-decrement-desired-capacity', '--should-decrement-desired-capacity');
check(!run(interview, [interview.hints[0], decrement]).done, 'wrong decrement flag does not preserve goal capacity');
for (const command of [
  'aws autoscaling set-desired-capacity --auto-scaling-group-name shopkaro-web --desired-capacity 99',
  'aws autoscaling set-desired-capacity --auto-scaling-group-name shopkaro-web --desired-capacity NaN',
  'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-web --min-size 9 --max-size 2',
  'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-web --health-check-type maybe',
  'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-web --health-check-grace-period -1',
  'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-web --vpc-zone-identifier subnet-app-a,missing',
  'aws autoscaling terminate-instance-in-auto-scaling-group --instance-id i-broken',
  'aws autoscaling terminate-instance-in-auto-scaling-group --instance-id i-broken --should-decrement-desired-capacity --no-should-decrement-desired-capacity',
  'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shopkaro-web --health-check-type ELB --banana 1',
  'aws autoscaling terminate-instance-in-auto-scaling-group --instance-id i-broken --no-should-decrement-desired-capacity true',
]) {
  const result = q(command); check(group(result).instances.length === 2 && group(result).desired === 2 && group(result).min === 2, 'invalid ASG edit atomic');
  check(/error:|ValidationError|Unknown options/.test(result.text), 'invalid ASG edit has useful error');
}
for (const command of [
  'aws elbv2 modify-target-group --target-group-arn ' + TG + ' --health-check-path healthz',
  'aws elbv2 modify-target-group --target-group-arn ' + TG + ' --health-check-interval-seconds NaN',
  'aws elbv2 modify-target-group --target-group-arn ' + TG + ' --health-check-port 99999',
  'aws elbv2 modify-target-group --target-group-arn ' + TG + ' --matcher HttpCode=500-599',
  'aws elbv2 modify-target-group-attributes --target-group-arn ' + TG + ' --attributes Key=deregistration_delay.timeout_seconds,Value=-1',
  'aws elbv2 modify-target-group-attributes --target-group-arn ' + TG + ' --attributes Key=__proto__,Value=oops',
  'aws elbv2 register-targets --target-group-arn ' + TG + ' --targets Id=missing,Port=8080',
]) {
  const result = q(command); check(target(result).healthCheckPath === '/health' && target(result).attributes['deregistration_delay.timeout_seconds'] === '300' && target(result).targets.length === 2, 'invalid target edit atomic');
  check(/error:|ValidationError|Invalid/.test(result.text), 'invalid target edit useful error');
}
r = inspect(['aws elbv2 deregister-targets --target-group-arn ' + TG + ' --targets Id=i-broken,Port=8080', 'aws elbv2 describe-target-health --target-group-arn ' + TG]);
check(r.text.includes('draining') && group(r).instances.includes('i-broken'), 'deregister drains; does not terminate');
r = inspect(['aws elbv2 deregister-targets --target-group-arn ' + TG + ' --targets Id=i-broken,Port=8080', 'aws elbv2 wait target-deregistered --target-group-arn ' + TG]);
check(target(r).targets.length === 1 && r.state.account.instances.find(i => i.id === 'i-broken').state === 'running', 'modeled waiter completes registration removal only');
r = inspect(['aws elbv2 register-targets --target-group-arn ' + TG + ' --targets Id=i-good,Port=8080', 'aws elbv2 register-targets --target-group-arn ' + TG + ' --targets Id=i-good,Port=8080']);
check(target(r).targets.length === 2, 'register target idempotent');
r = inspect([solution[2], solution[2]]);
check(group(r).policies.length === 1, 'put policy same name updates, no duplicates');
for (const raw of ['{', '{}', '{"TargetValue":"50","PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"}}', '{"TargetValue":50,"DisableScaleIn":"false","PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"}}']) {
  r = q("aws autoscaling put-scaling-policy --auto-scaling-group-name shopkaro-web --policy-name bad --policy-type TargetTrackingScaling --target-tracking-configuration '" + raw + "'");
  check(!group(r).policies.length && /Invalid JSON|ValidationError/.test(r.text), 'malformed policy cannot mutate');
}
r = inspect([solution[0], 'aws elbv2 describe-target-groups --target-group-arns ' + TG + ' --query TargetGroups[0].HealthCheckPath --output text']);
check(r.text.endsWith('/healthz'), 'real path query and text output');
r = q('aws autoscaling describe-auto-scaling-groups --query AutoScalingGroups[0].Instances[].InstanceId --output text');
check(r.text.endsWith('i-good\ti-broken'), 'array projection text output');
r = q('aws autoscaling describe-auto-scaling-groups --query length(AutoScalingGroups[0].Instances)');
check(r.text.endsWith('2'), 'length query');
r = q('aws autoscaling describe-auto-scaling-groups --query \'AutoScalingGroups[0].{Desired:DesiredCapacity,Count:length(Instances)}\'');
check(r.text.includes('"Desired": 2') && r.text.includes('"Count": 2'), 'object projection with length');
r = q('aws autoscaling describe-auto-scaling-groups --query AutoScalingGroups[?bad]');
check(r.text.includes('Invalid --query'), 'unsupported query not silently ignored');
for (const command of ['', ' ', 'AWS ELBV2 DESCRIBE-TARGET-GROUPS', 'sudo aws autoscaling describe-auto-scaling-groups', 'aws elbv2',
  'aws elbv2 modify-target-group', 'aws elbv2 modify-target-group-attributes --target-group-arn ' + TG,
  'aws elbv2 describe-target-health --target-group-arn ' + TG + ' --targets garbage',
  'aws autoscaling put-scaling-policy', 'aws autoscaling update-auto-scaling-group',
  'aws autoscaling set-desired-capacity --auto-scaling-group-name shopkaro-web',
  'aws elbv2 modify-target-group --target-group-arn "unterminated',
  'aws elbv2 describe-target-groups --query', 'aws autoscaling describe-auto-scaling-groups --output']) {
  r = inspect(['help', command]); check(!r.done && !r.text.includes('simulator error:'), 'garbage never crashes');
}
const flow = level.stages.find(s => s.type === 'flowlab');
const wins = [], values = flow.knobs.map(k => Array.from({ length: Math.round((k.max - k.min) / k.step) + 1 }, (_, i) => k.min + i * k.step));
let states = 0;
function sweep(i, k) {
  if (i < flow.knobs.length) { for (const v of values[i]) sweep(i + 1, { ...k, [flow.knobs[i].id]: v }); return; }
  const m = flow.model(k); states++;
  check(m.verdict.ok === flow.check(k), 'planner model/check agree');
  check(!JSON.stringify(m).includes('NaN') && m.readouts.every(r => r.value !== Infinity), 'finite displayed readouts');
  if (k.peak < 3000 || k.azs === 1 || k.min > k.max) check(!flow.check(k), 'reduced demand/one-AZ/invalid-bounds cannot win');
  if (flow.check(k)) wins.push(k);
}
sweep(0, {});
check(wins.length > 0, 'planner has valid solutions');
check(flow.check({ peak: 3000, cpu: 40, size: 1, min: 2, max: 12, azs: 3 }), 'documented planner solution wins');
for (const n of level.stages[0].nodes) { const h = Math.max(180, Math.round(84 + n.label.length * 12.4)) / 2; check(n.x - h >= 0 && n.x + h <= 1000 && n.y >= 33 && n.y <= 487, 'SVG node in bounds'); }
check(!run(mission, ['help']).done && mission.account.instances[1].state === 'running', 'clean mission replay');
check(!crashes.length, 'no swallowed engine exceptions: ' + crashes.join('\n'));
console.log(`✅ ${checks} ALB/ASG regression checks passed (${states} planner states; intended solves, omissions, cheats, queries, parser and replay).`);
