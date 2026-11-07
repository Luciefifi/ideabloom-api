import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetTokens1794077660087 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1794077660087';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_user_id" ON "password_reset_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_password_reset_tokens_token_hash" ON "password_reset_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_password_reset_tokens_token_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_password_reset_tokens_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
