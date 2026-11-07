import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const password = 'correct horse battery staple';

  beforeAll(async () => {
    await service.onModuleInit();
  });

  it('never stores the password itself', async () => {
    const hash = await service.hash(password);

    expect(hash).not.toContain(password);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('produces a different hash each time (random salt)', async () => {
    expect(await service.hash(password)).not.toBe(await service.hash(password));
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await service.hash(password);

    await expect(service.verify(hash, password)).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong password!!')).resolves.toBe(false);
  });

  it('treats a malformed hash as a wrong password instead of crashing', async () => {
    await expect(service.verify('not-a-hash', password)).resolves.toBe(false);
  });

  it('always fails the dummy check (used for unknown emails)', async () => {
    await expect(service.verifyAgainstDummy(password)).resolves.toBe(false);
  });
});
