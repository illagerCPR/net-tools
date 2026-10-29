import type { MeResponse } from "../../shared/api-types";
import { getJson } from "./lib";

export interface NetInfo {
  ip: string;
  country: string | null;
  city: string | null;
  region: string | null;
  timezone: string | null;
  asn: string | null;
  asOrganization: string | null;
  colo: string | null;
  tls: string | null;
  http: string | null;
  clientTcpRtt: number | null;
  ray: string | null;
  source: "edge" | "trace";
}

function parseTrace(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.trim().split("\n")) {
    const index = line.indexOf("=");
    if (index > 0) map[line.slice(0, index)] = line.slice(index + 1);
  }
  return map;
}

/**
 * Prefer the edge endpoint (rich request.cf data). Falls back to Cloudflare's
 * public /cdn-cgi/trace, which also sends CORS headers, so the page still works
 * when the Functions backend is missing (pure static deploy / `astro dev`).
 */
export async function detectNetwork(): Promise<NetInfo> {
  try {
    const me = await getJson<MeResponse>("/api/me", { timeoutMs: 8000 });
    if (me.ok && me.ip) {
      return {
        ip: me.ip,
        country: me.cf.country ?? me.country ?? null,
        city: me.cf.city,
        region: me.cf.region,
        timezone: me.cf.timezone,
        asn: me.cf.asn ? `AS${me.cf.asn}` : null,
        asOrganization: me.cf.asOrganization,
        colo: me.cf.colo,
        tls: me.cf.tlsVersion,
        http: me.cf.httpProtocol,
        clientTcpRtt: me.cf.clientTcpRtt,
        ray: me.ray ?? null,
        source: "edge",
      };
    }
  } catch {
    // fall through
  }

  const response = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`备用通道请求失败（HTTP ${response.status}）`);
  const trace = parseTrace(await response.text());
  if (!trace.ip) throw new Error("备用通道没有返回 IP");
  return {
    ip: trace.ip,
    country: trace.loc ?? null,
    city: null,
    region: null,
    timezone: null,
    asn: null,
    asOrganization: null,
    colo: trace.colo ?? null,
    tls: trace.tls ?? null,
    http: trace.http ?? null,
    clientTcpRtt: null,
    ray: null,
    source: "trace",
  };
}

const IPV6_ENDPOINTS = [
  "https://api6.ipify.org?format=json",
  "https://v6.ident.me",
  "https://ipv6.icanhazip.com",
];

export async function detectIpv6(): Promise<string | null> {
  for (const endpoint of IPV6_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const text = (await response.text()).trim();
      const value = text.startsWith("{") ? (JSON.parse(text) as { ip?: string }).ip ?? "" : text;
      const ip = value.split("\n")[0] ?? "";
      if (ip.includes(":")) return ip.trim();
    } catch {
      // try next endpoint
    }
  }
  return null;
}
