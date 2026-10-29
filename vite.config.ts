import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:5001' } },
  build: { rollupOptions: { input: {main:'index.html',legacy:'legacy.html'} } },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] },
});
