export class SignupGuardError extends Error {
  /**
   * @param {string} code stable, machine-readable code shared with the PHP port
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'SignupGuardError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new SignupGuardError(code, message);
}
