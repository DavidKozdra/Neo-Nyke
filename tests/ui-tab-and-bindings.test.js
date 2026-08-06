const { createTabController } = require('koz-engine-lib/UI/tabController');
const { assignExclusiveBinding, formatBinding } = require('koz-engine-lib/UI/controlBindings');

describe('Koz Engine UI tabs and control bindings', () => {
  test('formats bindings and swaps an occupied exclusive control', () => {
    expect(formatBinding('arrowup', { arrowup: '↑' })).toBe('↑');
    const bindings = { touchA: 'slash', touchB: 'laser' };
    assignExclusiveBinding(bindings, 'touchA', 'laser', { touchA: 'slash' });
    expect(bindings).toEqual({ touchA: 'laser', touchB: 'slash' });
  });

  test('activates a matching tab and panel', () => {
    const makeElement = tab => ({ dataset: { tab }, classList: { toggle: jest.fn() }, setAttribute: jest.fn(), addEventListener: jest.fn() });
    const tabA = makeElement('a'); const tabB = makeElement('b');
    const panelA = { classList: { toggle: jest.fn() } }; const panelB = { classList: { toggle: jest.fn() } };
    const root = { querySelectorAll: selector => selector === '.tab' ? [tabA, tabB] : [panelA, panelB] };
    const controller = createTabController(root, { tabSelector: '.tab', panelSelector: '.panel', panelForTab: tab => tab === 'a' ? panelA : panelB });
    expect(controller.activate('b')).toBe(true);
    expect(controller.activeTab).toBe('b');
    expect(tabB.classList.toggle).toHaveBeenCalledWith('active', true);
    expect(panelA.classList.toggle).toHaveBeenCalledWith('hidden', true);
  });
});
