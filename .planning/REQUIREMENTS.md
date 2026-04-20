# Requirements: AI SEO Boost

**Defined:** 2026-04-20
**Milestone:** v1.1 — Interactive Guided Remediation
**Core Value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.

## v1.1 Requirements

### Wizard Mode

- [ ] **WIZ-01**: After `audit_ai_seo` completes, user is prompted to choose "Detailed report" or "Fix with wizard"
- [ ] **WIZ-02**: `audit_ai_seo` accepts optional `businessContext` input alongside the existing `target` parameter

### Issue Selection

- [ ] **ISEL-01**: Wizard presents all audit issues as a toggleable checklist with severity/priority visible
- [ ] **ISEL-02**: All issues default to selected — user deselects to exclude
- [ ] **ISEL-03**: User submits their selection to begin the fix sequence

### Context Handling

- [ ] **CTX-01**: If business context provided upfront, it is reused across all tool invocations
- [ ] **CTX-02**: If no upfront context, wizard asks for required fields as each tool needs them
- [ ] **CTX-03**: Context gathered mid-wizard is accumulated and never re-asked for subsequent tools

### Tool Execution

- [ ] **EXEC-01**: For each selected issue, wizard identifies and fires the correct fixing tool
- [ ] **EXEC-02**: Tools execute sequentially in priority order
- [ ] **EXEC-03**: Each tool asks only for fields not already in accumulated context ("fill in the blanks")
- [ ] **EXEC-04**: Each completed tool run shows a confirmation of what was written or changed
- [ ] **EXEC-05**: After all selected issues are resolved, wizard shows a summary of everything fixed

## Future Requirements

### Deferred from v1.0

- **LOC-01**: `generate_location_service_pages` full implementation (currently registered as stub)
- **CHAR-01**: iconv-lite charset detection — UTF-8-only is a documented v1 limitation
- **JS-01**: JS-rendered site support via headless browser for React/Vue SPAs without SSR

## Out of Scope

| Feature | Reason |
|---------|--------|
| Parallel tool execution in wizard | Sequential is safer — context accumulates, user can follow along |
| Undo / rollback wizard changes | Out of scope v1.1 — files can be manually reverted |
| Wizard state persistence across sessions | Single-run flow; no session storage needed |
| Batch wizard for multiple sites | Single-site focus consistent with v1 model |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIZ-01 | Phase 7 | Pending |
| WIZ-02 | Phase 7 | Pending |
| ISEL-01 | Phase 8 | Pending |
| ISEL-02 | Phase 8 | Pending |
| ISEL-03 | Phase 8 | Pending |
| CTX-01 | Phase 9 | Pending |
| CTX-02 | Phase 9 | Pending |
| CTX-03 | Phase 9 | Pending |
| EXEC-01 | Phase 10 | Pending |
| EXEC-02 | Phase 10 | Pending |
| EXEC-03 | Phase 10 | Pending |
| EXEC-04 | Phase 10 | Pending |
| EXEC-05 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 13 total
- Mapped to phases: 13 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 after roadmap creation (Phases 7–10)*
