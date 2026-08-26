#!/usr/bin/env node
// CLI for the local encrypted key/password store — see credentials-lib.mjs for the
// crypto/DB core (shared with import-credentials.mjs).
//
// `get` on a secret field copies to the clipboard (pbcopy) instead of printing, so the
// plaintext never has to appear in a shell/agent transcript. Pass --reveal to print it.
//
// Free-form entries (from import-credentials.mjs) are stored as service=<slug>,
// field="value" (the secret) + field="label" (plaintext original name) — use `find`
// to search by label text when you don't know the exact slug.
import { db, getOrCreateKey, decrypt, copyToClipboard, readFromClipboard, setEntry } from './credentials-lib.mjs';

const [, , cmd, ...args] = process.argv;

if (cmd === 'set') {
  const plainFlag = args.includes('--plain');
  const rest = args.filter(a => a !== '--plain');
  const [service, field, value] = rest;
  if (!service || !field || value === undefined) {
    console.error('Usage: credentials-store.mjs set <service> <field> <value> [--plain]');
    process.exit(1);
  }
  const d = db();
  setEntry(d, plainFlag ? null : getOrCreateKey(), service, field, value, plainFlag);
  d.close();
  console.log(`Saved ${service}/${field} (${plainFlag ? 'plaintext' : 'encrypted'}).`);
} else if (cmd === 'set-from-clipboard') {
  // Value never passes through argv or stdout — user copies it, this reads pbpaste directly.
  const plainFlag = args.includes('--plain');
  const [service, field] = args.filter(a => a !== '--plain');
  if (!service || !field) {
    console.error('Usage: credentials-store.mjs set-from-clipboard <service> <field> [--plain]');
    process.exit(1);
  }
  const value = readFromClipboard();
  if (!value) { console.error('Clipboard is empty.'); process.exit(1); }
  const d = db();
  setEntry(d, plainFlag ? null : getOrCreateKey(), service, field, value, plainFlag);
  d.close();
  console.log(`Saved ${service}/${field} from clipboard (${value.length} chars, last 4: ...${value.slice(-4)}) (${plainFlag ? 'plaintext' : 'encrypted'}).`);
} else if (cmd === 'get') {
  const revealFlag = args.includes('--reveal');
  const [service, field] = args.filter(a => a !== '--reveal');
  if (!service) {
    console.error('Usage: credentials-store.mjs get <service> [field] [--reveal]');
    process.exit(1);
  }
  const d = db();
  // Field is optional: the caller usually knows the credential by name only, and the
  // field name is an implementation detail that varies per entry ('value',
  // 'vps_root_password', ...). With no field given, resolve the entry's single secret.
  let row;
  if (field) {
    row = d.prepare('SELECT * FROM credentials WHERE service = ? AND field = ?').get(service, field);
  } else {
    const secrets = d.prepare('SELECT * FROM credentials WHERE service = ? AND secret = 1').all(service);
    if (secrets.length > 1) {
      d.close();
      console.error(`${service} has several secret fields — pick one: ${secrets.map(r => r.field).join(', ')}`);
      process.exit(1);
    }
    row = secrets[0];
  }
  d.close();
  if (!row) { console.error(`No entry for ${service}${field ? `/${field}` : ''}`); process.exit(1); }
  if (!row.secret) {
    console.log(row.value);
  } else {
    const key = getOrCreateKey();
    const plaintext = decrypt(key, row.ciphertext, row.nonce, row.tag);
    if (revealFlag) {
      console.log(plaintext);
    } else {
      copyToClipboard(plaintext);
      console.log(`Copied ${service}/${row.field} to clipboard (${plaintext.length} chars, last 4: ...${plaintext.slice(-4)}).`);
    }
  }
} else if (cmd === 'list') {
  const [service] = args;
  const d = db();
  if (service) {
    const rows = d.prepare('SELECT service, field, secret, updated_at FROM credentials WHERE service = ? ORDER BY field').all(service);
    d.close();
    for (const r of rows) console.log(`${r.service}/${r.field}${r.secret ? '  [secret]' : ''}  (updated ${r.updated_at})`);
    if (!rows.length) console.log('(empty)');
  } else {
    // bare `list` summarizes by service (label if present, else field count) instead of
    // dumping every field — the full field list is one `list <service>` away.
    const rows = d.prepare('SELECT service, field, value FROM credentials ORDER BY service').all();
    d.close();
    const byService = new Map();
    for (const r of rows) {
      if (!byService.has(r.service)) byService.set(r.service, { fields: 0, label: null });
      const s = byService.get(r.service);
      s.fields++;
      if (r.field === 'label') s.label = r.value;
    }
    for (const [service, s] of byService) console.log(`${service}${s.label ? `  —  ${s.label}` : ''}  (${s.fields} field${s.fields === 1 ? '' : 's'})`);
    if (!byService.size) console.log('(empty)');
  }
} else if (cmd === 'find') {
  const query = args.join(' ').toLowerCase().trim();
  if (!query) { console.error('Usage: credentials-store.mjs find <text>'); process.exit(1); }
  const d = db();
  const rows = d.prepare(`SELECT service, field, value FROM credentials WHERE field IN ('label', 'aliases') AND secret = 0`).all();
  d.close();
  const byService = new Map();
  for (const r of rows) {
    if (!byService.has(r.service)) byService.set(r.service, { label: null, aliases: null });
    byService.get(r.service)[r.field] = r.value;
  }
  // Match on the slug, the label, or the aliases. A query is scored by how many of its
  // words hit, and only the best-scoring tier is shown — plain OR drowns "web search key"
  // in every entry containing "key", while plain AND misses the entry you meant.
  const terms = query.split(/\s+/);
  const scored = [];
  for (const [service, e] of byService) {
    const hay = `${service} ${e.label || ''} ${e.aliases || ''}`.toLowerCase();
    const score = terms.filter(t => hay.includes(t)).length;
    if (score) scored.push({ service, ...e, score });
  }
  const best = Math.max(0, ...scored.map(m => m.score));
  const matches = scored.filter(m => m.score === best);
  for (const m of matches) {
    console.log(`${m.service}  —  ${m.label || '(no label)'}${m.aliases ? `  [also: ${m.aliases}]` : ''}`);
  }
  if (!matches.length) console.log('(no matches)');
} else if (cmd === 'delete') {
  const [service, field] = args;
  if (!service || !field) {
    console.error('Usage: credentials-store.mjs delete <service> <field>');
    process.exit(1);
  }
  const d = db();
  const info = d.prepare('DELETE FROM credentials WHERE service = ? AND field = ?').run(service, field);
  d.close();
  console.log(info.changes ? `Deleted ${service}/${field}.` : `No entry for ${service}/${field}.`);
} else {
  console.log(`Usage:
  credentials-store.mjs set <service> <field> <value> [--plain]   store a value (encrypted by default)
  credentials-store.mjs set-from-clipboard <service> <field> [--plain]  store whatever is on the clipboard right now
  credentials-store.mjs get <service> <field> [--reveal]          copy secret to clipboard, or print plaintext fields directly
  credentials-store.mjs list                                      one line per service (label + field count); pass a service for its full field list
  credentials-store.mjs find <text>                                search free-form entry labels (from import-credentials.mjs)
  credentials-store.mjs delete <service> <field>                  remove an entry`);
  process.exit(1);
}
