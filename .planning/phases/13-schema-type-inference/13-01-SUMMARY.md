---
phase: 13-schema-type-inference
plan: 01
subsystem: audit
tags: [schema.org, typescript, tdd, pure-function, keyword-matching]

# Dependency graph
requires: []
provides:
  - "inferSchemaType() pure function mapping free-text businessType to schema.org @type"
  - "BUSINESS_TYPE_MAP ordered keyword array (11 groups, most-specific first)"
  - "LOCAL_BUSINESS_SUBTYPES Set for checkSchemaMarkup parent-type acceptance (Plan 02)"
affects:
  - "13-02 (checkSchemaMarkup wires inferSchemaType)"
  - "src/audit/dimensions/schema.ts"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordered keyword map: most-specific keywords first, first-match-wins loop"
    - "TDD RED/GREEN with Node built-in assert module (no framework)"
    - "Assertion script imports from dist/ via ESM — forces real build check"

key-files:
  created:
    - src/audit/schema-type-map.ts
    - scripts/test-schema-type-map.mjs
  modified: []

key-decisions:
  - "Omitted bare 'shop' keyword from OnlineStore to avoid false-positive on 'vehicle wrap shop' — 'ecommerce', 'e-commerce', 'online store', 'retail' are sufficient"
  - "Omitted 'app' keyword (present in plan implementation code) — 'software', 'saas', 'platform', 'tool' cover intended cases without risk of matching 'happy', 'application' mid-word"
  - "LOCAL_BUSINESS_SUBTYPES excludes SoftwareApplication and OnlineStore — they extend Thing/CreativeWork, not LocalBusiness on schema.org"

patterns-established:
  - "Keyword map pattern: export const MAP = Array<{keywords, schemaType}> — reusable for future type-inference modules"
  - "Assertion gate pattern: scripts/test-*.mjs imports from dist/, runs assertions, prints single success line"

# Metrics
duration: 6min
completed: 2026-04-21
---

# Phase 13 Plan 01: inferSchemaType Summary

**Pure `inferSchemaType()` function with 11-group ordered keyword map producing schema.org @type strings, plus `LOCAL_BUSINESS_SUBTYPES` Set for Plan 02 parent-type acceptance**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-21T09:08:39Z
- **Completed:** 2026-04-21T09:14:00Z
- **Tasks:** 2 (RED test, GREEN implementation)
- **Files modified:** 2

## Accomplishments
- Assertion script covering all 15 test cases committed in RED state (confirmed module-not-found failure)
- `inferSchemaType()` implemented and all 15 assertions pass against dist/
- `tsc --noEmit` zero errors; `BUSINESS_TYPE_MAP` and `LOCAL_BUSINESS_SUBTYPES` exported for Plan 02

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — failing inferSchemaType assertions** - `f2db51d` (test)
2. **Task 2: GREEN — implement inferSchemaType()** - `ad89421` (feat)

_TDD plan: 2 commits (test → feat)_

## Files Created/Modified
- `src/audit/schema-type-map.ts` — Pure module: `inferSchemaType()`, `BUSINESS_TYPE_MAP`, `LOCAL_BUSINESS_SUBTYPES`
- `scripts/test-schema-type-map.mjs` — 15-assertion gate; runs via `npm run build && node scripts/test-schema-type-map.mjs`

## Decisions Made
- **Omitted bare 'shop'**: 'vehicle wrap shop' must return 'LocalBusiness' per plan spec; bare 'shop' would false-match. 'ecommerce', 'e-commerce', 'online store', 'retail' fully cover intended OnlineStore signals.
- **Omitted ' app '**: 'software', 'saas', 'platform', 'tool' cover SoftwareApplication without risk of matching common English words. The plan itself noted "use best judgment to avoid false positives."
- **LOCAL_BUSINESS_SUBTYPES scope**: Excludes SoftwareApplication and OnlineStore per plan spec — they are not schema.org subtypes of LocalBusiness, requiring separate pass logic in schema.ts (Plan 02).

## Deviations from Plan

None — plan executed exactly as written, with noted best-judgment on 'shop' and 'app' keywords per plan instructions.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `inferSchemaType()` is ready for Plan 02 to import and wire into `checkSchemaMarkup`
- `LOCAL_BUSINESS_SUBTYPES` exported and ready for parent-type acceptance logic in `src/audit/dimensions/schema.ts`
- No blockers.

---
*Phase: 13-schema-type-inference*
*Completed: 2026-04-21*
