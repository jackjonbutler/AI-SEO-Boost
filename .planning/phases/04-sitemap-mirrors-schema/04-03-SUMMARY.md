---
phase: 04-sitemap-mirrors-schema
plan: 03
subsystem: generators
tags: [schema-org, json-ld, seo, mcp, typescript]

requires:
  - phase: 04-01
    provides: buildSitemapXml — established generator pattern and Phase 4 file structure
  - phase: 04-02
    provides: buildMarkdownMirror — reinforced pure-function generator pattern used here
provides:
  - buildSchemaMarkup(ctx, types, faqs?) — pure JSON-LD builder for LocalBusiness, FAQPage, Service
  - generate_schema_markup MCP tool wired to real implementation (returns text, no file write)
  - Optional faqs input on generate_schema_markup for direct Phase 5 integration
affects: [phase-05-faq-content, any-caller-consuming-json-ld-schema]

tech-stack:
  added: []
  patterns:
    - "Pure generator pattern: src/generators/files/<name>.ts exports pure build<Name>() — no I/O, no Zod"
    - "MCP text-return tool (not file-emit): generate_schema_markup returns JSON-LD as content text for caller to paste"
    - "Optional-field omission: conditional inclusion of all optional BusinessContext fields — never null/empty keys in output"
    - "Placeholder fallback: FAQPage uses auto-generated pairs from services when faqs param absent"

key-files:
  created:
    - src/generators/files/schema-markup.ts
  modified:
    - src/tools/index.ts

key-decisions:
  - "generate_schema_markup returns text content (no outputPath, no file write) — caller pastes JSON-LD into HTML head; distinct from other Phase 4 tools that write files"
  - "placeholderFaqs capped at 5 pairs to avoid ballooning output — one per service or single generic pair"
  - "Service blocks: falls back to ctx.businessType as service name when ctx.services is absent — always emits at least one block"
  - "buildSchemaMarkup throws on structural errors (empty businessName, empty types); handler catches and returns isError:true — never-throw at MCP boundary"
  - "faqs optional input added to inputSchema now (not Phase 5) — enables direct piping from generate_faq_content without schema change later"
  - "All blocks use JSON.stringify(obj, null, 2) — guarantees correct escaping of <, quotes, newlines per RESEARCH.md Pitfall 6"

patterns-established:
  - "SCHEMA_CONTEXT = 'https://schema.org' module-level constant — single source, HTTPS, no trailing slash (RESEARCH.md Pitfall 5)"
  - "Internal builder functions (not exported): buildLocalBusiness, buildFaqPage, buildService, placeholderFaqs — public API is only buildSchemaMarkup"

duration: 3min
completed: 2026-04-20
---

# Phase 4 Plan 03: Schema Markup Generator Summary

**Pure buildSchemaMarkup() emitting valid JSON-LD for LocalBusiness, FAQPage, and Service types, wired to generate_schema_markup MCP handler returning text content with optional faqs input**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-20T11:55:18Z
- **Completed:** 2026-04-20T11:57:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- buildSchemaMarkup pure function: deterministic, no I/O, no Zod — follows established Phase 4 generator pattern
- Three type builders: LocalBusiness (PostalAddress + OfferCatalog), FAQPage (Google mainEntity[Question/Answer]), Service (one block per service with provider + serviceType)
- All optional BusinessContext fields omitted when absent — no null/empty value leaks
- generate_schema_markup handler replaced stub with real implementation; extended inputSchema with optional faqs array for future Phase 5 integration
- Phase 4 fully complete: all three generators live (sitemap-xml, markdown-mirrors, schema-markup), all three MCP handlers wired

## Task Commits

Each task was committed atomically:

1. **Task 1: buildSchemaMarkup pure function + 3 type builders** - `56c9146` (feat)
2. **Task 2: Wire generate_schema_markup handler + optional faqs input** - `06b49a8` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/generators/files/schema-markup.ts` — Pure JSON-LD builder; exports buildSchemaMarkup, SchemaType, FaqPair
- `src/tools/index.ts` — generate_schema_markup handler wired to buildSchemaMarkup; faqs field added to inputSchema; buildSchemaMarkup/FaqPair/SchemaType imported

## Decisions Made

- generate_schema_markup is a text-return tool (not file-emit): returns JSON-LD blocks for caller to embed in `<head>` — no outputPath param, intentionally different from generate_sitemap and generate_markdown_mirrors
- faqs optional input added proactively to inputSchema so Phase 5's generate_faq_content output can be piped directly without a schema-breaking change later
- placeholderFaqs caps at 5 pairs to prevent ballooning output when a business has many services
- Service fallback: uses ctx.businessType as service name when ctx.services is absent — always emits at least one Service block

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 4 fully complete: sitemap XML, markdown mirrors, schema markup — all generators live, all handlers wired, npm run build clean
- Phase 5 (generate_faq_content) can pipe output directly to generate_schema_markup via the faqs[] input — schema is already in place
- Remaining stub tools: generate_faq_content (Phase 5), generate_location_service_pages (v2)

---
*Phase: 04-sitemap-mirrors-schema*
*Completed: 2026-04-20*
