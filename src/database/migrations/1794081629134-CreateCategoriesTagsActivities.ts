import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoriesTagsActivities1794081629134 implements MigrationInterface {
  name = 'CreateCategoriesTagsActivities1794081629134';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM records generated columns in typeorm_metadata, keyed by database
    // name. Use the CURRENT database's name, so this works on dev, test and
    // production alike (the generator had hard-coded database).
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `CREATE TABLE "activities" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "entity_type" character varying(30) NOT NULL, "entity_id" uuid NOT NULL, "action" character varying(30) NOT NULL, "summary" character varying(255) NOT NULL, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activities_user_created" ON "activities"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        'public',
        'categories',
        'GENERATED_COLUMN',
        'name_key',
        'lower(name)',
      ],
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "name" character varying(50) NOT NULL, "name_key" character varying(50) GENERATED ALWAYS AS (lower(name)) STORED NOT NULL, "color" character varying(20) NOT NULL DEFAULT 'lavender', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_user_id" ON "categories"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_categories_user_name_key" ON "categories"  ("user_id", "name_key") `,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        'public',
        'tags',
        'GENERATED_COLUMN',
        'name_key',
        'lower(name)',
      ],
    );
    await queryRunner.query(
      `CREATE TABLE "tags" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "name" character varying(30) NOT NULL, "name_key" character varying(30) GENERATED ALWAYS AS (lower(name)) STORED NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tags_user_id" ON "tags"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_tags_user_name_key" ON "tags"  ("user_id", "name_key") `,
    );
    await queryRunner.query(
      `ALTER TABLE "activities" ADD CONSTRAINT "FK_b82f1d8368dd5305ae7e7e664c2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_2296b7fe012d95646fa41921c8b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "FK_74603743868d1e4f4fc2c0225b6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `ALTER TABLE "tags" DROP CONSTRAINT "FK_74603743868d1e4f4fc2c0225b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_2296b7fe012d95646fa41921c8b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activities" DROP CONSTRAINT "FK_b82f1d8368dd5305ae7e7e664c2"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_tags_user_name_key"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_tags_user_id"`);
    await queryRunner.query(`DROP TABLE "tags"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'name_key', database, 'public', 'tags'],
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_categories_user_name_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_categories_user_id"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'name_key', database, 'public', 'categories'],
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_activities_user_created"`,
    );
    await queryRunner.query(`DROP TABLE "activities"`);
  }
}
