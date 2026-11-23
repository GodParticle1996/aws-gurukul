#!/usr/bin/env node
// Run the D9 global review regressions.
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

const level = AG.findLevel('archboss');
const track = AG.trackOf(level);
check(track.id === 'architect' && level.badge === 'Decision Architect', 'saved boss badge and track');
check(AG.levelsOf(track).map(l => l.id).join(',') ===
  'compute,datastore,messaging,eventbridge,logsetl,edge,costdec,resilience,archboss', 'all nine levels in map order');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;

const A=AG.pixBoss, B=AG.pixBill, R=AG.pixResilience;
const inspect=(stage,commands)=>run({...stage,success:()=>false},commands);
function changeFile(stage,name,change){
  const json=JSON.parse(stage.files[name].content);change(json);
  return {...stage,files:{...stage.files,[name]:{content:JSON.stringify(json)}}};
}
for(const [stage,iv] of [[mission,false],[interview,true]]){
  const cmds=stage.solution;
  const result=run(stage,cmds);
  check(result.done===1 && result.trace.slice(0,-1).every(x=>x===0),stage.title+'\n'+result.text.slice(-3500));
  check(stage.tasks.every(t=>t.check(result.state)),'all six real states');
  check(result.text.includes('"result":"counted"') && result.text.includes('"result":"duplicate"'),'worker outcomes visible');
  for(let i=0;i<cmds.length;i++)check(!run(stage,cmds.filter((_,j)=>j!==i)).done,'cannot omit '+cmds[i]);
  const initial=inspect(stage,['cat status.txt']);
  check(stage.tasks.filter(t=>t.check(initial.state)).length===(iv?4:0),'initial defects');
  const [fix,wait,first,second]=cmds.slice(-4);
  const prefix=cmds.slice(0,-4);
  check(!run(stage,[...prefix,fix,first,second,wait]).done,'pending handler ran old code');
  check(!run(stage,[...prefix,fix,wait,first,first]).done,'same receipt cannot prove redelivery');
  check(run(stage,[first,...prefix,fix,wait,'cat reset-test.txt',first,second]).done,'unsafe rehearsal can be reset');
  const unsafe=inspect(stage,[first,second]);
  const rows=unsafe.state.account.tables[0].items;
  check(rows.find(i=>i.pk==='TOTAL#'+A.tenant).units===2 && !rows.some(i=>i.pk.startsWith('EVENT#')),'legacy double count');
  check(rows.find(i=>i.pk==='TOTAL#demo').units===10 && rows.find(i=>i.pk==='TOTAL#other').units===4,'existing tenants protected');
  for(const modify of [
    x=>x.Records[0].receiptHandle='receipt-1',x=>x.Records[0].messageId='other-message',
    x=>x.Records[0].eventSourceARN='arn:aws:sqs:us-east-1:123456789012:other',
    x=>{const r=x.Records[0];r.body=r.body.replace('p7"','p9"');},
    x=>{const r=x.Records[0];r.body=r.body.replace('"41"','"demo"');}
  ]){
    const changed=changeFile(stage,'receipt-2.json',modify);
    check(!run(changed,cmds).done,'wrong replay input');
  }
  const wrong=inspect(stage,cmds).state;
  wrong.account.lambdas[0].revisionId='new-release';
  check(!stage.success(wrong),'old runtime proof cannot verify new release');
}
const cmds=mission.solution,[join,reader,dlq,cap,audit,logs]=cmds;
const substitute=(from,to)=>cmds.map(c=>c===from?to:c);
for(const [from,to] of [
  [join,join.replace('rtb-b','rtb-pub-b')],[reader,reader.replace('pix-reader-a.local','pix-reader-b.local')],
  [dlq,dlq.replace('redrive.json','missing.json')],[cap,cap.replace('executions 4','executions 0')],
  [cap,cap.replace('executions 4','executions 16')],[audit,audit.replace('pix-log-forward','another-role')],
  [logs,logs.replace('stream-name release','stream-name missing')]]){
  check(!run(mission,substitute(from,to)).done,'incorrect repair '+to);
}
for(const modify of [p=>{p.maxReceiveCount=1;},p=>{p.deadLetterTargetArn=p.deadLetterTargetArn.replace('pix-failed','pix-thumbs');}]){
  const changed=changeFile(mission,'redrive.json',modify);
  check(!run(changed,cmds).done,'wrong DLQ policy');
}
const missingInfo=changeFile(mission,'review-logs.json',xs=>xs.shift());
check(!run(missingInfo,cmds).done,'hot alone cannot prove raw INFO');
for(const change of [
 a=>{a.routeTables.find(t=>t.id==='rtb-b').routes=a.routeTables.find(t=>t.id==='rtb-b').routes.filter(r=>!r.prefixListId);},
 a=>{a.cacheGroups[0].nodes.find(n=>n.id===B.local).status='unavailable';},
 a=>{a.pixLog.subscriptions=a.pixLog.subscriptions.filter(f=>f.filterName!=='hot');},
 a=>{a.pixLog.version++;},
 a=>{a.queues.find(q=>q.name===R.dead).attributes.RedriveAllowPolicy='{"redrivePermission":"denyAll"}';},
 a=>{a.lambdas.find(f=>f.name==='pix-feed').reservedConcurrency=0;},
 a=>{a.tables[0].revision++;},a=>{a.tables[0].items.find(r=>r.pk==='TOTAL#other').units++;}
]){
  const s=inspect(mission,cmds).state;change(s.account);check(!mission.success(s),'post-release drift cannot pass');
}
const flow=level.stages.find(s=>s.type==='flowlab');
let grid=0,wins=0;
for(const slo of [0,1,2])for(const regions of [1,2])for(const cache of [0,1,2])for(const async of [0,1])for(const plan of [0,1,2]){
  const k={slo,regions,cache,async,plan},m=A.budget(k);
  const origin=[100,60,36][cache],lost=(regions===1?60:5)+(async===0?30:0);
  let compute=0;
  for(let h=0;h<720;h++){const used=Number(h<600)+Number(regions===2 && h<360);compute+=.75*plan+Math.max(0,used-plan);}
  const dollars=regions*200+100+origin*5+70*async+compute, target=[99.9,99.95,99.99][slo];
  const allowed=[43.2,21.6,4.32][slo],fit=target>=99.95 && lost<=allowed && dollars<=1670;
  check(m.origins===origin && m.compute===compute && m.cost===dollars,'itemized cost matches hour-by-hour reference');
  check(m.lost===lost && Math.abs(m.allowance-allowed)<1e-8 && m.target===target,'time budget');
  check(flow.check(k)===fit && flow.model(k).verdict.ok===fit && flow.model(k).readouts.at(-1).value==='≈ $'+dollars,'win follows both time and money');
  if(fit)wins++;grid++;
}
check(grid===108 && wins===1,'complete board and one fit');
const qs=level.stages.flatMap(s=>[...(s.questions||[]),...(s.steps||[]).flatMap(x=>x.ask?[x.ask]:[]),...(s.observe?[s.observe]:[])])
  .concat(level.interview.questions.filter(q=>q.choices));
const positions=[0,0,0,0];let longest=0;
for(const q of qs){
  const right=q.choices[q.answer].length,wrong=q.choices.filter((_,i)=>i!==q.answer).map(v=>v.length);
  check(right<1.15*Math.max(...wrong) && right>.85*Math.min(...wrong),q.q);
  check(q.explain.length>80,q.q+' explanation');
  positions[q.answer]++;if(right>Math.max(...wrong))longest++;
}
check(Math.max(...positions)-Math.min(...positions)<=1 && longest/qs.length>=.17 && longest/qs.length<=.32,'MCQ balance');
check(!crashes.length,crashes.join('\n'));
console.log('   ✓ '+checks+' archboss checks · '+grid+' budget settings/'+wins+' fit · '+qs.length+' MCQs, '+longest+' longest, positions '+positions.join('/'));
