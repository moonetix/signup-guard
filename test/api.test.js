import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import * as guard from '../src/index.js';

test('IPv6 text matches the WHATWG URL serializer (RFC 5952) for random addresses', () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let i = 0; i < 2000; i++) {
    const groups = Array.from({ length: 8 }, () => (rand() % 4 === 0 ? 0 : rand() % 65536).toString(16));
    const text = groups.join(':');
    if (/^0:0:0:0:0:ffff:/.test(text)) continue;
    const ours = guard.normalizeIp(text);
    const viaUrl = new URL(`http://[${text}]/`).hostname.slice(1, -1);
    assert.equal(ours, viaUrl, text);
    assert.equal(guard.normalizeIp(ours), ours, 'formatting is stable');
  }
});

test('parseIp agrees with node:net isIP on what is an address', () => {
  const samples = ['1.2.3.4', '1.2.3.256', '::', '::1', '1::', '1:2:3:4:5:6:7:8', '1:2:3:4:5:6:7:8:9', '::ffff:1.2.3.4', 'abcd::1.2.3.4', '1.2.3', 'x', '', '2001:db8::1'];
  for (const s of samples) assert.equal(guard.parseIp(s) !== null, isIP(s) !== 0, s);
});

test('SignupGuardError carries a stable code', () => {
  assert.throws(
    () => guard.parseCidr('300.1.1.1/8'),
    (err) => err instanceof guard.SignupGuardError && err instanceof Error && err.code === 'invalid_cidr',
  );
  assert.throws(() => guard.normalizeEmail(42), (err) => err.code === 'invalid_argument');
  assert.throws(() => guard.assessSignup({}, { data: {} }), (err) => err.code === 'invalid_option');
});

test('createData validates its input', () => {
  assert.throws(() => guard.createData({ disposableDomains: ['bad domain'] }), (err) => err.code === 'data_error');
  assert.throws(() => guard.createData({ ipRanges: [{ cidr: '1.2.3.0/24', provider: 'x', category: 'vpn' }] }), (err) => err.code === 'data_error');
  assert.throws(() => guard.createData({ ipRanges: [{ cidr: '1.2.3.0/24' }] }), (err) => err.code === 'data_error');
  const d = guard.createData({ disposableDomains: ['# comment', '', 'Example.COM'], ipRanges: [] });
  assert.deepEqual(d.counts, { disposableDomains: 1, ipv4Ranges: 0, ipv6Ranges: 0 });
});

test('VelocityLimiter awaits async stores and rejects bad counts', async () => {
  const counts = new Map();
  const asyncStore = {
    async hit(key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key);
    },
  };
  const limiter = new guard.VelocityLimiter({ store: asyncStore, rules: [{ name: 'ip', key: 'ip', limit: 1, windowSeconds: 60 }], keyPrefix: 'test:' });
  assert.equal((await limiter.check({ now: 120, ip: '192.0.2.1' })).limited, false);
  assert.equal((await limiter.check({ now: 121, ip: '192.0.2.1' })).limited, true);
  assert.deepEqual([...counts.keys()], ['test:ip:120:192.0.2.1']);

  const broken = new guard.VelocityLimiter({ store: { hit: () => 0 }, rules: [{ name: 'ip', key: 'ip', limit: 1, windowSeconds: 60 }] });
  await assert.rejects(broken.check({ now: 1, ip: '192.0.2.1' }), (err) => err.code === 'invalid_option');
  assert.throws(() => new guard.VelocityLimiter({ store: {} }), (err) => err.code === 'invalid_option');
});

test('MemoryStore expires and prunes counters', () => {
  const store = new guard.MemoryStore();
  assert.equal(store.hit('a', 10, 100), 1);
  assert.equal(store.hit('a', 10, 105), 2);
  assert.equal(store.hit('a', 10, 110), 1, 'a new window starts at expiry');
  store.hit('b', 5, 100);
  store.prune(200);
  assert.equal(store.size(), 0);
});

test('assessSignup output is plain JSON', () => {
  const data = guard.createData({ disposableDomains: ['mailinator.com'], ipRanges: [{ cidr: '3.208.0.0/12', provider: 'aws', category: 'cloud' }] });
  const result = guard.assessSignup({ email: 'a@mailinator.com', ip: '3.208.0.1' }, { data });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(result.reasons[1].message, '3.208.0.1 is in a datacenter range: aws (cloud, 3.208.0.0/12).', 'providerName falls back to the id');
});

test('defaults are frozen', () => {
  assert.ok(Object.isFrozen(guard.DEFAULT_WEIGHTS));
  assert.ok(Object.isFrozen(guard.DEFAULT_VELOCITY_RULES));
  assert.ok(Object.isFrozen(guard.PROVIDERS) && Object.isFrozen(guard.PROVIDERS[0].domains));
});
