const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'js/ui/controller.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

describe('Sandbox Lab configuration redesign', () => {
  test('splits the dense editor into four focused sections', () => {
    expect((html.match(/data-sbox-tab=/g) || [])).toHaveLength(4);
    expect(html).toContain('class="sandbox-config-nav mods-tabs"');
    expect(html).toContain('class="sandbox-config-tab mods-tab active is-active"');
    for (const section of ['rules', 'loadout', 'gear', 'pools']) {
      expect(html).toContain(`data-sbox-tab="${section}"`);
      expect(html).toContain(`data-sandbox-section="${section}"`);
    }
    expect(controller).toContain("const SANDBOX_CONFIG_TABS = ['rules', 'loadout', 'gear', 'pools']");
    expect(controller).toContain("setSandboxConfigTab(button.dataset.sboxTab || 'rules')");
  });

  test('offers working quick presets without a redundant summary strip', () => {
    for (const preset of ['standard', 'power_trip', 'mayhem', 'invincible']) {
      expect(html).toContain(`data-sbox-preset="${preset}"`);
      expect(controller).toContain(`${preset}: Object.freeze({`);
    }
    expect(html).not.toContain('sandbox-config-summary');
    expect(controller).toContain('function updateSandboxPresetState()');
    expect(controller).toContain('function applySandboxRulePreset(key)');
  });

  test('shares the primary action style across Sandbox, Settings, and character select', () => {
    expect(html).toContain('id="sandboxSaveClose" class="sandbox-save-btn primary-action-btn"');
    expect(html).toContain('class="settings-action-btn primary-action-btn" id="settingsPlayTutorial"');
    expect(html).toContain('id="go" class="charselect-start-btn primary-action-btn"');
    expect(style).toContain('.primary-action-btn {');
    expect(style).toContain('.primary-action-btn:hover:not(:disabled)');
  });
});
