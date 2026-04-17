# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.
**Current focus:** Phase 1 - Foundation (checkpoint pending)

## Current Position

Phase: 1 of 6 (Foundation)
Plan: 2 of 2 in current phase
Status: Awaiting checkpoint approval (human-verify)
Last activity: 2026-04-17 — Completed 01-02 tasks 1+2; awaiting Claude Code verification checkpoint

Progress: [██░░░░░░░░] 18%

## Performance Metrics

**Velocity:**
- Total plans completed: 1 (01-01)
- Average duration: ~2-5 min/plan
- Total execution time: ~7 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 1 complete, 1 pending checkpoint | ~7 min | ~3.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min), 01-02 tasks (5 min)
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

### Pending Todos

- Human checkpoint: verify Claude Code lists all 8 tools and a stub call returns text (see 01-02-PLAN.md checkpoint task)

### Blockers/Concerns

- Phase 3: llms.txt spec compliance is LOW confidence in training data. Verify current required structure at llmstxt.org before implementing generate_llms_txt.
- Phase 2: Decide upfront whether to add iconv-lite for charset detection or document UTF-8-only as v1 limitation.

## Session Continuity

Last session: 2026-04-17
Stopped at: 01-02-PLAN.md checkpoint:human-verify — dist/index.js built and smoke-tested; awaiting Claude Code tool listing verification
Resume file: .planning/phases/01-foundation/01-02-PLAN.md (checkpoint task — resume after "approved" signal)
