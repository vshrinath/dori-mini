import { Resvg } from '@resvg/resvg-js';
import { svgPathProperties } from 'svg-path-properties';
import { mkdirSync, writeFileSync } from 'node:fs';
import { frameSvg, MASK_PATH, FONT_FILES } from './sp-art.mjs';

const FPS = 30;
const WRITE_END = 1.35, DOT_END = 1.6, TOTAL = 1.9;
const FRAMES = Math.round(TOTAL * FPS);
const LEN = new svgPathProperties(MASK_PATH).getTotalLength();
const CROP = 'viewBox="70 310 810 450" width="1620" height="900"';

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const backOut = (t) => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

const fontOpts = { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'SignPainter' } };

function crop(svg) {
  return svg.replace('width="1600" height="900"', CROP);
}

function render(svg, out, scale = 1) {
  const r = new Resvg(crop(svg), { fitTo: { mode: 'zoom', value: scale }, ...fontOpts });
  writeFileSync(out, r.render().asPng());
}

for (const palette of ['light', 'dark']) {
  mkdirSync(`sp-frames-${palette}`, { recursive: true });
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS;
    const wp = Math.min(1, t / WRITE_END);
    const drawn = easeInOutSine(wp) * LEN;
    let dotScale = 0;
    if (t >= WRITE_END) dotScale = t >= DOT_END ? 1 : backOut((t - WRITE_END) / (DOT_END - WRITE_END));
    const svg = frameSvg({ palette, dashArray: LEN + 2, dashOffset: LEN + 2 - drawn - (wp >= 1 ? 2 : 0), dotScale });
    render(svg, `sp-frames-${palette}/f${String(f).padStart(3, '0')}.png`);
  }
  render(frameSvg({ palette, dotScale: 1 }), `dori-sp-${palette}.png`, 2);
  console.log(`${palette} done`);
}
console.log('mask length', Math.round(LEN));
