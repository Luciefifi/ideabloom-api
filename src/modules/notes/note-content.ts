/**
 * Notes are written with the Tiptap editor, which saves a document as JSON:
 *
 *   { type: 'doc', content: [
 *     { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
 *     { type: 'paragraph', content: [
 *       { type: 'text', text: 'Read ' },
 *       { type: 'text', text: 'this', marks: [{ type: 'link', attrs: { href: 'https://…' } }] },
 *     ] },
 *   ] }
 *
 * We never trust that JSON as-is. `sanitizeNoteContent` REBUILDS it from a
 * whitelist: unknown node or mark types are refused, unknown attributes are
 * dropped, and links must be http(s) or mailto (no "javascript:" links).
 * It also returns the plain text, which powers search and list previews.
 */

export const NOTE_CONTENT_MAX_BYTES = 200_000;
const MAX_DEPTH = 30;
const MAX_NODES = 20_000;

export interface NoteNode {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
  content?: NoteNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, string> }[];
}
export interface NoteDoc extends NoteNode {
  type: 'doc';
  content: NoteNode[];
}

export const EMPTY_NOTE: NoteDoc = { type: 'doc', content: [] };

export class NoteContentError extends Error {}

type Attrs = NonNullable<NoteNode['attrs']>;
/** Each allowed node type, with a function that keeps only its valid attributes. */
const NODES: Record<string, { block: boolean; attrs?: (raw: Attrs) => Attrs }> =
  {
    paragraph: { block: true },
    heading: {
      block: true,
      attrs: (raw) => {
        const level = Number(raw.level);
        if (![1, 2, 3].includes(level))
          throw new NoteContentError('Headings can be level 1 to 3.');
        return { level };
      },
    },
    bulletList: { block: true },
    orderedList: {
      block: true,
      attrs: (raw) => {
        const start = Number(raw.start ?? 1);
        return {
          start:
            Number.isInteger(start) && start >= 0 && start < 1e6 ? start : 1,
        };
      },
    },
    listItem: { block: true },
    taskList: { block: true },
    taskItem: {
      block: true,
      attrs: (raw) => ({ checked: raw.checked === true }),
    },
    blockquote: { block: true },
    codeBlock: {
      block: true,
      attrs: (raw) => ({
        language:
          typeof raw.language === 'string' &&
          /^[\w+#-]{1,30}$/.test(raw.language)
            ? raw.language
            : null,
      }),
    },
    horizontalRule: { block: true },
    hardBreak: { block: false },
    text: { block: false },
  };

const SIMPLE_MARKS = new Set(['bold', 'italic', 'strike', 'underline', 'code']);
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function cleanMarks(raw: unknown): NoteNode['marks'] {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 10)
    throw new NoteContentError('Invalid text formatting.');
  return raw.map((mark) => {
    if (!isObject(mark) || typeof mark.type !== 'string') {
      throw new NoteContentError('Invalid text formatting.');
    }
    if (SIMPLE_MARKS.has(mark.type)) return { type: mark.type };
    if (mark.type === 'link') {
      const href = isObject(mark.attrs) ? mark.attrs.href : undefined;
      if (
        typeof href !== 'string' ||
        href.length > 2000 ||
        !SAFE_LINK.test(href.trim())
      ) {
        throw new NoteContentError(
          'Links in notes must start with http://, https:// or mailto:',
        );
      }
      return { type: 'link', attrs: { href: href.trim() } };
    }
    throw new NoteContentError(`Unsupported formatting: "${mark.type}".`);
  });
}

/**
 * Validates and rebuilds editor JSON. Returns the clean document and its plain
 * text. Throws NoteContentError (→ 400) when something isn't allowed.
 */
export function sanitizeNoteContent(raw: unknown): {
  doc: NoteDoc;
  text: string;
} {
  if (!isObject(raw) || raw.type !== 'doc') {
    throw new NoteContentError('Note content must be an editor document.');
  }
  if (JSON.stringify(raw).length > NOTE_CONTENT_MAX_BYTES) {
    throw new NoteContentError(
      'This note is too long. Split it into several notes.',
    );
  }

  let nodes = 0;
  const lines: string[] = [];
  let line = '';
  const endLine = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };

  const clean = (value: unknown, depth: number): NoteNode => {
    if (depth > MAX_DEPTH)
      throw new NoteContentError('This note is nested too deeply.');
    if (++nodes > MAX_NODES)
      throw new NoteContentError('This note is too long.');
    if (!isObject(value) || typeof value.type !== 'string') {
      throw new NoteContentError('Invalid note content.');
    }
    const spec = NODES[value.type];
    if (!spec)
      throw new NoteContentError(`Unsupported note element: "${value.type}".`);

    if (value.type === 'text') {
      if (typeof value.text !== 'string' || value.text === '') {
        throw new NoteContentError('Invalid note content.');
      }
      line += value.text;
      const marks = cleanMarks(value.marks);
      return marks?.length
        ? { type: 'text', text: value.text, marks }
        : { type: 'text', text: value.text };
    }
    if (value.type === 'hardBreak') {
      endLine();
      return { type: 'hardBreak' };
    }

    const node: NoteNode = { type: value.type };
    if (spec.attrs)
      node.attrs = spec.attrs(
        isObject(value.attrs) ? (value.attrs as Attrs) : {},
      );
    if (value.content !== undefined) {
      if (!Array.isArray(value.content))
        throw new NoteContentError('Invalid note content.');
      node.content = value.content.map((child) => clean(child, depth + 1));
    }
    endLine(); // each block ends its line of plain text
    return node;
  };

  if (raw.content !== undefined && !Array.isArray(raw.content)) {
    throw new NoteContentError('Invalid note content.');
  }
  const content = ((raw.content as unknown[] | undefined) ?? []).map((child) =>
    clean(child, 1),
  );
  endLine();
  return { doc: { type: 'doc', content }, text: lines.join('\n') };
}

/** The first characters of the plain text, for list previews. */
export function excerpt(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
