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
    plugins: [tailwindcss()],
  },

  adapter: vercel(),
  output: 'server',
});