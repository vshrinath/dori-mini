#!/usr/bin/env node
// Mirrors dori-engine/src/jobs/schema.ts canonicalOutputPath / canonicalOutputDirectory,
// so a fresh (non-meeting) capture lands in the same folder shape Dori itself would use:
// yt/ for YouTube (or yt/<project>/ when project-scoped — see below),
// references/clippings/ for other reference-worthy kinds, projects/<path>/ when a
// project is explicitly given, else inbox/ (Dori's own real default — it does not guess).
//
// YouTube previously mirrored dori-engine's references/youtube/, which turned out to be
// a real bug in Dori itself: nothing in dori-portal ever read from that path — only
// yt/${relPath} (dori-portal/app/yt/[...slug]/page.tsx) renders a YouTube capture. Fixed
// upstream in dori-engine (src/jobs/schema.ts, commit 14cb383) and mirrored here to match.
//
// Usage: node route-destination.mjs <kind> [projectPath] [url]
//   kind: youtube | url | document | text
import { join } from 'node:path';
import { homedir } from 'node:os';

export const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');

function sanitizePathPart(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

export function isYouTubeUrl(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be';
  } catch {
    return false;
  }
}

function referenceSubfolder(kind, urls) {
  const k = String(kind || '').toLowerCase();
  if (k === 'youtube' || urls.some(isYouTubeUrl)) return 'youtube';
  if (k === 'url' || k === 'bookmark') return 'clippings';
  return null; // plain document/text capture — not "reference-worthy" per Dori's own rule
}

export function canonicalOutputDirectory({ kind, urls = [], projectPath }) {
  const ref = referenceSubfolder(kind, urls);
  if (ref === 'youtube') return projectPath ? `yt/${projectPath}` : 'yt';
  if (ref) return projectPath ? `projects/${projectPath}/references/${ref}` : `references/${ref}`;
  if (projectPath) return `projects/${projectPath}`;
  return 'inbox'; // Dori's real default — it never guesses a project for a bare capture
}

export function canonicalOutputPath({ kind, urls = [], projectPath, source = 'dori' }) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  const filename = `${date}-${sanitizePathPart(source)}-${sanitizePathPart(kind)}-${time}-${suffix}.md`;
  return `${canonicalOutputDirectory({ kind, urls, projectPath })}/${filename}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , kind, projectPath, url] = process.argv;
  const relPath = canonicalOutputPath({ kind, urls: url ? [url] : [], projectPath: projectPath || null });
  console.log(JSON.stringify({ relPath, absolutePath: join(VAULT_ROOT, relPath) }, null, 2));
}
