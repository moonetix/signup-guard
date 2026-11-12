import { fail } from './errors.js';

/**
 * Provider rules. A rule is applied only when the provider documents it; the rest are listed
 * so the gap is visible. Checked 2026-11-11.
 */
export const PROVIDERS = Object.freeze([
  {
    id: 'gmail',
    name: 'Gmail',
    domains: ['gmail.com', 'googlemail.com'],
    canonicalDomain: 'gmail.com',
    plusTags: true,
    ignoreDots: true,
    subdomainTags: false,
    sources: [
      'https://support.google.com/mail/answer/7436150',
      'https://support.google.com/mail/answer/12096',
      'https://support.google.com/mail/answer/10313',
    ],
    note: 'Dots do not matter and +tags reach the same inbox. googlemail.com delivers to the same account. Google Workspace domains are not covered: dots matter there.',
  },
  {
    id: 'proton',
    name: 'Proton Mail',
    domains: ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'],
    canonicalDomain: null,
    plusTags: true,
    ignoreDots: false,
    subdomainTags: false,
    sources: ['https://proton.me/support/addresses-and-aliases'],
    note: 'Plus aliases arrive in the regular inbox. The four domains are not merged: Proton does not document that one name owns all of them.',
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm'],
    canonicalDomain: null,
    plusTags: true,
    ignoreDots: false,
    subdomainTags: true,
    sources: ['https://www.fastmail.help/hc/en-us/articles/360060591053'],
    note: 'Plus addressing and subdomain addressing (anything@user.fastmail.com) work by default. Only these two of the many Fastmail domains are covered.',
  },
  {
    id: 'yandex',
    name: 'Yandex Mail',
    domains: ['yandex.com', 'yandex.ru'],
    canonicalDomain: null,
    plusTags: true,
    ignoreDots: false,
    subdomainTags: false,
    sources: ['https://yandex.com/support/mail/reg.html', 'https://yandex.ru/support/mail/reg.html'],
    note: 'Yandex suggests adding + and a word to the login when registering on websites. Other Yandex domain aliases are not listed by Yandex, so they are not covered.',
  },
  {
    id: 'outlook',
    name: 'Outlook.com',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    canonicalDomain: null,
    plusTags: false,
    ignoreDots: false,
    subdomainTags: false,
    sources: ['https://learn.microsoft.com/en-us/exchange/recipients-in-exchange-online/plus-addressing-in-exchange-online'],
    note: 'Not applied. Microsoft documents plus addressing for Exchange Online organizations, not for consumer Outlook.com. Opt in with plusTagDomains if you accept that.',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    canonicalDomain: null,
    plusTags: false,
    ignoreDots: false,
    subdomainTags: false,
    sources: ['https://support.apple.com/en-us/118230'],
    note: 'Not applied. Apple documents neither plus addressing nor that name@me.com and name@icloud.com always belong to the same account.',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
    canonicalDomain: null,
    plusTags: false,
    ignoreDots: false,
    subdomainTags: false,
    sources: ['https://help.yahoo.com/kb/SLN28815.html'],
    note: 'Not applied. Yahoo disposable addresses are basename-keyword, but the basename is chosen separately from the account name, so removing the keyword does not recover the real address.',
  },
].map((p) => Object.freeze({ ...p, domains: Object.freeze(p.domains), sources: Object.freeze(p.sources) })));

const BY_DOMAIN = new Map();
for (const p of PROVIDERS) for (const d of p.domains) BY_DOMAIN.set(d, p);

const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const OUTER_SPACE_RE = /^[ \t\r\n]+|[ \t\r\n]+$/g;

export const EMAIL_PROBLEMS = Object.freeze({
  empty: 'the address is empty',
  'non-ascii': 'the address contains characters outside ASCII',
  'missing-at': 'there is no @ sign',
  'multiple-at': 'there is more than one @ sign',
  'too-long': 'the address is longer than 254 characters',
  'local-too-long': 'the part before @ is longer than 64 characters',
  'local-invalid': 'the part before @ contains characters or dots that are not allowed',
  'domain-literal': 'IP address literals are not accepted as a domain',
  'domain-invalid': 'the domain is not a valid host name',
});

function invalid(address, problem) {
  return { valid: false, problem, address, normalized: null, local: null, domain: null, provider: null, changes: [] };
}

function checkDomain(domain) {
  if (domain.startsWith('[')) return 'domain-literal';
  if (domain.length === 0 || domain.length > 253) return 'domain-invalid';
  const labels = domain.split('.');
  if (labels.length < 2) return 'domain-invalid';
  for (const l of labels) if (!LABEL_RE.test(l)) return 'domain-invalid';
  if (/^\d+$/.test(labels[labels.length - 1])) return 'domain-invalid';
  return null;
}

function stringList(value, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) fail('invalid_option', `${name} must be an array of strings`);
  return value.map((v) => v.replace(/[A-Z]+/g, (m) => m.toLowerCase()));
}

/**
 * Validate and normalize an email address for duplicate detection.
 * Store `normalized` with a unique index; keep sending mail to `address`.
 * @param {string} email
 * @param {{ lowercaseLocal?: boolean, plusTagDomains?: string[] }} [options]
 */
export function normalizeEmail(email, options = {}) {
  if (typeof email !== 'string') fail('invalid_argument', 'email must be a string');
  const lowercaseLocal = options.lowercaseLocal ?? true;
  if (typeof lowercaseLocal !== 'boolean') fail('invalid_option', 'lowercaseLocal must be a boolean');
  const plusTagDomains = stringList(options.plusTagDomains, 'plusTagDomains');

  const address = email.replace(OUTER_SPACE_RE, '');
  if (address === '') return invalid(address, 'empty');
  if (/[^\x21-\x7e]/.test(address)) return invalid(address, 'non-ascii');
  if (address.length > 254) return invalid(address, 'too-long');
  const at = address.indexOf('@');
  if (at === -1) return invalid(address, 'missing-at');
  if (address.indexOf('@', at + 1) !== -1) return invalid(address, 'multiple-at');

  let local = address.slice(0, at);
  let domain = address.slice(at + 1);
  const changes = [];

  if (local.length === 0 || !LOCAL_RE.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return invalid(address, 'local-invalid');
  }
  if (local.length > 64) return invalid(address, 'local-too-long');

  if (domain.endsWith('.') && !domain.endsWith('..')) {
    domain = domain.slice(0, -1);
    changes.push('trailing-dot-removed');
  }
  const lowerDomain = domain.toLowerCase();
  const domainProblem = checkDomain(lowerDomain);
  if (domainProblem) return invalid(address, domainProblem);
  let lowered = lowerDomain !== domain;
  domain = lowerDomain;
  if (lowercaseLocal && local.toLowerCase() !== local) {
    local = local.toLowerCase();
    lowered = true;
  }
  if (lowered) changes.push('lowercased');

  let provider = BY_DOMAIN.get(domain) ?? null;

  if (provider === null) {
    const dot = domain.indexOf('.');
    const parent = domain.slice(dot + 1);
    const parentProvider = BY_DOMAIN.get(parent);
    if (parentProvider && parentProvider.subdomainTags && parent.includes('.')) {
      local = domain.slice(0, dot);
      domain = parent;
      provider = parentProvider;
      changes.push('subdomain-tag-removed');
    }
  }

  if (provider && provider.canonicalDomain && provider.canonicalDomain !== domain) {
    domain = provider.canonicalDomain;
    changes.push('domain-alias');
  }

  const plus = local.indexOf('+');
  if (plus > 0 && ((provider && provider.plusTags) || plusTagDomains.includes(domain))) {
    local = local.slice(0, plus);
    changes.push('tag-removed');
  }

  if (provider && provider.ignoreDots && local.includes('.')) {
    const undotted = local.replace(/\./g, '');
    if (undotted !== '') {
      local = undotted;
      changes.push('dots-removed');
    }
  }

  return { valid: true, problem: null, address, normalized: `${local}@${domain}`, local, domain, provider: provider ? provider.id : null, changes };
}
