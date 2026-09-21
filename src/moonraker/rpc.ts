/**
 * Minimal JSON-RPC 2.0 client over a WebSocket, tailored to Moonraker.
 *
 * Moonraker speaks JSON-RPC 2.0 on /websocket: requests carry an `id` and get
 * exactly one response, while unsolicited server events arrive as notifications
 * (no `id`, params is a positional array).
 *
 * The socket factory is injectable so the transport can be tested without a
 * real network stack.
 */

export type JsonRpcId = number;

export interface JsonRpcNotification {
  method: string;
  params: unknown[];
}

export type SocketState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly method?: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

export interface RpcOptions {
  /** Full websocket URL, e.g. ws://printer.local:7125/websocket */
  url: string;
  createSocket?: SocketFactory;
  /** Rejects a pending call after this many ms. */
  timeoutMs?: number;
  /** Reconnect backoff bounds in ms. */
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** Force a reconnect when no message arrived for this long. 0 disables. */
  idleTimeoutMs?: number;
  onNotification?: (n: JsonRpcNotification) => void;
  onStateChange?: (state: SocketState, detail?: string) => void;
  /** Called after every successful (re)connect, for re-subscribing. */
  onOpen?: () => void;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: unknown;
}

const OPEN = 1;

export class RpcConnection {
  private socket: SocketLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  private state: SocketState = 'idle';
  private backoff: number;
  private reconnectTimer: unknown = null;
  private watchdogTimer: unknown = null;
  private lastMessageAt = 0;
  private disposed = false;
  private readonly createSocket: SocketFactory;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;

  constructor(private readonly opts: RpcOptions) {
    this.createSocket =
      opts.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((h) => clearTimeout(h as number));
    this.backoff = opts.minBackoffMs ?? 500;
  }

  getState(): SocketState {
    return this.state;
  }

  get isOpen(): boolean {
    return this.state === 'open' && this.socket?.readyState === OPEN;
  }

  connect(): void {
    if (this.disposed) return;
    if (this.state === 'connecting' || this.state === 'open') return;
    this.setState(this.state === 'idle' ? 'connecting' : 'reconnecting');
    this.openSocket();
  }

  /** Closes the connection for good; no reconnect follows. */
  dispose(reason = 'client disposed'): void {
    this.disposed = true;
    this.clearTimer('reconnectTimer');
    this.clearTimer('watchdogTimer');
    this.failAllPending(new Error(reason));
    const sock = this.socket;
    this.detach(sock);
    this.socket = null;
    try {
      sock?.close(1000, reason);
    } catch {
      /* already gone */
    }
    this.setState('closed', reason);
  }

  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.isOpen || !this.socket) {
      throw new RpcError('Not connected to Moonraker', -32000, method);
    }
    const id = this.nextId++;
    const payload: Record<string, unknown> = { jsonrpc: '2.0', method, id };
    if (params !== undefined) payload.params = params;

    return new Promise<T>((resolve, reject) => {
      const timer = this.setTimeoutFn(() => {
        this.pending.delete(id);
        reject(new RpcError(`Timeout waiting for "${method}"`, -32001, method));
      }, this.opts.timeoutMs ?? 15_000);

      this.pending.set(id, {
        method,
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      try {
        this.socket!.send(JSON.stringify(payload));
      } catch (err) {
        this.pending.delete(id);
        this.clearTimeoutFn(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Fire-and-forget notification (no response expected). */
  notify(method: string, params?: unknown): void {
    if (!this.isOpen || !this.socket) return;
    const payload: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) payload.params = params;
    try {
      this.socket.send(JSON.stringify(payload));
    } catch {
      /* dropped: the reconnect path will resync state */
    }
  }

  // --- internals ---------------------------------------------------------

  private openSocket(): void {
    let sock: SocketLike;
    try {
      sock = this.createSocket(this.opts.url);
    } catch (err) {
      this.scheduleReconnect(err instanceof Error ? err.message : String(err));
      return;
    }
    this.socket = sock;

    sock.onopen = () => {
      if (this.socket !== sock) return;
      this.backoff = this.opts.minBackoffMs ?? 500;
      this.lastMessageAt = Date.now();
      this.setState('open');
      this.startWatchdog();
      this.opts.onOpen?.();
    };

    sock.onmessage = (ev) => {
      if (this.socket !== sock) return;
      this.lastMessageAt = Date.now();
      this.handleMessage(ev.data);
    };

    sock.onerror = () => {
      // Browsers give no detail here; onclose follows and drives the reconnect.
    };

    sock.onclose = (ev) => {
      if (this.socket !== sock) return;
      this.detach(sock);
      this.socket = null;
      this.clearTimer('watchdogTimer');
      this.failAllPending(new RpcError('Connection closed', -32002));
      if (!this.disposed) {
        this.scheduleReconnect(ev?.reason || `socket closed (${ev?.code ?? '?'})`);
      }
    };
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    // Moonraker may batch responses in an array.
    const items = Array.isArray(msg) ? msg : [msg];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id === 'number') {
        this.settle(rec.id, rec);
      } else if (typeof rec.method === 'string') {
        const params = Array.isArray(rec.params) ? rec.params : [];
        this.opts.onNotification?.({ method: rec.method, params });
      }
    }
  }

  private settle(id: number, rec: Record<string, unknown>): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    this.clearTimeoutFn(pending.timer);
    const errField = rec.error;
    if (errField && typeof errField === 'object') {
      const e = errField as { code?: number; message?: string };
      pending.reject(
        new RpcError(e.message ?? 'Moonraker error', e.code ?? -32603, pending.method),
      );
      return;
    }
    pending.resolve(rec.result);
  }

  private scheduleReconnect(detail: string): void {
    if (this.disposed) return;
    this.setState('reconnecting', detail);
    const max = this.opts.maxBackoffMs ?? 15_000;
    const wait = Math.min(this.backoff, max);
    // Jitter avoids a thundering herd when several printers drop at once.
    const jittered = wait * (0.75 + Math.random() * 0.5);
    this.backoff = Math.min(wait * 2, max);
    this.clearTimer('reconnectTimer');
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      if (this.disposed) return;
      this.openSocket();
    }, jittered);
  }

  private startWatchdog(): void {
    const idle = this.opts.idleTimeoutMs ?? 0;
    if (!idle) return;
    this.clearTimer('watchdogTimer');
    const tick = () => {
      if (this.disposed || !this.isOpen) return;
      if (Date.now() - this.lastMessageAt > idle) {
        // Silent socket: tear it down so the reconnect path runs.
        try {
          this.socket?.close(4000, 'idle timeout');
        } catch {
          /* ignore */
        }
        return;
      }
      this.watchdogTimer = this.setTimeoutFn(tick, Math.max(1000, idle / 2));
    };
    this.watchdogTimer = this.setTimeoutFn(tick, Math.max(1000, idle / 2));
  }

  private failAllPending(err: Error): void {
    for (const [, pending] of this.pending) {
      this.clearTimeoutFn(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private detach(sock: SocketLike | null): void {
    if (!sock) return;
    sock.onopen = null;
    sock.onclose = null;
    sock.onerror = null;
    sock.onmessage = null;
  }

  private clearTimer(key: 'reconnectTimer' | 'watchdogTimer'): void {
    const handle = this[key];
    if (handle != null) this.clearTimeoutFn(handle);
    this[key] = null;
  }

  private setState(state: SocketState, detail?: string): void {
    if (this.state === state && !detail) return;
    this.state = state;
    this.opts.onStateChange?.(state, detail);
  }
}
