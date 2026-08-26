#!/usr/bin/env node
// Browser-based intake for the credentials store, for anyone who'd rather fill
// in a form than use a terminal. Serves ONE local page over http://127.0.0.1
// (never 0.0.0.0 — not reachable from the network), behind a random one-time
// token in the URL so nothing else on the machine can guess it and post to it.
// The form value is submitted straight to this process; it is written to the
// store and never printed to this script's own stdout/stderr — the agent that
// launched this process only ever sees the URL to open, nothing typed into it.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadCredentialsLib } from './credentials-unavailable.mjs';

const { db, getOrCreateKey, setEntry, slugify } = await loadCredentialsLib();

const token = randomBytes(16).toString('hex');

// Dori's own Figtree variable font, served from disk so the page matches the portal
// without reaching the network. Absent (portal not checked out) → system stack.
const FONT_PATH = join(homedir(), 'proto-space/dori/dori-portal/public/fonts/figtree-latin-variable.woff2');
let fontBytes = null;
try { fontBytes = readFileSync(FONT_PATH); } catch { /* fall back to system-ui */ }

// Tokens lifted from dori-portal/DESIGN.md so this page reads as part of the product.
const STYLE = `
${fontBytes ? `@font-face{font-family:Figtree;src:url("/${token}/font.woff2")format("woff2");font-weight:300 900;font-display:swap}` : ''}
:root{
  --fg:#26272b; --fg-2:#63666e; --muted-fg:#686b73;
  --canvas:#ffffff; --muted:#f3f4f6; --border:#e3e4e8;
  --brand:#1a1f4e; --accent:#d99b24; --cta-text:#ffffff; --success:#15803d;
  --ease:cubic-bezier(.2,.8,.2,1);
}
@media(prefers-color-scheme:dark){:root{
  --fg:#f2f3f5; --fg-2:#a9adb6; --muted-fg:#9599a3;
  --canvas:#0e0f13; --muted:#1d1f25; --border:#2a2c33;
  --brand:#91a0e8; --accent:#e7b95a; --cta-text:#0e0f13; --success:#4ade80;
}}
*{box-sizing:border-box}
body{
  margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
  padding:clamp(1rem,4vh,3rem) clamp(1rem,2.5vw,2rem);
  background:var(--canvas); color:var(--fg);
  font-family:Figtree,system-ui,-apple-system,sans-serif;
  font-size:.9375rem; line-height:1.55; font-weight:400;
  -webkit-font-smoothing:antialiased;
}
.panel{width:100%; max-width:420px}
.mark{
  width:34px;height:34px;border-radius:10px;background:var(--muted);
  display:flex;align-items:center;justify-content:center;margin-bottom:16px;
}
.mark svg{width:16px;height:16px;stroke:var(--fg-2);fill:none;stroke-width:1.6;
  stroke-linecap:round;stroke-linejoin:round}
h1{
  font-size:clamp(1.375rem,2vw,1.75rem); font-weight:450; line-height:1.18;
  letter-spacing:-.02em; margin:0 0 6px;
}
.sub{color:var(--fg-2); margin:0 0 28px}
.field{margin-bottom:20px}
label{
  display:block; font-size:.75rem; font-weight:500; letter-spacing:.04em;
  text-transform:uppercase; color:var(--muted-fg); margin-bottom:7px;
}
input[type=text],input[type=password]{
  width:100%; height:42px; padding:0 13px; border-radius:13px;
  background:var(--muted); color:var(--fg); border:1px solid transparent;
  font:inherit; transition:border-color 150ms var(--ease),box-shadow 150ms var(--ease);
}
input::placeholder{color:var(--muted-fg)}
input:focus-visible{
  outline:none; border-color:var(--accent);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent);
}
.hint{font-size:.6875rem; font-weight:500; line-height:1.35; color:var(--muted-fg); margin:7px 0 0}
.reveal{position:relative}
.reveal input{padding-right:60px}
.reveal button{
  position:absolute; right:6px; top:6px; height:30px; padding:0 10px;
  border:0; border-radius:9px; background:transparent; color:var(--fg-2);
  font:inherit; font-size:.75rem; font-weight:500; cursor:pointer;
  transition:background 150ms var(--ease);
}
.reveal button:hover{background:var(--border)}
.check{display:flex; gap:10px; align-items:flex-start; cursor:pointer;
  text-transform:none; letter-spacing:normal; margin-bottom:0}
.check input{margin:2px 0 0; accent-color:var(--brand); width:15px; height:15px; flex:none}
.check span{font-size:.8125rem; color:var(--fg-2); line-height:1.4}
.actions{margin-top:28px}
.save{
  width:100%; height:42px; border:0; border-radius:13px;
  background:var(--brand); color:var(--cta-text);
  font:inherit; font-size:.8125rem; font-weight:500; letter-spacing:.01em;
  cursor:pointer; transition:transform 150ms var(--ease),opacity 150ms var(--ease);
}
.save:hover{opacity:.92}
.save:active{transform:scale(.97)}
.note{
  display:flex; gap:9px; margin-top:22px; padding-top:18px;
  border-top:1px solid var(--border); color:var(--muted-fg);
  font-size:.6875rem; font-weight:500; line-height:1.45;
}
.note svg{width:13px;height:13px;flex:none;margin-top:1px;stroke:currentColor;fill:none;
  stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.done .mark{background:color-mix(in srgb,var(--success) 14%,transparent)}
.done .mark svg{stroke:var(--success)}
code{
  font-family:'JetBrains Mono',ui-monospace,monospace; font-size:.8125rem;
  background:var(--muted); padding:2px 6px; border-radius:6px; color:var(--fg-2);
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const LOCK_ICON = '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
const SHIELD_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6l7-3z"/></svg>';

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Add a credential · Dori</title><style>${STYLE}</style></head><body>
<main class="panel">
  <div class="mark">${LOCK_ICON}</div>
  <h1>Add a credential</h1>
  <p class="sub">Saved to your encrypted store on this Mac.</p>
  <form method="POST" action="/${token}/save">
    <div class="field">
      <label for="label">Name</label>
      <input id="label" name="label" type="text" placeholder="OpenAI API key" required autofocus autocomplete="off" spellcheck="false">
      <p class="hint">However you'd naturally ask for it later — "the OpenAI key", "VPS root password".</p>
    </div>
    <div class="field">
      <label for="value">Value</label>
      <div class="reveal">
        <input id="value" name="value" type="password" required autocomplete="off" spellcheck="false">
        <button type="button" id="toggle" aria-label="Show value">Show</button>
      </div>
      <p class="hint">Paste the secret itself — the key, token, or password.</p>
    </div>
    <div class="field">
      <label class="check"><input type="checkbox" name="plain">
        <span>Not a secret — store as readable text. For things like account IDs.</span></label>
    </div>
    <div class="actions"><button class="save" type="submit">Save credential</button></div>
  </form>
  <p class="note">${SHIELD_ICON}<span>This page talks only to a process on your own computer. Nothing you type reaches the network, and Claude never sees the value.</span></p>
</main>
<script>
  const i = document.getElementById('value'), t = document.getElementById('toggle');
  t.onclick = () => {
    const shown = i.type === 'text';
    i.type = shown ? 'password' : 'text';
    t.textContent = shown ? 'Show' : 'Hide';
    t.setAttribute('aria-label', (shown ? 'Show' : 'Hide') + ' value');
    i.focus();
  };
</script>
</body></html>`;

function confirmPage(service, field, len) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saved · Dori</title><style>${STYLE}</style></head><body>
<main class="panel done">
  <div class="mark">${CHECK_ICON}</div>
  <h1>Saved</h1>
  <p class="sub">Stored as <code>${service}</code> — ${len} characters, encrypted on this Mac.</p>
  <p class="note">${SHIELD_ICON}<span>Ask Dori for it by name any time. You can close this tab.</span></p>
</main></body></html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === `/${token}`) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(PAGE);
  } else if (req.method === 'GET' && url.pathname === `/${token}/font.woff2` && fontBytes) {
    res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'no-store' });
    res.end(fontBytes);
  } else if (req.method === 'POST' && url.pathname === `/${token}/save`) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const label = (params.get('label') || '').trim();
      const field = (params.get('field') || 'value').trim() || 'value';
      const plain = params.get('plain') === 'on';
      const value = params.get('value') || '';
      if (!label || !value) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing name or value.');
        return;
      }
      const service = slugify(label);
      const d = db();
      setEntry(d, plain ? null : getOrCreateKey(), service, field, value, plain);
      if (field !== 'label') setEntry(d, null, service, 'label', label, true);
      d.close();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(confirmPage(service, field, value.length));
      console.log(`Saved ${service}/${field} (${value.length} chars, ${plain ? 'plaintext' : 'encrypted'}).`);
      // Plain close() waits on keep-alive sockets, which browsers hold open —
      // force them shut once the response has flushed so the process actually exits.
      setTimeout(() => { server.closeAllConnections?.(); server.close(); }, 500);
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/${token}`;
  console.log(url);
});

// Don't linger forever if nobody opens the page.
setTimeout(() => server.close(), 10 * 60 * 1000).unref();
