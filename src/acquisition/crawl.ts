// src/acquisition/crawl.ts
// BFS URL crawler with p-limit concurrency, AbortSignal.timeout() per-request,
// hard page cap, same-domain filtering, and error-safe page processing.
//
// Design decisions (documented per RESEARCH.md):
// - p-limit@6 (NOT 7) — Node 18 compat; identical API
// - AbortSignal.timeout(ms) per fetch — NOT a shared controller; each request independent
// - visited Set updated at enqueue time — prevents duplicate fetches in concurrent batches
// - Never use cheerio.fromURL() — bypasses p-limit and AbortSignal entirely
// - All errors produce AcquisitionError entries — never throw to caller
// Defaults: pageCap=50, concurrency=3, timeoutMs=10000

import pLimit from 'p-limit';
import * as cheerio from 'cheerio';
import { stripChrome } from '../processing/strip.js';
import { convertToMarkdown } from '../processing/convert.js';
import type { AcquisitionResult, MarkdownDocument, AcquisitionError } from '../types/index.js';

export interface CrawlOptions {
  /** Hard maximum number of pages to fetch and return. Default: 50. */
  pageCap: number;
  /** Maximum simultaneous HTTP requests. Default: 3. */
  concurrency: number;
  /** Per-request timeout in milliseconds. Default: 10000. */
  timeoutMs: number;
}

/** Default CrawlOptions values — MCP tool parameters override these. */
export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  pageCap: 50,
  concurrency: 3,
  timeoutMs: 10_000,
};

export async function crawlUrl(
  seedUrl: string,
  opts: CrawlOptions = DEFAULT_CRAWL_OPTIONS,
): Promise<AcquisitionResult[]> {
  const base = new URL(seedUrl);
  const baseDomain = base.hostname;

  // visited tracks URLs at ENQUEUE time — prevents duplicates across concurrent batches
  const visited = new Set<string>([seedUrl]);
  const queue: string[] = [seedUrl];
  const results: AcquisitionResult[] = [];
  const limit = pLimit(opts.concurrency);

  while (queue.length > 0 && results.length < opts.pageCap) {
    // Take up to `concurrency` URLs from the front of the queue
    const batchSize = Math.min(opts.concurrency, queue.length, opts.pageCap - results.length);
    const batch = queue.splice(0, batchSize);

    const batchResults = await Promise.all(
      batch.map(url => limit(() => fetchPage(url, baseDomain, opts.timeoutMs))),
    );

    for (const item of batchResults) {
      if (results.length >= opts.pageCap) break;
      results.push(item.result);

      // Enqueue new same-domain links discovered on this page
      for (const link of item.discoveredLinks) {
        if (!visited.has(link) && results.length + queue.length < opts.pageCap) {
          visited.add(link); // Add at enqueue time — not at fetch time
          queue.push(link);
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers — not exported; tools import from acquisition/ only
// ---------------------------------------------------------------------------

interface FetchPageResult {
  result: AcquisitionResult;
  discoveredLinks: string[];
}

async function fetchPage(
  url: string,
  baseDomain: string,
  timeoutMs: number,
): Promise<FetchPageResult> {
  try {
    // AbortSignal.timeout() — each call is independent; a timeout on one fetch
    // does not affect other concurrent fetches.
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!res.ok) {
      const error: AcquisitionError = { url, error: `HTTP ${res.status}`, source: 'crawl' };
      return { result: error, discoveredLinks: [] };
    }

    const raw = await res.text();

    // Discover links from raw HTML BEFORE stripping — chrome elements (nav, header)
    // often contain the most internal links.
    const discoveredLinks = extractSameDomainLinks(raw, url, baseDomain);

    const { html, title, description } = stripChrome(raw, url);
    const markdown = convertToMarkdown(html);

    const doc: MarkdownDocument = {
      url,
      title,
      description,
      markdown,
      frontmatter: { title, url, description },
      source: 'crawl',
    };

    return { result: doc, discoveredLinks };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const error: AcquisitionError = { url, error: errorMsg, source: 'crawl' };
    return { result: error, discoveredLinks: [] };
  }
}

function extractSameDomainLinks(html: string, pageUrl: string, baseDomain: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      // new URL(href, pageUrl) handles: protocol-relative (//), root-relative (/path),
      // relative (../page), query-only (?q=1), fragment-only (#x) — all correctly
      const abs = new URL(href, pageUrl);

      // Same-domain check: compare hostname (NOT string prefix — prefix is unsafe)
      // e.g. 'example.com.evil.com' would pass a prefix check but fails hostname check
      if (
        abs.hostname === baseDomain &&
        (abs.protocol === 'http:' || abs.protocol === 'https:')
      ) {
        // Normalise: strip fragment to avoid fetching same page twice with different anchors
        abs.hash = '';
        links.push(abs.href);
      }
    } catch {
      // Malformed href — skip silently
    }
  });

  // Deduplicate within this page's link list before returning to caller
  return [...new Set(links)];
}
