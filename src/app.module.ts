import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildThrottlerOptions } from './common/throttling/throttler.config';
import { Env, validateEnv } from './config/env.validation';
import { baseDataSourceOptions } from './config/typeorm.config';
import { ActivityModule } from './modules/activity/activity.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { HealthModule } from './modules/health/health.module';
import { IdeasModule } from './modules/ideas/ideas.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotesModule } from './modules/notes/notes.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TagsModule } from './modules/tags/tags.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // Loads .env (or .env.test when running tests) and validates it at startup.
    // isGlobal makes ConfigService injectable in every module without re-importing.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),

    // Connects to PostgreSQL. autoLoadEntities registers each entity when its
    // feature module calls TypeOrmModule.forFeature([...]).
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        ...baseDataSourceOptions(config.get('DATABASE_URL', { infer: true })),
        autoLoadEntities: true,
      }),
    }),

    // Rate limiting per visitor IP (see common/throttling/throttler.config.ts).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildThrottlerOptions({
          defaultLimit: config.get('RATE_LIMIT_DEFAULT', { infer: true }),
          authLimit: config.get('RATE_LIMIT_AUTH', { infer: true }),
        }),
    }),

    HealthModule,
    UsersModule,
    AuthModule,
    ActivityModule,
    CategoriesModule,
    TagsModule,
    IdeasModule,
    ProjectsModule,
    TasksModule,
    NotesModule,
    ResourcesModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
