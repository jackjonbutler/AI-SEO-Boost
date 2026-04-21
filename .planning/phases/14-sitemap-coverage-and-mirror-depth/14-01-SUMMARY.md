---
phase: 14-sitemap-coverage-and-mirror-depth
plan: 01
subsystem: audit
tags: [cheerio, sitemap, xml, markdown-mirrors, coverage]

# Dependency graph
requires:
  - phase: 12-framework-awareness
    provides: FrameworkDetection type and buildMarkdownPlacementNote pattern in markdown.ts
  - phase: 11-audit-observability
    provides: AuditFinding type, dimensions pattern
provides:
  - sitemap-driven coverage estimator in checkMarkdownMirrors
  - fetchSitemapUrls with sitemapindex (COV-02) detection
  - sampleUrls cap at 20 (COV-03)
  - toMdUrl and hasMdMirror HEAD-probe helpers
  - estimated coverage percentage in AuditFinding message
affects: [15-wizard-type-narrowing]

# Tech tracking
tech-stack:
  added: [cheerio (xml: true mode — already installed, now imported in markdown.ts)]
  patterns:
    - "Sitemap index detection via $('sitemapindex').length > 0 then fetch first child"
    - "Evenly-spread URL sampling: Math.floor(i * (urls.length / maxSample))"
    - "Per-probe AbortSignal.timeout(4000) + Promise.all for parallel HEAD probes"
    - "null = no sitemap, [] = empty sitemap, string[] = parseable URLs"

key-files:
  created: []
  modified:
    - src/audit/dimensions/markdown.ts

key-decisions:
  - "cheerio loaded with { xml: true } (not deprecated xmlMode: true)"
  - "Sitemap index: fetch only first child sitemap — fetching all defeats sample cap"
  - "Coverage results in message string only — no diagnostics field (AuditFindingDiagnostics.checkedUrl is singular string, not array)"
  - "null/[] distinction: null = fetch failed/404 (warning), [] = parsed but empty (warning), URLs present = run coverage"
  - "Thresholds: 100% → pass, 1-99% → warning, 0% → fail"

patterns-established:
  - "Pattern: null-sentinel distinguishes unreachable sitemap from empty sitemap"
  - "Pattern: Promise.all on hasMdMirror for parallel HEAD probes within sample cap"

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 14 Plan 01: Sitemap Coverage and Mirror Depth Summary

**Replaced binary /index.md HEAD check in checkMarkdownMirrors with sitemap-driven coverage estimator using cheerio XML parsing, sitemapindex detection, 20-URL sample cap, and parallel HEAD probes reporting estimated N% coverage**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-21T09:27:48Z
- **Completed:** 2026-04-21T09:29:06Z
- **Tasks:** 2 (both committed together as single atomic change to markdown.ts)
- **Files modified:** 1

## Accomplishments

- Five helper functions added to markdown.ts: fetchUrlsFromSitemap, fetchSitemapUrls (COV-01/COV-02), sampleUrls (COV-03), toMdUrl, hasMdMirror
- fetchSitemapUrls correctly handles sitemap index files by detecting `$('sitemapindex').length > 0` and fetching first child sitemap
- checkMarkdownMirrors URL branch now reports "N/M sampled URLs have a mirror — estimated X% coverage" instead of binary pass/fail
- tsc --noEmit exits with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sitemap helpers to markdown.ts** - `3f265b2` (feat)
2. **Task 2: Replace binary URL check with coverage logic** - `3f265b2` (feat — same commit, both tasks modify markdown.ts atomically)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/audit/dimensions/markdown.ts` — Added cheerio import, five helpers (fetchUrlsFromSitemap, fetchSitemapUrls, sampleUrls, toMdUrl, hasMdMirror), replaced binary URL branch with sitemap coverage estimator

## Decisions Made

- `{ xml: true }` used for cheerio (not deprecated `xmlMode: true`) — per research flag from Phase 14 RESEARCH.md
- Only first child sitemap fetched from sitemapindex — fetching all would defeat the 20-probe cap
- Coverage expressed in `message` string only — `AuditFindingDiagnostics.checkedUrl` is a single string, not array; no new types.ts changes needed
- null sentinel from fetchSitemapUrls means "no sitemap or unreachable", distinct from [] (empty sitemap)
- Thresholds: 100% sampled → pass, 1-99% → warning, 0% → fail

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- COV-01, COV-02, COV-03 closed
- markdown.ts compiles clean with zero TypeScript errors
- Phase 14 plan 01 complete; ready for any remaining Phase 14 plans or Phase 15 (wizard type narrowing)
- No blockers

---
*Phase: 14-sitemap-coverage-and-mirror-depth*
*Completed: 2026-04-21*
