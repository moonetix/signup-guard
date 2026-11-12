<?php

declare(strict_types=1);

// Needs the phpredis extension.
require __DIR__ . '/../php/autoload.php'; // with Composer: require 'vendor/autoload.php';

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
$first = $limiter->check(['now' => time(), 'ip' => '198.51.100.7', 'email' => 'sam@example.com']);
echo implode(' ', array_map(fn(array $r): string => "{$r['rule']}={$r['count']}", $first['results'])), "\n";
