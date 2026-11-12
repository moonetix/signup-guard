import { fail } from './errors.js';

const V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROUP_RE = /^[0-9a-fA-F]{1,4}$/;
const MAX = { 4: (1n << 32n) - 1n, 6: (1n << 128n) - 1n };

function parseV4(text) {
  const m = V4_RE.exec(text);
  if (!m) return null;
  let value = 0n;
  for (let i = 1; i <= 4; i++) {
    const part = m[i];
    // "010" could mean octal to some parsers; refusing it keeps both ports and every proxy in agreement.
    if (part.length > 1 && part[0] === '0') return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseV6(text) {
  if (text.length > 45 || text.includes('%')) return null;
  let body = text;
  const tailGroups = [];
  const lastColon = body.lastIndexOf(':');
  if (lastColon === -1) return null;
  if (body.includes('.')) {
    const v4 = parseV4(body.slice(lastColon + 1));
    if (v4 === null) return null;
    tailGroups.push(Number(v4 >> 16n), Number(v4 & 0xffffn));
    body = body.slice(0, lastColon + 1);
    // "::1.2.3.4" leaves "::", "a::1.2.3.4" leaves "a::"; a single trailing colon needs a group before it.
    if (body.endsWith(':') && !body.endsWith('::')) body = body.slice(0, -1);
  }
  const halves = body.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s) => {
    if (s === '') return [];
    const parts = s.split(':');
    const out = [];
    for (const p of parts) {
      if (!HEX_GROUP_RE.test(p)) return null;
      out.push(parseInt(p, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]);
  if (head === null) return null;
  let groups;
  if (halves.length === 2) {
    const tail = toGroups(halves[1]);
    if (tail === null) return null;
    const all = tail.concat(tailGroups);
    const missing = 8 - head.length - all.length;
    if (missing < 1) return null;
    groups = head.concat(new Array(missing).fill(0), all);
  } else {
    groups = head.concat(tailGroups);
    if (groups.length !== 8) return null;
  }
  let value = 0n;
  for (const g of groups) value = (value << 16n) | BigInt(g);
  return value;
}

/**
 * Parse an IPv4 or IPv6 address. IPv4-mapped IPv6 (::ffff:a.b.c.d) is returned as IPv4,
 * because dual-stack servers report IPv4 clients that way.
 * @returns {{ version: 4 | 6, value: bigint } | null}
 */
export function parseIp(text) {
  if (typeof text !== 'string') return null;
  if (text.includes(':')) {
    const value = parseV6(text);
    if (value === null) return null;
    if (value >> 32n === 0xffffn) {
      return { version: 4, value: value & 0xffffffffn };
    }
    return { version: 6, value };
  }
  const value = parseV4(text);
  return value === null ? null : { version: 4, value };
}

/** RFC 5952 text for IPv6, dotted quad for IPv4. */
export function formatIp(ip) {
  if (ip.version === 4) {
    const v = ip.value;
    return [24n, 16n, 8n, 0n].map((s) => String((v >> s) & 0xffn)).join('.');
  }
  const groups = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((ip.value >> BigInt(i * 16)) & 0xffffn));
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(':');
  return hex.slice(0, bestStart).join(':') + '::' + hex.slice(bestStart + bestLen).join(':');
}

/** Canonical text of an address, or null when it is not a valid IPv4 or IPv6 address. */
export function normalizeIp(text) {
  const ip = parseIp(text);
  return ip === null ? null : formatIp(ip);
}

function hostMask(version, prefix) {
  const bits = version === 4 ? 32n : 128n;
  return (1n << (bits - BigInt(prefix))) - 1n;
}

/**
 * Parse a CIDR block. Host bits are cleared, so "10.1.2.3/8" becomes 10.0.0.0/8.
 * @returns {{ version: 4 | 6, prefix: number, start: bigint, end: bigint, cidr: string }}
 */
export function parseCidr(text) {
  if (typeof text !== 'string') fail('invalid_cidr', 'CIDR must be a string');
  const slash = text.indexOf('/');
  const ip = slash === -1 ? parseIp(text) : parseIp(text.slice(0, slash));
  const fromV6Text = text.slice(0, slash === -1 ? text.length : slash).includes(':');
  if (ip === null || (fromV6Text && ip.version === 4)) fail('invalid_cidr', `Not a valid CIDR block: "${text}"`);
  const maxPrefix = ip.version === 4 ? 32 : 128;
  let prefix = maxPrefix;
  if (slash !== -1) {
    const p = text.slice(slash + 1);
    if (!/^\d{1,3}$/.test(p) || Number(p) > maxPrefix || (p.length > 1 && p[0] === '0')) {
      fail('invalid_cidr', `Not a valid CIDR block: "${text}"`);
    }
    prefix = Number(p);
  }
  const mask = hostMask(ip.version, prefix);
  const start = ip.value & (MAX[ip.version] ^ mask);
  return { version: ip.version, prefix, start, end: start | mask, cidr: `${formatIp({ version: ip.version, value: start })}/${prefix}` };
}

/** The network a velocity rule groups by: the /24 for IPv4, the /64 for IPv6. Null for invalid input. */
export function ipNetwork(text) {
  const ip = parseIp(text);
  if (ip === null) return null;
  const prefix = ip.version === 4 ? 24 : 64;
  const mask = hostMask(ip.version, prefix);
  return `${formatIp({ version: ip.version, value: ip.value & (MAX[ip.version] ^ mask) })}/${prefix}`;
}

const SPECIAL = [
  ['0.0.0.0/8', 'reserved', 'a reserved "this network" address'],
  ['10.0.0.0/8', 'private', 'a private network address'],
  ['100.64.0.0/10', 'cgnat', 'a carrier-grade NAT address'],
  ['127.0.0.0/8', 'loopback', 'a loopback address'],
  ['169.254.0.0/16', 'link-local', 'a link-local address'],
  ['172.16.0.0/12', 'private', 'a private network address'],
  ['192.0.0.0/24', 'reserved', 'an IETF protocol assignment'],
  ['192.0.2.0/24', 'documentation', 'a documentation address'],
  ['192.168.0.0/16', 'private', 'a private network address'],
  ['198.18.0.0/15', 'benchmarking', 'a benchmarking address'],
  ['198.51.100.0/24', 'documentation', 'a documentation address'],
  ['203.0.113.0/24', 'documentation', 'a documentation address'],
  ['224.0.0.0/4', 'multicast', 'a multicast address'],
  ['240.0.0.0/4', 'reserved', 'a reserved address'],
  ['::/128', 'unspecified', 'the unspecified address'],
  ['::1/128', 'loopback', 'a loopback address'],
  ['2001:db8::/32', 'documentation', 'a documentation address'],
  ['fc00::/7', 'unique-local', 'a unique local (private) address'],
  ['fe80::/10', 'link-local', 'a link-local address'],
  ['ff00::/8', 'multicast', 'a multicast address'],
].map(([cidr, kind, description]) => ({ ...parseCidr(cidr), kind, description }));

/** Non-public ranges: private, CGNAT, loopback, link-local, documentation and similar. */
export const SPECIAL_RANGES = Object.freeze(SPECIAL.map(({ cidr, kind, description }) => Object.freeze({ cidr, kind, description })));

/** @returns {{ cidr: string, kind: string, description: string } | null} */
export function specialRange(ip) {
  for (const r of SPECIAL) {
    if (r.version === ip.version && ip.value >= r.start && ip.value <= r.end) {
      return { cidr: r.cidr, kind: r.kind, description: r.description };
    }
  }
  return null;
}
