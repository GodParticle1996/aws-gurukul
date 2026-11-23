const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8');
const head = src.slice(src.indexOf('const ENGINE'), src.indexOf('/* ================= 1. SYNTAX'));
const sandbox = new Function('fs', 'path', 'vm', 'DIR', head + '\nreturn mkSandbox(true);')(fs, path, vm, __dirname);
const AG = vm.runInContext('AG', sandbox);
const root = path.join(__dirname, 'docker-labs');
const folders = fs.readdirSync(root).filter(name => /^\d\d-/.test(name)).sort();
const items = Array.from(AG.labIndex, l => l.folder);
assert.deepEqual(items, folders);
const stages = AG.tracks.flatMap(t => AG.levelsOf(t)).flatMap(l => l.stages.filter(s => s.type === 'docker'));
assert.deepEqual(Array.from(stages, s => s.project).sort(), folders);
for (const lab of AG.labIndex) {
  const doc = fs.readFileSync(path.join(root, lab.folder, 'README.md'), 'utf8');
  assert.equal(lab.title, doc.split('\n')[0].slice(2));
  assert.equal(lab.setup, doc.match(/^```(?:bash|sh)\s*\n([\s\S]*?)^```/m)[1].trim().replaceAll('cd aws-gurukul/docker-labs','cd docker-labs'));
  assert.ok(lab.limit.length > 38, lab.folder);
}
AG.state.labs = folders.slice();
assert.deepEqual(Array.from(AG.resume.decode(AG.resume.encode()).labs), folders);
for (const labs of [[folders[0], folders[0]], ['unknown'], 1])
  assert.throws(() => AG.resume.decode(JSON.stringify({xp:0,completed:[],labs})));
console.log('E3 passed · '+folders.length+' README titles, setup commands, limits, level links and lab marks checked.');
