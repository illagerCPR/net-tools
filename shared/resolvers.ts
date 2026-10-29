export interface ResolverDef {
  id: string;
  label: string;
  short: string;
  /** DoH JSON (RFC 8484 + JSON extension) endpoint builder. */
  url: (name: string, type: string) => string;
  headers?: Record<string, string>;
  note: string;
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
