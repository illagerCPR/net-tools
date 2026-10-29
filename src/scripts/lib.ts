export type JsonObject = Record<string, unknown>;

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function must<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少元素：${selector}`);
  return element;
}

export function setText(node: Element | null, value: unknown): void {
  if (!node) return;
  node.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
}

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function relTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units: Array<[number, string]> = [
    [60, "秒"],
    [3600, "分钟"],
    [86400, "小时"],
    [2592000, "天"],
  ];
  let scale = 1;
  let label = "秒";
  for (const [bound, name] of units) {
    if (seconds < bound) break;
    scale = bound;
    label = name;
  }
  if (seconds < 60) return "刚刚";
  return `${Math.floor(seconds / scale)} ${label}前`;
}

export async function getJson<T>(path: string, options: { timeoutMs?: number; init?: RequestInit } = {}): Promise<T> {
  const response = await fetch(path, {
    ...(options.init ?? {}),
    signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
  });
  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`服务返回了非 JSON 内容（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" && message ? message : `请求失败（HTTP ${response.status}）`);
  }
  return data as T;
}

export async function fetchJsonFrom<T>(url: string, timeoutMs = 8000): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchTextFrom(url: string, timeoutMs = 8000): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast("已复制");
  } catch {
    toast("复制失败，请手动选择");
  }
}

export function toast(message: string): void {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 1600);
}

export function badge(state: "ok" | "warn" | "bad" | "neutral", label: string): string {
  const suffix = state === "neutral" ? "" : ` badge--${state}`;
  return `<span class="badge${suffix}">${esc(label)}</span>`;
}

export function mountBadge(
  node: Element | null,
  state: "ok" | "warn" | "bad" | "neutral",
  label: string,
): void {
  if (!node) return;
  node.className = `badge${state === "neutral" ? "" : ` badge--${state}`}`;
  node.textContent = label;
}

export function spinner(): string {
  return `<span class="spinner" aria-hidden="true"></span>`;
}

export function isIpLike(value: string): boolean {
  const text = value.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return true;
  return text.includes(":") && /^[0-9a-f:.]+$/i.test(text) && /:/.test(text);
}
