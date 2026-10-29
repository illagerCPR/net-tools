export interface JsonInit {
  status?: number;
  cache?: string;
  cors?: boolean;
  headers?: Record<string, string>;
}

export function json(data: unknown, init: JsonInit = {}): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": init.cache ?? "no-store",
  });
  if (init.cors) headers.set("access-control-allow-origin", "*");
  for (const [key, value] of Object.entries(init.headers ?? {})) headers.set(key, value);
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function fail(message: string, status = 400, cors = true): Response {
  return json({ ok: false, error: message }, { status, cors });
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { ok: false, error: `只支持 ${allowed.join(" / ")}` },
    { status: 405, cors: true, headers: { allow: allowed.join(", ") } },
  );
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1"
  );
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "请求超时";
    const message = error.message ?? "";
    // workerd reports network failures as "internal error; reference = ...".
    if (/^internal error/i.test(message)) return "上游不可达或连接被重置";
    return message;
  }
  return String(error);
}

export function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
