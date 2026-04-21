// src/audit/dimensions/markdown.ts
// Checks whether a site exposes markdown mirror files.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as cheerio from 'cheerio';
import { isUrl, originFor } from '../types.js';
import type { AuditFinding, FrameworkDetection } from '../types.js';

function buildMarkdownPlacementNote(fw: FrameworkDetection | null | undefined): string {
  if (!fw || !fw.name) return '';
  switch (fw.name) {
    case 'Next.js':
    case 'Nuxt':
    case 'Astro':
      return ' For this framework: generate mirrors into /public/ and redeploy — each page becomes /public/<slug>/index.md.';
    case 'WordPress':
      return ' For WordPress: upload mirrors to your site root via FTP — /wp-content/ is not web-accessible for markdown files by default.';
    case 'Shopify':
      return ' For Shopify: markdown mirrors require a custom route or page template — direct file placement is not supported.';
    case 'Hugo':
    case 'Jekyll':
      return ' Place markdown mirrors in your content or static directory, rebuild, and deploy.';
    default:
      return '';
  }
}

/**
 * Fetches a child sitemap and returns its <url loc> entries.
 * Returns [] on non-200 status or fetch error.
 */
async function fetchUrlsFromSitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
    if (res.status !== 200) return [];
    const xml = await res.text();
    const $ = cheerio.load(xml, { xml: true });
    return $('url loc').map((_, el) => $(el).text().trim()).toArray();
  } catch {
    return [];
  }
}

/**
 * Fetches ${origin}/sitemap.xml and returns all page URLs.
 * Returns null if the sitemap is missing or unreachable (no sitemap / fetch error).
 * Returns [] if the sitemap was found but contains no parseable page URLs.
 * Handles sitemap index files (COV-02): fetches the first child sitemap to get page URLs.
 */
async function fetchSitemapUrls(origin: string): Promise<string[] | null> {
  let res: Response;
  try {
    res = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) });
  } catch {
    return null; // network error / timeout — graceful fallback
  }
  if (res.status !== 200) return null; // 404 or other — no sitemap

  const xml = await res.text();
  const $ = cheerio.load(xml, { xml: true });

  // COV-02: Detect sitemap index (WordPress and large sites use these)
  if ($('sitemapindex').length > 0) {
    const childSitemapUrls = $('sitemap loc').map((_, el) => $(el).text().trim()).toArray();
    if (childSitemapUrls.length === 0) return [];
    return await fetchUrlsFromSitemap(childSitemapUrls[0]);
  }

  // Regular urlset
  return $('url loc').map((_, el) => $(el).text().trim()).toArray();
}

/**
 * Samples up to maxSample URLs from urls, spread evenly across the array.
 * COV-03: cap at 20 probes.
 */
function sampleUrls(urls: string[], maxSample: number): string[] {
  if (urls.length <= maxSample) return urls;
  return Array.from({ length: maxSample }, (_, i) => urls[Math.floor(i * (urls.length / maxSample))]);
}

/**
 * Constructs the .md mirror URL for a given page URL.
 * Home page (pathname === '/') → /index.md
 * All other pages: strips trailing slash, appends /index.md
 */
function toMdUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  const pathname = u.pathname === '/' ? '/index.md' : `${u.pathname.replace(/\/$/, '')}/index.md`;
  return `${u.origin}${pathname}`;
}

/**
 * HEAD-probes the .md mirror of a page URL.
 * Returns true if status === 200, false otherwise.
 */
async function hasMdMirror(pageUrl: string): Promise<boolean> {
  const mdUrl = toMdUrl(pageUrl);
  try {
    const res = await fetch(mdUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function checkMarkdownMirrors(
  target: string,
  framework?: FrameworkDetection | null
): Promise<AuditFinding> {
  const dimension = 'markdown-mirrors' as const;
  try {
    if (isUrl(target)) {
      const MAX_SAMPLE = 20;
      const origin = originFor(target);
      const allSitemapUrls = await fetchSitemapUrls(origin);

      if (allSitemapUrls === null) {
        // null = no sitemap / unreachable — graceful fallback (COV-01, success criterion 4)
        return {
          dimension,
          status: 'warning',
          severity: 'medium',
          message: `No sitemap found at ${origin}/sitemap.xml — mirror coverage cannot be estimated.${buildMarkdownPlacementNote(framework)}`,
          suggestedToolCall: 'generate_markdown_mirrors',
        };
      }

      const sampled = sampleUrls(allSitemapUrls, MAX_SAMPLE);
      const mirrorResults = await Promise.all(sampled.map(url => hasMdMirror(url)));
      const mirrored = mirrorResults.filter(Boolean).length;
      const total = sampled.length;

      if (total === 0) {
        // Sitemap found but has zero parseable URLs
        return {
          dimension,
          status: 'warning',
          severity: 'medium',
          message: `Sitemap found at ${origin}/sitemap.xml but contains no parseable URLs — mirror coverage cannot be estimated.${buildMarkdownPlacementNote(framework)}`,
          suggestedToolCall: 'generate_markdown_mirrors',
        };
      }

      const pct = Math.round((mirrored / total) * 100);
      const coverageLabel = `${mirrored}/${total} sampled URLs have a mirror — estimated ${pct}% coverage`;

      if (pct === 100) {
        return { dimension, status: 'pass', severity: 'low', message: coverageLabel };
      }
      if (pct === 0) {
        return {
          dimension,
          status: 'fail',
          severity: 'medium',
          message: `${coverageLabel}.${buildMarkdownPlacementNote(framework)}`,
          suggestedToolCall: 'generate_markdown_mirrors',
        };
      }
      // 1–99%: partial mirrors → warning
      return {
        dimension,
        status: 'warning',
        severity: 'medium',
        message: `${coverageLabel}.${buildMarkdownPlacementNote(framework)}`,
        suggestedToolCall: 'generate_markdown_mirrors',
      };
    }

    // Local folder: check for index.md or any *.md in root (one-level readdir, not recursive)
    try {
      const entries = await fs.readdir(target);
      const hasMd = entries.some(e => e.endsWith('.md'));
      if (hasMd) {
        return { dimension, status: 'pass', severity: 'low', message: 'Markdown mirror file(s) found in folder root' };
      }
      return {
        dimension,
        status: 'fail',
        severity: 'medium',
        message: `No markdown mirror files found in folder root.${buildMarkdownPlacementNote(framework)}`,
        suggestedToolCall: 'generate_markdown_mirrors',
      };
    } catch (readdirErr) {
      const msg = readdirErr instanceof Error ? readdirErr.message : String(readdirErr);
      return { dimension, status: 'warning', severity: 'medium', message: `Could not read folder for markdown check: ${msg}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { dimension, status: 'warning', severity: 'medium', message: `Unexpected error checking markdown mirrors: ${msg}` };
  }
}
