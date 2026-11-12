import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { fail } from './errors.js';
import { parseCidr, parseIp, formatIp, specialRange } from './ip.js';

export const IP_CATEGORIES = Object.freeze(['cloud', 'services', 'cdn', 'tor', 'privacy-relay']);
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SPACE_RE = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const asciiLower = (s) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
const DEFAULT_DIR = fileURLToPath(new URL('../data/', import.meta.url));

function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

class RangeTable {
  constructor(entries) {
    entries.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end > b.end ? -1 : a.end < b.end ? 1 : 0));
    this.entries = entries;
    this.maxEnd = [];
    let max = -1n;
    for (const e of entries) {
      if (e.end > max) max = e.end;
      this.maxEnd.push(max);
    }
  }

  find(value) {
    const { entries, maxEnd } = this;
    let lo = 0;
    let hi = entries.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (entries[mid].start <= value) {
        last = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const out = [];
    // Ranges from different providers can nest (GitHub inside AWS), so walk back while an earlier range could still cover the address.
    for (let j = last; j >= 0 && maxEnd[j] >= value; j--) {
      if (entries[j].end >= value) out.push(entries[j]);
    }
    return out;
  }
}

/** Data set used by the checks: disposable domains and IP ranges with provider and category. */
export class GuardData {
  constructor({ disposableDomains = [], ipRanges = [], info = null } = {}) {
    if (!Array.isArray(disposableDomains) || !Array.isArray(ipRanges)) fail('data_error', 'disposableDomains and ipRanges must be arrays');
    this.disposable = new Set();
    for (const raw of disposableDomains) {
      if (typeof raw !== 'string') fail('data_error', 'disposable domains must be strings');
      const d = asciiLower(raw.replace(SPACE_RE, ''));
      if (d === '' || d.startsWith('#')) continue;
      if (!DOMAIN_RE.test(d)) fail('data_error', `Not a domain: "${raw}"`);
      this.disposable.add(d);
    }
    const v4 = [];
    const v6 = [];
    const seen = new Set();
    for (const r of ipRanges) {
      if (!r || typeof r.cidr !== 'string' || typeof r.provider !== 'string' || typeof r.category !== 'string') {
        fail('data_error', 'each IP range needs cidr, provider and category strings');
      }
      if (!IP_CATEGORIES.includes(r.category)) fail('data_error', `Unknown IP category "${r.category}"`);
      const c = parseCidr(r.cidr);
      const key = `${r.provider} ${c.cidr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = { start: c.start, end: c.end, prefix: c.prefix, cidr: c.cidr, provider: r.provider, providerName: r.providerName ?? r.provider, category: r.category };
      (c.version === 4 ? v4 : v6).push(entry);
    }
    this.v4 = new RangeTable(v4);
    this.v6 = new RangeTable(v6);
    this.info = info;
    this.counts = { disposableDomains: this.disposable.size, ipv4Ranges: v4.length, ipv6Ranges: v6.length };
  }

  /** Listed domain that matches the domain or one of its parents (never the bare TLD). */
  disposableMatch(domain) {
    const labels = domain.split('.');
    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join('.');
      if (this.disposable.has(candidate)) return candidate;
    }
    return null;
  }

  lookup(ip) {
    const table = ip.version === 4 ? this.v4 : this.v6;
    return table
      .find(ip.value)
      .sort((a, b) => b.prefix - a.prefix || compareStrings(a.provider, b.provider) || compareStrings(a.cidr, b.cidr))
      .map((e) => ({ cidr: e.cidr, provider: e.provider, providerName: e.providerName, category: e.category }));
  }
}

/** Build a data set from arrays, for tests or for lists you keep elsewhere. */
export function createData(input) {
  return new GuardData(input);
}

/** Load the snapshot in `dir` (default: the data/ folder shipped with this package). */
export function loadData(dir = DEFAULT_DIR) {
  const read = (p) => readFileSync(join(dir, p), 'utf8');
  const lines = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  const providers = JSON.parse(read('ip/providers.json'));
  const ipRanges = [];
  for (const p of providers) {
    for (const cidr of lines(read(`ip/${p.id}.txt`))) ipRanges.push({ cidr, provider: p.id, providerName: p.name, category: p.category });
  }
  const info = JSON.parse(read('manifest.json'));
  return new GuardData({ disposableDomains: lines(read('disposable/domains.txt')), ipRanges, info });
}

let bundled = null;

/** The bundled snapshot, loaded on first use and cached. */
export function defaultData() {
  if (bundled === null) bundled = loadData();
  return bundled;
}

export function resolveData(data) {
  if (data === undefined || data === null) return defaultData();
  if (!(data instanceof GuardData)) fail('invalid_option', 'data must come from createData() or loadData()');
  return data;
}

/**
 * Look up an IP address: is it public, and which listed ranges contain it.
 * @param {string} ip
 * @param {{ data?: GuardData }} [options]
 */
export function lookupIp(ip, options = {}) {
  const data = resolveData(options.data);
  const parsed = parseIp(ip);
  if (parsed === null) {
    return { valid: false, ip: typeof ip === 'string' ? ip : null, version: null, public: false, special: null, matches: [], categories: [] };
  }
  const special = specialRange(parsed);
  const matches = special ? [] : data.lookup(parsed);
  const categories = [];
  for (const m of matches) if (!categories.includes(m.category)) categories.push(m.category);
  categories.sort((a, b) => IP_CATEGORIES.indexOf(a) - IP_CATEGORIES.indexOf(b));
  return { valid: true, ip: formatIp(parsed), version: parsed.version, public: special === null, special, matches, categories };
}

/**
 * Is the domain of this email (or this domain) on the disposable list?
 * @param {string} emailOrDomain
 * @param {{ data?: GuardData, allowDomains?: string[], blockDomains?: string[] }} [options]
 */
export function checkDisposable(emailOrDomain, options = {}) {
  const data = resolveData(options.data);
  const allow = listOption(options.allowDomains, 'allowDomains');
  const block = listOption(options.blockDomains, 'blockDomains');
  const domain = domainOf(emailOrDomain);
  const parents = [];
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i++) parents.push(labels.slice(i).join('.'));
  const allowed = parents.find((d) => allow.includes(d)) ?? null;
  if (allowed !== null) return { domain, disposable: false, matchedDomain: null, source: null, allowedBy: allowed };
  const custom = parents.find((d) => block.includes(d)) ?? null;
  if (custom !== null) return { domain, disposable: true, matchedDomain: custom, source: 'blockDomains', allowedBy: null };
  const listed = data.disposableMatch(domain);
  return { domain, disposable: listed !== null, matchedDomain: listed, source: listed === null ? null : 'list', allowedBy: null };
}

function listOption(value, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) fail('invalid_option', `${name} must be an array of strings`);
  return value.map((v) => asciiLower(v.replace(SPACE_RE, '')));
}

function domainOf(emailOrDomain) {
  if (typeof emailOrDomain !== 'string') fail('invalid_argument', 'email or domain must be a string');
  const s = emailOrDomain.replace(SPACE_RE, '');
  const at = s.lastIndexOf('@');
  let d = asciiLower(at === -1 ? s : s.slice(at + 1));
  if (d.endsWith('.')) d = d.slice(0, -1);
  return d;
}
