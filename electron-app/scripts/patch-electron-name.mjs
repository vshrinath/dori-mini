#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

if (process.platform !== 'darwin') process.exit(0);

const HERE = dirname(fileURLToPath(import.meta.url));
const rawElectronDir = join(HERE, '..', 'node_modules', 'electron');

if (!existsSync(rawElectronDir)) {
  process.exit(0);
}

const electronDir = realpathSync(rawElectronDir);
const distDir = join(electronDir, 'dist');
const pathFile = join(electronDir, 'path.txt');
const installFile = join(electronDir, 'install.js');

const oldAppPath = join(distDir, 'Electron.app');
const newAppPath = join(distDir, 'Dori.app');

// 1. Patch install.js so isInstalled() accepts Dori.app/Contents/MacOS/Dori
if (existsSync(installFile)) {
  let installJs = readFileSync(installFile, 'utf8');
  installJs = installJs.replace(
    /return 'Electron\.app\/Contents\/MacOS\/Electron';/,
    "return 'Dori.app/Contents/MacOS/Dori';"
  );
  writeFileSync(installFile, installJs);
}

// 2. Clean up duplicate Electron.app if Dori.app already exists, or rename it
if (existsSync(oldAppPath)) {
  if (existsSync(newAppPath)) {
    rmSync(oldAppPath, { recursive: true, force: true });
  } else {
    renameSync(oldAppPath, newAppPath);
  }
}

if (!existsSync(newAppPath)) {
  console.log('[patch-electron-name] Dori.app not found in dist, skipping.');
  process.exit(0);
}

// 3. Rename executable inside Contents/MacOS/Electron to Dori
const oldExecPath = join(newAppPath, 'Contents', 'MacOS', 'Electron');
const newExecPath = join(newAppPath, 'Contents', 'MacOS', 'Dori');
if (existsSync(oldExecPath)) {
  if (existsSync(newExecPath)) {
    rmSync(oldExecPath, { force: true });
  } else {
    renameSync(oldExecPath, newExecPath);
  }
}

// 4. Update path.txt so index.js points directly at Dori.app/Contents/MacOS/Dori
if (existsSync(pathFile)) {
  writeFileSync(pathFile, 'Dori.app/Contents/MacOS/Dori');
}

// 5. Update Info.plist
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

// 6. Register with macOS LaunchServices
try {
  execSync(
    `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${newAppPath}"`,
    { stdio: 'ignore' }
  );
} catch {
  // Non-fatal
}
