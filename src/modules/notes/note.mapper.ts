import {
  toCategoryRef,
  toTagRefs,
  toTitleRef,
} from '../../common/dto/refs.dto';
import type { NoteResponseDto, NoteSummaryDto } from './dto/note.dto';
import type { Note } from './entities/note.entity';
import { EMPTY_NOTE, excerpt } from './note-content';

/** For lists: needs category, tags, idea and project loaded (not content). */
export function toNoteSummary(note: Note): NoteSummaryDto {
  return {
    id: note.id,
    title: note.title,
    excerpt: excerpt(note.contentText),
    isPinned: note.isPinned,
    category: toCategoryRef(note.category),
    tags: toTagRefs(note.tags),
    idea: toTitleRef(note.idea),
    project: toTitleRef(note.project),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

/** Full note, with the editor document. */
export function toNoteResponse(note: Note): NoteResponseDto {
  const { excerpt: _excerpt, ...summary } = toNoteSummary(note);
  void _excerpt;
  return { ...summary, content: note.content ?? EMPTY_NOTE };
}
