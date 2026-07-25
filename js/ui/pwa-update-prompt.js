// pwa-update-prompt.js — a safe, player-controlled PWA update prompt.
//
// The service worker deliberately waits for approval before activating. This
// prompt turns that lifecycle event into a visible action without interrupting
// an active run or mixing old in-memory code with newly cached modules.
(function initPwaUpdatePrompt() {
  let prompt = null;

  function hidePrompt() {
    if (!prompt) return;
    prompt.hidden = true;
  }

  function createPrompt() {
    if (prompt) return prompt;

    prompt = document.createElement('section');
    prompt.id = 'pwaUpdatePrompt';
    prompt.className = 'pwa-update-prompt';
    prompt.hidden = true;
    prompt.setAttribute('role', 'status');
    prompt.setAttribute('aria-live', 'polite');
    prompt.innerHTML = [
      '<div class="pwa-update-prompt__copy">',
      '  <strong>Update ready</strong>',
      '  <span>A new version of NEO NYKE is ready to play.</span>',
      '</div>',
      '<div class="pwa-update-prompt__actions">',
      '  <button class="pwa-update-prompt__later" type="button">Later</button>',
      '  <button class="pwa-update-prompt__apply" type="button">Update now</button>',
      '</div>',
    ].join('');
    document.body.appendChild(prompt);
    prompt.querySelector('.pwa-update-prompt__later').addEventListener('click', hidePrompt);
    return prompt;
  }

  window.addEventListener('neonyke:pwa-update-ready', function showUpdatePrompt(event) {
    const applyUpdate = event.detail?.applyUpdate;
    if (typeof applyUpdate !== 'function') return;

    const element = createPrompt();
    const applyButton = element.querySelector('.pwa-update-prompt__apply');
    applyButton.onclick = function applyAndReload() {
      applyButton.disabled = true;
      applyButton.textContent = 'Updating…';
      // The client reloads after controllerchange, so every loaded module is
      // from the newly activated cache.
      if (!applyUpdate({ reload: true })) {
        applyButton.disabled = false;
        applyButton.textContent = 'Update now';
      }
    };
    element.hidden = false;
  });
})();
