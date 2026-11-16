import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as guard from '../src/index.js';
import { browserLibrary, packSnapshot, pickExamples, readmeParts, writeEngine } from '../scripts/build-site.mjs';
import { parseSnapshot } from '../site/snapshot.js';

// The demo page in site/ runs the library in a browser. These tests check the browser build
// against the library itself. Like the checks in data.test.js they must hold after every
// weekly data update, so nothing here expects a particular address to be on a list.
// `npm run site` is the step that checks the examples of the page against the snapshot.

const root = fileURLToPath(new URL('..', import.meta.url));
const vectors = JSON.parse(readFileSync(join(root, 'test-vectors', 'vectors.json'), 'utf8'));
const plainCases = vectors.assessSignup.filter((c) => !c.options);

let dir;
let engine;

function fixtureFiles() {
  const providers = vectors.fixture.ipRanges.map((r) => ({ id: r.provider, name: r.providerName ?? r.provider, category: r.category, cidrs: r.cidr }));
  return { 'snapshot/ip.json': JSON.stringify({ info: null, providers }), 'snapshot/disposable.txt': vectors.fixture.disposableDomains.join('\n') };
}

function snapshotFiles() {
  const packed = packSnapshot();
  return { 'snapshot/ip.json': packed.ip, 'snapshot/disposable.txt': packed.disposable };
}

const reader = (files) => async (path) => files[path];

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'signup-guard-site-'));
  writeEngine(dir);
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  engine = await import(pathToFileURL(join(dir, 'engine.js')).href);
});

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('the library copy for the browser is src/ with only the Node imports of data.js replaced', () => {
  const files = browserLibrary();
  assert.deepEqual([...files.keys()], ['assess.js', 'data.js', 'email.js', 'errors.js', 'index.js', 'ip.js', 'velocity.js']);
  for (const [name, source] of files) {
    const original = readFileSync(join(root, 'src', name), 'utf8');
    assert.ok(!source.includes('node:'), name);
    if (name === 'data.js') {
      const [first, ...rest] = source.split('\n');
      assert.equal(first, "import { readFileSync, fileURLToPath, join } from '../node-stubs.js';");
      assert.deepEqual(rest, original.split('\n').slice(3));
    } else {
      assert.equal(source, original, name);
    }
  }
});

test('browser build: every assessSignup vector gives the expected result on the fixture data', async () => {
  await engine.load(reader(fixtureFiles()));
  assert.ok(plainCases.length >= 20);
  for (const c of plainCases) {
    if ('throws' in c) {
      await assert.rejects(engine.score(c.input), (err) => err.code === c.throws, c.name);
    } else {
      const { result } = await engine.score(c.input);
      assert.deepEqual(result, c.out, c.name);
    }
  }
});

test('the packed snapshot rebuilds the data set of the package, entry for entry', () => {
  const packed = packSnapshot();
  const shipped = guard.createData(parseSnapshot(JSON.parse(packed.ip), packed.disposable));
  const bundled = guard.defaultData();
  const plain = (e) => ({ start: e.start, end: e.end, cidr: e.cidr, provider: e.provider, providerName: e.providerName, category: e.category });
  assert.deepEqual(shipped.counts, bundled.counts);
  assert.deepEqual(shipped.info, bundled.info);
  assert.deepEqual([...shipped.disposable], [...bundled.disposable]);
  assert.deepEqual(shipped.v4.entries.map(plain), bundled.v4.entries.map(plain));
  assert.deepEqual(shipped.v6.entries.map(plain), bundled.v6.entries.map(plain));
});

test('browser build on the bundled snapshot: same answers as the library', async () => {
  const info = await engine.load(reader(snapshotFiles()));
  assert.deepEqual(info.counts, guard.dataInfo().counts);
  assert.deepEqual(info.thresholds, { ...guard.DEFAULT_THRESHOLDS });
  assert.deepEqual(info.rules, guard.DEFAULT_VELOCITY_RULES.map((r) => ({ ...r })));

  const inputs = plainCases.filter((c) => !('throws' in c)).map((c) => c.input);
  for (const c of vectors.lookupIp) if (typeof c.in === 'string') inputs.push({ ip: c.in });
  for (const c of vectors.checkDisposable) if (typeof c.in === 'string' && c.in.includes('@')) inputs.push({ email: c.in });
  for (const c of vectors.normalizeEmail) if (typeof c.in === 'string') inputs.push({ email: c.in });
  assert.ok(inputs.length > 100);
  for (const input of inputs) {
    const { result } = await engine.score(input);
    assert.deepEqual(result, guard.assessSignup(input), JSON.stringify(input));
  }
});

test('browser build: counting attempts gives what the quick start of the README gives', async () => {
  await engine.load(reader(snapshotFiles()));
  engine.reset();
  const limiter = new guard.VelocityLimiter();
  const attempt = { email: 'jane@example.org', ip: '203.0.113.7' };
  const now = 1767225601;
  let last;
  for (let i = 0; i < 6; i++) {
    const velocity = await limiter.check({ now, ...attempt });
    last = await engine.score(attempt, { count: true, now });
    assert.deepEqual(last.velocity, velocity, `attempt ${i + 1}`);
    assert.deepEqual(last.result, guard.assessSignup({ ...attempt, velocity }), `attempt ${i + 1}`);
  }
  assert.deepEqual(last.result.reasons.map((r) => r.code).filter((c) => c.startsWith('velocity_')), ['velocity_ip', 'velocity_email']);
  assert.equal(last.result.decision, 'block');

  engine.reset();
  const fresh = await engine.score(attempt, { count: true, now });
  assert.ok(fresh.velocity.results.every((r) => r.count === 1));
  const uncounted = await engine.score(attempt);
  assert.equal(uncounted.velocity, null);
});

test('the examples of the page are vectors and cover what the page promises', () => {
  const examples = pickExamples(vectors);
  const codes = new Set(examples.flatMap((e) => e.reasons.map((r) => r.code)));
  for (const code of ['email_disposable', 'email_normalized', 'ip_datacenter', 'ip_tor', 'ip_privacy_relay']) assert.ok(codes.has(code), code);
  assert.ok(examples.some((e) => e.decision === 'allow' && e.reasons.length === 0), 'a clean sign-up');
  for (const decision of ['allow', 'review', 'block']) assert.ok(examples.some((e) => e.decision === decision), decision);
  const fixture = guard.createData(vectors.fixture);
  for (const e of examples) {
    const got = guard.assessSignup(e.input, { data: fixture });
    assert.equal(got.decision, e.decision, e.name);
    assert.equal(got.score, e.score, e.name);
    assert.ok(e.label.length > 0 && e.label.length < 40, e.name);
  }
  assert.throws(() => pickExamples({ assessSignup: [] }), /no plain assessSignup vector named/);
});

test('the snippets of the page are the ones in the README, and its table of reasons matches the library', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const parts = readmeParts(readme);
  assert.equal(parts.installJs, 'npm install github:moonetix/signup-guard');
  assert.equal(parts.installPhp, 'composer require moonetix/signup-guard');
  assert.equal(parts.quickJs.trim(), readFileSync(join(root, 'examples', 'quickstart.mjs'), 'utf8').trim());
  assert.match(parts.quickPhp, /SignupGuard::assessSignup\(/);
  for (const part of [parts.installJs, parts.installPhp, parts.quickJs, parts.quickPhp]) assert.ok(readme.includes(part));
  const weights = Object.fromEntries(parts.reasons.map((r) => [r.code === 'velocity_<key>' ? 'velocity_other' : r.code, r.points]));
  assert.deepEqual(weights, { ...guard.DEFAULT_WEIGHTS });
  assert.equal(parts.reasons.find((r) => r.code === 'velocity_email').hint, 'Too many attempts. Please try again later.');
  assert.equal(parts.reasons.find((r) => r.code === 'ip_privacy_relay').hint, null);
  assert.deepEqual(parts.actions.map((a) => a.decision), ['allow', 'review', 'block']);
});

test('the header facts come from the build and the page links to no sign-up', () => {
  const html = readFileSync(join(root, 'site', 'index.html'), 'utf8');
  const facts = html.match(/<dl class="facts">([\s\S]*?)<\/dl>/);
  assert.ok(facts, 'facts table');
  for (const name of ['DOMAINS', 'RANGES', 'PROVIDERS', 'DISPOSABLE_DATE', 'IP_DATE', 'EXAMPLES', 'BUILT', 'NODE', 'COMMIT']) {
    assert.ok(facts[1].includes(`{{${name}}}`), name);
  }
  const build = readFileSync(join(root, 'scripts', 'build-site.mjs'), 'utf8');
  assert.match(build, /no value for \{\{\$\{name\}\}\}/);
  assert.ok(!/register|sign up free/i.test(html), 'sign-up link');
  assert.match(html, /<p class="maintainer">Maintained by <a href="https:\/\/moonetix\.com">Moonetix<\/a>, an affiliate network\.<\/p>/);
});

test('the page loads nothing from another origin and has no inline script or style', () => {
  const html = readFileSync(join(root, 'site', 'index.html'), 'utf8');
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'/);
  for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(?:[a-z]+:)?\/\//i.test(m[1]), `external resource ${m[1]}`);
    assert.ok(existsSync(join(root, 'site', m[1])), `missing site/${m[1]}`);
  }
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'inline script');
  assert.ok(!/\sstyle="/.test(html) && !/<style/.test(html), 'inline style');
  for (const name of ['app.js', 'engine.js', 'worker.js']) {
    const source = readFileSync(join(root, 'site', name), 'utf8');
    assert.ok(!/https?:\/\//.test(source), `${name} names a remote URL`);
  }
});
