---
phase: 01-foundation
plan: 02
subsystem: mcp-server
tags: [mcp-sdk, typescript, zod, stdio, tool-registration, esm]

# Dependency graph
requires: [01-01]
provides:
  - src/tools/index.ts with registerAllTools() registering all 8 v1 tool stubs
  - src/index.ts entry point wiring McpServer to StdioServerTransport
  - dist/index.js compiled runnable MCP server (FOUND-01)
  - Stable tool API surface (names + input schemas) for Phases 2-5 to implement
affects: [02-content-generation, 03-acquisition, 04-audit, 05-advanced, 06-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "registerAllTools(server) pattern: one call in index.ts mounts all tools"
    - "stubResponse(toolName, phase) factory returns { content: [{ type: 'text' as const, text }] }"
    - "businessContextSchema Zod object lives in src/tools/index.ts — keeps types/ Zod-free"
    - "inputSchema is a plain object of Zod fields (not z.object wrap) — SDK wraps internally"
    - "McpServer created top-level (not inside main()) so registerAllTools can run synchronously"

key-files:
  created:
    - src/tools/index.ts
    - src/index.ts
  modified: []

key-decisions:
  - "McpServer instantiated at module level (not inside async main) — allows synchronous registerAllTools call before transport connect"
  - "businessContextSchema defined once in tools/index.ts and reused by all 7 tools that accept BusinessContext"
  - "generate_location_service_pages registered as v2 stub — PROJECT.md Active list is canonical (8 tools), not REQUIREMENTS.md v2 section"
  - "Tool names formatted on separate lines from registerTool( call — cosmetic only, does not affect registration"

# Metrics
duration: 5min
completed: 2026-04-17
---

# Phase 1 Plan 02: MCP Server Wire-up Summary

**MCP server entry point + all 8 tool stubs registered; dist/index.js compiled and smoke-tested end-to-end over stdio**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T11:02:48Z
- **Completed:** 2026-04-17T11:10:00Z
- **Tasks:** 2 of 2 (checkpoint pending human verification)
- **Files modified:** 2

## Accomplishments

- `src/tools/index.ts` created with `registerAllTools(server: McpServer): void` exporting all 8 tool stubs
- `businessContextSchema` Zod object defined once, reused across all 7 tools that accept BusinessContext
- Each tool has description, inputSchema (plain Zod field object), and async stub handler returning `{ content: [{ type: "text" as const, text }] }`
- `src/index.ts` entry point: McpServer + StdioServerTransport + registerAllTools wiring; fatal error handler exits(1)
- `npm run build` produces `dist/index.js`, `dist/tools/index.js`, `dist/types/index.js` — zero TypeScript errors
- Smoke test confirmed: `initialize` returns valid JSON-RPC result; `tools/list` returns all 8 tool names

## Registered Tool API Surface (stable — Phases 2-5 implement handlers only)

| Tool name | Phase | Required inputs | Optional inputs |
|-----------|-------|-----------------|-----------------|
| `audit_ai_seo` | 3 | `target`, `businessContext` | — |
| `generate_llms_txt` | 3 | `businessContext`, `outputPath` | — |
| `configure_robots_txt` | 3 | `robotsPath` | `sitemapUrl` |
| `generate_sitemap` | 4 | `target`, `baseUrl`, `outputPath` | — |
| `generate_markdown_mirrors` | 4 | `target`, `outputDir` | — |
| `generate_schema_markup` | 4 | `businessContext`, `schemaTypes` | — |
| `generate_faq_content` | 5 | `businessContext` | `count` (int 3-20) |
| `generate_location_service_pages` | v2 | `businessContext`, `locations`, `outputDir` | — |

## Module Dependency Chain

```
src/index.ts
  → @modelcontextprotocol/sdk/server/mcp.js   (McpServer)
  → @modelcontextprotocol/sdk/server/stdio.js  (StdioServerTransport)
  → ./tools/index.js                           (registerAllTools)
       → @modelcontextprotocol/sdk/server/mcp.js  (McpServer type)
       → zod                                       (z.object, z.string, etc.)
       → ../types/index.js                         (BusinessContext — type only)

src/types/index.ts   ← zero local imports (leaf node)
```

## Smoke Test Output

Initialize response (stdout — valid JSON-RPC result):
```json
{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"ai-seo-boost","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

Server banner (stderr):
```
AI SEO Boost MCP Server running on stdio
```

tools/list response: all 8 tools returned with full input schemas (JSON-LD draft-07 format).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/tools/index.ts with all 8 v1 tool stubs | `a730f33` | src/tools/index.ts |
| 2 | Create src/index.ts entry point, build dist/, smoke-test | `0c169e9` | src/index.ts |

## Deviations from Plan

**1. [Rule 1 - Minor] Removed unnecessary void-cast for BusinessContext import**

- **Found during:** Task 1
- **Issue:** Initial draft included `void (undefined as unknown as BusinessContext)` to suppress potential unused-import warning, but `import type` is erased at compile time and TypeScript reported no warning without it
- **Fix:** Removed the void expression; `import type { BusinessContext }` alone is sufficient and correct
- **Files modified:** src/tools/index.ts
- **Commit:** a730f33 (included in task commit)

**2. [Cosmetic] Tool name on line following registerTool( call**

- **Found during:** Task 1 verification
- **Issue:** Plan verification script expected `server.registerTool("tool_name"` on one line; actual formatting puts tool name on the next line
- **Impact:** Zero — this is a formatting choice only; all 8 tools are registered correctly as confirmed by the tools/list smoke test
- **No fix needed**

## Next Phase Readiness

- FOUND-01 satisfied (pending human checkpoint approval): `node dist/index.js` starts, accepts stdio, lists 8 tools
- FOUND-02 satisfied: `BusinessContext` in `src/types/index.ts`, imported by `src/tools/index.ts` as type-only
- All 5 ROADMAP Phase 1 success criteria met (pending checkpoint approval for Claude Code verification)
- Phase 2 can begin immediately after checkpoint approval: tool handlers have stable names + schemas; Phase 2 replaces handler bodies only

---
*Phase: 01-foundation*
*Completed: 2026-04-17*
