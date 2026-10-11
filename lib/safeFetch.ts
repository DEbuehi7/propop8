/**
 * Server-side GET of a user-supplied URL without reaching private networks.
 *
 * Every connection — the first request AND every redirect hop — is checked
 * at connect time: the hostname is resolved, and if ANY answer is a private,
 * loopback, link-local or reserved address the request is refused. Checking
 * at connect time (not before) also closes DNS rebinding, where a name
 * answers public on the pre-check and private on the real connection.
 */
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

export type AddressPolicy = (ip: string) => boolean;

const blocked = new net.BlockList();
for (const [a, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(a, p, "ipv4");
for (const [a, p] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["100::", 64],
] as const) blocked.addSubnet(a, p, "ipv6");

/** Last 32 bits of an IPv6 address as dotted IPv4 (for mapped / NAT64 forms). */
function embeddedV4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted && (lower.startsWith("::ffff:") || lower.startsWith("64:ff9b::"))) return dotted[1];
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

/** True only for globally routable unicast addresses. */
export const isPublicAddress: AddressPolicy = (ip) => {
  const kind = net.isIP(ip);
  if (kind === 4) return !blocked.check(ip, "ipv4");
  if (kind === 6) {
    const v4 = embeddedV4(ip);
    if (v4) return net.isIP(v4) === 4 && !blocked.check(v4, "ipv4");
    return !blocked.check(ip, "ipv6");
  }
  return false;
};

type Resolver = (host: string, opts: dns.LookupAllOptions, cb: (err: NodeJS.ErrnoException | null, addrs: dns.LookupAddress[]) => void) => void;
const defaultResolver: Resolver = (h, o, cb) => dns.lookup(h, o, cb);

/** A `lookup` for http(s).request that refuses names with any non-public answer. */
export function safeLookup(policy: AddressPolicy = isPublicAddress, resolver: Resolver = defaultResolver) {
  return (
    hostname: string,
    options: dns.LookupOptions,
    cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
  ) => {
    resolver(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err, "");
      if (!addrs.length) return cb(Object.assign(new Error(`no address for ${hostname}`), { code: "ENOTFOUND" }), "");
      const bad = addrs.find((a) => !policy(a.address));
      if (bad) return cb(Object.assign(new Error("refusing to connect to a private address"), { code: "EPRIVATE" }), "");
      if (options.all) return cb(null, addrs);
      return cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

const stripBrackets = (h: string) => h.replace(/^\[|\]$/g, "");

/** Pre-check for a friendly 400: scheme, literal IPs, and every DNS answer. */
export async function assertPublicUrl(u: URL, policy: AddressPolicy = isPublicAddress): Promise<void> {
  if (!/^https?:$/.test(u.protocol)) throw new Error("only http and https are allowed");
  const host = stripBrackets(u.hostname);
  if (net.isIP(host)) {
    if (!policy(host)) throw new Error("refusing to fetch a private address");
    return;
  }
  const addrs = await dns.promises.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => !policy(a.address))) throw new Error("refusing to fetch a private address");
}

export interface SafeGetOptions {
  policy?: AddressPolicy;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
}

export interface SafeGetResult {
  status: number;
  body: string;
  finalUrl: string;
  contentType: string;
}

export function safeGet(url: string, o: SafeGetOptions = {}): Promise<SafeGetResult> {
  const policy = o.policy ?? isPublicAddress;
  const maxRedirects = o.maxRedirects ?? 5;
  const maxBytes = o.maxBytes ?? 4_000_000;
  const lookup = safeLookup(policy);

  return new Promise((resolve, reject) => {
    let active: http.ClientRequest | null = null;
    let settled = false;
    const finish = (err: Error | null, res?: SafeGetResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active?.destroy();
      if (err) reject(err);
      else resolve(res!);
    };
    const timer = setTimeout(() => finish(new Error("timed out")), o.timeoutMs ?? 12_000);

    const hop = (current: string, left: number) => {
      let u: URL;
      try {
        u = new URL(current);
      } catch {
        return finish(new Error("bad redirect address"));
      }
      if (!/^https?:$/.test(u.protocol)) return finish(new Error("only http and https are allowed"));
      const host = stripBrackets(u.hostname);
      if (net.isIP(host) && !policy(host)) return finish(new Error("refusing to connect to a private address"));
      const mod = u.protocol === "https:" ? https : http;
      const req = mod.request(u, { method: "GET", headers: o.headers, lookup: lookup as never }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (left <= 0) return finish(new Error("too many redirects"));
          return hop(new URL(res.headers.location, u).href, left - 1);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) return finish(new Error("response is too large"));
          chunks.push(c);
        });
        res.on("end", () => finish(null, { status, body: Buffer.concat(chunks).toString("utf8"), finalUrl: u.href, contentType: String(res.headers["content-type"] ?? "") }));
        res.on("error", (e) => finish(e));
      });
      active = req;
      req.on("error", (e) => finish(e));
      req.end();
    };
    hop(url, maxRedirects);
  });
}
