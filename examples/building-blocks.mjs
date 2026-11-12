import { normalizeEmail, checkDisposable, lookupIp, ipNetwork, dataInfo } from 'signup-guard';

console.log(normalizeEmail('J.Smith+news@GoogleMail.com').normalized);
console.log(normalizeEmail('shop@carol.fastmail.com').normalized);
console.log(normalizeEmail('erin+tag@outlook.com').normalized);
console.log(normalizeEmail('erin+tag@outlook.com', { plusTagDomains: ['outlook.com'] }).normalized);
console.log(normalizeEmail('kim@@example.org').problem);

console.log(checkDisposable('x@inbox.mailinator.com'));
console.log(checkDisposable('x@mailinator.com', { allowDomains: ['mailinator.com'] }).disposable);

const ip = lookupIp('::ffff:3.219.87.128');
console.log(ip.ip, ip.categories, ip.matches.map((m) => m.provider));
console.log(lookupIp('100.64.12.7').special);
console.log(ipNetwork('2001:db8:abcd:12:ff::1'));

console.log(dataInfo().disposable.commit.length, dataInfo().counts.ipv4Ranges > 0);
