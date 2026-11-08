import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../activity/activity.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { Note } from './entities/note.entity';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Note]),
    ActivityModule,
    CategoriesModule,
    TagsModule,
  ],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
