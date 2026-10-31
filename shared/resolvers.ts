import { classifyIp, isBlockedHostName, isBlockedTarget } from "./ip.ts";

export interface ResolverDef {
  id: string;
  label: string;
  short: string;
  /** DoH JSON (RFC 8484 + JSON extension) endpoint builder. */
  url: (name: string, type: string) => string;
  headers?: Record<string, string>;
  note: string;
  /** Endpoint supplied by the visitor; results are never cached at the edge. */
  custom?: boolean;
}

function dohJson(base: string, name: string, type: string): string {
  const params = new URLSearchParams({ name, type });
  return `${base}?${params.toString()}`;
}

export const RESOLVERS: ResolverDef[] = [
  {
    id: "ali",
    label: "阿里 AliDNS",
    short: "Ali",
    url: (name, type) => dohJson("https://dns.alidns.com/resolve", name, type),
    headers: { accept: "application/dns-json" },
    note: "223.5.5.5 / 223.6.6.6，国内延迟低，支持 JSON 与 ECS",
  },
  {
    id: "cf",
    label: "Cloudflare 1.1.1.1",
    short: "CF",
    url: (name, type) => dohJson("https://cloudflare-dns.com/dns-query", name, type),
    headers: { accept: "application/dns-json" },
    note: "1.1.1.1 / 1.0.0.1，不发送 ECS，隐私取向",
  },
  {
    id: "google",
    label: "Google 8.8.8.8",
    short: "Google",
    url: (name, type) => dohJson("https://dns.google/resolve", name, type),
    headers: { accept: "application/dns-json" },
    note: "8.8.8.8 / 8.8.4.4，全球任播",
  },
  {
    id: "adguard",
    label: "AdGuard DNS",
    short: "AdGuard",
    url: (name, type) => dohJson("https://dns.adguard-dns.com/resolve", name, type),
    headers: { accept: "application/dns-json" },
    note: "带广告/跟踪域名过滤",
  },
];

export const DEFAULT_RESOLVER_IDS = ["ali", "cf", "google"] as const;

export function findResolver(id: string): ResolverDef | undefined {
  return RESOLVERS.find((resolver) => resolver.id === id);
}

/** 单次查询最多接受几个自定义 DoH 端点。 */
export const MAX_CUSTOM_RESOLVERS = 2;

const MAX_ENDPOINT_LENGTH = 512;

/** fetch() 能访问的 TLS 端口；443 显式写出时 URL 会把它归一化成空串。 */
const FETCHABLE_TLS_PORTS = new Set(["2053", "2083", "2087", "2096", "8443"]);

export type CustomDohResult =
  | { ok: true; resolver: ResolverDef; endpoint: string; host: string }
  | { ok: false; error: string };

/**
 * 把用户填的 DoH 地址变成一条临时解析器。
 *
 * 只接受公网可达、证书可信的 https 端点：查询由边缘节点发起，
 * localhost / 内网地址在运行时本来也连不上，这里提前拒掉并给出原因。
 */
export function parseCustomDohUrl(raw: string, index = 0): CustomDohResult {
  const value = raw.trim();
  if (!value) return { ok: false, error: "地址为空" };
  if (value.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false, error: `地址过长（最多 ${MAX_ENDPOINT_LENGTH} 字符）` };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "不是合法的 URL" };
  }

  if (parsed.protocol !== "https:") return { ok: false, error: "只支持 https:// 地址" };
  if (parsed.username || parsed.password) return { ok: false, error: "地址里不要带用户名或密码" };
  if (parsed.port && !FETCHABLE_TLS_PORTS.has(parsed.port)) {
    return { ok: false, error: `边缘节点访问不到 ${parsed.port} 端口，请用 443 或 8443` };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, error: "缺少主机名" };
  if (isBlockedHostName(host)) return { ok: false, error: "localhost 或内网域名不可用" };
  if (classifyIp(host) && isBlockedTarget(host)) return { ok: false, error: "内网或保留地址不可用" };

  // DoH 的惯例路径就是 /dns-query；只填域名时补上，省得用户踩坑。
  if (parsed.pathname === "/" || parsed.pathname === "") parsed.pathname = "/dns-query";
  parsed.hash = "";

  const endpoint = parsed.toString();
  const labelPath = parsed.pathname === "/dns-query" ? "" : parsed.pathname;
  const rawLabel = `自定义 · ${host}${labelPath}`;
  const label = rawLabel.length > 40 ? `${rawLabel.slice(0, 39)}…` : rawLabel;

  return {
    ok: true,
    endpoint,
    host,
    resolver: {
      id: `custom-${index + 1}`,
      label,
      short: host,
      custom: true,
      note: endpoint,
      url: (name, type) => {
        const target = new URL(endpoint);
        target.searchParams.set("name", name);
        target.searchParams.set("type", type);
        return target.toString();
      },
    },
  };
}
