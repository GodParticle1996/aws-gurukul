#!/usr/bin/env node
// Disaster-recovery readiness/promotion regressions; offline only.
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
const level = AG.findLevel('dr'), mission = level.stages.find(s => s.type === 'terminal'), interview = level.interview.questions.find(q => q.terminal).terminal, clone = x => JSON.parse(JSON.stringify(x));
const never = { ...mission, success: () => false }, neverI = { ...interview, success: () => false }, sol = mission.solution, isol = interview.solution;
const P = 'ap-south-1', D = 'ap-south-2', ACCT = '333333333333', ORDERS = `arn:aws:rds:${P}:${ACCT}:db:orders`, GOLDEN = 'ami-0a1b2c3d4e5f60001', COPY = 'ami-0d000000000000001';
const DR_KEY_ID = '7a1c0000-0000-4000-8000-00000000b002', DR_KEY = `arn:aws:kms:${D}:${ACCT}:key/${DR_KEY_ID}`, SG_DR = 'sg-0hyd0db00000000a1', SG_PROD = 'sg-0bom0db00000000a1', SG_DEFAULT = 'sg-0hyd0default00001';
const READ = sol.at(-1), WAIT_DB = sol[6];
const latestImage = s => (s.account.drImages || []).filter(i => i.region === D).at(-1).id;

// Intended solutions: final action only, task agreement, clean reset, every omission loses, inventory cannot win.
for (const stage of [mission, interview]) {
  const r = run(stage, stage.solution);
  check(r.done === 1, 'intended wins ' + r.text);
  check(r.trace.slice(0, -1).every(n => !n) && r.trace.at(-1) === 1, 'final action only');
  check(stage.tasks.every(t => t.check(r.state)), 'state tasks agree');
  check(run(stage, stage.solution).done === 1, 'clean reset');
  for (let i = 0; i < stage.solution.length; i++) check(!run(stage, stage.solution.filter((_, j) => j !== i)).done, 'omission loses ' + i);
  check(!run(stage, ['aws rds describe-db-instances --region ' + D, 'aws backup list-backup-vaults --region ' + D, 'aws ec2 describe-images --owners self --region ' + D, 'aws backup list-backup-plans']).done, 'inventory alone cannot win');
}
check(!run(mission, sol.slice(0, 7)).done && run(never, sol.slice(0, 7)).state && mission.tasks.slice(0, 3).every(t => t.check(run(never, sol.slice(0, 7)).state)), 'everything but the final read: first three tasks ready, no win');
const solved = run(never, sol), isolved = run(neverI, isol);
check(mission.success(solved.state) && interview.success(isolved.state), 'reference ready states');

// Destructive or contract-breaking follow-ups revoke the win even after a fresh read.
for (const action of [
  `aws ec2 deregister-image --image-id ${GOLDEN} --region ${P}`,
  `aws ec2 deregister-image --image-id ${COPY} --region ${D}`,
  `aws backup delete-backup-selection --backup-plan-id 00000000-0000-4000-8000-000000000001 --selection-id 10000000-0000-4000-8000-000000000001`,
  `aws rds delete-db-instance --db-instance-identifier orders-dr --skip-final-snapshot --region ${D}`,
  `aws rds promote-read-replica --db-instance-identifier orders-dr --backup-retention-period 7 --region ${D}`,
  `aws rds modify-db-instance --db-instance-identifier orders --publicly-accessible --apply-immediately`,
  `aws rds modify-db-instance --db-instance-identifier orders-dr --publicly-accessible --apply-immediately --region ${D}`,
  `aws rds modify-db-instance --db-instance-identifier orders-dr --vpc-security-group-ids ${SG_DEFAULT} --apply-immediately --region ${D}`,
  `aws rds modify-db-instance --db-instance-identifier orders --backup-retention-period 3 --apply-immediately`,
  `aws backup create-backup-vault --backup-vault-name extra-vault --region ${D}`,
  `aws ec2 copy-image --source-region ${P} --source-image-id ${GOLDEN} --name extra-copy --encrypted --kms-key-id alias/shop-dr --region ${D}`,
  `aws rds create-db-instance-read-replica --db-instance-identifier orders-dr2 --source-db-instance-identifier ${ORDERS} --db-subnet-group-name dr-private --vpc-security-group-ids ${SG_DR} --kms-key-id alias/shop-dr --region ${D}`
]) {
  const r = run(never, [...sol, action, WAIT_DB, READ]);
  check(!mission.success(r.state), 'current state revokes win ' + action);
}

// Direct state mutations: every declared contract field matters (read marker stays current).
for (const mutate of [
  a => a.rds.find(d => d.id === 'orders').multiAZ = false, a => a.rds.find(d => d.id === 'orders').dataFixture.pop(), a => a.rds.find(d => d.id === 'orders').resourceId = 'replaced',
  a => a.drImages[0].kmsKey = 'changed', a => a.backupVaults[0].encryptionKeyArn = undefined, a => a.drKmsKeys[1].enabled = false, a => a.drSecurityGroups.pop(), a => a.callerIdentity.Account = '999999999999',
  a => a.backupVaults.find(v => v.region === D).encryptionKeyArn = undefined, a => a.backupPlans[0].document.Rules[0].EnableContinuousBackup = false, a => a.backupPlans[0].document.Rules[0].ScheduleExpression = 'cron(0 * * * ? *)',
  a => a.backupPlans[0].document.Rules[0].CopyActions = undefined, a => a.backupPlans[0].document.Rules[0].Lifecycle.DeleteAfterDays = 3, a => a.backupPlans[0].document.Rules[0].TargetBackupVaultName = 'other',
  a => a.backupSelections[0].document.Resources = [], a => a.backupSelections[0].document.IamRoleArn = 'arn:aws:iam::333333333333:role/other', a => a.backupSelections.push(clone(a.backupSelections[0])),
  a => a.drImages.find(i => i.region === D).kmsKey = 'alias/aws/ebs', a => a.drImages.find(i => i.region === D).state = 'pending', a => a.drImages.find(i => i.region === D).sourceImageId = 'ami-other',
  a => { const d = a.rds.find(d => d.id === 'orders-dr'); d.kmsKey = undefined; }, a => a.rds.find(d => d.id === 'orders-dr').subnetGroup = 'other', a => a.rds.find(d => d.id === 'orders-dr').source = undefined,
  a => a.rds.find(d => d.id === 'orders-dr').state = 'creating', a => a.rds.find(d => d.id === 'orders-dr').id = 'orders-replica', a => a.drMode = false, a => a.drRevision++
]) { const s = clone(solved.state); mutate(s.account); check(!mission.success(s), 'configuration/source contract required ' + mutate.toString()); }

// Stale read: any later mutation needs a fresh full read; --query output cannot certify.
const modify = `aws rds modify-db-instance --db-instance-identifier orders-dr --vpc-security-group-ids ${SG_DR} --apply-immediately --region ${D}`;
check(!mission.success(run(never, [...sol, modify]).state), 'old read invalidated by a later DB revision');
check(!mission.success(run(never, [...sol, modify, READ]).state), 'modifying state cannot certify before the waiter');
check(mission.success(run(never, [...sol, modify, WAIT_DB, READ]).state), 'fresh current read recertifies');
check(!run(mission, sol.map((c, i) => i === sol.length - 1 ? c + ' --query DBInstances[0].DBInstanceStatus' : c)).done, 'query projection cannot certify');
check(!mission.success(run(never, [...sol.slice(0, 7), `aws rds describe-db-instances --db-instance-identifier orders-dr --region ${P}`]).state), 'wrong-Region read cannot certify');

// Legitimate alternatives.
const swap = (from, to) => sol.map(c => c.replaceAll(from, to));
check(run(mission, swap('alias/shop-dr', DR_KEY)).done === 1, 'full key ARN accepted');
check(run(mission, swap('alias/shop-dr', DR_KEY_ID)).done === 1, 'key id accepted');
check(run(mission, swap('alias/shop-dr', `arn:aws:kms:${D}:${ACCT}:alias/shop-dr`)).done === 1, 'alias ARN accepted');
check(run(mission, sol.map((c, i) => i === 5 ? c + ' --source-region ' + P : c)).done === 1, 'matching --source-region accepted (optional)');
check(run(mission, sol.map((c, i) => i === 5 ? c.replace(' --db-instance-class db.r6g.large', '') : c)).done === 1, 'class defaults to the source class');
check(run(mission, [...sol.slice(0, 7), 'aws rds describe-db-instances --region ' + D]).done === 1, 'region-wide full read certifies');
check(run(mission, sol.map(c => c.replace(' --region ', '\t--region=').replace(' --backup-plan ', ' --backup-plan='))).done === 1, 'equals/whitespace forms legitimate');
const defaultSg = run(mission, [...sol.slice(0, 5), sol[5].replace(' --vpc-security-group-ids ' + SG_DR, ''), WAIT_DB, READ]);
check(!defaultSg.done && defaultSg.state.account.rds.find(d => d.id === 'orders-dr').sgIds[0] === SG_DEFAULT, 'omitted SG uses the VPC default SG and does not satisfy the contract');
check(run(mission, [...sol.slice(0, 5), sol[5].replace(' --vpc-security-group-ids ' + SG_DR, ''), WAIT_DB, READ, modify, WAIT_DB, READ]).done === 1, 'wrong SG repaired with modify + waiter + read');
const planFirst = run(mission, [sol[1], sol[0], sol[1], ...sol.slice(2)]);
check(planFirst.text.includes('Create the destination vault first') && planFirst.done === 1, 'plan before vault fails atomically; correct order then wins');
const defaultKey = run(mission, [...sol.slice(0, 3), sol[3].replace(' --encrypted --kms-key-id alias/shop-dr', ''), `aws ec2 wait image-available --image-ids ${COPY} --region ${D}`, ...sol.slice(5)]);
check(!defaultKey.done && defaultKey.state.account.drImages.find(i => i.region === D).kmsKey === 'alias/aws/ebs' && defaultKey.text.includes('default EBS key'), 'default EBS key copy is legal but misses the reviewed-key contract');
check(run(mission, [...sol.slice(0, 3), sol[3].replace(' --encrypted --kms-key-id alias/shop-dr', ''), `aws ec2 deregister-image --image-id ${COPY} --region ${D}`, sol[3], s => `aws ec2 wait image-available --image-ids ${latestImage(s)} --region ${D}`, ...sol.slice(5)]).done === 1, 'default-key copy replaced with reviewed-key copy');

// Error paths stay atomic and teach the documented requirement.
const replica = sol[5];
for (const [label, command, needle] of [
  ['plain source id', replica.replace(ORDERS, 'orders'), 'full source DB ARN'],
  ['same Region', replica.replace(' --region ' + D, ' --region ' + P), 'same-Region'],
  ['disabled key', replica.replace('alias/shop-dr', 'alias/shop-dr-old'), 'disabled'],
  ['source-Region key', replica.replace('alias/shop-dr', 'alias/shop-prod'), 'not found in ap-south-2'],
  ['missing key', replica.replace(' --kms-key-id alias/shop-dr', ''), 'needs --kms-key-id'],
  ['missing subnet group', replica.replace(' --db-subnet-group-name dr-private', ''), 'no default VPC'],
  ['wrong-VPC SG', replica.replace(SG_DR, SG_PROD), 'is not in VPC'],
  ['mismatched source Region', replica + ' --source-region ' + D, 'does not match'],
  ['public conflict', replica + ' --publicly-accessible', 'not allowed with']
]) { const r = run(never, [command]); check(r.text.includes(needle) && !r.state.account.rds.some(d => d.region === D), 'replica error atomic: ' + label + ' ' + r.text.split('\n').at(-1)); }
const dup = run(never, [replica, replica]);
check(dup.text.includes('DBInstanceAlreadyExists') && dup.state.account.rds.filter(d => d.region === D).length === 1, 'duplicate replica identifier rejected');
const copy = sol[3];
for (const [label, command, needle] of [
  ['key without encrypted', copy.replace(' --encrypted', ''), 'InvalidParameterDependency'],
  ['malformed name', copy.replace('shop-web-golden-2026-10-dr', 'ab'), 'InvalidAMIName.Malformed'],
  ['missing source image', copy.replace(GOLDEN, 'ami-0ffffffffffffffff'), 'InvalidAMIID.NotFound'],
  ['disabled key', copy.replace('alias/shop-dr', 'alias/shop-dr-old'), 'disabled']
]) { const r = run(never, [command]); check(r.text.includes(needle) && !r.state.account.drImages.some(i => i.region === D), 'copy-image error atomic: ' + label); }
const dupName = run(never, [copy, copy]);
check(dupName.text.includes('InvalidAMIName.Duplicate') && dupName.state.account.drImages.filter(i => i.region === D).length === 1, 'duplicate AMI name rejected');
check(run(never, [`aws ec2 wait image-available --image-ids ${COPY} --region ${D}`]).text.includes('Region-specific'), 'waiter on a missing image explains Region-specific IDs');
check(run(never, [`aws ec2 describe-images --image-ids ${GOLDEN} --region ${D}`]).text.includes('InvalidAMIID.NotFound'), 'Mumbai AMI ID does not exist in Hyderabad');
const protectedDelete = run(never, ['aws rds delete-db-instance --db-instance-identifier orders --skip-final-snapshot']);
check(protectedDelete.text.includes('Cannot delete protected DB Instance') && protectedDelete.state.account.rds.some(d => d.id === 'orders'), 'deletion protection keeps the primary');
check(run(never, [replica, `aws rds delete-db-instance --db-instance-identifier orders-dr --region ${D}`]).text.includes('FinalDBSnapshotIdentifier is required'), 'final snapshot choice required');
check(run(never, ['aws rds promote-read-replica --db-instance-identifier orders']).text.includes('not a read replica'), 'cannot promote a non-replica');
check(run(never, [replica, `aws rds promote-read-replica --db-instance-identifier orders-dr --region ${D}`]).text.includes('must be available'), 'promotion waits for an available replica');
check(run(neverI, [`aws rds promote-read-replica --db-instance-identifier orders-dr --backup-retention-period 36 --region ${D}`]).state.account.rds.find(d => d.id === 'orders-dr').source === ORDERS, 'invalid retention leaves the replica untouched');
check(run(never, [`aws rds modify-db-instance --db-instance-identifier orders --backup-retention-period 7`]).text.includes('--apply-immediately'), 'pending-window modifications are scoped out explicitly');
check(run(neverI, ['aws rds modify-db-instance --db-instance-identifier orders --backup-retention-period 0 --apply-immediately']).text.includes('source of read replicas'), 'source of replicas keeps backups');
check(run(never, ['aws rds describe-db-instances --region us-east-1']).text.includes('modeled Regions'), 'unmodeled Region is explicit scope');
const plan = JSON.parse(mission.files['plan.json'].content);
const planWith = (mutate) => { const f = clone(mission.files); const d = clone(plan); mutate(d); f['plan.json'] = { ...f['plan.json'], content: JSON.stringify(d) }; return { ...never, files: f }; };
for (const [label, mutate, needle] of [
  ['continuous retention above 35', d => d.Rules[0].Lifecycle.DeleteAfterDays = 40, '1 to 35 days'],
  ['five-field cron', d => d.Rules[0].ScheduleExpression = 'cron(0 20 * * ?)', 'six-field'],
  ['missing target vault', d => d.Rules[0].TargetBackupVaultName = 'missing', 'existing vault'],
  ['unknown field', d => d.Rules[0].RecoveryPointTags = { a: 'b' }, 'unsupported backup rule field'],
  ['start window too short', d => d.Rules[0].StartWindowMinutes = 10, 'at least 60'],
  ['continuous without lifecycle', d => delete d.Rules[0].Lifecycle, 'needs Lifecycle'],
  ['duplicate rule names', d => d.Rules.push(clone(d.Rules[0])), 'unique RuleName']
]) { const r = run(planWith(mutate), [sol[0], sol[1]]); check(r.text.includes(needle) && !r.state.account.backupPlans.length, 'plan error atomic: ' + label); }
const selection = run(never, [sol[0], sol[1], sol[2], sol[2]]);
check(selection.text.includes('AlreadyExistsException') && selection.state.account.backupSelections.length === 1, 'duplicate selection rejected');
check(run(never, [sol[0], sol[1], sol[2], 'aws backup delete-backup-plan --backup-plan-id 00000000-0000-4000-8000-000000000001']).text.includes('delete the backup selections'), 'plan with selections cannot vanish');
const badRole = clone(mission.files); badRole['selection.json'] = { ...badRole['selection.json'], content: JSON.stringify({ SelectionName: 'x', IamRoleArn: 'arn:aws:iam::333333333333:role/admin', Resources: [ORDERS] }) };
check(run({ ...never, files: badRole }, [sol[0], sol[1], sol[2]]).text.includes('AWS Backup service role'), 'selection requires the backup service role');
check(run(never, ['aws backup create-backup-vault --backup-vault-name probe-vault --encryption-key-arn alias/shop-prod --region ' + D]).text.includes('not found in ap-south-2'), 'vault key must live in the vault Region');

// Interview: promotion semantics and legitimate repair path.
const noRetention = run(interview, [`aws rds promote-read-replica --db-instance-identifier orders-dr --region ${D}`, isol[1], isol[2]]);
check(!noRetention.done && noRetention.state.account.rds.find(d => d.id === 'orders-dr').backupRetention === 1, 'documented default retention 1 day misses the runbook');
check(run(interview, [`aws rds promote-read-replica --db-instance-identifier orders-dr --region ${D}`, isol[1], `aws rds modify-db-instance --db-instance-identifier orders-dr --backup-retention-period 7 --apply-immediately --region ${D}`, isol[1], isol[2]]).done === 1, 'retention repaired after promotion');
check(!run(interview, [isol[0], isol[2]]).done, 'modifying promoted DB cannot certify before the waiter');
check(run(neverI, [isol[0]]).text.includes('cannot be undone') && run(neverI, [isol[0]]).state.account.rds.find(d => d.id === 'orders-dr').state === 'modifying', 'promotion shows the documented modifying status and irreversibility');
const recreate = run(interview, [`aws rds delete-db-instance --db-instance-identifier orders-dr --skip-final-snapshot --region ${D}`, `aws rds create-db-instance-read-replica --db-instance-identifier orders-dr --source-db-instance-identifier ${ORDERS} --db-subnet-group-name dr-private --vpc-security-group-ids ${SG_DR} --kms-key-id alias/shop-dr --region ${D}`, isol[1], isol[0], isol[1], isol[2]]);
check(!recreate.done, 'a recreated replica is not the replica that was already in sync');
for (const action of ['aws rds modify-db-instance --db-instance-identifier orders --publicly-accessible --apply-immediately', `aws ec2 deregister-image --image-id ${COPY} --region ${D}`, 'aws backup delete-backup-selection --backup-plan-id 00000000-0000-4000-8000-000000000001 --selection-id 10000000-0000-4000-8000-000000000001'])
  check(!interview.success(run(neverI, [...isol, action, isol[2]]).state), 'interview preservation ' + action);

// Garbage commands never crash the engine and never win.
const garbage = ['', ' ', 'random', 'aws', 'aws rds', 'sudo aws rds describe-db-instances', 'AWS RDS DESCRIBE-DB-INSTANCES', 'aws rds create-db-snapshot --db-instance-identifier orders', 'aws rds failover-global-cluster --global-cluster-identifier g',
  'aws backup start-backup-job --backup-vault-name shopkaro-prod-vault', 'aws ec2 wait', 'aws ec2 wait image-available', 'aws rds wait db-instance-deleted --db-instance-identifier orders', 'aws rds describe-db-instances --db-instance-identifier constructor',
  'aws rds describe-db-instances --db-instance-identifier __proto__', 'aws backup get-backup-plan --backup-plan-id __proto__', 'aws backup create-backup-plan --backup-plan null', 'aws backup create-backup-plan --backup-plan file://missing.json',
  'aws backup create-backup-selection --backup-plan-id x --backup-selection {}', 'aws ec2 copy-image --source-region', 'aws rds describe-db-instances --region', 'aws rds describe-db-instances --region ap-south-1 --region ap-south-2',
  'aws kms describe-key --key-id __proto__', 'aws kms list-aliases --region mars-1', 'aws rds promote-read-replica --db-instance-identifier orders-dr --backup-retention-period -1 --region ' + D, 'aws rds describe-db-instances --query Missing',
  'aws ec2 describe-images --owners amazon', 'aws ec2 describe-security-groups --group-ids sg-missing --region ' + D, "aws backup create-backup-plan --backup-plan '{\"BackupPlanName\":\"x\",\"Rules\":[null]}'"];
for (let i = 0; i < 180; i++) garbage.push('aws ' + ['backup create-backup-vault', 'backup create-backup-plan', 'ec2 copy-image', 'rds create-db-instance-read-replica', 'rds promote-read-replica', 'rds modify-db-instance'][i % 6] + ' --' + ['backup-vault-name', 'backup-plan', 'source-image-id', 'source-db-instance-identifier', 'db-instance-identifier', 'backup-retention-period'][i % 6] + ' ' + ['null', '[]', '{}', 'constructor', '__proto__', "'broken", '', '-1'][i % 8]);
for (const command of garbage) {
  const r = run(never, [command]);
  check(!/simulator error:|is not defined|Cannot read properties|is not a function/.test(r.text), 'garbage no internal exception ' + command);
  check(!r.state || !mission.success(r.state), 'garbage cannot win');
}

// Planner sweep: every state evaluated; only the documented pilot-light shape fits all contracts.
let states = 0, wins = 0; const flow = level.stages.find(s => s.type === 'flowlab');
function sweep(i, k) {
  if (i === flow.knobs.length) {
    const m = flow.model(k), ok = flow.check(k);
    check(m.verdict.ok === ok, 'planner verdict agrees');
    check(m.readouts.every(r => !String(r.value).includes('NaN') && !String(r.value).includes('undefined')), 'no NaN/undefined');
    if (ok) { wins++; check(k.data === 2 && k.standby === 0 && k.auto === 2 && k.lock === 1 && k.traffic !== 0, 'win is pilot light with backups, lock, drill and data-plane switch'); check(m.readouts[0].value === 'Pilot light', 'strategy label'); }
    states++; return;
  }
  const n = flow.knobs[i]; for (let v = n.min; v <= n.max; v += n.step) sweep(i + 1, { ...k, [n.id]: v });
}
sweep(0, {});
check(states === 288 && wins === 2, 'all 288 states; 2 valid designs');
const start = Object.fromEntries(flow.knobs.map(k => [k.id, k.value]));
check(!flow.check(start), 'start values fail');
const hot = flow.model({ data: 2, standby: 3, traffic: 1, auto: 2, lock: 1 });
check(!hot.verdict.ok && hot.verdict.text.includes('budget') && hot.readouts[0].value.startsWith('Hot standby'), 'hot standby breaks the budget, not the RTO');
const backupsOnly = flow.model({ data: 1, standby: 0, traffic: 1, auto: 2, lock: 1 });
check(!backupsOnly.verdict.ok && backupsOnly.verdict.text.includes('RPO 60'), 'hourly backups break the RPO');
const replicaOnly = flow.model({ data: 3, standby: 0, traffic: 1, auto: 2, lock: 1 });
check(!replicaOnly.verdict.ok && replicaOnly.verdict.text.includes('corruption'), 'replica without backups fails corruption contract');

// MCQ quality: explanations, length bias and balanced answer positions.
const qs = [...level.stages.flatMap(s => s.type === 'quiz' || s.type === 'triage' ? s.questions || [] : s.observe ? [s.observe] : []), ...level.interview.questions.filter(q => !q.terminal)], positions = [0, 0, 0, 0];
let flags = 0;
for (const item of qs) {
  positions[item.answer]++;
  const size = item.choices[item.answer].length, wrong = item.choices.filter((_, i) => i !== item.answer).map(s => s.length);
  if (wrong.every(n => size >= 1.15 * n) || wrong.every(n => size <= .85 * n)) { flags++; console.log('LENGTH FLAG', item.q, item.choices.map(s => s.length)); }
  check(item.explain.length > 70, 'explanation covers alternatives');
}
check(qs.length === 15, '15 MCQs');
check(flags / qs.length < .05, 'MCQ bias <5% ' + flags + '/' + qs.length);
check(Math.max(...positions) - Math.min(...positions) <= 1, 'balanced positions ' + positions);
for (const item of level.stages[0].steps.filter(s => s.ask).map(s => s.ask)) {
  const size = item.choices[item.answer].length, wrong = item.choices.filter((_, i) => i !== item.answer).map(s => s.length);
  check(!wrong.every(n => size >= 1.15 * n) && !wrong.every(n => size <= .85 * n), 'inline length bias ' + item.q);
}
check(!crashes.length, 'no hidden engine crashes ' + crashes.join('\n'));
console.log(`   ✓ ${checks.toLocaleString('en-US')} DR checks · ${states} planner states · ${qs.length} MCQs (${flags} length flags; positions ${positions})`);
module.exports = { checks, states, flags };
