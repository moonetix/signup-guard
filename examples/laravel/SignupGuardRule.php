<?php

declare(strict_types=1);

// Needs Laravel 10 or later and this package: composer require moonetix/signup-guard
// Copy to app/Rules/SignupGuardRule.php, next to app/Support/CacheVelocityStore.php.

namespace App\Rules;

use App\Support\CacheVelocityStore;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\Request;
use Moonetix\SignupGuard\GuardData;
use Moonetix\SignupGuard\SignupGuard;
use Moonetix\SignupGuard\VelocityLimiter;

/**
 * Validates the email field of a sign-up form with signup-guard.
 *
 * A block fails validation with the hints of the reasons. A likely typo fails once with
 * "Did you mean ...?" until the form sends confirm_email=1. Allow and review pass, and the full
 * result is stored on the request as the "signup_guard" attribute for the controller.
 *
 * $request->ip() is only the client address when the proxies in front of the app are trusted:
 * configure them in the TrustProxies middleware (Laravel 10) or with trustProxies() in
 * bootstrap/app.php (Laravel 11 and later).
 */
final class SignupGuardRule implements ValidationRule
{
    /** @param array<string, mixed> $options assessSignup options, for example ['freeMail' => true] */
    public function __construct(
        private readonly Request $request,
        private readonly array $options = [],
    ) {
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $email = is_string($value) ? $value : null;
        $ip = $this->request->ip();

        $limiter = new VelocityLimiter(store: new CacheVelocityStore());
        $velocity = $limiter->check(['now' => time(), 'ip' => $ip, 'email' => $email]);
        $result = SignupGuard::assessSignup(
            ['email' => $email, 'ip' => $ip, 'velocity' => $velocity],
            $this->options + ['data' => self::data()],
        );
        $this->request->attributes->set('signup_guard', $result);

        if ($result['decision'] === 'block') {
            foreach (array_unique(array_filter(array_column($result['reasons'], 'hint'))) as $hint) {
                $fail($hint);
            }
            return;
        }
        if ($result['suggestion'] !== null && !$this->request->boolean('confirm_email')) {
            $fail('Did you mean ' . $result['suggestion'] . '?');
        }
    }

    private static function data(): GuardData
    {
        // A literal-only PHP file that OPcache keeps in shared memory, rebuilt when the data changes.
        return SignupGuard::cachedData(storage_path('framework/cache/signup-guard-data.php'));
    }
}
