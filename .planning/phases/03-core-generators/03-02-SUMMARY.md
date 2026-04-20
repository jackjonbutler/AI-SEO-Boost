---
phase: 03-core-generators
plan: 02
subsystem: generators
tags: [llms-txt, mcp, typescript, node-fs, businesscontext]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: BusinessContext interface in src/types/index.ts, registerAllTools stub pattern in src/tools/index.ts
  - phase: 03-01
    provides: audit_ai_seo tool stub (not modified by this plan)
provides:
  - buildLlmsTxt pure function — spec-compliant llms.txt string builder from BusinessContext
  - generate_llms_txt MCP tool handler — writes llms.txt to disk with MCP isError error pattern
affects:
  - 03-03 (configure_robots_txt) — may reuse writeFile import already added
  - 04-xx plans that reference tools/index.ts import pattern

# Tech tracking
tech-stack:
  added: ["node:fs/promises writeFile (already built-in, no new dep)"]
  patterns:
    - "Pure generator function pattern: buildXxx(ctx: BusinessContext): string — no I/O, deterministic"
    - "MCP isError error pattern: catch block returns { content, isError: true } — handler never throws"
    - "Node16 ESM .js suffix on all local imports"
    - "Belt-and-braces validation: Zod handles parse-time, handler adds runtime guard for safety"

key-files:
  created:
    - src/generators/files/llms-txt.ts
  modified:
    - src/tools/index.ts

key-decisions:
  - "Section order is Services → Locations → Contact (matches RESEARCH.md Pattern 3, llmstxt.org verified)"
  - "Empty array services:[] produces no H2 section (checked ctx.services && ctx.services.length > 0)"
  - "POSIX newline: trimEnd() + '\\n' ensures no trailing blank lines but exactly one trailing newline"
  - "No 'About' or 'Pricing' sections in v1 (no corresponding BusinessContext fields, confirmed RESEARCH.md)"
  - "writeFile imported from node:fs/promises (not fs/promises) for explicit Node built-in clarity"

patterns-established:
  - "Generator pattern: src/generators/files/<name>.ts exports a pure build<Name>(ctx) function"
  - "Tool handler wraps generator + I/O in try/catch; returns isError:true on any failure"
  - "Belt-and-braces: Zod validates at parse time, handler guards key fields at runtime"

# Metrics
duration: 8min
completed: 2026-04-20
---

# Phase 3 Plan 02: llms.txt Generator Summary

**Pure buildLlmsTxt function writing spec-compliant llms.txt (H1 + blockquote + conditional H2 sections) with a wired MCP tool handler using fs.writeFile and the isError error pattern**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-20T10:25:16Z
- **Completed:** 2026-04-20T10:33:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Created `src/generators/files/llms-txt.ts` with a pure, deterministic `buildLlmsTxt(ctx: BusinessContext): string` function
- Sections Services, Locations, Contact are emitted only when content is present — empty arrays/strings never produce empty H2 sections
- Replaced the `generate_llms_txt` stub handler in `src/tools/index.ts` with real implementation: validates inputs, calls `buildLlmsTxt`, writes file via `fs.writeFile`, returns byte count
- Full error handling: empty outputPath and missing businessName both return `isError: true` with descriptive messages; all file system errors are caught

## Task Commits

1. **Task 1: buildLlmsTxt pure function** - `526c792` (feat)
2. **Task 2: Wire generate_llms_txt tool handler** - `4c4b27a` (feat)

## Files Created/Modified

- `src/generators/files/llms-txt.ts` — Pure function exporting `buildLlmsTxt(ctx: BusinessContext): string`. No I/O, no side effects. Builds llms.txt per llmstxt.org spec.
- `src/tools/index.ts` — Added `import { buildLlmsTxt }` and `import { writeFile }` imports; replaced generate_llms_txt stub with real handler

## Decisions Made

- **Section order**: Services → Locations → Contact — matches llmstxt.org spec as verified in RESEARCH.md Pattern 3
- **Empty section guard**: `ctx.services && ctx.services.length > 0` before emitting `## Services`. Same pattern for location and contact fields.
- **POSIX newline**: `lines.join('\n').trimEnd() + '\n'` — strips trailing blank lines, appends exactly one trailing newline
- **No About/Pricing sections in v1**: `businessType` alone does not warrant a section (can go into description); no pricing field in BusinessContext
- **node:fs/promises writeFile**: explicit Node built-in specifier (not `fs/promises`) for clarity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification Output

Full-context test run (`/tmp/llms.txt` contents, 192 bytes):

```
# Acme Wraps

> Denver vehicle wrap specialists since 2010

## Services
- Fleet Wraps
- Color Change

## Locations
- Denver, CO

## Contact
- Phone: (720) 555-0100
- Website: https://acme.com
```

Minimal context test: `buildLlmsTxt({businessName: 'Acme', businessType: 'test'})` → `"# Acme\n"` (H1 only, single trailing newline).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `buildLlmsTxt` and the wired tool handler are complete — generate_llms_txt is production-ready for plan 03-03 and beyond
- `writeFile` import already present in `src/tools/index.ts` — plan 03-03 (configure_robots_txt) can reuse it without duplication
- All 6 verification criteria from plan met: build passes, server starts, minimal context, full context, empty outputPath isError, and empty businessName isError

---
*Phase: 03-core-generators*
*Completed: 2026-04-20*
