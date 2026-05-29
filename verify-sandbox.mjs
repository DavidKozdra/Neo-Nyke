import { chromium } from 'playwright';

const EXEC = '/home/davidk/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const BASE = 'http://localhost:8731/index.html';

const logs = [];
const errors = [];

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => { errors.push(String(e)); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Dismiss any start overlay gating — wait for menu buttons.
await page.waitForSelector('#altModesBtn', { timeout: 10000 });

// --- Navigate to Alt Modes ---
await page.click('#altModesBtn');
await page.waitForTimeout(400);
await page.waitForSelector('#altModeSandboxConfigBtn', { state: 'visible', timeout: 5000 });

// --- Open Sandbox config ---
await page.click('#altModeSandboxConfigBtn');
await page.waitForTimeout(500);

// Check the new controls exist & are visible
const controls = await page.evaluate(() => {
  const q = id => document.getElementById(id);
  const levelRow = document.querySelector('.sandbox-row[data-sbox-param="startingLevel"]');
  const selects = [...document.querySelectorAll('#sandboxMoveLoadout [data-sbox-move-slot-select]')]
    .map(s => ({ slot: s.dataset.sboxMoveSlotSelect, options: [...s.options].map(o => o.value) }));
  const vis = el => !!(el && el.offsetParent !== null);
  return {
    startingLevelRowVisible: vis(levelRow),
    levelSlider: levelRow ? levelRow.querySelector('.sandbox-slider')?.value : null,
    unlockCheckboxVisible: vis(q('sandboxUnlockEverything')),
    moveLoadoutVisible: vis(q('sandboxMoveLoadout')),
    selects,
  };
});
console.log('CONTROLS=' + JSON.stringify(controls));

await page.screenshot({ path: '/tmp/sandbox-config.png' });

// --- Set values: level 25, melee=fire_balls, dash=warp, unlock everything ---
await page.evaluate(() => {
  const setRange = (param, v) => {
    const row = document.querySelector(`.sandbox-row[data-sbox-param="${param}"]`);
    const slider = row.querySelector('.sandbox-slider');
    slider.value = String(v);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setRange('startingLevel', 25);
  const setSel = (slot, val) => {
    const sel = document.querySelector(`[data-sbox-move-slot-select="${slot}"]`);
    sel.value = val;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  setSel('melee', 'fire_balls');
  setSel('dash', 'warp');
  const cb = document.getElementById('sandboxUnlockEverything');
  cb.checked = true;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);

const afterSet = await page.evaluate(() => JSON.parse(JSON.stringify(window.Neo.sandboxSettings)));
console.log('SETTINGS_AFTER_SET=' + JSON.stringify({
  startingLevel: afterSet.startingLevel,
  unlockEverything: afterSet.unlockEverything,
  moveLoadout: afterSet.moveLoadout,
}));

// --- Reload to confirm persistence (saved to meta/localStorage) ---
await page.waitForTimeout(600); // allow persistMetaSoon to flush
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const persisted = await page.evaluate(() => {
  const s = window.Neo.sandboxSettings;
  return { startingLevel: s.startingLevel, unlockEverything: s.unlockEverything, moveLoadout: s.moveLoadout };
});
console.log('PERSISTED_AFTER_RELOAD=' + JSON.stringify(persisted));

// Re-open config and confirm UI reflects persisted values
await page.click('#altModesBtn');
await page.waitForTimeout(300);
await page.click('#altModeSandboxConfigBtn');
await page.waitForTimeout(400);
const uiReflect = await page.evaluate(() => {
  const row = document.querySelector('.sandbox-row[data-sbox-param="startingLevel"]');
  return {
    levelSlider: row.querySelector('.sandbox-slider').value,
    levelNum: row.querySelector('.sandbox-num').value,
    melee: document.querySelector('[data-sbox-move-slot-select="melee"]').value,
    dash: document.querySelector('[data-sbox-move-slot-select="dash"]').value,
    unlock: document.getElementById('sandboxUnlockEverything').checked,
  };
});
console.log('UI_REFLECT=' + JSON.stringify(uiReflect));

// --- Start a sandbox run ---
await page.evaluate(() => {
  // Close config, trigger sandbox start via the handler used by PLAY button
  window.Neo.uiController.setSandboxPanelOpen(false);
});
await page.click('#altModeSandboxBtn');
await page.waitForTimeout(800);

// We should be on char select. Pick first character and enter dungeon.
await page.waitForSelector('#choose .char-card', { timeout: 5000 });
await page.click('#choose .char-card'); // select first
await page.waitForTimeout(300);
await page.click('#go');
await page.waitForTimeout(1500);

const playerState = await page.evaluate(() => {
  const p = window.Neo.player;
  if (!p) return null;
  return {
    gameMode: window.Neo.gameMode,
    level: p.level,
    maxHp: p.maxHp,
    hp: p.hp,
    attackPower: p.attackPower,
    equippedMoves: p.equippedMoves,
    ownedWeaponCount: Object.values(p.ownedWeapons || {}).filter(Boolean).length,
    totalWeapons: window.Neo.WEAPON_KEYS.length,
    ownedMoveCount: Object.values(p.ownedMoves || {}).filter(Boolean).length,
  };
});
console.log('PLAYER_STATE=' + JSON.stringify(playerState));
await page.screenshot({ path: '/tmp/sandbox-run.png' });

console.log('CONSOLE_ERRORS=' + JSON.stringify(errors));
const errLogs = logs.filter(l => l.startsWith('[error]'));
console.log('CONSOLE_ERROR_LOGS=' + JSON.stringify(errLogs));

await browser.close();
