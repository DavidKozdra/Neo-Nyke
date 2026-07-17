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
  window.__froze = false;
  setInterval(() => {
    if (Neo.laserActive && !window.__froze) { window.__froze = true; Neo.hitstop = 30; }
  }, 8);
});
await page.mouse.move(640, 430);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(1200);
const state = await page.evaluate(() => ({
  froze: window.__froze,
  mode: Neo.threeRenderer.getCameraMode(),
  fpYawApi: Neo.getFirstPersonYaw(),
  touchActive: !!window.NeoTouch?.active,
  split: !!Neo.isSplitScreen?.(),
  pointerLocked: document.pointerLockElement?.id || null,
  player: { x: Math.round(Neo.player.x), y: Math.round(Neo.player.y) },
  gameState: Neo.gameState,
}));
console.log(JSON.stringify(state, null, 1));
await page.screenshot({ path: `${SHOT_DIR}/fps-beam-frozen2.png` });
await browser.close();
