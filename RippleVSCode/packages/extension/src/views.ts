import * as vscode from 'vscode';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  groupTasksByBucket,
  stripMetadata,
  todayIso,
  type SearchResult,
  type TaskRecord,
} from '@ripple/core';
import path from 'node:path';
import type { RippleService } from './rippleService.js';

export const OPEN_LOCATION_COMMAND = 'ripple.openLocation';

abstract class RippleTreeProvider<T> implements vscode.TreeDataProvider<T> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(protected readonly service: RippleService) {
    service.onDidChangeData(() => this.refresh());
  }

  refresh(): void {
    this.emitter.fire();
  }

  abstract getTreeItem(element: T): vscode.TreeItem;
  abstract getChildren(element?: T): vscode.ProviderResult<T[]>;
}

// ---------------------------------------------------------------- Tasks

type TaskNode = { type: 'bucket'; bucket: string; label: string; tasks: TaskRecord[] } | { type: 'task'; task: TaskRecord };

export class TasksProvider extends RippleTreeProvider<TaskNode> {
  override getChildren(element?: TaskNode): TaskNode[] {
    if (!element) {
      const open = this.service.data.tasks({ status: 'open' });
      const groups = groupTasksByBucket(open, todayIso());
      const nodes: TaskNode[] = [];
      for (const bucket of BUCKET_ORDER) {
        const tasks = groups.get(bucket)!;
        if (tasks.length) nodes.push({ type: 'bucket', bucket, label: BUCKET_LABELS[bucket], tasks });
      }
      return nodes;
    }
    if (element.type === 'bucket') return element.tasks.map((task) => ({ type: 'task', task }));
    return [];
  }

  override getTreeItem(node: TaskNode): vscode.TreeItem {
    if (node.type === 'bucket') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(node.tasks.length);
      item.id = `bucket:${node.bucket}`;
      return item;
    }
    return taskItem(node.task);
  }
}

export function taskItem(task: TaskRecord): vscode.TreeItem {
  const item = new vscode.TreeItem(stripMetadata(task.text));
  item.id = `task:${task.path}:${task.line}:${task.id}`;
  item.description = [task.due ?? undefined, path.basename(task.path)].filter(Boolean).join(' · ');
  item.tooltip = `${task.text}\n${task.path}:${task.line + 1}`;
  item.contextValue = task.status === 'open' ? 'ripple.openTask' : 'ripple.task';
  item.checkboxState =
    task.status === 'done' ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
  if (task.priority === 'high') item.iconPath = new vscode.ThemeIcon('flame');
  item.command = openLocationCommand(task.path, task.line);
  return item;
}

// ---------------------------------------------------------------- Stream

type StreamNode = { type: 'group'; label: string; dates: string[] } | { type: 'day'; date: string };

export class StreamProvider extends RippleTreeProvider<StreamNode> {
  override getChildren(element?: StreamNode): StreamNode[] {
    if (element) {
      return element.type === 'group' ? element.dates.map((date) => ({ type: 'day' as const, date })) : [];
    }
    const today = todayIso();
    const dates = this.service.data
      .listFiles()
      .filter((f) => f.kind === 'stream' && f.date)
      .map((f) => f.date!)
      .sort()
      .reverse();
    const groups: { label: string; dates: string[] }[] = [
      { label: 'Upcoming', dates: dates.filter((d) => d > today).reverse() },
      { label: 'Today', dates: dates.filter((d) => d === today) },
      { label: 'Earlier', dates: dates.filter((d) => d < today) },
    ];
    return groups.filter((g) => g.dates.length).map((g) => ({ type: 'group', ...g }));
  }

  override getTreeItem(node: StreamNode): vscode.TreeItem {
    if (node.type === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `stream-group:${node.label}`;
      return item;
    }
    const item = new vscode.TreeItem(node.date);
    item.id = `stream:${node.date}`;
    item.description = weekday(node.date);
    item.iconPath = new vscode.ThemeIcon('calendar');
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [this.service.streamUri(node.date)],
    };
    return item;
  }
}

// ---------------------------------------------------------------- Projects

type ProjectNode = { type: 'project'; path: string; name: string; openCount: number } | { type: 'task'; task: TaskRecord };

export class ProjectsProvider extends RippleTreeProvider<ProjectNode> {
  override getChildren(element?: ProjectNode): ProjectNode[] {
    if (!element) {
      return this.service.data
        .listFiles()
        .filter((f) => f.kind === 'project')
        .map((f) => ({
          type: 'project' as const,
          path: f.path,
          name: path.basename(f.path, '.md'),
          openCount: this.service.data.tasks({ status: 'open', path: f.path }).length,
        }));
    }
    if (element.type === 'project') {
      return this.service.data.tasks({ status: 'open', path: element.path }).map((task) => ({ type: 'task' as const, task }));
    }
    return [];
  }

  override getTreeItem(node: ProjectNode): vscode.TreeItem {
    if (node.type === 'task') return taskItem(node.task);
    const item = new vscode.TreeItem(
      node.name,
      node.openCount ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.id = `project:${node.path}`;
    item.description = node.openCount ? `${node.openCount} open` : undefined;
    item.iconPath = new vscode.ThemeIcon('notebook');
    item.command = openLocationCommand(node.path, 0);
    return item;
  }
}

// ---------------------------------------------------------------- Tags & People

type RefNode =
  | { type: 'tag'; name: string; detail: string }
  | { type: 'person'; name: string; detail: string }
  | { type: 'block'; ref: SearchResult };

abstract class ReferenceProvider extends RippleTreeProvider<RefNode> {
  override getTreeItem(node: RefNode): vscode.TreeItem {
    if (node.type === 'block') {
      const firstLine = node.ref.snippet.split('\n')[0] ?? '';
      const item = new vscode.TreeItem(firstLine.trim() || '(empty)');
      item.id = `block:${node.ref.path}:${node.ref.startLine}:${this.constructor.name}`;
      item.description = path.basename(node.ref.path);
      item.tooltip = node.ref.snippet;
      item.command = openLocationCommand(node.ref.path, node.ref.startLine);
      return item;
    }
    const item = new vscode.TreeItem(
      node.type === 'tag' ? `#${node.name}` : `@${node.name}`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.id = `${node.type}:${node.name}`;
    item.description = node.detail;
    item.iconPath = new vscode.ThemeIcon(node.type === 'tag' ? 'tag' : 'person');
    return item;
  }
}

export class TagsProvider extends ReferenceProvider {
  override getChildren(element?: RefNode): RefNode[] {
    if (!element) {
      return this.service.data.tagSummaries().map((t) => ({
        type: 'tag' as const,
        name: t.name,
        detail: t.openTaskCount ? `${t.blockCount} · ${t.openTaskCount} open` : String(t.blockCount),
      }));
    }
    if (element.type === 'tag') {
      return this.service.data.blocksForTag(element.name).map((ref) => ({ type: 'block' as const, ref }));
    }
    return [];
  }
}

export class PeopleProvider extends ReferenceProvider {
  override getChildren(element?: RefNode): RefNode[] {
    if (!element) {
      return this.service.data.personSummaries().map((p) => ({
        type: 'person' as const,
        name: p.name,
        detail: p.openTaskCount ? `${p.mentionCount} · ${p.openTaskCount} open` : String(p.mentionCount),
      }));
    }
    if (element.type === 'person') {
      return this.service.data.blocksForPerson(element.name).map((ref) => ({ type: 'block' as const, ref }));
    }
    return [];
  }
}

// ---------------------------------------------------------------- helpers

export function openLocationCommand(filePath: string, line: number): vscode.Command {
  return { command: OPEN_LOCATION_COMMAND, title: 'Open', arguments: [filePath, line] };
}

function weekday(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
}
