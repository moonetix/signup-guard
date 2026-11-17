# signup-guard in Laravel

Needs Laravel 10 or later and the package:

```bash
composer require moonetix/signup-guard
```

Copy [`SignupGuardRule.php`](SignupGuardRule.php) to `app/Rules/` and [`CacheVelocityStore.php`](CacheVelocityStore.php) to `app/Support/`. The store keeps the velocity counters in your cache, so use a cache store that every app server shares, such as `redis`.

Add the rule to the email field of your sign-up request:

```php
namespace App\Http\Requests;

use App\Rules\SignupGuardRule;
use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['bail', 'required', 'string', new SignupGuardRule($this)],
            'password' => ['required', 'confirmed', 'min:12'],
        ];
    }
}
```

A `block` fails validation with the hints, and a likely typo fails with "Did you mean ...?" until the form sends `confirm_email=1`. Leave out Laravel's own `email` rule: the guard already rejects addresses that are not valid, with a hint the user can act on. Pass options as the second argument, for example `new SignupGuardRule($this, ['freeMail' => true])` for a product that wants work addresses.

In the controller, read the result to hold accounts in `review` and to store the normalized address:

```php
public function store(RegisterRequest $request)
{
    $guard = $request->attributes->get('signup_guard');

    $user = User::create([
        'name' => $request->input('name'),
        'email' => $request->input('email'),
        'email_normalized' => $guard['email']['normalized'],
        'password' => Hash::make($request->input('password')),
    ]);

    if ($guard['decision'] === 'review') {
        // For example: no rewards or credits until the email is verified and the account has aged.
        $user->forceFill(['held_at' => now()])->save();
    }

    return redirect()->route('verification.notice');
}
```

`$request->ip()` is the client address only when Laravel trusts the proxies in front of the app. Configure them with `trustProxies()` in `bootstrap/app.php` (Laravel 11 and later) or in the `TrustProxies` middleware (Laravel 10), and list only your own load balancer or CDN. If many users show up with `ip_not_public`, the proxy is not trusted yet.
