import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectTaskSearch1794148236332 implements MigrationInterface {
  name = 'AddProjectTaskSearch1794148236332';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `ALTER TABLE "projects" ADD "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(goals, '')), 'B') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')) STORED NOT NULL`,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        'public',
        'projects',
        'GENERATED_COLUMN',
        'search_vector',
        "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(goals, '')), 'B') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')",
      ],
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B')) STORED NOT NULL`,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        'public',
        'tasks',
        'GENERATED_COLUMN',
        'search_vector',
        "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B')",
      ],
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_projects_search_vector" ON "projects" USING gin ("search_vector") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_search_vector" ON "tasks" USING gin ("search_vector") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_search_vector"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_projects_search_vector"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'search_vector', database, 'public', 'tasks'],
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "search_vector"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'search_vector', database, 'public', 'projects'],
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN "search_vector"`,
    );
  }
}
