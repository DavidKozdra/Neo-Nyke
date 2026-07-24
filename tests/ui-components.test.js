const { MenuShell } = require('../Koz_Engine_Lib/UI/components/menuShell');
const { ControlEditor } = require('../Koz_Engine_Lib/UI/components/controlEditor');
const { AudioSettings } = require('../Koz_Engine_Lib/UI/components/audioSettings');
const { HudLayoutRegistry } = require('../Koz_Engine_Lib/UI/components/hudLayout');

describe('Koz Engine UI components', () => {
  test('manages menu visibility and control capture', () => {
    const root = { classList: { add: jest.fn(), remove: jest.fn() }, setAttribute: jest.fn() };
    const menu = new MenuShell({ root });
    expect(menu.open()).toBe(true); expect(menu.close()).toBe(true);
    const bindings = { slash: 'q' }; const editor = new ControlEditor({ bindings });
    editor.begin('slash'); expect(editor.captureKeyboard({ key: 'E' })).toBe(true);
    expect(bindings.slash).toBe('e');
  });
  test('owns generic audio values and HUD layout state', () => {
    const audio = new AudioSettings({ state: { master: 20, sfx: 80, music: 20 } });
    audio.set('music', 120); expect(audio.get('music')).toBe(100);
    const layout = new HudLayoutRegistry([{ key: 'actions', selector: '#actions' }]);
    const state = layout.createState({ actions: { scale: 1.3, x: 4, visible: false } });
    expect(state.actions).toMatchObject({ scale: 1.3, x: 4, visible: false });
  });
});
