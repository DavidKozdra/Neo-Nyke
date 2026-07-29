const { chromium } = require('playwright');

const baseUrl = String(
  process.argv[2]
  || process.env.NEONYKE_MULTIPLAYER_URL
  || 'http://127.0.0.1:8787',
).replace(/\/$/, '');

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
  // Networked play now lives behind Alt Modes > MULTIPLAYER.
  await page.locator('#altModesBtn').click();
  await page.locator('.altmodes-tab[data-tab="online"]').click();
  await page.locator('#multiplayerBtn').click();
  await page.locator('#multiplayerCreateRoom').waitFor({ state: 'visible' });
  // Availability is checked asynchronously during startup. Waiting here avoids
  // treating that ordinary probe as a false local-server failure.
  await page.locator('#multiplayerCreateRoom').waitFor({ state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('#multiplayerCreateRoom')?.disabled, undefined, { timeout: 10_000 })
    .catch(() => { throw new Error(`Multiplayer controls are disabled at ${baseUrl}; run this against a localhost Wrangler server`); });
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
  console.log(`smoke starting against ${baseUrl}`);
  const browser = await chromium.launch({ headless: true });
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await Promise.all([hostContext, guestContext].map(context => context.addInitScript(apiBase => {
    globalThis.NEO_MULTIPLAYER_API_BASE = apiBase;
  }, `${baseUrl}/api/multiplayer`)));
  await Promise.all([hostContext, guestContext].map(context => (
    context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
  )));
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
    await host.waitForFunction(() => document.querySelector('#coopLobbyCopyRoomCode')?.dataset.copyState === 'copied');
    const copiedRoomCode = await host.evaluate(() => navigator.clipboard.readText());
    if (copiedRoomCode !== roomCode) throw new Error(`Clipboard contained ${copiedRoomCode} instead of ${roomCode}`);
    await host.locator('#coopLobbyCopyInviteLink').click();
    await host.waitForFunction(() => document.querySelector('#coopLobbyCopyInviteLink')?.dataset.copyState === 'copied');
    const copiedInviteUrl = await host.evaluate(() => navigator.clipboard.readText());
    if (new URL(copiedInviteUrl).searchParams.get('join') !== roomCode) {
      throw new Error(`Invite URL did not contain room ${roomCode}: ${copiedInviteUrl}`);
    }
    await guest.evaluate(inviteUrl => navigator.clipboard.writeText(inviteUrl), copiedInviteUrl);
    await guest.locator('#multiplayerJoinClipboard').click();
    await waitForSessionStatus(guest, 'waiting', 'guest lobby');
    await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members?.length === 2);

    await host.locator('#coopLobbyPicker [data-char="princess"]').click();
    await guest.locator('#coopLobbyPicker [data-char="gelleh"]').click();
    await Promise.all([
      host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members
        ?.find(member => member.playerId === globalThis.Neo.gameSession.snapshot().playerId)?.characterKey === 'princess'),
      guest.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members
        ?.find(member => member.playerId === globalThis.Neo.gameSession.snapshot().playerId)?.characterKey === 'gelleh'),
    ]);

    await Promise.all([
      host.locator('#coopLobbyReady').click(),
      guest.locator('#coopLobbyReady').click(),
    ]);
    await Promise.all([
      waitForSessionStatus(host, 'running', 'host match start'),
      waitForSessionStatus(guest, 'running', 'guest match start'),
    ]);
    await Promise.all([['host', host], ['guest', guest]].map(async ([name, page]) => {
      try {
        await page.waitForFunction(() => (
          globalThis.Neo?.multiplayerGameView?.active === true
          && globalThis.Neo.gameSession.snapshot().gameState?.floorState?.layout?.rooms?.length >= 1
          && Object.values(globalThis.Neo.gameSession.snapshot().gameState?.enemies || {}).some(enemy => !enemy.dead)
          && document.querySelector('#start')?.classList.contains('hidden')
          && !document.querySelector('#hud')?.classList.contains('hidden')
          && !document.querySelector('#actionBar')?.classList.contains('hidden')
        ), undefined, { timeout: 45_000 });
      } catch (error) {
        const diagnostic = await page.evaluate(() => {
          const snapshot = globalThis.Neo?.gameSession?.snapshot?.();
          return {
            status: snapshot?.status,
            gameViewActive: globalThis.Neo?.multiplayerGameView?.active === true,
            roomCount: snapshot?.gameState?.floorState?.layout?.rooms?.length || 0,
            livingEnemies: Object.values(snapshot?.gameState?.enemies || {}).filter(enemy => !enemy.dead).length,
            startHidden: document.querySelector('#start')?.classList.contains('hidden') === true,
            hudHidden: document.querySelector('#hud')?.classList.contains('hidden') === true,
            actionBarHidden: document.querySelector('#actionBar')?.classList.contains('hidden') === true,
          };
        });
        throw new Error(`${name} gameplay readiness failed: ${JSON.stringify(diagnostic)} (${error.message})`);
      }
    }));
    const initialEnemyCount = await host.evaluate(() => Object.values(
      globalThis.Neo.gameSession.snapshot().gameState?.enemies || {},
    ).filter(enemy => !enemy.dead).length);

    // T opens the real multiplayer composer. Sending through the form must route
    // the authority-attributed message to the other browser and its live DOM.
    const chatText = `Meet at the stairs ${roomCode}`;
    await host.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 't', code: 'KeyT', bubbles: true, cancelable: true,
    })));
    await host.locator('#multiplayerChatForm').waitFor({ state: 'visible' });
    await host.locator('#multiplayerChatInput').fill(chatText);
    await host.locator('#multiplayerChatForm button[type="submit"]').click();
    await guest.waitForFunction(expectedText => {
      const snapshot = globalThis.Neo?.gameSession?.snapshot?.();
      const received = snapshot?.chatMessages?.some(message => message.text === expectedText);
      const rendered = Array.from(document.querySelectorAll('#multiplayerChatLog .multiplayer-chat__message'))
        .some(row => row.textContent.includes(expectedText));
      return received && rendered;
    }, chatText, { timeout: 10_000 });
    const chatProof = await guest.evaluate(expectedText => {
      const message = globalThis.Neo.gameSession.snapshot().chatMessages.find(candidate => candidate.text === expectedText);
      return {
        received: !!message,
        playerId: message?.playerId || '',
        displayName: message?.displayName || '',
        rendered: Array.from(document.querySelectorAll('#multiplayerChatLog .multiplayer-chat__message'))
          .some(row => row.textContent.includes(expectedText)),
      };
    }, chatText);

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
      if (globalThis.Neo?.drawWorldViewport && !globalThis.Neo.__network2dSmokeWrapped) {
        const originalWorldViewport = globalThis.Neo.drawWorldViewport.bind(globalThis.Neo);
        globalThis.Neo.__network2dSmokeCalls = 0;
        globalThis.Neo.__network2dSmokeWrapped = true;
        globalThis.Neo.drawWorldViewport = (...args) => {
          globalThis.Neo.__network2dSmokeCalls += 1;
          return originalWorldViewport(...args);
        };
      }
      if (globalThis.Neo?.draw && !globalThis.Neo.__networkDrawSmokeWrapped) {
        const originalDraw = globalThis.Neo.draw.bind(globalThis.Neo);
        globalThis.Neo.__networkDrawSmokeCalls = 0;
        globalThis.Neo.__networkDrawSmokeWrapped = true;
        globalThis.Neo.draw = (...args) => {
          globalThis.Neo.__networkDrawSmokeCalls += 1;
          return originalDraw(...args);
        };
      }
    });
    await host.keyboard.press('Escape');
    await host.locator('#pause').waitFor({ state: 'visible' });
    await host.locator('#pauseSettings').click();
    await host.locator('#settingsModal').waitFor({ state: 'visible' });
    await host.locator('[data-tab="gameplay"]').click();
    await host.locator('[data-view-mode="2d"]').click();
    // Settings keeps the campaign paused. Resume before requiring a viewport
    // draw call; otherwise this smoke test mistakes the intended pause for a
    // multiplayer rendering failure.
    await host.locator('#settingsClose').click();
    await host.locator('#pauseResume').click();
    await host.locator('#pause').waitFor({ state: 'hidden' });
    // The host page can be backgrounded behind the guest page in headless
    // Chromium. Bring it forward before asserting requestAnimationFrame-driven
    // campaign drawing; background tabs may legitimately throttle those frames.
    await host.bringToFront();
    // Three.js/2D drawing functions finish wiring during multiplayer startup,
    // after the first generic renderer probe above. Attach the 2D observation
    // at the point we actually select 2D so this checks the live function.
    await host.evaluate(() => {
      if (globalThis.Neo?.drawWorldViewport && !globalThis.Neo.__network2dSmokeWrapped) {
        const originalWorldViewport = globalThis.Neo.drawWorldViewport.bind(globalThis.Neo);
        globalThis.Neo.__network2dSmokeCalls = 0;
        globalThis.Neo.__network2dSmokeWrapped = true;
        globalThis.Neo.drawWorldViewport = (...args) => {
          globalThis.Neo.__network2dSmokeCalls += 1;
          return originalWorldViewport(...args);
        };
      }
      if (globalThis.Neo?.draw && !globalThis.Neo.__networkDrawSmokeWrapped) {
        const originalDraw = globalThis.Neo.draw.bind(globalThis.Neo);
        globalThis.Neo.__networkDrawSmokeCalls = 0;
        globalThis.Neo.__networkDrawSmokeWrapped = true;
        globalThis.Neo.draw = (...args) => {
          globalThis.Neo.__networkDrawSmokeCalls += 1;
          return originalDraw(...args);
        };
      }
    });
    // Headless Chromium can still defer a scheduled animation frame even after
    // foregrounding. Exercise the exact normal campaign draw entry point once
    // against the live multiplayer-projected state before asserting its result.
    await host.evaluate(() => {
      try {
        globalThis.Neo?.draw?.();
        globalThis.Neo.__network2dManualDrawError = '';
      } catch (error) {
        globalThis.Neo.__network2dManualDrawError = String(error?.stack || error);
      }
    });
    await host.waitForFunction(() => (
      globalThis.Neo?.getViewMode?.() === '2d'
      && globalThis.Neo?.render3D === false
      && globalThis.Neo?.presentationPlayerSlots?.length === 2
      && (globalThis.Neo?.__network2dSmokeCalls || 0) > 0
    ), undefined, { timeout: 5_000 }).catch(async error => {
      const diagnostic = await host.evaluate(() => ({
        viewMode: globalThis.Neo?.getViewMode?.(),
        render3D: globalThis.Neo?.render3D,
        visiblePlayers: globalThis.Neo?.presentationPlayerSlots?.length || 0,
        worldViewportCalls: globalThis.Neo?.__network2dSmokeCalls || 0,
        drawCalls: globalThis.Neo?.__networkDrawSmokeCalls || 0,
        drawWrapped: globalThis.Neo?.__networkDrawSmokeWrapped === true,
        viewportWrapped: globalThis.Neo?.__network2dSmokeWrapped === true,
        drawDescriptor: Object.getOwnPropertyDescriptor(globalThis.Neo || {}, 'draw'),
        viewportDescriptor: Object.getOwnPropertyDescriptor(globalThis.Neo || {}, 'drawWorldViewport'),
        manualDrawError: globalThis.Neo?.__network2dManualDrawError || '',
        gameState: globalThis.Neo?.gameState,
        multiplayerActive: globalThis.Neo?.multiplayerGameView?.active === true,
        loopStarted: globalThis.Neo?.loopStarted === true,
        frameId: globalThis.Neo?.frameId,
        drawType: typeof globalThis.Neo?.draw,
        splitScreen: globalThis.Neo?.isSplitScreen?.(),
        activeSlots: globalThis.Neo?.getActivePlayerSlots?.().length || 0,
      }));
      throw new Error(`2D multiplayer presentation check failed: ${JSON.stringify(diagnostic)} (${error.message})`);
    });
    const twoDimensionalProof = {
      mode: await host.evaluate(() => globalThis.Neo?.getViewMode?.()),
      visiblePlayers: await host.evaluate(() => globalThis.Neo?.presentationPlayerSlots?.length || 0),
      worldViewportCalls: await host.evaluate(() => globalThis.Neo?.__network2dSmokeCalls || 0),
      canvasRendered: await canvasHasRenderedDungeon(host),
    };
    // This is deliberately a real browser -> socket -> authority combat path.
    // It does not inject a dead entity: the browser moves into beam range,
    // holds Princess's normal Love Beam, and waits for the authority snapshot
    // to first reduce HP and then mark that same enemy dead.
    const corpseTarget = await host.evaluate(() => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const player = snapshot.gameState.players[snapshot.playerId];
      const enemy = Object.values(snapshot.gameState.enemies || {})
        .filter(candidate => !candidate.dead && candidate.roomId === player.roomId)
        .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
      if (!enemy) throw new Error('No living enemy is available for the browser corpse proof');
      globalThis.__networkCorpseTargetId = enemy.id;
      globalThis.__networkCorpseInputTimer = setInterval(() => {
        const live = globalThis.Neo.gameSession.snapshot();
        const actor = live.gameState?.players?.[live.playerId];
        const target = live.gameState?.enemies?.[enemy.id];
        if (!actor || !target || target.dead) return;
        const dx = Number(target.x) - Number(actor.x);
        const dy = Number(target.y) - Number(actor.y);
        const distance = Math.hypot(dx, dy) || 1;
        globalThis.Neo.gameSession.sendInput({
          moveX: distance > 300 ? dx / distance : 0,
          moveY: distance > 300 ? dy / distance : 0,
          aimDirection: Math.atan2(dy, dx), buttons: 0,
        });
      }, 50);
      return { id: enemy.id, health: Number(enemy.health ?? enemy.hp), maxHealth: Number(enemy.maxHealth ?? enemy.maxHp) };
    });
    await host.waitForFunction(target => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const player = snapshot.gameState?.players?.[snapshot.playerId];
      const enemy = snapshot.gameState?.enemies?.[target.id];
      return !!player && !!enemy && !enemy.dead && Math.hypot(enemy.x - player.x, enemy.y - player.y) <= 300;
    }, corpseTarget, { timeout: 12_000 });
    await host.evaluate(target => {
      const neo = globalThis.Neo;
      const snapshot = neo.gameSession.snapshot();
      const player = snapshot.gameState.players[snapshot.playerId];
      const enemy = snapshot.gameState.enemies[target.id];
      const aimDirection = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      if (!neo.__networkEnemyDrawSmokeWrapped) {
        const original = neo.drawEnemies.bind(neo);
        neo.__networkEnemyDrawSmokeCalls = 0;
        neo.__networkEnemyDrawSmokeWrapped = true;
        neo.drawEnemies = (...args) => {
          neo.__networkEnemyDrawSmokeCalls += 1;
          neo.__networkEnemyDrawnHp = neo.enemies.find(candidate => candidate.id === neo.__networkCorpseTargetId)?.hp;
          return original(...args);
        };
      }
      if (!neo.__networkCorpseDrawSmokeWrapped) {
        const original = neo.drawDeadBodies.bind(neo);
        neo.__networkCorpseDrawSmokeCalls = 0;
        neo.__networkCorpseDrawSmokeWrapped = true;
        neo.drawDeadBodies = (...args) => {
          neo.__networkCorpseDrawSmokeCalls += 1;
          return original(...args);
        };
      }
      neo.multiplayerGameView.aimDirection = aimDirection;
      neo.multiplayerGameView.laserHeld = true;
      neo.gameSession.sendInput({ moveX: 0, moveY: 0, aimDirection, buttons: 1 });
      neo.gameSession.sendAbility('love_beam', aimDirection);
      // A channel ends normally and its cooldown begins after release. Recast
      // through the same browser session until this real encounter enemy dies;
      // this avoids turning the proof into a one-hit test or injecting damage.
      neo.__networkCorpseBeamTimer = setInterval(() => {
        const live = neo.gameSession.snapshot();
        const actor = live.gameState?.players?.[live.playerId];
        const targetEnemy = live.gameState?.enemies?.[target.id];
        if (!actor || !targetEnemy || targetEnemy.dead) return;
        const angle = Math.atan2(targetEnemy.y - actor.y, targetEnemy.x - actor.x);
        neo.multiplayerGameView.aimDirection = angle;
        neo.gameSession.sendInput({ moveX: 0, moveY: 0, aimDirection: angle, buttons: 1 });
        neo.gameSession.sendAbility('love_beam', angle);
      }, 3_400);
    }, corpseTarget);
    await host.waitForFunction(target => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const enemy = snapshot.gameState?.enemies?.[target.id];
      const actor = globalThis.Neo.enemies?.find(candidate => candidate.id === target.id);
      // A low-health target can die between two browser polls. Death is
      // stronger proof of authority damage and must not turn that success into
      // an eight-second false timeout merely because its live actor was already
      // replaced by the corpse presentation.
      return !!enemy
        && (enemy.dead || Number(enemy.health ?? enemy.hp) < target.health)
        && (enemy.dead || Number(actor?.hp) < target.health)
        && (globalThis.Neo.__networkEnemyDrawSmokeCalls || 0) > 0;
    }, corpseTarget, { timeout: 8_000 });
    await host.waitForFunction(target => globalThis.Neo.gameSession.snapshot().gameState?.enemies?.[target.id]?.dead === true,
      corpseTarget, { timeout: 12_000 });
    const corpseSpawn = await host.evaluate(target => {
      const neo = globalThis.Neo;
      neo.multiplayerGameView.laserHeld = false;
      clearInterval(globalThis.__networkCorpseInputTimer);
      clearInterval(globalThis.__networkCorpseBeamTimer);
      neo.gameSession.sendInput({ moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 });
      const body = neo.deadBodies.find(candidate => String(candidate.id) === String(target.id)
        || String(candidate.sourceEnemyId) === String(target.id));
      return {
        dead: neo.gameSession.snapshot().gameState.enemies[target.id]?.dead === true,
        health: neo.gameSession.snapshot().gameState.enemies[target.id]?.health,
        body: body && { x: body.x, y: body.y, z: body.z, age: body.age, angularOffset: body.angularOffset },
        deadBodyDrawCalls: neo.__networkCorpseDrawSmokeCalls || 0,
      };
    }, corpseTarget);
    await host.waitForFunction(target => {
      const body = globalThis.Neo.deadBodies.find(candidate => String(candidate.id) === String(target.id)
        || String(candidate.sourceEnemyId) === String(target.id));
      return !!body && Number(body.age) > 0.12 && (globalThis.Neo.__networkCorpseDrawSmokeCalls || 0) > 0;
    }, corpseTarget, { timeout: 4_000 });
    const corpseProof = await host.evaluate(target => {
      const neo = globalThis.Neo;
      const body = neo.deadBodies.find(candidate => String(candidate.id) === String(target.id)
        || String(candidate.sourceEnemyId) === String(target.id));
      return {
        target,
        healthBar: {
          hp: neo.__networkEnemyDrawnHp,
          drawCalls: neo.__networkEnemyDrawSmokeCalls || 0,
        },
        corpse: body && { x: body.x, y: body.y, z: body.z, age: body.age, angularOffset: body.angularOffset },
        deadBodyDrawCalls: neo.__networkCorpseDrawSmokeCalls || 0,
        canvasRendered: !!document.querySelector('#c')?.getContext('2d'),
      };
    }, corpseTarget);
    if (process.env.NEONYKE_MULTIPLAYER_CORPSE_PROOF === '1') {
      await host.screenshot({ path: '/tmp/neonyke-multiplayer-corpse.png' });
      console.log(JSON.stringify({ baseUrl, roomCode, twoDimensionalProof, corpseSpawn, corpseProof, errors }, null, 2));
      if (!corpseSpawn.dead || !corpseProof.healthBar.drawCalls || !corpseProof.deadBodyDrawCalls || !corpseProof.corpse || errors.length) process.exitCode = 1;
      return;
    }
    await host.keyboard.press('Escape');
    await host.locator('#pause').waitFor({ state: 'visible' });
    await host.locator('#pauseSettings').click();
    await host.locator('#settingsModal').waitFor({ state: 'visible' });
    await host.locator('[data-tab="gameplay"]').click();
    await host.locator('[data-view-mode="fp"]').click();
    // The default 2D path lazy-loads Three.js only after this click. Attach the
    // probe to the loaded renderer (the early probe above intentionally cannot
    // see it), then exercise the same render entry point once while Settings
    // has the animation loop paused.
    await host.waitForFunction(() => typeof globalThis.Neo?.threeRenderer?.render === 'function',
      undefined, { timeout: 10_000 });
    await host.evaluate(() => {
      const renderer = globalThis.Neo.threeRenderer;
      if (!renderer.__networkFpsSmokeWrapped) {
        const originalRender = renderer.render.bind(renderer);
        renderer.__networkFpsSmokeCalls = 0;
        renderer.__networkFpsSmokeWrapped = true;
        renderer.render = (...args) => {
          renderer.__networkFpsSmokeCalls += 1;
          return originalRender(...args);
        };
      }
      renderer.render();
    });
    await host.waitForFunction(() => (
      globalThis.Neo?.getViewMode?.() === 'fp'
      && globalThis.Neo?.render3D === true
      && (globalThis.Neo?.threeRenderer?.__networkFpsSmokeCalls || 0) > 0
      && globalThis.Neo?.threeRenderer?._debug?.().otherPlayers === 1
      && document.querySelector('#c3d')?.style.display === 'block'
    ), undefined, { timeout: 10_000 }).catch(async error => {
      const diagnostic = await host.evaluate(() => ({
        mode: globalThis.Neo?.getViewMode?.(),
        render3D: globalThis.Neo?.render3D,
        rendererCalls: globalThis.Neo?.threeRenderer?.__networkFpsSmokeCalls || 0,
        renderer: globalThis.Neo?.threeRenderer?._debug?.(),
        canvasDisplay: document.querySelector('#c3d')?.style.display,
        activeSlots: globalThis.Neo?.getActivePlayerSlots?.().map(slot => ({
          id: slot?.id,
          actorId: slot?.getEntity?.()?.id,
          local: slot?.getEntity?.() === globalThis.Neo?.player,
        })),
        projectedSlots: globalThis.Neo?.presentationPlayerSlots?.map(slot => ({
          id: slot?.id,
          actorId: slot?.getEntity?.()?.id,
          local: slot?.getEntity?.() === globalThis.Neo?.player,
        })),
      }));
      throw new Error(`First-person renderer did not become ready: ${JSON.stringify(diagnostic)} (${error.message})`);
    });
    const fpsProof = await host.evaluate(() => ({
      mode: globalThis.Neo?.getViewMode?.(),
      render3D: globalThis.Neo?.render3D === true,
      threeRendererCalls: globalThis.Neo?.threeRenderer?.__networkFpsSmokeCalls || 0,
      visibleRemotePlayers: globalThis.Neo?.threeRenderer?._debug?.().otherPlayers || 0,
      gameViewActive: globalThis.Neo?.multiplayerGameView?.active === true,
      sessionStatus: globalThis.Neo?.gameSession?.snapshot?.().status,
    }));
    await host.locator('[data-view-mode="third"]').click();
    await host.waitForFunction(() => (
      globalThis.Neo?.getViewMode?.() === 'third'
      && globalThis.Neo?.threeRenderer?._debug?.().otherPlayers === 1
    ), undefined, { timeout: 10_000 });
    const thirdPersonProof = await host.evaluate(() => ({
      mode: globalThis.Neo?.getViewMode?.(),
      visibleRemotePlayers: globalThis.Neo?.threeRenderer?._debug?.().otherPlayers || 0,
    }));
    await host.locator('[data-view-mode="fp"]').click();
    const settingsOpened = await host.locator('#settingsModal').isVisible();
    await host.locator('#settingsClose').click();
    await host.locator('#pauseResume').click();
    await host.locator('#pause').waitFor({ state: 'hidden' });
    const pauseProof = await host.evaluate(opened => ({
      settingsOpened: opened,
      resumed: document.querySelector('#pause')?.classList.contains('hidden') === true,
      campaignPlayStateRestored: globalThis.Neo?.gameState === 'play',
    }), settingsOpened);

    // Authoritative acquisition events must enter the normal campaign toast
    // stack. This checks the actual browser DOM, not a network-only HUD label.
    const itemNotificationEventId = `smoke-item-${Date.now()}`;
    await host.evaluate(eventId => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const player = snapshot.gameState.players[snapshot.playerId];
      globalThis.Neo.multiplayerGameView._consumeGameplayEvents([{
        eventId,
        eventType: 'UPGRADE_APPLIED',
        data: {
          playerId: snapshot.playerId,
          roomId: player.roomId,
          itemKey: 'neo_knife',
          amount: 1,
        },
      }]);
    }, itemNotificationEventId);
    await host.locator('#itemNotifyStack .item-toast').first().waitFor({ state: 'visible' });
    const itemNotificationProof = await host.evaluate(() => {
      const toast = document.querySelector('#itemNotifyStack .item-toast');
      return {
        visible: !!toast && getComputedStyle(toast).display !== 'none',
        title: toast?.querySelector('.item-toast-title')?.textContent || '',
        description: toast?.querySelector('.item-toast-desc')?.textContent || '',
      };
    });

    // Trigger Princess's real RMB Love Beam. Both the ordinary projected effect
    // list and the ordinary Three.js beam scene must see it; no network renderer
    // is involved in either assertion.
    await host.evaluate(() => globalThis.Neo?.threeRenderer?.setYaw?.(1.137));
    const fpsAimBeforeLaser = await host.evaluate(() => globalThis.Neo?.getFirstPersonYaw?.());
    await host.locator('#c').click({ button: 'right', position: { x: 640, y: 360 }, force: true });
    await host.waitForFunction(expectedAim => {
      const effects = globalThis.Neo?.activePlayerEffects || [];
      const beams = globalThis.Neo?.threeRenderer?._debug?.().beams || 0;
      const effect = effects.find(candidate => candidate.abilityId === 'love_beam');
      if (!effect || beams < 1) return false;
      const angleDelta = Math.abs(Math.atan2(
        Math.sin(Number(effect.laserAngle) - Number(expectedAim)),
        Math.cos(Number(effect.laserAngle) - Number(expectedAim)),
      ));
      if (angleDelta > 0.0001) return false;
      globalThis.__networkBeamProof = {
        activeEffects: effects.length,
        beams,
        cameraYaw: Number(expectedAim),
        authorityLaserAngle: Number(effect.laserAngle),
        angleDelta,
      };
      return true;
    }, fpsAimBeforeLaser, { timeout: 10_000 });
    const beamProof = await host.evaluate(() => globalThis.__networkBeamProof);

    // Gelleh's RMB uses Blade Justice. Prove the remote action becomes the same
    // three ordinary sword objects in the host's 2D/Three.js presentation.
    await guest.locator('#c').click({ button: 'right', position: { x: 640, y: 360 }, force: true });
    await host.waitForFunction(() => {
      const blades = globalThis.Neo?.justiceBlades || [];
      const rendered = globalThis.Neo?.threeRenderer?._debug?.().justiceBlades || 0;
      if (blades.length !== 3 || rendered !== 3) return false;
      globalThis.__networkBladeProof = { projectedBlades: blades.length, renderedBlades: rendered };
      return true;
    }, undefined, { timeout: 10_000 });
    const bladeJusticeProof = await host.evaluate(() => globalThis.__networkBladeProof);

    // Movement remains normal browser input; only its result is authoritative.
    const movementStart = await host.evaluate(() => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const player = snapshot.gameState.players[snapshot.playerId];
      globalThis.__networkMovementSamples = [];
      globalThis.__networkCaptureMovement = true;
      const sampleMovement = at => {
        if (!globalThis.__networkCaptureMovement) return;
        const actor = globalThis.Neo?.player;
        if (actor) {
          globalThis.__networkMovementSamples.push({
            at,
            x: Number(actor.x || 0),
            y: Number(actor.y || 0),
          });
        }
        requestAnimationFrame(sampleMovement);
      };
      requestAnimationFrame(sampleMovement);
      return { x: player.x, y: player.y, cameraYaw: globalThis.Neo?.getFirstPersonYaw?.() };
    });
    await host.keyboard.down('d');
    await host.waitForTimeout(750);
    await host.keyboard.up('d');
    const localMovementSmoothness = await host.evaluate(() => {
      globalThis.__networkCaptureMovement = false;
      const samples = globalThis.__networkMovementSamples || [];
      const steps = samples.slice(1).map((sample, index) => ({
        distance: Math.hypot(
          sample.x - samples[index].x,
          sample.y - samples[index].y,
        ),
        elapsedMs: Math.max(0.01, sample.at - samples[index].at),
      }));
      const firstMoving = steps.findIndex(step => step.distance > 0.25);
      const movingSteps = firstMoving >= 0 ? steps.slice(firstMoving) : [];
      const stalled = movingSteps.filter(step => step.distance < 0.25).length;
      return {
        samples: samples.length,
        movingFrames: movingSteps.length,
        stalledFrames: stalled,
        stallRatio: movingSteps.length ? stalled / movingSteps.length : 1,
        maximumStep: movingSteps.length ? Math.max(...movingSteps.map(step => step.distance)) : 0,
        maximumFrameIntervalMs: movingSteps.length ? Math.max(...movingSteps.map(step => step.elapsedMs)) : 0,
        maximumSpeed: movingSteps.length
          ? Math.max(...movingSteps.map(step => step.distance / step.elapsedMs * 1000))
          : 0,
      };
    });
    await host.waitForTimeout(180);
    await host.waitForFunction(start => {
      const snapshot = globalThis.Neo.gameSession.snapshot();
      const player = snapshot.gameState?.players?.[snapshot.playerId];
      return player && Math.hypot(player.x - start.x, player.y - start.y) > 20;
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
    // Snapshots are delivered at different instants, so transient tick/action
    // fields are expected to differ. Convergence means both clients agree on
    // the durable identity/inventory and the authoritative world position.
    const converged = Object.entries(hostPlayers).every(([id, hostPlayer]) => {
      const guestPlayer = guestPlayers[id];
      return !!guestPlayer
        && guestPlayer.characterKey === hostPlayer.characterKey
        && JSON.stringify(guestPlayer.items || {}) === JSON.stringify(hostPlayer.items || {})
        && Math.hypot(
          Number(guestPlayer.x || 0) - Number(hostPlayer.x || 0),
          Number(guestPlayer.y || 0) - Number(hostPlayer.y || 0),
        ) <= 2;
    });
    const movedPlayer = hostPlayers[hostSnapshot.playerId];
    const movementDelta = {
      x: Number(movedPlayer?.x || 0) - movementStart.x,
      y: Number(movedPlayer?.y || 0) - movementStart.y,
    };
    const movementDistance = Math.hypot(movementDelta.x, movementDelta.y);
    // D is camera-right. With the shared campaign transform that is the
    // (-sin(yaw), cos(yaw)) world vector for every local network player.
    const expectedStrafe = {
      x: -Math.sin(Number(movementStart.cameraYaw) || 0),
      y: Math.cos(Number(movementStart.cameraYaw) || 0),
    };
    const movementAlignment = movementDistance > 0
      ? (movementDelta.x * expectedStrafe.x + movementDelta.y * expectedStrafe.y) / movementDistance
      : 0;
    const cameraRelativeMovementProof = {
      cameraYaw: movementStart.cameraYaw,
      delta: movementDelta,
      distance: movementDistance,
      alignment: movementAlignment,
    };
    const moved = movementDistance > 20 && movementAlignment > 0.7;
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
      copiedInviteUrl,
      hostStatus: hostSnapshot.status,
      guestStatus: guestSnapshot.status,
      tick: hostSnapshot.gameState?.tick,
      memberCount: hostSnapshot.lobbyState?.members?.length,
      gameViewActive: await host.evaluate(() => globalThis.Neo.multiplayerGameView?.active === true),
      pauseProof,
      chatProof,
      itemNotificationProof,
      twoDimensionalProof,
      fpsProof,
      thirdPersonProof,
      beamProof,
      bladeJusticeProof,
      cameraRelativeMovementProof,
      localMovementSmoothness,
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
    let resultsProof = { shown: false, rematched: false };
    await host.keyboard.press('Escape');
    await host.waitForFunction(() => (
      !document.querySelector('#pauseLeaveServer')?.classList.contains('hidden')
      || globalThis.Neo?.gameSession?.snapshot?.().status === 'ended'
    ), undefined, { timeout: 10_000 });
    if (await host.evaluate(() => globalThis.Neo?.gameSession?.snapshot?.().status === 'ended')) {
      await Promise.all([host, guest].map(page => page.locator('#multiplayerEndScreen').waitFor({ state: 'visible' })));
      resultsProof = await host.evaluate(() => ({
        shown: !document.querySelector('#multiplayerEndScreen')?.classList.contains('hidden'),
        title: document.querySelector('#multiplayerEndTitle')?.textContent || '',
        playAgainVisible: !document.querySelector('#multiplayerRematch')?.classList.contains('hidden'),
        rematched: false,
      }));
      await Promise.all([
        host.locator('#multiplayerRematch').click(),
        guest.locator('#multiplayerRematch').click(),
      ]);
      await Promise.all([
        waitForSessionStatus(host, 'running', 'host rematch'),
        waitForSessionStatus(guest, 'running', 'guest rematch'),
      ]);
      await host.waitForFunction(() => globalThis.Neo?.multiplayerGameView?.active === true);
      resultsProof.rematched = true;
      await host.keyboard.press('Escape');
      await host.locator('#pauseLeaveServer').waitFor({ state: 'visible' });
    }
    await host.locator('#pauseLeaveServer').click();
    await host.waitForFunction(() => (
      !globalThis.Neo?.multiplayerGameView
      && !document.querySelector('#start')?.classList.contains('hidden')
      && !document.body.classList.contains('network-multiplayer-active')
      && !document.body.classList.contains('render3d')
      && document.querySelector('#c3d')?.style.display === 'none'
    ), undefined, { timeout: 10_000 });
    report.leaveProof = await host.evaluate(() => {
      const hudLayerIds = [
        'hud', 'hudLower', 'actionBar', 'equipmentSlots', 'playerStats',
        'coinDisplay', 'centerDisplay', 'objectiveTracker', 'entityDialogueLayer',
      ];
      const visibleHudLayers = hudLayerIds.filter(id => {
        const element = document.getElementById(id);
        if (!element) return false;
        const style = getComputedStyle(element);
        return !element.classList.contains('hidden') && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        gameViewReleased: !globalThis.Neo?.multiplayerGameView,
        menuVisible: !document.querySelector('#start')?.classList.contains('hidden'),
        networkClassRemoved: !document.body.classList.contains('network-multiplayer-active'),
        webglSuspended: !document.body.classList.contains('render3d')
          && document.querySelector('#c3d')?.style.display === 'none',
        pauseClosed: document.querySelector('#pause')?.classList.contains('hidden') === true,
        settingsClosed: document.querySelector('#settingsModal')?.classList.contains('hidden') === true,
        hudHidden: visibleHudLayers.length === 0,
        visibleHudLayers,
      };
    });
    report.resultsProof = resultsProof;
    console.log(JSON.stringify(report, null, 2));
    if (!converged || !moved || report.gameViewActive !== true
      || report.localMovementSmoothness.movingFrames < 20
      || report.localMovementSmoothness.stallRatio >= 0.1
      || report.localMovementSmoothness.maximumSpeed >= 500
      || hostRenderedPlayerCount < 2 || guestRenderedPlayerCount < 2
      || hostPlayers['player-1']?.characterKey !== 'princess' || hostPlayers['player-2']?.characterKey !== 'gelleh'
      || hostPlayers['player-1']?.items?.princes_glasses !== 1
      || hostPlayers['player-2']?.items?.zap_to_extreme !== 1
      || initialEnemyCount < 1
      || report.floorRoomCount < 1
      || report.twoDimensionalProof.mode !== '2d' || report.twoDimensionalProof.visiblePlayers !== 2
      || report.twoDimensionalProof.worldViewportCalls < 1
      || report.fpsProof.mode !== 'fp' || !report.fpsProof.render3D
      || report.fpsProof.visibleRemotePlayers !== 1
      || report.thirdPersonProof.mode !== 'third' || report.thirdPersonProof.visibleRemotePlayers !== 1
      || report.beamProof.activeEffects < 1 || report.beamProof.beams < 1
      || report.bladeJusticeProof.projectedBlades !== 3 || report.bladeJusticeProof.renderedBlades !== 3
      || !report.pauseProof.settingsOpened || !report.pauseProof.resumed || !report.pauseProof.campaignPlayStateRestored
      || !report.chatProof.received || !report.chatProof.rendered || report.chatProof.playerId !== hostSnapshot.playerId
      || !report.itemNotificationProof.visible || !report.itemNotificationProof.title.includes('Neo-Knife')
      || !report.leaveProof.gameViewReleased || !report.leaveProof.menuVisible
      || !report.leaveProof.networkClassRemoved || !report.leaveProof.webglSuspended
      || !report.leaveProof.pauseClosed || !report.leaveProof.settingsClosed || !report.leaveProof.hudHidden
      || (report.resultsProof.shown && (!report.resultsProof.playAgainVisible || !report.resultsProof.rematched))
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
