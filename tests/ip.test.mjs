import test from "node:test";
import assert from "node:assert/strict";

import { classifyIp, detectIpVersion, isBlockedTarget, isValidIp, reverseName } from "../shared/ip.ts";

test("IPv4 scope detection", () => {
  assert.equal(classifyIp("8.8.8.8")?.scope, "public");
  assert.equal(classifyIp("10.1.2.3")?.scope, "private");
  assert.equal(classifyIp("172.16.0.1")?.scope, "private");
  assert.equal(classifyIp("172.32.0.1")?.scope, "public");
  assert.equal(classifyIp("192.168.1.1")?.scope, "private");
  assert.equal(classifyIp("100.64.0.1")?.scope, "cgnat");
  assert.equal(classifyIp("100.128.0.1")?.scope, "public");
  assert.equal(classifyIp("127.0.0.1")?.scope, "loopback");
  assert.equal(classifyIp("169.254.1.1")?.scope, "link-local");
  assert.equal(classifyIp("224.0.0.1")?.scope, "multicast");
  assert.equal(classifyIp("255.255.255.255")?.scope, "broadcast");
  assert.equal(classifyIp("198.18.0.1")?.scope, "benchmark");
  assert.equal(classifyIp("192.0.2.10")?.scope, "documentation");
});

test("IPv6 scope detection", () => {
  assert.equal(classifyIp("2001:4860:4860::8888")?.scope, "public");
  assert.equal(classifyIp("::1")?.scope, "loopback");
  assert.equal(classifyIp("::")?.scope, "unspecified");
  assert.equal(classifyIp("fe80::1")?.scope, "link-local");
  assert.equal(classifyIp("fd00::1")?.scope, "unique-local");
  assert.equal(classifyIp("2001:db8::1")?.scope, "documentation");
  assert.equal(classifyIp("::ffff:1.2.3.4")?.scope, "reserved");
  assert.equal(classifyIp("2001:4860:4860:0:0:0:0:8844")?.scope, "public");
});

test("invalid input is rejected", () => {
  assert.equal(classifyIp("999.1.1.1"), null);
  assert.equal(classifyIp("1.2.3"), null);
  assert.equal(classifyIp("example.com"), null);
  assert.equal(classifyIp("2001:db8:::1"), null);
  assert.equal(isValidIp("::1"), true);
  assert.equal(isValidIp("1.2.3.4"), true);
  assert.equal(isValidIp("1.2.3.4.5"), false);
});

test("version detection", () => {
  assert.equal(detectIpVersion("1.1.1.1"), 4);
  assert.equal(detectIpVersion("[2001:db8::1]"), 6);
  assert.equal(detectIpVersion("nope"), null);
});

test("blocked targets for the port prober", () => {
  assert.equal(isBlockedTarget("10.0.0.1"), true);
  assert.equal(isBlockedTarget("192.168.1.1"), true);
  assert.equal(isBlockedTarget("127.0.0.1"), true);
  assert.equal(isBlockedTarget("::1"), true);
  assert.equal(isBlockedTarget("1.1.1.1"), false);
  assert.equal(isBlockedTarget("2606:4700:4700::1111"), false);
  assert.equal(isBlockedTarget("not-an-ip"), false);
});

test("reverse names", () => {
  assert.equal(reverseName("1.2.3.4"), "4.3.2.1.in-addr.arpa");
  assert.equal(reverseName("8.8.4.4"), "4.4.8.8.in-addr.arpa");
  const v6 = reverseName("2001:4860:4860::8888");
  assert.ok(v6?.endsWith(".ip6.arpa"));
  assert.equal(v6?.split(".").length, 34);
  assert.equal(reverseName("nope"), null);
});
