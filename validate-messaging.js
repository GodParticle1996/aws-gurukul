#!/usr/bin/env node
// SQS/SNS state, time, security, replay, parser and pedagogy regressions. Offline only.
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
const level=AG.findLevel('sqssns'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal;
const clone=x=>JSON.parse(JSON.stringify(x)),never={...mission,success:()=>false},neverI={...interview,success:()=>false};
const url=n=>'https://sqs.ap-south-1.amazonaws.com/123456789012/'+n,arn=n=>'arn:aws:sqs:ap-south-1:123456789012:'+n,TOPIC='arn:aws:sns:ap-south-1:123456789012:order-events';
const q=(s,n)=>s.account.queues.find(q=>q.name===n),attrs=(n,a)=>`aws sqs set-queue-attributes --queue-url ${url(n)} --attributes '${JSON.stringify(a)}'`;
const send=(n,body,extra='')=>`aws sqs send-message --queue-url ${url(n)} --message-body '${body}' ${extra}`;
const receive=(n,extra='')=>`aws sqs receive-message --queue-url ${url(n)} --message-system-attribute-names All ${extra}`;
const result=run(mission,mission.solution);check(result.done===1,'intended main wins '+result.text);check(result.trace.slice(0,-1).every(x=>x===0),'main wins only final returned body');check(mission.tasks.every(t=>t.check(result.state)),'main tasks all current');
for(const stage of [mission,interview]){const r=run(stage,stage.solution);check(r.done===1&&r.trace.slice(0,-1).every(n=>n===0),'intended only final step '+r.text);check(run(stage,stage.solution).done===1,'clean replay reset');for(let i=0;i<stage.solution.length;i++)check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'omission loses '+stage.title+' step'+i);}
check(!run(mission,['aws sqs list-queues','aws sns list-topics']).done,'reads only lose');
const prefix=mission.solution.slice(0,8),publish=mission.solution[8],reads=mission.solution.slice(9);
const noPolicy=run(never,mission.solution.filter((_,i)=>i!==4&&i!==5));check(!mission.success(noPolicy.state)&&noPolicy.state.account.snsDeliveries.every(d=>d.status==='denied-policy'),'publish acceptance without queue policy delivers no data');check(q(noPolicy.state,'email-queue').messages.length===0,'denied delivery leaves queue empty');
const direct=run(never,[...prefix,...['email-queue','invoice-queue'].map(n=>send(n,mission.files['order.json'].content)),...reads]);check(!mission.success(direct.state),'direct SQS injection cannot impersonate SNS delivery');
const broad=clone(mission.files);for(const n of ['email-queue','invoice-queue'])broad[n+'-policy.json'].content=JSON.stringify({Policy:JSON.stringify({Statement:[{Effect:'Allow',Principal:'*',Action:'sqs:*',Resource:'*'}]})});const publicStage={...never,files:broad};const publicRun=run(publicStage,mission.solution);check(publicRun.state.account.snsDeliveries.every(d=>d.status==='delivered')&&!mission.success(publicRun.state),'actual broad policy may deliver but fails least-privilege mission');
for(const variant of ['wrong-source','wrong-resource','wrong-service','explicit-deny','unsupported-condition']){const files=clone(mission.files);for(const n of ['email-queue','invoice-queue']){const a=JSON.parse(files[n+'-policy.json'].content),doc=JSON.parse(a.Policy),s=doc.Statement[0];if(variant==='wrong-source')s.Condition.ArnEquals['aws:SourceArn']=TOPIC+'-wrong';if(variant==='wrong-resource')s.Resource=arn('orders-dlq');if(variant==='wrong-service')s.Principal.Service='events.amazonaws.com';if(variant==='explicit-deny')doc.Statement.push({Effect:'Deny',Principal:'*',Action:'sqs:SendMessage',Resource:'*'});if(variant==='unsupported-condition')s.Condition.Bool={'aws:SecureTransport':'true'};a.Policy=JSON.stringify(doc);files[n+'-policy.json'].content=JSON.stringify(a);}const r=run({...never,files},mission.solution);check(!mission.success(r.state),'policy '+variant+' cannot win');check(r.state.account.queues.every(q=>q.messages.length===0),'no unauthorized delivery '+variant);}
for(const variant of ['attribute-scope','wrong-filter','envelope']){const files=clone(mission.files),sub=JSON.parse(files['subscription.json'].content);if(variant==='attribute-scope')delete sub.FilterPolicyScope;if(variant==='wrong-filter')sub.FilterPolicy='{"type":["OrderCancelled"]}';if(variant==='envelope')sub.RawMessageDelivery='false';files['subscription.json'].content=JSON.stringify(sub);check(!run({...mission,files},mission.solution).done,'wrong consumer contract loses '+variant);}
const cancelled=run(never,[...prefix,`aws sns publish --topic-arn ${TOPIC} --message '{"type":"OrderCancelled"}'`,...reads]);check(cancelled.state.account.queues.every(q=>!q.messages.length),'nonmatching body excluded');
const semanticallySame=clone(mission.files);semanticallySame['order.json'].content=JSON.stringify(JSON.parse(semanticallySame['order.json'].content));semanticallySame['subscription.json'].content=JSON.stringify({...JSON.parse(semanticallySame['subscription.json'].content),FilterPolicy:'{ "type" : [ "OrderPlaced" ] }'});check(run({...mission,files:semanticallySame},mission.solution).done===1,'valid JSON whitespace is not a cheat or a required answer spelling');
for(const command of [
 `aws sqs purge-queue --queue-url ${url('email-queue')}`,`aws sqs delete-queue --queue-url ${url('invoice-queue')}`,
 `aws sns delete-topic --topic-arn ${TOPIC}`,'sleep 120',
 s=>`aws sns unsubscribe --subscription-arn ${s.account.topics[0].subscriptions[0].subscriptionArn}`,
 s=>`aws sqs delete-message --queue-url ${url('email-queue')} --receipt-handle ${q(s,'email-queue').messages[0].receiptHandle}`
]){const r=run(never,[...mission.solution,command]);check(!mission.success(r.state),'removal/expiry revokes live proof');}
check(!run(mission,[...prefix,publish,reads[0],reads[1]+' --query Invalid.path']).done,'output with no actual body is not receipt proof');
check(!run(mission,[...prefix,publish,reads[0],reads[1]+' --query "Messages[?"']).done,'failed query cannot qualify');
const newRevision=run(never,[...mission.solution,attrs('email-queue',{VisibilityTimeout:'120'})]);check(!mission.success(newRevision.state),'old proof does not certify later queue revision');
const badI=run(neverI,[interview.solution[0],`aws sqs purge-queue --queue-url ${url('invoice-queue')}`,...interview.solution.slice(1)]);check(!interview.success(badI.state),'purge original work loses');
const recreateI=run(neverI,[`aws sqs delete-queue --queue-url ${url('invoice-queue')}`,'aws sqs create-queue --queue-name invoice-queue',...interview.solution]);check(!interview.success(recreateI.state),'recreating original source cannot fake original identity');
const iDone=run(neverI,interview.solution);check(q(iDone.state,'orders-dlq').messages[0].body.includes('"orderId":null'),'actual poison body conserved');check(q(iDone.state,'invoice-queue').messages[0].messageId==='original-good','good job conserved');check(!interview.success(run(neverI,[...interview.solution,'sleep 120']).state),'expired receipts cannot prove current interview read');
const base={...never,account:{region:'ap-south-1',now:'2026-10-26T00:00:00Z',queues:[],topics:[]}};
const create='aws sqs create-queue --queue-name jobs';
let r=run(base,[create,create,send('jobs','hello'),receive('jobs'),receive('jobs')]);check(r.state.account.queues.length===1,'create queue idempotent');check(q(r.state,'jobs').messages[0].receiveCount===1,'inflight message unavailable');check(r.text.includes('receipt-'),'fresh receipt returned');
r=run(base,[create,send('jobs','hello'),receive('jobs'),'sleep 30',receive('jobs')]);check(q(r.state,'jobs').messages[0].receiveCount===2,'visibility expiry returns actual message');check(r.text.includes('ApproximateReceiveCount'),'system receive count exposed');
r=run(base,[create,send('jobs','hello','--delay-seconds 10'),receive('jobs'),'sleep 9',receive('jobs'),'sleep 1',receive('jobs')]);check(q(r.state,'jobs').messages[0].receiveCount===1,'initial delay respected');
r=run(base,[create,send('jobs','hello'),receive('jobs'),s=>`aws sqs change-message-visibility --queue-url ${url('jobs')} --receipt-handle ${q(s,'jobs').messages[0].receiptHandle} --visibility-timeout 0`,receive('jobs')]);check(q(r.state,'jobs').messages[0].receiveCount===2,'change visibility0 releases message');
r=run(base,[create,send('jobs','hello'),receive('jobs'),'sleep 30',receive('jobs'),`aws sqs delete-message --queue-url ${url('jobs')} --receipt-handle receipt-000003`]);check(q(r.state,'jobs').messages.length===1&&r.text.includes('ReceiptHandleIsInvalid'),'stale receipt cannot delete fresh delivery');
r=run(base,[create,send('jobs','hello'),receive('jobs'),s=>`aws sqs delete-message --queue-url ${url('jobs')} --receipt-handle ${q(s,'jobs').messages[0].receiptHandle}`]);check(q(r.state,'jobs').messages.length===0,'latest valid receipt deletes');
r=run(base,[create,attrs('jobs',{MessageRetentionPeriod:'60'}),send('jobs','expire'),'sleep 60',receive('jobs')]);check(q(r.state,'jobs').messages.length===0,'retention expires actual data');
const fifo='aws sqs create-queue --queue-name ordered.fifo --attributes \'{"FifoQueue":"true","ContentBasedDeduplication":"true"}\'';
const fsnd=(body,group,id)=>send('ordered.fifo',body,`--message-group-id ${group}`+(id?' --message-deduplication-id '+id:''));
r=run(base,[fifo,fsnd('a1','A','a1'),fsnd('a1','A','a1'),fsnd('a2','A','a2'),fsnd('b1','B','b1'),receive('ordered.fifo'),receive('ordered.fifo','--max-number-of-messages 10')]);check(q(r.state,'ordered.fifo').messages.length===3,'FIFO duplicate suppressed');check(q(r.state,'ordered.fifo').messages.find(m=>m.body==='a2').receiveCount===0&&q(r.state,'ordered.fifo').messages.find(m=>m.body==='b1').receiveCount===1,'inflight A blocks A2 while B proceeds');
r=run(base,[fifo,fsnd('a1','A','a1'),receive('ordered.fifo'),s=>`aws sqs delete-message --queue-url ${url('ordered.fifo')} --receipt-handle ${q(s,'ordered.fifo').messages[0].receiptHandle}`,fsnd('a1','A','a1')]);check(q(r.state,'ordered.fifo').messages.length===0,'AWS five-minute dedup survives delete despite Moto gap');
r=run(base,[fifo,fsnd('a1','A','a1'),'sleep 300',fsnd('a1','A','a1')]);check(q(r.state,'ordered.fifo').messages.length===2,'dedup expires at five minutes');
r=run(base,[fifo,fsnd('same','A'),send('ordered.fifo','same','--message-group-id A --message-attributes \'{"variant":{"DataType":"String","StringValue":"different"}}\'')]);check(q(r.state,'ordered.fifo').messages.length===1,'content dedup ignores attributes');
r=run(base,[fifo,fsnd('one','__proto__','constructor'),fsnd('two','constructor','__proto__'),receive('ordered.fifo','--max-number-of-messages 10')]);check(q(r.state,'ordered.fifo').messages.every(m=>m.receiveCount===1),'untrusted group/dedup names cannot collide with prototypes');
r=run(base,[create,send('jobs','fair','--message-group-id tenant-a')]);check(q(r.state,'jobs').messages.length===1,'current Standard fair group accepted');
for(const bad of [send('jobs','bad','--message-deduplication-id id'),send('jobs','bad','--delay-seconds NaN'),send('jobs','bad','--message-attributes null'),send('jobs','bad','--unknown x'),send('jobs','bad','--message-body other')]){const v=run(base,[create,bad]);check(!q(v.state,'jobs').messages.length,'invalid send atomic '+bad);}
for(const value of ['null','[]','{}','{"VisibilityTimeout":"NaN"}','{"VisibilityTimeout":"43201"}','{"ReceiveMessageWaitTimeSeconds":"21"}','{"MessageRetentionPeriod":"59"}','{"FifoQueue":"true"}','{"Unknown":"x"}','{"VisibilityTimeout":"120","RedrivePolicy":"bad"}']){const v=run(base,[create,`aws sqs set-queue-attributes --queue-url ${url('jobs')} --attributes '${value}'`]);check(q(v.state,'jobs').visibilityTimeout===30,'invalid setting does not half-apply '+value);}
check(!run(base,['aws sqs create-queue --queue-name noflag.fifo']).state.account.queues.length,'FIFO suffix alone not enough');
for(const cmd of ['', ' ', 'garbage','sudo aws sqs list-queues','AWS SQS LIST-QUEUES','aws','aws sqs','aws sns','aws sqs create-queue --queue-name','aws sns publish --topic-arn','aws sqs receive-message --queue-name jobs','aws sqs receive-message --queue-url missing','aws sns get-topic-attributes --topic-arn constructor','aws sns subscribe --topic-arn missing --protocol sqs','aws sns unsupported','aws sqs unsupported','sleep NaN','sleep -1','aws sqs receive-message --queue-url "unfinished']){const v=run(base,[cmd]);check(!v.text.includes('simulator error:'),'garbage does not throw '+cmd);check(!v.state||!mission.success(v.state),'garbage no win');}
check(run(mission,mission.solution.map(c=>c.replaceAll(' --queue-url ','\t --queue-url='))).done===1,'whitespace and equals flags');
// SNS envelopes, attribute filters, FIFO fan-out and current large-message configuration.
const setupTopic=[create,'aws sns create-topic --name order-events'];
const queuePolicy={Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'sns.amazonaws.com'},Action:'sqs:SendMessage',Resource:arn('jobs'),Condition:{ArnEquals:{'aws:SourceArn':TOPIC}}}]};
const sqPolicy=attrs('jobs',{Policy:JSON.stringify(queuePolicy)});
const subscribe=`aws sns subscribe --topic-arn ${TOPIC} --protocol sqs --notification-endpoint ${arn('jobs')}`;
r=run(base,[...setupTopic,sqPolicy,subscribe,subscribe,`aws sns publish --topic-arn ${TOPIC} --message hello`]);check(r.state.account.topics[0].subscriptions.length===1,'subscribe idempotent');check(JSON.parse(q(r.state,'jobs').messages[0].body).Message==='hello','default delivery is SNS JSON envelope');
const attrSub=subscribe+` --attributes '${JSON.stringify({RawMessageDelivery:'true',FilterPolicy:'{"type":["OrderPlaced"]}'})}'`;
const eventAttr=` --message-attributes '{"type":{"DataType":"String","StringValue":"OrderPlaced"}}'`;
r=run(base,[...setupTopic,sqPolicy,attrSub,`aws sns publish --topic-arn ${TOPIC} --message '{"type":"OrderPlaced"}'`,`aws sns publish --topic-arn ${TOPIC} --message body${eventAttr}`]);check(q(r.state,'jobs').messages.length===1&&q(r.state,'jobs').messages[0].body==='body','default filter uses attributes, not body');
const fifoTopic='arn:aws:sns:ap-south-1:123456789012:ordered.fifo';
const fp=attrs('ordered.fifo',{Policy:JSON.stringify({...queuePolicy,Statement:[{...queuePolicy.Statement[0],Resource:arn('ordered.fifo'),Condition:{ArnEquals:{'aws:SourceArn':fifoTopic}}}]})});
const sp=attrs('jobs',{Policy:JSON.stringify({...queuePolicy,Statement:[{...queuePolicy.Statement[0],Condition:{ArnEquals:{'aws:SourceArn':fifoTopic}}}]})});
const fifoPublish=`aws sns publish --topic-arn ${fifoTopic} --message event --message-group-id customer-a --message-deduplication-id stable-id`;
const ff=[create,fifo,'aws sns create-topic --name ordered.fifo --attributes FifoTopic=true,ContentBasedDeduplication=true',fp,sp,...['jobs','ordered.fifo'].map(n=>`aws sns subscribe --topic-arn ${fifoTopic} --protocol sqs --notification-endpoint ${arn(n)} --attributes RawMessageDelivery=true`)];
r=run(base,[...ff,fifoPublish,fifoPublish]);check(q(r.state,'jobs').messages.length===1&&q(r.state,'ordered.fifo').messages.length===1,'SNS FIFO five-minute producer dedup before modeled fan-out to both queue types');
r=run(base,[...ff,fifoPublish,'sleep 300',fifoPublish]);check(q(r.state,'jobs').messages.length===2,'SNS dedup expires and Standard can get another event');
r=run(base,[create,send('jobs','x'.repeat(1048576))]);check(q(r.state,'jobs').messages.length===1,'current SQS exact1MiB payload allowed');
r=run(base,[create,send('jobs','x'.repeat(1048577))]);check(q(r.state,'jobs').messages.length===0,'oversize SQS rejected');
r=run(base,[...setupTopic,`aws sns publish --topic-arn ${TOPIC} --message '${'x'.repeat(262145)}'`,`aws sns set-topic-attributes --topic-arn ${TOPIC} --attribute-name MaximumMessageSize --attribute-value 1048576`,`aws sns publish --topic-arn ${TOPIC} --message '${'x'.repeat(1048576)}'`]);check(r.text.includes('exceeds configured')&&r.text.includes('MessageId'),'SNS defaults256KiB and supports explicit1MiB configuration');
const byQueue=JSON.stringify({redrivePermission:'byQueue',sourceQueueArns:[arn('jobs')]});
r=run(base,['aws sqs create-queue --queue-name dead',attrs('dead',{RedriveAllowPolicy:byQueue}),`aws sqs create-queue --queue-name jobs --attributes '${JSON.stringify({RedrivePolicy:JSON.stringify({deadLetterTargetArn:arn('dead'),maxReceiveCount:'3'})})}'`]);check(r.state.account.queues.length===2&&q(r.state,'jobs').attributes.RedrivePolicy,'DLQ byQueue permits future exact source ARN at create');
for(const command of ['aws sns create-topic --name bad.fifo',`aws sns publish --topic-arn ${TOPIC.replace('ap-south-1','us-east-1')} --message bad`,`aws sns subscribe --topic-arn ${TOPIC} --protocol email --notification-endpoint learner@example.invalid`]){const v=run(base,[...setupTopic,command]);check(!v.text.includes('simulator error:'),'invalid topic identity/protocol handled');}
const regionPolicy=clone(queuePolicy);regionPolicy.Statement[0].Condition={ArnLike:{'aws:SourceArn':TOPIC.toUpperCase()}};
r=run(base,[...setupTopic,attrs('jobs',{Policy:JSON.stringify(regionPolicy)}),subscribe,`aws sns publish --topic-arn ${TOPIC} --message hello`]);check(!q(r.state,'jobs').messages.length,'ARN wildcard matching is case sensitive');
const inFlightBatch=run(base,[fifo,fsnd('a1','A','a1'),fsnd('a2','A','a2'),receive('ordered.fifo','--max-number-of-messages 10')]);check(q(inFlightBatch.state,'ordered.fifo').messages.every(m=>m.receiveCount===1),'one FIFO batch may contain ordered messages from same unblocked group');
const differentOrder=mission.solution.map(c=>{const m=c.match(/ --queue-url ([^ ]+)/);return m?c.replace(m[0],'')+m[0]:c;});check(run(mission,differentOrder).done===1,'flag order is independent');
let states=0,wins=0;const flow=level.stages.find(s=>s.type==='flowlab');function sweep(i,k){if(i===flow.knobs.length){const m=flow.model(k),won=flow.check(k);check(m.verdict.ok===won,'planner verdict agrees');check(m.readouts.every(r=>!String(r.value).includes('NaN')),'finite outputs');if(won){wins++;check(k.rate>=20&&k.seconds>=2&&k.poison>=3&&k.workers<=90&&k.retries>=3,'fixed workload/budget cannot be bypassed');}states++;return;}const knob=flow.knobs[i];for(let n=knob.min;n<=knob.max;n+=knob.step)sweep(i+1,{...k,[knob.id]:n});}sweep(0,{});check(wins>0,'planner solvable');
const qs=[...level.stages.flatMap(s=>s.type==='quiz'||s.type==='triage'?s.questions||[]:s.observe?[s.observe]:[]),...level.interview.questions.filter(q=>!q.terminal)],positions=[0,0,0,0];let flags=0;for(const item of qs){positions[item.answer]++;const size=item.choices[item.answer].length,wrong=item.choices.filter((_,i)=>i!==item.answer).map(s=>s.length);if(wrong.every(n=>size>=1.15*n)||wrong.every(n=>size<=.85*n)){flags++;console.log('LENGTH FLAG',item.q,item.choices.map(s=>s.length));}check(item.explain.length>70,'right and tempting-wrong reasoning');}check(flags/qs.length<.05,'length flags under5% '+flags+'/'+qs.length);check(Math.max(...positions)-Math.min(...positions)<=1,'balanced answer positions '+positions);
for(const item of level.stages[0].steps.filter(s=>s.ask).map(s=>s.ask)){const size=item.choices[item.answer].length,wrong=item.choices.filter((_,i)=>i!==item.answer).map(s=>s.length);check(!wrong.every(n=>size>=1.15*n)&&!wrong.every(n=>size<=.85*n),'dryrun length balance '+item.q);}
check(!crashes.length,'no hidden crash '+crashes.join('\n'));
console.log(`   ✓ ${checks.toLocaleString('en-US')} messaging checks · ${states} planner states · ${qs.length} MCQs (${flags} length flags; positions ${positions})`);
module.exports={checks,states,flags};
