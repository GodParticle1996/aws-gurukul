/* =====================================================================
   AWS Gurukul — Game renderers
   bins | order | match | quiz | fill (Terraform/JSON blanks) | hotspot | incident
   (terminal aata hai awscli.js se, interview aata hai app.js se)

   Har renderer: (stage, arena, onDone) → onDone({ firstTry, total })
   Galat jawab → AG.noteMistake(...) → Revision Dojo mein card ban jaata hai.
   ===================================================================== */

AG.renderers = {};
const el = AG.el, shuffle = AG.shuffle, shake = AG.shake, escapeHtml = AG.escapeHtml;

/* ============================================================
   GAME: BINS — cheezon ko sahi category mein daalo
   ============================================================ */
AG.renderers.bins = function renderBins(stage, arena, onDone) {
  let firstTry = 0, placed = 0;
  const wrongOnce = new Set();
  let selected = null;

  const binsRow = el('div', 'bins-row');
  const zones = {};
  stage.bins.forEach(b => {
    const z = el('div', 'bin');
    z.dataset.bin = b.id;
    z.innerHTML = `<div class="bin-label">${b.label}</div><div class="bin-items"></div>`;
    z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', e => {
      e.preventDefault(); z.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const chip = pool.querySelector(`[data-id="${id}"]`);
      if (chip) attempt(chip, b.id, z);
    });
    z.addEventListener('click', () => { if (selected) attempt(selected, b.id, z); });
    zones[b.id] = z;
    binsRow.appendChild(z);
  });

  const feedback = el('div', 'feedback');
  const pool = el('div', 'pool');
  shuffle(stage.items).forEach((item, i) => {
    const chip = el('div', 'chip', item.text);
    chip.draggable = true;
    chip.dataset.id = String(i);
    chip._item = item;
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', chip.dataset.id);
      selectChip(chip);
    });
    chip.addEventListener('click', e => {
      e.stopPropagation();
      // bin mein rakha hua chip dobara select nahi hota — warna wahi item do baar score hota
      if (chip.classList.contains('placed')) return;
      selectChip(selected === chip ? null : chip);
    });
    pool.appendChild(chip);
  });

  function selectChip(chip) {
    pool.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    selected = chip;
    if (chip) chip.classList.add('selected');
  }

  function attempt(chip, binId, zone) {
    if (chip.classList.contains('placed')) return;
    const item = chip._item;
    if (item.bin === binId) {
      if (!wrongOnce.has(item.text)) { firstTry++; AG.addXP(AG.XP_PER_ITEM); }
      chip.classList.remove('selected');
      chip.classList.add('placed');
      chip.draggable = false;
      zone.querySelector('.bin-items').appendChild(chip);
      zone.classList.add('flash-good');
      setTimeout(() => zone.classList.remove('flash-good'), 500);
      feedback.className = 'feedback good';
      feedback.innerHTML = `✅ <b>${item.text}</b> — ${item.explain}`;
      selected = null;
      placed++;
      if (placed === stage.items.length)
        setTimeout(() => onDone({ firstTry, total: stage.items.length }), 400);
    } else {
      wrongOnce.add(item.text);
      const correctBin = stage.bins.find(b => b.id === item.bin);
      AG.noteMistake(`"${item.text}" kis category mein aata hai? (${stage.title})`,
        `<b>${correctBin ? correctBin.label : item.bin}</b> — ${item.explain}`);
      shake(chip); shake(zone);
      feedback.className = 'feedback bad';
      feedback.innerHTML = `❌ <b>${item.text}</b> yahan nahi aata — phir se try karo!`;
    }
  }

  arena.append(binsRow, feedback, pool);
};

/* ============================================================
   GAME: FILL — Terraform/JSON/CloudFormation ke blanks bharo
   ============================================================ */
AG.renderers.fill = function renderFill(stage, arena, onDone) {
  let firstTry = 0, filled = 0;
  const total = stage.blanks.length;
  const wrongOnce = new Set();
  let selected = null;

  const tpl = el('div', 'fill-template');
  stage.template.split(/(\{\d+\})/).forEach(seg => {
    const m = seg.match(/^\{(\d+)\}$/);
    if (m) {
      const idx = +m[1];
      const slot = el('span', 'blank');
      slot.dataset.blank = String(idx);
      slot.tabIndex = 0; slot.setAttribute('role', 'button'); slot.setAttribute('aria-label', 'Blank ' + (idx + 1));
      slot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.click(); } });
      slot.textContent = '＿＿';
      slot.addEventListener('dragover', e => { if (!slot.classList.contains('filled')) { e.preventDefault(); slot.classList.add('over'); } });
      slot.addEventListener('dragleave', () => slot.classList.remove('over'));
      slot.addEventListener('drop', e => {
        e.preventDefault(); slot.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        const chip = pool.querySelector(`[data-id="${id}"]`);
        if (chip) attempt(chip, idx, slot);
      });
      slot.addEventListener('click', () => { if (selected) attempt(selected, idx, slot); });
      tpl.appendChild(slot);
    } else if (seg) {
      tpl.appendChild(document.createTextNode(seg));
    }
  });

  const feedback = el('div', 'feedback');
  const pool = el('div', 'pool');
  shuffle(stage.tokens).forEach((tok, i) => {
    const chip = el('div', 'chip');
    chip.textContent = tok;
    chip.draggable = true;
    chip.dataset.id = String(i);
    chip._tok = tok;
    chip.tabIndex = 0; chip.setAttribute('role', 'button'); chip.setAttribute('aria-label', 'Token ' + tok); chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); } });
    chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', chip.dataset.id); selectChip(chip); });
    chip.addEventListener('click', e => { e.stopPropagation(); selectChip(selected === chip ? null : chip); });
    pool.appendChild(chip);
  });

  function selectChip(chip) {
    pool.querySelectorAll('.chip').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
    selected = chip;
    if (chip) { chip.classList.add('selected'); chip.setAttribute('aria-pressed', 'true'); }
  }

  function attempt(chip, idx, slot) {
    if (slot.classList.contains('filled')) return;
    const blank = stage.blanks[idx];
    if (chip._tok === blank.answer) {
      if (!wrongOnce.has(idx)) { firstTry++; AG.addXP(AG.XP_PER_ITEM); }
      // ek hi blank index template mein kai baar aa sakta hai
      // (e.g. from_port = {3} aur to_port = {3}) — sab ek saath bhar do
      tpl.querySelectorAll(`[data-blank="${idx}"]`).forEach(s => {
        s.textContent = chip._tok;
        s.classList.add('filled'); s.tabIndex = -1; s.setAttribute('aria-label', 'Blank ' + (idx + 1) + ': ' + chip._tok); s.setAttribute('aria-disabled', 'true');
      });
      chip.remove();
      selected = null;
      feedback.className = 'feedback good';
      feedback.innerHTML = `✅ <b>${escapeHtml(blank.answer)}</b> — ${blank.explain}`;
      filled++;
      if (filled === total) setTimeout(() => onDone({ firstTry, total }), 400);
    } else {
      wrongOnce.add(idx);
      AG.noteMistake(`${stage.title}: blank #${idx + 1} mein kya aayega?`,
        `<code>${escapeHtml(blank.answer)}</code> — ${blank.explain}`);
      shake(chip); shake(slot);
      feedback.className = 'feedback bad';
      feedback.innerHTML = `❌ <b>${escapeHtml(chip._tok)}</b> selected blank ke liye correct nahi. ${blank.explain}`;
    }
  }

  arena.append(tpl, feedback, el('p', 'pool-label', 'Token select karo, phir blank. Keyboard: Tab se token/blank par jao, Enter ya Space se select/apply karo.'), pool);
};

/* ============================================================
   GAME: ORDER — "aage kya hota hai?" sequence builder
   ============================================================ */
AG.renderers.order = function renderOrder(stage, arena, onDone) {
  let current = 0, firstTry = 0, mistakeOnCurrent = false;

  const slotsCol = el('div', 'slots');
  stage.steps.forEach((s, i) => {
    const slot = el('div', 'slot' + (i === 0 ? ' active' : ''));
    slot.dataset.idx = String(i);
    slot.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-text">${i === 0 ? 'Sabse pehle kya hota hai?' : ''}</span>`;
    slot.addEventListener('dragover', e => { if (i === current) { e.preventDefault(); slot.classList.add('over'); } });
    slot.addEventListener('dragleave', () => slot.classList.remove('over'));
    slot.addEventListener('drop', e => {
      e.preventDefault(); slot.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const chip = pool.querySelector(`[data-id="${id}"]`);
      if (chip && i === current) attempt(chip);
    });
    slotsCol.appendChild(slot);
  });

  const feedback = el('div', 'feedback');
  const pool = el('div', 'pool');

  shuffle(stage.steps.map((s, i) => ({ ...s, idx: i }))).forEach(step => {
    const chip = el('div', 'chip wide', step.text);
    chip.draggable = true;
    chip.dataset.id = String(step.idx);
    chip._step = step;
    chip.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', chip.dataset.id));
    chip.addEventListener('click', () => attempt(chip));
    pool.appendChild(chip);
  });

  function attempt(chip) {
    const step = chip._step;
    const slot = slotsCol.children[current];
    if (step.idx === current) {
      if (!mistakeOnCurrent) { firstTry++; AG.addXP(AG.XP_PER_ITEM); }
      mistakeOnCurrent = false;
      slot.classList.remove('active');
      slot.classList.add('filled');
      slot.querySelector('.slot-text').innerHTML = `${step.text}<small>${step.explain}</small>`;
      chip.remove();
      feedback.className = 'feedback good';
      feedback.innerHTML = `✅ Step ${current + 1} lock ho gaya!`;
      current++;
      if (current < stage.steps.length) {
        const next = slotsCol.children[current];
        next.classList.add('active');
        next.querySelector('.slot-text').textContent = 'Iske baad kya hota hai?';
      } else {
        setTimeout(() => onDone({ firstTry, total: stage.steps.length }), 400);
      }
    } else {
      if (!mistakeOnCurrent) {
        const right = stage.steps[current];
        AG.noteMistake(`${stage.title}: step ${current + 1} kya hai?`,
          `<b>${right.text}</b> — ${right.explain}`);
      }
      mistakeOnCurrent = true;
      shake(chip); shake(slot);
      feedback.className = 'feedback bad';
      feedback.innerHTML = `❌ Abhi nahi — step ${current + 1} par kuch aur hota hai.`;
    }
  }

  arena.append(slotsCol, feedback, el('p', 'pool-label', '👇 Agla step chuno (ya drag karo):'), pool);
};

/* ============================================================
   GAME: MATCH — jodi milao
   ============================================================ */
AG.renderers.match = function renderMatch(stage, arena, onDone) {
  let firstTry = 0, matched = 0;
  const wrongOnce = new Set();
  let selLeft = null, selRight = null;

  const grid = el('div', 'match-grid');
  const leftCol = el('div', 'match-col');
  const rightCol = el('div', 'match-col');
  grid.append(leftCol, rightCol);
  const feedback = el('div', 'feedback');

  stage.pairs.forEach((p, i) => {
    const card = el('div', 'mcard left', p.left);
    card.dataset.idx = String(i);
    card.onclick = () => pick(card, 'L');
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (card.classList.contains('done')) return;
      const id = e.dataTransfer.getData('text/plain');
      const r = rightCol.querySelector(`[data-idx="${id}"]:not(.done)`);
      if (r) { selLeft = card; selRight = r; check(); }
    });
    leftCol.appendChild(card);
  });

  shuffle(stage.pairs.map((p, i) => ({ ...p, idx: i }))).forEach(p => {
    const card = el('div', 'mcard right', p.right);
    card.dataset.idx = String(p.idx);
    card.draggable = true;
    card.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', card.dataset.idx));
    card.onclick = () => pick(card, 'R');
    rightCol.appendChild(card);
  });

  function pick(card, side) {
    if (card.classList.contains('done')) return;
    if (side === 'L') {
      leftCol.querySelectorAll('.mcard').forEach(c => c.classList.remove('selected'));
      selLeft = card; card.classList.add('selected');
    } else {
      rightCol.querySelectorAll('.mcard').forEach(c => c.classList.remove('selected'));
      selRight = card; card.classList.add('selected');
    }
    if (selLeft && selRight) check();
  }

  function check() {
    const li = selLeft.dataset.idx, ri = selRight.dataset.idx;
    const pair = stage.pairs[li];
    if (li === ri) {
      if (!wrongOnce.has(li)) { firstTry++; AG.addXP(AG.XP_PER_ITEM); }
      [selLeft, selRight].forEach(c => { c.classList.remove('selected'); c.classList.add('done'); });
      feedback.className = 'feedback good';
      feedback.innerHTML = `✅ <b>${pair.left}</b> — ${pair.explain}`;
      matched++;
      if (matched === stage.pairs.length)
        setTimeout(() => onDone({ firstTry, total: stage.pairs.length }), 400);
    } else {
      wrongOnce.add(li);
      AG.noteMistake(`"${pair.left}" ka role kya hai? (${stage.title})`,
        `<b>${pair.right}</b> — ${pair.explain}`);
      shake(selLeft); shake(selRight);
      [selLeft, selRight].forEach(c => c.classList.remove('selected'));
      feedback.className = 'feedback bad';
      feedback.innerHTML = '❌ Yeh jodi nahi bani — koi aur combination try karo.';
    }
    selLeft = selRight = null;
  }

  arena.append(grid, feedback);
};

/* ============================================================
   GAME: QUIZ — MCQ (optional context block ke saath)
   ============================================================ */
AG.renderers.quiz = function renderQuiz(stage, arena, onDone) {
  let qi = 0, firstTry = 0;

  function renderQuestion() {
    arena.innerHTML = '';
    const q = stage.questions[qi];
    let mistake = false;

    arena.appendChild(el('div', 'quiz-progress', `Sawal ${qi + 1} / ${stage.questions.length}`));
    if (q.context) arena.appendChild(el('pre', 'context', escapeHtml(q.context)));
    arena.appendChild(el('div', 'question', q.q));

    const feedback = el('div', 'feedback');
    const choices = el('div', 'choices');

    const order = shuffle(q.choices.map((c, i) => ({ c, i })));
    order.forEach(({ c, i }) => {
      const btn = el('button', 'choice', c);
      btn.onclick = () => {
        if (btn.disabled) return;
        if (i === q.answer) {
          if (!mistake) { firstTry++; AG.addXP(AG.XP_PER_ITEM); }
          btn.classList.add('correct');
          choices.querySelectorAll('.choice').forEach(b => b.disabled = true);
          feedback.className = 'feedback good';
          feedback.innerHTML = `💡 ${q.explain}`;
          const next = el('button', 'btn', qi + 1 < stage.questions.length ? 'Agla sawal →' : 'Ho gaya ✓');
          next.onclick = () => {
            qi++;
            if (qi < stage.questions.length) renderQuestion();
            else onDone({ firstTry, total: stage.questions.length });
          };
          arena.appendChild(next);
          next.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          if (!mistake) AG.noteMistake(q.q, `<b>${q.choices[q.answer]}</b><br>${q.explain}`);
          mistake = true;
          btn.classList.add('wrong');
          btn.disabled = true;
          shake(btn);
          feedback.className = 'feedback bad';
          feedback.innerHTML = '❌ Nahi — ek aur baar socho.';
        }
      };
      choices.appendChild(btn);
    });

    arena.append(choices, feedback);
  }

  renderQuestion();
};

/* ============================================================
   GAME: HOTSPOT — diagram ke sahi component par click karo
   stage: { visual: '<VISUALS key>', questions: [{q, target, explain}] }
   Diagram ke clickable nodes par data-hs="<target>" hona chahiye.
   ============================================================ */
AG.renderers.hotspot = function renderHotspot(stage, arena, onDone) {
  let qi = 0, firstTry = 0, mistake = false, locked = false;
  const v = VISUALS[stage.visual];
  if (!v) { onDone({ firstTry: 0, total: 0 }); return; }

  const wrap = el('div', 'hotspot-wrap');
  const dia = el('div', 'diagram hs-target');
  dia.innerHTML = `<div class="dg-title">📊 ${v.t}</div>${v.html}`;
  const qBox = el('div', 'question');
  const feedback = el('div', 'feedback');
  const prog = el('div', 'quiz-progress');
  wrap.append(prog, dia, qBox, feedback);
  arena.appendChild(wrap);

  function showQ() {
    mistake = false;
    locked = false;
    prog.textContent = `Sawal ${qi + 1} / ${stage.questions.length}`;
    qBox.innerHTML = `🎯 ${stage.questions[qi].q}`;
    dia.querySelectorAll('[data-hs]').forEach(n => n.classList.remove('hs-good', 'hs-bad'));
  }

  dia.addEventListener('click', e => {
    const node = e.target.closest('[data-hs]');
    // sahi click ke baad agla sawal 1.4 s mein aata hai — us beech ka click purane
    // sawal ka text dikhte hue naye sawal par judge hota tha
    if (!node || locked || qi >= stage.questions.length) return;
    const q = stage.questions[qi];
    if (node.dataset.hs === q.target) {
      if (!mistake) { firstTry++; AG.addXP(AG.XP_PER_ITEM); }
      locked = true;
      node.classList.add('hs-good');
      feedback.className = 'feedback good';
      feedback.innerHTML = `✅ ${q.explain}`;
      qi++;
      if (qi < stage.questions.length) setTimeout(showQ, 1400);
      else setTimeout(() => onDone({ firstTry, total: stage.questions.length }), 900);
    } else {
      if (!mistake) AG.noteMistake(q.q, q.explain);
      mistake = true;
      node.classList.add('hs-bad');
      shake(node);
      feedback.className = 'feedback bad';
      feedback.innerHTML = '❌ Galat component — dhyaan se dekho, kaun kya karta hai.';
      setTimeout(() => node.classList.remove('hs-bad'), 700);
    }
  });

  showQ();
};

/* ============================================================
   GAME: INCIDENT — 3 AM pager decision tree
   stage: { pager, start, nodes: { id: { text, sitrep?, choices: [
            { t, good, next?, explain } ] } | { end:true, text, summary } } }
   ============================================================ */
AG.renderers.incident = function renderIncident(stage, arena, onDone) {
  let firstTry = 0, total = 0, mistakeHere = false;
  const trail = [];

  const pager = el('div', 'pager',
    `<div class="pager-head">🚨 PAGERDUTY — 3:07 AM</div>${stage.pager}`);
  const log = el('div', 'inc-log');
  const nodeBox = el('div', 'inc-node');
  arena.append(pager, log, nodeBox);

  function showNode(id) {
    const n = stage.nodes[id];
    mistakeHere = false;
    nodeBox.innerHTML = '';

    if (n.end) {
      const done = el('div', 'stage-summary pop');
      done.innerHTML = `
        <div class="sum-emoji">🧯</div>
        <div class="sum-title">${n.text}</div>
        <div class="sum-detail" style="text-align:left;line-height:1.6;margin-top:10px">${n.summary}</div>`;
      nodeBox.appendChild(done);
      setTimeout(() => onDone({ firstTry, total }), 600);
      return;
    }

    total++;
    if (n.sitrep) nodeBox.appendChild(el('div', 'inc-sitrep', n.sitrep));
    nodeBox.appendChild(el('div', 'inc-text', n.text));
    const feedback = el('div', 'feedback');
    const choices = el('div', 'choices');

    shuffle(n.choices.map((c, i) => ({ ...c, i }))).forEach(c => {
      const btn = el('button', 'choice', c.t);
      btn.onclick = () => {
        if (btn.disabled) return;
        if (c.good) {
          if (!mistakeHere) { firstTry++; AG.addXP(AG.XP_PER_ITEM); }
          btn.classList.add('correct');
          choices.querySelectorAll('.choice').forEach(b => b.disabled = true);
          feedback.className = 'feedback good';
          feedback.innerHTML = `💡 ${c.explain}`;
          trail.push(c.t);
          log.innerHTML = trail.map(t => `<div class="ok">✔ ${t}</div>`).join('');
          const next = el('button', 'btn', stage.nodes[c.next] && stage.nodes[c.next].end ? 'Incident band karo 🧯' : 'Aage badho →');
          next.onclick = () => showNode(c.next);
          nodeBox.appendChild(next);
          next.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          if (!mistakeHere) AG.noteMistake(`Incident: ${n.text}`, c.explain);
          mistakeHere = true;
          btn.classList.add('wrong');
          btn.disabled = true;
          shake(btn);
          feedback.className = 'feedback bad';
          feedback.innerHTML = `❌ ${c.explain}`;
        }
      };
      choices.appendChild(btn);
    });

    nodeBox.append(choices, feedback);
    nodeBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  showNode(stage.start);
};
