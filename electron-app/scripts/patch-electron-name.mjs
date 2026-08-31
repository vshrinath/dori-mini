#!/usr/bin/env node
// macOS-only. app.setName() (main.js) does NOT control the Dock tile label
// or the bold menu-bar app title for an unpackaged `electron .` dev run --
// those come from the actual Electron binary's own Info.plist
// (CFBundleName/CFBundleDisplayName, both "Electron" out of the box),
// which is what LaunchServices actually reads. A packaged build (electron-
// builder/forge) generates its own correctly-named bundle and wouldn't
// need this; this only patches the raw devDependency binary so `pnpm start`
// shows "Dori Go" instead of "Electron" during local dev. Only rewrites
// the two Name keys, not CFBundleExecutable or the binary file itself, so
// how `electron .` resolves and launches is unaffected. Runs as a
// postinstall hook so it reapplies after every fresh `pnpm install`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

if (process.platform !== 'darwin') process.exit(0);

const HERE = dirname(fileURLToPath(import.meta.url));
const appPath = join(HERE, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
const plistPath = join(appPath, 'Contents', 'Info.plist');
const PRODUCT_NAME = 'Dori Go';
// Every unpackaged `electron .` dev app on this machine shares the raw
// binary's default CFBundleIdentifier "com.github.Electron". macOS
// LaunchServices caches the displayed app name per bundle identifier, not
// per file path -- so renaming only CFBundleName/CFBundleDisplayName isn't
// enough, the cached registration for "com.github.Electron" (built up from
// every other electron-based dev app that ever ran on this machine) wins.
// A distinct identifier makes this a genuinely separate LaunchServices
// registration instead of colliding with that shared one.
const BUNDLE_ID = 'com.dori.go.dev';

if (!existsSync(plistPath)) {
  console.log('[patch-electron-name] Electron.app not found yet (pre-install?), skipping.');
  process.exit(0);
}

let plist = readFileSync(plistPath, 'utf8');
const before = plist;

for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
  plist = plist.replace(
    new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`),
    `$1${PRODUCT_NAME}$2`
  );
}
plist = plist.replace(
  /(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${BUNDLE_ID}$2`
);

if (plist === before) {
  console.log('[patch-electron-name] Info.plist already patched, no change.');
} else {
  writeFileSync(plistPath, plist);
  console.log(`[patch-electron-name] Set CFBundleName/CFBundleDisplayName to "${PRODUCT_NAME}", CFBundleIdentifier to "${BUNDLE_ID}".`);
}

try {
  execSync(
    `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${appPath}"`,
    { stdio: 'ignore' }
  );
} catch {
  // Non-fatal -- the app still launches correctly, macOS just may take a
  // moment to pick up the new identity if this step is unavailable.
}
