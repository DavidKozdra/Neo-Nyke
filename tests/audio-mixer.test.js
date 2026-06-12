const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mixer = require('../Koz_Engine_Lib/Audio/mixerSystem');
const { createSoundRegistry } = require('../Koz_Engine_Lib/Audio/soundRegistry');

describe('audio mixer', () => {
  test('converts requested mix tiers from decibels', () => {
    expect(mixer.dbToGain(3)).toBeCloseTo(1.4125, 4);
    expect(mixer.dbToGain(-6)).toBeCloseTo(0.5012, 4);
  });

  test('critical priority reduces music by exactly 20 percent', () => {
    expect(mixer.duckGainForPriority(mixer.PRIORITY.CRITICAL)).toBeCloseTo(0.8, 6);
    expect(mixer.duckGainForPriority(mixer.PRIORITY.NORMAL)).toBe(1);
  });

  test('deepest active duck wins and releases smoothly', () => {
    const controller = mixer.createDuckingController({ attackMs: 100, releaseMs: 200 });
    controller.hold('sfx', 0.8, 0);
    controller.hold('dialogue', 0, 0);

    expect(controller.update(100)).toBe(0);
    controller.release('dialogue');
    expect(controller.update(200)).toBeCloseTo(0.5, 6);
    expect(controller.update(300)).toBeCloseTo(0.8, 6);
    controller.release('sfx');
    expect(controller.update(500)).toBe(1);
  });

  test('higher priority voices replace lower priority voices', () => {
    const pool = mixer.createVoicePool({ maxVoices: 2, maxPerSound: 2 });
    pool.acquire({ soundId: 'ambient', priority: mixer.PRIORITY.AMBIENT, now: 1 });
    pool.acquire({ soundId: 'hit', priority: mixer.PRIORITY.NORMAL, now: 2 });
    const result = pool.acquire({ soundId: 'sword', priority: mixer.PRIORITY.CRITICAL, now: 3 });

    expect(result.granted).toBe(true);
    expect(result.evicted).toHaveLength(1);
    expect(result.evicted[0].soundId).toBe('ambient');
    expect(pool.activeCount()).toBe(2);
  });

  test('creates a low-cut filter with bounded settings', () => {
    const filter = {
      type: '',
      frequency: { value: 0 },
      Q: { value: 0 },
    };
    const context = { createBiquadFilter: jest.fn(() => filter) };

    expect(mixer.createLowCutNode(context, 90)).toBe(filter);
    expect(filter.type).toBe('highpass');
    expect(filter.frequency.value).toBe(90);
  });
});

describe('sound registry mix metadata', () => {
  test('preserves variants, priority, gain tier, duck depth, and low cut', () => {
    const registry = createSoundRegistry();
    const sound = registry.register('sword', {
      paths: ['one.wav', 'two.wav'],
      volume: 0.6,
      priority: 1,
      mixDb: 3,
      duckMusicGain: 0.8,
      lowCutHz: 90,
    });

    expect(sound.paths).toEqual(['one.wav', 'two.wav']);
    expect(sound.path).toBe('one.wav');
    expect(sound.priority).toBe(1);
    expect(sound.mixDb).toBe(3);
    expect(sound.duckMusicGain).toBe(0.8);
    expect(sound.lowCutHz).toBe(90);
  });
});

describe('game SFX runtime', () => {
  test('routes sword swings through boost, low-cut, limiter, and music ducking', async () => {
    const sourceCode = fs.readFileSync(path.join(__dirname, '../js/core/sfx.js'), 'utf8');
    const bufferSource = {
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      onended: null,
    };
    const gainNode = {
      gain: { value: 0 },
      connect: jest.fn(),
    };
    const filterNode = {
      type: '',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: jest.fn(),
    };
    const limiter = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: jest.fn(),
    };
    const context = {
      state: 'running',
      currentTime: 2,
      destination: {},
      createBufferSource: jest.fn(() => bufferSource),
      createGain: jest.fn(() => gainNode),
      createBiquadFilter: jest.fn(() => filterNode),
      createDynamicsCompressor: jest.fn(() => limiter),
      decodeAudioData: jest.fn(() => Promise.resolve({ duration: 0.4 })),
    };
    const musicMix = {
      hold: jest.fn(),
      release: jest.fn(),
    };
    const Neo = { mooggyAudioContext: context, musicMix };
    const window = {
      KozEngine: {
        Audio: {
          mixerSystem: mixer,
          soundRegistry: { createSoundRegistry },
        },
      },
      NeoSettings: {
        getVolume: () => ({ master: 100, sfx: 100 }),
      },
      AudioContext: jest.fn(() => context),
    };
    const fetch = jest.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));

    vm.runInNewContext(sourceCode, {
      window,
      Neo,
      fetch,
      Math,
      Number,
      Map,
      Array,
      ArrayBuffer,
      Promise,
    });

    Neo.playSfx('sword_swing');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(filterNode.type).toBe('highpass');
    expect(filterNode.frequency.value).toBe(90);
    expect(gainNode.gain.value).toBeCloseTo(0.6 * mixer.dbToGain(3), 6);
    expect(limiter.threshold.value).toBe(-3);
    expect(musicMix.hold).toHaveBeenCalledWith(expect.stringMatching(/^sfx:sword_swing:/), 0.8);
    expect(bufferSource.start).toHaveBeenCalledWith(0);

    bufferSource.onended();
    expect(musicMix.release).toHaveBeenCalledWith(expect.stringMatching(/^sfx:sword_swing:/));
  });
});
