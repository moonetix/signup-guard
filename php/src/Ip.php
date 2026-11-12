<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

/**
 * Address parsing and formatting. Addresses are held as big-endian binary strings
 * (4 bytes for IPv4, 16 for IPv6), so ranges compare with strcmp.
 */
final class Ip
{
    public const SPECIAL = [
        ['0.0.0.0/8', 'reserved', 'a reserved "this network" address'],
        ['10.0.0.0/8', 'private', 'a private network address'],
        ['100.64.0.0/10', 'cgnat', 'a carrier-grade NAT address'],
        ['127.0.0.0/8', 'loopback', 'a loopback address'],
        ['169.254.0.0/16', 'link-local', 'a link-local address'],
        ['172.16.0.0/12', 'private', 'a private network address'],
        ['192.0.0.0/24', 'reserved', 'an IETF protocol assignment'],
        ['192.0.2.0/24', 'documentation', 'a documentation address'],
        ['192.168.0.0/16', 'private', 'a private network address'],
        ['198.18.0.0/15', 'benchmarking', 'a benchmarking address'],
        ['198.51.100.0/24', 'documentation', 'a documentation address'],
        ['203.0.113.0/24', 'documentation', 'a documentation address'],
        ['224.0.0.0/4', 'multicast', 'a multicast address'],
        ['240.0.0.0/4', 'reserved', 'a reserved address'],
        ['::/128', 'unspecified', 'the unspecified address'],
        ['::1/128', 'loopback', 'a loopback address'],
        ['2001:db8::/32', 'documentation', 'a documentation address'],
        ['fc00::/7', 'unique-local', 'a unique local (private) address'],
        ['fe80::/10', 'link-local', 'a link-local address'],
        ['ff00::/8', 'multicast', 'a multicast address'],
    ];

    /** @var list<array{start: string, end: string, cidr: string, kind: string, description: string}>|null */
    private static ?array $special = null;

    private static function parseV4(string $text): ?string
    {
        if (!preg_match('/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/D', $text, $m)) {
            return null;
        }
        $bytes = '';
        for ($i = 1; $i <= 4; $i++) {
            // "010" could mean octal to some parsers; refusing it keeps both ports and every proxy in agreement.
            if (strlen($m[$i]) > 1 && $m[$i][0] === '0') {
                return null;
            }
            $n = (int)$m[$i];
            if ($n > 255) {
                return null;
            }
            $bytes .= chr($n);
        }
        return $bytes;
    }

    /** @return list<int>|null */
    private static function groups(string $s): ?array
    {
        if ($s === '') {
            return [];
        }
        $out = [];
        foreach (explode(':', $s) as $p) {
            if (!preg_match('/^[0-9a-fA-F]{1,4}$/D', $p)) {
                return null;
            }
            $out[] = (int)hexdec($p);
        }
        return $out;
    }

    private static function parseV6(string $text): ?string
    {
        if (strlen($text) > 45 || str_contains($text, '%')) {
            return null;
        }
        $body = $text;
        $tail = [];
        $lastColon = strrpos($body, ':');
        if ($lastColon === false) {
            return null;
        }
        if (str_contains($body, '.')) {
            $v4 = self::parseV4(substr($body, $lastColon + 1));
            if ($v4 === null) {
                return null;
            }
            $w = unpack('n2', $v4);
            $tail = [$w[1], $w[2]];
            $body = substr($body, 0, $lastColon + 1);
            if (str_ends_with($body, ':') && !str_ends_with($body, '::')) {
                $body = substr($body, 0, -1);
            }
        }
        $halves = explode('::', $body);
        if (count($halves) > 2) {
            return null;
        }
        $head = self::groups($halves[0]);
        if ($head === null) {
            return null;
        }
        if (count($halves) === 2) {
            $rest = self::groups($halves[1]);
            if ($rest === null) {
                return null;
            }
            $all = array_merge($rest, $tail);
            $missing = 8 - count($head) - count($all);
            if ($missing < 1) {
                return null;
            }
            $groups = array_merge($head, array_fill(0, $missing, 0), $all);
        } else {
            $groups = array_merge($head, $tail);
            if (count($groups) !== 8) {
                return null;
            }
        }
        return pack('n*', ...$groups);
    }

    /**
     * Parse an IPv4 or IPv6 address. IPv4-mapped IPv6 (::ffff:a.b.c.d) comes back as IPv4.
     * @return array{version: int, bytes: string}|null
     */
    public static function parse(string $text): ?array
    {
        if (str_contains($text, ':')) {
            $b = self::parseV6($text);
            if ($b === null) {
                return null;
            }
            if (substr($b, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
                return ['version' => 4, 'bytes' => substr($b, 12)];
            }
            return ['version' => 6, 'bytes' => $b];
        }
        $b = self::parseV4($text);
        return $b === null ? null : ['version' => 4, 'bytes' => $b];
    }

    public static function format(string $bytes): string
    {
        if (strlen($bytes) === 4) {
            return implode('.', array_map('ord', str_split($bytes)));
        }
        $groups = array_values(unpack('n8', $bytes));
        $bestStart = -1;
        $bestLen = 0;
        for ($i = 0; $i < 8;) {
            if ($groups[$i] !== 0) {
                $i++;
                continue;
            }
            $j = $i;
            while ($j < 8 && $groups[$j] === 0) {
                $j++;
            }
            if ($j - $i > $bestLen) {
                $bestStart = $i;
                $bestLen = $j - $i;
            }
            $i = $j;
        }
        $hex = array_map('dechex', $groups);
        if ($bestLen < 2) {
            return implode(':', $hex);
        }
        return implode(':', array_slice($hex, 0, $bestStart)) . '::' . implode(':', array_slice($hex, $bestStart + $bestLen));
    }

    public static function normalize(string $text): ?string
    {
        $ip = self::parse($text);
        return $ip === null ? null : self::format($ip['bytes']);
    }

    /** Network mask as a binary string of $len bytes with the first $prefix bits set. */
    private static function mask(int $len, int $prefix): string
    {
        $full = intdiv($prefix, 8);
        $out = str_repeat("\xff", $full);
        if ($full < $len) {
            $out .= chr((0xff << (8 - $prefix % 8)) & 0xff);
            $out .= str_repeat("\0", $len - $full - 1);
        }
        return $out;
    }

    /** @return array{version: int, prefix: int, start: string, end: string, cidr: string} */
    public static function parseCidr(string $text): array
    {
        $slash = strpos($text, '/');
        $addr = $slash === false ? $text : substr($text, 0, $slash);
        $ip = self::parse($addr);
        if ($ip === null || (str_contains($addr, ':') && $ip['version'] === 4)) {
            SignupGuardException::raise('invalid_cidr', sprintf('Not a valid CIDR block: "%s"', $text));
        }
        $len = strlen($ip['bytes']);
        $max = $len * 8;
        $prefix = $max;
        if ($slash !== false) {
            $p = substr($text, $slash + 1);
            if (!preg_match('/^\d{1,3}$/D', $p) || (int)$p > $max || (strlen($p) > 1 && $p[0] === '0')) {
                SignupGuardException::raise('invalid_cidr', sprintf('Not a valid CIDR block: "%s"', $text));
            }
            $prefix = (int)$p;
        }
        $mask = self::mask($len, $prefix);
        $start = $ip['bytes'] & $mask;
        $end = $start | ~$mask;
        return ['version' => $ip['version'], 'prefix' => $prefix, 'start' => $start, 'end' => $end, 'cidr' => self::format($start) . '/' . $prefix];
    }

    /** The /24 (IPv4) or /64 (IPv6) network of an address, or null for invalid input. */
    public static function network(string $text): ?string
    {
        $ip = self::parse($text);
        if ($ip === null) {
            return null;
        }
        $len = strlen($ip['bytes']);
        $prefix = $len === 4 ? 24 : 64;
        return self::format($ip['bytes'] & self::mask($len, $prefix)) . '/' . $prefix;
    }

    /** @return array{cidr: string, kind: string, description: string}|null */
    public static function special(string $bytes): ?array
    {
        if (self::$special === null) {
            self::$special = [];
            foreach (self::SPECIAL as [$cidr, $kind, $description]) {
                $c = self::parseCidr($cidr);
                self::$special[] = ['start' => $c['start'], 'end' => $c['end'], 'cidr' => $c['cidr'], 'kind' => $kind, 'description' => $description];
            }
        }
        foreach (self::$special as $r) {
            if (strlen($r['start']) === strlen($bytes) && strcmp($bytes, $r['start']) >= 0 && strcmp($bytes, $r['end']) <= 0) {
                return ['cidr' => $r['cidr'], 'kind' => $r['kind'], 'description' => $r['description']];
            }
        }
        return null;
    }
}
