# Architecture Patterns

**Domain:** TypeScript MCP Server (AI SEO Boost)
**Researched:** 2026-04-17
**Confidence:** HIGH (official MCP documentation + SDK source patterns)

---

## Recommended Architecture

AI SEO Boost is a flat-process stdio MCP server. There is no HTTP server, no daemon, no database. It runs as a child process spawned by the MCP host (Claude Desktop, Claude Code, etc.), communicates over stdin/stdout via JSON-RPC 2.0, and exits when the host closes the connection.

```
MCP Host (Claude Desktop / Claude Code)
    |
    | stdin/stdout (JSON-RPC 2.0)
    v
[Entry Point: src/index.ts]
    |
    +-- [MCP Protocol Layer]         McpServer + StdioServerTransport
    |       |
    |       +-- tools/list handler   Returns tool manifests
    |       +-- tools/call router    Dispatches to tool handlers
    |
    +-- [Tool Registry]              8 named tools, Zod input schemas
    |
    +-- [HTML Acquisition Layer]
    |       |
    |       +-- LocalFolderSource    glob + fs.readFile
    |       +-- UrlCrawlSource       fetch + redirect handling
    |
    +-- [HTML Processing Pipeline]
    |       |
    |       +-- ChromeStripper       remove nav/footer/scripts/widgets
    |       +-- MarkdownConverter    HTML → clean .md + frontmatter
    |
    +-- [File Generators]
    |       +-- LlmsTxtGenerator     llms.txt
    |       +-- SitemapGenerator     sitemap.xml
    |       +-- RobotsTxtGenerator   robots.txt
    |
    +-- [Content Generators]
    |       +-- SchemaMarkupGen      JSON-LD schema markup
    |       +-- FaqBlockGen          FAQ blocks
    |       +-- PageContentGen       page content
    |
    +-- [Audit Engine]
            +-- UrlAuditor           audits a URL
            +-- FolderAuditor        audits a local folder
```

---

## Component Boundaries

| Component | Responsibility | Input | Output | Communicates With |
|-----------|---------------|-------|--------|-------------------|
| Entry Point (`src/index.ts`) | Wires everything together; starts transport | — | — | MCP Protocol Layer |
| MCP Protocol Layer | JSON-RPC lifecycle, tool discovery, request routing | JSON-RPC messages via stdio | JSON-RPC responses | Tool Registry |
| Tool Registry (`src/tools/`) | Declares all 8 tools with Zod schemas; maps tool name → handler fn | Validated args object | `CallToolResult` | HTML Acquisition, File Generators, Content Generators, Audit Engine |
| HTML Acquisition Layer (`src/acquisition/`) | Provides raw HTML strings from two sources | File path glob OR URL | `HtmlDocument[]` (url + html string) | HTML Processing Pipeline |
| HTML Processing Pipeline (`src/processing/`) | Cleans HTML; converts to Markdown | `HtmlDocument[]` | `MarkdownDocument[]` (url + markdown + frontmatter) | File Generators, Content Generators, Audit Engine |
| File Generators (`src/generators/files/`) | Produces static SEO artefacts | `MarkdownDocument[]` + site metadata | File content string or written file | Tool Registry (return value) |
| Content Generators (`src/generators/content/`) | Produces schema markup, FAQ, page content | `MarkdownDocument` + config | Generated text/JSON-LD string | Tool Registry (return value) |
| Audit Engine (`src/audit/`) | Checks AI SEO completeness | URL or folder path | Structured report object | HTML Acquisition, HTML Processing Pipeline |

### Strict boundary rule
No generator imports from another generator. All generators import from `src/processing/` and `src/types/`. The Tool Registry is the only layer that orchestrates cross-cutting calls.

---

## Data Flow

### Tool call: generate llms.txt from folder

```
MCP Host
  → tools/call { name: "generate_llms_txt", arguments: { folder: "/path/to/site" } }
  → Tool Registry: looks up "generate_llms_txt" handler
  → HTML Acquisition (LocalFolderSource): glob "**/*.html" in folder → HtmlDocument[]
  → HTML Processing Pipeline: strip chrome → ChromeStripped[]; convert → MarkdownDocument[]
  → LlmsTxtGenerator: build llms.txt string from MarkdownDocument[]
  → Tool Registry: return { content: [{ type: "text", text: "# /path/to/site/llms.txt\n\n..." }] }
  → MCP Protocol Layer: wrap in JSON-RPC response
  → MCP Host via stdout
```

### Tool call: audit URL

```
MCP Host
  → tools/call { name: "audit_seo", arguments: { url: "https://example.com" } }
  → Tool Registry: looks up "audit_seo" handler
  → HTML Acquisition (UrlCrawlSource): fetch URL, follow redirects → HtmlDocument[]
  → HTML Processing Pipeline: strip → convert → MarkdownDocument[]
  → Audit Engine: check for llms.txt, sitemap, schema markup, robots.txt, FAQ, etc.
  → Audit Engine: return structured AuditReport { passed: [], failed: [], score: 0-100 }
  → Tool Registry: format report as text
  → MCP Protocol Layer: return to host
```

---

## MCP Tool Registration Pattern (TypeScript)

The `@modelcontextprotocol/sdk` v1.x exposes `McpServer` with a `registerTool` method that accepts inline Zod schemas. This is the current idiomatic pattern (confirmed from official docs, April 2026):

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "ai-seo-boost",
  version: "1.0.0",
});

// Each tool registered individually — no separate handler map needed
server.registerTool(
  "generate_llms_txt",
  {
    description: "Generate an llms.txt file from a local folder of HTML files",
    inputSchema: {
      folder: z.string().describe("Absolute path to the folder containing HTML files"),
      outputPath: z.string().optional().describe("Where to write the llms.txt (defaults to folder root)"),
    },
  },
  async ({ folder, outputPath }) => {
    // ... call through to LlmsTxtGenerator
    return {
      content: [{ type: "text", text: result }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI SEO Boost MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

### Critical: stdio logging rule
`console.log()` writes to stdout and **corrupts the JSON-RPC stream**. Always use `console.error()` for all debug/info output. This applies everywhere in the codebase — not just in `index.ts`.

---

## Stdio vs HTTP Transport — Impact on Structure

| Concern | Stdio (this project) | HTTP/Streamable |
|---------|---------------------|-----------------|
| Who launches the server | MCP host spawns it as a child process | Server runs independently |
| Connection model | 1 client per process | Many clients per process |
| Auth | None needed (host owns process) | Bearer tokens / OAuth required |
| State | Can hold per-session state safely | Must be stateless or session-keyed |
| Logging | Must use stderr only | stdout logging fine |
| Distribution | `node dist/index.js` in claude_desktop_config | Deploy as HTTP service |
| Restart | Host restarts it automatically | External process manager |

**For this project:** stdio is the right choice. The server runs locally from a GitHub clone. HTTP transport adds complexity (auth, process management, network) with no benefit for a developer tool used in Claude Desktop or Claude Code.

Only switch to HTTP if the tool needs to be shared across multiple machines or accessed remotely.

---

## File Structure

```
ai-seo-boost/
├── src/
│   ├── index.ts                  # Entry point: McpServer + StdioServerTransport
│   ├── types/
│   │   └── index.ts              # Shared types: HtmlDocument, MarkdownDocument, AuditReport
│   ├── acquisition/
│   │   ├── local.ts              # LocalFolderSource: glob + fs.readFile
│   │   └── crawl.ts              # UrlCrawlSource: fetch + redirect handling
│   ├── processing/
│   │   ├── strip.ts              # ChromeStripper: remove nav/footer/scripts/widgets
│   │   └── convert.ts            # MarkdownConverter: HTML → .md + frontmatter
│   ├── generators/
│   │   ├── files/
│   │   │   ├── llms-txt.ts       # LlmsTxtGenerator
│   │   │   ├── sitemap.ts        # SitemapGenerator
│   │   │   └── robots-txt.ts     # RobotsTxtGenerator
│   │   └── content/
│   │       ├── schema-markup.ts  # JSON-LD SchemaMarkupGenerator
│   │       ├── faq.ts            # FaqBlockGenerator
│   │       └── page-content.ts   # PageContentGenerator
│   ├── audit/
│   │   └── index.ts              # AuditEngine: UrlAuditor + FolderAuditor
│   └── tools/
│       ├── index.ts              # Registers all 8 tools on the McpServer instance
│       ├── generate-llms-txt.ts  # Tool handler
│       ├── generate-sitemap.ts
│       ├── generate-robots.ts
│       ├── generate-schema.ts
│       ├── generate-faq.ts
│       ├── generate-content.ts
│       └── audit-seo.ts
├── dist/                         # Compiled output (tsc target)
├── tsconfig.json
├── package.json                  # "type": "module", build script
└── README.md
```

### Why separate `src/tools/` from `src/generators/`
Tool handlers own MCP protocol concerns (argument validation, response shaping, error formatting). Generators own domain logic (what goes in llms.txt, what schema markup looks like). This split means generators are testable without an MCP context, and tool handlers stay thin.

---

## Patterns to Follow

### Pattern 1: Thin Tool Handlers
**What:** Tool handler does: validate → delegate to domain function → format response. No domain logic in handlers.
**When:** Always.
```typescript
// src/tools/generate-llms-txt.ts
export async function handleGenerateLlmsTxt(args: { folder: string; outputPath?: string }) {
  const docs = await acquireFromFolder(args.folder);
  const stripped = docs.map(stripChrome);
  const markdown = stripped.map(toMarkdown);
  const content = buildLlmsTxt(markdown);
  if (args.outputPath) await fs.writeFile(args.outputPath, content, "utf8");
  return { content: [{ type: "text" as const, text: content }] };
}
```

### Pattern 2: Source Abstraction
**What:** Both acquisition sources return the same `HtmlDocument[]` type. Processing pipeline doesn't know whether HTML came from disk or HTTP.
**When:** Whenever a tool accepts either `folder` or `url` as input.
```typescript
// src/types/index.ts
export interface HtmlDocument {
  url: string;   // file:// for local, https:// for crawled
  html: string;
  title?: string;
}
```

### Pattern 3: Always Return Text Content
**What:** MCP tool responses use `{ content: [{ type: "text", text: "..." }] }`. For file-writing tools, return the generated content as text AND write to disk — the AI can inspect what was written.
**When:** All 8 tools.

### Pattern 4: Error as Content, Not Throw
**What:** Catch errors in tool handlers, return them as `{ content: [{ type: "text", text: "Error: ..." }] }`. Do not let unhandled exceptions propagate — the MCP host handles them poorly.
**When:** All tool handlers.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: console.log in stdio server
**What:** Using `console.log()` anywhere in the codebase.
**Why bad:** Writes to stdout, corrupts the JSON-RPC stream, breaks all tool calls silently.
**Instead:** `console.error()` for all logging. Consider a stderr-only logger wrapper.

### Anti-Pattern 2: Monolithic index.ts
**What:** Putting all tool logic in `src/index.ts`.
**Why bad:** 8 tools × HTML acquisition × parsing × generation = 1000+ line file. Untestable. Hard to phase.
**Instead:** One file per tool handler in `src/tools/`, imported and registered in `index.ts`.

### Anti-Pattern 3: Coupling acquisition to generation
**What:** The llms.txt generator directly calling `fetch()` or `fs.readFile()`.
**Why bad:** Can't test generators with mock data. Can't reuse acquisition across tools.
**Instead:** Acquisition returns `HtmlDocument[]`; generators receive `MarkdownDocument[]`. Clean pipeline.

### Anti-Pattern 4: HTTP transport for a local dev tool
**What:** Building an HTTP/SSE server to expose tools.
**Why bad:** Requires auth, a running process, firewall rules, and doesn't benefit from any of that for a local tool.
**Instead:** stdio transport. Host spawns, host owns, zero infrastructure.

### Anti-Pattern 5: Synchronous file I/O in tool handlers
**What:** Using `fs.readFileSync` in handlers.
**Why bad:** Blocks the event loop while reading potentially many HTML files; MCP host may time out.
**Instead:** `fs.promises.readFile` with `Promise.all` for concurrent reads.

---

## Suggested Build Order

Dependencies flow bottom-up. Build lower layers first; upper layers depend on them.

```
Phase 1: Foundation
  └── src/types/index.ts          (no deps)
  └── src/index.ts skeleton       (McpServer + StdioServerTransport, no tools yet)

Phase 2: HTML Acquisition
  └── src/acquisition/local.ts    (depends on: types, fs, glob)
  └── src/acquisition/crawl.ts    (depends on: types, fetch)

Phase 3: HTML Processing
  └── src/processing/strip.ts     (depends on: types, cheerio/node-html-parser)
  └── src/processing/convert.ts   (depends on: types, turndown or similar)

Phase 4: File Generators
  └── src/generators/files/       (depends on: types, processing)
  Each can be built independently (llms-txt, sitemap, robots-txt)

Phase 5: Content Generators
  └── src/generators/content/     (depends on: types, processing)
  Each can be built independently (schema, faq, page-content)

Phase 6: Audit Engine
  └── src/audit/index.ts          (depends on: acquisition, processing, types)

Phase 7: Tool Wiring
  └── src/tools/*.ts              (depends on: all generators, acquisition, audit)
  └── src/index.ts (complete)     (registers all tools)
```

This order means every phase produces something testable in isolation before the MCP layer exists. You can unit test generators with fixture HTML files before wiring any tool handlers.

---

## Scalability Considerations

This is a developer CLI tool, not a multi-tenant service. Scalability concerns are different:

| Concern | For a single developer | At team/CI scale | Notes |
|---------|----------------------|-----------------|-------|
| Large sites (1000+ pages) | Stream/batch acquisition | Same | Use `Promise.all` with concurrency limit (p-limit) |
| Slow URL crawls | Timeout per request | Same | Set fetch timeout, skip on error |
| Memory (large HTML) | Not a concern | Not a concern | Process one page at a time if needed |
| Concurrent tool calls | Not possible in stdio | Not possible in stdio | stdio is serial per connection |

The stdio transport means only one client, one connection, serial requests. No concurrency to manage at the MCP layer. Within a single tool call, use `Promise.all` for I/O parallelism (reading many files, fetching many URLs) but respect host filesystem limits.

---

## Sources

- Official MCP Architecture: https://modelcontextprotocol.io/docs/concepts/architecture (HIGH confidence)
- Official TypeScript Quickstart: https://modelcontextprotocol.io/quickstart/server (HIGH confidence — includes working server code)
- MCP Transport specification: https://modelcontextprotocol.io/docs/concepts/architecture#transport-layer (HIGH confidence)
- Logging/stdout warning: Official docs explicitly state "Never use console.log() in stdio servers" (HIGH confidence)
