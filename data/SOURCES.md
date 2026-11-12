# Data sources

This folder is a snapshot of two upstream lists. `scripts/update-data.mjs` refreshes it every week and rewrites this file only when the data changes.

## Disposable email domains

| | |
| --- | --- |
| Source | [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains), `disposable_email_blocklist.conf` |
| License | CC0 1.0 Universal, see [disposable/LICENSE.txt](disposable/LICENSE.txt) |
| Commit | [`ba992a0b4c86`](https://github.com/disposable-email-domains/disposable-email-domains/commit/ba992a0b4c867db3ff39605696bb7de9fbb2e11f) |
| Updated | 2026-11-11T20:09:47Z |
| Domains | 10181 |

Entries are registrable domains (or the third level under a public suffix). A listed domain also matches its subdomains. Upstream notes that it cannot guarantee every entry is still disposable, so keep your own allow list.

## IP ranges

| | |
| --- | --- |
| Source | [moonetix/datacenter-ip-ranges](https://github.com/moonetix/datacenter-ip-ranges), `data/providers/*.txt` |
| License | MIT for the repository; feed terms per provider in ip/providers.json |
| Commit | [`35c2997f0d8d`](https://github.com/moonetix/datacenter-ip-ranges/commit/35c2997f0d8d027786da98dbd3c438f784756a93) |
| Updated | 2026-11-12T20:53:46Z |
| Ranges | 12067 IPv4, 15743 IPv6 |

| Provider | File | Category | IPv4 | IPv6 | Terms |
| --- | --- | --- | ---: | ---: | --- |
| Amazon Web Services | `aws` | cloud | 1755 | 2364 | Published by AWS for allow lists and filtering. No license is stated. |
| Google Cloud | `google-cloud` | cloud | 467 | 28 | Published by Google for allow lists and filtering. No license is stated. |
| Google services (excluding Google Cloud) | `google-services` | services | 297 | 98 | Published by Google for allow lists and filtering. No license is stated. |
| Oracle Cloud Infrastructure | `oracle-cloud` | cloud | 809 | 0 | Published by Oracle in its public documentation. No license is stated. |
| DigitalOcean | `digitalocean` | cloud | 187 | 54 | Self-published RFC 8805 geofeed, linked from the DigitalOcean docs. No license is stated. |
| Akamai Cloud (Linode) | `linode` | cloud | 240 | 39 | Self-published RFC 8805 geofeed, referenced in the Linode network records at ARIN. No license is stated. |
| Vultr | `vultr` | cloud | 121 | 21 | Self-published RFC 8805 geofeed of AS20473, referenced in the Vultr network records at ARIN. No license is stated. |
| Cloudflare | `cloudflare` | cdn | 15 | 7 | Published by Cloudflare for allow lists. No license is stated. |
| Fastly | `fastly` | cdn | 21 | 3 | Public, unauthenticated Fastly API endpoint. No license is stated. |
| GitHub (incl. Actions runners) | `github` | services | 4022 | 2547 | GitHub REST API, covered by the GitHub Terms of Service (API Terms). |
| iCloud Private Relay egress | `icloud-private-relay` | privacy-relay | 3438 | 10582 | Published by Apple for geolocation and server operators. No license is stated. |
| Tor exit nodes | `tor` | tor | 695 | 0 | Tor Project data, CC0 1.0 (no copyright). |
