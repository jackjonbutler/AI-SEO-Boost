# Phase 14: Sitemap Coverage and Mirror Depth - Research

**Researched:** 2026-04-21
**Domain:** XML sitemap parsing, HTTP HEAD probing, AuditFinding extension
**Confidence:** HIGH

## Summary

Phase 14 extends `checkMarkdownMirrors` from a binary home-page pass/fail into a coverage estimator. The function must fetch the site's `sitemap.xml`, parse it (handling both regular sitemaps and sitemap index files), sample up to 15–20 URLs, probe each for a corresponding `.md` mirror, and report an estimated coverage percentage rather than a boolean.

The key technical questions were: (1) does cheerio 1.2.0 support XML mode for sitemap parsing, (2) how to detect and resolve sitemap index files, and (3) where the result lands in the type system. All three are answered with HIGH confidence from direct codebase inspection and live cheerio testing.

Cheerio 1.2.0 (installed) parses both `<urlset>` sitemaps and `<sitemapindex>` index files correctly with `{ xml: true }`. The `AuditDimension` union in `types.ts` needs `'markdown-mirrors'` to stay (it already covers this dimension). `AuditFinding` already has a free-form `message` field and optional `diagnostics`; no new types are needed. The `pagesAudited` field on `AuditReport` already collects probed URLs.

**Primary recommendation:** Extend `checkMarkdownMirrors` with an `estimateSitemapCoverage()` helper that fetches/parses the sitemap, samples URLs, HEAD-probes each for `.md`, and returns a structured result — then fold that into the existing `AuditFinding` message and a new `diagnostics`-style array on the finding.

## Standard Stack

### Core (already installed — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cheerio | 1.2.0 | XML sitemap parsing | Already in project; `{ xml: true }` option confirmed working for both sitemap types |
| fetch (Node 18 built-in) | built-in | Fetch sitemap XML and HEAD-probe mirror URLs | Same pattern used throughout codebase |
| AbortSignal.timeout() | Node 18 built-in | Per-request timeout | Project convention; used in every dimension |

### No new npm packages required

Cheerio with `{ xml: true }` is already proven to handle the sitemap XML formats needed. No new packages needed.

## Architecture Patterns

### Project Structure (existing, unchanged)
```
src/
├── audit/
│   ├── dimensions/
│   │   └── markdown.ts     ← EXTEND THIS FILE only
│   ├── types.ts             ← read only; no changes needed
│   └── index.ts             ← read only; pagesAudited already collects probed URLs
scripts/
└── smoke-phase14-coverage.mjs   ← NEW: regression gate
```

### Pattern 1: Sitemap Fetch + Detect Index vs. Urlset

**What:** Fetch `{origin}/sitemap.xml`, detect if it is a `<sitemapindex>` or `<urlset>`, extract `<loc>` URLs accordingly.
**When to use:** Any URL target — skip silently for local folder targets.

```typescript
// Source: verified against cheerio 1.2.0 dist/esm/index.js
import * as cheerio from 'cheerio';

async function fetchSitemapUrls(origin: string): Promise<string[] | null> {
  const sitemapUrl = `${origin}/sitemap.xml`;
  let res: Response;
  try {
    res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
  } catch {
    return null; // network error / timeout — graceful fallback
  }
  if (res.status !== 200) return null; // 404 or other — no sitemap

  const xml = await res.text();
  const $ = cheerio.load(xml, { xml: true });

  // Detect sitemap index (COV-02: WordPress and large sites use these)
  if ($('sitemapindex').length > 0) {
    // Extract child sitemap URLs; fetch the first one for URL sampling
    const childSitemapUrls = $('sitemap loc').map((_, el) => $(el).text().trim()).toArray();
    // Fetch first child sitemap to gather actual page URLs
    if (childSitemapUrls.length === 0) return [];
    return await fetchUrlsFromSitemap(childSitemapUrls[0]);
  }

  // Regular urlset
  return $('url loc').map((_, el) => $(el).text().trim()).toArray();
}

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
```

### Pattern 2: URL Sampling (COV-03 — cap at 20 probes)

**What:** Pick up to N URLs from the sitemap list, spread across the list to be representative.
**When to use:** Always — prevents MCP timeout regardless of sitemap size.

```typescript
function sampleUrls(urls: string[], maxSample: number): string[] {
  if (urls.length <= maxSample) return urls;
  // Evenly distributed sample: pick indices spread across the array
  const step = urls.length / maxSample;
  return Array.from({ length: maxSample }, (_, i) => urls[Math.floor(i * step)]);
}
```

### Pattern 3: HEAD-probe each sampled URL for `.md` mirror

**What:** For each sampled URL, construct the corresponding `.md` path and HEAD-probe it.
**When to use:** After sampling.

```typescript
function toMdUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  // Home: / → /index.md
  // /about → /about/index.md or /about.md — use /about/index.md (mirrors convention)
  const pathname = u.pathname === '/' ? '/index.md' : `${u.pathname.replace(/\/$/, '')}/index.md`;
  return `${u.origin}${pathname}`;
}

async function hasMdMirror(pageUrl: string): Promise<boolean> {
  const mdUrl = toMdUrl(pageUrl);
  try {
    const res = await fetch(mdUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return res.status === 200;
  } catch {
    return false;
  }
}
```

### Pattern 4: Reporting as AuditFinding (existing type, no changes)

**What:** Express coverage in the `message` field as "N/M sampled URLs have a mirror — estimated X% coverage".
**When to use:** Always when sitemap was found and sampled.

The existing `AuditFinding.message: string` is sufficient. No new type fields are needed.

For `pagesAudited` in `AuditReport`, `checkMarkdownMirrors` does not populate `diagnostics` today (unlike `checkLlmsTxt`). Coverage probed URLs should be surfaced via a new `diagnostics`-compatible mechanism OR simply described in message. Since `AuditFindingDiagnostics` is a single-URL shape and coverage probes multiple URLs, the clearest approach is to keep diagnostics absent and express everything in the message string. The planner can decide whether to add a new optional field.

### Pattern 5: Graceful no-sitemap fallback (COV-01 / success criterion 4)

```typescript
if (sitemapUrls === null) {
  // null means fetch failed or 404
  return {
    dimension,
    status: 'warning',
    severity: 'medium',
    message: 'No sitemap found at /sitemap.xml — mirror coverage cannot be estimated',
    suggestedToolCall: 'generate_markdown_mirrors',
  };
}
```

### Anti-Patterns to Avoid

- **Using `xmlMode: true` (deprecated):** The current cheerio 1.2.0 API uses `{ xml: true }` or `{ xml: { xmlMode: true } }`. The `xmlMode` top-level option is deprecated per cheerio's own type declarations. Use `{ xml: true }`.
- **Fetching all child sitemaps from index:** A sitemap index can have hundreds of child sitemaps. Fetching all of them to count URLs defeats the sampling cap. Fetch only the first child sitemap (or first N entries) to stay within timeout budget.
- **Parallel probing without AbortSignal:** Each HEAD probe must have its own `AbortSignal.timeout()`. A shared controller would cancel all inflight requests on first timeout.
- **Modifying `AuditDimension` type:** The dimension stays `'markdown-mirrors'` — this is an extension of the existing check, not a new dimension.
- **Returning an empty array for pagesAudited:** The existing `runAudit` logic only sets `pagesAudited` when at least one finding has `diagnostics.checkedUrl`. Since `checkMarkdownMirrors` doesn't currently populate `diagnostics`, this phase should not add `diagnostics` to the finding (which would be a single-URL shape and not capture the multi-URL sampling). Probed URLs remain implicit in the message.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XML parsing | Custom regex or string split on `<loc>` tags | `cheerio.load(xml, { xml: true })` | Regex breaks on namespaces, comments, CDATA; cheerio handles all these |
| Sitemap index detection | String includes `'sitemapindex'` | `$('sitemapindex').length > 0` after cheerio parse | Tag detection must survive whitespace/namespace variations |
| Concurrency control for HEAD probes | Custom queue | Sequential HEAD probes with Promise.all for small sample (≤20) | Sample is small enough; p-limit not needed; fewer moving parts |

**Key insight:** Cheerio's `{ xml: true }` mode is already installed and verified to work on both sitemap types. Zero new dependencies.

## Common Pitfalls

### Pitfall 1: Sitemap Index Returning 0 URLs (COV-02 stated problem)
**What goes wrong:** Function loads `<sitemapindex>` XML and queries `$('url loc')` — finds nothing, reports 0 URLs.
**Why it happens:** A sitemap index has `<sitemap><loc>` entries (child sitemaps), not `<url><loc>` entries. The selector `url loc` matches zero elements.
**How to avoid:** After loading, check `$('sitemapindex').length > 0`. If truthy, extract child sitemap URLs from `$('sitemap loc')` and fetch one of them.
**Warning signs:** 0 URLs found on a known large site (WordPress, e-commerce).

### Pitfall 2: Case-sensitive XML tag selectors
**What goes wrong:** Querying `$('URL loc')` or `$('Loc')` returns nothing.
**Why it happens:** XML is case-sensitive; `<url>` != `<URL>`. HTML mode is case-insensitive; XML mode is not.
**How to avoid:** Always use lowercase selectors: `$('url loc')`, `$('sitemap loc')`, `$('sitemapindex')`.
**Warning signs:** Zero results on valid XML.

### Pitfall 3: Mirror URL construction — trailing slash handling
**What goes wrong:** `https://example.com/about/` → probes `/about//index.md` (double slash).
**Why it happens:** Naive string concatenation without stripping trailing slash from pathname.
**How to avoid:** `u.pathname.replace(/\/$/, '')` before appending `/index.md`.
**Warning signs:** All probes return 404 even when mirrors exist.

### Pitfall 4: Fetching sitemap times out in MCP context
**What goes wrong:** Sitemap fetch hangs, causing MCP tool timeout.
**Why it happens:** No per-request timeout or timeout too generous.
**How to avoid:** Use `AbortSignal.timeout(5000)` for sitemap fetch. Use `AbortSignal.timeout(4000)` per HEAD probe. With 20 probes at worst case 4s each = 80s sequential; use `Promise.all` to parallelize. With 20 parallel 4s probes, worst case 4s total for probes + 5s sitemap + 5s child = ~14s. Acceptable.
**Warning signs:** Audit never returns for slow/unreachable sites.

### Pitfall 5: pagesAudited accumulation — don't push sampled URLs into it
**What goes wrong:** Implementation adds all 20 sampled URLs to `diagnostics.checkedUrl`, causing type errors (single string, not array).
**Why it happens:** `AuditFindingDiagnostics.checkedUrl` is typed as `string` (singular), not `string[]`.
**How to avoid:** Do not add `diagnostics` to the `checkMarkdownMirrors` finding unless you add a new field. Coverage results live in `message`. If the planner decides to add a field (e.g. `coverageUrls?: string[]`) to `AuditFinding`, that's a new optional field, not reuse of `diagnostics`.

### Pitfall 6: Sampling with Math.floor produces repeated URLs
**What goes wrong:** `sampleUrls` returns duplicates when `urls.length < maxSample`.
**Why it happens:** Not checking `urls.length <= maxSample` first.
**How to avoid:** Return `urls` directly when length is within cap.

## Code Examples

Verified patterns from direct codebase testing:

### Cheerio XML mode — confirmed working in cheerio 1.2.0
```typescript
// Source: verified live against node_modules/cheerio/dist/esm/index.js
import * as cheerio from 'cheerio';

// Regular sitemap
const $u = cheerio.load('<urlset><url><loc>https://a.com/</loc></url></urlset>', { xml: true });
$u('url loc').length; // → 1

// Sitemap index
const $i = cheerio.load('<sitemapindex><sitemap><loc>https://a.com/sitemap-1.xml</loc></sitemap></sitemapindex>', { xml: true });
$i('sitemapindex').length; // → 1 (detects index)
$i('sitemap loc').map((_, el) => $i(el).text()).toArray(); // → ['https://a.com/sitemap-1.xml']
```

### Existing fetch pattern from checkMarkdownMirrors (same file)
```typescript
// Source: src/audit/dimensions/markdown.ts (existing code)
const res = await fetch(mdUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
```

### Existing AuditFinding return shapes (from codebase)
```typescript
// pass with message string — no diagnostics needed for coverage finding
return { dimension, status: 'pass', severity: 'low', message: '8/20 sampled URLs have a mirror — estimated 40% coverage' };

// warning — no sitemap
return { dimension, status: 'warning', severity: 'medium', message: 'No sitemap found at /sitemap.xml — mirror coverage cannot be estimated' };

// fail — sitemap found but 0% coverage
return { dimension, status: 'fail', severity: 'medium', message: '0/20 sampled URLs have a mirror — estimated 0% coverage', suggestedToolCall: 'generate_markdown_mirrors' };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `xmlMode: true` top-level option | `{ xml: true }` option | cheerio 1.0+ | `xmlMode` still works but deprecated; use `xml` |
| Binary pass/fail on `/index.md` | Coverage % from sitemap sample | Phase 14 | Honest picture of mirror depth |

**Deprecated/outdated:**
- `cheerio.load(xml, { xmlMode: true })`: Still functions but officially deprecated. Use `{ xml: true }` instead.

## Open Questions

1. **Should probed URLs accumulate in `pagesAudited`?**
   - What we know: `pagesAudited` collects `diagnostics.checkedUrl` values; `AuditFindingDiagnostics.checkedUrl` is a single string.
   - What's unclear: Whether the planner wants the 20 probed URLs in `pagesAudited` for transparency.
   - Recommendation: Keep it simple — coverage URLs stay in message only. If needed, add optional `coverageUrls?: string[]` to `AuditFinding` in types.ts. Planner decides.

2. **How many child sitemaps to fetch from a sitemap index?**
   - What we know: Fetching all child sitemaps defeats the cap. Fetching just the first may undercount for WordPress sites.
   - What's unclear: Whether one child sitemap sample is representative enough.
   - Recommendation: Fetch first child sitemap only. If that returns fewer than `maxSample` URLs, optionally fetch a second. Keep total probes <= 20.

3. **Coverage threshold for pass vs. warning vs. fail?**
   - What we know: Phase spec says "estimated X% coverage" label but doesn't define pass thresholds.
   - Recommendation: 0% → fail, 1–99% → warning (partial mirrors), 100% of sampled → pass. Planner confirms thresholds.

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `src/audit/dimensions/markdown.ts` — current implementation confirmed binary HEAD check only
- Direct codebase read: `src/audit/types.ts` — `AuditFinding`, `AuditFindingDiagnostics`, `AuditReport`, `AuditDimension` types confirmed
- Direct codebase read: `src/audit/index.ts` — `pagesAudited` accumulation logic confirmed
- Direct codebase read: `node_modules/cheerio/dist/esm/options.d.ts` — `xml: boolean | HTMLParser2Options` confirmed; `xmlMode` deprecated
- Live execution: `node --input-type=module` test of cheerio 1.2.0 on both `<urlset>` and `<sitemapindex>` XML — both parse correctly with `{ xml: true }`

### Secondary (MEDIUM confidence)
- Existing code pattern in `src/acquisition/crawl.ts` — `AbortSignal.timeout()` per-request convention confirmed
- Existing code patterns in `checkLlmsTxt`, `checkSchemaMarkup`, `checkFaq` — error handling and return shapes confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — cheerio is installed, live-tested on both sitemap formats, no new dependencies needed
- Architecture: HIGH — direct codebase inspection of all affected files; extension point is clear
- Pitfalls: HIGH — pitfalls derived from type definitions and live testing, not speculation

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable stack; cheerio and Node.js built-ins don't change rapidly)
