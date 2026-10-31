import type { DnsRecord } from "./dns";
import type { IpClassification } from "./ip";

export interface GeoInfo {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  asn: string | null;
  org: string | null;
  isp: string | null;
  domain: string | null;
}

export interface MeResponse {
  ok: boolean;
  ip: string;
  ray?: string | null;
  country?: string | null;
  cf: {
    country: string | null;
    region: string | null;
    city: string | null;
    continent: string | null;
    postalCode: string | null;
    latitude: string | null;
    longitude: string | null;
    timezone: string | null;
    isEUCountry: string | boolean | null;
    asn: number | null;
    asOrganization: string | null;
    colo: string | null;
    httpProtocol: string | null;
    tlsVersion: string | null;
    tlsCipher: string | null;
    clientTcpRtt: number | null;
    http3: string | null;
    requestPriority: string | null;
    clientAcceptEncoding: string | null;
  };
  error?: string;
}

export interface DnsResolverResult {
  id: string;
  label: string;
  /** Endpoint supplied by the visitor, not one of the built-in resolvers. */
  custom?: boolean;
  ok: boolean;
  rcode?: number;
  rcodeName?: string;
  ad?: boolean;
  truncated?: boolean;
  answers: DnsRecord[];
  authority: DnsRecord[];
  elapsedMs: number;
  error?: string;
}

export interface DnsResponse {
  ok: boolean;
  name: string;
  type: string;
  resolvers: DnsResolverResult[];
  elapsedMs: number;
  via?: string;
  error?: string;
}

export interface IpResponse {
  ok: boolean;
  ip: string;
  classification: IpClassification;
  geo: GeoInfo | null;
  source: string | null;
  note?: string;
  error?: string;
}

export interface RdapEntity {
  handle: string | null;
  roles: string[];
  name: string | null;
  org: string | null;
  emails: string[];
}

export interface RdapResponse {
  ok: boolean;
  kind: "ip" | "domain";
  query: string;
  source?: string;
  handle?: string | null;
  name?: string | null;
  country?: string | null;
  type?: string | null;
  handleType?: string | null;
  startAddress?: string | null;
  endAddress?: string | null;
  ipVersion?: string | null;
  parentHandle?: string | null;
  status?: string[];
  nameservers?: string[];
  events?: Record<string, string>;
  entities?: RdapEntity[];
  notices?: Array<{ title: string | null; description: string }>;
  remarks?: Array<{ title: string | null; description: string }>;
  error?: string;
}

export interface TorResponse {
  ok: boolean;
  ip: string;
  isExit: boolean | null;
  listSize?: number;
  fetchedAt?: string | null;
  source?: string;
  note?: string;
  error?: string;
}

export interface PortResult {
  port: number;
  state: "open" | "closed" | "timeout" | "error";
  elapsedMs: number;
  remoteAddress?: string | null;
  error?: string;
}

export interface PortResponse {
  ok: boolean;
  host: string;
  timeoutMs: number;
  results: PortResult[];
  elapsedMs: number;
  note?: string;
  error?: string;
}

export interface CertEntry {
  issuer: string | null;
  commonName: string | null;
  names: string[];
  notBefore: string | null;
  notAfter: string | null;
  expired: boolean | null;
  revoked: boolean | null;
  /** SHA-256 of the certificate (Cert Spotter) or the serial number (crt.sh). */
  fingerprint: string | null;
}

export interface CertResponse {
  ok: boolean;
  query: string;
  uniqueCount?: number;
  shown?: number;
  certificates?: CertEntry[];
  source?: string;
  note?: string;
  hint?: string | null;
  manualUrl?: string;
  elapsedMs?: number;
  error?: string;
}

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface HeadersResponse {
  ok: boolean;
  ip: string;
  headers: HeaderEntry[];
  extraHeaders: HeaderEntry[];
  cf: {
    country: string | null;
    region: string | null;
    city: string | null;
    colo: string | null;
    asn: number | null;
    asOrganization: string | null;
    httpProtocol: string | null;
    tlsVersion: string | null;
    tlsCipher: string | null;
    clientTcpRtt: number | null;
  };
}
