import { fail } from './errors.js';
import { normalizeEmail } from './email.js';
import { ipNetwork, normalizeIp } from './ip.js';

/** Starting limits. Tune them from your own logs; they count attempts, not successful sign-ups. */
export const DEFAULT_VELOCITY_RULES = Object.freeze([
  Object.freeze({ name: 'ip-hour', key: 'ip', limit: 5, windowSeconds: 3600 }),
  Object.freeze({ name: 'ip-day', key: 'ip', limit: 20, windowSeconds: 86400 }),
  Object.freeze({ name: 'network-day', key: 'network', limit: 50, windowSeconds: 86400 }),
  Object.freeze({ name: 'email-day', key: 'email', limit: 5, windowSeconds: 86400 }),
]);

const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_WINDOW = 366 * 86400;

/** Fixed-window counters in process memory. Fine for one process and for tests; use a shared store in production. */
export class MemoryStore {
  constructor() {
    this.counters = new Map();
    this.hits = 0;
  }

  hit(key, ttlSeconds, now) {
    if (++this.hits % 1000 === 0) this.prune(now);
    const entry = this.counters.get(key);
    if (entry === undefined || now >= entry.expiresAt) {
      this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  prune(now) {
    for (const [key, entry] of this.counters) if (now >= entry.expiresAt) this.counters.delete(key);
  }

  size() {
    return this.counters.size;
  }
}

function checkRule(rule, i) {
  if (!rule || typeof rule !== 'object') fail('invalid_rule', `rule ${i} must be an object`);
  const { name, key, limit, windowSeconds } = rule;
  if (typeof name !== 'string' || !NAME_RE.test(name)) fail('invalid_rule', `rule ${i}: name must be 1 to 40 letters, digits, "-" or "_"`);
  if (typeof key !== 'string' || !NAME_RE.test(key) || key === 'now') fail('invalid_rule', `rule ${name}: key must be "ip", "network", "email" or your own field name`);
  if (!Number.isSafeInteger(limit) || limit < 1) fail('invalid_rule', `rule ${name}: limit must be a positive integer`);
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > MAX_WINDOW) {
    fail('invalid_rule', `rule ${name}: windowSeconds must be an integer from 1 to ${MAX_WINDOW}`);
  }
  return { name, key, limit, windowSeconds };
}

/** Counts attempts per IP, network, normalized email or any field you pass, in fixed windows. */
export class VelocityLimiter {
  /**
   * @param {{ store?: { hit(key: string, ttlSeconds: number, now: number): number | Promise<number> }, rules?: object[], keyPrefix?: string }} [options]
   */
  constructor(options = {}) {
    this.store = options.store ?? new MemoryStore();
    if (typeof this.store.hit !== 'function') fail('invalid_option', 'store must have a hit(key, ttlSeconds, now) method');
    const rules = options.rules ?? DEFAULT_VELOCITY_RULES;
    if (!Array.isArray(rules) || rules.length === 0) fail('invalid_rule', 'rules must be a non-empty array');
    this.rules = rules.map(checkRule);
    const names = new Set(this.rules.map((r) => r.name));
    if (names.size !== this.rules.length) fail('invalid_rule', 'rule names must be unique');
    this.keyPrefix = options.keyPrefix ?? 'sg:';
    if (typeof this.keyPrefix !== 'string') fail('invalid_option', 'keyPrefix must be a string');
  }

  /**
   * Record one attempt and report every rule's count. Rules whose value is missing or invalid are skipped.
   * @param {{ now: number, ip?: string, email?: string, [field: string]: unknown }} input
   */
  async check(input) {
    if (!input || typeof input !== 'object') fail('invalid_argument', 'input must be an object');
    const { now } = input;
    if (!Number.isSafeInteger(now) || now < 0) fail('invalid_argument', 'now must be a non-negative integer (Unix seconds)');
    const values = {};
    const value = (key) => {
      if (key in values) return values[key];
      let v = null;
      if (key === 'ip') v = typeof input.ip === 'string' ? normalizeIp(input.ip) : null;
      else if (key === 'network') v = typeof input.ip === 'string' ? ipNetwork(input.ip) : null;
      else if (key === 'email') {
        const e = typeof input.email === 'string' ? normalizeEmail(input.email) : null;
        v = e && e.valid ? e.normalized : null;
      } else v = typeof input[key] === 'string' && input[key] !== '' ? input[key] : null;
      values[key] = v;
      return v;
    };
    const results = [];
    const exceeded = [];
    for (const rule of this.rules) {
      const v = value(rule.key);
      if (v === null) continue;
      const windowStart = now - (now % rule.windowSeconds);
      const resetAt = windowStart + rule.windowSeconds;
      const count = await this.store.hit(`${this.keyPrefix}${rule.name}:${windowStart}:${v}`, resetAt - now, now);
      if (!Number.isSafeInteger(count) || count < 1) fail('invalid_option', 'store.hit must return the new count as a positive integer');
      const over = count > rule.limit;
      if (over) exceeded.push(rule.name);
      results.push({ rule: rule.name, key: rule.key, value: v, count, limit: rule.limit, windowSeconds: rule.windowSeconds, resetAt, exceeded: over });
    }
    return { limited: exceeded.length > 0, exceeded, results };
  }
}
