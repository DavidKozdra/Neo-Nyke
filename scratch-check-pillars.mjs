import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', err => console.log('pageerror', err.message));

await page.goto('http://localhost:5173/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const newRunBtn = await page.$('text=NEW RUN');
if (newRunBtn) { await newRunBtn.click(); await page.waitForTimeout(1000); }
const heroCard = await page.$('.hero-card, [data-character], .charselect-card');
if (heroCard) { await heroCard.click(); await page.waitForTimeout(300); }
const startBtn = await page.$('#go');
if (startBtn) { await startBtn.click({ force: true }); await page.waitForTimeout(2000); }

const info = await page.evaluate(() => {
  const keys = ['pillar_1', 'pillar_2', 'pillar_3'];
  const loaded = {};
  for (const k of keys) {
    const e = window.Neo?.ENVIRONMENT_IMAGES?.[k];
    loaded[k] = e ? { w: e.image.naturalWidth, h: e.image.naturalHeight } : null;
  }
  const room = window.Neo?.currentRoom;
  const px = window.Neo.player.x, py = window.Neo.player.y;
  // Place 4 pillars with mids 0,1,2,3 in a row for a visual comparison.
  for (let i = 0; i < 4; i += 1) {
    window.Neo.structures.push({ kind: 'pillar', x: px - 120 + i * 80, y: py - 40, w: 34, h: 34, mids: i });
  }
  return { loaded, structureCount: window.Neo.structures.length };
});
console.log('Pillar segment load:', info);

await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-1000/-home-davidk-Documents-CODE-GITHUB-NeoNyke/8a08ad22-33bb-4350-a687-82b488964585/scratchpad/pillars-check.png' });
await browser.close();
