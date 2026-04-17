# AI SEO Boost

## What This Is

A TypeScript/Node.js MCP server that helps any business get ranked in both Google and AI chat results. It implements the three-system AI SEO playbook (llms.txt + Markdown Mirrors + Sitemaps) as callable MCP tools, so Claude Code and other AI assistants can generate, audit, and maintain all AI-visibility assets for any website — whether accessed via local folder or live URL crawl.

## Core Value

Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name — with zero manual file editing.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] MCP server bootstrapped and runnable via `node` from repo clone
- [ ] `generate_llms_txt` — takes business details input, writes structured `llms.txt`
- [ ] `generate_markdown_mirrors` — walks local HTML folder OR crawls live URL, strips chrome, outputs `index.md` per page with frontmatter
- [ ] `generate_sitemap` — creates XML sitemap with priority scoring from folder or URL crawl
- [ ] `configure_robots_txt` — generates/updates `robots.txt` to allow AI crawlers + sitemap pointer
- [ ] `audit_ai_seo` — analyzes a site (URL or folder), returns prioritized fix list across all five AI SEO dimensions
- [ ] `generate_schema_markup` — produces JSON-LD for LocalBusiness, FAQPage, and Service types
- [ ] `generate_faq_content` — generates AI-quotable Q&A blocks from business details
- [ ] `generate_location_service_pages` — generates full city and service page content
- [ ] README with setup instructions and tool documentation

### Out of Scope

- Publishing to npm — GitHub repo + docs is the target distribution
- GUI or web dashboard — Claude Code is the UI
- Google Search Console API integration — out of scope for v1; manual GSC setup is documented
- Authentication/multi-tenant — single-user local tool, not a SaaS

## Context

Based on the AI SEO playbook by Brycen Wood (@brycenwood.ai, April 2026). The playbook documents three systems that took a local vehicle wrap business (Summit Wraps) from ~7 to ~150 visitors/day with zero ad spend:

1. **llms.txt** — machine-readable business overview at the site root
2. **Markdown Mirrors** — clean plain-text versions of every page at `/page/index.md`
3. **Sitemaps + GSC** — XML sitemap with priorities + Google Search Console setup

The key insight: AI models quote from pages that are clear, structured, and easy to summarize. Most business websites are full of navigation, scripts, and popups. This server generates the clean signal layer that AI needs to recommend a business by name.

The MCP will use the `@modelcontextprotocol/sdk` TypeScript SDK. Site access is dual-mode: local folder (for generation from source files) and live URL crawl (for auditing deployed sites or sites without accessible source).

## Constraints

- **Runtime**: Node.js / TypeScript — best MCP SDK support, easy to run from a cloned repo
- **Distribution**: GitHub repo with README — no npm publish in v1
- **Site access**: Must support both local `index.html` folder traversal AND HTTP URL crawling
- **No hallucinated content**: Generated files must be populated from explicit user-provided business details, not invented
- **AI crawler list**: Must include GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot at minimum

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python | Best MCP SDK support; Python would require separate runtime | — Pending |
| Dual access mode (folder + URL) | Local for generation accuracy; URL for auditing deployed sites | — Pending |
| GitHub repo distribution | Lower barrier than npm publish for v1; faster to ship | — Pending |
| All 8 tools in one server | Single install covers the full playbook; composable per-site | — Pending |

---
*Last updated: 2026-04-17 after initialization*
