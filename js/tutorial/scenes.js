// Editable Sarge tutorial script.
// Keep room teaching text here so designers can revise dialogue without touching
// tutorial state, floor generation, or UI code.
//
// Voice: Sarge is a gruff-but-encouraging drill sergeant. Short, punchy beats
// read best in the cutscene box. Each scene ends on a quick bark of approval.

export const TUTORIAL_SCENES = {
  welcome: {
    lesson: 'start',
    lines: [
      { speaker: 'SARGE', text: "Name's Sarge. You're green, so I'm gonna make you ripe. Its time to learn how to survive on your own in the lab. Welcome to Hell Week Soldier!" },
      { speaker: 'SARGE', text: 'When I talk, the world holds still, I have a ton of over clocked watches so we have all the time on earth. Read first. Move second. The bright marker always points at exactly what you need.' },
      { speaker: 'SARGE', text: 'We start small: your feet and your HUD. Move out, recruit.' },
    ],
  },
  training: {
    lesson: 'training',
    lines: [
      { speaker: 'SARGE', text: 'Training room. Ordinary combat rooms let you retreat if a fight goes bad. EXIT rooms are different: their doors lock until the final wave is beaten.' },
      { speaker: 'SARGE', text: 'Dash slips danger and gives you a blink of invulnerability. Close attack, ranged attack, heavy move — each has its own cooldown and its own job.' },
      { speaker: 'SARGE', text: "Watch for the big yellow numbers — that's a critical hit, extra damage on the house." },
      { speaker: 'SARGE', text: 'Some weapons and moves stack nasty status — bleed, fire, poison — that keeps hurting after you stop. Layer it on.' },
      { speaker: 'SARGE', text: 'Hit that dummy with everything, put it down, then grab the relic it drops. Move!' },
    ],
  },
  treasure: {
    lesson: 'treasure',
    lines: [
      { speaker: 'SARGE', text: 'Treasure room. Chests cough up coins, healing, relics — sometimes a choice between two prizes.' },
      { speaker: 'SARGE', text: 'Walk into a chest to crack it, then walk over what drops to grab it. Some chests later on offer a choice instead — those make you hold your ground on the one you want. Risky pickups work the same way.' },
      { speaker: 'SARGE', text: 'Crack this one open before you move on, recruit.' },
    ],
  },
  shop: {
    lesson: 'shop',
    lines: [
      { speaker: 'SARGE', text: 'Shop. The coins you earn this run buy relics, weapons, moves, trades, and healing.' },
      { speaker: 'SARGE', text: 'Tabs split the shelves. A green tag means it fits your build — but the call is yours, soldier.' },
      { speaker: 'SARGE', text: 'Open up and grab the marked training relic. Spend smart every penny is life or death in the LAB.' },
    ],
  },
  forge: {
    lesson: 'forge',
    lines: [
      { speaker: 'SARGE', text: 'Forge. This is where you upgrade weapons and moves for the rest of the run. Get Cracked Fast' },
      { speaker: 'SARGE', text: 'Pick an item, press plus on a stat, choose XP or gold, then confirm. Staged changes do nothing until you confirm. Nothing.' },
      { speaker: 'SARGE', text: 'I slipped you a Forge Voucher, so the first upgrade is on me. Use it.' },
    ],
  },
  challenge: {
    lesson: 'challenge',
    lines: [
      { speaker: 'SARGE', text: 'Challenge room. Optional risk, better loot. Volunteers only — and you just volunteered.' },
      { speaker: 'SARGE', text: 'Bomb trial. Blue bombs are safe: touch every blue one to defuse it. Red bombs are traps. Do NOT touch red. Clear?' },
      { speaker: 'SARGE', text: 'Other trials test switch order, survival, rune-grabbing, staying still, or fighting a mirror of yourself. Stay sharp.' },
      { speaker: 'SARGE', text: 'Touch the trial marker, then defuse every blue bomb. Go.' },
    ],
  },
  secret: {
    lesson: 'secret',
    lines: [
      { speaker: 'SARGE', text: "Knew it. A secret room — this one's a vendor but you dont have a shop master yet." },
      { speaker: 'SARGE', text: 'Out in the dungeon these hide rare relics or warps. Always test a wall that looks too plain.' },
      { speaker: 'SARGE', text: 'Grab what you want, then get back on mission careful.' },
    ],
  },
  ladder: {
    lesson: 'ladder',
    lines: [
      { speaker: 'SARGE', text: 'Exit room. The minimap tags it EXIT. This is the one room you cannot retreat from while enemies remain.' },
      { speaker: 'SARGE', text: 'The doors are locking because this is a ladder-room final wave. Beat the wave and the ladder appears. Ordinary combat rooms still let you leave.' },
      { speaker: 'SARGE', text: 'Clear the room, then take the ladder. Floor two is the real thing — and everything you bought, grabbed, and forged comes with you.' },
    ],
  },
  summary: {
    lesson: 'summary',
    lines: [
      { speaker: 'SARGE', text: "That's a graduation, recruit. You move, you fight, you crit, you stack status. You shop, forge, and crack chests." },
      { speaker: 'SARGE', text: 'Your build, your coins, your forged upgrades, your relics — all of it rides with you to Floor Two.' },
      { speaker: 'SARGE', text: 'Now get down there and make HIM regret it. Dismissed!' },
    ],
  },
};

export const TUTORIAL_LESSON_SCENE = Object.fromEntries(
  Object.entries(TUTORIAL_SCENES).map(([sceneId, scene]) => [scene.lesson, sceneId]),
);
