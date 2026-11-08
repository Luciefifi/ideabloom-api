import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dto/dashboard.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary:
      'Counts, deadlines (overdue + next 14 days), active projects and tasks completed per week, in your time zone',
  })
  get(@CurrentUser() user: AuthUser): Promise<DashboardResponseDto> {
    return this.dashboard.get(user.id);
  }
}
