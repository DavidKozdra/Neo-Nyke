const { chromium } = require('playwright');

const baseUrl = String(process.env.NEONYKE_MULTIPLAYER_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

async function waitForSessionStatus(page, status, description) {
  await page.waitForFunction(
    expectedStatus => {
      const session = globalThis.Neo?.gameSession;
      return !!session && session.snapshot().status === expectedStatus;
    },
    status,
    { timeout: 10_000 },
  ).catch(error => {
    throw new Error(`Timed out waiting for ${description}: ${error.message}`);
  });
}

async function openMultiplayer(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#multiplayerBtn').click();
  await page.locator('#multiplayerCreateRoom').waitFor({ state: 'visible' });
  if (await page.locator('#multiplayerCreateRoom').isDisabled()) {
    throw new Error(`Multiplayer controls are disabled at ${baseUrl}; run this against a localhost Wrangler server`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await Promise.all([hostContext, guestContext].map(context => context.addInitScript(apiBase => {
    globalThis.NEO_MULTIPLAYER_API_BASE = apiBase;
  }, `${baseUrl}/api/multiplayer`)));
  await hostContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];

  for (const [name, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', error => errors.push(`${name} page error: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`${name} console error: ${message.text()}`);
    });
  }

  try {
    await Promise.all([openMultiplayer(host), openMultiplayer(guest)]);
    await host.locator('#multiplayerCreateRoom').click();
    await waitForSessionStatus(host, 'waiting', 'host lobby');

    const roomCode = await host.evaluate(() => globalThis.Neo.gameSession.snapshot().roomCode);
    await host.locator('#multiplayerCopyRoomCode').click();
    await host.waitForFunction(() => document.querySelector('#multiplayerCopyRoomCode')?.textContent?.includes('COPIED'));
    const copiedRoomCode = await host.evaluate(() => navigator.clipboard.readText());
    if (copiedRoomCode !== roomCode) throw new Error(`Clipboard contained ${copiedRoomCode} instead of ${roomCode}`);
    await guest.locator('#multiplayerRoomCode').fill(roomCode);
    await guest.locator('#multiplayerJoinRoom').click();
    await waitForSessionStatus(guest, 'waiting', 'guest lobby');
    await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members?.length === 2);

    await Promise.all([
      host.locator('#multiplayerReady').click(),
      guest.locator('#multiplayerReady').click(),
    ]);
    await Promise.all([
      waitForSessionStatus(host, 'running', 'host match start'),
      waitForSessionStatus(guest, 'running', 'guest match start'),
    ]);
    await Promise.all([host, guest].map(page => page.waitForFunction(() => (
      globalThis.Neo?.multiplayerGameView?.active === true
      && globalThis.Neo.gameSession.snapshot().gameState?.floorState?.layout?.rooms?.length >= 8
      && document.querySelector('#start')?.classList.contains('hidden')
      && !document.querySelector('#multiplayerGameHud')?.classList.contains('hidden')
    ))));

    await Promise.all([host.keyboard.down('d'), guest.keyboard.down('a')]);
    await host.waitForTimeout(700);
    await Promise.all([host.keyboard.up('d'), guest.keyboard.up('a')]);

    await Promise.all([
      host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().gameState?.tick >= 10),
      guest.waitForFunction(() => globalThis.Neo.gameSession.snapshot().gameState?.tick >= 10),
    ]);

    const [hostSnapshot, guestSnapshot] = await Promise.all([
      host.evaluate(() => globalThis.Neo.gameSession.snapshot()),
      guest.evaluate(() => globalThis.Neo.gameSession.snapshot()),
    ]);
    const hostPlayers = hostSnapshot.gameState?.players || {};
    const guestPlayers = guestSnapshot.gameState?.players || {};
    const converged = JSON.stringify(hostPlayers) === JSON.stringify(guestPlayers);
    const moved = Object.values(hostPlayers).some(player => player.x > 300)
      && Object.values(hostPlayers).some(player => player.x < 600);
    const canvasRendered = await host.evaluate(() => {
      const canvas = document.querySelector('#c');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visibleSamples = 0;
      for (let y = 20; y < canvas.height; y += 80) {
        for (let x = 20; x < canvas.width; x += 80) {
          const offset = (y * canvas.width + x) * 4;
          if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 40) visibleSamples += 1;
        }
      }
      return visibleSamples >= 10;
    });

    const report = {
      baseUrl,
      roomCode,
      copiedRoomCode,
      hostStatus: hostSnapshot.status,
      guestStatus: guestSnapshot.status,
      tick: hostSnapshot.gameState?.tick,
      memberCount: hostSnapshot.lobbyState?.members?.length,
      gameViewActive: await host.evaluate(() => globalThis.Neo.multiplayerGameView?.active === true),
      canvasRendered,
      floorRoomCount: hostSnapshot.gameState?.floorState?.layout?.rooms?.length,
      players: hostPlayers,
      converged,
      moved,
      errors,
    };
    const screenshotPath = String(process.env.NEONYKE_MULTIPLAYER_SCREENSHOT || '').trim();
    if (screenshotPath) {
      await host.screenshot({ path: screenshotPath, fullPage: true });
      report.screenshotPath = screenshotPath;
    }
    console.log(JSON.stringify(report, null, 2));
    if (!converged || !moved || report.gameViewActive !== true || !canvasRendered || report.floorRoomCount < 8 || errors.length) process.exitCode = 1;
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
