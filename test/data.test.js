import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as guard from '../src/index.js';

// Checks on the bundled snapshot. They must hold after every weekly update, so they test shape and
// a few long-lived facts, never exact counts.
const dir = new URL('../data/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const providers = JSON.parse(readFileSync(new URL('ip/providers.json', dir), 'utf8'));

test('manifest matches the files', () => {
  const info = guard.dataInfo();
  assert.equal(info.counts.disposableDomains, manifest.disposable.domains);
  assert.equal(info.counts.ipv4Ranges, manifest.ipRanges.ipv4);
  assert.equal(info.counts.ipv6Ranges, manifest.ipRanges.ipv6);
  assert.match(manifest.disposable.commit, /^[0-9a-f]{40}$/);
  assert.match(manifest.ipRanges.commit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.disposable.license, 'CC0-1.0');
  assert.match(readFileSync(new URL('disposable/LICENSE.txt', dir), 'utf8'), /CC0 1\.0 Universal/);
});

test('snapshot is large enough to be real', () => {
  assert.ok(manifest.disposable.domains > 5000);
  assert.ok(manifest.ipRanges.ipv4 > 5000 && manifest.ipRanges.ipv6 > 1000);
});

test('every provider file is listed, parses and has a known category', () => {
  const files = readdirSync(new URL('ip/', dir)).filter((f) => f.endsWith('.txt')).sort();
  assert.deepEqual(files, providers.map((p) => `${p.id}.txt`).sort());
  for (const p of providers) {
    assert.ok(guard.IP_CATEGORIES.includes(p.category), p.id);
    assert.ok(typeof p.name === 'string' && typeof p.url === 'string', p.id);
  }
  assert.ok(providers.some((p) => p.category === 'tor'));
  assert.ok(providers.some((p) => p.category === 'privacy-relay'));
});

test('long-lived facts', () => {
  assert.equal(guard.checkDisposable('x@mailinator.com').disposable, true);
  for (const d of ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'proton.me']) {
    assert.equal(guard.checkDisposable(d).disposable, false, d);
  }
  const aws = guard.lookupIp('3.5.140.2');
  assert.ok(aws.matches.some((m) => m.provider === 'aws'), 'an S3 address is in AWS');
  assert.deepEqual(guard.lookupIp('192.0.2.1').matches, []);
});
