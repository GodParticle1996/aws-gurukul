/* =====================================================================
   AWS Gurukul — Core: state, XP, streak, spaced repetition, registry
   Loaded FIRST. Everything lives under the global `AG` namespace so
   content files (data-*.js) can self-register levels & cards.
   (Ported from kubegurukul/core.js — AWS Solutions Architect edition)
   ===================================================================== */

/* kuch purane browsers/webviews mein scrollIntoView nahi hota — app na toote */
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView)
  Element.prototype.scrollIntoView = function () {};

const AG = {
  STORE_KEY: 'awsgurukul-v1',
  XP_PER_ITEM: 10,
  PERFECT_BONUS: 20,
  TERMINAL_XP: 30,       // base XP for completing an aws CLI / terraform mission
  HINT_COST: 5,          // XP shaved off a terminal mission per hint
  CARD_XP: 5,            // XP per due flashcard reviewed
  POP_XP: 5,             // bonus XP per correct pop-quiz answer
  SRS_INTERVALS: [1, 3, 7, 16, 35],   // days — SM-2-lite boxes

  levelSets: {},         // trackId -> [level, ...]  (filled by data-*.js)
  tracks: [],            // filled by data-core.js
  state: null,
  session: null,
};

/* ---------------- level registry (extensibility hook) ----------------
   A data file calls:  AG.registerLevels('beginner', [ {...}, {...} ])
   Multiple calls append — so you can add ONE new level from ANY file. */
AG.registerLevels = function (trackId, levels) {
  if (!AG.levelSets[trackId]) AG.levelSets[trackId] = [];
  AG.levelSets[trackId].push(...levels);
};

/* ---------------- persistence ---------------- */
AG.defaultState = function () {
  return {
    xp: 0,
    completed: [],        // level ids
    stars: {},            // levelId -> 1..3
    dojo: {},             // cardId -> { box, due (ms), front, back, tag }
    streak: { last: null, count: 0, best: 0 },
    soch: {},             // case id -> best number of first-try answers
    levelStarts: 0,       // for pop-quiz cadence
  };
};

// Purane save mein ek kharab field ho toh baaki progress bacha lo.
AG.readProgress = function (saved) {
  const state = AG.defaultState();
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  if (!record(saved)) return state;
  state.xp = count(saved.xp);
  state.levelStarts = count(saved.levelStarts);
  if (Array.isArray(saved.completed))
    state.completed = [...new Set(saved.completed.filter(id => typeof id === 'string' && id))];
  if (record(saved.stars))
    state.stars = Object.fromEntries(Object.entries(saved.stars).filter(([, stars]) => count(stars) === stars && stars <= 3));
  if (record(saved.soch)) {
    state.soch = Object.fromEntries(Object.entries(saved.soch).filter(([, score]) =>
      Number.isInteger(score) && score >= 0 && score <= 3));
  }
  if (record(saved.streak)) {
    const { last, best } = saved.streak;
    state.streak.count = count(saved.streak.count);
    state.streak.best = Math.max(count(best), state.streak.count);
    state.streak.last = typeof last === 'string' ? last : null;
  }
  if (record(saved.dojo)) {
    state.dojo = Object.fromEntries(Object.entries(saved.dojo).filter(([, card]) =>
      record(card) && typeof card.front === 'string' && typeof card.back === 'string' &&
      Number.isFinite(card.due) && Number.isInteger(card.box) && card.box >= 0 && card.box < AG.SRS_INTERVALS.length));
  }
  if (record(saved.decisions)) {
    state.decisions = Object.fromEntries(Object.entries(saved.decisions).filter(([, progress]) =>
      record(progress) && Array.isArray(progress.seen) && Array.isArray(progress.solved)).map(([id, progress]) =>
        [id, { seen: progress.seen, solved: progress.solved, best: count(progress.best) }]));
  }
  return state;
};
AG.loadState = function () {
  try { return AG.readProgress(JSON.parse(localStorage.getItem(AG.STORE_KEY))); }
  catch (e) { return AG.defaultState(); }
};
AG.saveState = function () {
  // private window / storage full / blocked site data mein setItem throw karta hai —
  // progress save na ho toh bhi app chalti rahe
  try { localStorage.setItem(AG.STORE_KEY, JSON.stringify(AG.state)); }
  catch (e) { if (!AG._saveWarned) { AG._saveWarned = true; console.warn('progress save nahi hua:', e.message); } }
};
AG.state = AG.loadState();

/* ---------------- DOM helpers ---------------- */
AG.el = function (tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
AG.shuffle = function (arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
AG.shake = function (node) {
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
};
AG.escapeHtml = function (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

/* ---------------- XP & ranks ---------------- */
AG.currentRank = function () {
  let r = RANKS[0];
  for (const rank of RANKS) if (AG.state.xp >= rank.xp) r = rank;
  return r;
};
AG.nextRank = function () { return RANKS.find(r => r.xp > AG.state.xp) || null; };
AG.addXP = function (n) {
  if (AG.session && AG.session.replay) return;
  if (n <= 0) return;
  AG.state.xp += n;
  AG.touchStreak();
  AG.saveState();
  if (typeof renderTopbar === 'function') renderTopbar();
  AG.floatXP(n);
};
AG.floatXP = function (n) {
  const bar = document.getElementById('topbar');
  const f = AG.el('div', 'xp-float', `+${n} XP`);
  bar.appendChild(f);
  setTimeout(() => f.remove(), 1200);
};

/* ---------------- daily streak ---------------- */
AG.todayStr = function () {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
AG.touchStreak = function () {
  const s = AG.state.streak;
  const today = AG.todayStr();
  if (s.last === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  s.count = (s.last === yesterday) ? s.count + 1 : 1;
  s.best = Math.max(s.best, s.count);
  s.last = today;
  AG.saveState();
};
AG.streakAlive = function () {
  const s = AG.state.streak;
  if (!s.last) return false;
  const today = AG.todayStr();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  return s.last === today || s.last === yesterday;
};

/* ---------------- Revision Dojo: SM-2-lite spaced repetition ----------
   Card = { box, due, front, back, tag }.  box indexes SRS_INTERVALS.
   - level complete  -> level.cards enter the deck (due tomorrow)
   - wrong answer    -> auto "mistake card" (due tomorrow, box 0)
   - review correct  -> box+1 (capped), due = now + interval[box]
   - review wrong    -> box = 0, due tomorrow                      */
AG.DAY = 24 * 60 * 60 * 1000;

AG.addCard = function (id, front, back, tag) {
  if (AG.state.dojo[id]) return; // already in the deck
  AG.state.dojo[id] = { box: 0, due: Date.now() + AG.DAY, front, back, tag: tag || '' };
  AG.saveState();
};

/* called by game renderers on a wrong answer — turns the mistake into a card */
AG.noteMistake = function (front, back, tag) {
  if (AG.session && AG.session.replay) return;
  if (!front || !back) return;
  // stable id from the front text so the same mistake never duplicates
  let h = 0;
  for (let i = 0; i < front.length; i++) h = ((h << 5) - h + front.charCodeAt(i)) | 0;
  AG.addCard('mistake-' + Math.abs(h), front, back, tag || '🙈 Galti se seekho');
};

AG.enrollLevelCards = function (level) {
  (level.cards || []).forEach((c, i) =>
    AG.addCard(`${level.id}-c${i}`, c.front, c.back, `${level.icon} ${level.title}`));
};

AG.dueCards = function () {
  const now = Date.now();
  return Object.entries(AG.state.dojo)
    .filter(([, c]) => c.due <= now)
    .map(([id, c]) => ({ id, ...c }));
};

AG.reviewCard = function (id, remembered) {
  const c = AG.state.dojo[id];
  if (!c) return;
  if (remembered) {
    c.box = Math.min(c.box + 1, AG.SRS_INTERVALS.length - 1);
    c.due = Date.now() + AG.SRS_INTERVALS[c.box] * AG.DAY;
  } else {
    c.box = 0;
    c.due = Date.now() + AG.DAY;
  }
  AG.saveState();
};

/* ---------------- pop-quiz question harvesting ----------------
   Pulls MCQs from already-completed levels (quiz stages + interview). */
AG.harvestQuestions = function () {
  const qs = [];
  AG.tracks.forEach(t => (AG.levelSets[t.id] || []).forEach(lvl => {
    if (!AG.state.completed.includes(lvl.id)) return;
    (lvl.stages || []).forEach(st => {
      if (st.type === 'quiz') (st.questions || []).forEach(q => qs.push({ ...q, from: lvl }));
    });
    if (lvl.interview) (lvl.interview.questions || []).forEach(q => {
      if (q.choices) qs.push({ ...q, from: lvl });
    });
  }));
  return qs;
};

/* ---------------- track helpers ---------------- */
AG.trackOf = function (level) {
  return AG.tracks.find(t => (AG.levelSets[t.id] || []).includes(level));
};
AG.levelsOf = function (track) { return AG.levelSets[track.id] || []; };
AG.findLevel = function (id) {
  for (const t of AG.tracks) { const l = (AG.levelSets[t.id] || []).find(x => x.id === id); if (l) return l; }
  return null;
};
AG.trackProgress = function (track) {
  const levels = AG.levelsOf(track);
  const done = levels.filter(l => AG.state.completed.includes(l.id)).length;
  return { done, total: levels.length, complete: done === levels.length && levels.length > 0 };
};
AG.trackUnlocked = function (track) {
  const idx = AG.tracks.indexOf(track);
  if (idx <= 0) return true;
  return AG.trackProgress(AG.tracks[idx - 1]).complete;
};
