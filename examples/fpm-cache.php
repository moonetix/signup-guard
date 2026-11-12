<?php

declare(strict_types=1);

require __DIR__ . '/../php/autoload.php'; // with Composer: require 'vendor/autoload.php';

use Moonetix\SignupGuard\SignupGuard;

// First call builds a literal-only PHP file; after that OPcache serves it from shared memory.
$data = SignupGuard::cachedData(sys_get_temp_dir() . '/signup-guard-data.php');

$result = SignupGuard::assessSignup(['email' => 'temp123@mailinator.com', 'ip' => '81.2.69.142'], ['data' => $data]);
echo $result['decision'], ' ', $result['score'], "\n";
