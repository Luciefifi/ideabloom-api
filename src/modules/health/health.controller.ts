import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  /** 200 when the API and database are healthy, 503 when the database is unreachable. */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check that the API and database are running' })
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
