import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * One codebase, two consoles. `APP=client|admin` selects which entry is served
 * or built, so each deploy gets its own dist with a real `/` root — and the
 * admin bundle never ships client code (or vice versa).
 */
const APPS = { client: 5173, admin: 5174 } as const;
type AppId = keyof typeof APPS;

const app = (process.env.APP ?? 'client') as AppId;
if (!(app in APPS)) {
  throw new Error(`APP must be one of ${Object.keys(APPS).join(', ')} — got "${app}"`);
}

export default defineConfig({
  // Serve/build from the app folder so its index.html is the root document.
  root: resolve(__dirname, 'src', app),
  // Keep .env* lookup at the package root, shared by both apps.
  envDir: __dirname,
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: { port: APPS[app] },
  preview: { port: APPS[app] },
  build: {
    outDir: resolve(__dirname, 'dist', app),
    emptyOutDir: true,
    sourcemap: false,
  },
});
