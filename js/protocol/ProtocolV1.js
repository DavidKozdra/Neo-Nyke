(function initializeProtocolV1(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.protocol = namespace.protocol || {};
  Object.assign(namespace.protocol, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProtocolV1Api() {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;
  const MAX_AUTHORITY_MESSAGE_BYTES = 256 * 1024;
  const CLIENT_TO_AUTHORITY = 'client-to-authority';
  const AUTHORITY_TO_CLIENT = 'authority-to-client';

  const CLIENT_MESSAGE_TYPES = Object.freeze([
    'CLIENT_HELLO', 'AUTHENTICATE', 'JOIN_MATCH', 'PLAYER_READY', 'PLAYER_INPUT',
    'PLAYER_ACTION', 'INTERACT_REQUEST', 'UPGRADE_SELECTION', 'LEAVE_MATCH', 'PING',
  ]);
  const AUTHORITY_MESSAGE_TYPES = Object.freeze([
    'SERVER_HELLO', 'JOIN_ACCEPTED', 'JOIN_REJECTED', 'LOBBY_STATE', 'MATCH_STARTING',
    'INITIAL_STATE', 'WORLD_SNAPSHOT', 'ENTITY_SPAWNED', 'ENTITY_REMOVED',
    'GAMEPLAY_EVENT', 'FLOOR_TRANSITION', 'RUN_ENDED', 'PLAYER_DISCONNECTED', 'ERROR', 'PONG',
  ]);

  const field = (type, options = {}) => ({ type, ...options });
  const DEFINITIONS = Object.freeze({
    CLIENT_HELLO: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        buildVersion: field('string', { required: true, maxLength: 32 }),
        generationVersion: field('integer', { required: true, min: 1, max: 1_000_000 }),
        contentHash: field('string', { required: true, maxLength: 128 }),
        requestedIdentityProvider: field('string', { enum: ['guest', 'account', 'steam'] }),
      },
    },
    AUTHENTICATE: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        provider: field('string', { required: true, enum: ['guest', 'account', 'steam'] }),
        credential: field('string', { required: true, minLength: 1, maxLength: 4096 }),
      },
    },
    JOIN_MATCH: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        sessionId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        reconnectToken: field('string', { maxLength: 512 }),
      },
    },
    PLAYER_READY: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: { ready: field('boolean', { required: true }) },
    },
    PLAYER_INPUT: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'unreliable', channel: 'simulation', replaceable: true },
      fields: {
        inputSequence: field('integer', { required: true, min: 0, max: Number.MAX_SAFE_INTEGER }),
        moveX: field('number', { required: true, min: -1, max: 1 }),
        moveY: field('number', { required: true, min: -1, max: 1 }),
        aimDirection: field('number', { required: true, min: -Math.PI * 4, max: Math.PI * 4 }),
        buttons: field('integer', { min: 0, max: 0xffff }),
      },
    },
    PLAYER_ACTION: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        action: field('string', { required: true, enum: ['ATTACK', 'ABILITY', 'DASH', 'INTERACT'] }),
        inputSequence: field('integer', { required: true, min: 0, max: Number.MAX_SAFE_INTEGER }),
        aimDirection: field('number', { required: true, min: -Math.PI * 4, max: Math.PI * 4 }),
        equippedItemId: field('string', { maxLength: 96 }),
        abilityId: field('string', { maxLength: 96 }),
      },
    },
    INTERACT_REQUEST: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        targetEntityId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        inputSequence: field('integer', { required: true, min: 0, max: Number.MAX_SAFE_INTEGER }),
      },
    },
    UPGRADE_SELECTION: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        selectionEventId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        optionId: field('string', { required: true, minLength: 1, maxLength: 96 }),
      },
    },
    LEAVE_MATCH: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: { reason: field('string', { maxLength: 64 }) },
    },
    PING: {
      direction: CLIENT_TO_AUTHORITY,
      delivery: { reliability: 'unreliable', channel: 'control', replaceable: true },
      fields: {
        nonce: field('string', { required: true, minLength: 1, maxLength: 64 }),
        clientTime: field('number', { required: true, min: 0 }),
      },
    },
    SERVER_HELLO: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        buildVersion: field('string', { required: true, maxLength: 32 }),
        generationVersion: field('integer', { required: true, min: 1 }),
        contentHash: field('string', { required: true, maxLength: 128 }),
        tickRate: field('integer', { required: true, min: 1, max: 240 }),
        snapshotRate: field('integer', { required: true, min: 1, max: 60 }),
        maxMessageBytes: field('integer', { required: true, min: 1024, max: MAX_AUTHORITY_MESSAGE_BYTES }),
      },
    },
    JOIN_ACCEPTED: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        matchId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        sessionId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        playerId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        reconnectToken: field('string', { maxLength: 512 }),
      },
    },
    JOIN_REJECTED: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        code: field('string', { required: true, minLength: 1, maxLength: 64 }),
        message: field('string', { required: true, minLength: 1, maxLength: 256 }),
      },
    },
    LOBBY_STATE: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        status: field('string', { required: true, enum: ['waiting', 'starting', 'running', 'ended'] }),
        members: field('array', { required: true, maxLength: 4 }),
        minPlayers: field('integer', { required: true, min: 1, max: 4 }),
        maxPlayers: field('integer', { required: true, min: 1, max: 4 }),
      },
    },
    MATCH_STARTING: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        startTick: field('integer', { required: true, min: 0 }),
        matchSeed: field('seed', { required: true }),
        floorSeed: field('seed', { required: true }),
        generationVersion: field('integer', { required: true, min: 1 }),
        contentVersion: field('string', { required: true, maxLength: 64 }),
      },
    },
    INITIAL_STATE: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'snapshot', replaceable: false },
      fields: {
        serverTick: field('integer', { required: true, min: 0 }),
        state: field('object', { required: true }),
        lastProcessedInput: field('object', { required: true }),
      },
    },
    WORLD_SNAPSHOT: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'unreliable', channel: 'snapshot', replaceable: true },
      fields: {
        snapshotSequence: field('integer', { required: true, min: 0 }),
        serverTick: field('integer', { required: true, min: 0 }),
        full: field('boolean', { required: true }),
        lastProcessedInput: field('object', { required: true }),
        entities: field('object', { required: true }),
        removedEntityIds: field('array', { required: true, maxLength: 4096 }),
        floorState: field('nullableObject'),
        bossState: field('nullableObject'),
      },
    },
    ENTITY_SPAWNED: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        entityId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        entityKind: field('string', { required: true, minLength: 1, maxLength: 48 }),
        entity: field('object', { required: true }),
      },
    },
    ENTITY_REMOVED: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        entityId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        reason: field('string', { required: true, minLength: 1, maxLength: 64 }),
      },
    },
    GAMEPLAY_EVENT: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        eventId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        eventType: field('string', { required: true, minLength: 1, maxLength: 64 }),
        data: field('object', { required: true }),
      },
    },
    FLOOR_TRANSITION: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        floorNumber: field('integer', { required: true, min: 1 }),
        floorSeed: field('seed', { required: true }),
        transitionTick: field('integer', { required: true, min: 0 }),
        spawnPoints: field('object', { required: true }),
        generationVersion: field('integer', { required: true, min: 1 }),
        contentVersion: field('string', { required: true, maxLength: 64 }),
      },
    },
    RUN_ENDED: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'gameplay', replaceable: false },
      fields: {
        result: field('string', { required: true, enum: ['victory', 'defeat', 'aborted'] }),
        reason: field('string', { required: true, minLength: 1, maxLength: 96 }),
        summary: field('object', { required: true }),
        leaderboardEligible: field('boolean', { required: true }),
      },
    },
    PLAYER_DISCONNECTED: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        playerId: field('string', { required: true, minLength: 1, maxLength: 96 }),
        reason: field('string', { required: true, minLength: 1, maxLength: 96 }),
        reconnectDeadline: field('number', { min: 0 }),
      },
    },
    ERROR: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'reliable', channel: 'control', replaceable: false },
      fields: {
        code: field('string', { required: true, minLength: 1, maxLength: 64 }),
        message: field('string', { required: true, minLength: 1, maxLength: 256 }),
        fatal: field('boolean', { required: true }),
      },
    },
    PONG: {
      direction: AUTHORITY_TO_CLIENT,
      delivery: { reliability: 'unreliable', channel: 'control', replaceable: true },
      fields: {
        nonce: field('string', { required: true, minLength: 1, maxLength: 64 }),
        clientTime: field('number', { required: true, min: 0 }),
        serverTick: field('integer', { required: true, min: 0 }),
      },
    },
  });

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function encodedByteLength(value) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(json, 'utf8');
    return new TextEncoder().encode(json).byteLength;
  }

  function validateField(name, value, spec, errors) {
    if (value === undefined) {
      if (spec.required) errors.push(`${name} is required`);
      return;
    }
    let validType = false;
    if (spec.type === 'string') validType = typeof value === 'string';
    else if (spec.type === 'number') validType = typeof value === 'number' && Number.isFinite(value);
    else if (spec.type === 'integer') validType = Number.isSafeInteger(value);
    else if (spec.type === 'boolean') validType = typeof value === 'boolean';
    else if (spec.type === 'array') validType = Array.isArray(value);
    else if (spec.type === 'object') validType = isPlainObject(value);
    else if (spec.type === 'nullableObject') validType = value === null || isPlainObject(value);
    else if (spec.type === 'seed') validType = (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value));
    if (!validType) {
      errors.push(`${name} must be ${spec.type}`);
      return;
    }
    if ((typeof value === 'string' || Array.isArray(value)) && spec.minLength !== undefined && value.length < spec.minLength) {
      errors.push(`${name} is too short`);
    }
    if ((typeof value === 'string' || Array.isArray(value)) && spec.maxLength !== undefined && value.length > spec.maxLength) {
      errors.push(`${name} is too long`);
    }
    if (typeof value === 'number' && spec.min !== undefined && value < spec.min) errors.push(`${name} is below minimum`);
    if (typeof value === 'number' && spec.max !== undefined && value > spec.max) errors.push(`${name} is above maximum`);
    if (spec.enum && !spec.enum.includes(value)) errors.push(`${name} has an unsupported value`);
  }

  function validatePayload(payload, definition) {
    const errors = [];
    if (!isPlainObject(payload)) return ['payload must be a plain object'];
    const allowed = new Set(Object.keys(definition.fields));
    Object.keys(payload).forEach(key => {
      if (!allowed.has(key)) errors.push(`payload.${key} is not allowed`);
    });
    Object.entries(definition.fields).forEach(([name, spec]) => {
      validateField(`payload.${name}`, payload[name], spec, errors);
    });
    return errors;
  }

  function validateEnvelope(message, options = {}) {
    const errors = [];
    if (!isPlainObject(message)) return { ok: false, errors: ['message must be a plain object'] };
    const allowedEnvelopeKeys = new Set(['protocolVersion', 'type', 'sequence', 'tick', 'payload']);
    Object.keys(message).forEach(key => {
      if (!allowedEnvelopeKeys.has(key)) errors.push(`${key} is not allowed`);
    });
    if (message.protocolVersion !== PROTOCOL_VERSION) errors.push('protocolVersion must be 1');
    if (typeof message.type !== 'string' || !DEFINITIONS[message.type]) errors.push('type is unsupported');
    if (!Number.isSafeInteger(message.sequence) || message.sequence < 0) errors.push('sequence must be a non-negative safe integer');
    if (!Number.isSafeInteger(message.tick) || message.tick < 0) errors.push('tick must be a non-negative safe integer');
    const definition = DEFINITIONS[message.type];
    if (definition && options.direction && definition.direction !== options.direction) errors.push('message direction is invalid');
    if (definition) errors.push(...validatePayload(message.payload, definition));
    const defaultLimit = options.direction === CLIENT_TO_AUTHORITY ? MAX_CLIENT_MESSAGE_BYTES : MAX_AUTHORITY_MESSAGE_BYTES;
    try {
      if (encodedByteLength(message) > (options.maxBytes || defaultLimit)) errors.push('message exceeds byte limit');
    } catch {
      errors.push('message is not JSON serializable');
    }
    return { ok: errors.length === 0, errors };
  }

  function assertValidEnvelope(message, options = {}) {
    const result = validateEnvelope(message, options);
    if (!result.ok) {
      const error = new TypeError(`Invalid protocol message: ${result.errors.join('; ')}`);
      error.validationErrors = result.errors;
      throw error;
    }
    return message;
  }

  function createEnvelope(type, sequence, tick, payload) {
    const message = { protocolVersion: PROTOCOL_VERSION, type, sequence, tick, payload };
    return assertValidEnvelope(message);
  }

  function getDeliveryIntent(type) {
    const definition = DEFINITIONS[type];
    if (!definition) throw new RangeError(`Unsupported protocol message type: ${String(type)}`);
    return { ...definition.delivery };
  }

  return {
    PROTOCOL_VERSION,
    MAX_CLIENT_MESSAGE_BYTES,
    MAX_AUTHORITY_MESSAGE_BYTES,
    CLIENT_TO_AUTHORITY,
    AUTHORITY_TO_CLIENT,
    CLIENT_MESSAGE_TYPES,
    AUTHORITY_MESSAGE_TYPES,
    MESSAGE_DEFINITIONS: DEFINITIONS,
    isPlainObject,
    encodedByteLength,
    validateEnvelope,
    assertValidEnvelope,
    createEnvelope,
    getDeliveryIntent,
  };
});
