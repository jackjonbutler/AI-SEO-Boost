---
phase: 03-core-generators
verified: 2026-04-20T00:00:00Z
status: passed
score: 4/4 must-haves verified
gaps: []
---

# Phase 03: Core Generators Verification Report

**Phase Goal:** A user can run the audit to see what is broken, generate a spec-compliant llms.txt, and patch robots.txt to allow AI crawlers without touching any file manually
**Verified:** 2026-04-20
**Status:** passed
**Re-verification:** No (initial verification)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | audit_ai_seo returns prioritized fix list covering all 5 dimensions with suggestedToolCall for each gap | VERIFIED | runAudit() orchestrates 5 dimension modules via Promise.all; severity sort critical>high>medium>low; each failing finding has a suggestedToolCall matching a real registered tool |
| 2 | generate_llms_txt produces spec-compliant output from BusinessContext only no invented content | VERIFIED | buildLlmsTxt() reads ctx fields exclusively; H1 always emitted; blockquote only if description present; H2 sections only if fields non-empty; no fallback strings |
| 3 | configure_robots_txt adds all 5 AI bot allow-rules and optional Sitemap pointer without removing existing rules | VERIFIED | patchRobotsTxt() is append-only; AI_BOTS = GPTBot ClaudeBot PerplexityBot Google-Extended CCBot; case-insensitive regex; ENOENT auto-creates; idempotent |
| 4 | All three tools return a descriptive error string when given invalid or missing input | VERIFIED | all three handlers have pre-flight isError:true guards for empty required fields plus catch-all try/catch returning isError:true on any exception |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Role | Lines | Stubs | Wired | Status |
|----------|------|-------|-------|-------|--------|
| src/audit/types.ts | AuditReport AuditFinding Severity AuditDimension types + isUrl/originFor | 42 | None | Imported by audit/index.ts and all 5 dimensions | VERIFIED |
| src/audit/index.ts | runAudit() orchestrator validate origin-normalise Promise.all severity sort | 50 | None | Imported by src/tools/index.ts | VERIFIED |
| src/audit/dimensions/llms-txt.ts | HEAD probe URL or fs.access local for llms.txt | 63 | None | Called in audit/index.ts via Promise.all | VERIFIED |
| src/audit/dimensions/robots-txt.ts | Per-bot case-insensitive regex match re-exports AI_BOTS | 87 | None | Called in audit/index.ts via Promise.all | VERIFIED |
| src/audit/dimensions/schema.ts | Cheerio JSON-LD @type extraction LocalBusiness detection | 106 | None | Called in audit/index.ts via Promise.all | VERIFIED |
| src/audit/dimensions/faq.ts | FAQPage JSON-LD + question-heading heuristic >=3 headings | 96 | None | Called in audit/index.ts via Promise.all | VERIFIED |
| src/audit/dimensions/markdown.ts | HEAD probe /index.md for URL; one-level readdir for local | 55 | None | Called in audit/index.ts via Promise.all | VERIFIED |
| src/generators/files/llms-txt.ts | Pure buildLlmsTxt(ctx) no I/O deterministic | 60 | None | Imported and called in src/tools/index.ts:99 | VERIFIED |
| src/generators/files/robots-txt.ts | AI_BOTS const + patchRobotsTxt() append-only patcher | 57 | None | Imported and called in src/tools/index.ts:132 | VERIFIED |
| src/tools/index.ts (modified) | Wires audit_ai_seo generate_llms_txt configure_robots_txt real handlers | 232 | Phase 4-5 stubs intentional | Entry point called by src/index.ts | VERIFIED |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| audit_ai_seo handler | runAudit() | import + direct call in tools/index.ts:61 | WIRED | Result JSON.stringify into response content |
| runAudit() | 5 dimension modules | Promise.all in audit/index.ts:34-40 | WIRED | All 5 called concurrently; results sorted |
| robots-txt dimension | AI_BOTS constant | re-export from generators/files/robots-txt.ts | WIRED | Single source of truth no duplication |
| generate_llms_txt handler | buildLlmsTxt() | import + call in tools/index.ts:99 | WIRED | Content written via writeFile; byte count returned |
| configure_robots_txt handler | patchRobotsTxt() | import + call in tools/index.ts:132 | WIRED | Result surfaced as descriptive text response |
| suggestedToolCall values | Registered tool names | String literals vs server.registerTool() names | WIRED | All 5 confirmed: generate_llms_txt configure_robots_txt generate_schema_markup generate_faq_content generate_markdown_mirrors |

---

## Spec Compliance Detail: llms.txt

buildLlmsTxt() in src/generators/files/llms-txt.ts satisfies the must-have spec:

- H1 site name: always first line from ctx.businessName (required field)
- Optional blockquote: emitted only when ctx.description is non-empty
- H2 section blocks: Services Locations Contact each guarded by non-empty checks never emitted empty
- No invented content: all values from ctx fields only; no fallback strings for absent optional fields
- POSIX trailing newline: lines.join(LF).trimEnd() + LF

---

## Bot Coverage Detail: robots.txt

AI_BOTS in src/generators/files/robots-txt.ts line 7:
  GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot (as const)

All 5 required bots present. Each missing bot receives User-agent + Allow: / block.
Detection uses case-insensitive multiline RegExp (im flags). Sitemap added when sitemapUrl
provided and not already present. Idempotent: second call returns botsAdded:[] sitemapAdded:false.

---

## Error Handling Verification

| Tool | Invalid Input | Response | Crash |
|------|--------------|----------|-------|
| audit_ai_seo | Empty string target | isError:true descriptive message | No |
| audit_ai_seo | Non-existent local path | isError:true (runAudit throws handler catches) | No |
| generate_llms_txt | Empty outputPath | isError:true guard at tools/index.ts:87 | No |
| generate_llms_txt | Empty businessName | isError:true guard at tools/index.ts:93 | No |
| configure_robots_txt | Empty robotsPath | isError:true guard at tools/index.ts:126 | No |
| configure_robots_txt | EACCES or other fs error | isError:true handler catch | No |
| All 5 audit dimensions | Network failure or parse error | status:warning returned never throws | No |

---

## Anti-Patterns Found

None in phase-critical files. Return null in schema.ts and faq.ts is inside the private
getHtml() helper signalling HTML unavailability to the caller, not a stub pattern.

---

## Human Verification Required

### 1. Live URL audit

**Test:** Call audit_ai_seo with a real URL via an MCP client
**Expected:** JSON report with 5 findings severity-sorted each failing finding has suggestedToolCall
**Why human:** Network probes cannot be exercised by static code analysis

### 2. generate_llms_txt end-to-end write

**Test:** Call with a full businessContext and a writable outputPath; read back the written file
**Expected:** Valid llms.txt per llmstxt.org spec; no content beyond what was supplied
**Why human:** Actual file system write requires live execution

### 3. configure_robots_txt preserve-existing test

**Test:** Seed a robots.txt with existing rules call the tool inspect the result
**Expected:** Original lines intact; 5 new bot blocks appended; optional Sitemap line added
**Why human:** Real file mutation must be confirmed non-destructive

---

## Summary

All 4 must-haves verified against the actual codebase. Phase goal is achieved:

- Audit engine is real: 5 non-crashing dimension modules severity-sorted output suggestedToolCall
  values pointing at real registered tool names.
- llms.txt generator is spec-compliant: H1 optional blockquote conditional H2 sections populated
  only from caller-supplied BusinessContext fields.
- robots.txt patcher is append-only and covers all 5 required bots plus optional Sitemap with
  case-insensitive idempotent detection.
- Error handling is consistent across all three tools: invalid inputs return isError:true with a
  descriptive message; no exceptions escape handlers.
- TypeScript compiler passes clean (tsc --noEmit produces no output).

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_

