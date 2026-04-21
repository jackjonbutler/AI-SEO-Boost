---
phase: 12-framework-detection
plan: 03
subsystem: audit
tags: [framework-detection, runAudit, AuditReport, smoke-test, integration]

# Dependency graph
requires:
  - phase: 12-01
    provides: fetchAndDetectFramework(), FrameworkDetection type, detectFramework() pure function
  - phase: 12-02
    provides: checkLlmsTxt/checkRobotsTxtAiAccess/checkMarkdownMirrors updated to accept FrameworkDetection param

provides:
  - runAudit() calls fetchAndDetectFramework(probe) sequentially before dimension Promise.all
  - Framework result passed to 3 framework-aware dimensions (llms-txt, robots-txt, markdown)
  - AuditReport.framework populated for URL targets; null for local targets
  - scripts/smoke-phase12-framework.mjs — regression gate covering all 4 Phase 12 success criteria

affects: [phase-13-schema-type-inference, any future phase that calls runAudit()]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "framework-first-then-parallel: resolve lightweight upstream dependency before firing parallel I/O fan-out"
    - "sequential-then-parallel: await framework detection (1 fetch), then Promise.all(5 dimensions)"
    - "additive optional field: AuditReport.framework is optional — zero breaking changes to existing callers"

key-files:
  created:
    - scripts/smoke-phase12-framework.mjs
  modified:
    - src/audit/index.ts

key-decisions:
  - "Resolve framework detection before Promise.all (not inside it) — Approach A (parameter passing) requires framework at dimension message-construction time; correctness wins over 1 extra RT"
  - "checkSchemaMarkup and checkFaq remain single-arg — not framework-aware per research"
  - "Smoke Scenario B against vercel.com — high-stability Next.js target; network failure degrades to warning, not failure"

patterns-established:
  - "framework-first: await framework detection sequentially, then fire dimension Promise.all with result"

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 12 Plan 03: Framework Detection Integration Summary

**runAudit() now detects framework via fetchAndDetectFramework(probe) before the dimension Promise.all, passes the result to checkLlmsTxt/checkRobotsTxtAiAccess/checkMarkdownMirrors, and surfaces it on AuditReport.framework — closing FWK-01, FWK-02, and FWK-03**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T08:47:47Z
- **Completed:** 2026-04-21T08:49:32Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments

- `runAudit()` now resolves framework before the 5 dimension checks run — framework-aware dimensions receive the detected framework at message-construction time (Approach A, not post-processing)
- `AuditReport.framework` is populated: `FrameworkDetection | null` for URL targets, `null` for local targets (no detection attempted)
- `scripts/smoke-phase12-framework.mjs` provides a durable regression gate covering all four Phase 12 success criteria — verified live: Scenario B confirmed `vercel.com` → `{ name: "Next.js", confidence: "high" }`
- Zero regressions: existing `smoke-framework-detect.mjs` still passes all 4 cases; `smoke-audit-wizard-fork.mjs` unaffected (AuditReport.framework is optional)

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate framework detection into runAudit()** - `53c4086` (feat)
2. **Task 2: End-to-end smoke verification** - `77e9b36` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/audit/index.ts` - Added fetchAndDetectFramework import, sequential framework await before Promise.all, frameworkDetection passed to 3 dimensions, framework field on return object
- `scripts/smoke-phase12-framework.mjs` - Three-scenario smoke test: local audit (A), real Next.js URL (B), synthetic detection cases (C)

## Decisions Made

- **Resolve framework before Promise.all, not inside it:** Approach A (parameter passing to dimensions) requires the framework value at message-construction time. Including it in the Promise.all (Pattern 3 from research) would require post-processing approach (Approach B), which was explicitly rejected in Phase 12 research. The extra ~1 RT is acceptable; if it becomes a bottleneck, the helpers can be extracted to a standalone post-processing pass.
- **checkSchemaMarkup and checkFaq remain single-arg:** Neither dimension's messages vary by framework per research. Not framework-aware.
- **Smoke Scenario B uses vercel.com:** High-stability, well-maintained Next.js target. Network failures degrade to a warning — Scenarios A and C are the deterministic regression gates.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Phase 12 Complete

All four Phase 12 success criteria are now closed:

| Criterion | Status | Verification |
|-----------|--------|--------------|
| FWK-01: Next.js site → `framework.name="Next.js"`, `confidence="high"` | Closed | Scenario B live: `vercel.com` returned `{ name: "Next.js", confidence: "high" }` |
| FWK-01 edge: no signals → `framework=null` or `{name:null,confidence:'none'}` | Closed | Scenario A (local target) + Scenario C Case 2 |
| FWK-02: WordPress/Next.js produce framework-specific placement messages | Closed | Plan 02 helpers + Plan 03 wiring (frameworkDetection passed through) |
| FWK-03: `confidence='high'` requires 2+ independent signals | Closed | Scenario C Cases 3 (WordPress → medium) and 4 (Hugo → low) |

Phase 13 (Schema Type Inference) can now begin. No blockers.

## Next Phase Readiness

- Phase 12 complete — FWK-01, FWK-02, and FWK-03 all closed
- `AuditReport.framework` is stable and optional — all existing callers unaffected
- `scripts/smoke-phase12-framework.mjs` provides a regression gate for future phases
- Ready for Phase 13: Schema Type Inference (new file `src/audit/schema-type-map.ts`, modifications to `src/audit/dimensions/schema.ts`)

---
*Phase: 12-framework-detection*
*Completed: 2026-04-21*
