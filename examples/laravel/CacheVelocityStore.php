<?php

declare(strict_types=1);

// Needs Laravel 10 or later and this package: composer require moonetix/signup-guard
// Copy to app/Support/CacheVelocityStore.php.

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Moonetix\SignupGuard\VelocityStore;

/**
 * Velocity counters in the Laravel cache. Use a store that all app servers share and that
 * increments atomically, such as redis or memcached.
 */
final class CacheVelocityStore implements VelocityStore
{
    public function hit(string $key, int $ttlSeconds, int $now): int
    {
        // add() writes only a missing key, so the expiry is set once, when the window starts.
        Cache::add($key, 0, $ttlSeconds);

        return (int) Cache::increment($key);
    }
}
