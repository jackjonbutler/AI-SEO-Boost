// src/generators/files/markdown-mirrors.ts
// Pure transformer — no I/O. Converts a MarkdownDocument into a {slug, content}
// pair ready for the generate_markdown_mirrors handler to write to disk.

import type { MarkdownDocument } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * buildFrontmatter — emits a YAML frontmatter block for a MarkdownDocument.
 *
 * Fields emitted: title, url, description (omitted if empty), date (today).
 * All values are double-quoted and internal double quotes are escaped.
 * Pattern 4 from RESEARCH.md.
 */
function buildFrontmatter(doc: MarkdownDocument): string {
  const today = new Date().toISOString().split('T')[0];
  const fields: Record<string, string> = {
    title: doc.title,
    url: doc.url,
    description: doc.description,
    date: today,
  };

  const lines = Object.entries(fields)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}: "${v.replace(/"/g, '\\"')}"`)
    .join('\n');

  return `---\n${lines}\n---\n\n`;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * urlToSlug — derives a filesystem-safe slug from a URL.
 *
 * Rules (Pattern 3 from RESEARCH.md + Pitfall 8):
 *  - Use the URL pathname only.
 *  - Strip .html / .htm suffix.
 *  - Strip leading slash.
 *  - Strip trailing slash.
 *  - Strip trailing /index segment (e.g. /services/index → services).
 *  - Empty result or bare 'index' → 'index' (home page, flat write).
 *  - On URL parse failure → 'index'.
 */
export function urlToSlug(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    let pathname = u.pathname;

    // Strip .html / .htm suffix
    pathname = pathname.replace(/\.html?$/i, '');

    // Strip leading slash
    pathname = pathname.replace(/^\//, '');

    // Strip trailing slash
    pathname = pathname.replace(/\/$/, '');

    // Strip /index suffix so /services/index → services
    pathname = pathname.replace(/\/index$/, '');

    // Bare 'index' or empty → home page
    if (pathname === '' || pathname === 'index') {
      return 'index';
    }

    return pathname;
  } catch {
    return 'index';
  }
}

/**
 * buildMarkdownMirror — converts a MarkdownDocument into {slug, content}.
 *
 * The returned content is YAML frontmatter + the markdown body with a single
 * trailing newline (POSIX convention, matches 03-02 decision).
 * No I/O is performed here — the handler owns mkdir / writeFile.
 */
export function buildMarkdownMirror(doc: MarkdownDocument): { slug: string; content: string } {
  const slug = urlToSlug(doc.url);
  const content = buildFrontmatter(doc) + doc.markdown.trimEnd() + '\n';
  return { slug, content };
}
