# Project Research Summary

**Project:** AI SEO Boost -- TypeScript MCP Server
**Domain:** AI-visibility SEO tooling (MCP server, HTML crawling, schema markup, sitemaps, llms.txt)
**Researched:** 2026-04-17
**Confidence:** MEDIUM-HIGH overall (stack HIGH, features HIGH for core specs, architecture HIGH, pitfalls MEDIUM-HIGH)

## Executive Summary

AI SEO Boost is a TypeScript MCP server built on the official @modelcontextprotocol/sdk, running over stdio transport as a child process of Claude Desktop or Claude Code. It exposes 8 tools that generate and audit the AI-visibility layer of a website: llms.txt, markdown mirrors, sitemap, robots.txt, JSON-LD schema, FAQ content, location/service pages, and an audit entry point. The server has no database, no HTTP layer, and no daemon. It is a flat-process local CLI tool that reads HTML from either a local folder or a live URL, strips navigation chrome, converts to markdown, and generates standards-compliant SEO artefacts.

The recommended technical approach is a layered pipeline: HTML acquisition (local or crawled) feeds a processing pipeline (chrome-stripping via Cheerio, markdown conversion via Turndown), which feeds independent file and content generators. Tool handlers in src/tools/ stay thin -- validate, delegate to generators, return text. The strict boundary rule is that no generator imports from another; the Tool Registry is the only cross-cutting orchestrator. This layered structure makes every component independently testable before the MCP layer exists.

The top risks are: (1) console.log() corrupting the JSON-RPC stdio stream -- use console.error() everywhere from day one; (2) relative URLs leaking into sitemaps, llms.txt, and schema markup -- absolutize at extraction time not at output time; (3) long crawl operations timing out the MCP client -- cap single-call crawl depth at 10-20 pages and design pagination in from Phase 1; (4) invalid JSON-LD that passes visual inspection -- validate against schema.org validator in tests. These risks are all avoidable with upfront discipline and none require rearchitecting.

---

## Key Findings

### Recommended Stack

The stack is lean and well-justified. The MCP SDK (@modelcontextprotocol/sdk ^1.x) with Zod (^3.x) for tool input schemas is the only viable choice -- it is the official TypeScript SDK with no credible alternative. Node 18+ provides native fetch, eliminating the need for axios or got. Cheerio handles chrome-stripping without a Chromium binary, avoiding the 150MB install barrier that Playwright would impose. Turndown converts clean HTML to Markdown in a single package, avoiding the ESM-friction complexity of the unified/rehype pipeline. xmlbuilder2 generates standards-compliant sitemap XML safely. glob and p-limit round out local file traversal and crawl concurrency control.

**Core technologies:**
- @modelcontextprotocol/sdk ^1.x: MCP server runtime, the only compliant TypeScript SDK
- zod ^3.x: Tool input schema validation, required by the SDK registerTool API; use Zod 3 not Zod 4
- cheerio ^1.0.0: HTML parsing and chrome-stripping, jQuery-style, runs without a browser, no Chromium binary
- turndown ^7.x: HTML-to-Markdown conversion, single-package, configurable, production-proven for AI contexts
- xmlbuilder2 ^3.x: XML sitemap generation, fluent builder with automatic entity escaping
- p-limit ^5.x: Crawl concurrency control, keep simultaneous fetch calls to 2-3 to avoid rate limiting
- glob ^10.x: Local file traversal, ESM-only, compatible with type module package
- tsx ^4.x: Dev-time TypeScript execution, no pre-build step needed during development

**Version risk:** Pin @modelcontextprotocol/sdk to the current exact version (it moves fast). Confirm p-limit and glob ESM compatibility with Node16 module resolution before first install.

### Expected Features

All 8 tools are in scope for v1. The ordering below reflects both dependency flow and risk -- the audit runs first to establish the before state, and each subsequent tool has fewer blockers than the previous.

**Must have (table stakes):**
- audit_ai_seo: entry point for every user; establishes what is broken before any generation
- generate_llms_txt: the signature feature; spec-compliant output (H1 name, blockquote, link sections)
- configure_robots_txt: patch mode only, never overwrite; explicitly allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot
- generate_sitemap: valid XML with absolute URLs, ISO 8601 lastmod, priority scoring (1.0/0.8/0.6/0.4)
- generate_markdown_mirrors: dual access mode (local folder + live URL); strip chrome before conversion; YAML frontmatter
- generate_schema_markup: LocalBusiness + FAQPage JSON-LD; HTTPS @context; typed interfaces for compile-time validation
- generate_faq_content: feeds schema markup and location pages; AI citation-optimized Q&A format
- generate_location_service_pages: most complex; requires business details + city/service list; outputs structured content template

**Should have (competitive differentiators, v1 stretch goals):**
- Audit that returns pre-filled tool call suggestions rather than just flagging missing files
- AI crawler coverage check per-bot rather than just confirming robots.txt exists
- Markdown mirror quality scoring (word count, heading structure, boilerplate detection)
- llms.txt link prioritization by AI-relevance (services first, FAQ next, contact last)

**Defer to v2+:**
- llms-full.txt companion file: valuable but outside the original 8-tool spec
- Incremental update mode: high complexity; manual re-run is acceptable for v1
- Headless browser rendering (Playwright) for JS-rendered SPAs: document as known limitation in v1

**Anti-features (never build):**
Keyword research, backlink analysis, Google Search Console OAuth, multi-site dashboard, automatic publishing, content SEO scoring, HTML meta tag injection, automatic scheduling.

### Architecture Approach

The server is a flat-process stdio MCP server with a strict layered pipeline. src/index.ts wires McpServer + StdioServerTransport and registers all 8 tools via server.registerTool(). Tool handlers in src/tools/ are thin: validate input via Zod, call into domain modules, return MCP text content. Generators in src/generators/ are pure domain functions that receive MarkdownDocument arrays and return strings. The acquisition layer (src/acquisition/) abstracts the local-vs-URL source difference behind a shared HtmlDocument interface. No generator imports from another generator -- the Tool Registry is the sole orchestrator.

**Major components:**
1. src/index.ts (Entry + MCP Protocol Layer): McpServer, StdioServerTransport, JSON-RPC lifecycle
2. src/tools/ (Tool Registry): 8 thin handlers, Zod validation, MCP response shaping
3. src/acquisition/ (HTML Acquisition Layer): local.ts (glob + fs), crawl.ts (fetch + redirects)
4. src/processing/ (HTML Processing Pipeline): strip.ts (Cheerio chrome removal), convert.ts (Turndown + frontmatter)
5. src/generators/files/ (File Generators): llms-txt.ts, sitemap.ts, robots-txt.ts
6. src/generators/content/ (Content Generators): schema-markup.ts, faq.ts, page-content.ts
7. src/audit/ (Audit Engine): UrlAuditor + FolderAuditor, returns structured AuditReport
8. src/types/index.ts (Shared Types): HtmlDocument, MarkdownDocument, AuditReport

### Critical Pitfalls

1. **console.log() corrupts the stdio JSON-RPC stream**: use console.error() everywhere, no exceptions; enforce via lint rule from day one
2. **Relative URLs in all output artifacts**: absolutize every extracted URL at extraction time using new URL(rawHref, pageBaseUrl).href; respect base href tags; track resolved post-redirect URL as base
3. **MCP tool call timeouts on long crawls**: cap single tool calls at 10-20 pages; design the crawl pagination pattern (crawl_id or partial results flag) in Phase 1 before the crawl engine is built
4. **Invalid JSON-LD that passes visual inspection**: always use https://schema.org (HTTPS, no trailing slash); use TypeScript interfaces or schema-dts for compile-time checking; validate with schema.org validator in tests
5. **llms.txt spec non-compliance**: read the canonical spec at llmstxt.org before implementing; required structure is H1 site name, optional blockquote, then H2 section blocks with description links; verify current spec version
6. **Unhandled promise rejections crash the MCP server process**: wrap all tool handlers in top-level try/catch; register process.on(unhandledRejection) to log and recover; return isError true content on failure

---

## Implications for Roadmap

Based on research, the architecture bottom-up dependency ordering directly maps to phases. Lower layers must exist before upper layers can be built or tested. The 8 tools are not independent -- they share acquisition, processing, and type infrastructure. Building tools bottom-up means every phase delivers something usable and testable.

### Phase 1: Foundation and MCP Scaffold

**Rationale:** All other phases depend on the MCP server being wired correctly, the shared types being defined, and the error handling architecture being in place. Tool timeout design must happen here because retrofitting it later is a rewrite.
**Delivers:** Running MCP server with stdio transport; src/types/index.ts shared interfaces; top-level error handling; console.error()-only logging policy enforced; one stub tool to prove end-to-end connectivity; tsconfig, package.json, build script
**Addresses:** MCP tool discovery, input validation via Zod, tool description quality
**Avoids:** Wrong transport locked in early, schema/type mismatch, timeout design gaps, vague tool descriptions, unhandled rejection crashes
**Research flag:** Standard patterns. MCP quickstart docs are HIGH confidence. No additional research needed.

### Phase 2: HTML Acquisition and Processing Pipeline

**Rationale:** The acquisition and processing layers are shared infrastructure for 5 of the 8 tools. Building them as a testable pipeline before any generator means generators can be tested with fixture HTML. This is where the highest-risk parsing bugs live.
**Delivers:** src/acquisition/local.ts (glob + fs), src/acquisition/crawl.ts (fetch + p-limit + AbortSignal timeout + error reporting), src/processing/strip.ts (Cheerio chrome removal with fallback selector chain), src/processing/convert.ts (Turndown + YAML frontmatter)
**Uses:** cheerio, turndown, p-limit, glob, @types/turndown
**Implements:** HTML Acquisition Layer + HTML Processing Pipeline
**Avoids:** Relative URLs in output, JS-rendered content handled with explicit warning, chrome bleeding into markdown, encoding issues, rate limiting hangs, selector brittleness, broken markdown links, Windows path handling bugs
**Research flag:** Standard patterns for Cheerio, Turndown, and fetch. Decide upfront: add iconv-lite for charset detection or document UTF-8-only as a v1 limitation.

### Phase 3: Core File Generators (audit + llms.txt + robots.txt)

**Rationale:** The audit is the entry point every user runs first. llms.txt is the signature feature with the fastest ROI. robots.txt patch mode has the lowest complexity of the remaining tools. These three establish the core value proposition before the heavier generators are built.
**Delivers:** src/audit/ (AuditReport structure, URL + folder auditors, per-bot robots.txt check), src/generators/files/llms-txt.ts (spec-compliant output with link prioritization), src/generators/files/robots-txt.ts (parse-and-patch, never overwrite, diff preview), tools wired: audit_ai_seo, generate_llms_txt, configure_robots_txt
**Avoids:** robots.txt accidentally blocking Googlebot or AI crawlers, llms.txt non-compliance
**Research flag:** NEEDS RESEARCH. The llms.txt spec was LOW confidence in training data. Verify current required structure at llmstxt.org before implementing the generator. Confirm required vs optional sections, link format, and whether llms-full.txt is now part of the base spec.

### Phase 4: Sitemap and Schema Markup Generators

**Rationale:** Sitemap depends on having a list of URLs from the acquisition layer (now ready). Schema markup is standalone (pure input to JSON-LD output) but has the highest spec-compliance risk. Grouping both in Phase 4 balances acquisition-dependent vs standalone work.
**Delivers:** src/generators/files/sitemap.ts (xmlbuilder2, absolute URLs, ISO 8601 dates, priority scoring, 50K limit), src/generators/content/schema-markup.ts (LocalBusiness + FAQPage JSON-LD, TypeScript interfaces for required fields, HTTPS @context), tools wired: generate_sitemap, generate_schema_markup
**Uses:** xmlbuilder2
**Avoids:** Invalid JSON-LD, sitemap encoding/normalization errors, wrong date formats, URL case inconsistency, XML special character bugs
**Research flag:** Standard patterns. Sitemap protocol and schema.org specs are HIGH confidence and stable. Include schema.org validator call in integration tests.

### Phase 5: Content Generators (FAQ + Location/Service Pages)

**Rationale:** FAQ content feeds schema markup (FAQPage) and location pages -- it belongs after schema markup is proven. Location/service page generation is the most complex tool and builds on everything else. Completing Phase 5 delivers the full 8-tool spec.
**Delivers:** src/generators/content/faq.ts (AI citation-optimized Q&A: specific claims, business name in answer, no hedging), src/generators/content/page-content.ts (structured page templates: H1, definition, service list, local signals, FAQ section), tools wired: generate_faq_content, generate_location_service_pages
**Avoids:** Hallucinated content -- all content from user-provided input, no invented text; require all fields, validate input completeness
**Research flag:** Standard patterns. Content template generation is well-understood. The main risk is hallucination which is architectural not a research gap.

### Phase 6: Polish, Integration, and Documentation

**Rationale:** After all 8 tools are functional, a polish phase ensures the server is deployable, tool descriptions are tested for LLM discoverability, and the README covers setup, Claude Desktop config, and known limitations.
**Delivers:** Final tool description audit (test each description by asking Claude to pick the right tool from intent alone), README with Claude Desktop config snippet, known limitations documentation, integration test suite against fixture HTML
**Research flag:** No research needed. This is execution work.

### Phase Ordering Rationale

- Types and scaffold must precede all other work because every module imports from src/types/
- Acquisition and processing are shared by 5+ tools -- build once and use everywhere
- Audit before generators because users run audit first and having it early validates the pipeline end-to-end
- llms.txt before sitemap because llms.txt is lowest complexity and fastest to prove the generator pattern
- robots.txt patch mode in Phase 3 because it is non-destructive, high ROI, and shares no dependencies with heavier generators
- Sitemap before schema because sitemap is file-based (acquisition-dependent) while schema is input-based (standalone)
- FAQ before location pages because FAQ content is consumed by both schema and location pages
- This ordering ensures each phase is independently deployable and demonstrates value to a real user

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (llms.txt):** LOW confidence on current spec. Verify required structure, link format, and llms-full.txt relationship at llmstxt.org before writing the generator. One research-phase call recommended.
- **Phase 2 (encoding):** Decide upfront whether to add iconv-lite for charset detection or document UTF-8-only as a v1 limitation. Low effort spike.

Phases with standard patterns (skip research-phase):
- **Phase 1 (MCP scaffold):** HIGH confidence from official MCP quickstart docs
- **Phase 4 (sitemap + schema):** HIGH confidence from stable W3C/sitemaps.org specs
- **Phase 5 (content generators):** Well-understood content template patterns
- **Phase 6 (polish):** Execution work, no domain research needed

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack verified via official MCP docs and stable ecosystem. Supporting ESM-only libraries need install-time verification. Pin MCP SDK to exact version. |
| Features | HIGH (core), LOW (competitive) | llms.txt spec, schema.org types, sitemap protocol, robots.txt AI crawlers all HIGH. Competitive feature comparison LOW because WebSearch was unavailable during research. |
| Architecture | HIGH | Official MCP architecture docs used directly. stdio transport, tool registration pattern, and file structure verified via official quickstart. |
| Pitfalls | MEDIUM-HIGH | HTML parsing, URL handling, JSON-LD, and sitemap pitfalls are HIGH (stable specs). MCP tool timeout and progress notification support is MEDIUM. llms.txt spec compliance is LOW. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **llms.txt spec currency:** Training data covers the spec as of 2024-2025 and it was still evolving. Verify current required structure at llmstxt.org before Phase 3 implementation. Risk: medium (wrong format means the signature feature does not work).
- **MCP SDK version pinning:** The SDK is fast-moving. Pin to exact version at install time. Check for breaking changes in tool registration API if upgrading. Risk: low.
- **ESM compatibility of glob v10 and p-limit v5 with Node16 module resolution:** Confirm with npm show and a test import before relying on them. Risk: low.
- **MCP progress notifications:** PITFALLS.md flags that server.sendNotification for progress may not be supported in current SDK. Verify before designing crawl pagination around it. If unsupported, use the crawl_id/pagination pattern instead. Risk: medium.
- **iconv-lite encoding detection:** Decision needed in Phase 2 -- add the dependency or document UTF-8-only limitation. Risk: low for v1 since most modern sites are UTF-8.

---

## Sources

### Primary (HIGH confidence)
- https://modelcontextprotocol.io/quickstart/server: MCP TypeScript quickstart, tool registration, stdio transport, console.log warning
- https://modelcontextprotocol.io/docs/concepts/architecture: MCP architecture, transport layer documentation
- https://www.sitemaps.org/protocol.html: XML sitemap protocol
- https://schema.org/LocalBusiness: required and recommended properties
- https://schema.org/FAQPage: Question/acceptedAnswer structure

### Secondary (MEDIUM confidence)
- Training data knowledge of cheerio, turndown, xmlbuilder2, p-limit, glob: versions and APIs generally stable; verify before install
- Training data on MCP SDK tool registration patterns: fast-moving library, verify against current SDK version
- llmstxt.org spec (training data, 2024-2025): required structure known but spec was evolving

### Tertiary (LOW confidence)
- Competitive AI SEO tool feature comparison: WebSearch unavailable; existing competitor feature sets not verified
- llms.txt spec current version: must verify at llmstxt.org before Phase 3 implementation
- MCP progress notification API: training data only; verify current SDK support before designing around it

---

*Research completed: 2026-04-17*
*Ready for roadmap: yes*
