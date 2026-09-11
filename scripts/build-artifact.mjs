/**
 * Emits dist/artifact.html — the same page as index.html, minus the document
 * wrapper that the artifact host supplies itself. Generated, so the hosted copy
 * can never drift from the local one.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(ROOT, 'index.html'), 'utf8');

const pick = (pattern) => source.match(pattern)?.[1] ?? '';
const title = pick(/<title>([\s\S]*?)<\/title>/);
const body = pick(/<body>([\s\S]*?)<\/body>/);
const head = [...source.matchAll(/^\s*<link [^>]*>$/gm)]
  .map((m) => m[0].trim())
  .filter((tag) => !tag.includes('rel="icon"'))
  .join('\n');

const page = `<title>${title}</title>\n${head}\n${body.trim()}\n`;

await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await writeFile(resolve(ROOT, 'dist/artifact.html'), page, 'utf8');
console.log(`dist/artifact.html — ${page.length} bytes`);
