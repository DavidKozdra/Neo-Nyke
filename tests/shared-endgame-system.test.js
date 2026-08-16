const {
  createCampaignGodEndgamePlan,
  resolveCampaignGodEndgameChoice,
  createCampaignLoopBlueRewardPlan,
} = require('../js/simulation/SharedEndgameSystem');

describe('SharedEndgameSystem', () => {
  test('creates the authored God-room choices for story and normal', () => {
    expect(createCampaignGodEndgamePlan({ gameMode: 'story', width: 900, height: 700 }))
      .toEqual([{ type: 'crown', x: 450, y: 350 }]);
    expect(createCampaignGodEndgamePlan({ gameMode: 'normal', width: 900, height: 700 }))
      .toEqual([
        { type: 'crown', x: 330, y: 350 },
        { type: 'returnGate', x: 570, y: 350 },
      ]);
  });

  test('keeps campaign endgame actions explicit and rejects the retired descent choice', () => {
    expect(resolveCampaignGodEndgameChoice('crown')).toEqual({ ok: true, action: 'victory' });
    expect(resolveCampaignGodEndgameChoice('returnGate')).toEqual({ ok: true, action: 'loop' });
    expect(resolveCampaignGodEndgameChoice('returnGate', { gameMode: 'competitive' })).toEqual({ ok: true, action: 'victory' });
    // Endless Descent was removed: looping already continues the run and pays
    // crystals/rewards, so a bare descent has no reason to exist. Any stale
    // 'descend' pickup from an old save must be rejected, not honoured.
    expect(resolveCampaignGodEndgameChoice('descend')).toEqual({ ok: false, reason: 'INVALID_GOD_ENDGAME_CHOICE' });
    expect(resolveCampaignGodEndgameChoice('descend', { endlessDescent: true })).toEqual({ ok: false, reason: 'INVALID_GOD_ENDGAME_CHOICE' });
  });

  test('plans a single deterministic three-relic loop group', () => {
    const plan = createCampaignLoopBlueRewardPlan({
      blueItemKeys: ['a', 'b', 'c', 'd'], random: () => 0,
      width: 900, height: 700, loopIndex: 2,
    });
    expect(plan).toHaveLength(3);
    expect(plan).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'rewardChoice', groupId: 'loop-blue:2', picksRemaining: 1, source: 'loop_blue_reward' }),
    ]));
    expect(new Set(plan.map(choice => choice.key)).size).toBe(3);
  });
});
