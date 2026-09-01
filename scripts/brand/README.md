# Brand asset generators

Sources for the "dori" wordmark and app icon shipped in
`electron-app/public/assets/`. The wordmark is macOS's SignPainter
(HouseScript) rendered as filled text; the animation reveals it along a
hand-traced centerline mask (standard handwriting-reveal technique).

macOS only: the scripts load `/System/Library/Fonts/Supplemental/SignPainter.ttc`.
`ffmpeg` must be on PATH for the video encodes.

## Files

- `sp-art.mjs` — shared geometry: light/dark palettes, the centerline
  `MASK_PATH` traced over the glyphs, gold i-dot position, per-frame SVG.
- `sp-render.mjs` — renders the 57 animation frames (30fps, 1.9s: write-on
  to 1.35s, dot pop to 1.6s, hold) and the 2x static PNGs.
- `sp-icon.mjs` — the app icon: white squircle + full wordmark.
- `sp-coverage.mjs` — QA for mask edits: rasterizes text and mask, reports
  glyph pixels the mask misses. Keep it at ~0% before re-rendering.

## Regenerating

Dependencies are not in package.json (one-off tooling):

```bash
npm i --no-save @resvg/resvg-js svg-path-properties
node sp-render.mjs          # frames + dori-sp-{light,dark}.png
node sp-icon.mjs            # icon-new.png (1024px master)
```

Encode the splash video and install the assets:

```bash
ffmpeg -y -framerate 30 -i sp-frames-light/f%03d.png -c:v libvpx-vp9 \
  -pix_fmt yuva420p -b:v 0 -crf 28 -auto-alt-ref 0 dori-wordmark.webm
cp dori-wordmark.webm dori-sp-light.png ../../electron-app/public/assets/
ffmpeg -y -i icon-new.png -vf scale=512:512:flags=lanczos \
  ../../electron-app/public/assets/icon.png
```

(`dori-sp-light.png` ships as `dori-wordmark.png`. For alpha ProRes MOVs:
`-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le`.)
