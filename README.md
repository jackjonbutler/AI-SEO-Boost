# AI SEO Boost

A TypeScript MCP server that generates llms.txt, markdown mirrors, XML sitemaps, robots.txt patches, JSON-LD schema markup, and FAQ content for any website. Point Claude Code or Claude Desktop at it and you get everything a site needs to be recommended by ChatGPT, Claude, and Perplexity — with zero manual file editing.

Zero external API dependencies. No env vars required.

---

## Requirements

- Node.js 18+ (Node 20 LTS or newer recommended — Node 18 reached EOL in April 2025)
- git
- Claude Desktop OR Claude Code

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/yourname/ai-seo-boost.git
cd ai-seo-boost

# 2. Install dependencies
npm install

# 3. Build the server
npm run build

# 4. Smoke-test (optional)
node dist/index.js
# Expected: process hangs waiting for stdin (server is running). Press Ctrl+C.
```

If `node dist/index.js` exits immediately with an error, the build failed. Re-run `npm run build` and check the TypeScript output.

> **Why it hangs:** The server uses the MCP stdio transport — it reads JSON-RPC messages from stdin. A hanging process is the correct "server is running" state. An immediate exit means the build is broken or `dist/index.js` is missing.

---

## Configuration

### Claude Desktop (macOS)

Config file: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ai-seo-boost": {
      "command": "node",
      "args": ["/Users/yourname/ai-seo-boost/dist/index.js"]
    }
  }
}
```

Replace `/Users/yourname/ai-seo-boost` with your repo's absolute path. Restart Claude Desktop.

### Claude Desktop (Windows)

Two config file locations depending on how Claude Desktop was installed:

- **Standard install:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Microsoft Store (MSIX) install:** `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

> **Tip:** If unsure which install you have, open Claude Desktop → Settings → Developer → Edit Config — it opens the correct file.

```json
{
  "mcpServers": {
    "ai-seo-boost": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\ai-seo-boost\\dist\\index.js"]
    }
  }
}
```

> **Windows paths in JSON require double-backslash escaping (`\\`). Single backslashes produce a JSON parse error and Claude Desktop will fail silently.**

Replace `C:\\Users\\YourName\\ai-seo-boost` with your repo's absolute path. Restart Claude Desktop.

### Claude Code

```bash
claude mcp add --transport stdio ai-seo-boost -- node /absolute/path/to/ai-seo-boost/dist/index.js
```

Verify with:

```bash
claude mcp list
```

`ai-seo-boost` should appear in the list.

> **Note:** Do not commit `.mcp.json` to this repo — it hardcodes absolute paths that differ per machine.

---

## Known Limitations

- **JavaScript-rendered sites:** The crawler fetches raw HTML only. React/Vue SPAs without SSR return empty or incomplete content — use a local folder target instead.
- **Character encoding:** UTF-8 only. Non-UTF-8 pages may produce garbled content.
- **Page cap:** The crawler has a per-run page limit. Very large sites are partially crawled — use a local folder for full-site processing.
- **`generate_location_service_pages` is a v2 stub.** It accepts inputs but returns a not-implemented message. Do not use it in production workflows.

---

## Tools

This server exposes 8 tools. Seven are fully implemented; `generate_location_service_pages` is a v2 stub. Six tools accept a shared `businessContext` object — documented once below, then referenced per tool.

### Shared parameter: `businessContext`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessName` | string | YES | The name of the business, exactly as it should appear in generated output |
| `businessType` | string | YES | Type of business (e.g. "vehicle wrap shop", "law firm", "restaurant") |
| `location` | string | no | Primary service area (e.g. "Denver, CO") |
| `services` | string[] | no | List of services offered |
| `website` | string | no | Canonical website URL (e.g. "https://example.com") |
| `phoneNumber` | string | no | Contact phone number |
| `description` | string | no | 1-3 sentence business description |

---

### audit_ai_seo

**What it does:** Crawls a website or local folder and returns a prioritized fix list across 5 AI SEO dimensions (llms.txt, schema markup, robots.txt AI access, FAQ blocks, markdown mirrors).

**Example input:**

```json
{
  "target": "https://example.com",
  "businessContext": {
    "businessName": "Acme Wraps",
    "businessType": "vehicle wrap shop",
    "location": "Denver, CO",
    "services": ["full vehicle wraps", "partial wraps", "commercial fleet wraps"],
    "website": "https://acmewraps.com"
  }
}
```

**Expected output:** JSON report with `score` (0–100), `issues` array, and `suggestions` array. Each issue includes a `severity` (`high`/`medium`/`low`) and a `suggestedTool` pointing to the tool that fixes it.

```json
{
  "score": 42,
  "issues": [
    { "dimension": "llms_txt", "severity": "high", "message": "No llms.txt found", "suggestedTool": "generate_llms_txt" },
    { "dimension": "schema", "severity": "high", "message": "No JSON-LD schema found", "suggestedTool": "generate_schema_markup" }
  ],
  "suggestions": [
    "Run generate_llms_txt to create llms.txt",
    "Run generate_schema_markup to add LocalBusiness schema"
  ]
}
```

---

### generate_llms_txt

**What it does:** Generates a spec-compliant `llms.txt` file from business details per the llmstxt.org specification (H1 name, blockquote summary, H2 section blocks for Services, Locations, and Contact).

**Example input:**

```json
{
  "outputPath": "/Users/yourname/mysite/llms.txt",
  "businessContext": {
    "businessName": "Acme Wraps",
    "businessType": "vehicle wrap shop",
    "location": "Denver, CO",
    "services": ["full vehicle wraps", "partial wraps", "commercial fleet wraps"],
    "website": "https://acmewraps.com",
    "phoneNumber": "303-555-0100",
    "description": "Acme Wraps is Denver's premier vehicle wrap shop, serving both personal and commercial clients since 2010."
  }
}
```

**Expected output:** Confirmation text with bytes written.

```
llms.txt written to /Users/yourname/mysite/llms.txt (512 bytes)
```

The file contains an H1 business name, blockquote summary, and H2 sections for Services, Locations, and Contact (empty sections are omitted).

---

### configure_robots_txt

**What it does:** Patches an existing `robots.txt` (or creates one) to allow AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot — and adds a Sitemap pointer. Preserves all existing rules.

**Example input:**

```json
{
  "robotsPath": "/Users/yourname/mysite/robots.txt",
  "sitemapUrl": "https://example.com/sitemap.xml"
}
```

**Expected output:** Confirmation text listing what was added.

```
/Users/yourname/mysite/robots.txt — Added 5 bot allow-rule(s): GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot; Added Sitemap: https://example.com/sitemap.xml
```

If any rules were already present, they are skipped and reported as "already present — no changes needed."

---

### generate_sitemap

**What it does:** Generates an XML sitemap with priority scoring (1.0 home, 0.9 service, 0.8 info, 0.7 secondary) from a local folder or live URL crawl. Emits absolute URLs with ISO 8601 lastmod dates.

**Example input:**

```json
{
  "target": "https://example.com",
  "baseUrl": "https://example.com",
  "outputPath": "/Users/yourname/mysite/sitemap.xml"
}
```

**Expected output:** Confirmation text.

```
sitemap.xml written to /Users/yourname/mysite/sitemap.xml (12 URLs, 2048 bytes)
```

The sitemap uses the standard `http://www.sitemaps.org/schemas/sitemap/0.9` namespace and includes `<loc>`, `<lastmod>`, and `<priority>` for each URL.

---

### generate_markdown_mirrors

**What it does:** Converts HTML pages to clean `index.md` files with YAML frontmatter. Strips navigation, footers, scripts, and chrome via Cheerio before Turndown conversion. Writes one `index.md` per page.

**Example input:**

```json
{
  "target": "https://example.com",
  "outputDir": "/Users/yourname/mysite/mirrors"
}
```

**Expected output:** Confirmation text.

```
8 markdown mirror(s) written under /Users/yourname/mysite/mirrors
```

The output directory will contain one subdirectory per page (e.g. `mirrors/services/index.md`, `mirrors/about/index.md`) plus `mirrors/index.md` for the home page. Each file has YAML frontmatter with `title`, `url`, and `crawledAt`.

---

### generate_schema_markup

**What it does:** Generates valid JSON-LD schema.org markup for LocalBusiness, FAQPage, and/or Service types from business details. Returns the markup as text for pasting into the HTML `<head>`.

**Example input:**

```json
{
  "businessContext": {
    "businessName": "Acme Wraps",
    "businessType": "vehicle wrap shop",
    "location": "Denver, CO",
    "services": ["full vehicle wraps", "partial wraps", "commercial fleet wraps"],
    "website": "https://acmewraps.com",
    "phoneNumber": "303-555-0100"
  },
  "schemaTypes": ["LocalBusiness", "FAQPage", "Service"],
  "faqs": [
    { "question": "How long does a full vehicle wrap take?", "answer": "Acme Wraps typically completes a full vehicle wrap in 2-3 business days." },
    { "question": "Do you offer fleet wraps?", "answer": "Yes, Acme Wraps provides commercial fleet wrap services for businesses in Denver, CO." }
  ]
}
```

**Expected output:** One or more JSON-LD `<script>` blocks returned as text for pasting into your HTML `<head>`. Output truncated for readability.

```
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Acme Wraps",
  "...": "..."
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "...": "..."
}
</script>
```

---

### generate_faq_content

**What it does:** Generates AI-quotable Q&A pairs from business details (default 10, configurable 3–20). Answers name the business, cite specific facts, and avoid marketing hedging. Output pipes directly into `generate_schema_markup` as the `faqs` parameter.

**Example input:**

```json
{
  "businessContext": {
    "businessName": "Acme Wraps",
    "businessType": "vehicle wrap shop",
    "location": "Denver, CO",
    "services": ["full vehicle wraps", "partial wraps", "commercial fleet wraps"],
    "website": "https://acmewraps.com",
    "phoneNumber": "303-555-0100",
    "description": "Acme Wraps is Denver's premier vehicle wrap shop, serving both personal and commercial clients since 2010."
  },
  "count": 10
}
```

**Expected output:** JSON with a `faqs` array of `{ question, answer }` pairs. Output truncated — actual output contains 8–10 pairs.

```json
{
  "faqs": [
    {
      "question": "What does Acme Wraps do?",
      "answer": "Acme Wraps is a vehicle wrap shop in Denver, CO that offers full vehicle wraps, partial wraps, and commercial fleet wraps."
    },
    {
      "question": "Where is Acme Wraps located?",
      "answer": "Acme Wraps serves the Denver, CO area."
    },
    {
      "question": "How can I contact Acme Wraps?",
      "answer": "You can reach Acme Wraps at 303-555-0100 or visit acmewraps.com."
    }
  ]
}
```

Output is structured so it pipes directly into `generate_schema_markup` as the `faqs` parameter.

---

### generate_location_service_pages

**Status: v2 stub.** This tool is registered but returns a not-implemented message. It will accept and validate inputs but produce no output files.

**What it will do (v2):** Generate full HTML/Markdown content for city and service landing pages (400–800 words each) with FAQ schema, internal links, and LocalBusiness schema per city.

**Input schema (for reference):**

```json
{
  "businessContext": {
    "businessName": "Acme Wraps",
    "businessType": "vehicle wrap shop",
    "location": "Denver, CO"
  },
  "locations": ["Denver, CO", "Boulder, CO", "Aurora, CO"],
  "outputDir": "/Users/yourname/mysite/location-pages"
}
```

**Expected output (current stub response):**

```
[stub] generate_location_service_pages — implementation pending (Phase v2). Inputs were received and validated successfully.
```

---

## Troubleshooting

### Tools don't appear in Claude Desktop

Possible causes in order of likelihood:

1. **`dist/index.js` does not exist.** Run `npm run build` in the repo directory. Confirm the file: `ls dist/index.js`.
2. **Path in config is relative or has a typo.** The `args` value must be an absolute path. On Windows, verify double-backslash escaping (`C:\\Users\\...`).
3. **Wrong config file edited (Windows).** If you installed Claude Desktop from the Microsoft Store, the config lives at `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`, not `%APPDATA%\Claude`.
4. **Claude Desktop was not restarted.** Quit fully (not just close the window) and reopen.

### Tools don't appear in Claude Code

1. Run `claude mcp list` — if `ai-seo-boost` isn't listed, re-run the `claude mcp add` command with an absolute path.
2. Restart any running Claude Code session after adding.

### All tools fail simultaneously after a code change

If every tool returns an error after editing source and rebuilding, the most common cause is **stdout corruption**: a `console.log()` somewhere in the codebase writes to stdout and breaks the JSON-RPC stream. This server uses stderr (`console.error`) exclusively. Grep the codebase for `console.log` and remove or convert any hits.

### JSON parse error loading config

Windows-specific: single backslashes in paths are JSON escape characters and produce invalid JSON. Use `\\` (double backslash) in every path within `args`.

---

## License

MIT
