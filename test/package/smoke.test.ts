// Packaging smoke test: packs the package exactly as it would be published,
// installs the tarball into a temporary directory, and loads it from plain
// Node.js through `require()` and `import()` (and type-checks a consumer).
// Run with `pnpm test:package`.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let dir: string;
let tarball: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rison-smoke-'));
  execFileSync('pnpm', ['pack', '--pack-destination', dir], { cwd: root, stdio: 'pipe' });
  const [file] = readdirSync(dir).filter((f) => f.endsWith('.tgz'));
  tarball = join(dir, file as string);
  const pkgDir = join(dir, 'node_modules', 'prysmex-rison-node');
  mkdirSync(pkgDir, { recursive: true });
  execFileSync('tar', ['-xzf', tarball, '-C', pkgDir, '--strip-components=1']);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(file: string, source: string): unknown {
  writeFileSync(join(dir, file), source);
  return JSON.parse(execFileSync(process.execPath, [file], { cwd: dir, encoding: 'utf8' }));
}

const expected = {
  encoded: "(a:!(1,'x y'),b:(c:!t))",
  decoded: { a: [1, 'x y'], b: { c: true } },
  uri: "(a:!(1,'x+y'),b:(c:!t))",
  snake: { a: [1, 'x y'], b: { c: true } },
  object: 'a:1',
  array: [1, 2],
  isRisonError: true,
  index: 2,
};

const body = (load: string): string => `
${load}
const value = { b: { c: true }, a: [1, 'x y'] };
let isRisonError = false;
let index = -1;
try {
  rison.decode('(a');
} catch (error) {
  isRisonError = error instanceof RisonError && error instanceof Error;
  index = error.index;
}
console.log(JSON.stringify({
  encoded: encode(value),
  decoded: decode(encode(value)),
  uri: rison.encode_uri(value),
  snake: rison.decode_uri(rison.encode_uri(value)),
  object: rison.encode_object({ a: 1 }),
  array: rison.decode_array('1,2'),
  isRisonError,
  index,
}));
`;

describe('packed package', () => {
  test('contains only the build output and docs', () => {
    const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((f) => f.replace(/^package\//, ''))
      .sort();
    expect(files).toEqual([
      'AUTHORS.md',
      'CHANGELOG.md',
      'LICENSE.md',
      'NOTICE',
      'README.md',
      'dist/index.cjs',
      'dist/index.d.cts',
      'dist/index.d.ts',
      'dist/index.js',
      'package.json',
    ]);
  });

  test('require() from CommonJS', () => {
    const out = run(
      'cjs.cjs',
      body(`
const pkg = require('prysmex-rison-node');
const { encode, decode, RisonError } = pkg;
const rison = pkg.default;
if (typeof pkg.encodeUri !== 'function' || typeof pkg.safeDecode !== 'function') throw new Error('missing export');
`),
    );
    expect(out).toEqual(expected);
  });

  test('require() used like rison-node, without .default', () => {
    const out = run(
      'cjs-legacy.cjs',
      body(`
const rison = require('prysmex-rison-node');
const { encode, decode, RisonError } = rison;
`),
    );
    expect(out).toEqual(expected);
  });

  test('import() from ES modules', () => {
    const out = run(
      'esm.mjs',
      body(`
const { default: rison, encode, decode, RisonError, safeDecode } = await import('prysmex-rison-node');
if (safeDecode('(') !== undefined) throw new Error('safeDecode');
`),
    );
    expect(out).toEqual(expected);
  });

  test('ESM and CJS builds are separate but equivalent', () => {
    const out = run(
      'both.mjs',
      `
import { createRequire } from 'node:module';
const esm = await import('prysmex-rison-node');
const cjs = createRequire(import.meta.url)('prysmex-rison-node');
console.log(JSON.stringify({
  sameNames: Object.keys(esm).sort().join() === Object.keys(cjs).filter((k) => k !== '__esModule').sort().join(),
  sameOutput: esm.encode({ k: [1, 'a b'] }) === cjs.encode({ k: [1, 'a b'] }),
  defaultKeys: Object.keys(esm.default).length === Object.keys(cjs.default).length,
}));
`,
    );
    expect(out).toEqual({ sameNames: true, sameOutput: true, defaultKeys: true });
  });

  test('types resolve for ESM and CJS consumers (node16 resolution)', () => {
    const consumer = `
import rison, { decode, encode, RisonError, type RisonValue } from 'prysmex-rison-node';
const value: RisonValue = decode(encode({ a: 1 }));
const uri: string = rison.encode_uri(value);
const back: RisonValue = rison.decode_uri(uri);
const index: number = new RisonError('x', 1).index;
export { back, index };
`;
    writeFileSync(join(dir, 'consumer.mts'), consumer);
    writeFileSync(join(dir, 'consumer.cts'), consumer);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'node16',
          moduleResolution: 'node16',
          strict: true,
          noEmit: true,
          types: [],
          skipLibCheck: false,
        },
        files: ['consumer.mts', 'consumer.cts'],
      }),
    );
    const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    expect(() =>
      execFileSync(process.execPath, [tsc, '-p', dir], { encoding: 'utf8', stdio: 'pipe' }),
    ).not.toThrow();
  });
});
