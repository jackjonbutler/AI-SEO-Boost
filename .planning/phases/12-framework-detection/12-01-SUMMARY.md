---
phase: 12-framework-detection
plan: 01
subsystem: audit
tags: [framework-detection, typescript, cheerio, html-parsing, http-headers]

# Dependency graph
requires:
  - phase: 11-http-diagnostic-metadata
    provides: AuditReport shape with optional fields pattern; pagesAudited? precedent
provides:
  - FrameworkConfidence type alias and FrameworkDetection interface in src/audit/types.ts
  - AuditReport.framework?: FrameworkDetection | null optional field
  - detectFramework() pure function over HTML + Headers (7-framework signal map)
  - fetchAndDetectFramework() I/O wrapper (null on failure, safe for Promise.all)
affects:
  - 12-02 (dimension message updates — imports FrameworkDetection)
  - 12-03 (runAudit integration — calls fetchAndDetectFramework)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure detection function over (html, headers) params — no I/O in detectFramework()"
    - "Weighted signal scoring: strong*2 + weak, totalSignals >= 2 required for 'high' confidence (FWK-03)"
    - "I/O wrapper pattern: try/catch everything, return null on any failure — safe for Promise.all"
    - "Signal map structure: Record<string, { strong: predicates[], weak: predicates[] }>"

key-files:
  created:
    - src/audit/framework.ts
    - scripts/smoke-framework-detect.mjs
  modified:
    - src/audit/types.ts

key-decisions:
  - "FrameworkDetection is a structured { name, confidence } object, not bare string — FWK-03 requires confidence field"
  - "Hugo and Jekyll included in signal map with only weak signals — honest about low confidence ceiling"
  - "fetchAndDetectFramework catches ALL errors (including AbortSignal timeout) and returns null — never rethrows"
  - "detectFramework is kept pure: no I/O, no Date.now(), so it is trivially unit-testable without network mocking"

patterns-established:
  - "Pattern: New optional fields on AuditReport follow all-optional convention (zero breaking changes to wizard)"
  - "Pattern: smoke-*.mjs test scripts in scripts/ for verifying compiled dist output"

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 12 Plan 01: Framework Detection Types and detectFramework() Summary

**FrameworkDetection type + 7-framework signal map with FWK-03 confidence scoring, providing foundation for Plans 02 and 03**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T08:40:38Z
- **Completed:** 2026-04-21T08:42:30Z
- **Tasks:** 2
- **Files modified:** 3 (types.ts modified, framework.ts created, smoke script created)

## Accomplishments

- Extended src/audit/types.ts with FrameworkConfidence type alias, FrameworkDetection interface, and AuditReport.framework? optional field — zero breaking changes
- Created src/audit/framework.ts: FRAMEWORK_SIGNALS map covering 7 frameworks (Next.js, Nuxt, Astro, WordPress, Shopify, Hugo, Jekyll) with distinct strong/weak predicate arrays
- detectFramework() pure function implements weighted scoring + FWK-03 guard (totalSignals >= 2 = 'high', 1 strong = 'medium', 1 weak = 'low', 0 = 'none')
- fetchAndDetectFramework() I/O wrapper with full error swallowing — safe for runAudit()'s Promise.all
- All 4 smoke test cases pass (high/medium/low/none); tsc --noEmit and npm run build both pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add FrameworkDetection types to src/audit/types.ts** - `97807fc` (feat)
2. **Task 2: Create src/audit/framework.ts with signal map and detectFramework()** - `6bbd73a` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `src/audit/types.ts` - Added FrameworkConfidence, FrameworkDetection, and AuditReport.framework? field
- `src/audit/framework.ts` - New file: FRAMEWORK_SIGNALS constant, detectFramework() pure function, fetchAndDetectFramework() I/O wrapper
- `scripts/smoke-framework-detect.mjs` - Smoke test script verifying all 4 confidence levels against compiled dist

## Decisions Made

- FrameworkDetection uses structured `{ name, confidence }` shape (not bare string) because FWK-03 requires the confidence level to be available to callers
- Hugo and Jekyll included in signal map with only weak signals (meta generator) — confidence ceiling is 'low', which is the honest result given that meta tags are frequently stripped
- fetchAndDetectFramework swallows ALL errors including AbortSignal timeouts, returning null — required by Pitfall 4 from research to prevent runAudit Promise.all from rejecting
- detectFramework kept as pure function; runAudit (Plan 03) owns the I/O fetch and passes HTML+headers in

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (dimension message updates) can now import FrameworkDetection from './types.js' and build framework-aware fix notes
- Plan 03 (runAudit integration) can import fetchAndDetectFramework from './framework.js' and wire it into Promise.all
- All success criteria met: FWK-01 (detection exists), FWK-03 (confidence gating with 2-signal threshold), fetchAndDetectFramework never throws

---
*Phase: 12-framework-detection*
*Completed: 2026-04-21*
