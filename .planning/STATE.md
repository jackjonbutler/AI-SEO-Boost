# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20 after v1.1 milestone)

**Core value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.
**Current focus:** v1.2 — Audit Observability & Framework Awareness — Phase 14 next

## Current Position

Phase: 14 — Sitemap Coverage and Mirror Depth
Plan: 01 of 01 complete
Status: Phase complete — COV-01/COV-02/COV-03 closed
Last activity: 2026-04-21 — Completed 14-01-PLAN.md (sitemap-driven coverage estimator in checkMarkdownMirrors; sitemapindex detection; 20-URL sample cap; tsc clean)

Progress: [█████░░░░░░░░░░] 4/5 phases complete (Phases 11, 12, 13, and 14 complete, Phase 15 next)

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
- Phase 11-03: pagesAudited is undefined (not []) when no finding has diagnostics — avoids misleading empty array in callers; optional field matches AuditReport.pagesAudited?: string[]
- Phase 11-03: probedUrls derivation placed after Promise.all and before sort — severity-first sort order unchanged
- Phase 12-01: FrameworkDetection is structured { name, confidence } not bare string — FWK-03 requires confidence field accessible to callers and dimension helpers
- Phase 12-01: fetchAndDetectFramework catches ALL errors (AbortSignal timeout included) and returns null — required to prevent runAudit Promise.all rejection (Pitfall 4)
- Phase 12-01: detectFramework kept pure (no I/O) — runAudit owns the fetch and passes html+headers in; ensures unit-testability without network mocking
- Phase 12-01: Hugo and Jekyll included with only weak signals — confidence ceiling is 'low', honest about meta generator tag being frequently stripped
- Phase 12-02: buildPlacementNote helpers are module-scope pure functions — no I/O, easily unit-testable
- Phase 12-02: llms.txt fallback returns generic 'Place in site root' message (non-empty); robots.txt and markdown fallbacks return '' (existing messages self-sufficient)
- Phase 12-02: null/undefined framework accepted via FrameworkDetection | null | undefined union — matches fetchAndDetectFramework() return type
- Phase 12-03: resolve framework before dimension Promise.all (not inside it) — Approach A (param passing) requires framework at message-construction time; correctness wins over 1 extra RT
- Phase 12-03: checkSchemaMarkup and checkFaq remain single-arg — not framework-aware; their messages don't vary by framework
- Phase 12-03: AuditReport.framework is optional field — zero breaking changes to wizard or existing callers
- Phase 13-01: Omitted bare 'shop' keyword from OnlineStore map — 'vehicle wrap shop' must return 'LocalBusiness'; 'ecommerce', 'e-commerce', 'online store', 'retail' are sufficient
- Phase 13-01: Omitted ' app ' keyword — 'software', 'saas', 'platform', 'tool' cover SoftwareApplication without false-positive risk on common English words
- Phase 13-01: LOCAL_BUSINESS_SUBTYPES excludes SoftwareApplication and OnlineStore — they extend Thing/CreativeWork, not LocalBusiness on schema.org; require separate pass logic in schema.ts
- Phase 13-02: LocalBusiness accepted as parent type for LOCAL_BUSINESS_SUBTYPES members (Restaurant, LegalService, etc.) — conservative page markup using parent type is acceptable
- Phase 13-02: SoftwareApplication and OnlineStore require exact match — LocalBusiness does NOT satisfy them
- Phase 13-02: businessContext optional throughout chain (checkSchemaMarkup, runAudit) — zero breaking changes to existing callers
- Phase 14-01: cheerio loaded with { xml: true } (not deprecated xmlMode: true) — per research flag verified before Phase 14
- Phase 14-01: Sitemap index: fetch only first child sitemap — fetching all defeats the 20-probe sample cap
- Phase 14-01: Coverage in message string only — AuditFindingDiagnostics.checkedUrl is singular string, not array; no types.ts changes
- Phase 14-01: null sentinel from fetchSitemapUrls = no sitemap/unreachable (warning); [] = empty sitemap (warning); string[] = run coverage
- Phase 14-01: Thresholds: 100% sampled → pass, 1-99% → warning, 0% → fail

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
Stopped at: Completed 14-01 — sitemap coverage estimator complete; COV-01/COV-02/COV-03 closed; tsc --noEmit zero errors
Next: Phase 15 — Wizard Type Narrowing (WIZ-01)
