---
phase: 07-wizard-entry-point
plan: 01
subsystem: api
tags: [mcp, elicitation, audit, wizard, typescript]

# Dependency graph
requires:
  - phase: 06-distribution
    provides: registered audit_ai_seo tool in registerAllTools, businessContextSchema

provides:
  - audit_ai_seo accepts optional businessContext (WIZ-02)
  - post-audit elicitation fork: mode='report' returns AuditReport, mode='wizard' returns wizard envelope
  - wizard stub envelope shape {marker, report, businessContext} for Phase 8 consumption
  - smoke test scripts/smoke-audit-wizard-fork.mjs proving all three fork branches

affects:
  - 08-issue-selection
  - 09-fix-generation
  - 10-apply-fixes

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Elicitation fork pattern: call server.server.elicitInput() in handler, catch and fall back to pre-v1.1 response"
    - "Optional businessContext threading: passed through to wizard envelope as businessContext ?? null"

key-files:
  created:
    - scripts/smoke-audit-wizard-fork.mjs
  modified:
    - src/tools/index.ts

key-decisions:
  - "Use server.server.elicitInput() inside handler closure — not server._clientCapabilities pre-check (per RESEARCH Pitfall 1)"
  - "Wizard path in Phase 7 returns JSON envelope {marker, report, businessContext} so Phase 8 has full context without re-running audit"
  - "businessContext made optional only in audit_ai_seo; all other 6 tools keep it required (no change to businessContextSchema definition)"
  - "Smoke test uses InMemoryTransport in-process pair; client capability declared as {elicitation: {form: {}}} to satisfy server-side form check at server/index.js:362"

patterns-established:
  - "Elicitation fallback pattern: wrap elicitInput in inner try/catch, outer try/catch handles runAudit() errors"

# Metrics
duration: 4min
completed: 2026-04-20
---

# Phase 7 Plan 01: Wizard Entry Point Summary

**audit_ai_seo extended with optional businessContext and post-audit elicitation fork that routes to a detailed JSON report or a Phase-7-stub wizard envelope ({marker, report, businessContext})**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-20T14:23:22Z
- **Completed:** 2026-04-20T14:26:30Z
- **Tasks:** 2
- **Files modified:** 2 (src/tools/index.ts, scripts/smoke-audit-wizard-fork.mjs created)

## Accomplishments

- Made `businessContext` optional in `audit_ai_seo` inputSchema via `.optional()` — no breaking change for existing callers (WIZ-02)
- Added `server.server.elicitInput()` fork inside the handler with try/catch fallback to pre-v1.1 report response (WIZ-01)
- Wizard stub returns JSON envelope `{marker: '[wizard] Phase 7 stub — issue selection lands in Phase 8', report, businessContext}` for Phase 8 consumption
- Written smoke test exercises all three branches (wizard, report, fallback) via in-process InMemoryTransport — prints `SMOKE OK`

## Task Commits

Each task was committed atomically:

1. **Task 1: Make businessContext optional and add elicitation fork to audit_ai_seo handler** - `09e15c8` (feat)
2. **Task 2: Write a Node smoke test that drives both fork branches via in-process MCP Client** - `6009900` (feat)

**Plan metadata:** _(final commit below)_

## Files Created/Modified

- `src/tools/index.ts` — `audit_ai_seo` registration block only: updated description, made businessContext optional, rewrote handler body with elicitation fork
- `scripts/smoke-audit-wizard-fork.mjs` — ESM smoke test: three scenarios (A=wizard, B=report, C=fallback), uses InMemoryTransport + ElicitRequestSchema handler, no network calls

## Decisions Made

- **Elicitation capability declaration:** Client must declare `{ elicitation: { form: {} } }` (not just `{ elicitation: {} }`) because the server checks `_clientCapabilities?.elicitation?.form` at `server/index.js:362`. An empty `{}` object satisfies the client-side form-mode default but NOT the server-side check. Smoke test Scenarios A and B use `{ form: {} }`; Scenario C uses `{}` (no elicitation) to trigger the fallback.
- **Wizard stub envelope:** Returns full `report` + `businessContext` so Phase 8 can implement issue selection without re-running the audit.
- **No new imports needed:** `server` is already in the `registerAllTools(server: McpServer)` closure; `server.server` gives access to `elicitInput`.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — build passed immediately, smoke test passed on first run.

## Fork Contract for Phase 8

When `useWizard === true`, the handler returns:

```json
{
  "marker": "[wizard] Phase 7 stub — issue selection lands in Phase 8",
  "report": { "target": "...", "generatedAt": "...", "findings": [...] },
  "businessContext": { ... } | null
}
```

Phase 8 should replace the `if (useWizard)` return block in `src/tools/index.ts` (lines ~110-120) with real issue-selection elicitation. The `report` and `businessContext` are available in the handler closure at that point.

## How to Run the Smoke Test

```bash
npm run build
node scripts/smoke-audit-wizard-fork.mjs
# Expects: SMOKE OK
```

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 7 entry point complete. `audit_ai_seo` is ready for Phase 8 to replace the wizard stub with real issue-selection elicitation.
- Handoff: Phase 8 starts in the `if (useWizard)` branch in `src/tools/index.ts`, consuming `report` (full `AuditReport`) and `businessContext` (`BusinessContext | undefined`).
- No blockers.

---
*Phase: 07-wizard-entry-point*
*Completed: 2026-04-20*
