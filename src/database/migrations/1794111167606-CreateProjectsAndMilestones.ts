import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectsAndMilestones1794111167606 implements MigrationInterface {
  name = 'CreateProjectsAndMilestones1794111167606';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "milestones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "project_id" uuid NOT NULL, "user_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "due_date" date, "completed_at" TIMESTAMP WITH TIME ZONE, "position" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0bdbfe399c777a6a8520ff902d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_milestones_user_id" ON "milestones"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_milestones_project_position" ON "milestones"  ("project_id", "position") `,
    );
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "goals" text, "status" character varying(20) NOT NULL DEFAULT 'not_started', "priority" character varying(10), "category_id" uuid, "start_date" date, "target_date" date, "completed_at" TIMESTAMP WITH TIME ZONE, "source_idea_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_projects_target_after_start" CHECK ("target_date" IS NULL OR "start_date" IS NULL OR "target_date" >= "start_date"), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_projects_category_id" ON "projects"  ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_projects_user_updated" ON "projects"  ("user_id", "updated_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_projects_user_status" ON "projects"  ("user_id", "status") `,
    );
    await queryRunner.query(`ALTER TABLE "ideas" ADD "project_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_activities_entity" ON "activities"  ("entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ideas_project_id" ON "ideas"  ("project_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "milestones" ADD CONSTRAINT "FK_2204463ea4c5c1872e1fb2b8ffb" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "milestones" ADD CONSTRAINT "FK_0e3c65ca6c89021aab03eeb7b90" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "FK_bd55b203eb9f92b0c8390380010" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "FK_c1345700580c6c6b17200647bcc" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" ADD CONSTRAINT "FK_60834c5378891da41a7beb31584" FOREIGN KEY ("source_idea_id") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ideas" ADD CONSTRAINT "FK_f3016f7d9929a2e132d99eff162" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ideas" DROP CONSTRAINT "FK_f3016f7d9929a2e132d99eff162"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP CONSTRAINT "FK_60834c5378891da41a7beb31584"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP CONSTRAINT "FK_c1345700580c6c6b17200647bcc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP CONSTRAINT "FK_bd55b203eb9f92b0c8390380010"`,
    );
    await queryRunner.query(
      `ALTER TABLE "milestones" DROP CONSTRAINT "FK_0e3c65ca6c89021aab03eeb7b90"`,
    );
    await queryRunner.query(
      `ALTER TABLE "milestones" DROP CONSTRAINT "FK_2204463ea4c5c1872e1fb2b8ffb"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_ideas_project_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_activities_entity"`);
    await queryRunner.query(`ALTER TABLE "ideas" DROP COLUMN "project_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_projects_user_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_projects_user_updated"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_projects_category_id"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_milestones_project_position"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_milestones_user_id"`);
    await queryRunner.query(`DROP TABLE "milestones"`);
  }
}
