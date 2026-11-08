import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActivityService } from './activity.service';
import {
  ActivityQueryDto,
  ActivityResponseDto,
  toActivityResponse,
} from './dto/activity.dto';

@ApiTags('Activity')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'Your recent activity, newest first' })
  async findRecent(
    @CurrentUser() user: AuthUser,
    @Query() query: ActivityQueryDto,
  ): Promise<ActivityResponseDto[]> {
    const entries = await this.activity.findRecent(user.id, query.limit);
    return entries.map(toActivityResponse);
  }
}
