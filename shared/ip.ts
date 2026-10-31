export type IpVersion = 4 | 6;

export type IpScope =
  | "public"
  | "private"
  | "loopback"
  | "link-local"
  | "cgnat"
  | "multicast"
  | "reserved"
  | "documentation"
  | "benchmark"
  | "broadcast"
  | "unique-local"
  | "unspecified";

export interface IpClassification {
  input: string;
  version: IpVersion;
  scope: IpScope;
  /** Short human label, Chinese. */
  label: string;
  /** Why it got that label. */
  notes: string[];
  isPublic: boolean;
}

const SCOPES: Record<IpScope, string> = {
  public: "公网地址",
  private: "私有地址（RFC 1918）",
  loopback: "回环地址",
  "link-local": "链路本地地址",
  cgnat: "运营商级 NAT（CGNAT）",
  multicast: "组播地址",
  reserved: "保留 / 特殊用途",
  documentation: "文档示例地址",
  benchmark: "基准测试地址",
  broadcast: "广播地址",
  "unique-local": "唯一本地地址（ULA）",
  unspecified: "未指定地址",
};

export function scopeLabel(scope: IpScope): string {
  return SCOPES[scope];
}

function parseIpv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const value = Number(part);
    if (value > 255) return null;
    out.push(value);
  }
  return out;
}

function hex16(part: string): number {
  if (!/^[0-9a-f]{1,4}$/i.test(part)) return -1;
  return Number.parseInt(part, 16);
}

function parseIpv6(input: string): number[] | null {
  let text = input.trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zoneIndex = text.indexOf("%");
  if (zoneIndex >= 0) text = text.slice(0, zoneIndex);
  if (!text.includes(":")) return null;
  // ":::": a compression group can only appear once and never holds an empty group.
  if (text.includes(":::")) return null;
  if (text.startsWith(":") && !text.startsWith("::")) return null;
  if (text.endsWith(":") && !text.endsWith("::")) return null;

  let embedded: number[] = [];
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    if (lastColon < 0) return null;
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    embedded = [((v4[0] ?? 0) << 8) | (v4[1] ?? 0), ((v4[2] ?? 0) << 8) | (v4[3] ?? 0)];
    text = text.slice(0, lastColon + 1);
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = (halves[0] ?? "").split(":").filter((part) => part !== "");
  const tail = halves.length === 2 ? (halves[1] ?? "").split(":").filter((part) => part !== "") : [];
  const expected = 8 - embedded.length;

  const headNumbers = head.map(hex16);
  const tailNumbers = tail.map(hex16);
  if ([...headNumbers, ...tailNumbers].some((value) => value < 0)) return null;

  let groups: number[];
  if (halves.length === 2) {
    const missing = expected - headNumbers.length - tailNumbers.length;
    if (missing < 0) return null;
    groups = [...headNumbers, ...new Array<number>(missing).fill(0), ...tailNumbers];
  } else {
    groups = [...headNumbers, ...tailNumbers];
  }
  if (groups.length !== expected) return null;
  return [...groups, ...embedded];
}

function inPrefixV6(groups: number[], prefix: number[], bits: number): boolean {
  let remaining = bits;
  for (let index = 0; index < 8 && remaining > 0; index += 1) {
    const width = Math.min(16, remaining);
    const mask = width === 16 ? 0xffff : (0xffff << (16 - width)) & 0xffff;
    const a = groups[index] ?? 0;
    const b = prefix[index] ?? 0;
    if (((a ^ b) & mask) !== 0) return false;
    remaining -= width;
  }
  return true;
}

export function detectIpVersion(input: string): IpVersion | null {
  const text = input.trim();
  if (parseIpv4(text)) return 4;
  if (parseIpv6(text)) return 6;
  return null;
}

export function isValidIp(input: string): boolean {
  return detectIpVersion(input) !== null;
}

function make(input: string, version: IpVersion, scope: IpScope, note: string): IpClassification {
  return {
    input,
    version,
    scope,
    label: SCOPES[scope],
    notes: note ? [note] : [],
    isPublic: scope === "public",
  };
}

function classifyIpv4(input: string, octets: number[]): IpClassification {
  const [a = 0, b = 0, c = 0] = octets;
  if (a === 0) return make(input, 4, "reserved", "0.0.0.0/8：「本网络」，仅在 DHCP 等场景作源地址使用");
  if (a === 10) return make(input, 4, "private", "10.0.0.0/8：私有地址，不在公网路由");
  if (a === 100 && b >= 64 && b <= 127) return make(input, 4, "cgnat", "100.64.0.0/10：运营商级 NAT 共享地址段");
  if (a === 127) return make(input, 4, "loopback", "127.0.0.0/8：本机回环");
  if (a === 169 && b === 254) return make(input, 4, "link-local", "169.254.0.0/16：链路本地，自配地址 / 局域网发现");
  if (a === 172 && b >= 16 && b <= 31) return make(input, 4, "private", "172.16.0.0/12：私有地址");
  if (a === 192 && b === 168) return make(input, 4, "private", "192.168.0.0/16：私有地址");
  if (a === 192 && b === 0 && c === 0) return make(input, 4, "reserved", "192.0.0.0/24：IETF 协议分配");
  if (a === 192 && b === 0 && c === 2) return make(input, 4, "documentation", "192.0.2.0/24：文档示例（TEST-NET-1）");
  if (a === 198 && (b === 18 || b === 19)) return make(input, 4, "benchmark", "198.18.0.0/15：网络测速基准段");
  if (a === 198 && b === 51 && c === 100) return make(input, 4, "documentation", "198.51.100.0/24：文档示例（TEST-NET-2）");
  if (a === 203 && b === 0 && c === 113) return make(input, 4, "documentation", "203.0.113.0/24：文档示例（TEST-NET-3）");
  if (a === 192 && b === 88 && c === 99) return make(input, 4, "reserved", "192.88.99.0/24：6to4 中继（已废弃）");
  if (a === 255 && b === 255 && c === 255) return make(input, 4, "broadcast", "255.255.255.255：受限广播");
  if (a >= 224 && a <= 239) return make(input, 4, "multicast", "224.0.0.0/4：组播地址");
  if (a >= 240) return make(input, 4, "reserved", "240.0.0.0/4：保留，不可分配");
  return make(input, 4, "public", "");
}

function classifyIpv6(input: string, groups: number[]): IpClassification {
  const allZero = groups.every((group) => group === 0);
  if (allZero) return make(input, 6, "unspecified", "::：未指定地址");
  if (inPrefixV6(groups, [0, 0, 0, 0, 0, 0, 0, 1], 128)) {
    return make(input, 6, "loopback", "::1：本机回环");
  }
  if (inPrefixV6(groups, [0, 0, 0, 0, 0, 0xffff, 0, 0], 96)) {
    return make(input, 6, "reserved", "::ffff:0:0/96：IPv4 映射地址");
  }
  if (inPrefixV6(groups, [0x64, 0xff9b, 0, 0, 0, 0, 0, 0], 96)) {
    return make(input, 6, "public", "64:ff9b::/96：NAT64 转换前缀");
  }
  if (inPrefixV6(groups, [0x2002, 0, 0, 0, 0, 0, 0, 0], 16)) {
    return make(input, 6, "public", "2002::/16：6to4 隧道地址");
  }
  if (inPrefixV6(groups, [0xfc00, 0, 0, 0, 0, 0, 0, 0], 7)) {
    return make(input, 6, "unique-local", "fc00::/7：唯一本地地址（ULA），不全局路由");
  }
  if (inPrefixV6(groups, [0xfe80, 0, 0, 0, 0, 0, 0, 0], 10)) {
    return make(input, 6, "link-local", "fe80::/10：链路本地");
  }
  if (inPrefixV6(groups, [0xff00, 0, 0, 0, 0, 0, 0, 0], 8)) {
    return make(input, 6, "multicast", "ff00::/8：组播地址");
  }
  if (inPrefixV6(groups, [0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], 32)) {
    return make(input, 6, "documentation", "2001:db8::/32：文档示例");
  }
  if (inPrefixV6(groups, [0x3fff, 0, 0, 0, 0, 0, 0, 0], 20)) {
    return make(input, 6, "documentation", "3fff::/20：文档示例");
  }
  if (inPrefixV6(groups, [0x0100, 0, 0, 0, 0, 0, 0, 0], 64)) {
    return make(input, 6, "reserved", "100::/64：丢弃前缀");
  }
  if (inPrefixV6(groups, [0x2001, 0, 0, 0, 0, 0, 0, 0], 32) && (groups[1] ?? 0) === 0) {
    return make(input, 6, "public", "2001::/32：Teredo 隧道地址");
  }
  return make(input, 6, "public", "");
}

export function classifyIp(input: string): IpClassification | null {
  const text = input.trim();
  const v4 = parseIpv4(text);
  if (v4) return classifyIpv4(text, v4);
  const v6 = parseIpv6(text);
  if (v6) return classifyIpv6(text, v6);
  return null;
}

/** True when a probe from our edge must not be attempted. */
export function isBlockedTarget(input: string): boolean {
  const classification = classifyIp(input);
  if (!classification) return false;
  return !classification.isPublic;
}

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".lan", ".corp"];

const BLOCKED_HOST_NAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "instance-data",
  "metadata",
]);

/** True for hostnames that only resolve on the inside of someone's network. */
export function isBlockedHostName(input: string): boolean {
  const host = input.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOST_NAMES.has(host)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Reverse DNS name (in-addr.arpa / ip6.arpa) for PTR lookups. */
export function reverseName(input: string): string | null {
  const classification = classifyIp(input);
  if (!classification) return null;
  if (classification.version === 4) {
    const octets = parseIpv4(input.trim());
    if (!octets) return null;
    return `${[...octets].reverse().join(".")}.in-addr.arpa`;
  }
  const groups = parseIpv6(input.trim());
  if (!groups) return null;
  const hex = groups.map((group) => group.toString(16).padStart(4, "0")).join("");
  return `${hex.split("").reverse().join(".")}.ip6.arpa`;
}

export function parseIpv4Octets(input: string): number[] | null {
  return parseIpv4(input.trim());
}
