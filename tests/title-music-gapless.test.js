const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('title music gapless scheduling', () => {
  test('schedules the loop on the exact Web Audio boundary after the intro', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/core/music.js'), 'utf8');
    const scheduledSources = [];
    const audioContext = {
      currentTime: 10,
      destination: {},
      resume: jest.fn(() => Promise.resolve()),
      createGain: jest.fn(() => ({
        gain: {
          value: 1,
          setValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
      })),
      createBufferSource: jest.fn(() => {
        const node = {
          buffer: null,
          loop: false,
          connect: jest.fn(),
          start: jest.fn(),
          stop: jest.fn(),
        };
        scheduledSources.push(node);
        return node;
      }),
      decodeAudioData: jest
        .fn()
        .mockResolvedValueOnce({ duration: 22.5 })
        .mockResolvedValueOnce({ duration: 64.5 }),
    };
    const AudioContext = jest.fn(() => audioContext);
    const Audio = jest.fn(() => ({
      paused: true,
      currentTime: 0,
      volume: 0,
      addEventListener: jest.fn(),
      pause: jest.fn(),
      play: jest.fn(() => Promise.resolve()),
    }));
    const Neo = {
      gameState: 'menu',
      mooggyAudioContext: null,
    };
    const window = {
      AudioContext,
      NeoSettings: {
        getVolume: () => ({ master: 50, music: 50 }),
      },
      addEventListener: jest.fn(),
      setInterval: jest.fn(),
    };
    const document = {
      hidden: false,
      addEventListener: jest.fn(),
    };
    const fetch = jest.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));

    vm.runInNewContext(source, {
      window,
      document,
      Neo,
      Audio,
      fetch,
      encodeURI,
      Promise,
      Math,
      Number,
      Set,
      ArrayBuffer,
    });

    Neo.playTitleMusic();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    expect(Audio).not.toHaveBeenCalled();
    expect(scheduledSources).toHaveLength(2);
    expect(scheduledSources[0].start).toHaveBeenCalledWith(10.04, 0);
    expect(scheduledSources[1].loop).toBe(true);
    expect(scheduledSources[1].start).toHaveBeenCalledWith(32.54);
  });
});
