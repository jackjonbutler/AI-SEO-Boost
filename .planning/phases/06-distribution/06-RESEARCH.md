# Phase 6: Distribution - Research

**Researched:** 2026-04-20
**Domain:** MCP server README documentation, Claude Desktop/Code configuration, GitHub repo distribution
**Confidence:** HIGH — core config format verified against official MCP docs and Claude Code docs; README patterns drawn from official MCP reference repos

---

## Summary

Phase 6 is a documentation phase, not an implementation phase. The code is complete; the work is producing a README that lets any developer go from `git clone` to working Claude tools in under 10 minutes. There is no new library to install and no new TypeScript to write. The three technical pieces that require precision are: (1) the correct `claude_desktop_config.json` JSON format for a local stdio node server, (2) Windows path escaping gotchas, and (3) per-tool example inputs/outputs that match the actual implemented tool schemas.

The MCP ecosystem uses a well-established configuration format that is consistent across Claude Desktop and Claude Code: an `mcpServers` object with `command`, `args`, and optional `env` keys. For this project, the entry point is `node dist/index.js` using an absolute path. No environment variables are required — this server has zero external API dependencies, which is a meaningful selling point to document prominently.

The README content areas are: Prerequisites, Installation (2 commands), Configuration snippet (per OS), Tool reference (8 tools with example input/output), Known Limitations, and Troubleshooting. The goal is a developer hitting "working" without needing to read source code or troubleshoot silently-failing configuration.

**Primary recommendation:** Write a single README.md that documents all 8 tools with concrete example inputs and expected outputs, provides OS-specific config snippets, and front-loads the limitations so developers aren't surprised at runtime.

---

## Standard Stack

### Core

No new libraries for Phase 6. The existing stack is complete.

| What | Status | Notes |
|------|--------|-------|
| `@modelcontextprotocol/sdk` | Installed `^1.29.0` | No change |
| `zod` | Installed `^3.25` | No change |
| `typescript` | Installed `^5.9.3` | No change |

### Supporting (documentation tooling)

No additional tooling is needed. README is plain Markdown. No static site generator, no doc tool, no changelog generator is warranted for v1.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain README.md | Separate docs site (VitePress, Docusaurus) | Out of scope for v1 GitHub-clone distribution. README is sufficient and has zero build infrastructure. |
| Manual examples | Automated test output capture | Overkill for v1 with 8 tools. Manual examples are faster to write and easier to keep accurate. |

---

## Architecture Patterns

### README Document Structure (recommended order)

```
README.md
├── H1: AI SEO Boost
├── One-liner description + what it solves
├── ## Requirements (Node 18+, git clone)
├── ## Installation (2 commands)
├── ## Configuration
│   ├── Claude Desktop (macOS)
│   ├── Claude Desktop (Windows)
│   └── Claude Code (claude mcp add)
├── ## Tools (8 tools, each with example input + output)
│   ├── audit_ai_seo
│   ├── generate_llms_txt
│   ├── configure_robots_txt
│   ├── generate_sitemap
│   ├── generate_markdown_mirrors
│   ├── generate_schema_markup
│   ├── generate_faq_content
│   └── generate_location_service_pages (v2 stub — documented as such)
├── ## Known Limitations
└── ## Troubleshooting
```

### Pattern 1: Claude Desktop Configuration Snippet

**What:** JSON config that tells Claude Desktop to launch the server as a subprocess via stdio transport.

**Exact format (verified against official MCP docs — modelcontextprotocol.io):**

```json
{
  "mcpServers": {
    "ai-seo-boost": {
      "command": "node",
      "args": ["/absolute/path/to/ai-seo-boost/dist/index.js"]
    }
  }
}
```

Config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Windows variant (path format):**

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

Windows requires double-backslash escaping in JSON. This is the #1 Windows-specific failure point.

### Pattern 2: Claude Code Configuration

**What:** CLI command to register the server in Claude Code.

```bash
claude mcp add --transport stdio ai-seo-boost -- node /absolute/path/to/dist/index.js
```

Claude Code stores the result in `~/.claude.json` under `mcpServers`. Users can also create a `.mcp.json` at the project root for project-scoped configuration, but for global use (recommended for this tool), `claude mcp add` with the user scope is correct.

After adding, verify with:
```bash
claude mcp list
```

### Pattern 3: Per-Tool Documentation Format

**What:** Consistent format for documenting each of the 8 tools.

```
### tool_name

**What it does:** One sentence.

**Example input:**
\`\`\`json
{
  "parameter": "value",
  ...
}
\`\`\`

**Expected output:**
\`\`\`
[output text or JSON]
\`\`\`
```

Note: The `businessContext` parameter is shared across 6 of 8 tools. Document it once at the top of the Tools section with a label like "Shared parameter: businessContext" and back-reference it per tool rather than repeating the full schema 6 times.

### Pattern 4: Known Limitations Block

Document limitations once, prominently, before the tool reference, not buried in individual tool docs:

```markdown
## Known Limitations

- **JavaScript-rendered sites:** The crawler fetches raw HTML only. Sites that require JavaScript execution (React SPAs, Vue apps without SSR) will return empty or incomplete content.
- **Character encoding:** UTF-8 only. Pages with non-UTF-8 encoding may produce garbled content.
- **Page cap:** The crawler has a hard limit on pages fetched per run. Very large sites will be partially crawled; use a local folder target for full-site processing.
- **generate_location_service_pages:** Registered as a v2 stub. It accepts inputs but returns a "not implemented" message.
```

### Anti-Patterns to Avoid

- **Burying the config snippet:** Developers scan to find config. It must be in a `## Configuration` section before tool docs, not after.
- **Relative paths in config snippets:** Always show `"/absolute/path"` and tell the user to replace it. Relative paths silently fail.
- **Omitting the Windows path format:** Cross-platform coverage is required — Windows JSON path escaping is non-obvious.
- **Documenting generate_location_service_pages as fully functional:** It is a v2 stub. README must say so explicitly to avoid confusion.
- **Stdout logging in examples:** Never show `console.log()` in any example command output. The server logs only to stderr.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config file format discovery | Custom config format documentation | Official MCP `claude_desktop_config.json` format | Standard across all MCP hosts; user familiarity. |
| Per-tool testing harness | Test runner for README examples | Run against live server manually | This is a documentation task, not an implementation task. |

**Key insight:** Phase 6 has no custom code to build. The deliverable is text. The risk is inaccuracy (wrong config, wrong example output), not complexity.

---

## Common Pitfalls

### Pitfall 1: Wrong Config File Location (Windows MSIX)

**What goes wrong:** Windows users with the MSIX (Store) version of Claude Desktop use a different config path than the standard `%APPDATA%\Claude\claude_desktop_config.json`. The MSIX path is `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`.

**Why it happens:** Two Claude Desktop installation variants exist on Windows with different paths.

**How to avoid:** README should note both paths or direct users to use Settings > Developer > Edit Config to find the correct file rather than navigating directly.

**Warning signs:** User reports "tools not showing up" after correct config is written — means they edited the wrong file.

### Pitfall 2: Windows JSON Path Escaping

**What goes wrong:** `"args": ["C:\Users\name\dist\index.js"]` is invalid JSON — single backslashes are escape characters.

**Why it happens:** Windows paths use backslashes; JSON escape sequences use backslashes; they collide.

**How to avoid:** Always show `C:\\Users\\name\\dist\\index.js` (double backslash) in Windows config examples. Note explicitly in README that Windows paths require `\\`.

**Warning signs:** JSON parse error when Claude Desktop loads, or "Could not attach to MCP server" without further detail.

### Pitfall 3: Relative Path in Args

**What goes wrong:** `"args": ["./dist/index.js"]` — the relative path resolves from whatever Claude Desktop's working directory is, not from the repo root.

**Why it happens:** Developers test with relative paths locally and it works in some shells but not when launched by Claude Desktop.

**How to avoid:** README must state "Use absolute paths" and the example must show a placeholder like `/Users/yourname/ai-seo-boost/dist/index.js`.

**Warning signs:** Server silently fails to start (no hammer icon appears in Claude Desktop).

### Pitfall 4: Server Not Built Before Configuring

**What goes wrong:** User clones repo, edits config, opens Claude Desktop — tools missing because `dist/` doesn't exist yet.

**Why it happens:** README installation step order is wrong or user skipped build step.

**How to avoid:** Installation section must sequence: (1) clone, (2) `npm install`, (3) `npm run build`, (4) edit config. All four steps in that order, numbered, no skipping.

**Warning signs:** `dist/index.js` does not exist; Claude Desktop cannot launch the server.

### Pitfall 5: Documenting Stub Tool as Implemented

**What goes wrong:** README treats `generate_location_service_pages` as a working tool with example output.

**Why it happens:** Easy to include it with the others and forget it's a stub.

**How to avoid:** Label it explicitly: "v2 stub — returns a not-implemented message" in both the tool list and its individual section.

### Pitfall 6: console.log Stdout Corruption

**What goes wrong:** If any contributor adds a `console.log()` during debugging and doesn't revert it, the JSON-RPC stream is corrupted and all tools silently fail.

**Why it happens:** This is the #1 MCP pitfall documented in the Phase 1 research. Distribution phase should note in a Troubleshooting section: "If all tools fail simultaneously, check that no stdout logging exists — only stderr (`console.error`) is permitted."

**Warning signs:** All tools return errors simultaneously after a code change.

---

## Code Examples

### Example: Installation Sequence

```bash
# 1. Clone the repo
git clone https://github.com/yourname/ai-seo-boost.git
cd ai-seo-boost

# 2. Install dependencies
npm install

# 3. Build the server
npm run build

# 4. Verify build succeeded
node dist/index.js
# Expected: process hangs waiting for stdin (server is running)
# Press Ctrl+C to stop
```

The `node dist/index.js` manual run is a useful smoke-test to include — if it hangs, the build is valid; if it crashes, there's a dependency or TypeScript error.

### Example: businessContext shared parameter documentation

```markdown
### Shared parameter: `businessContext`

All tools that take `businessContext` accept the same object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessName` | string | YES | Business name as it should appear in output |
| `businessType` | string | YES | Type of business (e.g. "vehicle wrap shop") |
| `location` | string | no | Primary service area (e.g. "Denver, CO") |
| `services` | string[] | no | List of services offered |
| `website` | string | no | Canonical website URL |
| `phoneNumber` | string | no | Contact phone number |
| `description` | string | no | 1-3 sentence business description |
```

### Example: Tool documentation for audit_ai_seo

```markdown
### audit_ai_seo

**What it does:** Crawls a website or local folder and returns a prioritized fix list across 5 AI SEO dimensions (llms.txt, schema markup, robots.txt AI access, FAQ blocks, markdown mirrors).

**Example input:**
\`\`\`json
{
  "target": "https://example.com",
  "businessContext": {
    "businessName": "Acme Wraps",
    "businessType": "vehicle wrap shop",
    "location": "Denver, CO"
  }
}
\`\`\`

**Expected output:** JSON report with `score`, `issues` array, and `suggestions` array. Each issue includes a `severity` (high/medium/low) and a `suggestedTool` pointing to the tool that fixes it.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Desktop only (claude_desktop_config.json) | Claude Code + Claude Desktop both supported | ~2024 | Must document both in README; Claude Code is the primary audience for CLI-focused developers |
| Copy/paste CLI commands | `claude mcp add` CLI command | Claude Code 1.x | Cleaner onboarding — one command vs manual JSON editing |
| `build/` output directory | `dist/` output directory | Project-specific | README must reference `dist/` to match tsconfig — do NOT copy from other MCP server READMEs that use `build/` |

**Deprecated/outdated:**
- `@modelcontextprotocol/server-github` npm package: deprecated as of April 2025 per MCP maintainers. Irrelevant to this project but signals that npm-published MCP packages can be abandoned — the GitHub repo clone distribution decision was correct for v1.

---

## Open Questions

1. **Should .mcp.json be committed to the repo?**
   - What we know: `.mcp.json` at repo root enables project-scoped Claude Code config; it's designed to be committed.
   - What's unclear: This server uses absolute paths (dist/index.js location differs per machine), so a committed `.mcp.json` with a hardcoded path would be wrong for all cloners.
   - Recommendation: Do NOT commit `.mcp.json`. Instead, document the `claude mcp add` command with a placeholder path. Users configure for their own machine.

2. **Node.js version to specify precisely (18.x vs 18.0+)**
   - What we know: package.json `engines.node` is `>=18`. The MCP SDK has no documented Node.js minimum beyond "18+".
   - What's unclear: Whether Node 18 LTS (end-of-life April 2025) or Node 20/22 LTS should be the recommended minimum.
   - Recommendation: Keep `>=18` in package.json as the hard floor but recommend Node 20 LTS or newer in the README since Node 18 reached EOL in April 2025. Developers on Node 18 should still work but they're on an unsupported runtime.

3. **Example outputs for generate_faq_content and generate_schema_markup**
   - What we know: These tools produce JSON output. The output structure is deterministic given the same input.
   - What's unclear: Best approach — show full output (verbose) or truncated with `...` (readable)?
   - Recommendation: Show truncated output with a note "Output truncated for readability — actual output contains all 8-10 pairs". Full JSON for simple tools like configure_robots_txt.

---

## Sources

### Primary (HIGH confidence)
- `https://modelcontextprotocol.io/docs/develop/connect-local-servers` — Official MCP docs: claude_desktop_config.json format, path requirements, config file OS locations
- `https://code.claude.com/docs/en/mcp` — Official Claude Code MCP docs: .mcp.json format, claude mcp add CLI, project-scoped vs user-scoped config
- Phase 1 RESEARCH.md (this project) — stdio stdout corruption pitfall, server name `ai-seo-boost`, entry point `node dist/index.js`

### Secondary (MEDIUM confidence)
- `https://scottspence.com/posts/configuring-mcp-tools-in-claude-code` — Verified config pattern for local node-based servers; matches official docs
- `https://www.builder.io/blog/claude-code-mcp-servers` — Claude Code vs Claude Desktop config differences; .mcp.json project-scope format
- `https://mcpcat.io/guides/adding-an-mcp-server-to-claude-code/` — Global config format `"command": "node", "args": [...]`

### Tertiary (LOW confidence)
- `https://gist.github.com/feveromo/7a340d7795fca1ccd535a5802b976e1f` — Windows path escaping and CMD wrapper pattern (community guide, unverified against official source, but consistent with multiple reports)
- Windows MSIX config path — reported in GitHub issue #26073 on anthropics/claude-code; not in official docs as of research date

---

## Metadata

**Confidence breakdown:**
- Config format (claude_desktop_config.json): HIGH — verified against official MCP docs and multiple independent sources
- Claude Code config (claude mcp add): HIGH — verified against official Claude Code docs
- Windows path pitfalls: MEDIUM — consistent across multiple community sources but no single official reference
- README structure patterns: HIGH — derived from official MCP reference server repos and stated project requirements
- Node 18 EOL recommendation: HIGH — April 2025 EOL is publicly documented by Node.js release schedule

**Research date:** 2026-04-20
**Valid until:** 2026-06-01 (MCP config format is stable; Claude Code CLI commands may change on shorter cycle)
