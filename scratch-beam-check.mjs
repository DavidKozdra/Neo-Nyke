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
  Neo.laserActive = true; // hold the beam visual on for the capture
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOT_DIR}/fps-beam-held.png` });
await browser.close();
