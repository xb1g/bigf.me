// One-off: render Anchor PWA icons from public/anchor/icon.svg with sharp.
// Usage: node scripts/anchor-icons.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'anchor');
const svg = await readFile(path.join(dir, 'icon.svg'), 'utf8');

// Maskable: keep the mark inside the 80% safe circle by shrinking it around the centre.
const maskable = svg.replace(
  '<g id="mark"',
  '<g transform="translate(256 256) scale(0.78) translate(-256 -256)"><g id="mark"',
).replace('</g>\n</svg>', '</g></g>\n</svg>');
if (maskable === svg) throw new Error('icon.svg: could not find <g id="mark"> to build the maskable icon');

async function render(source, size, file) {
  const out = path.join(dir, file);
  // Rasterise at 2× (1024px) then downscale for crisp edges.
  await sharp(Buffer.from(source), { density: 144 })
    .resize(size, size)
    .flatten({ background: '#0b0d12' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${path.relative(root, out)} (${size}×${size})`);
}

await render(svg, 192, 'icon-192.png');
await render(svg, 512, 'icon-512.png');
await render(maskable, 512, 'icon-maskable-512.png');
await render(svg, 180, 'apple-touch-icon.png');
