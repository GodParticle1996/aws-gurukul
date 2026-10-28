#!/usr/bin/env node
// Cost cleanup fixture regressions; offline only.
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
  for (const action of commands) {
    const command = typeof action === 'function' ? action(state) : action;
    input.value = command;
    input.fire('keydown', { key: 'Enter', preventDefault() {} });
    trace.push(done);
  }
  return { state, trace, done, text: output._kids.map(k => k.textContent).join('\n'), arena };
}


const level=AG.findLevel('cost'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal,copy=x=>JSON.parse(JSON.stringify(x));
const sol=mission.solution,isol=interview.solution,never={...mission,success:()=>false},neverI={...interview,success:()=>false},final=sol.at(-1);
const PROD='vol-0c027000000000001',WASTE='vol-0c027000000000002',AUDIT='vol-0c027000000000003',OLD='snap-0c0270000000000aa',KEEP='snap-0c0270000000000bb',NEW='snap-0c027000000000001',TOPIC='arn:aws:sns:us-east-1:444444444444:cost-alerts',ACCT='444444444444',BNAME='shopkaro-monthly';
function loses(label,commands,stage=mission){const r=run(stage,commands);check(!r.done,label+' loses');return r;}
function alt(label,commands,stage=mission){const r=run(stage,commands);check(r.done===1,label+' wins '+r.text.slice(-1400));check(r.trace.slice(0,-1).every(n=>!n),'alternative final-only '+label);return r;}
for(const stage of [mission,interview]){
 const r=run(stage,stage.solution);check(r.done===1,'intended wins: '+r.text.slice(-1800));check(r.trace.slice(0,-1).every(n=>!n)&&r.trace.at(-1)===1,'final-only solution');check(stage.tasks.every(t=>t.check(r.state)),'task agreement');check(run(stage,stage.solution).done===1,'clean reset');
 for(let i=0;i<stage.solution.length;i++)loses('omission '+stage.title+' step'+i,stage.solution.filter((_,j)=>i!==j),stage);
}
const ready=run(never,sol),rI=run(neverI,isol);check(mission.success(ready.state)&&interview.success(rI.state),'reference state goals');
check(ready.state.account.volumes.find(v=>v.id===PROD).throughput===250,'configured throughput preserved');check(ready.state.account.snapshots.find(s=>s.id===NEW).testData[0]==='TEST-legacy-invoice-27','original retired TEST payload in completed snapshot');
check(ready.state.account.snapshots.find(s=>s.id===KEEP).testData[0]==='TEST-order-27','last-good production recovery retained');
check(Math.abs(AG.costEstimate(ready.state.account).usd-96.65)<1e-9,'EBS+listedEIPs estimate includes associated address');
alt('budget before cleanup',[sol[7],...sol.slice(0,7),final]);
alt('cleanup order independent',[sol[0],sol[1],sol[6],sol[5],sol[4],sol[3],sol[2],sol[7],final]);
alt('inline budget and notice JSON',[...sol.slice(0,7),`aws budgets create-budget --account-id ${ACCT} --budget '${mission.files['budget.json'].content}' --notifications-with-subscribers '${mission.files['notifications.json'].content}'`,final]);
alt('equals flags, output and whitespace',sol.map(c=>'  '+c.replace(/ --([a-z-]+) /g,' --$1=').replace(/ /g,'   ')+'  '));
const noticeState=copy(mission.files);const ns=JSON.parse(noticeState['notifications.json'].content);ns[0].Notification.NotificationState='OK';noticeState['notifications.json'].content=JSON.stringify(ns);alt('notification state display not a safety property',sol,{...mission,files:noticeState});
const sidPolicy=copy(interview.files),p=JSON.parse(sidPolicy['budget-topic-policy.json'].content);p.Statement[0].Sid='AllowScopedBudget';p.Statement[0].Action=['SNS:Publish'];p.Statement[0].Resource=[TOPIC];p.Statement[0].Principal.Service=['budgets.amazonaws.com'];sidPolicy['budget-topic-policy.json'].content=JSON.stringify(p);alt('equivalent policy Sid and singleton forms',isol,{...interview,files:sidPolicy});
loses('inventory alone',['aws ec2 describe-volumes','aws ec2 describe-snapshots','aws ec2 describe-addresses','aws logs describe-log-groups',final]);
loses('delete source before snapshot',[sol[2],sol[0],sol[1],...sol.slice(3)]);
loses('wait wrong snapshot',[sol[0],sol[1].replace(NEW,KEEP),...sol.slice(2)]);
loses('snapshot wrong volume',[sol[0].replace(WASTE,PROD),...sol.slice(1)]);
loses('delete only protected recovery',[...sol.slice(0,5),sol[5].replace(OLD,KEEP),...sol.slice(6)]);
loses('delete fresh recovery',[...sol.slice(0,5),sol[5].replace(OLD,NEW),...sol.slice(6)]);
loses('delete protected audit volume',[...sol.slice(0,2),sol[2].replace(WASTE,AUDIT),...sol.slice(3)]);
for(const command of [sol[3].replace('--throughput 250','--throughput 125'),sol[3].replace(' --throughput 250',''),sol[3].replace('gp3','gp2'),sol[3].replace('--iops 3000','--iops 6000'),sol[3]+' --size 2000',sol[3].replace(PROD,AUDIT)])loses('wrong type/performance/size target',[...sol.slice(0,3),command,...sol.slice(4)]);
loses('compliance retention shortened',[...sol.slice(0,6),sol[6].replace('/shopkaro/dev','/shopkaro/audit'),...sol.slice(7)]);
loses('zero dev retention',[...sol.slice(0,6),sol[6].replace('14','0'),...sol.slice(7)]);
loses('release associated IP',[...sol.slice(0,4),sol[4].replace('00000000001','00000000002'),...sol.slice(5)]);
loses('budget no notice',[...sol.slice(0,7),sol[7].replace(/ --notifications-with-subscribers.*$/,''),final]);
loses('projected final read',[...sol.slice(0,-1),final+' --query Budget.BudgetName']);
loses('wrong account read',[...sol.slice(0,-1),final.replace(ACCT,'555555555555')]);
loses('wrong name read',[...sol.slice(0,-1),final.replace(BNAME,'other-budget')]);
const wrongFiles=(file,mutate,stage=mission)=>{const files=copy(stage.files),d=JSON.parse(files[file].content);mutate(d);files[file].content=JSON.stringify(d);return {...stage,files};};
for(const [label,mutate] of [['high limit',b=>b.BudgetLimit.Amount='100000'],['low limit',b=>b.BudgetLimit.Amount='1'],['wrong units',b=>b.BudgetLimit.Unit='INR'],['wrong period',b=>b.TimeUnit='DAILY'],['wrong type',b=>b.BudgetType='USAGE']])loses(label,sol,wrongFiles('budget.json',mutate));
for(const [label,mutate] of [['forecast only',n=>n[0].Notification.NotificationType='FORECASTED'],['threshold high',n=>n[0].Notification.Threshold=200],['wrong operator',n=>n[0].Notification.ComparisonOperator='LESS_THAN'],['absolute dollars',n=>n[0].Notification.ThresholdType='ABSOLUTE_VALUE'],['missing subscriber',n=>n[0].Subscribers=[]],['wrong topic',n=>n[0].Subscribers[0].Address=TOPIC+'-other']])loses(label,sol,wrongFiles('notifications.json',mutate));
for(const [label,mutate] of [['broad principal',p=>p.Statement[0].Principal='*'],['broad resource',p=>p.Statement[0].Resource='*'],['no source account',p=>delete p.Statement[0].Condition.StringEquals],['wrong source account',p=>p.Statement[0].Condition.StringEquals['aws:SourceAccount']='555555555555'],['wild action',p=>p.Statement[0].Action='SNS:*'],['extra public allow',p=>p.Statement.push({Effect:'Allow',Principal:'*',Action:'SNS:Publish',Resource:TOPIC})]])loses(label,isol,wrongFiles('budget-topic-policy.json',mutate,interview));
// Read receipts are current-state snapshots, not command-history evidence.
for(const mutate of [s=>s.account.volumes.find(v=>v.id===PROD).testData=[],s=>s.account.volumes.find(v=>v.id===PROD).encrypted=false,s=>s.account.volumes.find(v=>v.id===PROD).throughput=125,s=>s.account.snapshots=s.account.snapshots.filter(v=>v.id!==KEEP),s=>s.account.snapshots.find(v=>v.id===NEW).state='pending',s=>s.account.logGroups.find(g=>g.name==='/shopkaro/dev').events=[],s=>s.account.logGroups.find(g=>g.name==='/shopkaro/audit').retention=1,s=>s.account.budgets[0].notifications=[],s=>s.account.instances.pop(),s=>s.account.callerIdentity.Account='555555555555',s=>s.account.region='us-west-2']){
 const r=run(never,[...sol,s=>{mutate(s);return 'aws ec2 describe-volumes';}]);check(!mission.success(r.state),'corrupt live state cannot keep prior win receipt');}
const badJson=[null,[],{},1,'x',{BudgetName:'x',BudgetLimit:null},{BudgetName:'x',BudgetLimit:{Amount:[]}},[{Notification:null,Subscribers:[]}]];
for(const bad of badJson){for(const f of ['budget.json','notifications.json']){const files=copy(mission.files);files[f].content=JSON.stringify(bad);const r=run({...never,files},[sol[7]]);check(!r.text.includes('simulator error')&&r.state.account.budgets.length===(f==='notifications.json'&&Array.isArray(bad)&&bad.length===0?1:0),'bad nested budget/notice atomic and handled');}}
for(const raw of ['{"__proto__":{"polluted":true}}','{"constructor":{"prototype":{"polluted":true}}}',JSON.stringify({nested:Array.from({length:1},()=>null)})]){const files=copy(mission.files);files['budget.json'].content=raw;const r=run({...never,files},[sol[7]]);check(r.state.account.budgets.length===0&&!r.text.includes('simulator error'),'unsafe/malformed JSON rejected atomically');}
let nested={};for(let i=0;i<50;i++)nested={nested};const deep=copy(mission.files);deep['budget.json'].content=JSON.stringify(nested);const dr=run({...never,files:deep},[sol[7]]);check(!dr.text.includes('simulator error')&&dr.text.includes('nesting'),'deep input gets bounded useful error');
const badAddress=run(never,['aws ec2 describe-addresses --allocation-ids missing']);check(badAddress.text.includes('InvalidAllocationID.NotFound'),'unknown address selector typed error');
const otherOwner=run(never,['aws ec2 describe-snapshots --owner-ids 555555555555']);check(!otherOwner.text.includes(KEEP),'owner filter does not leak unrelated fixture snapshots');
const grouped=run(never,['aws ce get-cost-and-usage --time-period Start=2026-10-01,End=2026-11-01 --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=USAGE_TYPE']);check(grouped.text.includes('Network-Processing-Transfer')&&!grouped.text.includes('6818.18'),'recorded group-by and selected period respected');
const help=run(never,['help']);check(help.text.includes('Cost fixture:')&&!help.text.includes('terraform init'),'scoped cost help');
const garbage=['',' ','?','sudo aws ec2 describe-volumes','AWS EC2 describe-volumes','aws ec2 delete-volume','aws ec2 delete-volume --volume-id missing','aws ec2 create-snapshot --volume-id missing','aws ec2 wait','aws ec2 wait snapshot-completed','aws ec2 wait snapshot-completed --snapshot-ids missing','aws ec2 modify-volume --volume-id '+PROD+' --iops 0','aws ec2 modify-volume --volume-id '+PROD+' --volume-type gp3 --size 1','aws ec2 modify-volume --volume-id '+PROD+' --volume-type gp3 --throughput 9000','aws logs put-retention-policy --log-group-name /shopkaro/dev --retention-in-days 13','aws logs put-retention-policy --log-group-name /shopkaro/dev --retention-in-days NaN','aws budgets create-budget --account-id '+ACCT+' --budget bad','aws budgets describe-budget','aws ec2 describe-volumes --filters garbage','aws ec2 describe-volumes --query','aws ec2 describe-volumes --output nonsense','aws ec2 describe-volumes --volume-ids missing','aws ec2 describe-volumes --unknown','aws ec2 describe-volumes --region us-west-2',"aws ec2 describe-volumes 'bad",'terraform destroy -auto-approve','apply -f budget.json','rm -rf /','reset'];
const fuzz=run(never,garbage);check(!fuzz.text.includes('simulator error'),'garbage does not reach global crash handler');check(!mission.success(fuzz.state),'garbage cannot win');check(run(mission,sol).done===1,'reset after garbage');
const missingDry=run(never,['aws ec2 delete-volume --dry-run']);check(missingDry.text.includes('required')&&!missingDry.text.includes('would have succeeded'),'dry-run still requires CLI arguments');
const dry=run(never,[...sol.slice(0,7),sol[7]+' --dry-run']);check(!dry.state.account.budgets.length,'dry-run never mutates');
const history=run(never,['aws ce get-cost-and-usage --time-period Start=2026-09-01,End=2026-11-01 --granularity MONTHLY --metrics UnblendedCost',...sol,'aws ce get-cost-and-usage --time-period Start=2026-09-01,End=2026-11-01 --granularity MONTHLY --metrics UnblendedCost']);check(JSON.stringify(history.state.account.costHistory)===JSON.stringify(mission.account.costHistory),'cleanup never rewrites recorded historical costs');check(history.text.includes('Fictional recorded'),'CE dataset explicit');
let count=0,winners=0;const flow=level.stages.find(s=>s.type==='flowlab');for(let coverage=0;coverage<=150;coverage+=25)for(let term=0;term<2;term++)for(let drop=0;drop<=50;drop+=10){const k={coverage,term,drop},m=AG.costCommitmentPlan(k);check(flow.check(k)===m.ok&&flow.model(k).verdict.ok===m.ok,'planner verdict agrees');check([m.C,m.od,m.total,m.wasted,m.saving,m.waste].every(Number.isFinite),'finite readouts');count++;if(m.ok)winners++;}check(count===84&&winners>0,'planner solvable84states '+winners);check(!flow.check({coverage:0,term:0,drop:0}),'planner not initially solved');check(!flow.check({coverage:150,term:1,drop:50}),'high commitment downside loses');check(AG.costCommitmentPlan({coverage:0,term:0,drop:50}).waste===0,'zero commitment waste denominator guarded');
const qs=[];for(const st of level.stages){if(st.questions)qs.push(...st.questions);if(st.observe)qs.push(st.observe);for(const step of st.steps||[])if(step.ask)qs.push(step.ask);}qs.push(...level.interview.questions.filter(q=>q.choices));let flagged=0;const positions=[0,0,0,0];for(const q of qs){positions[q.answer]++;const n=q.choices.map(x=>x.length),r=n[q.answer],wrong=n.filter((_,i)=>i!==q.answer);if(r>=1.15*Math.max(...wrong)||r<=.85*Math.min(...wrong)){flagged++;console.log('BIAS',q.q,n);}check(q.explain.length>80,'meaningful MCQ explanations');}check(flagged/qs.length<.05,'length flags under5% '+flagged+'/'+qs.length);check(Math.max(...positions)-Math.min(...positions)<=1,'positions '+positions);
check(!crashes.length,'no console errors '+crashes.join('; '));console.log(`Cost focused: ${checks} checks · ${count} commitment states/${winners} fits · ${qs.length} MCQs/${flagged} length flags · positions ${positions.join('/')} · final-only missions`);
