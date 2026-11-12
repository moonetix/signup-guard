<?php

declare(strict_types=1);

// Plain test runner: php php/tests/run.php
// Runs the shared vectors in test-vectors/vectors.json plus PHP-specific checks.

require __DIR__ . '/../autoload.php';

use Moonetix\SignupGuard\MemoryStore;
use Moonetix\SignupGuard\SignupGuard as G;
use Moonetix\SignupGuard\SignupGuardException;
use Moonetix\SignupGuard\VelocityLimiter;
use Moonetix\SignupGuard\VelocityStore;
use Moonetix\SignupGuard\Email;

$root = dirname(__DIR__, 2);
$vectors = json_decode((string)file_get_contents($root . '/test-vectors/vectors.json'), true, 512, JSON_THROW_ON_ERROR);
$fixture = $vectors['fixture'];
$data = G::createData($fixture['disposableDomains'], $fixture['ipRanges']);

$passed = 0;
$failed = 0;

/** Sort object keys recursively so arrays compare by content, not by key order. */
function canon(mixed $v): mixed
{
    if (!is_array($v)) {
        return $v;
    }
    if (!array_is_list($v)) {
        ksort($v, SORT_STRING);
    }
    return array_map('canon', $v);
}

function check(string $label, mixed $actual, mixed $expected): void
{
    global $passed, $failed;
    if (canon($actual) === canon($expected)) {
        $passed++;
        return;
    }
    $failed++;
    fwrite(STDERR, "FAIL {$label}\n  expected: " . json_encode($expected, JSON_UNESCAPED_SLASHES) . "\n  actual:   " . json_encode($actual, JSON_UNESCAPED_SLASHES) . "\n");
}

function outcome(callable $fn): array
{
    try {
        return ['out' => $fn()];
    } catch (SignupGuardException $e) {
        return ['throws' => $e->errorCode];
    }
}

function expected(array $c): array
{
    return array_key_exists('throws', $c) ? ['throws' => $c['throws']] : ['out' => $c['out']];
}

$runners = [
    'providers' => fn(array $c) => ['out' => Email::PROVIDERS],
    'normalizeEmail' => fn(array $c) => outcome(fn() => G::normalizeEmail($c['in'], $c['options'] ?? [])),
    'normalizeIp' => fn(array $c) => outcome(fn() => G::normalizeIp($c['in'])),
    'ipNetwork' => fn(array $c) => outcome(fn() => G::ipNetwork($c['in'])),
    'parseCidr' => fn(array $c) => outcome(fn() => \Moonetix\SignupGuard\Ip::parseCidr($c['in'])['cidr']),
    'lookupIp' => fn(array $c) => outcome(fn() => G::lookupIp($c['in'], ['data' => $data])),
    'checkDisposable' => fn(array $c) => outcome(fn() => G::checkDisposable($c['in'], ($c['options'] ?? []) + ['data' => $data])),
    'assessSignup' => fn(array $c) => outcome(fn() => G::assessSignup($c['input'], ($c['options'] ?? []) + ['data' => $data])),
    'velocity' => function (array $s): array {
        try {
            $limiter = new VelocityLimiter(store: new MemoryStore(), rules: $s['rules'] ?? null);
        } catch (SignupGuardException $e) {
            return ['throws' => $e->errorCode];
        }
        $steps = [];
        foreach ($s['steps'] as $step) {
            $steps[] = ['input' => $step['input']] + outcome(fn() => $limiter->check($step['input']));
        }
        return ['steps' => $steps];
    },
];

foreach ($runners as $group => $run) {
    $cases = $vectors[$group] ?? [];
    if ($cases === []) {
        check("vectors: {$group} present", false, true);
    }
    foreach ($cases as $i => $c) {
        $label = sprintf('%s[%d] %s', $group, $i, $c['name'] ?? json_encode($c['in'] ?? null, JSON_UNESCAPED_SLASHES));
        $exp = $group === 'velocity' ? (array_key_exists('throws', $c) ? ['throws' => $c['throws']] : ['steps' => $c['steps']]) : expected($c);
        check($label, $run($c), $exp);
    }
}

$groups = array_keys(array_filter($vectors, 'is_array'));
$groups = array_values(array_diff($groups, ['fixture']));
sort($groups);
$known = array_keys($runners);
sort($known);
check('every vector group has a runner', $groups, $known);

// PHP-specific checks.

check('IPv6 formatting matches inet_ntop for compressed forms', (function (): bool {
    mt_srand(7);
    for ($i = 0; $i < 2000; $i++) {
        $groups = [];
        for ($g = 0; $g < 8; $g++) {
            $groups[] = mt_rand(0, 3) === 0 ? 0 : mt_rand(0, 65535);
        }
        $bytes = pack('n*', ...$groups);
        if (substr($bytes, 0, 12) === str_repeat("\0", 10) . "\xff\xff" || substr($bytes, 0, 12) === str_repeat("\0", 12)) {
            continue;
        }
        $text = implode(':', array_map('dechex', $groups));
        if (G::normalizeIp($text) !== inet_ntop($bytes)) {
            fwrite(STDERR, "  {$text}: " . G::normalizeIp($text) . ' vs ' . inet_ntop($bytes) . "\n");
            return false;
        }
    }
    return true;
})(), true);

check('custom store via interface', (function (): array {
    $store = new class implements VelocityStore {
        public array $keys = [];
        public function hit(string $key, int $ttlSeconds, int $now): int
        {
            $this->keys[$key] = ($this->keys[$key] ?? 0) + 1;
            return $this->keys[$key];
        }
    };
    $limiter = new VelocityLimiter(store: $store, rules: [['name' => 'ip', 'key' => 'ip', 'limit' => 1, 'windowSeconds' => 60]], keyPrefix: 'test:');
    $limiter->check(['now' => 120, 'ip' => '192.0.2.1']);
    $second = $limiter->check(['now' => 121, 'ip' => '192.0.2.1']);
    return [array_keys($store->keys), $second['limited']];
})(), [['test:ip:120:192.0.2.1'], true]);

check('MemoryStore expiry and prune', (function (): array {
    $s = new MemoryStore();
    $out = [$s->hit('a', 10, 100), $s->hit('a', 10, 105), $s->hit('a', 10, 110)];
    $s->hit('b', 5, 100);
    $s->prune(200);
    $out[] = $s->size();
    return $out;
})(), [1, 2, 1, 0]);

check('exception is an InvalidArgumentException with a code', (function (): array {
    try {
        G::assessSignup([], ['thresholds' => ['review' => 0]]);
    } catch (\InvalidArgumentException $e) {
        return [$e instanceof SignupGuardException, $e->errorCode];
    }
    return [];
})(), [true, 'invalid_option']);

check('createData validates input', outcome(fn() => G::createData(['bad domain'])), ['throws' => 'data_error']);
check('createData rejects unknown categories', outcome(fn() => G::createData([], [['cidr' => '1.2.3.0/24', 'provider' => 'x', 'category' => 'vpn']])), ['throws' => 'data_error']);

check('exported data round-trips and gives the same answers', (function () use ($data, $root): bool {
    $file = sys_get_temp_dir() . '/signup-guard-test-' . bin2hex(random_bytes(4)) . '.php';
    G::exportData($file, $data);
    $copy = G::loadExported($file);
    unlink($file);
    foreach (['3.219.87.128', '52.1.0.9', '2606:4700::1', '8.8.8.8'] as $ip) {
        if (G::lookupIp($ip, ['data' => $copy]) !== G::lookupIp($ip, ['data' => $data])) {
            return false;
        }
    }
    return $copy->counts === $data->counts && G::checkDisposable('a@x.mailinator.com', ['data' => $copy])['disposable'];
})(), true);

check('cachedData builds once, then reuses the export', (function () use ($root): array {
    $file = sys_get_temp_dir() . '/signup-guard-cache-' . bin2hex(random_bytes(4)) . '.php';
    $first = G::cachedData($file);
    $mtime = filemtime($file);
    $second = G::cachedData($file);
    clearstatcache();
    $same = filemtime($file) === $mtime;
    file_put_contents($file, "<?php\n\nreturn ['format' => 0];\n");
    $third = G::cachedData($file);
    unlink($file);
    return [$first->counts === $second->counts, $same, $third->counts === $first->counts];
})(), [true, true, true]);

// Bundled snapshot: shape and long-lived facts only, so weekly updates keep passing.
$manifest = json_decode((string)file_get_contents($root . '/data/manifest.json'), true);
$info = G::dataInfo();
check('bundled counts match the manifest', [$info['counts']['disposableDomains'], $info['counts']['ipv4Ranges'], $info['counts']['ipv6Ranges']], [$manifest['disposable']['domains'], $manifest['ipRanges']['ipv4'], $manifest['ipRanges']['ipv6']]);
check('bundled: mailinator is disposable, gmail is not', [G::checkDisposable('x@mailinator.com')['disposable'], G::checkDisposable('gmail.com')['disposable']], [true, false]);
check('bundled: an S3 address is in AWS', in_array('aws', array_column(G::lookupIp('3.5.140.2')['matches'], 'provider'), true), true);

printf("%d passed, %d failed\n", $passed, $failed);
exit($failed === 0 ? 0 : 1);
