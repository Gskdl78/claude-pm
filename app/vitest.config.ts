import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          include: ['src/main/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/renderer/test-setup.ts'],
        },
      },
    ],
  },
});
