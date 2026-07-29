#!/usr/bin/env node
'use strict';

// Real browser load proof: every player is an isolated Playwright context using
// the same menus, WebSocket transport, input code, renderer and authority as a
// player in production. It is deliberately separate from the fast in-process
// simulation gate.

const { chromium } = require('playwright');

const cliBaseUrl = require.main === module ? process.argv[2] : undefined;
const baseUrl = String(cliBaseUrl || process.env.NEONYKE_MULTIPLAYER_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const playerCount = Math.max(4, Math.trunc(Number(process.env.NEONYKE_PLAYWRIGHT_PLAYERS || 100) || 100));
const playersPerRoom = 4;
const localAuthority = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(baseUrl);
// Local Wrangler's matching development binding is supplied by
// `npm run multiplayer:dev:load`. Non-local targets always require an explicit
// secret and never receive this convenience value.
const loadToken = String(process.env.NEONYKE_MULTIPLAYER_LOAD_TOKEN || (localAuthority ? 'playwright-local-100' : ''));

if (playerCount % playersPerRoom !== 0) throw new RangeError('NEONYKE_PLAYWRIGHT_PLAYERS must be divisible by 4');
if (playerCount > 40 && !loadToken) {
  throw new Error('NEONYKE_MULTIPLAYER_LOAD_TOKEN is required above 40 players for a non-local target to preserve public rate limits.');
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_unused, index) => values.slice(index * size, (index + 1) * size));
}

async function inBatches(values, size, task) {
  const results = [];
  let offset = 0;
  for (const group of chunks(values, size)) {
    results.push(...await Promise.all(group.map((value, index) => task(value, offset + index))));
    offset += group.length;
  }
  return results;
}

async function waitForStatus(page, expected, label) {
  await page.waitForFunction(status => globalThis.Neo?.gameSession?.snapshot?.().status === status, expected, { timeout: 45_000 })
    .catch(error => { throw new Error(`${label} did not reach ${expected}: ${error.message}`); });
}

async function openMultiplayer(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // Networked play now lives behind Alt Modes > MULTIPLAYER.
  await page.locator('#altModesBtn').click();
  await page.locator('.altmodes-tab[data-tab="online"]').click();
  await page.locator('#multiplayerBtn').click();
  await page.locator('#multiplayerCreateRoom').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => !document.querySelector('#multiplayerCreateRoom')?.disabled, undefined, { timeout: 20_000 })
    .catch(async error => {
      const diagnostic = await page.evaluate(() => ({
        apiBase: globalThis.NEO_MULTIPLAYER_API_BASE,
        multiplayerEnabled: globalThis.NeoNyke?.features?.isEnabled?.('multiplayer'),
        status: document.querySelector('#multiplayerRoomStatus')?.textContent || '',
      }));
      throw new Error(`Multiplayer is unavailable at ${baseUrl}: ${JSON.stringify(diagnostic)} (${error.message})`);
    });
}

async function snapshotPosition(page) {
  return page.evaluate(() => {
    const snapshot = globalThis.Neo?.gameSession?.snapshot?.();
    const player = snapshot?.gameState?.players?.[snapshot.playerId];
    return { x: Number(player?.x || 0), y: Number(player?.y || 0), tick: Number(snapshot?.gameState?.tick || 0) };
  });
}

async function main() {
  const rooms = playerCount / playersPerRoom;
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const players = [];
  const errors = [];
  const startedAt = performance.now();
  try {
    for (let index = 0; index < playerCount; index += 1) {
      const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
      await context.addInitScript(apiBase => {
        globalThis.NEO_MULTIPLAYER_API_BASE = apiBase;
        globalThis.NEO_NYKE_FEATURES = { multiplayer: true };
      }, `${baseUrl}/api/multiplayer`);
      if (loadToken) {
        await context.addCookies([{
          name: 'neonyke_load_test', value: loadToken, url: baseUrl, sameSite: 'Lax', secure: baseUrl.startsWith('https:'),
        }]);
      }
      const page = await context.newPage();
      const label = `player-${index + 1}`;
      page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
      });
      players.push({ context, page, label, roomIndex: Math.floor(index / playersPerRoom) });
    }

    await inBatches(players, 10, async player => openMultiplayer(player.page));
    const roomGroups = chunks(players, playersPerRoom);
    const roomCodes = await inBatches(roomGroups, 5, async (group, roomIndex) => {
      const host = group[0];
      await host.page.locator('#multiplayerCreateRoom').click();
      await waitForStatus(host.page, 'waiting', `room ${roomIndex + 1} host`);
      return host.page.evaluate(() => globalThis.Neo.gameSession.snapshot().roomCode);
    });
    await inBatches(roomGroups, 5, async (group, roomIndex) => {
      const roomCode = roomCodes[roomIndex];
      await Promise.all(group.slice(1).map(async player => {
        await player.page.locator('#multiplayerRoomCode').fill(roomCode);
        await player.page.locator('#multiplayerJoinRoom').click();
        await waitForStatus(player.page, 'waiting', `${player.label} room join`);
      }));
      await group[0].page.waitForFunction(expectedMembers => (
        globalThis.Neo?.gameSession?.snapshot?.().lobbyState?.members?.length === expectedMembers
      ), playersPerRoom, { timeout: 30_000 });
    });
    await inBatches(players, 16, async player => {
      await player.page.locator('#coopLobbyReady').click();
      await waitForStatus(player.page, 'running', `${player.label} match`);
    });
    await inBatches(players, 16, async player => player.page.waitForFunction(() => (
      globalThis.Neo?.multiplayerGameView?.active === true
      && Object.keys(globalThis.Neo?.gameSession?.snapshot?.().gameState?.players || {}).length === 4
    ), undefined, { timeout: 45_000 }));

    const starts = await inBatches(players, 20, async player => snapshotPosition(player.page));
    // Chromium marks most pages hidden when forty contexts share one browser.
    // NetworkGameView correctly suppresses hidden-tab keyboard sampling, so
    // synthetic key presses would measure browser focus scheduling instead of
    // multiplayer capacity. Drive the same BrowserMultiplayerSession/WebSocket
    // input seam directly for this swarm; the two-browser smoke test separately
    // covers active-page keyboard sampling and prediction.
    await Promise.all(players.map((player, playerIndex) => player.page.evaluate(index => {
      const view = globalThis.Neo?.multiplayerGameView;
      if (view?.inputTimer != null) {
        clearInterval(view.inputTimer);
        view.inputTimer = null;
      }
      const directions = [
        { moveX: 1, moveY: 0 },
        { moveX: -1, moveY: 0 },
        { moveX: 0, moveY: 1 },
        { moveX: 0, moveY: -1 },
      ];
      const direction = directions[index % directions.length];
      globalThis.Neo?.gameSession?.sendInput?.({
        ...direction, aimDirection: 0, buttons: 0,
      });
    }, playerIndex)));
    await new Promise(resolve => setTimeout(resolve, 700));
    await Promise.all(players.map(player => player.page.evaluate(() => {
      globalThis.Neo?.gameSession?.sendInput?.({
        moveX: 0, moveY: 0, aimDirection: 0, buttons: 0,
      });
    })));
    await new Promise(resolve => setTimeout(resolve, 1_000));
    const results = await inBatches(players, 20, async (player, index) => player.page.evaluate(({ start, label, roomIndex }) => {
      const snapshot = globalThis.Neo?.gameSession?.snapshot?.();
      const local = snapshot?.gameState?.players?.[snapshot.playerId];
      const allPlayers = snapshot?.gameState?.players || {};
      const distance = Math.hypot(Number(local?.x || 0) - start.x, Number(local?.y || 0) - start.y);
      return {
        label,
        roomIndex,
        status: snapshot?.status,
        tick: Number(snapshot?.gameState?.tick || 0),
        members: Object.keys(allPlayers).length,
        viewActive: globalThis.Neo?.multiplayerGameView?.active === true,
        distance: Number(distance.toFixed(2)),
        moved: distance > 12,
      };
    }, { start: starts[index], label: player.label, roomIndex: player.roomIndex }));
    const failures = results.filter(result => result.status !== 'running' || result.members !== 4
      || !result.viewActive || !result.moved || result.tick < 10);
    const report = {
      baseUrl,
      rooms,
      players: playerCount,
      durationMs: Number((performance.now() - startedAt).toFixed(1)),
      playing: results.length - failures.length,
      failures: failures.length,
      failureDetails: failures,
      minTick: Math.min(...results.map(result => result.tick)),
      maxTick: Math.max(...results.map(result => result.tick)),
      pageErrors: errors,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (failures.length || errors.length) process.exitCode = 1;
  } finally {
    await Promise.all(players.map(player => player.context.close().catch(() => {})));
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { chunks, inBatches, snapshotPosition };
