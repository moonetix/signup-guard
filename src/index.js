// signup-guard: explainable sign-up risk checks. Email normalization, disposable domains,
// datacenter and Tor IP ranges, velocity limits and a score made of named reasons.

import { defaultData } from './data.js';

export { SignupGuardError } from './errors.js';
export { PROVIDERS, EMAIL_PROBLEMS, normalizeEmail } from './email.js';
export { parseIp, formatIp, normalizeIp, parseCidr, ipNetwork, specialRange, SPECIAL_RANGES } from './ip.js';
export { IP_CATEGORIES, GuardData, createData, loadData, defaultData, lookupIp, checkDisposable } from './data.js';
export { DEFAULT_VELOCITY_RULES, MemoryStore, VelocityLimiter } from './velocity.js';
export { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, assessSignup } from './assess.js';

/** Snapshot dates, upstream commits and counts of the bundled data. */
export function dataInfo() {
  const d = defaultData();
  return { ...d.info, counts: { ...d.counts } };
}
