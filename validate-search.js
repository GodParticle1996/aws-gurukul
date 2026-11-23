const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8');
const head = src.slice(src.indexOf('const ENGINE'), src.indexOf('/* ================= 1. SYNTAX'));
const sandbox = new Function('fs', 'path', 'vm', 'DIR', head + '\nreturn mkSandbox(true);')(fs, path, vm, __dirname);
const AG = vm.runInContext('AG', sandbox);
const all = AG.search.index(), levels = AG.tracks.flatMap(t => AG.levelsOf(t));
const count = kind => all.filter(r => r.kind === kind).length;
assert.equal(count('Level'), levels.length);
assert.equal(count('Lesson card'), levels.reduce((n,l) => n+l.steps.length, 0));
assert.equal(count('Flashcard'), levels.reduce((n,l) => n+l.cards.length, 0));
assert.equal(count('Decision Dojo'), AG.decisions.reduce((n,t) => n+AG.leavesOf(t).length, 0));
for (const r of all) {
  assert.ok(r.title && r.detail.length);
  if (r.level) assert.ok(AG.findLevel(r.level),r.level);
  if (r.tree) assert.ok(r.tree.nodes[r.leaf].leaf);
}
assert.ok(AG.search.find('rEcOvErY   objective','Glossary').some(r => r.title === 'RPO'));
assert.ok(AG.search.find('FIFO','Flashcard').length);
assert.ok(AG.search.find('Aurora','Decision Dojo').length);
assert.ok(!AG.search.find('qqqxyznever').length);
assert.equal(AG.search.find('').length, AG.search.terms.length);
console.log('E4 passed · '+AG.search.terms.length+' terms · '+count('Level')+' levels · '+count('Lesson card')+' lesson cards · '+count('Flashcard')+' flashcards · '+count('Decision Dojo')+' Dojo leaves.');
