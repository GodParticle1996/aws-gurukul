#!/usr/bin/env node
// Exercise the PixShare table, snapshot, SQL cluster and access-pattern calculator.
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


const level = AG.findLevel('datastore'), mission = level.stages.find(s => s.type === 'terminal');
const interview = level.interview.questions.at(-1).terminal;
const [create, wait, describe, insert, pitr, start, poll, sql, waitSql] = mission.solution;
const prepare = [create, wait, describe, insert, pitr];
const inspect = (cmds, stage = mission) => run({ ...stage, success: () => false }, cmds);
const stateOf = r => r.state.account.pixData;
for (const stage of [mission, interview]) {
  for (let replay = 0; replay < 2; replay++) {
    const r = run(stage, stage.solution);
    check(r.done === 1 && r.trace.slice(0,-1).every(n => n === 0), 'last command wins: ' + r.text.slice(-600));
    check(stage.tasks.every(t => t.check(r.state)), 'all task checks match success');
  }
  stage.solution.forEach((_,i) => check(!run(stage, stage.solution.filter((_, j) => j !== i)).done, 'missing command ' + i));
}
const duplicate = inspect([...prepare, start, start, poll, poll, 'aws dynamodb list-exports',
  'aws rds describe-db-clusters', sql, sql, waitSql, 'aws rds describe-db-clusters --db-cluster-identifier pix-accounts']);
const [job] = stateOf(duplicate).exports, [cluster] = stateOf(duplicate).clusters;
check(stateOf(duplicate).exports.length === 1 && job.view.ExportStatus === 'COMPLETED', 'one export on same-token retry');
check(duplicate.state.account.buckets[0].objects.length === 1 && job.rows.length === 3, 'one manifest, full snapshot');
check(stateOf(duplicate).clusters.length === 1 && !cluster.DBClusterMembers.length &&
  duplicate.text.includes('DBClusterAlreadyExists') && duplicate.text.includes('ExportSummaries'), 'one cluster, no implied writer');
const errors = [
  [[], start, 'TableNotFoundException'],
  [[create, wait, describe, insert], start, 'PointInTimeRecoveryUnavailableException'],
  [prepare, start.replace('pix-report-lab34',''), 'required'],
  [prepare, start.replace('DYNAMODB_JSON','CSV'), 'ValidationException'],
  [prepare, start.replace('us-east-1','us-west-2'), 'TableNotFoundException'],
  [prepare, start + ' --region us-west-2', 'us-east-1'],
  [prepare, start + ' --fake yes', 'Unknown'],
  [[], waitSql, 'DBClusterNotFound'],
  [[], sql.replace('--manage-master-user-password', ''), 'manage-master-user-password'],
  [[], sql + ' --engine aurora', 'repeated'],
  [[], sql.replace('pix-accounts','pix--accounts'), 'InvalidParameterValue'],
  [[], poll, 'ExportNotFoundException']
];
for (const [prefix, command, error] of errors) {
  const r = inspect([...prefix, command]);
  check(r.text.includes(error) && !stateOf(r).exports.length && !stateOf(r).clusters.length, 'atomic rejection: ' + command + '\n' + r.text.slice(-280));
}
const conflict = inspect([...prepare, start, start.replace('weekly','daily')]);
check(conflict.text.includes('ExportConflictException') && stateOf(conflict).exports.length === 1, 'different request cannot reuse token');
const beforeInsert = inspect([create, wait, describe, pitr, start, insert, poll, sql, waitSql]);
check(stateOf(beforeInsert).exports[0].rows.length === 0 && !mission.success(beforeInsert.state), 'late writes do not enter snapshot');
const retry = inspect([create, wait, describe, pitr, start, insert, poll, start.replace('pix-week-34','new-job'),
  poll.replace('00000001','00000002'), sql, waitSql]);
check(mission.success(retry.state), 'fresh snapshot after late writes can repair mission');
const failedBucket = inspect([...prepare, start.replace('pix-report-lab34','missing-bucket'), poll]);
check(stateOf(failedBucket).exports[0].view.ExportStatus === 'FAILED' && !failedBucket.state.account.buckets[0].objects.length, 'failed destination leaves no manifest');
for (const bad of [start.replace('weekly','daily'), start.replace('DYNAMODB_JSON','ION')]) {
  check(!run(mission, [...prepare, bad, poll, sql, waitSql]).done, 'wrong export settings cannot pass');
}
for (const option of ['', ' --no-storage-encrypted']) {
  const r = run(mission, [...prepare,start,poll,sql.replace(' --storage-encrypted',option),waitSql]);
  const c = stateOf(r).clusters[0];
  check(r.done && !c.StorageEncrypted && c.StorageEncryptionType === 'sse-rds', 'new Aurora SSE default counts');
}
check(cluster.StorageEncryptionType === 'sse-kms', 'explicit KMS encryption');
const knownCluster = 'aws rds delete-db-cluster --db-cluster-identifier pix-accounts';
check(inspect([sql,knownCluster]).text.includes('InvalidParameterCombination'), 'delete needs explicit skip');
check(run(mission, [...prepare,start,poll,sql.replace('pixadmin','otheradmin'),knownCluster+' --skip-final-snapshot',sql,waitSql]).done === 1, 'bad empty cluster is recoverable');
check(!run(mission, [...prepare,start,poll,'aws dynamodb delete-table --table-name pix-feed',create,wait,describe,insert,pitr,sql,waitSql]).done, 'old snapshot cannot pass for a replacement table');
const tokenWithDollar = inspect([...prepare, start.replace('pix-week-34','pix$week')]);
check(tokenWithDollar.text.includes('invalid client token') && !stateOf(tokenWithDollar).exports.length, 'invalid service token');
const expiredAccount = structuredClone(duplicate.state.account);
expiredAccount.pixData.exports[0].completedAt = Date.now() - 9 * 3600000;
const expired = inspect([start], { ...mission, account: expiredAccount });
check(stateOf(expired).exports.length === 2, 'token reusable after expiry');
const iv = interview.solution, sourceTable = interview.account.tables[0];
check(!run(interview, [...iv.slice(0,-1), iv.at(-1).replace('c4','c8')]).done, 'other creator misses target');
check(!run(interview, [...iv.slice(0,-1), iv.at(-1) + ' --consistent-read']).done, 'GSI strong read cannot pass');
const indexRead = inspect(iv, interview).state.account.tables[0];
check(indexRead.lastRead.scannedCount === 2 && indexRead.tableId === sourceTable.tableId && indexRead.items.length === 4, 'correct GSI reads both rows and keeps base table');
const flow = level.stages.find(s => s.type === 'flowlab'), decision = level.stages.find(s => s.type === 'decide');
check(decision.tree === 'database' && decision.scenarios === 4 && level.stages[2] === decision, 'database practice first game');
const prices = [43.20,2.50,20,144,108], names = ['Aurora','DynamoDB','Athena','Neptune','OpenSearch'];
let wins = 0;
for (let mask = 0; mask < 32; mask++) {
  const k = Object.fromEntries(flow.knobs.map((kn,i) => [kn.id, (mask >> i) & 1]));
  const m = flow.model(k), bill = prices.reduce((sum,p,i) => sum + (mask & (1 << i) ? p : 0),0);
  const active = names.filter((_,i) => mask & (1 << i));
  check(m.readouts[1].value === '≈ $' + bill.toFixed(2), 'monthly budget ' + mask);
  check(m.readouts[0].value === (active.join(' + ') || 'Pehle ek query chuno'), 'all required stores shown');
  check(flow.check(k) === (mask === 7) && m.verdict.ok === (mask === 7), 'release matches only requested needs');
  if (flow.check(k)) wins++;
}
check(wins === 1, 'single release fit');
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
console.log(`   ✓ ${checks} datastore checks · 32 pattern sets/1 fit · ${qs.length} MCQs, 0 flags, ${longest} longest, positions ${positions.join('/')}`);
