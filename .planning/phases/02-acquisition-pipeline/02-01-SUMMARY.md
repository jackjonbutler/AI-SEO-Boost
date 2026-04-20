---
phase: 02-acquisition-pipeline
plan: 01
subsystem: api
tags: [cheerio, turndown, p-limit, html-processing, markdown, acquisition, typescript]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: BusinessContext type in src/types/index.ts, tsconfig with Node16 ESM and esModuleInterop:true

provides:
  - MarkdownDocument, AcquisitionError, AcquisitionResult types and isAcquisitionError guard in src/types/index.ts
  - stripChrome(rawHtml, pageUrl?) in src/processing/strip.ts — Cheerio-based chrome removal and href absolutisation
  - convertToMarkdown(cleanHtml) in src/processing/convert.ts — Turndown HTML-to-Markdown conversion
  - acquireLocal(folderPath) in src/acquisition/local.ts — FS-walk + process pipeline returning AcquisitionResult[]

affects:
  - 02-acquisition-pipeline (all subsequent plans in this phase use acquireLocal)
  - 03-content-generators (sitemap, mirrors, schema, audit, llms.txt tools will consume AcquisitionResult)

# Tech tracking
tech-stack:
  added:
    - cheerio (HTML parsing and manipulation)
    - turndown (HTML to Markdown conversion)
    - p-limit@6 (concurrency limiting — installed, not yet used)
    - "@types/turndown" (TypeScript types for Turndown)
  patterns:
    - Module-level singleton for TurndownService (constructed once, reused per call)
    - Never-throw acquisition: per-file errors become AcquisitionError entries, not exceptions
    - fileUrl computed before try/catch so error entries always have a url value
    - All src/ imports use .js extensions (Node16 ESM requirement)
    - types/index.ts remains zero-import leaf node — only plain TS interfaces and guards

key-files:
  created:
    - src/processing/strip.ts
    - src/processing/convert.ts
    - src/acquisition/local.ts
  modified:
    - src/types/index.ts
    - package.json
    - package-lock.json

key-decisions:
  - "p-limit@6 pinned (not @7): p-limit 7 requires Node 20; project engines.node >=18; v6 has identical API"
  - "No @types/cheerio: cheerio 1.x ships native TypeScript types"
  - "TurndownService singleton at module level: stateless after construction, safe to reuse"
  - "recursive:true without withFileTypes:true in readdir: avoids Node 18.17-18.18 bug that drops entries silently"
  - "acquireLocal uses sequential for-loop (not Promise.all): p-limit concurrency control deferred to future plan"

patterns-established:
  - "Acquisition never throws: wrap every per-file operation in try/catch, emit AcquisitionError on failure"
  - "stripChrome absolutises hrefs BEFORE removing chrome elements so surviving body links are absolute"
  - "Processing pipeline order: readFile → stripChrome (title + hrefs + chrome removal) → convertToMarkdown"

# Metrics
duration: 12min
completed: 2026-04-20
---

# Phase 2 Plan 1: Local Acquisition Pipeline Summary

**Cheerio + Turndown pipeline that walks a local HTML folder and returns typed MarkdownDocument objects with chrome stripped, hrefs absolutised, and titles extracted**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-20T09:36:27Z
- **Completed:** 2026-04-20T09:48:00Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- Extended `src/types/index.ts` with `MarkdownDocument`, `AcquisitionError`, `AcquisitionResult`, and `isAcquisitionError` guard — zero new imports, leaf-node pattern maintained
- Built `src/processing/strip.ts`: Cheerio-based chrome removal (nav, header, footer, script, style, etc.), href absolutisation before removal, title/description extraction, main/article/body fallback
- Built `src/processing/convert.ts`: Turndown HTML-to-Markdown with module-level singleton, noise element removal (form, button, iframe), atx heading and fenced code styles
- Built `src/acquisition/local.ts`: recursive FS walk for `.html` files, per-file try/catch producing `AcquisitionError` on failure, `file://` URIs from `pathToFileURL`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and extend shared types** - `8a4343c` (feat)
2. **Task 2: Build processing layer — strip.ts and convert.ts** - `3334afe` (feat)
3. **Task 3: Build local acquisition — local.ts** - `13e6e15` (feat)

## Files Created/Modified

- `src/types/index.ts` — Added MarkdownDocument, AcquisitionError, AcquisitionResult, isAcquisitionError
- `src/processing/strip.ts` — Cheerio chrome stripping + href absolutisation + StripResult
- `src/processing/convert.ts` — Turndown HTML-to-Markdown converter (module singleton)
- `src/acquisition/local.ts` — FS walk + process pipeline, returns AcquisitionResult[]
- `package.json` — Added cheerio, turndown, p-limit@6, @types/turndown
- `package-lock.json` — Lockfile updated

## Decisions Made

- Pinned p-limit@6 (not v7): v7 requires Node 20 but project declares `engines.node >=18`; v6 has identical API
- No `@types/cheerio`: cheerio 1.x ships native TypeScript types; installing @types/cheerio would conflict
- TurndownService constructed once at module level, not inside `convertToMarkdown()` — safe because it's stateless after construction and avoids per-call overhead
- `readdir({ recursive: true })` without `withFileTypes: true` — avoids Node 18.17–18.18 bug that silently drops entries when both options are combined
- Sequential `for` loop in `acquireLocal` for simplicity; p-limit installed for when concurrency control is added in a future plan

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Smoke test for `acquireLocal` in Task 3 initially attempted to use `/tmp/test-html` but on Windows, Node.js resolves this as `C:\tmp` which doesn't exist in the bash shell environment. Fixed by using a local `test-tmp-html/` directory within the project root instead. The test folder was deleted after verification.

## User Setup Required

None — no external service configuration required. All dependencies are npm packages.

## Next Phase Readiness

- `acquireLocal()` ready for use by all five content-generating tools (sitemap, mirrors, schema, audit, llms.txt)
- `AcquisitionResult` type is the shared contract between acquisition and generation layers
- `isAcquisitionError` guard enables clean error filtering in tool implementations
- Phase 2 Plan 2 (web crawl acquisition) can use the same `MarkdownDocument` shape and processing pipeline

Concern carried forward: Decide whether to add iconv-lite for charset detection or document UTF-8-only as v1 limitation (per STATE.md blockers).

---
*Phase: 02-acquisition-pipeline*
*Completed: 2026-04-20*
