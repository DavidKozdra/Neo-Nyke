(function initializeSharedBossIntroSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedBossIntroSystemApi() {
  'use strict';

  // This is content and eligibility policy only. The campaign and network view
  // keep ownership of opening/positioning their respective dialogue UI.
  const GENERIC_BOSS_INTROS = Object.freeze({
    queen_cult: Object.freeze({ speaker: 'CULT QUEEN', text: 'Kneel and join the chorus.' }),
    bulk_golem: Object.freeze({ speaker: 'BULK GOLEM', text: '........' }),
    artificer_knave: Object.freeze({ speaker: 'ARTIFICER KNAVE', text: 'Run. I only need one clean hit.' }),
    bowman_bane: Object.freeze({ speaker: "BOWMAN'S BANE", text: 'You came back. I was waiting.' }),
    antony_blemmye: Object.freeze({ speaker: 'ANTHONY THE BLESSED BLEMMYE', text: '. GOrba GORBA !.' }),
    handsome_devil: Object.freeze({ speaker: 'HANDSOME DEVIL', text: 'Try not to stare.' }),
  });

  const CHARACTER_INTROS = Object.freeze({
    knave_knight: Object.freeze([
      Object.freeze({ speaker: 'KNAVE', text: 'You think you can out fight me you couldnt out argue me! your logic is false' }),
      Object.freeze({ speaker: 'THORN', text: 'The kingdom of God has come for you ...' }),
      Object.freeze({ speaker: 'KNAVE', text: 'Violence it is' }),
    ]),
    queen_metao: Object.freeze([
      Object.freeze({ speaker: 'QUEEN', text: 'once my champion planning to kill me again are you apostate' }),
      Object.freeze({ speaker: 'METAO', text: '...' }),
      Object.freeze({ speaker: 'QUEEN', text: 'Your life will be mine !' }),
    ]),
    bulk_golem_thorn: Object.freeze([
      Object.freeze({ speaker: 'BULK GOLEM', text: '........' }),
    ]),
    handsome_devil_thorn_knight: Object.freeze([
      Object.freeze({ speaker: 'HANDSOME DEVIL', text: "Hello, Thorn. I see you're well..." }),
    ]),
    handsome_devil_princess: Object.freeze([
      Object.freeze({ speaker: 'PRINCESS', text: 'He is cute.' }),
      Object.freeze({ speaker: 'HANDSOME DEVIL', text: 'Naturally.' }),
    ]),
    handsome_devil_gelleh: Object.freeze([
      Object.freeze({ speaker: 'GELLEH', text: 'Sinner.' }),
      Object.freeze({ speaker: 'HANDSOME DEVIL', text: 'Then cast the first stone.' }),
    ]),
    handsome_devil_mooggy: Object.freeze([
      Object.freeze({ speaker: 'MOOGGY', text: 'Uncle.' }),
      Object.freeze({ speaker: 'HANDSOME DEVIL', text: 'Family is complicated.' }),
    ]),
    antony_blemmye: Object.freeze([
      Object.freeze({ speaker: 'ANTHONY THE BLESSED BLEMMYE', text: 'gorba Gorba' }),
    ]),
  });

  function intro(key, lines) {
    return { key, lines: lines.map(line => ({ ...line })) };
  }

  function resolveCampaignBossIntro(options = {}) {
    const enemyType = String(options.enemyType || '');
    const characters = new Set((Array.isArray(options.characterKeys) ? options.characterKeys : [options.characterKey])
      .filter(Boolean)
      .map(key => String(key)));
    const played = new Set(Array.isArray(options.playedKeys) ? options.playedKeys.map(String) : []);
    const candidates = [];
    if (enemyType === 'artificer_knave' && characters.has('thorn_knight')) candidates.push(intro('knave_knight', CHARACTER_INTROS.knave_knight));
    if (enemyType === 'queen_cult' && characters.has('metao')) candidates.push(intro('queen_metao', CHARACTER_INTROS.queen_metao));
    if (enemyType === 'bulk_golem' && characters.has('thorn_knight')) candidates.push(intro('bulk_golem_thorn', CHARACTER_INTROS.bulk_golem_thorn));
    if (enemyType === 'handsome_devil') {
      ['thorn_knight', 'princess', 'gelleh', 'mooggy'].forEach(characterKey => {
        if (characters.has(characterKey)) candidates.push(intro(`handsome_devil_${characterKey}`, CHARACTER_INTROS[`handsome_devil_${characterKey}`]));
      });
    }
    if (enemyType === 'antony_blemmye') candidates.push(intro('antony_blemmye', CHARACTER_INTROS.antony_blemmye));
    const generic = GENERIC_BOSS_INTROS[enemyType];
    if (generic) candidates.push(intro(`generic_${enemyType}`, [generic]));
    return candidates.find(candidate => !played.has(candidate.key)) || null;
  }

  return { GENERIC_BOSS_INTROS, CHARACTER_INTROS, resolveCampaignBossIntro };
});
