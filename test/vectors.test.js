import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as guard from '../src/index.js';

const vectors = JSON.parse(readFileSync(new URL('../test-vectors/vectors.json', import.meta.url), 'utf8'));
const data = guard.createData(vectors.fixture);

function outcome(fn) {
  try {
    return { out: fn() };
  } catch (err) {
    if (err instanceof guard.SignupGuardError) return { throws: err.code };
    throw err;
  }
}

async function velocityScenario(s) {
  let limiter;
  try {
    limiter = new guard.VelocityLimiter({ store: new guard.MemoryStore(), ...(s.rules ? { rules: s.rules } : {}) });
  } catch (err) {
    if (err instanceof guard.SignupGuardError) return { throws: err.code };
    throw err;
  }
  const steps = [];
  for (const step of s.steps) {
    try {
      steps.push({ input: step.input, out: await limiter.check(step.input) });
    } catch (err) {
      if (!(err instanceof guard.SignupGuardError)) throw err;
      steps.push({ input: step.input, throws: err.code });
    }
  }
  return { steps };
}

const runners = {
  providers: () => ({ out: guard.PROVIDERS.map((p) => ({ ...p, domains: [...p.domains], sources: [...p.sources] })) }),
  normalizeEmail: (c) => outcome(() => guard.normalizeEmail(c.in, c.options)),
  normalizeIp: (c) => outcome(() => guard.normalizeIp(c.in)),
  ipNetwork: (c) => outcome(() => guard.ipNetwork(c.in)),
  parseCidr: (c) => outcome(() => guard.parseCidr(c.in).cidr),
  lookupIp: (c) => outcome(() => guard.lookupIp(c.in, { data })),
  checkDisposable: (c) => outcome(() => guard.checkDisposable(c.in, { ...c.options, data })),
  assessSignup: (c) => outcome(() => guard.assessSignup(c.input, { ...c.options, data })),
};

for (const [group, run] of Object.entries(runners)) {
  test(`vectors: ${group}`, () => {
    const cases = vectors[group];
    assert.ok(Array.isArray(cases) && cases.length > 0, `no vectors for ${group}`);
    cases.forEach((c, i) => {
      const label = `${group}[${i}] ${c.name ?? JSON.stringify(c.in)}`;
      const expected = 'throws' in c ? { throws: c.throws } : { out: c.out };
      assert.deepEqual(run(c), expected, label);
    });
  });
}

test('vectors: velocity', async () => {
  assert.ok(vectors.velocity.length > 0);
  for (const s of vectors.velocity) {
    const expected = 'throws' in s ? { throws: s.throws } : { steps: s.steps };
    assert.deepEqual(await velocityScenario(s), expected, s.name);
  }
});

test('every vector group has a runner', () => {
  const groups = Object.keys(vectors).filter((k) => Array.isArray(vectors[k]));
  assert.deepEqual(groups.sort(), [...Object.keys(runners), 'velocity'].sort());
});
