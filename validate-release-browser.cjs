/* Capture each level at both supported QA sizes using the offline app. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const out = path.resolve(process.env.AWS_GURUKUL_EVIDENCE_DIR || path.join(__dirname, '.overhaul-evidence', 'release-sweep'));
const local = file => pathToFileURL(path.join(__dirname, file)).href;
const rows = [], errors = [];

async function captureSize(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  let screen = 'home';
  try {
    const page = await context.newPage();
    await page.route(/^https?:/, route => route.abort());
    page.on('pageerror', err => errors.push([width, screen, err.message]));
    page.on('console', msg => { if (msg.type() === 'error') errors.push([width, screen, msg.text()]); });
    await page.goto(local('index.html'));
    await page.addStyleTag({ content: '* { animation:none!important; transition:none!important; scroll-behavior:auto!important }' });
    const levels = await page.evaluate(() => AG.tracks.flatMap(t => AG.levelsOf(t).map(l => l.id)));
    assert.ok(levels.length);
    for (const id of levels) {
      for (const type of ['intro', 'dryrun', 'flowlab']) {
        screen = id + '-' + type;
        const info = await page.evaluate(([id, type]) => {
          const level = AG.findLevel(id);
          if (type === 'intro') showIntro(level);
          else {
            const stageIdx = level.stages.findIndex(s => s.type === type);
            if (stageIdx < 0) throw Error(id + ' missing ' + type);
            AG.session = { level, stageIdx, replay: true, firstTry: 0, total: 0 };
            runStage();
          }
          window.scrollTo(0, 0);
          const heading = document.querySelector(type === 'intro' ? '.level-h' : '.stage-h');
          return { w: document.documentElement.scrollWidth, title: heading.textContent };
        }, [id, type]);
        const file = width + '-' + screen + '.png';
        await page.screenshot({ path: path.join(out, file) });
        rows.push({ width, id, type, file, ...info });
        if (info.w > width + 1) errors.push([width, screen, 'horizontal overflow: ' + info.w]);
      }
    }
    screen = 'gallery';
    await page.goto(local('gallery.html'));
    const links = page.locator('#g a');
    assert.equal(await page.locator('#g .diagram').count(), levels.length);
    const destinations = await links.evaluateAll(anchors => anchors.map(a => a.hash.slice('#study/'.length)));
    assert.deepEqual(destinations.sort(), levels.slice().sort());
    await links.first().click();
    await page.waitForURL('**#study/**');
    assert.ok(await page.locator('.level-h').isVisible());
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const width of [360, 1280]) await captureSize(browser, width);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ rows, errors }, null, 2));
  }
  console.log(rows.length + ' captures · 360 and 1280 px · dark theme, intro, dry run, flow lab and gallery passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
