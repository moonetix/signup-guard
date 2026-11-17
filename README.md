# signup-guard

**Explainable sign-up risk checks for any product: normalized emails, disposable domains, datacenter and Tor addresses, velocity limits, and a score where every point has a written reason.**

[![CI](https://github.com/moonetix/signup-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/moonetix/signup-guard/actions/workflows/ci.yml)
[![Update data](https://github.com/moonetix/signup-guard/actions/workflows/update-data.yml/badge.svg)](https://github.com/moonetix/signup-guard/actions/workflows/update-data.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)](package.json)
[![Node 20+](https://img.shields.io/badge/node-20%2B-339933)](#quick-start)
[![PHP 8.1+](https://img.shields.io/badge/php-8.1%2B-777BB4)](#quick-start)
[![npm](https://img.shields.io/npm/v/%40moonetix%2Fsignup-guard?color=004ABB)](https://www.npmjs.com/package/@moonetix/signup-guard)
[![Packagist](https://img.shields.io/packagist/v/moonetix/signup-guard?color=004ABB)](https://packagist.org/packages/moonetix/signup-guard)

Maintained by [Moonetix](https://moonetix.com).

**[Open the live demo](https://moonetix.github.io/signup-guard/)**: type an email and an IP address and get allow, review or block with every reason, its points and its hint. The library runs in your browser on the bundled data, and nothing is sent anywhere.

Fake accounts are cheap to make, and the cheap ones look alike: a throwaway inbox, a rented server, ten attempts in a minute. signup-guard checks for exactly those traits with public data you can read yourself, and returns a decision together with the reasons behind it. A support agent can read the reasons, a user can be told what to fix, and nothing is decided by a model you cannot inspect.

- **JavaScript:** ESM, Node 20+, zero dependencies, TypeScript declarations.
- **PHP:** 8.1+, zero dependencies, standard extensions only.
- **One spec:** both suites run the same [test vectors](test-vectors/vectors.json), so the two ports give the same answer to the same input.
- **Data you can audit:** the [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) list (CC0) and [moonetix/datacenter-ip-ranges](https://github.com/moonetix/datacenter-ip-ranges), vendored in [`data/`](data/SOURCES.md) and refreshed every week.

## The checks

```mermaid
flowchart TD
    A["Sign-up attempt<br/>email, IP, your own fields"] --> V["VelocityLimiter.check()<br/>one counter per rule: IP, /24 or /64, email"]
    A --> S["assessSignup({ email, ip, velocity })"]
    V -->|velocity result| S
    S --> E["Email<br/>syntax, provider rules, disposable list,<br/>typos, role and free mail"]
    S --> I["IP<br/>special-use, cloud, services,<br/>CDN, Tor, privacy relay"]
    S --> VR["Velocity<br/>rules over their limit"]
    E --> R["reasons: code, points, message, hint<br/>score = sum of points"]
    I --> R
    VR --> R
    R -->|below 30| OK[allow]
    R -->|30 to 69| RV["review<br/>challenge, verify, hold"]
    R -->|70 and up| B["block<br/>show the hints"]
```

| Function | What it does |
| --- | --- |
| `assessSignup(input, options)` | Runs every check and returns `score`, `decision`, `reasons` and the raw results |
| `normalizeEmail(email, options)` | Validates an address and returns the form to check duplicates against |
| `suggestEmail(email, options)` | The corrected address when the domain looks like a typo of a common mailbox (`gmial.com`, `hotmail.con`), else `null` |
| `isRoleAddress(email)` | Whether the address is a shared mailbox such as `admin@`, `info@` or `no-reply@` |
| `isFreeMail(emailOrDomain, options)` | Whether the domain belongs to a free consumer mailbox service |
| `checkDisposable(emailOrDomain, options)` | Disposable list lookup on the domain and every parent domain, with allow and block lists |
| `lookupIp(ip, options)` | Public or special-use, plus every listed range that contains the address |
| `normalizeIp(ip)`, `ipNetwork(ip)` | Canonical address text, and the /24 or /64 it belongs to |
| `new VelocityLimiter({ store, rules })` | Fixed-window attempt counters per IP, network, normalized email or your own field |
| `MemoryStore` | In-process counters for tests and single-process apps |
| `createData`, `loadData`, `dataInfo` | Use your own lists, load a snapshot folder, read snapshot dates and counts |
| `PROVIDERS`, `FREE_MAIL_PROVIDERS`, `MAILBOX_DOMAINS`, `ROLE_LOCAL_PARTS`, `DEFAULT_WEIGHTS`, `DEFAULT_THRESHOLDS`, `DEFAULT_VELOCITY_RULES` | The defaults, as data |
| `parseIp`, `formatIp`, `parseCidr`, `specialRange`, `SPECIAL_RANGES`, `IP_CATEGORIES`, `EMAIL_PROBLEMS` | Lower-level IP parsing, the special-use table, and the `problem` codes `normalizeEmail` can return (`empty`, `non-ascii`, `missing-at`, `multiple-at`, `too-long`, `local-too-long`, `local-invalid`, `domain-literal`, `domain-invalid`) |
| `SignupGuardError` | Thrown for bad arguments, options, rules or data. `code` is one of `invalid_argument`, `invalid_option`, `invalid_rule`, `data_error` |

In PHP the same functions are static methods of `Moonetix\SignupGuard\SignupGuard`, and the limiter is `Moonetix\SignupGuard\VelocityLimiter`. Options use the same names in both languages. PHP throws `SignupGuardException` (an `InvalidArgumentException`) with the same codes in `$e->errorCode`, and adds `exportData`, `loadExported` and `cachedData` for PHP-FPM. The defaults are `SignupGuard::DEFAULT_WEIGHTS`, `SignupGuard::DEFAULT_THRESHOLDS` and `VelocityLimiter::DEFAULT_RULES`; the lower-level helpers live in `Ip` (`parse`, `format`, `parseCidr`, `special`, `SPECIAL`) and `Email` (`PROVIDERS`, `PROBLEMS`, `FREE_MAIL_PROVIDERS`, `MAILBOX_DOMAINS`, `ROLE_LOCAL_PARTS`).

## Install

The JavaScript package is on [npm](https://www.npmjs.com/package/@moonetix/signup-guard) and the PHP package is on [Packagist](https://packagist.org/packages/moonetix/signup-guard):

```bash
npm install @moonetix/signup-guard
composer require moonetix/signup-guard
```

Both packages bundle the data as of their release. The `data/` folder on GitHub is refreshed every week; to follow it between releases, point `loadData(dir)` at a current copy of that folder or install from Git.

Without Composer, `require 'php/autoload.php';` from a copy of the repository.

## Quick start

**JavaScript** ([examples/quickstart.mjs](examples/quickstart.mjs))

```js
import { assessSignup, VelocityLimiter } from '@moonetix/signup-guard';

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
```

```text
review 40
email_normalized +0: Normalized to janedoe@gmail.com (lowercased, domain alias replaced, plus tag removed, dots removed). Check duplicates against this form.
ip_datacenter +40: 3.5.140.2 is in a datacenter range: Amazon Web Services (cloud, 3.5.128.0/19).
janedoe@gmail.com
```

**PHP** ([examples/quickstart.php](examples/quickstart.php))

```php
require 'vendor/autoload.php';

use Moonetix\SignupGuard\SignupGuard;
use Moonetix\SignupGuard\VelocityLimiter;

$limiter = new VelocityLimiter(); // in-memory: PHP-FPM needs a shared store, see "Velocity stores"

$email = 'Jane.Doe+promo@googlemail.com';
$ip = '3.5.140.2';

$velocity = $limiter->check(['now' => time(), 'ip' => $ip, 'email' => $email]);
$result = SignupGuard::assessSignup(['email' => $email, 'ip' => $ip, 'velocity' => $velocity]);

echo $result['decision'], ' ', $result['score'], "\n";
foreach ($result['reasons'] as $r) {
    echo "{$r['code']} +{$r['points']}: {$r['message']}\n";
}
echo $result['email']['normalized'], "\n";
```

The output is the same as above. Store `email.normalized` in a column with a unique index and keep sending mail to the address the user typed.

### Acting on the decision

Each reason carries a `hint` that is safe to show the person signing up. It never names a limit or a list, so an attacker learns nothing they can tune against.

```js
import { assessSignup } from '@moonetix/signup-guard';

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
// ask the user to fix: [ 'Please use a permanent email address.' ]
// [ 'email_disposable' ]
```

| Decision | Suggested action |
| --- | --- |
| `allow` | Create the account. Still verify the email before anything of value. |
| `review` | Prefer soft steps: a bot challenge such as Turnstile, email verification, a hold on rewards or credits until the account has aged, a manual look before the first payout. |
| `block` | Refuse with the hints. Log the reasons, and give people a way to reach a human. |

Whatever the decision, check `result.suggestion` first. When it is not `null`, the domain looks like a typo of a common mailbox, and the `email_typo` reason carries a hint such as `Did you mean jane@gmail.com?`. Ask the person before you create the account, and keep what they typed if they say it is right.

### Building blocks

([examples/building-blocks.mjs](examples/building-blocks.mjs), [examples/building-blocks.php](examples/building-blocks.php))

```js
import { normalizeEmail, suggestEmail, isRoleAddress, isFreeMail, checkDisposable, lookupIp, ipNetwork } from '@moonetix/signup-guard';

normalizeEmail('J.Smith+news@GoogleMail.com').normalized;            // 'jsmith@gmail.com'
normalizeEmail('shop@carol.fastmail.com').normalized;                // 'carol@fastmail.com'
normalizeEmail('erin+tag@outlook.com').normalized;                   // 'erin+tag@outlook.com'
normalizeEmail('erin+tag@outlook.com', { plusTagDomains: ['outlook.com'] }).normalized; // 'erin@outlook.com'
normalizeEmail('kim@@example.org').problem;                          // 'multiple-at'

suggestEmail('jane@gmial.com');                                      // 'jane@gmail.com'
suggestEmail('jane@hotmail.con');                                    // 'jane@hotmail.com'
suggestEmail('jane@example.org');                                    // null
isRoleAddress('No-Reply@example.org');                               // true
isFreeMail('jane@yahoo.co.uk');                                      // true

checkDisposable('x@inbox.mailinator.com');
// { domain: 'inbox.mailinator.com', disposable: true, matchedDomain: 'mailinator.com', source: 'list', allowedBy: null }

const ip = lookupIp('::ffff:3.219.87.128');
[ip.ip, ip.categories, ip.matches.map((m) => m.provider)];          // [ '3.219.87.128', [ 'cloud', 'services' ], [ 'github', 'aws' ] ]
lookupIp('100.64.12.7').special;                                     // { cidr: '100.64.0.0/10', kind: 'cgnat', description: 'a carrier-grade NAT address' }
ipNetwork('2001:db8:abcd:12:ff::1');                                 // '2001:db8:abcd:12::/64'
```

```php
use Moonetix\SignupGuard\SignupGuard as Guard;

Guard::normalizeEmail('J.Smith+news@GoogleMail.com')['normalized'];  // 'jsmith@gmail.com'
Guard::suggestEmail('jane@gmial.com');                              // 'jane@gmail.com'
Guard::isRoleAddress('No-Reply@example.org');                       // true
Guard::isFreeMail('jane@yahoo.co.uk');                              // true
Guard::checkDisposable('x@inbox.mailinator.com')['matchedDomain'];  // 'mailinator.com'
Guard::lookupIp('::ffff:3.219.87.128')['categories'];               // ['cloud', 'services']
Guard::ipNetwork('2001:db8:abcd:12:ff::1');                         // '2001:db8:abcd:12::/64'
```

## Configuration

### Reasons and default weights

The score is the sum of the points of the reasons. Nothing else goes into it. A reason with 0 points still appears, as information for your logs.

| Code | Points | Added when | Hint shown to the user |
| --- | ---: | --- | --- |
| `email_invalid` | 100 | The address fails the syntax check (one `@`, dot-atom local part up to 64 characters, host name with at least two labels, ASCII) | Check the email address for typos. |
| `email_disposable` | 70 | The domain or a parent domain is on the disposable list or your `blockDomains` | Please use a permanent email address. |
| `email_typo` | 0 | `suggestEmail` finds a likely typo of a common mailbox domain; `suggestion` holds the corrected address | Did you mean (the corrected address)? |
| `email_role` | 10 | The part before `@` is a shared mailbox such as `admin`, `info`, `support` or `no-reply` | Please use an email address of your own, not a shared team address. |
| `email_free_mail` | 30 | Only with `freeMail: true`: the domain belongs to a free consumer mailbox service, or is on your `freeMailDomains` | Please use your work email address. |
| `email_normalized` | 0 | Normalization removed a tag or dots or replaced a domain alias | none |
| `ip_datacenter` | 40 | The address is in a `cloud` or `services` range | Turn off your VPN or proxy, or switch to your home or mobile connection, and try again. |
| `ip_tor` | 40 | The address is a Tor exit | Please sign up without Tor. |
| `ip_cdn` | 15 | The address is in a CDN edge range | If you use a VPN or a privacy service, turn it off and try again. |
| `ip_privacy_relay` | 0 | The address is an iCloud Private Relay egress | none |
| `ip_not_public` | 0 | Private, CGNAT, loopback, link-local, documentation or other special-use address | none |
| `ip_invalid` | 0 | The IP string does not parse | none |
| `velocity_ip` | 30 | An `ip` rule is over its limit | Too many attempts. Please try again later. |
| `velocity_network` | 30 | A `network` rule (/24 or /64) is over its limit | same |
| `velocity_email` | 40 | An `email` rule is over its limit | same |
| `velocity_<key>` | 30 | A rule on your own field is over its limit (`velocity_other` sets the default) | same |

Several tripped rules on the same key add one reason, not one per rule. An address that is both a Tor exit and inside a cloud range gets both reasons.

Why these points for the three mailbox reasons:

- **`email_typo`, 0.** A typo is a slip by a real person, not a sign of fraud, so it adds nothing to the score. The reason is there to carry the hint. Some typo domains are registered and receive mail, and a few (`gmial.com`, `hotmial.com`) are on the disposable list, so a typo can come together with `email_disposable`; the typo hint then tells the person what to fix.
- **`email_role`, 10.** A shared mailbox is a common way to open accounts with someone else's work address, and the confirmation email is read by whoever runs that inbox. Ten points never reach `review` alone, but they add up with a CDN hit or a velocity reason.
- **`email_free_mail`, 30.** The check is off unless you pass `freeMail: true`, for products that want a work address. Then a consumer address alone lands in `review`, where you can ask for a work address or look at the account. Set the weight lower to keep it as a label, or 0 for information only.

### `assessSignup` options

| Option | Default | Meaning |
| --- | --- | --- |
| `weights` | `DEFAULT_WEIGHTS` | Points per code, integers from 0 to 1000. Merged over the defaults. `velocity_<yourkey>` and `velocity_other` are accepted. |
| `thresholds` | `{ review: 30, block: 70 }` | `score >= block` is `block`, `score >= review` is `review`. Integers, `1 <= review <= block`. |
| `allowDomains` | `[]` | Domains never treated as disposable, with their subdomains. Wins over both lists. |
| `blockDomains` | `[]` | Extra disposable domains, with their subdomains. |
| `plusTagDomains` | `[]` | Extra domains where `+tag` is removed during normalization. |
| `lowercaseLocal` | `true` | Lowercase the part before `@` for every domain. |
| `mailboxDomains` | `[]` | Extra domains for typo suggestions. They are suggested, and never changed themselves. |
| `freeMail` | `false` | Add `email_free_mail` for addresses at free consumer mailbox services. |
| `freeMailDomains` | `[]` | Extra domains treated as free mail when `freeMail` is on. Exact domains, no subdomains. |
| `data` | bundled snapshot | A data set from `createData()`, `loadData()` or, in PHP, `cachedData()`. |

Input: `{ email, ip, velocity }`, all optional. `velocity` is the result of `VelocityLimiter.check()`. The result also contains `email` (the `normalizeEmail` result), `suggestion` (the `suggestEmail` result), `disposable` and `ip` (the `lookupIp` result), so you can log one object per attempt.

### Velocity rules

| Rule | Key | Limit | Window |
| --- | --- | ---: | --- |
| `ip-hour` | `ip` | 5 | 1 hour |
| `ip-day` | `ip` | 20 | 24 hours |
| `network-day` | `network` | 50 | 24 hours |
| `email-day` | `email` | 5 | 24 hours |

`new VelocityLimiter({ store, rules, keyPrefix })`: `store` defaults to a `MemoryStore`, `rules` to the table above, `keyPrefix` to `"sg:"`. A rule is `{ name, key, limit, windowSeconds }`. `key` is `ip`, `network` (IPv4 /24, IPv6 /64), `email` (the normalized address), or the name of any field you pass to `check()`, such as an app install ID or a phone number. Rules whose value is missing or invalid are skipped, not counted.

`check({ now, ip, email, ...yourFields })` records one attempt for every rule and returns `{ limited, exceeded, results }`, where each result has `rule`, `key`, `value`, `count`, `limit`, `windowSeconds`, `resetAt` and `exceeded`. Call it on every attempt, including the ones that fail validation later, and before you decide.

### Email normalization by provider

A rule is applied only where the provider documents it. Checked on 2026-11-11.

| Provider | Domains | `+tag` removed | Dots removed | Other | Source |
| --- | --- | --- | --- | --- | --- |
| Gmail | gmail.com, googlemail.com | yes | yes | googlemail.com becomes gmail.com | [dots](https://support.google.com/mail/answer/7436150), [+aliases](https://support.google.com/mail/answer/12096), [googlemail](https://support.google.com/mail/answer/10313) |
| Proton Mail | proton.me, protonmail.com, protonmail.ch, pm.me | yes | no | Domains are not merged | [Proton](https://proton.me/support/addresses-and-aliases) |
| Fastmail | fastmail.com, fastmail.fm | yes | no | `tag@user.fastmail.com` becomes `user@fastmail.com` | [Fastmail](https://www.fastmail.help/hc/en-us/articles/360060591053) |
| Yandex Mail | yandex.com, yandex.ru | yes | no | | [yandex.com](https://yandex.com/support/mail/reg.html), [yandex.ru](https://yandex.ru/support/mail/reg.html) |
| Outlook.com | outlook.com, hotmail.com, live.com, msn.com | no | no | Microsoft documents plus addressing for Exchange Online organizations, not for consumer accounts. Opt in with `plusTagDomains`. | [Microsoft Learn](https://learn.microsoft.com/en-us/exchange/recipients-in-exchange-online/plus-addressing-in-exchange-online) |
| iCloud Mail | icloud.com, me.com, mac.com | no | no | Apple documents neither plus addressing nor that `name@me.com` and `name@icloud.com` are always one account | [Apple](https://support.apple.com/en-us/118230) |
| Yahoo Mail | yahoo.com, ymail.com, rocketmail.com | no | no | Disposable addresses are `basename-keyword`, and the base name is chosen apart from the account name, so cutting the keyword does not recover the account | [Yahoo](https://help.yahoo.com/kb/SLN28815.html) |

Zoho Mail, GMX, AOL and Tuta are not in the table: we found no provider documentation either way, so their addresses are only lowercased. Google Workspace and every other custom domain get no provider rules; for Workspace, Google states that dots do change the address. The table is exported as `PROVIDERS`, and a test fails if the two ports drift apart.

### Typos, role addresses and free mail

**Typo suggestions.** `suggestEmail` works offline, on the domain only, and keeps the part before `@` as typed. It returns the first of these that applies, or `null`:

1. The domain is on `MAILBOX_DOMAINS` or your `mailboxDomains`: nothing to fix.
2. The top-level domain is a misspelling that is not a real one (`con`, `cmo`, `ocm`, `vom`, `xom`, `cpm`, `comm`, `coom`, `nte`, `ner`, `nett`, `ogr`, `orgg`): it is fixed on any domain, so `jane@acme.con` becomes `jane@acme.com`. A near miss of a listed domain is then fixed as in step 4, so `gmial.con` becomes `gmail.com`.
3. The top-level domain is a real one that is easy to hit by mistake (`co`, `cm`, `om`, `ne`): it is fixed only when the result is on the list, so `icloud.co` becomes `icloud.com` and `acme.co` stays as it is.
4. Otherwise the first label is compared with the listed domains that have the same rest (`gmial.com` only with `*.com` entries) and the same first letter. The distance is Damerau-Levenshtein (optimal string alignment): a missing, extra or swapped letter counts 1, a wrong letter counts 1 when the two keys sit next to each other on a QWERTY keyboard and 2 otherwise. Names of up to 4 letters are never matched, names of 5 to 7 letters allow 1, longer names 2. When two domains are equally near, there is no suggestion.
5. A domain without a dot gets `.com` or its missing dot back only when that gives a listed domain: `jane@gmail` and `jane@gmailcom` become `jane@gmail.com`.

These rules keep real domains that look like mailbox names alone: `wahoo.com`, `email.com`, `cloud.com` and `libera.it` get no suggestion. Add the domains your own users have, such as a company domain, to `mailboxDomains`: they are suggested for near misses and never changed.

**Role addresses.** `isRoleAddress` and `email_role` look at the part before `@` after normalization, ignore case and a `+tag`, and remove dots, hyphens and underscores, so `No-Reply+alerts@example.org` matches `noreply`. `ROLE_LOCAL_PARTS` holds the mailbox names of [RFC 2142](https://www.rfc-editor.org/rfc/rfc2142) (`info`, `marketing`, `sales`, `support`, `abuse`, `noc`, `security`, `postmaster`, `hostmaster`, `usenet`, `news`, `webmaster`, `www`, `uucp`, `ftp`) and other common shared mailboxes: `accounting`, `accounts`, `admin`, `administrator`, `billing`, `careers`, `contact`, `customerservice`, `donotreply`, `enquiries`, `feedback`, `finance`, `hello`, `help`, `helpdesk`, `hr`, `inquiries`, `jobs`, `legal`, `mailerdaemon`, `media`, `newsletter`, `noreply`, `office`, `orders`, `press`, `privacy`, `root`, `service`, `team`.

**Free mail.** `FREE_MAIL_PROVIDERS` lists consumer webmail services where anyone can open a personal address at no cost, without owning a domain. The check matches exact domains only; `mail.gmail.com` does not match.

| Provider | Domains | Why it is consumer mail |
| --- | --- | --- |
| Gmail | gmail.com, googlemail.com | Free personal Google accounts |
| Outlook.com | outlook.com, hotmail.com, live.com, msn.com, hotmail.co.uk, hotmail.fr, hotmail.de, hotmail.it, hotmail.es, live.co.uk, live.fr, outlook.fr, outlook.de | Microsoft's free personal mail; the country domains belong to personal accounts opened in those countries |
| Yahoo Mail | yahoo.com, ymail.com, rocketmail.com, yahoo.co.uk, yahoo.fr, yahoo.de, yahoo.it, yahoo.es, yahoo.ca, yahoo.co.in, yahoo.com.br | Free personal mail; ymail.com and rocketmail.com are older Yahoo domains |
| iCloud Mail | icloud.com, me.com, mac.com | Comes free with every Apple Account; me.com and mac.com are older addresses of the same service |
| AOL Mail | aol.com | Free personal mail |
| Proton Mail | proton.me, protonmail.com, protonmail.ch, pm.me | Free plan for personal accounts |
| Tuta | tuta.com, tutanota.com, tutanota.de, tutamail.com, tuta.io | Free plan for personal accounts |
| Zoho Mail | zohomail.com, zoho.com | Free personal accounts; business accounts use their own domain |
| GMX | gmx.com, gmx.net, gmx.de, gmx.at, gmx.ch | Free personal mail |
| mail.com | mail.com | Free personal mail |
| WEB.DE | web.de | Free personal mail in Germany |
| Yandex Mail | yandex.com, yandex.ru, ya.ru | Free personal mail of Yandex accounts |
| Mail.ru | mail.ru, bk.ru, list.ru, inbox.ru | Free personal mail; the four domains are offered at sign-up |
| QQ Mail | qq.com | Free mail of Tencent QQ accounts |
| NetEase Mail | 163.com, 126.com | Free personal mail |
| Naver Mail | naver.com | Free mail of Naver accounts |
| Daum Mail | daum.net, hanmail.net | Free mail of Daum accounts; hanmail.net is the older domain |
| Libero Mail | libero.it | Free personal mail in Italy |
| La Poste Mail | laposte.net | Free personal mail of the French postal service |
| Rediffmail | rediffmail.com | Free personal mail in India |
| Seznam Email | seznam.cz | Free personal mail in the Czech Republic |
| Poczta WP | wp.pl | Free personal mail of Wirtualna Polska |

Left out on purpose: Fastmail, which has no free plan; mailboxes that come with an internet or phone subscription, such as comcast.net or orange.fr; and disposable services, which `email_disposable` covers. Add others with `freeMailDomains`. `MAILBOX_DOMAINS` holds every domain above, the `PROVIDERS` domains and the mailboxes of large internet providers. The three lists are exported, and the shared vectors fail if the two ports drift apart.

## The data

| Folder | Source | License | Used for |
| --- | --- | --- | --- |
| [`data/disposable/`](data/disposable) | [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains), `disposable_email_blocklist.conf` | CC0 1.0 ([copy](data/disposable/LICENSE.txt)) | `checkDisposable`, `email_disposable` |
| [`data/ip/`](data/ip) | [moonetix/datacenter-ip-ranges](https://github.com/moonetix/datacenter-ip-ranges), `data/providers/*.txt` | MIT repository; each feed's terms in [`providers.json`](data/ip/providers.json) | `lookupIp`, the `ip_*` reasons |

[`data/SOURCES.md`](data/SOURCES.md) and [`data/manifest.json`](data/manifest.json) record the upstream commit, the update time and the counts. `dataInfo()` returns the same at runtime.

| IP category | Providers | Reason |
| --- | --- | --- |
| `cloud` | AWS, Google Cloud, Oracle Cloud, DigitalOcean, Akamai Cloud (Linode), Vultr | `ip_datacenter` |
| `services` | Google services, GitHub (including Actions runners) | `ip_datacenter` |
| `cdn` | Cloudflare, Fastly | `ip_cdn` |
| `tor` | Tor exit nodes | `ip_tor` |
| `privacy-relay` | iCloud Private Relay egress | `ip_privacy_relay` |

**Weekly update.** [`update-data.yml`](.github/workflows/update-data.yml) runs every Monday and on demand (`workflow_dispatch`). It runs [`scripts/update-data.mjs`](scripts/update-data.mjs), which pins each upstream to its current commit, downloads the files from that commit, parses every line with the library itself, and compares the result with the snapshot. It refuses to write anything when a download fails, a line does not parse, a provider disappears or a list shrinks by more than half. Then both test suites run, and the workflow commits only when `data/` changed. Run it yourself with `npm run update-data`.

**Your own lists.** `createData({ disposableDomains, ipRanges })` builds a data set from arrays (`ipRanges` entries are `{ cidr, provider, providerName, category }`), and `loadData(dir)` reads a folder with the same layout as `data/`. Pass the result as `data`.

## Velocity stores

`MemoryStore` lives in one process. With several Node processes, or with PHP-FPM, use a shared store. A store has one method, `hit(key, ttlSeconds, now)`, that increments a counter, sets its expiry when it is created, and returns the new count. Keys already contain the window start, so the store needs no clock of its own. Both stores below write the same keys, so a Node service and a PHP app can share counters.

**Redis, Node.js** with the official `redis` client ([examples/redis-store.mjs](examples/redis-store.mjs)):

```js
import { createClient } from 'redis';
import { VelocityLimiter } from '@moonetix/signup-guard';

// INCR and EXPIRE in one script, so a counter can never be left without an expiry.
const HIT = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return c`;

const redis = await createClient({ url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' }).connect();

const limiter = new VelocityLimiter({
  store: { hit: (key, ttlSeconds) => redis.eval(HIT, { keys: [key], arguments: [String(ttlSeconds)] }) },
});
```

**Redis, PHP** with phpredis ([examples/redis-store.php](examples/redis-store.php)):

```php
use Moonetix\SignupGuard\VelocityLimiter;
use Moonetix\SignupGuard\VelocityStore;

final class RedisVelocityStore implements VelocityStore
{
    // INCR and EXPIRE in one script, so a counter can never be left without an expiry.
    private const HIT = "local c = redis.call('INCR', KEYS[1])\nif c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end\nreturn c";

    public function __construct(private Redis $redis)
    {
    }

    public function hit(string $key, int $ttlSeconds, int $now): int
    {
        return (int)$this->redis->eval(self::HIT, [$key, $ttlSeconds], 1);
    }
}

$redis = new Redis();
$redis->connect(getenv('REDIS_HOST') ?: '127.0.0.1', (int)(getenv('REDIS_PORT') ?: 6379));
$limiter = new VelocityLimiter(store: new RedisVelocityStore($redis));
```

A SQL table works too: a primary key on `key`, an upsert that increments `count`, and a periodic delete of expired rows.

## Framework examples

Each example names in its first lines what to install; none of it is a dependency of the package.

| Example | What it shows |
| --- | --- |
| [examples/express-middleware.mjs](examples/express-middleware.mjs) | Express 5 middleware on a sign-up route: `block` answers 422 with the hints, a likely typo answers 409 with the suggestion, `review` creates the account on hold (202), `allow` creates it (201). `trust proxy` is set to the number of proxies in front of the app, so `req.ip` is the client address. |
| [examples/nextjs-route.mjs](examples/nextjs-route.mjs) | A Next.js App Router route handler with the same mapping. It runs on the Node.js runtime, because the library reads its data from disk, and takes the client address from the `X-Forwarded-For` entry your own proxy added. |
| [examples/laravel/](examples/laravel) | A validation rule for the email field of a `FormRequest`, velocity counters in the Laravel cache, and a [README](examples/laravel/README.md) with the request and controller code. |

All three count the attempt before they judge it, and all three depend on reading the right client address: see [False positives and other pitfalls](#false-positives-and-other-pitfalls). An in-memory `VelocityLimiter` is per process; on serverless platforms or with several servers, give it a shared store.

## PHP-FPM: load the data once

Parsing the snapshot takes about 190 ms and 32 MB in PHP. That is fine for a CLI job and wasteful on every web request. `cachedData()` writes the parsed tables as a PHP file that holds only literals, which OPcache keeps in shared memory, and rebuilds it when the snapshot changes ([examples/fpm-cache.php](examples/fpm-cache.php)):

```php
use Moonetix\SignupGuard\SignupGuard;

// First call builds a literal-only PHP file; after that OPcache serves it from shared memory.
$data = SignupGuard::cachedData(sys_get_temp_dir() . '/signup-guard-data.php');

$result = SignupGuard::assessSignup(['email' => 'temp123@mailinator.com', 'ip' => '81.2.69.142'], ['data' => $data]);
echo $result['decision'], ' ', $result['score'], "\n"; // block 70
```

With OPcache enabled, a full `assessSignup` including the data load measured about 0.4 ms per request on PHP 8.4. Point the cache file at a directory the PHP user can write and nobody else can. In Node.js the data loads once per process (about 200 ms) and lookups take a few microseconds.

## How it works

1. `VelocityLimiter.check()` derives the values for each rule (canonical IP, /24 or /64, normalized email, your fields) and increments one counter per rule in the current fixed window. The window start is part of the key, so counters expire on their own.
2. `normalizeEmail` trims ASCII whitespace, rejects anything that is not a plain ASCII address, lowercases, then applies the documented provider rules: subdomain tags, domain aliases, `+tags`, dots.
3. `checkDisposable` takes the domain and tests it and each parent domain (never the bare TLD) against your allow list, your block list, then the snapshot.
4. `lookupIp` parses IPv4 and IPv6 strictly (no octal-looking parts, no zone IDs), turns IPv4-mapped IPv6 into IPv4, and checks the special-use ranges first. A private or CGNAT address is reported as not public and never matched against provider ranges.
5. Public addresses go through a binary search over ranges sorted by start, followed by a short walk back for ranges that nest across providers, such as a GitHub block inside an AWS block. Every containing range is returned, most specific first.
6. `assessSignup` turns each finding into a reason with a code, points, a message for you and a hint for the user. The score is the sum of the points, compared with two thresholds.
7. Both ports keep addresses as exact integers or fixed-width bytes, so there is no floating point anywhere, and the shared vectors pin every message string.

## False positives and other pitfalls

Every signal here also fires for honest people sometimes. The defaults are set so that no network signal blocks on its own; a block needs either a bad email or several signals together.

- **Read the right client IP.** Behind a load balancer or CDN, the socket address is the proxy. Take the client address from the header your own proxy sets (for example `CF-Connecting-IP` behind Cloudflare), and never trust `X-Forwarded-For` from the open internet. If many users show up with `ip_not_public`, this is why.
- **Carrier-grade NAT and mobile networks.** Mobile carriers put thousands of subscribers behind a few public IPv4 addresses. Keep per-IP limits generous and count attempts, not accounts.
- **Universities, offices, hotels.** One /24 can be a whole campus. The default `network-day` limit is 50 for that reason; raise it if your audience is students.
- **IPv6.** One home usually gets a whole /64, and rotating within it is free. Per-IP limits on IPv6 are weak, which is why the `network` key groups by /64.
- **iCloud Private Relay.** Safari users on iCloud+ browse through Apple's relay addresses. They are real people, so the reason carries 0 points by default. Private Relay is one of the most common causes of a false VPN warning; see [VPN or proxy detected](https://moonetix.com/academy/traffic-quality/vpn-proxy-detected-offerwall).
- **CDN ranges.** People rarely browse from Cloudflare or Fastly edge addresses, so a hit usually means a proxy or worker in front of the browser. Cloudflare WARP users are not matched: WARP exits from addresses outside Cloudflare's published ranges. The default weight is low (15); check your own logs before raising it.
- **Corporate and school networks.** Company VPN gateways and secure web proxies often run in cloud regions, and Google's service ranges cover some Google-operated proxies and fetchers. A datacenter match alone lands in `review`, not `block`, for that reason.
- **Residential proxies are invisible here.** They route through home connections and are in no provider list. Range checks stop the cheapest automation; slow attacks spread over residential addresses need behavior signals and checks at payout. See [What is a residential proxy?](https://moonetix.com/academy/glossary/what-is-a-residential-proxy).
- **The disposable list is not perfect.** The maintainers say they cannot guarantee every entry is still disposable. Keep `allowDomains` for the ones your users prove wrong, and `blockDomains` for new ones you find.
- **Role addresses belong to people too.** Some people really do use `info@` of their one-person business, and old Gmail accounts named `admin` exist. That is why `email_role` has 10 points and no block.
- **Typo suggestions are guesses.** `suggestEmail` only knows the domains on its list and your `mailboxDomains`. Offer the suggestion and let the person keep what they typed.
- **Free mail is not a fraud signal.** Most honest people sign up with a consumer address. Turn on `freeMail` only when your product needs a work address.
- **Normalize for duplicates, not for mail.** Send to the address the user typed. Gmail rules apply only to gmail.com and googlemail.com; a Workspace domain on Google's servers keeps its dots.
- **Fixed windows allow bursts at the edge.** A client can use a full limit at 00:59 and another at 01:00. Pair a short window with a longer one, as the defaults do.
- **Tell people what to fix.** Show the `hint`, not the score or the rule. Keep an appeal path to a person, and look at what appeals overturn: a rule that keeps losing appeals needs a lower weight.
- **Mind what you store.** Velocity keys contain IPs and emails for at most the window length. If that is too much for your privacy policy, pass a keyed hash as a custom field and use it as the rule key instead of `email`.

[What is IP reputation?](https://moonetix.com/academy/glossary/what-is-ip-reputation) covers shared addresses and fair handling in more depth.

## What signup-guard does not do

- **No device fingerprinting.** It reads an email address and an IP address, and anything else only if you pass it as a velocity field.
- **No network calls at runtime.** Every check is local. Downloads happen only in the update script, on your schedule.
- **No MX or SMTP checks.** They are slow, they fail during DNS outages, and a working inbox proves little. Send a verification email instead.
- **No bot challenge.** Use Turnstile, hCaptcha or reCAPTCHA, verified on your server, for the `review` band.
- **No machine learning.** Weights are integers in a table you can read and change.

## Common errors

| You see | Cause and fix |
| --- | --- |
| `velocity must be the result of VelocityLimiter.check()` | In Node, `check()` is async and you passed the Promise. `await` it first. |
| `now must be a non-negative integer (Unix seconds)` | `now` is missing or not an integer. Use `Math.floor(Date.now() / 1000)` or `time()`. |
| Velocity limits never trip, and no error | `now` is in milliseconds (`Date.now()`). It passes the integer check, but every window becomes 1,000 times shorter, so a one-hour rule resets every 3.6 seconds. Divide by 1000. |
| `Unknown reason code "..."` | `weights` accepts only the codes in the table above, plus `velocity_<yourkey>` and `velocity_other`. |
| `thresholds must be integers with 1 <= review <= block` | A threshold is not an integer, `review` is below 1, or `review` ends up above `block`. A single key is merged over the defaults, so `{ review: 80 }` alone fails against the default `block: 70`. |
| `store.hit must return the new count as a positive integer` | Your store returned a string, nothing, or 0. Cast the Redis reply to an integer, as the PHP store above does. |
| `Cannot write /path/to/cache.php` (PHP) | `cachedData()` could not write next to the cache file. Use a directory the PHP-FPM user owns. |
| `Cannot read <dir>/ip/providers.json` (PHP), `ENOENT ... ip/providers.json` (Node) | `loadData(dir)` points at a folder without the `data/` layout. Copy the whole `data/` folder, not only the lists. |

Errors thrown by the library are `SignupGuardError` in Node and `SignupGuardException` in PHP, with the same `code` in both. Bad input from users never throws: an unparsable email or IP becomes an `email_invalid` or `ip_invalid` reason.

## Tests

```bash
npm test                  # node --test: shared vectors, API tests, checks on the bundled snapshot
php php/tests/run.php     # shared vectors, PHP-specific checks, the same snapshot checks
```

`test-vectors/vectors.json` holds 294 cases: email syntax and provider rules, typo suggestions, role addresses and free mail with the exported lists, IPv4 and IPv6 parsing and RFC 5952 formatting, CIDR edges, nested ranges, special-use ranges, disposable matching with allow and block lists, velocity windows and their boundaries, and full assessments with every message string. They run against a small fixture data set inside the file, never the snapshot, so a weekly data update cannot break them. CI runs both suites on Node 20 and 22 and PHP 8.1 and 8.4, runs every example, and runs the Redis examples against a Redis service.

`npm run site` builds the [demo page](https://moonetix.github.io/signup-guard/) into `_site/`: the files of `src/` for the browser and the snapshot as two static files. The examples on the page are test vectors, and the build stops with an error when one of them no longer returns its decision, score and reasons on the current snapshot.

## Further reading

- Moonetix Academy: [How to stop fake signups](https://moonetix.com/academy/traffic-quality/stop-fake-signups-rewards-site), [Stop multi-accounting and VPN abuse](https://moonetix.com/academy/traffic-quality/stop-multi-accounting-vpn-abuse), [What is IP reputation?](https://moonetix.com/academy/glossary/what-is-ip-reputation), [What is a residential proxy?](https://moonetix.com/academy/glossary/what-is-a-residential-proxy), [VPN or proxy detected](https://moonetix.com/academy/traffic-quality/vpn-proxy-detected-offerwall), [How to prevent referral fraud](https://moonetix.com/academy/traffic-quality/prevent-referral-fraud)
- Data: [moonetix/datacenter-ip-ranges](https://github.com/moonetix/datacenter-ip-ranges), [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)

## About Moonetix

Moonetix is an affiliate network. Publishers add its offerwall to an app, game, website, bot or community, and users earn the publisher's own currency by completing offers.

Other open source from Moonetix: [reward-economy-kit](https://github.com/moonetix/reward-economy-kit), [country-tiers](https://github.com/moonetix/country-tiers), [datacenter-ip-ranges](https://github.com/moonetix/datacenter-ip-ranges), [offerwall-fraud-playbook](https://github.com/moonetix/offerwall-fraud-playbook), [referral-engine](https://github.com/moonetix/referral-engine), [gamification-kit](https://github.com/moonetix/gamification-kit), [awesome-offerwalls](https://github.com/moonetix/awesome-offerwalls), [offerwall-postback-handlers](https://github.com/moonetix/offerwall-postback-handlers).

## License

MIT. See [LICENSE](LICENSE). The vendored data keeps its own terms, listed in [data/SOURCES.md](data/SOURCES.md).
