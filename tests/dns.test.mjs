import test from "node:test";
import assert from "node:assert/strict";

import { dnsRcodeName, dnsTypeName, normalizeDomain, parseDohJson } from "../shared/dns.ts";

const googleStyle = {
  Status: 0,
  TC: false,
  RD: true,
  RA: true,
  AD: true,
  Question: [{ name: "example.com.", type: 1 }],
  Answer: [
    { name: "example.com.", type: 1, TTL: 3600, data: "93.184.216.34" },
    { name: "example.com.", type: 1, TTL: 3600, data: "93.184.215.14" },
  ],
};

const aliStyle = {
  Status: 0,
  TC: false,
  RD: true,
  RA: true,
  AD: false,
  Question: { name: "example.com.", type: 1 },
  Answer: [{ name: "example.com.", TTL: 27, type: 1, data: "104.20.23.154" }],
};

test("parses Google-style DoH JSON", () => {
  const parsed = parseDohJson(googleStyle);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rcodeName, "NOERROR");
  assert.equal(parsed.ad, true);
  assert.equal(parsed.answers.length, 2);
  assert.equal(parsed.answers[0].typeName, "A");
});

test("parses AliDNS-style DoH JSON (object Question)", () => {
  const parsed = parseDohJson(aliStyle);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.answers[0].data, "104.20.23.154");
  assert.equal(parsed.ad, false);
});

test("negative responses keep authority records", () => {
  const parsed = parseDohJson({
    Status: 3,
    Answer: [],
    Authority: [{ name: "example.com.", type: 6, TTL: 900, data: "ns1.example.com. hostmaster.example.com. 1 7200 3600 1209600 900" }],
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.rcode, 3);
  assert.equal(parsed.rcodeName, "NXDOMAIN");
  assert.equal(parsed.authority[0].typeName, "SOA");
});

test("malformed payloads do not throw", () => {
  assert.deepEqual(parseDohJson(null).answers, []);
  assert.deepEqual(parseDohJson({ Status: 2 }).answers, []);
  assert.deepEqual(parseDohJson({ Answer: "nope" }).answers, []);
});

test("type and rcode names", () => {
  assert.equal(dnsTypeName(28), "AAAA");
  assert.equal(dnsTypeName(9999), "TYPE9999");
  assert.equal(dnsRcodeName(3), "NXDOMAIN");
  assert.equal(dnsRcodeName(42), "RCODE42");
});

test("domain normalization", () => {
  assert.equal(normalizeDomain("Example.COM."), "example.com");
  assert.equal(normalizeDomain("https://example.com/path?q=1"), "example.com");
  assert.equal(normalizeDomain("_dmarc.example.com"), "_dmarc.example.com");
  assert.equal(normalizeDomain("1.0.0.127.in-addr.arpa"), "1.0.0.127.in-addr.arpa");
  assert.equal(normalizeDomain("bad domain"), null);
  assert.equal(normalizeDomain(""), null);
  assert.equal(normalizeDomain("-leading.example.com"), null);
});
