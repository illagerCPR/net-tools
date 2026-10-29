export const DNS_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SOA",
  "CAA",
  "SRV",
  "PTR",
  "HTTPS",
  "SVCB",
  "NAPTR",
  "TLSA",
  "SSHFP",
  "DNSKEY",
  "DS",
  "RRSIG",
  "ANY",
] as const;

export type DnsType = (typeof DNS_TYPES)[number];

export const DEFAULT_DNS_TYPE: DnsType = "A";

export interface DnsRecord {
  name: string;
  ttl: number;
  type: number;
  typeName: string;
  data: string;
}

export interface DnsResult {
  ok: boolean;
  rcode: number;
  rcodeName: string;
  /** DNSSEC authenticated data flag (AD bit). */
  ad: boolean;
  truncated: boolean;
  answers: DnsRecord[];
  authority: DnsRecord[];
  error?: string;
}

const TYPE_NAMES: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  12: "PTR",
  13: "HINFO",
  15: "MX",
  16: "TXT",
  17: "RP",
  18: "AFSDB",
  24: "SIG",
  25: "KEY",
  28: "AAAA",
  29: "LOC",
  33: "SRV",
  35: "NAPTR",
  36: "KX",
  37: "CERT",
  39: "DNAME",
  43: "DS",
  44: "SSHFP",
  45: "IPSECKEY",
  46: "RRSIG",
  47: "NSEC",
  48: "DNSKEY",
  49: "DHCID",
  50: "NSEC3",
  51: "NSEC3PARAM",
  52: "TLSA",
  53: "SMIMEA",
  55: "HIP",
  59: "CDS",
  60: "CDNSKEY",
  61: "OPENPGPKEY",
  62: "CSYNC",
  63: "ZONEMD",
  64: "SVCB",
  65: "HTTPS",
  99: "SPF",
  108: "EUI48",
  109: "EUI64",
  249: "TKEY",
  250: "TSIG",
  251: "IXFR",
  252: "AXFR",
  255: "ANY",
  256: "URI",
  257: "CAA",
};

const RCODE_NAMES: Record<number, string> = {
  0: "NOERROR",
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
  4: "NOTIMP",
  5: "REFUSED",
  6: "YXDOMAIN",
  7: "YXRRSET",
  8: "NXRRSET",
  9: "NOTAUTH",
  10: "NOTZONE",
};

export function dnsTypeName(code: number): string {
  return TYPE_NAMES[code] ?? `TYPE${code}`;
}

export function dnsRcodeName(code: number): string {
  return RCODE_NAMES[code] ?? `RCODE${code}`;
}

interface RawRecord {
  name?: unknown;
  TTL?: unknown;
  type?: unknown;
  data?: unknown;
}

function normalizeRecord(raw: RawRecord): DnsRecord | null {
  const type = typeof raw.type === "number" ? raw.type : Number.NaN;
  if (!Number.isFinite(type)) return null;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    ttl: typeof raw.TTL === "number" ? raw.TTL : 0,
    type,
    typeName: dnsTypeName(type),
    data: typeof raw.data === "string" ? raw.data : String(raw.data ?? ""),
  };
}

export function parseDohJson(raw: unknown): DnsResult {
  const body = (raw ?? {}) as {
    Status?: unknown;
    TC?: unknown;
    AD?: unknown;
    Answer?: unknown;
    Authority?: unknown;
  };
  const status = typeof body.Status === "number" ? body.Status : 0;
  const answers = Array.isArray(body.Answer)
    ? body.Answer.map((item) => normalizeRecord(item as RawRecord)).filter((item): item is DnsRecord => item !== null)
    : [];
  const authority = Array.isArray(body.Authority)
    ? body.Authority.map((item) => normalizeRecord(item as RawRecord)).filter((item): item is DnsRecord => item !== null)
    : [];
  return {
    ok: status === 0,
    rcode: status,
    rcodeName: dnsRcodeName(status),
    ad: body.AD === true,
    truncated: body.TC === true,
    answers,
    authority,
  };
}

const DOMAIN_RE = /^(?=.{1,253}\.?$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.?$/i;

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!trimmed || trimmed.length > 253) return null;
  if (!DOMAIN_RE.test(trimmed)) return null;
  return trimmed.replace(/\.$/, "").toLowerCase();
}

export function isDnsType(value: string): value is DnsType {
  return (DNS_TYPES as readonly string[]).includes(value.toUpperCase());
}
