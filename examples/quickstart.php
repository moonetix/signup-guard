<?php

declare(strict_types=1);

require __DIR__ . '/../php/autoload.php'; // with Composer: require 'vendor/autoload.php';

use Moonetix\SignupGuard\SignupGuard;
use Moonetix\SignupGuard\VelocityLimiter;

$limiter = new VelocityLimiter(); // in-memory: PHP-FPM needs a shared store, see "Velocity stores"

$email = 'Jane.Doe+promo@googlemail.com';
$ip = '3.5.140.2';

$velocity = $limiter->check(['now' => time(), 'ip' => $ip, 'email' => $email]);
$result = SignupGuard::assessSignup(['email' => $email, 'ip' => $ip, 'velocity' => $velocity]);

echo $result['decision'], ' ', $result['score'], "\n";
foreach ($result['reasons'] as $r) {
    echo "{$r['code']} +{$r['points']}: {$r['message']}\n";
}
echo $result['email']['normalized'], "\n";
