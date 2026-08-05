(function initializeSharedEndgameSystem(root, factory) {
  const loopApi = typeof require === 'function' ? require('./LoopContentSystem.js') : (root.NeoNyke?.simulation || {});
  const api = factory(loopApi);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEndgameSystemApi(loopApi) {
  'use strict';

  const deterministicRandom = () => 0.5;
  // The final God room is an authored choice, not a generic floor exit. Keep
  // its shape independent from either runtime so campaign and authority cannot
  // quietly diverge into crown-only versus stairs-only end states.
  function createCampaignGodEndgamePlan(options = {}) {
    const width = Math.max(1, Number(options.width || 900));
    const height = Math.max(1, Number(options.height || 700));
    const gameMode = String(options.gameMode || 'normal');
    const centerX = width / 2;
    const centerY = height / 2;
    if (gameMode === 'boss_rush') return [];
    if (gameMode === 'story') return [{ type: 'crown', x: centerX, y: centerY }];
    if (options.endlessDescent) {
      return [
        { type: 'crown', x: centerX - 200, y: centerY },
        { type: 'descend', x: centerX, y: centerY },
        { type: 'returnGate', x: centerX + 200, y: centerY },
      ];
    }
    return [
      { type: 'crown', x: centerX - 120, y: centerY },
      { type: 'returnGate', x: centerX + 120, y: centerY },
    ];
  }

  function resolveCampaignGodEndgameChoice(type, options = {}) {
    const choice = String(type || '');
    const gameMode = String(options.gameMode || 'normal');
    if (choice === 'crown') return { ok: true, action: 'victory' };
    if (choice === 'returnGate') {
      return { ok: true, action: gameMode === 'competitive' ? 'victory' : 'loop' };
    }
    if (choice === 'descend' && options.endlessDescent) return { ok: true, action: 'descend' };
    return { ok: false, reason: 'INVALID_GOD_ENDGAME_CHOICE' };
  }

  function createCampaignLoopBlueRewardPlan(options = {}) {
    const random = typeof options.random === 'function' ? options.random : deterministicRandom;
    const keys = Array.from(new Set(Array.isArray(options.blueItemKeys) ? options.blueItemKeys.filter(Boolean) : []));
    const choices = keys.slice();
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.max(0, Math.min(index, Math.floor(Number(random()) * (index + 1))));
      [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
    }
    const width = Math.max(1, Number(options.width || 900));
    const height = Math.max(1, Number(options.height || 700));
    const loopIndex = Math.max(1, Math.trunc(Number(options.loopIndex || 1)));
    const loopPlan = loopApi?.getLoopFloorPlan?.(loopIndex) || { rewardOptions: 3, rewardPicks: 1 };
    const optionCount = Math.max(3, Math.trunc(Number(loopPlan.rewardOptions || 3)));
    const selected = choices.slice(0, optionCount);
    const picksRemaining = Math.max(1, Math.min(selected.length, Math.trunc(Number(loopPlan.rewardPicks || 1))));
    const groupId = `loop-blue:${loopIndex}`;
    return selected.map((key, index) => ({
      type: 'rewardChoice', key, groupId, picksRemaining, choiceTotal: selected.length, label: `${picksRemaining}/${selected.length}`,
      x: width / 2 + (index - (selected.length - 1) / 2) * (selected.length > 5 ? 88 : 104),
      y: height / 2 + 78,
      source: 'loop_blue_reward',
    }));
  }

  return {
    createCampaignGodEndgamePlan,
    resolveCampaignGodEndgameChoice,
    createCampaignLoopBlueRewardPlan,
  };
});
