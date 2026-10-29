interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function edgeCache(): EdgeCache | null {
  const store = (caches as unknown as { default?: EdgeCache }).default;
  return store && typeof store.match === "function" ? store : null;
}

/**
 * Cache a JSON response in the local colo cache.
 * `key` must be a synthetic absolute URL unique per (endpoint, params).
 */
export async function cached(key: string, ttlSeconds: number, produce: () => Promise<Response>): Promise<Response> {
  const store = edgeCache();
  const request = new Request(key, { method: "GET" });
  if (store) {
    const hit = await store.match(request).catch(() => undefined);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("x-cache", "HIT");
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  const response = await produce();
  const headers = new Headers(response.headers);
  headers.set("x-cache", "MISS");
  const output = new Response(response.body, { status: response.status, headers });

  if (store && response.ok) {
    const cacheHeaders = new Headers(headers);
    cacheHeaders.set("cache-control", `public, max-age=${ttlSeconds}`);
    cacheHeaders.delete("x-cache");
    const copy = new Response(output.clone().body, { status: output.status, headers: cacheHeaders });
    await store.put(request, copy).catch(() => undefined);
  }
  return output;
}
