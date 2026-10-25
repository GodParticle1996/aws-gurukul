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
const level = AG.findLevel('vpcbasics'), mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.find(q => q.terminal).terminal;
const repair = [
  'aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-public',
  'aws ec2 replace-route-table-association --association-id rtbassoc-db-a --route-table-id rtb-private',
];
check(level.steps.length === 7 && level.cards.length === 8, 'seven lesson cards, eight flashcards');
check(level.stages.map(s => s.type).join(',') === 'dryrun,flowlab,order,bins,triage,terminal,docker,quiz', 'interaction-first stage order');
const good = run(mission, repair);
check(good.trace.join(',') === '0,1', 'mission wins only after both associations are repaired');
check(good.done === 1, 'one completion callback');
for (let omit = 0; omit < repair.length; omit++) {
  check(!run(mission, repair.filter((_, i) => i !== omit)).done, 'cannot skip association ' + omit);
}
const interviewCommands = interview.hints.slice(1);
check(run(interview, interviewCommands).trace.join(',') === '0,0,0,1', 'interview requires route, association and both SG changes');
for (let omit = 0; omit < interviewCommands.length; omit++) {
  check(!run(interview, interviewCommands.filter((_, i) => i !== omit)).done, 'cannot skip interview action ' + omit);
}
for (const commands of [
  ['aws ec2 describe-route-tables', 'aws ec2 describe-subnets'],
  ['apply -f fix-routes.json'],
  ['aws ec2 delete-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0'],
  ['aws ec2 terminate-instances --instance-ids i-db', ...repair],
  ['aws ec2 stop-instances --instance-ids i-web', ...repair],
  ['aws ec2 revoke-security-group-ingress --group-id sg-web --protocol tcp --port 443 --cidr 0.0.0.0/0', ...repair],
  ['aws ec2 delete-route --route-table-id rtb-main --destination-cidr-block 10.0.0.0/16'],
  ['aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-public --dry-run', repair[1]],
  ['aws ec2 replace-route-table-association --association-id rtbassoc-db-a --route-table-id rtb-public', repair[0]],
]) check(!run(mission, commands).done, 'wrong approach must not win: ' + commands[0]);

// Probe commands never finish a mission; the callback still exposes actual mutable state.
const probe = { ...mission, success: () => false };
function probeRun(commands, account) { return run({ ...probe, ...(account ? { account } : {}) }, commands); }
const table = (r, id) => r.state.account.routeTables.find(t => t.id === id);
let result = probeRun([
  repair[0],
  'aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-private',
]);
check(/InvalidAssociationID.NotFound/.test(result.text), 'replaced association ID becomes stale');
check(table(result, 'rtb-public').associations.some(a => a.id === 'rtbassoc-000000001' && a.subnetId === 'subnet-web-a'), 'new deterministic ID persists');
check(result.state.account.subnets.find(s => s.id === 'subnet-web-a').public === false, 'routing does not change auto public IP flag');
result = probeRun(['aws ec2 associate-route-table --subnet-id subnet-web-a --route-table-id rtb-public']);
check(/Resource.AlreadyAssociated/.test(result.text), 'explicit association requires replace');
result = probeRun(['aws ec2 delete-route --route-table-id rtb-public --destination-cidr-block 10.0.0.0/16']);
check(/cannot remove the local route/.test(result.text) && table(result, 'rtb-public').routes.length === 2, 'local route deletion rejected atomically');
result = probeRun(['aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0 --gateway-id igw-shop']);
check(/RouteAlreadyExists/.test(result.text) && table(result, 'rtb-public').routes.length === 2, 'duplicate route rejected');
result = probeRun(['aws ec2 delete-route --route-table-id rtb-public --destination-cidr-block 0.0.0.0/0 --dry-run']);
check(/DryRunOperation/.test(result.text) && table(result, 'rtb-public').routes.length === 2, 'delete dry-run does not mutate');
result = probeRun(['aws ec2 create-route --gateway-id=igw-shop --destination-cidr-block=203.0.113.7/24 --route-table-id=rtb-public']);
check(table(result, 'rtb-public').routes.some(r => r.destination === '203.0.113.0/24'), 'equals flags/order and canonical CIDR work');
result = probeRun(['aws ec2 delete-route --destination-cidr-block 0.0.0.0/0 --route-table-id rtb-public']);
check(table(result, 'rtb-public').routes.length === 1 && !/Invalid/.test(result.text), 'default route deletion is real state change');
for (const command of [
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 300.0.0.0/24 --gateway-id igw-shop',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 10.0.0.0/33 --gateway-id igw-shop',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id igw-missing',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id local',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id igw-shop --nat-gateway-id nat-missing',
]) {
  const r = probeRun([command]);
  check(table(r, 'rtb-public').routes.length === 2 && /Invalid|error:/.test(r.text), 'invalid route does not mutate: ' + command);
}
const other = JSON.parse(JSON.stringify(mission.account));
other.routeTables.push({ id: 'rtb-other', vpcId: 'vpc-other', associations: [], routes: [] });
other.internetGateways.push({ id: 'igw-other', vpcId: 'vpc-other' });
for (const command of [
  'aws ec2 replace-route-table-association --association-id rtbassoc-web-a --route-table-id rtb-other',
  'aws ec2 create-route --route-table-id rtb-public --destination-cidr-block 203.0.113.0/24 --gateway-id igw-other',
]) check(/InvalidParameterValue/.test(probeRun([command], other).text), 'cross-VPC mutation rejected');
const implicit = JSON.parse(JSON.stringify(interview.account));
result = probeRun(['aws ec2 associate-route-table --route-table-id rtb-public --subnet-id subnet-web-a'], implicit);
check(table(result, 'rtb-public').associations.length === 1, 'implicit main can become explicit public association');
result = probeRun(['aws ec2 replace-route-table-association --association-id rtbassoc-main --route-table-id rtb-private'], implicit);
check(table(result, 'rtb-private').main && !table(result, 'rtb-main').main, 'main association replacement preserves exactly one main table');
result = probeRun(['aws ec2 describe-route-tables --filters Name=association.subnet-id,Values=subnet-web-a']);
check(result.text.includes('rtb-private') && !result.text.includes('"RouteTableId": "rtb-public"'), 'association filter returns effective explicit table');
result = probeRun(['aws ec2 describe-route-tables --route-table-ids rtb-public']);
check(result.text.includes('"Main": false') && result.text.includes('rtbassoc-db-a'), 'describe exposes actual association IDs');
result = probeRun(['aws ec2 describe-network-acls --filters Name=vpc-id,Values=vpc-shop']);
check(result.text.includes('"RuleNumber": 32767') && result.text.includes('"IsDefault": true'), 'default NACL output contains real rules');

const garbage = ['', ' ', 'AWS EC2 DESCRIBE-ROUTE-TABLES', 'sudo aws ec2 describe-route-tables', 'aws ec2',
  'aws ec2 describe-route-tables --filters', 'aws ec2 describe-route-tables --filters "unterminated',
  'aws ec2 describe-route-tables --filters Name=__proto__,Values=x', 'aws ec2 describe-route-tables --filters garbage',
  'aws ec2 create-route', 'aws ec2 delete-route', 'aws ec2 associate-route-table', 'aws ec2 replace-route-table-association',
  'aws ec2 describe-route-tables --route-table-ids', 'aws ec2 describe-network-acls --filters garbage',
  ...['gateway-id', 'route-table-id', 'association-id', 'subnet-id', 'destination-cidr-block'].map(f => 'aws ec2 create-route --' + f)];
for (const command of garbage) {
  const r = probeRun(['help', command]);
  check(!r.done && !r.text.includes('simulator error:'), 'malformed command never crashes: ' + command);
}
const flow = level.stages.find(s => s.type === 'flowlab');
const nodes = level.stages[0].nodes;
for (const n of nodes) {
  const half = Math.max(180, Math.round(84 + n.label.length * 12.4)) / 2;
  check(n.x - half >= 0 && n.x + half <= 1000 && n.y >= 33 && n.y <= 487, 'packet node stays inside SVG: ' + n.id);
}
for (let vpcPrefix = 16; vpcPrefix <= 24; vpcPrefix++) {
  for (let subnetPrefix = 18; subnetPrefix <= 28; subnetPrefix++) {
    for (let azs = 2; azs <= 3; azs++) {
      const k = { vpcPrefix, subnetPrefix, azs }, m = flow.model(k);
      check(m.verdict.ok === flow.check(k), 'planner check matches model');
      check(!JSON.stringify(m).includes('NaN') && m.readouts.every(r => r.value !== Infinity), 'planner readouts finite');
    }
  }
}
check(!flow.check({ vpcPrefix: 24, subnetPrefix: 26, azs: 2 }), 'planner unsolved at defaults');
check(flow.check({ vpcPrefix: 16, subnetPrefix: 24, azs: 3 }), 'documented planner solution wins');
check(!crashes.length, 'no swallowed simulator exceptions: ' + crashes.join('\n'));
// Fresh render gets original state even after successful repairs.
check(!run(mission, ['help']).done && mission.account.routeTables[1].associations[0].id === 'rtbassoc-db-a', 'mission fixtures never mutated by replay');
// Intermediate 1 extends the same shipped network engine; no parallel fake parser.
{
  const level=AG.findLevel('vpcdeep'),mission=level.stages.find(s=>s.type==='terminal'),interview=level.interview.questions.find(q=>q.terminal).terminal;
  const solution=mission.solution, inspect=(commands,account)=>run({...mission,...(account?{account}:{}),success:()=>false},commands);
  const clone=x=>JSON.parse(JSON.stringify(x)), rt=(r,id)=>r.state.account.routeTables.find(t=>t.id===id);
  check(solution.every((c,i)=>mission.hints[i].split(' — ')[0]===c),'vpcdeep hints agree with solution data, including repeated allocate');
  check(!mission.success({account:clone(mission.account)}),'initial network not solved');
  check(run(mission,solution).trace.join(',')==='0,0,0,0,0,0,0,0,0,0,0,0,1','network mission wins only after final route');
  for(let i=0;i<solution.length;i++)check(!run(mission,solution.filter((_,j)=>j!==i)).done,'cannot omit VPC action '+i);
  check(run(interview,interview.solution).trace.join(',')==='0,1','interview requires endpoint association and diagnostic metadata');
  for(let i=0;i<interview.solution.length;i++)check(!run(interview,interview.solution.filter((_,j)=>j!==i)).done,'interview cannot skip '+i);
  for(const commands of [
    ['aws ec2 describe-vpcs','aws ec2 describe-subnets','aws ec2 describe-nat-gateways'],
    solution.map(c=>c.replace('--subnet-id subnet-public-a','--subnet-id subnet-app-a')),
    solution.map(c=>c.replace('--subnet-id subnet-public-b','--subnet-id subnet-public-a')),
    solution.map(c=>c.replace('--nat-gateway-id nat-000000002','--nat-gateway-id nat-000000001')),
    solution.map(c=>c.replace('--route-table-ids rtb-app-a rtb-app-b','--route-table-ids rtb-app-a')),
    solution.map(c=>c.replace('com.amazonaws.ap-south-1.s3','com.amazonaws.us-east-1.s3')),
    solution.map(c=>c.replace('10.10.0.0/16','10.10.2.0/24')),
    ['aws ec2 stop-instances --instance-ids i-app-a',...solution],
    ['aws ec2 terminate-instances --instance-ids i-app-b',...solution],
    ['aws ec2 delete-route --route-table-id rtb-public-a --destination-cidr-block 0.0.0.0/0',...solution],
    ['aws ec2 authorize-security-group-ingress --group-id sg-orders --protocol tcp --port 5432 --cidr 0.0.0.0/0',...solution],
    ['aws ec2 authorize-security-group-ingress --group-id sg-app --protocol tcp --port 22 --cidr 0.0.0.0/0',...solution],
    [...solution.slice(0,12),solution[0],solution[12]],
    ['apply -f fix-network.json','terraform destroy'],
  ])check(!run(mission,commands).done,'wrong network shortcut cannot win');
  let r=inspect(solution);
  check(r.state.account.natGateways.length===2&&r.state.account.addresses.length===2,'two independent public NATs/allocations');
  check(['a','b'].every(az=>rt(r,'rtb-app-'+az).routes.some(x=>x.prefixListId==='pl-s3'&&x.target==='vpce-000000001')),'gateway associations produce both managed prefix routes');
  check(r.state.account.vpcPeerings[0].state==='active','real modeled peer activation');
  check(run(mission,solution).done===1&&run(mission,solution).done===1,'fresh independent network replays');
  r=inspect(solution.slice(0,3));check(r.state.account.natGateways[0].state==='pending','NAT create starts pending');
  r=inspect([...solution.slice(0,3),solution[6]]);check(!rt(r,'rtb-app-a').routes.some(x=>x.target==='nat-000000001'),'no active route installed from pending NAT shortcut');
  r=inspect([solution[0],solution[2],solution[0],solution[4].replace('eipalloc-000000002','eipalloc-000000001')]);check(r.state.account.natGateways.length===1&&/AlreadyAssociated/.test(r.text),'same EIP cannot back two public NATs');
  r=inspect([...solution.slice(0,4),'aws ec2 release-address --allocation-id eipalloc-000000001']);check(r.state.account.addresses.length===2&&r.text.includes('InUse'),'attached NAT EIP cannot be released');
  r=inspect([...solution,'aws ec2 delete-nat-gateway --nat-gateway-id nat-000000001','aws ec2 wait nat-gateway-deleted --nat-gateway-ids nat-000000001','aws ec2 release-address --allocation-id eipalloc-000000001']);
  check(r.state.account.natGateways[0].state==='deleted'&&rt(r,'rtb-app-a').routes.some(x=>x.target==='nat-000000001'&&x.state==='blackhole'),'deleted NAT leaves unusable route');
  check(r.state.account.addresses.length===1,'NAT deleted waiter allows EIP release separately');
  r=inspect([solution[0],'aws ec2 release-address --allocation-id eipalloc-000000001',solution[0]]);check(r.state.account.addresses[0].allocationId==='eipalloc-000000002','released EIP IDs not reused');
  const natToken=solution[2]+' --client-token nat-token';r=inspect([solution[0],natToken,natToken]);check(r.state.account.natGateways.length===1,'NAT client token idempotent');
  r=inspect([solution[0],natToken,natToken.replace('subnet-public-a','subnet-public-b')]);check(r.state.account.natGateways.length===1&&r.text.includes('IdempotentParameterMismatch'),'NAT token mismatch explicit');
  const epToken=solution[8]+' --client-token endpoint-token';r=inspect([epToken,epToken]);check(r.state.account.vpcEndpoints.length===1,'gateway endpoint client token replay idempotent');
  r=inspect([epToken,epToken.replace('rtb-app-a rtb-app-b','rtb-app-a')]);check(r.state.account.vpcEndpoints.length===1&&r.text.includes('IdempotentParameterMismatch'),'endpoint token mismatch explicit');
  r=inspect([solution[8],'aws ec2 modify-vpc-endpoint --vpc-endpoint-id vpce-000000001 --remove-route-table-ids rtb-app-b']);
  check(r.state.account.vpcEndpoints[0].routeTableIds.length===1&&!rt(r,'rtb-app-b').routes.some(x=>x.prefixListId),'remove association removes managed route');
  r=inspect([solution[8],'aws ec2 modify-vpc-endpoint --vpc-endpoint-id vpce-000000001 --add-route-table-ids rtb-app-b']);check(r.state.account.vpcEndpoints[0].routeTableIds.length===2&&rt(r,'rtb-app-b').routes.filter(x=>x.prefixListId).length===1,'association add is idempotent');
  r=inspect([solution[8],'aws ec2 delete-vpc-endpoints --vpc-endpoint-ids vpce-000000001']);check(r.state.account.vpcEndpoints[0].state==='deleted'&&!rt(r,'rtb-app-a').routes.some(x=>x.prefixListId),'delete endpoint removes managed routes and retains deleted metadata');
  r=inspect([solution[8],'aws ec2 delete-route --route-table-id rtb-app-a --destination-prefix-list-id pl-s3']);check(rt(r,'rtb-app-a').routes.some(x=>x.prefixListId)&&r.text.includes('managed'),'manual gateway endpoint route delete cannot bypass association');
  r=inspect([solution[9],solution[11],solution[12]]);check(rt(r,'rtb-orders').routes.some(x=>x.state==='blackhole'),'pending peer routes not active');
  r=inspect([solution[9],solution[11],solution[12],solution[10]]);check(rt(r,'rtb-orders').routes.every(x=>x.state!=='blackhole'),'acceptance activates modeled peer routes');
  r=inspect([solution[9],solution[10],solution[11],'aws ec2 delete-vpc-peering-connection --vpc-peering-connection-id pcx-000000001']);check(rt(r,'rtb-orders').routes.some(x=>x.state==='blackhole'),'deleted peer route is blackhole');
  const overlap=clone(mission.account);overlap.vpcs[1].cidr='10.9.128.0/17';r=inspect([solution[9]],overlap);check(r.state.account.vpcPeerings.length===0&&r.text.includes('overlapping'),'CIDR overlap rejected without peer mutation');
  for(const command of [
    'aws ec2 create-nat-gateway','aws ec2 create-nat-gateway --subnet-id missing --allocation-id eipalloc-000000001',
    'aws ec2 create-vpc-endpoint --vpc-id vpc-shop --service-name missing --route-table-ids rtb-app-a',
    solution[8].replace('rtb-app-b','rtb-analytics'),
    'aws ec2 create-vpc-endpoint --vpc-id vpc-shop --vpc-endpoint-type Interface --service-name com.amazonaws.ap-south-1.secretsmanager --subnet-ids subnet-app-a subnet-public-a --security-group-ids sg-app',
    'aws ec2 create-vpc-endpoint --vpc-id vpc-shop --vpc-endpoint-type Interface --service-name com.amazonaws.ap-south-1.secretsmanager --subnet-ids subnet-app-a --security-group-ids missing',
    solution[8]+' --policy-document null',solution[8]+' --policy-document \'{\'',
    solution[8]+' --banana true','aws ec2 accept-vpc-peering-connection --vpc-peering-connection-id missing',
    solution[9].replace('vpc-analytics','vpc-shop'),
    'aws ec2 create-flow-logs --resource-type VPC --resource-ids vpc-shop --traffic-type invalid --log-destination-type s3 --log-destination arn:aws:s3:::shop-flowlogs',
    'aws ec2 create-flow-logs --resource-type VPC --resource-ids vpc-shop --traffic-type ALL --log-destination-type s3 --log-destination arn:aws:s3:::missing',
    'aws ec2 create-nat-gateway --subnet-id subnet-public-a --allocation-id missing --dry-run true',
  ]) {r=inspect([command]);check(!r.state.account.natGateways.length&&!r.state.account.vpcEndpoints.length&&!r.state.account.vpcPeerings.length&&!r.state.account.flowLogs.length,'invalid creation atomic');check(!r.text.includes('simulator error:'),'creation never throws');}
  for(const command of [solution[0],solution[2],solution[8],solution[9],interview.solution[1]]) {r=inspect([command+' --dry-run']);check(!r.state.account.addresses.length&&!r.state.account.natGateways.length&&!r.state.account.vpcEndpoints.length&&!r.state.account.vpcPeerings.length&&!r.state.account.flowLogs.length,'dry-run never mutates');}
  const iface='aws ec2 create-vpc-endpoint --vpc-id vpc-shop --vpc-endpoint-type Interface --service-name com.amazonaws.ap-south-1.secretsmanager --subnet-ids subnet-app-a subnet-app-b --security-group-ids sg-app --private-dns-enabled';
  r=inspect([iface]);check(r.state.account.vpcEndpoints[0].networkInterfaceIds.length===2&&r.state.account.vpcEndpoints[0].privateDnsEnabled,'interface ENI count and private DNS metadata');
  const noDNS=clone(mission.account);noDNS.vpcs[0].dnsHostnames=false;r=inspect([iface],noDNS);check(!r.state.account.vpcEndpoints.length&&r.text.includes('DNS'),'private DNS precondition rejects before mutation');
  r=inspect([solution[8],'aws ec2 describe-route-tables --route-table-ids rtb-app-b --query RouteTables[0].Routes[1].DestinationPrefixListId --output text']);check(r.text.endsWith('pl-s3'),'describe route uses real DestinationPrefixListId field');
  r=inspect([solution[9],'aws ec2 describe-vpc-peering-connections --query VpcPeeringConnections[0].Status.Code --output text']);check(r.text.endsWith('pending-acceptance'),'peer query sees real state');
  for(const command of ['', ' ', 'sudo aws ec2 describe-vpc-endpoints','AWS EC2 CREATE-NAT-GATEWAY','aws ec2 wait','aws ec2 create-flow-logs --resource-ids','aws ec2 describe-prefix-lists --filters rubbish','aws ec2 describe-vpc-endpoints --query','aws ec2 create-vpc-endpoint --vpc-id "unterminated']) {r=inspect(['help',command]);check(!r.text.includes('simulator error:'),'parser garbage handled');}
  const flow=level.stages.find(s=>s.type==='flowlab');let settings=0,winners=0;
  for(let s3=512;s3<=2048;s3+=512)for(let internet=50;internet<=200;internet+=50)for(let azs=2;azs<=3;azs++)for(let nats=1;nats<=3;nats++)for(let endpoint=0;endpoint<=1;endpoint++){
    const k={s3,internet,azs,nats,endpoint},m=flow.model(k),expected=s3>=1024&&internet>=100&&endpoint===1&&nats===azs;settings++;if(expected)winners++;
    check(m.verdict.ok===expected&&flow.check(k)===expected,'all traffic/cost/resilience constraints checked');check(!JSON.stringify(m).includes('NaN'),'finite bill model');
  }
  check(settings===192&&winners===18,'exhaustive NAT board, demand reduction cannot win');
  check(flow.model({s3:1024,internet:100,azs:2,nats:2,endpoint:1}).readouts[0].value==='$77.50 · ₹6820','documented NAT bill');
  const mcqs=[...level.stages.flatMap(s=>s.questions||[]),...level.interview.questions.filter(q=>!q.terminal)];
  const flags=mcqs.filter(q=>{const a=q.choices[q.answer].length,d=q.choices.filter((_,i)=>i!==q.answer).map(c=>c.length);return a>=1.15*Math.max(...d)||a<=0.85*Math.min(...d);});
  check(flags.length===0,'VPC MCQs have no length-bias flags: '+JSON.stringify(flags.map(q=>q.q)));
  check(Math.max(...[0,1,2,3].map(a=>mcqs.filter(q=>q.answer===a).length))-Math.min(...[0,1,2,3].map(a=>mcqs.filter(q=>q.answer===a).length))<=1,'VPC MCQ answer positions balanced');
  const dry=level.stages[0], width=n=>Math.max(180,Math.round(84+n.label.length*12.4));
  check(dry.groups.every(g=>['region','az','vpc','public','private','account','onprem'].includes(g.kind)),'diagram uses styled boundary types');
  check(dry.nodes.every(n=>n.x-width(n)/2>=0&&n.x+width(n)/2<=1000&&n.y+67<=520),'all network nodes and badges within SVG');
  for(let i=0;i<dry.nodes.length;i++)for(let j=i+1;j<dry.nodes.length;j++)if(dry.nodes[i].y===dry.nodes[j].y)check(Math.abs(dry.nodes[i].x-dry.nodes[j].x)>=(width(dry.nodes[i])+width(dry.nodes[j]))/2+15,'same-row network nodes do not overlap');
  check(!crashes.length,'no network renderer exceptions');
}
console.log(`✅ ${checks} VPC regression checks passed (198 subnet + 192 NAT-budget settings; state, omitted actions, wrong paths, parser, endpoints, peering and replay).`);
