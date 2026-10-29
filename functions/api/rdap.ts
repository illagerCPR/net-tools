import type { PagesHandler } from "../../shared/cf";
import { normalizeDomain } from "../../shared/dns";
import { classifyIp } from "../../shared/ip";
import { cached } from "../_lib/cache";
import { fail, json, methodNotAllowed, preflight } from "../_lib/http";
import { fetchJson } from "../_lib/upstream";

type JsonObject = Record<string, unknown>;

const CACHE_TTL = 6 * 60 * 60;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asTextList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => asTextList(item));
  return [];
}

interface VcardSummary {
  name: string | null;
  org: string | null;
  emails: string[];
}

function readVcard(entity: JsonObject): VcardSummary {
  const summary: VcardSummary = { name: null, org: null, emails: [] };
  const vcard = entity.vcardArray;
  if (!Array.isArray(vcard) || !Array.isArray(vcard[1])) return summary;
  for (const raw of vcard[1] as unknown[]) {
    if (!Array.isArray(raw)) continue;
    const [key, , , value] = raw as [unknown, unknown, unknown, unknown];
    if (typeof key !== "string") continue;
    if (key === "fn" && typeof value === "string") {
      summary.name = value;
    } else if (key === "org") {
      const org = asTextList(value).join(" / ");
      if (org) summary.org = org;
    } else if (key === "email" && typeof value === "string") {
      summary.emails.push(value);
    }
  }
  return summary;
}

function summarizeEntity(entity: JsonObject) {
  const vcard = readVcard(entity);
  return {
    handle: asText(entity.handle),
    roles: asTextList(entity.roles),
    name: vcard.name ?? asText(entity.name),
    org: vcard.org,
    emails: [...new Set(vcard.emails)].slice(0, 3),
  };
}

function mapEvents(events: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(events)) return out;
  for (const raw of events) {
    const event = asObject(raw);
    if (!event) continue;
    const action = asText(event.eventAction);
    const date = asText(event.eventDate);
    if (action && date) out[action] = date;
  }
  return out;
}

function mapDescriptions(items: unknown, limit = 4) {
  if (!Array.isArray(items)) return [];
  const out: Array<{ title: string | null; description: string }> = [];
  for (const raw of items) {
    const item = asObject(raw);
    if (!item) continue;
    const description = asTextList(item.description).join(" ");
    if (!description) continue;
    out.push({ title: asText(item.title), description: description.slice(0, 400) });
    if (out.length >= limit) break;
  }
  return out;
}

export const onRequest: PagesHandler = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  const ip = (url.searchParams.get("ip") ?? "").trim();
  const domain = (url.searchParams.get("domain") ?? "").trim();

  if (!ip && !domain) return fail("需要 ip 或 domain 参数");

  let target: string;
  let kind: "ip" | "domain";
  if (ip) {
    const classification = classifyIp(ip);
    if (!classification) return fail("ip 参数不是合法的 IP 地址");
    kind = "ip";
    target = `https://rdap.org/ip/${encodeURIComponent(classification.input)}`;
  } else {
    const normalized = normalizeDomain(domain);
    if (!normalized) return fail("domain 参数不是合法的域名");
    kind = "domain";
    target = `https://rdap.org/domain/${encodeURIComponent(normalized)}`;
  }

  const cacheKey = `https://cache.net-tools.internal/rdap/v1/${kind}/${encodeURIComponent(ip || domain)}`;
  return cached(cacheKey, CACHE_TTL, async () => {
    try {
      const raw = await fetchJson<unknown>(target, 10000, {
        headers: { accept: "application/rdap+json, application/json" },
      });
      const body = asObject(raw) ?? {};
      const entities = Array.isArray(body.entities)
        ? body.entities.map(asObject).filter((item): item is JsonObject => item !== null).slice(0, 6).map(summarizeEntity)
        : [];

      const payload = {
        ok: true,
        kind,
        query: ip || domain,
        source: "rdap.org",
        handle: asText(body.handle),
        name: asText(body.name) ?? asText(body.ldhName),
        country: asText(body.country),
        type: asText(body.type),
        handleType: asText(body.objectClassName),
        startAddress: asText(body.startAddress),
        endAddress: asText(body.endAddress),
        ipVersion: asText(body.ipVersion),
        parentHandle: asText(body.parentHandle),
        status: asTextList(body.status),
        nameservers: Array.isArray(body.nameservers)
          ? body.nameservers
              .map(asObject)
              .filter((item): item is JsonObject => item !== null)
              .map((server) => asText(server.ldhName))
              .filter((name): name is string => Boolean(name))
              .slice(0, 8)
          : [],
        events: mapEvents(body.events),
        entities,
        notices: mapDescriptions(body.notices),
        remarks: mapDescriptions(body.remarks),
      };
      return json(payload, { cors: true, cache: `public, max-age=${CACHE_TTL}` });
    } catch (error) {
      return json(
        {
          ok: false,
          kind,
          query: ip || domain,
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 502, cors: true },
      );
    }
  });
};
