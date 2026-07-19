const { TypewriterDialogueManager } = require('../Koz_Engine_Lib/UI/typewriterDialogue.js');

describe('TypewriterDialogueManager', () => {
  test('prepares the first line before publishing the dialogue game state', () => {
    let state = 'menu';
    let manager;
    const snapshotAtStateChange = [];
    const gameStateManager = {
      getState: () => state,
      setState: nextState => {
        state = nextState;
        snapshotAtStateChange.push(manager.getSnapshot());
      },
    };
    manager = new TypewriterDialogueManager({ gameStateManager });

    expect(manager.start([{ speaker: 'SARGE', text: 'Listen up.' }])).toBe(true);
    expect(snapshotAtStateChange).toEqual([
      expect.objectContaining({
        active: true,
        speaker: 'SARGE',
        text: 'Listen up.',
        visibleText: 'L',
        index: 0,
      }),
    ]);
  });

  test('can advance dialogue without an external game loop', () => {
    const frames = [];
    const cancelled = [];
    const manager = new TypewriterDialogueManager({
      typeSpeed: 0.01,
      autoUpdate: true,
      requestAnimationFrame: callback => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: id => cancelled.push(id),
    });

    manager.start('Menu cutscene');
    expect(manager.usesAutoUpdate()).toBe(true);
    expect(frames).toHaveLength(1);

    frames.shift()(0);
    frames.shift()(100);

    expect(manager.getSnapshot().visibleText).not.toBe('');
    manager.close();
    expect(cancelled).toHaveLength(1);
  });
});
