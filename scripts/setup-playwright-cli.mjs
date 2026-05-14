// Regenerate .playwright-cli/config.json from the committed template so
// the --load-extension path resolves correctly under Playwright's bundled
// chromium (which uses its own binary directory as CWD, not ours).
//
// Auto-runs via `prebuild`. Safe to run standalone: `npm run pw:setup`.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const templatePath = resolve(repoRoot, '.playwright-cli/config.template.json');
const outPath = resolve(repoRoot, '.playwright-cli/config.json');

const distPath = resolve(repoRoot, 'dist').replace(/\\/g, '/');
const template = readFileSync(templatePath, 'utf8');
const rendered = template.replaceAll('{{DIST_PATH}}', distPath);

writeFileSync(outPath, rendered);
console.log(`[setup-playwright-cli] wrote ${outPath} (dist=${distPath})`);
