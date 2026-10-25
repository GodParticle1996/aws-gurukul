#!/usr/bin/env node
// Three-tier architecture state regressions, using the shipped renderer and simulator.
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
const level = AG.findLevel('boss1'), mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.find(q => q.terminal).terminal;
const solution = mission.solution;
const probe = { ...mission, success: () => false };
const inspect = (commands, account) => run({ ...probe, ...(account ? { account } : {}) }, commands);
const group = r => r.state.account.asgs[0], app = r => r.state.account.securityGroups.find(g => g.id === 'sg-app');
const databaseSG = r => r.state.account.securityGroups.find(g => g.id === 'sg-db');
const bkt = r => r.state.account.buckets[0];
const clone = value => JSON.parse(JSON.stringify(value));
check(!mission.success({account: clone(mission.account)}), 'initially not solved');
check(solution.every((c, i) => mission.hints[i].split(' — ')[0] === c), 'runnable hints agree with intended solution');
check(run(mission, solution).trace.join(',') === '0,0,0,0,0,0,1', 'boss wins only after final BPA step');
for (let i = 0; i < solution.length; i++) check(!run(mission, solution.filter((_, j) => i !== j)).done, 'cannot omit action ' + i);
check(run(interview, interview.solution).trace.join(',') === '0,1', 'interview needs both repairs');
for (let i = 0; i < interview.solution.length; i++) check(!run(interview, interview.solution.filter((_, j) => i !== j)).done, 'interview cannot skip action ' + i);
let r = inspect(solution);
check(group(r).instances.length === 4 && group(r).min === 4, 'capacity bounds preserved');
check(r.state.account.instances.filter(i => group(r).instances.includes(i.id) && i.az === 'ap-south-1b').length === 2, 'real modeled workers appear in second AZ');
check(group(r).activities.filter(a => a.cause === 'Modeled AZRebalance').length === 2, 'two modeled launch-before-terminate replacements');
check(group(r).instances.filter(id => /^i-app/.test(id)).length === 2, 'at least half the healthy original workers preserved');
check(r.state.account.instances.filter(i => group(r).instances.includes(i.id)).every(i => i.privateIp.startsWith(i.az.endsWith('a') ? '10.8.11.' : '10.8.12.')), 'new workers IPs follow actual subnet CIDR');
check(r.state.account.rds[0].state === 'available' && r.state.account.rds[0].multiAZ, 'applied DB state and waiter checked');
for (const commands of [
  ['aws elbv2 describe-load-balancers', 'aws autoscaling describe-auto-scaling-groups', 'aws rds describe-db-instances', 'aws s3 ls'],
  [solution[0], ...solution.slice(2)],
  solution.map(c => c.replace('--source-group sg-app', '--cidr 10.8.0.0/16')),
  solution.map(c => c.replace('--port 5432 --source-group', '--port 3306 --source-group')),
  solution.map(c => c.replace('subnet-app-a,subnet-app-b', 'subnet-public-a,subnet-public-b')),
  solution.map(c => c.replace('--multi-az --apply-immediately', '--multi-az')),
  solution.map(c => c.replace('RestrictPublicBuckets=true', 'RestrictPublicBuckets=false')),
  solution.map(c => c.replace('--public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true', '--public-access-block-configuration BlockPublicAcls=true')),
  ['aws s3 rm s3://shopkaro-images/catalog/shoe.jpg', ...solution],
  ['aws ec2 revoke-security-group-ingress --group-id sg-alb --protocol tcp --port 443 --cidr 0.0.0.0/0', ...solution],
  ['aws autoscaling update-auto-scaling-group --auto-scaling-group-name shop-app --min-size 0 --desired-capacity 0', ...solution],
  ['aws ec2 terminate-instances --instance-ids i-app1 i-app2 i-app3 i-app4', ...solution],
  ['apply -f fix-everything.json', 'terraform destroy'],
]) check(!run(mission, commands).done, 'wrong approach/skip/data deletion/reset cannot win');
const oneAZ = clone(mission.account);
oneAZ.subnets.push({...oneAZ.subnets.find(s => s.id === 'subnet-app-a'), id:'subnet-app-a2', cidr:'10.8.13.0/24'});
check(!run({...mission, account:oneAZ}, solution.map(c => c.replace('subnet-app-a,subnet-app-b', 'subnet-app-a,subnet-app-a2'))).done, 'two subnets in same AZ cannot fake redundancy');
for (const command of [
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --source-group missing',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --cidr 999.2.2.2/24',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --cidr 10.8.0.0/99',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 65536 --source-group sg-app',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5-4 --source-group sg-app',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --source-group sg-app --cidr 10.8.0.0/16',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 5432 --source-group sg-app --bananas yes',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --ip-permissions null',
  'aws ec2 authorize-security-group-ingress --group-id sg-db --ip-permissions \'[{"IpProtocol":"tcp","FromPort":5432,"ToPort":5432,"UserIdGroupPairs":null}]\'',
  'aws ec2 revoke-security-group-ingress --group-id sg-db --protocol tcp --port 1234 --source-group sg-app',
  'aws ec2 revoke-security-group-ingress --group-id missing --protocol tcp --port 22 --cidr 0.0.0.0/0',
  'aws ec2 revoke-security-group-ingress --group-id sg-app --protocol tcp --port 22 --cidr 0.0.0.0/0 --dry-run true',
]) {
  r = inspect([command]);
  check(JSON.stringify(r.state.account.securityGroups) === JSON.stringify(mission.account.securityGroups), 'invalid SG mutation atomic');
  check(/error:|Invalid|Simulator|Unknown options/.test(r.text) && !r.text.includes('simulator error:'), 'SG error teaches supported syntax');
}
r = inspect([solution[0] + ' --dry-run']);
check(app(r).ingress.length === 2 && r.text.includes('DryRunOperation'), 'dry-run validates without mutation');
r = inspect([solution[1], solution[2], solution[2]]);
check(databaseSG(r).ingress.length === 1 && r.text.includes('InvalidPermission.Duplicate'), 'duplicate source-group rule stays one permit');
r = inspect([solution[0], solution[0]]);
check(app(r).ingress.length === 1 && r.text.includes('InvalidPermission.NotFound'), 'repeat revoke is useful not-found, state stays fixed');
r = inspect(['aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 1-65535 --source-group sg-app']);
check(databaseSG(r).ingress[1].toPort === 65535, 'valid port range stored');
r = inspect(['aws ec2 authorize-security-group-ingress --group-id sg-db --protocol tcp --port 0 --cidr 192.168.1.42/24']);
check(databaseSG(r).ingress[1].cidr === '192.168.1.0/24', 'IPv4 CIDR normalized and port0 valid');
const jsonPermit = 'aws ec2 authorize-security-group-ingress --group-id sg-db --ip-permissions \'[{"IpProtocol":"tcp","FromPort":5432,"ToPort":5432,"UserIdGroupPairs":[{"GroupId":"sg-app"}]}]\'';
check(run(mission, solution.map((c,i) => i === 2 ? jsonPermit : c)).done, 'real JSON source-group permission solves same state');
r = inspect(['aws ec2 authorize-security-group-ingress --group-id sg-db --ip-permissions \'[{"IpProtocol":"tcp","FromPort":5432,"ToPort":5432,"UserIdGroupPairs":[{"GroupId":"sg-app"}]},{"IpProtocol":"tcp","FromPort":5432,"ToPort":5432,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]\'']);
check(databaseSG(r).ingress.length === 1 && r.text.includes('InvalidPermission.Duplicate'), 'multi-rule request does not partially mutate on duplicate');
r = inspect([solution[2], 'aws ec2 describe-security-groups --group-ids sg-db --query SecurityGroups[0].IpPermissions[1].UserIdGroupPairs[0].GroupId --output text']);
check(r.text.endsWith('sg-app'), 'describe exposes actual group reference');
r = inspect(['aws ec2 describe-security-groups --group-ids sg-app --query length(SecurityGroups)']);
check(r.text.endsWith('1'), 'describe respects requested SG IDs');
for (const raw of ['null', '{}', '{', '{"BlockPublicAcls":"true"}', 'BlockPublicAcls=maybe', 'BlockPublicAcls=true,BlockPublicAcls=false', 'Unknown=true']) {
  r = inspect(['aws s3api put-public-access-block --bucket shopkaro-images --public-access-block-configuration \'' + raw + '\'']);
  check(JSON.stringify(bkt(r).bpa) === '{}' && /Error parsing/.test(r.text), 'malformed BPA cannot mutate');
}
r = inspect([solution[6], 'aws s3api put-public-access-block --bucket shopkaro-images --public-access-block-configuration BlockPublicAcls=false']);
check(Object.values(bkt(r).bpa).every(v => v === false) && bkt(r).public, 'PUT replaces all BPA fields; omitted flags default false, exposure re-evaluated');
r = inspect(['aws s3api put-public-access-block --bucket shopkaro-images']);
check(r.text.includes('required') && JSON.stringify(bkt(r).bpa) === '{}', 'missing BPA argument never clears config');
r = inspect(['aws rds modify-db-instance --db-instance-identifier shop-orders --multi-az --apply-immediately true']);
check(!r.state.account.rds[0].multiAZ && !r.state.account.rds[0].pending, 'invalid boolean positional value fails before RDS mutation');
const otherVPC = clone(mission.account); otherVPC.subnets.push({id:'subnet-elsewhere',vpcId:'vpc-elsewhere',cidr:'10.9.0.0/24',az:'ap-south-1b'});
r = inspect(['aws autoscaling update-auto-scaling-group --auto-scaling-group-name shop-app --vpc-zone-identifier subnet-elsewhere'], otherVPC);
check(group(r).vpcZone === 'subnet-app-a' && r.text.includes('another VPC'), 'ASG cannot silently move existing group to unrelated VPC');
for (const command of ['', ' ', 'sudo aws ec2 describe-security-groups', 'AWS EC2 DESCRIBE-SECURITY-GROUPS', 'aws ec2',
  'aws ec2 describe-instances --filters Name=tag:Name', 'aws ec2 describe-security-groups --filters Name=tag:Name',
  'aws ec2 authorize-security-group-ingress', 'aws ec2 revoke-security-group-ingress --group-id',
  'aws ec2 authorize-security-group-ingress --group-id sg-app --ip-permissions \'[null]\'',
  'aws s3api put-public-access-block --bucket shopkaro-images --public-access-block-configuration',
  'aws ec2 describe-security-groups --query', 'aws ec2 describe-security-groups --group-ids "unterminated']) {
  r = inspect(['help', command]); check(!r.text.includes('simulator error:'), 'garbage never reaches crash catch: ' + command);
}
const flow = level.stages.find(s => s.type === 'flowlab'); let states = 0, wins = 0;
for (let azs=1;azs<=2;azs++) for(let multiAZ=0;multiAZ<=1;multiAZ++) for(let nats=1;nats<=2;nats++) for(let instances=1;instances<=4;instances++) for(let days=1;days<=35;days++) {
  const k={azs,multiAZ,nats,instances,days}, model=flow.model(k), expected=azs===2 && multiAZ===1 && nats===2 && instances===4 && days>=7;
  states++; if(expected) wins++;
  check(flow.check(k)===expected && model.verdict.ok===expected, 'all requirements enforced across board');
  check(!JSON.stringify(model).includes('NaN'), 'finite budget and recovery readouts');
}
check(wins===29 && states===1120, 'no one-layer/subnet/backup shortcut; only retention alternatives');
const sample=flow.model({azs:2,multiAZ:1,nats:2,instances:4,days:7});
check(sample.readouts[0].value==='$258.70 · ₹22766', 'documented budget arithmetic');
const dry=level.stages[0];
check(dry.nodes.every(n => n.x>=90 && n.x<=910 && n.y>=33 && n.y+33+34<=520), 'SVG nodes and badges fit canvas');
check(dry.groups.every(g=>g.x>=0&&g.y>=0&&g.x+g.w<=1000&&g.y+g.h<=520), 'AZ boundaries fit canvas');
check(level.steps.length===8 && level.cards.length===8 && level.interview.questions.length===5, 'required teaching shape');
check(run(mission,solution).done===1 && run(mission,solution).done===1, 'independent clean replays solve');
const mcqs=[...level.stages.flatMap(s=>s.questions||[]),...level.interview.questions.filter(q=>!q.terminal)];
const bias=mcqs.filter(q=>{const correct=q.choices[q.answer].length, wrong=q.choices.filter((_,i)=>i!==q.answer).map(c=>c.length);return correct>=1.15*Math.max(...wrong)||correct<=0.85*Math.min(...wrong);});
const positions=[0,1,2,3].map(i=>mcqs.filter(q=>q.answer===i).length);
check(bias.length===0, '14 MCQs: zero correct-answer length bias flags');
check(Math.max(...positions)-Math.min(...positions)<=1, 'answer positions evenly spread: '+positions.join('/'));
check(mcqs.every(q=>['secure','resilient','high-performing','cost-optimized'].includes(q.domain)), 'MCQ domain metadata uses canonical keys');
check(crashes.length===0, 'no simulator/render console errors');
console.log(`✅ ${checks} architecture regression checks passed (${states} budget settings; SG references, omissions, cheats, BPA, placement, parser and reset).`);
