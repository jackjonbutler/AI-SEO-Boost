# Phase 3: Core Generators - Research

**Researched:** 2026-04-20
**Domain:** llms.txt spec compliance, robots.txt patching, AI SEO audit engine, MCP tool error handling
**Confidence:** MEDIUM-HIGH (llms.txt spec HIGH; robots.txt syntax HIGH; audit heuristics MEDIUM)

---

## Summary

Phase 3 builds three tools: an audit engine (`audit_ai_seo`), a llms.txt generator (`generate_llms_txt`), and a robots.txt patcher (`configure_robots_txt`). All three tools already have stubs registered in `src/tools/index.ts`; this phase replaces those stubs with real implementations, organized under `src/audit/` and `src/generators/files/`.

The llmstxt.org spec is now verified (HIGH confidence). The format is simple Markdown with only one required element (an H1 title) and a well-defined optional structure: blockquote summary, freeform paragraphs, and H2-delimited file-list sections. The "Optional" H2 section signals to LLMs that its URLs can be skipped in short-context situations. Crucially, the spec says nothing about having specific named sections (About, Services, etc.) — those section names are project-defined. Our `BusinessContext` fields map cleanly to a set of recommended section names.

For robots.txt patching, the correct strategy is text-based (read, detect, append), not parse-and-reserialize. No library does round-trip editing of robots.txt. The `robots-parser` npm package can check whether a given user-agent already appears in the file, but the actual modification is done with Node.js `fs` string manipulation. The Sitemap directive is agent-independent and lives at file level (can appear anywhere, conventionally at the bottom). The five required bots all use exactly `User-agent: <Name>` / `Allow: /` syntax (verified via Google's official spec and authoritative guides).

For the audit engine, each dimension maps to a concrete detection strategy: llms.txt — HTTP HEAD to `<siteRoot>/llms.txt`; robots.txt AI access — text parse per-bot; schema markup — Cheerio `script[type="application/ld+json"]` selector; FAQ blocks — Cheerio text search for question-pattern headings + `FAQPage` JSON-LD; markdown mirrors — HTTP HEAD to `<pageUrl>.md`. MCP tool error handling: return `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }` — never throw, so the LLM can see and self-correct.

**Primary recommendation:** No new npm dependencies are needed. Use `fs/promises` + string operations for robots.txt patching; Cheerio (already installed) for audit HTML scanning; fetch (Node 18 built-in) for remote llms.txt / robots.txt probing.

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.29.0 | MCP server, tool registration, CallToolResult type | Already in project; provides `isError` response pattern |
| `cheerio` | ^1.2.0 | HTML parsing for audit checks (schema, FAQ detection) | Already used in acquisition; same `$('selector')` API |
| `zod` | ^3.25.76 | Input validation for tool params | Already in project; `businessContextSchema` defined in tools/index.ts |
| `fs/promises` | Node built-in | Read/write robots.txt and llms.txt files | No extra dependency |
| `fetch` | Node 18 built-in | HTTP probe for llms.txt / robots.txt existence in URL audits | Already used in crawl.ts |

### No New Dependencies Required

The full Phase 3 implementation requires zero new npm packages. All capabilities are already present: Cheerio for HTML analysis, fetch for HTTP probing, fs for file I/O, and the MCP SDK for response shaping.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fs string manipulation for robots.txt | `robots-parser` npm package | robots-parser cannot write/serialize; only parses+queries. String approach is simpler and sufficient. |
| Custom llms.txt template literal | llms-txt npm package | No TypeScript-first generator exists on npm; the spec is simple enough that a template literal is the correct choice |
| Fetch for remote probing | axios, got | Node 18 fetch is sufficient; no new deps needed |

**Installation:** No new packages. All dependencies already in place.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── types/index.ts          # BusinessContext, MarkdownDocument (existing)
├── acquisition/            # acquireLocal, crawlUrl (existing, Phase 2)
├── processing/             # stripChrome, convertToMarkdown (existing)
├── audit/
│   ├── types.ts            # AuditReport, AuditDimension, AuditFinding types
│   ├── dimensions/
│   │   ├── llms-txt.ts     # check llms.txt present + parseable
│   │   ├── robots-txt.ts   # check per-bot allow/disallow status
│   │   ├── schema.ts       # detect JSON-LD schema markup types
│   │   ├── faq.ts          # detect FAQ blocks (headings + FAQPage schema)
│   │   └── markdown.ts     # detect markdown mirror availability
│   └── index.ts            # runAudit(target, businessContext) -> AuditReport
├── generators/
│   └── files/
│       ├── llms-txt.ts     # buildLlmsTxt(ctx: BusinessContext) -> string
│       └── robots-txt.ts   # patchRobotsTxt(path, sitemapUrl?) -> void
└── tools/index.ts          # registerAllTools — stub bodies replaced here
```

### Pattern 1: Audit Dimension as Isolated Async Function

**What:** Each of the 5 audit dimensions is a separate module that takes a `target` (URL string | local folder path) and returns a typed `AuditFinding`. The orchestrator in `audit/index.ts` runs all 5 in parallel with `Promise.all`.

**When to use:** Whenever a check can fail independently without blocking others.

**Example:**
```typescript
// src/audit/types.ts
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface AuditFinding {
  dimension: 'llms-txt' | 'schema' | 'robots-ai' | 'faq' | 'markdown-mirrors';
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;  // e.g. 'generate_llms_txt'
}

export interface AuditReport {
  target: string;
  generatedAt: string;  // ISO 8601
  findings: AuditFinding[];  // sorted by severity: critical first
}
```

### Pattern 2: MCP Tool Error Handling — Return isError, Never Throw

**What:** All three Phase 3 tool handlers wrap their logic in try/catch and return `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }` on failure. This is different from throwing, which produces a protocol-level error the LLM cannot see.

**When to use:** Any input validation failure, file not found, HTTP error, or unexpected exception.

**Example (verified from official MCP SDK docs):**
```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
async ({ businessContext, outputPath }) => {
  try {
    if (!outputPath) {
      return {
        content: [{ type: 'text' as const, text: 'Error: outputPath is required' }],
        isError: true,
      };
    }
    const content = buildLlmsTxt(businessContext);
    await fs.writeFile(outputPath, content, 'utf-8');
    return {
      content: [{ type: 'text' as const, text: `llms.txt written to ${outputPath}` }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text' as const, text: `Error: ${msg}` }],
      isError: true,
    };
  }
}
```

### Pattern 3: llms.txt Template — Exact Spec Structure

**What:** Build llms.txt as a template literal following llmstxt.org spec exactly. Sections are omitted (not emitted empty) when the corresponding BusinessContext field is absent.

**Spec rules (verified at llmstxt.org, HIGH confidence):**
1. First line: `# <businessName>` (H1, only required element)
2. Optional: `> <description>` (blockquote summary, one line)
3. Optional: freeform Markdown paragraphs (no H1/H2 headings in this zone)
4. Optional: H2-delimited "file list" sections — each contains `- [Title](url): notes` items
5. Special: An H2 named exactly `## Optional` signals skippable secondary content

**Content rule:** Sections generated only from `BusinessContext`. No invented content. Fields `services`, `location`, `phoneNumber`, `website` map to H2 sections. When `website` is absent, no URL links are emitted.

**Example output shape:**
```markdown
# Acme Vehicle Wraps

> Denver's premier vehicle wrap shop — fleet branding, color changes, and custom graphics since 2010.

## Services
- Fleet Wrapping: Full and partial fleet wrap services for commercial vehicles
- Color Change Wraps: Satin, gloss, matte, and chrome finish options
- Custom Graphics: Designed in-house, printed on-site

## Locations
- Denver, CO

## Contact
- Phone: (720) 555-0100
- Website: https://acmewraps.com
```

### Pattern 4: robots.txt Patcher — Text-Based with Duplicate Detection

**What:** Read existing file (or start with empty string), check whether each bot's `User-agent:` line already exists using case-insensitive regex, append missing blocks, append Sitemap line if absent.

**Why text-based:** No npm library supports round-trip robots.txt editing (parse then re-serialize). String manipulation with careful regex avoids any risk of corrupting existing formatting or comments.

**Algorithm:**
```typescript
// src/generators/files/robots-txt.ts
const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'];

function buildBotBlock(botName: string): string {
  return `\nUser-agent: ${botName}\nAllow: /\n`;
}

function botAlreadyPresent(content: string, botName: string): boolean {
  // Case-insensitive per robots.txt spec (field names are case-insensitive)
  return new RegExp(`^\\s*user-agent:\\s*${botName}\\s*$`, 'im').test(content);
}

function sitemapAlreadyPresent(content: string, sitemapUrl: string): boolean {
  return content.toLowerCase().includes(`sitemap: ${sitemapUrl.toLowerCase()}`);
}
```

**Order of writes:** Append bot blocks first, then Sitemap directive. Never remove or reorder existing content.

### Pattern 5: Audit Target Detection — URL vs Local Path

**What:** `audit_ai_seo` accepts a `target` string that may be either an `https://` URL or an absolute filesystem path. Use URL constructor to detect:

```typescript
function isUrl(target: string): boolean {
  try {
    const u = new URL(target);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
```

For URL targets: fetch `<origin>/llms.txt`, `<origin>/robots.txt` directly. For local targets: `path.join(folderPath, 'llms.txt')`, `path.join(folderPath, 'robots.txt')`.

### Anti-Patterns to Avoid

- **Emitting empty H2 sections in llms.txt:** If `services` is absent, do not emit `## Services\n(none)`. Omit the section entirely. Empty sections confuse LLMs and violate spirit of spec.
- **Throwing from tool handlers:** Must return `isError: true` so the LLM can see the error message. Throwing produces a protocol-level error the LLM cannot read or act on.
- **Using `robots-parser` for write operations:** It is a read-only parser. Using it to plan output requires re-implementing serialization, which introduces bugs.
- **Probing remote URLs with long timeouts in audit:** Use `AbortSignal.timeout(5000)` for audit HTTP probes — same pattern as crawl.ts.
- **Detecting FAQ only by schema markup:** Some pages have FAQ sections as heading + paragraph pairs with no JSON-LD. Check both: `script[type="application/ld+json"]` with `@type: FAQPage` AND heading text patterns containing `?`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| robots.txt syntax validation | Custom RFC 9309 parser | Simple text/regex operations | robots.txt is line-oriented; parsing libraries exist but don't serialize. Regex for existence checks is sufficient and battle-tested. |
| JSON-LD detection | Custom schema parser | Cheerio `$('script[type="application/ld+json"]')` then `JSON.parse` | Cheerio already installed; selector is the correct approach (verified via GitHub issue #1295) |
| HTTP probing for audit | axios/got HTTP client | Node 18 `fetch` with `AbortSignal.timeout()` | Already pattern-established in crawl.ts; no new dep needed |
| Markdown mirror detection | HTML scraping | HTTP HEAD request to `<url>.md` checking for 200 status | Simpler and less fragile than trying to detect `.md` links in page HTML |

**Key insight:** The three tools in this phase are primarily text generation and file I/O, not complex algorithmic work. The complexity is in correctness of spec compliance, not in choosing the right library.

---

## Common Pitfalls

### Pitfall 1: llms.txt H2 Section with No Links Emitted

**What goes wrong:** Generator emits `## Services\n` with no bullet items (e.g., `services` is empty array `[]`), producing a malformed file list section.

**Why it happens:** `Array.isArray(services) === true` but `services.length === 0`.

**How to avoid:** Check `services && services.length > 0` before emitting the section.

**Warning signs:** Test with `{}` BusinessContext (all optional fields absent) — output should be just `# name` with nothing else.

### Pitfall 2: robots.txt Patcher Corrupts Existing File

**What goes wrong:** Existing rules are deleted, reordered, or garbled by a naive "overwrite" approach.

**Why it happens:** Read-modify-write with replacement instead of append.

**How to avoid:** The function signature is `patchRobotsTxt(path, sitemapUrl?)`. It ALWAYS appends to existing content, never replaces it. Even if the file doesn't exist, it creates from empty string (not from a template that might have default rules).

**Warning signs:** If existing `Disallow: /private/` rules disappear after patching.

### Pitfall 3: Bot Already-Present Check is Case-Sensitive

**What goes wrong:** `content.includes('User-agent: GPTBot')` misses `user-agent: gptbot` (lowercase), causing duplicate blocks.

**Why it happens:** robots.txt spec says field names are case-insensitive.

**How to avoid:** Use case-insensitive regex: `/^\s*user-agent:\s*GPTBot\s*$/im`.

### Pitfall 4: Audit Treating URL Target as Local Path

**What goes wrong:** Trying `fs.readFile('/robots.txt')` when target is `https://example.com`.

**Why it happens:** Both are strings; need explicit URL detection before branching.

**How to avoid:** Use `isUrl()` helper (URL constructor try/catch) at the top of every audit dimension function.

### Pitfall 5: MCP Tool Returns `isError: true` Without `content` Array

**What goes wrong:** `return { isError: true }` — the MCP SDK requires `content` array even on errors.

**Why it happens:** Misreading the error pattern.

**How to avoid:** Template: `return { content: [{ type: 'text' as const, text: 'Error: ...' }], isError: true }`. Include `as const` on `type` to satisfy TypeScript strict mode.

### Pitfall 6: Audit `suggestedToolCall` Field is Wrong Tool Name

**What goes wrong:** Suggesting `"generateLlmsTxt"` (camelCase) instead of `"generate_llms_txt"` (the registered MCP tool name).

**Why it happens:** Mismatch between TypeScript naming conventions and MCP tool name strings.

**How to avoid:** Tool names are defined in `src/tools/index.ts`. Use those exact strings in AuditFinding.suggestedToolCall.

---

## Code Examples

Verified patterns from official or first-party sources:

### Detecting JSON-LD Schema Markup with Cheerio

```typescript
// Source: cheeriojs/cheerio GitHub issue #1295 — verified approach
import * as cheerio from 'cheerio';

function detectSchemaTypes(html: string): string[] {
  const $ = cheerio.load(html);
  const types: string[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const schemaType = data['@type'];
      if (typeof schemaType === 'string') types.push(schemaType);
      if (Array.isArray(schemaType)) types.push(...schemaType);
    } catch {
      // Malformed JSON-LD — skip
    }
  });

  return types;
}
```

### MCP isError Response Pattern

```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
return {
  content: [{ type: 'text' as const, text: `Error: ${msg}` }],
  isError: true,
};
```

### robots.txt Bot-Already-Present Check

```typescript
// Source: verified against Google robots.txt spec (field names are case-insensitive)
function botAlreadyPresent(content: string, botName: string): boolean {
  return new RegExp(`^\\s*user-agent:\\s*${botName}\\s*$`, 'im').test(content);
}
```

### llms.txt Generator Structure

```typescript
// Source: llmstxt.org spec (H1 required; blockquote, H2 sections optional)
export function buildLlmsTxt(ctx: BusinessContext): string {
  const lines: string[] = [];

  // Required: H1 title
  lines.push(`# ${ctx.businessName}`);
  lines.push('');

  // Optional: blockquote summary
  if (ctx.description) {
    lines.push(`> ${ctx.description}`);
    lines.push('');
  }

  // Optional H2 sections — only emit when data present
  if (ctx.services && ctx.services.length > 0) {
    lines.push('## Services');
    for (const s of ctx.services) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }

  if (ctx.location) {
    lines.push('## Locations');
    lines.push(`- ${ctx.location}`);
    lines.push('');
  }

  const contactLines: string[] = [];
  if (ctx.phoneNumber) contactLines.push(`- Phone: ${ctx.phoneNumber}`);
  if (ctx.website) contactLines.push(`- Website: ${ctx.website}`);
  if (contactLines.length > 0) {
    lines.push('## Contact');
    lines.push(...contactLines);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
```

### robots.txt Patcher Core Logic

```typescript
// Source: derived from Google robots.txt spec + verified syntax rules
const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'];

export async function patchRobotsTxt(
  robotsPath: string,
  sitemapUrl?: string,
): Promise<void> {
  let content = '';
  try {
    content = await fs.readFile(robotsPath, 'utf-8');
  } catch {
    // File doesn't exist — start empty, will be created on write
  }

  const additions: string[] = [];

  for (const bot of AI_BOTS) {
    if (!botAlreadyPresent(content, bot)) {
      additions.push(`\nUser-agent: ${bot}\nAllow: /`);
    }
  }

  if (sitemapUrl && !sitemapAlreadyPresent(content, sitemapUrl)) {
    additions.push(`\nSitemap: ${sitemapUrl}`);
  }

  if (additions.length === 0) return; // Nothing to add

  const newContent = content.trimEnd() + '\n' + additions.join('\n') + '\n';
  await fs.writeFile(robotsPath, newContent, 'utf-8');
}
```

### Audit Dimension: Check robots.txt AI Access (URL target)

```typescript
// No external library needed — text-based check sufficient
async function checkRobotsTxtAiAccess(siteUrl: string): Promise<AuditFinding> {
  const robotsUrl = new URL('/robots.txt', siteUrl).href;
  try {
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { dimension: 'robots-ai', status: 'fail', severity: 'high',
        message: `robots.txt not found (HTTP ${res.status})`,
        suggestedToolCall: 'configure_robots_txt' };
    }
    const text = await res.text();
    const missing = AI_BOTS.filter(bot => !botAlreadyPresent(text, bot));
    if (missing.length === 0) {
      return { dimension: 'robots-ai', status: 'pass', severity: 'low',
        message: 'All AI crawlers are allowed in robots.txt' };
    }
    return { dimension: 'robots-ai', status: 'fail', severity: 'high',
      message: `Missing AI crawler rules for: ${missing.join(', ')}`,
      suggestedToolCall: 'configure_robots_txt' };
  } catch (err) {
    return { dimension: 'robots-ai', status: 'warning', severity: 'medium',
      message: `Could not fetch robots.txt: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Blocking AI crawlers by default | Explicitly allowing them to boost AI citations | 2024-2025 | Our tool adds allow-rules, not block-rules |
| robots.txt as static file | robots.txt as AI-visibility signal for training + search | 2024 | 5 distinct bots now have different semantics (training vs search vs retrieval) |
| llms.txt as hypothetical | llms.txt as de facto entry point for AI coding tools (Cursor, Claude Code) | Late 2025 | Spec compliance now matters for tooling, not just future LLM crawlers |
| FAQPage schema for SERP features | FAQPage schema for AI citation probability | 2024-2025 | Still valuable, different audience |

**Deprecated/outdated:**
- Anthropic's `ClaudeBot` is Anthropic's training crawler. Note: Anthropic also has `Claude-User` (real-time retrieval) and `Claude-SearchBot` (search indexing) — but the requirement specifies ClaudeBot only, which is correct for training permission.
- `CCBot` is Common Crawl — feeds datasets used to train many open-source models. Allowing it is a strategic choice the spec requires.

---

## Open Questions

1. **llms.txt "About" section — spec says nothing about it**
   - What we know: The llmstxt.org spec only requires H1. It lists no canonical section names.
   - What's unclear: The requirements mention "H2 section blocks per the llmstxt.org spec" for About, Services, Pricing, FAQ, Locations, Contact — these are product-defined section names, not spec-defined.
   - Recommendation: Emit sections for whichever `BusinessContext` fields are present. "About" maps to `businessType`/`description`. "Pricing" has no field in current `BusinessContext` — omit it in v1 unless a `pricing` field is added to the type.

2. **FAQ dimension detection — heading heuristics vs schema-only**
   - What we know: FAQ detection via `script[type="application/ld+json"]` with `@type: FAQPage` is reliable for structured pages. Heading-based detection (count headings containing `?`) is heuristic.
   - What's unclear: False positive rate for heading-based detection.
   - Recommendation: Report both signals separately in AuditFinding. Score as `pass` if FAQPage JSON-LD present; `warning` if question-headings found but no schema; `fail` if neither.

3. **`configure_robots_txt` behavior when target is a URL (not local path)**
   - What we know: The tool's input schema takes `robotsPath` (an absolute local path), not a URL.
   - What's unclear: Should the tool also support downloading + patching remote robots.txt?
   - Recommendation: Keep it local-path only per the registered input schema. The audit tool handles remote checking; this generator handles local patching. Clear separation of concerns.

---

## Sources

### Primary (HIGH confidence)

- `https://llmstxt.org/` — full spec including H1 required, blockquote optional, H2 file lists, Optional section semantics
- `https://llmstxt.org/core.html` — reference implementation showing parse structure (title, summary, info, sections)
- `https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec` — official Google robots.txt spec: case-insensitive field names, Sitemap directive syntax, Allow/Disallow precedence
- `https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md` — MCP SDK: `isError: true` pattern, content array required
- `cheeriojs/cheerio` GitHub issue #1295 — confirmed `$('script[type="application/ld+json"]')` selector approach

### Secondary (MEDIUM confidence)

- `https://www.adnanzameer.com/2025/09/how-to-allow-ai-bots-in-your-robotstxt.html` — exact User-agent strings and Allow: / syntax for all 5 bots (cross-verified with Google spec)
- `https://almcorp.com/blog/anthropic-claude-bots-robots-txt-strategy/` — Anthropic three-bot distinction (ClaudeBot / Claude-User / Claude-SearchBot)
- `https://llmstxtgenerator.org/llmstxt-documentation` — additional format examples cross-verifying spec

### Tertiary (LOW confidence)

- `https://github.com/agencyenterprise/aiseo-audit` — audit dimension patterns for AI SEO (not directly reused, informed audit scoring approach)

---

## Metadata

**Confidence breakdown:**
- llms.txt spec structure: HIGH — verified at llmstxt.org and cross-checked with reference implementation
- robots.txt bot syntax: HIGH — verified via Google official spec + multiple current guides (2025)
- MCP isError pattern: HIGH — verified from official typescript-sdk docs
- Audit dimension detection heuristics: MEDIUM — Cheerio selector for JSON-LD is verified; FAQ heading heuristics are design decisions
- robots.txt patcher text strategy: HIGH — no library does round-trip; confirmed by searching multiple npm packages

**Research date:** 2026-04-20
**Valid until:** 2026-06-01 (stable spec; robots.txt syntax is decades stable; llms.txt spec is new but now published)
