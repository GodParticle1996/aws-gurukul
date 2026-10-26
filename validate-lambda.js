#!/usr/bin/env node
// Focused Lambda state, output, retry configuration and parser regressions. No AWS or Moto calls.
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
const level=AG.findLevel('lambda'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal;
const never={...mission,success:()=>false},json=x=>JSON.parse(JSON.stringify(x)),f=s=>s.account.lambdas.find(f=>f.name==='photo-resize');
const withFile=(name,value,base=never)=>({...base,files:{...base.files,[name]:{content:typeof value==='string'?value:JSON.stringify(value)}}});
function solved(stage){const r=run(stage,stage.solution);check(r.done===1,'intended solution wins: '+r.text);check(r.trace.slice(0,-1).every(x=>x===0)&&r.trace.at(-1)===1,'wins only at final result state');check(stage.tasks.every(t=>t.check(r.state)),'all tasks agree');return r;}
for(const stage of [mission,interview]){solved(stage);solved(stage);for(let i=0;i<stage.solution.length;i++)check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'every omitted step fails '+i);check(!stage.success(run({...stage,success:()=>false},['help']).state),'fresh replay incomplete');}
const complete=solved(mission),invoke=mission.solution.at(-1);
check(complete.state.account.buckets.find(b=>b.name==='shop-thumbs').objects.length===3,'three actual fixture derivative objects');
check(complete.state.downloads['invoke.json'].body.results[0].written===3,'response agrees with created objects');
const replay=run(never,[...mission.solution,invoke]);check(replay.state.downloads['invoke.json'].body.results[0].written===0&&replay.state.downloads['invoke.json'].body.results[0].duplicates===3,'duplicate verifies same derivatives without adding data');check(mission.success(replay.state),'duplicate-safe result remains correct');
const inspectOnly=run(mission,['aws lambda list-functions','aws lambda get-function --function-name photo-resize','aws lambda get-function-configuration --function-name photo-resize','aws logs tail /aws/lambda/photo-resize']);check(!inspectOnly.done,'read-only inspection cannot win');
const throttled=run(never,[invoke]);check(throttled.text.includes('TooManyRequestsException')&&!throttled.state.downloads,'initial cap throttle does not execute');
const timeout=run(never,[mission.solution[2],invoke]);check(timeout.text.includes('FunctionError')&&timeout.state.downloads['invoke.json'].error&&timeout.text.includes('Task timed out after 3.00 seconds'),'status200 contains real function timeout failure');
const pending=run(never,[mission.solution[0]]);check(f(pending.state).memory===128&&f(pending.state).pendingConfig.memory===1024,'pending config retains prior runnable fixture');
for(const type of ['DryRun','Event']){const r=run(mission,[...mission.solution.slice(0,-1),invoke.replace('--payload','--invocation-type '+type+' --payload')]);check(!r.done&&!r.state.downloads,'accepted/dry-run is not completed output');}
const incorrectFunction=run(mission,[...mission.solution.slice(0,-1),invoke.replace('photo-resize','courier-webhook')]);check(!incorrectFunction.done,'wrong function/status cannot win');
check(!run(mission,mission.solution.map(c=>c.replace('--reserved-concurrent-executions 10','--reserved-concurrent-executions 0'))).done,'reserve0 shutdown cannot win');
check(!run(mission,mission.solution.map(c=>c.replace('--reserved-concurrent-executions 10','--reserved-concurrent-executions 900'))).done,'brute high reserve violates downstream cap');
check(!run(mission,mission.solution.map(c=>c.replace('--memory-size 1024','--memory-size 10240'))).done,'maximum-memory brute option violates budget contract');
check(!run(mission,mission.solution.map(c=>c.replace('--timeout 15','--timeout 900'))).done,'huge timeout cannot satisfy latency/deadline contract');
const noMappingFlag=run(mission,mission.solution.map(c=>c.replace(' --function-response-types ReportBatchItemFailures','')));check(!noMappingFlag.done,'partial handler alone does not configure poller');
const disabled=run(mission,mission.solution.map(c=>c.replace(' --enabled',' --no-enabled')));check(!disabled.done,'disabled mapping cannot win');
const wrongOutput=run(mission,mission.solution.map(c=>c.replace(' invoke.json',' wrong.json')));check(!wrongOutput.done,'wrong recovery output filename does not satisfy requested evidence');
const wrongVersion=json(JSON.parse(mission.files['event.json'].content));wrongVersion.Records[0].s3.object.versionId='missing';check(!run(withFile('event.json',wrongVersion,mission),mission.solution).done,'missing source version fails');
const wrongBody={...mission,account:json(mission.account)};wrongBody.account.buckets[0].versions['uploads/kurta.svg'][0].body='<svg viewBox="0 0 320 240">wrong</svg>';check(!run(wrongBody,mission.solution).done,'substituted original data cannot win');
const deleted=run(never,[...mission.solution,'aws lambda delete-function --function-name photo-resize']);check(!mission.success(deleted.state),'function deletion revokes goal');
const changed=run(never,[...mission.solution,'aws lambda update-function-configuration --function-name photo-resize --memory-size 1536','aws lambda wait function-updated-v2 --function-name photo-resize']);check(!mission.success(changed.state),'stale invoke result does not prove new config');
for(const command of ['aws lambda update-function-configuration --function-name photo-resize --memory-size NaN','aws lambda update-function-configuration --function-name photo-resize --memory-size 127','aws lambda update-function-configuration --function-name photo-resize --timeout 901','aws lambda update-function-configuration --function-name photo-resize --architectures mips','aws lambda update-function-configuration --function-name photo-resize --memory-size 1024 --memroy-size 2048']){const r=run(never,[command]);check(!f(r.state).pendingConfig&&f(r.state).memory===128,'invalid configuration atomic');check(!r.text.includes('simulator error:'),'invalid config handled');}
const conflict=run(never,[mission.solution[0],mission.solution[0]]);check(conflict.text.includes('ResourceConflictException'),'concurrent config update protected');
const arn=run(never,['aws lambda get-function-configuration --output text --query MemorySize --function-name arn:aws:lambda:ap-south-1:123456789012:function:photo-resize']);check(arn.text.includes('128'),'full ARN/query support');
const prefix=run(never,['aws lambda get-function --function-name photo']);check(prefix.text.includes('ResourceNotFoundException'),'exact function identity, no prefix mutation');
for(const cfg of [null,[],{OnFailure:null},{OnFailure:{Destination:'arn:aws:sqs:ap-south-1:123456789012:missing'}},{Unknown:{Destination:'x'}}]){const r=run(withFile('bad.json',cfg),[mission.solution[3].replace('destination.json','bad.json')]);check(!f(r.state).asyncConfigs,'invalid async destination atomic');}
for(const suffix of ['--maximum-retry-attempts 3','--maximum-event-age-in-seconds 59','--maximum-event-age-in-seconds 21601']){const r=run(never,['aws lambda put-function-event-invoke-config --function-name photo-resize '+suffix]);check(!f(r.state).asyncConfigs,'invalid retry/age atomic');}
const replace=run(never,[...mission.solution,'aws lambda put-function-event-invoke-config --function-name photo-resize --maximum-retry-attempts 1']);check(!f(replace.state).asyncConfigs.$LATEST.DestinationConfig&&!mission.success(replace.state),'PUT replaces omitted async fields');
const noRole={...never,account:json(mission.account)};noRole.account.roles[0].lambda.receiveQueues=[];check(run(noRole,[mission.solution[4]]).text.includes('Execution role'),'ESM role permissions checked');
const shortVisibility={...never,account:json(mission.account)};shortVisibility.account.queues[0].visibilityTimeout=5;check(!run(shortVisibility,[mission.solution[0],mission.solution[1],mission.solution[4]]).state.account.eventSourceMappings.length,'timeout greater than visibility rejected');
const fifo={...never,account:json(mission.account)};fifo.account.queues[0].isFifo=true;check(run(fifo,[mission.solution[4]]).text.includes('Standard SQS'),'FIFO cannot be treated as unordered batch fixture');
const zeroVisibility={...never,account:json(mission.account)};zeroVisibility.account.queues[0].visibilityTimeout=0;check(!run(zeroVisibility,[mission.solution[4]]).state.account.eventSourceMappings.length,'zero visibility does not fall back to default30');
const duplicateMap=run(never,[mission.solution[4],mission.solution[4]]);check(duplicateMap.state.account.eventSourceMappings.length===1&&duplicateMap.text.includes('ResourceConflictException'),'duplicate mapping not extra capacity cheat');
const wrongMap=run(never,[mission.solution[4].replace('photo-jobs','missing')]);check(wrongMap.state.account.eventSourceMappings.length===0,'nonexistent event source rejected');
const malformed=[null,{},[],{Records:[null]},{Records:[{eventSource:'aws:s3',s3:null}]},{Records:[{eventSource:'aws:s3',s3:{bucket:{name:'shop-uploads'},object:{key:'%ZZ',versionId:'v-photo'}}}]}];
for(const payload of malformed){const r=run(withFile('event.json',payload),mission.solution);check(!r.state.downloads||r.state.downloads['invoke.json'].error,'invalid handler payload useful failure');check(!r.text.includes('simulator error:'),'payload shape guarded');}
const corrupt={...never,account:json(interview.account)};corrupt.account.buckets[1].objects[0].body='corrupt';const corruption=run({...interview,success:()=>false,account:corrupt.account},interview.solution);check(corruption.state.downloads['batch-result.json'].body.batchItemFailures.length===2,'corrupt prior derivative is reported, not acknowledged');
const badBatch=withFile('batch.json',{Records:[{eventSource:'aws:sqs',messageId:'null-body',body:'null'}]}, {...interview,success:()=>false});check(run(badBatch,interview.solution).state.downloads['batch-result.json'].body.batchItemFailures[0].itemIdentifier==='null-body','malformed SQS body individually fails');
const pc=run(never,[mission.solution[0],mission.solution[1],'aws lambda publish-version --function-name photo-resize','aws lambda put-provisioned-concurrency-config --function-name photo-resize --qualifier 1 --provisioned-concurrent-executions 1','aws lambda get-provisioned-concurrency-config --function-name photo-resize --qualifier 1']);check(f(pc.state).provisioned['1'].status==='READY','qualified provisioned readiness');
check(run(never,['aws lambda put-provisioned-concurrency-config --function-name photo-resize --qualifier $LATEST --provisioned-concurrent-executions 1']).text.includes('published version'),'PC $LATEST rejected');
const pcOver=run(never,['aws lambda publish-version --function-name photo-resize','aws lambda put-provisioned-concurrency-config --function-name photo-resize --qualifier 1 --provisioned-concurrent-executions 3']);check(pcOver.text.includes('exceeds'),'PC cannot exceed reserved cap');
const publishedUpdate=run(never,['aws lambda publish-version --function-name photo-resize','aws lambda update-function-configuration --function-name photo-resize --qualifier 1 --memory-size 1024']);check(publishedUpdate.text.includes('Unknown options')||publishedUpdate.text.includes('immutable'),'published configuration not mutated');
const scoped=run(never,['aws lambda add-permission --function-name photo-resize --statement-id source-only --action lambda:InvokeFunction --principal s3.amazonaws.com --source-arn arn:aws:s3:::shop-uploads --source-account 123456789012','aws lambda get-policy --function-name photo-resize']);check(f(scoped.state).policy.Statement[0].Condition.ArnLike['AWS:SourceArn']==='arn:aws:s3:::shop-uploads','real scoped service policy stored');
const junk=['','aws','aws lambda','sudo aws lambda list-functions','AWS LAMBDA LIST-FUNCTIONS','aws lambda get-function-configuration --function-name __proto__','aws lambda create-event-source-mapping --function-name photo-resize --event-source-arn null','aws lambda invoke --function-name photo-resize --payload file://constructor out.json','aws lambda invoke --function-name photo-resize --payload null __proto__','aws lambda invoke --function-name photo-resize --invocation-type Wrong out.json','aws lambda get-event-source-mapping --uuid __proto__','aws lambda update-function-configuration --function-name photo-resize --timeout','aws lambda list-functions --query constructor','aws lambda wait restore-completed --function-name photo-resize'];check(!run(never,junk).text.includes('simulator error:'),'garbage/parser/prototype branches guarded');check(!crashes.length,'no internal errors');
const planner=level.stages.find(s=>s.type==='flowlab');let configurations=0,wins=0;
for(let memory=0;memory<=5;memory++)for(let base=100;base<=900;base+=200)for(let calls=0;calls<=3;calls++)for(let arch=0;arch<=1;arch++)for(let pc=0;pc<=2;pc++)for(let cold=0;cold<=3;cold++){const k={memory,base,calls,arch,pc,cold},m=planner.model(k);configurations++;check(m.readouts.every(r=>!/NaN|Infinity|undefined/.test(r.value)),'finite cost readouts');check(m.verdict.ok===planner.check(k),'planner goal consistent');if(calls<2||base<700||cold===0)check(!planner.check(k),'required work/observed-cold preserved');if(planner.check(k))wins++;}
check(configurations===2880&&wins>0,'all2880 planner settings');check(planner.check({memory:3,base:900,calls:2,arch:0,pc:0,cold:2}),'documented right-sizing wins');
for(const n of level.stages[0].nodes){const w=Math.max(180,84+12.4*n.label.length);check(n.x-w/2>=8&&n.x+w/2<=992,'horizontal diagram bounds');check(n.y>=34&&n.y<=486,'vertical diagram bounds');}
const qs=[...level.stages.flatMap(s=>s.questions||[]),...level.stages.filter(s=>s.observe).map(s=>s.observe),...level.interview.questions.filter(q=>q.choices)],positions=[0,0,0,0],bias=[];
for(const q of qs){const lengths=q.choices.map(c=>c.replace(/<[^>]*>/g,'').length),n=lengths[q.answer],others=lengths.filter((_,i)=>i!==q.answer);if(others.every(x=>n>=x*1.15)||others.every(x=>n<=x*.85))bias.push({q:q.q,lengths});positions[q.answer]++;check(!!q.explain,'explanation present');}
const dryQuestions=level.stages[0].steps.filter(s=>s.ask).map(s=>s.ask),dryPositions=[0,0,0];for(const q of dryQuestions){const n=q.choices[q.answer].length,other=q.choices.filter((_,i)=>i!==q.answer).map(x=>x.length);check(!other.every(x=>n>=x*1.15)&&!other.every(x=>n<=x*.85),'dryrun choices do not reveal answer by length');dryPositions[q.answer]++;}check(dryPositions.every(n=>n===1),'dryrun positions distributed across three inline choices');
check(bias.length/qs.length<.05,'MCQ length bias '+JSON.stringify(bias));check(Math.max(...positions)-Math.min(...positions)<=1,'balanced answer positions '+positions);check(!crashes.length,'no final internal errors');
console.log(`✅ ${checks} Lambda regression checks passed (${configurations} planner settings; state-changing repairs, source-version output, partial batch, throttles, parser and replay). MCQ bias ${bias.length}/${qs.length}; positions ${positions}.`);
