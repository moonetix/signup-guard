<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

/** Fixed-window counters in process memory. Fine for tests and CLI jobs; PHP-FPM needs a shared store. */
final class MemoryStore implements VelocityStore
{
    /** @var array<string, array{count: int, expiresAt: int}> */
    private array $counters = [];
    private int $hits = 0;

    public function hit(string $key, int $ttlSeconds, int $now): int
    {
        if (++$this->hits % 1000 === 0) {
            $this->prune($now);
        }
        $entry = $this->counters[$key] ?? null;
        if ($entry === null || $now >= $entry['expiresAt']) {
            $this->counters[$key] = ['count' => 1, 'expiresAt' => $now + $ttlSeconds];
            return 1;
        }
        return ++$this->counters[$key]['count'];
    }

    public function prune(int $now): void
    {
        foreach ($this->counters as $key => $entry) {
            if ($now >= $entry['expiresAt']) {
                unset($this->counters[$key]);
            }
        }
    }

    public function size(): int
    {
        return count($this->counters);
    }
}
