#!/usr/bin/env node
// Local WhatsApp channel — mirrors dori-engine's `channels/whatsapp/deliver.ts`
// (self-messaging via WHATSAPP_PRIMARY_JID), using Baileys directly since this
// mirror has no server to run the engine's own delivery layer.
//
// First run: prints a QR code in the terminal — scan it from WhatsApp on your
// phone (Linked Devices > Link a Device). Session creds are cached under
// ~/.dori/whatsapp-session/ so you only do this once. Sends to your own number
// (self-chat) by default — same "personal digest to yourself" use case as the
// engine's self-only notify.send.
//
// NOTE: Baileys talks to WhatsApp Web's protocol, not the official Business
// API — fine for low-volume personal self-messaging, but not sanctioned by
// Meta. Don't use it for bulk or automated messaging to other people.
//
// Usage: node send-whatsapp.mjs "message"
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';

const SESSION_DIR = join(homedir(), '.dori', 'whatsapp-session');

export async function sendWhatsApp(message) {
  mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 }); // owner-only — see listen-whatsapp.mjs
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });
  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) qrcodeTerminal.generate(qr, { small: true });
      if (connection === 'open') resolve();
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          reject(new Error(`WhatsApp session logged out — delete ${SESSION_DIR} and re-run to re-pair`));
        } else {
          reject(new Error('WhatsApp connection closed before it opened — re-run'));
        }
      }
    });
  });

  const selfJid = sock.user.id;
  await sock.sendMessage(selfJid, { text: message });
  await sock.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const message = process.argv.slice(2).join(' ');
  if (!message) {
    console.error('Usage: node send-whatsapp.mjs "message"');
    process.exit(1);
  }
  await sendWhatsApp(message);
  console.log('Sent.');
  process.exit(0);
}
