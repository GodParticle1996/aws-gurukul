# AWS Gurukul 🛕 — Extending Guide

Yeh app **ever-extending** banaya gaya hai. Naya concept, level, ya game add karna
chaaho toh neeche diye steps follow karo. Pattern same rahega, toh engine
break nahi hoga.

---

## 0. File Map (kuch bhi change karne se pehle)

```
awsgurukul/
├── index.html              ← script load order (CRITICAL — neeche dekho)
├── style.css               ← AWS theme + .dg-* diagram primitives
├── core.js                 ← AG namespace, state, XP, ranks, streak, spaced repetition, registry
├── data-core.js            ← RANKS[] + AG.tracks[] (4 tracks)
├── visuals.js              ← VISUALS[id] = { t, html } — 38 concept diagrams
├── games.js                ← AG.renderers — bins/fill/order/match/quiz/hotspot/incident
├── awscli.js               ← AG.renderers.terminal — AWS CLI + Terraform simulator
├── data-beginner.js        ← Track 1 (8 levels)
├── data-intermediate.js    ← Track 2 (11 levels)
├── data-advanced.js        ← Track 3 (10 levels)
├── data-architect.js       ← Track 4 (9 levels — decision-first)
├── validate.js             ← offline full-app validator (node validate.js)
├── app.js                  ← screens: home/track/level/interview/dojo/certs
├── gallery.html            ← saare diagrams ek page par
├── README.md               ← overview + run instructions
└── PLAN.md                 ← original design doc
```

### Load order (index.html) — KABHI bhi change mat karna

```
core.js → data-core.js → visuals.js → games.js → awscli.js
       → data-beginner.js → data-intermediate.js → data-advanced.js
       → data-architect.js → app.js
```

**Kyun?**
- `games.js` creates `AG.renderers = {}` and top-level `const el/escapeHtml/shake`
  → `awscli.js` adds `AG.renderers.terminal`, `app.js` uses `el`/`escapeHtml`/`shake`.
- `data-*.js` call `AG.registerLevels()` → must load after `core.js`.
- `app.js` boots the app → must load **last**.

⚠️ **`const el/escapeHtml/shake` ko app.js mein redeclare mat karna** —
games.js already top-level `const` declare karta hai. Classic scripts mein
same global lexical scope share hota hai → redeclaration = `SyntaxError:
Identifier 'el' has already been declared` → app crash.

---

## 1. Naya Level Add Karna (Track ke andar)

### Step 1 — VISUALS entry banao (visuals.js)

```js
'mynewlevel': {
  t: 'My New Level — Title',
  html: `
    <div class="dg-flow">
      <div class="dg-node" data-hs="node1">Node 1</div>
      <div class="dg-arrow">→</div>
      <div class="dg-node" data-hs="node2">Node 2</div>
    </div>
  `
},
```

**Rules:**
- Key = level `id` (lowercase, no spaces, matches `data-*.js`).
- Hotspot games ke liye `data-hs="uniqueid"` lagao us node pe jo clickable hona chahiye.
- Use only `.dg-*` primitives (see §5 below) — no custom CSS classes.

### Step 2 — Level object banao (data-{track}.js)

```js
AG.registerLevels('beginner', [
  // ...existing levels...
  {
    id: 'mynewlevel',            // MUST match VISUALS key
    icon: '🎯',
    title: 'My New Level',
    badge: 'Newbie Master',
    objectives: [                  // array of HTML strings (intro par bullets)
      '<b>Objective 1</b> — kya seekhoge',
      '<b>Objective 2</b> — kya seekhoge',
    ],
    lesson: [                      // array of HTML STRINGS (objects nahi!)
      `<h3>📖 Topic Heading</h3>
       <p>Hinglish explanation... <code>inline code</code> bhi chalega.</p>
       <table><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>y</td></tr></table>`,
      `<h3>⚡ Real Example</h3>
       <p>...</p>
       <div class="war-story"><b>⚡ Real incident:</b> production se sacchi kahani —
       kya toota, kyun toota, kya seekha.</div>`,
    ],
    stages: [
      { type: 'quiz', title: '...', questions: [...] },
      { type: 'hotspot', title: '...', visual: 'mynewlevel', questions: [...] },
      // see §2 for all game types
    ],
    interview: {
      title: 'Interview Round — My New Level',
      instructions: 'Round ka intro. 🎤',
      questions: [
        { q: 'Interview question?', choices: ['a','b','c','d'], answer: 1, explain: '...' },
        // OR a hands-on terminal task (same shape as the `terminal` stage, §2):
        { terminal: { goal: '...', account: {...}, tasks: [...], success: s => ..., hints: [...] } },
      ],
    },
    success: [                     // completion checklist
      'Main <concept> explain kar sakta hoon',
      'Main <decision> justify kar sakta hoon',
    ],
    homework: `<p>Optional Free Tier practice (HTML string):</p><pre>aws s3 ls</pre>`,
    cards: [                       // Revision Dojo flashcards — front/back, NOT t/b
      { front: 'Sawal ya concept?', back: 'Jawab. <b>HTML</b> allowed.' },
    ],
  }
]);
```

**Field-name traps (engine inhi naamo ko padhta hai):**

| Field | Sahi shape | Galat (kaam nahi karega) |
|-------|-----------|--------------------------|
| `lesson` | `['<h3>..</h3><p>..</p>', ...]` — HTML strings | `[{ h, b, callout }]` |
| `cards` | `[{ front, back }]` | `[{ t, b }]` |
| `objectives` / `success` | array of HTML strings | objects |
| `homework` | ek HTML string | array |

War story ke liye `<div class="war-story">` use karo — `callout:` naam ka koi
field engine mein hai hi nahi.

### Step 3 — Verify
```bash
cd awsgurukul
node --check data-beginner.js     # ya relevant track file
# Combined check (catches cross-file redeclaration):
cat core.js data-core.js visuals.js games.js awscli.js \
    data-beginner.js data-intermediate.js data-advanced.js data-architect.js app.js > /tmp/c.js
node --check /tmp/c.js

# Ya sab kuch ek saath (recommended) — syntax, duplicates, schemas,
# saare terminal missions, fill stages, boot, CSS classes, ranks:
node validate.js
```

### Step 4 — Browser test
Serve the folder (`python3 -m http.server 4040`) and open in browser. Navigate
to the new level, complete all stages + interview, verify XP + badge award.

---

## 2. Game Types (stages mein use hone wale)

Har game `AG.renderers[type]` se render hota hai (games.js mein defined).

### `quiz` — Multiple Choice
```js
{ type: 'quiz', questions: [
  { q: 'Question text?', choices: ['A','B','C','D'], answer: 2, explain: 'Kyun B sahi hai',
    context: 'optional code/policy text' }
]}
```
- `answer` is **0-indexed**.
- `context` (optional) renders as `<pre>` block above choices.

### `fill` — Drag Tokens into Blanks (Terraform / CFN / JSON)
```js
{ type: 'fill', title: 'Terraform: EFS banao', instructions: 'Tokens ko blank mein drag karo.',
  template: `resource "aws_efs_file_system" "shared" {
  performance_mode = "{0}"
  transition_to_ia = "{1}"
}`,
  tokens: ['generalPurpose', 'AFTER_30_DAYS', 'maxIO', 'AFTER_7_DAYS'],   // distractors zaroor daalo
  blanks: [
    { answer: 'generalPurpose', explain: 'Kyun yeh sahi hai...' },
    { answer: 'AFTER_30_DAYS',  explain: 'Kyun yeh sahi hai...' },
  ],
}
```
- Template mein placeholder `{0}`, `{1}`, ... — **index `blanks[]` ka index hai**.
- Har `blanks[i].answer` `tokens[]` mein maujood hona chahiye (warna blank kabhi bharega hi nahi).
- Ek hi index template mein do baar likh sakte ho (e.g. `from_port = {3}` aur `to_port = {3}`).
- `tokens` mein duplicate strings mat rakho — chip match ambiguous ho jaata hai.
- Template ek JS template literal hai: `${...}` ko `\${...}` likhna padega (CFN `!Sub` mein aksar aata hai).

### `order` — Sahi Sequence Banao
```js
{ type: 'order', title: 'Lifecycle rule — data ki umar', instructions: '...',
  steps: [                          // `items` NAHI — `steps`
    { text: 'Day 0-30: Standard',   explain: 'Naya data, frequent access.' },
    { text: 'Day 30-90: Standard-IA', explain: 'Access kam ho gaya.' },
  ],
}
```
- Array ka order hi sahi jawab hai; user ko chips shuffled dikhte hain.
- Har step par `explain` **zaroori** hai — sahi drop par wahi subtitle mein dikhta hai.

### `match` — Jodi Milao
```js
{ type: 'match', title: '...', pairs: [
  { left: '📨 SQS', right: 'Buffer + retry, ek consumer group', explain: 'Kyun yeh jodi bani...' },
  { left: '📢 SNS', right: 'Fan-out — sab subscribers ko push',  explain: '...' },
]}
```
- `explain` chhoda toh sahi match par feedback mein `undefined` chhap jaayega.
- Do pairs ka `right` bilkul same text mat rakho — ambiguous ho jaata hai.

### `bins` — Categories mein Sort Karo
```js
{ type: 'bins', title: '...', instructions: '...',
  bins: [
    { id: 'storage', label: '🪣 Storage' },
    { id: 'compute', label: '🖥️ Compute' },
  ],
  items: [
    { text: 'S3',  bin: 'storage', explain: 'Object storage — HTTP API se.' },
    { text: 'EC2', bin: 'compute', explain: 'Virtual machine.' },
  ],
}
```
- Har item ka `bin` kisi bin ke `id` se match hona chahiye.
- Har bin mein kam se kam ek item ho (khaali bin confusing lagta hai).
- `explain` har item par chahiye — sahi drop par feedback wahi dikhata hai.

### `hotspot` — Click the Diagram
```js
{ type: 'hotspot', visual: 'levelid', questions: [
  { q: 'Yeh kya hai?', target: 'node1', explain: 'Sahi! Yeh node 1 hai.' }
]}
```
- `visual` = VISUALS key (level id).
- `target` = value of `data-hs` attribute in the visual's HTML.
- ⚠️ **`target` MUST exist as a `data-hs` in the visual** — warna question unanswerable!

### `incident` — 3AM Pager Decision Tree (Boss levels)
```js
{ type: 'incident', title: '...', instructions: '...',
  pager: '<b>prod-alb</b> 5xx spike — 42% requests failing',   // pager card ka HTML
  start: 'triage',                                             // top-level, `tree` nahi
  nodes: {
    triage: {
      sitrep: 'Optional situation update HTML',
      text: 'Pehla kadam kya?',
      choices: [
        { t: 'CloudWatch alarms + target health dekho', good: true,  next: 'scale',
          explain: 'Pehle observe, phir act.' },
        { t: 'Seedha sab restart kar do', good: false,
          explain: 'Blind restart evidence mita deta hai.' },
      ],
    },
    scale: {
      text: 'Targets unhealthy hain. Ab?',
      choices: [
        { t: 'ASG desired capacity badhao', good: true, next: 'done', explain: '...' },
        { t: 'Ignore karo', good: false, explain: '...' },
      ],
    },
    done: { end: true, text: 'Incident resolved 🧯', summary: 'Kya seekha... (HTML)' },
  },
}
```
- `start`, `nodes`, `pager` **top-level** hote hain — koi `tree` wrapper nahi.
- Choice ka text field `t` hai (`text` nahi). Sahi choice = `good: true` + `next`.
- Galat choices par sirf `explain` — woh wrong-answer feedback banta hai.
- Har non-end node par **kam se kam ek `good: true`** choice honi chahiye, warna dead-end.
- Har `good` choice ka `next` `nodes` mein exist karna chahiye, aur kam se kam ek
  `{ end: true, text, summary }` node reachable hona chahiye.

### `terminal` — AWS CLI / Terraform Hands-On
```js
{ type: 'terminal', title: '🖥️ Mission: ...', instructions: '...',
  goal: 'Mission ka HTML — kya karna hai, step by step.',   // goal ZAROORI hai (warna "undefined" chhapega)
  account: {                       // sab collections ARRAYS hain — objects/maps nahi
    region: 'us-east-1',
    callerIdentity: { Account: '123456789012', UserId: 'AIDAX', Arn: 'arn:aws:iam::...' },
    buckets: [{ name: 'my-bucket', encryption: false, public: true, objects: [] }],
    users:   [{ name: 'ravi', attachedPolicies: ['AdministratorAccess'] }],
    // poori shape awscli.js ke top wale comment mein documented hai
  },
  tasks: [                         // checklist — strings nahi, { text, check } objects
    { text: 'aws s3 ls — buckets list', check: s => s.history.some(h => /aws s3 ls/.test(h)) },
  ],
  success: s => s.account.buckets.find(b => b.name === 'my-bucket').encryption === true,
  successText: '🎉 Kya seekha — HTML.',
  hints: ['pehla hint', 'doosra hint'],      // har hint −5 XP
}
```
- `success(sim)` har command ke baad chalti hai. `sim.history` = typed commands (whitespace-normalized),
  `sim.account` = live mock state (commands ise mutate karte hain).
- **Behtar mission state check karta hai, sirf history nahi** — "user ne yeh type kiya"
  se "user ne yeh theek kiya" zyada sikhata hai.
- `tasks[i].check(sim)` true hote hi woh line tick ho jaati hai (live feedback).
- Mission ke andar naya resource banwana ho (e.g. `aws sqs create-queue`) toh account mein
  us collection ko `[]` se initialise kar dena behtar hai — waise bhi `list()` auto-create
  kar leta hai, par explicit shape padhne mein saaf lagta hai.
- **Terraform / file-apply missions** — `files` do:
  ```js
  files: {
    'main.tf':      { desc: 'main.tf — 1 VPC', apply: sim => { sim.account.vpcs = [...]; return '1 resource created'; } },
    'fix-sg.json':  { desc: 'SG se 0.0.0.0/0 hataata hai', apply: sim => { ...; return 'SG fixed'; } },
  }
  ```
  `.tf`/`.hcl` files `terraform apply` se chalti hain; baaki koi bhi file
  `apply -f <filename>` se. User `ls` se files dekh sakta hai.
- Command ko poori tarah script karna ho toh `responses: [{ re: /regex/, out, mutate, err }]`
  use karo — yeh normal parser se **pehle** match hote hain.

---

## 3. Naya Track Add Karna

Agar beginner/intermediate/advanced ke alawa ek aur track chahiye (e.g. "Specialty" ya "DevOps"):

### Step 1 — data-core.js mein track add karo

`AG.tracks` ek **array** hai (object map nahi) — order hi unlock order hai:

```js
AG.tracks = [
  { id: 'beginner', ... },
  { id: 'intermediate', ... },
  { id: 'advanced', ... },
  {
    id: 'devops',
    icon: '🔧',
    name: 'DevOps — Karmayogi Path',
    blurb: 'Track card par dikhne wali ek line.',
    certTitle: 'AWS DEVOPS KARMAYOGI',
    certSub: 'Certificate of Continuous Delivery',
    motto: 'Automate everything, sleep peacefully.',
    formula: 'Code → Build → Test → Deploy → Monitor',
  },
];
```

`levels` yahan **nahi** likhte — woh `AG.levelSets[trackId]` se lazily resolve hote
hain, jo `AG.registerLevels()` bharta hai. Track tabhi unlock hota hai jab pichhla
track 100% complete ho (`AG.trackUnlocked`).

### Step 2 — Naya data file banao
`data-devops.js` banao, `AG.registerLevels('devops', [...])` call karo.

### Step 3 — index.html mein add karo (load order!)
```html
<script src="data-devops.js"></script>   <!-- BEFORE app.js -->
<script src="app.js"></script>
```

### Step 4 — VISUALS entries banao (visuals.js) for each new level.

---

## 4. Naya AWS Service Simulator Command Add Karna (awscli.js)

`exec()` ke andar ek `switch (service)` hai — usme naya `case` add karo. Sabhi
collections **arrays** hoti hain, aur output real AWS CLI ke JSON jaisa dikhna
chahiye (user ko asli output padhna seekhna hai):

```js
// exec() ke switch (service) block mein, CONFIGURE se pehle:
case 'myservice':
  if (op === 'list-things') {
    const things = list('things');            // list() auto-create karta hai
    if (!things.length) return print('ok', '{\n    "Things": []\n}');
    print('ok', '{\n    "Things": [\n' +
      things.map(t => `        { "ThingName": "${t.name}", "Status": "${t.status}" }`).join(',\n') +
      '\n    ]\n}');
  } else if (op === 'create-thing') {
    const name = flag('thing-name');
    if (!name) return print('err', 'error: --thing-name required');
    const things = list('things');
    if (things.find(t => t.name === name))
      return print('err', `ResourceAlreadyExistsException: '${name}' already exists`);
    things.push({ name, status: 'ACTIVE' });
    print('ok', `{ "ThingName": "${name}", "Status": "ACTIVE" }`);
  } else {
    print('err', `unknown MyService op: ${op}`);
  }
  return;
```

Phir `help` wali list mein bhi ek line add kar do, warna user ko pata hi nahi
chalega ki command exist karta hai.

**Helpers available inside exec():**
- `service` = `toks[1]`, `op` = `toks[2]` (e.g. `aws s3api get-bucket-encryption` →
  service `s3api`, op `get-bucket-encryption`).
- `toks` — `norm.split(' ')` (whitespace-normalized command tokens).
- `flag('name')` — `--name <value>` ka value, warna `null`.
- `list('kind')` — `sim.account.kind` array (missing ho toh bana deta hai, taaki
  `push` kiya hua resource gum na ho).
- `find('kind', nameOrId)` — exact `name`/`id` match, warna prefix match.
- `print(kind, text)` — kind: `'ok'` (white/green output) | `'err'` (red) |
  `'sys'` (dim system note) | `'hint'` (gold). Aur koi kind styled nahi hai.
- `table(rows)`, `prettyJson(obj)` — formatting helpers.
- `sim.account` — mock state (freely mutate). `sim.history` — typed commands.
- `sim.files` — Terraform/apply-able files.

⚠️ `execTerraform()` `exec()` se **bahar** ek alag function hai — uske andar
`toks`/`flag()` available nahi hain, wahan `norm` khud parse karo.

---

## 5. Diagram Primitives (style.css mein defined)

Sirf in classes ka use karo VISUALS HTML mein:

| Class | Purpose |
|-------|---------|
| `.dg-flow` | Horizontal flow container (flex row) |
| `.dg-col` | Vertical column |
| `.dg-split` | Two-column split |
| `.dg-stack` | Vertical stack with gap |
| `.dg-box` | Bordered container (e.g. AZ, region) |
| `.dg-box.is-good` | Green-bordered box |
| `.dg-box.is-gold` | Gold-bordered box (highlight) |
| `.dg-box.is-bad` | Red-bordered box (danger) |
| `.bx-label` | Label inside a `.dg-box` |
| `.dg-node` | A node (service/resource) |
| `.dg-node.is-good` / `.is-gold` / `.is-bad` | Node color variants |
| `.dg-node.pulse` | Pulsing animation (active node) |
| `.dg-pill` | Small pill/badge |
| `.dg-arrow` | Horizontal arrow (→) |
| `.dg-down` | Down arrow (↓) |
| `.dg-link` | Connector line between nodes |
| `.dg-ladder` | Tiered ladder (for storage classes, etc.) |
| `.dg-rung` | A rung on the ladder |
| `.dg-cap` | Caption text |
| `.dg-title` | Section title inside a diagram |
| `.dg-grid` | CSS grid container (for matrix/scatter layouts) |
| `.dg-legend` | Legend row — use with `.dg-dot` spans for color keys |
| `.dg-dot` | Small color square (legend swatch) |
| `.dg-rule` | Inline rule/tag row (flex, wraps) — `.tag` children for code-style chips |
| `.dg-toggle` | Clickable toggle chip (hover → accent border) |
| `.dg-float` | Gentle floating animation (use on nodes that should feel "alive") |
| `data-hs="id"` | Marks a node as hotspot-clickable (id used by hotspot game `target`) |

**Color variants:** `is-good` (green), `is-gold` (gold), `is-bad` (red),
`.pulse` (pulsing active node), `.dg-float` (gentle float). Combine freely.

**Legend pattern:** `.dg-legend` wraps `.dg-dot` + label spans for color keys
under a diagram. `.dg-rule` wraps `.tag` chips for rule/code highlights.
`.dg-toggle` is for interactive toggles (pair with JS if needed).

---

## 6. Ranks & XP (data-core.js)

```js
const RANKS = [
  { name: 'Cloud Newbie', xp: 0 },
  { name: 'Bucket Filler', xp: 100 },
  // ...
  { name: 'Solutions Architect', xp: 2600 },
];
```

Naya rank add karne ke liye: array mein object add karo, `xp` threshold ascending
order mein rakhna. `core.js` ka `currentRank(xp)` sabse highest matching rank
return karta hai.

---

## 7. Spaced Repetition (core.js)

Flashcards (`cards[]` in level data) automatically spaced repetition mein jaate
hain. Algorithm: SM2-inspired.
- Card har review ke baad next review time calculate hota hai.
- Sahi answer → interval badhta hai (1d → 3d → 7d → 14d → 30d).
- Galat answer → interval reset to 1d.
- "Dojo" screen mein due cards dikhte hain.

Naye cards add karne ke liye bas level data mein `cards: [...]` add karo —
engine automatically pick up kar lega.

---

## 8. Testing Checklist (naya content add karne ke baad)

1. **Syntax check** (per-file):
   ```bash
   node --check data-newtrack.js
   ```

2. **Combined syntax check** (catches cross-file `const` redeclaration):
   ```bash
   cat core.js data-core.js visuals.js games.js awscli.js \
       data-beginner.js data-intermediate.js data-advanced.js \
       data-newtrack.js app.js > /tmp/c.js && node --check /tmp/c.js
   ```

3. **Hotspot target cross-check**:
   ```bash
   # All targets must exist as data-hs in visuals.js
   grep -oP "target: '[a-z0-9]+'" data-newtrack.js | sort -u
   grep -oP 'data-hs="[a-z0-9]+"' visuals.js | sort -u
   ```

4. **Level ID cross-check**:
   ```bash
   # Level IDs must match VISUALS keys
   grep -oP "^\s+id: '[a-z0-9]+'," data-newtrack.js
   ```

5. **Browser test**: Serve folder, open in Chrome, navigate to new levels,
   complete all stages + interview, verify XP/badge/streak update.

---

## 9. Common Pitfalls ⚠️

1. **`const el/escapeHtml/shake` redeclaration** — app.js mein redeclare mat karo
   (games.js already declares at top level). = `SyntaxError`.

2. **Load order** — `games.js` BEFORE `awscli.js` BEFORE `app.js`. `data-*.js`
   BEFORE `app.js`. `core.js` sabse pehle.

3. **Hotspot `target` mismatch** — `target: 'xyz'` in data file must have
   `data-hs="xyz"` in the visual. Otherwise question is unanswerable.

4. **`answer` index out of bounds** — quiz `answer: N` must be `< choices.length`.

5. **Bins `bin` mismatch** — item `bin` must match a bin `id`.

6. **Incident tree non-terminating** — every path must eventually hit a `target`
   (true/false). Infinite `next` loops = broken game.

7. **Terminal `success()` unachievable** — make sure the commands needed to
   satisfy `success()` are actually supported by the awscli.js simulator.

8. **`<pre>` inside `q` string** — use the `context` field for code blocks,
   don't embed `<pre>` in the question text (causes duplicate display).

---

## 10. Quick Reference — File Touch Summary

| You want to... | Edit this file |
|----------------|----------------|
| Add a level | `data-{track}.js` + `visuals.js` |
| Add a track | `data-core.js` + new `data-{track}.js` + `index.html` |
| Add a diagram type | `style.css` (new `.dg-*` primitive) |
| Add an AWS CLI command | `awscli.js` (in `exec()`) |
| Add a game type | `games.js` (`AG.renderers.newtype = ...`) |
| Add a rank | `data-core.js` (`RANKS[]`) |
| Add an AWS CLI service | `awscli.js` (new `case` in `switch(service)`) |
| Change theme/colors | `style.css` (`:root` variables) |
| Change a screen's layout | `app.js` (screen render functions) |

---

**Happy architecting! 🛕** — AWS Gurukul
