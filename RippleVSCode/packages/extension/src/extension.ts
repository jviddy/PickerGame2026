import * as vscode from 'vscode';
import { matchTaskLine, resolveDueDate, todayIso, type TaskRecord } from '@ripple/core';
import { RippleService } from './rippleService.js';
import {
  OPEN_LOCATION_COMMAND,
  PeopleProvider,
  ProjectsProvider,
  StreamProvider,
  TagsProvider,
  TasksProvider,
} from './views.js';

let service: RippleService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  service = await RippleService.create(context);
  if (!service) {
    // No workspace open — register commands that explain the requirement.
    for (const id of ['ripple.openToday', 'ripple.quickCapture', 'ripple.search']) {
      context.subscriptions.push(
        vscode.commands.registerCommand(id, () =>
          vscode.window.showInformationMessage('Ripple needs an open folder to store your notes.'),
        ),
      );
    }
    return;
  }
  const ripple = service;
  context.subscriptions.push(ripple);

  // ---- views -----------------------------------------------------------
  const tasksProvider = new TasksProvider(ripple);
  const providers = {
    'ripple.stream': new StreamProvider(ripple),
    'ripple.tasks': tasksProvider,
    'ripple.projects': new ProjectsProvider(ripple),
    'ripple.tags': new TagsProvider(ripple),
    'ripple.people': new PeopleProvider(ripple),
  } as const;

  for (const [viewId, provider] of Object.entries(providers)) {
    const view = vscode.window.createTreeView(viewId, {
      treeDataProvider: provider as vscode.TreeDataProvider<unknown>,
      showCollapseAll: true,
    });
    view.onDidChangeCheckboxState(async (e) => {
      for (const [node] of e.items) {
        const task = (node as { task?: TaskRecord }).task;
        if (task) await ripple.setTaskStatus(task.path, task.line, task.status !== 'done');
      }
    });
    context.subscriptions.push(view);
  }

  // ---- status bar --------------------------------------------------------
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'ripple.tasks.focus';
  const updateStatus = () => {
    const open = ripple.data.tasks({ status: 'open' });
    const dueToday = open.filter((t) => t.due && t.due <= todayIso()).length;
    status.text = dueToday ? `$(checklist) ${dueToday} due` : `$(checklist) ${open.length} open`;
    status.tooltip = 'Ripple: open the Tasks view';
    status.show();
  };
  updateStatus();
  context.subscriptions.push(status, ripple.onDidChangeData(updateStatus));

  // ---- commands ----------------------------------------------------------
  const register = (id: string, fn: (...args: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register(OPEN_LOCATION_COMMAND, async (filePath: string, line: number) => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const editor = await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(Math.min(line, doc.lineCount - 1), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  });

  register('ripple.openToday', () => ripple.openStreamFile());

  register('ripple.quickCapture', async () => {
    const text = await vscode.window.showInputBox({
      prompt: 'Capture to today’s stream',
      placeHolder: '[] call the venue ^friday #wedding @alice',
    });
    if (text?.trim()) {
      await ripple.capture(text);
      vscode.window.setStatusBarMessage('$(check) Captured to today', 2000);
    }
  });

  register('ripple.toggleTask', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const line = editor.selection.active.line;
    const lineText = editor.document.lineAt(line).text;
    const task = matchTaskLine(lineText);
    if (task) {
      await ripple.setTaskStatus(editor.document.uri.fsPath, line, task.status !== 'done');
    } else {
      // Not a task yet — make it one, preserving any list marker.
      const m = /^(\s*(?:[-*+]\s+)?)(.*)$/.exec(lineText)!;
      await editor.edit((b) =>
        b.replace(new vscode.Range(line, 0, line, lineText.length), `${m[1]}[] ${m[2]}`),
      );
    }
  });

  register('ripple.search', async () => {
    const picker = vscode.window.createQuickPick<vscode.QuickPickItem & { path?: string; line?: number }>();
    picker.placeholder = 'Search your notes…';
    picker.matchOnDescription = true;
    picker.onDidChangeValue((value) => {
      const results = ripple.data.search(value, 30);
      picker.items = results.map((r) => ({
        label: (r.snippet.split('\n')[0] ?? '').trim(),
        description: `${r.path.split('/').pop()}:${r.startLine + 1}`,
        path: r.path,
        line: r.startLine,
        alwaysShow: true,
      }));
    });
    picker.onDidAccept(async () => {
      const item = picker.selectedItems[0];
      picker.hide();
      if (item?.path !== undefined) {
        await vscode.commands.executeCommand(OPEN_LOCATION_COMMAND, item.path, item.line ?? 0);
      }
    });
    picker.onDidHide(() => picker.dispose());
    picker.show();
  });

  register('ripple.newProject', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'Project name', placeHolder: 'House renovation' });
    if (!name?.trim()) return;
    const uri = await ripple.createProject(name.trim());
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  });

  register('ripple.addFutureNote', async () => {
    const expr = await vscode.window.showInputBox({
      prompt: 'When? (natural language or YYYY-MM-DD)',
      placeHolder: 'next friday',
    });
    if (!expr?.trim()) return;
    const date = resolveDueDate(expr.trim());
    if (!date) {
      vscode.window.showWarningMessage(`Ripple couldn’t understand the date “${expr}”.`);
      return;
    }
    await ripple.openStreamFile(date);
  });

  register('ripple.rebuildIndex', async () => {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Ripple: rebuilding index…' },
      () => ripple.rebuild(),
    );
    vscode.window.setStatusBarMessage('$(check) Ripple index rebuilt', 2000);
  });

  register('ripple.completeTask', async (node?: { task?: TaskRecord }) => {
    const task = node?.task;
    if (task) await ripple.setTaskStatus(task.path, task.line, true);
  });

  register('ripple.refresh', () => ripple.scanAll());
}

export function deactivate(): void {
  service = undefined;
}
