#!/usr/bin/env node
// Builds a local, static "mini-site" over `projects/` and `yt/` — one HTML page per
// vault markdown file plus a folder index at every level — so you can browse projects
// and YouTube captures, and switch between them, the way dori-portal does, without any
// of its live/computed parts (threads, activity timeline, engine calls). Those aren't
// mirrored here on purpose: they need a running engine, not just vault files.
//
// Reuses render-html.mjs's exact remark/rehype pipeline for every file — this script
// only adds folder-index pages, a breadcrumb nav for switching between/within sections,
// and internal .md -> .html link rewriting so cross-references between vault docs stay
// clickable.
//
// Output goes to `_site/<section>/...` (mirrors `<section>/...` 1:1), never inside the
// source folders themselves — keeps generated HTML out of the vault's own tree.
//
// Usage: node build-site.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { homedir } from 'node:os';
import { renderMarkdownToHtml, parseFrontmatter, escapeHtml, wrapStandalonePage } from './render-html.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const SITE_ROOT = join(VAULT_ROOT, '_site');

const SECTIONS = [
  {
    key: 'projects',
    srcDir: join(VAULT_ROOT, 'projects'),
    rootLabel: 'Projects',
    introNames: ['.setup.md', 'README.md'],
    // A subfolder with its own .setup.md IS a project in Dori's real convention
    // (apply-template.mjs's provenance marker) — split those out from plain
    // template-scaffold folders (docs/, meetings/, assets/, ...) so sub-projects
    // read as projects, not as one more folder indistinguishable from the rest.
    isSubProject: (dir) => existsSync(join(dir, '.setup.md')),
  },
  {
    key: 'yt',
    srcDir: join(VAULT_ROOT, 'yt'),
    rootLabel: 'YouTube',
    introNames: [],
    // No sub-project concept under yt/ — a subfolder there is just a project scope
    // (yt/<project>/), not a distinct nested entity the way projects/ has them.
    isSubProject: () => false,
  },
];

function rewriteMdLinks(html) {
  return html.replace(/href="([^"]+?)\.md(#[^"]*)?"/g, (m, path, hash) => {
    if (/^https?:\/\//.test(path)) return m;
    return `href="${path}.html${hash || ''}"`;
  });
}

// Breadcrumb: Home > section > ancestor dir > ... > current (current is never a link).
// `ancestors` are directory crumbs — real relative paths via node:path, not counted
// '../' segments, since a file page and its own directory's index.html sit at the
// SAME depth despite the file's breadcrumb having one more label than the dir's.
function buildNav(currentOutDir, ancestors, currentLabel) {
  const crumbs = ancestors.map(
    (a) => `<a href="${relative(currentOutDir, join(a.outDir, 'index.html'))}">${escapeHtml(a.label)}</a>`
  );
  crumbs.push(`<span class="current">${escapeHtml(currentLabel)}</span>`);
  return `<nav class="site-nav">${crumbs.join('<span class="sep">/</span>')}</nav>`;
}

function readDirEntries(dir) {
  return readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.') || e.name === '.setup.md');
}

// Renders one directory within a section (and recurses into subdirectories).
// `relPath` is relative to the section's srcDir, '' for the section root itself.
// `ancestors` are the {label, outDir} crumbs ABOVE this directory (starts with Home + section).
function buildDir(section, relPath, ancestors) {
  const srcDir = relPath ? join(section.srcDir, relPath) : section.srcDir;
  const outDir = relPath ? join(SITE_ROOT, section.key, relPath) : join(SITE_ROOT, section.key);
  mkdirSync(outDir, { recursive: true });

  const entries = readDirEntries(srcDir);
  const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const introName = section.introNames.find((n) => entries.some((e) => e.name === n));
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== introName)
    .map((e) => e.name)
    .sort();

  const title = relPath ? basename(relPath) : section.rootLabel;
  const nav = buildNav(outDir, ancestors, title);

  let intro = '';
  if (introName) {
    const raw = readFileSync(join(srcDir, introName), 'utf-8');
    const { body } = parseFrontmatter(raw);
    intro = rewriteMdLinks(renderMarkdownToHtml(body) || '');
  }

  const subProjects = subdirs.filter((name) => section.isSubProject(join(srcDir, name)));
  const plainFolders = subdirs.filter((name) => !subProjects.includes(name));

  const subProjectLinks = subProjects.map((name) =>
    `<li><a href="${encodeURIComponent(name)}/index.html">${escapeHtml(name)}</a></li>`
  ).join('\n');
  const folderLinks = plainFolders.map((name) =>
    `<li><a href="${encodeURIComponent(name)}/index.html">📁 ${escapeHtml(name)}</a></li>`
  ).join('\n');
  const fileLinks = mdFiles.map((name) => {
    const raw = readFileSync(join(srcDir, name), 'utf-8');
    const { fm } = parseFrontmatter(raw);
    const label = fm.title || name.replace(/\.md$/, '');
    return `<li><a href="${encodeURIComponent(name.replace(/\.md$/, '.html'))}">${escapeHtml(label)}</a></li>`;
  }).join('\n');

  const listing = `
    ${subProjectLinks ? `<section><h2>Sub-projects</h2><ul class="site-list site-list-projects">${subProjectLinks}</ul></section>` : ''}
    ${folderLinks ? `<section><h2>Folders</h2><ul class="site-list">${folderLinks}</ul></section>` : ''}
    ${fileLinks ? `<section><h2>Files</h2><ul class="site-list">${fileLinks}</ul></section>` : ''}
    ${!subProjectLinks && !folderLinks && !fileLinks ? '<p><em>Empty.</em></p>' : ''}
  `;

  const page = wrapStandalonePage({ title }, `${intro}${listing}`, nav);
  writeFileSync(join(outDir, 'index.html'), page, 'utf-8');

  // Files live in THIS directory, same depth as this directory's own index.html —
  // so their ancestor list is "everything above here" PLUS this directory itself.
  const ancestorsIncludingThisDir = [...ancestors, { label: title, outDir }];

  for (const name of mdFiles) {
    const raw = readFileSync(join(srcDir, name), 'utf-8');
    const { fm, body } = parseFrontmatter(raw);
    const html = renderMarkdownToHtml(body);
    if (html == null) continue; // e.g. contains a language-block fence, same skip rule as Dori
    const fileLabel = fm.title || name.replace(/\.md$/, '');
    const fileNav = buildNav(outDir, ancestorsIncludingThisDir, fileLabel);
    const page = wrapStandalonePage(fm, rewriteMdLinks(html), fileNav);
    writeFileSync(join(outDir, name.replace(/\.md$/, '.html')), page, 'utf-8');
  }

  let count = 1 + mdFiles.length;
  for (const name of subdirs) {
    count += buildDir(section, relPath ? `${relPath}/${name}` : name, ancestorsIncludingThisDir);
  }
  return count;
}

function main() {
  mkdirSync(SITE_ROOT, { recursive: true });
  const home = { label: 'Home', outDir: SITE_ROOT };

  let total = 0;
  const sectionLinks = [];
  for (const section of SECTIONS) {
    if (!existsSync(section.srcDir)) {
      console.log(`Skipping ${section.key}/ — no such directory at ${section.srcDir}`);
      continue;
    }
    total += buildDir(section, '', [home]);
    sectionLinks.push(`<li><a href="${section.key}/index.html">${escapeHtml(section.rootLabel)}</a></li>`);
  }

  const landing = wrapStandalonePage(
    { title: 'Vault' },
    `<section><ul class="site-list site-list-projects">${sectionLinks.join('\n')}</ul></section>`,
    ''
  );
  writeFileSync(join(SITE_ROOT, 'index.html'), landing, 'utf-8');

  console.log(`Built ${total} pages under ${SITE_ROOT}`);
  console.log(`Serve it (required for YouTube embeds — file:// triggers Error 153): node serve-site.mjs`);
  console.log(`Then open: http://localhost:8420/`);
}

main();
