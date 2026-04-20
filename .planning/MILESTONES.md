# Milestones

## v1.0 MVP (Shipped: 2026-04-20)

**Phases completed:** 6 phases, 12 plans  
**Timeline:** 2026-04-17 → 2026-04-20 (3 days)  
**Lines of code:** 1,914 TypeScript | **Files changed:** 71

**Delivered:** TypeScript MCP server with 7 fully-implemented AI SEO tools — any website pointed at this server gets everything needed to be recommended by ChatGPT, Claude, and Perplexity with zero manual file editing.

**Key accomplishments:**
- TypeScript MCP server scaffolded with all 8 tools registered on stdio transport, verified in Claude Code
- Dual-acquisition pipeline — local folder traversal + live URL BFS crawl returning MarkdownDocuments
- `audit_ai_seo` scoring across 5 AI SEO dimensions with prioritised fix suggestions
- `generate_llms_txt` (llmstxt.org spec), `configure_robots_txt` (5 AI bots: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot)
- XML sitemap with priority scoring, markdown mirrors with YAML frontmatter, JSON-LD schema markup (LocalBusiness, FAQPage, Service)
- Deterministic FAQ generator — 14-template pool, output pipes directly into `generate_schema_markup` FAQPage
- 416-line README covering install, macOS/Windows/MSIX/Claude Code config, 8-tool reference with runnable examples, troubleshooting

**Archive:** `.planning/milestones/v1.0-ROADMAP.md` | `.planning/milestones/v1.0-REQUIREMENTS.md`

---

