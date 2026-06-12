// Minimal dependency-free test suite run inside the VS Code extension host.
const assert = require('node:assert');
const vscode = require('vscode');

async function waitFor(check, label, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

exports.run = async function run() {
  const ext = vscode.extensions.getExtension('ripple.ripple-vscode');
  assert.ok(ext, 'extension is discovered');
  await ext.activate();
  assert.ok(ext.isActive, 'extension activates');

  // All contributed commands are registered.
  const commands = await vscode.commands.getCommands(true);
  for (const id of [
    'ripple.openToday',
    'ripple.quickCapture',
    'ripple.toggleTask',
    'ripple.search',
    'ripple.newProject',
    'ripple.rebuildIndex',
  ]) {
    assert.ok(commands.includes(id), `command registered: ${id}`);
  }

  // Open Today opens (or creates) the daily stream file.
  await vscode.commands.executeCommand('ripple.openToday');
  const editor = await waitFor(() => vscode.window.activeTextEditor, 'today editor');
  assert.match(editor.document.uri.fsPath, /\.ripple[\\/]stream[\\/]\d{4}-\d{2}-\d{2}\.md$/);

  // The fixture task line round-trips through Toggle Task: open -> done.
  const taskLine = editor.document
    .getText()
    .split('\n')
    .findIndex((l) => l.startsWith('[] smoke-test task'));
  assert.ok(taskLine >= 0, 'fixture task present in today file');
  editor.selection = new vscode.Selection(taskLine, 0, taskLine, 0);
  await vscode.commands.executeCommand('ripple.toggleTask');
  await waitFor(
    () => editor.document.lineAt(taskLine).text.startsWith('[x] smoke-test task'),
    'task toggled to done',
  );

  // Rebuild index runs without throwing.
  await vscode.commands.executeCommand('ripple.rebuildIndex');

  console.log('ripple integration smoke tests passed');
};
