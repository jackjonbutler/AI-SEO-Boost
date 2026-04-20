# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.
**Current focus:** Phase 2 - Acquisition Pipeline (COMPLETE — ready for Phase 3)

## Current Position

Phase: 2 of 6 (Acquisition Pipeline) — COMPLETE
Plan: 2 of 2 in phase (02-01 and 02-02 complete)
Status: Phase 2 complete — ready for Phase 3 (content generators)
Last activity: 2026-04-20 — Completed 02-02 (crawlUrl BFS acquisition, full Phase 2 pipeline verified)

Progress: [█████░░░░░] 50%

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

### Pending Todos

None — Phase 2 complete. Phase 3 (content generators) can begin.

### Blockers/Concerns

- Phase 3: llms.txt spec compliance is LOW confidence in training data. Verify current required structure at llmstxt.org before implementing generate_llms_txt.
- Phase 2: Decide upfront whether to add iconv-lite for charset detection or document UTF-8-only as v1 limitation.

## Session Continuity

Last session: 2026-04-20
Stopped at: 02-02 complete — full acquisition pipeline (local + crawl) built and verified
Resume file: .planning/phases/03-content-generators/ — begin Phase 3
