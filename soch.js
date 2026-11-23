/* Cases can be played before their level is unlocked. Only the first clear earns XP. */
AG.showSoch = function (scenario) {
  AG.session = null;
  AG.nav.set(scenario ? 'soch/' + scenario.id : 'soch');
  appEl.innerHTML = '';
  window.scrollTo(0, 0);
  const wrap = el('section', 'panel soch-case');
  const back = el('button', 'btn ghost small', scenario ? '← Saare cases' : '← Home');
  back.onclick = scenario ? () => AG.showSoch() : showHome;
  wrap.appendChild(back);
  appEl.appendChild(wrap);
  if (!scenario) {
    wrap.appendChild(el('h2', 'level-h', '🧠 Soch Akhada'));
    const completed = AG.sochCases.filter(c => Object.hasOwn(AG.state.soch, c.id)).length;
    wrap.appendChild(el('p', 'instructions', completed + ' / ' + AG.sochCases.length + ' cases poore hue. Koi bhi case chuno.'));
    for (const track of AG.tracks) {
      const cases = AG.sochCases.filter(c => AG.trackOf(AG.findLevel(c.id)) === track);
      if (!cases.length) continue;
      const grid = el('div', 'soch-grid');
      for (const c of cases) {
        const best = AG.state.soch[c.id];
        const card = el('button', 'btn ghost', c.title + (Number.isInteger(best) ? ' · ✓ ' + best + '/3' : ''));
        card.onclick = () => AG.showSoch(c);
        grid.appendChild(card);
      }
      wrap.append(el('h3', '', track.name), grid);
    }
    return;
  }

  const level = AG.findLevel(scenario.id);
  const incident = level.stages.find(stage => stage.type === 'triage');
  const questions = [...incident.questions.slice(0, 2), scenario];
  wrap.appendChild(el('h2', 'level-h', scenario.title));
  wrap.appendChild(el('p', 'instructions', incident.symptom));
  const evidence = el('details', 'soch-evidence');
  evidence.appendChild(el('summary', '', 'Case ka saboot dekho'));
  for (const check of incident.commands.filter(c => c.clue)) {
    const sample = el('pre', 'context');
    sample.textContent = '$ ' + check.cmd + '\n' + check.out;
    evidence.appendChild(sample);
  }
  const arena = el('div', 'arena');
  wrap.append(evidence, arena);
  let index = 0, score = 0;
  function ask() {
    arena.innerHTML = '';
    const q = questions[index];
    arena.appendChild(el('div', 'quiz-progress', ['1 / 3 · Pehla faisla', '2 / 3 · Saboot aur asar', '3 / 3 · Ab shart badli'][index]));
    arena.appendChild(el('div', 'question', q.q));
    const choices = el('div', 'choices');
    const feedback = el('div', 'feedback');
    feedback.setAttribute('aria-live', 'polite');
    let missed = false, answered = false;
    for (const i of AG.shuffle(q.choices.map((_, i) => i))) {
      const choice = el('button', 'choice', q.choices[i]);
      choice.dataset.i = String(i);
      choice.onclick = () => {
        if (answered || choice.disabled) return;
        if (i !== q.answer) {
          choice.disabled = true;
          choice.classList.add('wrong');
          missed = true;
          feedback.className = 'feedback bad';
          feedback.textContent = index === 2 ? scenario.hint : 'Case ka saboot dekho. Doosra jawab chuno.';
          if (index < 2) evidence.open = true;
          return;
        }
        answered = true;
        if (!missed) score++;
        choices.querySelectorAll('.choice').forEach(button => { button.disabled = true; });
        choice.classList.add('correct');
        feedback.className = 'feedback good';
        feedback.innerHTML = q.explain;
        const next = el('button', 'btn soch-next', index === 2 ? 'Nateeja dekho' : index === 1 ? 'Nayi shart dekho →' : 'Agla faisla →');
        next.onclick = () => {
          if (next.disabled) return;
          next.disabled = true;
          if (++index < questions.length) ask();
          else finish();
        };
        arena.appendChild(next);
      };
      choices.appendChild(choice);
    }
    arena.append(choices, feedback);
  }

  function finish() {
    const best = AG.state.soch[scenario.id];
    AG.state.soch[scenario.id] = Math.max(best || 0, score);
    if (best === undefined) AG.addXP(AG.XP_PER_ITEM);
    AG.saveState();
    arena.innerHTML = '';
    arena.appendChild(el('h3', 'soch-result', score + ' / 3 faisle pehli baar mein sahi'));
    for (const q of questions) {
      const answer = el('details');
      answer.append(el('summary', '', q.choices[q.answer]), el('p', '', q.q), el('p', '', q.explain));
      arena.appendChild(answer);
    }
    const row = el('div', 'btnrow');
    const list = el('button', 'btn', 'Doosra case chuno');
    list.onclick = () => AG.showSoch();
    row.appendChild(list);
    if (AG.levelOpen(level)) {
      const lesson = el('button', 'btn ghost', 'Level kholo');
      lesson.onclick = () => showIntro(level);
      row.appendChild(lesson);
    }
    arena.appendChild(row);
  }
  ask();
};
