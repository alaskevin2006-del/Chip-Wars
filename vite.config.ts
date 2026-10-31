import { writeFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
const buildTime = new Date().toISOString();
export default defineConfig({
  plugins: [
    react(),
    {name:'build-stamp',closeBundle(){try{writeFileSync('dist/build.json',JSON.stringify({time:buildTime}));}catch{}}},
  ],
  define: {__BUILD_TIME__: JSON.stringify(buildTime)},
  server: { proxy: { '/api': 'http://127.0.0.1:5001' } },
  build: { rollupOptions: { input: {main:'index.html',legacy:'legacy.html'} } },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'], testTimeout: 20000, maxWorkers: 4 },
});
