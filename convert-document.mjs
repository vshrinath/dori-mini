#!/usr/bin/env node
// Convert a local document to Markdown using on-device parsers only — no
// Python venv, no data leaving the machine.
//
// PDF -> @firecrawl/pdf-inspector: native text extraction, with local OCR
// (bundled model, no network calls carrying document content) when
// PDFIUM_LIB_PATH / ORT_DYLIB_PATH are configured and the PDF needs it.
//
// DOCX/PPTX/XLSX/ODT/RTF/EPUB/CSV -> @firecrawl/anydoc, ocr: 'reject' (never
// 'hosted' — that would ship the document to Firecrawl's API).
//
// A pasted URL is a different capture path entirely (markdown.new fetches
// and extracts it) — see SKILL.md branch 2. This script only handles local
// files already on disk.
//
// Usage: node convert-document.mjs <path> [-o <output.md>]

import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pi from '@firecrawl/pdf-inspector';
import * as anydoc from '@firecrawl/anydoc';

const OCR_ENABLED = Boolean(process.env.PDFIUM_LIB_PATH && process.env.ORT_DYLIB_PATH);

async function convertPdf(path) {
  const buffer = readFileSync(path);
  const classification = pi.classifyPdf(buffer);

  if (classification.pdfType === 'TextBased') {
    const result = pi.extractPagesMarkdown(buffer);
    return result.pages.map(p => p.markdown).join('\n\n---\n\n');
  }

  if (!OCR_ENABLED) {
    throw new Error(
      `PDF is ${classification.pdfType}; OCR is needed but PDFIUM_LIB_PATH / ORT_DYLIB_PATH are not set.`
    );
  }

  const result = await pi.processPdfWithOcr(buffer, { mode: 'Auto' });
  return result.pages.map(p => p.markdown).join('\n\n---\n\n');
}

async function convertOther(path) {
  return anydoc.toMarkdown(path, { ocr: 'reject' });
}

export async function convertDocument(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.pdf') return convertPdf(path);
  return convertOther(path);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path, ...rest] = process.argv.slice(2);
  if (!path) {
    console.error('Usage: node convert-document.mjs <path> [-o <output.md>]');
    process.exit(1);
  }
  const outIndex = rest.indexOf('-o');
  const outputPath = outIndex >= 0 ? rest[outIndex + 1] : null;

  convertDocument(path)
    .then(markdown => {
      if (outputPath) {
        writeFileSync(outputPath, markdown);
        console.log(`Wrote ${outputPath}`);
      } else {
        process.stdout.write(markdown);
      }
    })
    .catch(error => {
      console.error(`Conversion failed: ${error.message}`);
      process.exit(1);
    });
}
