import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const databaseName = 'pickergame2026-entries';

const selectEntriesSql = [
  'SELECT team_name, entrant_name, email,',
  'selected_teams_json, tie_breaker_answers_json, created_at',
  'FROM entries',
  'ORDER BY created_at ASC',
].join(' ');

function parseWranglerJson(stdout) {
  const parsed = JSON.parse(stdout);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;

  if (!result || result.success === false) {
    throw new Error('Wrangler did not return a successful D1 response.');
  }

  return result.results || [];
}

function parseJsonField(value, fallback, fieldName) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid ${fieldName} JSON stored in D1.`);
  }
}

function toEntry(row) {
  return {
    entrantName: row.entrant_name,
    email: row.email,
    teamName: row.team_name,
    tieBreakerAnswers: parseJsonField(
      row.tie_breaker_answers_json,
      [],
      'tie breaker answers',
    ),
    selectedTeams: parseJsonField(row.selected_teams_json, [], 'selected teams'),
    submittedAt: row.created_at,
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  console.log(`Exporting entries from D1 database: ${databaseName}`);

  const { stdout } = await execFileAsync('npx', [
    'wrangler',
    'd1',
    'execute',
    databaseName,
    '--remote',
    '--command',
    selectEntriesSql,
    '--json',
  ], {
    cwd: projectRoot,
    maxBuffer: 1024 * 1024 * 10,
  });

  const rows = parseWranglerJson(stdout);
  const entries = rows.map(toEntry);
  const outputFiles = [
    path.join(workspaceRoot, 'Data', 'entries.json'),
    path.join(projectRoot, 'Data', 'entries.json'),
  ];

  for (const filePath of outputFiles) {
    await writeJson(filePath, entries);
    console.log(`Written ${entries.length} entries to ${filePath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.stderr) console.error(error.stderr);
  if (error.stdout) console.error(error.stdout);
  process.exit(1);
});
