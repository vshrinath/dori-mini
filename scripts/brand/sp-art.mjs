// SignPainter "dori" animated wordmark: filled text revealed by a stroked
// centerline mask (standard handwriting-reveal technique).
// Canvas coords: text "dorı" (dotless i) at x=120 y=700, font-size 560, 1600x900.

export const FONT_FILES = ['/System/Library/Fonts/Supplemental/SignPainter.ttc'];

export const PALETTES = {
  light: { fill: '#1a1f4e', dot: '#d99b24' },
  dark:  { fill: '#91a0e8', dot: '#e7b95a' },
};

// Pen-order centerline over the glyphs (d bowl, d stem, join, o, join, r, ı, tail).
export const MASK_PATH = `
M 295 525
C 250 490, 195 505, 155 560
C 115 615, 100 675, 140 700
C 180 725, 240 712, 268 668
C 282 635, 291 570, 296 532
C 320 505, 360 440, 385 372
C 390 355, 393 352, 392 362
C 385 450, 375 570, 358 650
C 352 682, 348 700, 372 702
C 402 700, 425 684, 440 662
C 420 620, 425 560, 458 525
C 478 505, 510 512, 525 545
C 537 575, 530 620, 500 650
C 478 668, 452 660, 448 630
C 470 665, 500 660, 515 635
C 528 610, 532 570, 530 540
C 545 565, 555 600, 562 635
C 568 662, 580 672, 592 662
C 606 630, 600 520, 602 462
C 605 435, 628 430, 638 455
C 646 505, 652 590, 655 650
C 656 678, 668 696, 686 692
C 708 662, 732 565, 748 508
C 754 550, 758 600, 762 645
C 768 678, 788 678, 808 652
C 820 636, 830 615, 836 596
`.trim();

export const MASK_W = 100;
export const DOT = { cx: 790, cy: 440, r: 30 };

export function frameSvg({ palette, dashArray, dashOffset, dotScale, debug, bg }) {
  const p = PALETTES[palette];
  const dash = dashArray != null
    ? `stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"` : '';
  const dot = dotScale > 0
    ? `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r * dotScale}" fill="${p.dot}"/>` : '';
  const debugOverlay = debug
    ? `<path d="${MASK_PATH}" fill="none" stroke="#e11" stroke-opacity="0.55" stroke-width="${MASK_W}" stroke-linecap="round"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
${bg ? `<rect width="1600" height="900" fill="${bg}"/>` : ''}
<defs><mask id="pen">
  <path d="${MASK_PATH}" fill="none" stroke="#fff" stroke-width="${MASK_W}"
    stroke-linecap="round" stroke-linejoin="round" ${dash}/>
</mask></defs>
<text x="120" y="700" font-family="SignPainter" font-size="560" fill="${p.fill}"
  ${dashArray != null ? 'mask="url(#pen)"' : ''}>dorı</text>
${dot}
${debugOverlay}
</svg>`;
}
