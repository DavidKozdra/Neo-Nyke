const {
  createCampaignGodEndgamePlan,
  resolveCampaignGodEndgameChoice,
  createCampaignLoopBlueRewardPlan,
} = require('../js/simulation/SharedEndgameSystem');

describe('SharedEndgameSystem', () => {
  test('creates the authored God-room choices for story, normal, and endless descent', () => {
    expect(createCampaignGodEndgamePlan({ gameMode: 'story', width: 900, height: 700 }))
      .toEqual([{ type: 'crown', x: 450, y: 350 }]);
    expect(createCampaignGodEndgamePlan({ gameMode: 'normal', width: 900, height: 700 }))
      .toEqual([
        { type: 'crown', x: 330, y: 350 },
        { type: 'returnGate', x: 570, y: 350 },
      ]);
    expect(createCampaignGodEndgamePlan({ endlessDescent: true, width: 900, height: 700 }).map(choice => choice.type))
      .toEqual(['crown', 'descend', 'returnGate']);
  });

  test('keeps campaign endgame actions explicit and validates descent ownership', () => {
    expect(resolveCampaignGodEndgameChoice('crown')).toEqual({ ok: true, action: 'victory' });
    expect(resolveCampaignGodEndgameChoice('returnGate')).toEqual({ ok: true, action: 'loop' });
    expect(resolveCampaignGodEndgameChoice('returnGate', { gameMode: 'competitive' })).toEqual({ ok: true, action: 'victory' });
    expect(resolveCampaignGodEndgameChoice('descend')).toEqual({ ok: false, reason: 'INVALID_GOD_ENDGAME_CHOICE' });
    expect(resolveCampaignGodEndgameChoice('descend', { endlessDescent: true })).toEqual({ ok: true, action: 'descend' });
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
