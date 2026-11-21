#!/usr/bin/env node
// App login (Cognito + JWT authorizer) fixture regressions (Advanced 9c); offline only.
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
const level = AG.findLevel('appai');
const mission = level.stages.find(s => s.type === 'terminal'), interview = level.interview.questions.find(q => q.terminal).terminal;
const F = AG.appaiFixtures, sol = mission.solution, isol = interview.solution;
const never = { ...mission, success: () => false };
const swap = (list, i, cmd) => list.map((c, j) => j === i ? cmd : c);
const loses = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(!r.done, label + ' loses'); return r; };
const wins = (label, cmds, stage = mission) => { const r = run(stage, cmds); check(r.done === 1, label + ' wins: ' + r.text.slice(-900)); check(r.trace.slice(0, -1).every(n => !n), label + ' final-only'); return r; };
const errs = (label, cmds, re, stage = never) => { const r = run(stage, cmds); check(re.test(r.text), label + ' error shown: ' + r.text.slice(-400)); return r; };
const P = F.POOL, C = F.CLIENT, IP = F.IPOOL;

for (const stage of [mission, interview]) {
  const r = wins('intended ' + stage.title, stage.solution, stage);
  check(stage.tasks.every(t => t.check(r.state)), 'task agreement ' + stage.title);
  check(run(stage, stage.solution).done === 1, 'clean reset ' + stage.title);
}
for (let i = 0; i < sol.length; i++) loses('omission step' + i, sol.filter((_, j) => j !== i));
wins('interview without the first read', isol.slice(1), interview);
for (const i of [1, 2]) loses('interview omission step' + i, isol.filter((_, j) => j !== i), interview);

/* wrong user pool / client choices */
loses('MFA OFF', swap(sol, 0, sol[0].replace('OPTIONAL', 'OFF')));
loses('LITE plan', swap(sol, 0, sol[0].replace('ESSENTIALS', 'LITE')));
loses('weak password policy', swap(sol, 0, sol[0].replace('file://password-policy.json', '\'{"PasswordPolicy":{"MinimumLength":8}}\'')));
{
  const r = loses('client with a secret', swap(sol, 1, sol[1].replace('--no-generate-secret', '--generate-secret')));
  check(/SECRET_HASH/.test(r.text), 'secret client cannot do the plain admin login without SECRET_HASH');
}
loses('client allows plain USER_PASSWORD_AUTH', swap(sol, 1, sol[1] + ' ALLOW_USER_PASSWORD_AUTH'));
{
  const r = loses('password not permanent', swap(sol, 3, sol[3].replace(' --permanent', '')));
  check(/NEW_PASSWORD_REQUIRED/.test(r.text), 'temporary password gives the NEW_PASSWORD_REQUIRED challenge');
}
loses('guest identities allowed', swap(sol, 5, sol[5].replace('--no-allow-unauthenticated-identities', '--allow-unauthenticated-identities')));
loses('roles read before they are set', [...sol.slice(0, 6), sol[7], sol[6]]);
loses('second user pool', [sol[0], sol[0].replace('shopkaro-customers', 'shopkaro-test'), ...sol.slice(1)]);
errs('password breaks policy', [...sol.slice(0, 3), sol[3].replace('TEST-Passw0rd!x', 'shortpw')], /InvalidPasswordException/);
errs('wrong password at login', [...sol.slice(0, 4), sol[4].replace('PASSWORD=TEST-Passw0rd!x', 'PASSWORD=nope')], /NotAuthorizedException/);
errs('admin flow not enabled', [sol[0], sol[1].replace(' ALLOW_ADMIN_USER_PASSWORD_AUTH', ''), ...sol.slice(2, 5)], /Auth flow not enabled/);
errs('identity pool with a foreign client', [...sol.slice(0, 5), sol[5].replace('ClientId=' + C, 'ClientId=someoneelse0000000000000000')], /ClientId/);
errs('unknown role', [...sol.slice(0, 6), sol[6].replace('shopkaro-app-user', 'admin')], /role nahi mila/);
errs('guest role on a pool without guests', [...sol.slice(0, 6), sol[6] + ',unauthenticated=' + F.ROLE_GUEST], /unauthenticated role/);
errs('bad auth flow value', [sol[0], sol[1] + ' ALLOW_EVERYTHING'], /explicit-auth-flows/);
errs('unknown flag', ['aws cognito-idp describe-user-pool --pool-id x'], /Unknown options/);

/* tokens are decodable JWTs: ID token has aud, access token has client_id */
{
  const r = run(never, sol.slice(0, 5));
  const m = r.text.match(/"IdToken":\s*"([^"]+)"/), n = r.text.match(/"AccessToken":\s*"([^"]+)"/);
  check(m && n, 'login prints both tokens');
  const id = AG.authDecode(m[1]).claims, acc = AG.authDecode(n[1]).claims;
  check(id.token_use === 'id' && id.aud === C && !id.client_id && id.iss.endsWith('/' + P), 'ID token: aud = client, issuer = pool');
  check(acc.token_use === 'access' && acc.client_id === C && !acc.aud, 'access token: client_id, no aud');
}

/* interview: authorizer maths and wrong fixes */
{
  const a = F.iseed(), x = a.jwtAuthorizers[0];
  check(AG.authAuthorize(a, x, F.webIdToken).ok && !AG.authAuthorize(a, x, F.mobileIdToken).ok && /audience/.test(AG.authAuthorize(a, x, F.mobileIdToken).why), 'starting authorizer: web passes, mobile 401 on audience');
  const late = { ...a, now: '2026-11-20T12:00:00Z' };
  check(/expire/.test(AG.authAuthorize(late, x, F.webIdToken).why), 'expired token is refused');
  check(/issuer/.test(AG.authAuthorize(a, { ...x, issuer: 'https://example.test' }, F.webIdToken).why), 'issuer mismatch is refused');
}
loses('audience only mobile', [isol[0], `aws apigatewayv2 update-authorizer --api-id ${F.API} --authorizer-id auth01 --jwt-configuration Audience=${F.MOBILE},Issuer=${F.ISS}`, isol[2]], interview);
loses('issuer changed', [isol[0], isol[1].replace(F.ISS, 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_Other'), isol[2]], interview);
loses('update without a fresh read', [isol[0], isol[1]], interview);
errs('empty audience', [`aws apigatewayv2 update-authorizer --api-id ${F.API} --authorizer-id auth01 --jwt-configuration '{"Audience":[]}'`], /khaali/, { ...interview, success: () => false });

/* flowlab: thresholds over the labelled sample */
const flow = level.stages.find(s => s.type === 'flowlab');
let states = 0, winners = 0;
const [kr, kv] = flow.knobs;
for (let rejectAt = kr.min; rejectAt <= kr.max; rejectAt += kr.step) for (let reviewFrom = kv.min; reviewFrom <= kv.max; reviewFrom += kv.step) {
  const k = { rejectAt, reviewFrom }, r = AG.appaiModeration(k);
  states++; check(flow.check(k) === r.ok && flow.model(k).verdict.ok === r.ok, 'flowlab verdict agrees');
  if (r.ok) { winners++; check(r.fn === 0 && reviewFrom <= Math.min(...F.UNSAFE), 'winner lets no unsafe photo through'); }
}
const init = Object.fromEntries(flow.knobs.map(k => [k.id, k.value]));
check(F.UNSAFE.length === 20 && F.SAFE.length === 180, 'sample is 20 unsafe + 180 safe');
check(winners > 0 && winners < states / 4 && !flow.check(init) && !AG.appaiModeration({ rejectAt: 99, reviewFrom: 30 }).ok, `flowlab ${winners}/${states} fit; start state fails`);
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
console.log(`   ✓ ${checks} appai checks · ${states} threshold states/${winners} fit · ${qs.length} MCQs (0 length flags; positions ${positions.join(',')})`);
