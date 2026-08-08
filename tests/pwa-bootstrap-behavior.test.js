const fs = require('node:fs');
const path = require('node:path');

function extractBootstrapScript() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];

  return scripts
    .map(match => match[1])
    .find(body => body.includes("window.addEventListener('load', async () => {"));
}

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
}

class FakeEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, handler) {
    const list = this._listeners.get(type) ?? [];
    list.push(handler);
    this._listeners.set(type, list);
  }

  dispatchEvent(event) {
    const listeners = this._listeners.get(event.type) ?? [];
    for (const handler of listeners) {
      handler(event);
    }
    return true;
  }
}

class FakeWindow extends FakeEventTarget {
  constructor() {
    super();
    this.location = { href: 'https://game.test/', pathname: '/' };
    this.__neonykePwaRegistrationState = null;
    this.__neonykePwa = undefined;
    this.setTimeout = globalThis.setTimeout;
    this.clearTimeout = globalThis.clearTimeout;
  }
}

async function runBootstrapInFakeWindow(bootstrapScript, configure) {
  const win = new FakeWindow();
  const failEvents = [];
  const createCalls = [];
  const record = { failEvents, createCalls };

  configure(win, record);

  const run = new Function(
    'window',
    'document',
    'Event',
    'CustomEvent',
    bootstrapScript,
  );
  run(win, {}, FakeEvent, class FakeCustomEvent extends FakeEvent {});

  win.dispatchEvent(new FakeEvent('load'));
  await new Promise(resolve => setTimeout(resolve, 10));

  return { win, ...record };
}

describe('inline bootstrap registration behavior', () => {
  const bootstrapScript = extractBootstrapScript();

  test('continues startup path when both SW registration candidates fail', async () => {
    expect(bootstrapScript).toBeDefined();

    const { win, failEvents, createCalls } = await runBootstrapInFakeWindow(
      bootstrapScript,
      (win, { failEvents, createCalls }) => {
        win.KozEngine = {
          PWA: {
            clientRegistration: {
              createPwaClient: jest.fn(({ scriptUrl, scope }) => {
                createCalls.push({ scriptUrl, scope });
                return {
                  register: jest.fn(async () => null),
                  destroy: jest.fn(),
                };
              }),
            },
          },
        };

        win.addEventListener('neonyke:pwa-registration-failed', event => {
          failEvents.push(event.detail);
        });
      },
    );

    expect(win.neoNykePwa).toBeNull();
    expect(win.__neonykePwaRegistrationState.result).toEqual({
      scriptUrl: './sw.js',
      scope: '/',
      success: false,
    });
    expect(win.__neonykePwaRegistrationState.failures).toHaveLength(0);
    expect(failEvents).toHaveLength(2);
    for (const event of failEvents) {
      expect(event).toEqual(expect.objectContaining({
        error: 'registration-returned-null',
      }));
    }
    expect(createCalls).toEqual([
      { scriptUrl: '/sw.js', scope: '/' },
      { scriptUrl: './sw.js', scope: '/' },
    ]);
  });

  test('falls back after an exception and succeeds with the second candidate', async () => {
    let attempt = 0;
    const destroySpies = [];

    const { win, failEvents, createCalls } = await runBootstrapInFakeWindow(
      bootstrapScript,
      (win, { failEvents, createCalls }) => {
        win.KozEngine = {
          PWA: {
            clientRegistration: {
              createPwaClient: jest.fn(({ scriptUrl, scope }) => {
                createCalls.push({ scriptUrl, scope });
                const destroy = jest.fn();
                destroySpies.push(destroy);
                return {
                  register: jest
                    .fn(async () => {
                      attempt += 1;
                      if (attempt === 1) {
                        throw new Error('blocked');
                      }

                      return {
                        waiting: null,
                        active: {},
                        update: jest.fn(),
                        addEventListener: jest.fn(),
                        removeEventListener: jest.fn(),
                      };
                    }),
                  destroy,
                };
              }),
            },
          },
        };

        win.addEventListener('neonyke:pwa-registration-failed', event => {
          failEvents.push(event.detail);
        });
      },
    );

    expect(win.__neonykePwaRegistrationState.result).toEqual({
      scriptUrl: './sw.js',
      scope: '/',
      success: true,
    });
    expect(win.neoNykePwa).toBeTruthy();
    expect(failEvents).toHaveLength(1);
    expect(failEvents[0]).toEqual(expect.objectContaining({
      scriptUrl: '/sw.js',
      error: 'blocked',
    }));
    expect(createCalls).toEqual([
      { scriptUrl: '/sw.js', scope: '/' },
      { scriptUrl: './sw.js', scope: '/' },
    ]);
    expect(destroySpies[0]).toHaveBeenCalledTimes(1);
  });

  test('falls back when createPwaClient throws and succeeds with second candidate', async () => {
    let createAttempt = 0;
    const { win, failEvents, createCalls } = await runBootstrapInFakeWindow(
      bootstrapScript,
      (win, { failEvents, createCalls }) => {
        win.KozEngine = {
          PWA: {
            clientRegistration: {
              createPwaClient: jest.fn((cfg) => {
                createCalls.push({ scriptUrl: cfg.scriptUrl, scope: cfg.scope });
                createAttempt += 1;
                if (createAttempt === 1) {
                  throw new Error('client init failed');
                }

                return {
                  register: jest.fn(async () => ({
                    waiting: null,
                    active: {},
                    update: jest.fn(),
                    addEventListener: jest.fn(),
                    removeEventListener: jest.fn(),
                  })),
                  destroy: jest.fn(),
                };
              }),
            },
          },
        };

        win.addEventListener('neonyke:pwa-registration-failed', event => {
          failEvents.push(event.detail);
        });
      },
    );

    expect(win.__neonykePwaRegistrationState.result).toEqual({
      scriptUrl: './sw.js',
      scope: '/',
      success: true,
    });
    expect(win.__neonykePwaRegistrationState.failures).toHaveLength(1);
    expect(win.__neonykePwaRegistrationState.failures[0]).toEqual(
      expect.objectContaining({
        state: 'registration-exception',
        detail: { error: 'client init failed' },
      }),
    );
    expect(failEvents).toHaveLength(1);
    expect(failEvents[0]).toEqual(
      expect.objectContaining({
        scriptUrl: '/sw.js',
        error: 'client init failed',
      }),
    );
    expect(createCalls).toEqual([{ scriptUrl: '/sw.js', scope: '/' }, { scriptUrl: './sw.js', scope: '/' }]);
    expect(win.neoNykePwa).toBeTruthy();
  });

  test('continues when first client destroy throws during cleanup', async () => {
    const { win, failEvents, createCalls } = await runBootstrapInFakeWindow(
      bootstrapScript,
      (win, { failEvents, createCalls }) => {
        const firstDestroy = jest.fn(() => {
          throw new Error('destroy failed');
        });

        let attempt = 0;
        let createAttempt = 0;
        win.KozEngine = {
          PWA: {
            clientRegistration: {
              createPwaClient: jest.fn(({ scriptUrl, scope }) => {
                createCalls.push({ scriptUrl, scope });
                createAttempt += 1;
                return {
                  register: jest.fn(async () => {
                    attempt += 1;
                    if (attempt === 1) {
                      throw new Error('register failed');
                    }

                    return {
                      waiting: null,
                      active: {},
                      update: jest.fn(),
                      addEventListener: jest.fn(),
                      removeEventListener: jest.fn(),
                    };
                  }),
                  destroy: createAttempt === 1 ? firstDestroy : jest.fn(),
                };
              }),
            },
          },
        };

        win.addEventListener('neonyke:pwa-registration-failed', event => {
          failEvents.push(event.detail);
        });
      },
    );

    expect(win.__neonykePwaRegistrationState.result).toEqual({
      scriptUrl: './sw.js',
      scope: '/',
      success: true,
    });
    expect(win.__neonykePwaRegistrationState.failures).toHaveLength(2);
    expect(win.__neonykePwaRegistrationState.failures[0]).toMatchObject({
      state: 'registration-exception',
      detail: { error: 'register failed' },
    });
    expect(win.__neonykePwaRegistrationState.failures[1]).toMatchObject({
      state: 'destroy-error',
      detail: { error: 'destroy failed' },
    });
    expect(failEvents).toHaveLength(1);
    expect(createCalls).toEqual([
      { scriptUrl: '/sw.js', scope: '/' },
      { scriptUrl: './sw.js', scope: '/' },
    ]);
    expect(win.neoNykePwa).toBeTruthy();
  });

  test('falls back when first registration hangs past the timeout', async () => {
    let attempt = 0;
    const destroySpies = [];

    const { win, failEvents, createCalls } = await runBootstrapInFakeWindow(
      bootstrapScript,
      (win, { failEvents, createCalls }) => {
        win.__neonykePwaRegistrationTimeoutMs = 300;
        win.KozEngine = {
          PWA: {
            clientRegistration: {
              createPwaClient: jest.fn(({ scriptUrl, scope }) => {
                createCalls.push({ scriptUrl, scope });
                const destroy = jest.fn();
                destroySpies.push(destroy);

                return {
                  register: jest.fn(async () => {
                    attempt += 1;
                    if (attempt === 1) {
                      return new Promise(() => {});
                    }

                    return {
                      waiting: null,
                      active: {},
                      update: jest.fn(),
                      addEventListener: jest.fn(),
                      removeEventListener: jest.fn(),
                    };
                  }),
                  destroy,
                };
              }),
            },
          },
        };

        win.addEventListener('neonyke:pwa-registration-failed', event => {
          failEvents.push(event.detail);
        });
      },
    );

    await new Promise(resolve => setTimeout(resolve, 420));

    expect(win.__neonykePwaRegistrationState.result).toEqual({
      scriptUrl: './sw.js',
      scope: '/',
      success: true,
    });
    expect(win.neoNykePwa).toBeTruthy();
    expect(win.__neonykePwaRegistrationState.failures).toHaveLength(1);
    expect(win.__neonykePwaRegistrationState.failures[0]).toMatchObject({
      state: 'registration-exception',
      detail: { error: 'service worker registration timed out after 300ms' },
    });
    expect(failEvents).toHaveLength(1);
    expect(failEvents[0]).toEqual(
      expect.objectContaining({
        scriptUrl: '/sw.js',
        error: 'service worker registration timed out after 300ms',
      }),
    );
    expect(createCalls).toEqual([
      { scriptUrl: '/sw.js', scope: '/' },
      { scriptUrl: './sw.js', scope: '/' },
    ]);
    expect(destroySpies[0]).toHaveBeenCalledTimes(1);
  });
});
