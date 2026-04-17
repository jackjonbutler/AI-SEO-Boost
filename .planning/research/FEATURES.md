# Feature Landscape: AI SEO Boost MCP Server

**Domain:** AI-visibility SEO tooling — MCP server for generating and auditing AI-readable web assets
**Researched:** 2026-04-17
**Confidence note:** WebSearch and WebFetch tools were unavailable during this research session. Findings draw on training data (cutoff August 2025) plus the detailed project context in PROJECT.md. Confidence levels reflect this constraint. The llms.txt spec, schema.org types, and MCP design patterns are HIGH confidence. Competitive AI SEO tool comparisons are MEDIUM confidence.

---

## Table Stakes

Features users expect from any SEO or MCP tool of this type. Missing = product feels incomplete or breaks trust.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **llms.txt generation with all spec sections** | The llms.txt spec (llmstxt.org) defines required sections: H1 name, blockquote summary, and optional link sections. Users expect spec-compliant output — non-compliant files get ignored by crawlers. | Low | Required: `# Business Name`, blockquote description, link lists with optional `> description` per link. File must be at `/llms.txt` root. |
| **Robots.txt AI crawler allowlist** | GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot — all blocked by many default robots.txt templates. Users expect the tool to fix this automatically. | Low | Must not blindly overwrite existing rules. Must merge/patch, not replace. |
| **Robots.txt sitemap pointer** | `Sitemap: https://example.com/sitemap.xml` directive is how all crawlers discover the sitemap. Missing = sitemap never found by bots. | Low | Append if missing; do not duplicate if present. |
| **XML sitemap with valid structure** | W3C/sitemaps.org protocol: urlset, url, loc, lastmod, changefreq, priority. All crawlers expect this format verbatim. | Low | Priority values must be 0.0–1.0. lastmod must be ISO 8601. |
| **Sitemap priority scoring logic** | Priority 1.0 for homepage, 0.8 for core service/product pages, 0.6 for supporting pages, 0.4 for blog/news is the de facto convention. Users expect non-flat priority assignment. | Medium | Scoring heuristic must be configurable or at least documented. |
| **Markdown mirrors with valid frontmatter** | `title`, `description`, `url`, `lastModified` — standard frontmatter fields AI models use for context attribution. Missing = mirrors lose traceability. | Low | YAML frontmatter block at top of every `.md` file. |
| **HTML-to-Markdown stripping of chrome** | Nav, footer, scripts, cookie banners, ad slots — all noise that degrades AI comprehension. Users expect clean prose output, not raw HTML dump. | Medium | Must preserve headings, paragraphs, lists, tables. Drop: nav, header, footer, aside, script, style, noscript. |
| **LocalBusiness JSON-LD schema** | Google and AI models use LocalBusiness schema for business name, address, phone, hours, geo. It is the baseline for local business AI visibility. | Low | Required fields: @type, name, address (PostalAddress), telephone. Highly recommended: openingHours, geo, url, sameAs. |
| **FAQPage JSON-LD schema** | FAQPage schema is one of the highest-impact schema types for AI quotability — models directly extract Q&A pairs from it. | Low | Required: @type FAQPage, mainEntity array of Question + acceptedAnswer. |
| **Service JSON-LD schema** | For service businesses, Service schema signals what the business does to both Google and AI. | Low | Required: @type Service, name, provider (LocalBusiness ref), areaServed. |
| **AI SEO audit output that is actionable** | Users will run the audit before doing anything else. Audit must return a prioritized fix list, not a score — "Fix X because Y" not "Score: 62/100". | Medium | Must check: llms.txt presence, robots.txt AI allowlist, sitemap present + valid, schema markup present, markdown mirrors present. |
| **No hallucinated content in generated files** | Business-critical content (name, address, phone, services, hours) must come from user-provided input, not invented. Users will publish these files. | Low | All generators must have required input validation. Never fill unknown fields with plausible-sounding invented text. |
| **Dual access mode (local folder + live URL)** | Developers want to generate from source files before deploy. Non-developers want to audit a live URL. Both modes are table stakes for the target audience. | High | Two separate code paths: fs traversal for local, HTTP crawl for URL. Shared output contract. |
| **Tool descriptions that are MCP-discoverable** | MCP tools need `description` and `inputSchema` fields that are accurate and specific enough for an AI to choose the right tool without being told explicitly. Vague descriptions = tools never called. | Low | Each tool's description must explain when to use it, what input it needs, what it returns. |
| **Input validation with clear error messages** | Missing required fields (businessName, siteUrl) must return an MCP error with a human-readable message. Silent failures or JSON parse errors = user confusion. | Low | Use zod or equivalent for schema validation on tool inputs. |

---

## Differentiators

Features that set AI SEO Boost apart. Not universally expected, but create genuine competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **llms-full.txt companion file** | The llmstxt.org spec defines an optional `/llms-full.txt` with complete page content inline (not just links). Generating both maximizes coverage for models that prefer inline content vs link traversal. | Medium | llms-full.txt includes the full text of each page concatenated under its link heading. Size limit consideration: keep under ~100KB. |
| **Audit returns MCP-tool call suggestions** | Instead of just "you're missing llms.txt", the audit returns: "Run generate_llms_txt with these inputs: {...}". This makes the audit the entry point that drives the rest of the workflow. | Medium | Requires the audit to know the input shapes of the other tools and construct pre-filled suggestions. |
| **Per-page schema injection guidance** | Rather than generating a single schema block, identify which pages need which schema types and generate separate JSON-LD per page with page-specific content. | Medium | Page type detection heuristic: URL path analysis + heading content. Contact page → LocalBusiness. FAQ page → FAQPage. |
| **AI crawler coverage check in audit** | Explicitly test which of GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot are blocked vs allowed in robots.txt, not just "robots.txt exists". | Low | Parse robots.txt User-agent directives, report per-crawler status. |
| **Markdown mirror quality scoring** | After generating mirrors, score each one: word count, heading structure present, no boilerplate detected, estimated reading level. Flags low-quality pages before they harm AI perception. | Medium | Simple heuristics: word count < 150 = warn, no H2/H3 headings = warn, duplicate content ratio > 60% = warn. |
| **Location/service page content scaffolding** | Generating full city + service page content (not just schema) is a level above what generic SEO tools offer. Outputs draft page content structured for AI quotability: clear H1, definition paragraph, service list, local signals, FAQ section. | High | Requires business details input + city/service list. Output is a content template, not final copy — avoids hallucination risk. |
| **FAQ content optimized for AI citation style** | Generic FAQ generators produce conversational Q&A. This tool generates Q&A structured the way AI models cite information: short declarative answers, business name in the answer, specific claims not hedged phrases. | Medium | Output format: Q: "What does [Business] charge for [service]?" A: "[Business] charges $X for [service] in [City]." — specificity over vagueness. |
| **llms.txt link prioritization** | Order links in llms.txt by AI-relevance: services first, FAQ next, about/contact last. Most generators dump links alphabetically. Ordering matters because some models truncate. | Low | Simple sort: detect page type by URL path pattern or title, apply priority rank. |
| **Incremental update mode** | Re-running a tool on an existing site updates only changed files rather than regenerating everything. Prevents wiping manual edits. | High | Requires hash comparison or lastmod tracking. Complex to implement correctly — likely Phase 2. |
| **robots.txt patch mode (non-destructive)** | Parse existing robots.txt, add only missing AI crawlers and sitemap directive, preserve all existing rules exactly. Most competitive tools either skip robots.txt or overwrite it. | Medium | Full robots.txt parser required (not just string append). Must handle: wildcards, Allow/Disallow, Crawl-delay, multiple User-agent blocks. |

---

## Anti-Features

Features to explicitly NOT build in v1 (and probably ever for this tool's positioning).

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Keyword research / search volume data** | Requires third-party API integration (Ahrefs, SEMrush, etc.), costs money, and is not the playbook's model. AI SEO Boost is about content structure, not keyword targeting. | Document in README: "For keyword research, use [tool]". This MCP focuses on the structure layer. |
| **Backlink analysis** | Same problem — external data dependency, not the AI visibility problem. Scope creep from core value prop. | Out of scope permanently. |
| **Automatic publishing / deploying files** | Writing to `/public` on a live server requires credentials, error handling, and could catastrophically overwrite production files. Too dangerous as a default behavior. | Generate files to a local output directory. User deploys manually or via their existing pipeline. |
| **Content SEO scoring (Clearscope / Surfer style)** | NLP-heavy, requires reference corpus, and is a completely different product category. Would balloon scope with no connection to AI visibility. | Out of scope permanently. |
| **Google Search Console API** | GSC OAuth flow + API complexity for v1 is disproportionate to value. GSC setup is a one-time manual step users can follow a checklist for. | Document manual GSC setup steps in README. Flag as v2 if validated. |
| **Multi-site / agency dashboard** | This is Claude Code as the UI — not a web app. Building a multi-tenant management layer inverts the architecture. | Single-site per invocation. Agencies run the MCP per client site. |
| **Natural language SEO recommendations** | "Consider improving your meta descriptions" style advice is noise. AI tools already provide this kind of coaching. This MCP should generate files, not give generic writing advice. | Audit output must be specific to the 5 AI SEO dimensions only. Link to Brycen's playbook for strategy context. |
| **HTML meta tag injection** | Requires parsing and rewriting HTML files — high risk of corrupting existing markup. Also, meta tags are less important for AI visibility than the file-based signals this tool targets. | Out of scope. Document meta tag best practices in README instead. |
| **Automatic re-crawling / scheduling** | Scheduling requires a daemon process, which conflicts with the MCP model (invoked on demand by the AI). | MCP tools are invoked explicitly. Users schedule re-runs via their own cron/CI if needed. |

---

## Feature Dependencies

```
audit_ai_seo
  → Informs which of the following are needed (entry point)

generate_llms_txt
  → No dependencies (standalone, uses business details input)

generate_markdown_mirrors
  → Requires: site access (local folder OR URL)
  → Should run before: generate_sitemap (mirrors add URLs to sitemap)

generate_sitemap
  → Benefits from: generate_markdown_mirrors (knows all .md page URLs)
  → Required before: configure_robots_txt (robots.txt points to sitemap)

configure_robots_txt
  → Requires: sitemap URL (from generate_sitemap or user-provided)
  → Depends on: knowledge of deployed site URL

generate_schema_markup
  → Requires: business details input (name, address, phone, services)
  → Standalone — does not depend on other tools

generate_faq_content
  → Requires: business details input (services, common customer questions)
  → Output feeds into: generate_schema_markup (FAQPage schema uses FAQ content)
  → Output feeds into: generate_location_service_pages (FAQ section per page)

generate_location_service_pages
  → Requires: business details + city list + service list
  → Benefits from: generate_faq_content output (reuses FAQ blocks)
  → Output feeds into: generate_markdown_mirrors (pages are input to mirror generation)
  → Output feeds into: generate_sitemap (new pages need sitemap entries)
```

Recommended invocation order for a greenfield site:
1. `audit_ai_seo` — understand current state
2. `generate_llms_txt` — fastest win, zero dependencies
3. `generate_faq_content` — feeds downstream tools
4. `generate_schema_markup` — uses FAQ output
5. `generate_location_service_pages` — generates new pages
6. `generate_markdown_mirrors` — mirrors all pages including newly generated ones
7. `generate_sitemap` — captures all URLs including mirrors
8. `configure_robots_txt` — final step, points to completed sitemap

---

## MVP Recommendation

Prioritize for v1 (in order):

1. **`audit_ai_seo`** — First thing any user will run. De-risks everything else. Defines the "before" state.
2. **`generate_llms_txt`** — Highest impact / lowest complexity. The signature feature of the playbook.
3. **`configure_robots_txt`** (patch mode) — Many sites block AI crawlers by default. Fastest ROI fix.
4. **`generate_sitemap`** — Required for full AI crawlability. Moderate complexity.
5. **`generate_markdown_mirrors`** — Highest complexity (HTML parsing, dual access mode) but core to the playbook.
6. **`generate_schema_markup`** — LocalBusiness + FAQPage are highest-impact schema types.
7. **`generate_faq_content`** — Feeds schema markup and location pages.
8. **`generate_location_service_pages`** — Most complex content generation; most value for local businesses.

All 8 tools are in scope for v1 per PROJECT.md. The ordering above is for implementation sequencing within v1, not for deferral.

**Defer to v2:**
- `llms-full.txt` companion file — valuable but not in the original 8-tool spec
- Incremental update mode — complexity high, manual re-run is acceptable for v1
- Audit-to-tool-call suggestions — powerful but requires tool input schema knowledge baked into audit logic

---

## Sources

**Confidence assessment:**

| Area | Confidence | Basis |
|------|------------|-------|
| llms.txt spec requirements | HIGH | llmstxt.org spec is well-documented in training data; H1 + blockquote + link sections are the defined structure |
| robots.txt AI crawler list | HIGH | GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot, Google-Extended, CCBot are all documented in training data with their respective User-agent strings |
| schema.org required fields | HIGH | schema.org/LocalBusiness, schema.org/FAQPage, schema.org/Service are stable, well-documented specs |
| XML sitemap spec | HIGH | sitemaps.org protocol is stable and well-documented |
| MCP tool design patterns | MEDIUM | Based on @modelcontextprotocol/sdk patterns; Claude's own tool definitions provide the canonical example |
| Competitive AI SEO tool feature comparison | LOW | Could not verify current feature sets of tools like Alli AI, Conductor, BrightEdge, or AI-specific tools — WebSearch unavailable |
| llms-full.txt spec detail | MEDIUM | Defined in llmstxt.org spec in training data but could not verify current spec version |

**Key external references to verify when tools are available:**
- https://llmstxt.org — canonical spec for llms.txt and llms-full.txt
- https://schema.org/LocalBusiness — required and recommended properties
- https://schema.org/FAQPage — Question/acceptedAnswer structure
- https://www.sitemaps.org/protocol.html — XML sitemap protocol
- https://openai.com/gptbot — GPTBot User-agent string and crawl policy
- https://www.anthropic.com/claude-crawl-policy — ClaudeBot documentation
