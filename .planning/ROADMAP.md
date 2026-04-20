# Roadmap: AI SEO Boost

## Overview

Six phases that build the MCP server bottom-up: foundation and types first, then the HTML acquisition pipeline that five tools share, then generators in dependency order (audit + signature features, then sitemap + mirrors + schema, then FAQ content), and finally distribution. Each phase delivers something runnable and testable before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - MCP server wired on stdio with shared types and error policy in place
- [ ] **Phase 2: Acquisition Pipeline** - Local folder traversal and live URL crawl with HTML processing shared by all generators
- [ ] **Phase 3: Core Generators** - Audit, llms.txt, and robots.txt — the entry point and signature features
- [ ] **Phase 4: Sitemap, Mirrors, and Schema** - URL-based sitemap, markdown mirrors, and standalone JSON-LD schema markup
- [ ] **Phase 5: FAQ Content** - AI-quotable FAQ generator that feeds schema and enriches business profiles
- [ ] **Phase 6: Distribution** - README, Claude Desktop config snippet, and tool documentation

## Phase Details

### Phase 1: Foundation
**Goal**: Claude can connect to a running MCP server, discover tools, and call them without crashes
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02
**Success Criteria** (what must be TRUE):
  1. Running `node dist/index.js` starts the server and it accepts stdio connections without error
  2. Claude Code or Claude Desktop lists all 8 tool names after pointing at the server config
  3. A stub tool call returns a valid MCP response (not a JSON-RPC parse error)
  4. `BusinessContext` input type is importable by any tool file without circular dependency
  5. console.log() produces no output to stdout — all logging uses console.error()
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffold: package.json (type: module), tsconfig (outDir: ./dist, Node16 ESM), dependencies (SDK 1.29.0 + zod@3), and BusinessContext shared type (FOUND-02)
- [ ] 01-02-PLAN.md — MCP server wire-up: register all 8 tool stubs, create src/index.ts entry point with StdioServerTransport, build, and verify via Claude Code (FOUND-01)

### Phase 2: Acquisition Pipeline
**Goal**: Any tool can receive a local folder path or a live URL and get back an array of clean MarkdownDocuments
**Depends on**: Phase 1
**Requirements**: FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. Given a folder of HTML files, the pipeline returns one MarkdownDocument per page with YAML frontmatter and chrome stripped
  2. Given a live URL, the pipeline crawls up to the configured page cap, respects the timeout, and returns MarkdownDocuments
  3. All URLs in returned documents are absolute (no relative hrefs)
  4. A page that fails to fetch or parse returns an error entry instead of crashing the pipeline
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Install cheerio/turndown/p-limit@6, extend shared types (MarkdownDocument, AcquisitionError), build processing layer (strip.ts, convert.ts), and local acquisition (acquireLocal)
- [ ] 02-02-PLAN.md — URL crawl acquisition: crawlUrl() with p-limit concurrency, AbortSignal.timeout() per-request, same-domain BFS, and full pipeline integration verification

### Phase 3: Core Generators
**Goal**: A user can run the audit to see what is broken, generate a spec-compliant llms.txt, and patch robots.txt to allow AI crawlers — without touching any file manually
**Depends on**: Phase 2
**Requirements**: GEN-01, GEN-02, CONT-01
**Success Criteria** (what must be TRUE):
  1. `audit_ai_seo` returns a prioritized fix list covering all 5 dimensions (llms.txt, schema, robots.txt AI access, FAQ blocks, markdown mirrors) with suggested tool calls for each gap
  2. `generate_llms_txt` produces a file with H1 site name, optional blockquote summary, and H2 section blocks per the llmstxt.org spec — populated entirely from user-provided BusinessContext, no invented content
  3. `configure_robots_txt` adds GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and CCBot allow-rules and a Sitemap pointer without removing any existing rules
  4. All three tools return a descriptive error string (not a crash) when given invalid or missing input
**Plans**: TBD

Plans:
- [ ] 03-01: Audit engine (src/audit/ — AuditReport type, URL and folder auditors, per-bot robots.txt check)
- [ ] 03-02: llms.txt generator (src/generators/files/llms-txt.ts + tool handler)
- [ ] 03-03: robots.txt patcher (src/generators/files/robots-txt.ts + tool handler)

### Phase 4: Sitemap, Mirrors, and Schema
**Goal**: A user can generate an XML sitemap, a full set of markdown mirrors, and JSON-LD schema blocks for any site or folder
**Depends on**: Phase 3
**Requirements**: GEN-03, GEN-04, CONT-02
**Success Criteria** (what must be TRUE):
  1. `generate_sitemap` produces valid XML with absolute URLs, ISO 8601 lastmod dates, and priority scores (1.0 home, 0.9 service, 0.8 info, 0.7 secondary)
  2. `generate_markdown_mirrors` writes one index.md per page with YAML frontmatter and all navigation/script chrome removed
  3. `generate_schema_markup` outputs valid JSON-LD for LocalBusiness, FAQPage, and Service types using https://schema.org context — output passes schema.org validator
  4. All three tools work from both a local folder and a live URL
**Plans**: TBD

Plans:
- [ ] 04-01: Sitemap generator (src/generators/files/sitemap.ts + tool handler)
- [ ] 04-02: Markdown mirrors generator (src/generators/files/markdown-mirrors.ts + tool handler)
- [ ] 04-03: Schema markup generator (src/generators/content/schema-markup.ts + tool handler)

### Phase 5: FAQ Content
**Goal**: A user can generate AI-quotable FAQ content from business details that can feed into schema markup or be published directly
**Depends on**: Phase 4
**Requirements**: CONT-03
**Success Criteria** (what must be TRUE):
  1. `generate_faq_content` returns 8–10 Q&A pairs where every answer names the business, cites a specific number or fact, and contains no marketing hedging language
  2. All Q&A content is derived from BusinessContext input — no invented details appear in any answer
  3. The output is structured so it can be directly consumed by `generate_schema_markup` FAQPage type without transformation
**Plans**: TBD

Plans:
- [ ] 05-01: FAQ content generator (src/generators/content/faq.ts + tool handler)

### Phase 6: Distribution
**Goal**: Any developer can clone the repo, follow the README, and have the MCP server running in Claude Code within 10 minutes
**Depends on**: Phase 5
**Requirements**: DIST-01
**Success Criteria** (what must be TRUE):
  1. The README contains a working `claude_desktop_config.json` snippet that points to `node dist/index.js`
  2. Each of the 8 tools has a documented example input and expected output in the README
  3. Known limitations (JS-rendered sites, UTF-8 only, page cap) are documented
  4. A developer with Node 18+ can run `npm install && npm run build` and have a working server with no additional setup
**Plans**: TBD

Plans:
- [ ] 06-01: README and tool documentation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-04-20 |
| 2. Acquisition Pipeline | 0/2 | Not started | - |
| 3. Core Generators | 0/3 | Not started | - |
| 4. Sitemap, Mirrors, and Schema | 0/3 | Not started | - |
| 5. FAQ Content | 0/1 | Not started | - |
| 6. Distribution | 0/1 | Not started | - |
