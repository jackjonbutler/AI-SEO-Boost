# AI SEO Boost

## What This Is

A TypeScript/Node.js MCP server with 7 fully-implemented AI SEO tools and an interactive guided remediation wizard. Point Claude Code or Claude Desktop at it and it generates, audits, and fixes all AI-visibility assets for any website — whether accessed via local folder or live URL crawl. Run `audit_ai_seo` to audit, then choose the wizard to fix each finding in sequence with no repeated questions. `generate_location_service_pages` is a v2 stub.

## Core Value

Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.

## Current Milestone: v1.2 Audit Observability & Framework Awareness (Planning)

**Goal:** Make audit findings auditable and actionable — add diagnostic evidence per finding, framework detection for context-aware fix guidance, semantic schema type inference, and mirror coverage depth reporting.

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

### Validated (v1.1)

- ✓ Interactive guided remediation wizard — post-audit mode in `audit_ai_seo`: report or wizard fork, toggleable issue checklist, sequential tool execution — v1.1
- ✓ Optional business context at wizard start — threads through to all tool invocations — v1.1
- ✓ Per-tool fill-in-the-blanks Q&A — TOOL_FIELD_MAP + AccumulatedContext, never re-asks a field — v1.1

### Active (v1.2)

- [ ] Diagnostic block per audit finding — HTTP status, bytes fetched, UA string, matched/missing values — so findings are auditable, not just reported
- [ ] Framework detection — detect Nuxt (`/_nuxt/`), Next.js (`/_next/`), etc. from asset paths; include framework-specific file placement in fix suggestions
- [ ] Schema type inference from `businessContext.businessType` — stop prescribing LocalBusiness universally; infer the correct type from context
- [ ] Mirror coverage depth — report percentage of routes covered, not just home-page pass/fail; sample routes from sitemap
- [ ] `pagesAudited` field in audit response — list of URLs crawled so caller knows crawl scope
- [ ] `suggestedToolCallArgs` pre-populated from audit's existing context — enable one-click wizard handoff without re-prompting

### Deferred

- [ ] `generate_location_service_pages` — full implementation (currently v2 stub)
- [ ] iconv-lite charset detection — UTF-8-only is a documented v1 limitation
- [ ] JS-rendered site support — headless browser crawl for React/Vue SPAs without SSR

### Out of Scope

- Publishing to npm — GitHub repo + docs is the target distribution
- GUI or web dashboard — Claude Code is the UI
- Google Search Console API integration — manual GSC setup is documented
- Authentication/multi-tenant — single-user local tool, not a SaaS

## Context

**v1.1 shipped 2026-04-20** — 4 phases (7–10), 5 plans, ~4,500 lines added (18 files changed). Wizard lives entirely inside `audit_ai_seo` handler in `src/tools/index.ts`.

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
| Wizard is a post-audit mode inside `audit_ai_seo`, not a separate tool | No new tool registration needed; reuses existing audit invocation | ✓ Good — single entry point for audit+fix |
| businessContext optional only in `audit_ai_seo` | All other 6 tools keep it required — no schema changes | ✓ Good — minimal blast radius |
| Elicitation fork uses `server.server.elicitInput()` in closure | Must use server-side API, not client capability pre-check | ✓ Good — fallback to report mode on unsupported clients |
| Composite key `dimension:status` for multi-select const values | Stable identifier per finding for v1 (one finding per dimension) | ✓ Good — clean deselection semantics |
| TOOL_FIELD_MAP as static module-scope constant | Maps suggestedToolCall → required/optional field lists at compile time | ✓ Good — no runtime lookups |
| AccumulatedContext = Partial<BusinessContext> & WizardToolFields | Unified accumulator merges upfront context and mid-wizard gap-fill | ✓ Good — single source of truth for what is known |
| `as any` cast for dynamically-built gap-fill properties object | SDK PrimitiveSchemaDefinitionSchema union incompatible with Record<string, unknown> | ⚠ Revisit — type safety gap; acceptable for v1 |
| generate_markdown_mirrors re-crawls target in wizard path | Phase 9 envelope doesn't carry docs; re-crawl is simplest approach | ⚠ Revisit — redundant crawl in wizard sessions |

---
*Last updated: 2026-04-20 after v1.1 milestone*
