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

async function canvasHasRenderedDungeon(page) {
  return page.evaluate(() => {
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
}

async function holdKey(page, key, durationMs) {
  await page.keyboard.down(key);
  await page.waitForTimeout(Math.max(100, durationMs));
  await page.keyboard.up(key);
  await page.waitForTimeout(180);
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
    await host.locator('#coopLobbyCopyRoomCode').click();
    await host.waitForFunction(() => document.querySelector('#coopLobbyCopyRoomCode')?.textContent?.includes('COPIED'));
    const copiedRoomCode = await host.evaluate(() => navigator.clipboard.readText());
    if (copiedRoomCode !== roomCode) throw new Error(`Clipboard contained ${copiedRoomCode} instead of ${roomCode}`);
    await guest.locator('#multiplayerRoomCode').fill(roomCode);
    await guest.locator('#multiplayerJoinRoom').click();
    await waitForSessionStatus(guest, 'waiting', 'guest lobby');
    await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members?.length === 2);

    await host.locator('#coopLobbyPicker [data-char="princess"]').click();
    await guest.locator('#coopLobbyPicker [data-char="metao"]').click();
    await Promise.all([
      host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members
        ?.find(member => member.playerId === globalThis.Neo.gameSession.snapshot().playerId)?.characterKey === 'princess'),
      guest.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members
        ?.find(member => member.playerId === globalThis.Neo.gameSession.snapshot().playerId)?.characterKey === 'metao'),
    ]);

    await Promise.all([
      host.locator('#coopLobbyReady').click(),
      guest.locator('#coopLobbyReady').click(),
    ]);
    await Promise.all([
      waitForSessionStatus(host, 'running', 'host match start'),
      waitForSessionStatus(guest, 'running', 'guest match start'),
    ]);
    await Promise.all([host, guest].map(page => page.waitForFunction(() => (
      globalThis.Neo?.multiplayerGameView?.active === true
      && globalThis.Neo.gameSession.snapshot().gameState?.floorState?.layout?.rooms?.length >= 8
      && Object.values(globalThis.Neo.gameSession.snapshot().gameState?.enemies || {}).some(enemy => !enemy.dead)
      && document.querySelector('#start')?.classList.contains('hidden')
      && document.querySelector('#multiplayerGameHud')?.classList.contains('hidden')
      && !document.querySelector('#hud')?.classList.contains('hidden')
      && !document.querySelector('#actionBar')?.classList.contains('hidden')
    ), undefined, { timeout: 45_000 })));

    // FPS is a local presentation preference. Prove that changing it through
    // the normal in-game Settings UI leaves the network session alone and that
    // NetworkGameView delegates its already-hydrated Neo state to the existing
    // Three.js renderer (rather than owning a multiplayer-only renderer).
    await host.evaluate(() => {
      const renderer = globalThis.Neo?.threeRenderer;
      if (!renderer?.render || renderer.__networkFpsSmokeWrapped) return;
      const originalRender = renderer.render.bind(renderer);
      renderer.__networkFpsSmokeCalls = 0;
      renderer.__networkFpsSmokeWrapped = true;
      renderer.render = (...args) => {
        renderer.__networkFpsSmokeCalls += 1;
        return originalRender(...args);
      };
    });
    await host.keyboard.press('Escape');
    await host.locator('#pause').waitFor({ state: 'visible' });
    await host.locator('#pauseSettings').click();
    await host.locator('#settingsModal').waitFor({ state: 'visible' });
    await host.locator('[data-tab="gameplay"]').click();
    await host.locator('[data-view-mode="fp"]').click();
    await host.waitForFunction(() => (
      globalThis.Neo?.getViewMode?.() === 'fp'
      && globalThis.Neo?.render3D === true
      && (globalThis.Neo?.threeRenderer?.__networkFpsSmokeCalls || 0) > 0
      && document.querySelector('#c3d')?.style.display === 'block'
    ), undefined, { timeout: 10_000 });
    const fpsProof = await host.evaluate(() => ({
      mode: globalThis.Neo?.getViewMode?.(),
      render3D: globalThis.Neo?.render3D === true,
      threeRendererCalls: globalThis.Neo?.threeRenderer?.__networkFpsSmokeCalls || 0,
      gameViewActive: globalThis.Neo?.multiplayerGameView?.active === true,
      sessionStatus: globalThis.Neo?.gameSession?.snapshot?.().status,
    }));
    await host.locator('#settingsClose').click();
    await host.keyboard.press('Escape');

    const initialEnemyCount = await host.evaluate(() => Object.values(
      globalThis.Neo.gameSession.snapshot().gameState?.enemies || {},
    ).filter(enemy => !enemy.dead).length);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const target = await host.evaluate(() => {
        const snapshot = globalThis.Neo.gameSession.snapshot();
        const player = snapshot.gameState?.players?.[snapshot.playerId];
        const enemy = Object.values(snapshot.gameState?.enemies || {}).find(candidate => !candidate.dead);
        if (!player || !enemy) return null;
        const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
        globalThis.Neo.multiplayerGameView.aimDirection = angle;
        return { enemyId: enemy.id, health: enemy.health, angle };
      });
      if (!target) break;
      await host.keyboard.press('Space');
      await host.waitForTimeout(520);
    }
    await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().gameplayEvents
      ?.some(event => event.eventType === 'PLAYER_ATTACKED'), undefined, { timeout: 10_000 });

    // Movement remains normal browser input; only its result is authoritative.
    const movementStart = await host.evaluate(() => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const player = snapshot.gameState.players[snapshot.playerId];
      return { x: player.x, y: player.y };
    });
    await holdKey(host, 'd', 750);
    await host.waitForFunction(start => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const player = snapshot.gameState?.players?.[snapshot.playerId];
      return player && Math.abs(player.x - start.x) > 20;
    }, movementStart, { timeout: 10_000 });
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
    const moved = Math.abs(Number(hostPlayers[hostSnapshot.playerId]?.x || 0) - movementStart.x) > 20;
    const [hostCanvasRendered, guestCanvasRendered] = await Promise.all([
      canvasHasRenderedDungeon(host),
      canvasHasRenderedDungeon(guest),
    ]);
    const [hostRenderedPlayerCount, guestRenderedPlayerCount] = await Promise.all([
      host.evaluate(() => globalThis.Neo.multiplayerGameView?.lastRenderedPlayerCount || 0),
      guest.evaluate(() => globalThis.Neo.multiplayerGameView?.lastRenderedPlayerCount || 0),
    ]);

    const report = {
      baseUrl,
      roomCode,
      copiedRoomCode,
      hostStatus: hostSnapshot.status,
      guestStatus: guestSnapshot.status,
      tick: hostSnapshot.gameState?.tick,
      memberCount: hostSnapshot.lobbyState?.members?.length,
      gameViewActive: await host.evaluate(() => globalThis.Neo.multiplayerGameView?.active === true),
      fpsProof,
      hostCanvasRendered,
      guestCanvasRendered,
      hostRenderedPlayerCount,
      guestRenderedPlayerCount,
      floorRoomCount: hostSnapshot.gameState?.floorState?.layout?.rooms?.length,
      selectedCharacters: Object.fromEntries(Object.entries(hostPlayers).map(([id, player]) => [id, player.characterKey])),
      starterItems: Object.fromEntries(Object.entries(hostPlayers).map(([id, player]) => [id, player.items])),
      initialEnemyCount,
      players: hostPlayers,
      converged,
      moved,
      errors,
    };
    const screenshotPath = String(process.env.NEONYKE_MULTIPLAYER_SCREENSHOT || '').trim();
    if (screenshotPath) {
      const dot = screenshotPath.lastIndexOf('.');
      const prefix = dot > 0 ? screenshotPath.slice(0, dot) : screenshotPath;
      const suffix = dot > 0 ? screenshotPath.slice(dot) : '.png';
      const hostScreenshotPath = `${prefix}-host${suffix}`;
      const guestScreenshotPath = `${prefix}-guest${suffix}`;
      await Promise.all([
        host.screenshot({ path: hostScreenshotPath, fullPage: true }),
        guest.screenshot({ path: guestScreenshotPath, fullPage: true }),
      ]);
      report.screenshots = { host: hostScreenshotPath, guest: guestScreenshotPath };
    }
    console.log(JSON.stringify(report, null, 2));
    if (!converged || !moved || report.gameViewActive !== true
      || hostRenderedPlayerCount < 2 || guestRenderedPlayerCount < 2
      || hostPlayers['player-1']?.characterKey !== 'princess' || hostPlayers['player-2']?.characterKey !== 'metao'
      || hostPlayers['player-1']?.items?.princes_glasses !== 1
      || hostPlayers['player-2']?.items?.mateos_bag !== 1
      || initialEnemyCount < 1
      || report.floorRoomCount < 8
      || report.fpsProof.mode !== 'fp' || !report.fpsProof.render3D
      || report.fpsProof.threeRendererCalls < 1 || !report.fpsProof.gameViewActive
      || report.fpsProof.sessionStatus !== 'running' || errors.length) process.exitCode = 1;
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
