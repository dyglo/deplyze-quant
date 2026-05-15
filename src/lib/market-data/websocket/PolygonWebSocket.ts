/**
 * PolygonWebSocket — lightweight institutional WebSocket abstraction.
 *
 * Architecture:
 *   - Single WebSocket connection per cluster (stocks / crypto / forex)
 *   - Subscription management: subscribe/unsubscribe channels at runtime
 *   - Auto-reconnect with exponential back-off (max 30s)
 *   - Event emitter pattern for decoupled consumption
 *   - NO direct API key exposure: the key is obtained from the gateway
 *     before connection is established.
 *
 * Polygon WebSocket protocol:
 *   1. Connect to wss://socket.polygon.io/{cluster}
 *   2. Receive: [{"ev":"status","status":"connected"}]
 *   3. Send:    {"action":"auth","params":"{API_KEY}"}
 *   4. Receive: [{"ev":"status","status":"auth_success"}]
 *   5. Send:    {"action":"subscribe","params":"T.AAPL,Q.AAPL"}
 *
 * Channel prefixes:
 *   T.{ticker}  — trades
 *   Q.{ticker}  — quotes
 *   A.{ticker}  — second aggregates
 *   AM.{ticker} — minute aggregates
 */

import type { LiveQuoteTick, LiveAggregateTick, WsConnectionState } from '../contracts';

type WsEvent = 'trade' | 'quote' | 'agg_second' | 'agg_minute' | 'status' | 'error';
type WsEventHandler<T = unknown> = (data: T) => void;

export interface PolygonWsConfig {
  /** API key — NEVER hard-coded; pass from gateway token endpoint */
  apiKey: string;
  cluster?: 'stocks' | 'crypto' | 'forex' | 'options';
  /** Reconnect delay progression in ms. Default: [1000, 2000, 5000, 10000, 30000] */
  reconnectDelays?: number[];
  /** Max subscriptions per connection. Default: 1000 */
  maxSubscriptions?: number;
}

export class PolygonWebSocket {
  private ws: WebSocket | null = null;
  private state: WsConnectionState = 'disconnected';
  private subscriptions = new Set<string>();
  private handlers = new Map<WsEvent, Set<WsEventHandler>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: Required<PolygonWsConfig>;
  private destroyed = false;

  constructor(config: PolygonWsConfig) {
    this.config = {
      cluster: 'stocks',
      reconnectDelays: [1_000, 2_000, 5_000, 10_000, 30_000],
      maxSubscriptions: 1_000,
      ...config,
    };
  }

  // ─── Event emitter interface ─────────────────────────────────────────────

  on(event: 'trade', handler: WsEventHandler<LiveQuoteTick>): this;
  on(event: 'quote', handler: WsEventHandler<LiveQuoteTick>): this;
  on(event: 'agg_second', handler: WsEventHandler<LiveAggregateTick>): this;
  on(event: 'agg_minute', handler: WsEventHandler<LiveAggregateTick>): this;
  on(event: 'status', handler: WsEventHandler<{ status: WsConnectionState; message?: string }>): this;
  on(event: 'error', handler: WsEventHandler<Error>): this;
  on(event: WsEvent, handler: WsEventHandler<any>): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler as WsEventHandler);
    return this;
  }

  off(event: WsEvent, handler: WsEventHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  private emit(event: WsEvent, data: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try { h(data); } catch (e) { console.error('[PolygonWS] handler error', e); }
    });
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  connect(): void {
    if (this.destroyed || this.state === 'connecting' || this.state === 'connected') return;
    this.setState('connecting');
    const endpoint = `wss://socket.polygon.io/${this.config.cluster}`;
    try {
      this.ws = new WebSocket(endpoint);
      this.ws.onopen = () => this.onOpen();
      this.ws.onclose = (ev) => this.onClose(ev);
      this.ws.onerror = (ev) => this.onError(ev);
      this.ws.onmessage = (ev) => this.onMessage(ev);
    } catch (err) {
      this.setState('error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.setState('disconnected');
  }

  get connectionState(): WsConnectionState { return this.state; }
  get isConnected(): boolean { return this.state === 'connected'; }
  get subscribedChannels(): string[] { return [...this.subscriptions]; }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  /** Subscribe to trade ticks: T.{symbol} */
  subscribeTrades(symbols: string[]): void {
    this.addSubscriptions(symbols.map((s) => `T.${s.toUpperCase()}`));
  }

  /** Subscribe to quote ticks: Q.{symbol} */
  subscribeQuotes(symbols: string[]): void {
    this.addSubscriptions(symbols.map((s) => `Q.${s.toUpperCase()}`));
  }

  /** Subscribe to per-second aggregates: A.{symbol} */
  subscribeSecondAggs(symbols: string[]): void {
    this.addSubscriptions(symbols.map((s) => `A.${s.toUpperCase()}`));
  }

  /** Subscribe to per-minute aggregates: AM.{symbol} */
  subscribeMinuteAggs(symbols: string[]): void {
    this.addSubscriptions(symbols.map((s) => `AM.${s.toUpperCase()}`));
  }

  unsubscribe(channels: string[]): void {
    const toRemove = channels.filter((c) => this.subscriptions.has(c));
    toRemove.forEach((c) => this.subscriptions.delete(c));
    if (this.isConnected && toRemove.length) {
      this.send({ action: 'unsubscribe', params: toRemove.join(',') });
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private addSubscriptions(channels: string[]): void {
    const newChannels = channels.filter((c) => !this.subscriptions.has(c));
    if (!newChannels.length) return;
    newChannels.forEach((c) => this.subscriptions.add(c));
    if (this.isConnected) {
      this.send({ action: 'subscribe', params: newChannels.join(',') });
    }
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private onOpen(): void {
    // Auth first
    this.send({ action: 'auth', params: this.config.apiKey });
  }

  private onClose(ev: CloseEvent): void {
    this.setState('disconnected');
    if (!this.destroyed) {
      console.warn(`[PolygonWS] Closed (${ev.code}): ${ev.reason}`);
      this.scheduleReconnect();
    }
  }

  private onError(_ev: Event): void {
    this.setState('error');
    this.emit('error', new Error('WebSocket error'));
  }

  private onMessage(ev: MessageEvent): void {
    let messages: Array<{ ev: string; [key: string]: unknown }>;
    try { messages = JSON.parse(ev.data as string) as typeof messages; } catch { return; }

    for (const msg of messages) {
      switch (msg.ev) {
        case 'status': {
          const status = msg.status as string;
          if (status === 'auth_success') {
            this.setState('connected');
            this.reconnectAttempt = 0;
            // Re-subscribe all pending channels
            if (this.subscriptions.size) {
              this.send({ action: 'subscribe', params: [...this.subscriptions].join(',') });
            }
          } else if (status === 'auth_failed') {
            this.setState('error');
            this.emit('error', new Error('Polygon WebSocket authentication failed'));
          }
          break;
        }

        case 'T': // Trade
          this.emit('trade', {
            symbol: msg.sym as string,
            price: msg.p as number,
            size: msg.s as number | undefined,
            ts: msg.t as number,
            provider: 'polygon',
          } satisfies LiveQuoteTick);
          break;

        case 'Q': // Quote
          this.emit('quote', {
            symbol: msg.sym as string,
            price: msg.bp as number ?? msg.ap as number, // bid price or ask
            ts: msg.t as number,
            provider: 'polygon',
          } satisfies LiveQuoteTick);
          break;

        case 'A':  // Second aggregate
        case 'AM': // Minute aggregate
          this.emit(msg.ev === 'A' ? 'agg_second' : 'agg_minute', {
            symbol: msg.sym as string,
            open: msg.o as number,
            high: msg.h as number,
            low: msg.l as number,
            close: msg.c as number,
            volume: msg.v as number,
            vwap: msg.vw as number | undefined,
            accumulated_volume: msg.av as number | undefined,
            ts: msg.s as number,  // start of aggregate window
            provider: 'polygon',
          } satisfies LiveAggregateTick);
          break;
      }
    }
  }

  private setState(state: WsConnectionState): void {
    this.state = state;
    this.emit('status', { status: state });
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.setState('reconnecting');
    const delays = this.config.reconnectDelays;
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this.connect();
    }, delay);
  }
}

// ─── Singleton registry ───────────────────────────────────────────────────
// One connection per cluster. Components share the same connection.

const _registry = new Map<string, PolygonWebSocket>();

export function getPolygonWs(apiKey: string, cluster: PolygonWsConfig['cluster'] = 'stocks'): PolygonWebSocket {
  const key = `${cluster}:${apiKey.slice(-8)}`; // keyed by cluster + key suffix
  if (!_registry.has(key)) {
    _registry.set(key, new PolygonWebSocket({ apiKey, cluster }));
  }
  return _registry.get(key)!;
}
