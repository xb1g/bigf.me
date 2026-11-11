// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://bigf.me',
  integrations: [mdx()],

  vite: {
    resolve: {
      // Vite 8's built-in resolver rejects a missing tsconfigPaths flag. Tailwind's
      // CSS resolver hits that path during `astro build` with the locked Vite 8.
      tsconfigPaths: false,
    },
    plugins: [tailwindcss()],
  },

  adapter: vercel(),
  output: 'server',
});