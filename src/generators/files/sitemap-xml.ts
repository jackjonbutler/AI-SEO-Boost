// src/generators/files/sitemap-xml.ts
// Pure sitemap builder — zero I/O, deterministic output.
// Emits sitemaps.org 0.9 compliant XML with priority scoring:
//   1.0 — home page (/)
//   0.9 — service keywords (service, wrap, tint, install, repair, product, offering)
//   0.8 — info keywords at depth 1 (about, faq, pricing, price, contact, location, gallery)
//   0.7 — everything else

import path from 'node:path';
import type { MarkdownDocument } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/** Escape XML special characters. & MUST be replaced first to avoid double-escaping. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normalise a doc URL to an absolute https:// URL relative to baseUrl.
 * file:// URLs are rebased onto baseUrl using the last path segment.
 */
function resolveToAbsolute(docUrl: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const u = new URL(docUrl);

  if (u.protocol === 'file:') {
    const pathname = u.pathname;
    // Home case: ends with /index.html or is just /
    if (pathname === '/' || pathname.endsWith('/index.html') || pathname === '/index.html') {
      return `${base}/`;
    }
    // Strip .html/.htm extension, use basename only
    const basename = path.basename(pathname).replace(/\.html?$/, '');
    if (!basename || basename === 'index') {
      return `${base}/`;
    }
    return `${base}/${basename}`;
  }

  // http: or https: — already absolute
  return docUrl;
}

/**
 * Score URL priority per phase spec.
 * Operates on the resolved absolute URL so it always sees https:// protocol.
 */
function scorePriority(pageUrl: string): number {
  const pathname = new URL(pageUrl).pathname;
  const segments = pathname.split('/').filter(Boolean);

  // Home page
  if (segments.length === 0) return 1.0;

  const slug = segments.join('/').toLowerCase();

  const serviceKeywords = ['service', 'wrap', 'tint', 'install', 'repair', 'product', 'offering'];
  if (serviceKeywords.some(kw => slug.includes(kw))) return 0.9;

  const infoKeywords = ['about', 'faq', 'pricing', 'price', 'contact', 'location', 'gallery'];
  if (segments.length === 1 && infoKeywords.some(kw => slug.includes(kw))) return 0.8;

  return 0.7;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a sitemaps.org 0.9 compliant XML sitemap string from an array of
 * MarkdownDocuments and a canonical base URL.
 *
 * Pure function — no I/O, no side effects. Caller writes the file.
 */
export function buildSitemapXml(docs: MarkdownDocument[], baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const urlEntries = docs.map(doc => {
    const resolved = resolveToAbsolute(doc.url, base);
    const loc = escapeXml(resolved);
    const priority = scorePriority(resolved).toFixed(1);
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries,
    '</urlset>',
  ].join('\n');

  return xml.trimEnd() + '\n';
}
