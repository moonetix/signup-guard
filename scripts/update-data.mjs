#!/usr/bin/env node
// Refreshes the vendored snapshot in data/ from its two upstream repositories.
// Usage: node scripts/update-data.mjs [--out <dir>]
// Exits non-zero and writes nothing when a download fails, a file does not parse, or a list shrinks by more than half.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createData } from '../src/data.js';

const DISPOSABLE = {
  repository: 'https://github.com/disposable-email-domains/disposable-email-domains',
  raw: 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains',
  list: 'disposable_email_blocklist.conf',
  license: 'LICENSE.txt',
};
const DATACENTER = {
  repository: 'https://github.com/moonetix/datacenter-ip-ranges',
  raw: 'https://raw.githubusercontent.com/moonetix/datacenter-ip-ranges',
};
const MIN_RATIO = 0.5;

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const OUT = outIndex === -1 ? fileURLToPath(new URL('../data/', import.meta.url)) : resolve(args[outIndex + 1]);

function headCommit(repository) {
  const out = execFileSync('git', ['ls-remote', repository, 'HEAD'], { encoding: 'utf8', timeout: 60_000 });
  const sha = out.split(/\s/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Could not read the HEAD commit of ${repository}`);
  return sha;
}

async function fetchText(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'signup-guard-data-update' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.includes('\r')) throw new Error('unexpected CRLF line endings');
      return text.endsWith('\n') ? text : text + '\n';
    } catch (err) {
      if (attempt >= 3) throw new Error(`Download failed: ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const lines = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
const readIf = (p) => (existsSync(join(OUT, p)) ? readFileSync(join(OUT, p), 'utf8') : null);
const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const dSha = headCommit(DISPOSABLE.repository);
const ipSha = headCommit(DATACENTER.repository);

const [domainsText, licenseText, sourcesText] = await Promise.all([
  fetchText(`${DISPOSABLE.raw}/${dSha}/${DISPOSABLE.list}`),
  fetchText(`${DISPOSABLE.raw}/${dSha}/${DISPOSABLE.license}`),
  fetchText(`${DATACENTER.raw}/${ipSha}/data/sources.json`),
]);
if (!/CC0/.test(licenseText)) throw new Error('The disposable list license is no longer CC0. Review it before updating.');

const upstream = JSON.parse(sourcesText);
const providers = upstream.sources
  .filter((s) => typeof s.file === 'string' && s.status === 'ok')
  .map((s) => ({ id: s.id, name: s.name, category: s.category, url: s.url, docs: s.docs, terms: s.terms }));
for (const p of providers) {
  if (!/^[a-z0-9-]+$/.test(p.id)) throw new Error(`Unexpected provider id "${p.id}"`);
}
const skipped = upstream.sources.filter((s) => s.status !== 'ok').map((s) => `${s.id} (${s.status})`);
const files = {};
await Promise.all(
  providers.map(async (p) => {
    files[p.id] = await fetchText(`${DATACENTER.raw}/${ipSha}/data/providers/${p.id}.txt`);
  }),
);

// Parse everything with the library itself, so a bad line fails here and not in production.
const domains = lines(domainsText);
const ranges = [];
const counts = {};
for (const p of providers) {
  const cidrs = lines(files[p.id]);
  counts[p.id] = { ipv4: cidrs.filter((c) => !c.includes(':')).length, ipv6: cidrs.filter((c) => c.includes(':')).length };
  for (const cidr of cidrs) ranges.push({ cidr, provider: p.id, providerName: p.name, category: p.category });
}
createData({ disposableDomains: domains, ipRanges: ranges });

const oldManifest = JSON.parse(readIf('manifest.json') ?? '{}');
const problems = [];
const oldDomains = oldManifest.disposable?.domains ?? 0;
if (domains.length < oldDomains * MIN_RATIO) problems.push(`disposable domains fell from ${oldDomains} to ${domains.length}`);
const oldRanges = (oldManifest.ipRanges?.ipv4 ?? 0) + (oldManifest.ipRanges?.ipv6 ?? 0);
if (ranges.length < oldRanges * MIN_RATIO) problems.push(`IP ranges fell from ${oldRanges} to ${ranges.length}`);
for (const [id, c] of Object.entries(oldManifest.ipRanges?.providers ?? {})) {
  const before = c.ipv4 + c.ipv6;
  const after = counts[id] ? counts[id].ipv4 + counts[id].ipv6 : 0;
  if (before > 0 && after === 0) problems.push(`provider ${id} disappeared or is empty`);
}
if (problems.length > 0) {
  console.error('Refusing to update data/:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const providersJson = JSON.stringify(providers, null, 2) + '\n';
const disposableChanged = readIf('disposable/domains.txt') !== domainsText || readIf('disposable/LICENSE.txt') !== licenseText;
const existingIpFiles = existsSync(join(OUT, 'ip')) ? readdirSync(join(OUT, 'ip')).filter((f) => f.endsWith('.txt')) : [];
const ipChanged =
  readIf('ip/providers.json') !== providersJson ||
  providers.some((p) => readIf(`ip/${p.id}.txt`) !== files[p.id]) ||
  existingIpFiles.some((f) => !providers.some((p) => `${p.id}.txt` === f));

if (skipped.length > 0) console.log(`Upstream sources not included: ${skipped.join(', ')}`);
if (!disposableChanged && !ipChanged) {
  console.log('Upstream data unchanged.');
  process.exit(0);
}

const manifest = {
  disposable: disposableChanged
    ? { repository: DISPOSABLE.repository, file: DISPOSABLE.list, license: 'CC0-1.0', commit: dSha, updatedAt: now, domains: domains.length }
    : oldManifest.disposable,
  ipRanges: ipChanged
    ? {
        repository: DATACENTER.repository,
        license: 'MIT for the repository; feed terms per provider in ip/providers.json',
        commit: ipSha,
        updatedAt: now,
        ipv4: ranges.filter((r) => !r.cidr.includes(':')).length,
        ipv6: ranges.filter((r) => r.cidr.includes(':')).length,
        providers: counts,
      }
    : oldManifest.ipRanges,
};

function sourcesMd(m, provs) {
  const rows = provs.map((p) => {
    const c = m.ipRanges.providers[p.id];
    return `| ${p.name} | \`${p.id}\` | ${p.category} | ${c.ipv4} | ${c.ipv6} | ${p.terms} |`;
  });
  return `# Data sources

This folder is a snapshot of two upstream lists. \`scripts/update-data.mjs\` refreshes it every week and rewrites this file only when the data changes.

## Disposable email domains

| | |
| --- | --- |
| Source | [disposable-email-domains](${m.disposable.repository}), \`${m.disposable.file}\` |
| License | CC0 1.0 Universal, see [disposable/LICENSE.txt](disposable/LICENSE.txt) |
| Commit | [\`${m.disposable.commit.slice(0, 12)}\`](${m.disposable.repository}/commit/${m.disposable.commit}) |
| Updated | ${m.disposable.updatedAt} |
| Domains | ${m.disposable.domains} |

Entries are registrable domains (or the third level under a public suffix). A listed domain also matches its subdomains. Upstream notes that it cannot guarantee every entry is still disposable, so keep your own allow list.

## IP ranges

| | |
| --- | --- |
| Source | [moonetix/datacenter-ip-ranges](${m.ipRanges.repository}), \`data/providers/*.txt\` |
| License | ${m.ipRanges.license} |
| Commit | [\`${m.ipRanges.commit.slice(0, 12)}\`](${m.ipRanges.repository}/commit/${m.ipRanges.commit}) |
| Updated | ${m.ipRanges.updatedAt} |
| Ranges | ${m.ipRanges.ipv4} IPv4, ${m.ipRanges.ipv6} IPv6 |

| Provider | File | Category | IPv4 | IPv6 | Terms |
| --- | --- | --- | ---: | ---: | --- |
${rows.join('\n')}
`;
}

const writes = [['manifest.json', JSON.stringify(manifest, null, 2) + '\n'], ['SOURCES.md', sourcesMd(manifest, providers)]];
if (disposableChanged) writes.push(['disposable/domains.txt', domainsText], ['disposable/LICENSE.txt', licenseText]);
if (ipChanged) {
  writes.push(['ip/providers.json', providersJson]);
  for (const p of providers) writes.push([`ip/${p.id}.txt`, files[p.id]]);
}
for (const dir of ['disposable', 'ip']) mkdirSync(join(OUT, dir), { recursive: true });
for (const [p, text] of writes) writeFileSync(join(OUT, p) + '.tmp', text);
for (const [p] of writes) renameSync(join(OUT, p) + '.tmp', join(OUT, p));
if (ipChanged) {
  for (const f of existingIpFiles) if (!providers.some((p) => `${p.id}.txt` === f)) unlinkSync(join(OUT, 'ip', f));
}

console.log(
  `Updated:${disposableChanged ? ` disposable domains ${domains.length} (${dSha.slice(0, 12)})` : ''}${
    ipChanged ? ` IP ranges ${ranges.length} from ${providers.length} providers (${ipSha.slice(0, 12)})` : ''
  }`,
);
