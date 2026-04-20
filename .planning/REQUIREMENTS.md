# Requirements: AI SEO Boost

**Defined:** 2026-04-20
**Milestone:** v1.2 — Audit Observability & Framework Awareness
**Core Value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.

## v1.2 Requirements

### Audit Diagnostics

- [ ] **DIAG-01**: Each audit finding includes a `diagnostics` block showing what was fetched (URL, HTTP status, bytes received) and what was specifically found or missing — so callers can verify findings without re-fetching
- [ ] **DIAG-02**: HTTP 4xx/5xx responses from targeted fetches (e.g., /llms.txt returning 403) surface in the finding's diagnostics rather than being silently treated as "file not found"
- [ ] **DIAG-03**: `AuditReport` includes a `pagesAudited` field listing all URLs actually crawled, so caller knows the crawl scope

### Framework Awareness

- [ ] **FWK-01**: `audit_ai_seo` detects the site's web framework from asset path prefixes (`/_next/`, `/_nuxt/`, `/wp-content/`, `/_astro/`, etc.) and stores it on the `AuditReport`
- [ ] **FWK-02**: Fix suggestions for llms.txt, robots.txt, and markdown mirrors include framework-specific file placement instructions (e.g., "Place at `/public/llms.txt` and redeploy" for Nuxt/Next.js vs. "Upload to site root via FTP" for WordPress)
- [ ] **FWK-03**: Framework detection reports a confidence level — never asserts a framework from a single weak signal

### Schema Intelligence

- [ ] **SCH-01**: The schema dimension check maps `businessContext.businessType` to the appropriate JSON-LD `@type` (e.g., `SoftwareApplication` for SaaS, `TravelAgency` for travel, `ProfessionalService` as a safe fallback for ambiguous local businesses) rather than always expecting `LocalBusiness`
- [ ] **SCH-02**: When no `businessContext` is provided, the schema check falls back to checking for any valid JSON-LD `@type` presence rather than a specific type

### Coverage Reporting

- [ ] **COV-01**: The markdown dimension check fetches and parses the site's sitemap (if present) to determine what % of sitemap URLs have corresponding markdown mirrors — not just whether `/index.md` exists
- [ ] **COV-02**: Sitemap parsing handles sitemap index files (which point to child sitemaps) without reporting 0 URLs
- [ ] **COV-03**: Coverage check is capped at 15–20 URL probes to stay within MCP timeout budget; result is labelled "estimated coverage"

### Wizard Integration & Type Safety

- [ ] **WIZ-01**: `suggestedToolCall` is narrowed from `string` to a string literal union type, and the wizard's switch dispatch is replaced with a typed dispatch table — so adding or renaming a tool name produces a TypeScript compile error rather than a silent fall-through
- [ ] **WIZ-02**: Each finding's `suggestedToolCallArgs` is pre-populated with fields the audit already knows (e.g., `target`, detected missing bots list, found schema types) so the wizard can seed the accumulator without re-prompting for already-known values

## Future Requirements

### Deferred from v1.1

- **LOC-01**: `generate_location_service_pages` full implementation (currently v2 stub)
- **CHAR-01**: iconv-lite charset detection — UTF-8-only is a documented v1 limitation
- **JS-01**: JS-rendered site support via headless browser for React/Vue SPAs without SSR

### Deferred from v1.2 scoping

- **SEV-01**: Severity calibration by framework — effort-to-fix weighting (Nuxt llms.txt = 5 min vs Framer FAQ JSON-LD = weekend)
- **UA-01**: Configurable user-agent string for the crawler (for sites that serve differently to unknown UAs)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Infer businessName/description from scraped HTML | Leads to hallucinated facts in generated files — content fields must come from user |
| Full sitemap re-crawl for coverage check | Timeout risk on large sites; 15-probe sample is sufficient signal |
| Offline/cached audit results | Single-run tool; no session storage in v1 |
| Framework-specific fix automation (e.g., auto-edit nuxt.config.js) | Too framework-specific and risky; file placement guidance is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIAG-01 | Phase 11 | Pending |
| DIAG-02 | Phase 11 | Pending |
| DIAG-03 | Phase 11 | Pending |
| FWK-01 | Phase 12 | Pending |
| FWK-02 | Phase 12 | Pending |
| FWK-03 | Phase 12 | Pending |
| SCH-01 | Phase 13 | Pending |
| SCH-02 | Phase 13 | Pending |
| COV-01 | Phase 14 | Pending |
| COV-02 | Phase 14 | Pending |
| COV-03 | Phase 14 | Pending |
| WIZ-01 | Phase 15 | Pending |
| WIZ-02 | Phase 15 | Pending |

**Coverage:**
- v1.2 requirements: 13 total
- Mapped to phases: 13 (100%)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 after v1.2 milestone research*
