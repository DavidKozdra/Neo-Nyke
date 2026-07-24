# Events Integration

Events provides domain event delivery, notifications, and one-time tip tracking.

- Prefer `eventEngine.js` or `notificationCenter.js` for new work.
- Register event names in host content; payloads should be serializable where possible.
- Presentation subscribes through an adapter instead of gameplay calling UI directly.
- Persist `TipTracker` state through the host save service.

`eventSystem.js` and `notificationManager.js` contain legacy host assumptions. Treat them as migration sources, not clean dependencies.

Recommended keys: `service:events`, `adapter:events.presentation`, `content:events.catalogue`.
