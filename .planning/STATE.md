# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20 after v1.1 milestone)

**Core value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.
**Current focus:** v1.2 — Audit Observability & Framework Awareness — Phase 11 next

## Current Position

Phase: 11 — HTTP Diagnostic Metadata Capture
Plan: 02 of 03 complete
Status: In progress — Plans 01–02 complete, Plan 03 remaining
Last activity: 2026-04-21 — Completed 11-02-PLAN.md (HTTP metadata capture in fetching files)

Progress: [░░░░░░░░░░░░░░░] 0/5 phases complete (Phase 11 in progress: 2/3 plans done)

## Performance Metrics

**Velocity:**
- Total plans completed: 17 (12 v1.0 + 5 v1.1)
- Average duration: ~5–8 min/plan
- Total execution time: ~3 days (v1.0) + 1 day (v1.1)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | ~15 min | ~7.5 min |
| 02-acquisition-pipeline | 2 | ~16 min | ~8 min |
| 03-core-generators | 3 | ~18 min | ~6 min |
| 04-sitemap-mirrors-schema | 3 | ~18 min | ~6 min |
| 05-faq-content | 1 | ~5 min | ~5 min |
| 06-distribution | 1 | ~5 min | ~5 min |
| 07-wizard-entry-point | 1 | ~8 min | ~8 min |
| 08-issue-selection | 1 | ~8 min | ~8 min |
| 09-context-accumulation | 1 | ~10 min | ~10 min |
| 10-tool-execution-engine | 2 | ~12 min | ~6 min |

**Recent Trend:**
- Trend: Stable — v1.1 delivered in single day

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v1.2 work:

- v1.0: Generator pattern — pure build<Name>() functions, no I/O (carry forward to wizard helpers)
- v1.0: All tools registered in tools/index.ts via registerAllTools (wizard routing reads same registry)
- v1.0: businessContextSchema defined once in tools/index.ts, reused across 7 tools (wizard reuses same schema)
- v1.1: Wizard is a post-audit mode inside `audit_ai_seo`, not a separate tool
- Phase 7: businessContext is optional only in audit_ai_seo; all other 6 tools keep it required
- Phase 7: wizard path returns JSON envelope {marker, report, businessContext} for Phase 8 to consume
- Phase 7: elicitation fork uses server.server.elicitInput() in closure, wrapped in inner try/catch for fallback
- Phase 7: client must declare capabilities.elicitation.form (not just .elicitation) to satisfy server-side form check
- Phase 8: dimension:status composite keys used for multi-select const values — stable for v1 (one finding per dimension)
- Phase 8: no try/catch around second elicitInput — errors propagate to outer catch (returns isError:true)
- Phase 8: Phase 9 input contract: {marker, selectedFindings, businessContext} — Phase 9 starts at the final return in the if (useWizard) branch
- Phase 9: TOOL_FIELD_MAP static constant at module scope maps 5 fixing tools to contextRequired/contextOptional/toolRequired/toolOptional field lists
- Phase 9: AccumulatedContext = Partial<BusinessContext> & WizardToolFields — unified accumulator type
- Phase 9: Only contextRequired fields asked in gap-fill (not contextOptional) — optional fields not gathered during Phase 9
- Phase 9: as any cast used for dynamically-built gap-fill properties object (SDK PrimitiveSchemaDefinitionSchema union incompatible with Record<string, unknown>)
- Phase 9: Phase 10 input contract: {marker, selectedFindings, skippedFindings, accumulatedContext, contextSummary} — Phase 10 replaces Phase 9 final return and calls generator functions directly
- Phase 10: Wizard execution loop: for...of selectedFindings + switch on suggestedToolCall + try/catch per case + fixResults/fixErrors accumulators + per-tool elicitInput acknowledgment (non-blocking) + session summary return
- Phase 10: patchRobotsTxt handles own I/O — no subsequent writeFile call in wizard path
- Phase 10: generate_schema_markup and generate_faq_content return text only (no file write) — user copies output
- Phase 10: generate_markdown_mirrors re-crawls target from outer closure (Phase 9 envelope did not include docs)
- Phase 10 smoke test: per-tool confirmation detection (message.includes('Fix applied:')) as first branch in elicitation handlers — prevents callCount miscount after Phase 10 adds non-gap-fill elicitation calls
- Phase 10 smoke test: each scenario prints its own SMOKE OK line for per-scenario visibility
- Phase 11-02: robots-txt.ts diagnostics built inside try block (not after) — keeps definite assignment valid; all response-path returns moved inside try
- Phase 11-02: contentLength strictly from Content-Length header — null when absent; text.length NOT used as fallback
- Phase 11-02: CRAWL_USER_AGENT module constant reused in both fetch headers and httpMetadata.userAgent (single source of truth)

### v1.2 Architecture Notes (from research)

- All 13 v1.2 requirements are implementable with zero new npm dependencies
- New files: src/audit/framework.ts (detectFramework()), src/audit/schema-type-map.ts (inferSchemaType())
- Modified files: src/audit/types.ts, src/acquisition/crawl.ts, src/audit/index.ts, src/audit/dimensions/markdown.ts, src/audit/dimensions/llms-txt.ts, src/audit/dimensions/robots-txt.ts, src/tools/index.ts
- All new fields on AuditFinding and AuditReport are optional — zero breaking changes to wizard
- Phase 11 is types-first — every other phase depends on new fields being declared in types.ts
- Phase 15 type narrowing (WIZ-01) must come after all phases that introduce suggestedToolCall values are stable
- Research flag: verify cheerio xmlMode:true for sitemap XML against cheerio 1.2.0 before Phase 14
- Research flag: verify accumulator seeding order in tools/index.ts ~line 264 before Phase 15

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-21
Stopped at: Phase 11 Plan 02 complete — HTTP metadata capture wired into fetching files
Next: Execute Phase 11 Plan 03 — audit/index.ts pagesAudited count + tool output
