import { beforeEach, describe, expect, it } from 'vitest';
import { createRippleIndex, type RippleIndex } from '../src/index/rippleIndex.js';
import { parseRippleFile } from '../src/parser/parse.js';
import { contentHash } from '../src/hash.js';

const MONDAY = '/v/.ripple/stream/2026-06-08.md';
const PROJECT = '/v/.ripple/projects/wedding.md';

function indexSource(index: RippleIndex, path: string, source: string): void {
  index.indexFile(parseRippleFile(path, source), Date.now(), contentHash(source));
}

describe('RippleIndex', () => {
  let index: RippleIndex;

  beforeEach(async () => {
    index = await createRippleIndex();
    index.clear();
  });

  it('indexes tasks and serves filtered queries', () => {
    indexSource(index, MONDAY, ['[] email venue ^friday #wedding @alice', '[x] pick date #wedding'].join('\n'));
    indexSource(index, PROJECT, '[] choose flowers #wedding');

    expect(index.tasks()).toHaveLength(3);
    const open = index.tasks({ status: 'open' });
    expect(open.map((t) => t.text)).toEqual(['email venue ^friday #wedding @alice', 'choose flowers #wedding']);
    expect(open[0]!.due).toBe('2026-06-12');
    expect(open[0]!.tags).toEqual(['wedding']);
    expect(open[0]!.people).toEqual(['alice']);
    expect(index.tasks({ person: 'alice' })).toHaveLength(1);
    expect(index.tasks({ path: PROJECT })).toHaveLength(1);
  });

  it('reindexing a file is idempotent', () => {
    indexSource(index, MONDAY, '[] one\n\n[] two');
    indexSource(index, MONDAY, '[x] one');
    expect(index.tasks()).toHaveLength(1);
    expect(index.tasks()[0]!.status).toBe('done');
  });

  it('removeFile drops all derived rows', () => {
    indexSource(index, MONDAY, '[] one #t @p');
    index.removeFile(MONDAY);
    expect(index.tasks()).toHaveLength(0);
    expect(index.tagSummaries()).toHaveLength(0);
    expect(index.personSummaries()).toHaveLength(0);
  });

  it('aggregates tags and people with open-task counts', () => {
    indexSource(index, MONDAY, ['idea about #wedding', '[] call @alice about #wedding/venue'].join('\n'));
    const tags = index.tagSummaries();
    expect(tags.map((t) => t.name).sort()).toEqual(['wedding', 'wedding/venue']);
    const people = index.personSummaries();
    expect(people).toEqual([{ name: 'alice', mentionCount: 1, openTaskCount: 1 }]);
  });

  it('nested tag filters include children', () => {
    indexSource(index, MONDAY, '[] call florist #wedding/flowers');
    expect(index.tasks({ tag: 'wedding' })).toHaveLength(1);
    expect(index.tasks({ tag: 'wedding/flowers' })).toHaveLength(1);
    expect(index.tasks({ tag: 'flowers' })).toHaveLength(0);
  });

  it('searches block text', () => {
    indexSource(index, MONDAY, 'thinking about the caterer menu\n\nunrelated note');
    const results = index.search('caterer');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ path: MONDAY, startLine: 0 });
  });

  it('round-trips through export/import', async () => {
    indexSource(index, MONDAY, '[] persisted task');
    const data = index.export();
    const restored = await createRippleIndex({ data });
    expect(restored.tasks().map((t) => t.text)).toEqual(['persisted task']);
  });
});
