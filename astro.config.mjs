// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://bigf.me',
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
