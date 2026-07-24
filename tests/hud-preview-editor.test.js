const { HudLayoutRegistry } = require('../Koz_Engine_Lib/UI/components/hudLayout');
const { HudPreviewEditor } = require('../Koz_Engine_Lib/UI/components/hudPreviewEditor');

describe('Koz Engine HUD preview editor', () => {
  test('registers components by target class and writes through the layout registry', () => {
    const registry = new HudLayoutRegistry([{ key: 'actions' }]);
    const state = registry.createState();
    const element = { dataset: { preview: 'actions' }, classList: { toggle: jest.fn() }, querySelector: () => ({}) , addEventListener: jest.fn() };
    const root = { querySelectorAll: selector => selector === '.preview-target' ? [element] : [] };
    const editor = new HudPreviewEditor({ root, targetClass: 'preview-target', registry, getState: () => state, setState: jest.fn() });
    expect(editor.registerComponents().get('actions')).toBe(element);
    expect(editor.toggleVisibility('actions')).toBe(true);
    expect(state.actions.visible).toBe(false);
    expect(editor._update('actions', { x: 12, y: -3, scale: 1.5 })).toBe(true);
    expect(state.actions).toMatchObject({ x: 12, y: -3, scale: 1.5 });
  });
});
