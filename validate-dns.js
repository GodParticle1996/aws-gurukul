#!/usr/bin/env node
// Focused regressions for the real-syntax VPC simulator. No AWS or Moto calls.
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
const level=AG.findLevel('route53'), mission=level.stages.find(s=>s.type==='terminal');
const interview=level.interview.questions.find(q=>q.terminal).terminal;
const json=x=>JSON.parse(JSON.stringify(x));
const withFile=(name,value,base=mission)=>({...base,files:{...base.files,[name]:{content:typeof value==='string'?value:JSON.stringify(value)}}});
const rr=(name,ip,extra={})=>({Name:name,Type:'A',TTL:60,ResourceRecords:[{Value:ip}],...extra});
const change=(rs,action='UPSERT')=>({Changes:rs.map(r=>({Action:action,ResourceRecordSet:r}))});
const edit=file=>'aws route53 change-resource-record-sets --hosted-zone-id ZSHOP --change-batch file://'+file;
const never={...mission,success:()=>false};
function solved(stage){const r=run(stage,stage.solution);check(r.done===1,'intended solution wins');check(r.trace.slice(0,-1).every(x=>x===0)&&r.trace.at(-1)===1,'only final action wins');check(stage.tasks.every(t=>t.check(r.state)),'every task complete');return r;}
for(const stage of [mission,interview]){
  solved(stage);solved(stage);
  for(let i=0;i<stage.solution.length;i++){const r=run(stage,stage.solution.filter((_,j)=>i!==j));check(r.done===0,'omitting action '+i+' cannot win');}
  const before=run({...stage,success:()=>false},['help']);check(!stage.success(before.state),'fresh reset not complete');
  const reversed=run(stage,stage.solution.slice().reverse());check(reversed.done===0,'wrong dependency order cannot win');
}
const correct=solved(mission);
check(AG.dnsAnswer(correct.state.account,correct.state.account.hostedZones[0],'status.shopkaro.in','A')[0]==='203.0.113.20','unhealthy primary serves maintenance');
const pending=run(never,mission.solution.slice(0,-1));
check(pending.state.account.dnsChanges.every(c=>c.Status==='PENDING'),'desired edits pending');
check(AG.dnsAnswer(pending.state.account,pending.state.account.hostedZones[0],'status.shopkaro.in','A')[0]==='203.0.113.10','old serving snapshot remains primary');
check(!mission.success(pending.state),'desired state alone cannot win');
const reads=run(never,[...mission.solution.slice(0,-1),'aws route53 get-change --id /change/C000000003','aws route53 test-dns-answer --hosted-zone-id ZSHOP --record-name status.shopkaro.in --record-type A']);
check(!mission.success(reads.state),'describes/answer cannot publish pending records');
check(reads.text.includes('203.0.113.10'),'read reports old actual serving data');
const explicit=run({...mission,success:()=>false},[...mission.solution,'aws route53 test-dns-answer --hosted-zone-id ZSHOP --record-name status.shopkaro.in --record-type A','aws route53 test-dns-answer --hosted-zone-id ZSHOP --record-name shopkaro.in --record-type AAAA','aws route53 test-dns-answer --hosted-zone-id ZSHOP --record-name missing.shopkaro.in --record-type A']);
check(explicit.text.includes('203.0.113.20'),'fresh answer reflects fixed serving state');
check(explicit.text.includes('NXDOMAIN'),'missing name returns NXDOMAIN');
check(explicit.text.match(/NOERROR/g).length>=2,'existing name missing type gives NOERROR/NODATA');
const replay=run(never,[...mission.solution.slice(0,1),...mission.solution.slice(0,1)]);
check(replay.state.account.healthChecks.length===1,'caller-reference same config idempotent');
const all=[...mission.solution.slice(0,-1),...mission.solution.slice(1,-1),'aws route53 wait resource-record-sets-changed --id /change/C000000006'];
check(mission.success(run(never,all).state),'repeated UPSERT and later waiter yields equivalent valid state');
const oldWait=run(never,[...mission.solution,'aws route53 wait resource-record-sets-changed --id /change/C000000001']);
check(mission.success(oldWait.state),'old waiter cannot roll back newer serving snapshot');

// Wrong-but-plausible records and health shortcuts must not win.
const files=Object.fromEntries(Object.entries(mission.files).map(([k,f])=>[k,JSON.parse(f.content)]));
for(const [label,mutate] of [
 ['missing health',d=>{delete d.Changes[0].ResourceRecordSet.HealthCheckId;}],
 ['primary IP wrong',d=>{d.Changes[0].ResourceRecordSet.ResourceRecords[0].Value='203.0.113.99';}],
 ['old TTL',d=>{d.Changes.forEach(x=>x.ResourceRecordSet.TTL=3600);}],
 ['secondary wrong',d=>{d.Changes[1].ResourceRecordSet.ResourceRecords[0].Value='203.0.113.99';}],
 ['swapped roles',d=>{d.Changes[0].ResourceRecordSet.Failover='SECONDARY';d.Changes[1].ResourceRecordSet.Failover='PRIMARY';}],
]) {const d=json(files['failover-health.json']);mutate(d);const r=run(withFile('failover-health.json',d),mission.solution);check(!r.done,label+' fails');}
for(const [label,patch] of [['disabled',{Disabled:true}],['inverted',{Inverted:true}],['wrong path',{ResourcePath:'/always200'}],['wrong IP',{IPAddress:'203.0.113.20'}],['fast interval violates mission config',{RequestInterval:10}],['threshold wrong',{FailureThreshold:1}]]){
 const cfg={...files['primary-health.json'],...patch};const r=run(withFile('primary-health.json',cfg),mission.solution);check(!r.done,label+' fails');
}
for(const weights of [[50,50],[100,0],[0,0],[10,90],[9,1]]){const d=json(files['weighted-90-10.json']);d.Changes.forEach((c,i)=>c.ResourceRecordSet.Weight=weights[i]);check(!run(withFile('weighted-90-10.json',d),mission.solution).done,'wrong required 90/10 configuration '+weights+' fails');}
// More than one ratio gives same probability, but the explicit runbook asks actual 90/10 values.
for(const cmd of ['terraform destroy','apply -f failover-health.json','aws route53 delete-hosted-zone --id ZSHOP','aws route53 delete-health-check --health-check-id '+correct.state.account.healthChecks[0].id,'aws s3api delete-bucket --bucket shop-assets']){
 const r=run(never,[...mission.solution.slice(0,-1),cmd,mission.solution.at(-1)]);
 if(cmd.includes('delete-bucket'))check(!mission.success(r.state),'deleting protected assets cannot win');
 else check(!r.text.includes('simulator error:'),'shortcut produces useful response');
}
for(const toggle of ['--disabled','--inverted']){const r=run(never,[...mission.solution.slice(0,-1),'aws route53 update-health-check --health-check-id '+correct.state.account.healthChecks[0].id+' '+toggle,mission.solution.at(-1)]);check(!mission.success(r.state),'health toggle cheat fails');}

const invalidBatches=[null,[],{}, {Changes:[]},{Changes:[null]},{Changes:[{}]},change([rr('shopkaro.in','alb.invalid')]),change([{Name:'shopkaro.in',Type:'CNAME',TTL:60,ResourceRecords:[{Value:'alb.invalid'}]}]),change([rr('outside.test','203.0.113.1')]),change([rr('x.shopkaro.in','203.0.113.1',{Weight:-1,SetIdentifier:'x'})]),change([rr('x.shopkaro.in','203.0.113.1',{Weight:256,SetIdentifier:'x'})]),change([rr('x.shopkaro.in','203.0.113.1',{Weight:1})]),change([rr('x.shopkaro.in','203.0.113.1',{TTL:-1})]),change([rr('x.shopkaro.in','203.0.113.1',{ResourceRecords:[]})]),change([rr('x.shopkaro.in','203.0.113.1',{HealthCheckId:'missing'})]),change([rr('x.shopkaro.in','203.0.113.1',{Region:'ap-south-1'})]),change([rr('x.shopkaro.in','203.0.113.1',{SetIdentifier:'primary',Failover:'MAYBE'})]),change([rr('x.shopkaro.in','203.0.113.1',{Weight:1,Failover:'PRIMARY',SetIdentifier:'x'})]),change([rr('x.shopkaro.in','203.0.113.1',{ResourceRecords:[{Value:12}]})]),change([{Name:'shopkaro.in',Type:'A',AliasTarget:{DNSName:'wrong.elb.amazonaws.com',HostedZoneId:'ZP97RAFLXTNZK',EvaluateTargetHealth:true}}]),change([{Name:'shopkaro.in',Type:'A',TTL:60,AliasTarget:{DNSName:'shop-alb.sim.ap-south-1.elb.amazonaws.com',HostedZoneId:'ZP97RAFLXTNZK',EvaluateTargetHealth:true}}])];
for(let i=0;i<invalidBatches.length;i++){
 const r=run(withFile('invalid.json',invalidBatches[i],never),[edit('invalid.json')]);
 check(r.text.includes('Invalid')||r.text.includes('NoSuch')||r.text.includes('Simulator scope'),'bad batch '+i+' useful error');
 check(eqRecords(r.state.account.hostedZones,mission.account.hostedZones),'bad batch '+i+' atomic');
 check(!(r.state.account.dnsChanges||[]).length,'bad batch creates no change');
}
function eqRecords(a,b){return JSON.stringify(a)===JSON.stringify(b);}
const atomic=change([rr('safe.shopkaro.in','203.0.113.5'),rr('outside.test','203.0.113.6')]);
check(eqRecords(run(withFile('bad.json',atomic,never),[edit('bad.json')]).state.account.hostedZones,mission.account.hostedZones),'valid first/invalid second mutation rolled back');
const dup=change([rr('test.shopkaro.in','203.0.113.5')],'CREATE');
const created=run(withFile('new.json',dup,never),[edit('new.json'),edit('new.json')]);
check(created.text.includes('already exists'),'CREATE duplicate useful error');
check(created.state.account.dnsChanges.length===1,'duplicate CREATE no extra change');
const same=rr('delete.shopkaro.in','203.0.113.5');
const deleted=run(withFile('del.json',change([same],'DELETE'),withFile('add.json',change([same]),never)),[edit('add.json'),edit('del.json')]);
check(!deleted.state.account.hostedZones[0].records.some(r=>r.Name==='delete.shopkaro.in.'),'exact DELETE removes matching record');
const wrongDel=run(withFile('del.json',change([{...same,TTL:30}],'DELETE'),withFile('add.json',change([same]),never)),[edit('add.json'),edit('del.json')]);
check(wrongDel.text.includes('values do not match'),'DELETE must match actual values');
for(const address of [':',':::','1:2:3','1:2:3:4:5:6:7:8:9','12345::1']){const r=run(withFile('ipv6.json',change([{Name:'v6.shopkaro.in',Type:'AAAA',TTL:60,ResourceRecords:[{Value:address}]}]),never),[edit('ipv6.json')]);check(r.text.includes('Invalid IPv6'),'invalid IPv6 rejected '+address);check(!r.state.account.dnsChanges.length,'invalid IPv6 atomic');}
for(const address of ['::','::1','2001:db8::1','2001:db8:1:2:3:4:5:6']){const r=run(withFile('ipv6.json',change([{Name:'v6.shopkaro.in',Type:'AAAA',TTL:60,ResourceRecords:[{Value:address}]}]),never),[edit('ipv6.json')]);check(r.state.account.dnsChanges.length===1,'valid IPv6 accepted '+address);}
const ttlPair=json(files['weighted-90-10.json']);ttlPair.Changes[1].ResourceRecordSet.TTL=30;
check(run(withFile('ttl.json',ttlPair,never),[edit('ttl.json')]).state.account.hostedZones[0].records.filter(r=>r.Weight!==undefined).every(r=>r.TTL===30),'weighted TTL aligned to last specified value per AWS behavior');
const conflict=change([{Name:'alias.shopkaro.in',Type:'CNAME',TTL:60,ResourceRecords:[{Value:'outside.test'}]},rr('alias.shopkaro.in','203.0.113.4')]);
check(run(withFile('conflict.json',conflict,never),[edit('conflict.json')]).text.includes('coexist'),'CNAME coexistence rejected');
const hcmd='aws route53 create-health-check --caller-reference test --health-check-config file://health.json';
for(const cfg of [null,{}, {Type:'HTTP'}, {Type:'CALCULATED'}, {Type:'HTTP',IPAddress:'999.1.1.1'}, {Type:'HTTP',IPAddress:'203.0.113.1',RequestInterval:20}, {Type:'HTTP',IPAddress:'203.0.113.1',FailureThreshold:0}, {Type:'HTTP',IPAddress:'203.0.113.1',Disabled:'true'}, {Type:'TCP',IPAddress:'203.0.113.1'}, {Type:'HTTP',FullyQualifiedDomainName:{}}, {Type:'HTTP',IPAddress:'203.0.113.1',ResourcePath:null}]){
 const r=run(withFile('health.json',cfg,never),[hcmd]);check(!r.state.account.healthChecks.length,'bad health config cannot mutate');check(!r.text.includes('simulator error:'),'bad health config no internal error');
}
const discover=run(never,['aws elbv2 describe-load-balancers --query LoadBalancers[0].CanonicalHostedZoneId']);check(discover.text.includes('ZP97RAFLXTNZK'),'real ALB target zone metadata discoverable');
const defaults=run(withFile('health.json',{Type:'HTTP',IPAddress:'203.0.113.10'},never),[hcmd]);
check(defaults.state.account.healthChecks[0].config.RequestInterval===30,'default30seconds');check(defaults.state.account.healthChecks[0].config.FailureThreshold===3,'default threshold3');
const caller=run(withFile('other.json',{Type:'HTTP',IPAddress:'203.0.113.20'},never),[mission.solution[0],'aws route53 create-health-check --caller-reference shop-primary-v1 --health-check-config file://other.json']);check(caller.text.includes('HealthCheckAlreadyExists'),'caller-reference different config rejected');
const inUse=run(never,mission.solution.slice(0,-1).concat('aws route53 delete-health-check --health-check-id '+correct.state.account.healthChecks[0].id));check(inUse.state.account.healthChecks.length===0,'AWS permits deleting an associated health check');check(!mission.success(inUse.state),'deleted check cannot win');
const deletedProbe=run(never,[...mission.solution,'aws route53 delete-health-check --health-check-id '+correct.state.account.healthChecks[0].id,'aws route53 test-dns-answer --hosted-zone-id ZSHOP --record-name status.shopkaro.in --record-type A']);check(deletedProbe.text.includes('unpredictable'),'deleted health diagnostic does not invent a real DNS outcome');

// Health selection: both-down fallback, allzero weights, zero-weight fallback, exact deterministic cycle.
const a=json(correct.state.account),z=a.hostedZones[0];
let counts={};for(let i=0;i<100;i++){const ip=AG.dnsAnswer(a,z,'checkout.shopkaro.in','A',i)[0];counts[ip]=(counts[ip]||0)+1;}
check(counts['203.0.113.11']===90&&counts['203.0.113.12']===10,'deterministic100 answer model90/10');
const wz={records:[rr('test.in.','203.0.113.1',{Weight:0,SetIdentifier:'a'}),rr('test.in.','203.0.113.2',{Weight:0,SetIdentifier:'b'})]};
check(AG.dnsAnswer({},wz,'test.in','A',0)[0]!==AG.dnsAnswer({},wz,'test.in','A',1)[0],'allzero equal deterministic cycle');
const fallback={healthChecks:[{id:'down',config:{},observedHealthy:false}],dnsAliases:[]};
wz.records[0].Weight=90;wz.records[0].HealthCheckId='down';
check(AG.dnsAnswer(fallback,wz,'test.in','A')[0]==='203.0.113.2','zero-weight healthy fallback after positive unhealthy');
const both={healthChecks:[{id:'up',config:{},observedHealthy:true}],dnsAliases:[{dnsName:'alb.test',hostedZoneId:'ZALB',healthy:false,addresses:['203.0.113.1']}]};const bz={records:[{Name:'both.test.',Type:'A',SetIdentifier:'primary',Failover:'PRIMARY',HealthCheckId:'up',AliasTarget:{DNSName:'alb.test',HostedZoneId:'ZALB',EvaluateTargetHealth:true}},rr('both.test.','203.0.113.2',{SetIdentifier:'backup',Failover:'SECONDARY'})]};check(AG.dnsAnswer(both,bz,'both.test','A')[0]==='203.0.113.2','explicit health and inherited alias health must both pass');
const fz={records:[rr('test.in.','203.0.113.1',{Failover:'PRIMARY',HealthCheckId:'down'}),rr('test.in.','203.0.113.2',{Failover:'SECONDARY',HealthCheckId:'down'})]};
check(AG.dnsAnswer(fallback,fz,'test.in','A')[0]==='203.0.113.1','both-unhealthy failover returns primary');

const junk=['','  ','aws','aws route53','sudo aws route53 list-hosted-zones','AWS ROUTE53 LIST-HOSTED-ZONES','aws route53 nope','aws route53 change-resource-record-sets','aws route53 change-resource-record-sets --hosted-zone-id ZSHOP','aws route53 change-resource-record-sets --hosted-zone-id ZSHOP --change-batch file://missing.json','aws route53 create-health-check --fqdn nope','aws route53 get-change --id missing','aws route53 wait bogus --id missing','aws route53 list-hosted-zones --foo bar',"aws route53 list-hosted-zones --query 'foo[?x]'",'aws route53 list-hosted-zones --output','aws route53 list-hosted-zones --query constructor','aws route53 list-resource-record-sets --hosted-zone-id ZSHOP --output text','cat __proto__','cat missing.json','cat','ls','help','hint','aws route53 get-health-check --health-check-id missing','aws route53 update-health-check --health-check-id missing --disabled',"aws route53 create-health-check --caller-reference x --health-check-config '{'"];
const fuzz=run(never,junk);check(!fuzz.text.includes('simulator error:'),'garbage and variants never throw');check(!crashes.length,'no console errors');
const order=run(never,['aws   route53   list-resource-record-sets --output json --hosted-zone-id ZSHOP --query ResourceRecordSets[0].Type']);check(order.text.includes('NS'),'whitespace and flag order accepted');
const zcmd='aws route53 create-hosted-zone --name fresh.test --caller-reference fresh';
const zones=run(never,[zcmd,zcmd,'aws route53 delete-hosted-zone --id Z000000001']);check(zones.text.includes('HostedZoneAlreadyExists'),'zone caller-reference duplicate rejected');check(zones.state.account.hostedZones.length===1,'create/delete zone scoped');
const badDelete=run(never,['aws route53 delete-hosted-zone --id ZSHOP']);check(badDelete.text.includes('HostedZoneNotEmpty'),'protected populated zone cannot delete');
const privateStage={...never,account:json(mission.account)};privateStage.account.hostedZones[0].private=true;
check(run(privateStage,['aws route53 test-dns-answer --hosted-zone-id ZSHOP --record-name status.shopkaro.in --record-type A']).text.includes('public hosted zones only'),'private test unsupported honestly');

// Exhaustive fixed workload / modeled budget combinations, not duplicated formula tests.
const planner=level.stages.find(s=>s.type==='flowlab');let plannerCount=0,winning=0;
for(let ttl=0;ttl<=6;ttl++)for(const interval of [10,30])for(let threshold=1;threshold<=10;threshold++)for(let queries=1;queries<=10;queries++){
 const k={ttl,interval,threshold,queries},m=planner.model(k);plannerCount++;
 check(m.readouts.every(r=>!String(r.value).match(/NaN|Infinity|undefined/)),'finite planner readouts');
 check(m.verdict.ok===planner.check(k),'planner/check agree');
 if(queries<10)check(!planner.check(k),'no shrinking fixed demand cheat');
 if(ttl>=3)check(!planner.check(k),'large TTL cannot meet180seconds');
 if(planner.check(k))winning++;
}
check(plannerCount===1400&&winning>0,'all1400 modeled states covered with solutions');
check(planner.check({ttl:1,interval:30,threshold:3,queries:10}),'explicit lesson example solves planner');
const questions=[...level.stages.flatMap(s=>s.questions||[]),...level.stages.filter(s=>s.observe).map(s=>s.observe),...level.interview.questions.filter(q=>q.choices)];
const positions=[0,0,0,0];let bias=0;
for(const q of questions){const lengths=q.choices.map(c=>c.replace(/<[^>]*>/g,'').length),c=lengths[q.answer],others=lengths.filter((_,i)=>i!==q.answer);if(others.every(n=>c>=1.15*n)||others.every(n=>c<=0.85*n))bias++;positions[q.answer]++;check(!!q.explain,'each MCQ has explanation');}
check(bias/questions.length<0.05,'MCQ length bias under5%: '+bias+'/'+questions.length);
check(Math.max(...positions)-Math.min(...positions)<=1,'answer positions balanced '+positions);
check(crashes.length===0,'all focused runs no internal crashes');
console.log(`✅ ${checks} Route53 regression checks passed (${plannerCount} budget settings; omissions, atomic changes, serving state, health, parser and replay). MCQ bias ${bias}/${questions.length}; positions ${positions}.`);
