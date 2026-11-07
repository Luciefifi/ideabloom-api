import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';

/** PostgreSQL error code for "unique constraint violated". */
const UNIQUE_VIOLATION = '23505';

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

  /**
   * The only place the password hash is loaded (it's `select: false` on the entity).
   * Used by login and password checks, never for API responses.
   */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', {
        email: UsersService.normalizeEmail(email),
      })
      .getOne();
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
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }
}
