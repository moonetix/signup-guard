<?php

declare(strict_types=1);

// For projects without Composer: require this file once.
spl_autoload_register(static function (string $class): void {
    $prefix = 'Moonetix\\SignupGuard\\';
    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/src/' . substr($class, strlen($prefix)) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});
