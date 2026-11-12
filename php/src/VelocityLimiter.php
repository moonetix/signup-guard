<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

/** Counts attempts per IP, network, normalized email or any field you pass, in fixed windows. */
final class VelocityLimiter
{
    /** Starting limits. Tune them from your own logs; they count attempts, not successful sign-ups. */
    public const DEFAULT_RULES = [
        ['name' => 'ip-hour', 'key' => 'ip', 'limit' => 5, 'windowSeconds' => 3600],
        ['name' => 'ip-day', 'key' => 'ip', 'limit' => 20, 'windowSeconds' => 86400],
        ['name' => 'network-day', 'key' => 'network', 'limit' => 50, 'windowSeconds' => 86400],
        ['name' => 'email-day', 'key' => 'email', 'limit' => 5, 'windowSeconds' => 86400],
    ];

    private const MAX_WINDOW = 366 * 86400;

    public VelocityStore $store;
    /** @var list<array{name: string, key: string, limit: int, windowSeconds: int}> */
    public array $rules;
    public string $keyPrefix;

    /** @param list<array{name: string, key: string, limit: int, windowSeconds: int}>|null $rules */
    public function __construct(?VelocityStore $store = null, ?array $rules = null, string $keyPrefix = 'sg:')
    {
        $this->store = $store ?? new MemoryStore();
        $rules ??= self::DEFAULT_RULES;
        if ($rules === [] || !array_is_list($rules)) {
            SignupGuardException::raise('invalid_rule', 'rules must be a non-empty list');
        }
        $this->rules = [];
        $names = [];
        foreach ($rules as $i => $rule) {
            $this->rules[] = $r = self::checkRule($rule, $i);
            $names[$r['name']] = true;
        }
        if (count($names) !== count($this->rules)) {
            SignupGuardException::raise('invalid_rule', 'rule names must be unique');
        }
        $this->keyPrefix = $keyPrefix;
    }

    private static function checkRule(mixed $rule, int $i): array
    {
        if (!is_array($rule)) {
            SignupGuardException::raise('invalid_rule', sprintf('rule %d must be an array', $i));
        }
        $name = $rule['name'] ?? null;
        $key = $rule['key'] ?? null;
        $limit = $rule['limit'] ?? null;
        $window = $rule['windowSeconds'] ?? null;
        $nameRe = '/^[A-Za-z0-9_-]{1,40}$/D';
        if (!is_string($name) || !preg_match($nameRe, $name)) {
            SignupGuardException::raise('invalid_rule', sprintf('rule %d: name must be 1 to 40 letters, digits, "-" or "_"', $i));
        }
        if (!is_string($key) || !preg_match($nameRe, $key) || $key === 'now') {
            SignupGuardException::raise('invalid_rule', sprintf('rule %s: key must be "ip", "network", "email" or your own field name', $name));
        }
        if (!is_int($limit) || $limit < 1) {
            SignupGuardException::raise('invalid_rule', sprintf('rule %s: limit must be a positive integer', $name));
        }
        if (!is_int($window) || $window < 1 || $window > self::MAX_WINDOW) {
            SignupGuardException::raise('invalid_rule', sprintf('rule %s: windowSeconds must be an integer from 1 to %d', $name, self::MAX_WINDOW));
        }
        return ['name' => $name, 'key' => $key, 'limit' => $limit, 'windowSeconds' => $window];
    }

    /**
     * Record one attempt and report every rule's count. Rules whose value is missing or invalid are skipped.
     * @param array{now: int, ip?: string|null, email?: string|null} $input
     * @return array{limited: bool, exceeded: list<string>, results: list<array>}
     */
    public function check(array $input): array
    {
        $now = $input['now'] ?? null;
        if (!is_int($now) || $now < 0) {
            SignupGuardException::raise('invalid_argument', 'now must be a non-negative integer (Unix seconds)');
        }
        $values = [];
        $value = static function (string $key) use ($input, &$values): ?string {
            if (array_key_exists($key, $values)) {
                return $values[$key];
            }
            $ip = is_string($input['ip'] ?? null) ? $input['ip'] : null;
            if ($key === 'ip') {
                $v = $ip === null ? null : Ip::normalize($ip);
            } elseif ($key === 'network') {
                $v = $ip === null ? null : Ip::network($ip);
            } elseif ($key === 'email') {
                $e = is_string($input['email'] ?? null) ? Email::normalize($input['email']) : null;
                $v = $e !== null && $e['valid'] ? $e['normalized'] : null;
            } else {
                $raw = $input[$key] ?? null;
                $v = is_string($raw) && $raw !== '' ? $raw : null;
            }
            return $values[$key] = $v;
        };
        $results = [];
        $exceeded = [];
        foreach ($this->rules as $rule) {
            $v = $value($rule['key']);
            if ($v === null) {
                continue;
            }
            $windowStart = $now - ($now % $rule['windowSeconds']);
            $resetAt = $windowStart + $rule['windowSeconds'];
            $count = $this->store->hit($this->keyPrefix . $rule['name'] . ':' . $windowStart . ':' . $v, $resetAt - $now, $now);
            if ($count < 1) {
                SignupGuardException::raise('invalid_option', 'store hit() must return the new count as a positive integer');
            }
            $over = $count > $rule['limit'];
            if ($over) {
                $exceeded[] = $rule['name'];
            }
            $results[] = [
                'rule' => $rule['name'],
                'key' => $rule['key'],
                'value' => $v,
                'count' => $count,
                'limit' => $rule['limit'],
                'windowSeconds' => $rule['windowSeconds'],
                'resetAt' => $resetAt,
                'exceeded' => $over,
            ];
        }
        return ['limited' => $exceeded !== [], 'exceeded' => $exceeded, 'results' => $results];
    }
}
