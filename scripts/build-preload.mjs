import fs from 'node:fs';
import ts from 'typescript';

const result = ts.transpileModule(fs.readFileSync('electron/preload.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
// Keep the sandbox-compatible CommonJS preload generated from the typed source.
fs.writeFileSync('electron/preload.cjs', result.outputText);
fs.mkdirSync('dist/electron', { recursive: true });
fs.writeFileSync('dist/electron/preload.cjs', result.outputText);
