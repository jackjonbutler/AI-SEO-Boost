# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.
**Current focus:** Phase 4 - Sitemap, Mirrors, and Schema (COMPLETE — ready for Phase 5)

## Current Position

Phase: 4 of 6 (Sitemap, Mirrors, Schema) — COMPLETE
Plan: 3 of 3 in phase — 04-01 done (sitemap XML), 04-02 done (markdown mirrors), 04-03 done (schema markup)
Status: Phase 4 complete — ready for Phase 5 (FAQ Content)
Last activity: 2026-04-20 — Completed 04-03 (buildSchemaMarkup + generate_schema_markup handler wired)

Progress: [██████████] 90%

## Performance Metrics

**Velocity:**
- Total plans completed: 1 (01-01)
- Average duration: ~2-5 min/plan
- Total execution time: ~7 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 complete | ~15 min | ~7.5 min |
| 02-acquisition-pipeline | 2 complete | ~16 min | ~8 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min), 01-02 (10 min including checkpoint)
- Trend: On track

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: TypeScript over Python (best MCP SDK support)
- Init: Dual access mode — local folder + live URL crawl
- Init: GitHub repo distribution only (no npm publish in v1)
- Init: All 8 tools in one server (single install covers full playbook)
- 01-01: outDir=./dist (not ./build) to match `node dist/index.js` start script
- 01-01: module=Node16 for ESM — local imports require .js extension in source
- 01-01: zod@3 (not zod@4) — matches official quickstart, both work with SDK peer dep
- 01-01: BusinessContext in src/types/index.ts with zero local imports (leaf node pattern)
- 01-02: McpServer instantiated at module level (not inside async main) — allows synchronous registerAllTools before transport
- 01-02: businessContextSchema defined once in tools/index.ts, reused across 7 tools
- 01-02: generate_location_service_pages registered as v2 stub — PROJECT.md Active list is canonical for tool count
- 01-02: All 8 tools verified in Claude Code CLI (human-approved 2026-04-17)
- 02-01: p-limit pinned at @6 (not @7) — v7 requires Node 20, project engines.node >=18
- 02-01: No @types/cheerio — cheerio 1.x ships native TypeScript types
- 02-01: TurndownService singleton at module level — stateless after construction, safe to reuse
- 02-01: readdir recursive:true without withFileTypes — avoids Node 18.17-18.18 silent entry-drop bug
- 02-01: acquireLocal never-throw pattern — per-file errors become AcquisitionError, not exceptions
- 02-02: BFS batch size = min(concurrency, queue.length, pageCap - results.length) — never overfetches
- 02-02: Link discovery on raw HTML before stripChrome — nav/header have richest internal link sets
- 02-02: hostname comparison for same-domain (not string prefix) — prevents subdomain spoofing
- 02-02: No iconv-lite in v1 — UTF-8 only, documented limitation
- 03-02: Generator pattern: src/generators/files/<name>.ts exports pure build<Name>(ctx) function — no I/O
- 03-02: Section order Services → Locations → Contact (llmstxt.org spec verified); empty sections forbidden
- 03-02: POSIX newline: trimEnd() + '\n' — no trailing blank lines, exactly one trailing newline
- 03-02: No About/Pricing sections in v1 — no corresponding BusinessContext fields
- 03-02: writeFile import already present in tools/index.ts — 03-03 can reuse without duplication
- 03-03: AI_BOTS exported as `as const` readonly tuple — audit plan (03-01 Wave 3) can re-export without rename
- 03-03: ENOENT handled inside patchRobotsTxt (auto-create); other fs errors rethrow to handler catch block
- 03-03: No robots.txt parsing library — append-only text mutation per RESEARCH.md Pattern 4 (parse+serialize breaks round-tripping)
- 03-01: AI_BOTS re-exported from generators/files/robots-txt.ts (not duplicated) — single source of truth for bot list
- 03-01: Origin normalisation in runAudit — probe = new URL(target).origin so all 5 dims check root, not deep paths
- 03-01: businessContext renamed _businessContext in handler destructuring only — public inputSchema unchanged
- 03-01: Question-heading heuristic threshold: >=3 headings with '?' = warning (not fail)
- 04-01: file:// URLs from local acquisition converted to https:// in resolveToAbsolute via basename extraction — no file:// leaks into sitemap <loc>
- 04-01: scorePriority operates on resolved absolute URL (post-resolveToAbsolute) — consistent scoring regardless of acquisition mode
- 04-01: xmlns uses http://www.sitemaps.org/schemas/sitemap/0.9 (http, not https) — correct per sitemaps.org spec
- 04-01: Empty docs array emits valid urlset with zero url children — never-throw pattern
- 04-02: urlToSlug strips /index segment so /services/index.html → 'services' (not 'services/index') — prevents double-nesting
- 04-02: Home page slug 'index' writes flat to outputDir/index.md (not outputDir/index/index.md) — per Pitfall 8
- 04-02: Per-call writtenSlugs Set inside handler (not module-level) — each tool invocation gets fresh collision tracking
- 04-02: YAML frontmatter values always double-quoted, internal quotes escaped — handles colons, hash chars safely
- 04-03: generate_schema_markup is a text-return tool (not file-emit) — no outputPath, returns JSON-LD blocks as MCP text content for caller to paste into HTML head
- 04-03: faqs optional input added proactively so Phase 5 generate_faq_content output can pipe directly without schema change
- 04-03: placeholderFaqs capped at 5 pairs; Service fallback uses ctx.businessType when ctx.services absent
- 04-03: buildSchemaMarkup throws on structural errors; handler catches and returns isError:true — never-throw at MCP boundary
- 04-03: SCHEMA_CONTEXT = 'https://schema.org' module-level constant (HTTPS, no trailing slash, per RESEARCH.md Pitfall 5)

### Pending Todos

Phase 5 next: generate_faq_content (real AI-quotable Q&A generation).

### Blockers/Concerns

- Phase 2: Decide upfront whether to add iconv-lite for charset detection or document UTF-8-only as v1 limitation (carried forward, not blocking Phase 3).

## Session Continuity

Last session: 2026-04-20
Stopped at: 04-03 complete — Phase 4 fully done (sitemap XML, markdown mirrors, schema markup)
Resume file: .planning/phases/05-faq-content/ (Phase 5 next)
