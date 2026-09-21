import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RpcConnection, RpcError } from '@/moonraker/rpc';
import { FakeSocket } from './fakeSocket';

function connect(options: Partial<ConstructorParameters<typeof RpcConnection>[0]> = {}) {
  const notifications: Array<{ method: string; params: unknown[] }> = [];
  const states: string[] = [];
  const rpc = new RpcConnection({
    url: 'ws://printer/websocket',
    createSocket: (url) => new FakeSocket(url),
    onNotification: (n) => notifications.push(n),
    onStateChange: (state) => states.push(state),
    ...options,
  });
  rpc.connect();
  return { rpc, notifications, states };
}

describe('RpcConnection', () => {
  beforeEach(() => {
    FakeSocket.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a call when the matching response arrives', async () => {
    const { rpc } = connect();
    FakeSocket.last.open();

    const pending = rpc.call<{ klippy_state: string }>('server.info');
    const request = FakeSocket.last.lastRequest();
    expect(request.method).toBe('server.info');

    FakeSocket.last.receive({ jsonrpc: '2.0', id: request.id, result: { klippy_state: 'ready' } });
    await expect(pending).resolves.toEqual({ klippy_state: 'ready' });
  });

  it('rejects with the error Moonraker reports', async () => {
    const { rpc } = connect();
    FakeSocket.last.open();

    const pending = rpc.call('printer.gcode.script', { script: 'G0 X1' });
    const { id } = FakeSocket.last.lastRequest();
    FakeSocket.last.receive({
      jsonrpc: '2.0',
      id,
      error: { code: -32602, message: 'Must home axis first' },
    });

    await expect(pending).rejects.toMatchObject({
      message: 'Must home axis first',
      code: -32602,
      method: 'printer.gcode.script',
    });
  });

  it('does not mix up concurrent calls', async () => {
    const { rpc } = connect();
    FakeSocket.last.open();

    const first = rpc.call('printer.info');
    const second = rpc.call('server.info');
    const [a, b] = FakeSocket.last.sent.map((raw) => JSON.parse(raw));

    // Answer out of order; each promise must still get its own result.
    FakeSocket.last.receive({ jsonrpc: '2.0', id: b.id, result: 'second' });
    FakeSocket.last.receive({ jsonrpc: '2.0', id: a.id, result: 'first' });

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('times out a call that is never answered', async () => {
    const { rpc } = connect({ timeoutMs: 5000 });
    FakeSocket.last.open();

    const pending = rpc.call('server.info');
    const assertion = expect(pending).rejects.toBeInstanceOf(RpcError);
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });

  it('dispatches notifications without an id', () => {
    const { notifications } = connect();
    FakeSocket.last.open();
    FakeSocket.last.receive({
      jsonrpc: '2.0',
      method: 'notify_status_update',
      params: [{ extruder: { temperature: 210 } }, 12.5],
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.method).toBe('notify_status_update');
    expect(notifications[0]?.params[0]).toEqual({ extruder: { temperature: 210 } });
  });

  it('rejects in-flight calls when the socket closes', async () => {
    const { rpc } = connect();
    FakeSocket.last.open();
    const pending = rpc.call('server.info');
    const assertion = expect(pending).rejects.toThrow('Connection closed');
    FakeSocket.last.close(1006, 'lost');
    await assertion;
  });

  it('reconnects with a backoff after an unexpected close', async () => {
    connect({ minBackoffMs: 100, maxBackoffMs: 1000 });
    FakeSocket.last.open();
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.last.close(1006, 'lost');
    // Jitter spans 0.75x–1.25x, so the longest possible wait is 125 ms.
    await vi.advanceTimersByTimeAsync(130);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('stops reconnecting once disposed', async () => {
    const { rpc } = connect({ minBackoffMs: 100 });
    FakeSocket.last.open();
    rpc.dispose();
    FakeSocket.last.close(1006, 'lost');

    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(rpc.getState()).toBe('closed');
  });

  it('refuses to send while the socket is not open', async () => {
    const { rpc } = connect();
    await expect(rpc.call('server.info')).rejects.toThrow('Not connected');
  });

  it('closes a socket that has gone silent', async () => {
    connect({ idleTimeoutMs: 4000, minBackoffMs: 100 });
    FakeSocket.last.open();

    await vi.advanceTimersByTimeAsync(4500);
    // The stale socket is torn down and the reconnect path opens a fresh one.
    expect(FakeSocket.instances[0]?.readyState).toBe(3);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
  });
});
