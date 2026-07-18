const {
  CLIENT_TO_AUTHORITY,
  AUTHORITY_TO_CLIENT,
  CLIENT_MESSAGE_TYPES,
  AUTHORITY_MESSAGE_TYPES,
  MESSAGE_DEFINITIONS,
  MAX_CLIENT_MESSAGE_BYTES,
  createEnvelope,
  getDeliveryIntent,
  validateEnvelope,
} = require('../js/protocol/ProtocolV1');

describe('gameplay protocol v1 runtime validation', () => {
  test('defines a directional schema and delivery intent for every v1 message', () => {
    expect(Object.keys(MESSAGE_DEFINITIONS).sort()).toEqual(
      [...CLIENT_MESSAGE_TYPES, ...AUTHORITY_MESSAGE_TYPES].sort(),
    );
    CLIENT_MESSAGE_TYPES.forEach(type => {
      expect(MESSAGE_DEFINITIONS[type].direction).toBe(CLIENT_TO_AUTHORITY);
      expect(getDeliveryIntent(type)).toEqual(expect.objectContaining({
        reliability: expect.stringMatching(/^(reliable|unreliable)$/),
        channel: expect.any(String),
        replaceable: expect.any(Boolean),
      }));
    });
    AUTHORITY_MESSAGE_TYPES.forEach(type => {
      expect(MESSAGE_DEFINITIONS[type].direction).toBe(AUTHORITY_TO_CLIENT);
    });
  });

  test('accepts a legal player input and rejects client-authored outcomes', () => {
    const input = createEnvelope('PLAYER_INPUT', 12, 30, {
      inputSequence: 11,
      moveX: 0.5,
      moveY: -0.5,
      aimDirection: 1.2,
      buttons: 1,
    });
    expect(validateEnvelope(input, { direction: CLIENT_TO_AUTHORITY })).toEqual({ ok: true, errors: [] });

    expect(validateEnvelope({
      protocolVersion: 1,
      type: 'DAMAGE_ENEMY',
      sequence: 13,
      tick: 30,
      payload: { enemyId: 'enemy-1', damage: 99999 },
    }, { direction: CLIENT_TO_AUTHORITY })).toEqual(expect.objectContaining({ ok: false }));
  });

  test('rejects wrong direction, unknown fields, invalid movement, and oversized messages', () => {
    const input = createEnvelope('PLAYER_INPUT', 1, 1, {
      inputSequence: 1,
      moveX: 0,
      moveY: 0,
      aimDirection: 0,
    });
    expect(validateEnvelope(input, { direction: AUTHORITY_TO_CLIENT }).errors).toContain('message direction is invalid');

    const unknownField = { ...input, payload: { ...input.payload, damage: 10 } };
    expect(validateEnvelope(unknownField, { direction: CLIENT_TO_AUTHORITY }).errors)
      .toContain('payload.damage is not allowed');

    const invalidMovement = { ...input, payload: { ...input.payload, moveX: 4 } };
    expect(validateEnvelope(invalidMovement, { direction: CLIENT_TO_AUTHORITY }).errors)
      .toContain('payload.moveX is above maximum');

    const oversized = {
      protocolVersion: 1,
      type: 'AUTHENTICATE',
      sequence: 2,
      tick: 0,
      payload: { provider: 'guest', credential: 'x'.repeat(MAX_CLIENT_MESSAGE_BYTES) },
    };
    expect(validateEnvelope(oversized, { direction: CLIENT_TO_AUTHORITY }).errors)
      .toContain('message exceeds byte limit');
  });
});
