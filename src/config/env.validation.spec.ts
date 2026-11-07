import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '4000',
    DATABASE_URL: 'postgres://user:pass@localhost:5442/ideabloom',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
  };

  it('accepts a valid environment and converts PORT to a number', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('applies defaults for NODE_ENV and PORT', () => {
    const env = validateEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
    });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.REGISTRATION_ENABLED).toBe(true);
    expect(env.RATE_LIMIT_AUTH).toBe(5);
    expect(env.TRUST_PROXY).toBe('loopback');
  });

  it('rejects a missing DATABASE_URL with a readable message', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(
      /Invalid environment variables:[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() =>
      validateEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow(/DATABASE_URL must be a postgres:\/\/ connection URL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('rejects a PORT that is not a valid port number', () => {
    expect(() => validateEnv({ ...validEnv, PORT: '99999' })).toThrow(/PORT/);
  });

  it('rejects a missing or short JWT_ACCESS_SECRET', () => {
    const { JWT_ACCESS_SECRET: _omit, ...withoutSecret } = validEnv;
    void _omit;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/at least 32 characters/);
  });

  it.each([
    ['false', false],
    ['true', true],
    ['0', false],
  ])('reads REGISTRATION_ENABLED=%s as %s', (value, expected) => {
    expect(
      validateEnv({ ...validEnv, REGISTRATION_ENABLED: value })
        .REGISTRATION_ENABLED,
    ).toBe(expected);
  });
});
