import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const staticFiles = [
  'entry.html',
  'entries.html',
  'leaderboard.html',
  'schedule.html',
  'countries.html',
  'tables.html',
  'blog.html',
  'ticker.js',
  'nav-phase.js',
  'admin.html',
  'admin-results.html',
  'admin-blog.html',
  'admin-email.html',
  'match-reports.html',
  'admin-match-reports.html',
  'admin-matches.html',
  'admin-team-stats.html',
];

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0; url=leaderboard.html" />
  <title>PickerGame 2026</title>
  <script>window.location.replace('leaderboard.html');</script>
</head>
<body>
  <p><a href="leaderboard.html">Continue to PickerGame 2026</a></p>
</body>
</html>
`;

async function copyFile(relativePath) {
  await fs.copyFile(
    path.join(projectRoot, relativePath),
    path.join(distDir, relativePath),
  );
}

async function main() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const file of staticFiles) {
    await copyFile(file);
  }

  await fs.cp(path.join(projectRoot, 'Data'), path.join(distDir, 'Data'), {
    recursive: true,
  });
  await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8');

  console.log(`Prepared Cloudflare Pages output in ${distDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
