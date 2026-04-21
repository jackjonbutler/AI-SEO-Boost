---
phase: 13-schema-type-inference
plan: 02
subsystem: audit
tags: [schema.org, typescript, business-context, type-inference, smoke-test]

# Dependency graph
requires:
  - phase: 13-01
    provides: "inferSchemaType() pure function and LOCAL_BUSINESS_SUBTYPES Set"
provides:
  - "checkSchemaMarkup accepting optional BusinessContext; uses inferSchemaType; seeds suggestedToolCallArgs.recommendedType"
  - "runAudit() accepting optional second param BusinessContext; threads to checkSchemaMarkup"
  - "audit_ai_seo handler passes businessContext to runAudit()"
  - "smoke-phase13-schema.mjs end-to-end regression gate for SCH-01, SCH-02, SCH-03"
affects:
  - "13-03 (Phase 13 final plan, if any)"
  - "src/audit/dimensions/schema.ts callers"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional param threading: businessContext? flows from tools/index.ts → runAudit → checkSchemaMarkup"
    - "Smoke test via dist/ with local temp HTML fixtures (no live network needed)"

key-files:
  created:
    - scripts/smoke-phase13-schema.mjs
  modified:
    - src/audit/dimensions/schema.ts
    - src/audit/index.ts
    - src/tools/index.ts

key-decisions:
  - "LocalBusiness accepted as parent type for any LOCAL_BUSINESS_SUBTYPES member (e.g. Restaurant accepts LocalBusiness page markup)"
  - "SoftwareApplication and OnlineStore require exact match only — LocalBusiness does NOT satisfy them"
  - "businessContext param is optional throughout the chain — zero breaking changes to existing callers"

patterns-established:
  - "suggestedToolCallArgs.recommendedType pattern: inferred type seeded on fail and warning returns for wizard pre-population"

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 13 Plan 02: businessContext Threading and Schema Type-Aware Pass Logic Summary

**`checkSchemaMarkup` now accepts optional `BusinessContext`, uses `inferSchemaType()` for pass/fail decisions, seeds `suggestedToolCallArgs.recommendedType`, and is threaded through `runAudit` and `tools/index.ts`; verified by 6-scenario smoke test**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-21T09:11:34Z
- **Completed:** 2026-04-21T09:13:32Z
- **Tasks:** 3
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- `checkSchemaMarkup` updated with SCH-01 type-aware pass logic, SCH-02 no-context fallback, SCH-03 suggestedToolCallArgs seeding
- `runAudit` and `tools/index.ts` updated to thread `businessContext` with zero breaking changes to existing callers
- All 6 smoke scenarios pass; `tsc --noEmit` zero errors; prior regression scripts unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Update checkSchemaMarkup with type-aware pass logic** - `d30a106` (feat)
2. **Task 2: Thread businessContext through runAudit and tools/index.ts** - `916ffc6` (feat)
3. **Task 3: Write and verify smoke-phase13-schema.mjs** - `ac85dbf` (feat)

## Files Created/Modified
- `src/audit/dimensions/schema.ts` — Updated: accepts optional BusinessContext, type-aware pass logic via inferSchemaType + LOCAL_BUSINESS_SUBTYPES, suggestedToolCallArgs.recommendedType on fail/warning
- `src/audit/index.ts` — Updated: runAudit signature extended with optional BusinessContext param; passes to checkSchemaMarkup
- `src/tools/index.ts` — Updated: runAudit call now passes businessContext ?? null
- `scripts/smoke-phase13-schema.mjs` — Created: 6-scenario end-to-end gate for SCH-01, SCH-02, SCH-03

## Decisions Made
- LocalBusiness accepted as parent type for LOCAL_BUSINESS_SUBTYPES members (Restaurant, LegalService, etc.) — conservative page markup using the parent type is acceptable
- SoftwareApplication and OnlineStore require exact match — they do not extend LocalBusiness on schema.org
- businessContext made optional throughout the chain (`?:`) to preserve backward compatibility with all existing smoke scripts and call sites

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SCH-01, SCH-02, and SCH-03 are fully closed and verified
- Phase 13 Plan 02 complete; ready for Phase 13 Plan 03 (if it exists) or phase transition
- No blockers.

---
*Phase: 13-schema-type-inference*
*Completed: 2026-04-21*
