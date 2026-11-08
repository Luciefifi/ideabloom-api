import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CategoryRefDto,
  TagRefDto,
  TitleRefDto,
} from '../../../common/dto/refs.dto';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { AttachmentFieldsDto } from '../../attachments/attachment.dto';
import { IsTagNames } from '../../tags/dto/is-tag-names.decorator';
import type { NoteDoc } from '../note-content';

export const NOTE_TITLE_MAX = 200;
export const NOTE_MAX_TAGS = 20;
export const DEFAULT_NOTE_TITLE = 'Untitled note';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateNoteDto extends AttachmentFieldsDto {
  /** Defaults to "Untitled note". @example "Launch plan" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(NOTE_TITLE_MAX, {
    message: `Title must be at most ${NOTE_TITLE_MAX} characters`,
  })
  title?: string;

  /**
   * The editor document (Tiptap JSON), e.g.
   * {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}.
   * Only known elements are accepted; links must be http(s) or mailto.
   */
  @IsOptional()
  @IsObject({ message: 'content must be an editor document' })
  content?: NoteDoc;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  /** One of YOUR categories, or null for none. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4', { message: 'categoryId must be a valid id' })
  categoryId?: string | null;

  /** Tag NAMES; new ones are created. Replaces the note's tags when sent. @example ["planning"] */
  @IsTagNames(NOTE_MAX_TAGS, 'A note')
  tags?: string[];
}

/** Send only what changes (autosave sends just `content` or `title`). */
export class UpdateNoteDto extends PartialType(CreateNoteDto) {}

export const NOTE_SORTS = [
  'updatedAt',
  'createdAt',
  'title',
  'relevance',
] as const;
export type NoteSort = (typeof NOTE_SORTS)[number];

export class ListNotesQueryDto extends PaginationQueryDto {
  /** Words in the title or text (partial words match). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  /** A category id, or "none". */
  @IsOptional()
  @ValidateIf((_, value) => value !== 'none')
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  tagId?: string;

  /** Notes attached to this idea. */
  @IsOptional()
  @IsUUID('4')
  ideaId?: string;

  /** Notes attached to this project. */
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  pinned?: boolean;

  /** Default: "relevance" when searching, else "updatedAt". Pinned notes come first (except by relevance). */
  @IsOptional()
  @IsIn(NOTE_SORTS)
  sort?: NoteSort;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

// ----- Responses -----------------------------------------------------------

export class NoteResponseDto {
  id: string;
  title: string;
  /** Tiptap JSON. Render it with the editor; never as HTML. */
  content: NoteDoc;
  isPinned: boolean;
  category: CategoryRefDto | null;
  tags: TagRefDto[];
  idea: TitleRefDto | null;
  project: TitleRefDto | null;
  createdAt: Date;
  updatedAt: Date;
}

export class NoteSummaryDto extends OmitType(NoteResponseDto, ['content']) {
  /** The first 200 characters of the text. */
  excerpt: string;
}

export class NoteListResponseDto {
  data: NoteSummaryDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
