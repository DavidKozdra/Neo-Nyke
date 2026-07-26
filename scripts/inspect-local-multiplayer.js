const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const baseUrl = process.argv[2] || 'http://127.0.0.1:8789';
  const context = await browser.newContext();
  await context.addInitScript(apiBase => { globalThis.NEO_MULTIPLAYER_API_BASE = apiBase; }, `${baseUrl}/api/multiplayer`);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  // Networked play now lives behind Alt Modes > MULTIPLAYER.
  await page.locator('#altModesBtn').click();
  await page.locator('.altmodes-tab[data-tab="online"]').click();
  await page.locator('#multiplayerBtn').click();
  await page.waitForTimeout(11_000);
  const state = await page.evaluate(async () => {
    let probe;
    try {
      probe = await Promise.race([
        fetch(`${globalThis.NEO_MULTIPLAYER_API_BASE}/health`, { cache: 'no-store' })
          .then(async response => ({ ok: response.ok, status: response.status, body: await response.text() })),
        new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 2_000)),
      ]);
    } catch (error) {
      probe = { error: String(error) };
    }
    let transportProbe;
    try {
      transportProbe = await Promise.race([
        new globalThis.NeoNyke.multiplayer.CloudflareWebSocketTransport().checkAvailability({ timeoutMs: 4_000 }),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 5_000)),
      ]);
    } catch (error) {
      transportProbe = { error: String(error) };
    }
    return {
    href: location.href,
    hostname: location.hostname,
    multiplayer: globalThis.NeoNyke?.features?.isEnabled?.('multiplayer'),
    createDisabled: document.querySelector('#multiplayerCreateRoom')?.disabled,
    panelState: document.querySelector('#multiplayerPanel')?.dataset?.multiplayerState,
    apiBase: globalThis.NEO_MULTIPLAYER_API_BASE,
      probe,
      transportProbe,
    };
  });
  console.log(JSON.stringify(state));
  await context.close();
  await browser.close();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
