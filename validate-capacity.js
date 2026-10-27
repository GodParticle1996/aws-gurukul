#!/usr/bin/env node
// Capacity/configuration/evidence regressions; offline only.
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
const level=AG.findLevel('boss2'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal,clone=x=>JSON.parse(JSON.stringify(x));
const never={...mission,success:()=>false},neverI={...interview,success:()=>false},commands=mission.solution;
const R='us-east-1',A='123456789012',UUID='11111111-1111-4111-8111-111111111111',TOPIC=`arn:aws:sns:${R}:${A}:sale-alerts`,URL=`https://sqs.${R}.amazonaws.com/${A}/ops-alerts`,WORK=`https://sqs.${R}.amazonaws.com/${A}/email-work`;
const baseAlarm=JSON.parse(mission.files['p95-alarm.json'].content);
const files=(name,value,base=never)=>{const f=clone(base.files);f[name]={...f[name],content:typeof value==='string'?value:JSON.stringify(value)};return {...base,files:f};};
for(const stage of [mission,interview]){
 const r=run(stage,stage.solution);check(r.done===1,'intended win '+r.text);check(r.trace.slice(0,-1).every(n=>!n)&&r.trace.at(-1)===1,'final action only');check(stage.tasks.every(t=>t.check(r.state)),'all tasks agree');check(run(stage,stage.solution).done===1,'clean replay reset');
 for(let i=0;i<stage.solution.length;i++)check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'every omission loses '+i);
 check(!run(stage,['help','aws cloudwatch describe-alarms','aws rds describe-db-instances','aws autoscaling describe-auto-scaling-groups']).done,'read-only cannot win');
}
const solved=run(never,commands);check(mission.success(solved.state),'reference solved state');check(solved.state.account.asgs[0].desired===12,'schedule does not immediately scale down');check(solved.text.includes('"StateValue": "ALARM"'),'tail breach visible rather than fake green');check(solved.state.account.rds[0].resourceId!==solved.state.account.rds[1].resourceId,'replica has distinct physical identity');
for(const action of [
 'aws sqs purge-queue --queue-url '+WORK,'aws sqs delete-queue --queue-url '+WORK,
 'aws sqs delete-queue --queue-url '+URL,'aws sqs purge-queue --queue-url '+URL,
 'aws sns delete-topic --topic-arn '+TOPIC,
 'aws lambda put-function-concurrency --function-name sale-email --reserved-concurrent-executions 0',
 `aws lambda update-event-source-mapping --uuid ${UUID} --scaling-config '{"MaximumConcurrency":1000}'`,
 `aws lambda update-event-source-mapping --uuid ${UUID} --no-enabled`,
 `aws lambda delete-event-source-mapping --uuid ${UUID}`,
 'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shop-sale --min-size 0 --max-size 0 --desired-capacity 0',
 'aws autoscaling update-auto-scaling-group --auto-scaling-group-name shop-sale --min-size 12 --max-size 200 --desired-capacity 100',
 'aws autoscaling delete-scheduled-action --auto-scaling-group-name shop-sale --scheduled-action-name sale-down',
 'aws cloudwatch disable-alarm-actions --alarm-names sale-p95','aws cloudwatch delete-alarms --alarm-names sale-p95',
 'aws cloudwatch set-alarm-state --alarm-name sale-p95 --state-value OK --state-reason testing',
 'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --cidr 0.0.0.0/0'
])check(!mission.success(run(never,[...commands,action]).state),'current readiness revoked after '+action);
// Current state, identities, telemetry and safety remain required even after the exact solution.
for(const mutate of [a=>a.rds[0].multiAZ=false,a=>a.rds[0].backupRetention=0,a=>a.rds[0].publicAccess=true,a=>a.rds[0].deletionProtection=false,a=>a.rds[0].resourceId='new-db',a=>a.rds[0].dataFixture=[],a=>a.rds[1].state='creating',a=>a.rds[1].publicAccess=true,a=>a.rds[1].source='different',a=>a.asgs[0].launchTemplate.sgIds=['sg-world'],a=>a.asgs[0].healthCheckType='EC2',a=>a.targetGroups[0].matcher='200-499',a=>a.instances[0].appHealthy=false,a=>a.instances[0].publicIp='1.2.3.4',a=>a.eventSourceMappings[0].responseTypes=[],a=>a.roles[0].lambda.receiveQueues=[],a=>a.queues[0].messages[0].body='{}',a=>a.queues[0].queueId='recreated',a=>a.queues[1].queueId='recreated',a=>a.topics[0].topicId='recreated',a=>a.queues[1].policy.Statement[0].Principal='*',a=>a.topics[0].subscriptions[0].attributes.RawMessageDelivery='false',a=>a.capacityMetrics[0].version++,a=>a.capacityMetrics[0].points=[],a=>a.capacityMetrics[0].points.forEach(p=>p.SampleCount=5),a=>a.messagingClock=1000]){const s=clone(solved.state);mutate(s.account);check(!mission.success(s),'mutated real state cannot retain success '+mutate.toString());}
for(const i of [9,11])check(!run(mission,commands.map((c,j)=>j===i?c+' --query Missing':c)).done,'invalid/missing output cannot certify '+i);
const manual=commands.map((c,i)=>i===9?'aws cloudwatch set-alarm-state --alarm-name sale-p95 --state-value ALARM --state-reason manual':c);check(!run(mission,manual).done,'manual ALARM does not certify observed fixture');
const injected=commands.map((c,i)=>i===10?`aws sqs send-message --queue-url ${URL} --message-body file://readiness.json`:c);check(!run(mission,injected).done,'direct queue injection lacks SNS provenance');
for(const change of [d=>{d.Statistic='Average';delete d.ExtendedStatistic;},d=>d.Threshold=400,d=>d.Unit='Milliseconds',d=>d.Dimensions[0].Value='wrong',d=>d.AlarmActions=[],d=>d.ActionsEnabled=false,d=>d.TreatMissingData='notBreaching',d=>d.DatapointsToAlarm=1]){const d=clone(baseAlarm);change(d);check(!run(files('p95-alarm.json',d,mission),commands).done,'wrong plausible alarm config cannot win');}
// Legitimate alternative CLI spelling/order and replacing a corrected alarm with fresh readback work.
check(run(mission,commands.map(c=>c.replace(' --uuid ','\t--uuid=').replace(' --function-name sale-email',' --function-name=sale-email'))).done===1,'whitespace and equals flags');
const direct=`aws cloudwatch put-metric-alarm --alarm-name sale-p95 --namespace AWS/ApplicationELB --metric-name TargetResponseTime --dimensions Name=LoadBalancer,Value=app/shop-sale/0000000000000020 --extended-statistic p95 --threshold 0.4 --comparison-operator GreaterThanThreshold --unit Seconds --period 60 --evaluation-periods 3 --datapoints-to-alarm 2 --treat-missing-data missing --evaluate-low-sample-count-percentile ignore --alarm-actions ${TOPIC} --actions-enabled`;
check(run(mission,commands.map((c,i)=>i===8?direct:c)).done===1,'actual CLI flags alternative to JSON');
const recreated=run(never,[...commands,'aws cloudwatch delete-alarms --alarm-names sale-p95',commands[8]]);check(!mission.success(recreated.state),'deleted/recreated alarm cannot reuse old read identity');check(mission.success(run(never,[...commands,'aws cloudwatch delete-alarms --alarm-names sale-p95',commands[8],commands[9]]).state),'fresh read recertifies corrected recreated alarm');
for(const value of ['null','[]','{"MaximumConcurrency":1}','{"MaximumConcurrency":1001}','{"MaximumConcurrency":"20"}','{"MaximumConcurrency":2.5}','{"MaximumConcurrency":20,"bad":true}']){const r=run(neverI,[interview.solution[0],`aws lambda update-event-source-mapping --uuid ${UUID} --scaling-config '${value}'`]);check(r.state.account.eventSourceMappings[0].scalingConfig.MaximumConcurrency===1000,'malformed mapping atomic '+value);check(!interview.success(r.state),'invalid mapping cannot win');}
const removed=run(neverI,[`aws lambda update-event-source-mapping --uuid ${UUID} --scaling-config '{}'`,interview.solution[2]]);check(sameEmpty(removed.state.account.eventSourceMappings[0].scalingConfig),'valid empty scaling config removes cap');function sameEmpty(v){return v&&Object.keys(v).length===0;}
const before=clone(mission.account.asgs[0]);for(const tail of ['--start-time 2026-11-05T05:15:00Z --min-size 12 --max-size 16 --desired-capacity 12',"--recurrence '15 10 * * *' --time-zone Asia/Kolkata --min-size 12 --max-size 16 --desired-capacity 12"]){const r=run(never,['aws autoscaling put-scheduled-update-group-action --auto-scaling-group-name shop-sale --scheduled-action-name trial '+tail]);check(JSON.stringify(r.state.account.asgs[0])===JSON.stringify(before),'future schedule metadata leaves actual group untouched');check(r.state.account.scheduledActions.length===1,'real five-field/timezone or UTC schedule stored');}
for(const tail of ['--start-time 2026-02-30T05:15:00Z','--start-time 2020-01-01T00:00:00Z',"--recurrence '15 10 * * ? *'","--recurrence '90 10 * * *'","--recurrence '15 10 * * *' --time-zone Mars/Unknown",'--start-time 2026-11-05T05:15:00Z --time-zone Asia/Kolkata']){const r=run(never,['aws autoscaling put-scheduled-update-group-action --auto-scaling-group-name shop-sale --scheduled-action-name trial --desired-capacity 6 '+tail]);check(!r.state.account.scheduledActions?.length,'bad schedule atomic '+tail);check(!r.text.includes('simulator error:'),'schedule error useful');}
const dup=run(never,[commands[3],commands[3].replace('sale-up','another')]);check(dup.state.account.scheduledActions.length===1&&dup.text.includes('AlreadyExists'),'duplicate group/time rejected');
// Supplied aggregate semantics: tail vs mean, missing/low samples/manual state and no arbitrary resampling.
const a=clone(solved.state.account),alarm=a.alarms[0];check(AG.capacityAlarmSnapshot(a,alarm).state==='ALARM','2of3tail breach');
alarm.definition.Statistic='Average';delete alarm.definition.ExtendedStatistic;check(AG.capacityAlarmSnapshot(a,alarm).state==='OK','average can hide tail');
alarm.definition=clone(baseAlarm);a.capacityMetrics[0].points=[];check(AG.capacityAlarmSnapshot(a,alarm).state==='INSUFFICIENT_DATA','missing not healthy');alarm.definition.TreatMissingData='breaching';check(AG.capacityAlarmSnapshot(a,alarm).state==='ALARM','explicit missing breaching');alarm.definition.TreatMissingData='notBreaching';check(AG.capacityAlarmSnapshot(a,alarm).state==='OK'&&AG.capacityAlarmSnapshot(a,alarm).source==='filled-missing','filled state distinguished from observations');
a.capacityMetrics=clone(solved.state.account.capacityMetrics);alarm.definition=clone(baseAlarm);a.capacityMetrics[0].points.forEach(p=>p.SampleCount=5);alarm.state='OK';check(AG.capacityAlarmSnapshot(a,alarm).source==='held-low-samples','low samples holds prior not health');
const metric=`aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name TargetResponseTime --dimensions Name=LoadBalancer,Value=app/shop-sale/0000000000000020 --start-time 2026-11-05T05:07:00Z --end-time 2026-11-05T05:10:00Z --period 60 --statistics Average --extended-statistics p95`;
check(run(never,[metric]).text.includes('"p95": 0.65'),'actual provided statistics returned');check(run(never,[metric.replace('--period 60','--period 300')]).text.includes('arbitrary resampling'),'different aggregation rejected honestly');
const garbage=['',' ','garbage','aws','aws cloudwatch','sudo aws cloudwatch describe-alarms','AWS CLOUDWATCH DESCRIBE-ALARMS','aws cloudwatch unsupported','aws cloudwatch put-metric-alarm --cli-input-json null','aws cloudwatch put-metric-alarm --cli-input-json file://missing','aws cloudwatch describe-alarms --state-value Wrong','aws cloudwatch set-alarm-state --alarm-name missing --state-value OK --state-reason test','aws cloudwatch put-metric-alarm --alarm-name x --alarm-name y','aws cloudwatch get-metric-statistics --period 60','aws autoscaling put-scheduled-update-group-action --scheduled-action-name x','aws autoscaling describe-scheduled-actions --auto-scaling-group-name missing','aws lambda update-event-source-mapping --uuid missing --scaling-config null'];
for(let i=0;i<120;i++)garbage.push('aws '+['cloudwatch','autoscaling','lambda'][i%3]+' '+['put-metric-alarm','get-metric-statistics','put-scheduled-update-group-action','update-event-source-mapping'][i%4]+' --'+['query','cli-input-json','period','dimensions','scaling-config'][i%5]+' '+['null','[]','{}','constructor','__proto__','-1','',"'unterminated"][i%8]);
for(const command of garbage){const r=run(never,[command]);check(!/simulator error:|is not defined|Cannot read properties|is not a function/.test(r.text),'malformed input no internal exception '+command);check(!r.state||!mission.success(r.state),'garbage cannot win');}
for(const value of [null,[],{},'0.4',Infinity]){const d={...baseAlarm,Threshold:value};const r=run(files('p95-alarm.json',d),[commands[8]]);check(r.state.account.alarms[0].revision===0,'typed threshold invalid and atomic');}
for(const key of ['Period','EvaluationPeriods','DatapointsToAlarm'])for(const value of [true,null,'60',[],{}]){const d={...baseAlarm,[key]:value};const r=run(files('p95-alarm.json',d),[commands[8]]);check(r.state.account.alarms[0].revision===0,'typed numeric config atomic '+key+'/'+JSON.stringify(value));}
let states=0,wins=0;const flow=level.stages.find(s=>s.type==='flowlab');function sweep(i,k){if(i===flow.knobs.length){const m=flow.model(k),ok=flow.check(k);check(m.verdict.ok===ok,'planner verdict agrees');check(m.readouts.every(r=>!String(r.value).includes('NaN')),'no NaN');if(ok){wins++;check(k.peak>=1&&k.readers>=1&&k.queue===1&&k.email===3&&k.workers>=2,'no shrink/delete/unsafe consumer shortcut');}states++;return;}const n=flow.knobs[i];for(let v=n.min;v<=n.max;v+=n.step)sweep(i+1,{...k,[n.id]:v});}sweep(0,{});check(wins>0,'planner solvable');
const example=flow.model({peak:1,hit:1,readers:1,workers:2,email:3,queue:1});for(const [i,text]of [[0,'2240'],[1,'558.4'],[2,'633.6'],[3,'320'],[4,'83.3'],[5,'0.2881']])check(example.readouts[i].value.includes(text),'reference budget arithmetic '+text);
const qs=[...level.stages.flatMap(s=>s.type==='quiz'||s.type==='triage'?s.questions||[]:s.observe?[s.observe]:[]),...level.interview.questions.filter(q=>!q.terminal)],positions=[0,0,0,0];let flags=0;for(const item of qs){positions[item.answer]++;const size=item.choices[item.answer].length,wrong=item.choices.filter((_,i)=>i!==item.answer).map(s=>s.length);if(wrong.every(n=>size>=n*1.15)||wrong.every(n=>size<=n*.85)){flags++;console.log('LENGTH FLAG',item.q,item.choices.map(s=>s.length));}check(item.explain.length>70,'explanation covers alternatives');}check(flags/qs.length<.05,'MCQ length bias under5% '+flags+'/'+qs.length);check(Math.max(...positions)-Math.min(...positions)<=1,'position balance '+positions);
for(const item of level.stages[0].steps.filter(s=>s.ask).map(s=>s.ask)){const size=item.choices[item.answer].length,wrong=item.choices.filter((_,i)=>i!==item.answer).map(s=>s.length);check(!wrong.every(n=>size>=1.15*n)&&!wrong.every(n=>size<=.85*n),'inline length bias '+item.q);}
check(!crashes.length,'no hidden simulator crashes '+crashes.join('\n'));console.log(`   ✓ ${checks.toLocaleString('en-US')} capacity checks · ${states} planner states · ${qs.length} MCQs (${flags} length flags; positions ${positions})`);module.exports={checks,states,flags};
