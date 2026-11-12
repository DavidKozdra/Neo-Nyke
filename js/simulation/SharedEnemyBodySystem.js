(function initializeSharedEnemyBodySystem(root, factory) {
  const content = typeof module !== 'undefined' && module.exports ? require('./SharedEnemyContent') : root.NeoNyke?.content;
  const scaling = typeof module !== 'undefined' && module.exports ? require('./SharedEnemyScalingSystem') : root.NeoNyke?.simulation;
  const api = factory(content, scaling);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  Object.assign(namespace.simulation = namespace.simulation || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyBodyApi(content, scaling) {
  'use strict';

  const BODY_TRAITS = Object.freeze(['bleedImmune', 'fireImmune', 'poisonImmune',
    'stunResistance', 'maxStunDuration', 'statusResistance', 'statusResistances', 'bleedResistance']);

  function getPlayableEnemyBodyDefinition(character) {
    if (!content.isPlayableEnemyCharacterKey(character)) return null;
    const profile = content.getPlayableEnemyDefinition(character);
    // These encounters copy a character inventory instead of scaling a catalog
    // body. Their copy mechanics must supply their own body and combat stats.
    if (['mooggy', 'mirror_knight', 'rival'].includes(profile.type)) return null;
    return content.ENEMY_CATALOG[profile.type];
  }

  function resolvePlayableEnemyBody(player, options = {}) {
    const definition = getPlayableEnemyBodyDefinition(player?.characterKey || player?.character);
    if (!definition) return null;
    const depth = Math.max(1, Number(options.progressionDepth || 1));
    const maxFloor = Number(options.maxFloor || 10);
    const context = { type: definition.type, isBoss: !!definition.boss,
      enemyLevel: Math.max(1, Number(player.level || 1), depth, Number(options.enemyLevel || 1)),
      progressionDepth: depth, floorNumber: Number(options.floorNumber || (depth - 1) % maxFloor + 1),
      maxFloor, gameMode: options.gameMode || 'normal', endlessWave: Number(options.endlessWave || 0),
      difficulty: options.difficulty || scaling.DEFAULT_CAMPAIGN_ENEMY_DIFFICULTY,
      scaling: options.scaling || scaling.CAMPAIGN_ENEMY_SCALING, sandbox: options.sandbox || null,
      partySize: Math.max(1, Number(options.partySize || 1)), elapsedSeconds: Number(options.elapsedSeconds || 0) };
    // NPC bodies are scaled on spawn, not every animation frame. Time affects
    // the next level/floor/wave/difficulty change without healing a stationary
    // player or increasing an already-created attack's damage as time passes.
    const { elapsedSeconds, ...stableContext } = context;
    const key = JSON.stringify(stableContext);
    if (player.enemyBody?.key === key) return player.enemyBody;
    const bodyDefinition = content.getEnemyDefinition(definition.type, context);
    const stats = scaling.scaleCampaignEnemyStats(bodyDefinition, context);
    // Bulk's AI replaces its spawn speed every tick, including on hard modes.
    if (definition.type === 'bulk_golem') stats.moveSpeed = 78 * Math.min(1.2, 1 + Math.floor(stats.level / 5) * 0.025);
    return { key, type: definition.type, boss: !!definition.boss, radius: definition.radius,
      ...stats, traits: Object.fromEntries(BODY_TRAITS.filter(trait => definition[trait] != null)
        .map(trait => [trait, typeof definition[trait] === 'object' ? { ...definition[trait] } : definition[trait]])) };
  }

  function syncPlayableEnemyBody(player, options = {}) {
    if (!player) return null;
    const body = resolvePlayableEnemyBody(player, options);
    if (!body) {
      if (player.enemyBody) {
        for (const trait of Object.keys(player.enemyBody.traits || {})) delete player[trait];
        delete player.enemyBody;
        delete player.enemyBodyContext;
      }
      return null;
    }
    player.enemyBodyContext = { ...options };
    if (player.enemyBody === body) return body;
    const previousMax = Math.max(1, Number(player.maxHp || body.maxHealth));
    const ratio = Math.max(0, Math.min(1, Number(player.hp ?? previousMax) / previousMax));
    for (const trait of Object.keys(player.enemyBody?.traits || {})) delete player[trait];
    player.enemyBody = body;
    player.maxHp = body.maxHealth;
    player.hp = ratio === 0 ? 0 : Math.max(1, Math.min(body.maxHealth, Math.round(body.maxHealth * ratio)));
    player.moveSpeed = body.moveSpeed;
    player.r = body.radius;
    player.radius = body.radius;
    Object.assign(player, body.traits);
    return body;
  }

  return { getPlayableEnemyBodyDefinition, resolvePlayableEnemyBody, syncPlayableEnemyBody };
});
