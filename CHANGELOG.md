# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Weekly data refreshes in `data/` are not listed here; `data/SOURCES.md` records each one.

## [1.2.0] - 2026-11-17

### Added

- `suggestEmail(email, options)` (PHP `SignupGuard::suggestEmail`): an offline suggestion for likely typos of common mailbox domains and top-level domains, such as `gmial.com`, `hotmail.con` or `icloud.co`. It returns the corrected address or `null`, never changes a domain on its list, and leaves short names alone. The `mailboxDomains` option adds your own domains.
- `isRoleAddress(email)` and `isFreeMail(emailOrDomain, options)`, with the lists behind them exported as `ROLE_LOCAL_PARTS`, `FREE_MAIL_PROVIDERS` and `MAILBOX_DOMAINS` (PHP: `Email::ROLE_LOCAL_PARTS`, `Email::FREE_MAIL_PROVIDERS`, `Email::MAILBOX_DOMAINS`).
- Three reasons in `assessSignup`: `email_typo` (0 points, the hint holds the suggested address), `email_role` (10 points, shared mailboxes such as `admin@`, `info@` and `no-reply@`) and `email_free_mail` (30 points, only with the new `freeMail: true` option, for products that want a work address). `freeMailDomains` adds domains to the free mail check.
- Framework examples: an Express middleware, a Next.js App Router route handler, and a Laravel validation rule with a cache-backed velocity store. They add no dependencies to the packages.
- Test vectors for typo suggestions, role addresses, free mail and the three lists; the shared vectors now hold 294 cases. The demo page shows the typo suggestion, has a role address and a typo example, and can turn on `freeMail`.

### Changed

- The result of `assessSignup` has a `suggestion` field: the corrected address when the domain looks like a typo, otherwise `null`.
- `DEFAULT_WEIGHTS` lists the three new codes. A role address now adds 10 points by default; set `weights: { email_role: 0 }` to keep the scores of 1.1.0.

## [1.1.0] - 2026-11-16

### Changed

- The JavaScript package is on npm as [`@moonetix/signup-guard`](https://www.npmjs.com/package/@moonetix/signup-guard); the unscoped name belongs to another project. Imports change from `signup-guard` to `@moonetix/signup-guard`. Both packages bundle the data as of their release; the README says how to follow the weekly data between releases.

### Added

- A [demo page](https://moonetix.github.io/signup-guard/) that runs the JavaScript library in the browser: type an email and an IP address and read the decision, the score and every reason with its points, message and hint. The page uses the files of `src/` and the snapshot in `data/`, packed into two static files; nothing typed there is sent anywhere.
- `npm run site` builds the page. It checks that the packed snapshot rebuilds the bundled data set entry for entry, and fails when an example on the page, each one a test vector, no longer returns its decision, score and reasons on the current snapshot.

## [1.0.0] - 2026-11-11

### Added

- JavaScript (ESM, Node 20+) and PHP 8.1+ implementations with the same API, options and messages.
- `assessSignup`: a score made only of named reasons, each with points, a message for operators and a hint for the user, and `allow`, `review` or `block` from two thresholds.
- `normalizeEmail`: syntax check and documented provider rules for Gmail, Proton Mail, Fastmail and Yandex, with Outlook.com, iCloud Mail and Yahoo Mail listed and left unchanged, plus `plusTagDomains` and `lowercaseLocal` options.
- `checkDisposable`: the disposable-email-domains list (CC0), matched on every parent domain, with allow and block lists.
- `lookupIp`, `normalizeIp`, `ipNetwork`: strict IPv4 and IPv6 parsing, RFC 5952 output, special-use ranges, and provider ranges from moonetix/datacenter-ip-ranges in five categories (cloud, services, cdn, tor, privacy-relay).
- `VelocityLimiter` with fixed windows per IP, /24 or /64, normalized email or any field, a `MemoryStore`, and Redis store examples for Node.js and PHP.
- PHP `exportData`, `loadExported` and `cachedData`, so PHP-FPM loads the data from OPcache instead of parsing it on every request.
- `scripts/update-data.mjs` and a weekly `update-data` workflow that refuses broken or shrunken upstream data and commits only on change.
- Shared test vectors in `test-vectors/vectors.json`, run by both test suites against fixture data.
- TypeScript declarations in `src/index.d.ts`.

[Unreleased]: https://github.com/moonetix/signup-guard/compare/v1.1.0...HEAD
[1.2.0]: https://github.com/moonetix/signup-guard/releases/tag/v1.2.0
[1.1.0]: https://github.com/moonetix/signup-guard/releases/tag/v1.1.0
[1.0.0]: https://github.com/moonetix/signup-guard/releases/tag/v1.0.0
