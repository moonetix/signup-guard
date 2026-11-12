import { assessSignup, VelocityLimiter } from 'signup-guard';

const limiter = new VelocityLimiter(); // in-memory: fine for one process, see "Velocity stores" otherwise

async function screenSignup({ email, ip }) {
  const now = Math.floor(Date.now() / 1000);
  const velocity = await limiter.check({ now, ip, email }); // count the attempt before you judge it
  return assessSignup({ email, ip, velocity });
}

const result = await screenSignup({ email: 'Jane.Doe+promo@googlemail.com', ip: '3.5.140.2' });

console.log(result.decision, result.score);
for (const r of result.reasons) console.log(`${r.code} +${r.points}: ${r.message}`);
console.log(result.email.normalized);
