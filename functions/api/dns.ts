import type { PagesHandler } from "../../shared/cf";
import { isDnsType, normalizeDomain, parseDohJson } from "../../shared/dns";
import { reverseName } from "../../shared/ip";
import {
  DEFAULT_RESOLVER_IDS,
  MAX_CUSTOM_RESOLVERS,
  RESOLVERS,
  findResolver,
  parseCustomDohUrl,
  type ResolverDef,
} from "../../shared/resolvers";
import { cached } from "../_lib/cache";
import { fail, json, messageOf, methodNotAllowed, preflight } from "../_lib/http";
import { fetchJson } from "../_lib/upstream";

const CACHE_TTL = 60;

export const onRequest: PagesHandler = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  let name = (url.searchParams.get("name") ?? "").trim();
  const type = (url.searchParams.get("type") ?? "A").toUpperCase();
  const ipParam = (url.searchParams.get("ip") ?? "").trim();

  if (ipParam) {
    const reverse = reverseName(ipParam);
    if (!reverse) return fail("ip 参数不是合法的 IP 地址");
    name = reverse;
  }
  if (!name) return fail("缺少 name 参数（域名，或 PTR 查询时传 ip）");
  if (!isDnsType(type)) return fail(`不支持的记录类型：${type}`);

  const domain = normalizeDomain(name);
  if (!domain) return fail("域名格式不合法");

  const requestedIds = (url.searchParams.get("resolvers") ?? DEFAULT_RESOLVER_IDS.join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const selected = requestedIds
    .map((id) => findResolver(id))
    .filter((resolver): resolver is ResolverDef => Boolean(resolver))
    .slice(0, RESOLVERS.length);

  const customRaw = url.searchParams
    .getAll("doh")
    .map((value) => value.trim())
    .filter(Boolean);
  if (customRaw.length > MAX_CUSTOM_RESOLVERS) {
    return fail(`自定义 DoH 最多 ${MAX_CUSTOM_RESOLVERS} 个`);
  }

  const origin = url.hostname.toLowerCase();
  const seenEndpoints = new Set<string>();
  const custom: ResolverDef[] = [];
  for (const raw of customRaw) {
    const parsed = parseCustomDohUrl(raw, custom.length);
    if (!parsed.ok) return fail(`自定义 DoH 不合法：${parsed.error}`);
    if (seenEndpoints.has(parsed.endpoint)) continue;
    if (parsed.host === origin || parsed.host.endsWith(`.${origin}`)) {
      return fail("自定义 DoH 不能指向本站，否则请求会绕回自己");
    }
    seenEndpoints.add(parsed.endpoint);
    custom.push(parsed.resolver);
  }

  const targets = [...selected, ...custom];
  if (targets.length === 0) return fail("没有可用的解析器，请检查 resolvers / doh 参数");

  // 自定义端点不进边缘缓存：缓存键里塞任意 URL 会无限膨胀，也可能把别人自建端点的结果给第三个人。
  const useEdgeCache = custom.length === 0;
  const cacheKey = `https://cache.net-tools.internal/dns/v1/${type}/${domain}/${targets.map((resolver) => resolver.id).join("+")}`;

  const produce = async (): Promise<Response> => {
    const started = Date.now();
    const results = await Promise.all(
      targets.map(async (resolver) => {
        const resolverStarted = Date.now();
        try {
          const raw = await fetchJson<unknown>(resolver.url(domain, type), 5000, {
            headers: { accept: "application/dns-json", ...(resolver.headers ?? {}) },
          });
          const parsed = parseDohJson(raw);
          return {
            id: resolver.id,
            label: resolver.label,
            custom: Boolean(resolver.custom),
            ok: parsed.ok,
            rcode: parsed.rcode,
            rcodeName: parsed.rcodeName,
            ad: parsed.ad,
            truncated: parsed.truncated,
            answers: parsed.answers,
            authority: parsed.authority,
            elapsedMs: Date.now() - resolverStarted,
          };
        } catch (error) {
          return {
            id: resolver.id,
            label: resolver.label,
            custom: Boolean(resolver.custom),
            ok: false,
            error: messageOf(error),
            answers: [],
            authority: [],
            elapsedMs: Date.now() - resolverStarted,
          };
        }
      }),
    );

    return json(
      {
        ok: true,
        name: domain,
        type,
        resolvers: results,
        elapsedMs: Date.now() - started,
        via: "edge",
      },
      { cors: true, cache: useEdgeCache ? `public, max-age=${CACHE_TTL}` : "no-store" },
    );
  };

  return useEdgeCache ? cached(cacheKey, CACHE_TTL, produce) : produce();
};
