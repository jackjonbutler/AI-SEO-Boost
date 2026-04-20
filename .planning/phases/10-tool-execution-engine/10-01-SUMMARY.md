---
phase: 10-tool-execution-engine
plan: 01
subsystem: api
tags: [mcp, elicitation, wizard, execution-loop, typescript, generators]

# Dependency graph
requires:
  - phase: 09-context-accumulation
    provides: AccumulatedContext accumulator + TOOL_FIELD_MAP + Phase 9 gap-fill loop returning contextSummary and skippedFindings in scope

provides:
  - EXEC-01 through EXEC-05: sequential execution loop in audit_ai_seo if(useWizard) branch
  - switch dispatch on finding.suggestedToolCall for all 5 fixing tools
  - generate_llms_txt case: buildLlmsTxt + writeFile to acc.outputPath
  - configure_robots_txt case: patchRobotsTxt (own I/O, no writeFile) — botsAdded + sitemapAdded summary
  - generate_schema_markup case: buildSchemaMarkup result as text in fixResults (no file write)
  - generate_faq_content case: buildFaqContent result as JSON text in fixResults (no file write)
  - generate_markdown_mirrors case: re-crawl target via acquireLocal/crawlUrl + pLimit(5) + slug disambiguation + writeFile per page
  - Per-tool elicitInput confirmation (non-blocking try/catch) after each success
  - Session summary return: plain text "Wizard complete. N fix(es) applied." with applied/errors/skipped sections
  - Phase 9 marker return removed — wizard flow is now end-to-end

affects:
  - end-to-end wizard test (scripts/smoke-audit-wizard-fork.mjs)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 10 execution loop: for...of selectedFindings + switch on suggestedToolCall + try/catch per case"
    - "fixResults/fixErrors accumulator: errors push to fixErrors, loop continues — no silent falls-through"
    - "Per-tool elicitInput acknowledgment: wrapped in inner try/catch so non-elicitation clients silently continue"
    - "generate_markdown_mirrors re-crawl: acquireLocal/crawlUrl from target closure + pLimit(5) + writtenSlugs Set + disambiguate() — identical to standalone handler"
    - "Session summary: summaryLines.join('\\n') single return at end of if(useWizard) branch"

key-files:
  created: []
  modified:
    - src/tools/index.ts

key-decisions:
  - "Re-crawl target for generate_markdown_mirrors rather than receiving docs from Phase 9 envelope — target is in closure, Phase 9 envelope did not include docs"
  - "patchRobotsTxt called without writeFile — it handles its own I/O (carries forward from standalone configure_robots_txt handler)"
  - "generate_schema_markup and generate_faq_content return text only (no file write) — user copies output into their site"
  - "contextSummary variable remains in scope (built in Phase 9 Step 3) but is no longer returned — not removed to preserve Phase 9 code structure; TypeScript does not error on unused locals without noUnusedLocals flag"

patterns-established:
  - "Wizard execution pattern: for...of + switch + try/catch per case + fixResults/fixErrors accumulators + session summary return"

# Metrics
duration: 1min
completed: 2026-04-20
---

# Phase 10 Plan 01: Tool Execution Engine Summary

**Sequential execution loop in audit_ai_seo wizard branch: dispatches all 5 fixing tools via switch on suggestedToolCall, accumulates results in fixResults/fixErrors, fires non-blocking per-tool elicitInput confirmations, and returns a single plain-text session summary replacing the Phase 9 marker envelope**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-20T20:00:48Z
- **Completed:** 2026-04-20T20:01:47Z
- **Tasks:** 1
- **Files modified:** 1 (src/tools/index.ts)

## Accomplishments

- Replaced the Phase 9 final `return` (JSON envelope with marker string) with the Phase 10 sequential execution loop — wizard flow is now end-to-end
- Implemented all 5 switch cases with individual try/catch: generate_llms_txt (writeFile), configure_robots_txt (patchRobotsTxt, no writeFile), generate_schema_markup (text output), generate_faq_content (JSON text output), generate_markdown_mirrors (re-crawl + pLimit(5) + slug disambiguation + writeFile)
- Per-tool elicitInput acknowledgment fires after each success inside a non-blocking try/catch; session summary return produces plain text "Wizard complete. N fix(es) applied." with applied/errors/skipped sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Phase 9 final return with Phase 10 execution loop** - `953e8a4` (feat)

## Files Created/Modified

- `src/tools/index.ts` — Replaced Phase 9 return block (lines 364-376) with 196-line Phase 10 execution loop: fixResults/fixErrors init, for...of selectedFindings, switch with 5 cases (each try/catch + elicitInput acknowledgment), session summary return

## Decisions Made

- **Re-crawl for generate_markdown_mirrors:** Phase 9 envelope did not pass `docs` forward, so Phase 10 re-acquires from `target` (in outer closure) using the same acquireLocal/crawlUrl pattern as the standalone handler
- **patchRobotsTxt handles own I/O:** Consistent with the standalone configure_robots_txt handler — no subsequent writeFile call
- **No writeFile for schema/FAQ:** Both generators return text for the user to copy into their site — file path context is not available in the wizard flow for these tools

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 10 complete. The wizard flow in `audit_ai_seo` is fully end-to-end: audit → fork → issue selection → context accumulation → sequential execution → session summary.
- The project v1.1 wizard feature is complete. All 5 EXEC-* deliverables are implemented.
- No blockers.

---
*Phase: 10-tool-execution-engine*
*Completed: 2026-04-20*
