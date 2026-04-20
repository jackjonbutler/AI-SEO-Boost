---
phase: 05-faq-content
plan: 01
subsystem: content-generation
tags: [typescript, faq, template-assembly, pure-function, mcp-handler]

# Dependency graph
requires:
  - phase: 04-sitemap-mirrors-schema
    provides: "FaqPair type exported from schema-markup.ts; faqs optional input on generate_schema_markup registered; text-return tool pattern established"
provides:
  - "buildFaqContent(ctx: BusinessContext, count?: number): FaqPair[] — pure deterministic Q&A pair generator (14-template category pool)"
  - "generate_faq_content MCP handler wired — returns JSON array of Q&A pairs as text content"
  - "src/generators/content/ subdirectory established for data-generating (non-file-emitting) generators"
affects: [generate_schema_markup, FAQPage schema pipeline, CONT-03 requirement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Category-based QaTemplate pool: (ctx: BusinessContext) => FaqPair | null, filtered at call time"
    - "content/ subdirectory under generators/ for data-output generators (vs files/ for file-output)"
    - "import type for cross-module type reuse without runtime coupling (FaqPair)"

key-files:
  created:
    - src/generators/content/faq.ts
  modified:
    - src/tools/index.ts

key-decisions:
  - "05-01: src/generators/content/faq.ts in new content/ subdirectory — distinguishes data-generating functions from file-emitting generators in files/"
  - "05-01: Templates 0-7 always fire (required fields only), guaranteeing >= 8 pairs for any valid BusinessContext"
  - "05-01: import type { FaqPair } — type-only import erased at compile time, zero runtime coupling with schema-markup.ts"
  - "05-01: buildFaqContent throws on empty businessName/businessType; handler catches and returns isError:true — mirrors 04-03 pattern"
  - "05-01: count defaults to 10, clamped to pool size (14 max) — no padding, no duplicate pairs"

patterns-established:
  - "QaTemplate pattern: module-private type alias (ctx: BusinessContext) => FaqPair | null; null return = field absent; filter at collection time"
  - "Always-fire template design: first N templates use only required fields to guarantee minimum output count for sparse context"

# Metrics
duration: 4min
completed: 2026-04-20
---

# Phase 5 Plan 01: FAQ Content Summary

**Deterministic FAQ Q&A generator from BusinessContext: 14-template category pool producing 8-10 AI-quotable pairs with zero hedging language, directly piped into generate_schema_markup FAQPage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-20T12:38:28Z
- **Completed:** 2026-04-20T12:41:58Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Implemented `buildFaqContent(ctx, count?)` as a pure function in new `src/generators/content/faq.ts` — 14 QaTemplate entries, first 8 always fire on required fields alone, guaranteeing >= 8 pairs for sparse context
- Wired `generate_faq_content` handler in `src/tools/index.ts`, replacing stub with belt-and-braces validated call returning `JSON.stringify(pairs, null, 2)` as MCP text content
- Closed CONT-03: output is `FaqPair[]` directly assignable to `generate_schema_markup`'s `faqs` input — no transformation needed

## Task Commits

Each task was committed atomically:

1. **Task 1: buildFaqContent pure function with category-based template pool** - `58647df` (feat)
2. **Task 2: Wire generate_faq_content handler — replace stub with real implementation** - `85ab492` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/generators/content/faq.ts` — Pure buildFaqContent function; 14 QaTemplate entries; import type FaqPair from schema-markup.ts
- `src/tools/index.ts` — Added buildFaqContent import; replaced generate_faq_content stubResponse with validated handler

## Decisions Made
- `content/` subdirectory created under `generators/` — distinguishes data-generating functions from file-emitting generators in `files/`
- Templates 0-7 are always-fire (use only businessName + businessType, both required fields) — guarantees the >= 8 pair floor for any valid context
- `import type { FaqPair }` used — type-only import erased at compile time, zero runtime coupling with schema-markup module
- `buildFaqContent` throws on empty businessName/businessType; handler catches and returns `isError: true` — mirrors established 04-03 pattern
- `count` defaults to 10, clamped to pool size (14 max) — consistent with `buildSchemaMarkup` never-throw at MCP boundary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 complete: `generate_faq_content` is fully implemented
- Only `generate_location_service_pages` stub remains — this is a v2 placeholder per PROJECT.md, not a Phase 5 responsibility
- Phase 6 can proceed: all 7 active v1 tools are real implementations (no stubs)
- Round-trip pipeline verified: `buildFaqContent(ctx)` output passes directly into `buildSchemaMarkup(ctx, ['FAQPage'], faqs)` without transformation

---
*Phase: 05-faq-content*
*Completed: 2026-04-20*
