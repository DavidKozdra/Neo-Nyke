const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('Sarge tutorial v2', () => {
  const html = read('index.html');
  const main = read('js/main.js');
  const controller = read('js/ui/tutorial-controller.js');
  const tutorialCss = read('css/tutorial.css');
  const scenes = read('js/tutorial/scenes.js');
  const rooms = read('js/game/rooms.js');
  const enemies = read('js/game/enemies.js');
  const world = read('js/game/world.js');
  const uiController = read('js/ui/controller.js');
  const gamepadControls = read('js/gamepadControls.js');
  const gameState = read('js/core/game-state.js');
  const panels = read('js/ui/panels.js');
  const serviceWorker = read('sw.js');

  test('loads a dedicated tutorial controller and stylesheet', () => {
    expect(html).toContain('css/tutorial.css');
    expect(html).toContain('id="tutorialSpotlightHole"');
    expect(html).toContain('id="tutorialCard"');
    expect(html).toContain('id="tutorialCommandValue"');
    expect(main).toContain("import './ui/tutorial-controller.js'");
  });

  test('shows live keyboard, touch, and controller commands prominently', () => {
    expect(controller).toContain('getBindingLabel?.(action)');
    expect(controller).toContain('DEFAULT_TOUCH_BINDINGS');
    expect(controller).toContain('DEFAULT_GAMEPAD_BINDINGS');
    expect(controller).toContain("overlay.dataset.inputMode = getInputMode()");
    expect(controller).toContain("command: () => getActionLabel('dash', 'SHIFT')");
    expect(controller).toContain("ring.classList.toggle('tutorial-target-ring--offscreen', offscreen)");
    expect(controller).toContain("commandLabel.textContent = nextCommand ? (step.commandLabel || 'PRESS') : ''");
    expect(controller).toContain('if (gate) gate.hidden = true');
    expect(tutorialCss).toContain('.tutorial-command__value');
    expect(tutorialCss).toContain('.tutorial-command[hidden]');
    expect(tutorialCss).toContain('.tutorial-target-ring--offscreen::before');
    expect(tutorialCss).toContain('font-size: calc(27px * var(--font-scale, 1))');
    expect(tutorialCss).toContain('.tutorial-cutscene-active .dialogue-text');
    expect(uiController).toContain("touchInput ? 'TAP' : gamepadInput ? 'A BUTTON' : 'ENTER'");
    expect(gamepadControls).toContain('window.Neo?.uiController?.isDialogueOpen?.()');
  });

  test('keeps Sarge dialogue in an editable tutorial directory', () => {
    expect(scenes).toContain("Name's Sarge.");
    for (const lesson of ['start', 'training', 'treasure', 'shop', 'forge', 'challenge', 'secret', 'ladder', 'summary']) {
      expect(scenes).toContain(`lesson: '${lesson}'`);
    }
    expect(controller).toContain("from '../tutorial/scenes.js'");
    expect(controller).toContain("Neo.uiController?.playDialogue?.(scene.lines");
  });

  test('builds distinct deterministic lesson rooms', () => {
    for (const key of ['trainingRoomKey', 'treasureRoomKey', 'shopRoomKey', 'forgeRoomKey', 'challengeRoomKey', 'ladderRoomKey']) {
      expect(rooms).toContain(`Neo.tutorialState.${key}`);
    }
    expect(rooms).toContain("challengeRoom.challengeType = 'bomb'");
    expect(rooms).toContain("room.tutorialLesson = '");
  });

  test('recovers cleanly when rooms or actions happen out of order', () => {
    expect(controller).toContain("roomKey: 'trainingRoomKey'");
    expect(controller).toContain('routeStep: true');
    expect(controller).toContain("completeWhen: ['dwell_do']");
    expect(controller).toContain('if (step.routeStep) return isInStepRoom(step, state) || areCompletionMilestonesDone(step, state)');
    expect(controller).toContain("title: `${returning ? 'Return to' : 'Go to'} ${destinationName}`");
    expect(controller).toContain("target: targetRoute(() => getNextDoorPoint(destinationKey)");
    expect(controller).toContain("if (type === 'dash') setCompleted('dash')");
    expect(controller).not.toContain("current === 'route_training'");
    expect(controller).not.toContain("current === 'dash'");
  });

  test('route steps ask the player to close an open panel and highlight its close button', () => {
    // Open Inventory/Shop/Forge panels must be detected by their close-button selectors.
    expect(controller).toContain("closeSelector: '#invClose'");
    expect(controller).toContain("closeSelector: '#shopClose'");
    expect(controller).toContain("closeSelector: '#anvilClose'");
    // Route text/command switch to a close prompt while a panel is open.
    expect(controller).toContain('Close Inventory');
    expect(controller).toContain('CLOSE THE ${open.toUpperCase()}');
    expect(controller).toContain('GO THROUGH THE TARGET DOOR');
    // The route highlight points at the open panel's close button before the door.
    expect(controller).toContain("if (spec.kind === 'route')");
    expect(controller).toContain('const open = getOpenGamePanelInfo()');
  });

  test('route highlights only a live doorway and Forge chooses its equipped item directly', () => {
    expect(controller).toContain('Only highlight a doorway that is actually present in the live room');
    expect(controller).toContain("!current.doors?.[direction]");
    expect(panels).toContain("automatic: true");
    expect(controller).not.toContain("id: 'forge_item_select'");
  });

  test('makes target doors unmistakable without silently gating exploration', () => {
    expect(tutorialCss).toContain('.tutorial-target-ring--route::before');
    expect(tutorialCss).toContain('content: "GO HERE"');
    expect(tutorialCss).toContain('animation: tutorial-door-flash');
    expect(world).not.toContain('function isTutorialDoorBlocked');
    expect(world).toContain('If the player\n      // explores out of order');
  });

  test('teaches tools by inspection and by required activation', () => {
    expect(controller).toContain("id: 'inventory_tools'");
    expect(controller).toContain("payload.tab === 'tools'");
    expect(controller).toContain('complete: state => !!state.completed?.tools_fire');
    expect(controller).toContain('Tools are activatable gear, not passive relics');
    expect(controller).not.toMatch(/id: 'tools_fire'[\s\S]{0,900}manual: true/);
  });

  test('only teaches beam struggles when the chosen loadout actually has a beam', () => {
    expect(controller).toContain("id: 'beam_struggle'");
    expect(controller).toContain('beamOnly: true');
    expect(controller).toContain('allSteps.filter(step => isStepAvailable(step))');
    expect(controller).toContain("if (type === 'beam-struggle-won') setCompleted('beam_struggle')");
    expect(controller).toContain('enemy?.tutorialBeamUser');
    expect(gameState).toContain('tutorialLoadoutHasBeam(Neo.player)');
    expect(gameState).not.toContain("Neo.equipMove('laser', statusLaser)");
    expect(gameState).toContain('function ensureTutorialBeamStruggleEnemy()');
    expect(gameState).toContain("state.step !== 'beam_struggle'");
    expect(gameState).toContain("dummy.beamColor = '#ff365f'");
  });

  test('ends with a real, clearly explained ladder-room fight', () => {
    expect(rooms).toContain('ladderRoom.cleared = false');
    expect(rooms).toContain("room.tutorialLesson === 'ladder'");
    expect(rooms).toContain('tutorialExit ? 3 : Neo.getWaveCount(4)');
    expect(rooms).toContain('suppressBossUpgrade: tutorialExit');
    expect(rooms).toContain("text: 'FINAL WAVE — DOORS LOCKED'");
    expect(controller).toContain("id: 'ladder_fight'");
    expect(controller).toContain('Ladder rooms lock only while their final wave is alive');
    expect(scenes).toContain('Ordinary combat rooms let you retreat');
    expect(scenes).toContain('This is the one room you cannot retreat from while enemies remain');
  });

  test('does not play future room cutscenes before their lesson is current', () => {
    expect(controller).toContain("roomKey(room) !== state[step.roomKey]");
    expect(controller).toContain("room.tutorialLesson !== 'start'");
  });

  test('uses a safe real bomb trial for the challenge lesson', () => {
    expect(enemies).toContain("room.tutorialLesson === 'challenge'");
    expect(enemies).toContain('const safeCount = tutorialBombs ? 2');
    expect(enemies).toContain("for (let index = 0; index < (tutorialBombs ? 0 : 5)");
    expect(world).toContain("tutorialBomb ? 'RED = DANGER' : 'WRONG'");
    expect(world).toContain('tutorial: tutorialBomb');
    expect(world).toContain('if (result.removePickup) removePickupAt(index)');
  });

  test('precaches all new tutorial assets', () => {
    // The precache list is generated (scripts/generate-precache.js) and quotes
    // entries with JSON (double quotes), so match the path quote-agnostically.
    const cached = new Set((serviceWorker.match(/["'](\/[^"']+)["']/g) || [])
      .map(s => s.slice(1, -1)));
    expect(cached.has('/css/tutorial.css')).toBe(true);
    expect(cached.has('/js/ui/tutorial-controller.js')).toBe(true);
    expect(cached.has('/js/tutorial/scenes.js')).toBe(true);
  });

  test('gates the Sarge tutorial replay behind defeating Bowman\'s Bane', () => {
    // Sarge unlocks (for normal play and the tutorial replay) once Bowman's Bane is defeated.
    expect(gameState).toContain('function hasSargeUnlockPrereq()');
    expect(gameState).toContain("return Number(Neo.metaProgress?.bowmanBaneDefeats || 0) > 0");
    expect(gameState).toContain('function isSargeTutorialBlocked()');
    expect(gameState).toContain('return isReplayTutorialRequested() && !hasSargeUnlockPrereq()');
    expect(gameState).toContain('Neo.isSargeTutorialBlocked = isSargeTutorialBlocked');
    // Run start drops the replay rather than running the tutorial as Sarge.
    expect(gameState).toContain("if (!resume && Neo.chosenCharacter === 'sarge' && isSargeTutorialBlocked())");
    // Charselect nudges a blocked Sarge selection onto a starter.
    expect(gameState).toContain("if (Neo.chosenCharacter === 'sarge' && isSargeTutorialBlocked())");
    // The character-select UI disables Sarge's card and the Go button.
    expect(uiController).toContain('const sargeTutorialBlocked = !!Neo.isSargeTutorialBlocked?.()');
    expect(uiController).toContain("unlocked.has(itemKey) && !(itemKey === 'sarge' && sargeTutorialBlocked)");
    expect(uiController).toContain("if (itemKey === 'sarge' && sargeTutorialBlocked) return 'Unlock the full roster first'");
    expect(uiController).toContain('goBtn.disabled = !isSelectable(selected) || inactiveCustom');
    // Programmatic (carousel/keyboard) selection of a gated Sarge is rejected.
    expect(panels).toContain("if (characterKey === 'sarge' && Neo.isSargeTutorialBlocked?.())");
  });

  test('keeps ordinary New Game runs out of tutorial mode', () => {
    expect(gameState).toContain("const shouldRunTutorial = Neo.gameMode === 'normal'\n      && forceTutorialReplay;");
    expect(gameState).not.toContain('!Neo.metaProgress.tutorialCompleted || forceTutorialReplay || outdatedTutorial');
  });
});
