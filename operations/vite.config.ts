import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, root, 'VITE_');
  if (
    env.VITE_SUPABASE_PUBLISHABLE_KEY &&
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY)
  )
    throw new Error(
      'Operations accepts only a public Supabase publishable key.',
    );
  return {
    root,
    plugins: [react()],
    base: './',
    server: { host: '0.0.0.0', port: 5173, strictPort: true },
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  };
});
