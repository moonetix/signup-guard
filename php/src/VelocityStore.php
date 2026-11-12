<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

interface VelocityStore
{
    /** Increment the counter at $key, create it with a lifetime of $ttlSeconds if missing, return the new count. */
    public function hit(string $key, int $ttlSeconds, int $now): int;
}
