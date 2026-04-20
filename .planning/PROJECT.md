# AI SEO Boost

## What This Is

A TypeScript/Node.js MCP server with 7 fully-implemented AI SEO tools. Point Claude Code or Claude Desktop at it and it generates, audits, and maintains all AI-visibility assets for any website — whether accessed via local folder or live URL crawl. `generate_location_service_pages` is a v2 stub.

## Core Value

Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.

## Requirements

### Validated (v1.0)

- ✓ MCP server bootstrapped and runnable via `node dist/index.js` from repo clone — v1.0
- ✓ `generate_llms_txt` — takes business details input, writes structured `llms.txt` per llmstxt.org spec — v1.0
- ✓ `generate_markdown_mirrors` — walks local HTML folder OR crawls live URL, strips chrome, outputs `index.md` per page with frontmatter — v1.0
- ✓ `generate_sitemap` — creates XML sitemap with priority scoring from folder or URL crawl — v1.0
- ✓ `configure_robots_txt` — generates/updates `robots.txt` to allow 5 AI crawlers + sitemap pointer — v1.0
- ✓ `audit_ai_seo` — analyzes a site (URL or folder), returns prioritised fix list across all five AI SEO dimensions — v1.0
- ✓ `generate_schema_markup` — produces JSON-LD for LocalBusiness, FAQPage, and Service types — v1.0
- ✓ `generate_faq_content` — generates AI-quotable Q&A blocks from business details, pipes directly into generate_schema_markup — v1.0
- ✓ README with setup instructions and tool documentation — v1.0

### Active

- [ ] `generate_location_service_pages` — full implementation (currently v2 stub)
- [ ] Interactive guided remediation — after audit, present checklist of issues, fix them one-by-one asking for inputs per tool
- [ ] iconv-lite charset detection — UTF-8-only is a documented v1 limitation
- [ ] JS-rendered site support — headless browser crawl for React/Vue SPAs without SSR

### Out of Scope

- Publishing to npm — GitHub repo + docs is the target distribution
- GUI or web dashboard — Claude Code is the UI
- Google Search Console API integration — manual GSC setup is documented
- Authentication/multi-tenant — single-user local tool, not a SaaS

## Context

**v1.0 shipped 2026-04-20** — 6 phases, 12 plans, 1,914 lines TypeScript, 71 files.

Based on the AI SEO playbook by Brycen Wood (@brycenwood.ai, April 2026). The three-system playbook (llms.txt + Markdown Mirrors + Sitemaps) took a local vehicle wrap business from ~7 to ~150 visitors/day with zero ad spend. This server implements the full playbook as callable MCP tools.

**Tech stack:** TypeScript, Node.js 18+, `@modelcontextprotocol/sdk` 1.29.0, zod@3, cheerio, turndown, p-limit@6. ESM modules (Node16). No external API dependencies, no env vars required.

**Known limitations (documented in README):**
- JS-rendered sites (React/Vue SPAs) return empty content — use local folder target
- UTF-8 only — non-UTF-8 pages may produce garbled content
- Per-run page cap — very large sites are partially crawled
- `generate_location_service_pages` is a v2 stub

## Constraints

- **Runtime**: Node.js / TypeScript — best MCP SDK support, easy to run from a cloned repo
- **Distribution**: GitHub repo with README — no npm publish in v1
- **Site access**: Must support both local `index.html` folder traversal AND HTTP URL crawling
- **No hallucinated content**: Generated files must be populated from explicit user-provided business details, not invented
- **AI crawler list**: Must include GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot at minimum

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python | Best MCP SDK support; Python would require separate runtime | ✓ Good — SDK 1.29.0 worked smoothly |
| Dual access mode (folder + URL) | Local for generation accuracy; URL for auditing deployed sites | ✓ Good — both modes work; BFS batch size = min(concurrency, queue, cap) prevents overfetch |
| GitHub repo distribution | Lower barrier than npm publish for v1; faster to ship | ✓ Good — README covers clone-to-running in < 10 min |
| All 8 tools in one server | Single install covers the full playbook; composable per-site | ✓ Good — 7 real + 1 stub; stub explicitly documented |
| outDir=./dist (not ./build) | Matches `node dist/index.js` start script everywhere | ✓ Good |
| module=Node16 for ESM | Local imports require .js extension in source | ✓ Good — consistent across all modules |
| zod@3 (not zod@4) | Matches official quickstart, both work with SDK peer dep | ✓ Good |
| p-limit@6 (not @7) | v7 requires Node 20; project engines.node >=18 | ✓ Good |
| Generator pattern: pure build<Name>() functions | No I/O in generators — testable, composable | ✓ Good — used consistently across all 7 generators |
| generate_schema_markup as text-return tool | Returns JSON-LD blocks as text; no file path needed | ✓ Good — user pastes into HTML head |
| README single document | No separate INSTALL.md or CONTRIBUTING.md in v1 | ✓ Good — frictionless getting-started path |
| Known Limitations before Tools section | Prevents users hitting JS-SPA and UTF-8 limits unexpectedly | ✓ Good — human reviewer confirmed |

---
*Last updated: 2026-04-20 after v1.0 milestone*
