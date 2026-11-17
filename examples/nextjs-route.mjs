// Next.js App Router route handler, for example app/api/signup/route.js.
// Needs Next.js 14 or later: npm install next @moonetix/signup-guard
import { assessSignup, VelocityLimiter } from '@moonetix/signup-guard';

// The library reads its data files from disk, so the route runs on Node.js, not on the Edge runtime.
export const runtime = 'nodejs';

// One limiter per server instance. Serverless platforms start many instances, so use a shared
// store such as Redis there (see "Velocity stores" in the README).
const limiter = new VelocityLimiter();

// How many proxies you run in front of the app that append to X-Forwarded-For. Vercel and most
// load balancers count as 1. The entries left of those were written by the client and can be faked.
const TRUSTED_PROXIES = 1;

/** The client address as your own proxy saw it, or null. */
function clientIp(headers) {
  // Behind Cloudflare, read headers.get('cf-connecting-ip') instead.
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    return hops[hops.length - TRUSTED_PROXIES] ?? null;
  }
  return headers.get('x-real-ip');
}

const hintsOf = (result) => [...new Set(result.reasons.map((r) => r.hint).filter(Boolean))];

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email : null;
  const ip = clientIp(request.headers);
  const now = Math.floor(Date.now() / 1000);

  const velocity = await limiter.check({ now, ip, email });
  if (email === null) return Response.json({ error: 'email_required' }, { status: 400 });
  const result = assessSignup({ email, ip, velocity });

  if (result.decision === 'block') {
    return Response.json({ error: 'signup_refused', hints: hintsOf(result) }, { status: 422 });
  }
  if (result.suggestion !== null && body.confirmEmail !== true) {
    return Response.json({ error: 'email_typo', suggestion: result.suggestion }, { status: 409 });
  }

  const user = { email, normalizedEmail: result.email.normalized };
  if (result.decision === 'review') {
    // Create the account, but hold it until the email is verified and a challenge is passed.
    return Response.json({ status: 'pending_verification', user }, { status: 202 });
  }
  return Response.json({ status: 'created', user }, { status: 201 });
}
