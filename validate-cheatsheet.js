const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8');
const head = src.slice(src.indexOf('const ENGINE'), src.indexOf('/* ================= 1. SYNTAX'));
const sandbox = new Function('fs', 'path', 'vm', 'DIR', head + '\nreturn mkSandbox(true);')(fs, path, vm, __dirname);
const AG = vm.runInContext('AG', sandbox);
const rows = AG.cheatsheet.entries(), levels = AG.tracks.flatMap(t => AG.levelsOf(t));
const leaves = rows.filter(r => r.leaf);
assert.equal(rows.filter(r => r.level).length, levels.length);
assert.equal(leaves.length, AG.decisions.reduce((n,t) => n+AG.leavesOf(t).length,0));
for (const r of rows) { assert.ok(r.topics.length); assert.ok(r.topics.every(id => AG.findLevel(id))); }
for (const l of levels) assert.ok(rows.some(r => r.level === l && r.topics.includes(l.id)));
AG.cheatsheet.show();
const body = sandbox.document.getElementById('app');
assert.equal(body.querySelectorAll('.sheet-entry').length, rows.length);
console.log('E5 passed · '+levels.length+' playbooks and '+leaves.length+' Dojo decisions rendered with topic links.');
