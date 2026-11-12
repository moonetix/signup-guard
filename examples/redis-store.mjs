// Needs the node-redis client: npm install redis@6.3.0
import { createClient } from 'redis';
import { VelocityLimiter } from 'signup-guard';

// INCR and EXPIRE in one script, so a counter can never be left without an expiry.
const HIT = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return c`;

const redis = await createClient({ url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' }).connect();

const limiter = new VelocityLimiter({
  store: { hit: (key, ttlSeconds) => redis.eval(HIT, { keys: [key], arguments: [String(ttlSeconds)] }) },
});

const now = Math.floor(Date.now() / 1000);
const first = await limiter.check({ now, ip: '198.51.100.7', email: 'sam@example.com' });
console.log(first.results.map((r) => `${r.rule}=${r.count}`).join(' '));

await redis.quit();
