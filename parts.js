/* Keep stage indices stable so older saves still open the same challenge. */
AG.parts = (() => {
  const split = level => level.stages.findIndex(stage => stage.type === 'triage');
  const name = (level, index) => index < split(level) ? 'Part 1 · Samjho' : 'Part 2 · Karo';
  function overview(level) {
    const cut = split(level), size = allStages(level).length;
    const panel = AG.el('section','parts-overview');
    const first = AG.el('div','','<b>Part 1 · Samjho</b><p>Lesson aur challenge 1–' + cut + '</p>');
    const second = AG.el('div','','<b>Part 2 · Karo</b><p>Challenge ' + (cut + 1) + '–' + size + ' · Triage se interview tak</p>');
    panel.append(first, second); return panel;
  }
  function breakNote(session, saved) {
    const p = AG.el('div', 'part-break');
    p.appendChild(AG.el('h3','','Part 1 · Samjho poora hua'));
    let text = 'Agla challenge Part 2 ka pehla case hai.';
    if (saved) text = 'Part 2 ki shuruaat save ho gayi. Abhi ruk sakte ho. Home se pehla case phir khulega.';
    else if (saved === false) text = 'Browser progress save nahi kar paaya. Part 2 abhi shuru kar sakte ho.';
    p.appendChild(AG.el('p','',text));
    const stop = AG.el('button','btn ghost small','Abhi ruko · Home');
    stop.onclick = () => { if (session === AG.session) showHome(); };
    p.appendChild(stop);
    return p;
  }
  return { split, name, overview, breakNote };
})();
