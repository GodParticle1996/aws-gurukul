#!/usr/bin/env node
/* Exercise the learner controls with the same simulated DOM as validate.js. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const DIR = __dirname;
const runner = fs.readFileSync(path.join(DIR, 'validate.js'), 'utf8');
const head = runner.slice(runner.indexOf('const ENGINE'), runner.indexOf('/* ================= 1. SYNTAX'));
const { mkSandbox, mkNode } = new Function('fs', 'path', 'vm', 'DIR', head + '\nreturn { mkSandbox, mkNode };')(fs, path, vm, DIR);
const sb = mkSandbox(true);
const { AG, appEl } = vm.runInContext('({AG, appEl})', sb);
const levels = AG.tracks.flatMap(t => AG.levelsOf(t));
let missions = 0, frames = 0, guided = 0;

for (const level of levels) {
  const stages = [...level.stages, ...level.interview.questions.map(q => q.terminal)].filter(s => s && s.account);
  for (const stage of stages) {
    let won = 0;
    const arena = mkNode('div');
    AG.renderers.terminal(stage, arena, result => { won++; assert.equal(result.firstTry, 0); });
    const term = arena.querySelector('.terminal');
    const prompt = term.querySelector('input');
    const hint = arena.querySelector('.term-btns').children[0];
    const output = term.querySelector('.term-out');
    assert.equal(arena.querySelectorAll('.now').length, 1, level.id);
    for (const _ of stage.hints) hint.click();
    for (let tries = 0; tries < 55 && !won; tries++) {
      hint.click();
      const suggested = prompt.value;
      assert.ok(suggested, level.id + ' needs a command: ' + output._kids.slice(-5).map(n => n.textContent).join('\n'));
      assert.equal(won, 0, 'revealing a command must not run it');
      prompt.fire('keydown', { key: 'Enter' });
      guided++;
    }
    assert.equal(won, 1, level.id + ': ' + output._kids.slice(-7).map(n => n.textContent).join('\n'));
    assert.equal(prompt.disabled, true);
    assert.equal(hint.disabled, true);
    missions++;
  }

  const dry = level.stages.find(s => s.type === 'dryrun');
  assert.ok(dry && dry.nodes.length && dry.steps.length > 1, level.id);
  const scene = AG.scenePlayer(level, null);
  const next = scene.querySelector('.scene-next'), prev = scene.querySelector('.scene-prev');
  const say = scene.querySelector('.scene-say'), canvas = scene.querySelector('.scene-canvas');
  const first = canvas.innerHTML;
  assert.ok(prev.disabled);
  const xp = AG.state.xp;
  const slides = [];
  for (const step of dry.steps) {
    assert.equal(say.innerHTML, step.say);
    assert.match(canvas.innerHTML, /<svg /);
    slides.push(canvas.innerHTML);
    next.click();
    frames++;
  }
  assert.equal(canvas.innerHTML, first, 'scene restart');
  next.click();
  prev.click();
  assert.equal(canvas.innerHTML, first, 'scene rewind');
  assert.equal(AG.state.xp, xp, 'viewing a scene has no score');
  assert.ok(new Set(slides).size > 1, 'diagram changes ' + level.id);
}

assert.equal(new Set(AG.sochCases.map(c => c.id)).size, 30);
const positions = [0, 0, 0, 0];
let longest = 0;
for (const scenario of AG.sochCases) {
  const source = AG.findLevel(scenario.id).stages.find(s => s.type === 'triage');
  assert.ok(source.commands.some(c => c.clue) && source.questions.length >= 2);
  const qs = [...source.questions.slice(0, 2), scenario];
  const lens = scenario.choices.map(c => c.length);
  const right = lens.splice(scenario.answer, 1)[0];
  assert.ok(right < 1.15 * Math.max(...lens) && right > 0.85 * Math.min(...lens), scenario.id + ' option length');
  if (right > Math.max(...lens)) longest++;
  assert.ok(scenario.explain.length > 80);
  positions[scenario.answer]++;
  const before = AG.state.xp;
  for (const [miss, expectedBest] of [[true, 0], [false, 3], [true, 3]]) {
    AG.showSoch(scenario);
    for (let i = 0; i < qs.length; i++) {
      const buttons = appEl.querySelectorAll('.choice');
      if (miss) buttons.find(b => +b.dataset.i !== qs[i].answer).click();
      buttons.find(b => +b.dataset.i === qs[i].answer).click();
      appEl.querySelector('.soch-next').click();
    }
    assert.equal(AG.state.xp, before + AG.XP_PER_ITEM, 'single reward ' + scenario.id);
    assert.equal(AG.state.soch[scenario.id], expectedBest);
    assert.ok(appEl.querySelector('.soch-result').innerHTML.startsWith(miss ? '0 / 3' : '3 / 3'));
  }
}
assert.equal(Math.max(...positions) - Math.min(...positions), 1);
assert.ok(longest >= 5 && longest <= 9, 'length cues ' + longest);
assert.deepEqual(Object.keys(AG.readProgress({ soch: { rds: 0, edge: 3, broken: 4, bad: -1, old: '2' } }).soch), ['rds','edge']);
AG.state = AG.defaultState();
for (const level of levels) {
  assert.equal(AG.nextLevel().id, level.id);
  AG.state.completed.push(level.id);
}
assert.equal(AG.nextLevel(), null);
console.log('Practice checks passed: ' + missions + ' guided missions, ' + guided + ' commands, ' + frames +
  ' scene frames, ' + AG.sochCases.length + ' cases solved three times. New MCQs: 0 length flags; ' + longest + '/30 longest.');
