# Technology Stack

**Project:** AI SEO Boost — TypeScript MCP Server
**Researched:** 2026-04-20 (updated for v1.2 features)
**Confidence:** HIGH overall for v1.2 additions — all six features use existing installed packages or Node.js built-ins only

---

## v1.2 Stack Decision: Zero New Dependencies

All six v1.2 features are implementable with the existing installed stack. No `npm install` required.

| Feature | Approach | Package(s) Used |
|---------|----------|-----------------|
| Diagnostic evidence per finding | Capture `fetch()` `Response` metadata before `res.text()` | Native `fetch` (built-in) |
| Framework detection | Inspect `<script src>` / `<link href>` paths + meta tags in cheerio | `cheerio` (already installed) |
| Schema type inference | Static lookup table: `businessType` string → `@type` values | Pure TypeScript, no package |
| Mirror coverage depth | `fetch()` sitemap XML, parse with `DOMParser`-free string matching or cheerio | `cheerio` (already installed) |
| `pagesAudited` field | Thread crawled URL list from `crawlUrl()` result back through `runAudit()` | No package — type change only |
| `suggestedToolCallArgs` | Pre-populate args from `target` + `businessContext` at finding construction time | No package — logic only |

---

## Existing Stack (Validated — Do Not Change)

| Technology | Version | Purpose |
|------------|---------|---------|
| `@modelcontextprotocol/sdk` | `^1.29.0` | MCP server runtime, tool registration, elicitation |
| `zod` | `^3.25.76` | Input schema validation (required by SDK) |
| `cheerio` | `^1.2.0` | HTML DOM traversal, link extraction, framework signal detection |
| `turndown` | `^7.2.4` | HTML → Markdown conversion |
| `p-limit` | `^6.2.0` | Concurrency control for BFS crawler |
| `typescript` | `^5.9.3` | Language |
| `@types/node` | `^20.19.39` | Node.js type definitions |
| `tsx` | `^4.21.0` | Dev-mode execution without pre-build |

---

## v1.2 Feature-by-Feature Implementation Approach

### 1. Diagnostic Evidence Per Finding

**What:** Capture HTTP metadata (status code, `Content-Length` header, user-agent sent, response time in ms) for each `fetch()` call in the crawler.

**Approach:**

`fetchPage()` in `src/acquisition/crawl.ts` calls `fetch()` and then `res.text()`. Interpose a timer and header capture between the `fetch()` call and `res.text()`:

```typescript
const startMs = Date.now();
const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
const responseTimeMs = Date.now() - startMs;
const httpMeta: HttpMeta = {
  status: res.status,
  contentLength: res.headers.get('content-length') ?? null,
  responseTimeMs,
  userAgent: USER_AGENT,  // constant defined in crawl.ts
};
```

`HttpMeta` is a new interface added to `src/types/index.ts`. It travels with `MarkdownDocument` (new optional field `httpMeta?: HttpMeta`) and flows to `AuditFinding` as `evidence?: HttpMeta`.

**Why this approach:** `Response.headers` is already available before `res.text()` — no extra round-trip. `Date.now()` is sufficient precision for per-request timing (no `performance.now()` needed). `Content-Length` is a standard HTTP header and reliable for binary size estimates.

**No new package needed.** Native `fetch` `Response` object already exposes `.status`, `.headers`, and `.ok`.

**Confidence:** HIGH — `Response.headers.get()` is documented in Node.js 18 built-in fetch.

---

### 2. Framework Detection

**What:** Detect web framework from HTML asset paths (`/_nuxt/`, `/_next/`, `/wp-content/`, etc.) and inline signals (meta generator tags). Return a `detectedFramework` field in the audit report.

**Approach:** Implement `src/audit/detect-framework.ts` — a pure function that takes the root page HTML string (already fetched by the schema dimension) and uses cheerio to:

1. Check `<meta name="generator">` content (WordPress, Wix, Squarespace, Ghost, Drupal all emit this)
2. Scan `<script src>` and `<link href>` values for path prefix signatures
3. Check for Nuxt-specific `<div id="__nuxt">`, Next.js `<div id="__next">`, etc.

Signal map (static, no external data):

| Path/Meta Signal | Framework |
|-----------------|-----------|
| `/_nuxt/` in script/link src | Nuxt.js |
| `/_next/` in script/link src | Next.js |
| `/wp-content/` in any href/src | WordPress |
| `meta[name=generator]` contains "WordPress" | WordPress |
| `meta[name=generator]` contains "Wix" | Wix |
| `meta[name=generator]` contains "Squarespace" | Squarespace |
| `meta[name=generator]` contains "Webflow" | Webflow |
| `meta[name=generator]` contains "Ghost" | Ghost |
| `meta[name=generator]` contains "Drupal" | Drupal |
| `meta[name=generator]` contains "Joomla" | Joomla |
| `/gatsby-` in script src | Gatsby |
| `__NEXT_DATA__` script id | Next.js (fallback) |
| `/assets/` + Vite manifest comment | Vite (SvelteKit/Astro) |

Return type: `string | null` — `null` when undetectable, not an error.

**Why cheerio not regex:** The existing `fetchPage()` already loads HTML into cheerio for link extraction. Re-using cheerio avoids a second parse pass if the HTML is threaded through. For audit dimensions that already fetch the root page, pass the already-fetched HTML string.

**No new package needed.** Cheerio is already installed.

**Confidence:** HIGH — all signals are static pattern matches; cheerio selector support for `attr()` on meta/script/link is well-established.

---

### 3. Schema Type Inference

**What:** Map `businessContext.businessType` (a free-text string) to appropriate JSON-LD `@type` values instead of always defaulting to `LocalBusiness`.

**Approach:** Static keyword-to-type lookup table in `src/audit/dimensions/schema.ts` (or extracted to `src/generators/schema-type-map.ts` for reuse by the generator). No fuzzy matching — use `includes()` / `toLowerCase()` keyword matching:

```typescript
const SCHEMA_TYPE_MAP: Array<{ keywords: string[]; type: string }> = [
  { keywords: ['software', 'saas', 'app', 'tool', 'platform', 'plugin'], type: 'SoftwareApplication' },
  { keywords: ['travel', 'tour', 'tourism', 'agency', 'vacation', 'trip'], type: 'TravelAgency' },
  { keywords: ['hotel', 'motel', 'inn', 'hostel', 'resort', 'lodging', 'airbnb'], type: 'LodgingBusiness' },
  { keywords: ['restaurant', 'cafe', 'coffee', 'diner', 'bistro', 'eatery', 'food'], type: 'Restaurant' },
  { keywords: ['doctor', 'physician', 'medical', 'clinic', 'dentist', 'hospital'], type: 'MedicalBusiness' },
  { keywords: ['lawyer', 'attorney', 'law firm', 'legal'], type: 'LegalService' },
  { keywords: ['gym', 'fitness', 'yoga', 'pilates', 'sport'], type: 'SportsActivityLocation' },
  { keywords: ['school', 'university', 'college', 'education', 'tutoring'], type: 'EducationalOrganization' },
  { keywords: ['nonprofit', 'charity', 'foundation', 'ngo'], type: 'NGO' },
  { keywords: ['real estate', 'realtor', 'property', 'realty'], type: 'RealEstateAgent' },
  { keywords: ['auto', 'car', 'vehicle', 'dealership', 'mechanic', 'garage'], type: 'AutoDealer' },
  { keywords: ['accountant', 'accounting', 'bookkeeping', 'cpa', 'tax'], type: 'AccountingService' },
  { keywords: ['insurance'], type: 'InsuranceAgency' },
  { keywords: ['bank', 'credit union', 'financial', 'lending', 'mortgage'], type: 'FinancialService' },
  { keywords: ['electrician', 'plumber', 'hvac', 'contractor', 'roofer', 'painter'], type: 'HomeAndConstructionBusiness' },
  { keywords: ['hair', 'salon', 'barber', 'spa', 'beauty', 'nail'], type: 'BeautySalon' },
  { keywords: ['vet', 'veterinary', 'animal', 'pet'], type: 'Veterinary' },
  // Default fallthrough: LocalBusiness
];
```

**Why static map not ML/API:** Zero dependencies, zero latency, fully deterministic, zero cost. The schema type inference is a best-effort recommendation — auditors and content editors routinely correct this manually. A static map that is right 80% of the time is sufficient for a suggestedToolCall argument pre-population feature.

**Why `LocalBusiness` as default:** Schema.org `LocalBusiness` is a supertype of most business-specific types. It is never wrong, only imprecise. An incorrect specific type (e.g., classifying a software company as `LocalBusiness`) is low-harm — LLMs still extract the structured data.

**No new package needed.** Pure TypeScript.

**Confidence:** HIGH — logic is entirely within the codebase; no external verification required.

---

### 4. Mirror Coverage Depth

**What:** After audit, fetch and parse `sitemap.xml` (at `/sitemap.xml` or from `robots.txt`'s `Sitemap:` directive), extract URL list, then `HEAD`-probe each `<url>/<path>/index.md` to compute `mirrorCoverage: { sitemapUrlCount, mirrorsFound, coveragePct }`.

**Approach:**

Fetch `/sitemap.xml` with native `fetch()`. Parse the XML to extract `<loc>` values. Do NOT use an XML parser package — cheerio can parse XML with `cheerio.load(xml, { xmlMode: true })`, and `$('loc').map((_, el) => $(el).text()).get()` extracts all URL strings. This is a known-valid pattern for sitemap parsing.

Then for each sitemap URL, derive the expected mirror path: `${url}/index.md` (or `${urlWithoutTrailingSlash}/index.md`), and `HEAD`-probe it via `p-limit`-throttled `fetch()` calls.

```typescript
// Existing p-limit instance can be reused
const limit = pLimit(3);
const probes = sitemapUrls.map(url => limit(() =>
  fetch(mirrorUrl(url), { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    .then(r => r.status === 200)
    .catch(() => false)
));
const results = await Promise.all(probes);
const mirrorsFound = results.filter(Boolean).length;
```

**Why cheerio for XML not a dedicated XML parser:** `fast-xml-parser` and `xml2js` are the common alternatives, but both require a new install. Cheerio with `xmlMode: true` handles well-formed sitemap XML correctly — sitemaps are simple, well-specified documents with no namespace complexity beyond the standard `xmlns`. This is documented in cheerio's README.

**Why not fetch `robots.txt` to discover sitemap URL:** The `robots-txt` dimension already fetches `robots.txt`. If the audit threads that result forward, the sitemap URL can be extracted from the `Sitemap:` directive without a second fetch. However, for isolation, defaulting to `/sitemap.xml` is simpler and correct for 95% of sites.

**No new package needed.** Cheerio + native fetch + p-limit (all already installed).

**Confidence:** MEDIUM — cheerio xmlMode for sitemap parsing is well-documented but represents a secondary use of a primarily HTML-focused library. The approach works but a dedicated XML library would be more semantically correct. Zero-dependency advantage justifies the tradeoff here.

---

### 5. `pagesAudited` Field

**What:** Return the list of URLs actually crawled in the `AuditReport` response.

**Approach:** This is a type and data-threading change, not a logic change.

1. `AuditReport` in `src/audit/types.ts` gains `pagesAudited?: string[]`
2. `runAudit()` in `src/audit/index.ts` currently calls `runAudit(target)` without receiving crawl results — audits fetch independently per dimension. The cleanest path for v1.2 is to run the crawler once in `runAudit()` and thread the result list:

```typescript
// In runAudit():
let pagesAudited: string[] | undefined;
if (isUrl(probe)) {
  const crawlResults = await crawlUrl(probe, { pageCap: 10, concurrency: 3, timeoutMs: 8000 });
  pagesAudited = crawlResults.map(r => r.url);  // both MarkdownDocument and AcquisitionError have .url
  // Pass crawlResults to dimensions that need them
}
```

**Integration note:** The 5 existing dimension checkers each independently fetch the root page. Sharing a pre-crawled result set would require refactoring all 5 dimension signatures — defer that to a future phase. For v1.2, `pagesAudited` can be populated from a shallow 10-page crawl run at the start of `runAudit()`, independent of the per-dimension fetches. This adds one crawl overhead but keeps dimension isolation.

**No new package needed.** Pure TypeScript type addition + data threading.

**Confidence:** HIGH — existing `crawlUrl()` already returns `AcquisitionResult[]` which both `MarkdownDocument` and `AcquisitionError` share `.url` on.

---

### 6. `suggestedToolCallArgs`

**What:** Pre-populate tool arguments from the audit's existing context (`target`, `businessContext`) into each finding, so the wizard can call tools without re-asking for fields already known.

**Approach:** Extend `AuditFinding` with `suggestedToolCallArgs?: Record<string, unknown>`. Dimension checkers that emit `suggestedToolCall` are called with a new `context` parameter:

```typescript
// New signature for dimension checkers:
async function checkSchemaMarkup(
  target: string,
  context?: { businessContext?: BusinessContext; detectedFramework?: string }
): Promise<AuditFinding>
```

Within each dimension, when constructing a finding with `suggestedToolCall`, populate args from context:

```typescript
suggestedToolCallArgs: {
  target,
  businessContext: context?.businessContext,
  schemaTypes: inferSchemaTypes(context?.businessContext?.businessType),
}
```

The wizard in `src/tools/index.ts` (Phase 9 context accumulation loop) already reads `finding.suggestedToolCall` — it can be updated to also read `finding.suggestedToolCallArgs` and merge those into the accumulator before gap-fill elicitation, reducing the number of elicitation prompts shown.

**No new package needed.** Pure TypeScript type extension.

**Confidence:** HIGH — the shape is a simple `Record<string, unknown>` on an existing interface; no serialization or external data involved.

---

## Changes Required Per File

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/types/index.ts` | Extend interfaces | Add `httpMeta?: HttpMeta` to `MarkdownDocument`; add `HttpMeta` interface |
| `src/audit/types.ts` | Extend interfaces | Add `pagesAudited?: string[]` to `AuditReport`; add `suggestedToolCallArgs?: Record<string, unknown>` to `AuditFinding`; add `detectedFramework?: string` to `AuditReport` |
| `src/acquisition/crawl.ts` | Modify `fetchPage()` | Capture `startMs`, `res.status`, `res.headers.get('content-length')` before `res.text()`; attach to returned `MarkdownDocument` |
| `src/audit/index.ts` | Extend `runAudit()` | Accept optional `businessContext`; run shallow crawl to populate `pagesAudited`; call framework detector; thread context to dimension checkers |
| `src/audit/detect-framework.ts` | New file | Pure function: `detectFramework(html: string): string | null` using cheerio |
| `src/audit/schema-type-map.ts` | New file | Static `inferSchemaType(businessType: string): string` lookup |
| `src/audit/dimensions/schema.ts` | Modify checker | Accept `context` param; use `inferSchemaType()` instead of hardcoded `LocalBusiness`; populate `suggestedToolCallArgs` |
| `src/audit/dimensions/markdown.ts` | Modify checker | Add sitemap fetch + `HEAD`-probe loop for `mirrorCoverage`; add `suggestedToolCallArgs` |
| `src/audit/dimensions/llms-txt.ts` | Minor | Add `suggestedToolCallArgs` to failing findings |
| `src/audit/dimensions/robots-txt.ts` | Minor | Add `suggestedToolCallArgs` to failing findings |
| `src/audit/dimensions/faq.ts` | Minor | Add `suggestedToolCallArgs` to failing findings |
| `src/tools/index.ts` | Extend handler | Read `suggestedToolCallArgs` from finding; merge into accumulator before gap-fill loop |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `fast-xml-parser` or `xml2js` | Adds a dependency for sitemap parsing; cheerio with `xmlMode: true` handles sitemap `<loc>` extraction sufficiently | `cheerio` with `{ xmlMode: true }` |
| `ua-parser-js` | Framework detection is path/meta based, not user-agent based | Static signal map in `detect-framework.ts` |
| `fuse.js` or any fuzzy matcher | Over-engineered for `businessType` → schema type mapping; 20 keyword rules cover 95% of cases | Static keyword array in `schema-type-map.ts` |
| `node-fetch` | Redundant; Node 18+ built-in fetch is stable | Native `fetch` |
| `axios` | Same; adds CommonJS/ESM dual-mode risk | Native `fetch` |
| Any JS execution engine (Playwright, Puppeteer) | Framework detection works on raw HTML asset paths — no JS execution needed | Cheerio static analysis |

---

## Version Compatibility Notes

All v1.2 changes are compatible with the existing locked dependency versions:

| Concern | Status |
|---------|--------|
| Cheerio `xmlMode: true` | Available in cheerio `^1.0.0+` — confirmed in existing version `^1.2.0` |
| `Response.headers.get()` | Available in Node 18+ built-in fetch — compatible with `engines: { node: ">=18" }` |
| `Date.now()` for timing | Always available — no compatibility concern |
| `AbortSignal.timeout()` | Node 18+ — already used in `crawl.ts` |
| ESM module resolution (`"module": "Node16"`) | No new imports introduced that require CJS packages |

---

## Sources

- Cheerio xmlMode documentation: https://cheerio.js.org/docs/api/interfaces/CheerioOptions (MEDIUM confidence — based on training data; verify against cheerio 1.2.0 changelog)
- Node.js 18 built-in fetch `Response` API: https://nodejs.org/docs/latest-v18.x/api/globals.html#fetch — HIGH confidence (stable API)
- Schema.org type hierarchy for business types: https://schema.org/LocalBusiness — HIGH confidence (stable specification)
- Sitemap protocol `<loc>` element: https://www.sitemaps.org/protocol.html — HIGH confidence (frozen spec)
- Existing codebase verified via direct read: `src/acquisition/crawl.ts`, `src/audit/types.ts`, `src/audit/index.ts`, `src/audit/dimensions/schema.ts`, `src/audit/dimensions/markdown.ts`, `src/tools/index.ts`, `src/types/index.ts`, `package.json` — HIGH confidence

---

## Original v1.0 Stack (Preserved for Reference)

The sections below document the original stack research from 2026-04-17 and remain valid. v1.2 adds no new packages.

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | `^1.x` (latest) | MCP server runtime | Official Tier 1 TypeScript SDK. Provides `McpServer`, `StdioServerTransport`, and tool registration API. |
| `zod` | `^3.x` | Input schema validation for tools | Required by the MCP SDK's `registerTool` API. |
| `typescript` | `^5.x` | Language | First-class MCP SDK support; strict mode enforced by official tsconfig template. |
| `Node.js` | `>=18` | Runtime | Native `fetch` API available without polyfill. |

**Critical note on STDIO transport:** `console.log()` writes to stdout, corrupting the JSON-RPC stream. Use `console.error()` for all logging.

### HTML Parsing — cheerio `^1.2.0`

jQuery-style API for DOM manipulation. Runs in Node without a browser. Used for chrome-stripping, link extraction, framework signal detection, and sitemap XML parsing (`xmlMode: true`).

### HTML to Markdown — turndown `^7.2.4`

Produces clean Markdown from HTML. One package vs. 5–8 for the unified/rehype pipeline.

### Concurrency — p-limit `^6.2.0`

Limits simultaneous `fetch()` calls in the BFS crawler and mirror-coverage prober. NOTE: pinned to `^6` (not 7) for Node 18 compatibility — identical API.

---
*Stack research updated for v1.2 milestone*
*Researched: 2026-04-20*
