import type { PagesEnv, PagesHandler } from "../../shared/cf";
import { classifyIp } from "../../shared/ip";
import { cached } from "../_lib/cache";
import { clientIp, fail, json, methodNotAllowed, preflight } from "../_lib/http";
import { fetchJson } from "../_lib/upstream";

const CACHE_TTL = 6 * 60 * 60;

interface Geo {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  asn: string | null;
  org: string | null;
  isp: string | null;
  domain: string | null;
}

interface IpWhoResponse {
  success?: boolean;
  message?: string;
  type?: string;
  continent?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  connection?: { asn?: number; org?: string; isp?: string; domain?: string };
  timezone?: { id?: string };
}

interface IpInfoResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  timezone?: string;
  bogon?: boolean;
}

function splitOrg(org: string | null | undefined): { asn: string | null; org: string | null } {
  if (!org) return { asn: null, org: null };
  const match = /^AS(\d+)\s+(.*)$/i.exec(org);
  if (match) return { asn: `AS${match[1]}`, org: match[2] ?? null };
  return { asn: null, org };
}

async function lookupGeo(ip: string, env: PagesEnv): Promise<{ geo: Geo; source: string } | null> {
  try {
    const body = await fetchJson<IpWhoResponse>(`https://ipwho.is/${encodeURIComponent(ip)}`, 5000, {
      headers: { accept: "application/json" },
    });
    if (body.success !== false) {
      return {
        source: "ipwho.is",
        geo: {
          city: body.city ?? null,
          region: body.region ?? null,
          country: body.country ?? null,
          countryCode: body.country_code ?? null,
          continent: body.continent ?? null,
          latitude: typeof body.latitude === "number" ? body.latitude : null,
          longitude: typeof body.longitude === "number" ? body.longitude : null,
          timezone: body.timezone?.id ?? null,
          asn: body.connection?.asn ? `AS${body.connection.asn}` : null,
          org: body.connection?.org ?? null,
          isp: body.connection?.isp ?? null,
          domain: body.connection?.domain ?? null,
        },
      };
    }
  } catch {
    // fall through to ipinfo
  }

  try {
    const token = env.IPINFO_TOKEN;
    const target = `https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const body = await fetchJson<IpInfoResponse>(target, 5000, { headers: { accept: "application/json" } });
    if (body.bogon) return null;
    const loc = (body.loc ?? "").split(",");
    const org = splitOrg(body.org);
    return {
      source: "ipinfo.io",
      geo: {
        city: body.city ?? null,
        region: body.region ?? null,
        country: body.country ?? null,
        countryCode: body.country ?? null,
        continent: null,
        latitude: loc[0] ? Number.parseFloat(loc[0]) : null,
        longitude: loc[1] ? Number.parseFloat(loc[1]) : null,
        timezone: body.timezone ?? null,
        asn: org.asn,
        org: org.org,
        isp: null,
        domain: null,
      },
    };
  } catch {
    return null;
  }
}

export const onRequest: PagesHandler<PagesEnv> = async ({ request, env }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  const requested = (url.searchParams.get("addr") ?? url.searchParams.get("ip") ?? clientIp(request)).trim();
  const addr = requested.replace(/^\[/, "").replace(/\]$/, "");

  const classification = classifyIp(addr);
  if (!classification) return fail("addr 不是合法的 IP 地址");

  if (!classification.isPublic) {
    return json(
      {
        ok: true,
        ip: addr,
        classification,
        geo: null,
        source: null,
        note: "私有 / 保留地址不会拿去查询外部服务",
      },
      { cors: true },
    );
  }

  const cacheKey = `https://cache.net-tools.internal/ip/v1/${addr}`;
  return cached(cacheKey, CACHE_TTL, async () => {
    const result = await lookupGeo(addr, env);
    return json(
      {
        ok: true,
        ip: addr,
        classification,
        geo: result?.geo ?? null,
        source: result?.source ?? null,
      },
      { cors: true, cache: `public, max-age=${CACHE_TTL}` },
    );
  });
};
