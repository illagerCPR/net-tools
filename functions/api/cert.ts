import type { PagesEnv, PagesHandler } from "../../shared/cf";
import { normalizeDomain } from "../../shared/dns";
import { classifyIp } from "../../shared/ip";
import { cached } from "../_lib/cache";
import { fail, json, methodNotAllowed, preflight } from "../_lib/http";
import { fetchJson, UpstreamError } from "../_lib/upstream";

const CACHE_TTL = 60 * 60;
const MAX_SHOWN = 20;

interface NormalizedCert {
  issuer: string | null;
  commonName: string | null;
  names: string[];
  notBefore: string | null;
  notAfter: string | null;
  expired: boolean | null;
  revoked: boolean | null;
  fingerprint: string | null;
}

interface CertSpotterEntry {
  cert_sha256?: string;
  dns_names?: string[];
  issuer?: { name?: string; friendly_name?: string };
  not_before?: string;
  not_after?: string;
  revoked?: boolean;
}

interface CrtEntry {
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  serial_number?: string;
  not_before?: string;
  not_after?: string;
}

function normalizeNotAfter(value: string | null | undefined): { at: string | null; expired: boolean | null } {
  if (!value) return { at: null, expired: null };
  const time = Date.parse(value);
  if (Number.isNaN(time)) return { at: value, expired: null };
  return { at: new Date(time).toISOString(), expired: time < Date.now() };
}

function dedupeKey(cert: NormalizedCert): string {
  return cert.fingerprint ?? `${cert.issuer ?? ""}|${cert.notAfter ?? ""}|${cert.commonName ?? ""}`;
}

function compact(entries: NormalizedCert[]): NormalizedCert[] {
  const unique = new Map<string, NormalizedCert>();
  for (const entry of entries) {
    const key = dedupeKey(entry);
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()]
    .sort((a, b) => String(b.notAfter ?? "").localeCompare(String(a.notAfter ?? "")))
    .slice(0, MAX_SHOWN);
}

async function fromCertSpotter(domain: string, env: PagesEnv): Promise<NormalizedCert[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (env.CERTSPOTTER_TOKEN) headers.authorization = `Bearer ${env.CERTSPOTTER_TOKEN}`;

  let raw: unknown;
  try {
    raw = await fetchJson<unknown>(
      `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}` +
        "&include_subdomains=true&expand=dns_names&expand=issuer",
      12000,
      { headers },
    );
  } catch (error) {
    // "No certificate for this domain" is a normal answer, not a failure.
    if (error instanceof UpstreamError && error.status === 404) return [];
    throw error;
  }

  if (!Array.isArray(raw)) return [];
  return (raw as CertSpotterEntry[]).map((entry) => {
    const names = Array.isArray(entry.dns_names) ? entry.dns_names.filter(Boolean) : [];
    const notAfter = normalizeNotAfter(entry.not_after);
    return {
      issuer: entry.issuer?.name ?? entry.issuer?.friendly_name ?? null,
      commonName: names[0] ?? null,
      names: names.slice(0, 6),
      notBefore: entry.not_before ? new Date(entry.not_before).toISOString() : null,
      notAfter: notAfter.at,
      expired: notAfter.expired,
      revoked: entry.revoked ?? null,
      fingerprint: entry.cert_sha256 ?? null,
    };
  });
}

async function fromCrtSh(domain: string): Promise<NormalizedCert[]> {
  let raw: unknown;
  try {
    raw = await fetchJson<unknown>(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&deduplicate=Y`, 15000, {
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) return [];
    throw error;
  }

  if (!Array.isArray(raw)) throw new UpstreamError("crt.sh 返回了非预期的内容");
  return (raw as CrtEntry[]).map((entry) => {
    const notAfter = normalizeNotAfter(entry.not_after);
    return {
      issuer: entry.issuer_name ?? null,
      commonName: entry.common_name ?? null,
      names: (entry.name_value ?? "")
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean)
        .slice(0, 6),
      notBefore: entry.not_before ? new Date(entry.not_before).toISOString() : null,
      notAfter: notAfter.at,
      expired: notAfter.expired,
      revoked: null,
      fingerprint: entry.serial_number ?? null,
    };
  });
}

export const onRequest: PagesHandler<PagesEnv> = async ({ request, env }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (!raw) return fail("缺少 q 参数（域名）");

  if (classifyIp(raw)) return fail("证书查询只支持域名，不支持 IP 地址");

  const domain = normalizeDomain(raw);
  if (!domain) return fail("请输入域名，而不是 IP 或其他字符串");

  const manualUrl = `https://crt.sh/?q=${encodeURIComponent(domain)}`;
  const cacheKey = `https://cache.net-tools.internal/cert/v2/${domain}`;

  return cached(cacheKey, CACHE_TTL, async () => {
    const started = Date.now();
    let entries: NormalizedCert[] = [];
    let source = "";
    let hint: string | null = null;
    let primaryError = "";

    try {
      entries = await fromCertSpotter(domain, env);
      source = env.CERTSPOTTER_TOKEN ? "Cert Spotter（CT 日志）" : "Cert Spotter（免费额度，约 100 次/小时）";
    } catch (error) {
      primaryError =
        error instanceof UpstreamError && (error.status === 403 || error.status === 429)
          ? `Cert Spotter 免费额度用尽或触发限流（HTTP ${error.status}）`
          : error instanceof Error
            ? error.message
            : String(error);
      try {
        entries = await fromCrtSh(domain);
        source = "crt.sh（Certificate Transparency 日志）";
        hint = `Cert Spotter 暂不可用（${primaryError}），已回退到较慢的 crt.sh`;
      } catch (fallbackError) {
        const secondary = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return json(
          {
            ok: false,
            query: domain,
            error: `CT 日志服务暂时不可用（Cert Spotter：${primaryError}；crt.sh：${secondary}）`,
            hint: "crt.sh 在证书量大的域名上经常超时或返回 502，可以直接打开它手动查看。",
            manualUrl,
            source: "Cert Spotter / crt.sh",
          },
          { status: 502, cors: true },
        );
      }
    }

    const certificates = compact(entries);
    return json(
      {
        ok: true,
        query: domain,
        uniqueCount: new Set(entries.map(dedupeKey)).size,
        shown: certificates.length,
        certificates,
        source,
        hint,
        manualUrl,
        elapsedMs: Date.now() - started,
        note: "CT 日志记录的是签发历史，不等于当前服务端实际下发的证书链；不同日志服务的覆盖范围与延迟略有差异。",
      },
      { cors: true, cache: `public, max-age=${CACHE_TTL}` },
    );
  });
};
