import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLimitAttempts1794162344200 implements MigrationInterface {
  name = 'CreateLimitAttempts1794162344200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "limit_attempts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "key_hash" character(64) NOT NULL, "attempted_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_e08f6a4facb1397340f0babf52d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_limit_attempts_attempted_at" ON "limit_attempts"  ("attempted_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_limit_attempts_key_hash_attempted_at" ON "limit_attempts"  ("key_hash", "attempted_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_limit_attempts_key_hash_attempted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_limit_attempts_attempted_at"`,
    );
    await queryRunner.query(`DROP TABLE "limit_attempts"`);
  }
}
