# Roadmap: AI SEO Boost

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-04-20)
- ✅ **v1.1 Interactive Guided Remediation** — Phases 7–10 (shipped 2026-04-20)
- 🔨 **v1.2 Audit Observability & Framework Awareness** — Phases 11–15 (active)

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

<details>
<summary>✅ v1.1 Interactive Guided Remediation (Phases 7–10) — SHIPPED 2026-04-20</summary>

- [x] Phase 7: Wizard Entry Point (1/1 plan) — completed 2026-04-20
- [x] Phase 8: Issue Selection (1/1 plan) — completed 2026-04-20
- [x] Phase 9: Context Accumulation (1/1 plan) — completed 2026-04-20
- [x] Phase 10: Tool Execution Engine (2/2 plans) — completed 2026-04-20

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### 🔨 v1.2 Audit Observability & Framework Awareness (Active)

**Milestone Goal:** Make audit findings auditable and actionable — diagnostic evidence per finding, framework-aware fix suggestions, semantic schema type inference, and mirror coverage depth.

---

#### Phase 11: HTTP Diagnostic Metadata Capture

**Goal:** Audit findings carry verifiable evidence — callers can see exactly what was fetched, what status was returned, and what the crawler scope was, without re-fetching.

**Dependencies:** None (types-first phase; all other v1.2 phases depend on this one)

**Requirements:** DIAG-01, DIAG-02, DIAG-03

**Success Criteria:**

1. An audit finding for a missing `llms.txt` or `robots.txt` includes a `diagnostics` block showing the URL checked, HTTP status code received, and byte count of the response body
2. An audit of a site where `/llms.txt` returns HTTP 403 produces a finding that explicitly states 403 (Forbidden) rather than treating the file as simply absent
3. The `AuditReport` returned by `audit_ai_seo` includes a `pagesAudited` array listing every URL the crawler visited, so the caller can verify crawl scope without re-running
4. `tsc --noEmit` passes with zero errors after all new type fields (`AuditFindingDiagnostics`, `suggestedToolCallArgs`, `pagesAudited`, `HttpMetadata`) are added — no existing tool signatures break

**Plans:** 3 plans

Plans:
- [ ] 11-01-PLAN.md — Declare AuditFindingDiagnostics, HttpMetadata, and optional fields on AuditFinding, AuditReport, MarkdownDocument
- [ ] 11-02-PLAN.md — Wire HTTP metadata capture in crawl.ts, llms-txt.ts, and robots-txt.ts
- [ ] 11-03-PLAN.md — Populate pagesAudited in runAudit() and full codebase type-check

---

#### Phase 12: Framework Detection

**Goal:** Every audit report names the detected web framework with a confidence level, and fix suggestions for file-placement issues reference framework-specific locations rather than a generic instruction.

**Dependencies:** Phase 11 (AuditReport type must exist with `framework` field slot)

**Requirements:** FWK-01, FWK-02, FWK-03

**Success Criteria:**

1. Auditing a Next.js site (with `/_next/` asset paths in the crawled HTML) populates `AuditReport.framework` with `{ name: "Next.js", confidence: "high" }` or similar structured value
2. Auditing a site with no recognizable framework signals returns `AuditReport.framework` as `null` or `{ name: "unknown", confidence: "none" }` rather than a guessed value
3. A detected WordPress site produces llms.txt and robots.txt fix suggestions that mention `/wp-content/` upload paths; a detected Nuxt/Next.js site produces suggestions mentioning `/public/` and redeployment
4. Framework detection never asserts a framework from a single weak signal — at least two independent asset-path signals are required before `confidence` is set to `"high"`

---

#### Phase 13: Schema Type Inference

**Goal:** The schema audit dimension flags the correct `@type` for the actual kind of business rather than universally expecting `LocalBusiness` — eliminating false positives on SaaS, travel, and e-commerce sites.

**Dependencies:** Phase 11 (AuditFinding type extended; `suggestedToolCallArgs` field available)

**Requirements:** SCH-01, SCH-02

**Success Criteria:**

1. Auditing a site with `businessContext.businessType = "saas"` (or similar software keyword) passes the schema check when the page's JSON-LD contains `@type: "SoftwareApplication"` rather than flagging it as missing LocalBusiness
2. Auditing a site with no `businessContext` provided passes the schema check when any valid JSON-LD `@type` is present — it does not fail solely because `LocalBusiness` is absent
3. The schema finding's `suggestedToolCallArgs` is seeded with a `recommendedType` field derived from the inferred type, so the wizard can pre-fill `generate_schema_markup` without asking the user to choose a type

---

#### Phase 14: Sitemap Coverage and Mirror Depth

**Goal:** The markdown mirrors audit finding reports a meaningful coverage percentage derived from the site's actual sitemap rather than a binary home-page pass/fail — giving users an honest picture of how much of their site is mirrored.

**Dependencies:** Phase 11 (AuditFinding diagnostics field available; pagesAudited in AuditReport)

**Requirements:** COV-01, COV-02, COV-03

**Success Criteria:**

1. Auditing a site with a sitemap at `/sitemap.xml` containing 40 URLs reports an estimated mirror coverage percentage (e.g., "8/20 sampled URLs have a mirror — estimated 40% coverage") rather than just pass or fail
2. Auditing a WordPress site whose `sitemap.xml` is a sitemap index file (containing `<sitemapindex>` with child `<loc>` entries) correctly counts URLs from child sitemaps rather than reporting 0 URLs found
3. The coverage check probes no more than 15–20 URLs total regardless of sitemap size, and labels its result "estimated coverage" so callers know it is a sample
4. Auditing a site with no sitemap present falls back gracefully — the finding notes no sitemap was found rather than throwing an error or hanging

---

#### Phase 15: Wizard Integration and Type Safety

**Goal:** The wizard can hand off audit context to tools without re-prompting for values the audit already captured, and the TypeScript type system enforces that every tool name in the dispatch table is known at compile time.

**Dependencies:** Phases 11–14 (all `suggestedToolCallArgs` data producers must be stable before seeding; all `suggestedToolCall` values must be established before narrowing the union)

**Requirements:** WIZ-01, WIZ-02

**Success Criteria:**

1. `suggestedToolCall` is a string literal union type (e.g., `"generate_llms_txt" | "configure_robots_txt" | ...`) — adding a new tool name that is not in the union produces a TypeScript compile error, not a silent runtime fall-through
2. The wizard's switch-statement dispatch is replaced with a typed `Record<SuggestedToolCall, handler>` dispatch table — referencing a key not in the union is a compile-time error
3. When the wizard reaches a finding for a missing `llms.txt`, the accumulator is pre-seeded with `target` and any other fields the audit already captured — the user is not re-asked for values the audit already knows
4. `tsc --noEmit` passes with zero errors after Phase 15 changes, confirming no type regressions were introduced by the literal union narrowing

---

- [x] Phase 11: HTTP Diagnostic Metadata Capture — completed 2026-04-21
- [ ] Phase 12: Framework Detection — Planned
- [ ] Phase 13: Schema Type Inference — Planned
- [ ] Phase 14: Sitemap Coverage and Mirror Depth — Planned
- [ ] Phase 15: Wizard Integration and Type Safety — Planned

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
| 9. Context Accumulation | v1.1 | 1/1 | Complete | 2026-04-20 |
| 10. Tool Execution Engine | v1.1 | 2/2 | Complete | 2026-04-20 |
| 11. HTTP Diagnostic Metadata Capture | v1.2 | 3/3 | Complete | 2026-04-21 |
| 12. Framework Detection | v1.2 | 0/? | Planned | — |
| 13. Schema Type Inference | v1.2 | 0/? | Planned | — |
| 14. Sitemap Coverage and Mirror Depth | v1.2 | 0/? | Planned | — |
| 15. Wizard Integration and Type Safety | v1.2 | 0/? | Planned | — |
