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

export function stringList(value, name) {
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

const freeze = (list) => Object.freeze([...list]);

/**
 * Free consumer mailbox services: anyone can open a personal address there at no cost, without
 * owning a domain. Mailboxes that come with an internet or phone subscription are left out.
 */
export const FREE_MAIL_PROVIDERS = Object.freeze([
  { id: 'gmail', name: 'Gmail', domains: ['gmail.com', 'googlemail.com'] },
  {
    id: 'outlook',
    name: 'Outlook.com',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es', 'live.co.uk', 'live.fr', 'outlook.fr', 'outlook.de'],
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'yahoo.es', 'yahoo.ca', 'yahoo.co.in', 'yahoo.com.br'],
  },
  { id: 'icloud', name: 'iCloud Mail', domains: ['icloud.com', 'me.com', 'mac.com'] },
  { id: 'aol', name: 'AOL Mail', domains: ['aol.com'] },
  { id: 'proton', name: 'Proton Mail', domains: ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'] },
  { id: 'tuta', name: 'Tuta', domains: ['tuta.com', 'tutanota.com', 'tutanota.de', 'tutamail.com', 'tuta.io'] },
  { id: 'zoho', name: 'Zoho Mail', domains: ['zohomail.com', 'zoho.com'] },
  { id: 'gmx', name: 'GMX', domains: ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch'] },
  { id: 'mailcom', name: 'mail.com', domains: ['mail.com'] },
  { id: 'webde', name: 'WEB.DE', domains: ['web.de'] },
  { id: 'yandex', name: 'Yandex Mail', domains: ['yandex.com', 'yandex.ru', 'ya.ru'] },
  { id: 'mailru', name: 'Mail.ru', domains: ['mail.ru', 'bk.ru', 'list.ru', 'inbox.ru'] },
  { id: 'qq', name: 'QQ Mail', domains: ['qq.com'] },
  { id: 'netease', name: 'NetEase Mail', domains: ['163.com', '126.com'] },
  { id: 'naver', name: 'Naver Mail', domains: ['naver.com'] },
  { id: 'daum', name: 'Daum Mail', domains: ['daum.net', 'hanmail.net'] },
  { id: 'libero', name: 'Libero Mail', domains: ['libero.it'] },
  { id: 'laposte', name: 'La Poste Mail', domains: ['laposte.net'] },
  { id: 'rediff', name: 'Rediffmail', domains: ['rediffmail.com'] },
  { id: 'seznam', name: 'Seznam Email', domains: ['seznam.cz'] },
  { id: 'wp', name: 'Poczta WP', domains: ['wp.pl'] },
].map((p) => Object.freeze({ ...p, domains: freeze(p.domains) })));

/**
 * The domains suggestEmail() suggests. A typed domain on this list is never changed. Holds every
 * domain of PROVIDERS and FREE_MAIL_PROVIDERS, plus the mailboxes of large internet providers.
 * Add your own with the mailboxDomains option.
 */
export const MAILBOX_DOMAINS = freeze([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es', 'live.co.uk', 'live.fr', 'outlook.fr', 'outlook.de',
  'yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'yahoo.es', 'yahoo.ca', 'yahoo.co.in', 'yahoo.com.br',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com',
  'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me',
  'fastmail.com', 'fastmail.fm',
  'tuta.com', 'tutanota.com', 'tutanota.de', 'tutamail.com', 'tuta.io',
  'zohomail.com', 'zoho.com',
  'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch',
  'mail.com', 'web.de',
  'yandex.com', 'yandex.ru', 'ya.ru',
  'mail.ru', 'bk.ru', 'list.ru', 'inbox.ru',
  'qq.com', '163.com', '126.com',
  'naver.com', 'daum.net', 'hanmail.net',
  'libero.it', 'laposte.net', 'rediffmail.com', 'seznam.cz', 'wp.pl',
  'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net',
  'btinternet.com', 'virginmedia.com', 'sky.com',
  't-online.de', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr',
  'bigpond.com', 'shaw.ca',
]);

/**
 * Local parts of shared mailboxes, with dots, hyphens and underscores removed: "no-reply" and
 * "no.reply" are both "noreply". Includes the mailbox names of RFC 2142.
 */
export const ROLE_LOCAL_PARTS = freeze([
  'abuse', 'accounting', 'accounts', 'admin', 'administrator', 'billing', 'careers', 'contact',
  'customerservice', 'donotreply', 'enquiries', 'feedback', 'finance', 'ftp', 'hello', 'help',
  'helpdesk', 'hostmaster', 'hr', 'info', 'inquiries', 'jobs', 'legal', 'mailerdaemon', 'marketing',
  'media', 'news', 'newsletter', 'noc', 'noreply', 'office', 'orders', 'postmaster', 'press',
  'privacy', 'root', 'sales', 'security', 'service', 'support', 'team', 'usenet', 'uucp',
  'webmaster', 'www',
]);

// Misspelled top-level domains that are not real ones, fixed on any domain.
const TLD_TYPOS = Object.freeze({
  con: 'com', cmo: 'com', ocm: 'com', vom: 'com', xom: 'com', cpm: 'com', comm: 'com', coom: 'com',
  nte: 'net', ner: 'net', nett: 'net',
  ogr: 'org', orgg: 'org',
});
// Real top-level domains that are also common slips; fixed only when the result is a mailbox domain.
const TLD_SLIPS = Object.freeze({ co: 'com', cm: 'com', om: 'com', ne: 'net' });
const DOTLESS_SUFFIXES = ['com', 'net', 'org'];
const HOST_CHARS_RE = /^[a-z0-9.-]+$/;
const KEY_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEY_AT = new Map();
KEY_ROWS.forEach((row, r) => [...row].forEach((key, c) => KEY_AT.set(key, [r, c])));

const FREE_MAIL_BY_DOMAIN = new Map();
for (const p of FREE_MAIL_PROVIDERS) for (const d of p.domains) FREE_MAIL_BY_DOMAIN.set(d, p);
const ROLE_SET = new Set(ROLE_LOCAL_PARTS);

/** True for keys next to each other on a QWERTY keyboard. */
function nextKeys(a, b) {
  const p = KEY_AT.get(a);
  const q = KEY_AT.get(b);
  if (!p || !q) return false;
  const dr = q[0] - p[0];
  const dc = q[1] - p[1];
  return (dr === 0 && Math.abs(dc) === 1) || (dr === -1 && (dc === 0 || dc === 1)) || (dr === 1 && (dc === 0 || dc === -1));
}

/**
 * Optimal string alignment distance (Damerau-Levenshtein without repeated edits of one place).
 * Inserting, deleting or swapping two neighboring letters costs 1; replacing a letter costs 1 when
 * the two keys are next to each other on a QWERTY keyboard and 2 otherwise.
 */
function editDistance(a, b) {
  const rows = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : nextKeys(a[i - 1], b[j - 1]) ? 1 : 2;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
      rows[i][j] = d;
    }
  }
  return rows[a.length][b.length];
}

/** The listed domain with the same suffix and first letter, nearest to `domain`, if exactly one is nearest. */
function nearestDomain(domain, known) {
  const dot = domain.indexOf('.');
  if (dot <= 0) return null;
  const name = domain.slice(0, dot);
  const rest = domain.slice(dot + 1);
  let best = null;
  let bestDistance = Infinity;
  let tie = false;
  for (const candidate of known) {
    const cdot = candidate.indexOf('.');
    if (cdot <= 0 || !HOST_CHARS_RE.test(candidate)) continue;
    const cname = candidate.slice(0, cdot);
    if (candidate.slice(cdot + 1) !== rest || cname[0] !== name[0]) continue;
    const limit = cname.length >= 8 ? 2 : cname.length >= 5 ? 1 : 0;
    if (limit === 0 || Math.abs(cname.length - name.length) > limit) continue;
    const distance = editDistance(name, cname);
    if (distance === 0 || distance > limit) continue;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tie = false;
    } else if (distance === bestDistance) {
      tie = true;
    }
  }
  return tie ? null : best;
}

function suggestDomain(domain, known) {
  if (known.has(domain)) return null;
  const dot = domain.lastIndexOf('.');
  if (dot === -1) {
    const options = [`${domain}.com`];
    for (const s of DOTLESS_SUFFIXES) if (domain.length > s.length && domain.endsWith(s)) options.push(`${domain.slice(0, -s.length)}.${s}`);
    return options.find((d) => known.has(d)) ?? null;
  }
  const base = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  if (Object.hasOwn(TLD_TYPOS, tld)) {
    const fixed = `${base}.${TLD_TYPOS[tld]}`;
    return known.has(fixed) ? fixed : nearestDomain(fixed, known) ?? fixed;
  }
  if (Object.hasOwn(TLD_SLIPS, tld) && !base.includes('.') && base.length >= 3) {
    const fixed = `${base}.${TLD_SLIPS[tld]}`;
    if (known.has(fixed)) return fixed;
  }
  return nearestDomain(domain, known);
}

/** The typed domain, the corrected domain and the corrected address, or null. */
export function emailTypo(email, mailboxDomains) {
  const known = new Set([...MAILBOX_DOMAINS, ...stringList(mailboxDomains, 'mailboxDomains')]);
  const address = email.replace(OUTER_SPACE_RE, '');
  if (/[^\x21-\x7e]/.test(address)) return null;
  const at = address.indexOf('@');
  if (at === -1 || address.indexOf('@', at + 1) !== -1) return null;
  const local = address.slice(0, at);
  if (local.length === 0 || local.length > 64 || !LOCAL_RE.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  let domain = address.slice(at + 1).toLowerCase();
  if (domain.endsWith('.')) domain = domain.slice(0, -1);
  if (domain === '' || domain.length > 253 || !HOST_CHARS_RE.test(domain)) return null;
  const fixed = suggestDomain(domain, known);
  return fixed === null ? null : { domain, fixed, suggestion: `${local}@${fixed}` };
}

/**
 * Suggest a correction for a likely typo in the domain of a common mailbox, such as
 * gmial.com or hotmail.con. Returns the corrected address, or null when there is nothing to fix.
 * @param {string} email
 * @param {{ mailboxDomains?: string[] }} [options]
 */
export function suggestEmail(email, options = {}) {
  if (typeof email !== 'string') fail('invalid_argument', 'email must be a string');
  if (!options || typeof options !== 'object') fail('invalid_option', 'options must be an object');
  const typo = emailTypo(email, options.mailboxDomains);
  return typo === null ? null : typo.suggestion;
}

/** The ROLE_LOCAL_PARTS entry a local part matches, ignoring case, a +tag, dots, hyphens and underscores. */
export function roleLocalPart(local) {
  const plus = local.indexOf('+');
  const bare = (plus > 0 ? local.slice(0, plus) : local).toLowerCase().replace(/[._-]/g, '');
  return ROLE_SET.has(bare) ? bare : null;
}

/**
 * True when the address goes to a shared mailbox (admin@, info@, no-reply@ and the rest of
 * ROLE_LOCAL_PARTS) rather than to one person. Invalid addresses return false.
 * @param {string} email
 */
export function isRoleAddress(email) {
  const e = normalizeEmail(email);
  return e.valid && roleLocalPart(e.local) !== null;
}

/** Where a domain is listed as free mail: the provider table first, then `extra`. Null when nowhere. */
export function freeMailMatch(domain, extra) {
  const p = FREE_MAIL_BY_DOMAIN.get(domain);
  if (p) return { source: 'list', provider: p.name };
  return extra.includes(domain) ? { source: 'freeMailDomains', provider: null } : null;
}

function cleanDomain(emailOrDomain) {
  const s = emailOrDomain.replace(OUTER_SPACE_RE, '');
  let domain = s.slice(s.lastIndexOf('@') + 1).toLowerCase();
  if (domain.endsWith('.')) domain = domain.slice(0, -1);
  return domain;
}

/**
 * True when the domain belongs to a free consumer mailbox service in FREE_MAIL_PROVIDERS or to
 * your own freeMailDomains. Exact domains only; subdomains do not match.
 * @param {string} emailOrDomain
 * @param {{ freeMailDomains?: string[] }} [options]
 */
export function isFreeMail(emailOrDomain, options = {}) {
  if (typeof emailOrDomain !== 'string') fail('invalid_argument', 'emailOrDomain must be a string');
  if (!options || typeof options !== 'object') fail('invalid_option', 'options must be an object');
  return freeMailMatch(cleanDomain(emailOrDomain), stringList(options.freeMailDomains, 'freeMailDomains')) !== null;
}

