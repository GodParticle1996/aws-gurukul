#!/usr/bin/env node
/* =====================================================================
   AWS Gurukul — offline full-app validator.   Run:  node validate.js
   Browser ke bina poori app check karta hai:
     1. Syntax (har file + combined = cross-file redeclaration)
     2. Duplicates (VISUALS keys, level ids) — object literal chup-chaap
        aakhri key rakhta hai, isliye yeh check zaroori hai
     3. Structure (har stage type ka schema, hotspot targets vs data-hs,
        incident graph reachability, quiz answer indices...)
     4. Terminal missions — har mission ke hints se commands nikaal ke
        ASLI awscli.js simulator par chala ke success() verify
     5. Fill stages — programmatically solve
     6. Boot — app.js load + har screen render
   ===================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = __dirname;
const ENGINE = ['core.js', 'data-core.js', 'visuals.js', 'games.js', 'awscli.js', 'security-cli.js', 'capacity-cli.js', 'audit-cli.js', 'orgs-cli.js', 'dr-cli.js', 'labs.js', 'decisions.js'];
const DATA = ['data-beg-1-cloud101.js', 'data-beg-2-iam.js', 'data-beg-3-ec2.js', 'data-beg-4-s3.js', 'data-beg-5-vpcbasics.js', 'data-beg-6-rds.js', 'data-beg-7-elbasg.js', 'data-beg-8-boss1.js', 'data-int-1-vpcdeep.js', 'data-int-2-route53.js', 'data-int-3-cloudfront.js', 'data-int-4-s3adv.js', 'data-int-5-efs.js', 'data-int-6-lambda.js', 'data-int-7-dynamodb.js', 'data-int-8-caching.js', 'data-int-9-sqssns.js', 'data-int-10-events.js', 'data-int-11-security.js', 'data-int-12-boss2.js', 'data-adv-1-wellarch.js', 'data-adv-2-orgs.js', 'data-adv-3-dr.js', 'data-advanced.js', 'data-architect.js',
  'data-decisions-compute.js', 'data-decisions-data.js', 'data-decisions-network.js', 'data-decisions-integration.js', 'data-decisions-security.js', 'data-decisions-ops.js'];
const ALL = [...ENGINE, ...DATA, 'app.js'];
let FAIL = 0;
const bad = m => { console.log('   ✗ ' + m); FAIL++; };
const ok = m => console.log('   ✓ ' + m);

/* ---------------- mini DOM ---------------- */
function mkNode(tag) {
  const n = {
    tagName: tag, _kids: [], _l: {}, _syn: {}, _html: '', textContent: '',
    // innerHTML set karna = purane children hatana (browser jaisa) — warna purane buttons validator ko dhoka dete
    get innerHTML() { return n._html; },
    set innerHTML(v) { n._html = v; n._kids = []; n._syn = {}; },
    dataset: {}, style: {}, disabled: false, draggable: false, offsetWidth: 0, value: '',
    _cls: new Set(),
    get className() { return [...this._cls].join(' '); },
    set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get children() { return n._kids; },
    classList: {
      add(...c) { c.forEach(x => n._cls.add(x)); },
      remove(...c) { c.forEach(x => n._cls.delete(x)); },
      contains(c) { return n._cls.has(c); },
      toggle(c) { n._cls.has(c) ? n._cls.delete(c) : n._cls.add(c); },
    },
    appendChild(c) { n._kids.push(c); c._parent = n; return c; },
    append(...cs) { cs.forEach(c => n.appendChild(c)); },
    insertBefore(c) { return n.appendChild(c); },
    removeChild(c) { n._kids = n._kids.filter(k => k !== c); },
    remove() { if (n._parent) n._parent._kids = n._parent._kids.filter(k => k !== n); },
    // Attribute API used by accessible range inputs in the real browser.
    _attrs: {},
    setAttribute(name, value) { n._attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(n._attrs, name) ? n._attrs[name] : null; },
    focus() {}, blur() {}, scrollIntoView() {},
    click() {
      if (n.disabled) return;                       // browser disabled button par click fire nahi karta
      const ev = { stopPropagation() {}, preventDefault() {}, target: n };
      if (typeof n.onclick === 'function') n.onclick(ev);
      (n._l.click || []).forEach(f => f(ev));
    },
    addEventListener(ev, f) { (n._l[ev] = n._l[ev] || []).push(f); },
    fire(ev, e) { (n._l[ev] || []).forEach(f => f(e || { preventDefault() {}, stopPropagation() {} })); },
    closest() { return null; },
    querySelectorAll(sel) {
      const out = [];
      (function walk(x) {
        x._kids.forEach(k => {
          if (sel.startsWith('.') && k._cls.has(sel.slice(1))) out.push(k);
          else if (sel === 'input' && k.tagName === 'input') out.push(k);
          else {
            const m = sel.match(/^\[data-(\w+)(?:="([^"]*)")?\]/);
            if (m) { const v = k.dataset[m[1]]; if (v !== undefined && (m[2] === undefined || v === m[2])) out.push(k); }
          }
          walk(k);
        });
      })(n);
      return out;
    },
    querySelector(sel) {
      const f = n.querySelectorAll(sel)[0];
      if (f) return f;
      if (!n._syn[sel]) n._syn[sel] = mkNode(sel === 'input' ? 'input' : 'div'); // innerHTML-created nodes
      return n._syn[sel];
    },
    set scrollTop(v) {}, get scrollTop() { return 0; }, get scrollHeight() { return 0; },
  };
  return n;
}
function mkSandbox(withApp) {
  const topbar = mkNode('div'), app = mkNode('div');
  const store = {};
  const document = {
    createElement: mkNode, createTextNode: t => { const x = mkNode('#text'); x.textContent = t; return x; },
    getElementById: id => (id === 'topbar' ? topbar : app), body: mkNode('body'),
  };
  const sb = {
    console: { log() {}, error() {}, warn() {} }, document,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    setTimeout: f => { try { f(); } catch (e) {} return 0; }, clearTimeout() {},
    scrollTo() {}, alert() {}, confirm: () => true,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  const files = withApp ? ALL : [...ENGINE, ...DATA];
  for (const f of files) {
    try { vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sb, { filename: f }); }
    catch (e) { bad(`load ${f}: ${e.message}`); return null; }
  }
  return sb;
}

/* ================= 1. SYNTAX ================= */
console.log('\n1️⃣  Syntax');
let synOk = true;
for (const f of ALL) {
  try { new vm.Script(fs.readFileSync(path.join(DIR, f), 'utf8'), { filename: f }); }
  catch (e) { bad(`${f}: ${e.message}`); synOk = false; }
}
if (synOk) ok(`${ALL.length} files parse clean`);
const combined = ALL.map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
try { new vm.Script(combined, { filename: 'awsg-combined-check.js' }); ok('combined load order — no cross-file redeclaration'); }
catch (e) { bad('combined (cross-file redeclaration): ' + e.message); }

/* ================= 2. DUPLICATES ================= */
console.log('\n2️⃣  Duplicates (object literals silently keep the LAST key)');
const rawVis = fs.readFileSync(path.join(DIR, 'visuals.js'), 'utf8');
const visKeys = [...rawVis.matchAll(/^  ([A-Za-z0-9_]+): \{/gm)].map(m => m[1]);
const visDup = [...new Set(visKeys.filter((k, i) => visKeys.indexOf(k) !== i))];
visDup.forEach(k => bad(`DUPLICATE VISUALS key "${k}" — earlier diagram silently lost`));
if (!visDup.length) ok(`${visKeys.length} VISUALS keys unique`);

const sb = mkSandbox(false);
if (!sb) { console.log('\n❌ load failed, abort'); process.exit(1); }
const { AG, VISUALS } = vm.runInContext('({AG, VISUALS})', sb);
const allIds = [];
AG.tracks.forEach(t => (AG.levelSets[t.id] || []).forEach(l => allIds.push(l.id)));
const idDup = [...new Set(allIds.filter((k, i) => allIds.indexOf(k) !== i))];
idDup.forEach(k => bad(`DUPLICATE level id "${k}" — completion/XP state collides`));
if (!idDup.length) ok(`${allIds.length} level ids unique`);

/* ================= 3. STRUCTURE ================= */
console.log('\n3️⃣  Structure');
const P = []; const w = (...a) => P.push(a.join(' '));
let nStage = 0, terminals = [], fills = [];
const labStages = [];
function chk(s, S) {
  switch (s.type) {
    case 'quiz':
      if (!s.questions || !s.questions.length) { w(S, 'no questions'); break; }
      s.questions.forEach((q, i) => {
        if (!q.q) w(S, `q${i} no text`);
        if (!q.choices || q.choices.length < 2) w(S, `q${i} <2 choices`);
        else if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.choices.length) w(S, `q${i} BAD answer index ${q.answer}`);
        if (!q.explain) w(S, `q${i} no explain`);
        if (q.choices && new Set(q.choices).size !== q.choices.length) w(S, `q${i} duplicate choices`);
      }); break;
    case 'bins': {
      const ids = new Set((s.bins || []).map(b => b.id));
      if (!s.items || !s.items.length) w(S, 'no items');
      (s.items || []).forEach(it => {
        if (!ids.has(it.bin)) w(S, `item "${it.text}" -> unknown bin "${it.bin}"`);
        if (!it.explain) w(S, `item "${it.text}" no explain`);
      });
      (s.bins || []).forEach(b => { if (!(s.items || []).some(i => i.bin === b.id)) w(S, `bin "${b.id}" has NO items`); });
      break; }
    case 'match': {
      if (!s.pairs || s.pairs.length < 2) w(S, '<2 pairs');
      (s.pairs || []).forEach((p, i) => { if (!p.left || !p.right) w(S, `pair${i} missing side`); if (!p.explain) w(S, `pair${i} no explain`); });
      const r = (s.pairs || []).map(p => p.right);
      if (new Set(r).size !== r.length) w(S, 'duplicate right values (ambiguous)');
      break; }
    case 'order':
      if (!s.steps || s.steps.length < 2) w(S, '<2 steps');
      (s.steps || []).forEach((st, i) => { if (!st.text) w(S, `step${i} no text`); if (!st.explain) w(S, `step${i} no explain`); });
      break;
    case 'fill': {
      fills.push({ s, S });
      if (!s.template) { w(S, 'no template'); break; }
      const idxs = [...s.template.matchAll(/\{(\d+)\}/g)].map(m => +m[1]);
      (s.blanks || []).forEach((b, i) => {
        if (!idxs.includes(i)) w(S, `blank ${i} has no {${i}} in template`);
        if (!(s.tokens || []).includes(b.answer)) w(S, `blank ${i} answer "${b.answer}" not in tokens`);
        if (!b.explain) w(S, `blank ${i} no explain`);
      });
      [...new Set(idxs)].forEach(i => { if (!(s.blanks || [])[i]) w(S, `template {${i}} has no blank def`); });
      const d = (s.tokens || []).filter((t, i, a) => a.indexOf(t) !== i);
      if (d.length) w(S, 'duplicate tokens: ' + d.join(','));
      break; }
    case 'hotspot': {
      const v = VISUALS[s.visual];
      if (!v) { w(S, `visual "${s.visual}" NOT FOUND`); break; }
      const tg = new Set([...String(v.html).matchAll(/data-hs="([^"]+)"/g)].map(m => m[1]));
      if (!s.questions || !s.questions.length) w(S, 'no questions');
      (s.questions || []).forEach((q, i) => {
        if (!tg.has(q.target)) w(S, `q${i} target "${q.target}" not in visual "${s.visual}" (has: ${[...tg].join('|')})`);
        if (!q.explain) w(S, `q${i} no explain`);
      });
      break; }
    case 'incident': {
      if (!s.pager) w(S, 'no pager');
      if (!s.nodes || !s.nodes[s.start]) { w(S, `start node "${s.start}" missing`); break; }
      Object.entries(s.nodes).forEach(([nid, n]) => {
        if (n.end) { if (!n.text || !n.summary) w(S, `end node ${nid} missing text/summary`); return; }
        if (!n.choices || !n.choices.length) { w(S, `node ${nid} no choices`); return; }
        if (!n.choices.some(c => c.good)) w(S, `node ${nid} has NO good choice (dead end)`);
        n.choices.forEach((c, ci) => {
          if (!c.t) w(S, `node ${nid} choice${ci} no t (text field is 't')`);
          if (!c.explain) w(S, `node ${nid} choice${ci} no explain`);
          if (c.good && !s.nodes[c.next]) w(S, `node ${nid} choice${ci} next "${c.next}" MISSING`);
        });
      });
      const seen = new Set(), stk = [s.start];
      while (stk.length) { const id = stk.pop(); if (seen.has(id)) continue; seen.add(id); const n = s.nodes[id]; if (!n || n.end) continue; (n.choices || []).forEach(c => { if (c.good && c.next) stk.push(c.next); }); }
      Object.keys(s.nodes).forEach(nid => { if (!seen.has(nid)) w(S, `node "${nid}" UNREACHABLE`); });
      if (![...seen].some(id => s.nodes[id] && s.nodes[id].end)) w(S, 'no reachable end node');
      break; }
    case 'terminal':
      terminals.push({ s, S });
      if (!s.goal) w(S, 'no goal (renders "undefined")');
      if (typeof s.success !== 'function') w(S, 'no success() fn');
      if (!s.hints || !s.hints.length) w(S, 'no hints');
      if (!s.account) w(S, 'no account');
      (s.tasks || []).forEach((t, i) => { if (typeof t.check !== 'function') w(S, `task${i} no check()`); });
      break;
    case 'dryrun': {
      labStages.push({ s, S });
      const ids = new Set((s.nodes || []).map(n => n.id));
      if (!ids.size) w(S, 'dryrun has no nodes');
      if (!s.steps || s.steps.length < 2) w(S, 'dryrun <2 steps');
      (s.edges || []).forEach(e => { if (!ids.has(e.from) || !ids.has(e.to)) w(S, `edge ${e.from}->${e.to} unknown node`); });
      const pids = new Set((s.panels || []).map(p => p.id));
      (s.steps || []).forEach((st, i) => {
        if (!st.say) w(S, `step${i} no say`);
        (st.flows || []).forEach(f => { if (!ids.has(f.from) || !ids.has(f.to)) w(S, `step${i} flow ${f.from}->${f.to} unknown node`); });
        Object.keys(st.nodes || {}).forEach(id => { if (!ids.has(id)) w(S, `step${i} node state for unknown "${id}"`); });
        Object.keys(st.panels || {}).forEach(id => { if (!pids.has(id)) w(S, `step${i} panel "${id}" not declared`); });
        if (st.ask) chkQ(st.ask, `${S} step${i} ask`);
      });
      if (!s.lesson) w(S, 'dryrun no lesson');
      break; }
    case 'flowlab':
      labStages.push({ s, S });
      if (!s.knobs || !s.knobs.length) w(S, 'flowlab no knobs');
      (s.knobs || []).forEach(k => {
        if (!k.id || !k.label) w(S, 'knob missing id/label');
        if (!(k.min <= k.value && k.value <= k.max)) w(S, `knob ${k.id} value ${k.value} outside [${k.min},${k.max}]`);
      });
      if (typeof s.model !== 'function') w(S, 'flowlab no model()');
      if (typeof s.check !== 'function') w(S, 'flowlab no check()');
      if (!s.goal) w(S, 'flowlab no goal');
      if (s.quiz) chkQ(s.quiz, `${S} quiz`);
      break;
    case 'triage':
      labStages.push({ s, S });
      if (!s.symptom) w(S, 'triage no symptom');
      if (!(s.commands || []).some(c => c.clue)) w(S, 'triage has no clue command');
      (s.commands || []).forEach((c, i) => { if (!c.cmd || c.out == null || !c.note) w(S, `cmd${i} missing cmd/out/note`); });
      if (new Set((s.commands || []).map(c => c.cmd)).size !== (s.commands || []).length) w(S, 'duplicate triage commands');
      if (!s.questions || !s.questions.length) w(S, 'triage no questions');
      (s.questions || []).forEach((q, i) => chkQ(q, `${S} q${i}`));
      break;
    case 'docker':
      labStages.push({ s, S });
      if (!s.project) w(S, 'docker no project');
      else if (!fs.existsSync(path.join(DIR, 'docker-labs', s.project))) w(S, `docker-labs/${s.project} folder missing`);
      if (!s.goal) w(S, 'docker no goal');
      if (!s.steps || !s.steps.length) w(S, 'docker no steps');
      if (!s.observe) w(S, 'docker no observe question'); else chkQ(s.observe, `${S} observe`);
      break;
    default: w(S, `UNKNOWN stage type "${s.type}"`);
  }
}
function chkQ(q, S) {
  if (!q || !q.q) { w(S, 'question missing'); return; }
  if (!q.choices || q.choices.length < 2) w(S, '<2 choices');
  else if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.choices.length) w(S, `BAD answer index ${q.answer}`);
  if (q.choices && new Set(q.choices).size !== q.choices.length) w(S, 'duplicate choices');
  if (!q.explain) w(S, 'no explain');
}
AG.tracks.forEach(t => (AG.levelSets[t.id] || []).forEach(l => {
  const L = `${t.id}/${l.id}`;
  if (!VISUALS[l.id]) w(L, 'no VISUALS[level.id] — hero diagram missing');
  ['objectives', 'success', 'cards'].forEach(k => { if (!l[k] || !l[k].length) w(L, `no ${k}`); });
  if (!(l.lesson || []).length && !(l.steps || []).length) w(L, 'no lesson[] and no steps[] — level mein padhne ko kuch nahi');
  if (!l.badge) w(L, 'no badge');
  if (l.hook && (!l.hook.title || !l.hook.text)) w(L, 'hook needs title + text');
  (l.steps || []).forEach((st, i) => {
    if (!st.q) w(L, `steps[${i}] no q`);
    if (!st.body && !st.points && !st.analogy && !st.visual) w(L, `steps[${i}] has no content`);
  });
  (l.myth || []).forEach((m, i) => { if (!m.myth || !m.sach) w(L, `myth[${i}] needs myth + sach`); });
  if (l.playbook && !(l.playbook.use && l.playbook.avoid)) w(L, 'playbook needs use + avoid');
  (l.exam || []).forEach((e, i) => { if (!e.cue || !e.pick) w(L, `exam[${i}] needs cue + pick`); });
  if (!l.icon || !l.title) w(L, 'no icon/title');
  (l.cards || []).forEach((c, i) => { if (!c.front || !c.back) w(L, `card${i} missing front/back`); });
  (l.lesson || []).forEach((x, i) => { if (typeof x !== 'string') w(L, `lesson[${i}] must be an HTML string`); });
  (l.stages || []).forEach((s, i) => { nStage++; if (!s.title) w(`${L}#${i}`, 'no title'); chk(s, `${L}#${i}(${s.type})`); });
  if (l.interview) {
    if (!l.interview.questions || !l.interview.questions.length) w(L, 'interview has no questions');
    (l.interview.questions || []).forEach((q, i) => {
      if (q.terminal) chk({ ...q.terminal, type: 'terminal' }, `${L}#iv${i}(terminal)`);
      else {
        if (!q.choices || q.choices.length < 2) w(L, `iv q${i} <2 choices`);
        else if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.choices.length) w(L, `iv q${i} BAD answer ${q.answer}`);
        if (!q.explain) w(L, `iv q${i} no explain`);
      }
    });
  }
}));
P.forEach(p => bad(p));
if (!P.length) ok(`${allIds.length} levels · ${nStage} stages · ${terminals.length} terminal · ${fills.length} fill — all schemas valid`);

/* ================= 3b. DECISION DOJO ================= */
console.log('\n3️⃣b Decision Dojo trees');
const DP = []; const dw = (...a) => DP.push(a.join(' '));
const treeIds = new Set();
let nLeaves = 0, nScen = 0;
(AG.decisions || []).forEach(t => {
  const T = `tree ${t.id}`;
  if (treeIds.has(t.id)) dw(T, 'DUPLICATE tree id'); treeIds.add(t.id);
  if (!t.title || !t.icon || !t.start) dw(T, 'needs title/icon/start');
  if (!t.nodes || !t.nodes[t.start]) { dw(T, `start "${t.start}" missing`); return; }
  (t.levels || []).forEach(id => { if (!allIds.includes(id)) dw(T, `levels[] "${id}" is not a level id`); });
  const leaves = Object.keys(t.nodes).filter(k => t.nodes[k].leaf);
  nLeaves += leaves.length;
  Object.entries(t.nodes).forEach(([id, n]) => {
    if (n.leaf) {
      if (!n.pick || !n.one) dw(T, `leaf ${id} needs pick + one`);
      if (!(n.when || []).length || !(n.avoid || []).length) dw(T, `leaf ${id} needs when[] + avoid[]`);
      if (n.level && !allIds.includes(n.level)) dw(T, `leaf ${id} level "${n.level}" unknown`);
      return;
    }
    if (!n.q || !(n.options || []).length) { dw(T, `node ${id} needs q + options`); return; }
    n.options.forEach((o, i) => { if (!o.t || !t.nodes[o.next]) dw(T, `node ${id} option${i} -> "${o.next}" MISSING`); });
  });
  const seen = new Set(), stk = [t.start];
  while (stk.length) { const id = stk.pop(); if (seen.has(id)) continue; seen.add(id); const n = t.nodes[id]; if (n && !n.leaf) n.options.forEach(o => stk.push(o.next)); }
  Object.keys(t.nodes).forEach(id => { if (!seen.has(id)) dw(T, `node "${id}" UNREACHABLE`); });
  if (leaves.length < 2) dw(T, 'needs >=2 leaves (practice needs wrong options)');
  (t.scenarios || []).forEach((sc, i) => {
    nScen++;
    if (!sc.s || !sc.explain) dw(T, `scenario${i} needs s + explain`);
    if (!t.nodes[sc.answer] || !t.nodes[sc.answer].leaf) dw(T, `scenario${i} answer "${sc.answer}" is not a leaf`);
    else if (!AG.decisionPath(t, sc.answer).length && sc.answer !== t.start) dw(T, `scenario${i} answer has no path from start`);
  });
  if (!(t.scenarios || []).length) dw(T, 'no scenarios');
  if (t.compare) t.compare.rows.forEach((r, i) => { if (r.length !== t.compare.cols.length) dw(T, `compare row${i} has ${r.length} cells, cols ${t.compare.cols.length}`); });
});
DP.forEach(p => bad(p));
if (!DP.length) ok(`${(AG.decisions || []).length} trees · ${nLeaves} recommendations · ${nScen} scenarios — all reachable, all answers are leaves`);

/* ================= 3c. LABS (render + jeet ke dikhao) ================= */
console.log('\n3️⃣c Interactive labs (render karke jeet ke dikhao)');
const findAllK = (n, out = []) => { (n._kids || []).forEach(c => { out.push(c); findAllK(c, out); }); return out; };
const byClass = (root, cls) => findAllK(root).filter(n => n._cls && n._cls.has(cls));
const one = (root, cls) => byClass(root, cls)[0];
const clickRight = (root, cls, answer) => {
  const opt = byClass(root, cls).find(b => b.dataset.i === String(answer) && !b.disabled);
  if (opt) opt.click();
  return !!opt;
};
const LP = [];
let nLab = 0;
function knobValues(k) {
  const a = [], step = k.step || 1;
  for (let v = k.min; v <= k.max + 1e-9; v += step) a.push(+v.toFixed(6));
  return a;
}
for (const { s, S } of labStages) {
  nLab++;
  const arena = mkNode('div');
  let done = null;
  try { AG.renderers[s.type](s, arena, r => { done = r; }); }
  catch (e) { LP.push(`${S} — render crash: ${e.message}`); continue; }

  if (s.type === 'dryrun') {
    const steps = s.steps || [];
    for (let i = 0, guard = 0; guard < steps.length * 3 + 5 && !done; guard++) {
      const cur = steps[Math.min(i, steps.length - 1)];
      if (cur.ask && byClass(arena, 'dr-opt').some(b => !b.disabled)) {
        if (!clickRight(arena, 'dr-opt', cur.ask.answer)) { LP.push(`${S} step${i} correct option not rendered`); break; }
      }
      const endBtn = one(arena, 'dr-done');
      if (endBtn) { endBtn.click(); break; }
      const nx = one(arena, 'dr-next');
      if (!nx) break;
      if (nx.disabled) { LP.push(`${S} step${i}: 'Agla' disabled after the right answer — SOFTLOCK`); break; }
      nx.click(); i++;
    }
    const asks = steps.filter(x => x.ask).length;
    if (!done) LP.push(`${S} — SOFTLOCK, dry run never finished`);
    else if (asks && (done.firstTry !== asks || done.total !== asks)) LP.push(`${S} — all right answers but score ${done.firstTry}/${done.total}`);
    steps.forEach((st, i) => {
      const svg = AG.viz.svg(s.nodes || [], s.edges || [], { nodes: st.nodes, flows: st.flows }, s.groups);
      if (/undefined|NaN/.test(svg)) LP.push(`${S} step${i}: diagram has undefined/NaN`);
    });
  }
  if (s.type === 'flowlab') {
    const knobs = s.knobs || [];
    const vals = knobs.map(knobValues);
    const total = vals.reduce((a, v) => a * v.length, 1);
    let winK = null, crash = null;
    const test = k => {
      const m = s.model(Object.assign({}, k));
      if (!m || typeof m !== 'object') throw new Error('model() returned no object');
      if (s.nodes && s.nodes.length) {
        const svg = AG.viz.svg(s.nodes, s.edges || [], { nodes: m.nodes, flows: m.flows }, s.groups);
        if (/undefined|NaN/.test(svg)) throw new Error('diagram has undefined/NaN');
      }
      (m.readouts || []).forEach(r => { if (/undefined|NaN/.test(String(r.value))) throw new Error(`readout "${r.label}" = ${r.value}`); });
      (m.bars || []).forEach(b => { if (!isFinite(b.pct)) throw new Error(`bar "${b.label}" pct = ${b.pct}`); });
      if (!m.verdict || typeof m.verdict.text !== 'string') throw new Error('verdict missing');
      return !!s.check(Object.assign({}, k));
    };
    if (total > 400000) LP.push(`${S} — ${total} knob combinations, too many to prove solvable (step badhao)`);
    else {
      const cur = {};
      const walk = i => {
        if (i === knobs.length) { try { if (test(cur) && !winK) winK = Object.assign({}, cur); } catch (e) { crash = crash || e.message; } return; }
        for (const v of vals[i]) { cur[knobs[i].id] = v; walk(i + 1); }
      };
      walk(0);
      if (crash) LP.push(`${S} — model()/check() crash: ${crash}`);
      if (!winK) LP.push(`${S} — UNSOLVABLE: koi bhi knob combination goal poora nahi karta`);
      const start = {}; knobs.forEach(k => { start[k.id] = k.value; });
      try { if (s.check(start)) LP.push(`${S} — goal SHURU MEIN HI poora hai (knob chhoona hi nahi padega)`); } catch (e) { LP.push(`${S} — crash at start values: ${e.message}`); }
      if (winK && arena._flowlabSet) {
        arena._flowlabSet(winK);
        if (s.quiz) clickRight(arena, 'fl-opt', s.quiz.answer);
        const nx = one(arena, 'fl-next');
        if (nx) nx.click();
        if (!done) LP.push(`${S} — SOFTLOCK at winning values`);
        else if (done.firstTry !== done.total) LP.push(`${S} — winning values + right quiz gave ${done.firstTry}/${done.total}`);
      }
    }
  }
  if (s.type === 'triage') {
    byClass(arena, 'tg-cmd').forEach(b => b.click());
    (s.questions || []).forEach((q, qi) => {
      if (!clickRight(arena, 'tg-opt', q.answer)) LP.push(`${S} q${qi} not rendered after all commands`);
      const nx = byClass(arena, 'tg-next').find(b => !b.disabled);
      if (nx) nx.click();
    });
    if (!done) LP.push(`${S} — SOFTLOCK, triage never finished`);
    else if (done.firstTry !== (s.questions || []).length) LP.push(`${S} — right answers gave ${done.firstTry}/${done.total}`);
  }
  if (s.type === 'docker') {
    byClass(arena, 'dk-tick').forEach(b => b.click());
    if (!clickRight(arena, 'dk-opt', (s.observe || {}).answer)) LP.push(`${S} — observe question not shown after ticking all steps`);
    const d = one(arena, 'dk-done'); if (d) d.click();
    if (!done) LP.push(`${S} — SOFTLOCK, docker lab never finished`);
  }
}
LP.forEach(p => bad(p));
if (!LP.length) ok(`${nLab} labs rendered and won (dryrun/flowlab/triage/docker) — no softlocks, no NaN`);

/* ================= 4. TERMINAL MISSIONS ================= */
console.log('\n4️⃣  Terminal missions (real awscli.js simulator)');
/* hints/goal se commands nikaalo — missions apne hi hints se solve hone chahiye */
function cmdsFrom(stage) {
  const out = [];
  const push = txt => {
    String(txt).split(/\s+phir\s+|\s+then\s+/i).forEach(part => {
      const m = part.match(/((?:aws|terraform)\s+[^—←|(]*|apply\s+-f\s+\S+)/);
      if (m) {
        const c = m[1].replace(/\s+/g, ' ').replace(/[.,;:)\]]+$/, '').trim();
        // <placeholder> wale hints template hain, runnable nahi — unhe override se do
        if (c.split(' ').length > 1 && !c.includes('<')) out.push(c);
      }
    });
  };
  (stage.hints || []).forEach(push);
  const g = String(stage.goal || '').replace(/<[^>]+>/g, ' ');
  g.split(/\(\d\)/).forEach(push);
  // Explicit solutions preserve intentional repeated actions such as two EIP allocations.
  return Array.isArray(stage.solution) ? stage.solution.slice() : [...new Set(out)];
}
const OVERRIDES = require('./validate-solutions.js');
let tPass = 0, tFail = [];
for (const { s, S } of terminals) {
  const key = S.replace(/^[a-z]+\//, '').replace(/\(terminal\)$/, '');
  const cmds = OVERRIDES[key] || cmdsFrom(s);
  const arena = mkNode('div');
  let done = false;
  try { AG.renderers.terminal(s, arena, () => { done = true; }); }
  catch (e) { tFail.push(`${S} — renderer threw: ${e.message}`); continue; }
  const term = arena._kids.find(k => k._cls.has('terminal'));
  const input = term && term.querySelector('input');
  const handler = input && (input._l.keydown || [])[0];
  if (!handler) { tFail.push(`${S} — no input handler`); continue; }
  for (const c of cmds) { input.value = c; handler({ key: 'Enter', preventDefault() {} }); }
  if (done) tPass++;
  else tFail.push(`${S} — success() false after ${cmds.length} cmds${cmds.length ? '' : ' (no commands extracted from hints)'}`);
}
tFail.forEach(f => bad(f));
if (!tFail.length) ok(`${tPass}/${terminals.length} missions complete end-to-end`);
else console.log(`   (${tPass}/${terminals.length} passed)`);

/* ================= 4b. VPC STATE REGRESSIONS ================= */
console.log('\n4️⃣b VPC routing / wrong-path checks');
// Run in-process: a restricted host may reject spawnSync while reporting status 0.
try { require('./validate-network.js'); }
catch (e) { bad('VPC regressions: ' + e.message); }
console.log('\n4️⃣c RDS recovery / wrong-path checks');
try { require('./validate-rds.js'); }
catch (e) { bad('RDS regressions: ' + e.message); }
console.log('\n4️⃣d ALB/ASG health / scaling checks');
try { require('./validate-elb.js'); }
catch (e) { bad('ALB/ASG regressions: ' + e.message); }

console.log('\n4️⃣e Three-tier architecture / wrong-path checks');
try { require('./validate-architecture.js'); }
catch (e) { bad('Architecture regressions: ' + e.message); }

console.log('\n4️⃣f Route53 records / health / propagation checks');
try { require('./validate-dns.js'); }
catch (e) { bad('Route53 regressions: ' + e.message); }

console.log('\n4️⃣g CloudFront cache / OAC / concurrency checks');
try { require('./validate-cdn.js'); }
catch (e) { bad('CloudFront regressions: ' + e.message); }

console.log('\n4️⃣h S3 lifecycle / retention / restore checks');
try { require('./validate-s3adv.js'); }
catch (e) { bad('S3 Advanced regressions: ' + e.message); }

console.log('\n4️⃣i EFS targets / identity / throughput checks');
try { require('./validate-efs.js'); }
catch (e) { bad('EFS regressions: ' + e.message); }

console.log('\n4️⃣j Lambda invocation / output / partial-batch checks');
try { require('./validate-lambda.js'); }
catch (e) { bad('Lambda regressions: ' + e.message); }

console.log('\n4️⃣k DynamoDB migration / item / transaction checks');
try { require('./validate-dynamodb.js'); }
catch (e) { bad('DynamoDB regressions: ' + e.message); }

console.log('\n4️⃣l Cache placement / scope / readiness checks');
try { require('./validate-cache.js'); }
catch (e) { bad('Caching regressions: ' + e.message); }

console.log('\n4️⃣m Messaging delivery / retry / ordering checks');
try { require('./validate-messaging.js'); }
catch (e) { bad('Messaging regressions: ' + e.message); }

console.log('\n4️⃣n Event routing / schedule / saga outcome checks');
try { require('./validate-events.js'); }
catch (e) { bad('Events regressions: ' + e.message); }

console.log('\n4️⃣o Security key/access/context/config checks');
try { require('./validate-security.js'); } catch(e) { bad('Security regressions: '+e.stack); }

console.log('\n4️⃣p Mahasale capacity / schedule / evidence checks');
try { require('./validate-capacity.js'); } catch(e) { bad('Capacity regressions: '+e.stack); }

console.log('\n4️⃣q Workload review / audit evidence checks');
try { require('./validate-review.js'); } catch(e) { bad('Review regressions: '+e.stack); }

console.log('\n4️⃣r Organizations path / grant / governance checks');
try { require('./validate-orgs.js'); } catch(e) { bad('Organizations regressions: '+e.stack); }

console.log('\n4️⃣s Disaster recovery readiness / promotion checks');
try { require('./validate-dr.js'); } catch(e) { bad('DR regressions: '+e.stack); }

/* ================= 5. FILL STAGES ================= */
console.log('\n5️⃣  Fill stages');
let fPass = 0, fFail = [];
for (const { s, S } of fills) {
  const arena = mkNode('div');
  let done = null;
  try { AG.renderers.fill(s, arena, st => { done = st; }); }
  catch (e) { fFail.push(`${S} — renderer threw: ${e.message}`); continue; }
  const tpl = arena._kids[0], pool = arena._kids[arena._kids.length - 1];
  s.blanks.forEach((b, bi) => {
    const chip = pool._kids.find(c => c._tok === b.answer && c._parent === pool);
    const slot = tpl.querySelectorAll(`[data-blank="${bi}"]`)[0];
    if (!chip || !slot) return;
    chip.fire('click', { stopPropagation() {} });
    slot.fire('click');
  });
  const unfilled = tpl.querySelectorAll('[data-blank]').filter(x => !x._cls.has('filled'));
  if (done && !unfilled.length) fPass++;
  else fFail.push(`${S} — solved=${!!done} unfilled=${unfilled.length}`);
}
fFail.forEach(f => bad(f));
if (!fFail.length) ok(`${fPass}/${fills.length} fill stages solvable`);

/* ================= 6. BOOT + SCREENS ================= */
console.log('\n6️⃣  Boot + screens');
const sb2 = mkSandbox(true);
if (sb2) {
  ok('app.js boots (renderTopbar + showHome ran)');
  try {
    const A2 = vm.runInContext('AG', sb2);
    const call = (fn, arg) => vm.runInContext(fn, sb2)(arg);
    let n = 0;
    A2.tracks.forEach(t => {
      call('showTrack', t);
      (A2.levelSets[t.id] || []).forEach(l => { call('showIntro', l); n++; });
      call('showCertificate', t);
    });
    call('showDojo');
    call('showDecisionDojo');
    (A2.decisions || []).forEach(t => call('showDecisionTree', t));
    call('showDecisionPractice', null);
    ok(`${A2.tracks.length} track maps · ${n} level intros · certificates · Dojo · Decision Dojo (${(A2.decisions || []).length} trees) render clean`);
  } catch (e) { bad('screen render: ' + e.message.split('\n')[0]); }
}

/* ================= 7. ASSETS & PROGRESSION ================= */
console.log('\n7️⃣  Assets & progression');
const cssTxt = fs.readFileSync(path.join(DIR, 'style.css'), 'utf8');
const usedCls = new Set();
[...rawVis.matchAll(/class="([^"]+)"/g)].forEach(m => m[1].split(/\s+/).forEach(c => c && usedCls.add(c)));
const defCls = new Set([...cssTxt.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const missCls = [...usedCls].filter(c => !defCls.has(c)).sort();
missCls.forEach(c => bad(`visuals.js uses .${c} — style.css mein defined nahi (diagram unstyled render hoga)`));
if (!missCls.length) ok(`${usedCls.size} diagram CSS classes all defined in style.css`);

const RANKS = vm.runInContext('RANKS', sb);
let maxXP = 0;
const sxp = s => {
  const per = AG.XP_PER_ITEM, bon = AG.PERFECT_BONUS;
  if (s.type === 'terminal') return AG.TERMINAL_XP + bon;
  const n = { quiz: 'questions', bins: 'items', match: 'pairs', order: 'steps', fill: 'blanks', hotspot: 'questions' }[s.type];
  if (n) return (s[n] || []).length * per + bon;
  if (s.type === 'incident') return Object.values(s.nodes || {}).filter(x => !x.end).length * per + bon;
  if (s.type === 'dryrun') return Math.max(1, (s.steps || []).filter(x => x.ask).length) * per + bon;
  if (s.type === 'flowlab') return (s.quiz ? 2 : 1) * per + bon;
  if (s.type === 'triage') return (s.questions || []).length * per + bon;
  if (s.type === 'docker') return per + bon;
  return 0;
};
AG.tracks.forEach(t => (AG.levelSets[t.id] || []).forEach(l => {
  (l.stages || []).forEach(s => { maxXP += sxp(s); });
  if (l.interview) { let iv = 0; (l.interview.questions || []).forEach(q => { iv += q.terminal ? AG.TERMINAL_XP : AG.XP_PER_ITEM; }); maxXP += iv + AG.PERFECT_BONUS; }
}));
const topRank = RANKS[RANKS.length - 1];
if (maxXP < topRank.xp) bad(`top rank "${topRank.name}" (${topRank.xp} XP) UNREACHABLE — max ~${maxXP} XP`);
else ok(`${RANKS.length} ranks — top "${topRank.name}" (${topRank.xp}) reachable (~${maxXP} XP available)`);

const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const unreg = DATA.filter(f => !idx.includes(f));
unreg.forEach(f => bad(`${f} index.html mein register nahi — us track ke levels load hi nahi honge`));
if (!unreg.length) ok('all data files registered in index.html');

/* ================= 8. DOCKER LABS (project files) ================= */
const DL = path.join(DIR, 'docker-labs');
if (fs.existsSync(DL)) {
  console.log('\n8️⃣  Docker labs (project files)');
  const DLP = [];
  ['README.md', 'docker-compose.yml', 'start-moto.sh', 'stop-moto.sh', 'env.sh', 'reset.sh'].forEach(f => { if (!fs.existsSync(path.join(DL, f))) DLP.push(`docker-labs/${f} missing`); });
  const projects = fs.readdirSync(DL).filter(d => /^\d\d-/.test(d) && fs.statSync(path.join(DL, d)).isDirectory());
  projects.forEach(p => { if (!fs.existsSync(path.join(DL, p, 'README.md'))) DLP.push(`docker-labs/${p}/README.md missing`); });
  const used = new Set(labStages.filter(x => x.s.type === 'docker').map(x => x.s.project));
  projects.forEach(p => { if (!used.has(p)) DLP.push(`docker-labs/${p} kisi level ke docker stage se linked nahi`); });
  DLP.forEach(p => bad(p));
  if (!DLP.length) ok(`${projects.length} lab projects · shared launcher + compose present · har project ek level se linked`);
}

/* ================= SUMMARY ================= */
console.log('\n' + '═'.repeat(58));
if (FAIL === 0) { console.log('✅ ALL CHECKS PASSED'); process.exit(0); }
console.log(`❌ ${FAIL} problem(s) — dekho upar`); process.exit(1);
