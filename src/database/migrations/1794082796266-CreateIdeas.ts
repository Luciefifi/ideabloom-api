import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdeas1794082796266 implements MigrationInterface {
  name = 'CreateIdeas1794082796266';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Current database name (not the hard-coded dev name) for typeorm_metadata.
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        'public',
        'ideas',
        'GENERATED_COLUMN',
        'search_vector',
        "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B')",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE "ideas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "status" character varying(20) NOT NULL DEFAULT 'inbox', "priority" character varying(10), "is_favorite" boolean NOT NULL DEFAULT false, "archived_at" TIMESTAMP WITH TIME ZONE, "category_id" uuid, "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B')) STORED NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6ab43f1e9b1cef0d8f3e56ce3a3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ideas_category_id" ON "ideas"  ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ideas_search_vector" ON "ideas" USING gin ("search_vector") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ideas_user_status" ON "ideas"  ("user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ideas_user_archived_updated" ON "ideas"  ("user_id", "archived_at", "updated_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "idea_links" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "idea_id" uuid NOT NULL, "url" character varying(2000) NOT NULL, "label" character varying(200), "position" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_71f871e70cd889f12c7f49e33be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_idea_links_idea_id" ON "idea_links"  ("idea_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "idea_tags" ("idea_id" uuid NOT NULL, "tag_id" uuid NOT NULL, CONSTRAINT "PK_590ab25019cfa3bfd0906d8168d" PRIMARY KEY ("idea_id", "tag_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6bd8967c5174a8ba5e5291f380" ON "idea_tags"  ("idea_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6b0ee3f0cb6827e2d8bafe3c48" ON "idea_tags"  ("tag_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "ideas" ADD CONSTRAINT "FK_a193dbfa2c4ff1d687c10602982" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ideas" ADD CONSTRAINT "FK_a79a38cb2aaef0313e1d09c02d5" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "idea_links" ADD CONSTRAINT "FK_83d929b6aaf587973c2aaf09557" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "idea_tags" ADD CONSTRAINT "FK_6bd8967c5174a8ba5e5291f3809" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "idea_tags" ADD CONSTRAINT "FK_6b0ee3f0cb6827e2d8bafe3c48b" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `ALTER TABLE "idea_tags" DROP CONSTRAINT "FK_6b0ee3f0cb6827e2d8bafe3c48b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "idea_tags" DROP CONSTRAINT "FK_6bd8967c5174a8ba5e5291f3809"`,
    );
    await queryRunner.query(
      `ALTER TABLE "idea_links" DROP CONSTRAINT "FK_83d929b6aaf587973c2aaf09557"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ideas" DROP CONSTRAINT "FK_a79a38cb2aaef0313e1d09c02d5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ideas" DROP CONSTRAINT "FK_a193dbfa2c4ff1d687c10602982"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6b0ee3f0cb6827e2d8bafe3c48"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6bd8967c5174a8ba5e5291f380"`,
    );
    await queryRunner.query(`DROP TABLE "idea_tags"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_idea_links_idea_id"`);
    await queryRunner.query(`DROP TABLE "idea_links"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ideas_user_archived_updated"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_ideas_user_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ideas_search_vector"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ideas_category_id"`);
    await queryRunner.query(`DROP TABLE "ideas"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'search_vector', database, 'public', 'ideas'],
    );
  }
}
