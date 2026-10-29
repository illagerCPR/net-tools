import type { PagesHandler } from "../../shared/cf";
import { isDnsType, normalizeDomain, parseDohJson } from "../../shared/dns";
import { reverseName } from "../../shared/ip";
import { DEFAULT_RESOLVER_IDS, RESOLVERS, findResolver, type ResolverDef } from "../../shared/resolvers";
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

  if (selected.length === 0) return fail("没有可用的解析器，请检查 resolvers 参数");

  const cacheKey = `https://cache.net-tools.internal/dns/v1/${type}/${domain}/${selected.map((r) => r.id).join("+")}`;

  return cached(cacheKey, CACHE_TTL, async () => {
    const started = Date.now();
    const results = await Promise.all(
      selected.map(async (resolver) => {
        const resolverStarted = Date.now();
        try {
          const raw = await fetchJson<unknown>(resolver.url(domain, type), 5000, {
            headers: { accept: "application/dns-json", ...(resolver.headers ?? {}) },
          });
          const parsed = parseDohJson(raw);
          return {
            id: resolver.id,
            label: resolver.label,
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
      { cors: true, cache: `public, max-age=${CACHE_TTL}` },
    );
  });
};
