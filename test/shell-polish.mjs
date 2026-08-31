#!/usr/bin/env node
import assert from 'node:assert';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'electron-app');

console.log('Running test/shell-polish.mjs...');

// 1. App Icon verification (verify.dori-go.shell.app-icon)
const iconPath = join(APP_DIR, 'public/assets/icon.png');
assert.ok(existsSync(iconPath), 'public/assets/icon.png must exist');
assert.ok(statSync(iconPath).size > 0, 'icon.png must be non-empty');

const mainJsContent = readFileSync(join(APP_DIR, 'main.js'), 'utf8');
assert.ok(mainJsContent.includes('getAppIconPath'), 'main.js must define getAppIconPath helper');
assert.ok(mainJsContent.includes('icon: iconPath'), 'main.js must wire icon to BrowserWindow');

const indexHtmlContent = readFileSync(join(APP_DIR, 'index.html'), 'utf8');
assert.ok(indexHtmlContent.includes('rel="icon"'), 'index.html must include favicon link');
assert.ok(indexHtmlContent.includes('./assets/icon.png'), 'index.html favicon must point to ./assets/icon.png');

const miniHtmlContent = readFileSync(join(APP_DIR, 'mini.html'), 'utf8');
assert.ok(miniHtmlContent.includes('rel="icon"'), 'mini.html must include favicon link');

// 2. Splash Screen verification (verify.dori-go.shell.splash-screen)
assert.ok(indexHtmlContent.includes('splash-container'), 'index.html must include splash container');
assert.ok(indexHtmlContent.includes('splash-logo'), 'index.html must render splash logo');
assert.ok(indexHtmlContent.includes('splash-pulse'), 'index.html must define splash animation');
assert.ok(mainJsContent.includes("show: false"), 'main.js must start window hidden with show: false');
assert.ok(mainJsContent.includes("win.once('ready-to-show'"), 'main.js must show window on ready-to-show');

// 3. Native Motion verification (verify.dori-go.shell.native-motion)
const { DURATION, EASING, TRANSITION } = await import('../electron-app/src/lib/motion.js');
assert.ok(DURATION.enter > 0, 'DURATION.enter must be defined');
assert.ok(DURATION.quick > 0, 'DURATION.quick must be defined');
assert.ok(EASING.easeOut.includes('var(--ease-out-strong)'), 'EASING.easeOut must reference tokens.css custom property');
assert.ok(TRANSITION.slideover.includes('transform'), 'TRANSITION.slideover must include transform');
assert.ok(TRANSITION.modal.includes('transform'), 'TRANSITION.modal must include transform');

const appJsContent = readFileSync(join(APP_DIR, 'src/App.jsx'), 'utf8');
assert.ok(appJsContent.includes('anim-rise'), 'App.jsx must use anim-rise transition on main content');

// 4. Design Token Consistency verification (verify.dori-go.shell.design-consistency)
const tokensCss = readFileSync(join(APP_DIR, 'src/tokens.css'), 'utf8');
assert.ok(tokensCss.includes('--ease-out-strong:'), 'tokens.css must define --ease-out-strong');
assert.ok(tokensCss.includes('--motion-enter:'), 'tokens.css must define --motion-enter');
assert.ok(tokensCss.includes('.anim-rise'), 'tokens.css must define .anim-rise');
assert.ok(tokensCss.includes('--radius-panel:'), 'tokens.css must define --radius-panel');

console.log('shell-polish: all assertions passed');
