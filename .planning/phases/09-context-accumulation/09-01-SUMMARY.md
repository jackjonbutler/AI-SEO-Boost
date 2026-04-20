---
phase: 09-context-accumulation
plan: 01
subsystem: api
tags: [mcp, elicitation, accumulator, context, wizard, typescript, gap-fill]

# Dependency graph
requires:
  - phase: 08-issue-selection
    provides: multi-select issue-selection elicitation returning Phase 8 envelope {selectedFindings, businessContext} inside if(useWizard) branch

provides:
  - TOOL_FIELD_MAP constant mapping 5 fixing tools to their required/optional field lists
  - WizardToolFields and AccumulatedContext types at module scope
  - Phase 9 accumulator loop replacing Phase 8 final return in if(useWizard) branch
  - CTX-01: seeds acc from upfront businessContext — no re-asking of provided fields
  - CTX-02: lazy field gather — only missing required fields per tool trigger an elicitation
  - CTX-03: carry-forward — each field asked at most once across all gap-fill calls
  - Per-tool gap-fill cancel support — skips that tool, continues wizard (Pitfall 5)
  - Post-processing of services (string→string[]) and schemaTypes (non-array→string[])
  - Phase 10 envelope: marker, selectedFindings, skippedFindings, accumulatedContext, contextSummary
  - Smoke test extended to 9 scenarios: A updated for Phase 9, G/H/I prove CTX-01/02/03

affects:
  - 10-apply-fixes

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TOOL_FIELD_MAP static constant: maps suggestedToolCall string to required/optional field lists split by contextRequired/contextOptional/toolRequired/toolOptional"
    - "AccumulatedContext = Partial<BusinessContext> & WizardToolFields: unified accumulator type"
    - "Object.assign(acc, gapResult.content) merge pattern — plain object merge, no Redux/state machine"
    - "Gap-fill schema built dynamically via switch on field name — only missing required fields included"
    - "sitemapUrl optional: pushed then popped from required[] array in the switch case"
    - "synthesizeGapFillResponse() helper in smoke test: accepts any requestedSchema, produces placeholder values by type"
    - "Stateful Set<string> tracking in Scenario I: asserts disjoint key sets across sequential gap-fill calls"

key-files:
  created: []
  modified:
    - src/tools/index.ts
    - scripts/smoke-audit-wizard-fork.mjs

key-decisions:
  - "Use as any cast for dynamically-built gap-fill properties object — SDK's PrimitiveSchemaDefinitionSchema union is not assignable from Record<string, unknown> at compile time"
  - "Only ask contextRequired fields in gap-fill (not contextOptional) — optional fields add friction without blocking tool function; Phase 10 can request them if output quality degrades"
  - "No try/catch around individual gap-fill elicitInput calls — per Phase 8 precedent, errors propagate to outer catch(err) (RESEARCH Anti-pattern 6)"
  - "services gathered as comma-separated string, split post-merge — SDK flat schema cannot express open-ended string arrays"
  - "synthesizeGapFillResponse() shared helper in smoke test — avoids duplicating generic accept logic across Scenarios A, G, H, I"
  - "Scenario G asserts no businessContext key in ANY gap-fill schema (not just callCount === 3) — covers all possible tool orderings"

patterns-established:
  - "Phase 9 accumulator pattern: seed from upfront context, loop findings, compute gaps, elicit only gaps, merge, continue"
  - "Phase 10 input contract: {marker, selectedFindings, skippedFindings, accumulatedContext, contextSummary} — see Phase 10 Input Contract section"

# Metrics
duration: 10min
completed: 2026-04-20
---

# Phase 9 Plan 01: Context Accumulation Summary

**TOOL_FIELD_MAP + AccumulatedContext accumulator loop in audit_ai_seo: seeds from upfront businessContext, gathers only missing required fields per tool via sequential elicitInput, carries answers forward, returns Phase 10-ready envelope with accumulatedContext and contextSummary**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-20T19:22:30Z
- **Completed:** 2026-04-20T19:32:30Z
- **Tasks:** 2
- **Files modified:** 2 (src/tools/index.ts, scripts/smoke-audit-wizard-fork.mjs)

## Accomplishments

- Replaced the Phase 8 `return` with a full Phase 9 context accumulator loop: seeds `acc` from upfront `businessContext`, iterates `selectedFindings`, looks up each finding's tool in `TOOL_FIELD_MAP`, computes missing required fields, gap-fills only those fields via `elicitInput`, merges into `acc`, post-processes `services` and `schemaTypes`
- Added `WizardToolFields`, `AccumulatedContext`, and `TOOL_FIELD_MAP` (5 entries) at module scope in `src/tools/index.ts` — fully typed with `keyof BusinessContext` and `keyof WizardToolFields` constraints
- Extended smoke test from 6 to 9 scenarios: Scenario A updated for Phase 9 envelope assertions; Scenarios G, H, I prove CTX-01 (upfront reuse), CTX-02 (lazy gather), CTX-03 (no re-ask) respectively; all 9 pass with `SMOKE OK`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TOOL_FIELD_MAP + types and replace Phase 8 return with context accumulator loop** - `e397d49` (feat)
2. **Task 2: Extend smoke test with Scenarios G, H, I for CTX-01/02/03 and update Scenario A** - `27839b3` (feat)

## Files Created/Modified

- `src/tools/index.ts` — Added `WizardToolFields` type, `AccumulatedContext` type, `TOOL_FIELD_MAP` constant (5 tool entries) at module scope; replaced Phase 8 final `return` with Phase 9 accumulator loop (seed → loop → gap-fill → merge → post-process → return Phase 10 envelope)
- `scripts/smoke-audit-wizard-fork.mjs` — Added `synthesizeGapFillResponse()` helper; updated Scenario A to handle Phase 9 gap-fills and assert Phase 9 envelope keys; added Scenarios G (CTX-01), H (CTX-02), I (CTX-03); updated `main()` to call all 9 scenarios

## Decisions Made

- **`as any` for gap-fill properties:** The SDK's `PrimitiveSchemaDefinitionSchema` union type is incompatible with a dynamically-built `Record<string, unknown>`. Using `as any` is the minimal cast that unblocks compilation without changing runtime behavior.
- **Only contextRequired in gap-fill:** Optional fields (location, services, etc.) are not asked during Phase 9 gap-fill. Tools function with just `businessName` + `businessType`. Phase 10 can gather optional fields if output quality matters.
- **sitemapUrl optional handling:** `sitemapUrl` must appear in `toolRequired` to trigger a gap-fill call for `configure_robots_txt`, but must NOT be in the `required[]` array of the elicitation schema. The switch case pushes then pops it from `required[]`.
- **No try/catch around gap-fill calls:** Per Phase 8 decision, all elicitation errors bubble to the outer `catch(err)` which returns `isError: true`. Individual try/catch would mask errors and produce incomplete context silently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript compilation error: `as Record<string, ReturnType<typeof String>>` cast invalid**
- **Found during:** Task 1 (build verification)
- **Issue:** The plan specified `properties as Record<string, ReturnType<typeof String>>` but `ReturnType<typeof String>` resolves to `string`, which is not assignable to the SDK's `PrimitiveSchemaDefinitionSchema` union type
- **Fix:** Changed cast to `as any` with an ESLint disable comment — semantically identical at runtime, unblocks compilation
- **Files modified:** src/tools/index.ts
- **Verification:** `npm run build` passes with zero errors
- **Committed in:** e397d49 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — TypeScript type cast bug)
**Impact on plan:** Minimal — single-line cast fix. No behavioral change. Runtime output identical to plan spec.

## Issues Encountered

None beyond the type cast deviation above.

## Phase 10 Input Contract

Phase 10 will start in the `if (useWizard)` branch and replace the Phase 9 final `return`. At that point, the following shape is available in scope:

```typescript
// Returned as JSON from audit_ai_seo when useWizard === true
{
  marker: '[wizard] Context accumulation complete — tool execution lands in Phase 10',
  selectedFindings: AuditFinding[],  // from Phase 8 — user-selected, severity-sorted, unchanged
  skippedFindings: string[],         // dimension names where user cancelled gap-fill
  accumulatedContext: {
    // BusinessContext fields (all optional at this type level — may or may not be present):
    businessName?: string;
    businessType?: string;
    location?: string;
    services?: string[];             // always string[] after post-processing (never a plain string)
    website?: string;
    phoneNumber?: string;
    description?: string;
    // Tool-specific fields (present only if that tool fired and user accepted gap-fill):
    outputPath?: string;             // for generate_llms_txt
    robotsPath?: string;             // for configure_robots_txt
    sitemapUrl?: string;             // for configure_robots_txt (optional — may be absent even after gap-fill)
    schemaTypes?: string[];          // for generate_schema_markup — always string[] after post-processing
    outputDir?: string;              // for generate_markdown_mirrors
  },
  contextSummary: string;            // human-readable bullet list of all non-undefined acc entries
}
```

**Phase 10 usage pattern:**

```typescript
// Phase 10 replaces the Phase 9 return with direct tool invocations:
for (const finding of selectedFindings) {
  const toolName = finding.suggestedToolCall;
  if (!toolName || skippedFindings.includes(finding.dimension)) continue;
  // Call the underlying generator function directly (not via MCP callTool)
  // e.g., await buildLlmsTxt(accumulatedContext as BusinessContext) + writeFile(acc.outputPath, ...)
}
```

**Key constraints for Phase 10:**
- `selectedFindings` is unchanged from Phase 8 — iterate it to determine invocation order
- `skippedFindings` contains dimension names (not tool names) — check `finding.dimension` against it
- `accumulatedContext.services` is always `string[]` if present (Phase 9 post-processes it)
- `accumulatedContext.schemaTypes` is always `string[]` if present
- Phase 10 calls generator functions directly (e.g., `buildLlmsTxt`, `patchRobotsTxt`) — NOT via MCP `callTool` round-trip (per v1.0 "pure build<Name>()" decision)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 9 complete. `audit_ai_seo` now returns a fully-populated `accumulatedContext` + `contextSummary` envelope.
- Handoff: Phase 10 starts at the final `return` in the `if (useWizard)` branch of `audit_ai_seo` in `src/tools/index.ts`. Replace the Phase 9 return with sequential direct calls to generator functions using `accumulatedContext`.
- No blockers.

---
*Phase: 09-context-accumulation*
*Completed: 2026-04-20*
