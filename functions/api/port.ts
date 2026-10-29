import { connect, type Socket } from "cloudflare:sockets";
import type { PagesEnv, PagesHandler } from "../../shared/cf";
import { classifyIp, isBlockedTarget } from "../../shared/ip";
import { fail, json, methodNotAllowed, preflight } from "../_lib/http";

const MAX_PORTS = 8;
const MIN_TIMEOUT = 300;
const MAX_TIMEOUT = 5000;
const DEFAULT_TIMEOUT = 3000;

type State = "open" | "closed" | "timeout" | "error";

interface ProbeResult {
  port: number;
  state: State;
  elapsedMs: number;
  remoteAddress?: string | null;
  error?: string;
}

function parsePorts(raw: string): number[] | null {
  const ports: number[] = [];
  for (const chunk of raw.split(",")) {
    const part = chunk.trim();
    if (!part) continue;
    const range = /^(\d{1,5})-(\d{1,5})$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end > 65535 || end < start) return null;
      for (let port = start; port <= end && ports.length < MAX_PORTS; port += 1) ports.push(port);
      continue;
    }
    if (!/^\d{1,5}$/.test(part)) return null;
    const port = Number(part);
    if (port < 1 || port > 65535) return null;
    ports.push(port);
  }
  const unique = [...new Set(ports)];
  return unique.length > 0 && unique.length <= MAX_PORTS ? unique : null;
}

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".lan", ".corp"];
const BLOCKED_NAMES = new Set(["localhost", "metadata.google.internal", "instance-data", "metadata"]);

function validHost(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  if (classifyIp(host)) return isBlockedTarget(host) ? null : host;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i.test(host)) {
    return null;
  }
  if (BLOCKED_NAMES.has(host)) return null;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  return host;
}

function closeQuietly(socket: Socket | null): void {
  // `close()` on a socket that never opened can hang, and awaiting it would
  // keep the whole probe pending forever. Fire and forget instead.
  try {
    void socket?.close().catch(() => undefined);
  } catch {
    // already closed
  }
}

function timeoutReject(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), ms);
  });
}

async function probePort(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  const started = Date.now();
  let socket: Socket | null = null;
  try {
    socket = connect({ hostname: host, port }, { secureTransport: "off", allowHalfOpen: false });
    socket.closed.catch(() => undefined);
    const info = await Promise.race([socket.opened, timeoutReject(timeoutMs)]);
    const elapsedMs = Date.now() - started;
    closeQuietly(socket);
    return { port, state: "open", elapsedMs, remoteAddress: info?.remoteAddress ?? null };
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    closeQuietly(socket);
    if (message === "timeout") return { port, state: "timeout", elapsedMs };
    return { port, state: "closed", elapsedMs, error: message.slice(0, 120) };
  }
}

export const onRequest: PagesHandler<PagesEnv> = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET" && request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

  let hostRaw = "";
  let portsRaw = "";
  let timeoutMs = DEFAULT_TIMEOUT;

  if (request.method === "GET") {
    const url = new URL(request.url);
    hostRaw = url.searchParams.get("host") ?? "";
    portsRaw = url.searchParams.get("ports") ?? "80,443";
    const timeout = Number.parseInt(url.searchParams.get("timeout") ?? "", 10);
    if (Number.isFinite(timeout)) timeoutMs = Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, timeout));
  } else {
    const body = (await request.json().catch(() => null)) as
      | { host?: string; ports?: string | number[]; timeout?: number }
      | null;
    if (!body) return fail("请求体不是合法的 JSON", 400, false);
    hostRaw = body.host ?? "";
    portsRaw = Array.isArray(body.ports) ? body.ports.join(",") : (body.ports ?? "80,443");
    if (typeof body.timeout === "number" && Number.isFinite(body.timeout)) {
      timeoutMs = Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, body.timeout));
    }
  }

  const host = validHost(hostRaw);
  if (!host) {
    return fail("目标不合法：仅支持公网域名或公网 IP，且不能是内网 / 保留地址", 400, false);
  }

  const ports = parsePorts(portsRaw);
  if (!ports) return fail(`端口格式不合法，最多 ${MAX_PORTS} 个（支持 80,443 或 8000-8005）`, 400, false);

  const started = Date.now();
  const results = await Promise.all(ports.map((port) => probePort(host, port, timeoutMs)));

  return json(
    {
      ok: true,
      host,
      timeoutMs,
      results,
      elapsedMs: Date.now() - started,
      note: "探测由本站的 Cloudflare 边缘节点发起，结果反映的是边缘到目标的连通性，不代表你的网络。",
    },
    { cache: "no-store" },
  );
};
