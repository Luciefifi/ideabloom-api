import { MigrationInterface, QueryRunner } from 'typeorm';
import { deviceLabel } from '../../modules/auth/device-label';

/**
 * Sessions keep only a short device label ("Chrome on Windows"), not the full
 * User-Agent string (decision 28). Existing sessions are converted first, so
 * signed-in devices keep a readable name; then the full strings are removed.
 */
export class RefreshTokenDeviceLabel1794151134773 implements MigrationInterface {
  name = 'RefreshTokenDeviceLabel1794151134773';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "device_label" character varying(60)`,
    );
    const rows = (await queryRunner.query(
      `SELECT DISTINCT user_agent FROM "refresh_tokens" WHERE user_agent IS NOT NULL`,
    )) as { user_agent: string }[];
    for (const { user_agent } of rows) {
      await queryRunner.query(
        `UPDATE "refresh_tokens" SET device_label = $1 WHERE user_agent = $2`,
        [deviceLabel(user_agent), user_agent],
      );
    }
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "user_agent"`,
    );
  }

  /** The full strings are gone for good; going back only restores an empty column. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "user_agent" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "device_label"`,
    );
  }
}
