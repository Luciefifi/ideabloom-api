import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../activity/activity.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { IdeaLink } from './entities/idea-link.entity';
import { Idea } from './entities/idea.entity';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Idea, IdeaLink]),
    ActivityModule,
    CategoriesModule,
    TagsModule,
  ],
  controllers: [IdeasController],
  providers: [IdeasService],
  exports: [IdeasService],
})
export class IdeasModule {}
