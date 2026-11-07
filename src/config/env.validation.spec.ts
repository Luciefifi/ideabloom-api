import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '4000',
    DATABASE_URL: 'postgres://user:pass@localhost:5442/ideabloom',
  };

  it('accepts a valid environment and converts PORT to a number', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('applies defaults for NODE_ENV and PORT', () => {
    const env = validateEnv({ DATABASE_URL: validEnv.DATABASE_URL });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
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
});
