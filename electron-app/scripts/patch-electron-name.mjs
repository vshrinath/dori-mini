#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

if (process.platform !== 'darwin') process.exit(0);

const HERE = dirname(fileURLToPath(import.meta.url));
const electronDir = join(HERE, '..', 'node_modules', 'electron');
const distDir = join(electronDir, 'dist');
const pathFile = join(electronDir, 'path.txt');

const oldAppPath = join(distDir, 'Electron.app');
const newAppPath = join(distDir, 'Dori.app');

// 1. Rename Electron.app to Dori.app if not already renamed
if (existsSync(oldAppPath) && !existsSync(newAppPath)) {
  renameSync(oldAppPath, newAppPath);
}

if (!existsSync(newAppPath)) {
  console.log('[patch-electron-name] Dori.app/Electron.app not found in node_modules/electron/dist, skipping.');
  process.exit(0);
}

// 2. Rename executable inside Contents/MacOS/Electron to Dori
const oldExecPath = join(newAppPath, 'Contents', 'MacOS', 'Electron');
const newExecPath = join(newAppPath, 'Contents', 'MacOS', 'Dori');
if (existsSync(oldExecPath) && !existsSync(newExecPath)) {
  renameSync(oldExecPath, newExecPath);
}

// 3. Update path.txt so electron loader launches Dori.app/Contents/MacOS/Dori
if (existsSync(pathFile)) {
  writeFileSync(pathFile, 'Dori.app/Contents/MacOS/Dori\n');
}

// 4. Update Info.plist
const plistPath = join(newAppPath, 'Contents', 'Info.plist');
if (existsSync(plistPath)) {
  let plist = readFileSync(plistPath, 'utf8');
  plist = plist.replace(
    /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
    '$1Dori$2'
  );
  plist = plist.replace(
    /(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/,
    '$1Dori$2'
  );
  plist = plist.replace(
    /(<key>CFBundleExecutable<\/key>\s*<string>)[^<]*(<\/string>)/,
    '$1Dori$2'
  );
  plist = plist.replace(
    /(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/,
    '$1app.mydori.mini$2'
  );
  writeFileSync(plistPath, plist);
}

console.log('[patch-electron-name] Successfully rebranded Electron binary to Dori.app on macOS.');

// 5. Register with macOS LaunchServices
try {
  execSync(
    `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${newAppPath}"`,
    { stdio: 'ignore' }
  );
} catch {
  // Non-fatal
}
