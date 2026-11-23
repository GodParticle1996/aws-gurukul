#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const DIR = __dirname, runner = fs.readFileSync(path.join(DIR, 'validate.js'), 'utf8');
const head = runner.slice(runner.indexOf('const ENGINE'), runner.indexOf('/* ================= 1. SYNTAX'));
const { mkSandbox } = new Function('fs', 'path', 'vm', 'DIR', head + '\nreturn {mkSandbox};')(fs, path, vm, DIR);
const sb = mkSandbox(true);
const { AG, allStages } = vm.runInContext('({ AG, allStages })', sb);
const plain = value => JSON.parse(JSON.stringify(value));
const levels = AG.tracks.flatMap(t => AG.levelsOf(t));
let stages = 0;
for (const level of levels) {
  const size = allStages(level).length;
  for (let stageIdx = 0; stageIdx < size; stageIdx++) {
    const session = { level, stageIdx, firstTry: stageIdx, total: stageIdx * 2, replay: false };
    AG.session = session;
    AG.resume.startStage(session);
    assert.equal(AG.resume.current().stageIdx, stageIdx, level.id);
    const before = AG.state.xp;
    assert.equal(AG.addXP(10), 10);
    AG.state = AG.loadState();
    assert.deepEqual(plain(AG.resume.decode(AG.resume.encode())), plain(AG.state));
    assert.ok(AG.resume.open(level));
    assert.equal(AG.session.firstTry, session.firstTry);
    assert.equal(AG.session.total, session.total);
    assert.equal(AG.addXP(10), 0, 'already awarded before reload');
    assert.equal(AG.addXP(10), 10, 'additional progress earns XP');
    assert.equal(AG.state.xp, before + 20);

    AG.session.firstTry++;
    AG.session.total += 2;
    AG.resume.finishStage(AG.session, size);
    const point = AG.resume.current();
    const last = stageIdx + 1 === size;
    assert.equal(point.ready, last);
    assert.equal(point.stageIdx, last ? stageIdx : stageIdx + 1);
    assert.equal(point.total, session.total + 2);
    if (last) {
      AG.state = AG.resume.decode(AG.resume.encode());
      assert.ok(AG.resume.open(level), 'pending final result');
      assert.ok(AG.state.completed.includes(level.id));
      assert.equal(AG.state.stars[level.id], 1, 'saved accuracy determines stars');
      assert.equal(AG.resume.current(), null);
    }
    stages++;
  }
}

const first = levels[0], second = levels[1];
AG.state = AG.defaultState();
AG.state.completed.push(first.id);
AG.resume.startStage({ level: second, stageIdx: 1, total: 2, firstTry: 1, replay: false });
const pending = plain(AG.state.resume);
const replay = { level: first, stageIdx: 2, total: 2, firstTry: 2, replay: true };
AG.session = replay;
AG.resume.startStage(replay);
AG.resume.finishStage(replay, allStages(first).length);
assert.equal(AG.addXP(10), 0);
sb.levelComplete();
assert.deepEqual(plain(AG.resume.current()), pending, 'practice preserves the unfinished level');
AG.state.resume = null;
AG.resume.startStage(replay);
assert.ok(AG.resume.current().replay, 'a replay can itself be resumed when no unfinished level is pending');

const legacy = { xp: 42, completed: [first.id] };
assert.equal(AG.resume.decode(JSON.stringify(legacy)).xp, 42);
assert.equal(AG.resume.decode(JSON.stringify(legacy)).resume, null);
const mixed = { ...AG.defaultState(), ...legacy, resume: pending, stars: { cloud101: 2 }, soch: { rds: 3 },
  levelStarts: 3, streak: { count: 1, best: 2, last: '2026-11-23' },
  dojo: { saved: { front: '<b>RDS</b>', back: 'DB<br>restore', tag: 'Cloud', due: 1, box: 2 } },
  decisions: { compute: { seen: ['lambda'], solved: ['compute#0'], best: 1 } } };
AG.state = AG.readProgress(mixed);
assert.deepEqual(plain(AG.resume.decode(AG.resume.encode())), plain(mixed));
const original = JSON.stringify(AG.state);
const invalid = [null, [], {}, { app: 'other', version: 1, progress: mixed }, { app: 'aws-gurukul', version: 2, progress: mixed },
  ...[{ xp: -5 }, { completed: 'cloud101' }, { stars: { cloud101: 5 } }, { dojo: { bad: {} } }, { soch: { rds: 4 } },
    { decisions: { compute: { seen: [12], solved: [], best: 2 } } }, { streak: { count: 4, best: 1, last: null } },
    { resume: { ...pending, stageIdx: -1 } }, { resume: { ...pending, stageIdx: 200 } },
    { resume: { ...pending, levelId: 'absent' } }, { resume: { ...pending, levelId: 'archboss' } },
    { resume: { ...pending, ready: true } }, { resume: { ...pending, firstTry: 40 } },
    { resume: { ...pending, replay: true } }].map(change => ({ ...mixed, ...change }))];
for (const candidate of invalid) assert.throws(() => AG.resume.decode(JSON.stringify(candidate)));
assert.throws(() => AG.resume.decode('half a file'));
assert.equal(JSON.stringify(AG.state), original);
AG.state.resume.stageIdx = 1000;
assert.equal(AG.resume.current(), null);
assert.equal(AG.resume.decode(AG.resume.encode()).resume, null, 'old unusable checkpoint leaves the rest exportable');
assert.equal(AG.resume.cardHtml('<b>RDS</b><br><aside>note</aside>'), '<b>RDS</b><br>&lt;aside>note&lt;/aside>');
console.log('E1 passed · ' + stages + ' challenge checkpoints across ' + levels.length + ' levels · ' +
  (invalid.length + 1) + ' invalid backups rejected · XP, stars, replays and legacy data checked.');
