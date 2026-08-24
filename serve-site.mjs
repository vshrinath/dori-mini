#!/usr/bin/env node
// Serves `_site/` (built by build-site.mjs) over local HTTP.
//
// YouTube's embed player validates the page's origin/referrer on every load —
// a file:// page sends neither, which YouTube rejects with "Error 153: Video
// player configuration error" regardless of query params (enablejsapi was a
// red herring; this happens even without it). Any http(s) origin, including
// localhost, satisfies the check. Opening _site/index.html directly via
// file:// will keep showing Error 153 for every yt/ page with a video.
//
// Usage: node serve-site.mjs [port]
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const SITE_ROOT = join(VAULT_ROOT, '_site');
const PORT = Number(process.argv[2]) || 8420;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  let file = join(SITE_ROOT, path);
  if (!file.startsWith(SITE_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(PORT, () => {
  console.log(`Serving ${SITE_ROOT} at http://localhost:${PORT}/`);
});
