const { createExtensionHost } = require('../Koz_Engine_Lib/Core/extensionHost');

describe('Koz Engine extension host', () => {
  test('registers typed extension points and supports scoped overrides', () => {
    const host = createExtensionHost();
    host.registerService('audio', { id: 'base' });
    host.registerComponent('hud.preview', class Preview {});
    const scope = host.scope();
    scope.registerService('audio', { id: 'test' });
    expect(host.require('service', 'audio').id).toBe('base');
    expect(scope.require('service', 'audio').id).toBe('test');
    expect(scope.has('component', 'hud.preview')).toBe(true);
  });

  test('installs extension packages without coupling them to the host game', () => {
    const host = createExtensionHost();
    host.install({ install(target) { target.registerAdapter('rooms', { map: value => value }); } });
    expect(host.get('adapter', 'rooms').map('room')).toBe('room');
    expect(() => host.registerAdapter('rooms', {})).toThrow(/already registered/);
  });
});
