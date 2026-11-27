/* =====================================================================
   AWS Gurukul — 📟 On-call shift   (stage type: 'oncall')
   Ek raat, ek AWS account, kai JUDE hue alerts — aksar har ek pichhle ke fix ka nateeja.
   Har command = 1 minute (simulated ghadi). Alert tab RESOLVE hota hai jab haalat theek ho
   AUR fix ke BAAD tumne pakka kiya (verify command). Aakhir mein report card: MTTR, hints,
   pakka kiya ya nahi, roke gaye khatarnaak commands, grade.
   (Kube Gurukul ke oncall.js ka port, 2026-11-26. Terminal = awscli.js ka asli simulator.)

   Level mein jodna (data file, IIFE ke andar, level file ke BAAD load ho):
     AG.addLab('boss2', { type: 'oncall', id: 'oncall-mahasale', shift: 'mahasale', title, intro?: 'HTML' })

   🧩 Nayi shift jodna:
   AG.oncall.add({
     id: 'mahasale', start: 20 * 60,               // ghadi 20:00 se (minutes)
     INC: [ { id, sev: '🔴 SEV1' | '🟠 SEV2', text,
              fixed: (account, sim) => bool,       // haalat theek hai?
              verify: /regex/, verifyText,         // fix ke BAAD kaunsa command "pakka karna" ginta hai
              hints: [3],                          // is alert ke hints (aakhri = poora command)
              onFire?: (account, sim) => {} } ],   // alert aate hi account mein kuch shuru karo
     build: ({ risky }) => ({ account, files, responses, title?, instructions?, goal, successText, solution, placeholder? }),
     reconcile: (account, sim, clock) => {},       // har minute: metrics, health, scaling aage badhao
   })
   Engine khud jodta hai: ghadi (account.shift), alerts ka kram, "theek → pakka karo", tasks, hints, report card.
   risky(re, why) = khatarnaak command ROKO (state nahi badalta) aur report card mein gino.
   Terminal hooks (awscli.js): stage.onTick(sim, print), stage.hintsFor(sim), stage.onReset(sim), stage.bootLines.
   AG.oncall.mission(onUpdate, shiftId) → poora terminal mission (validator / replay isi se chalte hain).
   ===================================================================== */
AG.oncall = (function () {
  const SHIFTS = {};
  const add = def => { SHIFTS[def.id] = def; return def; };
  const get = id => SHIFTS[id];
  const ids = () => Object.keys(SHIFTS);
  const hhmm = sh => {
    const m = (sh.start == null ? 22 * 60 : sh.start) + (sh.clock || 0);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const fireLine = (sh, inc) => `📟 ${hhmm(sh)}  [FIRING] ${inc.sev} ${inc.id} — ${inc.text}`;

  /* ---------- controller: har command = 1 minute ---------- */
  function tick(def, sim, print, onUpdate) {
    const a = sim.account, sh = a.shift, INC = def.INC;
    if (!sh || sh.over) return;
    sh.clock++;
    def.reconcile(a, sim, sh.clock);
    const k = sh.inc, cur = sh.incs[k], inc = INC[k];
    const ok = !!inc.fixed(a, sim);
    if (cur.fixedAt == null && ok) { cur.fixedAt = sh.clock; cur.fixedIdx = sim.history.length; }
    // pakka karne se pehle haalat phir bigad gayi (jaise fix wapas le liya) → "theek" ka nishaan hatao
    if (cur.fixedAt != null && !cur.verified && !ok) { cur.fixedAt = null; cur.nudged = false; }
    if (cur.fixedAt != null && !cur.verified && sim.history.slice(cur.fixedIdx).some(h => inc.verify.test(h))) cur.verified = true;
    if (cur.fixedAt != null && cur.verified) {
      cur.resolved = sh.clock;
      cur.hints = (sim.hintPos || {})['i' + k] || 0;
      print('pageok', `📟 ${hhmm(sh)}  ✅ RESOLVED  ${inc.id} — MTTR ${cur.resolved - cur.fired} min`);
      if (k + 1 < INC.length) {
        sh.inc = k + 1;
        sh.incs[k + 1].fired = sh.clock;
        if (INC[k + 1].onFire) INC[k + 1].onFire(a, sim);
        print('page', fireLine(sh, INC[k + 1]));
      } else {
        sh.over = true;
        print('pageok', `📟 ${hhmm(sh)}  🌅 Saare alerts shaant. Shift handover ka waqt.`);
      }
    } else if (cur.fixedAt != null && !cur.verified && !cur.nudged) {
      cur.nudged = true;
      print('sys', `(📟 ${inc.id} ki haalat theek lag rahi hai — resolve karne se pehle ${inc.verifyText})`);
    }
    if (onUpdate) onUpdate(sh);
  }

  /* ---------- poora mission: shift ka build() + engine ke hisse ---------- */
  function mission(onUpdate, id) {
    const def = get(id);
    if (!def) throw new Error('oncall: shift "' + id + '" registered nahi hai');
    const INC = def.INC;
    const risky = (re, why) => ({ re, err: true, out: s => {
      const sh = s.account.shift;
      sh.risky++; sh.riskyList.push(why.split(' — ')[0]);
      return '(simulator ne roka — report card mein gina jayega) ' + why;
    } });
    const b = def.build({ risky });
    const account = b.account;
    account.shift = { clock: 0, start: def.start, inc: 0, over: false, risky: 0, riskyList: [],
      incs: INC.map((x, i) => ({ fired: i === 0 ? 0 : null })) };
    def.reconcile(account, null, 0);
    const T = INC.map((inc, i) => ({ text: `📟 ${i + 1}. <b>${inc.id}</b> — theek karo, phir pakka karo`,
      check: s => !!s.account.shift.incs[i].resolved }));
    return Object.assign({ hints: INC[0].hints, placeholder: 'cat runbook.md' }, b, {
      type: 'terminal', oncall: true, shift: def.id, account, tasks: T,
      success: s => T.every(t => t.check(s)),
      bootLines: [['page', fireLine(account.shift, INC[0])]],
      onTick: (sim, print) => tick(def, sim, print, onUpdate),
      onReset: sim => { if (onUpdate) onUpdate(sim.account.shift); },
      hintsFor: sim => ({ key: 'i' + sim.account.shift.inc, list: INC[sim.account.shift.inc].hints }),
    });
  }
  return { add, get, ids, mission, hhmm };
})();

/* ---------- 📟 renderer: pager + asli terminal + report card ---------- */
(function () {
  const el = AG.el;
  AG.renderers.oncall = function renderOncall(stage, arena, onDone) {
    const S = AG.oncall.get(stage.shift), INC = S.INC;
    const pager = el('div', 'oc-pager');
    const sub = el('div', 'oc-term');
    const after = el('div', 'lab-after');
    let last = null, finished = false;
    function paint(sh) {
      last = sh;
      const k = sh.inc, cur = sh.incs[k];
      pager.innerHTML = `<div class="oc-top"><span class="oc-clock">🕗 ${AG.oncall.hhmm(sh)}</span><span>Alert ${Math.min(k + 1, INC.length)} / ${INC.length}</span>${sh.risky ? `<span class="oc-risky">⚠️ roke gaye: ${sh.risky}</span>` : ''}</div>` +
        (sh.over ? '<div class="oc-alert ok">🌅 <b>Saare alerts shaant.</b> Shift handover.</div>'
          : `<div class="oc-alert ${INC[k].sev.includes('SEV1') ? 'sev1' : 'sev2'}">📟 <b>[FIRING] ${INC[k].sev} ${INC[k].id}</b> — ${INC[k].text}
            <div class="oc-steps"><span class="${cur.fixedAt != null ? 'ok' : ''}">${cur.fixedAt != null ? '✅' : '⬜'} theek karo</span><span class="${cur.verified ? 'ok' : ''}">${cur.verified ? '✅' : '⬜'} pakka karo — ${INC[k].verifyText}</span></div></div>`) +
        `<div class="oc-done">${sh.incs.map((x, i) => x.resolved ? `<span>✅ ${INC[i].id} · ${x.resolved - x.fired} min</span>` : '').join('')}</div>`;
    }
    const m = AG.oncall.mission(paint, S.id);
    paint(m.account.shift);
    if (stage.intro) arena.appendChild(el('div', 'oc-intro', stage.intro));
    arena.append(pager, sub, after);
    function finish() {
      if (finished || !last) return;
      finished = true;
      const sh = last;
      const rows = sh.incs.map((x, i) => {
        const hints = x.hints || 0;
        return `<tr><td>${INC[i].sev.split(' ')[0]} ${INC[i].id.replace(/([a-z])([A-Z])/g, '$1<wbr>$2')}</td><td>${AG.oncall.hhmm({ clock: x.fired, start: S.start })}</td><td><b>${x.resolved - x.fired} min</b></td><td>${hints ? '💡 ' + hints : '—'}</td><td>${x.verified ? '✅' : '—'}</td></tr>`;
      }).join('');
      const totalHints = sh.incs.reduce((n, x) => n + (x.hints || 0), 0);
      const grade = totalHints <= 1 && sh.risky === 0 ? 'A' : totalHints <= 4 && sh.risky <= 1 ? 'B' : 'C';
      const clean = sh.incs.filter(x => !x.hints).length;
      const card = el('div', 'oc-card pop', `<div class="oc-head"><div class="oc-grade g${grade}">${grade}</div>
        <div><b>📋 Shift report card</b><br>${AG.oncall.hhmm({ clock: 0, start: S.start })} – ${AG.oncall.hhmm(sh)} · ${sh.clock} min</div></div>
        <div class="oc-tblwrap"><table class="oc-tbl"><tr><th>Alert</th><th>Aaya</th><th>MTTR</th><th>Hints</th><th title="pakka kiya">✔</th></tr>${rows}</table></div>
        <div>⚠️ Roke gaye khatarnaak commands: <b>${sh.risky}</b>${sh.risky ? ' — ' + sh.riskyList.join(' · ') : ' — 👏 koi nahi'}</div>
        <div class="dl-rules">Grade: A = ≤1 hint + 0 khatarnaak · B = ≤4 hints + ≤1 khatarnaak · C = baaki. Dobara khelo toh ghadi aur ginti naye sire se.</div>`);
      const again = el('button', 'btn ghost oc-again', '🔁 Shift dobara (behtar grade ke liye)');
      again.onclick = () => { arena.innerHTML = ''; renderOncall(stage, arena, onDone); };
      const next = el('button', 'btn big oc-next', 'Aage badho →');
      next.onclick = () => { next.disabled = true; again.disabled = true; onDone({ firstTry: clean, total: INC.length }); };
      const best = AG.drill.practice().oncall, prev = best[stage.id];
      if (!prev || 'ABC'.indexOf(grade) < 'ABC'.indexOf(prev.grade) || (grade === prev.grade && sh.clock < prev.mins)) {
        best[stage.id] = { grade, mins: sh.clock };
        AG.saveState();
      }
      after.append(card, again, next);
      if (after.scrollIntoView) after.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    arena._oncall = { mission: m, sub, finish, INC };
    AG.renderers.terminal(m, sub, () => finish());
  };
})();

/* ---------- saajhe helpers: shifts CloudWatch alarms aur metrics aise dikhati hain ----------
   AG.oncall.point(iso, v)              → ek minute ka metric point (saare statistics = v)
   AG.oncall.alarmsResponse(region, id) → `aws cloudwatch describe-alarms` ka response entry: state
       AG.capacityAlarmSnapshot (capacity-cli.js) se, StateReason asli CloudWatch jaisa — aakhri datapoint ki value ke saath.
       --alarm-names / --alarm-name-prefix / --state-value samajhta hai. */
(function () {
  const OPS = { LessThanThreshold: 'less than', GreaterThanThreshold: 'greater than', LessThanOrEqualToThreshold: 'less than or equal to', GreaterThanOrEqualToThreshold: 'greater than or equal to' };
  const stamp = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`; };
  const dims = x => JSON.stringify((x || []).map(d => [d.Name, d.Value]).sort());
  AG.oncall.point = (iso, v) => ({ Timestamp: iso, SampleCount: 1, Average: v, Minimum: v, Maximum: v, Sum: v });
  function view(a, al, region, account) {
    const d = al.definition, snap = AG.capacityAlarmSnapshot(a, al);
    const series = (a.capacityMetrics || []).find(x => x.namespace === d.Namespace && x.metric === d.MetricName && dims(x.dimensions) === dims(d.Dimensions));
    const p = series && series.points[series.points.length - 1], stat = d.ExtendedStatistic || d.Statistic, v = p && p[stat];
    const not = snap.state === 'ALARM' ? '' : 'not ';
    const reason = v == null ? snap.reason : `Threshold Crossed: 1 out of the last 1 datapoints [${Number(v).toFixed(1)} (${stamp(p.Timestamp)})] was ${not}${OPS[d.ComparisonOperator]} the threshold (${Number(d.Threshold).toFixed(1)}) (minimum 1 datapoint for ${snap.state === 'ALARM' ? 'OK -> ALARM' : 'ALARM -> OK'} transition).`;
    // asli DescribeAlarms ka kram; jis shift ne actions nahi likhe uske alarm on-call pager topic ko jaate hain
    return { AlarmName: al.name, AlarmArn: `arn:aws:cloudwatch:${region}:${account}:alarm:${al.name}`,
      ActionsEnabled: d.ActionsEnabled !== false, OKActions: d.OKActions || [], AlarmActions: d.AlarmActions || [`arn:aws:sns:${region}:${account}:oncall-pager`], InsufficientDataActions: [],
      StateValue: snap.state, StateReason: reason,
      MetricName: d.MetricName, Namespace: d.Namespace, [d.ExtendedStatistic ? 'ExtendedStatistic' : 'Statistic']: stat, Dimensions: d.Dimensions,
      Period: d.Period, EvaluationPeriods: d.EvaluationPeriods, DatapointsToAlarm: d.DatapointsToAlarm || d.EvaluationPeriods, Threshold: d.Threshold,
      ComparisonOperator: d.ComparisonOperator, TreatMissingData: d.TreatMissingData || 'missing' };
  }
  AG.oncall.alarmsResponse = (region, account) => ({ re: /^aws cloudwatch describe-alarms\b/, out: (sim, m) => {
    const cmd = m.input, flag = n => (cmd.match(new RegExp('--' + n + '\\s+(\\S+)')) || [])[1];
    const names = (cmd.match(/--alarm-names\s+(.+?)(?=\s--|$)/) || [, ''])[1].split(/\s+/).filter(Boolean), prefix = flag('alarm-name-prefix'), state = flag('state-value');
    const rows = (sim.account.alarms || []).filter(al => (!names.length || names.includes(al.name)) && (!prefix || al.name.startsWith(prefix)))
      .map(al => view(sim.account, al, region, account)).filter(v => !state || v.StateValue === state);
    return JSON.stringify({ MetricAlarms: rows, CompositeAlarms: [] }, null, 4);
  } });
})();
