import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/postgres-errors';
import { User } from './entities/user.entity';

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
  async updateProfile(id: string, changes: UpdateProfileData): Promise<User> {
    if (Object.keys(changes).length > 0) {
      await this.users.update({ id }, changes);
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
