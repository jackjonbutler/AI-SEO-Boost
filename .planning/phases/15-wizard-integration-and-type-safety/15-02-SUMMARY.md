---
phase: 15-wizard-integration-and-type-safety
plan: 02
subsystem: wizard
tags: [typescript, type-safety, dispatch-table, accumulator, wizard, mcp]

# Dependency graph
requires:
  - phase: 15-01
    provides: "SuggestedToolCall literal union in src/audit/types.ts, AuditFinding.suggestedToolCall narrowed, suggestedToolCallArgs.missingBots on robots-txt findings"
  - phase: 10-tool-execution-engine
    provides: "5-branch wizard switch statement in src/tools/index.ts and TOOL_FIELD_MAP static map"
  - phase: 13-schema-type-inference
    provides: "suggestedToolCallArgs: { recommendedType } pattern on schema findings"
provides:
  - "Record<SuggestedToolCall, FixHandler> dispatch table replacing switch in wizard execution loop"
  - "TOOL_FIELD_MAP typed Record<SuggestedToolCall, ...> for compile-time exhaustiveness on gap-fill"
  - "WIZ-02 accumulator pre-seed block merging finding.suggestedToolCallArgs into acc before gap-fill"
  - "acc.schemaTypes pre-populated from suggestedToolCallArgs.recommendedType — schema type question skipped"
affects:
  - "15-03 (smoke regression gate — exercises dispatch table and pre-seed together)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed dispatch table: Record<SuggestedToolCall, FixHandler> local to registerAllTools — handlers close over wizard-local state, exhaustiveness enforced by compiler"
    - "Accumulator pre-seed: audit-captured data (recommendedType) flows into acc before gap-fill loop computes missing fields — user never re-asked for data the audit already knows"
    - "Simplified guard: !toolName replaces !toolName || !TOOL_FIELD_MAP[toolName] in both loops after TOOL_FIELD_MAP is typed Record<SuggestedToolCall, ...>"

key-files:
  created: []
  modified:
    - src/tools/index.ts

key-decisions:
  - "FixHandler type declared inside registerAllTools (not module scope) — handlers must close over acc, fixResults, fixErrors, target, and server; module-scope table would require passing all 5 as params (RESEARCH.md Pitfall 4)"
  - "generate_markdown_mirrors handler renames local isUrl to isUrlTarget to avoid shadowing the exported isUrl() from audit/types.ts — cleaner than preserving silent shadowing"
  - "missingBots not seeded into acc — no AccumulatedContext field maps to it; patchRobotsTxt re-detects from disk (RESEARCH.md Pitfall 6)"
  - "!acc.schemaTypes guard on recommendedType seed prevents overwriting user-supplied schemaTypes from earlier iterations (RESEARCH.md Pitfall 5)"

patterns-established:
  - "Dispatch-table exhaustiveness: add a SuggestedToolCall member without a handler key -> tsc compile error. Confirmed by compile-error drill (removed generate_faq_content, got TS errors, restored)."
  - "Pre-seed-before-gap-fill: always seed acc from audit-captured args before computing allMissing, so pre-seeded fields drop out of the gap-fill question automatically"

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 15 Plan 02: Dispatch Table and Accumulator Pre-Seed Summary

**Record<SuggestedToolCall, FixHandler> dispatch table replaces the switch statement in the wizard execution loop, and acc.schemaTypes is pre-seeded from finding.suggestedToolCallArgs.recommendedType so the schema type gap-fill question is eliminated**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-21T10:30:24Z
- **Completed:** 2026-04-21T10:32:12Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Tightened `TOOL_FIELD_MAP` key type from `Record<string, ...>` to `Record<SuggestedToolCall, ...>` — exhaustiveness enforcement now covers both the gap-fill map and the dispatch table
- Added `import type { SuggestedToolCall, AuditFinding }` from `../audit/types.js` to enable both changes
- Declared `type FixHandler = (finding: AuditFinding) => Promise<void>` and `const dispatchTable: Record<SuggestedToolCall, FixHandler>` inside `registerAllTools` with all 5 handlers closing over wizard-local state
- Replaced `switch (toolName) { case '...': ... }` with `await dispatchTable[toolName](finding)` wrapped in a single `try/catch` (error-prefix format preserved as `toolName + ': ' + message`)
- Inserted WIZ-02 pre-seed block immediately after the gap-fill guard: if `finding.suggestedToolCallArgs?.recommendedType` is a string and `!acc.schemaTypes`, sets `acc.schemaTypes = [recommendedType]`
- Simplified `if (!toolName || !TOOL_FIELD_MAP[toolName]) continue` to `if (!toolName) continue` in both the gap-fill loop and the execution loop (symmetric with the now-tighter TOOL_FIELD_MAP key type)
- Compile-error drill confirmed: removing the `generate_faq_content` key produces TypeScript errors; restoring it resolves them

## Task Commits

Each task was committed atomically:

1. **Task 1: Tighten TOOL_FIELD_MAP key type and add SuggestedToolCall import** - `bed4491` (feat)
2. **Task 2: Replace switch with typed dispatch table + add accumulator pre-seed from suggestedToolCallArgs** - `4f5f136` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/tools/index.ts` — (1) added `import type { SuggestedToolCall, AuditFinding }` at line 14; (2) narrowed `TOOL_FIELD_MAP` key to `Record<SuggestedToolCall, ...>` at line 61; (3) inserted WIZ-02 pre-seed block at lines 259-267; (4) simplified gap-fill guard at line 254; (5) declared `FixHandler` type and `dispatchTable` const at lines 382-531; (6) replaced switch block with `await dispatchTable[toolName](finding)` at lines 533-543; (7) simplified execution-loop guard at line 536

## Decisions Made

- `FixHandler` type and `dispatchTable` const declared inside `registerAllTools` — handlers capture `acc`, `fixResults`, `fixErrors`, `target`, and `server` by closure; module-scope declaration would require threading 5 parameters through every call (RESEARCH.md Pitfall 4)
- `generate_markdown_mirrors` handler renames local `isUrl` to `isUrlTarget` — avoids shadowing the exported `isUrl()` function from `audit/types.ts`; plan noted this as optional cleanup; chosen for clarity
- `missingBots` deliberately not seeded — no `AccumulatedContext` field maps to it; `patchRobotsTxt(acc.robotsPath!, acc.sitemapUrl)` re-detects missing bots from disk (RESEARCH.md Pitfall 6)
- Inner `try/catch` blocks wrapping `server.server.elicitInput(...)` acknowledgment calls preserved inside each handler — these suppress non-elicitation-client errors and are not the same as the outer error-routing try/catch

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 smoke regression gate can import the dispatch table behavior via `tsc --noEmit` + smoke tests
- `acc.schemaTypes` pre-seeding is confirmed: schema findings carrying `recommendedType` in `suggestedToolCallArgs` will skip the schema type gap-fill question
- Dispatch table at lines 389-531 of `src/tools/index.ts`; pre-seed block at lines 259-267
- Compile-error drill confirmed exhaustiveness guarantee
- No blockers.

---
*Phase: 15-wizard-integration-and-type-safety*
*Completed: 2026-04-21*
