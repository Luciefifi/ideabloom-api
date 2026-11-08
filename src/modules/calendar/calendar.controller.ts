import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CalendarQueryDto, CalendarResponseDto } from './dto/calendar.dto';

@ApiTags('Calendar')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @ApiOperation({
    summary:
      'Task, milestone and project dates between two days (at most 45 days apart)',
  })
  find(
    @CurrentUser() user: AuthUser,
    @Query() query: CalendarQueryDto,
  ): Promise<CalendarResponseDto> {
    return this.calendar.find(user.id, query);
  }
}
