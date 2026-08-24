#!/usr/bin/env node
// Local desktop notification — the delivery half of dori-engine's `notify.send`
// (self-only push), scoped down to just the macOS notification center since this
// mirror has no running server to fan out to WhatsApp/portal surfaces itself.
// Uses `osascript` (built into macOS) — no dependency, no config.
//
// Usage: node notify-desktop.mjs "message" ["title"]
import { execFile } from 'node:child_process';

export function notifyDesktop(message, title = 'Dori') {
  if (process.platform !== 'darwin') {
    throw new Error('notify-desktop.mjs only supports macOS (uses osascript)');
  }
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err) => (err ? reject(err) : resolve()));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [message, title] = process.argv.slice(2);
  if (!message) {
    console.error('Usage: node notify-desktop.mjs "message" ["title"]');
    process.exit(1);
  }
  await notifyDesktop(message, title);
}
