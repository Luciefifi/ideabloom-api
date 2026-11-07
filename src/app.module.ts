import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Env, validateEnv } from './config/env.validation';
import { baseDataSourceOptions } from './config/typeorm.config';
import { HealthModule } from './modules/health/health.module';

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

    HealthModule,
  ],
})
export class AppModule {}
