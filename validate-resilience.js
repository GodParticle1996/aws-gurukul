#!/usr/bin/env node
// Run the D8 transaction, redelivery and retry regression checks.
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

const level = AG.findLevel('resilience');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;

const R=AG.pixResilience;
const inspect=(stage,commands)=>run({...stage,success:()=>false},commands);
function withFile(stage,key,fn){
  const data=JSON.parse(stage.files[key].content);fn(data);
  return {...stage,files:{...stage.files,[key]:{content:JSON.stringify(data)}}};
}
for(const [stage,repair] of [[mission,false],[interview,true]]){
  const cmds=stage.solution;
  const full=run(stage,cmds);
  check(full.done===1 && full.trace.slice(0,-1).every(x=>!x),stage.title+'\n'+full.text);
  check(full.text.includes('ConditionalCheckFailed, None') && full.text.includes('11'),'visible cancellation and total');
  cmds.forEach((c,i)=>check(!run(stage,cmds.filter((_,j)=>j!==i)).done,'omitted '+c));
  const [policy,cap,commit,,read]=cmds.slice(-5),setup=cmds.slice(0,-5);
  const key='charge-'+(repair?'v2':'v1')+'.json';
  for(const change of [
    tx=>delete tx[0].Put.ConditionExpression,
    tx=>{tx[0].Put.Item.pk.S='EVENT#receipt-123';},
    tx=>{tx[0].Put.Item.photo.S='p9';},
    tx=>{tx[1].Update.Key.pk.S='TOTAL#other';},
    tx=>{tx[1].Update.ExpressionAttributeValues[':one'].N='2';},
    tx=>{tx[1].Update.UpdateExpression='SET #units = :one';},
    tx=>delete tx[1].Update.ConditionExpression,
    tx=>{tx[1].Update.ConditionExpression='attribute_not_exists(pk)';},
    tx=>{tx.splice(1,1);}
  ]){
    const wrong=withFile(stage,key,change);
    check(!run(wrong,cmds).done,'reject incorrect transaction');
  }
  for(const query of ['Item.pk.S','Missing']){
    check(!run(stage,[...cmds.slice(0,-1),read+' --query '+query]).done,'the read must actually show the counter');
  }
  check(run(stage,[...cmds.slice(0,-1),read+' --query Item.units.N --output text']).done,'projected scalar counter is enough');
  const noFile=inspect(stage,[policy.replace('redrive.json','missing.json')]);
  check(noFile.text.includes('Unable to load paramfile') && !R.queueOK(noFile.state.account),'missing policy file leaves source unchanged');
  const rollback=withFile(stage,key,tx=>{tx[1].Update.Key.pk.S='TOTAL#missing';});
  const miss=inspect(rollback,[...setup,commit]);
  check(miss.state.ddbLastFailedTransaction.reasons.join(',')==='None,ConditionalCheckFailed' &&
    !miss.state.account.tables.find(t=>t.name===R.ledger).items.some(i=>i.pk.endsWith(repair?'v2':'v1')),'failed counter rolls back marker');
  const reverse=withFile(stage,key,tx=>tx.reverse());
  check(run(reverse,cmds).done,'valid reordered transaction');
  const early=run(stage,[...setup,policy,cap,commit,read,commit]);
  check(!early.done,'counter read before failure is stale');
  check(!run(stage,[...cmds.slice(0,-1),read.replace(' --consistent-read','')]).done,'require strong read');
  check(!run(stage,[...setup,policy,cap,commit+' --client-request-token same',commit+' --client-request-token same',read]).done,'cached request token cannot prove durable replay');
  for(const limit of [0,3,5,16])check(!run(stage,cmds.map(c=>c===cap?c.replace('executions 4','executions '+limit):c)).done,'wrong cap '+limit);
  for(const count of [1,4,6]){
    const wrong=withFile(stage,'redrive.json',f=>{f.maxReceiveCount=count;});
    check(!run(wrong,cmds).done,'wrong receive threshold');
  }
  const wrongTarget=withFile(stage,'redrive.json',f=>{f.deadLetterTargetArn='arn:aws:sqs:us-east-1:123456789012:missing';});
  check(!run(wrongTarget,cmds).done,'missing DLQ');
  const dirty=inspect(stage,cmds).state;
  dirty.account.tables.find(t=>t.name===R.ledger).revision++;
  check(!stage.success(dirty),'ledger changed after receipts');
  const blocked=inspect(stage,cmds).state;
  blocked.account.queues.find(q=>q.name===R.dead).attributes.RedriveAllowPolicy='{"redrivePermission":"denyAll"}';
  check(!stage.success(blocked),'DLQ must accept source');
  const exhausted=inspect(stage,cmds).state;
  exhausted.account.lambdas.find(f=>f.name==='pix-feed').reservedConcurrency=0;
  check(!stage.success(exhausted),'unrelated feed capacity preserved');
}
const flow=level.stages.find(s=>s.type==='flowlab');
let settings=0,wins=0;
for(const clients of [4,8,12,16])for(let base=1;base<=4;base++)for(let retries=0;retries<=5;retries++)for(const jitter of [0,1])for(let outage=1;outage<=4;outage++){
  const k={clients,base,retries,jitter,outage}, m=R.simulate(k),board=flow.model(k);
  check(m.wave[0]===clients && m.attempts===m.wave.reduce((a,b)=>a+b,0) && m.attempts<=clients*(retries+1),'attempts conserved');
  check(m.peak===Math.max(0,...m.wave.slice(outage)) && m.lastAttempt===m.wave.length-1,'post-outage peak and last tick');
  check(m.acks<=m.writes && m.writes<=clients && m.duplicates<=Math.ceil(clients/4) && m.duplicates<=m.acks,'writes and duplicate receipts bounded');
  check(m.writes+m.duplicates<=m.wave.slice(outage).reduce((n,v)=>n+Math.min(v,4),0),'downstream capacity');
  const fit=clients===12 && outage===2 && m.acks===clients && m.peak<=4 && m.lastAttempt<=18;
  check(flow.check(k)===fit && board.verdict.ok===fit && board.readouts[0].value===m.peak+' calls/s','visible goal uses measured outcome');
  if(!retries)check(!m.writes && !m.acks && !m.duplicates,'outage with no retries');
  if(fit)wins++;settings++;
}
const load=jitter=>R.simulate({clients:12,base:4,retries:4,jitter,outage:2});
check(load(0).wave.join(',')==='12,0,0,0,12,0,0,0,0,0,0,0,9,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,3','synchronized retry waves');
check(load(1).wave.join(',')==='12,3,4,4,3,0,2,0,0,2' && load(1).duplicates===3 && load(1).acks===12,'repeatable jitter and lost acknowledgements');
check(wins===3 && settings===768,'complete retry grid');
const questions=level.stages.flatMap(s=>[...(s.questions||[]),...(s.steps||[]).flatMap(step=>step.ask?[step.ask]:[]),...(s.observe?[s.observe]:[])])
  .concat(level.interview.questions.filter(q=>q.choices));
const positions=[0,0,0,0];let longest=0;
for(const q of questions){
  const correct=q.choices[q.answer].length, others=q.choices.filter((_,i)=>i!==q.answer).map(s=>s.length);
  check(correct<1.15*Math.max(...others) && correct>.85*Math.min(...others),q.q);
  check(q.explain.length>80,q.q+' explanation');
  if(correct>Math.max(...others))longest++;
  positions[q.answer]++;
}
check(Math.max(...positions)-Math.min(...positions)<=1 && longest/questions.length>=.17 && longest/questions.length<=.32,'MCQ balance '+longest);
check(!crashes.length,crashes.join('\n'));
console.log('   ✓ '+checks+' resilience checks · '+settings+' retry settings/'+wins+' fits · '+questions.length+' MCQs, '+longest+' longest, positions '+positions.join('/'));
