const fs = require('node:fs');
const path = require('node:path');

function loadDistinctRewardRoller() {
  const source = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
  const match = source.match(
    /export function rollDistinctSecretVendorReward\(rollReward, previousRewardKey = '', maxRerolls = 6\) \{[\s\S]*?\n  \}/,
  );
  if (!match) throw new Error('Could not find rollDistinctSecretVendorReward');
  const functionSource = match[0].replace('export function', 'function');
  return new Function(`${functionSource}; return rollDistinctSecretVendorReward;`)();
}

describe('secret vendor elite relic selection', () => {
  const rollDistinctSecretVendorReward = loadDistinctRewardRoller();

  test('keeps the first roll when it differs from the last purchased reward', () => {
    const rollReward = jest.fn(() => 'chrono_spring');

    expect(rollDistinctSecretVendorReward(rollReward, 'keen_eye')).toBe('chrono_spring');
    expect(rollReward).toHaveBeenCalledTimes(1);
  });

  test('rerolls a repeated reward using the same deterministic sequence', () => {
    const rewards = ['keen_eye', 'keen_eye', 'turtle_shell'];
    const rollReward = jest.fn(() => rewards.shift());

    expect(rollDistinctSecretVendorReward(rollReward, 'keen_eye')).toBe('turtle_shell');
    expect(rollReward).toHaveBeenCalledTimes(3);
  });

  test('has a bounded fallback when a restricted pool can only repeat', () => {
    const rollReward = jest.fn(() => 'keen_eye');

    expect(rollDistinctSecretVendorReward(rollReward, 'keen_eye', 2)).toBe('keen_eye');
    expect(rollReward).toHaveBeenCalledTimes(3);
  });
});
