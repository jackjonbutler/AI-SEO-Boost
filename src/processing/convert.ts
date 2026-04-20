// src/processing/convert.ts
// Converts clean HTML to Markdown using Turndown.
// TurndownService instance is created ONCE at module level (stateless after construction).
// IMPORTANT: esModuleInterop:true in tsconfig makes the default import work for this CJS package.

import TurndownService from 'turndown';

const td = new TurndownService({
  headingStyle: 'atx',       // # H1, ## H2 etc.
  codeBlockStyle: 'fenced',  // ``` code fences
  bulletListMarker: '-',
});

// Drop elements that add noise to markdown output
td.remove(['form', 'button', 'input', 'select', 'textarea', 'iframe']);

export function convertToMarkdown(cleanHtml: string): string {
  return td.turndown(cleanHtml);
}
