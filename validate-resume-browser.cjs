// Browser-only checks for actual downloads, file inputs, interrupted stages and storage errors.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const out = process.env.AWS_GURUKUL_EVIDENCE_DIR || path.join(__dirname, '.overhaul-evidence', 'shots-e1');
  const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const shots = [], errors = [];
  async function newPage(width) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, reducedMotion: 'reduce' });
    await ctx.route(/^https?:/, route => route.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(url);
    return p;
  }
  async function shot(page, width, name, target) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name);
    const file = width + '-' + name + '.png';
    await page.locator(target).screenshot({ path: path.join(out, file), style: '#topbar { visibility: hidden; }' });
    shots.push(file);
  }
  async function readFile(page, contents) {
    await page.locator('.backup-settings input').setInputFiles({
      name: 'aws-gurukul.json', mimeType: 'application/json', buffer: Buffer.from(contents),
    });
  }
  try {
    for (const width of [360, 1280]) {
      const page = await newPage(width);
      await page.locator('.next-card button').click();
      await page.getByRole('button', { name: /Shuru karo/ }).click();
      const steps = await page.evaluate(() => AG.session.level.stages[0].steps.map(s => s.ask?.answer ?? null));
      const firstAsk = steps.findIndex(v => v !== null);
      for (let i = 0; i < firstAsk; i++) await page.locator('.dr-next').click();
      await page.locator('.dr-opt[data-i="' + steps[firstAsk] + '"]').click();
      assert.equal(await page.evaluate(() => AG.state.xp), 10);
      await page.locator('#brand').click();
      await page.reload();
      await shot(page, width, 'home-resume', '.resume-card');
      await page.locator('.resume-card button').click();
      let laterQuestions = 0;
      for (const [i, answer] of steps.entries()) {
        if (answer !== null) {
          if (i !== firstAsk && !laterQuestions++) {
            await page.locator('.dr-opt').filter({ hasNotText: /^$/ }).evaluateAll((buttons, correct) =>
              buttons.find(b => Number(b.dataset.i) !== correct).click(), answer);
          }
          await page.locator('.dr-opt[data-i="' + answer + '"]').click();
          if (i === firstAsk) assert.equal(await page.evaluate(() => AG.state.xp), 10, 'same work earns XP once');
        }
        await page.locator('.dr-next').click();
      }
      await page.locator('.dr-done').click();
      // Leave while the summary is still on screen, before clicking Next.
      const checkpoint = await page.evaluate(() => AG.state.resume);
      assert.equal(checkpoint.stageIdx, 1);
      assert.equal(checkpoint.total, steps.filter(x => x !== null).length);
      assert.equal(checkpoint.firstTry, checkpoint.total - 1);
      await page.reload();
      await page.getByRole('button', { name: /^Challenge 2/ }).click();
      await page.locator('.stage-h').waitFor();
      assert.equal(await page.evaluate(() => AG.session.stageIdx), 1);
      await shot(page, width, 'resumed-challenge', '#app .panel .stage-h');
      await page.locator('#brand').click();
      await page.locator('.backup-settings summary').click();
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'JSON download karo' }).click();
      const download = await downloading;
      assert.match(download.suggestedFilename(), /^aws-gurukul-.*\.json$/);
      const bytes = fs.readFileSync(await download.path());
      const backup = JSON.parse(bytes);
      assert.equal(backup.progress.resume.stageIdx, 1);
      assert.ok(Object.keys(backup.progress.dojo).length, 'mistake card exported');

      const restored = await newPage(width);
      await restored.locator('.backup-settings summary').click();
      await readFile(restored, '{invalid json');
      await restored.getByRole('status').filter({ hasText: 'JSON padh nahi' }).waitFor();
      assert.equal(await restored.evaluate(() => AG.state.xp), 0);
      await readFile(restored, bytes);
      const apply = restored.getByRole('button', { name: 'Progress badalkar import karo' });
      await apply.waitFor();
      await shot(restored, width, 'import-preview', '.backup-settings');
      await restored.getByRole('button', { name: 'Rehne do' }).click();
      assert.equal(await restored.evaluate(() => AG.state.xp), 0);
      await readFile(restored, bytes);
      await restored.evaluate(() => {
        window.beforeBlockedSave = localStorage.getItem(AG.STORE_KEY);
        window.originalSet = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw Error('Storage unavailable'); };
      });
      await apply.click();
      await restored.getByRole('status').filter({ hasText: 'save nahi kar paaya' }).waitFor();
      assert.ok(await restored.evaluate(() => AG.state.xp === 0 && localStorage.getItem(AG.STORE_KEY) === beforeBlockedSave));
      await restored.evaluate(() => { Storage.prototype.setItem = window.originalSet; });
      await apply.click();
      await restored.getByRole('status').filter({ hasText: 'import ho gaya' }).waitFor();
      await shot(restored, width, 'restored-progress', '.resume-card');
      await restored.reload();
      assert.deepEqual(await restored.evaluate(() => AG.state), backup.progress, 'complete file round trip');
      await restored.locator('.resume-card button').click();
      assert.ok(await restored.evaluate(() => AG.session.stageIdx === 1 && AG.state.levelStarts === 1));

      await restored.locator('#brand').click();
      await restored.locator('.backup-settings summary').click();
      // Two selections can finish reading in the opposite order.
      await restored.evaluate(() => {
        window.realRead = File.prototype.text;
        File.prototype.text = function () {
          if (this.size === 1) return new Promise(resolve => { window.finishOldRead = resolve; });
          return window.realRead.call(this);
        };
      });
      await readFile(restored, 'x');
      await readFile(restored, JSON.stringify({ xp: 7, completed: [] }));
      await apply.waitFor();
      await restored.evaluate(() => window.finishOldRead('invalid'));
      assert.ok((await restored.getByRole('status').innerText()).includes('7 XP'));
      await apply.click();
      assert.equal(await restored.evaluate(() => AG.state.xp), 7);
      assert.equal(await restored.locator('.resume-card').count(), 0);
      await restored.context().close();
      await page.context().close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ shots, errors }, null, 2));
    console.log(shots.length + ' screenshots · 360 and 1280 px · stage reload, XP, cross-profile download/import, cancellation, read race and failed storage passed.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
