<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

/**
 * Data set used by the checks: disposable domains and IP ranges with provider and category.
 * Ranges are kept as fixed-width hex strings in parallel arrays, so an exported copy is a
 * literal-only PHP file that OPcache can share between requests.
 */
final class GuardData
{
    public const IP_CATEGORIES = ['cloud', 'services', 'cdn', 'tor', 'privacy-relay'];
    private const FORMAT = 1;

    /** @var array<string, true> */
    private array $disposable = [];
    /** @var list<array{0: string, 1: string, 2: string}> provider id, name, category */
    private array $providers = [];
    /** @var array<int, array{s: list<string>, e: list<string>, m: list<string>, p: list<int>, c: list<string>, v: list<int>}> */
    private array $tables = [];
    /** @var array<string, mixed>|null */
    public ?array $info = null;
    /** @var array{disposableDomains: int, ipv4Ranges: int, ipv6Ranges: int} */
    public array $counts = ['disposableDomains' => 0, 'ipv4Ranges' => 0, 'ipv6Ranges' => 0];

    /**
     * @param list<string> $disposableDomains
     * @param list<array{cidr: string, provider: string, providerName?: string, category: string}> $ipRanges
     * @param array<string, mixed>|null $info
     */
    public function __construct(array $disposableDomains = [], array $ipRanges = [], ?array $info = null)
    {
        foreach ($disposableDomains as $raw) {
            if (!is_string($raw)) {
                SignupGuardException::raise('data_error', 'disposable domains must be strings');
            }
            $d = strtolower(trim($raw, " \t\r\n"));
            if ($d === '' || $d[0] === '#') {
                continue;
            }
            if (!preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/D', $d)) {
                SignupGuardException::raise('data_error', sprintf('Not a domain: "%s"', $raw));
            }
            $this->disposable[$d] = true;
        }
        $providerIndex = [];
        $byVersion = [4 => [], 6 => []];
        $seen = [];
        foreach ($ipRanges as $r) {
            if (!is_array($r) || !is_string($r['cidr'] ?? null) || !is_string($r['provider'] ?? null) || !is_string($r['category'] ?? null)) {
                SignupGuardException::raise('data_error', 'each IP range needs cidr, provider and category strings');
            }
            if (!in_array($r['category'], self::IP_CATEGORIES, true)) {
                SignupGuardException::raise('data_error', sprintf('Unknown IP category "%s"', $r['category']));
            }
            $c = Ip::parseCidr($r['cidr']);
            $key = $r['provider'] . ' ' . $c['cidr'];
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $pk = $r['provider'] . "\0" . ($r['providerName'] ?? $r['provider']) . "\0" . $r['category'];
            if (!isset($providerIndex[$pk])) {
                $providerIndex[$pk] = count($this->providers);
                $this->providers[] = [$r['provider'], $r['providerName'] ?? $r['provider'], $r['category']];
            }
            $byVersion[$c['version']][] = [bin2hex($c['start']), bin2hex($c['end']), $c['prefix'], $c['cidr'], $providerIndex[$pk]];
        }
        foreach ($byVersion as $version => $entries) {
            usort($entries, static fn(array $a, array $b): int => strcmp($a[0], $b[0]) ?: strcmp($b[1], $a[1]));
            $t = ['s' => [], 'e' => [], 'm' => [], 'p' => [], 'c' => [], 'v' => []];
            $max = '';
            foreach ($entries as [$start, $end, $prefix, $cidr, $provider]) {
                if ($max === '' || strcmp($end, $max) > 0) {
                    $max = $end;
                }
                $t['s'][] = $start;
                $t['e'][] = $end;
                $t['m'][] = $max;
                $t['p'][] = $prefix;
                $t['c'][] = $cidr;
                $t['v'][] = $provider;
            }
            $this->tables[$version] = $t;
        }
        $this->info = $info;
        $this->counts = ['disposableDomains' => count($this->disposable), 'ipv4Ranges' => count($byVersion[4]), 'ipv6Ranges' => count($byVersion[6])];
    }

    /** Plain-array form for exportData(). */
    public function toArray(): array
    {
        return [
            'format' => self::FORMAT,
            'disposable' => $this->disposable,
            'providers' => $this->providers,
            'tables' => $this->tables,
            'info' => $this->info,
            'counts' => $this->counts,
        ];
    }

    public static function fromArray(array $a): self
    {
        if (($a['format'] ?? null) !== self::FORMAT) {
            SignupGuardException::raise('data_error', 'Exported data has an unknown format; export it again with this version');
        }
        $d = new self();
        $d->disposable = $a['disposable'];
        $d->providers = $a['providers'];
        $d->tables = $a['tables'];
        $d->info = $a['info'];
        $d->counts = $a['counts'];
        return $d;
    }

    /** Listed domain that matches the domain or one of its parents (never the bare TLD). */
    public function disposableMatch(string $domain): ?string
    {
        $labels = explode('.', $domain);
        for ($i = 0, $n = count($labels); $i < $n - 1; $i++) {
            $candidate = implode('.', array_slice($labels, $i));
            if (isset($this->disposable[$candidate])) {
                return $candidate;
            }
        }
        return null;
    }

    /** @return list<array{cidr: string, provider: string, providerName: string, category: string}> */
    public function lookup(int $version, string $bytes): array
    {
        $t = $this->tables[$version] ?? null;
        if ($t === null) {
            return [];
        }
        $hex = bin2hex($bytes);
        $lo = 0;
        $hi = count($t['s']) - 1;
        $last = -1;
        while ($lo <= $hi) {
            $mid = ($lo + $hi) >> 1;
            if (strcmp($t['s'][$mid], $hex) <= 0) {
                $last = $mid;
                $lo = $mid + 1;
            } else {
                $hi = $mid - 1;
            }
        }
        $found = [];
        // Ranges from different providers can nest (GitHub inside AWS), so walk back while an earlier range could still cover the address.
        for ($j = $last; $j >= 0 && strcmp($t['m'][$j], $hex) >= 0; $j--) {
            if (strcmp($t['e'][$j], $hex) >= 0) {
                [$id, $name, $category] = $this->providers[$t['v'][$j]];
                $found[] = ['prefix' => $t['p'][$j], 'cidr' => $t['c'][$j], 'provider' => $id, 'providerName' => $name, 'category' => $category];
            }
        }
        usort($found, static fn(array $a, array $b): int => ($b['prefix'] <=> $a['prefix']) ?: (strcmp($a['provider'], $b['provider']) <=> 0) ?: (strcmp($a['cidr'], $b['cidr']) <=> 0));
        return array_map(static fn(array $e): array => [
            'cidr' => $e['cidr'],
            'provider' => $e['provider'],
            'providerName' => $e['providerName'],
            'category' => $e['category'],
        ], $found);
    }
}
