import { describe, expect, it } from 'vitest';
import {
  extractDueExpression,
  extractPeople,
  extractPriority,
  extractTags,
  matchTaskLine,
  stripMetadata,
} from '../src/parser/grammar.js';

describe('matchTaskLine', () => {
  it('matches bare Ripple tasks', () => {
    const m = matchTaskLine('[] email the venue');
    expect(m).toMatchObject({ status: 'open', text: 'email the venue' });
    expect(m!.marker).toEqual({ start: 0, end: 2 });
  });

  it('matches all status markers', () => {
    expect(matchTaskLine('[x] done thing')!.status).toBe('done');
    expect(matchTaskLine('[X] done thing')!.status).toBe('done');
    expect(matchTaskLine('[>] later thing')!.status).toBe('deferred');
    expect(matchTaskLine('[-] dropped thing')!.status).toBe('cancelled');
  });

  it('matches GFM checkboxes with list markers and indentation', () => {
    const m = matchTaskLine('  - [ ] nested task');
    expect(m).toMatchObject({ status: 'open', text: 'nested task' });
    expect(m!.marker).toEqual({ start: 4, end: 7 });
  });

  it('does not match markdown links or empty tasks', () => {
    expect(matchTaskLine('[link](https://example.com)')).toBeUndefined();
    expect(matchTaskLine('see [the docs] for more')).toBeUndefined();
    expect(matchTaskLine('[]')).toBeUndefined();
    expect(matchTaskLine('[] ')).toBeUndefined();
    expect(matchTaskLine('const a = [] // code')).toBeUndefined();
  });
});

describe('inline metadata', () => {
  it('extracts tags including nested ones, lowercased and deduped', () => {
    expect(extractTags('note #Ideas #project/Picker-Game #ideas')).toEqual([
      'ideas',
      'project/picker-game',
    ]);
  });

  it('does not treat markdown headings as tags', () => {
    expect(extractTags('# Heading')).toEqual([]);
    expect(extractTags('## Another')).toEqual([]);
  });

  it('extracts people', () => {
    expect(extractPeople('ask @Alice and @bob-smith')).toEqual(['alice', 'bob-smith']);
  });

  it('extracts due expressions, single token and parenthesized', () => {
    expect(extractDueExpression('do thing ^friday')).toBe('friday');
    expect(extractDueExpression('do thing ^2026-07-01')).toBe('2026-07-01');
    expect(extractDueExpression('do thing ^(next friday)')).toBe('next friday');
    expect(extractDueExpression('no date here')).toBeUndefined();
  });

  it('extracts priority', () => {
    expect(extractPriority('fix scoring !high')).toBe('high');
    expect(extractPriority('someday !low')).toBe('low');
    expect(extractPriority('not !important')).toBeUndefined();
  });

  it('strips metadata for display labels', () => {
    expect(stripMetadata('email venue ^friday !high #wedding')).toBe('email venue #wedding');
  });
});
