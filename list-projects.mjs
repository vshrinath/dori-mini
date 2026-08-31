#!/usr/bin/env node
// Walks projects/**/.setup.md — the canonical per-project marker real Dori
// auto-creates when a folder is discovered under projects/ (see
// apply-template.mjs's header comment). project_path is relative to
// projects/ and slash-separated, so "aligna/platform" IS the sub-project
// relationship — no separate parent-lookup needed, just split on '/'.
//
// Usage: node list-projects.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseFrontmatter } from './frontmatter.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const PROJECTS_DIR = join(VAULT_ROOT, 'projects');

function findSetupFiles(dir, depth = 0) {
  if (depth > 6) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.setup.md') continue;
    const full = join(dir, e.name);
    if (e.isFile() && e.name === '.setup.md') found.push(full);
    else if (e.isDirectory()) found.push(...findSetupFiles(full, depth + 1));
  }
  return found;
}

export function listProjects() {
  const setupFiles = findSetupFiles(PROJECTS_DIR);
  return setupFiles
    .map((full) => {
      const { fm } = parseFrontmatter(readFileSync(full, 'utf-8'));
      if (!fm.project_path) return null;
      return {
        title: (fm.title || fm.project || fm.project_path).replace(/^["']|["']$/g, ''),
        projectPath: fm.project_path,
        status: fm.status || 'active',
        updatedAt: statSync(full).mtime.toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.projectPath.localeCompare(b.projectPath));
}

if (import.meta.main) {
  const projects = listProjects();
  if (projects.length === 0) {
    console.log('No projects found under projects/.');
  } else {
    for (const p of projects) {
      console.log(`- [${p.status}] ${p.projectPath} — ${p.title}`);
    }
  }
}
