---
phase: 14-sitemap-coverage-and-mirror-depth
plan: 02
subsystem: audit
tags: [smoke-test, regression-gate, cheerio, sitemap, coverage, offline]

# Dependency graph
requires:
  - phase: 14-01
    provides: checkMarkdownMirrors with sitemap-driven coverage estimator
provides:
  - scripts/smoke-phase14-coverage.mjs — offline regression gate for COV-01, COV-02, COV-03
affects: [future-markdown-ts-changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Monkey-patch globalThis.fetch before each scenario for offline testing"
    - "Minimal XML strings sufficient for cheerio selectors (no full schema needed)"
    - "Pass/fail counter pattern: passed/failed integers, process.exit(failed > 0 ? 1 : 0)"

key-files:
  created:
    - scripts/smoke-phase14-coverage.mjs
  modified: []

key-decisions:
  - "globalThis.fetch patched per scenario (not module-level) to isolate state between scenarios"
  - "Scenario 2 uses separate child sitemap URL to exercise the sitemapindex fetch chain end-to-end"
  - "Scenario 3 uses a headProbeCount counter in the fetch mock closure to measure actual probe count"
  - "No try/catch around import — module is imported once at top; fetch mocks set before each scenario call"

# Metrics
duration: ~3min
completed: 2026-04-21
---

# Phase 14 Plan 02: Smoke Regression Gate Summary

**Offline regression gate covering all four Phase 14 success criteria via globalThis.fetch monkey-patching and four targeted scenarios that verify COV-01, COV-02, COV-03, and the no-sitemap fallback**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-04-21T09:32:21Z
- **Tasks:** 1 (single atomic commit)
- **Files created:** 1

## Accomplishments

- Created `scripts/smoke-phase14-coverage.mjs` with four offline scenarios
- Scenario 1 (COV-01): 40-URL regular sitemap, 8 of 20 sampled mirrors return 200 → status `warning`, message includes `estimated` and `N/M` format; confirms old binary `/index.md` pattern absent from message
- Scenario 2 (COV-02): sitemapindex with one child sitemap containing 5 URLs, all HEAD 404 → status `fail`, message includes `5` (proves child URL parsing worked, not zero)
- Scenario 3 (COV-03): 100-URL sitemap, HEAD probe counter asserted ≤ 20; message denominator ≤ 20
- Scenario 4: 404 on /sitemap.xml → status `warning`, message includes `sitemap`, no throw
- All four scenarios pass; zero regressions in phase12 and phase13 smoke scripts; `tsc --noEmit` clean

## Task Commits

1. **Task 1: Write smoke-phase14-coverage.mjs** — `2167bdd` (feat)

## Files Created/Modified

- `scripts/smoke-phase14-coverage.mjs` — four-scenario offline regression gate

## Decisions Made

- `globalThis.fetch` patched inside each scenario's try block rather than at module level — simplest isolation without needing a factory function
- Child sitemap URL is hardcoded to `https://example.com/sitemap-posts.xml` in Scenario 2 so the mock can route the second fetch deterministically
- `headProbeCount` counter lives in the Scenario 3 mock closure — counts actual HEAD calls without modifying the module under test
- Message assertion for `'/'` (N/M format) catches any regression that drops the fraction from the coverage label

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.

## Self-Check

- `scripts/smoke-phase14-coverage.mjs` — FOUND
- Commit `2167bdd` — FOUND
- `node scripts/smoke-phase14-coverage.mjs` → exits 0, all [PASS]
- `npx tsc --noEmit` → exits 0
- `node scripts/smoke-phase12-framework.mjs` → all OK
- `node scripts/smoke-phase13-schema.mjs` → all OK

## Self-Check: PASSED

## Next Phase Readiness

- Phase 14 fully closed: COV-01, COV-02, COV-03 verified by regression gate
- No blockers
- Ready for Phase 15 — Wizard Type Narrowing (WIZ-01)

---
*Phase: 14-sitemap-coverage-and-mirror-depth*
*Completed: 2026-04-21*
