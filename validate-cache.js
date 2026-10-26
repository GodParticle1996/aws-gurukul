#!/usr/bin/env node
// Focused cache metadata, scoped network, readiness, parser and cost/freshness regressions. No AWS or Moto calls.
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
const level=AG.findLevel('caching'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal;
const never={...mission,success:()=>false},neverDax={...interview,success:()=>false},clone=x=>JSON.parse(JSON.stringify(x));
const group=s=>s.account.cacheGroups.find(g=>g.id==='catalog-cache'),dax=s=>s.account.daxClusters.find(g=>g.id==='cart-accel'),create=mission.solution[2],describe=mission.solution.at(-1),dcreate=interview.solution[0],ddescribe=interview.solution.at(-1);
function solved(stage){const r=run(stage,stage.solution);check(r.done===1,'intended solution wins '+r.text);check(r.trace.slice(0,-1).every(x=>x===0)&&r.trace.at(-1)===1,'only final observation wins');check(stage.tasks.every(t=>t.check(r.state)),'tasks agree');return r;}
for(const stage of [mission,interview]){solved(stage);solved(stage);for(let i=0;i<stage.solution.length;i++)check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'each omitted action loses '+i);}
const done=solved(mission);check(group(done.state).nodes.length===2&&new Set(group(done.state).nodes.map(n=>n.az)).size===2,'actual nodes across AZs');
check(!run(mission,['aws elasticache describe-replication-groups','aws elasticache describe-cache-clusters --show-cache-node-info','aws ec2 describe-security-groups']).done,'read-only cannot win');
const pending=run(never,mission.solution.slice(0,3));check(group(pending.state).status==='creating'&&group(pending.state).nodes.every(n=>n.status==='creating'),'create metadata is not ready');
const modifying=run(never,mission.solution.slice(0,5));check(group(modifying.state).status==='modifying'&&group(modifying.state).pending.multiAZ&&!group(modifying.state).multiAZ,'pending modification retains previous active values');
check(!run(mission,[...mission.solution.slice(0,6),describe+' --query "ReplicationGroups[?"']).done,'failed client query cannot prove readback');
check(!run(mission,[...mission.solution.slice(0,6),describe+' --output yaml']).done,'unimplemented client output cannot prove readback');
for(const transform of [
 c=>c.replace('--num-cache-clusters 2','--num-cache-clusters 1').replace('ap-south-1a ap-south-1b','ap-south-1a'),
 c=>c.replace('ap-south-1a ap-south-1b','ap-south-1a ap-south-1a'),
 c=>c.replace('--transit-encryption-enabled','--no-transit-encryption-enabled'),
 c=>c.replace('--at-rest-encryption-enabled','--no-at-rest-encryption-enabled'),
 c=>c.replace('--user-group-ids catalog-app',''),
 c=>c.replace('--automatic-failover-enabled','--no-automatic-failover-enabled'),
 c=>c.replace('--multi-az-enabled','--no-multi-az-enabled'),
 c=>c.replace('cache.t4g.small','cache.r7g.large'),
 c=>c.replace('--num-cache-clusters 2','--num-cache-clusters 6'),
 c=>c.replace('--engine-version 8.0','--engine-version 9.0'),
 c=>c.includes('create-replication-group')?c+' --port 6389':c
])check(!run(mission,mission.solution.map(transform)).done,'wrong/incomplete/costly configuration loses');
const alreadyHA=mission.solution.map((c,i)=>i===2?c+' --automatic-failover-enabled --multi-az-enabled':c).filter((_,i)=>i!==4&&i!==5);check(run(mission,alreadyHA).done===1,'valid alternative creates initial HA and still verifies final actual state');
const defaultAtRest=run(mission,mission.solution.map(c=>c.replace(' --at-rest-encryption-enabled','')));check(defaultAtRest.done===1,'current Valkey at-rest API default is true');
const sourceInspect=run(mission,[`aws dynamodb get-item --table-name carts --key '{"cartId":{"S":"cart-101"}}'`,...mission.solution]);check(sourceInspect.done===1,'valid source inspection does not count as data corruption');
const reordered=run(mission,mission.solution.map(c=>c.includes('--replication-group-id catalog-cache')?c.replace(' --replication-group-id catalog-cache','')+' --replication-group-id catalog-cache':c));check(reordered.done===1,'flag order supported');
check(run(mission,mission.solution.map(c=>c.replace('--replication-group-id catalog-cache','--replication-group-id=catalog-cache'))).done===1,'equals flags supported');
const foreign={...never,account:clone(mission.account)};foreign.account.securityGroups[1].vpcId='vpc-foreign';check(!group(run(foreign,[create]).state),'foreign SG rejected before create');
for(const suffix of [' --num-cache-clusters NaN',' --unknown-flag yes']){const r=run(never,[create+suffix]);check(!r.text.includes('simulator error:')&&!group(r.state),'invalid/duplicate flag rejected before create');}
const duplicate=run(never,[create,create]);check(duplicate.text.includes('ReplicationGroupAlreadyExists')&&duplicate.state.account.cacheGroups.length===1,'duplicate create does not add nodes/resources');
const modifyEarly=run(never,[create,mission.solution[4]]);check(modifyEarly.text.includes('InvalidReplicationGroupState')&&!group(modifyEarly.state).pending,'modify requires available group');
const unknown=run(never,['aws elasticache describe-replication-groups --replication-group-id catalog']);check(unknown.text.includes('ReplicationGroupNotFound'),'strict group identity');
let r=run(never,[...mission.solution,'aws elasticache delete-replication-group --replication-group-id catalog-cache --no-retain-primary-cluster']);check(!mission.success(r.state),'delete cluster revokes win');
r=run(never,[...mission.solution,'aws ec2 authorize-security-group-ingress --group-id sg-cache --protocol tcp --port 6379 --cidr 0.0.0.0/0']);check(!mission.success(r.state),'reopen public path revokes win');
r=run(never,[...mission.solution,'aws dynamodb delete-table --table-name carts']);check(!mission.success(r.state),'delete original data loses');
r=run(never,[...mission.solution,'aws elasticache modify-replication-group --replication-group-id catalog-cache --automatic-failover-enabled --multi-az-enabled --apply-immediately','aws elasticache wait replication-group-available --replication-group-id catalog-cache']);check(!mission.success(r.state),'old readback does not prove later revision');
const firstDax=run(neverDax,[dcreate,ddescribe]);check(dax(firstDax.state).status==='creating'&&dax(firstDax.state).nodes.every(n=>n.status==='creating'),'first observation does not fake DAX readiness');
const correctDax=solved(interview);check(dax(correctDax.state).nodes.length===3&&correctDax.state.cacheRead.groups[0].record.ClusterDiscoveryEndpoint.Port===9111,'DAX actual ready count and TLS port');
for(const change of [c=>c.replace('--replication-factor 3','--replication-factor 1').replace('ap-south-1a ap-south-1b ap-south-1c','ap-south-1a'),c=>c.replace('--cluster-endpoint-encryption-type TLS','--cluster-endpoint-encryption-type NONE'),c=>c.replace('"Enabled":true','"Enabled":false'),c=>c.replace('role/cart-dax-read','role/unrelated'),c=>c.replace('dax.t3.small','dax.r5.large'),c=>c.replace('shop-dax-private','missing'),c=>c.replace('ap-south-1a ap-south-1b ap-south-1c','ap-south-1a')])check(!run(interview,interview.solution.map(change)).done,'wrong DAX type/role/path/encryption/placement cannot win');
const shorthand=run(interview,interview.solution.map(c=>c.replace("'{\"Enabled\":true}'",'Enabled=true')));check(shorthand.done===1,'real shorthand SSE spec accepted');
for(const command of ['aws dax describe-clusters --cluster-names cart','aws dax create-cluster --cluster-name constructor','aws elasticache wait unsupported --replication-group-id catalog-cache','aws elasticache create-replication-group --replication-group-id invalid--id'])check(!run(never,[command]).text.includes('simulator error:'),'garbage identity/branch guarded');
for(const kind of ['null','[]','{}','{"Enabled":true,"Unknown":1}','{"Enabled":"true"}','{','42']){const c=dcreate.replace("'{\"Enabled\":true}'","'"+kind+"'");const result=run(neverDax,[c]);check(!dax(result.state)&&!result.text.includes('simulator error:'),'bad SSE document atomic/guarded');}
const untrusted={...neverDax,account:clone(interview.account)};untrusted.account.roles[0].daxTrust='ec2.amazonaws.com';check(!dax(run(untrusted,[dcreate]).state),'wrong service role trust rejected before creation');
const noPermission={...neverDax,account:clone(interview.account)};noPermission.account.roles[0].daxReadTables=[];check(!dax(run(noPermission,[dcreate]).state),'empty DDB read permission metadata rejected');
const invalidRBAC={...never,account:clone(mission.account)};invalidRBAC.account.cacheUserGroups[0].status='deleting';check(!group(run(invalidRBAC,[create]).state),'inactive user group not attached');
for(const command of ['', ' ', 'garbage','sudo aws elasticache describe-replication-groups','AWS ELASTICACHE DESCRIBE-REPLICATION-GROUPS','aws','aws dax','aws elasticache','aws elasticache create-replication-group --replication-group-id','aws dax create-cluster --cluster-name','aws elasticache modify-replication-group --replication-group-id','aws dax describe-clusters --cluster-names constructor','aws elasticache create-serverless-cache --engine valkey']){const result=run(never,[command]);check(!result.text.includes('simulator error:'),'garbage no crash');check(!result.state||!mission.success(result.state),'garbage no accidental win');}
const recreate=run(never,[...mission.solution,'aws dynamodb delete-table --table-name carts','aws dynamodb create-table --table-name carts --attribute-definitions AttributeName=cartId,AttributeType=S --key-schema AttributeName=cartId,KeyType=HASH --billing-mode PAY_PER_REQUEST','aws dynamodb wait table-exists --table-name carts',`aws dynamodb put-item --table-name carts --item '{"cartId":{"S":"cart-101"},"total":{"N":"499"},"version":{"N":"1"}}'`]);check(!mission.success(recreate.state),'reset original table with same name/data cannot fake preserved table identity');
const missingFactor=run(neverDax,[dcreate.replace(' --replication-factor 3','')]);check(!dax(missingFactor.state)&&missingFactor.text.includes('--replication-factor'),'missing required DAX replication-factor rejected before creation');
let states=0,wins=0;const flow=level.stages.find(s=>s.type==='flowlab');function sweep(i,k){if(i===flow.knobs.length){const m=flow.model(k),won=flow.check(k);check(m.verdict.ok===won,'planner predicate and verdict agree');check(m.readouts.every(r=>!String(r.value).includes('NaN')),'finite outputs');if(won){wins++;check(k.reads>=1000&&k.writes>=3&&k.ttl<=60&&k.key===1&&k.refill===1,'no workload/freshness/key/refill cheat');}states++;return;}const knob=flow.knobs[i];for(let n=knob.min;n<=knob.max;n+=knob.step)sweep(i+1,{...k,[knob.id]:n});}sweep(0,{});check(wins>0,'planner solvable');
const qs=[...level.stages.flatMap(s=>s.type==='quiz'||s.type==='triage'?s.questions||[]:s.observe?[s.observe]:[]),...level.interview.questions.filter(q=>!q.terminal)],positions=[0,0,0,0];let flags=0;for(const q of qs){positions[q.answer]++;const n=q.choices[q.answer].length,wrong=q.choices.filter((_,i)=>i!==q.answer).map(x=>x.length);if(wrong.every(x=>n>=x*1.15)||wrong.every(x=>n<=x*.85))flags++;check(q.explain.length>70,'useful explanation');}check(flags/qs.length<.05,'length bias under5%: '+flags+'/'+qs.length);check(Math.max(...positions)-Math.min(...positions)<=1,'correct positions distributed '+positions);
const inline=level.stages[0].steps.filter(s=>s.ask).map(s=>s.ask);for(const q of inline){const n=q.choices[q.answer].length,wrong=q.choices.filter((_,i)=>i!==q.answer).map(c=>c.length);check(!wrong.every(x=>n>=x*1.15)&&!wrong.every(x=>n<=x*.85),'inline length balance');}check(new Set(inline.map(q=>q.answer)).size===3,'inline positions spread');
check(!crashes.length,'no crash paths '+crashes.join('\n'));
console.log(`   ✓ ${checks.toLocaleString('en-US')} caching checks · ${states} planner states · ${qs.length} MCQs (${flags} length flags; positions ${positions})`);
module.exports={checks,states,flags};
