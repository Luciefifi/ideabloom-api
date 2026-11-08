import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTasks1794114047354 implements MigrationInterface {
  name = 'CreateTasks1794114047354';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "status" character varying(20) NOT NULL DEFAULT 'todo', "priority" character varying(10), "start_date" date, "due_date" date, "completed_at" TIMESTAMP WITH TIME ZONE, "project_id" uuid, "parent_task_id" uuid, "position" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_tasks_due_after_start" CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date"), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_project_id" ON "tasks"  ("project_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_parent_task_id" ON "tasks"  ("parent_task_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_user_status_due" ON "tasks"  ("user_id", "status", "due_date") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_db55af84c226af9dce09487b61b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_9eecdb5b1ed8c7c2a1b392c28d4" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_54fc42a253a8338488ec1f960ad" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_54fc42a253a8338488ec1f960ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_9eecdb5b1ed8c7c2a1b392c28d4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_db55af84c226af9dce09487b61b"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_user_status_due"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_parent_task_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_project_id"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
  }
}
