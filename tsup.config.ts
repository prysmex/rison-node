import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2018',
  platform: 'neutral',
  dts: true,
  banner: {
    js: `/*!
 * prysmex-rison-node: a modified fork of rison-node
 * (https://github.com/w33ble/rison-node) by Joe Fleming and contributors, the
 * Node packaging of Rison (https://github.com/Nanonid/rison).
 * Encoder based on Douglas Crockford's json.js and parser based on Oliver
 * Steele's OpenLaszlo JSON, both "hacked by nix for use in uris".
 * Licensed under the Apache License, Version 2.0. Modified by Prysmex (2026);
 * see LICENSE.md and NOTICE in the package.
 */`,
  },
  clean: true,
  sourcemap: false,
  minify: false,
  splitting: false,
});
