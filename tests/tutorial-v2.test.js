const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('Sarge tutorial v2', () => {
  const html = read('index.html');
  const main = read('js/main.js');
  const controller = read('js/ui/tutorial-controller.js');
  const scenes = read('js/tutorial/scenes.js');
  const rooms = read('js/game/rooms.js');
  const enemies = read('js/game/enemies.js');
  const world = read('js/game/world.js');
  const serviceWorker = read('sw.js');

  test('loads a dedicated tutorial controller and stylesheet', () => {
    expect(html).toContain('css/tutorial.css');
    expect(html).toContain('id="tutorialSpotlightHole"');
    expect(html).toContain('id="tutorialCard"');
    expect(main).toContain("import './ui/tutorial-controller.js'");
  });

  test('keeps Sarge dialogue in an editable tutorial directory', () => {
    expect(scenes).toContain("I'm Sarge. Welcome to the tutorial.");
    for (const lesson of ['training', 'treasure', 'shop', 'forge', 'challenge', 'ladder']) {
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

  test('uses a safe real bomb trial for the challenge lesson', () => {
    expect(enemies).toContain("room.tutorialLesson === 'challenge'");
    expect(enemies).toContain('const safeCount = tutorialBombs ? 2');
    expect(enemies).toContain("for (let index = 0; index < (tutorialBombs ? 0 : 5)");
    expect(world).toContain("tutorialBomb ? 'RED = DANGER' : 'WRONG'");
    expect(world).toContain('if (tutorialBomb) {');
  });

  test('precaches all new tutorial assets', () => {
    expect(serviceWorker).toContain("'/css/tutorial.css'");
    expect(serviceWorker).toContain("'/js/ui/tutorial-controller.js'");
    expect(serviceWorker).toContain("'/js/tutorial/scenes.js'");
  });
});
