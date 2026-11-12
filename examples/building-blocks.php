<?php

declare(strict_types=1);

require __DIR__ . '/../php/autoload.php'; // with Composer: require 'vendor/autoload.php';

use Moonetix\SignupGuard\SignupGuard as Guard;

echo Guard::normalizeEmail('J.Smith+news@GoogleMail.com')['normalized'], "\n";
echo Guard::normalizeEmail('shop@carol.fastmail.com')['normalized'], "\n";
echo Guard::normalizeEmail('erin+tag@outlook.com')['normalized'], "\n";
echo Guard::normalizeEmail('erin+tag@outlook.com', ['plusTagDomains' => ['outlook.com']])['normalized'], "\n";
echo Guard::normalizeEmail('kim@@example.org')['problem'], "\n";

echo json_encode(Guard::checkDisposable('x@inbox.mailinator.com')), "\n";
var_dump(Guard::checkDisposable('x@mailinator.com', ['allowDomains' => ['mailinator.com']])['disposable']);

$ip = Guard::lookupIp('::ffff:3.219.87.128');
echo $ip['ip'], ' ', implode(',', $ip['categories']), ' ', implode(',', array_column($ip['matches'], 'provider')), "\n";
echo json_encode(Guard::lookupIp('100.64.12.7')['special']), "\n";
echo Guard::ipNetwork('2001:db8:abcd:12:ff::1'), "\n";
