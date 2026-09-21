import type { SocketLike } from '@/moonraker/rpc';

/** In-memory stand-in for a WebSocket, driving RpcConnection in tests. */
export class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  static instances: FakeSocket[] = [];

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  static reset(): void {
    FakeSocket.instances = [];
  }

  static get last(): FakeSocket {
    const socket = FakeSocket.instances.at(-1);
    if (!socket) throw new Error('no socket created');
    return socket;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  }

  /** Test helper: complete the handshake. */
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  /** Test helper: deliver a server frame. */
  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  lastRequest(): { id: number; method: string; params?: unknown } {
    const raw = this.sent.at(-1);
    if (!raw) throw new Error('nothing sent');
    return JSON.parse(raw);
  }
}
