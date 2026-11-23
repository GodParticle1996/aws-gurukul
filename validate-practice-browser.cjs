// Run against the local app with an existing Playwright install.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const out = process.env.AWS_GURUKUL_EVIDENCE_DIR || path.join(__dirname, '.overhaul-evidence', 'shots-phase4');
  const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const samples = [], errors = [];
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const width of [360, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 880 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await context.route(/^https?:/, r => r.abort());
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      async function screen(name, selector) {
        const area = page.locator(selector);
        await area.scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name);
        await area.screenshot({ path: path.join(out, width + '-' + name + '.png'), style: '#topbar { visibility: hidden; }' });
        samples.push([width, name]);
      }
      async function at(hash, selector) {
        await page.waitForFunction(h => location.hash === h, hash);
        await page.locator(selector).first().waitFor({ state: 'visible' });
      }

      await page.goto(url + '#level/archboss'); // a locked track falls back to home
      await at('', '.next-card');
      await screen('home', '.next-card');
      await page.screenshot({ path: path.join(out, width + '-home-viewport.png') });
      samples.push([width, 'home-viewport']);
      await page.locator('.trackcard').first().click();
      await at('#track/beginner', '.levelmap');
      await page.locator('.levelcard').first().click();
      await at('#level/cloud101', '.scene-player');
      const first = await page.locator('.scene-say').innerText();
      await page.locator('.scene-next').press('Enter');
      assert.notEqual(await page.locator('.scene-say').innerText(), first);
      await screen('scene', '.scene-player');
      await page.locator('.scene-prev').click();
      assert.equal(await page.locator('.scene-say').innerText(), first);
      await page.goBack(); await at('#track/beginner', '.levelmap');
      await page.goForward(); await at('#level/cloud101', '.scene-player');
      await page.reload(); await at('#level/cloud101', '.scene-player');
      await page.goto(url + '#level/rds');
      await at('#track/beginner', '.levelmap');
      await page.goto(url + '#level/does-not-exist');
      await at('', '.next-card');
      await page.goto(url + '#certificate/beginner');
      await at('', '.next-card');
      await page.goto(url + '#decision/compute');
      await at('#decision/compute', '.dd-stage');
      await page.locator('button').filter({ hasText: 'Is topic ki practice' }).click();
      await at('#practice/compute', '.dd-choice');
      await page.goBack(); await at('#decision/compute', '.dd-stage');

      await page.locator('#brand').click();
      await page.locator('.soch-link').click();
      await at('#soch', '.soch-grid');
      assert.equal(await page.locator('.soch-grid button').count(), 30);
      await page.screenshot({ path: path.join(out, width + '-case-list.png') });
      samples.push([width, 'case-list']);
      await page.locator('.soch-grid button').filter({ hasText: 'Marker bacha' }).click();
      await at('#soch/resilience', '.soch-evidence');
      await page.reload();
      const answers = await page.evaluate(() => [...AG.findLevel('resilience').stages.find(s => s.type === 'triage').questions.slice(0, 2),
        AG.sochCases.find(c => c.id === 'resilience')].map(q => q.answer));
      for (const [step, answer] of answers.entries()) {
        if (step === 0) {
          await page.locator('.choice[data-i="' + ((answer + 1) % 4) + '"]').click();
          assert.ok(await page.locator('.soch-evidence').evaluate(e => e.open));
          await screen('case-evidence', '.soch-evidence');
          await page.locator('.soch-evidence summary').click();
        }
        await page.locator('.choice[data-i="' + answer + '"]').click();
        if (step === 2) await screen('case-twist', '.arena');
        await page.locator('.soch-next').click();
      }
      await screen('case-result', '.arena');
      assert.equal(await page.evaluate(() => AG.state.soch.resilience), 2);
      assert.equal(await page.locator('.soch-case button').filter({ hasText: /^Level kholo$/ }).count(), 0);
      await page.reload();
      assert.equal(await page.evaluate(() => AG.state.soch.resilience), 2);

      // Use the normal stage runner and keyboard, in a disposable local session.
      await page.evaluate(() => {
        const level = AG.findLevel('cloud101');
        AG.session = { level, stageIdx: level.stages.findIndex(s => s.type === 'terminal'), firstTry: 0, total: 0, replay: false };
        runStage();
      });
      const input = page.locator('.term-in input'), help = page.locator('.term-btns button').first();
      for (let i = 0; i < 5; i++) { await input.fill('no-such-command'); await input.press('Enter'); }
      assert.equal(await page.locator('.t-hint').filter({ hasText: 'Koi naya kaam' }).count(), 1);
      await page.locator('.term-palette summary').click();
      await help.click();
      const reset = page.locator('.term-btns button').last();
      page.once('dialog', d => d.dismiss());
      await reset.click();
      assert.equal(await page.locator('.t-cmd').count(), 5);
      page.once('dialog', d => d.accept());
      await reset.click();
      assert.equal(await page.locator('.t-cmd').count(), 0);
      assert.ok((await help.innerText()).includes('2/4'));
      for (let i = 0; i < 3; i++) { await input.fill('hint'); await input.press('Enter'); }
      await help.click();
      assert.equal(await input.inputValue(), 'aws sts get-caller-identity');
      assert.equal(await page.locator('.term-tasks .done').count(), 0);
      await screen('terminal-help', '.arena');
      for (let i = 0; i < 4; i++) {
        await help.click();
        await input.press('Enter');
      }
      assert.equal(await page.locator('.term-tasks .done').count(), 4);
      await screen('terminal-solved', '.arena');

      for (const save of [{ xp: 32, completed: ['cloud101'] }, { xp: 32, completed: ['cloud101'], soch: null, stars: null, dojo: { bad: null } }]) {
        await page.goto(url);
        await page.evaluate(s => localStorage.setItem(AG.STORE_KEY, JSON.stringify(s)), save);
        await page.reload();
        await at('', '.next-card');
        await page.locator('.next-card button').click();
        await at('#level/iam', '.scene-player');
        assert.equal(await page.evaluate(() => AG.state.xp), 32);
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ samples, errors }, null, 2));
    console.log(samples.length + ' screenshots. Route, keyboard, scene, case, saved score and terminal checks passed at both widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
