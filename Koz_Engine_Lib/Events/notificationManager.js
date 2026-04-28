let NotificationCenterCtor = null;
let getNotificationColorFn = null;
if (typeof require === "function") {
  try {
    ({
      NotificationCenter: NotificationCenterCtor,
      getNotificationColor: getNotificationColorFn,
    } = require("./notificationCenter"));
  } catch (_err) {}
}

/**
 * Notification manager that handles displaying game notifications to the player.
 * Wraps NotificationCenter with UI rendering capabilities.
 */
class NotificationManager {
  constructor(options = {}) {
    /**
     * Creates a new NotificationManager.
     * @param {Object} [options] - Configuration options
     * @param {Function} [options.NotificationCenter] - NotificationCenter constructor
     */
    const opts = options || {};
    this.maxNotifications = 5;
    const Center = opts.NotificationCenter || opts.notificationCenterClass || NotificationCenterCtor;
    if (typeof Center === "function") {
      this._center = opts.center || new Center({ maxNotifications: this.maxNotifications });
      this.notifications = this._center.list().map((entry) => entry.id);
    } else {
      this._center = null;
      this.notifications = [];
    }

    // Remove any old panel from a previous game session to prevent DOM leaks
    const oldPanel = select("#notificationPanel");
    if (oldPanel) oldPanel.remove();

    this.uiContainer = createDiv().id("notificationPanel").style("position", "absolute")
      .style("top", "20px")
      .style("left", "50%")
      .style("transform", "translateX(-50%)")
      .style("z-index", "1000")
      .style("display", "flex")
      .style("flex-direction", "column")
      .style("align-items", "center")
      .style("pointer-events", "none");
  }

  log(message, type = "info", duration = 5000, action = null) {
    /**
     * Logs a notification to be displayed.
     * @param {string} message - Notification text
     * @param {string} [type='info'] - Notification type (error, success, warning, info)
     * @param {number} [duration=5000] - Display duration in milliseconds
     * @param {Function} [action] - Optional click action
     * @returns {string} Notification ID
     */
    const id = this._center ? this._center.enqueue({ message, type, duration, action }, (entry) => {
      select(`#${entry.id}`)?.remove();
      this.notifications = this._center.list().map((e) => e.id);
    }).entry.id : `note-${Date.now()}`;

    const notification = createDiv(message)
      .id(id)
      .class("notification")
      .parent(this.uiContainer)
      .style("background", this.getBgColor(type))
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
        if (this._center) {
          this._center.dismiss(id);
          this.notifications = this._center.list().map((entry) => entry.id);
        } else {
          this.notifications = this.notifications.filter(n => n !== id);
        }
      });
    }

    setTimeout(() => notification.style("opacity", "1"), 50);

    if (this._center) {
      this.notifications = this._center.list().map((entry) => entry.id);
      const liveIds = new Set(this.notifications);
      this.uiContainer.elt.querySelectorAll(".notification").forEach((node) => {
        if (!liveIds.has(node.id)) node.remove();
      });
    } else {
      this.notifications.push(id);
      if (this.notifications.length > this.maxNotifications) {
        const oldest = this.notifications.shift();
        select(`#${oldest}`)?.remove();
      }
      setTimeout(() => {
        select(`#${id}`)?.remove();
        this.notifications = this.notifications.filter(n => n !== id);
      }, duration);
    }
  }

  getBgColor(type) {
    const resolveColor = typeof getNotificationColorFn === "function"
      ? getNotificationColorFn
      : null;
    if (resolveColor) {
      return resolveColor(type);
    }
    switch (type) {
      case "error": return "#b71c1c";
      case "success": return "#388e3c";
      case "warning": return "#f57c00";
      case "holiday": return "#caa350";
      case "info":
      default: return "#333";
    }
  }
}

(function exportNotificationManager(root) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { NotificationManager };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
