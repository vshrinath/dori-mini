#!/usr/bin/env node
// Mirrors dori-engine/src/actions/definitions/projects-apply-template.ts exactly:
// additive-only folder creation (never moves/deletes/overwrites existing content)
// + template_origin provenance written into .setup.md frontmatter. Template
// catalogue copied verbatim from packages/contracts/src/template-record.ts
// (BUILTIN_TEMPLATES) so preset keys/folders/purposes match real Dori.
//
// Targets `projects/<path>/`, exactly like the real action — that's the one tree
// projects.create/apply_template/capture-intake all write to. `entities/projects/<leaf>/`
// is a separate, thin "twin" that only meeting-router and project-rename touch
// (confirmed via dori-engine/src/project-tree/rename.ts's `renameEntitiesTwin` and
// dori-vault's own commit history) — do not point this script at it.
//
// Usage: node apply-template.mjs <projectPath> <templateKey>
//   projectPath: path under projects/, e.g. "acme-widgets" or "acme-widgets/lms"
//   templateKey: engine.default | engine.software | engine.client | engine.research
//                | portal.standard | portal.minimal | portal.full | portal.catalogue
//
// No dedicated "personal" preset exists in the real catalogue — checked
// template-record.ts's BUILTIN_TEMPLATES directly. For personal/non-client work,
// `engine.default` (docs/notes/references, no invoices/deliverables) is the real fit.
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');

const BUILTIN_TEMPLATES = {
  'engine.default': [
    { path: 'docs', purpose: 'Project documentation' },
    { path: 'notes', purpose: 'General project notes, observations, thinking' },
    { path: 'references', purpose: 'Reference material' },
  ],
  'engine.software': [
    { path: 'docs', purpose: 'Project documentation' },
    { path: 'notes', purpose: 'General project notes, observations, thinking' },
    { path: 'source', purpose: 'Implementation source' },
    { path: 'tests', purpose: 'Test suites' },
  ],
  'engine.client': [
    { path: 'docs', purpose: 'Project documentation' },
    { path: 'invoices', purpose: 'Invoices and billing' },
    { path: 'meetings', purpose: 'Meeting notes, transcripts, minutes' },
    { path: 'deliverables', purpose: 'Client deliverables' },
  ],
  'engine.research': [
    { path: 'notes', purpose: 'General project notes, observations, thinking' },
    { path: 'papers', purpose: 'Source papers and publications' },
    { path: 'drafts', purpose: 'Working drafts' },
    { path: 'references', purpose: 'Reference material' },
  ],
  'portal.standard': [
    { path: 'meetings', purpose: 'Meeting notes, transcripts, minutes' },
    { path: 'notes', purpose: 'General project notes, observations, thinking' },
    { path: 'source-data', purpose: 'Raw inputs, uploads, reference material' },
  ],
  'portal.minimal': [],
  'portal.full': [
    { path: 'meetings', purpose: 'Meeting notes, transcripts, minutes' },
    { path: 'notes', purpose: 'General project notes, observations, thinking' },
    { path: 'source-data', purpose: 'Raw inputs, uploads, reference material' },
    { path: 'research', purpose: 'Background research and context' },
    { path: 'decisions', purpose: 'Decisions and rationale' },
    { path: 'content', purpose: 'Written content, modules, scripts, articles' },
    { path: 'assets', purpose: 'Supporting files and media' },
  ],
};

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fmBlock: '', body: raw, hasFrontmatter: false };
  return { fmBlock: m[1], body: m[2], hasFrontmatter: true };
}

function recordTemplateOrigin(raw, templateId) {
  const { fmBlock, body, hasFrontmatter } = parseFrontmatter(raw);
  if (!hasFrontmatter) return { raw, changed: false };
  if (new RegExp(`^template_origin:\\s*${templateId.replace(/\./g, '\\.')}\\s*$`, 'm').test(fmBlock)) {
    return { raw, changed: false };
  }
  const withoutOld = fmBlock.replace(/^template_origin:.*$\n?/m, '');
  const nextFm = `${withoutOld.trimEnd()}\ntemplate_origin: ${templateId}`;
  return { raw: `---\n${nextFm}\n---\n${body}`, changed: true };
}

export function applyTemplate(projectPath, templateKey) {
  const folders = BUILTIN_TEMPLATES[templateKey];
  if (!folders) throw new Error(`Unknown template: ${templateKey}`);

  const projectDir = join(VAULT_ROOT, 'projects', projectPath);
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    throw new Error(`Project not found: projects/${projectPath}`);
  }

  const added = [];
  const alreadyPresent = [];
  for (const folder of folders) {
    const target = join(projectDir, folder.path);
    if (existsSync(target)) {
      alreadyPresent.push(folder.path);
      continue;
    }
    mkdirSync(target, { recursive: true });
    added.push(folder.path);
  }

  const setupPath = join(projectDir, '.setup.md');
  let provenanceRecorded = false;
  if (existsSync(setupPath)) {
    const raw = readFileSync(setupPath, 'utf-8');
    const next = recordTemplateOrigin(raw, templateKey);
    if (next.changed) writeFileSync(setupPath, next.raw, 'utf-8');
    provenanceRecorded = true;
  }

  return { projectPath, templateKey, added, alreadyPresent, provenanceRecorded };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , projectPath, templateKey] = process.argv;
  if (!projectPath || !templateKey) {
    console.error('Usage: node apply-template.mjs <projectPath> <templateKey>');
    process.exit(1);
  }
  console.log(JSON.stringify(applyTemplate(projectPath, templateKey), null, 2));
}
