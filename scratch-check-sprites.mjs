import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);

const newRunBtn = await page.$('text=NEW RUN');
if (newRunBtn) { await newRunBtn.click(); await page.waitForTimeout(1000); }
await page.screenshot({ path: '/tmp/claude-1000/-home-davidk-Documents-CODE-GITHUB-NeoNyke/8a08ad22-33bb-4350-a687-82b488964585/scratchpad/charselect.png' });

// pick first hero card if present
const heroCard = await page.$('.hero-card, [data-character], .charselect-card');
if (heroCard) { await heroCard.click(); await page.waitForTimeout(300); }

const startBtn = await page.$('#go');
if (startBtn) {
  await startBtn.click({ force: true });
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: '/tmp/claude-1000/-home-davidk-Documents-CODE-GITHUB-NeoNyke/8a08ad22-33bb-4350-a687-82b488964585/scratchpad/post-start.png' });

const injected = await page.evaluate(() => {
  const room = window.Neo?.currentRoom;
  if (!room) return { ok: false, reason: 'no currentRoom' };
  room.destructibles = room.destructibles || [];
  room.destructibles.push({ kind: 'barrel', x: 300, y: 300, r: 20, hp: 1, broken: false });
  room.pickups = room.pickups || [];
  room.pickups.push({ x: 400, y: 300, type: 'ladder' });
  room.structures = room.structures || [];
  room.structures.push({ kind: 'forge', x: 500, y: 300, w: 48, h: 48 });
  room.structures.push({ kind: 'anvil', x: 600, y: 300, w: 40, h: 40 });
  if (window.Neo.destructibles) window.Neo.destructibles.push(room.destructibles[room.destructibles.length - 1]);
  if (window.Neo.structures) { window.Neo.structures.push(room.structures[room.structures.length - 2]); window.Neo.structures.push(room.structures[room.structures.length - 1]); }
  return { ok: true, destructibles: window.Neo.destructibles?.length, structures: window.Neo.structures?.length };
});
console.log('Injected:', injected);

await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/claude-1000/-home-davidk-Documents-CODE-GITHUB-NeoNyke/8a08ad22-33bb-4350-a687-82b488964585/scratchpad/game-check.png' });
console.log('Errors:', errors);
await browser.close();
