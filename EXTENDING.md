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
├── visuals.js              ← VISUALS[id] = { t, html } — 41 concept diagrams
├── games.js                ← AG.renderers — bins/fill/order/match/quiz/hotspot/incident
├── awscli.js               ← AG.renderers.terminal — AWS CLI + Terraform simulator
├── data-beg-1-*.js … data-beg-8-*.js ← Track 1 (8 separate level files)
├── data-int-*.js           ← Track 2 (12 levels)
├── data-adv-*.js           ← Track 3 (12 levels)
├── data-arch-*.js          ← Track 4 (9 levels — decision-first)
├── validate.js             ← offline full-app validator (node validate.js)
├── app.js                  ← screens: home/track/level/interview/dojo/certs
├── gallery.html            ← saare diagrams ek page par
├── README.md               ← overview + run instructions
└── PLAN.md                 ← original design doc
```

### Load order

`index.html` mein browser ka order hai. `validate.js` ke `ENGINE` aur `DATA` arrays usi order mein scripts load karte hain.

1. `core.js`, `data-core.js`, `visuals.js`, `games.js` aur `awscli.js`.
2. Topic ke CLI fixtures, phir `labs.js`, `decisions.js`, navigation aur study tools. Lab Hub ke pehle `labs-index.js` load hota hai.
3. Soch cases, har track ke numbered level files aur Decision Dojo trees.
4. `app.js` sab data milne ke baad progress padhta hai aur pehli screen kholta hai.

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

### Step 2 — Level ka data

Har level ka apna numbered file hota hai, jaise `data-arch-1-compute.js`. File `AG.registerLevels(trackId, [level])` se level jodta hai. Browser aur validator ke manifests mein usi track order par file jodo. Published level ka `id` uske saved stars, cards aur resume point se juda hai.

| Field | Engine kya padhta hai |
|---|---|
| `id, icon, title, badge` | Level ki pehchaan, map aur completion |
| `hook` | Story ke `when, title, text`. Fiction ko ShopKaro ya PixShare story bataao. |
| `objectives, success` | Chhoti lines ki arrays |
| `steps` | Har card ka `q`, phir `analogy, body, points, asli`. Search bhi in fields ko padhta hai. |
| `myth, playbook, exam` | Myth mein `myth, sach`. Playbook mein `title, use, avoid, how, redflags, rule`. Exam cues mein `cue, pick` aur optional `why`. |
| `stages` | Part 1 dry run se shuru hota hai. Pehla `triage` Part 2 ka save point hai. Dono taraf kam se kam ek challenge rakho. |
| `interview` | `questions` mein single-choice sawaal aur `{terminal: mission}` aa sakte hain. App ise aakhri challenge banaata hai. |
| `cards, homework` | Revision cards ke `front, back`. Optional homework mein kharcha aur cleanup bataao. |

Quiz aur interview ke har MCQ ka `domain` likho. Naye sawaalon ke liye `secure`, `resilient`, `high-performing` ya `cost-optimized` chuno. SAA mock learner ke abhi tak band levels se bhi sawaal leta hai. Sahi choice ki position aur lambai ko baaki choices se milaao.

### Step 3 — Verify

Repo root se chalao.

```bash
node --check data-arch-1-compute.js
node validate-compute.js
node validate.js
```

Naya validator `validate-<topic>.js` mein rakho. Achha raasta, galat input, ek zaroori step chhodna aur replay chalao. Full runner se usi suite ko bulaao. App boot, dono parts ka save point, mock domains aur Lab Hub ko bhi full runner check karta hai.

### Step 4 — Browser test
Serve the folder (`python3 -m http.server 4040`) and open in browser. Navigate
to the new level, complete all stages + interview, verify XP + badge award.

---

## 2. Game Types (stages mein use hone wale)

Har game `AG.renderers[type]` se render hota hai.

### Interactive labs aur stage schema

| Type | Zaroori fields aur learner ka kaam |
|---|---|
| `dryrun` | `nodes, edges, steps, lesson`. Har step ka `say` aur badli hui state do. `ask` ek choice rok kar check kar sakta hai. Intro isi data se scene chalaata hai. |
| `flowlab` | `knobs, model(k), check(k), lesson`. Model readouts aur verdict deta hai. Kam se kam ek winning aur ek failing setting check karo. |
| `triage` | `symptom, commands, questions`. Command mein `cmd, out, clue, note` aate hain. Clues milne ke baad learner wajah chunta hai. |
| `docker` | `project, goal, steps, observe`. Project ka folder `docker-labs/` mein ho. Step mein `text` aur zaroorat par `cmd, expect` hote hain. `observe` ka jawab actual run se milna chahiye. |
| `interview` | App level ke `interview` se banaata hai. Isko `stages` mein dobara mat jodo. |

### Decision Dojo tree

`AG.registerDecisions([tree])` se tree jodo. `id, title, icon, levels, start` aur `nodes` do. Question node ke `options` mein `{t, next}` agle node ki ID tak le jaata hai. Leaf mein `leaf: true, pick, one, when, avoid` do. `cost, exam, gotchas, iac` jaise fields aur detail dete hain. Scenario mein `s, answer, explain` rakho. `answer` start se pahunchne waali leaf ka ID hai. Search aur cheatsheet registered leaves khud padhte hain. [Compute tree examples](data-decisions-compute.js)

### `decide` — Decision Dojo ki practice level ke andar

```js
{ type: 'decide', title: 'Kaam kahan chale?', tree: 'compute', scenarios: 4 }
```

`tree` ek registered Decision Dojo tree ka ID hai. `scenarios` 1 se tree ke total scenarios tak rakho. `decisions.js` har run mein alag scenarios chunta hai. Pehli koshish par sahi jawaab ko stage XP milta hai. Level ki practice standalone Dojo ka best score alag rakhti hai.

### `quiz` — ek ya kai jawaab

Har question mein `q, choices, answer, explain, domain` hote hain. Optional `context` code ya command output dikhaata hai. Ek sahi choice ke liye zero-based index do. Do sahi choices ke liye, jaise `answer: [0, 2]`, kam se kam paanch choices do. Quiz poora set milne par aage badhta hai. Mock exam mein feedback submit ke baad milta hai. [Question examples](mockexam.js)

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
    { text: 'Bucket par encryption chalu hai', check: s => s.account.buckets.some(b => b.name === 'my-bucket' && b.encryption) },
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
- Fixture files ko real CLI syntax se padho, jaise `--policy file://policy.json`. Terraform missions mein `terraform plan` aur `terraform apply` ki state check karo. `solution` mein runnable commands rakho. Intentional error ho to us step par expected error bhi do.
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

## 8. Naye content ki jaanch

1. Badle hue file par `node --check` chalao. Topic ka focused validator chalao.
2. `node validate.js` poora manifest ek saath parse karta hai. Level IDs, hotspot targets, quiz domains, mock forms, Lab Hub, cheatsheet aur do hisson ke save points bhi check hote hain.
3. Browser mein naya level khelo. Part 1 par ruko, reload karo aur Part 2 poora karo. XP, badge, stars aur certificate dekho. Release sweep ki command [README](README.md) mein hai.
4. Local lab apne emulator par chalao. README ke expected output aur aakhir ke cleanup ko actual run se milaao.

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

---

## 11. 🧯 Real labs (`docker-labs/`) — review ke notes (2026-11-11)

Is din saare 27 labs README ke commands se dobara chalaye gaye (Moto 5.2.4, Docker ke bina; Terraform labs 05, 08, 20, 26
local Terraform 1.17.0 + cached AWS provider 6.70.0 se). Sab chale. Ek design galti mili aur theek hui (11.1).
Naya lab likhne ya purana badalne se pehle yeh padho.

Nayi lab ka apna numbered folder, README aur scoped cleanup rakho. Jo Python runner apna Moto chalaata hai woh loopback par free port le, dummy credentials aur lab-local config use kare, aur aakhir mein apna listener band kare. README mein actual output aur Moto ki limits bataao. Har lab ke liye [lab table](docker-labs/README.md) mein link aur `labs-index.js` mein README title, pehla setup block aur ek line ki limit rakho. Setup block repo root se chalna chahiye. `node validate-labhub.js` file, folder aur stage ko milaata hai.

### 11.1 Emulator "haan" bole aur asli AWS "na" — toh lab asli AWS ka kram follow kare

- **Galti (lab 06):** ex3 ek aise source se read replica banata tha jiska master password RDS khud manage karta hai
  (`--manage-master-user-password`). Moto replica bana deta hai. Asli RDS PostgreSQL/MySQL/MariaDB/Oracle use **reject**
  karta hai (apvaad: SQL Server, Db2). Chetavni README ke sabse neeche "limits" mein thi, command ke paas nahi.
- **Fix:** ex3 ab pehle `modify-db-instance --no-manage-master-user-password --master-user-password "$VAR"` chalata hai
  (password shell variable mein, history mein nahi), phir replica banata hai. Rule usi step ke upar likha hai.
- **Niyam:** jab Moto koi aisa call maan le jo asli AWS nahi maanta, toh do mein se ek karo:
  1. flow ko asli AWS ke valid kram mein badlo (pehli pasand), ya
  2. usi command ke theek upar ⚠️ likho ki asli AWS par yeh fail hoga aur kyun.
  Neeche ki "Emulator limits" list sirf un cheezon ke liye hai jo Moto **nahi karta** (packets, SQL, latency).
  Jo cheez Moto **galat karta hai** woh command ke paas likhi jaati hai.

### 11.2 README ka har command waisa hi chalna chahiye jaisa likha hai

- `docker-labs/run-readme.py <lab> <log>` README ke saare ```bash blocks ek hi shell mein, upar se neeche chalata hai.
  Naya lab ya README ka badlaav commit karne se pehle ise chalao aur log ko "Asli output" se milao.
  (`START_DIR=..` un labs ke liye jo `aws-gurukul/` se chalte hain — abhi labs 21–27. Runner khud `docker-labs/` se shuru
  hota hai aur `cd docker-labs` / `cd aws-gurukul/docker-labs` wali line chhod deta hai.)
- Lab ka **shuruaati folder** README ke pehle block mein saaf likho. Abhi teen convention hain: labs 01–04 aur 10–20
  `cd aws-gurukul/docker-labs` (aws-gurukul ke upar wale folder se), labs 05–09 `cd docker-labs` (`aws-gurukul/` se),
  labs 21–27 mein koi `cd` nahi — woh `aws-gurukul/` se `./docker-labs/...` path chalate hain.
  Naye lab mein inme se ek chuno aur poore README mein wahi rakho; beech mein folder mat badlo.
- `<placeholder>` sirf wahan jahan learner ko sach mein apni value deni hai. Jo ID pichhle command se nikal sakti hai,
  use shell variable mein lo (`AMI=$(aws ec2 describe-images ...)`), placeholder mat chhodo.
- Log mein `An error occurred` dikhna hamesha bug nahi: lab 02 (AccessDenied), lab 12 (versioning ke bina replication),
  lab 15 (ConditionalCheckFailed) yeh jaan-boojh kar dikhate hain. Aisa error README ke "Asli output" mein likha hona chahiye.
  Jo error README mein nahi likha, woh bug hai.

### 11.3 Lab ka state

- Jo lab shared emulator (4566/4567) use karta hai, woh sirf apne banaye resources delete kare ya README ke aakhir mein
  `../reset.sh` bole. Doosre lab ka state mat chhedo.
- Labs 16 aur 21–27 apna alag Moto random port par chalate aur band karte hain ("OWNED MOTO STOPPED"). Naya scripted lab
  yahi pattern le: shared reset ki zaroorat nahi, aur do labs ek saath chal sakte hain.
- Lab ka runtime output `.lab/` ke andar likho (gitignored). Tracked file ko lab run se kabhi mat badlo.

### 11.4 In-browser simulator (`awscli.js`) — state badalne wale niyam asli AWS se milao

Simulator mein galti aksar "output ka format" mein nahi hoti; galti us **state** mein hoti hai jo command chupke se badal deta hai.
Review (2026-11-13) mein do mili:

- **S3 versioning Suspended:** purana code naye upload par us key ke saare purane versions mita deta tha, aur plain delete
  poori key uda deta tha. Asli S3: Suspended bucket mein naya object ya delete marker `versionId = "null"` leta hai aur sirf
  purane `null` version ki jagah aata hai; Enabled ke dauraan bane versions rehte hain. Ab `replaceNullVersion()` yahi karta hai.
  Test: `validate-s3adv.js` ("suspended upload replaces only the null version").
- **IAM group par customer managed policy:** `policyDocsFor()` group ki attached policy ke liye sirf AWS managed list dekhta tha,
  isliye apni banayi policy group se attach karne par `simulate-principal-policy` use ginta hi nahi tha. Ab user aur group dono
  ke liye `list('policies')` pehle dekha jaata hai.

Naya command jodte waqt yeh teen sawaal poochho:
1. Yeh command kis-kis resource ka state badalta hai? Asli AWS mein **kya nahi badalta** (purane versions, doosre resources)?
2. Teen haalat alag hain kya — "kabhi set nahi hua" (`undefined`), "on" (`true`), "on karke band" (`false`)? Inko ek hi `else` mein mat daalo.
3. Is niyam ka ek test `validate-*.js` mein hai jo galat state par fail ho? Sirf output text ka test kaafi nahi.
