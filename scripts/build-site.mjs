// Assembles the GitHub Pages demo in _site/ (or in the folder given with --out).
//
// The page runs the library itself. src/ is copied to _site/lib/ unchanged, except that
// the three Node imports at the top of data.js point at site/node-stubs.js, because a
// browser has no file system. The data in data/ is packed into two static files, and this
// script checks that they rebuild exactly the data set loadData() returns.
//
// The example inputs on the page come from test-vectors/vectors.json. Each one is scored
// here with the library on the bundled snapshot, and the build stops when the decision,
// the score or the reasons differ from the vector. The snippets on the page are cut out
// of README.md.
//
// Node built-ins only. Run: node scripts/build-site.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_THRESHOLDS, DEFAULT_VELOCITY_RULES, DEFAULT_WEIGHTS, assessSignup, createData, loadData } from '../src/index.js';
import { parseSnapshot } from '../site/snapshot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const NODE_IMPORTS = `import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
`;
const STUB_IMPORT = "import { readFileSync, fileURLToPath, join } from '../node-stubs.js';\n";

// Vectors shown as examples, by their name in test-vectors/vectors.json, with the label on the page.
const EXAMPLES = [
  ['clean sign-up', 'Clean sign-up'],
  ['disposable subdomain on a datacenter IP', 'Disposable inbox on a cloud IP'],
  ['Gmail alias is information only', 'Gmail alias with dots and a plus tag'],
  ['GitHub runner inside AWS', 'Cloud datacenter IP'],
  ['Tor exit', 'Tor exit'],
  ['iCloud Private Relay', 'Privacy relay'],
  ['Cloudflare edge address', 'CDN edge address'],
  ['private address behind a proxy', 'Private address'],
  ['velocity on network only', 'Too many attempts from one network'],
  ['typo in a mailbox domain', 'Typo in the email domain'],
  ['role address', 'Shared role address'],
];
const FIRST_EXAMPLE = 'disposable subdomain on a datacenter IP';
const MUST_COVER = ['email_disposable', 'email_typo', 'email_role', 'email_normalized', 'ip_datacenter', 'ip_tor', 'ip_privacy_relay'];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
const number = (n) => n.toLocaleString('en-US');

/** src/ as browser modules: file name to source. Only the Node imports of data.js change. */
export function browserLibrary() {
  const files = new Map();
  for (const name of readdirSync(join(root, 'src')).filter((f) => f.endsWith('.js')).sort()) {
    let source = read('src', name);
    if (name === 'data.js') {
      check(source.startsWith(NODE_IMPORTS), 'src/data.js no longer starts with the three Node imports this build replaces');
      source = STUB_IMPORT + source.slice(NODE_IMPORTS.length);
    }
    check(!/from 'node:|import\('node:|require\(/.test(source), `src/${name} needs a Node module, so it cannot run in a browser as it is`);
    files.set(name, source);
  }
  return files;
}

/** Writes the browser entry and the library copy: everything the engine needs except the data. */
export function writeEngine(out) {
  mkdirSync(join(out, 'lib'), { recursive: true });
  for (const name of ['engine.js', 'worker.js', 'snapshot.js', 'node-stubs.js']) cpSync(join(root, 'site', name), join(out, name));
  for (const [name, source] of browserLibrary()) writeFileSync(join(out, 'lib', name), source);
}

/** The snapshot in `dir` as the two files the page loads. Reads the folder the way loadData() does. */
export function packSnapshot(dir = join(root, 'data')) {
  const file = (p) => readFileSync(join(dir, p), 'utf8');
  const lines = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  const providers = JSON.parse(file('ip/providers.json')).map((p) => ({ id: p.id, name: p.name, category: p.category, cidrs: lines(file(`ip/${p.id}.txt`)).join(' ') }));
  return {
    ip: JSON.stringify({ info: JSON.parse(file('manifest.json')), providers }),
    disposable: lines(file('disposable/domains.txt')).join('\n'),
  };
}

/** The vectors shown on the page, with what each must return. */
export function pickExamples(vectors) {
  return EXAMPLES.map(([name, label]) => {
    const vector = vectors.assessSignup.find((v) => v.name === name);
    check(vector && vector.out && !vector.options, `test-vectors/vectors.json has no plain assessSignup vector named "${name}"`);
    return {
      name,
      label,
      input: vector.input,
      decision: vector.out.decision,
      score: vector.out.score,
      reasons: vector.out.reasons.map((r) => ({ code: r.code, points: r.points })),
    };
  });
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((v) => b.has(v));
}

function sameRanges(a, b) {
  return a.length === b.length && a.every((e, i) => e.start === b[i].start && e.end === b[i].end && e.cidr === b[i].cidr && e.provider === b[i].provider && e.providerName === b[i].providerName && e.category === b[i].category);
}

// --- README

function section(readme, title, level = 2) {
  const marks = '#'.repeat(level);
  const start = readme.indexOf(`\n${marks} ${title}\n`);
  check(start > -1, `README.md has no section "${title}"`);
  const rest = readme.slice(start + 1);
  const next = rest.slice(marks.length).search(new RegExp(`\\n#{1,${level}} `));
  return next === -1 ? rest : rest.slice(0, next + marks.length);
}

function codeBlock(text, language, what) {
  const m = text.match(new RegExp('```' + language + '\\n([\\s\\S]*?)\\n```'));
  check(m, `README.md: no ${language} block in ${what}`);
  return m[1];
}

function tableRows(text, columns) {
  return [...text.matchAll(/^\|(.+)\|$/gm)]
    .map((m) => m[1].split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length === columns && !/^[-: ]+$/.test(cells[0]))
    .slice(1);
}

export function readmeParts(readme) {
  const quick = section(readme, 'Quick start');
  const install = codeBlock(section(readme, 'Install'), 'bash', 'Install').split('\n');
  let lastHint = null;
  const reasons = tableRows(section(readme, 'Reasons and default weights', 3), 4).map(([code, points, when, hint]) => {
    if (hint !== 'same') lastHint = hint === 'none' ? null : hint;
    return { code: code.replace(/`/g, ''), points: Number(points), when, hint: lastHint };
  });
  const actions = tableRows(section(quick, 'Acting on the decision', 3), 2).map(([decision, action]) => ({ decision: decision.replace(/`/g, ''), action }));
  return {
    installJs: install.filter((l) => l.startsWith('npm ')).join('\n'),
    installPhp: install.filter((l) => l.startsWith('composer ')).join('\n'),
    quickJs: codeBlock(quick, 'js', 'Quick start'),
    quickPhp: codeBlock(quick, 'php', 'Quick start'),
    reasons,
    actions,
  };
}

// --- the build

export async function build(out) {
  const readme = read('README.md');
  const parts = readmeParts(readme);
  check(parts.installJs && parts.installPhp, 'README.md: the Install block must hold an npm line and the composer lines');
  check(parts.quickJs.trim() === read('examples', 'quickstart.mjs').trim(), 'README.md: the JavaScript quick start differs from examples/quickstart.mjs');
  const quickOutput = execFileSync(process.execPath, [join(root, 'examples', 'quickstart.mjs')], { cwd: root, encoding: 'utf8' }).trim();
  check(quickOutput.split('\n').length >= 2, 'examples/quickstart.mjs printed nothing');

  for (const row of parts.reasons) {
    const key = row.code === 'velocity_<key>' ? 'velocity_other' : row.code;
    check(DEFAULT_WEIGHTS[key] === row.points, `README.md gives ${row.code} ${row.points} points, the library gives ${DEFAULT_WEIGHTS[key]}`);
  }
  check(parts.reasons.length === Object.keys(DEFAULT_WEIGHTS).length, 'README.md: the table of reasons and DEFAULT_WEIGHTS list different codes');
  check(JSON.stringify(parts.actions.map((a) => a.decision)) === '["allow","review","block"]', 'README.md: expected the allow, review and block rows under "Acting on the decision"');

  // The two static files must rebuild the data set of the package, entry for entry.
  const packed = packSnapshot();
  const shipped = createData(parseSnapshot(JSON.parse(packed.ip), packed.disposable));
  const bundled = loadData(join(root, 'data'));
  check(JSON.stringify(shipped.counts) === JSON.stringify(bundled.counts), 'the packed snapshot has other counts than data/');
  check(sameSet(shipped.disposable, bundled.disposable), 'the packed snapshot has other disposable domains than data/');
  check(sameRanges(shipped.v4.entries, bundled.v4.entries) && sameRanges(shipped.v6.entries, bundled.v6.entries), 'the packed snapshot has other IP ranges than data/');
  check(JSON.stringify(shipped.info) === JSON.stringify(bundled.info), 'the packed snapshot has another manifest than data/');

  // Every example must return, on the real snapshot, what its vector says.
  const vectors = JSON.parse(read('test-vectors', 'vectors.json'));
  const examples = pickExamples(vectors);
  const covered = new Set();
  for (const example of examples) {
    const got = assessSignup(example.input, { data: shipped });
    const reasons = got.reasons.map((r) => ({ code: r.code, points: r.points }));
    check(
      got.decision === example.decision && got.score === example.score && JSON.stringify(reasons) === JSON.stringify(example.reasons),
      `example "${example.name}": the library returns ${got.decision} ${got.score} [${reasons.map((r) => r.code).join(', ')}] on the bundled data, ` +
        `the vector says ${example.decision} ${example.score} [${example.reasons.map((r) => r.code).join(', ')}]. Pick another vector in scripts/build-site.mjs.`,
    );
    check(JSON.stringify(got) === JSON.stringify(assessSignup(example.input, { data: bundled })), `example "${example.name}" scores differently on the packed snapshot and on data/`);
    for (const r of reasons) covered.add(r.code);
  }
  check(examples.some((e) => e.reasons.length === 0 && e.decision === 'allow'), 'the examples need a clean sign-up');
  for (const code of MUST_COVER) check(covered.has(code), `no example shows the reason ${code}`);

  const first = examples.find((e) => e.name === FIRST_EXAMPLE);
  check(first, `the first example "${FIRST_EXAMPLE}" is not in the list`);
  const info = shipped.info;
  const day = (iso) => iso.slice(0, 10);
  const data = {
    built: { date: new Date().toISOString().slice(0, 10), commit: (process.env.GITHUB_SHA || '').slice(0, 7), node: process.version },
    thresholds: { ...DEFAULT_THRESHOLDS },
    rules: DEFAULT_VELOCITY_RULES.map((r) => ({ ...r })),
    examples: examples.map(({ label, input, decision, score }) => ({ label, input, decision, score })),
    first: examples.indexOf(first),
    preview: assessSignup(first.input, { data: shipped }),
    snapshot: {
      disposableDate: day(info.disposable.updatedAt),
      ipDate: day(info.ipRanges.updatedAt),
      counts: shipped.counts,
      bytes: { ip: Buffer.byteLength(packed.ip), disposable: Buffer.byteLength(packed.disposable) },
    },
  };

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'snapshot'), { recursive: true });
  for (const name of readdirSync(join(root, 'site')).sort()) {
    if (name === 'index.html') continue;
    cpSync(join(root, 'site', name), join(out, name), { recursive: true });
  }
  writeEngine(out);
  writeFileSync(join(out, 'snapshot', 'ip.json'), packed.ip);
  writeFileSync(join(out, 'snapshot', 'disposable.txt'), packed.disposable);
  writeFileSync(join(out, 'data.json'), JSON.stringify(data));

  const fill = {
    INSTALL_JS: escapeHtml(parts.installJs),
    INSTALL_PHP: escapeHtml(parts.installPhp),
    QUICK_JS: escapeHtml(parts.quickJs),
    QUICK_PHP: escapeHtml(parts.quickPhp),
    QUICK_OUTPUT: escapeHtml(quickOutput),
    REASONS: parts.reasons
      .map(
        (r) =>
          `<tr><th scope="row"><code>${escapeHtml(r.code)}</code></th><td class="num">${r.points}</td><td>${inline(r.when)}</td><td>${r.hint === null ? '<span class="muted">none</span>' : escapeHtml(r.hint)}</td></tr>`,
      )
      .join('\n            '),
    ACTIONS: parts.actions.map((a) => `<li class="act act-${a.decision}"><h3>${a.decision}</h3><p>${inline(a.action)}</p></li>`).join('\n        '),
    REVIEW: DEFAULT_THRESHOLDS.review,
    BLOCK: DEFAULT_THRESHOLDS.block,
    DOMAINS: number(shipped.counts.disposableDomains),
    RANGES: number(shipped.counts.ipv4Ranges + shipped.counts.ipv6Ranges),
    V4: number(shipped.counts.ipv4Ranges),
    V6: number(shipped.counts.ipv6Ranges),
    PROVIDERS: Object.keys(info.ipRanges.providers).length,
    DISPOSABLE_DATE: day(info.disposable.updatedAt),
    IP_DATE: day(info.ipRanges.updatedAt),
    EXAMPLES: examples.length,
    BUILT: data.built.date,
    NODE: data.built.node,
    COMMIT: data.built.commit
      ? `<a class="mono" href="https://github.com/moonetix/signup-guard/commit/${escapeHtml(data.built.commit)}">${escapeHtml(data.built.commit)}</a>`
      : 'local build',
  };
  for (const [name, value] of Object.entries(fill)) check(value !== undefined && value !== null && String(value).trim() !== '', `site/index.html: no value for {{${name}}}`);
  let html = read('site', 'index.html');
  for (const [name, value] of Object.entries(fill)) html = html.replaceAll(`{{${name}}}`, () => String(value));
  const left = html.match(/\{\{[A-Z_0-9]+\}\}/g);
  if (left) throw new Error(`site/index.html: unknown placeholders ${[...new Set(left)].join(', ')}`);
  writeFileSync(join(out, 'index.html'), html);

  return { examples: examples.length, counts: shipped.counts, bytes: data.snapshot.bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outFlag = process.argv.indexOf('--out');
  const out = outFlag > -1 ? resolve(process.argv[outFlag + 1]) : join(root, '_site');
  const done = await build(out);
  console.log(
    `${out === join(root, '_site') ? '_site' : out} built: ${done.examples} examples from the test vectors hold on the bundled data, ` +
      `${number(done.counts.disposableDomains)} domains and ${number(done.counts.ipv4Ranges + done.counts.ipv6Ranges)} IP ranges packed ` +
      `(${Math.round(done.bytes.ip / 1024)} kB and ${Math.round(done.bytes.disposable / 1024)} kB before compression)`,
  );
}
