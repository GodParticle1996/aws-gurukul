#!/usr/bin/env node
// Exercise the same PixShare terminal, decision controls and calculator that learners use.
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

const level = AG.findLevel('compute'), mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;
const [register, start, route, waitRouter, tune, waitThumb] = mission.solution;
for (const stage of [mission, interview]) {
  for (let replay = 0; replay < 2; replay++) {
    const r = run(stage, stage.solution);
    check(r.done === 1 && r.trace.slice(0, -1).every(n => n === 0), 'final-only win ' + r.text.slice(-800));
    check(stage.tasks.every(t => t.check(r.state)), 'checklist matches win');
  }
  for (let i = 0; i < stage.solution.length; i++) {
    check(!run(stage, stage.solution.filter((_, j) => i !== j)).done, 'missing command ' + i);
  }
}
const inspect = (commands, fixture = mission) => run({ ...fixture, success: () => false }, commands);
const failedStarts = [
  [[], start, 'Unable to describe task definition'],
  [[register], start.replace('FARGATE', 'EC2'), 'active Fargate task definition'],
  [[register], start.replace('private-net.json', 'missing.json'), 'Unable to load paramfile'],
  [[register], start + ' --count 2', 'Unknown'],
  [[register], start + ' --region us-west-2', 'scope'],
  [[register], start.replace('pix-video:1', 'pix-video:2'), 'Unable to describe task definition'],
];
for (const [prefix, command, message] of failedStarts) {
  const r = inspect([...prefix, command]);
  check(!r.state.account.containerTasks.length && r.text.includes(message), command + '\n' + r.text.slice(-550));
}
const twice = inspect([register, start, start, 'aws ecs list-tasks --cluster pix-media']);
check(twice.state.account.containerTasks.length === 1 && twice.text.includes('taskArns'), 'same token reuses task');
const task = twice.state.account.containerTasks[0];
const desc = inspect([register, start, 'aws ecs describe-tasks --cluster pix-media --tasks ' + task.id]);
check(desc.text.includes('family:pix-video') && desc.text.includes('RUNNING'), 'standalone task readback');
const conflict = inspect([register, start, register, start.replace('pix-video:1', 'pix-video:2')]);
check(conflict.text.includes('ConflictException') && conflict.state.account.containerTasks.length === 1, 'token collision');
const missingImage = structuredClone(mission.account);
missingImage.ecrRepositories[0].images = [];
const stopped = inspect(mission.solution, { ...mission, account: missingImage });
check(stopped.state.account.containerTasks[0].lastStatus === 'STOPPED' && !mission.success(stopped.state), 'failed image pull cannot win');
const noGrant = structuredClone(mission.account);
noGrant.iamRoles[0].grants = [];
const denied = inspect([register, start], { ...mission, account: noGrant });
check(denied.state.account.containerTasks[0].stoppedReason.includes('AccessDenied'), 'execution role actually used');
const changed = (doc, vars) => ({ content: JSON.stringify({ Variables: { ...JSON.parse(doc.content).Variables, ...vars } }) });
const wrongRoute = { ...mission.files, 'route.json': { content: '{"Variables":{"VIDEO_BACKEND":"ecs","VIDEO_TASK":"pix-video:1"}}' } };
check(!run({ ...mission, files: wrongRoute }, mission.solution).done, 'preserve photo bucket');
const pending = inspect([register, start, route, tune]);
check(!mission.tasks[2].check(pending.state) && !mission.tasks[3].check(pending.state), 'pending updates do not count');
const foreign = inspect([tune + ' --region us-west-2', waitThumb]);
check(!mission.tasks[3].check(foreign.state), 'other Region does not mutate Lambda');
const readOnly = inspect(['aws lambda get-function-configuration --function-name pix-thumb', 'aws ecs list-tasks --cluster pix-media']);
check(!mission.success(readOnly.state) && !readOnly.state.account.containerTasks.length, 'reads cannot win');
const wrongDef = JSON.parse(mission.files['video.json'].content);
wrongDef.taskRoleArn = wrongDef.executionRoleArn;
const files = { ...mission.files, 'wrong.json': { content: JSON.stringify(wrongDef) },
  'v2.json': changed(mission.files['route.json'], { VIDEO_TASK: 'pix-video:2' }) };
const corrected = run({ ...mission, files }, [register.replace('video.json', 'wrong.json'), start, register,
  start.replace('pix-video:1', 'pix-video:2').replace('TEST-video-33', 'TEST-video-33-r2'),
  route.replace('route.json', 'v2.json'), waitRouter, tune, waitThumb]);
check(corrected.done === 1 && corrected.trace.slice(0,-1).every(n => !n), 'repair a wrong first revision in place');
const interviewWrong = interview.solution.map(s => s.replace('executions 8', 'executions 80'));
check(!run(interview, interviewWrong).done, 'reserved cap protects DB');

const stage = level.stages.find(s => s.type === 'decide');
const tree = AG.decisions.find(t => t.id === stage.tree);
function solveRound(arena, count, firstWrong) {
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    const key = arena.querySelector('.dd-scenario').dataset.scenario;
    check(key && !seen.has(key), 'valid unique scenario');
    seen.add(key);
    const [id, index] = key.split('#'), t = AG.decisions.find(item => item.id === id);
    const answer = t.scenarios[index].answer, choices = arena.querySelectorAll('.dd-choice');
    if (i === 0 && firstWrong) choices.find(c => c.dataset.leaf !== answer).click();
    choices.find(c => c.dataset.leaf === answer).click();
    arena.querySelector('.dd-next').click();
  }
}
for (const replay of [false, true]) {
  const arena = mkNode('div'), session = { level, replay }, before = AG.state.xp;
  const book = JSON.stringify(AG.state.decisions); let done = null;
  AG.session = session;
  AG.renderers.decide(stage, arena, r => { done = r; });
  solveRound(arena, 4, true);
  check(done.firstTry === 3 && done.total === 4 && session === AG.session, 'stage retains session and stats');
  check(AG.state.xp - before === (replay ? 0 : 3 * AG.XP_PER_ITEM), 'embedded XP respects replay');
  check(JSON.stringify(AG.state.decisions) === book, 'standalone record kept separate');
}
// Standalone practice still awards a scenario once, even when a round is repeated.
sb.renderTopbar = () => {};
vm.runInContext('var appEl = document.getElementById("app");', sb);
for (const pass of [1, 2]) {
  const before = AG.state.xp;
  sb.showDecisionPractice(tree);
  solveRound(sb.document.getElementById('app'), tree.scenarios.length, false);
  check(AG.session === null && AG.state.decisions.compute.best === tree.scenarios.length, 'standalone best');
  check(AG.state.xp - before === (pass === 1 ? tree.scenarios.length * AG.XP_PER_ITEM : 0), 'standalone replay XP');
}
sb.showDecisionPractice();
solveRound(sb.document.getElementById('app'), 10, false);
check(sb.document.getElementById('app').querySelectorAll('.stage-summary').length === 1, 'mixed practice completes');

const flow = level.stages.find(s => s.type === 'flowlab');
const fargate = 720 * (2 * .0404784 + 4 * .004446), ec2 = 720 * .0672;
let states = 0, wins = 0;
for (let rps = 1; rps <= 20; rps++) for (const ms of [100,200,300,400])
  for (const mb of [256,512,768,1024]) for (const hours of [6,12,18,24]) {
    const k = { rps, ms, mb, hours }, m = flow.model(k), requests = 30 * hours * 3600 * rps;
    const charge = requests / 1e6 * .20 + requests * ms / 1000 * mb / 1024 * .0000166667;
    const expected = [charge, fargate, ec2, fargate * rps / charge, ec2 * rps / charge];
    const values = m.readouts.map(r => Number(r.value.match(/[\d.]+/)[0]));
    check(expected.every((v, i) => Math.abs(v - values[i]) < .005001), 'readouts ' + JSON.stringify(k));
    const fit = rps === 20 && ms === 200 && mb === 512 && charge > fargate && charge > ec2;
    check(flow.check(k) === fit && m.verdict.ok === fit, 'crossover goal');
    states++;
    if (fit) wins++;
  }
check(wins === 2, '18 and 24 hour goals');
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
console.log(`   ✓ ${checks} compute checks · ${states} cost states/${wins} fits · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join('/')}`);
