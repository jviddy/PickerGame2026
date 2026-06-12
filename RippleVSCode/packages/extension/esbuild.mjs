import esbuild from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');

fs.mkdirSync('dist', { recursive: true });
// sql.js loads its wasm at runtime; ship it next to the bundle.
fs.copyFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'), 'dist/sql-wasm.wasm');

const options = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
