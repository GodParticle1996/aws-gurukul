#!/usr/bin/env node
// Container (ECR / ECS on Fargate) regressions; offline only.
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
const level = AG.findLevel('containers'), mission = level.stages.find(s => s.type === 'terminal'), interview = level.interview.questions.find(q => q.terminal).terminal, clone = x => JSON.parse(JSON.stringify(x));
const never = { ...mission, success: () => false }, neverI = { ...interview, success: () => false }, sol = mission.solution, isol = interview.solution;
const ACCT = '444444444444', REPO = 'shopkaro/orders', CL = '--cluster shopkaro-prod', EXEC = `arn:aws:iam::${ACCT}:role/ecsTaskExecutionRole`, TASK = `arn:aws:iam::${ACCT}:role/orders-task-role`, EC2ROLE = `arn:aws:iam::${ACCT}:role/monolith-ec2-role`;
const SUB_A = 'subnet-0orders1a00001', SUB_B = 'subnet-0orders1b00001', PUB_A = 'subnet-0public1a00001', PUB_B = 'subnet-0public1b00001', SG_ORDERS = 'sg-0orders0000001', SG_MONO = 'sg-0monolith00001', SG_ALB = 'sg-0alb00000000001';
const TG_ORDERS = `arn:aws:elasticloadbalancing:ap-south-1:${ACCT}:targetgroup/tg-orders/6d0ecf831eec9f09`, TG_MONO = `arn:aws:elasticloadbalancing:ap-south-1:${ACCT}:targetgroup/tg-monolith/943f017f100becff`;
const READ = sol.at(-1), WAIT = sol.at(-2), REG = sol[3], CREATE = sol[4];
const reg = (exec, task, extra = '') => `aws ecs register-task-definition --cli-input-json file://orders-td.json${exec ? ' --execution-role-arn ' + exec : ''}${task ? ' --task-role-arn ' + task : ''}${extra}`;
const create = over => { let c = CREATE; for (const [a, b] of over) { assert.ok(c.includes(a), 'create-service fragment ' + a); c = c.replace(a, b); } return c; };
const ecrPart = sol.slice(0, 3), svc = s => s.account.ecsServices.find(x => x.name === 'orders'), primary = s => svc(s).deployments.find(d => d.status === 'PRIMARY');
const digest = tag => 'sha256:' + { 'v2.3.0': '2558ba46fe87579802deecf7184c4a2d486685bc2906950621169bc6f068aadc', 'v2.4.0': '3538dfd54d3a919e9e34d2b30ba68e7e727c72b68fdffc5d0a3f717367f72d0b', 'v2.5.0': 'a788dbc50bf0dac3944eb7916de58dbb99da9e636442953668d08a957f8dd0a5' }[tag];

// Intended solutions: final action only, task agreement, clean reset, every omission loses, inventory cannot win.
for (const stage of [mission, interview]) {
  const r = run(stage, stage.solution);
  check(r.done === 1, 'intended wins ' + r.text.slice(-400));
  check(r.trace.slice(0, -1).every(n => !n) && r.trace.at(-1) === 1, 'final action only');
  check(stage.tasks.every(t => t.check(r.state)), 'state tasks agree');
  check(run(stage, stage.solution).done === 1, 'clean reset');
  for (let i = 0; i < stage.solution.length; i++) check(!run(stage, stage.solution.filter((_, j) => j !== i)).done, 'omission loses ' + i);
  check(!run(stage, ['aws ecr describe-repositories', 'aws ecs describe-clusters', 'aws ecs list-services ' + CL, 'aws ecs describe-services ' + CL + ' --services orders', 'aws iam list-roles']).done, 'inventory alone cannot win');
}
const solved = run(never, sol), isolved = run(neverI, isol);
check(mission.success(solved.state) && interview.success(isolved.state), 'reference ready states');
check(primary(solved.state).imageDigest === digest('v2.4.0') && primary(isolved.state).imageDigest === digest('v2.5.0'), 'deployments pin the tag digest');
check(new Set(solved.state.account.containerTasks.filter(t => t.lastStatus === 'RUNNING').map(t => t.az)).size === 2, 'two tasks spread across both AZs');
check(solved.state.account.logGroups[0].events.some(e => e.includes('uploaded to s3://shopkaro-invoices')), 'app log shows the task-role upload');
check(isolved.state.account.containerTasks.filter(t => t.lastStatus === 'RUNNING').every(t => t.taskDefinition.endsWith('orders:3')), 'interview: only orders:3 tasks keep running');
check(/deployment ecs-svc\/4410000000000000003\) deployment completed/.test(isolved.state.account.ecsServices[0].events.join('\n')), 'deployment IDs stay exact (no float rounding)');

// Contract-breaking follow-ups revoke the win even after a fresh read.
for (const follow of [
  [`aws ecr put-image-tag-mutability --repository-name ${REPO} --image-tag-mutability MUTABLE`],
  [`aws ecr put-lifecycle-policy --repository-name ${REPO} --lifecycle-policy-text file://lifecycle-keep-3.json`],
  [`aws ecr delete-lifecycle-policy --repository-name ${REPO}`],
  ['aws ecr put-registry-scanning-configuration --scan-type BASIC'],
  [`aws ecr batch-delete-image --repository-name ${REPO} --image-ids imageTag=v2.4.0`],
  [`aws ecr batch-delete-image --repository-name ${REPO} --image-ids imageTag=v2.3.0`],
  [`aws ecs update-service ${CL} --service orders --desired-count 1`, WAIT],
  [`aws ecs update-service ${CL} --service orders --deployment-configuration 'deploymentCircuitBreaker={enable=false,rollback=false}'`],
  [`aws ecs update-service ${CL} --service orders --deployment-configuration 'deploymentCircuitBreaker={enable=true,rollback=false}'`],
  [`aws ecs update-service ${CL} --service orders --desired-count 0`, WAIT, `aws ecs delete-service ${CL} --service orders`],
  [`aws ecs delete-service ${CL} --service orders --force`],
  ['aws ec2 delete-vpc-endpoints --vpc-endpoint-ids vpce-0ecrdkr000001'],
  ['aws ec2 delete-vpc-endpoints --vpc-endpoint-ids vpce-0s3gw00000001'],
  [`aws ec2 revoke-security-group-ingress --group-id ${SG_ORDERS} --protocol tcp --port 8080 --source-group ${SG_ALB}`],
  [reg(EXEC, EXEC), `aws ecs update-service ${CL} --service orders --task-definition orders:2`, WAIT],
  [reg(EXEC, ''), `aws ecs update-service ${CL} --service orders --task-definition orders:2`, WAIT],
  [`aws ecs update-service ${CL} --service orders --force-new-deployment`]
]) { const r = run(never, [...sol, ...follow, READ]); check(!mission.success(r.state), 'current state revokes win ' + follow.join(' ; ')); }
const rollback = run(never, [...sol, reg(TASK, EXEC), `aws ecs update-service ${CL} --service orders --task-definition orders:2`, WAIT]);
check(rollback.text.includes('Services stable') && rollback.state.account.ecsServices[0].failedDeployments.length === 1 && primary(rollback.state).taskDefinition.endsWith('orders:1'), 'circuit breaker rolls a failed deploy back and the waiter still passes');
check(/rolling back to deployment/.test(rollback.state.account.ecsServices[0].events.join('\n')) && rollback.state.account.containerTasks.filter(t => t.lastStatus === 'STOPPED' && /orders-task-role\/[0-9a-f]+ is not authorized to perform: ecr:GetAuthorizationToken/.test(t.stoppedReason || '')).length === 3, 'swapped roles: 3 stopped tasks name the execution role (threshold 3 for desired 2)');
check(mission.success(run(never, [...sol, reg(TASK, EXEC), `aws ecs update-service ${CL} --service orders --task-definition orders:2`, WAIT, READ]).state), 'after a rollback the original v2.4.0 contract holds again');
check(mission.success(run(never, [...sol, `aws ecs update-service ${CL} --service orders --force-new-deployment`, WAIT, READ]).state), 'a forced redeploy of the same revision keeps the contract');

// Direct state mutations: every declared contract field matters (read marker stays current).
const tg = a => a.containerTargetGroups.find(t => t.name === 'tg-orders'), ep = (a, s) => a.vpcEndpoints.find(e => e.serviceName.endsWith('.' + s)), sv = a => a.ecsServices[0];
for (const mutate of [
  a => a.iamRoles[0].grants = ['logs'], a => a.iamRoles[0].trust = 'ec2.amazonaws.com', a => a.iamRoles[1].grants = [], a => a.iamRoles[1].trust = 'ec2.amazonaws.com',
  a => tg(a).targetType = 'instance', a => tg(a).loadBalancer.securityGroups = ['sg-other'], a => ep(a, 's3').routeTableIds = [], a => ep(a, 'ecr.api').privateDnsEnabled = false, a => ep(a, 'logs').state = 'deleted',
  a => a.securityGroups.find(g => g.id === SG_ORDERS).ingress = [], a => a.subnets.find(s => s.id === SUB_B).az = 'ap-south-1a',
  a => sv(a).network.assignPublicIp = 'ENABLED', a => sv(a).network.subnets = [SUB_A], a => sv(a).deploymentConfiguration.deploymentCircuitBreaker.rollback = false, a => sv(a).deployments[0].rolloutState = 'IN_PROGRESS',
  a => sv(a).desired = 3, a => sv(a).loadBalancers[0].containerPort = 80, a => sv(a).strategy = [{ capacityProvider: 'FARGATE_SPOT', base: 0, weight: 1 }], a => a.containerTasks.find(t => t.lastStatus === 'RUNNING').lastStatus = 'STOPPED',
  a => a.containerTasks.find(t => t.lastStatus === 'RUNNING').capacityProvider = 'FARGATE_SPOT', a => a.taskDefinitions[0].taskRoleArn = EXEC, a => a.taskDefinitions[0].containerDefinitions[0].logConfiguration = undefined,
  a => a.ecrRepositories[0].tagMutability = 'MUTABLE', a => a.ecrRegistryScanning = { scanType: 'BASIC', rules: [] }, a => a.ecrRepositories[0].lifecyclePolicy.rules[0].selection.countNumber = 100,
  a => a.ecrRepositories[0].images = a.ecrRepositories[0].images.filter(i => !(i.tags || []).includes('v2.3.0')), a => a.logGroups = [], a => a.natGateways.push({ id: 'nat-0x', subnetId: PUB_A, state: 'available' }),
  a => a.containerMode = false, a => a.callerIdentity.Account = '999999999999', a => a.containerRevision++
]) { const s = clone(solved.state); mutate(s.account); check(!mission.success(s), 'configuration contract required ' + mutate.toString()); }

// Stale read, query projection and wrong-service reads cannot certify.
const bump = [`aws ecr put-image-tag-mutability --repository-name ${REPO} --image-tag-mutability IMMUTABLE`];
check(!mission.success(run(never, [...sol, ...bump]).state), 'later revision invalidates the old read');
check(mission.success(run(never, [...sol, ...bump, READ]).state), 'fresh current read recertifies');
check(!run(mission, [...sol.slice(0, -1), READ + ' --query services[0].deployments']).done, 'query projection cannot certify');
check(!run(mission, [...sol.slice(0, -1), READ.replace('--services orders', '--services payments')]).done, 'reading another service cannot certify');
check(!run(mission, [...sol.slice(0, -2), READ, WAIT]).done, 'a read before the waiter goes stale');
check(run(mission, [...sol.slice(0, -1), 'aws ec2 describe-subnets', 'aws ec2 describe-security-groups', 'aws ec2 describe-route-tables', 'aws ec2 describe-vpc-endpoints', 'aws logs filter-log-events --log-group-name /ecs/orders --filter-pattern invoice', 'aws sts get-caller-identity', 'aws elbv2 describe-target-health --target-group-arn ' + TG_ORDERS, READ]).done === 1, 'shared-infra reads do not disturb the contract');

// Legitimate alternatives.
const alt = (label, cmds) => check(run(mission, cmds).done === 1, 'alternative wins: ' + label);
alt('repository-level scan on push', [sol[0], `aws ecr put-image-scanning-configuration --repository-name ${REPO} --image-scanning-configuration scanOnPush=true`, ...sol.slice(2)]);
alt('IMMUTABLE_WITH_EXCLUSION keeps latest mutable', [`aws ecr put-image-tag-mutability --repository-name ${REPO} --image-tag-mutability IMMUTABLE_WITH_EXCLUSION --image-tag-mutability-exclusion-filters filterType=WILDCARD,filter=latest`, ...sol.slice(1)]);
alt('MUTABLE_WITH_EXCLUSION locks v*', [`aws ecr put-image-tag-mutability --repository-name ${REPO} --image-tag-mutability MUTABLE_WITH_EXCLUSION --image-tag-mutability-exclusion-filters filterType=WILDCARD,filter=v*`, ...sol.slice(1)]);
alt('ENHANCED continuous scanning', [sol[0], `aws ecr put-registry-scanning-configuration --scan-type ENHANCED --rules '[{"scanFrequency":"CONTINUOUS_SCAN","repositoryFilters":[{"filter":"shopkaro/*","filterType":"WILDCARD"}]}]'`, ...sol.slice(2)]);
alt('inline 14-day untagged policy', [sol[0], sol[1], `aws ecr put-lifecycle-policy --repository-name ${REPO} --lifecycle-policy-text '{"rules":[{"rulePriority":1,"selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":14},"action":{"type":"expire"}}]}'`, ...sol.slice(3)]);
alt('preview both drafts first', [sol[0], sol[1], `aws ecr start-lifecycle-policy-preview --repository-name ${REPO} --lifecycle-policy-text file://lifecycle-keep-3.json`, `aws ecr get-lifecycle-policy-preview --repository-name ${REPO}`, `aws ecr start-lifecycle-policy-preview --repository-name ${REPO} --lifecycle-policy-text file://lifecycle-safe.json`, `aws ecr get-lifecycle-policy-preview --repository-name ${REPO}`, ...sol.slice(2)]);
alt('FARGATE capacity provider strategy', [...sol.slice(0, 4), create([['--launch-type FARGATE', '--capacity-provider-strategy capacityProvider=FARGATE,weight=1']]), WAIT, READ]);
alt('FARGATE base with a zero-weight Spot entry', [...sol.slice(0, 4), create([['--launch-type FARGATE', '--capacity-provider-strategy capacityProvider=FARGATE,base=2,weight=1']]), WAIT, READ]);
alt('JSON network/load-balancer/deployment forms', [...sol.slice(0, 4), `aws ecs create-service ${CL} --service-name orders --task-definition orders:1 --desired-count 2 --launch-type FARGATE --network-configuration '{"awsvpcConfiguration":{"subnets":["${SUB_B}","${SUB_A}"],"securityGroups":["${SG_ORDERS}"],"assignPublicIp":"DISABLED"}}' --load-balancers '[{"targetGroupArn":"${TG_ORDERS}","containerName":"orders","containerPort":8080}]' --deployment-configuration '{"deploymentCircuitBreaker":{"enable":true,"rollback":true}}'`, WAIT, READ]);
alt('service via --cli-input-json inline', [...sol.slice(0, 4), `aws ecs create-service --cli-input-json '{"cluster":"shopkaro-prod","serviceName":"orders","taskDefinition":"orders:1","desiredCount":2,"launchType":"FARGATE","networkConfiguration":{"awsvpcConfiguration":{"subnets":["${SUB_A}","${SUB_B}"],"securityGroups":["${SG_ORDERS}"]}},"loadBalancers":[{"targetGroupArn":"${TG_ORDERS}","containerName":"orders","containerPort":8080}],"deploymentConfiguration":{"deploymentCircuitBreaker":{"enable":true,"rollback":true}}}'`, WAIT, READ]);
alt('ECS before ECR hardening', [sol[3], sol[4], sol[5], sol[0], sol[1], sol[2], READ]);
alt('full task definition ARN and equals/whitespace forms', [...sol.slice(0, 4).map(c => c.replace(' --repository-name ', '\t--repository-name=')), CREATE.replace('--task-definition orders:1', `--task-definition=arn:aws:ecs:ap-south-1:${ACCT}:task-definition/orders:1`), WAIT, READ]);
alt('failed first deploy, then a corrected revision', [...ecrPart, reg(EXEC, EC2ROLE), CREATE, WAIT, REG, `aws ecs update-service ${CL} --service orders --task-definition orders:2`, WAIT, READ]);
const fam = run(interview, [isol[0] + ' --family orders-v25', `aws ecs update-service ${CL} --service orders --task-definition orders-v25:1`, isol[2], isol[3]]);
check(fam.done === 1, 'interview: a new family name is a valid fix');
check(run(interview, [isol[0], isol[1], isol[2], `aws ecs deregister-task-definition --task-definition orders:2`, isol[3]]).done === 1, 'interview: deregistering the bad revision is fine');

// Wrong paths never win and teach the reason.
const wrong = (label, cmds, needle) => { const r = run(never, cmds); check(!mission.success(r.state) && (!needle || r.text.includes(needle)), 'wrong path loses: ' + label + ' ' + (needle && !r.text.includes(needle) ? r.text.slice(-300) : '')); return r; };
wrong('EC2 instance role as task role', [...ecrPart, reg(EXEC, EC2ROLE), CREATE, WAIT, READ], 'ECS was unable to assume the role');
wrong('roles swapped on a first deploy', [...ecrPart, reg(TASK, EXEC), CREATE, WAIT, READ], 'is not authorized to perform: ecr:GetAuthorizationToken');
const noTask = wrong('no task role', [...ecrPart, reg(EXEC, ''), CREATE, WAIT, READ], 'No taskRoleArn');
check(noTask.state.account.logGroups[0].events.some(e => e.includes('Unable to locate credentials')) && primary(noTask.state).rolloutState === 'COMPLETED', 'no task role: ECS is happy, the app has no credentials');
const mono = wrong('instance target group', [...ecrPart, REG, create([['tg-orders/6d0ecf831eec9f09', 'tg-monolith/943f017f100becff']]), WAIT, READ], 'which is incompatible with the awsvpc network mode');
check(!mono.state.account.ecsServices.length, 'incompatible target group creates no service');
wrong('public subnets without a public IP', [...ecrPart, REG, create([[`subnets=[${SUB_A},${SUB_B}]`, `subnets=[${PUB_A},${PUB_B}]`]]), WAIT, READ], 'starport-layer-bucket');
wrong('public subnets with a public IP', [...ecrPart, REG, create([[`subnets=[${SUB_A},${SUB_B}]`, `subnets=[${PUB_A},${PUB_B}]`], ['assignPublicIp=DISABLED', 'assignPublicIp=ENABLED']]), WAIT, READ]);
wrong('one AZ only', [...ecrPart, REG, create([[`subnets=[${SUB_A},${SUB_B}]`, `subnets=[${SUB_A}]`]]), WAIT, READ]);
const unhealthy = wrong('monolith security group', [...ecrPart, REG, create([[`securityGroups=[${SG_ORDERS}]`, `securityGroups=[${SG_MONO}]`]]), WAIT, READ], 'Task failed ELB health checks');
check(primary(unhealthy.state).rolloutState === 'FAILED' && unhealthy.text.includes('Max attempts exceeded'), 'first deploy with nothing to roll back to stays FAILED');
wrong('keep-3 lifecycle', [sol[0], sol[1], `aws ecr put-lifecycle-policy --repository-name ${REPO} --lifecycle-policy-text file://lifecycle-keep-3.json`, ...sol.slice(3)]);
wrong('no circuit breaker', [...ecrPart, REG, create([[` --deployment-configuration 'deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100'`, '']]), WAIT, READ]);
wrong('API on Fargate Spot', [...ecrPart, REG, create([['--launch-type FARGATE', '--capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1']]), WAIT, READ]);
wrong('desired 1', [...ecrPart, REG, create([['--desired-count 2', '--desired-count 1']]), WAIT, READ]);
const noLaunch = wrong('no launch type falls back to EC2', [...ecrPart, REG, create([[' --launch-type FARGATE', '']]), WAIT, READ], 'uses launch type EC2');
check(!noLaunch.state.account.ecsServices.length, 'EC2 fallback creates no service');
wrong('launch type and strategy together', [...ecrPart, REG, create([['--launch-type FARGATE', '--launch-type FARGATE --capacity-provider-strategy capacityProvider=FARGATE,weight=1']]), WAIT, READ], 'Specifying both a launch type and capacity provider strategy');
const nocb = run(never, [...ecrPart, REG, create([[` --deployment-configuration 'deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100'`, ''], [`securityGroups=[${SG_ORDERS}]`, `securityGroups=[${SG_MONO}]`]]), WAIT, WAIT, WAIT, WAIT]);
check(primary(nocb.state).rolloutState === 'IN_PROGRESS' && nocb.state.account.containerTasks.filter(t => t.lastStatus === 'STOPPED').length === 10 && nocb.text.includes('Max attempts exceeded'), 'without a circuit breaker a failing deploy keeps retrying (fixture keeps 10 stopped tasks)');
const iv = (label, cmds, needle) => { const r = run(neverI, cmds); check(!interview.success(r.state) && (!needle || r.text.includes(needle)), 'interview wrong path loses: ' + label); return r; };
iv('roll back to v2.4.0', [`aws ecs update-service ${CL} --service orders --task-definition orders:1`, isol[2], isol[3]]);
iv('force redeploy of orders:2', [`aws ecs update-service ${CL} --service orders --force-new-deployment`, isol[2], isol[3]]);
iv('register without the execution role', [`aws ecs register-task-definition --cli-input-json file://orders-td-v2.5.0.json --task-role-arn ${TASK}`, isol[1], isol[2], isol[3]], 'execution role ARN to support log driver awslogs');
iv('IAM is read-only here', [`aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::${ACCT}:policy/orders-invoices-put`, isol[3]], 'not modeled here');

// Error paths stay atomic and teach the requirement.
const repoBefore = clone(never.account.ecrRepositories[0]);
for (const [label, command, needle] of [
  ['bad Fargate size', reg(EXEC, TASK, ' --memory 8192'), 'No Fargate configuration exists'],
  ['vCPU string size', reg(EXEC, TASK, " --cpu '0.25 vCPU' --memory '4 GB'"), 'No Fargate configuration exists'],
  ['bridge mode', reg(EXEC, TASK, ' --network-mode bridge'), 'awsvpc'],
  ['awslogs without execution role', reg('', TASK), 'execution role ARN to support log driver awslogs'],
  ['unknown role', reg(EXEC, `arn:aws:iam::${ACCT}:role/ghost`), 'Role is not valid'],
  ['EC2-only compatibility', reg(EXEC, TASK, ' --requires-compatibilities EC2'), 'requiresCompatibilities ["FARGATE"]'],
  ['Windows runtime', reg(EXEC, TASK, ' --runtime-platform cpuArchitecture=X86_64,operatingSystemFamily=WINDOWS_SERVER_2022_CORE'), 'LINUX'],
  ['unknown cluster', CREATE.replace('shopkaro-prod', 'ghost'), 'ClusterNotFoundException'],
  ['unknown task definition', CREATE.replace('orders:1', 'orders:9'), 'Unable to describe task definition'],
  ['unknown option', `aws ecs describe-services ${CL} --services orders --colour blue`, 'Unknown options'],
  ['duplicate option', `aws ecr describe-images --repository-name ${REPO} --repository-name ${REPO}`, 'duplicate option'],
  ['wrong Region', `aws ecr describe-repositories --region us-east-1`, 'Container fixture scope'],
  ['exclusion mode without filters', `aws ecr put-image-tag-mutability --repository-name ${REPO} --image-tag-mutability IMMUTABLE_WITH_EXCLUSION`, 'needs --image-tag-mutability-exclusion-filters'],
  ['filters with plain IMMUTABLE', `aws ecr put-image-tag-mutability --repository-name ${REPO} --image-tag-mutability IMMUTABLE --image-tag-mutability-exclusion-filters filterType=WILDCARD,filter=latest`, 'takes no filters'],
  ['any rule not last', `aws ecr put-lifecycle-policy --repository-name ${REPO} --lifecycle-policy-text '{"rules":[{"rulePriority":1,"selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":3},"action":{"type":"expire"}},{"rulePriority":2,"selection":{"tagStatus":"untagged","countType":"imageCountMoreThan","countNumber":1},"action":{"type":"expire"}}]}'`, 'must have the highest rulePriority'],
  ['tag list on untagged', `aws ecr put-lifecycle-policy --repository-name ${REPO} --lifecycle-policy-text '{"rules":[{"rulePriority":1,"selection":{"tagStatus":"untagged","tagPrefixList":["v"],"countType":"imageCountMoreThan","countNumber":1},"action":{"type":"expire"}}]}'`, 'only valid with tagStatus tagged'],
  ['days unit on count rule', `aws ecr put-lifecycle-policy --repository-name ${REPO} --lifecycle-policy-text '{"rules":[{"rulePriority":1,"selection":{"tagStatus":"untagged","countType":"imageCountMoreThan","countUnit":"days","countNumber":1},"action":{"type":"expire"}}]}'`, 'countUnit is only valid'],
  ['lifecycle not JSON', `aws ecr put-lifecycle-policy --repository-name ${REPO} --lifecycle-policy-text 'rules=none'`, 'invalid JSON'],
  ['basic continuous scan', `aws ecr put-registry-scanning-configuration --scan-type BASIC --rules 'scanFrequency=CONTINUOUS_SCAN,repositoryFilters=[{filter=*,filterType=WILDCARD}]'`, 'scanFrequency for BASIC'],
  ['existing repository', `aws ecr create-repository --repository-name ${REPO}`, 'RepositoryAlreadyExistsException'],
  ['uppercase repository', `aws ecr create-repository --repository-name Shop/Orders`, "Invalid parameter at 'repositoryName'"],
  ['missing image', `aws ecr describe-images --repository-name ${REPO} --image-ids imageTag=v9.9.9`, 'ImageNotFoundException'],
  ['IAM write', 'aws iam put-role-policy --role-name ecsTaskExecutionRole --policy-name x --policy-document {}', 'not modeled here'],
  ['run-task not modeled', `aws ecs run-task ${CL} --task-definition orders:1`, 'not modeled here'],
  ['other waiter', `aws ecs wait tasks-running ${CL} --tasks x`, 'services-stable'],
  ['describe without services', `aws ecs describe-services ${CL}`, 'required: --services'],
  ['no lifecycle yet', `aws ecr get-lifecycle-policy --repository-name ${REPO}`, 'LifecyclePolicyNotFoundException'],
  ['preview without dry run', `aws ecr get-lifecycle-policy-preview --repository-name ${REPO}`, 'LifecyclePolicyPreviewNotFoundException'],
  ['deregister without revision', 'aws ecs deregister-task-definition --task-definition orders', 'family:revision']
]) { const r = run(never, [command]); check(r.text.includes(needle) && !r.state.account.taskDefinitions.length && !r.state.account.ecsServices.length && JSON.stringify(r.state.account.ecrRepositories[0]) === JSON.stringify(repoBefore) && !r.state.account.ecrRegistryScanning.rules.length, 'error atomic: ' + label + ' ' + r.text.split('\n').at(-1)); }
for (const [label, cmds, needle] of [
  ['container port mismatch', [REG, CREATE.replace('containerPort=8080', 'containerPort=80')], 'did not have a container port 80'],
  ['desired over fixture cap', [REG, CREATE.replace('--desired-count 2', '--desired-count 21')], 'desiredCount must be an integer 0-20'],
  ['unknown subnet', [REG, CREATE.replace(SUB_B, 'subnet-0ghost000000001')], 'The subnet ID does not exist'],
  ['unknown security group', [REG, CREATE.replace(SG_ORDERS, 'sg-0ghost000000001')], 'securityGroups must be'],
  ['blue/green strategy', [REG, CREATE.replace('maximumPercent=200', 'strategy=BLUE_GREEN,maximumPercent=200')], 'BLUE_GREEN'],
  ['CodeDeploy controller', [REG, CREATE + ' --deployment-controller type=CODE_DEPLOY'], 'CodeDeploy'],
  ['Spot not associated', [REG, `aws ecs create-cluster --cluster-name sandbox`, CREATE.replace('shopkaro-prod', 'sandbox').replace('--launch-type FARGATE', '--capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1')], 'not associated with the cluster'],
  ['strategy with zero weights', [REG, CREATE.replace('--launch-type FARGATE', '--capacity-provider-strategy capacityProvider=FARGATE,weight=0')], 'weight greater than zero'],
  ['two bases', [REG, CREATE.replace('--launch-type FARGATE', '--capacity-provider-strategy capacityProvider=FARGATE,base=1,weight=1 capacityProvider=FARGATE_SPOT,base=1,weight=1')], 'Only one capacity provider'],
  ['duplicate service', [REG, CREATE, CREATE], 'not idempotent']
]) { const r = run(never, cmds); check(r.text.includes(needle) && r.state.account.ecsServices.length === (label === 'duplicate service' ? 1 : 0), 'error atomic: ' + label + ' ' + r.text.split('\n').at(-1)); }
check(run(never, ['ls']).text.includes('lifecycle-keep-3.json') && run(never, ['cat lifecycle-keep-3.json']).text.includes('"tagStatus": "any"'), 'mission files list and read');
check(run(never, [`aws ecr get-login-password`]).text.includes('not-a-real-credential'), 'login password is a labelled training token');

// Evaluator unit checks (declared contract, not containers).
const A = clone(solved.state.account), TD = A.taskDefinitions[0], NET = A.ecsServices[0].network, DG = digest('v2.4.0');
const fail = (mut, td = TD, net = NET) => { const a = clone(A); mut(a); return AG.containerStartFailure(a, td, net, DG); };
check(AG.containerStartFailure(A, TD, NET, DG) === null && AG.containerHealthFailure(A, A.ecsServices[0]) === null, 'solved state starts and passes health');
check(/no basic auth credentials/.test(AG.containerStartFailure(A, { ...TD, executionRoleArn: undefined }, NET, DG).reason), 'no execution role → registry auth fails');
check(/ecr:GetAuthorizationToken/.test(fail(a => a.iamRoles[0].grants = ['logs']).reason), 'execution role without ECR pull');
check(/connection issue between the task and Amazon ECR/.test(fail(a => a.vpcEndpoints = a.vpcEndpoints.filter(e => !e.serviceName.endsWith('ecr.dkr'))).reason), 'missing ecr.dkr endpoint → connection issue');
check(/connection issue/.test(fail(a => a.vpcEndpoints.find(e => e.serviceName.endsWith('ecr.api')).privateDnsEnabled = false).reason), 'interface endpoint without private DNS does not resolve');
check(/starport-layer-bucket/.test(fail(a => a.vpcEndpoints.find(e => e.serviceName.endsWith('.s3')).routeTableIds = []).reason), 'S3 gateway not on the subnet route table → layer download timeout');
check(/logs\.ap-south-1\.amazonaws\.com/.test(fail(a => a.vpcEndpoints = a.vpcEndpoints.filter(e => !e.serviceName.endsWith('.logs'))).reason), 'awslogs without logs endpoint');
check(/log group does not exist/.test(fail(a => a.logGroups = []).reason), 'missing log group without create-group');
const createGroup = clone(TD); createGroup.containerDefinitions[0].logConfiguration.options['awslogs-create-group'] = 'true';
check(/logs:CreateLogGroup/.test(fail(a => a.logGroups = [], createGroup).reason), 'create-group needs logs:CreateLogGroup');
check(/unable to assume the role/.test(AG.containerStartFailure(A, { ...TD, taskRoleArn: EC2ROLE }, NET, DG).reason), 'task role trusted by EC2 only cannot be assumed');
check(/exec format error/.test(AG.containerStartFailure(A, { ...TD, runtimePlatform: { cpuArchitecture: 'ARM64', operatingSystemFamily: 'LINUX' } }, NET, DG).containerReason), 'ARM64 task with amd64-only image');
check(/failed to resolve ref/.test(AG.containerStartFailure(A, TD, NET, 'sha256:' + '0'.repeat(64)).reason), 'pinned digest no longer in ECR');
check(fail(a => { a.vpcEndpoints = []; a.natGateways = [{ id: 'nat-0x', subnetId: PUB_A, state: 'available' }]; a.routeTables.find(t => t.id === 'rtb-0private000001').routes.push({ destination: '0.0.0.0/0', target: 'nat-0x', type: 'nat' }); }) === null, 'NAT gateway route is an alternative pull path');
check(/connection issue/.test(fail(a => { a.vpcEndpoints = []; a.natGateways = [{ id: 'nat-0x', subnetId: PUB_A, state: 'pending' }]; a.routeTables.find(t => t.id === 'rtb-0private000001').routes.push({ destination: '0.0.0.0/0', target: 'nat-0x', type: 'nat' }); }).reason), 'pending NAT is not a path');
check(AG.containerStartFailure(A, TD, { ...NET, subnets: [PUB_A], assignPublicIp: 'ENABLED' }, DG) === null, 'public subnet + public IP pulls through the IGW');
const health = mut => { const a = clone(A); mut(a); return AG.containerHealthFailure(a, a.ecsServices[0]); };
check(health(a => a.securityGroups.find(g => g.id === SG_ORDERS).ingress = [{ protocol: 'tcp', fromPort: 8080, toPort: 8080, cidr: '10.40.0.0/16' }]) === null && health(a => a.securityGroups.find(g => g.id === SG_ORDERS).ingress = [{ protocol: '-1', cidr: '0.0.0.0/0' }]) === null, 'VPC CIDR or open rule also lets the ALB in');
check(/ELB health checks/.test(health(a => a.securityGroups.find(g => g.id === SG_ORDERS).ingress = [{ protocol: 'tcp', fromPort: 80, toPort: 80, sourceGroup: SG_ALB }]).reason), 'wrong port fails health');
check(/Unable to locate credentials/.test(AG.containerAppResult(A, { ...TD, taskRoleArn: undefined }).line) && /assumed-role\/ecsTaskExecutionRole\//.test(AG.containerAppResult(A, { ...TD, taskRoleArn: EXEC }).line) && AG.containerAppResult(A, TD).ok, 'app credentials come only from the task role');
const repo = clone(never.account.ecrRepositories[0]), files = never.files, now = never.account.containerNow, names = r => r.map(x => x.imageTags.join('+') || x.imageDigest.slice(7, 13)).join(',');
const keep3 = AG.ecrLifecyclePreview(repo, JSON.parse(files['lifecycle-keep-3.json'].content), now), safe = AG.ecrLifecyclePreview(repo, JSON.parse(files['lifecycle-safe.json'].content), now);
check(keep3.length === 10 && keep3.some(x => x.imageTags.includes('v2.4.0')) && keep3.some(x => x.imageTags.includes('v2.3.0')), 'keep-3 expires the release and the rollback image ' + names(keep3));
check(safe.length === 4 && safe.every(x => !x.imageTags.length) && safe.every(x => Date.parse(x.imagePushedAt) < Date.parse('2026-10-01')), 'safe policy expires only the September untagged builds ' + names(safe));
const claimed = AG.ecrLifecyclePreview(repo, { rules: [{ rulePriority: 1, selection: { tagStatus: 'tagged', tagPrefixList: ['v'], countType: 'imageCountMoreThan', countNumber: 100 }, action: { type: 'expire' } }, { rulePriority: 2, selection: { tagStatus: 'any', countType: 'imageCountMoreThan', countNumber: 3 }, action: { type: 'expire' } }] }, now);
check(claimed.length === 4 && claimed.every(x => !x.imageTags.length && x.appliedRulePriority === 2), 'an image selected by a higher-priority rule is never expired by a lower one ' + names(claimed));
const prefixAll = AG.ecrLifecyclePreview({ images: [{ digest: 'sha256:a', tags: ['prod', 'v1'], pushedAt: '2026-01-01T00:00:00Z' }, { digest: 'sha256:b', tags: ['v2'], pushedAt: '2026-02-01T00:00:00Z' }] }, { rules: [{ rulePriority: 1, selection: { tagStatus: 'tagged', tagPrefixList: ['prod', 'v'], countType: 'imageCountMoreThan', countNumber: 0 }, action: { type: 'expire' } }] }, now);
check(prefixAll.length === 1 && prefixAll[0].imageDigest === 'sha256:a', 'tagPrefixList needs every prefix to match some tag');
const modes = [['MUTABLE', [], 'v1', false], ['IMMUTABLE', [], 'latest', true], ['IMMUTABLE_WITH_EXCLUSION', [{ filter: 'latest' }], 'latest', false], ['IMMUTABLE_WITH_EXCLUSION', [{ filter: 'latest' }], 'v1', true], ['MUTABLE_WITH_EXCLUSION', [{ filter: 'v*' }], 'v2.4.0', true], ['MUTABLE_WITH_EXCLUSION', [{ filter: 'v*' }], 'latest', false]];
check(modes.every(([m, ex, t, want]) => AG.ecrTagImmutable({ tagMutability: m, exclusions: ex }, t) === want), 'tag immutability modes and exclusions');
const scanAcct = (reg, flag) => ({ ecrRegistryScanning: reg, ecrRepositories: [{ name: REPO, scanOnPush: flag }] });
check(AG.ecrScanOnPush(scanAcct({ scanType: 'BASIC', rules: [] }, true), REPO) && AG.ecrScanOnPush(scanAcct({ scanType: 'ENHANCED', rules: [] }, true), REPO) && !AG.ecrScanOnPush(scanAcct({ scanType: 'BASIC', rules: [{ scanFrequency: 'SCAN_ON_PUSH', repositoryFilters: [{ filter: 'payments/*' }] }] }, false), REPO) && AG.ecrScanOnPush(scanAcct({ scanType: 'ENHANCED', rules: [{ scanFrequency: 'CONTINUOUS_SCAN', repositoryFilters: [{ filter: '*' }] }] }, false), REPO), 'scan on push: repository flag only counts for BASIC; enhanced defaults all; other registry rules need a matching filter');
const T = (cb, d) => AG.containerCbThreshold(cb, d), dflt = { enable: true, rollback: true };
check(T(dflt, 1) === 3 && T(dflt, 2) === 3 && T(dflt, 10) === 5 && T(dflt, 25) === 13 && T(dflt, 400) === 200 && T(dflt, 800) === 200 && T({ ...dflt, thresholdConfiguration: { type: 'UNBOUNDED_PERCENT', value: 50 } }, 800) === 400 && T({ ...dflt, thresholdConfiguration: { type: 'COUNT', value: 5 } }, 800) === 5, 'circuit breaker threshold formula (docs table)');
const ref = AG.containerImageRef(`${ACCT}.dkr.ecr.ap-south-1.amazonaws.com/${REPO}@${DG}`);
check(ref && ref.digest === DG && !ref.tag && AG.containerResolve(A, `${ACCT}.dkr.ecr.ap-south-1.amazonaws.com/${REPO}@${DG}`) === DG && AG.containerResolve(A, `${ACCT}.dkr.ecr.ap-south-1.amazonaws.com/${REPO}:latest`) === DG && !AG.containerImageRef('nginx:latest'), 'image references by tag and digest');

// Garbage commands never crash the engine and never win.
const garbage = ['', ' ', 'random', 'aws', 'aws ecs', 'aws ecr', 'sudo aws ecs describe-clusters', 'AWS ECS DESCRIBE-CLUSTERS', 'aws ecs create-service', 'aws ecs register-task-definition', 'aws ecs register-task-definition --cli-input-json file://missing.json',
  "aws ecs register-task-definition --cli-input-json '{broken'", 'aws ecs register-task-definition --cli-input-json "[]"', 'aws ecs create-service --cli-input-json "{\\"cluster\\":\\"__proto__\\"}"', 'aws ecs create-service --network-configuration __proto__=1',
  "aws ecs create-service --cluster shopkaro-prod --service-name x --task-definition orders:1 --desired-count 1 --launch-type FARGATE --network-configuration 'awsvpcConfiguration={subnets=[a'", 'aws ecs describe-services --cluster __proto__ --services orders',
  'aws ecs describe-tasks --cluster shopkaro-prod --tasks constructor', 'aws ecr describe-images --repository-name __proto__', 'aws ecr put-lifecycle-policy --repository-name shopkaro/orders --lifecycle-policy-text "{\\"rules\\":[null]}"',
  'aws ecr put-registry-scanning-configuration --scan-type BASIC --rules constructor=1', 'aws ecr batch-delete-image --repository-name shopkaro/orders --image-ids imageTag=__proto__', 'aws elbv2 describe-target-groups --names constructor',
  'aws iam get-role --role-name __proto__', 'aws ecs update-service --cluster shopkaro-prod --service ghost', 'aws ecs wait services-stable --cluster shopkaro-prod --services ghost', 'aws ecs describe-task-definition --task-definition constructor:1',
  'aws ecs list-tasks --cluster shopkaro-prod --desired-status DONE', 'aws ecr describe-repositories --region', 'aws ecs describe-clusters --query Missing'];
for (let i = 0; i < 180; i++) garbage.push('aws ' + [['ecs', 'register-task-definition'], ['ecs', 'create-service'], ['ecs', 'update-service'], ['ecr', 'put-lifecycle-policy'], ['ecr', 'put-image-tag-mutability'], ['ecr', 'put-registry-scanning-configuration']][i % 6].join(' ') + ' --' + ['family', 'network-configuration', 'deployment-configuration', 'lifecycle-policy-text', 'image-tag-mutability-exclusion-filters', 'rules'][i % 6] + ' ' + ['null', '[]', '{}', 'constructor', '__proto__', "'broken", '""', '-1'][i % 8]);
for (const command of garbage) {
  const r = run(never, [command]);
  check(!/simulator error:|is not defined|Cannot read properties|is not a function|undefined is not|Maximum call stack/.test(r.text), 'garbage no internal exception ' + command);
  check(!r.state || !mission.success(r.state), 'garbage cannot win');
}

alt('enhanced without rules defaults to continuous all', [sol[0], 'aws ecr put-registry-scanning-configuration --scan-type ENHANCED', ...sol.slice(2)]);
alt('plain scan filter matches repository substring', [sol[0], "aws ecr put-registry-scanning-configuration --scan-type BASIC --rules 'scanFrequency=SCAN_ON_PUSH,repositoryFilters=[{filter=orders,filterType=WILDCARD}]'", ...sol.slice(2)]);
// Review regressions: tags are distinct from image deletion, both CPU architectures, and rolling headroom.
const untag = tag => `aws ecr batch-delete-image --repository-name ${REPO} --image-ids imageTag=${tag}`;
const latestGone = run(never, [...sol, untag('latest'), READ]);
const releaseImage = latestGone.state.account.ecrRepositories[0].images.find(i => i.digest === DG);
check(releaseImage && releaseImage.tags.includes('v2.4.0') && !releaseImage.tags.includes('latest'), 'removing latest preserves the release image and version tag');
check(mission.success(latestGone.state), 'removing an unneeded alias does not break release readiness');
const versionGone = run(never, [...sol, untag('v2.4.0'), READ]);
check(versionGone.state.account.ecrRepositories[0].images.some(i => i.digest === DG && i.tags.includes('latest')), 'removing the version tag preserves the other alias/digest');
check(!mission.success(versionGone.state), 'missing release tag revokes readiness even while the digest exists');
const allGone = run(never, [...sol, untag('latest'), untag('v2.4.0'), READ]);
check(!allGone.state.account.ecrRepositories[0].images.some(i => i.digest === DG), 'removing the final tag deletes the image');
const digestGone = run(never, [...sol, `aws ecr batch-delete-image --repository-name ${REPO} --image-ids imageDigest=${DG}`, READ]);
check(!digestGone.state.account.ecrRepositories[0].images.some(i => i.digest === DG), 'digest deletion removes every alias');
const mismatch = run(never, [...sol, `aws ecr batch-delete-image --repository-name ${REPO} --image-ids imageTag=v2.4.0,imageDigest=${digest('v2.3.0')}`, READ]);
check(mismatch.text.includes('ImageNotFound') && mission.success(mismatch.state), 'mismatched tag and digest cannot delete either image');
const armOnly = clone(A); armOnly.ecrRepositories[0].images.find(i => i.digest === DG).arch = ['arm64'];
check(/linux\/amd64/.test(AG.containerStartFailure(armOnly, TD, NET, DG).containerReason), 'x86 task rejects an arm64-only image');
check(AG.containerStartFailure(armOnly, { ...TD, runtimePlatform: { cpuArchitecture: 'ARM64' } }, NET, DG) === null, 'ARM task accepts an ARM-only image');
armOnly.ecrRepositories[0].images.find(i => i.digest === DG).arch = ['amd64','arm64'];
check(AG.containerStartFailure(armOnly, TD, NET, DG) === null, 'multi-arch image also accepts x86 task');
const noRoom = `aws ecs update-service ${CL} --service orders --deployment-configuration 'maximumPercent=100,minimumHealthyPercent=100'`;
const blocked = run(neverI, [isol[0], noRoom, ...isol.slice(1)]);
check(blocked.text.includes('unable to stop or start tasks') && !interview.success(blocked.state), '100/100 rolling deployment cannot falsely complete or win');
check(primary(blocked.state).rolloutState === 'IN_PROGRESS' && blocked.state.account.containerTasks.filter(t => t.lastStatus === 'RUNNING').every(t => t.taskDefinition.endsWith('orders:2')), 'blocked deploy preserves the original running tasks');
check(run(interview, [isol[0], noRoom, ...isol.slice(1), `aws ecs update-service ${CL} --service orders --deployment-configuration 'maximumPercent=150,minimumHealthyPercent=100'`, isol[2], isol[3]]).done === 1, 'one launch slot unblocks the same deployment');
check(run(interview, [isol[0], noRoom, ...isol.slice(1), `aws ecs update-service ${CL} --service orders --deployment-configuration 'maximumPercent=100,minimumHealthyPercent=50'`, isol[2], isol[3]]).done === 1, 'one stop slot is another valid repair');
for (const mutate of [t => t.imageDigest = digest('v2.3.0'), t => t.taskDefinition = 'orders:99', t => t.subnet = 'subnet-missing']) {
 const state = clone(solved.state); mutate(state.account.containerTasks.find(t => t.lastStatus === 'RUNNING'));
 check(!mission.success(state), 'actual running-task identity agrees with the deployment');
}
const serviceInput = {cluster:'shopkaro-prod',serviceName:'bad-types',taskDefinition:'orders:1',desiredCount:2,launchType:'FARGATE',networkConfiguration:{awsvpcConfiguration:{subnets:[SUB_A,SUB_B],securityGroups:[SG_ORDERS]}}};
for (const [key,bad] of [['loadBalancers',{}],['loadBalancers',[null]],['loadBalancers',[42]],['capacityProviderStrategy',{}],['capacityProviderStrategy',[null]],['capacityProviderStrategy',[false]]]) {
 const cmd = `aws ecs create-service --cli-input-json '${JSON.stringify({...serviceInput,[key]:bad})}'`, r=run(never,[REG,cmd]);
 check(!r.state.account.ecsServices.length && /InvalidParameterException/.test(r.text) && !/Cannot convert|Cannot read|is not a function/.test(r.text), 'malformed service field returns typed atomic error '+key+JSON.stringify(bad));
}
const unsupportedHealth=JSON.parse(never.files['orders-td.json'].content);unsupportedHealth.containerDefinitions[0].healthCheck={command:['CMD-SHELL','exit 1']};
check(run(never,[`aws ecs register-task-definition --cli-input-json '${JSON.stringify(unsupportedHealth)}' --execution-role-arn ${EXEC} --task-role-arn ${TASK}`]).text.includes('not modeled'), 'unsupported custom health check cannot fabricate a healthy task');

// Planner sweep: exactly one design fits the budget, the image and the interruption rules.
let states = 0, wins = 0; const flow = level.stages.find(s => s.type === 'flowlab');
function sweep(i, k) {
  if (i === flow.knobs.length) {
    const m = flow.model(k), ok = flow.check(k);
    check(m.verdict.ok === ok, 'planner verdict agrees');
    check(m.readouts.every(r => !/NaN|undefined/.test(String(r.value))), 'no NaN/undefined');
    if (ok) { wins++; check(k.arch === 2 && k.api === 0 && k.workers === 1 && k.hours === 1 && k.drain === 1, 'win = ARM multi-arch, API On-Demand, Spot workers 8 h with SIGTERM handling'); check(m.readouts.at(-1).value.startsWith('₹8,958'), 'documented total ₹8,958 ' + m.readouts.at(-1).value); }
    states++; return;
  }
  const n = flow.knobs[i]; for (let v = n.min; v <= n.max; v += n.step) sweep(i + 1, { ...k, [n.id]: v });
}
sweep(0, {});
check(states === 72 && wins === 1, 'all 72 states; 1 valid design');
const start = Object.fromEntries(flow.knobs.map(k => [k.id, k.value])), best = { arch: 2, api: 0, workers: 1, hours: 1, drain: 1 };
check(!flow.check(start) && flow.model(start).readouts.at(-1).value.startsWith('₹33,322'), 'start values fail at ₹33,322');
check(flow.model({ ...best, arch: 1 }).verdict.text.includes('exec format error'), 'ARM tasks with an amd64-only image fail');
check(flow.model({ ...best, api: 1 }).verdict.text.includes('checkout'), 'API on Spot fails');
check(flow.model({ ...best, drain: 0 }).verdict.text.includes('SIGTERM'), 'Spot workers need SIGTERM handling');
check(flow.model({ ...best, workers: 0 }).verdict.text.includes('₹11,197'), 'On-Demand workers break the budget (₹11,197)');
check(flow.model({ ...best, hours: 0 }).verdict.text.includes('₹11,944'), '24×7 Spot workers break the budget (₹11,944)');
check(flow.model({ ...best, api: 2 }).readouts[0].value.startsWith('₹27,251'), 'two m7i.xlarge for the small API cost ₹27,251');
check(flow.model({ ...best, arch: 0 }).verdict.text.includes('₹15,995'), 'x86 with every other saving still misses (₹15,995)');

// MCQ quality: explanations, length bias and balanced answer positions.
const qs = [...level.stages.flatMap(s => s.type === 'quiz' || s.type === 'triage' ? s.questions || [] : s.observe ? [s.observe] : []), ...level.interview.questions.filter(q => !q.terminal)], positions = [0, 0, 0, 0];
let flags = 0;
for (const item of qs) {
  positions[item.answer]++;
  const size = item.choices[item.answer].length, wrongs = item.choices.filter((_, i) => i !== item.answer).map(s => s.length);
  if (wrongs.every(n => size >= 1.15 * n) || wrongs.every(n => size <= .85 * n)) { flags++; console.log('LENGTH FLAG', item.q, item.choices.map(s => s.length)); }
  check(item.explain.length > 70, 'explanation covers alternatives');
}
check(qs.length === 15, '15 MCQs');
check(flags / qs.length < .05, 'MCQ bias <5% ' + flags + '/' + qs.length);
check(Math.max(...positions) - Math.min(...positions) <= 1, 'balanced positions ' + positions);
for (const item of level.stages[0].steps.filter(s => s.ask).map(s => s.ask)) {
  const size = item.choices[item.answer].length, wrongs = item.choices.filter((_, i) => i !== item.answer).map(s => s.length);
  check(!wrongs.every(n => size >= 1.15 * n) && !wrongs.every(n => size <= .85 * n), 'inline length bias ' + item.q);
}
check(!crashes.length, 'no hidden engine crashes ' + crashes.join('\n'));
console.log(`   ✓ ${checks.toLocaleString('en-US')} container checks · ${states} planner states · ${qs.length} MCQs (${flags} length flags; positions ${positions})`);
module.exports = { checks, states, flags };
