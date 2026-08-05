// Keep heavyweight, initially-hidden menu surfaces out of the connected DOM.
// Their existing elements and listeners stay intact; opening a surface mounts
// it back at its original position exactly once.
(function initLazyPanels() {
  const Neo = window.Neo = window.Neo || {};
  const lazyPanels = new Map();
  const panelIds = [
    'runHistoryPanel',
    'sandboxPanel',
    'creditsPanel',
    'customCharacterPanel',
    'challengePanel',
    'settingsModal',
    'hudPreviewOverlay',
  ];

  Neo.mountLazyPanel = function mountLazyPanel(id) {
    const record = lazyPanels.get(id);
    if (!record || record.element.isConnected) return record?.element || document.getElementById(id);
    record.anchor.parentNode?.insertBefore(record.element, record.anchor.nextSibling);
    return record.element;
  };

  Neo.installLazyPanels = function installLazyPanels() {
    for (const id of panelIds) {
      if (lazyPanels.has(id)) continue;
      const element = document.getElementById(id);
      if (!element || !element.classList.contains('hidden') || !element.parentNode) continue;
      const anchor = document.createComment(`lazy-panel:${id}`);
      element.parentNode.insertBefore(anchor, element);
      lazyPanels.set(id, { element, anchor });
      element.remove();
    }
  };
})();
