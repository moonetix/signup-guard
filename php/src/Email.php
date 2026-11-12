<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

final class Email
{
    /**
     * Provider rules. A rule is applied only when the provider documents it; the rest are listed
     * so the gap is visible. Checked 2026-11-11.
     */
    public const PROVIDERS = [
        [
            'id' => 'gmail',
            'name' => 'Gmail',
            'domains' => ['gmail.com', 'googlemail.com'],
            'canonicalDomain' => 'gmail.com',
            'plusTags' => true,
            'ignoreDots' => true,
            'subdomainTags' => false,
            'sources' => [
                'https://support.google.com/mail/answer/7436150',
                'https://support.google.com/mail/answer/12096',
                'https://support.google.com/mail/answer/10313',
            ],
            'note' => 'Dots do not matter and +tags reach the same inbox. googlemail.com delivers to the same account. Google Workspace domains are not covered: dots matter there.',
        ],
        [
            'id' => 'proton',
            'name' => 'Proton Mail',
            'domains' => ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'],
            'canonicalDomain' => null,
            'plusTags' => true,
            'ignoreDots' => false,
            'subdomainTags' => false,
            'sources' => ['https://proton.me/support/addresses-and-aliases'],
            'note' => 'Plus aliases arrive in the regular inbox. The four domains are not merged: Proton does not document that one name owns all of them.',
        ],
        [
            'id' => 'fastmail',
            'name' => 'Fastmail',
            'domains' => ['fastmail.com', 'fastmail.fm'],
            'canonicalDomain' => null,
            'plusTags' => true,
            'ignoreDots' => false,
            'subdomainTags' => true,
            'sources' => ['https://www.fastmail.help/hc/en-us/articles/360060591053'],
            'note' => 'Plus addressing and subdomain addressing (anything@user.fastmail.com) work by default. Only these two of the many Fastmail domains are covered.',
        ],
        [
            'id' => 'yandex',
            'name' => 'Yandex Mail',
            'domains' => ['yandex.com', 'yandex.ru'],
            'canonicalDomain' => null,
            'plusTags' => true,
            'ignoreDots' => false,
            'subdomainTags' => false,
            'sources' => ['https://yandex.com/support/mail/reg.html', 'https://yandex.ru/support/mail/reg.html'],
            'note' => 'Yandex suggests adding + and a word to the login when registering on websites. Other Yandex domain aliases are not listed by Yandex, so they are not covered.',
        ],
        [
            'id' => 'outlook',
            'name' => 'Outlook.com',
            'domains' => ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
            'canonicalDomain' => null,
            'plusTags' => false,
            'ignoreDots' => false,
            'subdomainTags' => false,
            'sources' => ['https://learn.microsoft.com/en-us/exchange/recipients-in-exchange-online/plus-addressing-in-exchange-online'],
            'note' => 'Not applied. Microsoft documents plus addressing for Exchange Online organizations, not for consumer Outlook.com. Opt in with plusTagDomains if you accept that.',
        ],
        [
            'id' => 'icloud',
            'name' => 'iCloud Mail',
            'domains' => ['icloud.com', 'me.com', 'mac.com'],
            'canonicalDomain' => null,
            'plusTags' => false,
            'ignoreDots' => false,
            'subdomainTags' => false,
            'sources' => ['https://support.apple.com/en-us/118230'],
            'note' => 'Not applied. Apple documents neither plus addressing nor that name@me.com and name@icloud.com always belong to the same account.',
        ],
        [
            'id' => 'yahoo',
            'name' => 'Yahoo Mail',
            'domains' => ['yahoo.com', 'ymail.com', 'rocketmail.com'],
            'canonicalDomain' => null,
            'plusTags' => false,
            'ignoreDots' => false,
            'subdomainTags' => false,
            'sources' => ['https://help.yahoo.com/kb/SLN28815.html'],
            'note' => 'Not applied. Yahoo disposable addresses are basename-keyword, but the basename is chosen separately from the account name, so removing the keyword does not recover the real address.',
        ],
    ];

    public const PROBLEMS = [
        'empty' => 'the address is empty',
        'non-ascii' => 'the address contains characters outside ASCII',
        'missing-at' => 'there is no @ sign',
        'multiple-at' => 'there is more than one @ sign',
        'too-long' => 'the address is longer than 254 characters',
        'local-too-long' => 'the part before @ is longer than 64 characters',
        'local-invalid' => 'the part before @ contains characters or dots that are not allowed',
        'domain-literal' => 'IP address literals are not accepted as a domain',
        'domain-invalid' => 'the domain is not a valid host name',
    ];

    /** @var array<string, array>|null */
    private static ?array $byDomain = null;

    private static function provider(string $domain): ?array
    {
        if (self::$byDomain === null) {
            self::$byDomain = [];
            foreach (self::PROVIDERS as $p) {
                foreach ($p['domains'] as $d) {
                    self::$byDomain[$d] = $p;
                }
            }
        }
        return self::$byDomain[$domain] ?? null;
    }

    private static function invalid(string $address, string $problem): array
    {
        return ['valid' => false, 'problem' => $problem, 'address' => $address, 'normalized' => null, 'local' => null, 'domain' => null, 'provider' => null, 'changes' => []];
    }

    private static function domainProblem(string $domain): ?string
    {
        if (str_starts_with($domain, '[')) {
            return 'domain-literal';
        }
        if ($domain === '' || strlen($domain) > 253) {
            return 'domain-invalid';
        }
        $labels = explode('.', $domain);
        if (count($labels) < 2) {
            return 'domain-invalid';
        }
        foreach ($labels as $l) {
            if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/D', $l)) {
                return 'domain-invalid';
            }
        }
        if (preg_match('/^\d+$/D', $labels[count($labels) - 1])) {
            return 'domain-invalid';
        }
        return null;
    }

    /** @return list<string> */
    public static function stringList(mixed $value, string $name): array
    {
        if ($value === null) {
            return [];
        }
        if (!is_array($value) || !array_is_list($value)) {
            SignupGuardException::raise('invalid_option', $name . ' must be an array of strings');
        }
        foreach ($value as $v) {
            if (!is_string($v)) {
                SignupGuardException::raise('invalid_option', $name . ' must be an array of strings');
            }
        }
        return $value;
    }

    /** @param array{lowercaseLocal?: bool|null, plusTagDomains?: list<string>|null} $options */
    public static function normalize(string $email, array $options = []): array
    {
        $lowercaseLocal = $options['lowercaseLocal'] ?? true;
        if (!is_bool($lowercaseLocal)) {
            SignupGuardException::raise('invalid_option', 'lowercaseLocal must be a boolean');
        }
        $plusTagDomains = array_map('strtolower', self::stringList($options['plusTagDomains'] ?? null, 'plusTagDomains'));

        $address = trim($email, " \t\r\n");
        if ($address === '') {
            return self::invalid($address, 'empty');
        }
        if (preg_match('/[^\x21-\x7e]/', $address)) {
            return self::invalid($address, 'non-ascii');
        }
        if (strlen($address) > 254) {
            return self::invalid($address, 'too-long');
        }
        $at = strpos($address, '@');
        if ($at === false) {
            return self::invalid($address, 'missing-at');
        }
        if (strpos($address, '@', $at + 1) !== false) {
            return self::invalid($address, 'multiple-at');
        }
        $local = substr($address, 0, $at);
        $domain = substr($address, $at + 1);
        $changes = [];

        if ($local === '' || !preg_match('/^[A-Za-z0-9!#$%&\'*+\/=?^_`{|}~.-]+$/D', $local)
            || str_starts_with($local, '.') || str_ends_with($local, '.') || str_contains($local, '..')) {
            return self::invalid($address, 'local-invalid');
        }
        if (strlen($local) > 64) {
            return self::invalid($address, 'local-too-long');
        }
        if (str_ends_with($domain, '.') && !str_ends_with($domain, '..')) {
            $domain = substr($domain, 0, -1);
            $changes[] = 'trailing-dot-removed';
        }
        $lowerDomain = strtolower($domain);
        $problem = self::domainProblem($lowerDomain);
        if ($problem !== null) {
            return self::invalid($address, $problem);
        }
        $lowered = $lowerDomain !== $domain;
        $domain = $lowerDomain;
        if ($lowercaseLocal && strtolower($local) !== $local) {
            $local = strtolower($local);
            $lowered = true;
        }
        if ($lowered) {
            $changes[] = 'lowercased';
        }

        $provider = self::provider($domain);
        if ($provider === null) {
            $dot = strpos($domain, '.');
            $parent = substr($domain, $dot + 1);
            $parentProvider = self::provider($parent);
            if ($parentProvider !== null && $parentProvider['subdomainTags'] && str_contains($parent, '.')) {
                $local = substr($domain, 0, $dot);
                $domain = $parent;
                $provider = $parentProvider;
                $changes[] = 'subdomain-tag-removed';
            }
        }
        if ($provider !== null && $provider['canonicalDomain'] !== null && $provider['canonicalDomain'] !== $domain) {
            $domain = $provider['canonicalDomain'];
            $changes[] = 'domain-alias';
        }
        $plus = strpos($local, '+');
        if ($plus !== false && $plus > 0 && (($provider !== null && $provider['plusTags']) || in_array($domain, $plusTagDomains, true))) {
            $local = substr($local, 0, $plus);
            $changes[] = 'tag-removed';
        }
        if ($provider !== null && $provider['ignoreDots'] && str_contains($local, '.')) {
            $undotted = str_replace('.', '', $local);
            if ($undotted !== '') {
                $local = $undotted;
                $changes[] = 'dots-removed';
            }
        }
        return [
            'valid' => true,
            'problem' => null,
            'address' => $address,
            'normalized' => $local . '@' . $domain,
            'local' => $local,
            'domain' => $domain,
            'provider' => $provider['id'] ?? null,
            'changes' => $changes,
        ];
    }
}
