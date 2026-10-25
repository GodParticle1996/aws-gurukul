/* =====================================================================
   AWS Gurukul — 🧭 Decision Dojo ("Kaunsa service KAB?")
   (KubeGurukul ke decisions.js se port, 2026-10-23)

   Production mein asli sawal "SQS kya hai?" nahi hota — "yahan SQS lagaun ya
   SNS ya EventBridge?" hota hai. Har topic ek DECISION TREE hai:
     sawal → jawab → (yeh sawal kyun zaroori hai) → agla sawal … → 🎯 recommendation
   Recommendation card: ✅ kab · ❌ kab nahi · ⚠️ gotchas · 💰 cost shape ·
   📝 exam cue · 📄 Terraform/CLI · 🏭 asli example
   Plus: 🗺️ poora map, ⚔️ X vs Y table, aur 🎯 scenario practice (scored).

   Content (data-decisions.js):
     AG.registerDecisions([ { id, icon, title, short, tldr, levels:[],
       start, nodes: { qid: { q, why?, hint?, options:[{ t, next }] },
                       leafId: { leaf:true, pick, icon, one, why, when:[], avoid:[],
                                 gotchas:[], cost?, exam?, iac?, example?, level? } },
       compare?: { cols:[], rows:[[]] },
       scenarios: [ { s, answer: leafId, explain } ] } ])
   Poori file IIFE mein (games.js ke global `const el` se takraav na ho).
   ===================================================================== */

AG.decisions = AG.decisions || [];
AG.registerDecisions = function (trees) { AG.decisions.push(...trees); };
AG.findDecision = id => AG.decisions.find(t => t.id === id) || null;
/* level ke liye related trees (level intro par "🧭 Kab use karein?" box) */
AG.decisionsForLevel = levelId => AG.decisions.filter(t => (t.levels || []).includes(levelId));

(function () {
  const el = AG.el, shuffle = AG.shuffle, shake = AG.shake, escapeHtml = AG.escapeHtml;

  /* ---------- state: kaunse leaves dekhe, practice ka best score ---------- */
  function dstate(treeId) {
    AG.state.decisions = AG.state.decisions || {};
    return (AG.state.decisions[treeId] = AG.state.decisions[treeId] || { seen: [], solved: [], best: 0 });
  }
  const leavesOf = tree => Object.keys(tree.nodes).filter(k => tree.nodes[k].leaf);
  AG.leavesOf = leavesOf;

  /* start se leaf tak ka (pehla) raasta — practice mein "raasta" dikhane ke liye */
  AG.decisionPath = function (tree, target) {
    const walk = (id, seen) => {
      if (id === target) return [];
      const n = tree.nodes[id];
      if (!n || n.leaf || seen.has(id)) return null;
      seen.add(id);
      for (const o of n.options) {
        const rest = walk(o.next, seen);
        if (rest) return [{ q: n.q, a: o.t }, ...rest];
      }
      return null;
    };
    return walk(tree.start, new Set()) || [];
  };

  /* ---------- related level chips ---------- */
  function levelChip(levelId) {
    const lvl = AG.findLevel(levelId);
    if (!lvl) return null;
    const track = AG.trackOf(lvl);
    const levels = AG.levelsOf(track);
    const i = levels.indexOf(lvl);
    const open = AG.trackUnlocked(track) && (i === 0 || AG.state.completed.includes(lvl.id) || AG.state.completed.includes(levels[i - 1].id));
    const b = el('button', 'dd-chip' + (open ? '' : ' locked'), `${open ? '📚' : '🔒'} ${lvl.icon} ${lvl.title}`);
    b.title = open ? 'Level kholo' : 'Pehle pichle levels complete karo';
    if (open) b.onclick = () => showIntro(lvl);
    return b;
  }
  function chipsRow(levels) {
    const row = el('div', 'dd-chips');
    (levels || []).forEach(id => { const c = levelChip(id); if (c) row.appendChild(c); });
    return row.children.length ? row : null;
  }

  /* ---------- leaf (recommendation) card ---------- */
  function leafCard(tree, id) {
    const n = tree.nodes[id];
    const card = el('div', 'dd-leaf pop');
    const list = (title, cls, items) => items && items.length
      ? `<div class="dd-sec ${cls}"><div class="dd-sec-h">${title}</div><ul>${items.map(x => `<li>${x}</li>`).join('')}</ul></div>` : '';
    card.innerHTML =
      `<div class="dd-leaf-h"><span class="dd-leaf-icon">${n.icon || '🎯'}</span>` +
      `<div><div class="dd-leaf-k">JAWAB</div><div class="dd-leaf-pick">${n.pick}</div></div></div>` +
      `<div class="dd-one">${n.one}</div>` +
      (n.why ? `<div class="dd-why-box">🧠 <b>Kyun:</b> ${n.why}</div>` : '') +
      `<div class="dd-grid">` +
        list('✅ Kab use karo', 'good', n.when) +
        list('❌ Kab NAHI', 'bad', n.avoid) +
      `</div>` +
      list('⚠️ Production gotchas', 'warn', n.gotchas) +
      (n.cost ? `<div class="dd-cost">💰 <b>Bill kaise banta hai:</b> ${n.cost}</div>` : '') +
      (n.exam ? `<div class="dd-exam">📝 <b>SAA-C03 cue:</b> ${n.exam}</div>` : '') +
      (n.iac ? `<div class="dd-sec"><div class="dd-sec-h">📄 Smallest working config</div><pre class="dd-yaml">${escapeHtml(n.iac)}</pre></div>` : '') +
      (n.example ? `<div class="dd-example">🏭 <b>Asli duniya:</b> ${n.example}</div>` : '');
    const chips = chipsRow(n.level ? [n.level] : []);
    if (chips) card.appendChild(chips);
    return card;
  }

  /* ---------- 🗺️ poora map (nested flowchart) ---------- */
  function mapView(tree, path, leafId) {
    const onPath = new Set(path.map(p => p.id));
    if (leafId) onPath.add(leafId);
    const render = (id, depth, seen) => {
      const n = tree.nodes[id];
      if (!n) return '';
      if (n.leaf) return `<div class="dm-leaf${onPath.has(id) ? ' on' : ''}">${n.icon || '🎯'} ${n.pick}</div>`;
      if (seen.has(id) || depth > 8) return `<div class="dm-ref">↪ (upar wala sawal)</div>`;
      const s2 = new Set(seen); s2.add(id);
      return `<div class="dm-q${onPath.has(id) ? ' on' : ''}">❓ ${n.q}</div>` +
        `<div class="dm-kids">${n.options.map(o => {
          const taken = path.some(p => p.id === id && p.next === o.next);
          return `<div class="dm-branch${taken ? ' on' : ''}"><span class="dm-ans">${o.t}</span>${render(o.next, depth + 1, s2)}</div>`;
        }).join('')}</div>`;
    };
    return el('div', 'dd-map', render(tree.start, 0, new Set()));
  }

  /* ============================================================
     SCREEN: 🧭 Decision Dojo — saare trees
     ============================================================ */
  window.showDecisionDojo = function showDecisionDojo() {
    AG.session = null;
    appEl.innerHTML = '';
    window.scrollTo(0, 0);
    const wrap = el('section', 'panel');
    const back = el('button', 'btn ghost small', '← Home');
    back.onclick = showHome;
    wrap.appendChild(back);
    wrap.appendChild(el('div', 'dd-hero', `
      <h2>🧭 Decision Dojo — <span class="glow">kaunsa service KAB?</span></h2>
      <p>AWS mein 200+ services hain. Mushkil "SQS kya hai" nahi — mushkil hai <b>"yahan SQS, SNS ya EventBridge?"</b>.
      Har topic ek decision-tree hai: ek-ek sawal ka jawab do, raasta banta jaayega, aur aakhir mein
      <b>recommendation + kyun + kab NAHI + gotchas + bill ka shape + exam cue + Terraform</b> milega.</p>
      <div class="dd-how"><span>1️⃣ Tree kholo</span><span>2️⃣ Sawalon se raasta banao</span><span>3️⃣ 🎯 Practice: scenario → sahi service</span></div>`));

    const nScen = AG.decisions.reduce((s, t) => s + (t.scenarios || []).length, 0);
    const mixed = el('button', 'btn big gold', `🎲 Mixed practice — ${Math.min(10, nScen)} random scenarios (saare topics se)`);
    mixed.onclick = () => showDecisionPractice(null);
    const row = el('div', 'btnrow');
    row.appendChild(mixed);
    wrap.appendChild(row);

    const grid = el('div', 'dd-gridcards');
    AG.decisions.forEach(tree => {
      const st = dstate(tree.id);
      const total = leavesOf(tree).length;
      const card = el('div', 'dd-card clickable');
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="dd-card-icon">${tree.icon}</div>
        <div class="dd-card-title">${tree.title}</div>
        <div class="dd-card-short">${tree.short || ''}</div>
        <div class="dd-card-meta">🗺️ ${st.seen.length}/${total} jawab dekhe · 🎯 practice best ${st.best}/${(tree.scenarios || []).length}</div>`;
      card.onclick = () => showDecisionTree(tree);
      card.onkeydown = e => { if (e.key === 'Enter') showDecisionTree(tree); };
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    appEl.appendChild(wrap);
  };

  /* ============================================================
     SCREEN: ek tree — interactive walk
     ============================================================ */
  window.showDecisionTree = function showDecisionTree(tree) {
    AG.session = null;
    appEl.innerHTML = '';
    window.scrollTo(0, 0);
    const wrap = el('section', 'panel');
    const top = el('div', 'btnrow');
    const back = el('button', 'btn ghost small', '← Decision Dojo');
    back.onclick = showDecisionDojo;
    top.appendChild(back);
    wrap.appendChild(top);
    wrap.appendChild(el('h2', 'level-h', `${tree.icon} ${tree.title}`));
    if (tree.tldr) wrap.appendChild(el('div', 'dd-tldr', `⚡ <b>Ek line mein:</b> ${tree.tldr}`));
    const chips = chipsRow(tree.levels);
    if (chips) wrap.appendChild(chips);

    const trail = el('div', 'dd-trail');
    const stage = el('div', 'dd-stage');
    const ctrl = el('div', 'btnrow');
    const mapBox = el('div', 'dd-mapbox');
    wrap.append(trail, stage, ctrl, mapBox);

    if (tree.compare) {
      const t = tree.compare;
      wrap.appendChild(el('div', 'dd-compare', `
        <div class="dd-sec-h">⚔️ Ek nazar mein farak</div>
        <div class="dd-table-wrap"><table class="dd-table">
          <tr>${t.cols.map(c => `<th>${c}</th>`).join('')}</tr>
          ${t.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}
        </table></div>
        <div class="dd-scroll-hint">👉 Table ko side mein scroll karo — ${t.cols.length - 1} options hain</div>`));
    }
    const prac = el('button', 'btn big', `🎯 Is topic ki practice (${(tree.scenarios || []).length} scenarios)`);
    prac.onclick = () => showDecisionPractice(tree);
    const pr = el('div', 'btnrow center');
    pr.appendChild(prac);
    wrap.appendChild(pr);
    appEl.appendChild(wrap);

    let path = [];            // [{ id, q, a, next, why }]
    let mapOpen = false;

    function render(curId) {
      trail.innerHTML = '';
      path.forEach((p, i) => {
        const step = el('div', 'dd-step');
        step.innerHTML = `<div class="dd-step-n">${i + 1}</div><div class="dd-step-body">` +
          `<div class="dd-step-q">${p.q}</div><div class="dd-step-a">➜ ${p.a}</div>` +
          (p.why ? `<div class="dd-step-why">💭 ${p.why}</div>` : '') + `</div>`;
        trail.appendChild(step);
      });
      stage.innerHTML = '';
      ctrl.innerHTML = '';
      const n = tree.nodes[curId];
      if (n.leaf) {
        const st = dstate(tree.id);
        if (!st.seen.includes(curId)) { st.seen.push(curId); AG.saveState(); }
        stage.appendChild(leafCard(tree, curId));
      } else {
        const card = el('div', 'dd-q pop');
        card.innerHTML = `<div class="dd-q-k">SAWAL ${path.length + 1}</div><div class="dd-q-text">${n.q}</div>` +
          (n.hint ? `<div class="dd-q-hint">💡 ${n.hint}</div>` : '');
        const opts = el('div', 'dd-opts');
        n.options.forEach(o => {
          const b = el('button', 'dd-opt', o.t);
          b.onclick = () => { path.push({ id: curId, q: n.q, a: o.t, next: o.next, why: n.why }); render(o.next); };
          opts.appendChild(b);
        });
        card.appendChild(opts);
        stage.appendChild(card);
      }
      if (path.length) {
        const undo = el('button', 'btn ghost small', '⏮ Ek sawal peeche');
        undo.onclick = () => { const p = path.pop(); render(p.id); };
        const restart = el('button', 'btn ghost small', '↺ Shuru se');
        restart.onclick = () => { path = []; render(tree.start); };
        ctrl.append(undo, restart);
      }
      const mapBtn = el('button', 'btn ghost small', mapOpen ? '🗺️ Map chhupao' : '🗺️ Poora map dikhao');
      mapBtn.onclick = () => { mapOpen = !mapOpen; render(curId); };
      ctrl.appendChild(mapBtn);
      mapBox.innerHTML = '';
      if (mapOpen) mapBox.appendChild(mapView(tree, path, n.leaf ? curId : null));
      if (path.length) stage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    render(tree.start);
  };

  /* ============================================================
     SCREEN: 🎯 practice — scenario padho, sahi service chuno
     tree = null → mixed (saare trees se 10)
     ============================================================ */
  window.showDecisionPractice = function showDecisionPractice(tree) {
    AG.session = null;
    appEl.innerHTML = '';
    window.scrollTo(0, 0);
    let pool = [];
    (tree ? [tree] : AG.decisions).forEach(t => (t.scenarios || []).forEach((sc, i) => pool.push({ t, sc, key: t.id + '#' + i })));
    pool = shuffle(pool).slice(0, tree ? pool.length : 10);
    let qi = 0, score = 0;

    const wrap = el('section', 'panel');
    const back = el('button', 'btn ghost small', tree ? `← ${tree.icon} ${tree.short || tree.title}` : '← Decision Dojo');
    back.onclick = () => (tree ? showDecisionTree(tree) : showDecisionDojo());
    wrap.appendChild(back);
    wrap.appendChild(el('h2', 'level-h', `🎯 Practice — ${tree ? `${tree.icon} ${tree.short || tree.title}` : 'Mixed (saare topics)'}`));
    wrap.appendChild(el('p', 'instructions', 'Scenario padho → sahi service/approach chuno. Galat hua toh <b>raasta</b> dikhega (kaunse sawal tumhe sahi jawab tak laate) — aur scenario Revision Dojo mein chala jayega.'));
    const arena = el('div', 'arena');
    wrap.appendChild(arena);
    appEl.appendChild(wrap);

    function ask() {
      arena.innerHTML = '';
      if (qi >= pool.length) return finish();
      const { t, sc, key } = pool[qi];
      let mistake = false;
      arena.appendChild(el('div', 'quiz-progress', `Scenario ${qi + 1} / ${pool.length} · ${t.icon} ${t.short || t.title}`));
      arena.appendChild(el('div', 'dd-scenario', `🏭 ${sc.s}`));
      const feedback = el('div', 'feedback');
      const choices = el('div', 'choices');
      // ADHD-friendly: bahut saare options mein aankh bhatakti hai — sahi jawab + max 3 aur
      const others = shuffle(leavesOf(t).filter(lid => lid !== sc.answer)).slice(0, 3);
      shuffle([sc.answer, ...others]).forEach(lid => {
        const leaf = t.nodes[lid];
        const b = el('button', 'choice dd-choice', `${leaf.icon || '🎯'} ${leaf.pick}`);
        b.dataset.leaf = lid;
        b.onclick = () => {
          if (b.disabled) return;
          const right = lid === sc.answer;
          const ans = t.nodes[sc.answer];
          const route = AG.decisionPath(t, sc.answer).map(p => `<li>${p.q} <b>➜ ${p.a}</b></li>`).join('');
          if (right) {
            const st = dstate(t.id);
            if (!mistake) {
              score++;
              if (!st.solved.includes(key)) { st.solved.push(key); AG.addXP(AG.XP_PER_ITEM); }
            }
            b.classList.add('correct');
            choices.querySelectorAll('.choice').forEach(x => { x.disabled = true; });
            feedback.className = 'feedback good';
            feedback.innerHTML = `✅ <b>${ans.pick}</b> — ${sc.explain}` +
              (route ? `<details class="dd-route"><summary>🧭 Decision raasta dekho</summary><ol>${route}</ol></details>` : '');
            const nx = el('button', 'btn dd-next', qi + 1 < pool.length ? 'Agla scenario →' : 'Score dekho 🏁');
            nx.onclick = () => { nx.disabled = true; qi++; ask(); };
            arena.appendChild(nx);
            nx.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            if (!mistake) AG.noteMistake(`🧭 ${sc.s}`, `<b>${ans.pick}</b> — ${sc.explain}`, `🧭 ${t.short || t.title}`);
            mistake = true;
            b.classList.add('wrong');
            b.disabled = true;
            shake(b);
            feedback.className = 'feedback bad';
            feedback.innerHTML = `❌ <b>${leaf.pick}</b> yahan fit nahi. ${leaf.one}<br>` +
              (route ? `<details class="dd-route" open><summary>🧭 Sahi jawab tak ka raasta</summary><ol>${route}</ol></details>` : '');
          }
        };
        choices.appendChild(b);
      });
      arena.append(choices, feedback);
    }

    function finish() {
      if (tree) {
        const st = dstate(tree.id);
        st.best = Math.max(st.best, score);
        AG.saveState();
      }
      AG.touchStreak();
      renderTopbar();
      arena.innerHTML = '';
      const sum = el('div', 'stage-summary pop', `
        <div class="sum-emoji">${score === pool.length ? '🌟' : score >= pool.length * 0.6 ? '✅' : '🧘'}</div>
        <div class="sum-title">${score}/${pool.length} pehli baar mein sahi</div>
        <div class="sum-detail">${score === pool.length ? 'Decision-making on point! 🔥' : 'Galat wale scenarios Revision Dojo mein aa gaye — kal phir milenge.'}</div>`);
      const again = el('button', 'btn', '🔁 Phir se');
      again.onclick = () => showDecisionPractice(tree);
      const home = el('button', 'btn ghost', tree ? '← Tree par wapas' : '← Decision Dojo');
      home.onclick = () => (tree ? showDecisionTree(tree) : showDecisionDojo());
      const row = el('div', 'btnrow center');
      row.append(home, again);
      sum.appendChild(row);
      arena.appendChild(sum);
    }
    if (!pool.length) { arena.appendChild(el('p', 'instructions', 'Is topic mein abhi scenarios nahi hain.')); return; }
    ask();
  };
})();
