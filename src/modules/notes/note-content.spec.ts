import {
  excerpt,
  NOTE_CONTENT_MAX_BYTES,
  NoteContentError,
  sanitizeNoteContent,
} from './note-content';

const text = (value: string, marks?: unknown[]) => ({
  type: 'text',
  text: value,
  marks,
});
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('sanitizeNoteContent', () => {
  it('keeps allowed content and extracts the plain text, one line per block', () => {
    const { doc: clean, text: plain } = sanitizeNoteContent(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Plan')] },
        paragraph(text('Read '), text('this', [{ type: 'bold' }])),
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [paragraph(text('Buy seeds'))],
            },
          ],
        },
      ),
    );
    expect(plain).toBe('Plan\nRead this\nBuy seeds');
    expect(clean.content[2]).toEqual({
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Buy seeds' }],
            },
          ],
        },
      ],
    });
  });

  it('accepts an empty document', () => {
    expect(sanitizeNoteContent({ type: 'doc' })).toEqual({
      doc: { type: 'doc', content: [] },
      text: '',
    });
  });

  it('drops unknown attributes and keeps only the link address', () => {
    const { doc: clean } = sanitizeNoteContent(
      doc({
        type: 'paragraph',
        attrs: { onclick: 'alert(1)', style: 'color:red' },
        content: [
          text('site', [
            {
              type: 'link',
              attrs: {
                href: 'https://example.com',
                target: '_self',
                class: 'x',
              },
            },
          ]),
        ],
      }),
    );
    expect(clean.content[0]).toEqual({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'site',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
      ],
    });
  });

  it.each([
    [
      'javascript: links',
      doc(
        paragraph(
          text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
        ),
      ),
    ],
    [
      'data: links',
      doc(
        paragraph(
          text('x', [{ type: 'link', attrs: { href: 'data:text/html,<b>' } }]),
        ),
      ),
    ],
    [
      'unknown elements',
      doc({ type: 'iframe', attrs: { src: 'https://evil.example' } }),
    ],
    ['unknown formatting', doc(paragraph(text('x', [{ type: 'highlight' }])))],
    ['raw HTML strings', '<p onclick="x">hi</p>'],
    [
      'a heading level 6',
      doc({ type: 'heading', attrs: { level: 6 }, content: [text('x')] }),
    ],
    ['empty text nodes', doc(paragraph(text('')))],
  ])('rejects %s', (_label, input) => {
    expect(() => sanitizeNoteContent(input)).toThrow(NoteContentError);
  });

  it('rejects notes that are too big or too deep', () => {
    expect(() =>
      sanitizeNoteContent(
        doc(paragraph(text('a'.repeat(NOTE_CONTENT_MAX_BYTES)))),
      ),
    ).toThrow('too long');

    let deep: unknown = paragraph(text('x'));
    for (let i = 0; i < 40; i++) deep = { type: 'blockquote', content: [deep] };
    expect(() => sanitizeNoteContent(doc(deep))).toThrow('nested too deeply');
  });
});

describe('excerpt', () => {
  it('flattens whitespace and shortens long text', () => {
    expect(excerpt('Plan\n\nRead   this')).toBe('Plan Read this');
    expect(excerpt('word '.repeat(100), 20)).toBe('word word word word…');
  });
});
