import { assessSignup } from 'signup-guard';

const result = assessSignup({ email: 'temp123@mailinator.com', ip: '81.2.69.142' });

if (result.decision === 'allow') {
  console.log('create the account');
} else if (result.decision === 'review') {
  console.log('create it, but require a challenge and a verified email before it can do anything valuable');
} else {
  const hints = [...new Set(result.reasons.map((r) => r.hint).filter(Boolean))];
  console.log('ask the user to fix:', hints);
}
console.log(result.reasons.map((r) => r.code));
