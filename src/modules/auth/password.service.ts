import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

/**
 * Password hashing with argon2id, the current recommendation for storing
 * passwords. Hashing is deliberately slow and memory-hungry, which makes
 * guessing passwords from a stolen database extremely expensive.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string;

  async onModuleInit(): Promise<void> {
    // A real hash of a random value, used when a login email doesn't exist.
    this.dummyHash = await argon2.hash(randomUUID());
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false; // malformed hash: treat as "wrong password"
    }
  }

  /**
   * Does the same expensive work as a real check, then fails. Used when the
   * email isn't registered, so "unknown email" and "wrong password" take the
   * same time and an attacker can't tell which emails have accounts.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    await this.verify(this.dummyHash, password);
    return false;
  }
}
