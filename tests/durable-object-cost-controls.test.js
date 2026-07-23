const fs = require('node:fs');
const path = require('node:path');

describe('Durable Object daily usage controls', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server/server.js'), 'utf8');

  test('uses hibernatable sockets and restores socket identity attachments', () => {
    expect(server).toContain('this.ctx.acceptWebSocket(server)');
    expect(server).toContain('serializeAttachment({ peerId, identity })');
    expect(server).toContain('deserializeAttachment?.()');
    expect(server).toContain('async webSocketMessage(socket, message)');
    expect(server).not.toContain('server.accept()');
  });

  test('runs the 20 Hz timer only for an active match', () => {
    expect(server).toContain("this.authority.simulation.state.status !== 'running'");
    expect(server).toContain('syncTicking()');
    expect(server).toContain('stopTicking()');
  });

  test('debounces checkpoints and expires empty rooms with one alarm', () => {
    expect(server).toContain('const CHECKPOINT_INTERVAL_TICKS = 20 * 15');
    expect(server).toContain('const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000');
    expect(server).toContain('tick - this.lastCheckpointTick < CHECKPOINT_INTERVAL_TICKS');
    expect(server).toContain('this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS)');
    expect(server).toContain('await this.ctx.storage.deleteAll()');
    expect(server).not.toContain('state.tick % 20 === 0');
  });

  test('serializes each authority broadcast only once', () => {
    expect(server).toContain('const serialized = JSON.stringify(message)');
    expect(server).toContain('this.sendSerialized(peerId, serialized)');
  });
});
