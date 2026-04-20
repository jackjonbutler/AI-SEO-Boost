# Phase 4: Sitemap, Mirrors, and Schema - Research

**Researched:** 2026-04-20
**Domain:** XML sitemap generation, HTML-to-markdown file mirroring, JSON-LD schema.org markup
**Confidence:** HIGH

## Summary

Phase 4 implements three pure generator functions following the exact pattern established in Phase 3: each tool lives in `src/generators/files/<name>.ts`, exports a pure `build<Name>()` function, and the handler in `src/tools/index.ts` replaces the existing stub. No new npm dependencies are required — Cheerio, Turndown, and Node.js built-ins (`fs/promises`, `path`, `node:fs/promises`) cover all three generators.

The sitemap generator derives priority from URL path heuristics (path depth + keyword matching), produces valid sitemaps.org XML with ISO 8601 `lastmod` dates, and re-uses the acquisition pipeline already built in Phase 2 (`acquireLocal` / `crawlUrl`). The markdown mirrors generator writes one `index.md` per page under `outputDir/<slug>/index.md`, prepends YAML frontmatter, and re-uses the existing `stripChrome` + `convertToMarkdown` pipeline. The schema generator is a pure function over `BusinessContext` — no I/O — that builds JSON-LD objects for `LocalBusiness`, `FAQPage`, and `Service` types.

**Primary recommendation:** Build all three generators as pure functions over already-available types; wire I/O and stub replacement entirely in `src/tools/index.ts` per the Phase 3 handler pattern.

## Standard Stack

### Core (already installed — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cheerio | ^1.2.0 | HTML parsing and chrome stripping | Already in use; CHROME_SELECTORS pattern established |
| turndown | ^7.2.4 | HTML-to-markdown conversion | Already in use; TurndownService instance in `processing/convert.ts` |
| node:fs/promises | Node 18 built-in | Recursive directory creation and file writes | `mkdir({ recursive: true })` + `writeFile` covers all I/O |
| node:path | Node 18 built-in | URL-to-file-path slug derivation | `path.join`, `path.dirname` |
| p-limit | ^6.2.0 | Concurrency during mirror writes | Already installed; used in crawl.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:url | Node 18 built-in | Parse URL paths for sitemap priority scoring | `new URL(loc).pathname` to extract path segments |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual XML string building | `xmlbuilder2` or `fast-xml-parser` | Overkill — sitemaps are simple enough that template literals with XML entity escaping are safer and have zero deps |
| Manual JSON-LD string building | `schema-dts` TypeScript types | `schema-dts` gives compile-time type safety but adds a dep; plain objects + `JSON.stringify` is sufficient given the three known types |
| `fs.promises.writeFile` after path derivation | `mkdirp` package | Node 18 `fs.promises.mkdir({ recursive: true })` is built-in; no external package needed |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── generators/
│   ├── files/
│   │   ├── llms-txt.ts          # Phase 2 (done)
│   │   ├── robots-txt.ts        # Phase 2 (done)
│   │   ├── sitemap-xml.ts       # Phase 4 — buildSitemapXml(docs, baseUrl): string
│   │   ├── markdown-mirrors.ts  # Phase 4 — buildMarkdownMirror(doc): { slug, content }
│   │   └── schema-markup.ts     # Phase 4 — buildSchemaMarkup(ctx, types): string[]
│   └── index.ts
├── acquisition/
│   ├── local.ts                 # Phase 2 (done) — acquireLocal()
│   └── crawl.ts                 # Phase 2 (done) — crawlUrl()
├── processing/
│   ├── strip.ts                 # Phase 2 (done) — stripChrome()
│   └── convert.ts               # Phase 2 (done) — convertToMarkdown()
└── tools/
    └── index.ts                 # Phase 1 stub → Phase 4 real handlers
```

### Pattern 1: Pure Build Function (established in Phase 3)
**What:** Generator file exports a pure function with no I/O. Handler in `tools/index.ts` calls the pure function and performs all file writes.
**When to use:** All three Phase 4 generators follow this pattern exactly.
**Example:**
```typescript
// src/generators/files/sitemap-xml.ts
import type { MarkdownDocument } from '../../types/index.js';

export function buildSitemapXml(docs: MarkdownDocument[], baseUrl: string): string {
  // pure: takes data, returns XML string
  // no fs imports, no writeFile, no side effects
}
```

### Pattern 2: Acquisition Pipeline Re-use
**What:** Both sitemap and mirrors generators receive `MarkdownDocument[]` from the existing pipeline. The handler in `tools/index.ts` calls `acquireLocal` or `crawlUrl`, then passes results to the pure build function.
**When to use:** Any time target is either a local folder path or a URL (dual access mode).
**Example:**
```typescript
// tools/index.ts handler body
const isUrl = target.startsWith('http://') || target.startsWith('https://');
const results = isUrl ? await crawlUrl(target) : await acquireLocal(target);
const docs = results.filter((r): r is MarkdownDocument => !('error' in r));
const xml = buildSitemapXml(docs, baseUrl);
await writeFile(outputPath, xml, 'utf-8');
```

### Pattern 3: Slug Derivation for Mirror Paths
**What:** Convert a page URL to a file-system path for `outputDir/<slug>/index.md`. For crawled URLs derive from `pathname`; for local file:// URLs derive from relative path within the source folder.
**When to use:** `generate_markdown_mirrors` must produce one `index.md` per page.
**Example:**
```typescript
// Derive slug from URL pathname, strip .html, normalise trailing slash
function urlToSlug(pageUrl: string, baseUrl?: string): string {
  try {
    const u = new URL(pageUrl);
    // e.g. /services/wraps.html → services/wraps
    let slug = u.pathname.replace(/\.html?$/, '').replace(/^\//, '').replace(/\/$/, '');
    return slug || 'index';
  } catch {
    return 'index';
  }
}
// Output path: path.join(outputDir, slug, 'index.md')
// Home page (slug === 'index'): path.join(outputDir, 'index.md')  -- flat, not nested
```

### Pattern 4: YAML Frontmatter Prepend
**What:** Write YAML frontmatter as a string prepended to the markdown body. No external library — template literal with known fields.
**When to use:** All markdown mirror files.
**Example:**
```typescript
function buildFrontmatter(doc: MarkdownDocument): string {
  const fields: Record<string, string> = {
    title: doc.title,
    url: doc.url,
    description: doc.description,
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  };
  const yamlLines = Object.entries(fields)
    .filter(([, v]) => v.trim().length > 0)
    .map(([k, v]) => `${k}: "${v.replace(/"/g, '\\"')}"`);
  return `---\n${yamlLines.join('\n')}\n---\n\n`;
}
```

### Pattern 5: XML Entity Escaping
**What:** XML requires `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;` in attribute/text values. URLs in `<loc>` are the main risk (query strings with `&`).
**When to use:** Every `<loc>` value in the sitemap.
**Example:**
```typescript
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### Pattern 6: Priority Scoring Heuristic
**What:** Classify each URL's priority by path depth and keyword signals. No external library — pure string analysis.
**When to use:** `buildSitemapXml` assigns `<priority>` per URL.
**Scoring rules (per spec):**
```typescript
function scorePriority(pageUrl: string): number {
  const pathname = new URL(pageUrl).pathname;
  const segments = pathname.split('/').filter(Boolean);

  // Root path = homepage
  if (segments.length === 0) return 1.0;

  const slug = segments.join('/').toLowerCase();

  // Service indicators
  const serviceKeywords = ['service', 'wrap', 'tint', 'install', 'repair', 'product', 'offering'];
  if (serviceKeywords.some(k => slug.includes(k))) return 0.9;

  // Info/about indicators (depth 1)
  const infoKeywords = ['about', 'faq', 'pricing', 'price', 'contact', 'location', 'gallery'];
  if (segments.length === 1 && infoKeywords.some(k => slug.includes(k))) return 0.8;

  // Everything else (blog, deep paths, secondary)
  return 0.7;
}
```

### Pattern 7: JSON-LD Object Building
**What:** Build plain JavaScript objects per schema type, then serialize with `JSON.stringify(obj, null, 2)`. Return as a `string[]` (one string per type), each string being a complete JSON-LD block.
**When to use:** `buildSchemaMarkup` for all three types.

### Anti-Patterns to Avoid
- **Importing Zod in generators:** Types/interfaces only in generators. Zod stays in `tools/index.ts` per established pattern.
- **Doing I/O inside build functions:** Pure functions — no `readFile`/`writeFile` in `generators/files/`. All I/O in handler.
- **Using `file://` URLs as sitemap `<loc>` values:** Must rebase to `baseUrl`. Local acquisition produces `file://` URLs; sitemap requires absolute `https://` URLs built from `baseUrl + relative path`.
- **Writing markdown content without creating parent dirs first:** `fs.promises.writeFile` does NOT create missing parent directories — always call `await mkdir(dirname(filePath), { recursive: true })` first.
- **Trailing blank lines in output:** All generators follow POSIX convention: `content.trimEnd() + '\n'`.
- **Inverting the acquisition/generator dependency:** Generators must not import from `acquisition/`. The handler in `tools/index.ts` owns orchestration.
- **Writing `<script type="application/ld+json">` tags in the JSON-LD output:** The generator outputs raw JSON strings. Adding HTML wrapper is the caller's responsibility if needed — but per the tool spec, the output is the JSON-LD markup only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML chrome stripping for mirrors | Custom Cheerio selectors | `stripChrome()` from `processing/strip.ts` | Already handles nav/header/footer/script/aside + role attrs + class-based patterns |
| HTML to markdown | Custom converter | `convertToMarkdown()` from `processing/convert.ts` | Turndown instance already configured with atx headings, fenced code, cleaned form elements |
| Page acquisition from URL/folder | Custom crawl | `acquireLocal()` / `crawlUrl()` from `acquisition/` | Both return `MarkdownDocument[]` with title, description, frontmatter already set |
| Recursive directory creation | Custom mkdir recursion | `fs.promises.mkdir(dir, { recursive: true })` | Node 18 built-in; no package needed |
| XML sitemap serialisation library | `xmlbuilder2` / `fast-xml-parser` | Template literals + `escapeXml()` | Sitemap schema is flat and fixed — 4 tags per URL entry; no library justified |
| JSON-LD schema library | `schema-dts` types | Plain `Record<string, unknown>` objects | The 3 types are static and known; TypeScript plain objects with explicit fields are simpler and reviewable |

**Key insight:** Phases 1-3 built the acquisition and processing infrastructure specifically so Phase 4 generators are thin wrappers. Don't re-implement what already works.

## Common Pitfalls

### Pitfall 1: file:// URLs Leaking into Sitemap
**What goes wrong:** `acquireLocal()` returns `MarkdownDocument.url` values as `file:///absolute/path/to/file.html`. If passed directly to `<loc>`, the sitemap contains invalid non-HTTP URLs.
**Why it happens:** Acquisition is designed to be source-agnostic; `<loc>` in sitemaps must be absolute HTTP/HTTPS.
**How to avoid:** In the sitemap generator, convert each doc's URL to a sitemap URL: strip the `file://` prefix, extract the relative path from the folder root, then prepend `baseUrl`. For crawled docs, normalize using `new URL(doc.url)` to ensure absolute HTTP/HTTPS.
**Warning signs:** `<loc>file:///` in output XML.

### Pitfall 2: Missing Parent Directories on Mirror Write
**What goes wrong:** `fs.promises.writeFile('/some/deep/path/index.md')` throws `ENOENT: no such file or directory`.
**Why it happens:** `writeFile` does not create parent directories automatically.
**How to avoid:** Always: `await mkdir(path.dirname(filePath), { recursive: true })` before `writeFile`.
**Warning signs:** `ENOENT` errors during mirror generation.

### Pitfall 3: Duplicate or Colliding Slugs
**What goes wrong:** Two pages produce the same slug (e.g., `/services/` and `/services/index.html` both become `services/index.md`).
**Why it happens:** Path normalisation strips trailing slashes and `.html` without deduplication.
**How to avoid:** Track written paths in a `Set<string>` and skip or suffix (`-2`) on collision.
**Warning signs:** Fewer output files than expected; second write silently overwrites first.

### Pitfall 4: Special Characters in XML
**What goes wrong:** A URL containing `&` in a query string (e.g., `?utm_source=x&utm_medium=y`) produces malformed XML when placed in `<loc>`.
**Why it happens:** `&` is a reserved XML character.
**How to avoid:** Always apply `escapeXml()` to every value inserted into XML template literals.
**Warning signs:** XML validator errors; browsers failing to parse the sitemap.

### Pitfall 5: Schema Output Missing @context or Using Wrong Value
**What goes wrong:** JSON-LD block missing `"@context": "https://schema.org"` fails Google's Rich Results Test.
**Why it happens:** Forgetting `@context`, or using `"http://schema.org"` (HTTP, not HTTPS), or `"http://schema.org/"` (trailing slash mismatch). The spec allows both `https://schema.org` and `https://schema.org/` but Google strongly recommends `https://schema.org`.
**How to avoid:** Hard-code `"@context": "https://schema.org"` as a constant in `schema-markup.ts`.
**Warning signs:** Validator errors about missing context or unrecognized types.

### Pitfall 6: FAQPage Answer Text With Unescaped HTML
**What goes wrong:** `"text"` field in FAQPage answers containing `<p>` tags causes JSON parse errors if not properly escaped in the JSON string.
**Why it happens:** JSON strings cannot contain unescaped `<` and `>` without encoding. Google's structured data validator does accept HTML in answer text, but the JSON must be valid JSON first.
**How to avoid:** Use `JSON.stringify` for the entire object (not manual string building), which handles escaping automatically.
**Warning signs:** JSON parse errors; validator rejecting the block.

### Pitfall 7: lastmod Format Inconsistency
**What goes wrong:** Mixing `YYYY-MM-DD` and full ISO 8601 datetime formats in the same sitemap.
**Why it happens:** `new Date().toISOString()` returns `2026-04-20T12:00:00.000Z` (full ISO); but the spec accepts `YYYY-MM-DD` as well.
**How to avoid:** Use `new Date().toISOString().split('T')[0]` for consistent `YYYY-MM-DD` across all entries. This is what the spec calls "W3C Date" format.
**Warning signs:** Sitemap validator warnings about inconsistent date formats.

### Pitfall 8: Home Page Slug Collision
**What goes wrong:** Home page URL (`/`) produces an empty slug, leading to `outputDir//index.md` (double slash) or being mapped to same path as an actual `/index.html` page.
**Why it happens:** After stripping `/` there is nothing left.
**How to avoid:** Special-case empty slug → `'index'` and write to `path.join(outputDir, 'index.md')` not `path.join(outputDir, 'index', 'index.md')`.
**Warning signs:** Home page not appearing in output, or doubled `index/index.md` path.

## Code Examples

Verified patterns from official sources and existing codebase:

### Valid XML Sitemap Structure
```typescript
// Source: sitemaps.org/protocol.html — required namespace and structure
export function buildSitemapXml(docs: MarkdownDocument[], baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const urlEntries = docs.map((doc) => {
    const loc = escapeXml(resolveToAbsolute(doc.url, base));
    const priority = scorePriority(loc);
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <priority>${priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries,
    '</urlset>',
  ].join('\n').trimEnd() + '\n';
}
```

### LocalBusiness JSON-LD
```typescript
// Source: developers.google.com/search/docs/appearance/structured-data/local-business
function buildLocalBusiness(ctx: BusinessContext): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: ctx.businessName,
  };
  if (ctx.description) obj['description'] = ctx.description;
  if (ctx.website) obj['url'] = ctx.website;
  if (ctx.phoneNumber) obj['telephone'] = ctx.phoneNumber;
  if (ctx.location) {
    obj['address'] = {
      '@type': 'PostalAddress',
      addressLocality: ctx.location,
    };
  }
  if (ctx.services && ctx.services.length > 0) {
    obj['hasOfferCatalog'] = {
      '@type': 'OfferCatalog',
      name: `${ctx.businessName} Services`,
      itemListElement: ctx.services.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s },
      })),
    };
  }
  return obj;
}
```

### FAQPage JSON-LD (Google-required structure)
```typescript
// Source: developers.google.com/search/docs/appearance/structured-data/faqpage
// Required: mainEntity[] with @type:Question, name, acceptedAnswer.@type:Answer, acceptedAnswer.text
interface FaqPair { question: string; answer: string; }

function buildFaqPage(faqs: FaqPair[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  };
}
```

### Service JSON-LD
```typescript
// Source: schema.org/Service
function buildService(ctx: BusinessContext, serviceName: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: serviceName,
    provider: {
      '@type': 'LocalBusiness',
      name: ctx.businessName,
    },
  };
  if (ctx.location) obj['areaServed'] = ctx.location;
  if (ctx.businessType) obj['serviceType'] = ctx.businessType;
  if (ctx.description) obj['description'] = ctx.description;
  return obj;
}
```

### Markdown Mirror File Write Pattern
```typescript
// Source: Node.js docs + codebase pattern
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function writeMirror(slug: string, content: string, outputDir: string): Promise<void> {
  const isHome = slug === 'index';
  const filePath = isHome
    ? path.join(outputDir, 'index.md')
    : path.join(outputDir, slug, 'index.md');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}
```

### Generate Schema Markup Tool Handler Pattern
```typescript
// src/tools/index.ts — replaces generate_schema_markup stub
async ({ businessContext, schemaTypes }) => {
  try {
    const blocks = buildSchemaMarkup(businessContext, schemaTypes);
    return {
      content: [{ type: 'text' as const, text: blocks.join('\n\n') }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `schema-dts` typed objects for JSON-LD | Plain TypeScript objects + `JSON.stringify` | N/A (never standard) | Fewer deps, more transparent |
| `xmlbuilder`/`xmlbuilder2` for sitemap generation | Template literals + `escapeXml()` | Now standard for simple sitemaps | Zero dep overhead for fixed schema |
| `front-matter` npm package for YAML parsing | Manual YAML string construction via template literal | Now standard for write-only use | No dep needed when only writing, not reading |
| `mkdirp` npm package | `fs.promises.mkdir({ recursive: true })` | Node.js v10+ | Built-in, no package needed |

**Deprecated/outdated:**
- `xmlbuilder` (older API): Replaced by `xmlbuilder2` but both are overkill for this use case — plain template literals are sufficient for sitemaps.org format.
- `schema-dts` for compile-time schema safety: Adds ~180KB dep with questionable ROI for 3 known static types.

## Open Questions

1. **FAQ data source for FAQPage schema**
   - What we know: `generate_schema_markup` takes `BusinessContext` and `schemaTypes` as input; `BusinessContext` has no `faqs` field.
   - What's unclear: Where do the Q&A pairs come from for FAQPage when `generate_faq_content` (Phase 5) hasn't run yet?
   - Recommendation: For Phase 4, accept an optional `faqs?: Array<{question: string; answer: string}>` parameter in the tool input schema, or generate placeholder FAQs from `services` (e.g., "What is [service]?" / "We offer [service] in [location]."). Document that Phase 5's `generate_faq_content` produces the real input for this tool.

2. **Concurrency for mirror writes**
   - What we know: `p-limit@6` is installed; `crawlUrl` uses it with default concurrency 3.
   - What's unclear: For large sites (50+ pages), sequential writes could be slow; but concurrent writes to many directories create I/O contention.
   - Recommendation: Use `p-limit(5)` for mirror writes — enough parallelism for speed without overwhelming the filesystem.

3. **lastmod source for local HTML files**
   - What we know: `MarkdownDocument` type has no `lastmod` field; `acquireLocal` does not capture `fs.stat().mtime`.
   - What's unclear: Should we use file mtime or generation date as `lastmod`?
   - Recommendation: Use `new Date().toISOString().split('T')[0]` (today's date) for all entries — matches the sitemaps.org guidance that the value should only be set if you can maintain it accurately. Document this in code comments.

## Sources

### Primary (HIGH confidence)
- sitemaps.org/protocol.html — XML namespace, element names, priority range 0.0-1.0, 50,000 URL max, UTF-8 requirement, W3C date format
- developers.google.com/search/docs/appearance/structured-data/faqpage — Required properties: mainEntity[], Question.name, Answer.text; `@context: "https://schema.org"`
- developers.google.com/search/docs/appearance/structured-data/local-business — Required: `name`, `address`; recommended: `telephone`, `url`
- schema.org/Service — Core properties: `name`, `provider`, `serviceType`, `areaServed`
- Node.js v18 fs docs — `mkdir({ recursive: true })`, `writeFile` API

### Secondary (MEDIUM confidence)
- Existing codebase (`src/acquisition/`, `src/processing/`, `src/types/`) — Confirmed `MarkdownDocument` interface shape, acquisition return contract, `stripChrome` + `convertToMarkdown` APIs
- Existing `src/tools/index.ts` — Confirmed stub input schemas for all 3 Phase 4 tools (exact parameter names: `target`, `baseUrl`, `outputPath`, `outputDir`, `businessContext`, `schemaTypes`)

### Tertiary (LOW confidence)
- Priority scoring keyword lists (service/info/secondary): Industry convention, no official standard. The 1.0/0.9/0.8/0.7 values are specified in requirements; the keyword heuristic for classification is implementation-defined.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed and in use; verified against package.json
- Architecture: HIGH — pure function pattern established in Phase 3; build function API matches tools/index.ts stub signatures exactly
- XML sitemap spec: HIGH — verified against sitemaps.org official protocol page
- JSON-LD schemas: HIGH — verified against Google Search Central docs (most authoritative source for practical compliance)
- Pitfalls: HIGH — derived from existing code patterns and Node.js documentation
- Priority scoring heuristic: MEDIUM — values are spec-specified; keyword classification is implementation-defined convention

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable specs; sitemaps.org and schema.org change slowly)
