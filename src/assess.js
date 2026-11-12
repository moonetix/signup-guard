import { fail } from './errors.js';
import { normalizeEmail, EMAIL_PROBLEMS } from './email.js';
import { checkDisposable, lookupIp, resolveData } from './data.js';

/** Points per reason. A weight of 0 keeps the reason in the output as information only. */
export const DEFAULT_WEIGHTS = Object.freeze({
  email_invalid: 100,
  email_disposable: 70,
  email_normalized: 0,
  ip_invalid: 0,
  ip_not_public: 0,
  ip_datacenter: 40,
  ip_tor: 40,
  ip_cdn: 15,
  ip_privacy_relay: 0,
  velocity_ip: 30,
  velocity_network: 30,
  velocity_email: 40,
  velocity_other: 30,
});

export const DEFAULT_THRESHOLDS = Object.freeze({ review: 30, block: 70 });

const HINTS = {
  email_invalid: 'Check the email address for typos.',
  email_disposable: 'Please use a permanent email address.',
  ip_datacenter: 'Turn off your VPN or proxy, or switch to your home or mobile connection, and try again.',
  ip_tor: 'Please sign up without Tor.',
  ip_cdn: 'If you use a VPN or a privacy service, turn it off and try again.',
  velocity: 'Too many attempts. Please try again later.',
};

const IP_REASONS = [
  ['ip_datacenter', ['cloud', 'services'], 'a datacenter range', ''],
  ['ip_tor', ['tor'], 'the Tor exit list', ''],
  ['ip_cdn', ['cdn'], 'a CDN range', ' People rarely browse from CDN edge addresses, but some privacy and VPN products route them through CDN networks.'],
  ['ip_privacy_relay', ['privacy-relay'], 'a privacy relay range', ' Real users share these addresses; this alone says nothing about fraud.'],
];

const KEY_LABELS = { ip: 'IP address', network: 'network', email: 'email address' };
const CHANGE_LABELS = {
  'trailing-dot-removed': 'trailing dot removed',
  lowercased: 'lowercased',
  'subdomain-tag-removed': 'subdomain tag removed',
  'domain-alias': 'domain alias replaced',
  'tag-removed': 'plus tag removed',
  'dots-removed': 'dots removed',
};
const SIGNIFICANT_CHANGES = ['subdomain-tag-removed', 'domain-alias', 'tag-removed', 'dots-removed'];
const WEIGHT_KEY_RE = /^velocity_[A-Za-z0-9_-]{1,40}$/;

function duration(seconds) {
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (seconds % 3600 === 0) return unit(seconds / 3600, 'hour');
  if (seconds % 60 === 0) return unit(seconds / 60, 'minute');
  return unit(seconds, 'second');
}

function resolveWeights(overrides) {
  if (overrides === undefined || overrides === null) return { ...DEFAULT_WEIGHTS };
  if (typeof overrides !== 'object' || Array.isArray(overrides)) fail('invalid_option', 'weights must be an object');
  const out = { ...DEFAULT_WEIGHTS };
  for (const [code, points] of Object.entries(overrides)) {
    if (!(code in DEFAULT_WEIGHTS) && !WEIGHT_KEY_RE.test(code)) fail('invalid_option', `Unknown reason code "${code}"`);
    if (!Number.isSafeInteger(points) || points < 0 || points > 1000) fail('invalid_option', `weights.${code} must be an integer from 0 to 1000`);
    out[code] = points;
  }
  return out;
}

function resolveThresholds(t) {
  const out = { ...DEFAULT_THRESHOLDS, ...(t ?? {}) };
  if (typeof out.review !== 'number' || typeof out.block !== 'number') fail('invalid_option', 'thresholds.review and thresholds.block must be integers');
  if (!Number.isSafeInteger(out.review) || !Number.isSafeInteger(out.block) || out.review < 1 || out.block < out.review) {
    fail('invalid_option', 'thresholds must be integers with 1 <= review <= block');
  }
  return { review: out.review, block: out.block };
}

/**
 * Score a sign-up attempt. Every point in `score` comes from one entry in `reasons`.
 * @param {{ email?: string | null, ip?: string | null, velocity?: object | null }} input
 * @param {object} [options]
 */
export function assessSignup(input, options = {}) {
  if (!input || typeof input !== 'object') fail('invalid_argument', 'input must be an object');
  if (!options || typeof options !== 'object') fail('invalid_option', 'options must be an object');
  const weights = resolveWeights(options.weights);
  const thresholds = resolveThresholds(options.thresholds);
  const data = resolveData(options.data);
  const reasons = [];
  const add = (code, message, hint, weightKey = code) => {
    reasons.push({ code, points: weights[weightKey] ?? weights.velocity_other, message, hint: hint ?? null });
  };

  let email = null;
  let disposable = null;
  if (input.email !== undefined && input.email !== null) {
    email = normalizeEmail(input.email, { lowercaseLocal: options.lowercaseLocal, plusTagDomains: options.plusTagDomains });
    if (!email.valid) {
      add('email_invalid', `Email address is not valid: ${EMAIL_PROBLEMS[email.problem]}.`, HINTS.email_invalid);
    } else {
      disposable = checkDisposable(email.domain, { data, allowDomains: options.allowDomains, blockDomains: options.blockDomains });
      if (disposable.disposable) {
        const where = disposable.source === 'list' ? 'the disposable domain list' : 'your block list';
        add('email_disposable', `${email.domain} is on ${where} (matched ${disposable.matchedDomain}).`, HINTS.email_disposable);
      }
      const significant = email.changes.filter((c) => SIGNIFICANT_CHANGES.includes(c));
      if (significant.length > 0) {
        add('email_normalized', `Normalized to ${email.normalized} (${email.changes.map((c) => CHANGE_LABELS[c]).join(', ')}). Check duplicates against this form.`, null);
      }
    }
  }

  let ip = null;
  if (input.ip !== undefined && input.ip !== null) {
    if (typeof input.ip !== 'string') fail('invalid_argument', 'ip must be a string');
    ip = lookupIp(input.ip, { data });
    if (!ip.valid) {
      add('ip_invalid', `"${input.ip}" is not a valid IP address.`, null);
    } else if (!ip.public) {
      add('ip_not_public', `${ip.ip} is ${ip.special.description} (${ip.special.cidr}), not a public address. If real users show up with it, your server is reading the address of a proxy or load balancer.`, null);
    } else {
      for (const [code, categories, label, extra] of IP_REASONS) {
        const hits = ip.matches.filter((m) => categories.includes(m.category));
        if (hits.length === 0) continue;
        const list = hits.map((m) => `${m.providerName} (${m.category}, ${m.cidr})`).join('; ');
        add(code, `${ip.ip} is in ${label}: ${list}.${extra}`, HINTS[code]);
      }
    }
  }

  if (input.velocity !== undefined && input.velocity !== null) {
    const v = input.velocity;
    if (typeof v !== 'object' || !Array.isArray(v.results)) fail('invalid_argument', 'velocity must be the result of VelocityLimiter.check()');
    const byKey = new Map();
    for (const r of v.results) {
      if (!r.exceeded) continue;
      if (!byKey.has(r.key)) byKey.set(r.key, []);
      byKey.get(r.key).push(r);
    }
    for (const [key, rules] of byKey) {
      const code = `velocity_${key}`;
      const weightKey = code in weights ? code : 'velocity_other';
      const detail = rules.map((r) => `${r.rule}: ${r.count} of ${r.limit} in ${duration(r.windowSeconds)}`).join('; ');
      add(code, `Too many attempts for this ${KEY_LABELS[key] ?? key} (${detail}).`, HINTS.velocity, weightKey);
    }
  }

  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  const decision = score >= thresholds.block ? 'block' : score >= thresholds.review ? 'review' : 'allow';
  return { score, decision, reasons, email, disposable, ip };
}
