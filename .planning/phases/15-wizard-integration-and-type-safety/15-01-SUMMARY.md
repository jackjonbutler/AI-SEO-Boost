---
phase: 15-wizard-integration-and-type-safety
plan: 01
subsystem: audit
tags: [typescript, types, robots-txt, wizard, type-safety]

# Dependency graph
requires:
  - phase: 10-tool-execution-engine
    provides: "5-branch wizard dispatch table with suggestedToolCall string literals in all 5 dimension files"
  - phase: 13-schema-type-inference
    provides: "suggestedToolCallArgs: { recommendedType } pattern established on schema findings"
provides:
  - "SuggestedToolCall literal union exported from src/audit/types.ts (5 members)"
  - "AuditFinding.suggestedToolCall narrowed from string to SuggestedToolCall"
  - "robots-txt missing-bots findings enriched with suggestedToolCallArgs: { missingBots: string[] }"
affects:
  - "15-02 (dispatch-table refactor and accumulator pre-seeding — consumes SuggestedToolCall import and missingBots payload)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SuggestedToolCall literal union adds compile-time enforcement: new tool names cause dispatch-table errors until handler added"
    - "suggestedToolCallArgs on fail findings pre-seeds wizard accumulator with audit-captured data"

key-files:
  created: []
  modified:
    - src/audit/types.ts
    - src/audit/dimensions/robots-txt.ts

key-decisions:
  - "Plain string-literal union (not const enum or runtime array) — zero runtime cost, consistent with Severity and AuditDimension unions in same file"
  - "SuggestedToolCall placed in src/audit/types.ts (not src/types/index.ts) — audit-domain-scoped, avoids leaf-node import issue"
  - "suggestedToolCallArgs.missingBots added only on missing.length > 0 fail paths — 404/ENOENT paths have no missing array; tool re-detects from disk"

patterns-established:
  - "Exhaustive union enforcement: adding a new SuggestedToolCall member forces dispatch-table compile error in tools/index.ts until handler added"
  - "Audit-side pre-seed pattern: dimension computes data during audit, stores in suggestedToolCallArgs, wizard consumes on execution"

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 15 Plan 01: Type Safety Foundation Summary

**SuggestedToolCall string literal union declared in types.ts with 5 members, AuditFinding.suggestedToolCall narrowed from string, and robots-txt missing-bots findings enriched with suggestedToolCallArgs: { missingBots } for Plan 02 pre-seeding**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-21T10:27:13Z
- **Completed:** 2026-04-21T10:28:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Declared `SuggestedToolCall` literal union (5 members) with JSDoc explaining the dispatch-table enforcement contract
- Narrowed `AuditFinding.suggestedToolCall` from `string` to `SuggestedToolCall` — all 15 emission sites across 5 dimension files already used exact-literal strings; zero changes needed in dimension files
- Added `suggestedToolCallArgs: { missingBots: missing }` to the two `missing.length > 0` fail-path returns in robots-txt.ts (URL branch line 80, local-folder branch line 117)
- `tsc --noEmit` passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare SuggestedToolCall union and narrow AuditFinding.suggestedToolCall** - `3687c16` (feat)
2. **Task 2: Seed suggestedToolCallArgs.missingBots in robots-txt findings** - `4ad6c4f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/audit/types.ts` — Added `SuggestedToolCall` literal union above `AuditFindingDiagnostics` (lines 18-30); narrowed `AuditFinding.suggestedToolCall` field from `string` to `SuggestedToolCall` (line 47)
- `src/audit/dimensions/robots-txt.ts` — Added `suggestedToolCallArgs: { missingBots: missing }` to URL-branch fail return (line 80) and local-folder-branch fail return (line 117)

## Decisions Made

- Used plain string-literal union rather than `const enum` or runtime array — consistent with existing `Severity` and `AuditDimension` unions; zero runtime cost; no import complications
- Placed `SuggestedToolCall` in `src/audit/types.ts`, not `src/types/index.ts` — audit-domain-scoped; avoids leaf-node import cycle documented in RESEARCH.md Pitfall 1
- Added `missingBots` only to `missing.length > 0` fail paths, not 404/ENOENT paths — at 404/ENOENT, no `missing` array is computed; the `configure_robots_txt` tool re-scans the on-disk file at execution time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can `import type { SuggestedToolCall }` from `src/audit/types.js` and use it to type the dispatch-table keys in `tools/index.ts`
- Plan 02 can consume `finding.suggestedToolCallArgs?.missingBots` from robots-txt findings in the accumulator pre-seed block
- Both enrichment sites confirmed at lines 80 and 117 of `src/audit/dimensions/robots-txt.ts`
- No blockers.

---
*Phase: 15-wizard-integration-and-type-safety*
*Completed: 2026-04-21*
