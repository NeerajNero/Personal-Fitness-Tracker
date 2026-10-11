/**
 * One-off PWA icon generator. Run: node --import=tsx scripts/gen-icons.ts
 * Geometric mark (three rising bars) so no font is needed at render time.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const ACCENT = "#16a34a";
const OUT = "public/icons";

// `safe` = fraction of the canvas the mark may occupy (maskable icons keep content inside the central 80%).
function svg(size: number, { rounded, safe }: { rounded: boolean; safe: number }) {
  const r = rounded ? 22 : 0;
  const pad = ((1 - safe) / 2) * 100;
  const w = (100 - 2 * pad) / 4.2; // bar width
  const gap = w * 0.6;
  const x0 = pad + ((100 - 2 * pad) - (3 * w + 2 * gap)) / 2;
  const bottom = 100 - pad;
  const heights = [0.4, 0.65, 1].map((h) => h * (100 - 2 * pad));
  const bars = heights
    .map((h, i) => `<rect x="${x0 + i * (w + gap)}" y="${bottom - h}" width="${w}" height="${h}" rx="${w / 4}" fill="#fff"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<rect width="100" height="100" rx="${r}" fill="${ACCENT}"/>${bars}</svg>`;
}

const targets: [string, number, { rounded: boolean; safe: number }][] = [
  ["icon-192.png", 192, { rounded: true, safe: 0.7 }],
  ["icon-512.png", 512, { rounded: true, safe: 0.7 }],
  ["icon-512-maskable.png", 512, { rounded: false, safe: 0.55 }],
  ["apple-touch-icon.png", 180, { rounded: false, safe: 0.7 }],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const [name, size, opts] of targets) {
    await sharp(Buffer.from(svg(size, opts))).png().toFile(`${OUT}/${name}`);
    console.log(`${OUT}/${name} ${size}×${size}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
