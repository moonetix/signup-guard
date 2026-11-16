# Data sources

This folder is a snapshot of two upstream lists. `scripts/update-data.mjs` refreshes it every week and rewrites this file only when the data changes.

## Disposable email domains

| | |
| --- | --- |
| Source | [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains), `disposable_email_blocklist.conf` |
| License | CC0 1.0 Universal, see [disposable/LICENSE.txt](disposable/LICENSE.txt) |
| Commit | [`3cb930c9fdbb`](https://github.com/disposable-email-domains/disposable-email-domains/commit/3cb930c9fdbbc271d8dd84709bb6bc9364f629d8) |
| Updated | 2026-11-16T06:47:20Z |
| Domains | 10274 |

Entries are registrable domains (or the third level under a public suffix). A listed domain also matches its subdomains. Upstream notes that it cannot guarantee every entry is still disposable, so keep your own allow list.

## IP ranges

| | |
| --- | --- |
| Source | [moonetix/datacenter-ip-ranges](https://github.com/moonetix/datacenter-ip-ranges), `data/providers/*.txt` |
| License | MIT for the repository; feed terms per provider in ip/providers.json |
| Commit | [`5da0eaab3cdf`](https://github.com/moonetix/datacenter-ip-ranges/commit/5da0eaab3cdf7dba0e5b9a7eb7dd0352e221d1f4) |
| Updated | 2026-11-16T06:47:20Z |
| Ranges | 12034 IPv4, 15740 IPv6 |

| Provider | File | Category | IPv4 | IPv6 | Terms |
| --- | --- | --- | ---: | ---: | --- |
| Amazon Web Services | `aws` | cloud | 1752 | 2363 | Published by AWS for allow lists and filtering. No license is stated. |
| Google Cloud | `google-cloud` | cloud | 467 | 28 | Published by Google for allow lists and filtering. No license is stated. |
| Google services (excluding Google Cloud) | `google-services` | services | 297 | 98 | Published by Google for allow lists and filtering. No license is stated. |
| Oracle Cloud Infrastructure | `oracle-cloud` | cloud | 809 | 0 | Published by Oracle in its public documentation. No license is stated. |
| DigitalOcean | `digitalocean` | cloud | 187 | 54 | Self-published RFC 8805 geofeed, linked from the DigitalOcean docs. No license is stated. |
| Akamai Cloud (Linode) | `linode` | cloud | 240 | 39 | Self-published RFC 8805 geofeed, referenced in the Linode network records at ARIN. No license is stated. |
| Vultr | `vultr` | cloud | 121 | 21 | Self-published RFC 8805 geofeed of AS20473, referenced in the Vultr network records at ARIN. No license is stated. |
| Cloudflare | `cloudflare` | cdn | 15 | 7 | Published by Cloudflare for allow lists. No license is stated. |
| Fastly | `fastly` | cdn | 21 | 3 | Public, unauthenticated Fastly API endpoint. No license is stated. |
| GitHub (incl. Actions runners) | `github` | services | 4025 | 2547 | GitHub REST API, covered by the GitHub Terms of Service (API Terms). |
| iCloud Private Relay egress | `icloud-private-relay` | privacy-relay | 3414 | 10580 | Published by Apple for geolocation and server operators. No license is stated. |
| Tor exit nodes | `tor` | tor | 686 | 0 | Tor Project data, CC0 1.0 (no copyright). |
