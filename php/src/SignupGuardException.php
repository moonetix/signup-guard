<?php

declare(strict_types=1);

namespace Moonetix\SignupGuard;

use InvalidArgumentException;

final class SignupGuardException extends InvalidArgumentException
{
    /** Stable, machine-readable code shared with the JavaScript port, for example "invalid_option". */
    public string $errorCode;

    public function __construct(string $errorCode, string $message)
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
    }

    public static function raise(string $errorCode, string $message): never
    {
        throw new self($errorCode, $message);
    }
}
