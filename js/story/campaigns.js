(function initStoryCampaigns(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.story = namespace.story || {};
  Object.assign(namespace.story, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStoryCampaignsApi() {
  'use strict';

  const STORY_VERSION = 1;
  const STORY_SEED_PREFIX = 'NEONYKE-STORY-V1';
  const STORY_CHARACTERS = Object.freeze([
    'princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy', 'turtle_boy', 'sarge',
  ]);
  const HERO_ROUTE_CHARACTERS = Object.freeze(['thorn_knight', 'metao', 'gelleh', 'sarge']);

  const DEVIL_POEM = Object.freeze([
    { speaker: 'DEVIL', text: "Friend or foe, your doom's arrival" },
    { speaker: 'DEVIL', text: 'Enter the dungeon and pray for survival.' },
    { speaker: 'DEVIL', text: 'Dead men once loyal, bound as allies,' },
    { speaker: 'DEVIL', text: 'Now claw at each other as ruthless rivals.' },
  ]);

  const MEETING_LINES = Object.freeze([
    { speaker: 'SARGE', text: 'OK now that we are all here lets talk business' },
    { speaker: 'THORN', text: 'The only way to stop my old masters is to consume the items in the dungeon relics left around as toys' },
    { speaker: 'GELLEH', text: 'yea ... duh' },
    { speaker: 'THORN', text: '! ok well ok fine lets just get to the 9th ladder and end him !', emote: '!' },
    { speaker: 'PRINCESS', text: 'My heroes thanks for doing all the work while I sit around day dreaming go forth and win' },
  ]);

  const MOOGGY_DUELS = Object.freeze({
    3: 'princess',
    4: 'turtle_boy',
    5: 'metao',
    6: 'gelleh',
    7: 'thorn_knight',
  });

  const STORY_GALLERY = Object.freeze([
    { id: 'heroes_meeting', title: 'Talk Business', subtitle: 'The heroes gather on Floor 2', storyMode: true, characters: HERO_ROUTE_CHARACTERS, lines: MEETING_LINES },
    { id: 'secret_beasts', title: 'Secret Beasts', subtitle: "Sarge becomes Bowman's Bane", storyMode: true, characters: HERO_ROUTE_CHARACTERS.filter(key => key !== 'sarge'), lines: [
      { speaker: 'SARGE', text: 'Hey cool a skip room we can come all the way back here as much as we want' },
    ] },
    { id: 'devil_trance', title: 'Trance of Hate', subtitle: 'The Devil turns allies into rivals', storyMode: true, characters: HERO_ROUTE_CHARACTERS, lines: DEVIL_POEM },
    { id: 'princess_departure', title: 'Day Dream Hero', subtitle: 'Princess decides to save the day', storyMode: true, characters: ['princess'], lines: [
      { speaker: 'PRINCESS', text: 'My heroes thanks for doing all the work while I sit around day dreaming go forth and win' },
      { speaker: 'PRINCESS THOUGHT', text: 'I wonder what it would be like if I saved the day without them' },
    ] },
    { id: 'dragon_orb_quest', title: 'Quest for the Dragon Orbs', subtitle: 'Turtle Boy seeks strength', storyMode: true, characters: ['turtle_boy'], lines: [
      { speaker: 'TURTLE BOY', text: 'I need to find all the dragon orbs I can to become the strongest' },
    ] },
    { id: 'turtle_meets_mooggy', title: 'Mooggy the Assassin', subtitle: 'Two strangers meet on Floor 4', storyMode: true, characters: ['turtle_boy'], lines: [
      { speaker: 'MOOGGY', text: 'Who are you' }, { speaker: 'TURTLE BOY', text: 'Who are you ?' }, { speaker: 'MOOGGY', text: 'well might as well fight' },
    ] },
    { id: 'five_dragon_orbs', title: 'Five Free Dragon Orbs', subtitle: 'A cache on Floor 8', storyMode: true, characters: ['turtle_boy'], lines: [
      { speaker: 'TURTLE BOY', text: 'Five free Dragon Orbs. Now I am getting somewhere.' },
    ] },
    { id: 'devil_recruits_mooggy', title: "The Devil's Assignment", subtitle: 'A meeting in the lava pit', storyMode: true, characters: ['mooggy'], lines: [
      { speaker: 'DEVIL', text: 'Ok moogy listen you must stop the heroes at all cost' },
    ] },
    { id: 'thorn_churu_alliance', title: 'Churu Truce', subtitle: 'Thorn and Mooggy join forces', storyMode: true, characters: ['mooggy'], lines: [
      { speaker: 'THORN', text: 'You have fought everyone else. Before we fight, take this churu.' }, { speaker: 'MOOGGY', text: '...mrow.' },
    ] },
  ]);

  function routeForCharacter(character) {
    if (HERO_ROUTE_CHARACTERS.includes(character)) return 'heroes';
    if (character === 'princess') return 'princess';
    if (character === 'turtle_boy') return 'turtle_boy';
    if (character === 'mooggy') return 'mooggy';
    return '';
  }

  function storySeed(character, floor) {
    return `${STORY_SEED_PREFIX}|${routeForCharacter(character)}|${character}|floor:${Math.max(1, Number(floor) || 1)}`;
  }

  function createStoryState(character) {
    return {
      version: STORY_VERSION,
      route: routeForCharacter(character),
      character,
      completedScenes: {},
      completedEncounters: {},
      choices: {},
      rewards: {},
      objective: '',
      ally: null,
      floor8DragonOrbsClaimed: {},
    };
  }

  function normalizeStoryState(input, character) {
    const fallback = createStoryState(character);
    const source = input && typeof input === 'object' ? input : {};
    return {
      ...fallback,
      version: STORY_VERSION,
      route: routeForCharacter(character),
      character,
      completedScenes: { ...(source.completedScenes || {}) },
      completedEncounters: { ...(source.completedEncounters || {}) },
      choices: { ...(source.choices || {}) },
      rewards: { ...(source.rewards || {}) },
      objective: String(source.objective || ''),
      ally: source.ally && typeof source.ally === 'object' ? { ...source.ally } : null,
      floor8DragonOrbsClaimed: { ...(source.floor8DragonOrbsClaimed || {}) },
    };
  }

  function getFloorPlan(character, floor) {
    const route = routeForCharacter(character);
    const floorNumber = Math.max(1, Math.trunc(Number(floor) || 1));
    const plan = {
      id: `${route}:${character}:floor:${floorNumber}`,
      route,
      character,
      floor: floorNumber,
      layoutKey: `${route}:floor:${floorNumber}`,
      scene: '',
      encounter: '',
      objective: floorNumber === 10 ? 'Defeat GOD' : `Reach the ladder on Floor ${floorNumber}`,
    };
    if (floorNumber === 1) return { ...plan, scene: 'tutorial', objective: 'Complete Sarge\'s training' };
    if (route === 'heroes') {
      if (floorNumber === 2) return { ...plan, scene: 'heroes_meeting', objective: 'Hear Sarge\'s plan' };
      if (floorNumber === 4) return { ...plan, scene: character === 'sarge' ? 'sarge_skip_warning' : 'secret_beasts', objective: 'Investigate the secret skip room' };
      if (floorNumber === 6) return { ...plan, scene: 'devil_trance', encounter: 'trance_heroes', objective: 'Escape the Devil\'s trance' };
    }
    if (route === 'princess' && floorNumber === 2) {
      return { ...plan, scene: 'princess_departure', objective: 'Save the day yourself' };
    }
    if (route === 'turtle_boy') {
      if (floorNumber === 3) return { ...plan, scene: 'dragon_orb_quest', objective: 'Find the Dragon Orb' };
      if (floorNumber === 4) return { ...plan, scene: 'turtle_meets_mooggy', encounter: 'mooggy_duel', objective: 'Defeat Mooggy' };
      if (floorNumber === 8) return { ...plan, scene: 'five_dragon_orbs', objective: 'Claim all five Dragon Orbs' };
      if (floorNumber === 10) return { ...plan, objective: 'Defeat GOD and become the strongest there is' };
    }
    if (route === 'mooggy') {
      if (floorNumber === 2) return { ...plan, scene: 'devil_recruits_mooggy', objective: 'Stop the heroes at all costs' };
      if (MOOGGY_DUELS[floorNumber]) {
        return {
          ...plan,
          scene: floorNumber === 7 ? 'thorn_churu_alliance' : `mooggy_duel_${MOOGGY_DUELS[floorNumber]}`,
          encounter: `hero_duel:${MOOGGY_DUELS[floorNumber]}`,
          objective: floorNumber === 7 ? 'Face Thorn' : `Defeat ${MOOGGY_DUELS[floorNumber]}`,
        };
      }
    }
    return plan;
  }

  return {
    STORY_VERSION,
    STORY_SEED_PREFIX,
    STORY_CHARACTERS,
    HERO_ROUTE_CHARACTERS,
    DEVIL_POEM,
    MEETING_LINES,
    MOOGGY_DUELS,
    STORY_GALLERY,
    routeForCharacter,
    storySeed,
    createStoryState,
    normalizeStoryState,
    getFloorPlan,
  };
});
