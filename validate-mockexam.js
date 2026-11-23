const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8');
const head = src.slice(src.indexOf('const ENGINE'), src.indexOf('/* ================= 1. SYNTAX'));
const sandbox = new Function('fs', 'path', 'vm', 'DIR', head + '\nreturn mkSandbox(true);')(fs, path, vm, __dirname);
const AG = vm.runInContext('AG', sandbox);
const bank = AG.mock.bank(), from = new Set();
for (const q of bank.values()) {
  assert.ok(AG.validAnswer(q), q.q); assert.ok(AG.mock.domains.some(d => d.id === q.domain), q.q);
  from.add(q.from.id);
}
assert.equal(from.size, 41);
for (let sample = 0; sample < 65; sample++) {
  const f = AG.mock.create(true, 100), spots = [0,0,0,0];
  assert.equal(f.deadline, 100 + 130 * 60000);
  assert.ok(AG.mock.valid({ active: f, history: [] }));
  assert.equal(f.questions.filter(r => r.scored).length, 50);
  assert.equal(f.questions.filter(r => Array.isArray(bank.get(r.id).answer)).length, 4);
  for (const r of f.questions) {
    const q = bank.get(r.id);
    if (!Array.isArray(q.answer)) spots[r.order.indexOf(q.answer)]++;
  }
  assert.ok(Math.max(...spots) - Math.min(...spots) <= 1);
}
const f = AG.mock.create(false);
AG.state.mock.active = f;
for (const r of f.questions) r.picks = AG.answerIndices(bank.get(r.id)).slice().reverse();
const missed = f.questions.find(r => r.scored);
missed.picks = [];
AG.mock.finish();
assert.equal(AG.state.mock.history[0].questions.filter(r => r.right && r.scored).length, 49);
assert.equal(Object.keys(AG.state.dojo).length, 1);
assert.equal(AG.state.mock.active, null);
AG.mock.finish();
assert.equal(AG.state.mock.history.length, 1);
assert.equal(JSON.stringify(AG.resume.decode(AG.resume.encode()).mock), JSON.stringify(AG.state.mock));
const invalid = JSON.parse(AG.resume.encode());
invalid.progress.mock.history[0].questions[0].order = [0,0,1,2];
assert.throws(() => AG.resume.decode(JSON.stringify(invalid)));
for (const q of AG.mock.multi) {
  const wrong = q.choices.filter((_,i) => !q.answer.includes(i)).map(c => c.length);
  for (const i of q.answer) assert.ok(q.choices[i].length < Math.max(...wrong)*1.15 && q.choices[i].length > Math.min(...wrong)*0.85);
  assert.ok(q.explain.length > 80);
  assert.ok(!AG.answerMatches(q, q.answer.slice(0,1)));
}
assert.ok(!AG.validAnswer({choices:['a','b','c','d','e'],answer:[0,0]}));
console.log('E2 passed · ' + bank.size + ' questions from 41 levels including 4 choose-two · 65 weighted forms · scoring, cards and backup.');
