import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  base: process.env.GITHUB_ACTIONS === 'true' ? '/Lys-Logik' : '/',
  devToolbar: { enabled: false },
});
