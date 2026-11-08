import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { isUniqueViolation } from '../../common/database/postgres-errors';
import { User } from './entities/user.entity';
import { toPreferences, type Preferences } from './preferences';

export type UpdateProfileData = Partial<
  Pick<User, 'displayName' | 'bio' | 'timezone'>
>;

export interface CreateUserData {
  email: string;
  passwordHash: string;
  displayName: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** "  Lucie@Example.COM " and "lucie@example.com" are the same account. */
  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: UsersService.normalizeEmail(email) });
  }

  /**
   * The only places the password hash is loaded (it's `select: false` on the entity).
   * Used by login and password checks, never for API responses.
   */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.withPassword()
      .where('user.email = :email', {
        email: UsersService.normalizeEmail(email),
      })
      .getOne();
  }

  findByIdWithPassword(id: string): Promise<User | null> {
    return this.withPassword().where('user.id = :id', { id }).getOne();
  }

  /** Updates only the given fields, and only on this user's own row. */
  async updateProfile(
    id: string,
    changes: UpdateProfileData,
    preferences?: Partial<Preferences>,
  ): Promise<User> {
    const update: QueryDeepPartialEntity<User> = { ...changes };
    // Only the preferences actually sent: the validated DTO object also has
    // the other keys, set to undefined, which must not overwrite saved values.
    const sent = Object.fromEntries(
      Object.entries(preferences ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Partial<Preferences>;
    if (Object.keys(sent).length > 0) {
      const current = await this.findById(id);
      // Merge: sending { theme } keeps the start page, and vice versa.
      const merged: Preferences = {
        ...toPreferences(current?.preferences ?? null),
        ...sent,
      };
      update.preferences = { ...merged };
    }
    if (Object.keys(update).length > 0) {
      await this.users.update({ id }, update);
    }
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.users.update(
      { id },
      { passwordHash, passwordChangedAt: new Date() },
    );
  }

  /** Deletes the user; the database cascades to everything they own. */
  async deleteAccount(id: string): Promise<void> {
    await this.users.delete({ id });
  }

  private withPassword() {
    return this.users.createQueryBuilder('user').addSelect('user.passwordHash');
  }

  async create(data: CreateUserData): Promise<User> {
    const user = this.users.create({
      ...data,
      email: UsersService.normalizeEmail(data.email),
    });

    try {
      return await this.users.save(user);
    } catch (error) {
      // The unique index on email is the real guarantee. Two sign-ups at the
      // same moment can't both succeed.
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }
}
