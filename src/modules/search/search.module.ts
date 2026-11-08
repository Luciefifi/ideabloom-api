import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** Read-only full-text search across the user's items. */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
