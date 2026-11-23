/* A checkpoint is the start of a challenge, or the result after the final one. */
AG.resume = (() => {
  const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const count = v => Number.isSafeInteger(v) && v >= 0;
  const text = v => typeof v === 'string';
  const listOfIds = v => Array.isArray(v) && v.every(id => text(id) && id.length > 0);
  const mapOf = (v, test) => isRecord(v) && Object.entries(v).every(([id, value]) =>
    id.length > 0 && !Object.hasOwn(Object.prototype, id) && test(value, id));

  function validStage(point, level) {
    if (!level) return false;
    const size = allStages(level).length;
    return point.stageIdx < size && (!point.ready || point.stageIdx === size - 1);
  }

  function current() {
    const p = AG.state.resume;
    if (!p) return null;
    const level = AG.findLevel(p.levelId);
    return validStage(p, level) && AG.levelOpen(level) && p.replay === AG.state.completed.includes(level.id) ? p : null;
  }

  function label(point, level) {
    if (point.ready) return 'Level ka nateeja';
    const stages = allStages(level);
    return 'Challenge ' + (point.stageIdx + 1) + ' / ' + stages.length + ' · ' + stages[point.stageIdx].title;
  }

  function startStage(session) {
    if (!AG.levelOpen(session.level) || session.replay !== AG.state.completed.includes(session.level.id)) return;
    const previous = current();
    // Revisiting a finished level keeps the unfinished level available on Home.
    if (session.replay && previous && !previous.replay) return;
    const sameStage = previous?.levelId === session.level.id && previous.stageIdx === session.stageIdx;
    const point = {
      levelId: session.level.id, stageIdx: session.stageIdx, firstTry: session.firstTry,
      total: session.total, earnedXP: sameStage ? previous.earnedXP : 0,
      replay: session.replay, ready: false,
    };
    AG.state.resume = session.stagePoint = point;
    session.attemptXP = 0;
    AG.saveState();
  }

  function finishStage(session, size) {
    if (!session.stagePoint || session.stagePoint !== AG.state.resume) return;
    const ready = session.stageIdx + 1 === size;
    AG.state.resume = {
      ...session.stagePoint, stageIdx: ready ? session.stageIdx : session.stageIdx + 1,
      firstTry: session.firstTry, total: session.total, earnedXP: 0, ready,
    };
    AG.saveState();
  }

  function open(level) {
    const p = current();
    if (!p || p.levelId !== level.id) return false;
    AG.nav.set('level/' + level.id);
    AG.session = { level, stageIdx: p.stageIdx, firstTry: p.firstTry, total: p.total, replay: p.replay };
    if (p.ready) levelComplete();
    else runStage();
    return true;
  }

  // Saved Dojo text can contain lesson emphasis and line breaks. Treat all other markup as text.
  function cardHtml(value) {
    return String(value).replace(/<(?!(?:\/?(?:b|strong|em|i|code|pre|kbd|ul|ol|li)|br\s*\/?)>)/gi, '&lt;');
  }

  function encode() {
    return JSON.stringify({ app: 'aws-gurukul', version: 1, progress: { ...AG.state, resume: current() } }, null, 2);
  }

  function decode(contents) {
    let data;
    try { data = JSON.parse(contents); }
    catch { throw Error('JSON padh nahi paaya. Backup file phir chuno.'); }
    if (isRecord(data) && ('app' in data || 'version' in data || 'progress' in data)) {
      if (data.app !== 'aws-gurukul' || data.version !== 1) throw Error('Is file ka app ya backup version alag hai.');
      data = data.progress;
    }
    // Old local saves may omit newer fields. If a field exists, check it before replacing progress.
    const validCard = c => isRecord(c) && text(c.front) && text(c.back) && (c.tag === undefined || text(c.tag)) &&
      count(c.box) && c.box < AG.SRS_INTERVALS.length && Number.isFinite(c.due) && c.due >= 0 &&
      Object.keys(c).every(k => ['front','back','tag','box','due'].includes(k));
    const validDecision = d => isRecord(d) && listOfIds(d.seen) && listOfIds(d.solved) && count(d.best);
    const validStreak = s => isRecord(s) && (s.last === null || (text(s.last) && /^\d{4}-\d{2}-\d{2}$/.test(s.last))) &&
      count(s.count) && count(s.best) && s.best >= s.count;
    const fields = {
      labs: v => AG.labHub.valid(v),
      mock: v => AG.mock.valid(v),
      xp: count, completed: ids => listOfIds(ids) && ids.every(id => AG.findLevel(id)) && new Set(ids).size === ids.length,
      levelStarts: count, streak: validStreak, dojo: v => mapOf(v, validCard),
      stars: v => mapOf(v, (n, id) => count(n) && n <= 3 && AG.findLevel(id)),
      soch: v => mapOf(v, (n, id) => count(n) && n <= 3 && AG.sochCases.some(c => c.id === id)),
      decisions: v => mapOf(v, validDecision),
      resume: p => p === null || (AG.readCheckpoint(p) && validStage(p, AG.findLevel(p.levelId)) &&
        p.replay === data.completed.includes(p.levelId) && AG.levelOpen(AG.findLevel(p.levelId), data)),
    };
    if (!isRecord(data) || !count(data.xp) || !listOfIds(data.completed) ||
        !Object.keys(data).every(k => Object.hasOwn(fields, k) && fields[k](data[k]))) {
      throw Error('Backup mein progress ka data sahi nahi hai. Doosri file chuno.');
    }
    return AG.readProgress(data);
  }

  function settings(notice) {
    const panel = AG.el('details', 'backup-settings');
    const heading = AG.el('summary', '', 'Settings · Progress ka backup');
    const row = AG.el('div', 'btnrow');
    const download = AG.el('button', 'btn ghost small', 'JSON download karo');
    const pick = AG.el('button', 'btn ghost small', 'Backup file kholo');
    const file = AG.el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    const status = AG.el('p', 'backup-status');
    status.setAttribute('role', 'status');
    status.textContent = notice;
    panel.open = !!notice;
    const preview = AG.el('div', 'btnrow');
    row.append(download, pick, file);
    panel.append(heading, AG.el('p', '', 'XP, badges, Dojo aur adhoora challenge ek file mein rakho.'), row, status, preview);

    download.onclick = () => {
      try {
        const blob = new Blob([encode()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = AG.el('a');
        link.href = url;
        link.download = 'aws-gurukul-' + AG.todayStr() + '.json';
        try { panel.appendChild(link); link.click(); }
        finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        status.textContent = 'Backup ka download shuru hua.';
      } catch { status.textContent = 'Download shuru nahi hua. Dobara koshish karo.'; }
    };

    let selection = 0;
    pick.onclick = () => file.click();
    file.onchange = async () => {
      const attempt = ++selection;
      preview.innerHTML = '';
      const selected = file.files[0];
      file.value = '';
      if (!selected) { status.textContent = ''; return; }
      status.textContent = 'Backup padh rahe hain.';
      let candidate;
      try {
        const contents = await selected.text();
        if (attempt !== selection || panel.isConnected === false) return;
        candidate = decode(contents);
      } catch (err) {
        if (attempt === selection) status.textContent = err.message || 'File padh nahi paaye.';
        return;
      }
      status.textContent = 'File mein ' + candidate.xp + ' XP aur ' + candidate.completed.length +
        ' completed levels hain. Import karne par phone ya computer ki abhi waali progress badal jaayegi.';
      const apply = AG.el('button', 'btn small', 'Progress badalkar import karo');
      const cancel = AG.el('button', 'btn ghost small', 'Rehne do');
      cancel.onclick = () => { preview.innerHTML = ''; status.textContent = 'Import rok diya.'; pick.focus(); };
      apply.onclick = () => {
        if (!AG.saveState(candidate)) {
          status.textContent = 'Browser backup save nahi kar paaya. Abhi waali progress waise hi hai.';
          return;
        }
        AG.state = candidate;
        showHome('Backup import ho gaya. ' + candidate.xp + ' XP waapas mil gaye.');
      };
      preview.append(apply, cancel);
    };
    return panel;
  }

  return { current, label, startStage, finishStage, open, cardHtml, encode, decode, settings };
})();
