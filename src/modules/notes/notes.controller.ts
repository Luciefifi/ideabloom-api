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
  CreateNoteDto,
  ListNotesQueryDto,
  NoteListResponseDto,
  NoteResponseDto,
  UpdateNoteDto,
} from './dto/note.dto';
import { NotesService } from './notes.service';

@ApiTags('Notes')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @ApiOperation({
    summary: 'Your notes (pinned first), with search and filters',
  })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotesQueryDto,
  ): Promise<NoteListResponseDto> {
    return this.notes.findAll(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a note (everything is optional)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notes.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One note with its editor content' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NoteResponseDto> {
    return this.notes.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a note (used by autosave)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notes.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a note permanently' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notes.remove(user.id, id);
  }
}
