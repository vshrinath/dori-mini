// App icon: white squircle tile with the full "dori" wordmark (gold i-dot).
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const NAVY = '#1a1f4e', GOLD = '#d99b24';
const S = 1024, M = 50, R = 220;

// Wordmark geometry from sp-art.mjs: "dorı" at 120,700 size 560 in 1600x900,
// gold dot at (790,440), tight crop 70 310 810 450. Nested svg scales it in.
const wm = `<svg x="112" y="290" width="800" height="444" viewBox="70 310 810 450">
  <text x="120" y="700" font-family="SignPainter" font-size="560" fill="${NAVY}">dorı</text>
  <circle cx="790" cy="440" r="30" fill="${GOLD}"/>
</svg>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
<rect x="${M}" y="${M}" width="${S - 2 * M}" height="${S - 2 * M}" rx="${R}"
  fill="#ffffff" stroke="rgba(26,31,78,0.10)" stroke-width="4"/>
${wm}
</svg>`;

const r = new Resvg(svg, {
  font: { fontFiles: ['/System/Library/Fonts/Supplemental/SignPainter.ttc'], loadSystemFonts: false, defaultFontFamily: 'SignPainter' },
});
writeFileSync('icon-new.png', r.render().asPng());
console.log('icon-new.png');
