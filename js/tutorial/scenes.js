// Editable Sarge tutorial script.
// Keep room teaching text here so designers can revise dialogue without touching
// tutorial state, floor generation, or UI code.

export const TUTORIAL_SCENES = {
  welcome: {
    lesson: 'start',
    lines: [
      { speaker: 'SARGE', text: "I'm Sarge. Welcome to the tutorial." },
      { speaker: 'SARGE', text: 'This floor is built to teach you the dungeon one room at a time. When I speak, everything stops. Read first, then act.' },
      { speaker: 'SARGE', text: 'Start with movement and the HUD. The bright tutorial marker always points to the exact control or doorway you need.' },
    ],
  },
  training: {
    lesson: 'training',
    lines: [
      { speaker: 'SARGE', text: 'Training room. Rooms with enemies lock until the fight is over.' },
      { speaker: 'SARGE', text: 'Dash avoids danger. Your close attack, ranged attack, and heavy move each have their own cooldown and purpose.' },
      { speaker: 'SARGE', text: 'Use every attack on the dummy, finish it, then collect the relic it leaves behind.' },
    ],
  },
  treasure: {
    lesson: 'treasure',
    lines: [
      { speaker: 'SARGE', text: 'Treasure room. Chests can contain coins, healing, relics, or a choice between rewards.' },
      { speaker: 'SARGE', text: 'Walk into a chest to open it. If two reward zones appear, stand in the one you want until its meter fills.' },
      { speaker: 'SARGE', text: 'Open this chest before moving on.' },
    ],
  },
  shop: {
    lesson: 'shop',
    lines: [
      { speaker: 'SARGE', text: 'Shop room. Coins earned during this run buy relics, weapons, moves, trades, and healing.' },
      { speaker: 'SARGE', text: 'Tabs separate each shelf. A green recommendation fits your current build, but the final choice is yours.' },
      { speaker: 'SARGE', text: 'Open the Shop and buy the marked training relic.' },
    ],
  },
  forge: {
    lesson: 'forge',
    lines: [
      { speaker: 'SARGE', text: 'Forge room. This upgrades weapons and moves for the current run.' },
      { speaker: 'SARGE', text: 'Select an item, press plus on a stat, choose XP or gold, then confirm. Staged changes do nothing until confirmed.' },
      { speaker: 'SARGE', text: 'I gave you a Forge Voucher, so your first upgrade here is free.' },
    ],
  },
  challenge: {
    lesson: 'challenge',
    lines: [
      { speaker: 'SARGE', text: 'Challenge room. Trials are optional risk for stronger rewards.' },
      { speaker: 'SARGE', text: 'This is the Bomb trial. Blue bombs are safe: touch every blue bomb to defuse it. Red bombs are traps. Do not touch them.' },
      { speaker: 'SARGE', text: 'Other trials may test switch order, survival, rune collection, constant movement, or a mirror copy of your build.' },
      { speaker: 'SARGE', text: 'Touch the trial marker, then defuse all blue bombs.' },
    ],
  },
  ladder: {
    lesson: 'ladder',
    lines: [
      { speaker: 'SARGE', text: 'Exit room. The minimap marks this room as EXIT.' },
      { speaker: 'SARGE', text: 'Normal exit rooms may contain a final enemy wave or boss. This training exit is clear.' },
      { speaker: 'SARGE', text: 'Use the ladder. Floor two returns you to the real dungeon with everything you bought, collected, and forged.' },
    ],
  },
};

export const TUTORIAL_LESSON_SCENE = Object.fromEntries(
  Object.entries(TUTORIAL_SCENES).map(([sceneId, scene]) => [scene.lesson, sceneId]),
);
