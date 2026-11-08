import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/** Read-only: everything with a date, for the calendar page. */
@Module({
  imports: [ProjectsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
