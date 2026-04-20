# Project Research Summary

**Project:** AI SEO Boost v1.2
**Researched:** 2026-04-20
**Confidence:** HIGH

## Executive Summary

AI SEO Boost v1.2 is a targeted observability and intelligence upgrade to an already-functional MCP audit server. The existing five audit dimensions (llms.txt, robots.txt, schema markup, FAQ, markdown mirrors) are in production. v1.2 adds six capabilities: structured diagnostic evidence on findings, framework detection, schema type inference, sitemap-based mirror coverage, a pagesAudited field, and suggestedToolCallArgs pre-population for the wizard. All six features are implementable with the existing installed stack — no new npm install required. This makes v1.2 a pure logic and type-extension milestone.

The recommended approach is a seven-step build sequence ordered by dependency and risk: types first (zero-risk optional field additions), then acquisition layer enrichment, then new isolated utilities (framework detection), then runAudit() enrichment, then sitemap coverage logic, then diagnostic capture on dimension checks, and finally optional wizard seeding. Each step is independently verifiable with tsc --noEmit. The wizard reads exactly five fields from AuditFinding (suggestedToolCall, dimension, status, severity, message) — none of the six new fields touch those paths.

The key risks in v1.2 are type-system risks. The most dangerous pitfall is suggestedToolCall remaining typed as string when new tool names are added — silent wizard dispatch failures that produce no error and no result. The second risk is structural divergence between TOOL_FIELD_MAP and the execution switch 300+ lines apart. Both are solved by converting suggestedToolCall to a string literal union and replacing the switch with a typed dispatch table. All other pitfalls have clear, low-cost mitigations in PITFALLS.md.

## Key Findings

### Recommended Stack

v1.2 requires zero new dependencies. Every feature uses packages already present: cheerio for framework detection and sitemap XML parsing (xmlMode: true), native fetch for HTTP metadata capture, p-limit for throttled sitemap URL probing, and pure TypeScript for schema type inference. Replace Date.now() with performance.now() from node:perf_hooks to eliminate clock-drift artifacts in response time diagnostics.

**Core technologies (unchanged from v1.1):**
- @modelcontextprotocol/sdk ^1.29.0: MCP server runtime, tool registration, elicitation
- zod ^3.25.76: Input schema validation — required by SDK registerTool API
- cheerio ^1.2.0: HTML DOM traversal and sitemap XML via xmlMode: true
- turndown ^7.2.4: HTML to Markdown conversion
- p-limit ^6.2.0: Concurrency control for BFS crawler and sitemap probing
- typescript ^5.9.3 + tsx ^4.21.0: Language and dev-mode execution

**New v1.2 files (no new packages):**
- src/audit/framework.ts: detectFramework() pure utility
- src/audit/schema-type-map.ts: inferSchemaType() static keyword lookup

### Expected Features

**Must have (table stakes for v1.2):**
- HTTP status code surfaced in network-fetch findings — distinguishes 403 (bot-blocked) from 404 (missing) from 503 (server error)
- What-was-found vs. what-was-missing split in each finding
- Schema type inference from businessType — fixes false positives on SaaS/travel/ecommerce sites
- Framework detection (WordPress, Next.js, Nuxt, Astro, SvelteKit, Wix, Squarespace, Webflow) as AuditReport.framework — informational metadata, not a finding
- Sitemap presence check and URL count
- pagesAudited field on AuditReport
- suggestedToolCallArgs pre-seeded with target

**Should have (differentiators):**
- Sample-based mirror coverage % with explicit estimated label (cap at 20 URL probes)
- AuditFindingDiagnostics structured field (httpStatus, responseTimeMs, checkedUrl)
- Framework-tailored fix message copy
- Multi-signal framework detection with confidence level field

**Defer to v2+:**
- Framework version detection, hosting provider detection, full sitemap crawl, exhaustive schema validation, headless browser rendering

### Architecture Approach

The existing architecture is a parallel-dimension audit pipeline: runAudit() calls five dimension checks via Promise.all, each fetching independently, each returning an AuditFinding. v1.2 adds a preprocessing step (framework detection runs in parallel with dimensions), a post-collection step (seeds suggestedToolCallArgs on each finding), and extends two interfaces (AuditFinding gains diagnostics and suggestedToolCallArgs; AuditReport gains pagesAudited and framework). All additions are optional fields — zero breaking changes to the wizard.

**Major components modified in v1.2:**
1. src/audit/types.ts — central type contract; all new fields land here first
2. src/acquisition/crawl.ts — fetchPage() captures HttpMetadata before discarding Response
3. src/audit/framework.ts (new) — detectFramework() pure utility using cheerio pattern matching
4. src/audit/index.ts — runAudit() runs framework detection in parallel, post-collection seeds suggestedToolCallArgs
5. src/audit/dimensions/markdown.ts — fetchSitemapUrls() and checkMirrorExists() helpers; coverage % from up to 20 sitemap URLs
6. src/audit/dimensions/llms-txt.ts and robots-txt.ts — capture diagnostics on targeted fetches
7. src/tools/index.ts — minimal: one Object.assign(acc, finding.suggestedToolCallArgs) before gap-fill loop

### Critical Pitfalls

1. **suggestedToolCall typed as string enables silent wizard dispatch failures** — new values cause the switch to fall through silently. Fix: narrow to a string literal union AND replace the switch with a typed Record<SuggestedToolCall, handler> dispatch table before adding any new value.

2. **403 from UA-blocking hosts silently consumed as generic error** — AcquisitionError has no statusCode field. Fix: add statusCode?: number to AcquisitionError; return structured { html, statusCode } from dimension fetch helpers.

3. **Content-Length absent on CDN-served responses** — nearly all CDN responses omit Content-Length. Fix: measure Buffer.byteLength(rawText) after res.text() for actual byte count; treat Content-Length as optional only.

4. **Sitemap index files silently treated as empty sitemaps** — the sitemapindex root element contains child loc entries, not url elements. Fix: detect root element; if sitemapindex, recurse into child sitemaps, capped at 10.

5. **Framework detection false positive worse than false negative** — wrong framework produces misleading fix guidance. Fix: require 2-of-N signals; include confidence level field; return null on a single ambiguous signal.

## Implications for Roadmap

The six v1.2 features group into five phases ordered by dependency. The type-extension phase must come first because every other phase depends on new fields being in place for TypeScript to compile.

### Phase 1: HTTP Diagnostic Metadata Capture
**Rationale:** Foundation for all audit observability features. AuditFindingDiagnostics, suggestedToolCallArgs, pagesAudited, and framework must exist as types before any code produces them. Type-only changes are zero-risk.
**Delivers:** Extended AuditFinding and AuditReport types; HttpMetadata on MarkdownDocument; fetchPage() captures status, timing, content length via performance.now(); statusCode on AcquisitionError
**Addresses:** Evidence per finding (table stakes); pagesAudited field; foundation for all other features
**Avoids:** Pitfalls 22 (403 not surfaced), 23 (Date.now() drift), 24 (Content-Length absent on CDN)

### Phase 2: Framework Detection
**Rationale:** New isolated utility with no upstream dependencies. Runs in parallel with existing dimension checks in runAudit(). Can be built and unit-tested in isolation with fixture HTML before wiring in.
**Delivers:** src/audit/framework.ts with detectFramework(); AuditReport.framework populated; multi-signal detection with confidence level
**Addresses:** Framework detection (table stakes and differentiators)
**Avoids:** Pitfalls 25 (CDN path rewriting — multi-signal required), 26 (false positive worse than false negative — conservative assertion)

### Phase 3: Schema Type Inference
**Rationale:** Fixes the most user-visible false positive — SaaS sites incorrectly flagged for missing LocalBusiness. Requires a new optional businessType input field and a static keyword lookup table. Depends on Phase 1 types.
**Delivers:** src/audit/schema-type-map.ts; inferSchemaType() static lookup; schema dimension updated; suggestedToolCallArgs seeded with recommendedType
**Addresses:** Schema type inference (P1 priority — fixes false positives on non-local-business sites)
**Avoids:** Pitfalls 27 (businessType fuzzy matching — static lookup only), 28 (conflict with existing JSON-LD — warn before write)

### Phase 4: Sitemap Coverage and Mirror Depth
**Rationale:** New network operations that add latency. Cap at 20 URL probes to stay within MCP timeout budget. Must handle sitemap index files (common on WordPress/Yoast). Depends on Phase 1 types.
**Delivers:** fetchSitemapUrls() and checkMirrorExists() in markdown.ts; sitemap index recursion capped at 10 child sitemaps; coverage % with estimated label; pagesAudited from sitemap URLs
**Addresses:** Mirror coverage depth (table stakes); pagesAudited field
**Avoids:** Pitfalls 29 (sitemap index treated as empty), 30 (coverage % misleading — report raw counts), 31 (outputDir unknown — use live-site HEAD probes), 32 (www vs non-www — normalize origins)

### Phase 5: Wizard Integration and Type Safety
**Rationale:** Closes the loop — wizard reads suggestedToolCallArgs and diagnostics from phases 1-4. Also time to harden suggestedToolCall to a literal union and replace the switch with a typed dispatch table before any new values land in production.
**Delivers:** suggestedToolCall as string literal union; typed Record<SuggestedToolCall, handler> dispatch table; Object.assign(acc, finding.suggestedToolCallArgs) in wizard gap-fill loop; diagnostics visible in detailed-report JSON
**Addresses:** suggestedToolCallArgs pre-population (P1 feature); structured audit-to-fix handoff
**Avoids:** Pitfalls 33 (stale pre-populated args — only seed read-only values), 34 (switch dispatch silent failure), 35 (TOOL_FIELD_MAP/switch divergence)

### Phase Ordering Rationale

- Types must precede all other work — every phase adds fields that audit/types.ts and types/index.ts must declare for TypeScript to compile
- Framework detection is completely independent — build and test before schema, sitemap, or wizard changes
- Schema inference before sitemap coverage — higher user-value (P1 vs P2) and zero network overhead
- Wizard integration last — depends on all data-producing phases being stable

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (Sitemap Coverage):** Cheerio xmlMode: true for sitemap XML rated MEDIUM confidence in STACK.md. Validate against cheerio 1.2.0 changelog before relying on it. Fallback: regex on loc element content is simpler and equally valid for well-formed sitemaps.
- **Phase 5 (Wizard Integration):** Accumulator seeding order (Object.assign before gap-fill computation vs. after) is critical. Requires careful reading of tools/index.ts around line 264 before implementing.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Types):** Pure TypeScript optional field additions — tsc --noEmit is the only verification needed
- **Phase 2 (Framework Detection):** Static HTML pattern matching — fully documented signal map in STACK.md and FEATURES.md; no external API
- **Phase 3 (Schema Inference):** Static keyword lookup — schema.org type hierarchy is a stable, well-documented spec

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All six features verified against actual package.json and source files; zero new dependencies confirmed |
| Features | MEDIUM-HIGH | Framework fingerprint signals MEDIUM (OWASP, Wappalyzer indirect); audit evidence patterns HIGH (Lighthouse/axe-core docs) |
| Architecture | HIGH | Direct source code inspection of all relevant src/ files; type shapes and call chains verified line-by-line |
| Pitfalls | HIGH | v1.2 pitfalls (22-35) from direct codebase inspection; original pitfalls (1-21) from training knowledge, MCP SDK specifics MEDIUM |

**Overall confidence:** HIGH

### Gaps to Address

- **Cheerio xmlMode for sitemap XML:** Verify against cheerio 1.2.0 changelog before Phase 4. Regex fallback is documented and available.
- **performance.now() import under module: Node16 tsconfig:** Verify that importing from node:perf_hooks resolves correctly under the existing ESM configuration before committing in Phase 1.
- **MCP tool timeout budget for Phase 4:** 20-URL HEAD probe cap at 3s per probe equals 60s maximum — at the typical MCP client timeout boundary. Consider capping at 15 URLs (45s) for safety margin.
- **llms.txt spec currency:** LOW confidence in PITFALLS.md. Not relevant to v1.2 unless llms.txt dimension changes. Verify at llmstxt.org if any modifications planned.

## Sources

### Primary (HIGH confidence)
- Direct inspection of src/audit/types.ts, src/audit/index.ts, src/audit/dimensions/ — type shapes, call chains, wizard field reads
- Direct inspection of src/tools/index.ts lines 189, 234, 253, 369 — wizard dispatch logic and accumulator seeding
- Direct inspection of src/acquisition/crawl.ts — fetchPage() metadata discard point
- Direct inspection of src/types/index.ts — AcquisitionResult and MarkdownDocument shapes
- Node.js 18 built-in fetch Response API; Schema.org type hierarchy; Sitemap protocol spec (frozen)

### Secondary (MEDIUM confidence)
- Lighthouse understanding-results.md — evidence format: details.items, nodeLabel, snippet
- axe-core API documentation (Deque) — nodes[].html, result categories pattern
- OWASP Web Security Testing Guide — framework fingerprint signals from asset path prefixes
- Wappalyzer documentation — multi-signal detection with confidence tiers
- Screaming Frog sitemap audit docs — URL count, sample coverage approach
- Google Search Central structured data — use most specific subtype recommendation

### Tertiary (LOW confidence)
- llms.txt spec (llmstxt.org) — new spec (2024), evolving; verify before any llms.txt changes
- MCP tool timeout limits — training knowledge; verify against current SDK docs at modelcontextprotocol.io

---
*Research completed: 2026-04-20*
*Ready for roadmap: yes*
