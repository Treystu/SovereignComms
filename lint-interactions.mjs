import { globby } from 'globby';
import fs from 'node:fs/promises';

const files = await globby(['**/*.{tsx,jsx,js,html}', '!node_modules/**', '!dist/**']);
let errors = 0;

for (const f of files) {
  const txt = await fs.readFile(f, 'utf8');
  if (!/\/\*\s*ALLOW_DISABLED_IN_PROTOTYPE\s*\*\//.test(txt)) {
    const disabledHits = txt.match(/<\s*button[^>]*\b(?<!aria-)disabled\b/gi)?.length || 0;
    if (disabledHits) { console.error(`[disabled-button] ${f} : ${disabledHits}`); errors++; }
  }
  if (f.endsWith('.html')) {
    const onclicks = [...txt.matchAll(/onclick\s*=\s*["']\s*([A-Za-z_]\w*)\s*\(/gi)];
    for (const [,fn] of onclicks) {
      if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(txt)) {
        console.error(`[missing-onclick-fn] ${f} : ${fn}`); errors++;
      }
    }
  }
  if (/\.(tsx|jsx|js)$/.test(f)) {
    const handlers = [...txt.matchAll(/onClick\s*=\s*{\s*([A-Za-z_]\w*)\s*}/g)].map(m=>m[1]);
    for (const h of handlers) {
      const defined = new RegExp(`(function\\s+${h}\\s*\\()|(const\\s+${h}\\s*=)|(let\\s+${h}\\s*=)|(async\\s+function\\s+${h}\\s*\\()`).test(txt)
        || new RegExp(`import\\s+\\{[^}]*\\b${h}\\b[^}]*\\}\\s+from\\s+["']`).test(txt)
        || new RegExp(`import\\s+${h}\\s+from\\s+["']`).test(txt);
      if (!defined) { console.error(`[missing-onClick] ${f} : ${h}`); errors++; }
    }
  }
}

if (errors) { console.error(`\n❌ Interaction lint failed with ${errors} issue(s).`); process.exit(1); }
else { console.log('✅ Interaction lint passed.'); }
