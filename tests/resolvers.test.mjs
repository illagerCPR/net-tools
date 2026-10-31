import test from "node:test";
import assert from "node:assert/strict";

import { isBlockedHostName } from "../shared/ip.ts";
import { MAX_CUSTOM_RESOLVERS, findResolver, parseCustomDohUrl } from "../shared/resolvers.ts";

function accepted(raw, index = 0) {
  const parsed = parseCustomDohUrl(raw, index);
  assert.equal(parsed.ok, true, `expected ${raw} to be accepted: ${parsed.ok ? "" : parsed.error}`);
  if (!parsed.ok) throw new Error("unreachable");
  return parsed;
}

function rejected(raw) {
  const parsed = parseCustomDohUrl(raw);
  assert.equal(parsed.ok, false, `expected ${raw} to be rejected`);
  if (parsed.ok) throw new Error("unreachable");
  return parsed.error;
}

test("custom DoH templates name and type onto the endpoint", () => {
  const parsed = accepted("https://dns.google/resolve");
  const url = new URL(parsed.resolver.url("example.com", "MX"));
  assert.equal(url.origin, "https://dns.google");
  assert.equal(url.pathname, "/resolve");
  assert.equal(url.searchParams.get("name"), "example.com");
  assert.equal(url.searchParams.get("type"), "MX");
  assert.equal(parsed.host, "dns.google");
});

test("bare host gets the conventional /dns-query path", () => {
  const parsed = accepted("https://dns.example.com");
  assert.equal(parsed.endpoint, "https://dns.example.com/dns-query");
  assert.equal(new URL(parsed.resolver.url("a.test", "A")).pathname, "/dns-query");
});

test("existing query parameters survive and name/type are overwritten", () => {
  const parsed = accepted("https://doh.example/dns-query?name=fixed&profile=team");
  const url = new URL(parsed.resolver.url("example.com", "TXT"));
  assert.equal(url.searchParams.get("name"), "example.com");
  assert.equal(url.searchParams.get("profile"), "team");
  assert.equal(url.searchParams.get("type"), "TXT");
  assert.equal(url.toString().match(/name=/g)?.length, 1);
});

test("custom resolvers carry a stable id and a human label", () => {
  const first = accepted("https://one.example/dns-query", 0);
  const second = accepted("https://two.example/dns-query", 1);
  assert.equal(first.resolver.id, "custom-1");
  assert.equal(second.resolver.id, "custom-2");
  assert.equal(first.resolver.custom, true);
  assert.match(first.resolver.label, /one\.example/);
  assert.equal(MAX_CUSTOM_RESOLVERS, 2);
});

test("only public https endpoints are accepted", () => {
  assert.match(rejected("http://dns.example/dns-query"), /https/);
  assert.match(rejected("ftp://dns.example/dns-query"), /https/);
  assert.match(rejected("dns.example"), /URL/);
  assert.match(rejected(""), /空/);
  assert.match(rejected("https://user:pass@dns.example/dns-query"), /用户名或密码/);
  assert.match(rejected("https://dns.example:8080/dns-query"), /8080/);
  assert.match(rejected(`https://dns.example/${"a".repeat(600)}`), /过长/);
});

test("local and reserved hosts are refused", () => {
  assert.match(rejected("https://localhost/dns-query"), /内网|localhost/);
  assert.match(rejected("https://adguard.local/dns-query"), /内网/);
  assert.match(rejected("https://router.home.arpa/dns-query"), /内网/);
  assert.match(rejected("https://192.168.1.1/dns-query"), /内网/);
  assert.match(rejected("https://[::1]/dns-query"), /内网/);
  assert.match(rejected("https://100.64.0.1/dns-query"), /内网/);
});

test("public IP literals are allowed", () => {
  const parsed = accepted("https://1.1.1.1/dns-query");
  assert.equal(parsed.host, "1.1.1.1");
  assert.equal(parsed.resolver.url("example.com", "A").startsWith("https://1.1.1.1/dns-query?name="), true);
});

test("isBlockedHostName rejects inner-only suffixes", () => {
  for (const host of ["localhost", "printer.local", "nas.lan", "db.internal", "x.home.arpa"]) {
    assert.equal(isBlockedHostName(host), true, host);
  }
  for (const host of ["example.com", "dns.google", "adguard-dns.com"]) {
    assert.equal(isBlockedHostName(host), false, host);
  }
});

test("built-in resolvers are unaffected", () => {
  assert.equal(findResolver("ali")?.id, "ali");
  assert.equal(findResolver("nope"), undefined);
  const url = findResolver("cf")?.url("example.com", "A") ?? "";
  assert.equal(new URL(url).searchParams.get("name"), "example.com");
});
