# Phase 1: Foundation - Research

**Researched:** 2026-04-17
**Domain:** TypeScript MCP Server bootstrap — project scaffold, stdio transport, tool registration, shared types
**Confidence:** HIGH — primary findings verified against official MCP SDK docs, npm registry, and official quickstart source

---

## Summary

Phase 1 builds the skeleton that every later phase depends on: a TypeScript project that compiles cleanly, a running MCP server that accepts stdio connections, all 8 tools registered as stubs, and a shared `BusinessContext` type importable without circular dependencies.

The official MCP TypeScript SDK (`@modelcontextprotocol/sdk`) is at version 1.29.0 as of April 2026. The API has stabilized around `McpServer` + `server.registerTool()` on the v1.x branch. A v2 pre-alpha exists on main but v1.x is the current production-recommended branch. The peer dependency for Zod is `^3.25 || ^4.0`, meaning both Zod 3 and Zod 4 work — the official quickstart installs `zod@3` and that remains the safer starting point.

The single most common Phase 1 mistake is writing to stdout from within the server. Any `console.log()` call corrupts the JSON-RPC stream and silently breaks all tool calls. This is officially documented and must be enforced everywhere in the codebase, not just in `index.ts`. The second most common mistake is a `build/` vs `dist/` directory mismatch: the official quickstart outputs to `build/`, but this project's requirements specify `node dist/index.js`. The tsconfig `outDir` must be set to `./dist` to match the requirements.

**Primary recommendation:** Use `@modelcontextprotocol/sdk@1.29.0` + `zod@3`, output to `dist/`, register all 8 tool stubs in a single `src/tools/index.ts` file that is imported by `src/index.ts`, and put `BusinessContext` in `src/types/index.ts` with no other imports.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `1.29.0` | MCP server runtime | Official Tier 1 TypeScript SDK. Provides `McpServer`, `StdioServerTransport`, `registerTool`. No alternative has protocol compliance. |
| `zod` | `^3.25` (install as `zod@3`) | Input schema validation | Required by `registerTool` API. SDK peer dep is `^3.25 \|\| ^4.0`; `zod@3` is the safe choice since official quickstart uses it. |
| `typescript` | `^5.x` (5.x is current) | Language | SDK ships `.d.ts` types for TS 5.x. Strict mode required by official tsconfig template. |
| `@types/node` | `^20.x` | Node.js type definitions | Provides types for `process.stdin`, `process.stdout`, `fs`, `path`. Must match Node runtime version. |

**Confirmed versions (npm registry, April 2026):**
- `@modelcontextprotocol/sdk`: `1.29.0`
- `zod`: `4.3.6` (latest), but install `zod@3` to get `3.x` stream
- `typescript`: `6.0.3` (latest)

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.x` | Run TypeScript without pre-compiling | Development only — `npx tsx src/index.ts` for fast iteration |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `zod@3` | `zod@4` | Both work with SDK 1.29.0 (peer dep allows either). Zod 4 has improved performance but `zod@3` is what the official quickstart demonstrates and has more community examples. Use `zod@3` for Phase 1 to match docs. |
| `McpServer` | Low-level `Server` class | `McpServer` is the high-level wrapper. The low-level `Server` requires manual protocol handling. Never use low-level for application code. |

**Installation (Phase 1 only — does not include later-phase libraries):**
```bash
npm install @modelcontextprotocol/sdk zod@3
npm install -D typescript @types/node tsx
```

---

## Architecture Patterns

### Recommended Project Structure

```
ai-seo-boost/
├── src/
│   ├── index.ts              # Entry point: McpServer + StdioServerTransport + tool registration
│   ├── types/
│   │   └── index.ts          # BusinessContext + all shared types (no imports from other src/ modules)
│   └── tools/
│       └── index.ts          # Registers all 8 tools on the McpServer instance (stub handlers)
├── dist/                     # Compiled output (tsc target) — matches `node dist/index.js`
├── tsconfig.json
└── package.json
```

Why this structure for Phase 1 specifically:
- `src/types/index.ts` imports nothing from `src/` — zero circular dependency risk
- `src/tools/index.ts` imports from `src/types/` only (no generators exist yet)
- `src/index.ts` imports from `src/tools/index.ts` and wires the transport

### Pattern 1: McpServer + StdioServerTransport Wiring

**What:** The minimal entry point to get a running MCP server on stdio
**When to use:** Always — this is the Phase 1 primary deliverable

```typescript
// src/index.ts
// Source: https://modelcontextprotocol.io/quickstart/server (TypeScript tab)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

const server = new McpServer({
  name: "ai-seo-boost",
  version: "1.0.0",
});

registerAllTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe — stdout would corrupt the JSON-RPC stream
  console.error("AI SEO Boost MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

Note the `.js` extension on local imports — required by Node ESM (`"module": "Node16"`).

### Pattern 2: Tool Registration with Stub Handler

**What:** `server.registerTool()` with a Zod input schema and a handler that returns a text response
**When to use:** All 8 tools in Phase 1 — stubs that return valid MCP responses

```typescript
// src/tools/index.ts
// Source: https://modelcontextprotocol.io/quickstart/server (TypeScript tab) — server.registerTool pattern
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BusinessContext } from "../types/index.js";

export function registerAllTools(server: McpServer): void {
  server.registerTool(
    "audit_ai_seo",
    {
      description: "Audit a website or local folder for AI SEO completeness",
      inputSchema: {
        businessContext: z.object({
          businessName: z.string().describe("The name of the business"),
          businessType: z.string().describe("Type of business (e.g. restaurant, law firm)"),
          location: z.string().optional().describe("City, state or region"),
          services: z.array(z.string()).optional().describe("List of services offered"),
        }).describe("Business details used across all tools"),
        target: z.string().describe("URL or absolute folder path to audit"),
      },
    },
    async ({ businessContext, target }) => {
      // Stub: replace with real implementation in Phase 3
      return {
        content: [{ type: "text" as const, text: `[stub] audit_ai_seo called with target: ${target}` }],
      };
    },
  );

  // ... remaining 7 tools registered the same way
}
```

**Critical:** The `"text" as const` cast is required — without it TypeScript infers `string` instead of the literal union type `"text" | "image" | "resource"` and the return type check fails.

### Pattern 3: BusinessContext Shared Type

**What:** A single TypeScript interface defined in `src/types/index.ts` with no imports from other `src/` modules
**Why:** Prevents circular dependencies — any tool file can import from `types/` without risk

```typescript
// src/types/index.ts
// No imports from other src/ modules — this file is the foundation

export interface BusinessContext {
  businessName: string;
  businessType: string;
  location?: string;
  services?: string[];
  website?: string;
  phoneNumber?: string;
  description?: string;
}

// Other shared types go here as phases add them:
// HtmlDocument, MarkdownDocument, AuditReport, etc.
```

The Zod schema for `BusinessContext` lives in `src/tools/index.ts` (or a shared `src/schemas/index.ts`), not in `src/types/index.ts`. Types are pure TypeScript interfaces; Zod schemas are runtime objects that import Zod. Keeping them separate avoids dragging Zod into every file that needs just the TypeScript type.

### Pattern 4: tsconfig.json + package.json (exact settings)

```json
// tsconfig.json
// Source: Official MCP quickstart — https://modelcontextprotocol.io/quickstart/server
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

Note: `outDir` is `./dist` to match the requirement `node dist/index.js`. The official quickstart uses `./build` — this is the only intentional deviation.

```json
// package.json (Phase 1 relevant fields)
{
  "name": "ai-seo-boost",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "npx tsx src/index.ts",
    "start": "node dist/index.js"
  },
  "files": ["dist"]
}
```

`"type": "module"` is required — without it, Node treats `.js` as CommonJS and the MCP SDK ESM imports fail.

### Anti-Patterns to Avoid

- **console.log() anywhere in the codebase:** Writes to stdout, corrupts JSON-RPC stream, silently breaks all tool calls. Use `console.error()` everywhere. No exceptions.
- **Barrel exports that create cycles:** An `index.ts` that re-exports from multiple `src/` modules can create cycles if those modules also import from each other. `src/types/index.ts` must have zero local imports.
- **Forgetting `.js` extension on local imports:** `import { foo } from "./foo"` fails with `"module": "Node16"`. Must be `"./foo.js"` even though the source file is `foo.ts`.
- **Putting Zod schemas in `src/types/`:** The types file becomes a Zod dependency that spreads to every consumer. Keep interfaces in `types/`, Zod schemas in `tools/` or `schemas/`.
- **Using the low-level `Server` class:** `import { Server } from "@modelcontextprotocol/sdk/server/index.js"` is the low-level class that requires manual protocol handling. Use `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC 2.0 protocol framing | Custom stdio message reader | `StdioServerTransport` from SDK | Content-length framing, message buffering, partial read handling are non-trivial |
| Input schema validation | Manual `typeof` checks | `zod` schemas passed to `registerTool` | SDK auto-validates and returns proper MCP error responses for invalid inputs |
| Tool discovery protocol | Manual `tools/list` handler | `McpServer.registerTool()` | `McpServer` auto-generates the `tools/list` response from registered tools |
| MCP error response format | Custom error objects | Return `{ content: [{ type: "text", text: "Error: ..." }] }` | MCP error vs. tool result are distinct protocol concepts; SDK handles the distinction |

**Key insight:** `McpServer` handles the MCP protocol machinery (initialization handshake, capability negotiation, `tools/list`, routing) so application code only needs to implement the tool handler functions.

---

## Common Pitfalls

### Pitfall 1: stdout Contamination

**What goes wrong:** Any `console.log()` call (or direct `process.stdout.write()`) in the server process corrupts the JSON-RPC framing. The MCP host receives malformed bytes interleaved with valid JSON-RPC messages. Tool calls return parse errors or hang indefinitely. No compile-time warning — it fails silently at runtime.

**Why it happens:** Developers use `console.log()` by reflex for debugging. TypeScript provides no stdout-safety lint rule by default.

**How to avoid:** Enforce a project-wide rule: `console.log()` is banned. Use `console.error()` for all logging. Optionally add an ESLint rule (`no-console` configured to allow `error` only).

**Warning signs:** Tool calls return JSON parse errors, or the MCP host shows the server as connected but tools fail on first call.

### Pitfall 2: Missing .js Extensions on Local Imports

**What goes wrong:** `import { BusinessContext } from "./types/index"` compiles but crashes at runtime with `ERR_MODULE_NOT_FOUND`.

**Why it happens:** With `"module": "Node16"`, TypeScript emits the import verbatim — it does not add `.js`. Node ESM requires explicit extensions. The extension in the source must be `.js` even though the actual source file is `.ts`.

**How to avoid:** Always write `"./types/index.js"` in import statements. Set up IDE to auto-import with extensions, or add a pre-commit check.

**Warning signs:** `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...' imported from '...'` at runtime after a successful `tsc` compile.

### Pitfall 3: outDir Mismatch

**What goes wrong:** tsconfig has `"outDir": "./build"` (the official quickstart default) but the run command is `node dist/index.js`. Server never starts — file not found.

**Why it happens:** Copying the official quickstart tsconfig verbatim without adjusting `outDir`.

**How to avoid:** Set `"outDir": "./dist"` in tsconfig to match the project requirement. Verify with `ls dist/` after first build.

**Warning signs:** `Error: Cannot find module '/path/to/dist/index.js'` on `node dist/index.js`.

### Pitfall 4: Circular Dependency Through Barrel Exports

**What goes wrong:** `src/types/index.ts` re-exports from `src/tools/index.ts` (or vice versa), creating a module cycle. At runtime, one of the modules is `undefined` when first imported.

**Why it happens:** It seems convenient to have one `index.ts` that exports everything. But if `types/index.ts` imports from `tools/`, and `tools/index.ts` imports from `types/`, the cycle is created.

**How to avoid:** `src/types/index.ts` must import NOTHING from other `src/` modules. It is a pure leaf node in the dependency graph. Types flow down from `types/` to everything else; nothing flows back up.

**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'BusinessContext')` at startup.

### Pitfall 5: Wrong McpServer Import Path

**What goes wrong:** `import { McpServer } from "@modelcontextprotocol/sdk"` — this top-level import may not export `McpServer` depending on the SDK version. Named exports differ between entry points.

**Why it happens:** Assuming the SDK exports everything from the root entry.

**How to avoid:** Use the documented deep import paths:
- `McpServer` → `@modelcontextprotocol/sdk/server/mcp.js`
- `StdioServerTransport` → `@modelcontextprotocol/sdk/server/stdio.js`

**Warning signs:** `SyntaxError: The requested module does not provide an export named 'McpServer'`.

---

## Code Examples

Verified patterns from official sources:

### Minimal Complete Server (src/index.ts)

```typescript
// Source: https://modelcontextprotocol.io/quickstart/server (TypeScript tab)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "ai-seo-boost",
  version: "1.0.0",
});

server.registerTool(
  "example_stub",
  {
    description: "Example stub tool",
    inputSchema: {
      message: z.string().describe("A test message"),
    },
  },
  async ({ message }) => {
    return {
      content: [{ type: "text" as const, text: `Echo: ${message}` }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Server running on stdio"); // stderr only — never stdout
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

### registerTool() Full Signature

```typescript
// Source: Official quickstart — server.registerTool() signature observed in practice
server.registerTool(
  toolName: string,
  {
    description: string,
    inputSchema: Record<string, ZodType>,   // plain object of Zod fields (not z.object())
  },
  handler: (args: InferredArgs) => Promise<{ content: Array<{ type: "text", text: string }> }>
)
```

**Important:** `inputSchema` takes a plain object of Zod fields, NOT `z.object({ ... })`. The SDK wraps it internally.

### Claude Desktop Config (for node dist/index.js)

```json
// ~/.config/Claude/claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)
// Windows: %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "ai-seo-boost": {
      "command": "node",
      "args": ["/absolute/path/to/ai-seo-boost/dist/index.js"]
    }
  }
}
```

### Claude Code Config (CLI command)

```bash
# Source: https://code.claude.com/docs/en/mcp
# Add at project scope (creates .mcp.json, committed to git)
claude mcp add --transport stdio --scope project ai-seo-boost -- node /absolute/path/to/dist/index.js

# Add at user scope (available across all projects)
claude mcp add --transport stdio --scope user ai-seo-boost -- node /absolute/path/to/dist/index.js

# Verify connection
claude mcp list
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Low-level `Server` class with manual protocol handling | High-level `McpServer` with `registerTool()` | SDK v1.x (stable throughout 2025) | Removes need to handle `tools/list` and routing manually |
| `server.tool()` method name (seen in older examples) | `server.registerTool()` method name | SDK v1.x (verified in quickstart April 2026) | Use `registerTool` — `tool()` may not exist in current SDK |
| `"outDir": "./build"` (official quickstart default) | This project uses `"outDir": "./dist"` per requirements | N/A (project decision) | Must set `outDir: ./dist` in tsconfig; don't copy quickstart tsconfig verbatim |
| `zod@3` only | `zod@3` or `zod@4` (SDK peer dep `^3.25 \|\| ^4.0`) | SDK 1.29.0 | Either works; quickstart still uses `zod@3` so that remains the safe choice |

**Deprecated/outdated:**
- `SSEServerTransport` for Claude Code: SSE transport is now deprecated per Claude Code docs. Stdio is correct for local tools.
- SDK v2 (pre-alpha on `main` branch): Not for production use. Stay on v1.x until stable v2 release.

---

## Open Questions

1. **`server.tool()` vs `server.registerTool()` — which is canonical?**
   - What we know: Official quickstart uses `server.registerTool()`. WebFetch of README mentioned both names may exist.
   - What's unclear: Whether `server.tool()` exists as an alias in SDK 1.29.0.
   - Recommendation: Use `registerTool()` — it is the documented API in the official quickstart source code.

2. **`"type": "module"` and tsx dev runner**
   - What we know: `tsx` supports ESM projects. `npx tsx src/index.ts` works with `"type": "module"`.
   - What's unclear: Whether `tsx` version matters for Node 18+ ESM support.
   - Recommendation: Install latest `tsx` (`^4.x`), test `npx tsx src/index.ts` in Phase 1 verification.

3. **Whether `dist/` needs to be in `.gitignore`**
   - What we know: Standard practice is to gitignore compiled output.
   - What's unclear: The project is GitHub-distributed; users run `npm run build` themselves. So `dist/` should NOT be committed.
   - Recommendation: Add `dist/` to `.gitignore`, document `npm install && npm run build` as setup steps.

---

## Sources

### Primary (HIGH confidence)
- `@modelcontextprotocol/sdk` npm page — version 1.29.0 confirmed, peer deps `zod: '^3.25 || ^4.0'` confirmed
- https://modelcontextprotocol.io/quickstart/server — TypeScript tab: `registerTool()` signature, exact imports, tsconfig, package.json (uses `build/`, not `dist/`)
- https://github.com/modelcontextprotocol/quickstart-resources/main/weather-server-typescript/ — working source code: `server.registerTool()` method, response shape `{ content: [{ type: "text", text }] }`
- https://code.claude.com/docs/en/mcp — Claude Code MCP config: `claude mcp add --transport stdio --scope project <name> -- <command>`
- https://modelcontextprotocol.io/docs/develop/connect-local-servers — Claude Desktop `claude_desktop_config.json` format

### Secondary (MEDIUM confidence)
- Prior project research in `.planning/research/STACK.md` and `ARCHITECTURE.md` — cross-checked against official sources above, findings consistent

### Tertiary (LOW confidence)
- WebSearch results re: circular dependency prevention patterns — general TypeScript advice, not MCP-specific

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@modelcontextprotocol/sdk` 1.29.0 version and Zod peer dep confirmed via npm registry
- `registerTool()` API: HIGH — verified in official quickstart source code
- tsconfig/package.json: HIGH — from official quickstart, adjusted `outDir: ./dist` per project requirement
- Claude Code config command: HIGH — from official Claude Code docs
- Architecture patterns: HIGH — consistent with prior project research and official docs
- Pitfalls: HIGH (pitfall 1, 2, 3 from official docs or directly testable); MEDIUM (pitfalls 4, 5 from training + cross-reference)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (SDK v1.x is stable; check for SDK version updates before starting Phase 2+)
