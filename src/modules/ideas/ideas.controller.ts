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
  Query,
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
  CreateIdeaDto,
  IdeaListResponseDto,
  IdeaResponseDto,
  ListIdeasQueryDto,
  UpdateIdeaDto,
} from './dto/idea.dto';
import { IdeasService } from './ideas.service';

@ApiTags('Ideas')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('ideas')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  @ApiOperation({ summary: 'Search, filter, sort and page through your ideas' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListIdeasQueryDto,
  ): Promise<IdeaListResponseDto> {
    return this.ideas.findAll(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create an idea (only the title is required)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateIdeaDto,
  ): Promise<IdeaResponseDto> {
    return this.ideas.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one idea with its tags and links' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IdeaResponseDto> {
    return this.ideas.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an idea (send only what changes)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIdeaDto,
  ): Promise<IdeaResponseDto> {
    return this.ideas.update(user.id, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an idea (reversible)' })
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IdeaResponseDto> {
    return this.ideas.archive(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived idea' })
  restore(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IdeaResponseDto> {
    return this.ideas.restore(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an idea permanently' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.ideas.remove(user.id, id);
  }
}
