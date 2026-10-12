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
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const DIR = __dirname;
const ENGINE = ['core.js', 'data-core.js', 'visuals.js', 'games.js', 'awscli.js'];
const DATA = ['data-beginner.js', 'data-intermediate.js', 'data-advanced.js', 'data-architect.js'];
const ALL = [...ENGINE, ...DATA, 'app.js'];
let FAIL = 0;
const bad = m => { console.log('   ✗ ' + m); FAIL++; };
const ok = m => console.log('   ✓ ' + m);

/* ---------------- mini DOM ---------------- */
function mkNode(tag) {
  const n = {
    tagName: tag, _kids: [], _l: {}, _syn: {}, innerHTML: '', textContent: '',
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
    focus() {}, blur() {}, scrollIntoView() {}, click() { (n._l.click || []).forEach(f => f({ stopPropagation() {}, preventDefault() {} })); },
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
  const r = cp.spawnSync('node', ['--check', path.join(DIR, f)], { encoding: 'utf8' });
  if (r.status !== 0) { bad(`${f}: ${(r.stderr || '').split('\n')[1] || 'syntax error'}`); synOk = false; }
}
if (synOk) ok(`${ALL.length} files parse clean`);
const combined = ALL.map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const tmp = path.join(require('os').tmpdir(), 'awsg-combined-check.js');
fs.writeFileSync(tmp, combined);
const rc = cp.spawnSync('node', ['--check', tmp], { encoding: 'utf8' });
if (rc.status !== 0) bad('combined (cross-file redeclaration): ' + (rc.stderr || '').split('\n')[1]);
else ok('combined load order — no cross-file redeclaration');
fs.unlinkSync(tmp);

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
    default: w(S, `UNKNOWN stage type "${s.type}"`);
  }
}
AG.tracks.forEach(t => (AG.levelSets[t.id] || []).forEach(l => {
  const L = `${t.id}/${l.id}`;
  if (!VISUALS[l.id]) w(L, 'no VISUALS[level.id] — hero diagram missing');
  ['objectives', 'lesson', 'success', 'cards'].forEach(k => { if (!l[k] || !l[k].length) w(L, `no ${k}`); });
  if (!l.badge) w(L, 'no badge');
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
  return [...new Set(out)];
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
    ok(`${A2.tracks.length} track maps · ${n} level intros · certificates · Dojo render clean`);
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

/* ================= SUMMARY ================= */
console.log('\n' + '═'.repeat(58));
if (FAIL === 0) { console.log('✅ ALL CHECKS PASSED'); process.exit(0); }
console.log(`❌ ${FAIL} problem(s) — dekho upar`); process.exit(1);
