import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateTagDto,
  TagResponseDto,
  toTagResponse,
  UpdateTagDto,
} from './dto/tag.dto';
import { TagsService } from './tags.service';

@ApiTags('Tags')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List your tags (A to Z) with idea counts' })
  async findAll(@CurrentUser() user: AuthUser): Promise<TagResponseDto[]> {
    return (await this.tags.findAllWithCounts(user.id)).map(
      ({ tag, ideaCount }) => ({
        ...toTagResponse(tag),
        ideaCount,
      }),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a tag' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTagDto,
  ): Promise<TagResponseDto> {
    return toTagResponse(await this.tags.create(user.id, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a tag' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<TagResponseDto> {
    return toTagResponse(await this.tags.update(user.id, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag (removed from all ideas)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.tags.remove(user.id, id);
  }
}
