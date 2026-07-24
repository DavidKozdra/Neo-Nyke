const { createAgentActor, createStateMachine } = require('../Koz_Engine_Lib/AI/actorStateMachine');

describe('Koz Engine actor state machine', () => {
  test('runs lifecycle callbacks and transitions returned by a state update', () => {
    const calls = [];
    const machine = createStateMachine({
      initialState: 'idle',
      states: {
        idle: {
          enter: event => calls.push(`enter:${event.state}`),
          update: event => {
            calls.push(`idle:${event.elapsed.toFixed(1)}`);
            return 'attack';
          },
          exit: event => calls.push(`exit:${event.previousState}:${event.nextState}`),
        },
        attack: { enter: event => calls.push(`enter:${event.state}`) },
      },
    });

    expect(machine.update(0.25, { target: 'hero' })).toBe(true);
    expect(machine.state).toBe('attack');
    expect(calls).toEqual(['enter:idle', 'idle:0.3', 'exit:idle:attack', 'enter:attack']);
  });

  test('binds a host entity to an optional state machine and update driver', () => {
    const entity = { id: 'enemy-1' };
    const machine = createStateMachine({ initialState: 'alive', states: { alive: {} } });
    const actor = createAgentActor({
      entity,
      stateMachine: machine,
      update: (activeEntity, delta, context) => {
        activeEntity.lastDelta = delta;
        activeEntity.target = context.target;
        return true;
      },
    });

    expect(actor.update(0.05, { target: 'hero' })).toBe(true);
    expect(entity).toMatchObject({ lastDelta: 0.05, target: 'hero' });
    expect(actor.transition('missing')).toBe(false);
  });
});
