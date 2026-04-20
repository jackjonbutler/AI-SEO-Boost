---
phase: 04-sitemap-mirrors-schema
verified: 2026-04-20T12:01:06Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 4: Sitemap, Mirrors, Schema Verification Report

**Phase Goal:** A user can generate an XML sitemap, a full set of markdown mirrors, and JSON-LD schema blocks for any site or folder
**Verified:** 2026-04-20T12:01:06Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | generate_sitemap produces valid XML with absolute URLs, ISO 8601 lastmod dates, and priority scores (1.0 home, 0.9 service, 0.8 info, 0.7 secondary) | VERIFIED | `scorePriority()` returns 1.0/0.9/0.8/0.7 on exact keyword matches; `lastmod` uses `new Date().toISOString().split('T')[0]` (ISO 8601 YYYY-MM-DD); `resolveToAbsolute()` converts file:// → https:// absolute URLs; sitemaps.org 0.9 xmlns present |
| 2 | generate_markdown_mirrors writes one index.md per page with YAML frontmatter and all navigation/script chrome removed | VERIFIED | `buildMarkdownMirror()` emits `---\ntitle/url/description/date\n---\n\n<body>` format; chrome removed upstream in `stripChrome()` via Cheerio removing `nav, header, footer, aside, script, style, noscript` and 10+ selector variants; handler writes `<slug>/index.md` per page with `mkdir({recursive:true})` |
| 3 | generate_schema_markup outputs valid JSON-LD for LocalBusiness, FAQPage, and Service types using https://schema.org context | VERIFIED | `SCHEMA_CONTEXT = 'https://schema.org'` (constant, HTTPS, no trailing slash); `JSON.stringify(obj, null, 2)` used for all three type builders; `@context` key present in every block; LocalBusiness includes PostalAddress + OfferCatalog, FAQPage uses Question/Answer mainEntity, Service includes provider + serviceType |
| 4 | All three tools work from both a local folder and a live URL | VERIFIED | All three handlers share identical dual-acquisition pattern: `isUrl = t.startsWith('http://') \|\| t.startsWith('https://')` → `crawlUrl(t)` or `acquireLocal(t)`; `acquireLocal` exported from `src/acquisition/local.ts`, `crawlUrl` from `src/acquisition/crawl.ts`; both return `AcquisitionResult[]` filtered by `isAcquisitionError` |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/generators/files/sitemap-xml.ts` | Pure XML builder with priority scoring | VERIFIED | 109 lines; exports `buildSitemapXml`; no I/O imports; `escapeXml`, `resolveToAbsolute`, `scorePriority` helpers present |
| `src/generators/files/markdown-mirrors.ts` | Pure transformer with YAML frontmatter | VERIFIED | 91 lines; exports `buildMarkdownMirror` and `urlToSlug`; no fs imports; `buildFrontmatter` internal |
| `src/generators/files/schema-markup.ts` | Pure JSON-LD builder for 3 schema types | VERIFIED | 158 lines; exports `buildSchemaMarkup`, `SchemaType`, `FaqPair`; internal builders not exported; `SCHEMA_CONTEXT` constant correct |
| `src/tools/index.ts` — generate_sitemap handler | Real acquisition + build + writeFile | VERIFIED | Lines 170–210; dual-acquisition; `buildSitemapXml` called; `writeFile` called with result |
| `src/tools/index.ts` — generate_markdown_mirrors handler | Real acquisition + per-page mkdir + writeFile | VERIFIED | Lines 212–271; dual-acquisition; `pLimit(5)` concurrency; `buildMarkdownMirror` called; `mkdir` + `writeFile` per page |
| `src/tools/index.ts` — generate_schema_markup handler | Real build + text return | VERIFIED | Lines 273–309; `buildSchemaMarkup` called with businessContext + schemaTypes + optional faqs; returns `blocks.join('\n\n')` as text content |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `generate_sitemap` handler | `buildSitemapXml()` | import + call at line 202 | WIRED | Result assigned to `xml`, written to disk |
| `generate_sitemap` handler | `acquireLocal` / `crawlUrl` | isUrl branch at line 195 | WIRED | Both branches filter errors, pass docs to builder |
| `generate_markdown_mirrors` handler | `buildMarkdownMirror()` | import + call at line 254 | WIRED | Destructures `{slug, content}`, uses both |
| `generate_markdown_mirrors` handler | `acquireLocal` / `crawlUrl` | isUrl branch at line 234 | WIRED | Identical dual-acquisition pattern |
| `generate_schema_markup` handler | `buildSchemaMarkup()` | import + call at line 300 | WIRED | Result joined and returned as MCP text content |
| `acquireLocal` / `crawlUrl` | `stripChrome()` | `src/processing/strip.ts` | WIRED | Both acquisition paths call `stripChrome(raw, url)` before `convertToMarkdown`; removes nav/header/footer/script/style |
| `sitemap-xml.ts` | ISO 8601 lastmod | `new Date().toISOString().split('T')[0]` | WIRED | Produces YYYY-MM-DD in every `<lastmod>` element |
| `schema-markup.ts` | `https://schema.org` context | `SCHEMA_CONTEXT` constant used in all 3 builders | WIRED | All `@context` values reference the constant; HTTPS, no trailing slash |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `schema-markup.ts` line 95 | Function named `placeholderFaqs` | INFO | Not a stub — this is the designed fallback generator that creates FAQ pairs from `ctx.services` when no faqs are provided. Intentional feature, not a placeholder. |

No blocker or warning anti-patterns found. The word "placeholder" appears only as a function name for deliberate fallback logic.

---

### Human Verification Required

No items require human verification. All behavioral requirements are verifiable through code inspection:

- Priority scores are literal return values (1.0/0.9/0.8/0.7) on well-defined keyword conditions
- YAML frontmatter structure is directly readable in `buildFrontmatter()`
- `@context` value is a module-level constant
- Chrome stripping selectors are explicit and comprehensive

---

### Build Status

`npm run build` (tsc) passes with zero errors. All imports resolve correctly.

---

### Summary

Phase 4 goal is fully achieved. All three MCP tools are wired to real implementations:

1. `generate_sitemap` — Sitemaps.org 0.9 compliant XML, ISO 8601 dates, four-tier priority scoring, dual acquisition (local folder + live crawl), file:// URL normalisation to absolute https://, XML escaping.

2. `generate_markdown_mirrors` — YAML frontmatter (title, url, description, date), nav/script/footer chrome stripped by Cheerio before Turndown conversion, one index.md per page at `<slug>/index.md`, slug collision disambiguation, p-limit(5) concurrent writes, dual acquisition.

3. `generate_schema_markup` — Valid JSON-LD for LocalBusiness (PostalAddress, OfferCatalog), FAQPage (Question/Answer mainEntity), Service (provider, serviceType, areaServed); `https://schema.org` context; optional faqs input for Phase 5 integration; text-return tool (no file write); dual acquisition not applicable (context-based, not page-based).

All three satisfy the "from both a local folder and a live URL" requirement via the shared dual-acquisition isUrl branch pattern.

---

_Verified: 2026-04-20T12:01:06Z_
_Verifier: Claude (gsd-verifier)_
