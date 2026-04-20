# Phase 2: Acquisition Pipeline - Research

**Researched:** 2026-04-20
**Domain:** HTML acquisition, parsing, conversion — Node.js ESM, TypeScript, web crawling
**Confidence:** HIGH (all critical claims verified via official docs or GitHub releases)

---

## Summary

Phase 2 builds a shared acquisition pipeline that is consumed by 5+ MCP tools. Its core job is: accept a local folder path OR a live URL, return an array of typed `MarkdownDocument` objects. The pipeline has two branches — local (walk FS, read HTML files, strip chrome, convert to Markdown) and crawl (fetch pages concurrently, stay on-domain, respect page cap and timeout, convert). Both branches share the same processing layer (`strip.ts`, `convert.ts`).

The standard stack is Cheerio 1.2 (HTML parsing + chrome stripping), Turndown (HTML → Markdown), and p-limit 7 (crawl concurrency). All three are widely verified, actively maintained, and confirmed compatible with the project's Node16 ESM TypeScript configuration. Node.js 18's native `fetch` with `AbortSignal.timeout()` covers HTTP requests without additional dependencies. File system walking uses Node.js built-in `fs.promises.readdir` with `{ recursive: true }` (added Node 18.17, stable in 18.19+).

The charset decision (FOUND-03/04 known concern) is resolved: UTF-8 only is the correct v1 choice. The vast majority of modern websites serve UTF-8. Adding `iconv-lite` is a dependency and complexity cost not justified in v1. Document the limitation clearly and defer charset detection to a future phase.

**Primary recommendation:** Use Cheerio for all HTML parsing and element removal, Turndown for conversion, p-limit 7 for crawl concurrency, and native `fetch` + `AbortSignal.timeout()` for HTTP. No additional HTTP or crawler libraries needed.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cheerio | 1.2.0 | HTML parsing, DOM manipulation, chrome stripping | Industry standard jQuery-like API for server-side HTML; fully TypeScript; actively maintained; parse5-based for spec-compliant parsing |
| turndown | 7.x (latest) | HTML string → Markdown string | Most widely used HTML-to-MD library in JS ecosystem; pluggable rules; `remove()` method eliminates elements before conversion; confirmed by project requirements |
| p-limit | 7.3.0 | Crawl concurrency control | Pure ESM; Node.js 20 required (project uses Node 18+, p-limit 7 requires Node 20 — see note below); ships own TypeScript types |
| Node fetch + AbortSignal | built-in (Node 18+) | HTTP fetching with timeout | No dependency needed; `AbortSignal.timeout(ms)` is now the standard pattern |
| fs.promises.readdir | built-in (Node 18.17+) | Recursive FS walk | Native recursive support added Node 18.17, stable in 18.19+; no glob dependency needed |

**p-limit version note:** p-limit 7.x requires Node.js 20. The project's `engines.node` is `>=18`. Use **p-limit 6.x** (requires Node 18, still pure ESM, same API) to stay within the declared engine range, OR update `engines.node` to `>=20`. p-limit 5.x also works with Node 18. Confirm which version to pin before coding.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/turndown | 5.0.6 | TypeScript types for turndown | Required — turndown ships without built-in types; install as devDependency |
| @types/cheerio | not needed | Types | Cheerio 1.x is fully written in TypeScript; ships its own types |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cheerio | node-html-parser | Faster but less jQuery-API, less robust; cheerio's API is more familiar and better documented |
| turndown | @mozilla/readability + unified/remark | More powerful pipeline but significantly heavier; turndown is simpler and sufficient for this use case |
| p-limit | p-queue | p-queue is more feature-rich (priority queuing) but overkill for a simple page cap + concurrency limit |
| native fetch | node-fetch, got, axios | Native fetch is available in Node 18+; no extra dependency needed for this use case |
| fs.promises.readdir recursive | glob, readdirp | Both valid but add dependencies; native recursive readdir sufficient for walking HTML files |

**Installation:**
```bash
npm install cheerio turndown
npm install --save-dev @types/turndown
# p-limit: choose version based on Node engine target
npm install p-limit@6   # if keeping engines.node >=18
# OR
npm install p-limit     # if updating engines.node to >=20
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── types/
│   └── index.ts          # MarkdownDocument interface added here (leaf node — no local imports)
├── acquisition/
│   ├── local.ts          # walkHtmlFiles() + acquireLocal()
│   └── crawl.ts          # crawlUrl() with p-limit + AbortSignal
├── processing/
│   ├── strip.ts          # cheerio chrome stripping — returns cleaned HTML string
│   └── convert.ts        # turndown conversion — returns Markdown string + extracts metadata
└── tools/
    └── index.ts          # Tools import from acquisition/ only; never import processing/ directly
```

### Pattern 1: MarkdownDocument Type (leaf node)

**What:** A shared interface in `src/types/index.ts` representing a processed page.
**When to use:** All acquisition outputs, all tool inputs.

```typescript
// src/types/index.ts — add to existing file
// Source: phase requirements + standard frontmatter fields

export interface MarkdownDocument {
  /** Absolute URL this document was sourced from. For local files, use file:// URI. */
  url: string;
  /** Page title extracted from <title> or <h1>. */
  title: string;
  /** Meta description content if present. */
  description?: string;
  /** Markdown body content with chrome stripped. */
  markdown: string;
  /** YAML frontmatter fields as a plain object (title, url, description). */
  frontmatter: Record<string, string>;
  /** Source type — allows tools to vary behaviour. */
  source: 'local' | 'crawl';
}

export interface AcquisitionError {
  url: string;
  error: string;
  source: 'local' | 'crawl';
}

export type AcquisitionResult = MarkdownDocument | AcquisitionError;

// Type guard
export function isAcquisitionError(r: AcquisitionResult): r is AcquisitionError {
  return 'error' in r;
}
```

### Pattern 2: Chrome Stripping with Cheerio

**What:** Load raw HTML into Cheerio, remove navigation/header/footer/scripts/ads, return cleaned HTML string for Turndown.
**When to use:** In `src/processing/strip.ts`, called by both local and crawl pipelines.

```typescript
// src/processing/strip.ts
// Source: cheerio.js.org API docs (verified 2026-04-20)
import * as cheerio from 'cheerio';

const CHROME_SELECTORS = [
  'nav', 'header', 'footer', 'aside',
  'script', 'style', 'noscript',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.nav', '.navbar', '.menu', '.sidebar', '.ad', '.advertisement',
  '#nav', '#header', '#footer', '#sidebar',
];

export function stripChrome(rawHtml: string): { html: string; title: string; description: string } {
  const $ = cheerio.load(rawHtml);

  // Extract metadata before stripping
  const title = $('title').first().text().trim() || $('h1').first().text().trim();
  const description = $('meta[name="description"]').attr('content') ?? '';

  // Remove chrome elements
  for (const selector of CHROME_SELECTORS) {
    $(selector).remove();
  }

  // Get main content — prefer <main> or <article>, fall back to <body>
  const mainEl = $('main').first().length ? $('main').first() :
                 $('article').first().length ? $('article').first() :
                 $('body');

  return {
    html: mainEl.html() ?? '',
    title,
    description,
  };
}
```

### Pattern 3: HTML → Markdown with Turndown

**What:** Convert cleaned HTML string to Markdown using Turndown.
**When to use:** In `src/processing/convert.ts`, after `strip.ts`.

```typescript
// src/processing/convert.ts
// Source: github.com/mixmark-io/turndown README (verified 2026-04-20)
import TurndownService from 'turndown';

const td = new TurndownService({
  headingStyle: 'atx',        // # H1, ## H2 etc
  codeBlockStyle: 'fenced',   // ``` code fences
  bulletListMarker: '-',
});

// Remove elements turndown would otherwise stringify (e.g. forms, buttons)
td.remove(['form', 'button', 'input', 'select', 'textarea', 'iframe', 'figure > figcaption + *']);

export function convertToMarkdown(cleanHtml: string): string {
  return td.turndown(cleanHtml);
}
```

### Pattern 4: Local Acquisition

**What:** Walk a folder for `.html` files, read each, strip + convert, return `AcquisitionResult[]`.
**When to use:** In `src/acquisition/local.ts`.

```typescript
// src/acquisition/local.ts
// Source: Node.js docs — fs.promises.readdir recursive (Node 18.17+)
import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { stripChrome } from '../processing/strip.js';
import { convertToMarkdown } from '../processing/convert.js';
import { AcquisitionResult, MarkdownDocument, AcquisitionError } from '../types/index.js';

export async function acquireLocal(folderPath: string): Promise<AcquisitionResult[]> {
  // recursive: true added in Node 18.17, stable in 18.19
  const entries = await fs.readdir(folderPath, { recursive: true });
  const htmlFiles = entries
    .filter(e => typeof e === 'string' && e.endsWith('.html'))
    .map(e => path.join(folderPath, e));

  const results: AcquisitionResult[] = [];

  for (const filePath of htmlFiles) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const fileUrl = pathToFileURL(filePath).href;
      const { html, title, description } = stripChrome(raw);
      const markdown = convertToMarkdown(html);

      const doc: MarkdownDocument = {
        url: fileUrl,
        title,
        description,
        markdown,
        frontmatter: { title, url: fileUrl, description },
        source: 'local',
      };
      results.push(doc);
    } catch (err) {
      const error: AcquisitionError = {
        url: pathToFileURL(filePath).href,
        error: err instanceof Error ? err.message : String(err),
        source: 'local',
      };
      results.push(error);
    }
  }

  return results;
}
```

### Pattern 5: URL Crawl Acquisition

**What:** BFS crawl starting from a seed URL. Stay same-domain. Respect page cap and per-request timeout. Concurrent fetches via p-limit. Return `AcquisitionResult[]`.
**When to use:** In `src/acquisition/crawl.ts`.

```typescript
// src/acquisition/crawl.ts
// Source: MDN AbortSignal.timeout() + p-limit README + Node.js URL API
import pLimit from 'p-limit';
import * as cheerio from 'cheerio';
import { stripChrome } from '../processing/strip.js';
import { convertToMarkdown } from '../processing/convert.js';
import { AcquisitionResult, MarkdownDocument, AcquisitionError } from '../types/index.js';

export interface CrawlOptions {
  pageCap: number;        // hard max pages to fetch (e.g. 50)
  concurrency: number;    // simultaneous requests (e.g. 3)
  timeoutMs: number;      // per-request timeout (e.g. 10000)
}

export async function crawlUrl(
  seedUrl: string,
  opts: CrawlOptions
): Promise<AcquisitionResult[]> {
  const base = new URL(seedUrl);
  const baseDomain = base.hostname;

  const visited = new Set<string>([seedUrl]);
  const queue: string[] = [seedUrl];
  const results: AcquisitionResult[] = [];
  const limit = pLimit(opts.concurrency);

  while (queue.length > 0 && results.length < opts.pageCap) {
    // Take a batch up to concurrency
    const batch = queue.splice(0, opts.concurrency);
    const batchResults = await Promise.all(
      batch.map(url => limit(() => fetchPage(url, baseDomain, opts.timeoutMs)))
    );

    for (const item of batchResults) {
      if (results.length >= opts.pageCap) break;
      results.push(item.result);

      // Enqueue discovered links (same-domain, not yet visited)
      for (const link of item.discoveredLinks) {
        if (!visited.has(link) && results.length + queue.length < opts.pageCap) {
          visited.add(link);
          queue.push(link);
        }
      }
    }
  }

  return results;
}

async function fetchPage(
  url: string,
  baseDomain: string,
  timeoutMs: number
): Promise<{ result: AcquisitionResult; discoveredLinks: string[] }> {
  try {
    // AbortSignal.timeout() — modern pattern, no AbortController boilerplate needed
    // Source: MDN AbortSignal.timeout_static (verified 2026-04-20)
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!res.ok) {
      return {
        result: { url, error: `HTTP ${res.status}`, source: 'crawl' } as AcquisitionError,
        discoveredLinks: [],
      };
    }

    const raw = await res.text();
    const { html, title, description } = stripChrome(raw);
    const markdown = convertToMarkdown(html);

    // Discover links before stripping (from raw HTML)
    const discoveredLinks = extractSameDomainLinks(raw, url, baseDomain);

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
    return {
      result: { url, error: errorMsg, source: 'crawl' } as AcquisitionError,
      discoveredLinks: [],
    };
  }
}

function extractSameDomainLinks(html: string, pageUrl: string, baseDomain: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      // Resolve relative URLs against the page URL — makes all links absolute
      const abs = new URL(href, pageUrl);
      // Only follow same-domain HTTP/S links
      if (abs.hostname === baseDomain && (abs.protocol === 'http:' || abs.protocol === 'https:')) {
        // Normalise: strip hash fragment, keep path + query
        abs.hash = '';
        links.push(abs.href);
      }
    } catch {
      // Malformed href — skip silently
    }
  });

  return [...new Set(links)];
}
```

### Pattern 6: URL Absolutisation

**What:** Ensure all hrefs in returned MarkdownDocument content are absolute.
**When to use:** Applied in `convert.ts` or as a post-processing step after Turndown.

The crawl pipeline already produces absolute links in discovered links (via `new URL(href, pageUrl)`). For markdown body content, Turndown preserves href values from the HTML it receives. Strip relative hrefs from the HTML before Turndown using Cheerio:

```typescript
// In strip.ts, after removing chrome — make all a[href] absolute
$('a[href]').each((_, el) => {
  const href = $(el).attr('href');
  if (!href) return;
  try {
    const abs = new URL(href, pageUrl);  // pageUrl passed in as parameter
    $(el).attr('href', abs.href);
  } catch {
    $(el).removeAttr('href');
  }
});
```

Note: `stripChrome` needs to accept `pageUrl?: string` to enable this. For local files, pass the `file://` URI.

### Anti-Patterns to Avoid

- **Importing processing/ from tools/directly:** Tools should only `import` from `acquisition/`. The pipeline encapsulates processing.
- **Throwing on page failure:** A single bad page must produce an `AcquisitionError` entry, not crash the whole pipeline. Wrap every page in try/catch.
- **Reusing the Turndown instance per call:** The TurndownService instance is safe to reuse (it's stateless after construction). Create once at module level — not inside the conversion function.
- **Using `recursive: true` with `withFileTypes: true` simultaneously:** There was a Node.js bug (fixed in 18.19) where combining both options loses entries. Use `recursive: true` only, then check extension with `.endsWith('.html')`.
- **Fetching discovered links before checking the page cap:** Always check `results.length < pageCap` before adding to queue and before processing batch results.
- **Using a single global AbortController for all crawl pages:** Each fetch needs its own `AbortSignal.timeout(ms)` so a slow page doesn't cancel others.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parsing | Custom regex HTML parser | cheerio | HTML is not regular; regex breaks on nested tags, attributes with quotes, self-closing tags, charset encoding edge cases |
| HTML → Markdown conversion | String replacement for headers/links/lists | turndown | Dozens of edge cases: nested lists, code blocks, tables, HTML entities, escaping Markdown special chars |
| Concurrency limiting | Manual Promise queue with counters | p-limit | Race conditions in naive queue; p-limit handles backpressure correctly with tested edge cases |
| HTTP timeout | Manual `setTimeout` + AbortController | `AbortSignal.timeout()` | The static method handles cleanup automatically; manual patterns often leak the timeout if the request resolves first |
| Relative URL resolution | String manipulation / regex | `new URL(href, baseUrl)` | URL spec edge cases: protocol-relative (`//`), root-relative (`/path`), query-only (`?q=1`), fragment-only (`#x`) — URL constructor handles all of them |
| Same-domain detection | String prefix matching | `new URL(href).hostname === baseDomain` | String prefix on `https://example.com` wrongly accepts `https://example.com.evil.com`; hostname comparison is correct |

**Key insight:** HTML and URL parsing both have enormous spec surface areas. Every hand-rolled solution found in the wild has at least one category of inputs that breaks it silently.

---

## Common Pitfalls

### Pitfall 1: p-limit Version vs Node.js Engine

**What goes wrong:** p-limit 7.x requires Node.js 20. The project's `package.json` declares `"engines": { "node": ">=18" }`. Installing p-limit 7 will work in Node 20 environments but silently fail the engine requirement for Node 18 users.
**Why it happens:** p-limit is a fast-moving ESM-only package that regularly bumps its engine requirement.
**How to avoid:** Pin `p-limit@6` (requires Node 18, same API surface) until `engines.node` is updated to `>=20`.
**Warning signs:** `npm warn EBADENGINE` during install on Node 18.

### Pitfall 2: turndown ESM Import in Node16 Module Mode

**What goes wrong:** Turndown ships as CommonJS. In a Node16 ESM project, importing it with `import TurndownService from 'turndown'` may fail or produce `undefined` depending on TypeScript config.
**Why it happens:** Node16 module resolution distinguishes CJS and ESM packages. `esModuleInterop: true` in tsconfig enables default import of CJS modules, which the project already has set.
**How to avoid:** The project's `esModuleInterop: true` makes `import TurndownService from 'turndown'` work correctly. Verify at build time with `tsc --noEmit`.
**Warning signs:** `TypeError: TurndownService is not a constructor` at runtime.

### Pitfall 3: Cheerio load() vs fromURL()

**What goes wrong:** Cheerio 1.x added a `fromURL()` method that fetches and parses in one call. Using it in the crawl pipeline bypasses the project's concurrency control (p-limit) and AbortSignal timeout.
**Why it happens:** `fromURL()` uses its own internal fetch with no configurable timeout or concurrency.
**How to avoid:** Always use `cheerio.load(htmlString)` after fetching with the project's own fetch+timeout pattern. Never use `fromURL()` in the acquisition pipeline.
**Warning signs:** Crawl hangs indefinitely on slow pages; page cap not respected.

### Pitfall 4: fs.readdir recursive + withFileTypes Bug

**What goes wrong:** On Node.js 18.17.x–18.18.x, using `{ recursive: true, withFileTypes: true }` together causes some directory entries to go missing silently.
**Why it happens:** Bug in the recursive readdir implementation, fixed in 18.19.0.
**How to avoid:** Use `{ recursive: true }` only (returns string paths). Filter by extension with `.endsWith('.html')`. The project's `engines.node >=18` allows 18.17, so don't combine both options.
**Warning signs:** Folder walk returns fewer files than expected on older Node 18 patch versions.

### Pitfall 5: Absolute URL Requirement Not Enforced

**What goes wrong:** Returned `MarkdownDocument.markdown` contains relative hrefs like `/about` or `../contact`. Downstream tools (sitemap generator, mirror generator) produce broken links.
**Why it happens:** Turndown faithfully converts whatever `href` value is in the HTML. If `stripChrome` doesn't absolutise links first, relative hrefs pass through.
**How to avoid:** `stripChrome` must accept a `pageUrl` parameter and rewrite all `a[href]` to absolute using `new URL(href, pageUrl)` before returning the HTML string.
**Warning signs:** Generated sitemap contains relative URLs; markdown mirrors have broken links.

### Pitfall 6: Crawl Visiting Same URL Multiple Times

**What goes wrong:** Two pages both link to `/about`. The crawler fetches `/about` twice, doubling content and wasting the page cap.
**Why it happens:** Links are added to the queue before deduplication.
**How to avoid:** Maintain a `visited` Set. Add to queue only if `!visited.has(url)`. Add to `visited` when enqueueing (not when fetching) to prevent race conditions with concurrent batches.
**Warning signs:** Duplicate `MarkdownDocument` entries with same URL in output array.

### Pitfall 7: iconv-lite Unnecessary Complexity

**What goes wrong:** Adding `iconv-lite` for charset detection introduces: a) a native dependency, b) a need to detect charset from HTTP headers AND `<meta charset>` tags (two different sources that can disagree), c) streaming complexity.
**Why it happens:** Temptation to handle edge cases before they're needed.
**How to avoid:** Use `res.text()` in Node native fetch — it reads `Content-Type` charset header and defaults to UTF-8. This handles the 95%+ of modern sites correctly. Document "UTF-8 only" as v1 limitation. Add `iconv-lite` only in a future phase if non-UTF-8 pages are reported.
**Warning signs:** Garbled characters on pages served with `charset=windows-1252` — but this is acceptable v1 behaviour.

---

## Code Examples

Verified patterns from official sources:

### AbortSignal.timeout() — Per-request timeout

```typescript
// Source: MDN Web Docs — AbortSignal: timeout() static method
// https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
const res = await fetch(url, {
  signal: AbortSignal.timeout(10_000),  // 10s timeout; throws TimeoutError on expiry
});
// Throws DOMException with name "TimeoutError" on timeout
// Throws DOMException with name "AbortError" on manual abort
```

### Cheerio — Load, strip, get HTML

```typescript
// Source: cheerio.js.org docs (verified 2026-04-20)
import * as cheerio from 'cheerio';

const $ = cheerio.load(rawHtml);
$('nav, header, footer, script, style').remove();
const bodyHtml = $('main').html() ?? $('body').html() ?? '';
const title = $('title').text().trim();
const metaDesc = $('meta[name="description"]').attr('content') ?? '';
```

### Turndown — HTML string to Markdown

```typescript
// Source: github.com/mixmark-io/turndown README
import TurndownService from 'turndown';

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
td.remove(['script', 'style', 'form']);  // additional elements to drop entirely
const markdown = td.turndown(cleanHtml);
```

### p-limit — Bounded concurrency

```typescript
// Source: github.com/sindresorhus/p-limit README (v6/v7 API identical)
import pLimit from 'p-limit';

const limit = pLimit(3);  // max 3 concurrent
const results = await Promise.all(
  urls.map(url => limit(() => fetchPage(url)))
);
```

### URL — Resolve relative to absolute + hostname check

```typescript
// Source: Node.js URL API (built-in, no import needed in Node 18+)
// Handles protocol-relative, root-relative, relative, fragment-only hrefs
const abs = new URL('/about', 'https://example.com');
// abs.href === 'https://example.com/about'

// Safe same-domain check (string prefix is NOT safe)
const isSameDomain = new URL(link).hostname === new URL(seed).hostname;
```

### fs.promises.readdir recursive

```typescript
// Source: Node.js v18.17+ (confirmed added in 18.17, stable 18.19)
import { promises as fs } from 'fs';

const entries = await fs.readdir(folderPath, { recursive: true });
// entries: string[] — relative paths from folderPath root
const htmlFiles = entries.filter(e => e.endsWith('.html'));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` library for HTTP | Native `fetch` in Node.js | Node 18 (2022) | No dependency needed |
| `AbortController` + `setTimeout` for timeout | `AbortSignal.timeout(ms)` static method | Node 17.3+ (2022) | Simpler, no cleanup leak |
| Custom recursive readdir | `fs.promises.readdir({ recursive: true })` | Node 18.17 (2023) | No dependency, built-in |
| `cheerio.load()` only | `cheerio.loadBuffer()`, `cheerio.fromURL()` added | Cheerio 1.0 (2024) | Do NOT use fromURL in pipeline (see pitfalls) |
| `require('cheerio')` + separate `@types` | `import * as cheerio from 'cheerio'` (built-in types) | Cheerio 1.0 (2024) | No `@types/cheerio` needed |

**Deprecated/outdated:**
- `node-fetch`: Still works but no longer needed in Node 18+; adds a dependency with no benefit
- `request` / `request-promise`: Fully deprecated; do not use
- Cheerio's direct call as function (pre-1.0): Must now use `cheerio.load()` explicitly
- `@types/cheerio`: Not needed — Cheerio 1.x ships TypeScript types natively

---

## Open Questions

1. **p-limit version pin**
   - What we know: p-limit 7.x requires Node 20; project declares `>=18`; p-limit 6.x has identical API and requires Node 18
   - What's unclear: Whether `engines.node` will be updated to `>=20` in this phase or deferred
   - Recommendation: Pin `p-limit@6` now; update engine range when Node 20 is confirmed as minimum

2. **CrawlOptions defaults for MCP tools**
   - What we know: Requirements mention "configured page cap" and "timeout"; no default values specified in FOUND-04
   - What's unclear: What numbers to use as defaults (e.g. pageCap=50, concurrency=3, timeoutMs=10000)
   - Recommendation: Define sensible defaults in `crawl.ts` and document them; let MCP tool parameters override

3. **Cheerio vs Turndown for link absolutisation**
   - What we know: Both can rewrite hrefs; Cheerio is cleaner for DOM manipulation before conversion
   - What's unclear: Whether Turndown custom rules could handle this instead
   - Recommendation: Do it in Cheerio's `stripChrome` function (before Turndown sees the HTML); simpler and more reliable

---

## Sources

### Primary (HIGH confidence)
- cheerio.js.org official docs + blog post "Cheerio 1.0 Released" — confirmed v1.2.0, load() API, remove() API, TypeScript native types
- github.com/sindresorhus/p-limit releases page — confirmed v7.3.0, Node 20 requirement, v6 Node 18 requirement, ESM-only, TypeScript bundled
- github.com/mixmark-io/turndown README — confirmed plugin API, remove() method, ESM import, GFM plugin
- MDN Web Docs — AbortSignal.timeout() static method (confirmed pattern)
- github.com/nodejs/node issue #48640 and #48858 — confirmed recursive readdir bug and fix version (18.19)
- npm search results confirming current versions: cheerio 1.2.0, p-limit 7.3.0, @types/turndown 5.0.6

### Secondary (MEDIUM confidence)
- Node.js commit `439ea47` — confirms recursive readdir added, corroborated by issue thread discussion
- Multiple blog posts (AppSignal, BetterStack, MDN) confirming `AbortSignal.timeout()` as current standard pattern

### Tertiary (LOW confidence)
- WebSearch results on iconv-lite vs UTF-8 — general guidance; not a blocking concern for v1 scope
- WebSearch results on same-domain crawl patterns — standard URL API usage confirmed by Node.js docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via GitHub releases and official docs for all four libraries
- Architecture: HIGH — patterns derived directly from official APIs; code examples use verified method signatures
- Pitfalls: HIGH for p-limit version, cheerio.fromURL, readdir bug (all verified via official sources); MEDIUM for iconv-lite (pragmatic v1 call)

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable libraries; p-limit version situation could change if Node engine range is updated)
