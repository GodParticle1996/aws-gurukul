#!/usr/bin/env node
// Analytics (Glue + Athena) fixture regressions (Advanced 9b); offline only.
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
const level = AG.findLevel('analytics');
const mission = level.stages.find(s => s.type === 'terminal'), interview = level.interview.questions.find(q => q.terminal).terminal;
const F = AG.analyticsFixtures, sol = mission.solution, isol = interview.solution;
const never = { ...mission, success: () => false };
const swap = (list, i, cmd) => list.map((c, j) => j === i ? cmd : c);
const loses = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(!r.done, label + ' loses'); return r; };
const wins = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(r.done === 1, label + ' wins: ' + r.text.slice(-900)); check(r.trace.slice(0, -1).every(n => !n), label + ' final-only'); return r; };
const errs = (label, cmds, re, stage = never) => { const r = run(stage, cmds); check(re.test(r.text), label + ' error shown: ' + r.text.slice(-400)); return r; };
const q = sqlText => `aws athena start-query-execution --work-group analysts --query-execution-context Database=shop_lake --query-string "${sqlText}"`;
const SETUP = sol.slice(0, 6), RESULTS = 'aws athena get-query-results --query-execution-id ' + F.Q1;

for (const stage of [mission, interview]) {
  const r = wins('intended ' + stage.title, stage.solution, stage);
  check(stage.tasks.every(t => t.check(r.state)), 'task agreement ' + stage.title);
  check(run(stage, stage.solution).done === 1, 'clean reset ' + stage.title);
}
for (const i of [1, 2, 3, 4, 5, 6, 8]) loses('omission step' + i, sol.filter((_, j) => j !== i));
wins('without optional reads', sol.filter((_, j) => j !== 0 && j !== 7));
for (const i of [2, 3, 4]) loses('interview omission step' + i, isol.filter((_, j) => j !== i), interview);

/* wrong queries */
{
  const r = run(mission, [...SETUP, 'aws athena start-query-execution --work-group analysts --query-execution-context Database=raw_zone --query-string "SELECT state, sku, sum(qty) AS units FROM orders_raw GROUP BY state, sku"', 'aws athena get-query-execution --query-execution-id ' + F.Q1, RESULTS]);
  check(!r.done && /CANCELLED/.test(r.text) && /bytes scanned limit/.test(r.text), 'raw CSV query hits the 1 GB workgroup limit');
}
{
  const r = run(mission, [...SETUP, q('SELECT * FROM orders'), 'aws athena get-query-execution --query-execution-id ' + F.Q1, RESULTS]);
  check(!r.done && /CANCELLED/.test(r.text), 'SELECT * without a partition filter is cancelled by the limit');
}
loses('30-day window', [...SETUP, q("SELECT state, sku, sum(qty) AS units FROM orders WHERE dt >= '2026-10-21' GROUP BY state, sku"), RESULTS]);
loses('group by state only', [...SETUP, q("SELECT state, sum(qty) AS units FROM orders WHERE dt BETWEEN '2026-11-13' AND '2026-11-19' GROUP BY state"), RESULTS]);
loses('query in primary workgroup', [...SETUP, sol[6].replace('--work-group analysts', '--work-group primary'), RESULTS]);
errs('primary has no output location', [...SETUP, sol[6].replace('--work-group analysts', '--work-group primary')], /No output location/);
loses('workgroup without scan limit', [...sol.slice(0, 5), 'aws athena create-work-group --name analysts --configuration \'{"ResultConfiguration":{"OutputLocation":"s3://shopkaro-lake/athena-results/"},"EnforceWorkGroupConfiguration":true}\'', sol[6], RESULTS]);
errs('table missing until the crawler finishes', [...sol.slice(0, 4), sol[5], sol[6], 'aws athena get-query-execution --query-execution-id ' + F.Q1], /TABLE_NOT_FOUND/);
errs('crawler started twice', [...sol.slice(0, 4), sol[3]], /CrawlerRunningException/);
errs('crawler with a role name, not ARN', ['aws glue create-database --database-input Name=shop_lake', 'aws glue create-crawler --name x --role glue-crawler --database-name shop_lake --targets file://crawler-targets.json'], /ARN/);
errs('workgroup limit under 10 MB', ['aws athena create-work-group --name w --configuration \'{"BytesScannedCutoffPerQuery":1000}\''], /10 MB/);
errs('WHERE dt on an unpartitioned table', [...SETUP, 'aws athena start-query-execution --work-group analysts --query-execution-context Database=raw_zone --query-string "SELECT state FROM orders_raw WHERE dt = \'2026-11-19\'"', 'aws athena get-query-execution --query-execution-id ' + F.Q1], /COLUMN_NOT_FOUND/);
errs('non-aggregated column outside GROUP BY', [...SETUP, q("SELECT state, sku, sum(qty) FROM orders WHERE dt = '2026-11-19' GROUP BY state"), 'aws athena get-query-execution --query-execution-id ' + F.Q1], /GROUP BY/);
errs('results of a cancelled query', [...SETUP, q('SELECT * FROM orders'), RESULTS], /not yet finished|CANCELLED/);
errs('unknown flag', ['aws athena get-query-results --query-id nope'], /Unknown options/);

/* interview wrong path: query before repair sees zero rows */
loses('query before MSCK REPAIR', [isol[3], isol[4].replace(/0+3$/, '000000000001')], interview);

/* SQL engine and scan model directly */
{
  const a = F.iseed(); const r = AG.lakeRunSql(a, 'shop_lake', 'MSCK REPAIR TABLE orders');
  check(r.kind === 'DDL' && r.added.length === 1 && r.added[0] === '2026-11-20', 'MSCK adds only the missing day');
  const t = a.glueTables.find(x => x.name === 'orders');
  check(AG.lakeScanBytes(t, F.WEEK, ['state', 'sku', 'qty']) === Math.round(80 * 1024 * 1024 * 7 * 3 / 8), 'parquet pruning maths');
  const raw = a.glueTables.find(x => x.name === 'orders_raw');
  check(AG.lakeScanBytes(raw, ['all'], ['state']) === 10 * 1024 * 1024 * 1024, 'CSV ignores column choice');
}

/* flowlab */
const flow = level.stages.find(s => s.type === 'flowlab');
let states = 0, winners = 0;
for (let format = 0; format < 2; format++) for (let partition = 0; partition < 2; partition++) for (let columns = 0; columns < 2; columns++) {
  const k = { format, partition, columns }, r = AG.analyticsCostPlan(k);
  states++; check(flow.check(k) === r.ok && flow.model(k).verdict.ok === r.ok && Number.isFinite(r.usd), 'flowlab verdict agrees');
  if (r.ok) winners++;
}
const init = Object.fromEntries(flow.knobs.map(k => [k.id, k.value]));
check(states === 8 && winners === 1 && AG.analyticsCostPlan({ format: 1, partition: 1, columns: 1 }).ok && !flow.check(init), `flowlab ${winners}/${states}: only Parquet + partition + 3 columns fits`);

/* MCQ bias and positions */
const qs = [];
for (const st of level.stages) { if (st.questions) qs.push(...st.questions); if (st.observe) qs.push(st.observe); for (const step of st.steps || []) if (step.ask) qs.push(step.ask); }
qs.push(...level.interview.questions.filter(x => x.choices));
let flagged = 0; const positions = [0, 0, 0, 0];
for (const x of qs) {
  positions[x.answer]++;
  const n = x.choices.map(c => c.length), r = n[x.answer], wrong = n.filter((_, i) => i !== x.answer);
  if (r >= 1.15 * Math.max(...wrong) || r <= .85 * Math.min(...wrong)) { flagged++; console.log('BIAS', x.q, n); }
  check(x.explain.length > 80, 'meaningful explanation: ' + x.q);
}
check(flagged === 0, 'length flags ' + flagged + '/' + qs.length);
check(Math.max(...positions) - Math.min(...positions) <= 1, 'positions ' + positions);
check(!crashes.length, 'no console errors ' + crashes.join('; '));
console.log(`   ✓ ${checks} analytics checks · ${states} cost states/${winners} fit · ${qs.length} MCQs (0 length flags; positions ${positions.join(',')})`);
