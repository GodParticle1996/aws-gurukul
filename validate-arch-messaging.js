#!/usr/bin/env node
// Run the D3 missions through the terminal and check every calculator setting.
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

const level = AG.findLevel('messaging');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;
const [topic, render, feed, sub1, sub2, p7v1, p8v1, p7v2, create, wait] = mission.solution;
const setup = [topic, render, feed, sub1, sub2];
const inspect = (commands, stage=mission) => run({...stage, success: () => false}, commands);
for (const stage of [mission, interview]) {
  const replay = run(stage,stage.solution);
  check(replay.done === 1 && replay.trace.slice(0,-1).every(n => n === 0), 'last command wins: ' + replay.text.slice(-900));
  check(stage.tasks.every(t => t.check(replay.state)), 'checklist agrees with mission result');
  stage.solution.forEach((_,i) => check(!run(stage, stage.solution.filter((_,j) => j !== i)).done,'omitted command ' + i));
}
const finish = publishes => run(mission,[...setup,...publishes,create,wait]);
check(finish([p8v1,p7v1,p7v2]).done && finish([p7v1,p7v2,p8v1]).done, 'independent photos may interleave');
check(!finish([p7v2,p8v1,p7v1]).done, 'no revision sorting after arrival');
check(finish([p7v1,p8v1,p7v1,p7v2]).done, 'repeat ID within window');
check(!finish([p7v1,p8v1,'sleep 301',p7v1,p7v2]).done, 'repeat after dedup window reaches both queues');
check(!finish([p7v1,p8v1,p7v2.replace('group-id p7','group-id p8')]).done, 'correct group on every edit');
check(!finish([p7v1,p8v1,p7v2.replace('deduplication-id p7-v2','deduplication-id p7-v1')]).done, 'IDs differ for different revisions');
check(!finish([p7v1,p8v1,p7v2.replace('file://p7-v2.json','file://p7-v1.json')]).done, 'actual message body');
const noPolicy = inspect([topic, render.replace(/file:\/\/\S+$/, 'FifoQueue=true'),feed,sub1,sub2,p7v1]);
check(noPolicy.state.account.snsDeliveries.some(r => r.status === 'denied-policy') &&
  noPolicy.state.account.queues[0].messages.length === 0 && noPolicy.state.account.queues[1].messages.length === 1, 'publish can reach just one subscriber');
const broadFiles = {...mission.files};
for (const name of ['pix-render.fifo','pix-feed.fifo']) {
  const attrs = JSON.parse(broadFiles[name+'.json'].content), policy = JSON.parse(attrs.Policy);
  delete policy.Statement[0].Condition;
  broadFiles[name+'.json'] = {content: JSON.stringify({...attrs,Policy:JSON.stringify(policy)})};
}
const broad = inspect(mission.solution,{...mission,files:broadFiles});
check(broad.state.account.queues.every(q => q.messages.length === 3) && !mission.success(broad.state),'delivered through overly broad permissions');
const envelope = inspect([topic, render, feed, sub1.replace('RawMessageDelivery=true','RawMessageDelivery=false'),sub2,p7v1,p8v1,p7v2]);
check(JSON.parse(envelope.state.account.queues[0].messages[0].body).Type === 'Notification' && !mission.tasks[2].check(envelope.state), 'raw body required');
const direct = [];
for (const name of ['pix-render.fifo','pix-feed.fifo']) {
  for (const [photo,id] of [['p7','p7-v1'],['p8','p8-v1'],['p7','p7-v2']]) {
    direct.push('aws sqs send-message --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/'+name+
      ' --message-body file://'+id+'.json --message-group-id '+photo+' --message-deduplication-id '+id);
  }
}
const forged = inspect([...setup,...direct,create,wait]);
check(forged.state.account.queues.every(q => q.messages.length === 3) && !mission.success(forged.state), 'direct sends do not prove fan-out');
const [grant,raw,first,second,receive] = interview.solution;
check(!run(interview,[grant,raw,first,second,receive.replace(' --message-system-attribute-names All','')]).done,'worker read must show group');
check(!run(interview,[grant,raw,first,second,receive.replace('messages 2','messages 1')]).done,'read both revisions');
const denied = inspect([raw,first,second,grant,receive],interview);
check(denied.state.account.snsDeliveries.every(r => r.status === 'denied-policy') && !interview.success(denied.state),'late permission does not repair past failed deliveries');
const desc = 'aws kinesis describe-stream-summary --stream-name pix-activity';
for (const [commands,error] of [
  [[wait],'ResourceNotFoundException'],[[create+' --shard-count 1'],'ValidationException'],
  [[create.replace('ON_DEMAND','PROVISIONED')],'ON_DEMAND'], [[create+' --region eu-west-1'],'us-east-1'],
  [[create.replace('pix-activity','bad/name')],'ValidationException'], [[create+' --misspelt yes'],'Unknown'],
  [[create+' --stream-name other'],'repeated']]) {
  const result = inspect(commands);
  check(!result.state.account.kinesisStreams.length && result.text.includes(error),'invalid create or wait: '+commands);
}
const creating = inspect([create,desc]);
const earlyWait = run(mission, [...setup,p7v1,p8v1,p7v2,wait,create,wait]);
check(earlyWait.done && earlyWait.text.includes('ResourceNotFoundException'), 'recover by waiting after create');
check(creating.state.account.kinesisStreams[0].status === 'CREATING' && creating.text.includes('StreamDescriptionSummary') && creating.text.includes('CREATING'), 'exists and still creating');
const active = inspect([create,create,wait,desc,'aws kinesis list-streams']);
check(active.state.account.kinesisStreams.length === 1 && active.text.includes('ResourceInUseException') &&
  active.text.includes('arn:aws:kinesis:us-east-1:123456789012:stream/pix-activity') && active.text.includes('ACTIVE') && active.text.includes('StreamNames'), 'read back live stream');
const wrongRegion = inspect([topic+' --region us-west-2',render+' --region us-west-2']);
check(!wrongRegion.state.account.queues.length && !wrongRegion.state.account.topics.length,'scoped SNS and SQS');
const flow = level.stages.find(s => s.type === 'flowlab'), decision = level.stages.find(s => s.type === 'decide');
check(decision.tree === 'messaging' && decision.scenarios === 4 && level.stages[2] === decision, 'four messaging decisions');
let wins = 0, settings = 0;
for (let groups = 1; groups <= 16; groups++) for (let edits = 20; edits <= 160; edits += 20) {
  for (let records = 500; records <= 2000; records += 500) for (let kib = 1; kib <= 4; kib++) {
    const k = {groups,edits,records,kib}, m = flow.model(k), values = Array.from(m.readouts,r => r.value);
    const bytes = records * kib * 1024, shards = Math.max(Math.ceil(records/1000), Math.ceil(bytes/1048576));
    const rental = 30 * 24 * shards * .015, units = records * 3600 * 24 * 30 * .014 / 1000000;
    const dollars = n => '≈ $'+n.toFixed(2);
    const expected = [groups*10+' edits/s',Math.max(0,edits-groups*10)+' edits/s',String(shards),dollars(rental),dollars(units),dollars(rental+units)];
    check(JSON.stringify(values) === JSON.stringify(expected), 'capacity and cost '+JSON.stringify(k));
    const target = groups === 8 && edits === 80 && records === 1500 && kib === 2;
    check(flow.check(k) === target && m.verdict.ok === target,'release target');
    if (target) wins++;
    settings++;
  }
}
check(wins === 1 && settings === 2048, 'full slider grid and unique release');
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
console.log(`   ✓ ${checks} messaging checks · ${settings} settings/1 fit · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join("/")}`);
