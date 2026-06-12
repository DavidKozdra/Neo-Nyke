(function initTypewriterDialogueLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTypewriterDialogueApi() {
  class TypewriterDialogueManager {
    constructor(options = {}) {
      const opts = options || {};
      this.gameStateManager = opts.gameStateManager || null;
      this.typeSpeed = Math.max(0.008, Number(opts.typeSpeed) || 0.028);
      this.autoAdvanceDelay = Math.max(0, Number(opts.autoAdvanceDelay) || 1.15);
      this.punctuationPause = Math.max(0, Number(opts.punctuationPause) || 0.045);
      this.defaultSpeaker = String(opts.defaultSpeaker || "GOD");
      // When provided, auto-advance only happens if this returns truthy.
      // Otherwise dialogue waits for an explicit advance() (click/key).
      this.autoAdvanceEnabled = typeof opts.autoAdvanceEnabled === "function" ? opts.autoAdvanceEnabled : null;
      // Fired when typing reveals the first character of a new word (at most
      // once per update tick), and once when advance() fast-forwards a line.
      this.onWordRevealed = typeof opts.onWordRevealed === "function" ? opts.onWordRevealed : null;
      // Fired when typing reveals any visible (non-whitespace) character (at
      // most once per update tick), and once when advance() fast-forwards.
      this.onCharRevealed = typeof opts.onCharRevealed === "function" ? opts.onCharRevealed : null;
      this.onOpen = typeof opts.onOpen === "function" ? opts.onOpen : null;
      this.onClose = typeof opts.onClose === "function" ? opts.onClose : null;
      this.changeListeners = [];
      this.active = false;
      this.returnState = "play";
      this.lines = [];
      this.index = -1;
      this.current = null;
      this.visibleText = "";
      this.charIndex = 0;
      this.charTimer = 0;
      this.holdTimer = 0;
      this.completeCallback = null;
    }

    onChange(callback) {
      if (typeof callback === "function") this.changeListeners.push(callback);
    }

    _emitChange() {
      const snapshot = this.getSnapshot();
      for (const listener of [...this.changeListeners]) {
        try {
          listener(snapshot);
        } catch (_err) {}
      }
    }

    _normalizeLine(entry) {
      if (typeof entry === "string") {
        return {
          speaker: this.defaultSpeaker,
          text: entry,
          autoAdvanceDelay: this.autoAdvanceDelay,
        };
      }
      const source = entry && typeof entry === "object" ? entry : {};
      return {
        speaker: String(source.speaker || this.defaultSpeaker),
        text: String(source.text || ""),
        autoAdvanceDelay: Math.max(0, Number(source.autoAdvanceDelay) || this.autoAdvanceDelay),
      };
    }

    start(lines, options = {}) {
      // Don't clobber a dialogue that's already on screen. A second start() while
      // one is active would silently overwrite it, so callers that gate a
      // one-time cutscene behind a "played" flag would burn the flag without the
      // player ever seeing the lines. Refuse instead so the caller can retry.
      if (this.active && !options.force) {
        return false;
      }
      const list = Array.isArray(lines) ? lines : [lines];
      this.lines = list.map((entry) => this._normalizeLine(entry)).filter((entry) => entry.text);
      if (!this.lines.length) {
        this.close();
        return false;
      }
      const currentState = this.gameStateManager?.getState?.() || "play";
      this.returnState = String(options.returnState || (currentState === "dialogue" ? "play" : currentState));
      this.completeCallback = typeof options.onComplete === "function" ? options.onComplete : null;
      this.active = true;
      this.index = -1;
      this.current = null;
      this.visibleText = "";
      this.charIndex = 0;
      this.charTimer = 0;
      this.holdTimer = 0;
      if (this.onOpen) this.onOpen();
      if (this.gameStateManager?.getState?.() !== "dialogue") {
        this.gameStateManager?.setState?.("dialogue");
      }
      this._beginNextLine();
      return true;
    }

    _beginNextLine() {
      this.index += 1;
      if (this.index >= this.lines.length) {
        this.close();
        return false;
      }
      this.current = this.lines[this.index];
      this.visibleText = "";
      this.charIndex = 0;
      this.charTimer = 0;
      this.holdTimer = 0;
      this._emitChange();
      return true;
    }

    update(dt) {
      if (!this.active || !this.current) return;
      const step = Math.max(0, Number(dt) || 0);
      if (this.charIndex < this.current.text.length) {
        this.charTimer += step;
        let revealedNewWord = false;
        let revealedVisibleChar = false;
        while (this.charIndex < this.current.text.length && this.charTimer >= this.typeSpeed) {
          this.charTimer -= this.typeSpeed;
          this.charIndex += 1;
          this.visibleText = this.current.text.slice(0, this.charIndex);
          const char = this.current.text[this.charIndex - 1];
          const prevChar = this.charIndex > 1 ? this.current.text[this.charIndex - 2] : " ";
          if (/\S/.test(char)) revealedVisibleChar = true;
          if (/\S/.test(char) && /\s/.test(prevChar)) revealedNewWord = true;
          if (/[.,!?]/.test(char)) this.charTimer -= this.punctuationPause;
        }
        if (revealedNewWord && this.onWordRevealed) this.onWordRevealed();
        if (revealedVisibleChar && this.onCharRevealed) this.onCharRevealed();
        this._emitChange();
        return;
      }
      // Skip auto-advance when disabled — wait for an explicit advance() instead.
      if (this.autoAdvanceEnabled && !this.autoAdvanceEnabled()) return;
      this.holdTimer += step;
      if (this.holdTimer >= this.current.autoAdvanceDelay) {
        this.advance();
      }
    }

    advance() {
      if (!this.active || !this.current) return false;
      if (this.charIndex < this.current.text.length) {
        this.charIndex = this.current.text.length;
        this.visibleText = this.current.text;
        this.charTimer = 0;
        this.holdTimer = 0;
        if (this.onWordRevealed) this.onWordRevealed();
        if (this.onCharRevealed) this.onCharRevealed();
        this._emitChange();
        return true;
      }
      return this._beginNextLine();
    }

    close() {
      const shouldRestoreState = this.active;
      const completeCallback = shouldRestoreState ? this.completeCallback : null;
      this.active = false;
      this.lines = [];
      this.index = -1;
      this.current = null;
      this.visibleText = "";
      this.charIndex = 0;
      this.charTimer = 0;
      this.holdTimer = 0;
      this.completeCallback = null;
      if (this.onClose) this.onClose();
      if (shouldRestoreState && this.gameStateManager?.getState?.() === "dialogue") {
        this.gameStateManager?.setState?.(this.returnState || "play");
      }
      this._emitChange();
      if (completeCallback) {
        try {
          completeCallback();
        } catch (_err) {}
      }
      return true;
    }

    isOpen() {
      return !!this.active;
    }

    getSnapshot() {
      return {
        active: !!this.active,
        speaker: this.current?.speaker || this.defaultSpeaker,
        text: this.current?.text || "",
        visibleText: this.visibleText || "",
        isFullyTyped: !!this.current && this.charIndex >= this.current.text.length,
        index: this.index,
        total: this.lines.length,
      };
    }
  }

  return { TypewriterDialogueManager };
});
