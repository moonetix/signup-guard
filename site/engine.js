// The browser entry of the demo: the library from lib/ (a copy of src/), the data
// snapshot fetched as two static files, and one VelocityLimiter for the page.
// It adds no checks of its own.

import { DEFAULT_THRESHOLDS, DEFAULT_VELOCITY_RULES, VelocityLimiter, assessSignup, createData } from './lib/index.js';
import { parseSnapshot } from './snapshot.js';

let data = null;
let limiter = new VelocityLimiter();

async function fetchText(path) {
  const res = await fetch(new URL(path, import.meta.url));
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.text();
}

export async function load(read = fetchText) {
  const started = performance.now();
  const [ip, disposable] = await Promise.all([read('snapshot/ip.json'), read('snapshot/disposable.txt')]);
  const fetched = performance.now();
  data = createData(parseSnapshot(JSON.parse(ip), disposable));
  return {
    counts: data.counts,
    info: data.info,
    thresholds: { ...DEFAULT_THRESHOLDS },
    rules: DEFAULT_VELOCITY_RULES.map((rule) => ({ ...rule })),
    fetchMs: Math.round(fetched - started),
    buildMs: Math.round(performance.now() - fetched),
  };
}

// Scores one attempt the way the quick start in the README does: with `count`, the
// attempt is recorded by the limiter first and the velocity result goes into the
// assessment. An input may also bring its own velocity result.
export async function score(input, { count = false, now = Math.floor(Date.now() / 1000) } = {}) {
  if (data === null) throw new Error('The data snapshot is not loaded yet.');
  const attempt = { ...input };
  if (count) attempt.velocity = await limiter.check({ now, ip: attempt.ip, email: attempt.email });
  const started = performance.now();
  const result = assessSignup(attempt, { data });
  return { result, velocity: attempt.velocity ?? null, ms: performance.now() - started };
}

export function reset() {
  limiter = new VelocityLimiter();
}
