import { describe, expect, it } from 'vitest';
import { classifyPath, parseRippleFile } from '../src/parser/parse.js';

const STREAM_PATH = '/vault/.ripple/stream/2026-06-08.md'; // a Monday

describe('parseRippleFile', () => {
  it('classifies paths', () => {
    expect(classifyPath(STREAM_PATH)).toBe('stream');
    expect(classifyPath('/vault/.ripple/projects/picker-game.md')).toBe('project');
    expect(classifyPath('/vault/.ripple/people/alice.md')).toBe('person');
    expect(classifyPath('/repo/src/main.ts')).toBe('source');
  });

  it('extracts the stream date from the filename', () => {
    const parsed = parseRippleFile(STREAM_PATH, 'hello');
    expect(parsed.kind).toBe('stream');
    expect(parsed.date).toBe('2026-06-08');
  });

  it('segments paragraphs, headings and list items into blocks', () => {
    const src = ['# Monday', '', 'A thought about #ideas', '', '- first item', '- second item @alice'].join('\n');
    const parsed = parseRippleFile(STREAM_PATH, src);
    expect(parsed.blocks).toHaveLength(4);
    expect(parsed.blocks[1]).toMatchObject({ startLine: 2, endLine: 2, tags: ['ideas'] });
    expect(parsed.blocks[3]).toMatchObject({ startLine: 5, endLine: 5, people: ['alice'] });
  });

  it('extracts tasks with metadata and resolves ^dates relative to the file date', () => {
    const src = '[] email the venue ^friday #wedding @alice !high';
    const parsed = parseRippleFile(STREAM_PATH, src);
    const task = parsed.blocks[0]!.tasks[0]!;
    expect(task.status).toBe('open');
    // Friday of the week containing Monday 2026-06-08.
    expect(task.due).toBe('2026-06-12');
    expect(task.tags).toEqual(['wedding']);
    expect(task.people).toEqual(['alice']);
    expect(task.priority).toBe('high');
    expect(task.line).toBe(0);
  });

  it('finds tasks nested inside list items', () => {
    const src = ['- planning', '  - [ ] book caterer', '  - [x] book venue'].join('\n');
    const parsed = parseRippleFile(STREAM_PATH, src);
    const tasks = parsed.blocks.flatMap((b) => b.tasks);
    expect(tasks.map((t) => [t.text, t.status])).toEqual([
      ['book caterer', 'open'],
      ['book venue', 'done'],
    ]);
  });

  it('ignores tasks and tags inside fenced code blocks', () => {
    const src = ['some text', '', '```js', 'const x = [];', '[] not a task #nottag', '```'].join('\n');
    const parsed = parseRippleFile(STREAM_PATH, src);
    expect(parsed.blocks.flatMap((b) => b.tasks)).toHaveLength(0);
    expect(parsed.blocks.flatMap((b) => b.tags)).toHaveLength(0);
  });

  it('resolves explicit ISO dates as written', () => {
    const parsed = parseRippleFile(STREAM_PATH, '[] pay deposit ^2026-07-01');
    expect(parsed.blocks[0]!.tasks[0]!.due).toBe('2026-07-01');
  });
});
