#!/usr/bin/env node
// Hybrid networking (TGW segments / VPN on TGW) regressions; offline only.
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
const level = AG.findLevel('advnet'), mission = level.stages.find(s => s.type === 'terminal'), interview = level.interview.questions.find(q => q.terminal).terminal, clone = x => JSON.parse(JSON.stringify(x));
const never = { ...mission, success: () => false }, neverI = { ...interview, success: () => false }, sol = mission.solution, isol = interview.solution;
const TGW = 'tgw-0shop0000000001', CGW = 'cgw-0godam00000001', A_PROD = 'tgw-attach-0prod000001', A_DEV = 'tgw-attach-0dev0000001', A_SHARED = 'tgw-attach-0shared0001', A_VPN = 'tgw-attach-00000000000000001', VPN = 'vpn-00000000000000001';
const RT_PROD = 'tgw-rtb-0prod000001', RT_DEV = 'tgw-rtb-0dev0000001', RT_SHARED = 'tgw-rtb-0shared0001', RT_ONPREM = 'tgw-rtb-0onprem0001';
const prop = (rt, att) => `aws ec2 enable-transit-gateway-route-table-propagation --transit-gateway-route-table-id ${rt} --transit-gateway-attachment-id ${att}`;
const unprop = (rt, att) => `aws ec2 disable-transit-gateway-route-table-propagation --transit-gateway-route-table-id ${rt} --transit-gateway-attachment-id ${att}`;
const assoc = (rt, att) => `aws ec2 associate-transit-gateway-route-table --transit-gateway-route-table-id ${rt} --transit-gateway-attachment-id ${att}`;
const disassoc = (rt, att) => `aws ec2 disassociate-transit-gateway-route-table --transit-gateway-route-table-id ${rt} --transit-gateway-attachment-id ${att}`;
const route = (rt, cidr, att) => `aws ec2 create-transit-gateway-route --destination-cidr-block ${cidr} --transit-gateway-route-table-id ${rt} ` + (att ? '--transit-gateway-attachment-id ' + att : '--blackhole');
const READ = sol.at(-1), IREAD = isol.at(-1);

// Intended solutions: final action only, task agreement, clean reset, every omission loses, inventory cannot win.
for (const stage of [mission, interview]) {
  const r = run(stage, stage.solution);
  check(r.done === 1, 'intended wins ' + r.text);
  check(r.trace.slice(0, -1).every(n => !n) && r.trace.at(-1) === 1, 'final action only');
  check(stage.tasks.every(t => t.check(r.state)), 'state tasks agree');
  check(run(stage, stage.solution).done === 1, 'clean reset');
  for (let i = 0; i < stage.solution.length; i++) check(!run(stage, stage.solution.filter((_, j) => j !== i)).done, 'omission loses ' + i);
  check(!run(stage, ['aws ec2 describe-transit-gateways', 'aws ec2 describe-transit-gateway-attachments', 'aws ec2 describe-transit-gateway-route-tables', 'aws ec2 describe-vpn-connections']).done, 'inventory alone cannot win');
}
const solved = run(never, sol), isolved = run(neverI, isol);
check(mission.success(solved.state) && interview.success(isolved.state), 'reference ready states');

// Contract-breaking follow-ups revoke the win even after a fresh read.
for (const action of [
  `aws ec2 delete-vpn-connection --vpn-connection-id ${VPN}`, disassoc(RT_ONPREM, A_VPN), prop(RT_ONPREM, A_DEV), unprop(RT_PROD, A_VPN), unprop(RT_SHARED, A_VPN), unprop(RT_PROD, A_SHARED),
  unprop(RT_SHARED, A_DEV), disassoc(RT_DEV, A_DEV), `aws ec2 delete-transit-gateway-route --transit-gateway-route-table-id ${RT_DEV} --destination-cidr-block 10.10.0.0/16`, prop(RT_PROD, A_DEV), prop(RT_DEV, A_VPN),
  route(RT_ONPREM, '10.20.0.0/16', A_DEV), `aws ec2 create-transit-gateway-route-table --transit-gateway-id ${TGW}`
]) { const r = run(never, [...sol, action, READ]); check(!mission.success(r.state), 'current state revokes win ' + action); }
check(mission.success(run(never, [...sol, prop(RT_DEV, A_PROD), READ]).state), 'static blackhole guardrail holds even if prod propagation is added to rt-dev');

// Direct state mutations: every declared contract field matters (read marker stays current).
for (const mutate of [
  a => a.tgw.asn = 65000, a => a.onPrem.advertised = ['10.99.0.0/24'], a => a.vpcs[0].cidr = '10.11.0.0/16', a => a.tgwAttachments[0].cidrs = ['10.12.0.0/16'], a => a.tgwAttachments[1].state = 'deleted',
  a => a.customerGateways[0].bgpAsn = 65001, a => a.tgwRouteTables.find(t => t.id === RT_PROD).associations = [], a => a.tgwRouteTables.find(t => t.id === RT_DEV).statics = [],
  a => a.tgwRouteTables.find(t => t.id === RT_ONPREM).associations.push(A_DEV), a => a.vpnConnections[0].state = 'pending', a => a.vpnConnections[0].cgwId = 'cgw-other', a => a.vpnConnections.push(clone(a.vpnConnections[0])),
  a => a.tgwAttachments.find(x => x.id === A_VPN).state = 'pending', a => a.tgwRouteTables.pop(), a => a.hybridMode = false, a => a.callerIdentity.Account = '999999999999', a => a.hybridRevision++
]) { const s = clone(solved.state); mutate(s.account); check(!mission.success(s), 'configuration contract required ' + mutate.toString()); }

// Stale read, query projection and wrong-table reads cannot certify.
const bump = [route(RT_ONPREM, '10.99.0.0/16', null), `aws ec2 delete-transit-gateway-route --transit-gateway-route-table-id ${RT_ONPREM} --destination-cidr-block 10.99.0.0/16`];
check(!mission.success(run(never, [...sol, ...bump]).state), 'later revision invalidates the old read');
check(mission.success(run(never, [...sol, ...bump, READ]).state), 'fresh current read recertifies');
check(!run(mission, sol.map((c, i) => i === sol.length - 1 ? c + ' --query Routes[0]' : c)).done, 'query projection cannot certify');
check(!run(mission, [...sol.slice(0, -1), READ.replace(RT_ONPREM, RT_PROD)]).done, 'wrong table read cannot certify');

// Legitimate alternatives.
const staticPath = [sol[0] + ' --options StaticRoutesOnly=true', sol[1], sol[2], sol[3], sol[4], route(RT_PROD, '192.168.10.0/24', A_VPN), route(RT_SHARED, '192.168.10.0/24', A_VPN), READ];
const sp = run(mission, staticPath);
check(sp.done === 1 && sp.state.account.vpnConnections[0].staticRoutesOnly === true, 'static-routing VPN with static TGW routes satisfies the contracts');
check(!run(mission, [sol[0] + ' --options StaticRoutesOnly=true', ...sol.slice(1)]).done, 'static VPN without static routes leaves no return path');
check(run(mission, [sol[0] + ` --options '{"StaticRoutesOnly":false}'`, ...sol.slice(1)]).done === 1, 'JSON options form accepted');
check(run(mission, [sol[0], sol[1], sol[2], sol[6], sol[5], sol[4], sol[3], READ.replace('Values=active', 'Values=active,blackhole')]).done === 1, 'propagation order and filter values are free');
check(run(mission, sol.map(c => c.replace(' --transit-gateway-route-table-id ', '\t--transit-gateway-route-table-id=').replace(' --vpn-connection-ids ', ' --vpn-connection-ids='))).done === 1, 'equals/whitespace forms legitimate');
check(run(interview, [route(RT_PROD, '10.20.0.0/16', null), isol[1], isol[2], IREAD]).done === 1, 'interview: blackholing dev in rt-prod instead of disabling propagation is valid');
check(!run(interview, [isol[0], isol[2], IREAD]).text.includes('wins') && run(neverI, [isol[0], isol[2]]).text.includes('Resource.AlreadyAssociated'), 'associate before disassociate is rejected (one table per attachment)');

// Error paths stay atomic and teach the requirement.
const pending = run(never, [sol[0], sol[2]]);
check(pending.text.includes('IncorrectState') && !pending.state.account.tgwRouteTables.find(t => t.id === RT_ONPREM).associations.length, 'pending VPN attachment cannot be associated');
const dupProp = run(neverI, [isol[0], prop(RT_PROD, A_SHARED)]);
check(dupProp.text.includes('Duplicate') && dupProp.state.account.tgwRouteTables.find(t => t.id === RT_PROD).propagations.filter(x => x === A_SHARED).length === 1, 'duplicate propagation rejected');
check(run(never, [unprop(RT_ONPREM, A_PROD)]).text.includes('InvalidPropagation.NotFound'), 'disable missing propagation explains');
check(run(never, [disassoc(RT_PROD, A_DEV)]).text.includes('InvalidAssociation.NotFound'), 'wrong-table disassociate explains');
for (const [label, command, needle] of [
  ['no target', `aws ec2 create-transit-gateway-route --destination-cidr-block 10.99.0.0/16 --transit-gateway-route-table-id ${RT_ONPREM}`, 'exactly one'],
  ['both targets', route(RT_ONPREM, '10.99.0.0/16', A_PROD) + ' --blackhole', 'exactly one'],
  ['host bits', route(RT_ONPREM, '10.10.0.1/16', null), 'host bits'],
  ['propagated delete', `aws ec2 delete-transit-gateway-route --transit-gateway-route-table-id ${RT_PROD} --destination-cidr-block 10.30.0.0/16`, 'disabling propagation'],
  ['search without filters', `aws ec2 search-transit-gateway-routes --transit-gateway-route-table-id ${RT_PROD}`, 'required'],
  ['search bad filter', `aws ec2 search-transit-gateway-routes --transit-gateway-route-table-id ${RT_PROD} --filters Name=route-search.exact-match,Values=10.0.0.0/8`, 'filters in this fixture'],
  ['unknown CGW', sol[0].replace(CGW, 'cgw-0missing0000001'), 'InvalidCustomerGatewayID.NotFound'],
  ['unknown TGW', sol[0].replace(TGW, 'tgw-0missing00000001'), 'InvalidTransitGatewayID.NotFound'],
  ['bad type', sol[0].replace('ipsec.1', 'ipsec.2'), 'must be ipsec.1'],
  ['unknown option key', sol[0] + ' --options TunnelInsideIpVersion=ipv6', 'StaticRoutesOnly'],
  ['wrong Region', sol[0] + ' --region us-east-1', 'Hybrid fixture scope'],
  ['dry run', sol[0] + ' --dry-run', 'DryRunOperation'],
  ['wait without ids', 'aws ec2 wait vpn-connection-available', 'needs --vpn-connection-ids']
]) { const r = run(never, [command]); check(r.text.includes(needle) && !r.state.account.vpnConnections.length && r.state.account.tgwRouteTables.every(t => !(t.statics || []).some(x => x.cidr === '10.99.0.0/16')), 'error atomic: ' + label + ' ' + r.text.split('\n').at(-1)); }
check(run(never, [sol[0], sol[0]]).text.includes('already has a VPN connection'), 'second VPN for the same CGW is scoped out explicitly');
check(run(never, ['aws ec2 create-customer-gateway --bgp-asn 65010 --public-ip 300.1.1.1 --type ipsec.1']).text.includes('IPv4 address'), 'customer gateway IP validated');

// Evaluator unit checks (documented rules, not packets).
const a0 = clone(solved.state.account);
const tableOf = id => a0.tgwRouteTables.find(t => t.id === id);
check(AG.hybridHop(a0, A_DEV, (10 * 2 ** 24) + (10 * 2 ** 16) + 10).why.startsWith('blackhole'), 'dev → prod hits the blackhole');
const specific = clone(a0); specific.tgwRouteTables.find(t => t.id === RT_DEV).statics.push({ cidr: '10.10.4.0/24', attachmentId: A_PROD });
check(AG.hybridHop(specific, A_DEV, (10 * 2 ** 24) + (10 * 2 ** 16) + (4 * 256) + 20).to === A_PROD && AG.hybridHop(specific, A_DEV, (10 * 2 ** 24) + (10 * 2 ** 16) + 20).why.startsWith('blackhole'), 'longest prefix wins over a shorter blackhole');
const staticWins = clone(a0); staticWins.tgwRouteTables.find(t => t.id === RT_DEV).propagations.push(A_PROD);
check(!AG.hybridRoundTrip(staticWins, A_DEV, A_PROD), 'static blackhole hides a propagated route with the same prefix');
const oneWay = clone(a0); oneWay.tgwRouteTables.find(t => t.id === RT_DEV).statics = []; oneWay.tgwRouteTables.find(t => t.id === RT_DEV).propagations.push(A_PROD);
check(AG.hybridHop(oneWay, A_DEV, (10 * 2 ** 24) + (10 * 2 ** 16) + 10).ok && !AG.hybridRoundTrip(oneWay, A_DEV, A_PROD), 'forward route alone is not a conversation (return path required)');
const noAssoc = clone(a0); noAssoc.tgwRouteTables.find(t => t.id === RT_PROD).associations = [];
check(AG.hybridHop(noAssoc, A_PROD, (10 * 2 ** 24) + (30 * 2 ** 16) + 10).why === 'no associated route table', 'unassociated attachment has no path');
check(tableOf(RT_ONPREM).associations[0] === A_VPN && AG.hybridRoundTrip(a0, A_VPN, A_SHARED) && !AG.hybridRoundTrip(a0, A_VPN, A_DEV), 'solved on-prem reachability matrix');

// Garbage commands never crash the engine and never win.
const garbage = ['', ' ', 'random', 'aws', 'aws ec2', 'sudo aws ec2 describe-transit-gateways', 'AWS EC2 DESCRIBE-TRANSIT-GATEWAYS', 'aws ec2 create-transit-gateway', 'aws ec2 delete-transit-gateway --transit-gateway-id ' + TGW,
  'aws ec2 associate-transit-gateway-route-table', 'aws ec2 search-transit-gateway-routes --filters Name=state,Values=active', 'aws ec2 search-transit-gateway-routes --transit-gateway-route-table-id __proto__ --filters Name=state,Values=active',
  'aws ec2 describe-transit-gateway-route-tables --transit-gateway-route-table-ids constructor', 'aws ec2 create-vpn-connection --customer-gateway-id __proto__ --transit-gateway-id ' + TGW + ' --type ipsec.1', "aws ec2 create-vpn-connection --customer-gateway-id " + CGW + " --transit-gateway-id " + TGW + " --type ipsec.1 --options '{broken'",
  'aws ec2 create-transit-gateway-route --destination-cidr-block constructor --transit-gateway-route-table-id ' + RT_DEV + ' --blackhole', 'aws ec2 wait vpn-connection-available --vpn-connection-ids __proto__', 'aws ec2 describe-vpn-connections --vpn-connection-ids constructor',
  'aws ec2 create-customer-gateway --bgp-asn -1 --public-ip 1.2.3.4 --type ipsec.1', 'aws ec2 describe-transit-gateways --region', 'aws ec2 get-transit-gateway-route-table-associations --transit-gateway-route-table-id ' + RT_DEV + ' --query Missing'];
for (let i = 0; i < 180; i++) garbage.push('aws ec2 ' + ['associate-transit-gateway-route-table', 'enable-transit-gateway-route-table-propagation', 'create-transit-gateway-route', 'create-vpn-connection', 'search-transit-gateway-routes', 'create-customer-gateway'][i % 6] + ' --' + ['transit-gateway-route-table-id', 'transit-gateway-attachment-id', 'destination-cidr-block', 'customer-gateway-id', 'filters', 'bgp-asn'][i % 6] + ' ' + ['null', '[]', '{}', 'constructor', '__proto__', "'broken", '', '-1'][i % 8]);
for (const command of garbage) {
  const r = run(never, [command]);
  check(!/simulator error:|is not defined|Cannot read properties|is not a function/.test(r.text), 'garbage no internal exception ' + command);
  check(!r.state || !mission.success(r.state), 'garbage cannot win');
}

// Planner sweep: exactly one design meets week-3, month-4, DNS, segmentation and budget.
let states = 0, wins = 0; const flow = level.stages.find(s => s.type === 'flowlab');
function sweep(i, k) {
  if (i === flow.knobs.length) {
    const m = flow.model(k), ok = flow.check(k);
    check(m.verdict.ok === ok, 'planner verdict agrees');
    check(m.readouts.every(r => !String(r.value).includes('NaN') && !String(r.value).includes('undefined')), 'no NaN/undefined');
    if (ok) { wins++; check(k.now === 2 && k.later === 2 && k.encrypt === 1 && k.dns === 1 && k.segment === 1, 'win = 2 VPN + BGP now, 10G DX + VPN backup later, encrypted, DNS, segments'); }
    states++; return;
  }
  const n = flow.knobs[i]; for (let v = n.min; v <= n.max; v += n.step) sweep(i + 1, { ...k, [n.id]: v });
}
sweep(0, {});
check(states === 128 && wins === 1, 'all 128 states; 1 valid design');
check(!flow.check(Object.fromEntries(flow.knobs.map(k => [k.id, k.value]))), 'start values fail');
const base = { now: 2, later: 2, encrypt: 1, dns: 1, segment: 1 };
check(flow.model({ ...base, now: 1 }).verdict.text.includes('1.25 Gbps < 2'), 'single static VPN misses week-3 bandwidth');
check(flow.model({ ...base, now: 3 }).verdict.text.includes('week 3 tak link ready nahi'), 'DX cannot be ready in week 3');
check(flow.model({ ...base, later: 3 }).verdict.text.includes('budget'), 'two-location DX breaks the budget');
check(flow.model({ ...base, later: 0 }).verdict.text.includes('consistent'), 'VPN-only month 4 is not consistent bandwidth');
check(flow.model({ ...base, encrypt: 0 }).verdict.text.includes('encrypted nahi'), 'DX needs encryption add-on');

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
console.log(`   ✓ ${checks.toLocaleString('en-US')} hybrid checks · ${states} planner states · ${qs.length} MCQs (${flags} length flags; positions ${positions})`);
module.exports = { checks, states, flags };
