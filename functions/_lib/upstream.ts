import { messageOf } from "./http";

const USER_AGENT = "net-tools/0.1 (+https://github.com/illagerCPR/net-tools)";

export class UpstreamError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "user-agent": USER_AGENT,
      ...(init.headers ?? {}),
    },
    redirect: init.redirect ?? "follow",
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error: unknown) => {
    throw new UpstreamError(messageOf(error));
  });

  if (!response.ok) {
    throw new UpstreamError(`上游返回 HTTP ${response.status}`, response.status);
  }
  return response;
}

export async function fetchJson<T>(url: string, timeoutMs = 8000, init: RequestInit = {}): Promise<T> {
  const response = await request(url, init, timeoutMs);
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`上游返回了非 JSON 内容（${text.slice(0, 80)}）`);
  }
}

export async function fetchText(url: string, timeoutMs = 8000, init: RequestInit = {}): Promise<string> {
  const response = await request(url, init, timeoutMs);
  return response.text();
}
