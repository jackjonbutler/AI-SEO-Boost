---
phase: 04-sitemap-mirrors-schema
plan: 02
subsystem: generators
tags: [markdown, yaml-frontmatter, slug, p-limit, typescript, mcp]

# Dependency graph
requires:
  - phase: 04-01
    provides: generate_sitemap handler pattern (dual-acquisition, p-limit, MCP isError) reused here
  - phase: 02-acquisition-pipeline
    provides: acquireLocal, crawlUrl, MarkdownDocument, isAcquisitionError
  - phase: 03-file-generators
    provides: writeFile already imported in tools/index.ts; generator file pattern (pure build*() fn)

provides:
  - buildMarkdownMirror(doc) → {slug, content} — pure YAML frontmatter + markdown body transformer
  - urlToSlug(pageUrl) — stable slug derivation (strips .html, handles home page, strips /index)
  - generate_markdown_mirrors MCP tool — real handler: acquires pages, writes one index.md per page under outputDir/<slug>/index.md

affects: [04-03-schema, audit-05, any consumer needing markdown mirrors path conventions]

# Tech tracking
tech-stack:
  added: [pLimit (already dep), mkdir from node:fs/promises, path from node:path]
  patterns:
    - "Pure transformer in src/generators/files/<name>.ts — no I/O, no fs imports"
    - "p-limit(5) concurrency wrapping per-doc async writes (same as sitemap handler)"
    - "Slug collision disambiguation via per-call Set + -2/-3 suffix"
    - "Home page slug 'index' → flat outputDir/index.md; all others → outputDir/<slug>/index.md"

key-files:
  created:
    - src/generators/files/markdown-mirrors.ts
  modified:
    - src/tools/index.ts

key-decisions:
  - "urlToSlug strips /index suffix so /services/index.html → 'services' (not 'services/index')"
  - "Home page (slug === 'index') written flat at outputDir/index.md — not nested in outputDir/index/index.md"
  - "Collision Set lives inside handler (per-call scope) — never module-level — so each tool call starts fresh"
  - "buildFrontmatter double-quotes all values and escapes internal double-quotes — handles colons, hashes, leading spaces safely"
  - "description field omitted from frontmatter when empty string — no spurious 'description: \"\"' lines"

patterns-established:
  - "Pattern: YAML frontmatter always double-quoted, empty values omitted, date = generation day (not mtime)"
  - "Pattern: slug derivation handles .html/.htm, /index segment, home page edge case — urlToSlug is exported for handler re-use"

# Metrics
duration: 8min
completed: 2026-04-20
---

# Phase 4 Plan 02: Markdown Mirrors Summary

**Pure urlToSlug + buildMarkdownMirror transformer with YAML frontmatter, wired to generate_markdown_mirrors handler using dual-acquisition + p-limit(5) concurrent writes and slug collision disambiguation**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-20T17:09:08Z
- **Completed:** 2026-04-20T17:17:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/generators/files/markdown-mirrors.ts` — pure transformer exporting `buildMarkdownMirror` and `urlToSlug` with zero I/O imports
- `urlToSlug` correctly handles .html/.htm suffix stripping, /index segment removal, and home-page edge case (always → 'index')
- `buildFrontmatter` emits double-quoted YAML values, omits empty description, includes generation-day date field
- Replaced `generate_markdown_mirrors` stub with full handler: dual-acquisition, slug collision disambiguation, p-limit(5) concurrent mkdir+writeFile, MCP isError pattern

## Task Commits

1. **Task 1: buildMarkdownMirror pure function + slug derivation + YAML frontmatter** - `62f156b` (feat)
2. **Task 2: Wire generate_markdown_mirrors handler** - `a14976d` (feat)

## Files Created/Modified

- `src/generators/files/markdown-mirrors.ts` — Pure transformer: urlToSlug, buildFrontmatter (internal), buildMarkdownMirror
- `src/tools/index.ts` — Added imports (buildMarkdownMirror, mkdir, path, pLimit); replaced generate_markdown_mirrors stub with real handler

## Decisions Made

- `urlToSlug` strips `/index` segment so `/services/index.html` → `services` (not `services/index`) — prevents double-nesting
- Home page slug `'index'` writes flat to `outputDir/index.md` (not `outputDir/index/index.md`) — per Pitfall 8 in RESEARCH.md
- Per-call `writtenSlugs` Set inside handler (not module-level) — each tool invocation gets fresh collision tracking
- YAML values always double-quoted, internal quotes escaped — handles colons, hash chars, leading spaces without breaking parsers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — build passed first try, all spot-checks matched expected outputs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `generate_markdown_mirrors` is fully operational — ready for 04-03 (schema markup generator)
- `buildMarkdownMirror` and `urlToSlug` are exported — audit tool (03-01) can reference slug convention if needed
- No blockers for 04-03

---
*Phase: 04-sitemap-mirrors-schema*
*Completed: 2026-04-20*
