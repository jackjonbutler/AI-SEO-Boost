// src/processing/strip.ts
// Chrome stripping via Cheerio. Removes navigation, layout, and script elements,
// absolutises all a[href] values, then returns the inner HTML of the main content area.
// CRITICAL: Never import from other src/ subdirectories that import from types/. Only import from types/ directly.

import * as cheerio from 'cheerio';

const CHROME_SELECTORS = [
  'nav', 'header', 'footer', 'aside',
  'script', 'style', 'noscript',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.nav', '.navbar', '.menu', '.sidebar', '.ad', '.advertisement',
  '#nav', '#header', '#footer', '#sidebar',
] as const;

export interface StripResult {
  html: string;
  title: string;
  description: string;
}

export function stripChrome(rawHtml: string, pageUrl?: string): StripResult {
  const $ = cheerio.load(rawHtml);

  // Extract metadata before any removal
  const title = $('title').first().text().trim() || $('h1').first().text().trim() || '';
  const description = $('meta[name="description"]').attr('content') ?? '';

  // Absolutise all a[href] values BEFORE removing chrome elements.
  // This ensures links that survive into the body content are absolute.
  // pageUrl is required for relative links; if absent, remove malformed hrefs silently.
  if (pageUrl) {
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const abs = new URL(href, pageUrl);
        $(el).attr('href', abs.href);
      } catch {
        // Malformed href — remove to avoid broken links in output
        $(el).removeAttr('href');
      }
    });
  }

  // Remove chrome elements after absolutising links
  for (const selector of CHROME_SELECTORS) {
    $(selector).remove();
  }

  // Prefer <main> or <article> for content; fall back to <body>
  const mainEl = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body');

  return {
    html: mainEl.html() ?? '',
    title,
    description,
  };
}
