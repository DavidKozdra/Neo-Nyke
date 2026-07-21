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

  test('validates authority-controlled multiplayer character choices', () => {
    const selection = createEnvelope('PLAYER_CHARACTER', 3, 0, { characterKey: 'sarge' });
    expect(validateEnvelope(selection, { direction: CLIENT_TO_AUTHORITY })).toEqual({ ok: true, errors: [] });
    expect(validateEnvelope({
      ...selection,
      payload: { characterKey: 'unreleased_secret_character' },
    }, { direction: CLIENT_TO_AUTHORITY }).errors).toContain('payload.characterKey has an unsupported value');
  });

  test('accepts optional alt-kit choices and rejects malformed kit payloads', () => {
    const withKit = createEnvelope('PLAYER_CHARACTER', 4, 0, {
      characterKey: 'sarge',
      kitChoices: { laser: 'lightning_cross' },
    });
    expect(validateEnvelope(withKit, { direction: CLIENT_TO_AUTHORITY })).toEqual({ ok: true, errors: [] });
    expect(validateEnvelope({
      ...withKit,
      payload: { characterKey: 'sarge', kitChoices: ['lightning_cross'] },
    }, { direction: CLIENT_TO_AUTHORITY }).errors).toContain('payload.kitChoices must be object');
  });

  test('validates bounded chat and rematch messages in both directions', () => {
    expect(validateEnvelope(createEnvelope('CHAT_SEND', 5, 20, { text: 'Need a revive!' }), {
      direction: CLIENT_TO_AUTHORITY,
    })).toEqual({ ok: true, errors: [] });
    expect(validateEnvelope(createEnvelope('REMATCH_REQUEST', 6, 20, { ready: true }), {
      direction: CLIENT_TO_AUTHORITY,
    })).toEqual({ ok: true, errors: [] });
    expect(validateEnvelope(createEnvelope('CHAT_MESSAGE', 7, 20, {
      messageId: 'chat-1', playerId: 'p1', displayName: 'Player 1', text: 'Need a revive!', sentAtTick: 20,
    }), { direction: AUTHORITY_TO_CLIENT })).toEqual({ ok: true, errors: [] });

    const oversizedChat = createEnvelope('CHAT_SEND', 8, 20, { text: 'x' });
    oversizedChat.payload.text = 'x'.repeat(181);
    expect(validateEnvelope(oversizedChat, { direction: CLIENT_TO_AUTHORITY }).errors)
      .toContain('payload.text is too long');
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
