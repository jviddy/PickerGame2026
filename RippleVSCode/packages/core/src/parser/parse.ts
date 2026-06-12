import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, RootContent } from 'mdast';
import type { FileKind, ParsedBlock, ParsedFile, ParsedTask } from '../types.js';
import {
  extractDueExpression,
  extractPeople,
  extractPriority,
  extractTags,
  matchTaskLine,
} from './grammar.js';
import { resolveDueDate, streamDateFromPath } from './dates.js';

const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * Parse one Ripple markdown file into blocks and tasks.
 *
 * remark provides block segmentation and code-fence positions; the Ripple
 * grammar (tasks, #tags, @people, ^dates, !priority) is extracted line-wise
 * from the source so we keep exact line/column positions for navigation
 * and checkbox toggling.
 */
export function parseRippleFile(path: string, source: string, kind?: FileKind): ParsedFile {
  const fileKind = kind ?? classifyPath(path);
  const date = fileKind === 'stream' ? streamDateFromPath(path) : undefined;
  const lines = source.split(/\r?\n/);
  const tree = processor.parse(source) as Root;
  const codeLines = collectCodeLines(tree);

  const blocks: ParsedBlock[] = [];
  for (const node of tree.children) {
    collectBlocks(node, blocks, lines, codeLines, date);
  }
  return { path, kind: fileKind, date, blocks };
}

export function classifyPath(path: string): FileKind {
  const p = path.replace(/\\/g, '/');
  if (/\/stream\/[^/]+\.md$/.test(p)) return 'stream';
  if (/\/projects\/[^/]+\.md$/.test(p)) return 'project';
  if (/\/people\/[^/]+\.md$/.test(p)) return 'person';
  return 'source';
}

function collectBlocks(
  node: RootContent,
  blocks: ParsedBlock[],
  lines: string[],
  codeLines: Set<number>,
  fileDate: string | undefined,
): void {
  if (node.type === 'code') return;
  if (node.type === 'list') {
    // Each top-level list item is its own block (nested content stays with its parent item).
    for (const item of node.children) {
      blocks.push(buildBlock(item.position!.start.line - 1, item.position!.end.line - 1, lines, codeLines, fileDate));
    }
    return;
  }
  if (!node.position) return;
  blocks.push(buildBlock(node.position.start.line - 1, node.position.end.line - 1, lines, codeLines, fileDate));
}

function buildBlock(
  startLine: number,
  endLine: number,
  lines: string[],
  codeLines: Set<number>,
  fileDate: string | undefined,
): ParsedBlock {
  const tags = new Set<string>();
  const people = new Set<string>();
  const tasks: ParsedTask[] = [];

  for (let lineNo = startLine; lineNo <= endLine; lineNo++) {
    if (codeLines.has(lineNo)) continue;
    const line = lines[lineNo] ?? '';
    for (const tag of extractTags(line)) tags.add(tag);
    for (const person of extractPeople(line)) people.add(person);

    const task = matchTaskLine(line);
    if (task) {
      const dueExpr = extractDueExpression(task.text);
      tasks.push({
        line: lineNo,
        text: task.text,
        status: task.status,
        due: dueExpr ? resolveDueDate(dueExpr, fileDate) : undefined,
        priority: extractPriority(task.text),
        tags: extractTags(task.text),
        people: extractPeople(task.text),
        marker: task.marker,
      });
    }
  }

  return {
    startLine,
    endLine,
    text: lines.slice(startLine, endLine + 1).join('\n'),
    tags: [...tags],
    people: [...people],
    tasks,
  };
}

/** 0-based line numbers covered by fenced/indented code anywhere in the tree. */
function collectCodeLines(tree: Root): Set<number> {
  const codeLines = new Set<number>();
  const visit = (node: { type: string; position?: { start: { line: number }; end: { line: number } }; children?: unknown[] }) => {
    if (node.type === 'code' && node.position) {
      for (let l = node.position.start.line - 1; l <= node.position.end.line - 1; l++) codeLines.add(l);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child as never);
    }
  };
  visit(tree);
  return codeLines;
}
