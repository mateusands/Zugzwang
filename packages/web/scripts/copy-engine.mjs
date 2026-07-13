// Copia os arquivos "lite" do Stockfish (JS do worker + WASM) para
// public/engine/ e gera um manifest com os nomes reais. Rodado no predev e
// no prebuild. Os binários (~14 MB) não são versionados — vêm do pacote npm.
//
// Os nomes variam por versão do pacote (ex.: stockfish-18-lite.js), por isso
// detectamos por padrão em vez de fixar o nome, e NÃO renomeamos: o .js
// localiza o .wasm irmão pelo próprio nome. Falha alto se não achar as duas
// flavors — melhor quebrar o build cedo que carregar um 404 em runtime.

import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const engineDir = join(dirname(require.resolve('stockfish/package.json')), 'bin');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'engine');

const files = readdirSync(engineDir);

/** Único arquivo que casa o padrão, ou erro claro. */
function pick(pattern, label) {
  const matches = files.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    console.error(
      `copy-engine: esperava exatamente 1 arquivo ${label} em ${engineDir}, achei ${matches.length}: ${matches.join(', ') || '(nenhum)'}`,
    );
    process.exit(1);
  }
  return matches[0];
}

// Lite multi-thread e lite single-thread, JS + WASM.
const mtJs = pick(/lite(?!.*-single).*\.js$/, 'lite MT (.js)');
const mtWasm = pick(/lite(?!.*-single).*\.wasm$/, 'lite MT (.wasm)');
const stJs = pick(/lite.*-single.*\.js$/, 'lite ST (.js)');
const stWasm = pick(/lite.*-single.*\.wasm$/, 'lite ST (.wasm)');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const name of [mtJs, mtWasm, stJs, stWasm]) {
  cpSync(join(engineDir, name), join(outDir, name));
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ v: 1, mt: mtJs, st: stJs }));

console.log(`copy-engine: ${mtJs} (MT) + ${stJs} (ST) → public/engine/`);
