import { defineConfig } from 'vitest/config';

// Runs the packaging smoke test against the packed tarball (see
// test/package/smoke.test.ts). Kept out of the default run because it needs
// a build and spawns `pnpm pack` and `node`.
export default defineConfig({
  test: {
    include: ['test/package/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
