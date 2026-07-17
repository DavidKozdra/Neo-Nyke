import { chromium } from 'playwright';
const SHOT_DIR = '/tmp/claude-1000/-home-davidk-Documents-CODE-GITHUB-NeoNyke/2cd775d5-398d-4b60-8051-c3ec6a9fdc38/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 853 } });
await page.goto('http://localhost:5173/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => { Neo.chosenCharacter = 'thorn_knight'; Neo.startGame('normal'); });
await page.waitForTimeout(600);
await page.evaluate(() => {
  Neo.threeRenderer.setCameraMode('fp');
  Neo.threeRenderer.setYaw(Math.PI / 2);
  window.__laserSeen = false;
  window.__froze = false;
  setInterval(() => {
    if (Neo.laserActive) {
      window.__laserSeen = true;
      if (!window.__froze) { window.__froze = true; Neo.hitstop = 30; }
    }
  }, 8);
});
await page.mouse.move(640, 430);
  await page.mouse.down({ button: "right" });
await page.waitForTimeout(1500);
const seen = await page.evaluate(() => ({ seen: window.__laserSeen, froze: window.__froze, active: Neo.laserActive, hitstop: Neo.hitstop }));
console.log('laser state:', JSON.stringify(seen));
await page.screenshot({ path: `${SHOT_DIR}/fps-beam-frozen.png` });
await page.mouse.up({ button: 'right' });
await browser.close();
