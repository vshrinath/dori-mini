#!/usr/bin/env node
// Inbound WhatsApp channel — mirrors dori-engine's src/channels/whatsapp/session.ts +
// handler.ts (messages.upsert listener, downloadMediaMessage for attachments), scoped
// down for a single dedicated number with no chat session watching it:
//
// - No AI reasoning here (that only exists inside a live agent chat — see docs). This
//   just FILES what arrives, mechanically, the same as a pasted link or dropped file
//   would be filed by route-destination.mjs. Ambiguous/no-project captures land in
//   inbox/ by that script's own default — same safeguard as everything else here.
// - No group/registered-chat allowlist (dori-engine's lookupRegisteredGroup) — this is
//   meant to run on a dedicated secondary number used only for this, DM-only.
// - Reconnects with exponential backoff on drop, same shape as session.ts, capped at 60s.
// - Long-lived process — run it via launchd (see whatsapp-listener.plist), not on demand.
//
// First run: prints a QR code — scan from WhatsApp (Linked Devices > Link a Device) on
// the DEDICATED number, not your primary one. Session is cached under
// ~/.dori/whatsapp-session/ (shared with send-whatsapp.mjs — same linked account).
//
// Usage: node listen-whatsapp.mjs [--pair-only]
//   --pair-only   exit right after the QR is scanned instead of listening forever —
//                 used by setup.sh to pair inline during install.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import makeWASocket, { useMultiFileAuthState, downloadMediaMessage, DisconnectReason } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { canonicalOutputPath, VAULT_ROOT } from './route-destination.mjs';

const SESSION_DIR = join(homedir(), '.dori', 'whatsapp-session');
const PROCESSED_IDS_FILE = join(SESSION_DIR, 'processed-ids.json');
const URL_RE = /https?:\/\/\S+/g;

// ponytail: flat JSON array capped at 500 ids, not a real dedup store — WhatsApp
// redelivers on reconnect, and this is enough to survive that without a DB.
function loadProcessedIds() {
  try {
    return new Set(JSON.parse(readFileSync(PROCESSED_IDS_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}
function saveProcessedIds(set) {
  const ids = [...set].slice(-500);
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(PROCESSED_IDS_FILE, JSON.stringify(ids));
}

function extractText(message) {
  return message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption
    || message.documentMessage?.caption || '';
}

function mediaKind(message) {
  if (message.imageMessage) return { field: 'imageMessage', ext: 'jpg' };
  if (message.documentMessage) return { field: 'documentMessage', ext: message.documentMessage.fileName?.split('.').pop() || 'bin' };
  if (message.audioMessage) return { field: 'audioMessage', ext: 'ogg' };
  return null;
}

async function fileCapture({ text, urls, sock, msg, media }) {
  const isYouTube = urls.some((u) => /youtube\.com|youtu\.be/.test(u));
  const kind = media ? 'document' : isYouTube ? 'youtube' : urls.length ? 'url' : 'text';
  const relPath = canonicalOutputPath({ kind, urls, projectPath: null, source: 'whatsapp' });
  const absolutePath = join(VAULT_ROOT, relPath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });

  const sender = msg.key.remoteJid;
  const timestamp = new Date((Number(msg.messageTimestamp) || Date.now() / 1000) * 1000).toISOString();

  let mediaLine = '';
  if (media) {
    const mediaRelPath = relPath.replace(/\.md$/, `.${media.ext}`);
    writeFileSync(join(VAULT_ROOT, mediaRelPath), media.buffer);
    mediaLine = `media: ${mediaRelPath}\n`;
  }

  const frontmatter = `---\ndate: '${timestamp.slice(0, 10)}'\nsource: whatsapp\nsender: ${sender}\n${mediaLine}---\n\n`;
  writeFileSync(absolutePath, frontmatter + (text || '(no text — see media)') + '\n');
  console.log(`Filed: ${relPath}`);
}

async function handleMessage(sock, msg, processedIds) {
  if (msg.key.fromMe) return; // messages we sent ourselves (e.g. via send-whatsapp.mjs) aren't inbound captures
  const id = msg.key.id;
  if (processedIds.has(id)) return;
  processedIds.add(id);
  saveProcessedIds(processedIds);

  const message = msg.message;
  if (!message) return;

  const text = extractText(message);
  const urls = text.match(URL_RE) || [];
  const kindInfo = mediaKind(message);

  let media = null;
  if (kindInfo) {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      media = { buffer, ext: kindInfo.ext };
    } catch (err) {
      console.error(`Media download failed for ${id}: ${err.message} — filing text only`);
    }
  }

  if (!text && !media) return; // nothing capturable (reactions, status updates, etc.)
  await fileCapture({ text, urls, sock, msg, media });
}

async function connect({ pairOnly = false } = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });
  sock.ev.on('creds.update', saveCreds);

  // Baileys dropped its old built-in `printQRInTerminal` option — render it ourselves
  // whenever one shows up (first pairing, or re-pairing after a logout).
  sock.ev.on('connection.update', ({ qr }) => {
    if (qr) qrcodeTerminal.generate(qr, { small: true });
  });

  if (pairOnly) {
    // setup.sh runs this inline during install so a non-technical user can scan the QR
    // right there without needing to know to Ctrl+C — exit cleanly the moment pairing
    // succeeds instead of settling into the normal always-on listener.
    sock.ev.on('connection.update', ({ connection }) => {
      if (connection === 'open') {
        console.log('WhatsApp paired.');
        process.exit(0);
      }
    });
    return;
  }

  const processedIds = loadProcessedIds();
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg, processedIds);
      } catch (err) {
        console.error(`Failed to process message ${msg.key.id}: ${err.message}`);
      }
    }
  });

  let reconnectDelay = 5000;
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('WhatsApp listener connected.');
      reconnectDelay = 5000;
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error(`Logged out — delete ${SESSION_DIR} and re-run to re-pair.`);
        process.exit(1);
      }
      console.error(`Connection closed, reconnecting in ${reconnectDelay / 1000}s...`);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pairOnly = process.argv.includes('--pair-only');
  await connect({ pairOnly });
}
