#!/usr/bin/env node
// Mirrors dori-portal/lib/markdown-render.ts's renderMarkdownToHtml() exactly —
// same packages (unified/remark-parse/remark-gfm/remark-rehype/rehype-stringify/
// unist-util-visit), same three plugins (addHeadingIds, wrapTables,
// externalLinkAttrs), same language-block-fence skip rule. This is a copy, not
// a shared module (Dori's original has `import 'server-only'`, a Next.js guard
// that hard-errors outside their server) — a fix in one does not propagate to
// the other.
//
// Unlike Dori's version (which returns a bare HTML fragment for injection into
// an already-styled React page), this wraps the fragment in a minimal standalone
// page so `file://` can open it directly with no server, no login, no CSS
// dependency on the portal.
//
// Usage: node render-html.mjs <path-to-vault-file.md> [output.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';

const LANGUAGE_BLOCK_FENCE = /```block\b/;

function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

function extractText(node) {
  let text = '';
  visit(node, 'text', (child) => { text += child.value; });
  return text;
}

function addHeadingIds() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const text = extractText(node);
      if (!text) return;
      node.properties = { ...node.properties, id: slugify(text) };
    });
  };
}

function wrapTables() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || parent == null || index == null) return;
      const wrapperNode = { type: 'element', tagName: 'div', properties: { className: ['markdown-table-wrap'] }, children: [node] };
      parent.children[index] = wrapperNode;
    });
  };
}

function externalLinkAttrs() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href === 'string' && href.startsWith('http')) {
        node.properties = { ...node.properties, target: '_blank', rel: ['noopener', 'noreferrer'] };
      }
    });
  };
}

function timestampToSeconds(ts) {
  const parts = ts.split(':').map(Number).reverse();
  return (parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600;
}

// Not in Dori's markdown-render.ts (that's portal-only, driven by youtube-note.tsx's
// separate seekTo() via the YouTube IFrame Player API). Added here so the standalone
// page keeps the "click a chapter, jump the video" behavior instead of losing it —
// same `## [MM:SS] Title` heading format Dori's chapter-notes job produces.
function linkChapterTimestamps() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'h2') return;
      const first = node.children[0];
      if (first?.type !== 'text') return;
      const m = first.value.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/);
      if (!m) return;
      const seconds = timestampToSeconds(m[1]);
      first.value = first.value.slice(m[0].length);
      node.children.unshift({
        type: 'element',
        tagName: 'a',
        properties: { href: '#', className: ['chapter-ts'], 'data-t': String(seconds) },
        children: [{ type: 'text', value: `[${m[1]}]` }],
      });
      node.children.splice(1, 0, { type: 'text', value: ' ' });
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(addHeadingIds)
  .use(wrapTables)
  .use(externalLinkAttrs)
  .use(linkChapterTimestamps)
  .use(rehypeStringify);

// Mirrors renderMarkdownToHtml(content) exactly.
export function renderMarkdownToHtml(content) {
  if (!content || LANGUAGE_BLOCK_FENCE.test(content)) return null;
  try {
    const normalized = content.replace(/\n{3,}/g, '\n\n');
    return String(processor.processSync(normalized));
  } catch (err) {
    console.error('[render-html] failed, rendering nothing:', err);
    return null;
  }
}

// Dori's real renderYoutubeChapterNote() puts watch/channel/duration in a
// **Label:** body header, not frontmatter (only title/date/type land there) —
// mirrors dori-portal/lib/yt.ts's parseYtNote() body fallback so these render.
function bodyHeaderFallback(body, label) {
  const m = body.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : undefined;
}

import { parseFrontmatter as parseFm } from './frontmatter.mjs';

// Adds the body-header fallbacks on top of the shared parser (./frontmatter.mjs).
export function parseFrontmatter(raw) {
  const { fm, body } = parseFm(raw);
  fm.watch = fm.watch || bodyHeaderFallback(body, 'Watch');
  fm.channel = fm.channel || bodyHeaderFallback(body, 'Channel');
  fm.duration = fm.duration || bodyHeaderFallback(body, 'Duration');
  return { fm, body };
}

export function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Mirrors dori-portal's yt.ts video-id extraction: v=, /embed/, or youtu.be/.
function extractYoutubeId(watchUrl) {
  if (!watchUrl) return null;
  const m = watchUrl.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// No portal CSS available locally, so this page ships its own styling — borrowed from
// dori-portal/app/globals.css's real brand tokens (navy/gold, warm canvas) rather than
// generic defaults — plus a scroll-spy right-rail TOC mirroring table-of-contents.tsx +
// sticky-sidebar.tsx (chapter list, active-section highlight, timestamp stripped from
// the displayed label, same as Dori's `text.replace(/^\[\d{2,}:\d{2}...\]\s*/, '')`).
// `fm` (frontmatter) is rendered as a visible header — title/channel/date/watch link
// plus an embedded player for YouTube captures — not just tucked into <title>.
export function wrapStandalonePage(fm, bodyHtml, nav = '') {
  const title = fm.title || 'Untitled';
  const videoId = extractYoutubeId(fm.watch);
  const metaParts = [fm.channel, fm.date].filter(Boolean).map(escapeHtml);
  // No enablejsapi=1: we never call the postMessage-based Player API, only replace
  // the iframe src wholesale on a chapter click — enablejsapi requires a validated
  // http(s) origin and throws YouTube's "Error 153" when the page is loaded via file://.
  const player = videoId
    ? `<div class="player"><iframe id="player" src="https://www.youtube.com/embed/${videoId}" title="${escapeHtml(title)}" allowfullscreen></iframe></div>`
    : '';
  const watchLink = fm.watch ? `<a class="watch-link" href="${escapeHtml(fm.watch)}" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --brand-navy: #1a1f4e;
    --brand-accent: #d99b24;
    --brand-canvas: #fafaf8;
    --foreground: #26272b;
    --foreground-secondary: #63666e;
    --muted-foreground: #686b73;
    --border: #e3e4e8;
    --border-soft: #ececef;
    --card: #ffffff;
    --accent-tint: color-mix(in srgb, var(--brand-accent) 12%, var(--card));
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --brand-navy: #91a0e8;
      --brand-accent: #e7b95a;
      --brand-canvas: #17181c;
      --foreground: #f2f4fb;
      --foreground-secondary: #a8abb8;
      --muted-foreground: #9a9dab;
      --border: #2d2f38;
      --border-soft: #26272e;
      --card: #1e1f26;
      --accent-tint: color-mix(in srgb, var(--brand-accent) 16%, var(--card));
    }
  }
  * { box-sizing: border-box; }
  body {
    background: var(--brand-canvas);
    color: var(--foreground);
    font: 16px/1.65 -apple-system, system-ui, sans-serif;
    margin: 0;
    padding: 3rem 1.5rem 5rem;
  }
  .page { max-width: 74rem; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 42rem) 14rem; gap: 3rem; align-items: start; }
  @media (max-width: 900px) { .page { grid-template-columns: minmax(0, 1fr); } .sidebar { display: none; } }
  main { min-width: 0; }
  h1, h2, h3, h4 { line-height: 1.25; color: var(--foreground); }
  h2 { margin-top: 2.5rem; font-size: 1.15rem; }
  header.doc-header { margin-bottom: 2rem; }
  header.doc-header h1 { margin: 0 0 0.3rem; font-size: 1.7rem; letter-spacing: -0.01em; }
  .doc-meta { color: var(--muted-foreground); font-size: 0.9rem; margin: 0 0 1rem; }
  .watch-link { display: inline-block; margin-bottom: 1rem; font-size: 0.9rem; color: var(--brand-navy); font-weight: 600; }
  .player { position: relative; width: 100%; aspect-ratio: 16/9; margin-bottom: 1.5rem; background: #000; border-radius: 10px; overflow: hidden; }
  .player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  table { border-collapse: collapse; }
  .markdown-table-wrap { overflow-x: auto; }
  .markdown-table-wrap table { width: 100%; }
  .markdown-table-wrap th, .markdown-table-wrap td { border: 1px solid var(--border); padding: 0.4em 0.7em; text-align: left; }
  pre { overflow-x: auto; padding: 1em; background: var(--accent-tint); border-radius: 6px; }
  code { font: 0.9em ui-monospace, monospace; }
  a { color: var(--brand-navy); }
  blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid var(--border); color: var(--foreground-secondary); }
  .chapter-ts {
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: var(--accent-tint);
    border-radius: 999px;
    padding: 0.15em 0.6em;
    margin-right: 0.5em;
    vertical-align: middle;
  }
  .chapter-ts:hover { color: var(--brand-navy); }
  .sidebar { position: sticky; top: 3rem; max-height: calc(100vh - 5rem); overflow-y: auto; }
  .toc-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-foreground); margin: 0 0 0.75rem; }
  .toc-list { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--border-soft); }
  .toc-list li a {
    display: block;
    padding: 0.3rem 0 0.3rem 0.9rem;
    margin-left: -2px;
    border-left: 2px solid transparent;
    font-size: 0.85rem;
    color: var(--muted-foreground);
    text-decoration: none;
    transition: color 0.15s, border-color 0.15s;
  }
  .toc-list li a:hover { color: var(--foreground); }
  .toc-list li a.active { color: var(--brand-navy); border-left-color: var(--brand-accent); font-weight: 600; }
  .site-nav { max-width: 74rem; margin: 0 auto 1.5rem; font-size: 0.82rem; color: var(--muted-foreground); }
  .site-nav a { color: var(--muted-foreground); text-decoration: none; }
  .site-nav a:hover { color: var(--brand-navy); text-decoration: underline; }
  .site-nav .sep { margin: 0 0.4em; opacity: 0.5; }
  .site-nav .current { color: var(--foreground); font-weight: 600; }
  .site-list { list-style: none; margin: 0 0 1.5rem; padding: 0; }
  .site-list li a { display: block; padding: 0.5rem 0.75rem; border-radius: 6px; text-decoration: none; color: var(--foreground); }
  .site-list li a:hover { background: var(--accent-tint); }
  .site-list-projects li a { font-weight: 600; color: var(--brand-navy); }
  .site-list-projects li a::before { content: "📂 "; }
</style>
</head>
<body>
${nav}
<div class="page">
<main>
<header class="doc-header">
  <h1>${escapeHtml(title)}</h1>
  ${metaParts.length ? `<p class="doc-meta">${metaParts.join(' · ')}</p>` : ''}
  ${watchLink}
  ${player}
</header>
${bodyHtml}
</main>
<aside class="sidebar">
  <p class="toc-label">On this page</p>
  <ul class="toc-list" id="toc-list"></ul>
</aside>
</div>
<script>
(function () {
  var main = document.querySelector('main');
  var headings = Array.prototype.slice.call(main.querySelectorAll('h2'));
  var tocList = document.getElementById('toc-list');
  var links = [];
  headings.forEach(function (h, i) {
    var id = h.id || 'section-' + i;
    h.id = id;
    var label = h.textContent.replace(/^\\s*\\[\\d{1,2}:\\d{2}(?::\\d{2})?\\]\\s*/, '').trim();
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + id;
    a.textContent = label;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', '#' + id);
    });
    li.appendChild(a);
    tocList.appendChild(li);
    links.push({ el: h, a: a });
  });
  function onScroll() {
    var pos = window.scrollY + 130;
    var active = links[0];
    links.forEach(function (l) { if (l.el.offsetTop <= pos) active = l; });
    links.forEach(function (l) { l.a.classList.toggle('active', l === active); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
${videoId ? `document.querySelectorAll('.chapter-ts').forEach(function (a) {
  a.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var t = a.getAttribute('data-t');
    var iframe = document.getElementById('player');
    iframe.src = 'https://www.youtube.com/embed/${videoId}?autoplay=1&start=' + t;
    iframe.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});` : ''}
</script>
</body>
</html>
`;
}

export function renderVaultFileToHtml(mdPath, outPath, nav = '') {
  const raw = readFileSync(mdPath, 'utf-8');
  const { fm, body } = parseFrontmatter(raw);
  const html = renderMarkdownToHtml(body);
  if (html == null) throw new Error(`Could not render ${mdPath} (empty content or contains a language-block fence)`);
  const page = wrapStandalonePage(fm, html, nav);
  const dest = outPath || mdPath.replace(/\.md$/, '.html');
  writeFileSync(dest, page, 'utf-8');
  return dest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , mdPath, outPath] = process.argv;
  if (!mdPath) {
    console.error('Usage: node render-html.mjs <path-to-vault-file.md> [output.html]');
    process.exit(1);
  }
  const dest = renderVaultFileToHtml(mdPath, outPath);
  console.log(dest);
}
