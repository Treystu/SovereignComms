import { globby } from 'globby';
import fs from 'node:fs/promises';
import path from 'node:path';

const files = await globby(['*.{ts,tsx,js,jsx}', '!node_modules/**']);

let errors = 0;

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

for (const f of files) {
  const txt = await fs.readFile(f, 'utf8');
  const imports = [
    ...txt.matchAll(/import\s+[^'"`]+from\s+['"]([^'"`]+)['"]/g),
  ].map((m) => m[1]);
  for (const spec of imports) {
    if (spec.startsWith('.')) {
      const candidates = [
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '/index.ts',
        '/index.tsx',
        '/index.js',
        '/index.jsx',
      ].map((ext) => path.resolve(path.dirname(f), spec + ext));
      let ok = false;
      for (const c of candidates) {
        if (await pathExists(c)) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        console.error(`[missing-import-target] ${f} -> ${spec}`);
        errors++;
      }
    }
  }
}

if (errors) {
  console.error(`\n❌ Import verify failed with ${errors} issue(s).`);
  process.exit(1);
} else {
  console.log('✅ Import verify passed.');
}
