AG.labHub = (() => {
  function valid(ids) {
    return Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id => AG.labIndex.some(l => l.folder === id));
  }
  function copyBox(cmd) {
    const row = AG.el('div', 'dk-cmdrow');
    const pre = AG.el('pre', 'dk-cmd');
    pre.textContent = cmd;
    const copy = AG.el('button', 'btn ghost small', 'Command copy karo');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(cmd);
        copy.textContent = 'Copy ho gaya';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        copy.textContent = 'Command chuna hai · ab copy karo';
      }
    };
    row.append(pre, copy); return row;
  }
  function show() {
    AG.session = null; AG.nav.set('labs');
    appEl.innerHTML = '';
    const p = AG.el('section', 'panel lab-hub');
    const home = AG.el('button', 'btn small ghost', '← Home'); home.onclick = () => showHome();
    const status = AG.el('p', 'lab-count'); status.setAttribute('aria-live', 'polite');
    const count = () => { status.textContent = AG.state.labs.length + ' / ' + AG.labIndex.length + ' labs poori mark ki hain'; };
    p.append(home, AG.el('h2', '', 'Lab Hub'), status);
    p.appendChild(AG.el('p', '', 'Lab ka naam kholo. Setup repo ke root folder se chalao. README mein baaki steps, mila output aur cleanup hai.'));
    const setup = AG.el('details', 'lab-guide');
    setup.append(AG.el('summary', '', 'Pehli baar Moto kaise chalaayein?'),
      AG.el('p', '', 'Python se normal Moto port 4566 par chalta hai. Pehli baar launcher local Python environment banaata hai. Isi terminal mein env.sh chalaao.'),
      copyBox('cd docker-labs\n./start-moto.sh\nsource env.sh'),
      AG.el('p', '', 'IAM lab apna emulator port 4567 par leti hai. Kai baad ke runners apna Moto khud shuru aur band karte hain. Har lab ka setup alag neeche diya hai.'),
      AG.el('a', '', 'Poora setup guide'));
    setup.querySelector('a').href = 'docker-labs/README.md';
    p.appendChild(setup);
    for (const lab of AG.labIndex) {
      const row = AG.el('article', 'hub-lab'), details = AG.el('details', 'lab-guide');
      details.append(AG.el('summary', '', AG.escapeHtml(lab.title)),
        AG.el('p', '', AG.escapeHtml(lab.limit)), copyBox(lab.setup));
      const read = AG.el('a', '', 'README · exercises aur cleanup'); read.href = 'docker-labs/' + lab.folder + '/README.md';
      details.appendChild(read);
      const label = AG.el('label', 'lab-check'), box = AG.el('input');
      box.type = 'checkbox'; box.checked = AG.state.labs.includes(lab.folder);
      box.setAttribute('aria-label', lab.title + ' · poori');
      box.onchange = () => {
        AG.state.labs = AG.state.labs.filter(id => id !== lab.folder);
        if (box.checked) AG.state.labs.push(lab.folder);
        AG.saveState(); count();
      };
      label.append(box, document.createTextNode(' Poori')); row.append(details, label); p.appendChild(row);
    }
    count(); appEl.appendChild(p); window.scrollTo(0, 0);
  }
  return { valid, show };
})();
