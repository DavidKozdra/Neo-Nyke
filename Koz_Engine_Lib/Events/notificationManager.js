(function initNotificationManagerLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createNotificationManagerApi() {
  /**
   * Default notification colors for different message types.
   * @readonly
   * @enum {string}
   */
  const DEFAULT_COLORS = {
    error: "#b71c1c",
    success: "#388e3c",
    warning: "#f57c00",
    holiday: "#caa350",
    info: "#333",
  };

  /**
   * Gets the color for a notification type from a palette.
   * @param {string} type - Notification type (error, success, warning, info)
   * @param {Object} [palette] - Custom color palette
   * @returns {string} Hex color code
   */
  function getNotificationColor(type, palette) {
    var p = palette || DEFAULT_COLORS;
    return p[type] || p.info || "#333";
  }

  /**
   * Unified notification manager with queue management and UI rendering.
   * Handles displaying game notifications to the player with automatic expiration,
   * queue management, and optional interactive actions.
   */
  class NotificationManager {
    /**
     * Creates a new NotificationManager.
     * @param {Object} [options] - Configuration options
     * @param {number} [options.maxNotifications=5] - Maximum notifications to hold
     * @param {Function} [options.now] - Time function returning current timestamp
     * @param {Function} [options.setTimer] - Timer set function
     * @param {Function} [options.clearTimer] - Timer clear function
     * @param {Object} [options.colorPalette] - Custom color palette for notification types
     */
    constructor(options = {}) {
      const opts = options || {};

      // Queue management
      this.maxNotifications = Math.max(1, Number(opts.maxNotifications) || 5);
      this._now = typeof opts.now === "function" ? opts.now : function defaultNow() { return Date.now(); };
      this._setTimer = typeof opts.setTimer === "function"
        ? opts.setTimer
        : function defaultSetTimer(fn, ms) { return globalThis.setTimeout(fn, ms); };
      this._clearTimer = typeof opts.clearTimer === "function"
        ? opts.clearTimer
        : function defaultClearTimer(id) { return globalThis.clearTimeout(id); };
      this._seq = 0;
      this._entries = [];
      this._timers = new Map();
      this._colorPalette = opts.colorPalette || DEFAULT_COLORS;

      // UI rendering (p5.js integration)
      const oldPanel = typeof select === "function" ? select("#notificationPanel") : null;
      if (oldPanel) oldPanel.remove();

      this.uiContainer = typeof createDiv === "function"
        ? createDiv().id("notificationPanel").style("position", "absolute")
            .style("top", "20px")
            .style("left", "50%")
            .style("transform", "translateX(-50%)")
            .style("z-index", "1000")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("align-items", "center")
            .style("pointer-events", "none")
        : null;
    }

    /**
     * Adds a notification to the queue.
     * @param {Object} payload - Notification data
     * @param {string} payload.message - Notification text
     * @param {string} [payload.type='info'] - Notification type
     * @param {number} [payload.duration=5000] - Display duration in ms
     * @param {Function} [onExpire] - Called when notification expires
     * @returns {Object} Entry and any dropped notification
     * @private
     */
    _enqueue(payload, onExpire) {
      const data = payload || {};
      const duration = Math.max(0, Number(data.duration) || 5000);
      const entry = {
        id: "note-" + this._now() + "-" + (++this._seq),
        message: String(data.message || ""),
        type: String(data.type || "info"),
        duration: duration,
        action: data.action || null,
        createdAt: this._now(),
      };

      this._entries.push(entry);

      var dropped = null;
      if (this._entries.length > this.maxNotifications) {
        dropped = this._entries.shift();
        this._dismiss(dropped.id, "overflow");
      }

      const timerId = this._setTimer(() => {
        this._dismiss(entry.id, "timeout");
        if (typeof onExpire === "function") onExpire(entry);
      }, duration);
      this._timers.set(entry.id, timerId);

      return { entry: entry, dropped: dropped };
    }

    /**
     * Removes a notification from the queue by ID.
     * @param {string} id - Notification ID
     * @param {string} [reason] - Reason for dismissal
     * @private
     */
    _dismiss(id, reason) {
      const timerId = this._timers.get(id);
      if (timerId) {
        this._clearTimer(timerId);
        this._timers.delete(id);
      }
      this._entries = this._entries.filter(function keepEntry(entry) {
        return entry.id !== id;
      });
    }

    /**
     * Checks if a notification exists in the queue.
     * @param {string} id - Notification ID
     * @returns {boolean} True if notification exists
     */
    has(id) {
      return this._entries.some(function isMatch(entry) {
        return entry.id === id;
      });
    }

    /**
     * Gets all notifications currently in the queue.
     * @returns {Array} Copy of notification entries
     */
    list() {
      return this._entries.slice();
    }

    /**
     * Logs a notification to be displayed.
     * @param {string} message - Notification text
     * @param {string} [type='info'] - Notification type (error, success, warning, info)
     * @param {number} [duration=5000] - Display duration in milliseconds
     * @param {Function|Object} [action] - Optional click action (function or {label, onClick})
     * @returns {string} Notification ID
     */
    log(message, type = "info", duration = 5000, action = null) {
      // Enqueue in internal queue
      const { entry } = this._enqueue(
        { message, type, duration, action },
        (entry) => {
          if (typeof select === "function") {
            select(`#${entry.id}`)?.remove();
          }
        }
      );

      const id = entry.id;

      // Render UI if p5.js is available
      if (!this.uiContainer || typeof createDiv !== "function") {
        return id;
      }

      const notification = createDiv(message)
        .id(id)
        .class("notification")
        .parent(this.uiContainer)
        .style("background", getNotificationColor(type, this._colorPalette))
        .style("color", "#fff")
        .style("padding", "10px 20px")
        .style("margin", "6px 0")
        .style("border-radius", "8px")
        .style("box-shadow", "0 0 12px rgba(0,0,0,0.3)")
        .style("font-size", "16px")
        .style("min-width", "200px")
        .style("text-align", "center")
        .style("pointer-events", action ? "auto" : "none")
        .style("opacity", "0")
        .style("transition", "opacity 0.3s ease");

      if (action && typeof action.onClick === 'function') {
        const btn = createButton(action.label || "Action")
          .parent(notification)
          .style("margin-left", "10px")
          .style("padding", "4px 10px")
          .style("border", "none")
          .style("border-radius", "6px")
          .style("background", "#e7c66a")
          .style("color", "#1a1a1a")
          .style("font-size", "13px")
          .style("font-weight", "bold")
          .style("cursor", "pointer")
          .style("pointer-events", "auto");
        btn.mousePressed(() => {
          try { action.onClick(); } catch (e) { console.warn('Notification action failed:', e); }
          select(`#${id}`)?.remove();
          this._dismiss(id);
        });
      }

      setTimeout(() => notification.style("opacity", "1"), 50);

      // Clean up expired notifications from DOM
      const liveIds = new Set(this._entries.map(e => e.id));
      this.uiContainer.elt.querySelectorAll(".notification").forEach((node) => {
        if (!liveIds.has(node.id)) node.remove();
      });

      return id;
    }

    /**
     * Dismisses all active notifications.
     */
    dismissAll() {
      this._entries.forEach((entry) => {
        this._dismiss(entry.id);
        if (typeof select === "function") {
          select(`#${entry.id}`)?.remove();
        }
      });
    }
  }

  return {
    DEFAULT_COLORS: DEFAULT_COLORS,
    getNotificationColor: getNotificationColor,
    NotificationManager: NotificationManager,
  };
});
