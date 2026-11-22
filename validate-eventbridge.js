#!/usr/bin/env node
// Run the D4 missions through the terminal and check every calculator setting.
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

const level = AG.findLevel('eventbridge');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;

const [bus,archive,rule,target,pipe,publish,replay,describe] = mission.solution;
const inspect = (commands,stage=mission)=>run({...stage,success:()=>false},commands);
const changeFile=(stage,name,change)=>{
  const parsed=JSON.parse(stage.files[name].content);
  const value=change(parsed) ?? parsed;
  return {...stage,files:{...stage.files,[name]:{content:JSON.stringify(value)}}};
};
for (const stage of [mission,interview]) {
  const solved=run(stage,stage.solution);
  check(solved.done===1 && solved.trace.slice(0,-1).every(n=>n===0),'valid route wins on final command: '+solved.text.slice(-2200));
  check(stage.tasks.every(t=>t.check(solved.state)),'all tasks use live state');
  stage.solution.forEach((_,i)=>check(!run(stage,stage.solution.filter((_,j)=>i!==j)).done,'missing step '+i));
}
const docs = ['aws events describe-archive --archive-name pix-history','aws events describe-replay --replay-name fix-review',
  'aws pipes list-pipes','aws pipes describe-pipe --name pix-check','aws events list-targets-by-rule --rule premium --event-bus-name pix-uploads'];
const r=inspect([...mission.solution,...docs]);
check(mission.success(r.state) && r.text.includes('COMPLETED') && r.text.includes('InputTransformer') && r.text.includes('FIRE_AND_FORGET'),'readbacks');
const a=r.state.account;
check(a.archives[0].records.length===3 && a.queues[0].messages.length===3,'three originals archived and only one replay delivered');
check(JSON.stringify(a.queues[0].messages.map(m=>JSON.parse(m.body).uploadId))==='["p7","p9","p7"]','live and replay queue bodies');
check(a.replays.length===1 && a.queues[0].messages[2].provenance.replayName==='fix-review','replay delivered by named run');
const replace=(cmd,sub)=>mission.solution.map(c=>c===cmd?sub:c);
for (const [cmd,bad] of [[archive,archive.replace(' 7',' 1')],[rule,rule.replace('premium.json','all.json')],
  [rule,rule+' --state DISABLED'],[replay,replay.replace('12:04:00','12:20:00')],
  [replay,replay.replace('12:00:00','12:02:00')],[target,target+' --region us-west-2'],
  [pipe,pipe.replace('role/pix-pipe-role','role/wrong')],[pipe,pipe.replace('pix-inbox','pix-review')]]) {
  check(!run(mission,replace(cmd,bad)).done,'wrong configuration loses '+bad);
}
for (const [file,edit] of [
  ['target.json',rows=>{delete rows[0].InputTransformer;}],['target.json',rows=>{rows[0].InputTransformer.InputPathsMap.upload='$.id';}],
  ['target.json',rows=>{rows[0].InputTransformer.InputTemplate='{"uploadId":"p7","tier":"premium"}';}],
  ['target.json',rows=>{rows[0].Arn=rows[0].Arn.replace('review','inbox');}],
  ['replay.json',d=>{delete d.FilterArns;}],['replay.json',d=>{d.Arn+='-other';}],
  ['source.json',d=>{d.FilterCriteria.Filters[0].Pattern='{"detail":{"tier":["premium"]}}';}],
  ['source.json',d=>{delete d.FilterCriteria;}],['workflow.json',d=>{d.StepFunctionStateMachineParameters.InvocationType='REQUEST_RESPONSE';}],
  ['uploads.json',entries=>{entries[0].EventBusName='default';}],['all.json',p=>{p.detail={tier:['premium']};}]]) {
  const changed=changeFile(mission,file,edit);
  check(!run(changed,changed.solution).done,'bad file '+file+': '+changed.files[file].content);
}
check(!run(mission,replace(describe,describe+' --query Destination')).done,'reading only destination does not confirm completion');
check(run(mission,replace(describe,describe+' --query State --output text')).done,'explicit state read');
const batched=changeFile(mission,'source.json',d=>{d.SqsQueueParameters={BatchSize:5,MaximumBatchingWindowInSeconds:1};});
check(run(batched,batched.solution).done,'other valid SQS batch settings');
const cleared=inspect([bus,rule,target,publish,archive,pipe,replay]);
check(cleared.state.account.archives[0].records.length===0 && !mission.success(cleared.state),'archive cannot backfill');
const expired=inspect([...mission.solution.slice(0,-2),'sleep 604801',replay,describe]);
check(!mission.success(expired.state) && expired.state.account.queues[0].messages.length===2,'expired archive does not replay');
const retried=inspect([...mission.solution,archive,pipe,replay]);
check(retried.text.includes('ResourceAlreadyExistsException') && retried.text.includes('ConflictException') &&
  retried.state.account.archives.length===1 && retried.state.account.replays.length===1 && retried.state.account.queues[0].messages.length===3,'duplicate names atomic');
const rebuilt=inspect([...mission.solution,'aws events delete-archive --archive-name pix-history',archive,publish]);
check(!mission.success(rebuilt.state),'old replay cannot certify replacement archive');
const repaired=inspect([...mission.solution.slice(0,-2),replay.replace('12:04:00','12:20:00'),replay.replace('fix-review','repair-two'),describe.replace('fix-review','repair-two')]);
check(mission.success(repaired.state),'new scoped replay after bad window');
for (const [cmd,needle] of [[archive+' --fake yes','Unknown'],[archive.replace(/ --event-source-arn \S+/,' '),'required'],
  [replay.replace('12:04:00','11:04:00'),'before'],[pipe+' --source invalid','Duplicate'],[pipe.replace(/ --target \S+/,' '),'required']]) {
  const probe=inspect([bus,...(cmd.startsWith('aws events start-replay')?[archive]:[]),cmd]);
  check(probe.text.includes(needle) && !probe.state.account.replays.length && !probe.state.account.pipes.length,'bad command rejected '+cmd+' '+probe.text.slice(-300));
}
const denied=JSON.parse(JSON.stringify(mission.account));denied.queues[0].policy.Statement[0].Condition.ArnEquals['aws:SourceArn']='wrong';
const deniedStage={...mission,account:denied}, lost=inspect(mission.solution,deniedStage);
check(!mission.success(lost.state) && lost.state.account.queues[0].messages.length===0 && lost.state.account.eventDeliveries.some(d=>d.status==='NO_PERMISSIONS'),'permission denial blocks delivery');
const [attach,update,send]=interview.solution;
const wrongUpdate=changeFile(interview,'source.json',d=>{d.FilterCriteria.Filters[0].Pattern='{"body":{"tier":["basic"]}}';});
check(!run(wrongUpdate,interview.solution).done,'still broken Pipe');
check(!run(interview,[send,attach,update]).done && run(interview,[send,attach,update,send]).done,'repair and resubmit');
const replaced=inspect([attach,send,'aws events remove-targets --ids review --rule premium --event-bus-name pix-uploads',attach,update],interview);
check(!interview.success(replaced.state),'old receipts cannot prove a changed target');
const checkedPattern={...mission,files:{...mission.files,'sample.json':{content:JSON.stringify({id:'sample',account:'123456789012',
  source:'pixshare.app','detail-type':'PhotoUploaded',time:'2026-11-22T12:01:00Z',region:'us-east-1',resources:[],detail:{tier:'premium'}})}}};
const test='aws events test-event-pattern --event-pattern file://premium.json --event file://sample.json';
check(inspect([test],checkedPattern).text.includes('"Result": true') && inspect([test],changeFile(checkedPattern,'sample.json',e=>{e.detail.tier='basic';})).text.includes('"Result": false'),'positive and negative pattern');
const flow=level.stages.find(s=>s.type==='flowlab');
let settings=0,wins=0;
for(let path=0;path<=2;path++) for(let replay=0;replay<=1;replay++) for(let enrich=0;enrich<=1;enrich++) for(let batch=1;batch<=5;batch++){
  const k={path,replay,enrich,batch},m=flow.model(k),v=m.readouts.map(r=>r.value);
  const modelTime=[6,12,8][path]+enrich*6+(path===2?(batch-1)*5:0);
  check(v[1]==='≈ $0.50' && v[2]===(replay?'≈ $2.21':'≈ $1.00') && v[3]==='≈ $'+(250000/batch/1e6*.4).toFixed(2),'routing cost');
  check(v[4]===modelTime+' ms/event' && v[5]===(replay?(path===1?'Archive aur replay ka bill juda':'Classic archive alag chahiye'):'Archive band'),'trace and compatibility');
  const fit=path===2 && replay===0 && enrich===1 && batch===5;
  check(flow.check(k)===fit && m.verdict.ok===fit,'selected route meets constraints');
  if(fit)wins++;
  settings++;
}
check(wins===1 && settings===60,'full calculator grid');
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
console.log(`   ✓ ${checks} eventbridge checks · ${settings} settings/1 fit · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join("/")}`);
