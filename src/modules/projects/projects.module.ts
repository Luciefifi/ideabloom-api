import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../activity/activity.module';
import { CategoriesModule } from '../categories/categories.module';
import { Idea } from '../ideas/entities/idea.entity';
import { UsersModule } from '../users/users.module';
import { Milestone } from './entities/milestone.entity';
import { Project } from './entities/project.entity';
import {
  IdeaConversionController,
  ProjectsController,
} from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    // The Idea repository (not IdeasModule) is enough for conversion and
    // linking, and avoids a circular dependency between the two modules.
    TypeOrmModule.forFeature([Project, Milestone, Idea]),
    ActivityModule,
    CategoriesModule,
    UsersModule,
  ],
  controllers: [ProjectsController, IdeaConversionController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
