AG.cheatsheet = (() => {
  function entries() {
    const rows = [];
    for (const t of AG.tracks) for (const l of AG.levelsOf(t)) {
      if (l.playbook) rows.push({ level: l, topics: [l.id] });
    }
    for (const tree of AG.decisions) for (const id of AG.leavesOf(tree)) {
      const leaf = tree.nodes[id];
      rows.push({ tree, leaf, topics: [...new Set([...(tree.levels || []), leaf.level].filter(Boolean))] });
    }
    return rows;
  }
  function leafCard(tree, leaf) {
    const box = AG.el('article','sheet-entry');
    box.append(AG.el('div','crumb',tree.short || tree.title), AG.el('h3','',leaf.pick), AG.el('p','',leaf.one));
    function list(title, lines) {
      if (!lines?.length) return;
      const ul = AG.el('ul');
      for (const l of lines) ul.appendChild(AG.el('li','',l));
      box.append(AG.el('h4','',title),ul);
    }
    list('Kab chuno', leaf.when); list('Kab nahi',leaf.avoid);
    if (leaf.cost) box.appendChild(AG.el('p','','<b>Bill</b> · ' + leaf.cost));
    if (leaf.exam) box.appendChild(AG.el('p','','<b>Exam clue</b> · ' + leaf.exam));
    return box;
  }
  function show() {
    AG.nav.set('sheet'); AG.session = null; appEl.innerHTML = '';
    const sheet = AG.el('section','panel cheat-sheet');
    const back = AG.el('button','btn small ghost','← Home'); back.onclick = () => showHome();
    const print = AG.el('button','btn small','Print ya PDF'); print.onclick = () => window.print();
    const select = AG.el('select','sheet-filter'); select.setAttribute('aria-label','Cheatsheet ka topic');
    const all = AG.el('option','','Sabhi topics'); all.value = ''; select.appendChild(all);
    for (const t of AG.tracks) {
      const group = AG.el('optgroup'); group.label = t.name;
      for (const l of AG.levelsOf(t)) { const o = AG.el('option','',l.title); o.value = l.id; group.appendChild(o); }
      select.appendChild(group);
    }
    const controls = AG.el('div','btnrow sheet-controls'); controls.append(back,select,print);
    const description = AG.el('p','sheet-count'); description.setAttribute('role','status');
    const body = AG.el('div','sheet-rows');
    sheet.append(AG.el('h2','','Kab kya · Cheatsheet'), controls, description, body);
    const rows = entries();
    function render() {
      body.innerHTML = '';
      const match = rows.filter(r => !select.value || r.topics.includes(select.value));
      const levels = match.filter(r => r.level), leaves = match.filter(r => r.leaf);
      description.textContent = (select.value ? AG.findLevel(select.value).title : 'Poora syllabus') + ' · ' + levels.length + ' playbooks · ' + leaves.length + ' Dojo faisle';
      if (levels.length) body.appendChild(AG.el('h2','','Level playbooks'));
      for (const { level } of levels) {
        const box = AG.el('article','sheet-entry');
        box.append(AG.el('h3','',level.title), renderPlaybook(level.playbook,true));
        body.appendChild(box);
      }
      if (leaves.length) body.appendChild(AG.el('h2','','Decision Dojo'));
      for (const { tree, leaf } of leaves) body.appendChild(leafCard(tree, leaf));
    }
    select.onchange = render; render(); appEl.appendChild(sheet); window.scrollTo(0,0);
  }
  return { entries, show };
})();
