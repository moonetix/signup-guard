<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

/**
 * Explainable sign-up risk checks: email normalization, disposable domains, datacenter and Tor
 * IP ranges, velocity limits and a score made of named reasons. Same behavior as the JavaScript port.
 */
final class SignupGuard
{
    /** Points per reason. A weight of 0 keeps the reason in the output as information only. */
    public const DEFAULT_WEIGHTS = [
        'email_invalid' => 100,
        'email_disposable' => 70,
        'email_normalized' => 0,
        'ip_invalid' => 0,
        'ip_not_public' => 0,
        'ip_datacenter' => 40,
        'ip_tor' => 40,
        'ip_cdn' => 15,
        'ip_privacy_relay' => 0,
        'velocity_ip' => 30,
        'velocity_network' => 30,
        'velocity_email' => 40,
        'velocity_other' => 30,
    ];

    public const DEFAULT_THRESHOLDS = ['review' => 30, 'block' => 70];

    private const HINTS = [
        'email_invalid' => 'Check the email address for typos.',
        'email_disposable' => 'Please use a permanent email address.',
        'ip_datacenter' => 'Turn off your VPN or proxy, or switch to your home or mobile connection, and try again.',
        'ip_tor' => 'Please sign up without Tor.',
        'ip_cdn' => 'If you use a VPN or a privacy service, turn it off and try again.',
        'velocity' => 'Too many attempts. Please try again later.',
    ];

    private const IP_REASONS = [
        ['ip_datacenter', ['cloud', 'services'], 'a datacenter range', ''],
        ['ip_tor', ['tor'], 'the Tor exit list', ''],
        ['ip_cdn', ['cdn'], 'a CDN range', ' People rarely browse from CDN edge addresses, but some privacy and VPN products route them through CDN networks.'],
        ['ip_privacy_relay', ['privacy-relay'], 'a privacy relay range', ' Real users share these addresses; this alone says nothing about fraud.'],
    ];

    private const KEY_LABELS = ['ip' => 'IP address', 'network' => 'network', 'email' => 'email address'];

    private const CHANGE_LABELS = [
        'trailing-dot-removed' => 'trailing dot removed',
        'lowercased' => 'lowercased',
        'subdomain-tag-removed' => 'subdomain tag removed',
        'domain-alias' => 'domain alias replaced',
        'tag-removed' => 'plus tag removed',
        'dots-removed' => 'dots removed',
    ];

    private const SIGNIFICANT_CHANGES = ['subdomain-tag-removed', 'domain-alias', 'tag-removed', 'dots-removed'];

    private static ?GuardData $bundled = null;

    public static function normalizeEmail(string $email, array $options = []): array
    {
        return Email::normalize($email, $options);
    }

    public static function normalizeIp(string $ip): ?string
    {
        return Ip::normalize($ip);
    }

    public static function ipNetwork(string $ip): ?string
    {
        return Ip::network($ip);
    }

    /**
     * @param list<string> $disposableDomains
     * @param list<array{cidr: string, provider: string, providerName?: string, category: string}> $ipRanges
     */
    public static function createData(array $disposableDomains = [], array $ipRanges = []): GuardData
    {
        return new GuardData($disposableDomains, $ipRanges);
    }

    /** Load the snapshot in $dir (default: the data/ folder shipped with this package). */
    public static function loadData(?string $dir = null): GuardData
    {
        $dir = rtrim($dir ?? dirname(__DIR__, 2) . '/data', '/');
        $read = static function (string $path) use ($dir): string {
            $text = @file_get_contents($dir . '/' . $path);
            if ($text === false) {
                SignupGuardException::raise('data_error', 'Cannot read ' . $dir . '/' . $path);
            }
            return $text;
        };
        $lines = static function (string $text): array {
            $out = [];
            foreach (explode("\n", $text) as $l) {
                $l = trim($l);
                if ($l !== '' && $l[0] !== '#') {
                    $out[] = $l;
                }
            }
            return $out;
        };
        $providers = json_decode($read('ip/providers.json'), true, 16, JSON_THROW_ON_ERROR);
        $ranges = [];
        foreach ($providers as $p) {
            foreach ($lines($read('ip/' . $p['id'] . '.txt')) as $cidr) {
                $ranges[] = ['cidr' => $cidr, 'provider' => $p['id'], 'providerName' => $p['name'], 'category' => $p['category']];
            }
        }
        $info = json_decode($read('manifest.json'), true, 16, JSON_THROW_ON_ERROR);
        return new GuardData($lines($read('disposable/domains.txt')), $ranges, $info);
    }

    /** Write $data (default: the bundled snapshot) as a literal-only PHP file that OPcache can share between requests. */
    public static function exportData(string $file, ?GuardData $data = null): void
    {
        $code = "<?php\n\nreturn " . var_export(($data ?? self::defaultData())->toArray(), true) . ";\n";
        $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
        if (@file_put_contents($tmp, $code) === false || !@rename($tmp, $file)) {
            @unlink($tmp);
            SignupGuardException::raise('data_error', 'Cannot write ' . $file);
        }
    }

    public static function loadExported(string $file): GuardData
    {
        $a = is_file($file) ? include $file : null;
        if (!is_array($a)) {
            SignupGuardException::raise('data_error', 'Not an exported data file: ' . $file);
        }
        return GuardData::fromArray($a);
    }

    /**
     * For PHP-FPM: use the exported copy in $cacheFile while it matches the snapshot in $dir,
     * and rebuild it after the snapshot changes. Load it once per request, then pass it as 'data'.
     */
    public static function cachedData(string $cacheFile, ?string $dir = null): GuardData
    {
        $dir = rtrim($dir ?? dirname(__DIR__, 2) . '/data', '/');
        $manifest = json_decode((string)@file_get_contents($dir . '/manifest.json'), true);
        if (is_file($cacheFile)) {
            try {
                $data = self::loadExported($cacheFile);
                if ($data->info === $manifest) {
                    return $data;
                }
            } catch (SignupGuardException) {
                // An export from another version: rebuild it below.
            }
        }
        $data = self::loadData($dir);
        self::exportData($cacheFile, $data);
        return $data;
    }

    /** The bundled snapshot, loaded on first use and cached for the life of the process. */
    public static function defaultData(): GuardData
    {
        return self::$bundled ??= self::loadData();
    }

    /** Snapshot dates, upstream commits and counts of the bundled data. */
    public static function dataInfo(): array
    {
        $d = self::defaultData();
        return ($d->info ?? []) + ['counts' => $d->counts];
    }

    private static function data(array $options): GuardData
    {
        $data = $options['data'] ?? null;
        if ($data === null) {
            return self::defaultData();
        }
        if (!$data instanceof GuardData) {
            SignupGuardException::raise('invalid_option', 'data must come from createData() or loadData()');
        }
        return $data;
    }

    /** @param array{data?: GuardData} $options */
    public static function lookupIp(string $ip, array $options = []): array
    {
        $data = self::data($options);
        $parsed = Ip::parse($ip);
        if ($parsed === null) {
            return ['valid' => false, 'ip' => $ip, 'version' => null, 'public' => false, 'special' => null, 'matches' => [], 'categories' => []];
        }
        $special = Ip::special($parsed['bytes']);
        $matches = $special === null ? $data->lookup($parsed['version'], $parsed['bytes']) : [];
        $categories = [];
        foreach ($matches as $m) {
            if (!in_array($m['category'], $categories, true)) {
                $categories[] = $m['category'];
            }
        }
        usort($categories, static fn(string $a, string $b): int => array_search($a, GuardData::IP_CATEGORIES, true) <=> array_search($b, GuardData::IP_CATEGORIES, true));
        return [
            'valid' => true,
            'ip' => Ip::format($parsed['bytes']),
            'version' => $parsed['version'],
            'public' => $special === null,
            'special' => $special,
            'matches' => $matches,
            'categories' => $categories,
        ];
    }

    /** @param array{data?: GuardData, allowDomains?: list<string>, blockDomains?: list<string>} $options */
    public static function checkDisposable(string $emailOrDomain, array $options = []): array
    {
        $data = self::data($options);
        $clean = static fn(string $v): string => strtolower(trim($v, " \t\r\n"));
        $allow = array_map($clean, Email::stringList($options['allowDomains'] ?? null, 'allowDomains'));
        $block = array_map($clean, Email::stringList($options['blockDomains'] ?? null, 'blockDomains'));
        $s = trim($emailOrDomain, " \t\r\n");
        $at = strrpos($s, '@');
        $domain = strtolower($at === false ? $s : substr($s, $at + 1));
        if (str_ends_with($domain, '.')) {
            $domain = substr($domain, 0, -1);
        }
        $labels = explode('.', $domain);
        $parents = [];
        for ($i = 0, $n = count($labels); $i < $n - 1; $i++) {
            $parents[] = implode('.', array_slice($labels, $i));
        }
        foreach ($parents as $d) {
            if (in_array($d, $allow, true)) {
                return ['domain' => $domain, 'disposable' => false, 'matchedDomain' => null, 'source' => null, 'allowedBy' => $d];
            }
        }
        foreach ($parents as $d) {
            if (in_array($d, $block, true)) {
                return ['domain' => $domain, 'disposable' => true, 'matchedDomain' => $d, 'source' => 'blockDomains', 'allowedBy' => null];
            }
        }
        $listed = $data->disposableMatch($domain);
        return ['domain' => $domain, 'disposable' => $listed !== null, 'matchedDomain' => $listed, 'source' => $listed === null ? null : 'list', 'allowedBy' => null];
    }

    private static function duration(int $seconds): string
    {
        $unit = static fn(int $n, string $word): string => $n . ' ' . $word . ($n === 1 ? '' : 's');
        if ($seconds % 3600 === 0) {
            return $unit(intdiv($seconds, 3600), 'hour');
        }
        if ($seconds % 60 === 0) {
            return $unit(intdiv($seconds, 60), 'minute');
        }
        return $unit($seconds, 'second');
    }

    private static function weights(mixed $overrides): array
    {
        $out = self::DEFAULT_WEIGHTS;
        if ($overrides === null) {
            return $out;
        }
        if (!is_array($overrides) || ($overrides !== [] && array_is_list($overrides))) {
            SignupGuardException::raise('invalid_option', 'weights must be an object');
        }
        foreach ($overrides as $code => $points) {
            $code = (string)$code;
            if (!array_key_exists($code, self::DEFAULT_WEIGHTS) && !preg_match('/^velocity_[A-Za-z0-9_-]{1,40}$/D', $code)) {
                SignupGuardException::raise('invalid_option', sprintf('Unknown reason code "%s"', $code));
            }
            if (!is_int($points) || $points < 0 || $points > 1000) {
                SignupGuardException::raise('invalid_option', sprintf('weights.%s must be an integer from 0 to 1000', $code));
            }
            $out[$code] = $points;
        }
        return $out;
    }

    private static function thresholds(mixed $t): array
    {
        $out = array_merge(self::DEFAULT_THRESHOLDS, is_array($t) ? $t : []);
        if (!is_int($out['review']) || !is_int($out['block']) || $out['review'] < 1 || $out['block'] < $out['review']) {
            SignupGuardException::raise('invalid_option', 'thresholds must be integers with 1 <= review <= block');
        }
        return ['review' => $out['review'], 'block' => $out['block']];
    }

    /**
     * Score a sign-up attempt. Every point in `score` comes from one entry in `reasons`.
     * @param array{email?: string|null, ip?: string|null, velocity?: array|null} $input
     */
    public static function assessSignup(array $input, array $options = []): array
    {
        $weights = self::weights($options['weights'] ?? null);
        $thresholds = self::thresholds($options['thresholds'] ?? null);
        $data = self::data($options);
        $reasons = [];
        $add = static function (string $code, string $message, ?string $hint, ?string $weightKey = null) use (&$reasons, $weights): void {
            $reasons[] = ['code' => $code, 'points' => $weights[$weightKey ?? $code], 'message' => $message, 'hint' => $hint];
        };

        $email = null;
        $disposable = null;
        if (isset($input['email'])) {
            if (!is_string($input['email'])) {
                SignupGuardException::raise('invalid_argument', 'email must be a string');
            }
            $email = Email::normalize($input['email'], [
                'lowercaseLocal' => $options['lowercaseLocal'] ?? null,
                'plusTagDomains' => $options['plusTagDomains'] ?? null,
            ]);
            if (!$email['valid']) {
                $add('email_invalid', 'Email address is not valid: ' . Email::PROBLEMS[$email['problem']] . '.', self::HINTS['email_invalid']);
            } else {
                $disposable = self::checkDisposable($email['domain'], [
                    'data' => $data,
                    'allowDomains' => $options['allowDomains'] ?? null,
                    'blockDomains' => $options['blockDomains'] ?? null,
                ]);
                if ($disposable['disposable']) {
                    $where = $disposable['source'] === 'list' ? 'the disposable domain list' : 'your block list';
                    $add('email_disposable', sprintf('%s is on %s (matched %s).', $email['domain'], $where, $disposable['matchedDomain']), self::HINTS['email_disposable']);
                }
                if (array_intersect($email['changes'], self::SIGNIFICANT_CHANGES) !== []) {
                    $labels = array_map(static fn(string $c): string => self::CHANGE_LABELS[$c], $email['changes']);
                    $add('email_normalized', sprintf('Normalized to %s (%s). Check duplicates against this form.', $email['normalized'], implode(', ', $labels)), null);
                }
            }
        }

        $ip = null;
        if (isset($input['ip'])) {
            if (!is_string($input['ip'])) {
                SignupGuardException::raise('invalid_argument', 'ip must be a string');
            }
            $ip = self::lookupIp($input['ip'], ['data' => $data]);
            if (!$ip['valid']) {
                $add('ip_invalid', sprintf('"%s" is not a valid IP address.', $input['ip']), null);
            } elseif (!$ip['public']) {
                $add('ip_not_public', sprintf(
                    '%s is %s (%s), not a public address. If real users show up with it, your server is reading the address of a proxy or load balancer.',
                    $ip['ip'],
                    $ip['special']['description'],
                    $ip['special']['cidr'],
                ), null);
            } else {
                foreach (self::IP_REASONS as [$code, $categories, $label, $extra]) {
                    $hits = array_values(array_filter($ip['matches'], static fn(array $m): bool => in_array($m['category'], $categories, true)));
                    if ($hits === []) {
                        continue;
                    }
                    $list = implode('; ', array_map(static fn(array $m): string => sprintf('%s (%s, %s)', $m['providerName'], $m['category'], $m['cidr']), $hits));
                    $add($code, sprintf('%s is in %s: %s.%s', $ip['ip'], $label, $list, $extra), self::HINTS[$code] ?? null);
                }
            }
        }

        if (isset($input['velocity'])) {
            $v = $input['velocity'];
            if (!is_array($v) || !is_array($v['results'] ?? null)) {
                SignupGuardException::raise('invalid_argument', 'velocity must be the result of VelocityLimiter::check()');
            }
            $byKey = [];
            foreach ($v['results'] as $r) {
                if ($r['exceeded']) {
                    $byKey[$r['key']][] = $r;
                }
            }
            foreach ($byKey as $key => $rules) {
                $key = (string)$key;
                $code = 'velocity_' . $key;
                $weightKey = array_key_exists($code, $weights) ? $code : 'velocity_other';
                $detail = implode('; ', array_map(static fn(array $r): string => sprintf('%s: %d of %d in %s', $r['rule'], $r['count'], $r['limit'], self::duration($r['windowSeconds'])), $rules));
                $add($code, sprintf('Too many attempts for this %s (%s).', self::KEY_LABELS[$key] ?? $key, $detail), self::HINTS['velocity'], $weightKey);
            }
        }

        $score = array_sum(array_column($reasons, 'points'));
        $decision = $score >= $thresholds['block'] ? 'block' : ($score >= $thresholds['review'] ? 'review' : 'allow');
        return ['score' => $score, 'decision' => $decision, 'reasons' => $reasons, 'email' => $email, 'disposable' => $disposable, 'ip' => $ip];
    }
}
