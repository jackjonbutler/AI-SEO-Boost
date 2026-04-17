# Requirements: AI SEO Boost

**Defined:** 2026-04-17
**Core Value:** Any website, pointed at this server, gets everything it needs to be recommended by ChatGPT, Claude, and Perplexity by name.

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: MCP server connects via stdio transport and is runnable with `node dist/index.js` from a repo clone
- [ ] **FOUND-02**: Shared `BusinessContext` input type defined once and reused across all business-detail tools
- [ ] **FOUND-03**: Local folder acquisition — walk a directory of HTML files and extract page content
- [ ] **FOUND-04**: URL crawl acquisition — fetch pages from a live URL with timeout and hard page cap

### File Generators

- [ ] **GEN-01**: `generate_llms_txt` — produces spec-compliant llms.txt from BusinessContext input (About, Services, Pricing, FAQ, Locations, Contact)
- [ ] **GEN-02**: `configure_robots_txt` — patches existing robots.txt to allow AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot) and adds Sitemap pointer without overwriting existing rules
- [ ] **GEN-03**: `generate_sitemap` — creates XML sitemap with priority scoring (1.0 home, 0.9 service, 0.8 info, 0.7 secondary) from local folder or URL crawl
- [ ] **GEN-04**: `generate_markdown_mirrors` — converts HTML pages to clean index.md files with YAML frontmatter, nav/footer/scripts/chrome stripped via Cheerio before Turndown conversion

### Content & Audit

- [ ] **CONT-01**: `audit_ai_seo` — analyzes a site (URL or local folder) across 5 dimensions (llms.txt, schema markup, robots.txt AI crawler access, FAQ blocks, markdown mirrors) and returns a prioritized fix list with suggested tool calls
- [ ] **CONT-02**: `generate_schema_markup` — outputs valid JSON-LD for LocalBusiness, FAQPage, and Service schema.org types from BusinessContext input
- [ ] **CONT-03**: `generate_faq_content` — generates 8–10 AI-quotable Q&A pairs from BusinessContext; answers are factual, direct, include specific numbers, no marketing language

### Distribution

- [ ] **DIST-01**: README with setup instructions, Claude Code config snippet (claude_desktop_config.json), and per-tool documentation with example inputs/outputs

## v2 Requirements

### Content Generators

- **CONT-V2-01**: `generate_location_service_pages` — full HTML/MD content for city and service pages (400–800 words, FAQ schema, internal links, LocalBusiness schema per city)

### Automation

- **AUTO-V2-01**: Pre-commit hook that regenerates markdown mirrors automatically on git commit
- **AUTO-V2-02**: Incremental update mode — only regenerate mirrors/sitemap for changed pages

### Distribution

- **DIST-V2-01**: npm package publish (`npx ai-seo-boost`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| GUI / web dashboard | Claude Code is the UI; adding a GUI duplicates the interface |
| Google Search Console API | Requires OAuth and domain verification; GSC setup is documented in README, not automated |
| Multi-site management | Single-site-at-a-time; SaaS complexity is out of scope for v1 |
| Playwright / JS rendering | Adds 150MB+ binary, unacceptable for git-clone distribution |
| Keyword research | Out of scope for v1; playbook covers this manually via GSC |
| npm publish | v1 distributes as GitHub repo clone only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 2 | Pending |
| FOUND-04 | Phase 2 | Pending |
| GEN-01 | Phase 3 | Pending |
| GEN-02 | Phase 3 | Pending |
| GEN-03 | Phase 4 | Pending |
| GEN-04 | Phase 4 | Pending |
| CONT-01 | Phase 3 | Pending |
| CONT-02 | Phase 4 | Pending |
| CONT-03 | Phase 5 | Pending |
| DIST-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after initial definition*
