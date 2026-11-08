import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Read-only summaries across ideas, projects, milestones and tasks. */
@Module({
  imports: [ProjectsModule, UsersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
