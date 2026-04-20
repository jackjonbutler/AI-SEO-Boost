# Roadmap: AI SEO Boost

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-04-20)
- 🚧 **v1.1 Interactive Guided Remediation** — Phases 7–10 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-04-20</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-04-20
- [x] Phase 2: Acquisition Pipeline (2/2 plans) — completed 2026-04-20
- [x] Phase 3: Core Generators (3/3 plans) — completed 2026-04-20
- [x] Phase 4: Sitemap, Mirrors, and Schema (3/3 plans) — completed 2026-04-20
- [x] Phase 5: FAQ Content (1/1 plan) — completed 2026-04-20
- [x] Phase 6: Distribution (1/1 plan) — completed 2026-04-20

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v1.1 Interactive Guided Remediation (In Progress)

**Milestone Goal:** Extend `audit_ai_seo` with a post-audit fix wizard that walks users through each issue sequentially, firing the right tool with context-aware Q&A and no repeated questions.

- [x] **Phase 7: Wizard Entry Point** — Add `businessContext` input and post-audit mode fork to `audit_ai_seo`
- [x] **Phase 8: Issue Selection** — Present a toggleable issue checklist and capture user selection before fix sequence begins
- [ ] **Phase 9: Context Accumulation** — Implement context reuse and mid-wizard gap-fill Q&A so no field is ever asked twice
- [ ] **Phase 10: Tool Execution Engine** — Route selected issues to fixing tools, execute sequentially, confirm each result, and show final summary

## Phase Details

### Phase 7: Wizard Entry Point
**Goal**: Users can invoke `audit_ai_seo` with optional business context and choose between a detailed report and the fix wizard after auditing completes
**Depends on**: Phase 6 (v1.0 complete)
**Requirements**: WIZ-01, WIZ-02
**Success Criteria** (what must be TRUE):
  1. `audit_ai_seo` accepts an optional `businessContext` parameter alongside the existing `target` parameter without breaking existing behavior
  2. After the audit completes, the tool output presents a clear fork: "Detailed report" or "Fix with wizard"
  3. Choosing "Detailed report" returns the same prioritized fix list as before v1.1
  4. Choosing "Fix with wizard" proceeds to the issue selection step
**Plans**: 1 plan

Plans:
- [ ] 07-01-PLAN.md — Make `businessContext` optional in `audit_ai_seo`, add post-audit elicitation fork (report vs wizard) with unsupported-client fallback, plus in-process smoke test covering all three branches

### Phase 8: Issue Selection
**Goal**: Users see all audit issues as a toggleable checklist and can choose which to address before the fix sequence begins
**Depends on**: Phase 7
**Requirements**: ISEL-01, ISEL-02, ISEL-03
**Success Criteria** (what must be TRUE):
  1. Wizard presents every issue surfaced by the audit as a named, selectable item with its severity/priority visible
  2. All issues are selected by default — user action is required only to exclude an issue
  3. After the user submits their selection, the wizard confirms which issues will be fixed and proceeds to execution
  4. An empty selection (no issues selected) produces a clear message rather than attempting to run tools
**Plans**: 1 plan

Plans:
- [ ] 08-01-PLAN.md — Replace Phase 7 wizard stub with real multi-select issue-selection elicitation (actionable-findings filter, all-pass guard, default-all-selected checklist, empty-selection guard, Phase 9 envelope handoff), plus three new smoke scenarios covering accept-all / deselect-all / cancel / all-pass

### Phase 9: Context Accumulation
**Goal**: Business context provided upfront is reused without re-asking, and context gathered mid-wizard is accumulated across tool invocations
**Depends on**: Phase 8
**Requirements**: CTX-01, CTX-02, CTX-03
**Success Criteria** (what must be TRUE):
  1. When `businessContext` is provided at wizard start, no field from it is asked again during any tool invocation
  2. When no upfront context is provided, the wizard asks only for the fields required by the first tool that needs them
  3. Any field answered mid-wizard is carried forward — subsequent tools never prompt for it again
  4. The accumulated context state is visible/traceable (e.g., a running summary of what is already known)
**Plans**: TBD

Plans:
- [ ] 09-01: Implement context accumulator — merge upfront context, track gathered fields, expose gap-fill Q&A interface

### Phase 10: Tool Execution Engine
**Goal**: Selected issues are resolved by firing the correct fixing tool in priority order, with per-tool confirmations and a final summary of everything changed
**Depends on**: Phase 9
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05
**Success Criteria** (what must be TRUE):
  1. Each selected issue maps to exactly one fixing tool and that tool is invoked — no issue is skipped silently
  2. Tools fire in priority order (highest-severity issue first) without user having to manage sequencing
  3. Each tool invocation only requests fields not already in accumulated context — returning users see no repeated questions
  4. After each tool completes, the wizard shows a confirmation of what was written or changed (file path, type, or action)
  5. After all selected issues are resolved, the wizard shows a single summary listing every fix applied in this session
**Plans**: TBD

Plans:
- [ ] 10-01: Build issue-to-tool routing map and sequential execution driver
- [ ] 10-02: Wire per-tool result confirmations and end-of-session summary output

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-04-20 |
| 2. Acquisition Pipeline | v1.0 | 2/2 | Complete | 2026-04-20 |
| 3. Core Generators | v1.0 | 3/3 | Complete | 2026-04-20 |
| 4. Sitemap, Mirrors, and Schema | v1.0 | 3/3 | Complete | 2026-04-20 |
| 5. FAQ Content | v1.0 | 1/1 | Complete | 2026-04-20 |
| 6. Distribution | v1.0 | 1/1 | Complete | 2026-04-20 |
| 7. Wizard Entry Point | v1.1 | 1/1 | Complete | 2026-04-20 |
| 8. Issue Selection | v1.1 | 1/1 | Complete | 2026-04-20 |
| 9. Context Accumulation | v1.1 | 0/TBD | Not started | - |
| 10. Tool Execution Engine | v1.1 | 0/TBD | Not started | - |
