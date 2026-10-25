/* =====================================================================
   AWS Gurukul — Interactive Labs
   dryrun | flowlab | triage | docker
   (KubeGurukul + Arpit Bhayani Classes se port kiya, 2026-10-23)

   Yeh renderers baaki games se ek cheez mein alag hain: inme "sahi option
   yaad karo" nahi hai. Learner ek click karta hai ya ek knob ghumata hai, aur
   diagram + numbers turant badalte hain. Number hardcoded nahi — model se
   compute hota hai.

   Contract wahi jo games.js ka hai:
       (stage, arena, onDone) => onDone({ firstTry, total })

   NOTE: poori file ek IIFE mein hai. games.js top level par `const el`,
   `const shuffle` declare karta hai — yeh file wahi naam dobara declare karti
   aur browser SyntaxError deta.

   Do niyam (System Gurukul se seekhe):
   1. Renderer apna state LEVEL DATA par kabhi nahi likhta — sab local variables.
   2. Har button ki apni CLASS hai (dr-next, dr-opt, fl-next, tg-cmd, dk-tick...)
      — validator buttons ko class se pakadta hai, text se kabhi nahi.

   ✍️ LIKHNE KA NIYAM (ADHD): kisi bhi line mein "yeh / woh / uska / isse" ko
   kisi pehle bataye hue naam ki jagah mat likho. Naam DOBARA likho.
   ===================================================================== */
(function () {
  const el = AG.el, shuffle = AG.shuffle, shake = AG.shake, escapeHtml = AG.escapeHtml;

  /* headless validator mein setInterval nahi hota */
  const hasTimers = typeof setInterval === 'function';

  /* ---------------------------------------------------------------
     AG.allOf(TASKS) — mission ka success() usi checklist se banao jo UI
     mein dikhti hai. Warna success() tasks se aage nikal jaata hai: mission
     "done" ho jaata hai jabki checklist ka aakhri item abhi bacha hai.
     --------------------------------------------------------------- */
  AG.allOf = tasks => sim => tasks.every(t => t.check(sim));

  /* ---------------------------------------------------------------
     Node catalogue — dry run / flow lab diagrams ke liye
       AG.aws.n('ec2', 300, 200)                    → node
       AG.aws.n('ec2#b', 300, 200, { label: 'web-2' }) → same type, doosra node
     --------------------------------------------------------------- */
  AG.aws = {
    catalog: {
      user:      { icon: '🧑', label: 'User' },
      internet:  { icon: '🌐', label: 'Internet' },
      attacker:  { icon: '🦹', label: 'Attacker' },
      dev:       { icon: '👩‍💻', label: 'Developer' },
      igw:       { icon: '🚪', label: 'Internet GW' },
      nat:       { icon: '🔁', label: 'NAT GW' },
      rt:        { icon: '🗺️', label: 'Route table' },
      nacl:      { icon: '🚧', label: 'NACL' },
      sg:        { icon: '🛡️', label: 'Security group' },
      ec2:       { icon: '🖥️', label: 'EC2' },
      asg:       { icon: '📈', label: 'Auto Scaling' },
      alb:       { icon: '⚖️', label: 'ALB' },
      nlb:       { icon: '⚡', label: 'NLB' },
      r53:       { icon: '🧭', label: 'Route 53' },
      cf:        { icon: '🌍', label: 'CloudFront' },
      waf:       { icon: '🧱', label: 'WAF' },
      apigw:     { icon: '🚪', label: 'API Gateway' },
      lambda:    { icon: 'λ', label: 'Lambda' },
      ecs:       { icon: '📦', label: 'ECS/Fargate' },
      s3:        { icon: '🪣', label: 'S3', kind: 'db' },
      ebs:       { icon: '💽', label: 'EBS', kind: 'db' },
      efs:       { icon: '📁', label: 'EFS', kind: 'db' },
      rds:       { icon: '🗄️', label: 'RDS', kind: 'db' },
      aurora:    { icon: '🗄️', label: 'Aurora', kind: 'db' },
      ddb:       { icon: '📊', label: 'DynamoDB', kind: 'db' },
      cache:     { icon: '⚡', label: 'ElastiCache', kind: 'db' },
      sqs:       { icon: '📨', label: 'SQS', kind: 'queue' },
      sns:       { icon: '📣', label: 'SNS', kind: 'queue' },
      eb:        { icon: '🔔', label: 'EventBridge', kind: 'queue' },
      kinesis:   { icon: '🌊', label: 'Kinesis', kind: 'queue' },
      firehose:  { icon: '🚒', label: 'Firehose', kind: 'queue' },
      sfn:       { icon: '🪜', label: 'Step Functions' },
      iam:       { icon: '🔐', label: 'IAM' },
      sts:       { icon: '🎫', label: 'STS' },
      kms:       { icon: '🔑', label: 'KMS' },
      secrets:   { icon: '🤫', label: 'Secrets Mgr' },
      cw:        { icon: '👁️', label: 'CloudWatch' },
      trail:     { icon: '📜', label: 'CloudTrail' },
      os:        { icon: '🔍', label: 'OpenSearch', kind: 'db' },
      vpce:      { icon: '🔌', label: 'VPC endpoint' },
      tgw:       { icon: '🕸️', label: 'Transit GW' },
      dx:        { icon: '🔗', label: 'Direct Connect' },
      vpn:       { icon: '🔒', label: 'Site-to-Site VPN' },
      onprem:    { icon: '🏢', label: 'Office / DC' },
      backup:    { icon: '💾', label: 'AWS Backup', kind: 'db' },
      org:       { icon: '🏛️', label: 'Organizations' },
      app:       { icon: '📱', label: 'App' },
    },
    n(id, x, y, over) {
      const base = AG.aws.catalog[id.split('#')[0]] || { icon: '📦', label: id };
      return Object.assign({ id, x, y, icon: base.icon, label: base.label, kind: base.kind }, over || {});
    },
  };

  /* ---------------------------------------------------------------
     AG.viz.svg — service diagram (viewBox 1000 × 520, x/y = node ka centre)
       nodes  : [{ id, label, icon, x, y, kind? }]
       edges  : [{ from, to, dashed? }]           (hamesha dikhne wali patli lines)
       groups : [{ label, x, y, w, h, kind }]      AWS boundaries — region / az /
                kind: region | az | vpc | public | private | account | onprem
       state  : { nodes: { id: { tone, badge } }, flows: [{ from, to, label, tone, rate?, back? }] }
     tone: ok | slow | bad | busy | idle | new | acc
     --------------------------------------------------------------- */
  const W = 1000, H = 520, NW = 180, NH = 66;
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const widthOf = n => Math.max(NW, Math.round(84 + String(n.label || '').length * 12.4));
  function clip(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const edge = n => {
      const sx = dx === 0 ? Infinity : (widthOf(n) / 2 + 6) / Math.abs(dx);
      const sy = dy === 0 ? Infinity : (NH / 2 + 6) / Math.abs(dy);
      return Math.min(sx, sy, 0.45);
    };
    const sa = edge(a), sb = edge(b);
    return { x1: a.x + dx * sa, y1: a.y + dy * sa, x2: b.x - dx * sb, y2: b.y - dy * sb };
  }
  AG.viz = {
    W, H,
    svg(nodes, edges, state, groups) {
      state = state || {};
      const map = {};
      (nodes || []).forEach(n => { map[n.id] = n; });
      const ns = state.nodes || {};
      let out = `<svg class="ms-svg" viewBox="0 0 ${W} ${H}" role="img">
        <defs>${['ok', 'bad', 'slow', 'acc'].map(t =>
          `<marker id="ah-${t}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah ${t}"/></marker>`).join('')}</defs>`;

      (groups || []).forEach(g => {
        out += `<g class="ms-group g-${esc(g.kind || 'vpc')}"><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="16"/>` +
          `<text x="${g.x + 14}" y="${g.y + 24}">${esc(g.label)}</text></g>`;
      });

      (edges || []).forEach(e => {
        const a = map[e.from], b = map[e.to];
        if (!a || !b) return;
        const c = clip(a, b);
        out += `<line class="ms-edge${e.dashed ? ' dashed' : ''}" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}"/>`;
      });

      const labels = [];
      (state.flows || []).forEach(f => {
        const a = map[f.from], b = map[f.to];
        if (!a || !b) return;
        const tone = f.tone || 'acc';
        const off = f.back ? 12 : (f.offset || 0);
        const c = clip(a, b);
        const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) || 1;
        const nx = -(c.y2 - c.y1) / len * off, ny = (c.x2 - c.x1) / len * off;
        const x1 = c.x1 + nx, y1 = c.y1 + ny, x2 = c.x2 + nx, y2 = c.y2 + ny;
        const rate = f.rate == null ? 0.6 : Math.max(0.05, Math.min(1, f.rate));
        const dur = (2.4 - rate * 1.8).toFixed(2);
        const mk = ['ok', 'bad', 'slow'].includes(tone) ? tone : 'acc';
        out += `<line class="ms-flow ${tone}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#ah-${mk})" style="animation-duration:${dur}s"/>`;
        if (f.label) {
          const segLen = Math.hypot(x2 - x1, y2 - y1);
          const w = Math.min(440, 20 + String(f.label).length * 10.2);
          const lift = segLen < w + 20 ? 44 : 8;   // chhoti arrow par label upar, warna node ke neeche chhupta
          const mx = (x1 + x2) / 2 + nx * 1.4, my = (y1 + y2) / 2 + ny * 1.4 - lift;
          labels.push(`<g class="ms-flabel ${tone}"><rect x="${mx - w / 2}" y="${my - 17}" width="${w}" height="30" rx="8"/><text x="${mx}" y="${my + 4}">${esc(f.label)}</text></g>`);
        }
      });

      (nodes || []).forEach(n => {
        const st = ns[n.id] || {};
        const tone = st.tone || n.tone || 'idle';
        const nw = widthOf(n);
        const x = n.x - nw / 2, y = n.y - NH / 2;
        out += `<g class="ms-node ${tone}${n.kind ? ' k-' + n.kind : ''}" data-id="${esc(n.id)}">
          <rect x="${x}" y="${y}" width="${nw}" height="${NH}" rx="${n.kind === 'db' || n.kind === 'queue' ? 24 : 12}"/>
          <text class="ms-ico" x="${x + 30}" y="${n.y + 10}">${esc(n.icon || '📦')}</text>
          <text class="ms-lbl" x="${x + 56}" y="${n.y + 8}">${esc(n.label)}</text>`;
        if (st.badge != null && st.badge !== '') {
          const bw = Math.min(380, 24 + String(st.badge).length * 9.2);
          out += `<g class="ms-badge ${tone}"><rect x="${n.x - bw / 2}" y="${n.y + NH / 2 + 6}" width="${bw}" height="28" rx="14"/><text x="${n.x}" y="${n.y + NH / 2 + 26}">${esc(st.badge)}</text></g>`;
        }
        out += '</g>';
      });
      return out + labels.join('') + '</svg>';   // labels aakhri mein — koi node unhe na dhake
    },
  };

  /* ---------- common pieces ---------- */
  function goalBox(text, title) {
    const g = el('div', 'lab-goal');
    g.appendChild(el('h4', null, title || '🎯 GOAL'));
    g.appendChild(el('div', 'lab-goal-text', text));
    return g;
  }

  /* ek MCQ card — sahi par onRight(firstTryBool), galat par shake + Dojo card */
  function askCard(q, cls, tag, onRight) {
    const card = el('div', 'ms-ask');
    card.appendChild(el('div', 'ms-ask-q', '🤔 ' + q.q));
    const fb = el('div', 'ms-ask-fb');
    let wrong = false, done = false;
    shuffle(q.choices.map((c, i) => ({ c, i }))).forEach(({ c, i }) => {
      const b = el('button', 'ms-opt ' + cls, c);
      b.dataset.i = String(i);
      b.onclick = () => {
        if (done || b.disabled) return;
        if (i === q.answer) {
          done = true;
          b.classList.add('right');
          card.querySelectorAll('.ms-opt').forEach(x => { x.disabled = true; });
          fb.className = 'ms-ask-fb good';
          fb.innerHTML = '✅ ' + (q.explain || 'Sahi!');
          if (!wrong) AG.addXP(AG.XP_PER_ITEM);
          onRight(!wrong);
        } else {
          if (!wrong) AG.noteMistake(q.q, `<b>${q.choices[q.answer]}</b><br>${q.explain || ''}`, tag);
          wrong = true;
          b.classList.add('wrong');
          b.disabled = true;
          shake(b);
          fb.className = 'ms-ask-fb bad';
          fb.innerHTML = '❌ Nahi — diagram aur numbers dobara dekho, jawab wahin hai.';
        }
      };
      card.appendChild(b);
    });
    card.appendChild(fb);
    return card;
  }
  AG.askCard = askCard;

  /* =====================================================================
     DRYRUN — ek click = ek badlaav. Ek request/packet/event ka safar.
     stage = { type:'dryrun', title, goal, nodes:[], edges:[], groups?:[],
               panels?:[{id,title}],
               steps:[{ say, flows?:[], nodes?:{id:{tone,badge}}, panels?:{id:[lines]},
                        clock?, ask?:{q,choices,answer,explain} }],
               lesson }
     Node aur panel ki state PICHLE steps se chalti aati hai jab tak badle nahi.
     ===================================================================== */
  AG.renderers.dryrun = function renderDryrun(stage, arena, onDone) {
    const steps = stage.steps || [];
    const answered = {};           /* stepIndex -> firstTry bool (LOCAL) */
    let i = 0, finished = false;

    if (stage.goal) arena.appendChild(goalBox(stage.goal));
    const wrap = el('div', 'dr-wrap');
    const top = el('div', 'dr-top');
    const counter = el('div', 'dr-counter');
    const clock = el('div', 'dr-clock');
    top.append(counter, clock);
    const stageBox = el('div', 'dr-stage');
    const diagram = el('div', 'dr-diagram');
    const panels = el('div', 'dr-panels');
    stageBox.append(diagram, panels);
    const say = el('div', 'dr-say');
    const askSlot = el('div', 'dr-ask');
    const nav = el('div', 'dr-nav');
    const prev = el('button', 'btn ghost dr-prev', '← Pichla step');
    const next = el('button', 'btn big dr-next', 'Agla step →');
    nav.append(prev, next);
    const endSlot = el('div', 'dr-end');
    wrap.append(top, stageBox, say, askSlot, nav, endSlot);
    arena.appendChild(wrap);

    function stateAt(k) {
      const nodes = {}, pans = {};
      let clk = '';
      for (let j = 0; j <= k; j++) {
        const s = steps[j];
        Object.assign(nodes, s.nodes || {});
        Object.assign(pans, s.panels || {});
        if (s.clock) clk = s.clock;
      }
      return { nodes, pans, clk, flows: steps[k].flows || [] };
    }

    function paint() {
      const s = steps[i];
      const st = stateAt(i);
      counter.innerHTML = `Step <b>${i + 1}</b> / ${steps.length}` +
        `<span class="dr-dots">${steps.map((_, k) => `<i class="${k < i ? 'seen' : k === i ? 'on' : ''}"></i>`).join('')}</span>`;
      clock.textContent = st.clk ? '⏱ ' + st.clk : '';
      diagram.innerHTML = AG.viz.svg(stage.nodes || [], stage.edges || [], { nodes: st.nodes, flows: st.flows }, stage.groups);
      panels.innerHTML = (stage.panels || []).map(p => {
        const lines = st.pans[p.id] || [];
        return `<div class="dr-panel"><div class="dr-ptitle">${p.title}</div>` +
          (lines.length ? lines.map(l => `<div class="dr-pline">${l}</div>`).join('') : '<div class="dr-pline muted">—</div>') +
          '</div>';
      }).join('');
      say.innerHTML = s.say || '';
      askSlot.innerHTML = '';
      prev.disabled = i === 0;
      next.disabled = !!(s.ask && answered[i] === undefined);
      next.textContent = i === steps.length - 1 ? 'Dry run poora ✔' : 'Agla step →';
      if (s.ask) {
        if (answered[i] === undefined) {
          askSlot.appendChild(askCard(s.ask, 'dr-opt', '🔍 Dry run', first => {
            answered[i] = first;
            next.disabled = false;
          }));
        } else {
          askSlot.appendChild(el('div', 'ms-ask-fb good', '✅ ' + (s.ask.explain || '')));
        }
      }
    }

    prev.onclick = () => { if (i > 0) { i--; paint(); } };
    next.onclick = () => {
      if (next.disabled) return;
      if (i < steps.length - 1) { i++; paint(); wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (finished) return;
      finished = true;
      nav.style.display = 'none';
      endSlot.appendChild(el('div', 'lab-win', stage.lesson || '✅ Dry run poora.'));
      const asks = Object.keys(answered);
      const firstTry = asks.filter(k => answered[k]).length;
      if (!asks.length) AG.addXP(AG.XP_PER_ITEM);
      const done = el('button', 'btn big dr-done', 'Aage badho →');
      done.onclick = () => { done.disabled = true; onDone({ firstTry: asks.length ? firstTry : 1, total: asks.length || 1 }); };
      endSlot.appendChild(done);
      done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    paint();
  };

  /* =====================================================================
     FLOWLAB — slider ghumao, diagram aur numbers LIVE badlein.
     stage = { type:'flowlab', title, goal, scenario?,
               knobs:[{ id, label, min, max, step, value, unit?, labels?{v:text}, fmt?(v), note? }],
               nodes?:[], edges?:[], groups?:[],          // diagram optional
               model: k => ({ nodes?, flows?, readouts:[{label,value,tone}], bars?:[{label,pct,tone,text}],
                              verdict:{ok,text} }),
               check: k => bool, lesson, quiz?:{q,choices,answer,explain} }
     Validator knob sweep chala ke prove karta hai: goal jeeta ja sakta hai,
     aur shuru mein hi jeeta hua NAHI hai.
     ===================================================================== */
  AG.renderers.flowlab = function renderFlowlab(stage, arena, onDone) {
    const knobs = stage.knobs || [];
    const k = {};
    knobs.forEach(kn => { k[kn.id] = kn.value; });
    let solved = false, touched = false, total = 1, firstTry = 0;

    arena.appendChild(goalBox(stage.goal || 'Knobs ghumao jab tak verdict hara na ho jaaye.'));
    if (stage.scenario) arena.appendChild(el('div', 'lab-scenario', stage.scenario));

    const hasDiagram = (stage.nodes || []).length > 0;
    const panel = el('div', 'fl-panel' + (hasDiagram ? '' : ' no-diagram'));
    const left = el('div', 'fl-left');
    const kWrap = el('div', 'td-knobs');
    const inputs = [];
    knobs.forEach(kn => {
      const row = el('div', 'td-knob');
      const topRow = el('div', 'td-krow');
      topRow.appendChild(el('span', 'td-klabel', kn.label));
      const vv = el('span', 'td-kval', fmtKnob(kn, kn.value));
      topRow.appendChild(vv);
      row.appendChild(topRow);
      const input = el('input', 'td-slider fl-slider');
      input.type = 'range';
      input.min = String(kn.min); input.max = String(kn.max);
      input.step = String(kn.step || 1); input.value = String(kn.value);
      input.addEventListener('input', () => {
        k[kn.id] = Number(input.value);
        vv.textContent = fmtKnob(kn, k[kn.id]);
        touched = true;
        paint();
      });
      inputs.push(input);
      row.appendChild(input);
      if (kn.note) row.appendChild(el('div', 'td-knote', kn.note));
      kWrap.appendChild(row);
    });
    left.appendChild(kWrap);
    const right = el('div', 'fl-right');
    const diagram = el('div', 'fl-diagram');
    const roWrap = el('div', 'td-readouts');
    const barWrap = el('div', 'td-bars');
    const verdict = el('div', 'td-verdict');
    if (hasDiagram) right.appendChild(diagram);
    right.append(roWrap, barWrap, verdict);
    panel.append(left, right);
    arena.appendChild(panel);
    const winSlot = el('div', 'td-win-slot');
    arena.appendChild(winSlot);

    function fmtKnob(kn, v) {
      if (kn.labels && kn.labels[v] != null) return kn.labels[v];
      if (typeof kn.fmt === 'function') return kn.fmt(v);
      return String(v) + (kn.unit || '');
    }

    function paint() {
      const m = stage.model(k) || {};
      if (hasDiagram) diagram.innerHTML = AG.viz.svg(stage.nodes, stage.edges || [], { nodes: m.nodes, flows: m.flows }, stage.groups);
      roWrap.innerHTML = '';
      (m.readouts || []).forEach(r => {
        const c = el('div', 'td-ro ' + (r.tone || ''));
        c.appendChild(el('div', 'td-ro-l', r.label));
        c.appendChild(el('div', 'td-ro-v', r.value));
        roWrap.appendChild(c);
      });
      barWrap.innerHTML = '';
      (m.bars || []).forEach(b => {
        const row = el('div', 'td-bar');
        row.appendChild(el('div', 'td-blabel', b.label));
        const track = el('div', 'td-track');
        const fill = el('div', 'td-fill ' + (b.tone || ''));
        fill.style.width = Math.max(0, Math.min(100, b.pct)) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el('div', 'td-btext', b.text || ''));
        barWrap.appendChild(row);
      });
      const v = m.verdict || { ok: false, text: '' };
      verdict.className = 'td-verdict ' + (v.ok ? 'good' : 'bad');
      verdict.innerHTML = (v.ok ? '✅ ' : '⚠️ ') + v.text;
      if (!solved && touched && stage.check(k)) {
        solved = true;
        firstTry = 1;
        AG.addXP(AG.XP_PER_ITEM);
        win();
      }
    }

    function win() {
      inputs.forEach(inp => { inp.disabled = true; });
      winSlot.appendChild(el('div', 'lab-win', stage.lesson || '✅ Goal poora.'));
      if (stage.quiz) {
        total = 2;
        winSlot.appendChild(askCard(stage.quiz, 'fl-opt', '🎛️ Live lab', first => {
          if (first) firstTry++;
          const nx = el('button', 'btn big fl-next', 'Aage badho →');
          nx.onclick = () => { nx.disabled = true; onDone({ firstTry, total }); };
          winSlot.appendChild(nx);
        }));
      } else {
        const b = el('button', 'btn big fl-next', 'Aage badho →');
        b.onclick = () => { b.disabled = true; onDone({ firstTry, total }); };
        winSlot.appendChild(b);
      }
      winSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    paint();
    /* validator ke liye: knobs set karke paint (DOM events ke bina). Hook ARENA par hai, level data par nahi. */
    arena._flowlabSet = vals => { Object.assign(k, vals); touched = true; paint(); };
  };

  /* =====================================================================
     TRIAGE — symptom milta hai, command palette milti hai. Learner khud
     decide karta hai AGLA command kaunsa; har command apna asli output deta
     hai. Kuch commands clue dete hain, kuch dead-end (dead-end bhi sabak hai).
     Verdict tab khulta hai jab saare clue-commands chal jaayein (ya palette ki
     har command) — isliye lab kisi bhi order mein solvable hai.
     stage = { type:'triage', title, symptom, goal?,
               commands:[{ cmd, out, clue:bool, note }],
               questions:[{ q, choices, answer, explain }] }
     ===================================================================== */
  AG.renderers.triage = function renderTriage(stage, arena, onDone) {
    const cmds = stage.commands;
    const clues = cmds.filter(c => c.clue);
    const ran = new Set();
    let unlocked = false, qi = 0, firstTry = 0;

    const symptom = el('div', 'tg-symptom', `<div class="tg-symptom-h">📟 Symptom</div>${stage.symptom}`);
    const goal = goalBox(stage.goal || 'Pehle diagnose karo, phir root cause batao. Har command ka asli output milega — guess mat karo, output padho.');
    const progress = el('div', 'tg-progress');
    const term = el('div', 'tg-term', '<div class="tg-term-empty">Koi command abhi chalayi nahi. Neeche se ek chuno. 👇</div>');
    const palette = el('div', 'tg-palette');
    const verdictBox = el('div', 'tg-verdict');

    cmds.forEach((c, i) => {
      const btn = el('button', 'tg-cmd', `<code>${escapeHtml(c.cmd)}</code>`);
      btn.dataset.cmd = String(i);
      btn.onclick = () => runCmd(c, btn);
      palette.appendChild(btn);
    });

    function paint() {
      const found = clues.filter(c => ran.has(c.cmd)).length;
      progress.innerHTML =
        `<span class="tg-pill">🔎 Clues mile: <b>${found}/${clues.length}</b></span>` +
        `<span class="tg-pill tg-dim">🖥️ Commands chalayi: <b>${ran.size}/${cmds.length}</b></span>`;
      if (!unlocked && (found === clues.length || ran.size === cmds.length)) {
        unlocked = true;
        verdictBox.appendChild(el('div', 'tg-verdict-h', '🧠 Ab batao — evidence tumhare saamne hai'));
        askQ();
      }
    }

    function runCmd(c, btn) {
      if (ran.has(c.cmd)) return;
      ran.add(c.cmd);
      btn.classList.add('done');
      btn.disabled = true;
      const empty = term.querySelector('.tg-term-empty');
      if (empty && empty.remove) empty.remove();
      const block = el('div', 'tg-block' + (c.clue ? ' is-clue' : ''));
      block.innerHTML =
        `<div class="tg-cmdline">$ ${escapeHtml(c.cmd)}</div>` +
        `<pre class="tg-out">${escapeHtml(c.out)}</pre>` +
        `<div class="tg-note">${c.clue ? '🔎 <b>CLUE</b> — ' : '⚪ '}${c.note}</div>`;
      term.appendChild(block);
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      paint();
    }

    function askQ() {
      const q = stage.questions[qi];
      const holder = el('div', 'tg-q');
      holder.appendChild(el('div', 'quiz-progress', `Sawal ${qi + 1} / ${stage.questions.length}`));
      holder.appendChild(askCard(q, 'tg-opt', '🩺 Triage', first => {
        if (first) firstTry++;
        const nx = el('button', 'btn tg-next', qi + 1 < stage.questions.length ? 'Agla sawal →' : 'Diagnosis band karo ✓');
        nx.onclick = () => {
          nx.disabled = true;
          qi++;
          if (qi < stage.questions.length) askQ();
          else onDone({ firstTry, total: stage.questions.length });
        };
        holder.appendChild(nx);
        nx.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
      verdictBox.appendChild(holder);
      holder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    arena.append(symptom, goal, progress, term, el('div', 'tg-palette-h', '🖥️ Kaunsa command chalaoge?'), palette, verdictBox);
    paint();
  };

  /* =====================================================================
     DOCKER — laptop par asli `aws` CLI + Terraform, local AWS emulator (Moto)
     ke against. Bill $0, kuch bhi tod sakte ho.
     stage = { type:'docker', title, project, exercise?, goal, why?,
               steps:[{ text, cmd?, expect? }], observe:{q,choices,answer,explain} }
     Hum tumhare laptop ka output check nahi kar sakte — isliye har step ke saath
     "kya dikhna chahiye" (asli captured output) diya hai, aur aakhir mein ek
     sawal jiska jawab chala ke hi pakka pata chalta hai.
     ===================================================================== */
  AG.renderers.docker = function renderDocker(stage, arena, onDone) {
    const steps = stage.steps || [];
    const ticked = steps.map(() => false);
    let asked = false;

    arena.appendChild(goalBox(stage.goal));
    arena.appendChild(el('div', 'dk-where',
      `📁 <code>aws-gurukul/docker-labs/${escapeHtml(stage.project)}</code>` +
      (stage.exercise ? ` · exercise <code>${escapeHtml(stage.exercise)}</code>` : '') +
      `<div class="dk-note">Pehli baar? <code>docker-labs/README.md</code> padho — emulator do tarah se chalta hai: ` +
      `<code>docker compose up -d</code> (Docker ho toh) ya <code>./start-moto.sh</code> (sirf Python, Docker nahi chahiye). ` +
      `Har command asli <code>aws</code> CLI hai — sirf <code>--endpoint-url</code> laptop ki taraf point karta hai.</div>`));
    if (stage.why) arena.appendChild(el('div', 'lab-scenario', stage.why));

    const list = el('ol', 'dk-steps');
    steps.forEach((s, idx) => {
      const li = el('li', 'dk-step');
      li.appendChild(el('div', 'dk-text', s.text));
      if (s.cmd) {
        const row = el('div', 'dk-cmdrow');
        row.appendChild(el('pre', 'dk-cmd', escapeHtml(s.cmd)));
        const copy = el('button', 'btn ghost small dk-copy', '📋 Copy');
        copy.onclick = () => {
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(s.cmd);
            copy.textContent = '✅ Copied';
          } catch (e) { copy.textContent = 'Select karke copy karo'; }
        };
        row.appendChild(copy);
        li.appendChild(row);
      }
      if (s.expect) {
        const ex = el('details', 'dk-expect');
        ex.innerHTML = `<summary>👀 Kya dikhna chahiye? (asli run ka output)</summary><pre>${escapeHtml(s.expect)}</pre>`;
        li.appendChild(ex);
      }
      const tick = el('button', 'btn small dk-tick', '✔ Ho gaya');
      tick.onclick = () => {
        ticked[idx] = !ticked[idx];
        tick.className = 'btn small dk-tick' + (ticked[idx] ? ' good' : '');
        tick.textContent = ticked[idx] ? '✅ Ho gaya' : '✔ Ho gaya';
        li.className = 'dk-step' + (ticked[idx] ? ' done' : '');
        if (ticked.every(Boolean)) { skip.remove(); ask(); }
      };
      li.appendChild(tick);
      list.appendChild(li);
    });
    arena.appendChild(list);
    const askSlot = el('div', 'dk-ask');
    arena.appendChild(askSlot);
    const skip = el('button', 'btn ghost small dk-skip', 'Abhi laptop paas nahi — sawal pehle dekh lo');
    skip.onclick = () => { skip.remove(); ask(); };
    arena.appendChild(skip);

    function ask() {
      if (asked) return;
      asked = true;
      askSlot.appendChild(askCard(stage.observe, 'dk-opt', '🐳 Docker lab', first => {
        const done = el('button', 'btn big dk-done', 'Aage badho →');
        done.onclick = () => { done.disabled = true; onDone({ firstTry: first ? 1 : 0, total: 1 }); };
        askSlot.appendChild(done);
      }));
    }
  };
})();
