const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('gameplay music routing', () => {
  test('always uses the dedicated gameplay loop in play state', () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/core/music.js'), 'utf8');
    const createdTracks = [];
    const Audio = jest.fn((src) => {
      const track = {
        src,
        paused: true,
        currentTime: 0,
        volume: 0,
        playbackRate: 1,
        loop: false,
        preload: '',
        addEventListener: jest.fn(),
        pause: jest.fn(),
        play: jest.fn(() => {
          track.paused = false;
          return Promise.resolve();
        }),
      };
      createdTracks.push(track);
      return track;
    });
    const Neo = {
      gameState: 'play',
      mooggyAudioContext: null,
    };
    const window = {
      KozEngine: { Audio: {} },
      NeoSettings: {
        getVolume: () => ({ master: 100, music: 100 }),
      },
      addEventListener: jest.fn(),
      setInterval: jest.fn(),
      clearInterval: jest.fn(),
    };
    const document = {
      hidden: false,
      addEventListener: jest.fn(),
    };

    vm.runInNewContext(source, {
      window,
      document,
      Neo,
      Audio,
      encodeURI,
      performance: { now: () => 0 },
      Date,
      Math,
      Number,
      Set,
    });

    Neo.playTitleMusic();

    expect(createdTracks).toHaveLength(1);
    expect(createdTracks[0].src).toBe('assets/sounds/music/Neo%20Nyke%20-%20Gameplay%20(Loop).wav');
    expect(createdTracks[0].loop).toBe(true);
    expect(createdTracks[0].play).toHaveBeenCalled();
  });
});
