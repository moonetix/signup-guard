# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Weekly data refreshes in `data/` are not listed here; `data/SOURCES.md` records each one.

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

[1.0.0]: https://github.com/moonetix/signup-guard/releases/tag/v1.0.0
