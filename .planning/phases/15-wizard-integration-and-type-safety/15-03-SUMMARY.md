---
phase: 15-wizard-integration-and-type-safety
plan: 03
subsystem: testing
tags: [typescript, regression-gate, smoke-test, dispatch-table, wizard, type-safety]

# Dependency graph
requires:
  - phase: 15-01
    provides: "SuggestedToolCall literal union in src/audit/types.ts, AuditFinding.suggestedToolCall narrowed"
  - phase: 15-02
    provides: "Record<SuggestedToolCall, FixHandler> dispatch table, WIZ-02 acc pre-seed from suggestedToolCallArgs.recommendedType"
provides:
  - "Offline regression gate scripts/smoke-phase15-wizard-integration.mjs covering all 4 Phase 15 success criteria"
  - "SC-1: regex verifies SuggestedToolCall union exists with all 5 members in types.ts"
  - "SC-2: regex verifies dispatch table structure + all 5 handlers + TOOL_FIELD_MAP tightening in tools/index.ts"
  - "SC-3: regex + ordering check verifies pre-seed block reads recommendedType with !acc.schemaTypes guard BEFORE elicitInput"
  - "SC-4: execSync('npx tsc --noEmit') verifies zero TypeScript errors"
affects:
  - "future phases (any refactor touching dispatch table or accumulator pre-seed)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static source-inspection smoke scripts: readFileSync + regex assertions as offline regression gates (no dist/ import, no network, no MCP server startup)"
    - "Ordering assertion via String.indexOf within loop body substring: extracts the gap-fill loop body by slicing between first and second occurrence of the loop pattern, then compares indexOf of pre-seed and elicitInput"
    - "tsc invocation via execSync('npx tsc --noEmit') — synchronous, throws on non-zero, consistent with sibling scripts"

key-files:
  created:
    - scripts/smoke-phase15-wizard-integration.mjs
  modified: []

key-decisions:
  - "execSync (not execFileSync) used for tsc — matches smoke-phase14-coverage.mjs sibling style; shell: false by default on Windows, but npx.cmd resolution handled by execSync's shell lookup"
  - "Ordering check for SC-3 uses first+second loop occurrence substring trick — avoids complex brace-counting while reliably scoping the pre-seed vs elicit ordering assertion"
  - "SC-2 negative test also triggers SC-4 FAIL (renaming dispatchTable breaks FixHandler_DISABLED type) — expected and acceptable, demonstrates multi-layer regression detection"

patterns-established:
  - "Offline regression gate pattern for wizard: read source, apply regex, check ordering, run tsc — no runtime I/O needed to verify structural invariants"
  - "Negative test validation: two manipulations each force a specific targeted FAIL, confirming script detects structural regressions not incidental substrings"

# Metrics
duration: 3min
completed: 2026-04-21
---

# Phase 15 Plan 03: Smoke Regression Gate Summary

**Offline smoke script smoke-phase15-wizard-integration.mjs validates all 4 Phase 15 success criteria in one command: SuggestedToolCall union shape, dispatch table structure, pre-seed ordering, and tsc clean**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-21T10:35:29Z
- **Completed:** 2026-04-21T10:38:47Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Authored `scripts/smoke-phase15-wizard-integration.mjs` as a 297-line Node ESM static regression gate
- SC-1: Reads `src/audit/types.ts`, asserts the `SuggestedToolCall` union type alias exists with all 5 member literals, and confirms `AuditFinding.suggestedToolCall` is typed as `SuggestedToolCall` (not `string`)
- SC-2: Reads `src/tools/index.ts`, confirms `switch (toolName)` is absent, `Record<SuggestedToolCall, FixHandler>` type present, `dispatchTable` typed const declared, all 5 handler keys exist as async properties, dispatch call site present, and `TOOL_FIELD_MAP` key type tightened
- SC-3: Reads `src/tools/index.ts`, confirms `finding.suggestedToolCallArgs` referenced, `args['recommendedType']` read, `acc.schemaTypes = [...]` written, `!acc.schemaTypes` guard present, and the pre-seed block appears before the `server.server.elicitInput` call within the gap-fill loop body (ordering verified via `String.indexOf` on a substring of the loop body)
- SC-4: Invokes `npx tsc --noEmit` via `execSync`, verifies exit code 0 and no `error TS` in output
- All 4 checks confirmed `[PASS]` on clean tree; script exits 0 with `Phase 15 smoke: 4/4 checks passed.`
- Negative tests confirmed: renaming `dispatchTable` to `switchTable` forces `[FAIL] SC-2` (and `[FAIL] SC-4` as expected side-effect); removing `!acc.schemaTypes` guard forces `[FAIL] SC-3` only

## Task Commits

Each task was committed atomically:

1. **Task 1: Author smoke-phase15-wizard-integration.mjs regression gate** - `8ae26ae` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `scripts/smoke-phase15-wizard-integration.mjs` — 4-check offline regression gate: SC-1 (SuggestedToolCall union), SC-2 (dispatch table), SC-3 (pre-seed ordering), SC-4 (tsc --noEmit); exits 0 on 4/4 pass, exits 1 on any failure

## Decisions Made

- Used `execSync('npx tsc --noEmit', { stdio: 'pipe' })` — consistent with the synchronous, sequential character of the gate; `stdio: 'pipe'` captures output for error reporting without polluting the pass/fail console view
- Ordering assertion for SC-3 extracts the gap-fill loop body by locating the first and second occurrences of the `for (const finding of selectedFindings)` pattern, then uses `indexOf` within that substring — avoids fragile brace-counting, correctly scopes the assertion to the gap-fill loop only
- Negative-test manipulation for SC-2 also triggers SC-4 because the type rename (`FixHandler_DISABLED`) makes TypeScript fail; documented as expected multi-layer behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 15 is fully shipped: WIZ-01 (typed dispatch) + WIZ-02 (accumulator pre-seed) + regression gate all in place
- All four Phase 15 success criteria verifiable in one command: `node scripts/smoke-phase15-wizard-integration.mjs`
- v1.2 milestone ready to close (Phases 11-15 complete)
- Future refactors that touch the dispatch table, accumulator pre-seed, or SuggestedToolCall union will be caught by this gate before production

---
*Phase: 15-wizard-integration-and-type-safety*
*Completed: 2026-04-21*
