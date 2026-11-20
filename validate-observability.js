#!/usr/bin/env node
// Observability fixture regressions (Advanced 8); offline only.
// Reuses validate.js's DOM/load manifest so the shipped engine and simulator are exercised.
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
const level = AG.findLevel('observability');
const mission = level.stages.find(s => s.type === 'terminal'), interview = level.interview.questions.find(q => q.terminal).terminal;
const F = AG.obsFixtures, sol = mission.solution, isol = interview.solution;
const swap = (list, i, cmd) => list.map((c, j) => j === i ? cmd : c);
const loses = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(!r.done, label + ' loses'); return r; };
const wins = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(r.done === 1, label + ' wins: ' + r.text.slice(-900)); check(r.trace.slice(0, -1).every(n => !n), label + ' final-only'); return r; };
const errs = (label, cmd, re, stage = mission) => { const r = run(stage, [cmd]); check(re.test(r.text), label + ' error shown: ' + r.text.slice(-300)); return r; };

/* intended solutions, final-only, task agreement, clean reset */
for (const stage of [mission, interview]) {
  const r = wins('intended ' + stage.title, stage.solution, stage);
  check(stage.tasks.every(t => t.check(r.state)), 'task agreement ' + stage.title);
  check(run(stage, stage.solution).done === 1, 'clean reset ' + stage.title);
}
/* omissions: every state-changing or required-read step matters; the two first reads are optional */
for (let i = 2; i < sol.length; i++) loses('omission step' + i, sol.filter((_, j) => j !== i));
wins('without optional reads', sol.slice(2));
for (let i = 1; i < isol.length; i++) loses('interview omission step' + i, isol.filter((_, j) => j !== i), interview);

/* wrong metric filters */
const PF = 2, P99 = 7, ERR = 8, COMP = 9;
loses('term pattern ERROR (counts the INFO trap line)', swap(sol, PF, sol[PF].replace("'{ $.level = \"ERROR\" }'", 'ERROR')));
loses('filter without defaultValue', swap(sol, PF, sol[PF].replace(',defaultValue=0', '')));
loses('filter on payment group', swap(sol, PF, sol[PF].replace('/shopkaro/checkout', '/shopkaro/payment')));
loses('filter with wrong metric name', swap(sol, PF, sol[PF].replace('metricName=CheckoutErrors', 'metricName=Errors')));
wins('JSON pattern without spaces', swap(sol, PF, sol[PF].replace("'{ $.level = \"ERROR\" }'", '\'{$.level="ERROR"}\'')));

/* Logs Insights */
const Q = 3;
loses('query window too wide (counts yesterday timeout)', swap(sol, Q, sol[Q].replace('--start-time ' + F.START, '--start-time ' + (F.START - 86400))));
loses('query on checkout group', swap(sol, Q, sol[Q].replace('/shopkaro/payment', '/shopkaro/checkout')));
loses('query that also counts OK events', swap(sol, Q, sol[Q].replace('filter status = "TIMEOUT" | ', '')));
wins('plain fields query instead of stats', swap(sol, Q, sol[Q].replace(/--query-string '.*'$/, "--query-string 'fields @timestamp, gateway | filter status = \"TIMEOUT\" | sort @timestamp desc'")));
loses('results never read', sol.filter((_, j) => j !== 4));

/* retention */
errs('invalid retention value', 'aws logs put-retention-policy --log-group-name /shopkaro/checkout --retention-in-days 31', /InvalidParameterException/);
loses('audit retention cut to 30', [...sol.slice(0, -1), 'aws logs put-retention-policy --log-group-name /shopkaro/audit --retention-in-days 30', sol.at(-1)]);
loses('audit retention removed (never expire)', [...sol.slice(0, -1), 'aws logs delete-retention-policy --log-group-name /shopkaro/audit', sol.at(-1)]);
loses('app retention left at 60', swap(sol, 5, sol[5].replace('30', '60')));

/* alarms */
loses('p99 alarm on Average', swap(sol, P99, sol[P99].replace('--extended-statistic p99', '--statistic Average')));
loses('p99 alarm 1 of 1', swap(sol, P99, sol[P99].replace('--evaluation-periods 5 --datapoints-to-alarm 3', '--evaluation-periods 1 --datapoints-to-alarm 1')));
loses('child alarm with on-call action', swap(sol, P99, sol[P99] + ' --alarm-actions ' + F.TOPIC));
loses('errors alarm treating missing as breaching', swap(sol, ERR, sol[ERR].replace('notBreaching', 'breaching')));
loses('composite with AND', swap(sol, COMP, sol[COMP].replace(' OR ', ' AND ')));
loses('composite without action', swap(sol, COMP, sol[COMP].replace(' --alarm-actions ' + F.TOPIC, '')));
wins('composite rule with parentheses and swapped order', swap(sol, COMP, sol[COMP].replace('\'ALARM("checkout-p99") OR ALARM("checkout-errors")\'', '\'(ALARM("checkout-errors") OR ALARM("checkout-p99"))\'')));
loses('manual set-alarm-state cheat', [...sol.slice(0, -1), 'aws cloudwatch set-alarm-state --alarm-name checkout-p99 --state-value ALARM --state-reason test', sol.at(-1)]);
loses('final read without composite type', swap(sol, sol.length - 1, 'aws cloudwatch describe-alarms'));
loses('stale read before composite', [...sol.slice(0, COMP), sol.at(-1), sol[COMP]]);

/* simulator parser and messages */
errs('composite referencing a missing alarm', 'aws cloudwatch put-composite-alarm --alarm-name page --alarm-rule \'ALARM("nope")\'', /do not exist/);
errs('bad query time range', 'aws logs start-query --log-group-name /shopkaro/payment --start-time 10 --end-time 5 --query-string \'fields @message\'', /end > start/);
errs('unknown query id', 'aws logs get-query-results --query-id nope', /ResourceNotFoundException/);
errs('unsupported Insights command', 'aws logs start-query --log-group-name /shopkaro/payment --start-time 1 --end-time 9999999999 --query-string \'parse @message "x"\'', /MalformedQueryException/);
errs('unknown flag', 'aws logs put-metric-filter --log-group-name /shopkaro/checkout --filtername x', /Unknown options/);
{
  const r = run(mission, ['aws logs test-metric-filter --filter-pattern \'{ $.level = "ERROR" }\' --log-event-messages \'{"level":"ERROR"}\' \'{"level":"INFO","msg":"no ERROR"}\'']);
  check(/"eventNumber": 1/.test(r.text) && !/"eventNumber": 2/.test(r.text), 'test-metric-filter: JSON pattern skips INFO trap');
  const t = run(mission, ['aws logs test-metric-filter --filter-pattern ERROR --log-event-messages \'{"level":"ERROR"}\' \'{"level":"INFO","msg":"no ERROR"}\'']);
  check(/"eventNumber": 2/.test(t.text), 'test-metric-filter: term pattern matches the trap');
  const d = run(mission, [...sol.slice(0, COMP + 1), 'aws cloudwatch describe-alarms']);
  check(/CompositeAlarm|--alarm-types/.test(d.text) && /"CompositeAlarms": \[\]/.test(d.text), 'default describe-alarms omits composites with a note');
}

/* pattern engine and composite logic directly */
const hit = AG.obsPattern('{ ($.level = "ERROR") && ($.latencyMs > 5000) }');
check(hit('{"level":"ERROR","latencyMs":7900}') && !hit('{"level":"ERROR","latencyMs":200}') && !hit('{"level":"INFO","latencyMs":9000}'), 'JSON && with numbers');
check(AG.obsPattern('?TIMEOUT ?refused')('conn refused') && !AG.obsPattern('ERROR -retry')('ERROR retry'), 'term OR and exclude');
check(AG.obsRuleOf('NOT ALARM("a") AND (ALARM("b") OR OK("c"))').refs.length === 3, 'rule refs');

/* flowlab: whole knob space */
const flow = level.stages.find(s => s.type === 'flowlab');
let states = 0, winners = 0, avgWins = 0, breachingFast = 0;
for (let stat = 0; stat < 2; stat++) for (let thr = 0.5; thr <= 5; thr += 0.5) for (let period = 0; period < 2; period++) for (let n = 1; n <= 5; n++) for (let m = 1; m <= 5; m++) for (let miss = 0; miss < 4; miss++) {
  const k = { stat, thr, period, n, m, miss }, r = AG.obsAlarmTuning(k);
  states++; check(flow.check(k) === r.ok && flow.model(k).verdict.ok === r.ok && Number.isFinite(r.falseAlarms), 'flowlab verdict agrees');
  if (r.ok) { winners++; if (stat === 0) avgWins++; if (miss === 2 && period === 0) breachingFast++; }
}
const init = Object.fromEntries(flow.knobs.map(k => [k.id, k.value]));
check(states === 4000 && winners > 0 && avgWins === 0 && breachingFast === 0 && !flow.check(init), `flowlab ${winners}/${states} wins; Average never wins; initial loses`);

/* MCQ bias and answer positions across every question in the level */
const qs = [];
for (const st of level.stages) { if (st.questions) qs.push(...st.questions); if (st.observe) qs.push(st.observe); for (const step of st.steps || []) if (step.ask) qs.push(step.ask); }
qs.push(...level.interview.questions.filter(q => q.choices));
let flagged = 0; const positions = [0, 0, 0, 0];
for (const q of qs) {
  positions[q.answer]++;
  const n = q.choices.map(x => x.length), r = n[q.answer], wrong = n.filter((_, i) => i !== q.answer);
  if (r >= 1.15 * Math.max(...wrong) || r <= .85 * Math.min(...wrong)) { flagged++; console.log('BIAS', q.q, n); }
  check(q.explain.length > 80, 'meaningful explanation: ' + q.q);
}
check(flagged === 0, 'length flags ' + flagged + '/' + qs.length);
check(Math.max(...positions) - Math.min(...positions) <= 1, 'positions ' + positions);
check(!crashes.length, 'no console errors ' + crashes.join('; '));
console.log(`   ✓ ${checks} observability checks · ${states} alarm-tuning states/${winners} wins · ${qs.length} MCQs (0 length flags; positions ${positions.join(',')})`);
