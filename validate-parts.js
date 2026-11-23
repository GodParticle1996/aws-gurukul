const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8');
const head = src.slice(src.indexOf('const ENGINE'), src.indexOf('/* ================= 1. SYNTAX'));
const sandbox = new Function('fs', 'path', 'vm', 'DIR', head + '\nreturn mkSandbox(true);')(fs, path, vm, __dirname);
const AG = vm.runInContext('AG', sandbox);
const levels = AG.tracks.flatMap(t => AG.levelsOf(t));
const app = sandbox.document.getElementById('app');
let n = 0;
for (const level of levels) {
  const stages = sandbox.allStages(level), cut = AG.parts.split(level);
  assert.ok(cut > 0 && cut < stages.length);
  assert.equal(stages[cut].type, 'triage');
  assert.equal(AG.parts.name(level,cut-1),'Part 1 · Samjho');
  assert.equal(AG.parts.name(level,cut),'Part 2 · Karo');
  const session = {level,stageIdx:cut-1,firstTry:2,total:3,replay:false};
  AG.session = session; sandbox.runStage();
  const wrap = app.querySelectorAll('.panel')[0];
  sandbox.stageDone({firstTry:1,total:2}, wrap);
  assert.equal(app.querySelectorAll('.part-break').length,1);
  assert.equal(AG.state.resume.stageIdx,cut);
  assert.equal(AG.state.stars[level.id],undefined);
  const xp=AG.state.xp; AG.state=AG.loadState();
  assert.ok(AG.resume.open(level)); assert.equal(AG.session.stageIdx,cut);
  assert.equal(AG.session.firstTry,3);assert.equal(AG.session.total,5);assert.equal(AG.state.xp,xp);
  AG.state.completed.push(level.id);AG.saveState();
  n++;
}
console.log('E6 passed · '+n+' non-empty part pairs · reload opened every first triage with the same score and XP.');
