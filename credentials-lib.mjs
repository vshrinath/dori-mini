// Shared DB/crypto core for credentials-store.mjs and import-credentials.mjs.
// AES-256-GCM (node:crypto), key in the OS secret store (macOS Keychain via
// `security`, Linux/WSL via `secret-tool` — libsecret/gnome-keyring, matching
// dori-engine's own choice of the OS-native Secret Service over a bundled dep
// like keytar), storage in plain node:sqlite.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const DB_PATH = join(homedir(), '.dori', 'credentials.sqlite');
const KEYCHAIN_SERVICE = 'dori-credentials-store';
const KEYCHAIN_ACCOUNT = 'encryption-key';

function getOrCreateKeyMacOS() {
  try {
    const hex = execFileSync('security', ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return Buffer.from(hex, 'hex');
  } catch {
    // No key yet — mint one. This is the first-run path, and it's where macOS shows its
    // "allow access to your keychain?" prompt. Denying it (or any other keychain failure)
    // must read as a sentence, not a Node stack trace.
    const key = randomBytes(32);
    try {
      execFileSync('security', ['add-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', KEYCHAIN_SERVICE, '-w', key.toString('hex'), '-U'], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      const detail = (err?.stderr?.toString() || '').trim();
      console.error(`Couldn't save the encryption key to your macOS Keychain, so there's nowhere safe to keep your secrets — nothing was stored.

This is usually the keychain prompt being dismissed or denied; run the command again and choose Allow.${detail ? `\n\nmacOS said: ${detail}` : ''}`);
      process.exit(1);
    }
    return key;
  }
}

function getOrCreateKeyLinux() {
  try {
    const hex = execFileSync('secret-tool', ['lookup', 'service', KEYCHAIN_SERVICE, 'account', KEYCHAIN_ACCOUNT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!hex) throw new Error('not found');
    return Buffer.from(hex, 'hex');
  } catch {
    // No key yet — mint one, same first-run shape as the macOS path above.
    const key = randomBytes(32);
    try {
      execFileSync('secret-tool', ['store', '--label=Dori Mini credentials key', 'service', KEYCHAIN_SERVICE, 'account', KEYCHAIN_ACCOUNT], { input: key.toString('hex'), stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (err) {
      const hint = err?.code === 'ENOENT'
        ? 'secret-tool was not found. Install libsecret-tools (Debian/Ubuntu/WSL: `sudo apt install libsecret-tools`) and make sure a keyring daemon (gnome-keyring or equivalent) is running and unlocked.'
        : (err?.stderr?.toString() || '').trim();
      console.error(`Couldn't save the encryption key to your Secret Service keyring, so there's nowhere safe to keep your secrets — nothing was stored.\n\n${hint}`);
      process.exit(1);
    }
    return key;
  }
}

export function getOrCreateKey() {
  if (process.platform === 'darwin') return getOrCreateKeyMacOS();
  if (process.platform === 'linux') return getOrCreateKeyLinux();
  console.error(`The credentials store needs macOS (Keychain) or Linux/WSL (libsecret/gnome-keyring via secret-tool) to hold the encryption key. Detected platform: ${process.platform}.`);
  process.exit(1);
}

export function db() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec(`CREATE TABLE IF NOT EXISTS credentials (
    service TEXT NOT NULL,
    field TEXT NOT NULL,
    secret INTEGER NOT NULL,
    value TEXT,
    ciphertext BLOB,
    nonce BLOB,
    tag BLOB,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (service, field)
  )`);
  return d;
}

export function encrypt(key, plaintext) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

export function decrypt(key, ciphertext, nonce, tag) {
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Clipboard access stays macOS-only for now — the Linux side needs xclip/xsel/
// wl-copy detection, a separate design decision from the keychain fallback above.
function requireMacOS(what) {
  if (process.platform !== 'darwin') {
    console.error(`${what} needs macOS (uses pbcopy/pbpaste). Detected platform: ${process.platform}.`);
    process.exit(1);
  }
}

export function copyToClipboard(text) {
  requireMacOS('Copying to the clipboard');
  execFileSync('pbcopy', [], { input: text });
}

export function readFromClipboard() {
  requireMacOS('Reading from the clipboard');
  return execFileSync('pbpaste', [], { encoding: 'utf8' });
}

export function setEntry(d, key, service, field, value, plain) {
  const now = new Date().toISOString();
  if (plain) {
    d.prepare(`INSERT INTO credentials (service, field, secret, value, updated_at) VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(service, field) DO UPDATE SET secret = 0, value = excluded.value, ciphertext = NULL, nonce = NULL, tag = NULL, updated_at = excluded.updated_at`)
      .run(service, field, value, now);
  } else {
    const { ciphertext, nonce, tag } = encrypt(key, value);
    d.prepare(`INSERT INTO credentials (service, field, secret, ciphertext, nonce, tag, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(service, field) DO UPDATE SET secret = 1, ciphertext = excluded.ciphertext, nonce = excluded.nonce, tag = excluded.tag, value = NULL, updated_at = excluded.updated_at`)
      .run(service, field, ciphertext, nonce, tag, now);
  }
}

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// For other scripts to pull a stored secret directly into memory at runtime —
// e.g. `const key = getSecret('tavily-api-key', 'value')` — never print the result.
export function getSecret(service, field) {
  const d = db();
  const row = d.prepare('SELECT * FROM credentials WHERE service = ? AND field = ?').get(service, field);
  d.close();
  if (!row) throw new Error(`No credential stored for ${service}/${field}`);
  return row.secret ? decrypt(getOrCreateKey(), row.ciphertext, row.nonce, row.tag) : row.value;
}
