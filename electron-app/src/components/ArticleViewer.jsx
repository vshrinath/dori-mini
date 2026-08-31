// Lifted from dori-portal/components/library/ArticleViewer.tsx — read-only
// mode only (dropped the isReadOnly-gated edit-mode textarea/onChange path
// entirely, since Dori Go has no document-editing story yet). The original
// renders through lib/markdown.tsx's client-side ReactMarkdown; this renders
// pre-rendered HTML instead (get_document's `html` field, produced by
// render-html.mjs's renderMarkdownToHtml — the same unified/remark/rehype
// pipeline dori-portal's own server-render path uses, already a dependency
// of this repo's root package, not electron-app's) — avoids adding
// react-markdown/remark-gfm as new electron-app dependencies for what the
// root package already does.
export function ArticleViewer({ content, html }) {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center gap-4 border-b border-border/50 bg-card/50 px-6 py-3 text-xs text-muted-foreground">
        <span>{wordCount} words</span>
        <span>·</span>
        <span>{readingMinutes} min read</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <article className="mx-auto max-w-2xl px-6 py-8">
          {html ? (
            <div className="prose prose-headings:font-display max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-sm text-muted-foreground">
              This document can't be previewed here.
            </p>
          )}
        </article>
      </div>
    </div>
  );
}
