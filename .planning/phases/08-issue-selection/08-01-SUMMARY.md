---
phase: 08-issue-selection
plan: 01
subsystem: api
tags: [mcp, elicitation, multi-select, audit, wizard, typescript]

# Dependency graph
requires:
  - phase: 07-wizard-entry-point
    provides: post-audit elicitation fork with useWizard branch and Phase 7 stub in audit_ai_seo handler

provides:
  - real multi-select issue-selection elicitation replacing Phase 7 stub in audit_ai_seo if (useWizard) branch
  - ISEL-01: checklist shows severity and dimension for each actionable finding
  - ISEL-02: all issues pre-selected by default via schema default array
  - ISEL-03: accept returns Phase 8 envelope {marker, selectedFindings, businessContext} for Phase 9
  - all-pass short-circuit: skips second elicitInput when zero fail/warning findings
  - cancel/decline path returns graceful 'Issue selection cancelled' message
  - empty-selection guard returns 'No issues selected' message without selectedFindings
  - extended smoke test: six scenarios covering all new branches (A/D/E updated + new, B/C unchanged)

affects:
  - 09-fix-generation
  - 10-apply-fixes

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-call sequential elicitation in one handler: mode fork (Phase 7) + issue selection (Phase 8)"
    - "TitledMultiSelectEnumSchemaSchema: type='array' with items.anyOf and default[] for pre-select"
    - "Composite key pattern: dimension:status string as stable multi-select const value"
    - "Stateful elicitation handler in smoke test: callCount counter distinguishes first vs second elicit call"

key-files:
  created: []
  modified:
    - src/tools/index.ts
    - scripts/smoke-audit-wizard-fork.mjs

key-decisions:
  - "Use dimension:status composite keys (not index-based) for stable, human-readable multi-select const values"
  - "No try/catch around second elicitInput — errors propagate to outer catch which returns isError:true (per RESEARCH Open Question 3)"
  - "items.anyOf (TitledMultiSelectEnumSchemaSchema) over items.enum — titles surface severity and message per ISEL-01"
  - "Scenario F uses static grep rather than runtime fixture — all-pass branch requires full-pass fixture directory which is out of scope for Phase 8"
  - "Empty-selection guard uses post-submit length check, not schema-level minItems — simpler and more readable"

patterns-established:
  - "All-pass short-circuit: check actionableFindings.length === 0 before constructing multi-select schema"
  - "Phase 9 input contract: envelope {marker, selectedFindings, businessContext} — selectedFindings is AuditFinding[] subset"

# Metrics
duration: 5min
completed: 2026-04-20
---

# Phase 8 Plan 01: Issue Selection Summary

**Multi-select issue-selection elicitation replacing Phase 7 wizard stub: users see every actionable audit finding pre-selected, deselect to skip, and submit a {selectedFindings, businessContext} envelope for Phase 9 to consume**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-20T14:45:54Z
- **Completed:** 2026-04-20T14:51:00Z
- **Tasks:** 2
- **Files modified:** 2 (src/tools/index.ts, scripts/smoke-audit-wizard-fork.mjs)

## Accomplishments

- Replaced the Phase 7 `[wizard] Phase 7 stub` block in `src/tools/index.ts` with the full Phase 8 issue-selection flow: actionable-findings filter, all-pass guard, multi-select `elicitInput` call, cancel/decline handling, empty-selection guard, and Phase 8 envelope return
- The multi-select schema uses `items.anyOf` (TitledMultiSelectEnumSchemaSchema) with `dimension:status` composite keys and severity-bearing titles (ISEL-01), and `default` pre-selects every item (ISEL-02)
- Extended smoke test from 3 scenarios to 6: Scenario A updated to two-call stateful handler; Scenarios D (deselect-all), E (cancel), and F (all-pass static check) added; Scenarios B and C unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Phase 7 wizard stub with real multi-select issue-selection elicitation** - `4c1fef6` (feat)
2. **Task 2: Extend smoke test with three new scenarios covering multi-select behavior** - `2b1380a` (feat)

## Files Created/Modified

- `src/tools/index.ts` — `if (useWizard)` block rewritten end-to-end: actionable-findings filter, all-pass guard, second `elicitInput` call, cancel/decline handler, empty-selection guard, Phase 8 envelope return. No other tool registrations, imports, or module-scope schemas changed.
- `scripts/smoke-audit-wizard-fork.mjs` — Scenario A updated to two-call stateful handler + new Phase 8 assertions; Scenarios D, E, F added; Scenarios B and C byte-identical to Phase 7 version.

## Decisions Made

- **Composite keys over index-based keys:** `dimension:status` (e.g., `llms-txt:fail`) is stable, human-readable, and sufficient for v1 where `runAudit()` emits exactly one finding per dimension. Index-based keys would break if the audit order changes.
- **No try/catch around second elicitInput:** Per RESEARCH Open Question 3, errors from the selection call propagate to the outer `catch(err)` which returns `isError: true`. The inner try/catch is exclusively for the mode-fork capability fallback.
- **Scenario F as static grep:** Creating a full fixture directory that passes all 5 audit dimensions would add 30+ lines of file-creation code outside the plan's scope. The static grep proves the guard string and condition are wired — adequate proof of existence for Phase 8. A future integration test can replace this with a runtime fixture check.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — build passed immediately, smoke test passed on first run.

## Phase 9 Input Contract

When the user accepts a non-empty selection, Phase 8 returns this JSON envelope:

```json
{
  "marker": "[wizard] Issue selection complete — fix generation lands in Phase 9",
  "selectedFindings": [
    {
      "dimension": "llms-txt",
      "status": "fail",
      "severity": "critical",
      "message": "...",
      "suggestedToolCall": "generate_llms_txt"
    }
  ],
  "businessContext": { ... } | null
}
```

Phase 9 starts in the `if (useWizard)` branch and replaces the final `return` inside the issue-selection-complete block. It consumes `selectedFindings` (subset of actionable findings the user chose) and `businessContext` to drive sequential fix generation via the registered fix tools.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 8 complete. `audit_ai_seo` now presents a real multi-select checklist and returns the Phase 9 input contract.
- Handoff: Phase 9 starts at the final `return` in the `if (useWizard)` branch of `audit_ai_seo` in `src/tools/index.ts`. The `selectedFindings` array and `businessContext` are in scope.
- No blockers.

---
*Phase: 08-issue-selection*
*Completed: 2026-04-20*
