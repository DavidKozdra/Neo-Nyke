const fs = require('node:fs');
const path = require('node:path');
const Story = require('../js/story/campaigns.js');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('Story Mode campaigns', () => {
  test('assigns every playable story character to an authored route', () => {
    for (const character of ['thorn_knight', 'metao', 'gelleh', 'sarge']) {
      expect(Story.routeForCharacter(character)).toBe('heroes');
    }
    expect(Story.routeForCharacter('princess')).toBe('princess');
    expect(Story.routeForCharacter('turtle_boy')).toBe('turtle_boy');
    expect(Story.routeForCharacter('mooggy')).toBe('mooggy');
    expect(Story.STORY_CHARACTERS).toHaveLength(7);
  });

  test('uses stable internal floor identities with no player-facing seed input', () => {
    expect(Story.storySeed('metao', 4)).toBe(Story.storySeed('metao', 4));
    expect(Story.storySeed('metao', 4)).not.toBe(Story.storySeed('metao', 5));
    expect(Story.storySeed('metao', 4)).not.toBe(Story.storySeed('gelleh', 4));

    const gameState = read('js/core/game-state.js');
    expect(gameState).toContain("const storyRun = Neo.gameMode === 'story'");
    expect(gameState).toContain('storySeed?.(Neo.chosenCharacter, storySkipTutorial ? 2 : 1)');
    expect(gameState).toContain("seedRow.style.display = isCompetitive || isStory ? 'none' : ''");
  });

  test('starts every route with training and maps the authored floor beats', () => {
    for (const character of Story.STORY_CHARACTERS) {
      expect(Story.getFloorPlan(character, 1).scene).toBe('tutorial');
    }
    expect(Story.getFloorPlan('thorn_knight', 2).scene).toBe('heroes_meeting');
    expect(Story.getFloorPlan('metao', 4).scene).toBe('secret_beasts');
    expect(Story.getFloorPlan('sarge', 4).scene).toBe('sarge_skip_warning');
    expect(Story.getFloorPlan('gelleh', 6).encounter).toBe('trance_heroes');
    expect(Story.getFloorPlan('princess', 2).scene).toBe('princess_departure');
    expect(Story.getFloorPlan('turtle_boy', 3).scene).toBe('dragon_orb_quest');
    expect(Story.getFloorPlan('turtle_boy', 4).encounter).toBe('mooggy_duel');
    expect(Story.getFloorPlan('turtle_boy', 8).scene).toBe('five_dragon_orbs');
    expect(Story.getFloorPlan('mooggy', 2).scene).toBe('devil_recruits_mooggy');
    expect(Story.getFloorPlan('mooggy', 7).scene).toBe('thorn_churu_alliance');
  });

  test('gives Princess the shared hero meeting dialogue before her private thought', () => {
    const departure = Story.STORY_GALLERY.find(scene => scene.id === 'princess_departure');
    expect(departure.lines.slice(0, Story.MEETING_LINES.length)).toEqual(Story.MEETING_LINES);
    expect(departure.lines.at(-1)).toEqual({
      speaker: 'PRINCESS THOUGHT',
      text: 'I wonder what it would be like if I saved the day without them',
    });
  });

  test('normalizes serialized progress without sharing mutable state', () => {
    const original = Story.createStoryState('mooggy');
    original.completedScenes.devil_recruits_mooggy = true;
    original.choices.answer = 'fight';
    const restored = Story.normalizeStoryState(original, 'mooggy');
    expect(restored).not.toBe(original);
    expect(restored.completedScenes).not.toBe(original.completedScenes);
    expect(restored.completedScenes.devil_recruits_mooggy).toBe(true);
    expect(restored.route).toBe('mooggy');
  });
});

describe('Story Mode integration', () => {
  const html = read('index.html');
  const main = read('js/main.js');
  const gameState = read('js/core/game-state.js');
  const manager = read('js/story/cutscene-manager.js');
  const rooms = read('js/game/rooms.js');
  const combat = read('js/game/combat.js');
  const renderer = read('js/draw/three-renderer.js');

  test('makes Story Mode permanent and moves Tutorial to Settings', () => {
    expect(html).toContain('id="storyModeBtn"');
    expect(html).toContain('STORY MODE');
    expect(html).toContain('id="settingsPlayTutorial"');
    expect(html).not.toContain('id="tutorialMenuBtn"');
    expect(html).not.toContain('id="infoTutorialBtn"');
  });

  test('offers a saved Story-only tutorial skip with the full reward package', () => {
    expect(html).toContain('id="storySkipTutorial"');
    expect(html).toContain('begin the story with every tutorial reward');
    expect(gameState).toContain('storySkipTutorial: false');
    expect(gameState).toContain('const storySkipTutorial = storyRun && !!Neo.metaProgress?.storySkipTutorial');
    expect(gameState).toContain('Neo.floor = storySkipTutorial ? 2 : 1');
    expect(gameState).toContain('if (storySkipTutorial) grantStoryTutorialSkipPackage()');
    for (const item of ['gold_vac', 'attack_servo', 'pew_pew_box', 'tough_bandaid', 'crit_charm']) {
      expect(gameState).toContain(`'${item}'`);
    }
    expect(gameState).toContain('Neo.storyState.choices.skippedTutorial = true');
    expect(gameState).toContain('Neo.storyState.rewards.tutorialSkipPackage = true');
  });

  test('keeps Story single-player while preserving difficulty selection', () => {
    expect(gameState).toContain("if (mode === 'story') return 'Story'");
    expect(gameState).toContain('const storyUnlocked = isStory');
    expect(gameState).toContain('updateCharacterSelection(isCompetitive ? competitiveUnlocked : storyUnlocked');
    expect(gameState).toContain("challengeToggleEl.style.display = isCompetitive || isStory ? 'none' : ''");
    expect(gameState).toContain("if (difficultySelect) difficultySelect.style.pointerEvents = isCompetitive ? 'none' : ''");
    expect(gameState).toContain('A deterministic single-player campaign. Floor 1 is Sarge\\\'s tutorial.');
  });

  test('loads campaigns before run setup and the manager before the update loop', () => {
    const campaignsIndex = main.indexOf("import './story/campaigns.js'");
    const managerIndex = main.indexOf("import './story/cutscene-manager.js'");
    const updateIndex = main.indexOf("import './core/update.js'");
    expect(campaignsIndex).toBeGreaterThan(-1);
    expect(managerIndex).toBeGreaterThan(campaignsIndex);
    expect(managerIndex).toBeLessThan(updateIndex);
  });

  test('gives the Devil his portrait and Mooggy her answer', () => {
    const controller = read('js/ui/controller.js');
    expect(controller).toContain("if (normalized === 'devil') return 'handsome_devil'");
    expect(manager).toContain("storyLine('MOOGGY', 'Yes, uncle.')");
    const galleryScene = Story.STORY_GALLERY.find(scene => scene.id === 'devil_recruits_mooggy');
    expect(galleryScene.lines).toContainEqual({ speaker: 'MOOGGY', text: 'Yes, uncle.' });
  });

  test('supports authored camera, movement, jumping, emotes, choices, and hold-to-skip', () => {
    for (const command of ['focusGroup', 'move', 'jump', 'emote', 'lightning', 'transformBane', 'startEncounter']) {
      expect(manager).toContain(`type: '${command}'`);
    }
    expect(manager).toContain('this.skipHeld >= 0.8');
    expect(manager).toContain("Neo.storyState.choices.bowmanBane = 'escaped'");
    expect(renderer).toContain('function syncStoryActors()');
    expect(renderer).toContain('function syncStoryEmote(');
  });

  test('stages Princess in the hero meeting and walks the player-controlled Princess away', () => {
    expect(manager).toContain("if (id === 'heroes_meeting' || id === 'princess_departure')");
    expect(manager).toContain("const princessIsPlayer = character === 'princess';");
    expect(manager).toContain("{ type: 'dialogue', lines: Story.MEETING_LINES }");
    expect(manager).toContain("key: princessIsPlayer ? 'player' : 'princess'");
  });

  test('uses authored rooms and suppresses random rivals in Story Mode', () => {
    expect(rooms).toContain("globalThis.NeoNyke?.story?.getFloorPlan?.(Neo.player?.character || Neo.chosenCharacter, Neo.floor)");
    expect(rooms).toContain("Neo.gameMode !== 'story'");
    expect(rooms).toContain('storySecret.storySecretRoom = true');
  });

  test('routes story encounter deaths and the final God victory through story rules', () => {
    expect(combat).toContain('Neo.onStoryEnemyDefeated?.(enemy)');
    expect(combat).toContain("Neo.gameMode === 'story'");
    expect(manager).toContain("Neo.storyState.ally = { character: 'thorn_knight', hp: 1 }");
  });
});
