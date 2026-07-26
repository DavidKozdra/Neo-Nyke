const {
  createCampaignRivalBrain,
  getCampaignRivalPersonality,
  getCampaignRivalLoadout,
  resolveCampaignRivalDisposition,
} = require('../js/simulation/SharedRivalSystem');

describe('shared campaign rival stance policy', () => {
  test('a guarded rival warns, then attacks only when the warning is ignored', () => {
    const brain = createCampaignRivalBrain('princess');
    const perception = { hpRatio: 1, hasLineOfSight: true, distance: 110, playerHpRatio: 1, playerItemCount: 0 };
    const warning = resolveCampaignRivalDisposition({ characterKey: 'princess', brain, floorNumber: 2, elapsedSeconds: 4, perception });
    expect(warning).toMatchObject({ transition: 'warning', reason: 'proximity' });
    expect(brain).toMatchObject({ stance: 'warning', intention: 'observe', warningUntil: 6.2 });

    const hostile = resolveCampaignRivalDisposition({ characterKey: 'princess', brain, floorNumber: 2, elapsedSeconds: 6.2, perception });
    expect(hostile).toMatchObject({ transition: 'hostile', reason: 'ignored_warning' });
    expect(brain).toMatchObject({ stance: 'hostile', intention: 'engage' });
  });

  test('Metao opportunistically attacks a visible weak or over-equipped player', () => {
    const brain = createCampaignRivalBrain('metao');
    const result = resolveCampaignRivalDisposition({
      characterKey: 'metao', brain, floorNumber: 3, elapsedSeconds: 1,
      perception: { hpRatio: 1, hasLineOfSight: true, distance: 250, playerHpRatio: 0.45, playerItemCount: 0 },
    });
    expect(result).toMatchObject({ transition: 'hostile', reason: 'opportunity' });
  });

  test('non-vendetta rivals can retreat once per floor while vendettas cannot', () => {
    const brain = createCampaignRivalBrain('gelleh');
    brain.stance = 'hostile';
    const options = {
      characterKey: 'gelleh', brain, floorNumber: 5, elapsedSeconds: 1,
      perception: { hpRatio: 0.2, hasLineOfSight: true, distance: 180, playerHpRatio: 1, playerItemCount: 0 },
    };
    expect(resolveCampaignRivalDisposition(options)).toMatchObject({ transition: 'retreat', reason: 'low_health' });
    brain.stance = 'hostile'; brain.retreatFloor = 5;
    expect(resolveCampaignRivalDisposition(options)).toMatchObject({ transition: '', reason: '' });
    brain.retreatFloor = -1;
    expect(resolveCampaignRivalDisposition({ ...options, vendetta: true })).toMatchObject({ transition: '', reason: 'vendetta' });
  });

  test('all campaign rival personalities are available to non-browser authority code', () => {
    ['princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy', 'turtle_boy'].forEach(characterKey => {
      expect(getCampaignRivalPersonality(characterKey)).toEqual(expect.objectContaining({ archetype: expect.any(String), reactionDelay: expect.any(Number) }));
    });
  });

  test('authority can consume the same default and alternate four-slot loadouts as campaign', () => {
    const defaultKit = getCampaignRivalLoadout('gelleh', { random: () => 0 });
    expect(defaultKit.map(entry => entry.slot)).toEqual(['melee', 'laser', 'smash', 'dash']);
    expect(defaultKit.map(entry => entry.key)).toEqual(['gelleh_lightning_spear', 'blade_justice', 'healing_zone', 'zip_lightning']);

    const alternateKit = getCampaignRivalLoadout('gelleh', { random: () => 0.99 });
    expect(alternateKit.find(entry => entry.slot === 'smash')).toEqual(expect.objectContaining({ key: 'holy_turrets' }));
  });
});
