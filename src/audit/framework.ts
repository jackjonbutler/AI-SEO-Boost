// src/audit/framework.ts
// Framework detection — pure function over HTML + HTTP headers.
// No I/O in detectFramework(). I/O lives only in fetchAndDetectFramework().

import * as cheerio from 'cheerio';
import type { FrameworkDetection, FrameworkConfidence } from './types.js';
import { isUrl } from './types.js';

// ---------------------------------------------------------------------------
// Signal map
// ---------------------------------------------------------------------------

interface FrameworkSignals {
  /** 'strong' signals are distinctive enough that one alone gives 'medium' confidence. */
  strong: Array<(html: string, headers: Headers) => boolean>;
  /** 'weak' signals require pairing with at least one other to reach 'medium'. */
  weak: Array<(html: string, headers: Headers) => boolean>;
}

const FRAMEWORK_SIGNALS: Record<string, FrameworkSignals> = {
  'Next.js': {
    strong: [
      (html) => html.includes('__NEXT_DATA__'),          // <script id="__NEXT_DATA__">
      (html) => html.includes('/_next/static/'),         // Asset path in <link> or <script src>
    ],
    weak: [
      (_, h) => (h.get('x-powered-by') ?? '').toLowerCase().includes('next'),
      (html) => html.includes('__next_f'),               // React Server Components build artifact
    ],
  },
  'Nuxt': {
    strong: [
      (html) => html.includes('/_nuxt/'),                // Asset path in <link> or <script src>
      (html) => html.includes('window.__nuxt'),          // Nuxt hydration payload
    ],
    weak: [
      (_, h) => (h.get('x-powered-by') ?? '').toLowerCase().includes('nuxt'),
      (html) => html.includes('$nuxt'),
    ],
  },
  'Astro': {
    strong: [
      (html) => html.includes('/_astro/'),               // Asset path (Astro's dedicated CDN prefix)
      (html) => html.includes('astro-island'),           // Astro island component custom element
    ],
    weak: [
      (_, h) => (h.get('x-powered-by') ?? '').toLowerCase().includes('astro'),
    ],
  },
  'WordPress': {
    strong: [
      (html) => html.includes('/wp-content/'),           // Plugin/theme asset paths
      (html) => html.includes('/wp-json/'),              // REST API links in HTML
    ],
    weak: [
      (html) => {
        const $ = cheerio.load(html);
        const gen = $('meta[name="generator"]').attr('content') ?? '';
        return gen.toLowerCase().startsWith('wordpress');
      },
      (html) => html.includes('/wp-includes/'),          // Core WordPress script paths
    ],
  },
  'Shopify': {
    strong: [
      (html) => html.includes('cdn.shopify.com'),        // Shopify CDN
      (html) => html.includes('Shopify.theme'),          // Shopify.theme JS object
    ],
    weak: [
      (html) => html.includes('shopify-digital-wallet'), // Shopify meta tag
      (_, h) => (h.get('x-sorting-hat-shopid') ?? '') !== '', // Shopify infra header
    ],
  },
  'Hugo': {
    strong: [],
    weak: [
      (html) => {
        const $ = cheerio.load(html);
        const gen = $('meta[name="generator"]').attr('content') ?? '';
        return gen.toLowerCase().startsWith('hugo');
      },
    ],
  },
  'Jekyll': {
    strong: [],
    weak: [
      (html) => {
        const $ = cheerio.load(html);
        const gen = $('meta[name="generator"]').attr('content') ?? '';
        return gen.toLowerCase().startsWith('jekyll');
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Pure detection function — no I/O
// ---------------------------------------------------------------------------

/**
 * Detect the web framework from raw HTML + HTTP headers.
 * Pure function — no I/O. Caller fetches the HTML.
 *
 * Confidence rules (FWK-03):
 *  - 'high'   → 2+ independent signals matched (totalSignals >= 2)
 *  - 'medium' → exactly 1 strong signal matched
 *  - 'low'    → exactly 1 weak signal matched (no strong signals)
 *  - 'none'   → no signals matched (null name)
 */
export function detectFramework(html: string, headers: Headers): FrameworkDetection {
  // Score each framework: { strongCount, weakCount }
  const scores: Record<string, { strong: number; weak: number }> = {};

  for (const [name, signals] of Object.entries(FRAMEWORK_SIGNALS)) {
    const strongMatches = signals.strong.filter(fn => fn(html, headers)).length;
    const weakMatches = signals.weak.filter(fn => fn(html, headers)).length;
    if (strongMatches > 0 || weakMatches > 0) {
      scores[name] = { strong: strongMatches, weak: weakMatches };
    }
  }

  if (Object.keys(scores).length === 0) {
    return { name: null, confidence: 'none' };
  }

  // Pick the framework with the most signals (strong weighted 2x for tie-breaking)
  const ranked = Object.entries(scores).sort(([, a], [, b]) => {
    const aScore = a.strong * 2 + a.weak;
    const bScore = b.strong * 2 + b.weak;
    return bScore - aScore;
  });

  const [topName, topScore] = ranked[0];
  const totalSignals = topScore.strong + topScore.weak;

  // FWK-03: 'high' requires 2+ independent signals
  let confidence: FrameworkConfidence;
  if (totalSignals >= 2) {
    confidence = 'high';
  } else if (topScore.strong >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { name: topName, confidence };
}

// ---------------------------------------------------------------------------
// I/O wrapper — used by runAudit()
// ---------------------------------------------------------------------------

/**
 * Fetch the target URL and detect the web framework from the response.
 * Returns null when:
 *  - target is not a URL (local file-system path)
 *  - fetch fails for any reason (network error, timeout, etc.)
 *
 * NEVER throws — safe for inclusion in runAudit()'s Promise.all.
 */
export async function fetchAndDetectFramework(target: string): Promise<FrameworkDetection | null> {
  if (!isUrl(target)) return null;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();
    return detectFramework(html, res.headers);
  } catch {
    return null;
  }
}
