import type { PagesHandler } from "../../shared/cf";
import { normalizeDomain } from "../../shared/dns";
import { cached } from "../_lib/cache";
import { fail, json, methodNotAllowed, preflight } from "../_lib/http";
import { fetchJson } from "../_lib/upstream";

const CACHE_TTL = 60 * 60;

interface CrtEntry {
  issuer_name?: string;
  common_name?: string;
  name_value?: string;
  id?: number;
  entry_timestamp?: string;
  not_before?: string;
  not_after?: string;
  serial_number?: string;
}

export const onRequest: PagesHandler = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (!raw) return fail("缺少 q 参数（域名）");

  const domain = normalizeDomain(raw);
  if (!domain) return fail("请输入域名，而不是 IP 或其他字符串");

  const cacheKey = `https://cache.net-tools.internal/cert/v1/${domain}`;
  return cached(cacheKey, CACHE_TTL, async () => {
    try {
      const entries = await fetchJson<CrtEntry[]>(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, 15000, {
        headers: { accept: "application/json" },
      });
      if (!Array.isArray(entries)) {
        return json({ ok: false, error: "crt.sh 返回了非预期的内容" }, { status: 502, cors: true });
      }

      const unique = new Map<string, CrtEntry>();
      for (const entry of entries) {
        const key = entry.serial_number ?? `${entry.id}:${entry.not_before}`;
        if (!unique.has(key)) unique.set(key, entry);
      }

      const now = Date.now();
      const certificates = [...unique.values()]
        .sort((a, b) => String(b.not_after ?? "").localeCompare(String(a.not_after ?? "")))
        .slice(0, 20)
        .map((entry) => {
          const notAfter = entry.not_after ? new Date(entry.not_after) : null;
          const notBefore = entry.not_before ? new Date(entry.not_before) : null;
          return {
            issuer: entry.issuer_name ?? null,
            commonName: entry.common_name ?? null,
            names: (entry.name_value ?? "")
              .split("\n")
              .map((name) => name.trim())
              .filter(Boolean)
              .slice(0, 6),
            notBefore: notBefore ? notBefore.toISOString() : null,
            notAfter: notAfter ? notAfter.toISOString() : null,
            expired: notAfter ? notAfter.getTime() < now : null,
            serialNumber: entry.serial_number ?? null,
            entryTimestamp: entry.entry_timestamp ?? null,
          };
        });

      return json(
        {
          ok: true,
          query: domain,
          uniqueCount: unique.size,
          shown: certificates.length,
          certificates,
          source: "crt.sh（Certificate Transparency 日志）",
          note: "CT 日志记录的是签发历史，不等于当前服务端实际下发的证书链。",
        },
        { cors: true, cache: `public, max-age=${CACHE_TTL}` },
      );
    } catch (error) {
      return json(
        {
          ok: false,
          query: domain,
          error: error instanceof Error ? error.message : String(error),
          source: "crt.sh",
        },
        { status: 502, cors: true },
      );
    }
  });
};
