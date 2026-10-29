/**
 * Minimal Cloudflare Pages / Workers ambient types.
 * Kept local on purpose: pulling @cloudflare/workers-types globally tends to
 * collide with the DOM lib Astro compiles against.
 */

declare module "cloudflare:sockets" {
  export interface SocketAddress {
    hostname: string;
    port: number;
  }

  export interface SocketOptions {
    allowHalfOpen?: boolean;
    secureTransport?: "off" | "on" | "starttls";
  }

  export interface SocketInfo {
    remoteAddress?: string | null;
    localAddress?: string | null;
  }

  export interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    readonly opened: Promise<SocketInfo>;
    readonly closed: Promise<void>;
    close(): Promise<void>;
    startTls(): Socket;
  }

  export function connect(address: SocketAddress, options?: SocketOptions): Socket;
}

interface CacheStorage {
  /** The per-colo edge cache. Present in Pages Functions and Workers. */
  readonly default: Cache;
}
