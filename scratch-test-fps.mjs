import { chromium } from 'playwright';
const SHOT_DIR = '/tmp/claude-1000/-home-davidk-Documents-CODE-GITHUB-NeoNyke/2cd775d5-398d-4b60-8051-c3ec6a9fdc38/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 853 } });
const logs = [];
page.on('pageerror', err => logs.push(err.message));
await page.goto('http://localhost:5173/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => { Neo.chosenCharacter = 'thorn_knight'; Neo.startGame('normal'); });
await page.waitForTimeout(800);

// FP looking down the south corridor with enemies in the room
await page.evaluate(() => {
  Neo.threeRenderer.setCameraMode('fp');
  Neo.threeRenderer.setYaw(Math.PI / 2);
  Neo.spawnWave?.(3, 'combat');
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOT_DIR}/fps-view.png` });

// Turn to face a wall at an angle to check tiling; walk toward the door
await page.evaluate(() => Neo.threeRenderer.setYaw(Math.PI * 0.75));
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOT_DIR}/fps-wall-angle.png` });

// Melee swing viewmodel: face south again, click attack while screenshotting mid-swing
await page.evaluate(() => Neo.threeRenderer.setYaw(Math.PI / 2));
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(70);
await page.screenshot({ path: `${SHOT_DIR}/fps-swing.png` });
await page.mouse.up({ button: 'left' });

// Beam from the muzzle
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(140);
await page.screenshot({ path: `${SHOT_DIR}/fps-beam.png` });
await page.mouse.up({ button: 'right' });

console.log('errors:', logs.join(' | ') || '(none)');
await browser.close();
