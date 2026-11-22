#!/usr/bin/env node
// Run the D7 missions through the terminal and check every calculator setting.
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

const level = AG.findLevel('costdec');
const mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;

const B=AG.pixBill;
const inspect=(commands,stage=mission)=>run({...stage,success:()=>false},commands);
function withFile(stage,name,change){
  const d=JSON.parse(stage.files[name].content);change(d);
  return {...stage,files:{...stage.files,[name]:{content:JSON.stringify(d)}}};
}
for(const stage of [mission,interview]){
  const r=run(stage,stage.solution);
  check(r.done===1 && stage.tasks.every(t=>t.check(r.state)),stage.title+'\n'+r.text.slice(-3500));
  check(r.trace.slice(0,-1).every(n=>n===0),'last step wins');
  stage.solution.forEach((_,i)=>check(!run(stage,stage.solution.filter((_,j)=>j!==i)).done,'missing step '+stage.title+' '+i));
}
const [make,add,wait,point,tag,budget,probe]=mission.solution;
const [join,,notify]=interview.solution;
const expected=inspect([...mission.solution,'aws elasticache describe-replication-groups --replication-group-id pix-feed',
  'aws ssm get-parameter --name '+B.parameter,'aws budgets describe-budget --account-id '+B.account+' --budget-name pix-month',
  'aws ec2 describe-route-tables --route-table-ids rtb-a rtb-b']);
check(expected.text.includes('DestinationPrefixListId') && expected.text.includes('ReadEndpoint') && expected.text.includes('pix-reader-a') &&
  expected.text.includes('12000') && expected.text.includes('remote fallback ready: true'),'config and sample visible');
for (const op of ['describe-instances --instance-ids i-feed','describe-volumes']) {
  const output=inspect([tag,'aws ec2 '+op]).text;
  check(output.includes('"Key":"Team","Value":"feed"') && !output.includes('"undefined"'),'read current EC2 tags and identifiers');
}
const nodeRead=inspect([add,wait,'aws elasticache describe-cache-clusters --cache-cluster-id '+B.local+' --show-cache-node-info']).text;
check(nodeRead.includes(B.address(B.local)) && nodeRead.includes('sg-cache'),'node read endpoint visible through describe-cache-clusters');
const a=expected.state.account,p=B.pathState(a);
check(p.s3.every(id=>id===a.vpcEndpoints[0].id) && p.other.join(',')==='nat-a,nat-b','split both routes');
check(p.az===p.appAZ && p.fallback && p.writer==='pix-writer-c','available reader and remote HA');
for(const cmd of [make.replace('rtb-a rtb-b','rtb-a'),make.replace('rtb-a rtb-b','rtb-pub-a rtb-pub-b'),
  make.replace('.s3','.dynamodb'),make.replace('.s3','-wrong.s3'),make.replace('rtb-a rtb-b','rtb-a missing')]){
  check(!run(mission,[cmd,...mission.solution.slice(1)]).done,'incorrect associations '+cmd);
}
const dup=inspect([make,make]);
check(dup.state.account.vpcEndpoints.length===1 && dup.state.account.routeTables.flatMap(t=>t.routes).filter(r=>r.prefixListId).length===2,'endpoint token replay');
for(const cmd of [add.replace('us-east-1a','us-east-1z'),add.replace('pix-feed','missing'),add+' --unknown true',add+' --cache-cluster-id other']){
  check(inspect([cmd]).state.account.cacheGroups[0].nodes.length===2,'invalid create atomic');
}
check(inspect([add,add]).state.account.cacheGroups[0].nodes.length===3,'duplicate replica rejected');
const wrongAz=inspect([make,add.replace('us-east-1a','us-east-1b'),wait,point,tag,budget,probe]);
check(!mission.success(wrongAz.state),'node name alone cannot stand for AZ');
const pending=inspect([make,add,point,tag,budget,probe,wait]);
check(!mission.success(pending.state) && pending.state.account.billSample.reader==='pix-reader-b','pending reader falls back and old receipt cannot win');
check(run(mission,[make,add,point,tag,budget,probe,wait,probe]).done,'fresh sample after readiness');
for(const cmd of [point.replace('pix-reader-a.local','pix-feed.reader.local'),point.replace('pix-reader-a.local','pix-writer-c.local'),
  point.replace(' --overwrite',''),point.replace(B.parameter,'/wrong'),point+' --region eu-west-1']){
  check(!run(mission,[make,add,wait,cmd,tag,budget,probe]).done,'incorrect app reader or failed write');
}
const fallback=inspect(mission.solution);
fallback.state.account.cacheGroups[0].nodes.find(n=>n.id===B.local).status='unavailable';
check(B.pathState(fallback.state.account).reader===B.remote && !mission.success(fallback.state),'reads can fall back while local cost goal fails');
const noHA=inspect(mission.solution);
noHA.state.account.cacheGroups[0].nodes=noHA.state.account.cacheGroups[0].nodes.filter(n=>n.id!==B.remote);
check(!mission.success(noHA.state),'preserve remote reader');
const shadow=inspect(mission.solution);
shadow.state.account.routeTables.find(t=>t.id==='rtb-b').routes.push({destination:'52.216.1.39/32',target:'nat-b',state:'active'});
check(!mission.success(shadow.state),'more-specific route overrides prefix');
for(const [field,from,to] of [['prefixListId','pl-s3','52.216.1.39/32'],['destination','0.0.0.0/0','198.51.100.9/32']]){
  const forged=inspect(mission.solution),table=forged.state.account.routeTables.find(t=>t.id==='rtb-b');
  const route=table.routes.find(r=>r[field]===from);
  delete route[field];route.destination=to;
  check(!mission.tasks[0].check(forged.state),'matching one probe cannot replace the required table route');
}
for(const [id,az] of [['pix-writer-c','us-east-1b'],[B.remote,'us-east-1c']]){
  const moved=inspect(mission.solution);
  moved.state.account.cacheGroups[0].nodes.find(n=>n.id===id).az=az;
  check(!mission.tasks[1].check(moved.state),'preserve stated writer and fallback placement');
}
const orphan=inspect(mission.solution);orphan.state.account.natGateways[1].state='deleted';
check(!mission.success(orphan.state),'retained NAT must be available');
const badTag=inspect([tag.replace('vol-idle','missing')]);
check(!badTag.state.account.instances[0].tags.Team,'bad multi-resource tagging atomic');
for(const cmd of [tag.replace(' vol-idle',''),tag.replace('Team','Owner'),tag.replace('i-feed','i-other'),tag.replace('Value=feed','Value=demo')]){
  check(!run(mission,[make,add,wait,point,cmd,budget,probe]).done,'both assets need correct tag');
}
for(const [key,change] of [['budget.json',d=>{d.BudgetLimit.Amount='9000';}],['alerts.json',d=>{d[0].Notification.Threshold=90;}],
  ['alerts.json',d=>{d[0].Notification.NotificationType='FORECASTED';}],['alerts.json',d=>{d[0].Subscribers[0].Address='other@example.test';}]]){
  const wrong=withFile(mission,key,change);check(!run(wrong,wrong.solution).done,'budget and subscriber values checked');
}
const noSubscriber=withFile(interview,'team.json',d=>{d.length=0;});
check(!run(noSubscriber,noSubscriber.solution).done,'incomplete notification rejected');
check(!run(interview,[join.replace('rtb-b','rtb-pub-b'),point,notify,probe]).done,'repair on wrong table');
const ce=mission.files['bill-command.txt'].content;
const report=inspect([ce,...mission.solution,ce]);
const lines=report.state.account.costUsageGroups['2026-10-01'];
check(lines.reduce((n,x)=>n+Number(x.usd),0)===28000 && report.text.split('NatGateway-Bytes').length>=3,'recorded October charge stays available');
const flow=level.stages.find(s=>s.type==='flowlab');
let settings=0,wins=0;
for(const gateway of [0,1])for(const local of [0,50,100])for(let hours=0;hours<=720;hours+=60)for(const plan of [0,1,2]){
  const k={gateway,local,hours,plan},m=flow.model(k),v=m.readouts.map(r=>r.value),money=x=>'≈ $'+x.toFixed(2);
  const nat=gateway?162:9072,transfer=6000-60*local,extra=local?180:0;
  const idle=720-hours,rate=plan*.75,perBusy=rate+(2-plan),compute=hours*perBusy+idle*rate;
  check(v[0]===money(nat) && v[1]===money(transfer)+' + '+money(extra),'network and replica model');
  check(v[2]===money(2*hours) && v[3]===money(compute) && v[4]===money(2*hours-compute),'hourly plan vs OD');
  check(v[5]===money(nat+transfer+extra+compute),'total without double counting OD');
  const fit=!!gateway && local===100 && hours===600 && plan===2;
  check(flow.check(k)===fit && m.verdict.ok===fit,'one fit');
  if(plan>0)check(Math.sign(2*hours-compute)===Math.sign(hours-540),'below, at and above break-even');
  settings++;if(fit)wins++;
}
check(settings===234 && wins===1,'complete calculator grid');
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
console.log(`   ✓ ${checks} costdec checks · ${settings} settings/1 fit · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join("/")}`);
