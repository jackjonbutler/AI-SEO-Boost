---
phase: 04-sitemap-mirrors-schema
plan: 01
subsystem: generators
tags: [sitemap, xml, sitemaps-org, priority-scoring, acquisition, mcp-tool]

requires:
  - phase: 02-acquisition-pipeline
    provides: acquireLocal and crawlUrl — dual acquisition used by generate_sitemap handler
  - phase: 03-core-generators
    provides: writeFile import in tools/index.ts (03-02), generator file pattern (03-02)

provides:
  - buildSitemapXml(docs, baseUrl): string — pure sitemaps.org 0.9 XML builder with priority scoring
  - generate_sitemap MCP tool handler — real acquisition + buildSitemapXml + writeFile, replaces stub
affects:
  - 04-02 (markdown mirrors) — same dual-acquisition pattern to reuse
  - 04-03 (schema markup) — no direct dependency but shares tools/index.ts

tech-stack:
  added: []
  patterns:
    - "Pure generator function in src/generators/files/<name>.ts — no I/O, exported as build<Name>()"
    - "Dual acquisition pattern: isUrl check -> crawlUrl | acquireLocal, filter with isAcquisitionError"
    - "XML escaping: & first to avoid double-encoding"

key-files:
  created:
    - src/generators/files/sitemap-xml.ts
  modified:
    - src/tools/index.ts

key-decisions:
  - "file:// URLs from local acquisition converted to https:// via basename extraction in resolveToAbsolute — no file:// leaks into <loc> values"
  - "scorePriority operates on resolved absolute URL (not raw doc.url) — consistent scoring regardless of acquisition mode"
  - "Empty docs array emits valid urlset with zero url children rather than throwing — mirrors never-throw pattern from 03-01"
  - "xmlns uses http://www.sitemaps.org/schemas/sitemap/0.9 (http, not https) — correct per sitemaps.org spec even though emitted URLs are https"

patterns-established:
  - "Priority scoring: 1.0 home (empty segments), 0.9 service keywords in slug, 0.8 info keywords at depth-1, 0.7 everything else"
  - "resolveToAbsolute: index.html basename maps to trailing slash (home); other files strip .html extension"

duration: 8min
completed: 2026-04-20
---

# Phase 04 Plan 01: XML Sitemap Generator Summary

**Sitemaps.org 0.9 compliant XML generator with priority scoring (1.0/0.9/0.8/0.7) and dual local/crawl acquisition wired to MCP generate_sitemap tool**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-20T15:44:12Z
- **Completed:** 2026-04-20T15:52:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Pure `buildSitemapXml()` function in `src/generators/files/sitemap-xml.ts` — deterministic, no I/O, sitemaps.org 0.9 spec
- Priority scoring: home 1.0, service keywords 0.9, info keywords at depth 1 = 0.8, everything else 0.7
- `file://` to `https://` URL normalisation — local acquisitions never leak file:// into `<loc>` values
- Ampersand XML escaping (& first, then <, >, ") — no double-encoding
- `generate_sitemap` handler fully wired: validates inputs, acquires docs, filters errors, builds + writes XML

## Task Commits

1. **Task 1: buildSitemapXml pure function + priority scoring** - `7e319fd` (feat)
2. **Task 2: Wire generate_sitemap handler (dual-acquisition + write)** - `35671da` (feat)

## Files Created/Modified

- `src/generators/files/sitemap-xml.ts` — pure buildSitemapXml() with escapeXml, resolveToAbsolute, scorePriority helpers
- `src/tools/index.ts` — generate_sitemap stub replaced with real dual-acquisition handler; 4 new imports added

## Decisions Made

- `scorePriority` operates on the resolved absolute URL (post-`resolveToAbsolute`) so scoring is always consistent regardless of acquisition mode (local file:// or crawl https://)
- `resolveToAbsolute` uses `path.basename` on file:// pathname — does not attempt to reconstruct folder-relative paths since the generator receives no source folder context; sufficient for single-level sites and correct for home/services common cases
- `xmlns` attribute uses `http://` (not `https://`) per official sitemaps.org spec
- `isAcquisitionError` and `MarkdownDocument` both imported from `types/index.ts` — already exported there from Phase 2

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Windows `/tmp` path used in smoke test failed (Node resolves to `C:\tmp` which doesn't exist); switched to `C:/Users/jackb/AppData/Local/Temp/` — environment-specific, no code impact.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `buildSitemapXml` available for import by other generators if needed
- Dual acquisition pattern documented and proven — 04-02 (markdown mirrors) can follow same pattern
- `generate_sitemap` tool fully functional end-to-end; ready for Phase 4 plan 02

---
*Phase: 04-sitemap-mirrors-schema*
*Completed: 2026-04-20*
