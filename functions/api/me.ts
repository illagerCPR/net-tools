import type { CfProperties, PagesHandler } from "../../shared/cf";
import { clientIp, json, preflight } from "../_lib/http";

function pickCf(cf: CfProperties) {
  return {
    country: cf.country ?? null,
    region: cf.region ?? null,
    city: cf.city ?? null,
    continent: cf.continent ?? null,
    postalCode: cf.postalCode ?? null,
    latitude: cf.latitude ?? null,
    longitude: cf.longitude ?? null,
    timezone: cf.timezone ?? null,
    isEUCountry: cf.isEUCountry ?? null,
    asn: cf.asn ?? null,
    asOrganization: cf.asOrganization ?? null,
    colo: cf.colo ?? null,
    httpProtocol: cf.httpProtocol ?? null,
    tlsVersion: cf.tlsVersion ?? null,
    tlsCipher: cf.tlsCipher ?? null,
    clientTcpRtt: cf.clientTcpRtt ?? null,
    clientAcceptEncoding: cf.clientAcceptEncoding ?? null,
    http3: cf.http3 ?? null,
    requestPriority: cf.requestPriority ?? null,
  };
}

export const onRequest: PagesHandler = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") {
    return json({ ok: false, error: "只支持 GET" }, { status: 405, cors: true });
  }
  const cf = (request as unknown as { cf?: CfProperties }).cf ?? {};
  return json(
    {
      ok: true,
      ip: clientIp(request),
      ray: request.headers.get("cf-ray"),
      country: request.headers.get("cf-ipcountry"),
      cf: pickCf(cf),
    },
    { cache: "no-store", cors: true },
  );
};
