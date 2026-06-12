import { runTests } from '@vscode/test-electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(here, '..');
const extensionTestsPath = path.resolve(here, 'suite.cjs');

// Fixture workspace with a pre-existing ripple vault.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple-test-'));
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const streamDir = path.join(workspace, '.ripple', 'stream');
fs.mkdirSync(streamDir, { recursive: true });
fs.writeFileSync(
  path.join(streamDir, `${iso}.md`),
  `# ${iso}\n\n[] smoke-test task #testing @tester ^tomorrow\n[x] already done\n`,
);
const projectsDir = path.join(workspace, '.ripple', 'projects');
fs.mkdirSync(projectsDir, { recursive: true });
fs.writeFileSync(path.join(projectsDir, 'demo.md'), '# Demo\n\n[] project task\n');

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspace, '--disable-extensions', '--disable-gpu'],
  });
} catch (err) {
  console.error('Integration tests failed:', err);
  process.exit(1);
}
