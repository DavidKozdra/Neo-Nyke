const { createTypedAgentDispatcher } = require('../Koz_Engine_Lib/AI/agentDispatcher');

describe('Koz Engine typed agent dispatcher', () => {
  test('runs the pre-update hook before the selected host handler', () => {
    const calls = [];
    const dispatcher = createTypedAgentDispatcher({
      updateMethodByType: { scout: 'updateScout' },
      fallbackUpdateMethod: 'updateFallback',
      beforeUpdate: () => { calls.push('before'); return false; },
    });
    const context = {
      updateScout: (agent, delta) => calls.push(`${agent.type}:${delta}`),
    };

    expect(dispatcher.update({ type: 'SCOUT' }, 0.05, context)).toBe(true);
    expect(calls).toEqual(['before', 'SCOUT:0.05']);
  });

  test('allows the pre-update hook to consume an update and supports fallbacks', () => {
    const dispatcher = createTypedAgentDispatcher({
      fallbackUpdateMethod: 'updateFallback',
      beforeUpdate: agent => agent.skip === true,
    });
    let fallbackUpdates = 0;
    const context = { updateFallback: () => { fallbackUpdates += 1; } };

    expect(dispatcher.update({ type: 'unknown', skip: true }, 0.05, context)).toBe(true);
    expect(fallbackUpdates).toBe(0);
    expect(dispatcher.update({ type: 'unknown' }, 0.05, context)).toBe(true);
    expect(fallbackUpdates).toBe(1);
  });
});
