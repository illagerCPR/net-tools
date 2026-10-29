import type { PagesEnv, PagesHandler } from "../../shared/cf";
import { classifyIp } from "../../shared/ip";
import { clientIp, json, methodNotAllowed, preflight } from "../_lib/http";
import { fetchText } from "../_lib/upstream";

const LIST_KEY = "https://cache.net-tools.internal/tor-exit-list/v1";
const LIST_TTL = 60 * 60;

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function cacheStore(): EdgeCache | null {
  const store = (caches as unknown as { default?: EdgeCache }).default;
  return store && typeof store.match === "function" ? store : null;
}

async function loadExitList(): Promise<{ ips: Set<string>; fetchedAt: string | null }> {
  const store = cacheStore();
  if (store) {
    const hit = await store.match(new Request(LIST_KEY)).catch(() => undefined);
    if (hit) {
      const text = await hit.text();
      const ips = new Set(text.split("\n").map((line) => line.trim()).filter(Boolean));
      return { ips, fetchedAt: hit.headers.get("x-fetched-at") };
    }
  }
  const text = await fetchText("https://check.torproject.org/torbulkexitlist", 12000);
  const ips = new Set(text.split("\n").map((line) => line.trim()).filter(Boolean));
  if (store) {
    await store
      .put(
        new Request(LIST_KEY),
        new Response(text, {
          headers: { "cache-control": `public, max-age=${LIST_TTL}`, "x-fetched-at": new Date().toISOString() },
        }),
      )
      .catch(() => undefined);
  }
  return { ips, fetchedAt: new Date().toISOString() };
}

export const onRequest: PagesHandler<PagesEnv> = async ({ request }) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  const addr = (url.searchParams.get("ip") ?? "").trim() || clientIp(request);
  const classification = classifyIp(addr);
  if (!classification) return json({ ok: false, error: "ip 不是合法的 IP 地址" }, { status: 400, cors: true });

  if (!classification.isPublic) {
    return json(
      { ok: true, ip: addr, isExit: false, note: "私有 / 保留地址不可能是 Tor 出口", source: "check.torproject.org" },
      { cors: true },
    );
  }

  try {
    const { ips, fetchedAt } = await loadExitList();
    return json(
      {
        ok: true,
        ip: addr,
        isExit: ips.has(addr),
        listSize: ips.size,
        fetchedAt,
        source: "check.torproject.org（torbulkexitlist）",
      },
      { cors: true },
    );
  } catch (error) {
    return json(
      {
        ok: true,
        ip: addr,
        isExit: null,
        error: error instanceof Error ? error.message : String(error),
        source: "check.torproject.org",
      },
      { cors: true },
    );
  }
};
