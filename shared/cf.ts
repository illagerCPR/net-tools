export interface CfProperties {
  asn?: number;
  asOrganization?: string;
  colo?: string;
  country?: string;
  city?: string;
  region?: string;
  continent?: string;
  postalCode?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  isEUCountry?: string | boolean;
  httpProtocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  clientTcpRtt?: number;
  clientAcceptEncoding?: string;
  requestPriority?: string;
  http3?: string;
  edgeRequestKeepAliveStatus?: number;
  botManagement?: {
    score?: number;
    verifiedBot?: boolean;
    staticResource?: boolean;
  };
}

/** Pages Functions handler context (subset we actually use). */
export interface PagesContext<E = Record<string, string | undefined>> {
  request: Request;
  env: E;
  params: Record<string, string>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
  next(): Promise<Response>;
}

export type PagesHandler<E = Record<string, string | undefined>> = (
  context: PagesContext<E>,
) => Response | Promise<Response>;

export type PagesEnv = {
  IPINFO_TOKEN?: string;
  PROBE_ALLOW_PRIVATE?: string;
};
