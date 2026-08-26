#!/usr/bin/env node
// Interactive intake for the credentials store — run this in your own terminal
// (not through an agent). It asks for the name/field/value itself, so the
// value is typed straight into this process and never becomes a tool
// argument, clipboard write, or line in an agent's transcript.
import { createInterface } from 'node:readline/promises';
import { loadCredentialsLib } from './credentials-unavailable.mjs';

const { db, getOrCreateKey, setEntry, slugify } = await loadCredentialsLib();

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log('Add a credential to the local encrypted store.\n');
const label = (await rl.question('Name this credential (e.g. "Serper API key"): ')).trim();
if (!label) { console.error('No name entered, aborting.'); process.exit(1); }
const service = slugify(label);
const aliases = (await rl.question('Also known as (optional, comma-separated): ')).trim();
const field = (await rl.question('Field name [value]: ')).trim() || 'value';
const plainAns = (await rl.question('Is this a secret that should be encrypted? [Y/n]: ')).trim().toLowerCase();
const plain = plainAns === 'n' || plainAns === 'no';
const value = (await rl.question('Value: ')).trim();
rl.close();

if (!value) { console.error('No value entered, aborting.'); process.exit(1); }

const d = db();
setEntry(d, plain ? null : getOrCreateKey(), service, field, value, plain);
if (field !== 'label') setEntry(d, null, service, 'label', label, true);
if (aliases) setEntry(d, null, service, 'aliases', aliases, true);
d.close();

console.log(`\nSaved ${service}/${field} (${plain ? 'plaintext' : 'encrypted'}).`);
