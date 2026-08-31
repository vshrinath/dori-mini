#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

if (process.platform !== 'darwin') process.exit(0);

const HERE = dirname(fileURLToPath(import.meta.url));
const appPath = join(HERE, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
const plistPath = join(appPath, 'Contents', 'Info.plist');
const PRODUCT_NAME = 'Dori';
const BUNDLE_ID = 'app.mydori.mini';

if (!existsSync(plistPath)) {
  console.log('[patch-electron-name] Electron.app not found yet, skipping.');
  process.exit(0);
}

let plist = readFileSync(plistPath, 'utf8');

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

writeFileSync(plistPath, plist);
console.log(`[patch-electron-name] Set CFBundleName/CFBundleDisplayName to "${PRODUCT_NAME}", CFBundleIdentifier to "${BUNDLE_ID}".`);

try {
  execSync(
    `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${appPath}"`,
    { stdio: 'ignore' }
  );
} catch {
  // Non-fatal
}
