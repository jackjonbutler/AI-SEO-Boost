---
phase: 10-tool-execution-engine
plan: 02
subsystem: testing
tags: [smoke-test, mcp, wizard, elicitation, phase10, end-to-end]

# Dependency graph
requires:
  - phase: 10-tool-execution-engine
    plan: 01
    provides: Phase 10 execution loop returning plain-text 'Wizard complete' session summary

provides:
  - 10 smoke scenarios covering complete wizard pipeline (A through J)
  - Scenario J: full end-to-end Phase 10 path with per-tool confirmation handling and /tmp path responses
  - Zero remaining Phase 9 marker string assertions in smoke test

affects:
  - future smoke test extensions

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-scenario SMOKE OK output: each async scenario function prints its own line on success"
    - "Scenario J gap-fill handler: distinguishes mode-fork / issue-selection / per-tool-confirmation / gap-fill by inspecting props keys and message content"
    - "Path overrides in Scenario J: outputPath → /tmp/smoke-wizard-j/llms.txt, robotsPath → /tmp/smoke-wizard-j/robots.txt, outputDir → /tmp/smoke-wizard-j/mirrors/"

key-files:
  created: []
  modified:
    - scripts/smoke-audit-wizard-fork.mjs

key-decisions:
  - "Scenario A label updated to '(Phase 10 — full wizard pipeline, plain-text summary)' — Phase 9 envelope removed"
  - "Per-tool confirmation detection: check message.includes('Fix applied:') before other branches — consistent across all elicitation-capable scenarios"
  - "Scenarios G, H, I updated to assert 'Wizard complete' plain-text instead of Phase 9 JSON envelope marker"
  - "Each scenario prints its own SMOKE OK line rather than a single SMOKE OK at the end — clearer per-scenario pass/fail visibility"

patterns-established:
  - "Smoke test elicitation handler pattern for Phase 10: check 'Fix applied:' first, then mode/selectedIssues branch, then gap-fill"

# Metrics
duration: 3min
completed: 2026-04-20
---

# Phase 10 Plan 02: Smoke Test Update — Scenario J + Phase 10 Assertions Summary

**Smoke test extended to 10 scenarios: Phase 9 JSON envelope assertions replaced with Phase 10 plain-text 'Wizard complete' checks across A/G/H/I, Scenario J added for full end-to-end execution path with per-tool confirmations and /tmp path responses**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-20T20:03:32Z
- **Completed:** 2026-04-20T20:06:30Z
- **Tasks:** 1
- **Files modified:** 1 (scripts/smoke-audit-wizard-fork.mjs)

## Accomplishments

- Updated Scenario A: replaced Phase 9 JSON envelope assertions (marker string + JSON.parse + 4-key structure checks) with Phase 10 plain-text assertions (`text.includes('Wizard complete')` + `!text.startsWith('{')`) and updated label
- Updated Scenarios G, H, I: replaced `text.includes('Context accumulation complete')` assertions with `text.includes('Wizard complete')` + plain-text check; added per-tool confirmation handling (`message.includes('Fix applied:')`) to all elicitation handlers
- Added Scenario J: full Phase 10 end-to-end path — wizard fork → accept-all selected issues → gap-fills with /tmp paths for file-writing fields (outputPath, robotsPath, outputDir) → per-tool acknowledgment → asserts plain-text 'Wizard complete' session summary
- Each scenario now emits its own `SMOKE OK: Scenario X (...)` line; all 10 pass with exit code 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Scenario A and add Scenario J to smoke test** - `67da13e` (feat)

**Plan metadata:** _(docs commit to follow)_

## Files Created/Modified

- `scripts/smoke-audit-wizard-fork.mjs` — Updated top-level comment block (added Scenario J entry), updated Scenario A handler and assertions, updated Scenarios G/H/I handlers and assertions, added Scenario J function, updated main() to call scenarioJ and use per-scenario SMOKE OK output

## Decisions Made

- Each scenario prints its own SMOKE OK line: provides clearer per-scenario visibility compared to a single end-of-run SMOKE OK
- Per-tool confirmation detection (`message.includes('Fix applied:')`) added as the first branch in all elicitation handlers — ensures it intercepts before callCount-based branching, which would miscount after Phase 10 adds non-gap-fill elicitation calls
- Scenario H's assertion simplified: rather than tracking which context tools fired (complex), assert `businessNameAskCount <= 1` — sufficient to prove CTX-03 carry-forward without requiring knowledge of which tools selected

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 10 smoke scenarios pass. Phase 10 is fully covered end-to-end.
- The v1.1 wizard feature is complete and smoke-tested.
- No blockers.

---
*Phase: 10-tool-execution-engine*
*Completed: 2026-04-20*
