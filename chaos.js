/* =====================================================================
   AWS Gurukul — 🎲 Chaos round   (stage type: 'chaos')
   Kal raat ek change mein EK config galat badli. Deck ke 5–8 cards mein se ek random chhupi galti
   AWS account (simulator) mein hai. Learner: probe chalao → lakshan dekho → kaaran dhoondho →
   EK badlaav se theek karo → pakka karo → aakhir mein batao "kya toota tha?".
   Dobara khelo toh nayi galti (pichhle 2 cards nahi aate).
   (System Gurukul ke chaos.js ka port, 2026-11-26. Terminal = awscli.js ka asli simulator.)

   Jodna (data-chaos-<level>.js, IIFE ke andar, level file ke BAAD load ho):
   AG.chaos.addDeck({
     id: 'elbasg', title: 'ALB health deck',
     account: { ... },                    // SWASTH base account (terminal mission jaisa) — har card isi par ek badlaav
     files?: { 'x.json': { content } },   // runbook.md engine khud jodta hai (deck.runbook se)
     responses?: [ { re, out(sim, m), mutate? } ],   // probes jo simulator mein nahi (jaise curl)
     reconcile?: (account, sim) => {},    // har command ke baad derived haalat (zaroorat ho toh)
     alert: 'HTML — sab cards ke liye EK jaisa shuruaati alert (galti ka naam nahi)',
     runbook: 'saada text — probes + niyam', placeholder?: 'input ka placeholder',
     cards: [ {
       id: 'hc-path', title: 'Health check ka path badal gaya',     // "kya toota tha?" ka option
       break: account => { ... },                                     // base par EK config badlaav
       fixed: (account, sim) => bool,                                 // galti theek hui?
       verify: /regex/, verifyText: 'targets dobara dekho',          // fix ke BAAD ka probe command
       hints: ['dekho', 'socho', 'lagbhag hal'], solution: ['poore commands'],
       why: 'HTML — kya toota, kaise pehchaana, kyun yeh fix',
     } ],
   })
   stage: { type: 'chaos', id: 'chaos-elbasg', deck: 'elbasg', title, intro? }
   AG.chaos.mission(deckId, cardId) → terminal stage (validator har card ko isi se chalata hai).
   Buttons ki classes (validator): cx-opt (data-id), cx-again, cx-next.
   ===================================================================== */
(function () {
  const DECKS = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const addDeck = d => { DECKS[d.id] = d; return d; };
  const deck = id => DECKS[id];
  const ids = () => Object.keys(DECKS);
  // state badalne wale commands (report ke "kitne badlaav" ke liye)
  const WRITE = /^aws \S+ (create|put|update|modify|authorize|revoke|delete|set|attach|detach|enable|disable|register|deregister|start|stop|terminate|reboot|associate|disassociate|replace|change|add|remove|tag|untag|restore|promote|reset|purge|send|publish|subscribe|unsubscribe)-|^apply -f\b|^terraform apply\b/;
  const writes = cmds => (cmds || []).filter(c => WRITE.test(c)).length;

  /* pichhle 2 cards chhod kar random; AG.state.practice.seen['chaos:<deck>'] */
  function pick(d) {
    const p = AG.drill.practice(), key = 'chaos:' + d.id, seen = p.seen[key] || [];
    const fresh = d.cards.filter(c => !seen.slice(-2).includes(c.id));
    const pool = fresh.length ? fresh : d.cards;
    const c = pool[Math.floor(Math.random() * pool.length)];
    p.seen[key] = seen.concat(c.id).slice(-4);
    AG.saveState();
    return c;
  }

  function mission(deckId, cardId) {
    const d = deck(deckId);
    if (!d) throw new Error('chaos: deck "' + deckId + '" registered nahi hai');
    const card = cardId == null ? null : d.cards.find(c => c.id === cardId);
    if (cardId != null && !card) throw new Error('chaos: card "' + cardId + '" deck "' + deckId + '" mein nahi');
    const account = clone(d.account);
    if (card) card.break(account);
    account.cx = { fixedAt: null, verified: false };
    const T = [
      { text: '🔎 Chhupi galti dhoondho aur theek karo', check: s => s.account.cx.fixedAt != null },
      { text: '✅ Pakka karo — ' + (card ? card.verifyText : 'probe dobara'), check: s => !!s.account.cx.verified },
    ];
    const files = Object.assign({ 'runbook.md': { desc: 'Runbook', content: d.runbook } }, d.files || {});
    return {
      type: 'terminal', chaos: true, noPalette: true, deck: d.id, card: card && card.id, account, files,
      goal: d.alert, tasks: T, success: s => T.every(t => t.check(s)),
      responses: d.responses || [], placeholder: d.placeholder || 'cat runbook.md',
      hints: card ? card.hints : ['cat runbook.md'], solution: card ? card.solution : [],
      successText: 'Galti theek hui aur pakki bhi. Ab neeche batao — <b>kya toota tha?</b>',
      onTick: sim => {
        if (d.reconcile) d.reconcile(sim.account, sim);
        if (!card) return;
        const c = sim.account.cx, f = !!card.fixed(sim.account, sim);
        if (f && c.fixedAt == null) c.fixedAt = sim.history.length;   // fix wala command iske pehle hai
        if (!f) { c.fixedAt = null; c.verified = false; return; }
        if (!c.verified && sim.history.slice(c.fixedAt).some(h => card.verify.test(h))) c.verified = true;
      },
    };
  }

  AG.chaos = { addDeck, deck, ids, mission, pick, writes, WRITE };

  /* =====================================================================
     🎲 renderer — terminal (chhupi galti ke saath) → "kya toota tha?" → reveal
     ===================================================================== */
  const el = AG.el, esc = AG.escapeHtml;
  AG.renderers.chaos = function renderChaos(stage, arena, onDone) {
    const d = deck(stage.deck);
    if (!d) { arena.appendChild(el('div', 'feedback bad', 'Yeh chaos deck load nahi hua. Page reload karke dobara kholo.')); return; }
    const card = pick(d);
    const m = mission(d.id, card.id);
    let live = null;
    const tick = m.onTick;
    m.onTick = (sim, print) => { live = sim; tick(sim, print); };
    arena.appendChild(el('div', 'cx-head', `🎲 <b>Chaos round</b> · ${d.cards.length} mein se <b>ek</b> chhupi galti · dobara khelo toh nayi` +
      (stage.intro ? `<div class="cx-intro">${stage.intro}</div>` : '')));
    const sub = el('div', 'cx-term');
    const after = el('div', 'lab-after');
    arena.append(sub, after);
    let revealed = false;
    function reveal(result) {
      if (revealed) return;
      revealed = true;
      const clean = result && result.firstTry === 1 ? 1 : 0;
      const changes = writes(live ? live.history : []), need = writes(card.solution);
      const others = AG.shuffle(d.cards.filter(c => c.id !== card.id)).slice(0, 2);
      const q = el('div', 'cx-q', '<b>🔎 Kya toota tha?</b> Kal raat ke change mein kaunsi cheez galat badli thi?');
      const opts = el('div', 'choices');
      const fb = el('div', 'feedback');
      let answered = false;
      const btns = [];
      AG.shuffle([card].concat(others)).forEach(c => {
        const b = el('button', 'choice cx-opt', esc(c.title));
        b.dataset.id = c.id;
        b.onclick = () => {
          if (answered) return;
          answered = true;
          const ok = c.id === card.id;
          btns.forEach(x => { x.disabled = true; if (x.dataset.id === card.id) x.classList.add('correct'); });
          if (!ok) { b.classList.add('wrong'); AG.noteMistake(`🎲 Chaos (${d.title}): lakshan se kaaran`, `<b>${esc(card.title)}</b><br>${card.why}`); }
          else AG.addXP(AG.XP_PER_ITEM);
          const best = AG.drill.practice().chaos, rec = best[stage.id] || { rounds: 0, right: 0 };
          best[stage.id] = { rounds: rec.rounds + 1, right: rec.right + (ok ? 1 : 0) };
          AG.saveState();
          fb.className = 'feedback ' + (ok ? 'good' : 'bad');
          fb.innerHTML = `${ok ? '✅ Sahi pakda!' : '❌ Asli galti: <b>' + esc(card.title) + '</b>'}<br>${card.why}
            <div class="dl-where">🔧 Tumne <b>${changes}</b> badlaav kiye${need ? ` · hal mein <b>${need}</b> chahiye tha` : ''}${changes > need + 2 ? ' — andaaze se sab kuch badalna production mein naye bug laata hai; pehle naapo, phir ek badlaav.' : ''}</div>`;
          const again = el('button', 'btn ghost cx-again', '🎲 Nayi galti (dobara)');
          again.onclick = () => { arena.innerHTML = ''; renderChaos(stage, arena, onDone); };
          const next = el('button', 'btn big cx-next', 'Aage badho →');
          next.onclick = () => { next.disabled = true; again.disabled = true; onDone({ firstTry: clean + (ok ? 1 : 0), total: 2 }); };
          after.append(again, next);
        };
        btns.push(b);
        opts.appendChild(b);
      });
      after.append(q, opts, fb);
      if (after.scrollIntoView) after.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    AG.renderers.terminal(m, sub, r => reveal(r));
    arena._chaos = { card, deck: d, mission: m };
  };
})();
