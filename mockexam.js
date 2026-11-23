/* SAA-C03 practice. Weighting applies to the 50 scored questions. */
AG.mock = (() => {
  const domains = [
    { id: 'secure', label: 'Secure', count: 15, extra: 4 },
    { id: 'resilient', label: 'Resilient', count: 13, extra: 4 },
    { id: 'high-performing', label: 'High-performing', count: 12, extra: 4 },
    { id: 'cost-optimized', label: 'Cost-optimized', count: 10, extra: 3 },
  ];
  const duration = 130 * 60 * 1000;
  const multi = [
    { level: 'iam', domain: 'secure', q: 'EC2 par app S3 se photos padhti hai. Long-term key hataani hai aur access kam rakhna hai. Kaunse do kaam karo?',
      choices: ['App ko instance role se credentials lene do', 'Private app ki access key image mein pack karo', 'Role ko photos ke prefix par GetObject do', 'Bucket mein sabhi IAM users ko read do', 'App ki key ko launch template mein rakho'], answer: [0, 2],
      explain: 'Instance role se app ko temporary credentials milte hain. GetObject ko photo objects ke ARN tak rakhne se role doosre folders nahi padh sakti.' },
    { level: 'sqssns', domain: 'resilient', q: 'Standard SQS queue se order milta hai. Worker crash bhi kare toh order ka charge ek baar lage. Kaunse do kaam chahiye?',
      choices: ['Har receive par naya payment ID banao', 'Payment ko wahi order key dekar retry karo', 'Payment se pehle message delete karo', 'Charge pakka hone par message delete karo', 'Pehle receive par queue ko purge karo'], answer: [1, 3],
      explain: 'SQS message dobara de sakta hai. Payment service ko usi key par purana result dena chahiye. Charge pakka hone ke baad hi worker receipt delete kare.' },
    { level: 'analytics', domain: 'high-performing', q: 'Athena mein roz ek date ki sales aur sirf do columns padhte ho. Kaunse do badlaav scan ko chhota karenge?',
      choices: ['Har query mein saare columns padho', 'Har din ka data ek gzip file mein jodo', 'Date se partition karo aur date filter do', 'Poori table ko har din dobara scan karo', 'Sales files ko Parquet mein rakho'], answer: [2, 4],
      explain: 'Date par partition filter doosre din hata deta hai. Parquet mein Athena zaroori columns padh sakta hai. Dono milkar kam bytes scan karte hain.' },
    { level: 'costdec', domain: 'cost-optimized', q: 'App ke do private subnets same Region ke S3 tak NAT se jaate hain. S3 ka NAT processing bill ghataana hai. Kaunse do kaam karo?',
      choices: ['S3 ke liye gateway endpoint banao', 'Dono subnets ko public IP de do', 'Bucket ko doosre AWS Region mein rakho', 'NAT ko har ghante restart karo', 'Dono app route tables endpoint se jodo'], answer: [0, 4],
      explain: 'Gateway endpoint par alag endpoint charge nahi hai. App ki dono route tables judne par matching S3 traffic NAT ke bina jaata hai. Baaki traffic ka route alag rehta hai.' },
  ];
  function domainOf(q) {
    return ({ cost: 'cost-optimized', performance: 'high-performing' })[q.domain] || q.domain;
  }
  let catalog;
  function bank() {
    if (catalog) return catalog;
    catalog = new Map();
    // A content edit cannot silently change the right answer in an old attempt.
    const pool = AG.harvestQuestions(true).concat(multi.map(q => ({ ...q, from: AG.findLevel(q.level) })));
    for (const q of pool) {
      let hash = 2166136261;
      for (const ch of JSON.stringify([q.q, q.choices, q.answer])) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
      const id = q.from.id + '-' + (hash >>> 0).toString(36);
      if (catalog.has(id)) throw Error('Duplicate mock question: ' + id);
      catalog.set(id, { ...q, id, domain: domainOf(q) });
    }
    return catalog;
  }
  function create(timed, now = Date.now()) {
    const rows = [];
    for (const d of domains) {
      const pool = AG.shuffle([...bank().values()].filter(q => q.domain === d.id));
      // Include a choose-two in each domain and sample across different levels first.
      const chosen = [pool.find(q => Array.isArray(q.answer))];
      const seen = new Set([chosen[0].from.id]);
      for (const q of pool) if (!seen.has(q.from.id)) { chosen.push(q); seen.add(q.from.id); }
      for (const q of pool) if (!chosen.includes(q)) chosen.push(q);
      AG.shuffle(chosen.slice(0, d.count + d.extra)).forEach((q, i) => {
        rows.push({ id: q.id, domain: d.id, scored: i < d.count, picks: [],
          order: AG.shuffle(q.choices.map((_, idx) => idx)) });
      });
    }
    const questions = AG.shuffle(rows);
    // Keep the right option spread across the four positions in each form.
    const spots = AG.shuffle(questions.filter(r => !Array.isArray(bank().get(r.id).answer)).map((_, i) => i % 4));
    for (const row of questions) {
      const q = bank().get(row.id);
      if (Array.isArray(q.answer)) continue;
      row.order.splice(row.order.indexOf(q.answer), 1);
      row.order.splice(spots.pop(), 0, q.answer);
    }
    return { questions, index: 0, started: now, deadline: timed ? now + duration : null, remaining: null, ended: null };
  }
  function validForm(form, finished) {
    const nat = n => Number.isSafeInteger(n) && n >= 0;
    if (!form || !Array.isArray(form.questions) || form.questions.length !== 65 || !nat(form.index) || form.index >= 65 ||
        !nat(form.started) || (finished ? !nat(form.ended) : form.ended !== null) ||
        !(form.deadline === null || nat(form.deadline)) || !(form.remaining === null || (nat(form.remaining) && form.remaining <= duration)) ||
        (form.deadline !== null && form.remaining !== null)) return false;
    const seen = new Set();
    for (const r of form.questions) {
      if (!r || typeof r.id !== 'string' || seen.has(r.id) || !domains.some(d => d.id === r.domain) || typeof r.scored !== 'boolean' ||
          !Array.isArray(r.order) || !Array.isArray(r.picks) || r.order.length < 4 || r.order.length > 12 ||
          new Set(r.order).size !== r.order.length || !r.order.every(i => nat(i) && i < r.order.length) ||
          new Set(r.picks).size !== r.picks.length || !r.picks.every(i => r.order.includes(i))) return false;
      const q = bank().get(r.id);
      if ((!finished && !q) || (finished && typeof r.right !== 'boolean') ||
          (q && (q.domain !== r.domain || q.choices.length !== r.order.length || r.picks.length > AG.answerIndices(q).length))) return false;
      seen.add(r.id);
    }
    return domains.every(d => form.questions.filter(r => r.domain === d.id && r.scored).length === d.count &&
      form.questions.filter(r => r.domain === d.id && !r.scored).length === d.extra);
  }
  function valid(data) {
    return !!data && (data.active === null || validForm(data.active, false)) &&
      Array.isArray(data.history) && data.history.every(f => validForm(f, true));
  }
  function finish(now = Date.now()) {
    const m = AG.state.mock, f = m.active;
    if (!f) return;
    f.ended = now;
    for (const row of f.questions) {
      const q = bank().get(row.id);
      row.right = AG.answerMatches(q, row.picks);
      if (!row.right) AG.noteMistake(q.q, AG.answerText(q) + '<br>' + q.explain, q.from.title, false);
    }
    m.history.unshift(f); m.active = null; AG.saveState();
    return f;
  }
  function expired() {
    const f = AG.state.mock.active;
    return f && f.deadline !== null && Date.now() >= f.deadline;
  }
  function score(f, domain) {
    const rows = f.questions.filter(r => r.scored && (!domain || r.domain === domain));
    return rows.filter(r => r.right).length + ' / ' + rows.length;
  }
  const button = (label, fn, cls = 'ghost') => {
    const b = AG.el('button', 'btn small ' + cls, label); b.onclick = fn; return b;
  };
  const section = title => {
    const p = AG.el('section', 'panel mock-panel');
    p.appendChild(AG.el('h2', '', title)); return p;
  };
  function readiness(f) {
    const box = AG.el('div', 'mock-domains');
    for (const d of domains) box.appendChild(AG.el('div', '', '<b>' + d.label + '</b><br>' + (f ? score(f, d.id) : 'Abhi score nahi hai')));
    return box;
  }
  function home() {
    if (expired()) finish();
    const p = AG.el('section', 'panel mock-home'), f = AG.state.mock.history[0];
    p.append(AG.el('h2', '', 'SAA mock exam'), AG.el('p', '', f ? 'Pichhle mock mein har topic ka score' : '65 sawaal · Poora syllabus · Timer apni marzi se'), readiness(f),
      button(AG.state.mock.active ? 'Adhoora mock kholo' : 'Mock exam kholo', () => show(), ''));
    return p;
  }
  function show(review) {
    AG.session = null;
    AG.nav.set('mock');
    if (expired()) review = finish();
    appEl.innerHTML = '';
    const p = section('SAA-C03 mock exam'); appEl.appendChild(p);
    p.appendChild(button('← Home', () => showHome()));
    const m = AG.state.mock;
    if (review) { showReview(p, review); return; }
    if (m.active) { play(p, m.active); return; }
    p.appendChild(AG.el('p', '', '65 sawaal poore syllabus se aayenge. 50 score mein judte hain. Baaki 15 practice ke liye hain. Sahi jawab submit ke baad khulenge.'));
    const start = timed => { m.active = create(timed); AG.saveState(); show(); };
    const actions = AG.el('div', 'btnrow');
    actions.append(button('130 minute ka mock', () => start(true), ''), button('Bina timer ke', () => start(false)));
    p.appendChild(actions);
    if (m.history.length) p.appendChild(AG.el('h3', '', 'Pichhle attempts'));
    for (const [i, f] of m.history.entries()) p.appendChild(button('Attempt ' + (m.history.length - i) + ' · ' +
      new Date(f.ended).toLocaleDateString() + ' · ' + score(f), () => show(f)));
  }
  function play(p, f) {
    function refresh() { AG.saveState(); show(); }
    if (f.remaining !== null) {
      p.append(AG.el('p', '', 'Timer ruka hai. Sawaal waapas kholne par timer chalega.'), button('Timer phir chalao', () => {
        f.deadline = Date.now() + f.remaining; f.remaining = null; refresh();
      }, '')); return;
    }
    const timer = AG.el('span', 'mock-clock');
    if (f.deadline !== null) {
      const tick = () => {
        if (!timer.isConnected || AG.state.mock.active !== f) return;
        if (expired()) { show(finish()); return; }
        const sec = Math.ceil((f.deadline - Date.now()) / 1000);
        timer.textContent = Math.floor(sec / 60) + ' min ' + (sec % 60) + ' sec';
        setTimeout(tick, 500);
      };
      p.append(timer, button('Timer roko', () => {
        if (expired()) { show(finish()); return; }
        f.remaining = Math.max(0, f.deadline - Date.now()); f.deadline = null; refresh();
      })); tick();
    }
    const row = f.questions[f.index], q = bank().get(row.id);
    p.appendChild(AG.el('p', 'quiz-progress', 'Sawaal ' + (f.index + 1) + ' / 65'));
    if (q.context) p.appendChild(AG.el('pre', 'context', AG.escapeHtml(q.context)));
    p.appendChild(AG.el('h3', 'question', q.q));
    const n = AG.answerIndices(q).length;
    p.appendChild(AG.el('p', '', n > 1 ? n + ' jawaab chuno (Choose ' + (n === 2 ? 'two' : n) + ')' : 'Ek jawaab chuno'));
    const choices = AG.el('div', 'choices');
    for (const i of row.order) {
      const b = button(q.choices[i], () => {
        if (expired()) { show(finish()); return; }
        if (row.picks.includes(i)) row.picks = row.picks.filter(x => x !== i);
        else if (n === 1) row.picks = [i];
        else if (row.picks.length < n) row.picks.push(i);
        AG.saveState(); updateChoices();
      }, 'ghost mock-choice');
      b.dataset.i = String(i); choices.appendChild(b);
    }
    function updateChoices() {
      for (const b of choices.querySelectorAll('.mock-choice')) {
        const selected = row.picks.includes(Number(b.dataset.i));
        b.setAttribute('aria-pressed', String(selected));
        b.disabled = n > 1 && !selected && row.picks.length >= n;
      }
    }
    updateChoices(); p.appendChild(choices);
    const nav = AG.el('div', 'btnrow');
    const prev = button('← Pichhla', () => { f.index--; refresh(); }); prev.disabled = f.index === 0;
    const next = button('Agla →', () => { f.index++; refresh(); }, ''); next.disabled = f.index === 64;
    const confirm = AG.el('div', 'mock-confirm');
    const submit = button('Mock jama karo', () => {
      const complete = f.questions.filter(r => r.picks.length === AG.answerIndices(bank().get(r.id)).length).length;
      confirm.innerHTML = '';
      confirm.append(AG.el('p', '', (65 - complete) + ' sawaalon ka poora jawab baaki hai. Ab score nikaalein?'),
        button('Haan, submit karo', () => show(finish()), ''), button('Waapas sawaal par', () => { confirm.innerHTML = ''; }));
    });
    nav.append(prev, next, submit); p.append(nav, confirm);
  }
  function showReview(p, f) {
    p.append(AG.el('h3', '', 'Practice score · ' + score(f)), AG.el('p', '', 'Score raw sahi jawaabon ka hai. AWS apne exam ka scaled score alag nikaalta hai.'), readiness(f));
    const weak = new Map();
    for (const row of f.questions) {
      const q = bank().get(row.id); if (q && !row.right) weak.set(q.from, (weak.get(q.from) || 0) + 1);
    }
    if (weak.size) p.appendChild(AG.el('h3', '', 'Kis topic ko phir padhein?'));
    for (const [l, missed] of [...weak].sort((a,b) => b[1] - a[1])) {
      p.appendChild(button(l.title + ' · ' + missed + ' chhoote', () => showIntro(l, true)));
    }
    p.appendChild(AG.el('h3', '', 'Har sawaal ka jawab'));
    for (const [i, row] of f.questions.entries()) {
      const q = bank().get(row.id), box = AG.el('details', 'mock-review');
      box.appendChild(AG.el('summary', '', (i + 1) + '. ' + (row.right ? 'Sahi' : 'Chhoota') + ' · ' +
        (q ? q.q : 'Sawaal purane syllabus ka tha') + (row.scored ? '' : ' · practice')));
      if (q) box.append(AG.el('p', '', 'Tumhara jawab · ' + (row.picks.map(j => q.choices[j]).join(' + ') || 'Khaali')),
        AG.el('p', '', '<b>Sahi jawab</b> · ' + AG.answerText(q)), AG.el('p', '', q.explain));
      p.appendChild(box);
    }
    p.appendChild(button('Saare attempts dekho', () => show()));
  }
  return { domains, multi, bank, domainOf, create, valid, finish, home, show, duration };
})();
