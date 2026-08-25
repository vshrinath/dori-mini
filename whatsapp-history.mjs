#!/usr/bin/env node
// Per-chat WhatsApp conversation history — for follow-up questions ("and when does it
// renew?") to resolve against the last few turns instead of each message being answered
// in isolation.
//
// Deliberately its OWN file, not a table in dori-portal's real portal.db (which
// reindex-vault.mjs writes into directly — see that file's header) and not merged into
// vault_documents/FTS at all: a casual "Hi" or an AI-generated reply must never dilute
// ranking for a real document or meeting search. If WhatsApp history ever needs to be
// searchable, that's a deliberate, separate query against this table — never folded
// into general vault recall by default.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DB_DIR = join(homedir(), '.dori');
const DB_PATH = join(DB_DIR, 'whatsapp-history.db');
mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS whatsapp_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_turns_chat ON whatsapp_turns(chat_jid, id)');

// ponytail: fixed recent-window per chat, no summarization/decay strategy — fine for a
// personal, single-correspondent channel; revisit if a chat's turn count ever gets large.
const DEFAULT_TURNS = 12;

const insertTurn = db.prepare('INSERT INTO whatsapp_turns (chat_jid, role, text, created_at) VALUES (?, ?, ?, ?)');
const selectRecent = db.prepare('SELECT role, text FROM whatsapp_turns WHERE chat_jid = ? ORDER BY id DESC LIMIT ?');

export function appendTurn(chatJid, role, text) {
  insertTurn.run(chatJid, role, text, new Date().toISOString());
}

export function recentHistory(chatJid, limit = DEFAULT_TURNS) {
  return selectRecent.all(chatJid, limit).reverse();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chatJid = process.argv[2];
  if (!chatJid) {
    console.error('Usage: node whatsapp-history.mjs <chat_jid>');
    process.exit(1);
  }
  console.log(JSON.stringify(recentHistory(chatJid), null, 2));
}
