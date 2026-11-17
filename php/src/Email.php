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

    /**
     * Free consumer mailbox services: anyone can open a personal address there at no cost, without
     * owning a domain. Mailboxes that come with an internet or phone subscription are left out.
     */
    public const FREE_MAIL_PROVIDERS = [
        ['id' => 'gmail', 'name' => 'Gmail', 'domains' => ['gmail.com', 'googlemail.com']],
        [
            'id' => 'outlook',
            'name' => 'Outlook.com',
            'domains' => ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es', 'live.co.uk', 'live.fr', 'outlook.fr', 'outlook.de'],
        ],
        [
            'id' => 'yahoo',
            'name' => 'Yahoo Mail',
            'domains' => ['yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'yahoo.es', 'yahoo.ca', 'yahoo.co.in', 'yahoo.com.br'],
        ],
        ['id' => 'icloud', 'name' => 'iCloud Mail', 'domains' => ['icloud.com', 'me.com', 'mac.com']],
        ['id' => 'aol', 'name' => 'AOL Mail', 'domains' => ['aol.com']],
        ['id' => 'proton', 'name' => 'Proton Mail', 'domains' => ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me']],
        ['id' => 'tuta', 'name' => 'Tuta', 'domains' => ['tuta.com', 'tutanota.com', 'tutanota.de', 'tutamail.com', 'tuta.io']],
        ['id' => 'zoho', 'name' => 'Zoho Mail', 'domains' => ['zohomail.com', 'zoho.com']],
        ['id' => 'gmx', 'name' => 'GMX', 'domains' => ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch']],
        ['id' => 'mailcom', 'name' => 'mail.com', 'domains' => ['mail.com']],
        ['id' => 'webde', 'name' => 'WEB.DE', 'domains' => ['web.de']],
        ['id' => 'yandex', 'name' => 'Yandex Mail', 'domains' => ['yandex.com', 'yandex.ru', 'ya.ru']],
        ['id' => 'mailru', 'name' => 'Mail.ru', 'domains' => ['mail.ru', 'bk.ru', 'list.ru', 'inbox.ru']],
        ['id' => 'qq', 'name' => 'QQ Mail', 'domains' => ['qq.com']],
        ['id' => 'netease', 'name' => 'NetEase Mail', 'domains' => ['163.com', '126.com']],
        ['id' => 'naver', 'name' => 'Naver Mail', 'domains' => ['naver.com']],
        ['id' => 'daum', 'name' => 'Daum Mail', 'domains' => ['daum.net', 'hanmail.net']],
        ['id' => 'libero', 'name' => 'Libero Mail', 'domains' => ['libero.it']],
        ['id' => 'laposte', 'name' => 'La Poste Mail', 'domains' => ['laposte.net']],
        ['id' => 'rediff', 'name' => 'Rediffmail', 'domains' => ['rediffmail.com']],
        ['id' => 'seznam', 'name' => 'Seznam Email', 'domains' => ['seznam.cz']],
        ['id' => 'wp', 'name' => 'Poczta WP', 'domains' => ['wp.pl']],
    ];

    /**
     * The domains suggestEmail() suggests. A typed domain on this list is never changed. Holds every
     * domain of PROVIDERS and FREE_MAIL_PROVIDERS, plus the mailboxes of large internet providers.
     * Add your own with the mailboxDomains option.
     */
    public const MAILBOX_DOMAINS = [
        'gmail.com', 'googlemail.com',
        'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es', 'live.co.uk', 'live.fr', 'outlook.fr', 'outlook.de',
        'yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'yahoo.es', 'yahoo.ca', 'yahoo.co.in', 'yahoo.com.br',
        'icloud.com', 'me.com', 'mac.com',
        'aol.com',
        'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me',
        'fastmail.com', 'fastmail.fm',
        'tuta.com', 'tutanota.com', 'tutanota.de', 'tutamail.com', 'tuta.io',
        'zohomail.com', 'zoho.com',
        'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch',
        'mail.com', 'web.de',
        'yandex.com', 'yandex.ru', 'ya.ru',
        'mail.ru', 'bk.ru', 'list.ru', 'inbox.ru',
        'qq.com', '163.com', '126.com',
        'naver.com', 'daum.net', 'hanmail.net',
        'libero.it', 'laposte.net', 'rediffmail.com', 'seznam.cz', 'wp.pl',
        'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net',
        'btinternet.com', 'virginmedia.com', 'sky.com',
        't-online.de', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr',
        'bigpond.com', 'shaw.ca',
    ];

    /**
     * Local parts of shared mailboxes, with dots, hyphens and underscores removed: "no-reply" and
     * "no.reply" are both "noreply". Includes the mailbox names of RFC 2142.
     */
    public const ROLE_LOCAL_PARTS = [
        'abuse', 'accounting', 'accounts', 'admin', 'administrator', 'billing', 'careers', 'contact',
        'customerservice', 'donotreply', 'enquiries', 'feedback', 'finance', 'ftp', 'hello', 'help',
        'helpdesk', 'hostmaster', 'hr', 'info', 'inquiries', 'jobs', 'legal', 'mailerdaemon', 'marketing',
        'media', 'news', 'newsletter', 'noc', 'noreply', 'office', 'orders', 'postmaster', 'press',
        'privacy', 'root', 'sales', 'security', 'service', 'support', 'team', 'usenet', 'uucp',
        'webmaster', 'www',
    ];

    /** Misspelled top-level domains that are not real ones, fixed on any domain. */
    private const TLD_TYPOS = [
        'con' => 'com', 'cmo' => 'com', 'ocm' => 'com', 'vom' => 'com', 'xom' => 'com', 'cpm' => 'com', 'comm' => 'com', 'coom' => 'com',
        'nte' => 'net', 'ner' => 'net', 'nett' => 'net',
        'ogr' => 'org', 'orgg' => 'org',
    ];

    /** Real top-level domains that are also common slips; fixed only when the result is a mailbox domain. */
    private const TLD_SLIPS = ['co' => 'com', 'cm' => 'com', 'om' => 'com', 'ne' => 'net'];

    private const DOTLESS_SUFFIXES = ['com', 'net', 'org'];

    private const KEY_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

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

    /** @var array<string, array{0: int, 1: int}>|null */
    private static ?array $keyAt = null;

    /** True for keys next to each other on a QWERTY keyboard. */
    private static function nextKeys(string $a, string $b): bool
    {
        if (self::$keyAt === null) {
            self::$keyAt = [];
            foreach (self::KEY_ROWS as $r => $row) {
                foreach (str_split($row) as $c => $key) {
                    self::$keyAt[$key] = [$r, $c];
                }
            }
        }
        $p = self::$keyAt[$a] ?? null;
        $q = self::$keyAt[$b] ?? null;
        if ($p === null || $q === null) {
            return false;
        }
        $dr = $q[0] - $p[0];
        $dc = $q[1] - $p[1];
        return ($dr === 0 && abs($dc) === 1) || ($dr === -1 && ($dc === 0 || $dc === 1)) || ($dr === 1 && ($dc === 0 || $dc === -1));
    }

    /**
     * Optimal string alignment distance (Damerau-Levenshtein without repeated edits of one place).
     * Inserting, deleting or swapping two neighboring letters costs 1; replacing a letter costs 1 when
     * the two keys are next to each other on a QWERTY keyboard and 2 otherwise.
     */
    private static function editDistance(string $a, string $b): int
    {
        $n = strlen($a);
        $m = strlen($b);
        $rows = [];
        for ($i = 0; $i <= $n; $i++) {
            $rows[$i] = array_fill(0, $m + 1, 0);
            $rows[$i][0] = $i;
        }
        for ($j = 0; $j <= $m; $j++) {
            $rows[0][$j] = $j;
        }
        for ($i = 1; $i <= $n; $i++) {
            for ($j = 1; $j <= $m; $j++) {
                $cost = $a[$i - 1] === $b[$j - 1] ? 0 : (self::nextKeys($a[$i - 1], $b[$j - 1]) ? 1 : 2);
                $d = min($rows[$i - 1][$j] + 1, $rows[$i][$j - 1] + 1, $rows[$i - 1][$j - 1] + $cost);
                if ($i > 1 && $j > 1 && $a[$i - 1] === $b[$j - 2] && $a[$i - 2] === $b[$j - 1]) {
                    $d = min($d, $rows[$i - 2][$j - 2] + 1);
                }
                $rows[$i][$j] = $d;
            }
        }
        return $rows[$n][$m];
    }

    /**
     * The listed domain with the same suffix and first letter, nearest to $domain, if exactly one is nearest.
     * @param array<string, true> $known
     */
    private static function nearestDomain(string $domain, array $known): ?string
    {
        $dot = strpos($domain, '.');
        if ($dot === false || $dot === 0) {
            return null;
        }
        $name = substr($domain, 0, $dot);
        $rest = substr($domain, $dot + 1);
        $best = null;
        $bestDistance = PHP_INT_MAX;
        $tie = false;
        foreach (array_keys($known) as $candidate) {
            $candidate = (string)$candidate;
            $cdot = strpos($candidate, '.');
            if ($cdot === false || $cdot === 0 || !preg_match('/^[a-z0-9.-]+$/D', $candidate)) {
                continue;
            }
            $cname = substr($candidate, 0, $cdot);
            if (substr($candidate, $cdot + 1) !== $rest || $cname[0] !== $name[0]) {
                continue;
            }
            $limit = strlen($cname) >= 8 ? 2 : (strlen($cname) >= 5 ? 1 : 0);
            if ($limit === 0 || abs(strlen($cname) - strlen($name)) > $limit) {
                continue;
            }
            $distance = self::editDistance($name, $cname);
            if ($distance === 0 || $distance > $limit) {
                continue;
            }
            if ($distance < $bestDistance) {
                $best = $candidate;
                $bestDistance = $distance;
                $tie = false;
            } elseif ($distance === $bestDistance) {
                $tie = true;
            }
        }
        return $tie ? null : $best;
    }

    /** @param array<string, true> $known */
    private static function suggestDomain(string $domain, array $known): ?string
    {
        if (isset($known[$domain])) {
            return null;
        }
        $dot = strrpos($domain, '.');
        if ($dot === false) {
            $options = [$domain . '.com'];
            foreach (self::DOTLESS_SUFFIXES as $s) {
                if (strlen($domain) > strlen($s) && str_ends_with($domain, $s)) {
                    $options[] = substr($domain, 0, -strlen($s)) . '.' . $s;
                }
            }
            foreach ($options as $d) {
                if (isset($known[$d])) {
                    return $d;
                }
            }
            return null;
        }
        $base = substr($domain, 0, $dot);
        $tld = substr($domain, $dot + 1);
        if (isset(self::TLD_TYPOS[$tld])) {
            $fixed = $base . '.' . self::TLD_TYPOS[$tld];
            return isset($known[$fixed]) ? $fixed : (self::nearestDomain($fixed, $known) ?? $fixed);
        }
        if (isset(self::TLD_SLIPS[$tld]) && !str_contains($base, '.') && strlen($base) >= 3) {
            $fixed = $base . '.' . self::TLD_SLIPS[$tld];
            if (isset($known[$fixed])) {
                return $fixed;
            }
        }
        return self::nearestDomain($domain, $known);
    }

    /**
     * The typed domain, the corrected domain and the corrected address, or null.
     * @return array{domain: string, fixed: string, suggestion: string}|null
     */
    public static function typo(string $email, mixed $mailboxDomains): ?array
    {
        $known = [];
        foreach ([...self::MAILBOX_DOMAINS, ...array_map('strtolower', self::stringList($mailboxDomains, 'mailboxDomains'))] as $d) {
            $known[$d] = true;
        }
        $address = trim($email, " \t\r\n");
        if (preg_match('/[^\x21-\x7e]/', $address)) {
            return null;
        }
        $at = strpos($address, '@');
        if ($at === false || strpos($address, '@', $at + 1) !== false) {
            return null;
        }
        $local = substr($address, 0, $at);
        if ($local === '' || strlen($local) > 64 || !preg_match('/^[A-Za-z0-9!#$%&\'*+\/=?^_`{|}~.-]+$/D', $local)
            || str_starts_with($local, '.') || str_ends_with($local, '.') || str_contains($local, '..')) {
            return null;
        }
        $domain = strtolower(substr($address, $at + 1));
        if (str_ends_with($domain, '.')) {
            $domain = substr($domain, 0, -1);
        }
        if ($domain === '' || strlen($domain) > 253 || !preg_match('/^[a-z0-9.-]+$/D', $domain)) {
            return null;
        }
        $fixed = self::suggestDomain($domain, $known);
        return $fixed === null ? null : ['domain' => $domain, 'fixed' => $fixed, 'suggestion' => $local . '@' . $fixed];
    }

    /** @param array{mailboxDomains?: list<string>|null} $options */
    public static function suggest(string $email, array $options = []): ?string
    {
        return self::typo($email, $options['mailboxDomains'] ?? null)['suggestion'] ?? null;
    }

    /** The ROLE_LOCAL_PARTS entry a local part matches, ignoring case, a +tag, dots, hyphens and underscores. */
    public static function roleLocalPart(string $local): ?string
    {
        $plus = strpos($local, '+');
        $bare = str_replace(['.', '_', '-'], '', strtolower($plus !== false && $plus > 0 ? substr($local, 0, $plus) : $local));
        return in_array($bare, self::ROLE_LOCAL_PARTS, true) ? $bare : null;
    }

    public static function isRole(string $email): bool
    {
        $e = self::normalize($email);
        return $e['valid'] && self::roleLocalPart($e['local']) !== null;
    }

    /**
     * Where a domain is listed as free mail: the provider table first, then $extra. Null when nowhere.
     * @param list<string> $extra
     * @return array{source: string, provider: string|null}|null
     */
    public static function freeMailMatch(string $domain, array $extra): ?array
    {
        foreach (self::FREE_MAIL_PROVIDERS as $p) {
            if (in_array($domain, $p['domains'], true)) {
                return ['source' => 'list', 'provider' => $p['name']];
            }
        }
        return in_array($domain, $extra, true) ? ['source' => 'freeMailDomains', 'provider' => null] : null;
    }

    /** @param array{freeMailDomains?: list<string>|null} $options */
    public static function isFreeMail(string $emailOrDomain, array $options = []): bool
    {
        $s = trim($emailOrDomain, " \t\r\n");
        $at = strrpos($s, '@');
        $domain = strtolower($at === false ? $s : substr($s, $at + 1));
        if (str_ends_with($domain, '.')) {
            $domain = substr($domain, 0, -1);
        }
        $extra = array_map('strtolower', self::stringList($options['freeMailDomains'] ?? null, 'freeMailDomains'));
        return self::freeMailMatch($domain, $extra) !== null;
    }
}
