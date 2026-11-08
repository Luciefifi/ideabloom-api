import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotesAndResources1794115894078 implements MigrationInterface {
  name = 'CreateNotesAndResources1794115894078';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        'public',
        'notes',
        'GENERATED_COLUMN',
        'search_vector',
        "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE "notes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "content" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}', "content_text" text NOT NULL DEFAULT '', "is_pinned" boolean NOT NULL DEFAULT false, "category_id" uuid, "idea_id" uuid, "project_id" uuid, "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')) STORED NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_notes_one_parent" CHECK ("idea_id" IS NULL OR "project_id" IS NULL), CONSTRAINT "PK_af6206538ea96c4e77e9f400c3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notes_category_id" ON "notes"  ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notes_idea_id" ON "notes"  ("idea_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notes_project_id" ON "notes"  ("project_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notes_search_vector" ON "notes" USING gin ("search_vector") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notes_user_pinned_updated" ON "notes"  ("user_id", "is_pinned", "updated_at") `,
    );
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        database,
        'public',
        'resources',
        'GENERATED_COLUMN',
        'search_vector',
        "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B') || setweight(to_tsvector('simple', coalesce(notes, '')), 'C')",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE "resources" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "url" character varying(2000) NOT NULL, "type" character varying(20) NOT NULL DEFAULT 'website', "description" text, "notes" text, "category_id" uuid, "idea_id" uuid, "project_id" uuid, "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B') || setweight(to_tsvector('simple', coalesce(notes, '')), 'C')) STORED NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_resources_one_parent" CHECK ("idea_id" IS NULL OR "project_id" IS NULL), CONSTRAINT "PK_632484ab9dff41bba94f9b7c85e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resources_category_id" ON "resources"  ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resources_idea_id" ON "resources"  ("idea_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resources_project_id" ON "resources"  ("project_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resources_search_vector" ON "resources" USING gin ("search_vector") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resources_user_updated" ON "resources"  ("user_id", "updated_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "note_tags" ("note_id" uuid NOT NULL, "tag_id" uuid NOT NULL, CONSTRAINT "PK_fdb07cb0571e1ecfaeffc703281" PRIMARY KEY ("note_id", "tag_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6fa35b8ead30ef28cc1ac377b2" ON "note_tags"  ("note_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_898115de9eadba996d4323ff0b" ON "note_tags"  ("tag_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "resource_tags" ("resource_id" uuid NOT NULL, "tag_id" uuid NOT NULL, CONSTRAINT "PK_f0db14b7ade2c271566c3bef363" PRIMARY KEY ("resource_id", "tag_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_804580fef1c203e9345c7509f2" ON "resource_tags"  ("resource_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_34f67f0fae4af891606973e9b5" ON "resource_tags"  ("tag_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_7708dcb62ff332f0eaf9f0743a7" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_3d5c6951d7233408f4f9359a5c1" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_a7919852a0f481f9b4fb5f436f4" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" ADD CONSTRAINT "FK_64567ba716240b262710cfbfb0d" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ADD CONSTRAINT "FK_78844f2d9f8da7d87d8dbff4794" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ADD CONSTRAINT "FK_42a91403d5498bcd3cde20a3980" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ADD CONSTRAINT "FK_5092ad253fbf98a284f171e4aa3" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ADD CONSTRAINT "FK_e9b8266cbfbd6a692a205efaa8f" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_tags" ADD CONSTRAINT "FK_6fa35b8ead30ef28cc1ac377b21" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_tags" ADD CONSTRAINT "FK_898115de9eadba996d4323ff0b6" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_tags" ADD CONSTRAINT "FK_804580fef1c203e9345c7509f21" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_tags" ADD CONSTRAINT "FK_34f67f0fae4af891606973e9b54" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `ALTER TABLE "resource_tags" DROP CONSTRAINT "FK_34f67f0fae4af891606973e9b54"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_tags" DROP CONSTRAINT "FK_804580fef1c203e9345c7509f21"`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_tags" DROP CONSTRAINT "FK_898115de9eadba996d4323ff0b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "note_tags" DROP CONSTRAINT "FK_6fa35b8ead30ef28cc1ac377b21"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" DROP CONSTRAINT "FK_e9b8266cbfbd6a692a205efaa8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" DROP CONSTRAINT "FK_5092ad253fbf98a284f171e4aa3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" DROP CONSTRAINT "FK_42a91403d5498bcd3cde20a3980"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" DROP CONSTRAINT "FK_78844f2d9f8da7d87d8dbff4794"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_64567ba716240b262710cfbfb0d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_a7919852a0f481f9b4fb5f436f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_3d5c6951d7233408f4f9359a5c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notes" DROP CONSTRAINT "FK_7708dcb62ff332f0eaf9f0743a7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_34f67f0fae4af891606973e9b5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_804580fef1c203e9345c7509f2"`,
    );
    await queryRunner.query(`DROP TABLE "resource_tags"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_898115de9eadba996d4323ff0b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6fa35b8ead30ef28cc1ac377b2"`,
    );
    await queryRunner.query(`DROP TABLE "note_tags"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_resources_user_updated"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_resources_search_vector"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_resources_project_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_resources_idea_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_resources_category_id"`);
    await queryRunner.query(`DROP TABLE "resources"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'search_vector', database, 'public', 'resources'],
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notes_user_pinned_updated"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_notes_search_vector"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notes_project_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notes_idea_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notes_category_id"`);
    await queryRunner.query(`DROP TABLE "notes"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`,
      ['GENERATED_COLUMN', 'search_vector', database, 'public', 'notes'],
    );
  }
}
