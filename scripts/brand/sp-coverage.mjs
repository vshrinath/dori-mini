// Reports 40px grid cells where glyph pixels are NOT covered by the full mask stroke.
import { Resvg } from '@resvg/resvg-js';
import { MASK_PATH, MASK_W, FONT_FILES } from './sp-art.mjs';

const fontOpts = { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'SignPainter' } };
const W = 1600, H = 900;

const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<text x="120" y="700" font-family="SignPainter" font-size="560" fill="#000">dorı</text></svg>`;
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<path d="${MASK_PATH}" fill="none" stroke="#000" stroke-width="${MASK_W}"
  stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const text = new Resvg(textSvg, fontOpts).render().pixels;
const mask = new Resvg(maskSvg, fontOpts).render().pixels;

const CELL = 40;
const miss = new Map();
let missCount = 0, glyphCount = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const a = text[(y * W + x) * 4 + 3];
    if (a > 128) {
      glyphCount++;
      if (mask[(y * W + x) * 4 + 3] < 128) {
        missCount++;
        const key = `${Math.floor(x / CELL) * CELL},${Math.floor(y / CELL) * CELL}`;
        miss.set(key, (miss.get(key) || 0) + 1);
      }
    }
  }
}
console.log(`glyph px: ${glyphCount}, missed: ${missCount} (${(100 * missCount / glyphCount).toFixed(1)}%)`);
const sorted = [...miss.entries()].filter(([, n]) => n > 30).sort((a, b) => b[1] - a[1]);
for (const [cell, n] of sorted) console.log(`  cell ${cell}: ${n}px`);
