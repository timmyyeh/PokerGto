import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@engine': resolve(__dirname, 'src/engine'),
      '@gto': resolve(__dirname, 'src/gto'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
