// Needs Express 5: npm install express@5 @moonetix/signup-guard
import express from 'express';
import { assessSignup, VelocityLimiter } from '@moonetix/signup-guard';

const app = express();

// req.ip is the socket address unless Express knows how many proxies sit in front of the app.
// With one load balancer or CDN, 1 makes req.ip the address that proxy saw. Never use true here:
// Express would then trust any X-Forwarded-For a client sends.
app.set('trust proxy', 1);
app.use(express.json());

// In-memory counters work for one process. With several processes, use a shared store
// (see "Velocity stores" in the README).
const limiter = new VelocityLimiter();

const hintsOf = (result) => [...new Set(result.reasons.map((r) => r.hint).filter(Boolean))];

/** Scores the attempt, answers block and typos itself, and leaves allow and review to the route. */
export function signupGuard({ field = 'email' } = {}) {
  return async (req, res, next) => {
    const email = typeof req.body?.[field] === 'string' ? req.body[field] : null;
    const ip = req.ip ?? null;
    const now = Math.floor(Date.now() / 1000);
    const velocity = await limiter.check({ now, ip, email });
    if (email === null) return res.status(400).json({ error: 'email_required' });
    const result = assessSignup({ email, ip, velocity });
    req.signupGuard = result;

    if (result.decision === 'block') {
      return res.status(422).json({ error: 'signup_refused', hints: hintsOf(result) });
    }
    if (result.suggestion !== null && req.body.confirmEmail !== true) {
      // Ask once. The form sends confirmEmail: true when the person keeps what they typed.
      return res.status(409).json({ error: 'email_typo', suggestion: result.suggestion });
    }
    return next();
  };
}

app.post('/signup', signupGuard(), async (req, res) => {
  const result = req.signupGuard;
  const user = { email: req.body.email, normalizedEmail: result.email.normalized };

  if (result.decision === 'review') {
    // Create the account, but hold it until the email is verified and a challenge is passed.
    console.log('review', result.score, result.reasons.map((r) => r.code));
    return res.status(202).json({ status: 'pending_verification', user });
  }
  return res.status(201).json({ status: 'created', user });
});

app.listen(3000, () => console.log('listening on http://localhost:3000'));
