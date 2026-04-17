# Technology Stack

**Project:** AI SEO Boost — TypeScript MCP Server
**Researched:** 2026-04-17
**Confidence:** MEDIUM overall — MCP SDK patterns verified via official docs; supporting library versions from training data (flag for npm verify before first install)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | `^1.x` (latest) | MCP server runtime | Official Tier 1 TypeScript SDK. Provides `McpServer`, `StdioServerTransport`, and tool registration API. No alternative has equivalent protocol compliance. |
| `zod` | `^3.x` | Input schema validation for tools | Required by the MCP SDK's `registerTool` API for describing and validating tool input schemas. Official docs install it alongside the SDK: `npm install @modelcontextprotocol/sdk zod@3`. |
| `typescript` | `^5.x` | Language | First-class MCP SDK support; strict mode enforced by official tsconfig template. |
| `Node.js` | `>=18` | Runtime | Native `fetch` API available without polyfill (Node 18+). MCP docs use native fetch in all TypeScript examples — no axios/got needed. |

**Confidence:** HIGH — Verified via official MCP quickstart at modelcontextprotocol.io and the TypeScript SDK page.

**Critical note on STDIO transport:** The MCP server uses STDIO for Claude Desktop integration. `console.log()` writes to stdout, which corrupts the JSON-RPC stream. Use `console.error()` for all logging. This is documented explicitly in the official MCP quickstart.

---

### HTML Parsing and Chrome-Stripping

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `cheerio` | `^1.0.0` | HTML parsing and DOM manipulation | jQuery-style API for selecting and removing nav/header/footer/script elements from HTML. Runs in Node without a browser — fast, no Chromium binary needed. Battle-tested for server-side HTML manipulation. |

**Why not jsdom:** jsdom emulates a full browser DOM, pulling in a large dependency tree and running JavaScript. For chrome-stripping, we only need to select and remove nodes — jsdom's JS execution is overhead that adds risk (malicious scripts in crawled HTML).

**Why not Playwright/Puppeteer:** These require a full Chromium binary (~150MB+). Overkill for static HTML parsing. The MCP server is a local CLI tool installed via git clone — a 150MB binary install barrier is unacceptable. Reserve Playwright only if a site requires JS rendering to expose content (a Phase 2 enhancement, not MVP).

**Confidence:** HIGH — Cheerio is the established standard for server-side HTML parsing in Node.js. No recent information suggests this has changed.

---

### HTML to Markdown Conversion

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `turndown` | `^7.x` | Convert cleaned HTML to Markdown | Produces clean, readable Markdown from HTML. Highly configurable — can set heading styles, bullet styles, code block style (fenced vs indented). Used in production by many tools including notable AI context extractors. |
| `@types/turndown` | `^5.x` | TypeScript types for turndown | Turndown ships without bundled types; the `@types` package provides them. |

**Why not unified/rehype pipeline:** The unified ecosystem (rehype → remark → stringify) is powerful but has significant complexity overhead: 5–8 packages for a simple HTML→Markdown pipeline, ESM-only in recent versions which creates friction with `"module": "Node16"` tsconfig, and non-trivial configuration for chrome-stripped content. Turndown does the job in one package with straightforward configuration.

**Why not node-html-markdown:** Actively maintained alternative, slightly faster in benchmarks, but turndown has larger community, more plugins, and more examples for exactly this use case (content extraction for AI contexts).

**Confidence:** MEDIUM — Turndown's suitability is well-established. The unified/ESM complexity concern is based on training data and should be verified if the unified path is reconsidered.

---

### HTTP Crawling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native `fetch` | Built-in (Node 18+) | Fetch live URLs for audit mode | No dependency needed. Node 18 ships a stable `fetch` API. Sufficient for fetching individual pages with proper User-Agent headers (required for GPTBot, ClaudeBot identification). |

**For sitemap-following / recursive crawls:** Add `p-limit` (`^5.x`) for concurrency control when crawling multiple pages. It keeps simultaneous requests to a configured limit (e.g., 3 concurrent) to avoid hammering target sites.

**Why not got or axios:** For this use case (fetching HTML pages one or a few at a time), native fetch + p-limit is sufficient and eliminates a dependency. Got and axios add value for complex retry logic, interceptors, and streaming — none of which this server needs.

**Confidence:** HIGH — Native fetch is stable in Node 18+. This is the pattern used in the official MCP TypeScript quickstart.

---

### XML Generation (Sitemaps)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `xmlbuilder2` | `^3.x` | Generate XML sitemap output | Clean, fluent API for building well-formed XML. Produces standards-compliant output including proper XML declaration and namespace attributes required by sitemap protocol (`xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`). TypeScript-native (ships types). |

**Why not fast-xml-parser:** fast-xml-parser is optimized for *parsing* XML (reading it), not generating it. The fluent builder API of xmlbuilder2 is a much better fit for constructing sitemap XML from an array of URL objects.

**Why not string templates:** Raw string concatenation for XML is error-prone (escaping, encoding issues). xmlbuilder2 handles entity escaping automatically.

**Confidence:** MEDIUM — xmlbuilder2 is well-regarded. Verify the `^3.x` version before install; the API is stable but check for any breaking changes since training cutoff.

---

### TypeScript Build Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `typescript` | `^5.x` | Compiler | —  |
| `@types/node` | `^20.x` | Node.js type definitions | Provides types for `fs`, `path`, `readline`, etc. |
| `tsx` | `^4.x` | TypeScript execution without pre-build | Enables `npx tsx src/index.ts` for development without a separate compile step. Fast startup via esbuild. |

**tsconfig baseline (from official MCP docs):**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**`"type": "module"` in package.json** — Required by the official MCP server template. All imports must use `.js` extensions even for `.ts` files (Node ESM requirement).

**Confidence:** HIGH — Verified via official MCP quickstart docs.

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-limit` | `^5.x` | Concurrency control | When crawling multi-page sites — limits simultaneous `fetch` calls |
| `glob` | `^10.x` | File pattern matching | Walking local HTML folder structure for `generate_markdown_mirrors` and `generate_sitemap` in folder-traversal mode |
| `@types/turndown` | `^5.x` | TypeScript types for turndown | Always (turndown doesn't ship its own types) |

**Confidence:** MEDIUM — glob v10 and p-limit v5 are ESM-only; they work with `"type": "module"` but verify before install.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTML parsing | `cheerio` | `jsdom` | jsdom executes JS, large dep tree, no benefit for chrome-stripping |
| HTML parsing | `cheerio` | `playwright` | Requires 150MB+ Chromium binary; overkill for static HTML |
| HTML → Markdown | `turndown` | `unified/rehype` | ESM-only friction with Node16 module resolution; 5–8 packages for one operation |
| HTML → Markdown | `turndown` | `node-html-markdown` | Smaller community; turndown has more production examples for AI content extraction use case |
| HTTP | native `fetch` | `got` | Got adds dependency for retry/stream features not needed here |
| HTTP | native `fetch` | `axios` | Same rationale as got; axios also has CommonJS/ESM dual-mode complexity |
| XML | `xmlbuilder2` | `fast-xml-parser` | fast-xml-parser is a parser, not a builder; wrong tool |
| XML | `xmlbuilder2` | string templates | Error-prone escaping; no advantage |
| Validation | `zod` | `joi` | zod is TypeScript-first (infers types from schema); required by MCP SDK tool registration API |

---

## Full Dependency List

```bash
# Production dependencies
npm install @modelcontextprotocol/sdk zod cheerio turndown xmlbuilder2 p-limit glob

# Dev dependencies
npm install -D typescript @types/node @types/turndown tsx
```

**Version pins to verify before install** (resolve exact latest via `npm show <pkg> version`):
- `@modelcontextprotocol/sdk` — fast-moving; pin to current exact version in package.json
- `zod` — use `zod@3` (SDK was tested against Zod 3; Zod 4 may have breaking changes)
- `p-limit` and `glob` — ESM-only; confirm compatibility with Node16 module resolution

---

## package.json Structure

```json
{
  "name": "ai-seo-boost",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "ai-seo-boost": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node build/index.js"
  },
  "files": ["build"]
}
```

---

## Sources

- Official MCP TypeScript quickstart: https://modelcontextprotocol.io/quickstart/server (TypeScript tab) — HIGH confidence
- MCP SDK tier listing: https://modelcontextprotocol.io/docs/sdk — HIGH confidence
- MCP spec version: 2025-11-25 (from llms.txt)
- cheerio, turndown, xmlbuilder2, p-limit, glob: training data — MEDIUM confidence; verify with `npm show <pkg> version` before first install
