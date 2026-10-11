/**
 * Private-network protection for server-side fetches (audit finding M1).
 * Local servers stand in for the internet; a test policy that allows only
 * 127.0.0.1 plays the part of "public".
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { isPublicAddress, safeGet, safeLookup } from "../lib/safeFetch";

test("address classification: only globally routable unicast is public", () => {
  const pub = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
  const priv = [
    "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "::", "::1", "fd00::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "not-an-ip",
  ];
  for (const ip of pub) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of priv) assert.equal(isPublicAddress(ip), false, ip);
});

test("a name with ANY private answer is refused (multi-answer / rebinding)", async () => {
  const lookup = safeLookup(isPublicAddress, (_h, _o, cb) =>
    cb(null, [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]));
  const err = await new Promise<Error | null>((resolve) => lookup("feed.example", {}, (e) => resolve(e)));
  assert.match(String(err?.message), /private address/);
  const ok = safeLookup(isPublicAddress, (_h, _o, cb) => cb(null, [{ address: "8.8.8.8", family: 4 }]));
  const res = await new Promise<string>((resolve) => ok("feed.example", {}, (_e, a) => resolve(String(a))));
  assert.equal(res, "8.8.8.8");
});

async function server(handler: http.RequestListener) {
  const s = http.createServer(handler);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return { s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
}
const onlyLoopback4 = (ip: string) => ip === "127.0.0.1";

test("redirects are followed only to allowed addresses, and limits hold", async () => {
  let base = "";
  const { s, base: b } = await server((req, res) => {
    if (req.url === "/feed") return res.end("<rss/>");
    if (req.url === "/to-feed") { res.writeHead(302, { location: `${base}/feed` }); return res.end(); }
    if (req.url === "/to-private") { res.writeHead(302, { location: "http://10.0.0.1/admin" }); return res.end(); }
    if (req.url === "/to-metadata") { res.writeHead(301, { location: "http://169.254.169.254/latest/meta-data/" }); return res.end(); }
    if (req.url === "/to-file") { res.writeHead(302, { location: "file:///etc/passwd" }); return res.end(); }
    if (req.url === "/loop") { res.writeHead(302, { location: "/loop" }); return res.end(); }
    if (req.url === "/big") return res.end("x".repeat(5000));
    res.writeHead(404).end();
  });
  base = b;
  try {
    const opts = { policy: onlyLoopback4, timeoutMs: 5000 };
    assert.equal((await safeGet(`${base}/to-feed`, opts)).body, "<rss/>");
    await assert.rejects(safeGet(`${base}/to-private`, opts), /private address/);
    await assert.rejects(safeGet(`${base}/to-metadata`, opts), /private address/);
    await assert.rejects(safeGet(`${base}/to-file`, opts), /only http and https/);
    await assert.rejects(safeGet(`${base}/loop`, { ...opts, maxRedirects: 3 }), /too many redirects/);
    await assert.rejects(safeGet(`${base}/big`, { ...opts, maxBytes: 1000 }), /too large/);
    // With the real policy, the loopback server itself is refused at connect time.
    await assert.rejects(safeGet(`${base}/feed`, { timeoutMs: 5000 }), /private address/);
    await assert.rejects(safeGet(`http://localhost:${new URL(base).port}/feed`, { timeoutMs: 5000 }), /private address/);
  } finally {
    s.close();
  }
});
