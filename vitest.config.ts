import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      // Las reglas comparten el emulador: se ejecutan en serie.
      { test: { name: 'rules', include: ['tests/rules/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 20000 } },
    ],
  },
})
