import type { CfProperties, PagesHandler } from "../../shared/cf";
import { clientIp, json, preflight } from "../_lib/http";

const INTERESTING = [
  "host",
  "user-agent",
  "accept",
  "accept-language",
  "accept-encoding",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-ch-ua-platform-version",
  "sec-ch-ua-full-version-list",
  "sec-ch-ua-model",
  "sec-ch-ua-arch",
  "sec-ch-ua-bitness",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-gpc",
  "dnt",
  "cache-control",
  "pragma",
  "referer",
  "origin",
  "content-type",
  "priority",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-for",
  "x-forwarded-proto",
];

export const onRequest: PagesHandler = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") {
    return json({ ok: false, error: "只支持 GET" }, { status: 405, cors: true });
  }

  const present = new Map<string, string>();
  request.headers.forEach((value, key) => present.set(key.toLowerCase(), value));

  const headers = INTERESTING.filter((name) => present.has(name)).map((name) => ({
    name,
    value: present.get(name) ?? "",
  }));

  // Anything the browser sent that we did not list explicitly.
  const extra: Array<{ name: string; value: string }> = [];
  present.forEach((value, name) => {
    if (!INTERESTING.includes(name) && !name.startsWith("cf-") && extra.length < 20) {
      extra.push({ name, value });
    }
  });

  const cf = (request as unknown as { cf?: CfProperties }).cf ?? {};

  return json(
    {
      ok: true,
      ip: clientIp(request),
      headers,
      extraHeaders: extra,
      cf: {
        country: cf.country ?? null,
        region: cf.region ?? null,
        city: cf.city ?? null,
        colo: cf.colo ?? null,
        asn: cf.asn ?? null,
        asOrganization: cf.asOrganization ?? null,
        httpProtocol: cf.httpProtocol ?? null,
        tlsVersion: cf.tlsVersion ?? null,
        tlsCipher: cf.tlsCipher ?? null,
        clientTcpRtt: cf.clientTcpRtt ?? null,
      },
    },
    { cache: "no-store", cors: true },
  );
};
