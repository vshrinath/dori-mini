#!/usr/bin/env node
// Local desktop notification — the delivery half of dori-engine's `notify.send`
// (self-only push), scoped down to local OS notification surfaces since this
// mirror has no running server to fan out to WhatsApp/portal surfaces itself.
//
// macOS: `osascript` (built in). NOTE: `display notification` has no click-action
// parameter, so these can't be clicked through to a specific page — clicking
// "Show" just brings Script Editor forward (the process osascript runs as). Tried
// swapping to `terminal-notifier` for a real `-open <url>` click target; its
// Homebrew build is only ad-hoc signed with an unbound Info.plist, which macOS's
// UNUserNotificationCenter refuses to grant permission to at all (confirmed via
// `codesign -dv` + `-diagnose`) — an upstream packaging bug, not fixable from
// here. Callers that need the page to actually open should open it directly (see
// digest.mjs) rather than relying on the notification being clickable.
//
// Linux (incl. WSLg, which runs a real notification portal): `notify-send`
// (built into every desktop environment via the freedesktop notification spec —
// no dependency, no config).
//
// Plain WSL2 with no WSLg/notify-send: no native Linux notification surface
// exists, so we cross the boundary into Windows via `powershell.exe` (always on
// PATH from WSL) and pop a balloon tip off a throwaway System.Windows.Forms
// NotifyIcon — built into every Windows install, no BurntToast module needed.
//
// Usage: node notify-desktop.mjs "message" ["title"]
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function isWSL() {
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { input }, (err) => (err ? reject(err) : resolve()));
  });
}

function notifyMacOS(message, title) {
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  return run('osascript', ['-e', script]);
}

function notifyLinux(message, title) {
  return run('notify-send', [title, message]);
}

// -EncodedCommand takes base64(UTF-16LE) so we never have to hand-escape the
// message/title through both a shell and a PowerShell string literal — only
// the single quotes inside the embedded PowerShell string literal need escaping.
function notifyWindowsToast(message, title) {
  const esc = (s) => String(s).replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.ShowBalloonTip(5000, '${esc(title)}', '${esc(message)}', [System.Windows.Forms.ToolTipIcon]::Info)
Start-Sleep -Seconds 6
$n.Dispose()
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
}

export async function notifyDesktop(message, title = 'Dori') {
  if (process.platform === 'darwin') return notifyMacOS(message, title);
  if (process.platform === 'linux') {
    try {
      return await notifyLinux(message, title);
    } catch (err) {
      if (err.code === 'ENOENT' && isWSL()) return notifyWindowsToast(message, title);
      throw err;
    }
  }
  throw new Error(`notify-desktop.mjs doesn't support platform: ${process.platform}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [message, title] = process.argv.slice(2);
  if (!message) {
    console.error('Usage: node notify-desktop.mjs "message" ["title"]');
    process.exit(1);
  }
  await notifyDesktop(message, title);
}
