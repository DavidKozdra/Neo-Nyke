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
    await host.locator('#multiplayerCopyRoomCode').click();
    await host.waitForFunction(() => document.querySelector('#multiplayerCopyRoomCode')?.textContent?.includes('COPIED'));
    const copiedRoomCode = await host.evaluate(() => navigator.clipboard.readText());
    if (copiedRoomCode !== roomCode) throw new Error(`Clipboard contained ${copiedRoomCode} instead of ${roomCode}`);
    await guest.locator('#multiplayerRoomCode').fill(roomCode);
    await guest.locator('#multiplayerJoinRoom').click();
    await waitForSessionStatus(guest, 'waiting', 'guest lobby');
    await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members?.length === 2);

    await host.locator('#multiplayerCharacter').selectOption('sarge');
    await guest.locator('#multiplayerCharacter').selectOption('princess');
    await Promise.all([
      host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members
        ?.find(member => member.playerId === globalThis.Neo.gameSession.snapshot().playerId)?.characterKey === 'sarge'),
      guest.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members
        ?.find(member => member.playerId === globalThis.Neo.gameSession.snapshot().playerId)?.characterKey === 'princess'),
    ]);

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
      && Object.values(globalThis.Neo.gameSession.snapshot().gameState?.enemies || {}).some(enemy => !enemy.dead)
      && document.querySelector('#start')?.classList.contains('hidden')
      && !document.querySelector('#multiplayerGameHud')?.classList.contains('hidden')
    ))));

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
    await Promise.all([host, guest].map(page => page.waitForFunction(() => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const roomId = snapshot.gameState?.floorState?.currentRoomId;
      return snapshot.gameState?.floorState?.encounters?.[roomId]?.status === 'cleared';
    }, { timeout: 10_000 })));

    const combatProof = await host.evaluate(() => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      return {
        eventTypes: snapshot.gameplayEvents.map(event => event.eventType),
        livingEnemies: Object.values(snapshot.gameState?.enemies || {}).filter(enemy => !enemy.dead).length,
        pickupCount: Object.keys(snapshot.gameState?.pickups || {}).length,
        totalGold: Object.values(snapshot.gameState?.players || {}).reduce((total, player) => total + Number(player.gold || 0), 0),
      };
    });

    const traversalStart = await host.evaluate(() => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const floor = snapshot.gameState.floorState;
      const player = snapshot.gameState.players[snapshot.playerId];
      const room = floor.layout.rooms.find(candidate => candidate.id === floor.currentRoomId);
      return {
        roomId: room.id,
        direction: Object.keys(room.doors).find(key => room.doors[key]),
        player,
        width: floor.width,
        height: floor.height,
        wall: floor.wallThickness,
      };
    });
    if (['n', 's'].includes(traversalStart.direction)) {
      const deltaX = traversalStart.width / 2 - traversalStart.player.x;
      if (Math.abs(deltaX) > 8) await holdKey(host, deltaX > 0 ? 'd' : 'a', Math.abs(deltaX) / 180 * 1000);
    } else {
      const deltaY = traversalStart.height / 2 - traversalStart.player.y;
      if (Math.abs(deltaY) > 8) await holdKey(host, deltaY > 0 ? 's' : 'w', Math.abs(deltaY) / 180 * 1000);
    }
    const alignedPlayer = await host.evaluate(() => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      return snapshot.gameState.players[snapshot.playerId];
    });
    const radius = Number(alignedPlayer.radius || 18);
    const boundary = Number(traversalStart.wall || 28) + radius;
    const travelDistance = traversalStart.direction === 'n'
      ? alignedPlayer.y - boundary
      : traversalStart.direction === 's'
        ? traversalStart.height - boundary - alignedPlayer.y
        : traversalStart.direction === 'e'
          ? traversalStart.width - boundary - alignedPlayer.x
          : alignedPlayer.x - boundary;
    const directionKey = { n: 'w', s: 's', e: 'd', w: 'a' }[traversalStart.direction];
    await holdKey(host, directionKey, Math.max(700, travelDistance / 180 * 1000 + 700));
    const roomAfterFirstHold = await host.evaluate(() => globalThis.Neo.gameSession.snapshot().gameState?.floorState?.currentRoomId);
    if (roomAfterFirstHold === traversalStart.roomId) await holdKey(host, directionKey, 1200);
    try {
      await Promise.all([host, guest].map(page => page.waitForFunction(initialRoomId => (
        globalThis.Neo.gameSession.snapshot().gameState?.floorState?.currentRoomId !== initialRoomId
      ), traversalStart.roomId, { timeout: 10_000 })));
    } catch (error) {
      const traversalDiagnostics = await host.evaluate(() => {
        const snapshot = globalThis.Neo.gameSession.snapshot();
        return {
          playerId: snapshot.playerId,
          player: snapshot.gameState?.players?.[snapshot.playerId],
          floorState: snapshot.gameState?.floorState,
          pressedKeys: Array.from(globalThis.Neo.multiplayerGameView?.keys || []),
        };
      });
      throw new Error(`Room traversal timed out: ${JSON.stringify({ traversalStart, alignedPlayer, travelDistance, directionKey, traversalDiagnostics })}; ${error.message}`);
    }

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
    const moved = Math.abs(Number(hostPlayers['player-1']?.x || 300) - 300) > 20
      || Math.abs(Number(hostPlayers['player-2']?.x || 600) - 600) > 20;
    const finalRoomId = hostSnapshot.gameState?.floorState?.currentRoomId;
    const traversed = finalRoomId && finalRoomId !== traversalStart.roomId
      && guestSnapshot.gameState?.floorState?.currentRoomId === finalRoomId;
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
      hostCanvasRendered,
      guestCanvasRendered,
      hostRenderedPlayerCount,
      guestRenderedPlayerCount,
      floorRoomCount: hostSnapshot.gameState?.floorState?.layout?.rooms?.length,
      initialRoomId: traversalStart.roomId,
      finalRoomId,
      doorDirection: traversalStart.direction,
      traversed,
      visitedRoomCount: hostSnapshot.gameState?.floorState?.visitedRoomIds?.length,
      selectedCharacters: Object.fromEntries(Object.entries(hostPlayers).map(([id, player]) => [id, player.characterKey])),
      combat: { initialEnemyCount, ...combatProof },
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
    if (!converged || !moved || !traversed || report.gameViewActive !== true
      || !hostCanvasRendered || !guestCanvasRendered
      || hostRenderedPlayerCount !== 2 || guestRenderedPlayerCount !== 2
      || hostPlayers['player-1']?.characterKey !== 'sarge' || hostPlayers['player-2']?.characterKey !== 'princess'
      || initialEnemyCount < 1 || combatProof.livingEnemies !== 0
      || !combatProof.eventTypes.includes('PLAYER_ATTACKED')
      || !combatProof.eventTypes.includes('ENEMY_DEFEATED')
      || !combatProof.eventTypes.includes('PICKUP_SPAWNED')
      || !combatProof.eventTypes.includes('ROOM_CLEARED')
      || report.visitedRoomCount < 2
      || report.floorRoomCount < 8 || errors.length) process.exitCode = 1;
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
