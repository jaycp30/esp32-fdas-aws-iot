import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts on purpose: every test in this project
// exercises pure functions (parsing, dedupe, staleness derivation - see
// src/data/*.test.ts), so there's no DOM/browser environment to configure,
// and this avoids adding vitest's config typings to the app's own build
// (vite.config.ts is type-checked by tsconfig.node.json; this file isn't
// included by any tsconfig, which is fine - vitest runs it via esbuild
// directly, not through `tsc -b`).
export default defineConfig({
  test: {
    environment: 'node',
  },
})
