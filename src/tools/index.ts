// src/tools/index.ts
// Registers all MCP tools on the McpServer instance.
// Every handler is a stub that returns a valid MCP response; real implementations
// land in Phases 2-5. The tool NAMES and INPUT SCHEMAS defined here are the
// stable public API surface — do not rename or re-shape inputs after this phase.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFile } from "node:fs/promises";
import type { BusinessContext } from "../types/index.js";
import { buildLlmsTxt } from "../generators/files/llms-txt.js";
import { patchRobotsTxt } from "../generators/files/robots-txt.js";
import { runAudit } from "../audit/index.js";
import type { SuggestedToolCall, AuditFinding } from "../audit/types.js";
import { buildSitemapXml } from "../generators/files/sitemap-xml.js";
import { buildMarkdownMirror } from "../generators/files/markdown-mirrors.js";
import { buildSchemaMarkup } from "../generators/files/schema-markup.js";
import type { FaqPair, SchemaType } from "../generators/files/schema-markup.js";
import { buildFaqContent } from "../generators/content/faq.js";
import { acquireLocal } from "../acquisition/local.js";
import { crawlUrl } from "../acquisition/crawl.js";
import { isAcquisitionError } from "../types/index.js";
import type { MarkdownDocument } from "../types/index.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";

// Zod schema mirror of the BusinessContext TypeScript interface.
// Kept in tools/ (not types/) to keep types/index.ts Zod-free per RESEARCH.md Pattern 3.
const businessContextSchema = z.object({
  businessName: z.string().describe("The name of the business, exactly as it should appear in generated output"),
  businessType: z.string().describe("Type of business (e.g. 'vehicle wrap shop', 'law firm', 'restaurant')"),
  location: z.string().optional().describe("Primary service area (e.g. 'Denver, CO')"),
  services: z.array(z.string()).optional().describe("List of services offered"),
  website: z.string().optional().describe("Canonical website URL (e.g. 'https://example.com')"),
  phoneNumber: z.string().optional().describe("Contact phone number"),
  description: z.string().optional().describe("1-3 sentence business description"),
}).describe("Shared business details used across tools");

// ---------------------------------------------------------------------------
// Phase 9: Context accumulation types and tool-to-field map
// ---------------------------------------------------------------------------

/** Tool-specific fields gathered mid-wizard that are not part of BusinessContext. */
type WizardToolFields = {
  outputPath?: string;       // generate_llms_txt
  robotsPath?: string;       // configure_robots_txt
  sitemapUrl?: string;       // configure_robots_txt (optional)
  schemaTypes?: string[];    // generate_schema_markup
  outputDir?: string;        // generate_markdown_mirrors
};

/** Merged accumulator type: all BusinessContext fields + tool-specific wizard fields. */
type AccumulatedContext = Partial<BusinessContext> & WizardToolFields;

/**
 * Static mapping from each suggestedToolCall to the exact fields that tool requires.
 * Drives the Phase 9 gap-fill loop without runtime introspection.
 * Source: derived from inputSchemas defined below + audit/dimensions/* suggestedToolCall values.
 */
const TOOL_FIELD_MAP: Record<SuggestedToolCall, {
  contextRequired: (keyof BusinessContext)[];
  contextOptional: (keyof BusinessContext)[];
  toolRequired: (keyof WizardToolFields)[];
  toolOptional: (keyof WizardToolFields)[];
}> = {
  generate_llms_txt: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: ['outputPath'],
    toolOptional: [],
  },
  configure_robots_txt: {
    contextRequired: [],
    contextOptional: [],
    toolRequired: ['robotsPath'],
    toolOptional: ['sitemapUrl'],
  },
  generate_schema_markup: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: ['schemaTypes'],
    toolOptional: [],
  },
  generate_faq_content: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: [],
    toolOptional: [],
  },
  generate_markdown_mirrors: {
    contextRequired: [],
    contextOptional: [],
    toolRequired: ['outputDir'],
    toolOptional: [],
  },
};

// Stub handler factory — returns a valid MCP response marking the tool as
// registered-but-not-implemented. Phases 2-5 replace these bodies.
function stubResponse(toolName: string, phase: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `[stub] ${toolName} — implementation pending (Phase ${phase}). Inputs were received and validated successfully.`,
      },
    ],
  };
}

export function registerAllTools(server: McpServer): void {
  // ---------- Phase 3 tools ----------

  server.registerTool(
    "audit_ai_seo",
    {
      description:
        "Audit a website or local folder across 5 AI SEO dimensions (llms.txt, schema, robots.txt AI access, FAQ blocks, markdown mirrors). After auditing, prompts the user to choose between a detailed JSON report or the interactive fix wizard. Returns the detailed report when the wizard is declined or the client does not support MCP elicitation.",
      inputSchema: {
        target: z.string().describe("URL to crawl (https://...) or absolute local folder path to walk"),
        businessContext: businessContextSchema.optional(),
      },
    },
    async ({ target, businessContext }) => {
      try {
        if (!target || typeof target !== 'string' || target.trim().length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: target must be a non-empty string (URL or absolute local folder path)' }],
            isError: true,
          };
        }
        const report = await runAudit(target.trim(), businessContext ?? null);

        // WIZ-01: Post-audit fork via MCP elicitation.
        // If the client supports elicitation, ask the user to pick a mode.
        // If it doesn't (older Claude Code, non-elicitation client), elicitInput
        // throws and we fall through to the pre-v1.1 detailed-report response.
        let useWizard = false;
        try {
          const fork = await server.server.elicitInput({
            mode: 'form',
            message: 'Audit complete. How would you like to proceed?',
            requestedSchema: {
              type: 'object',
              properties: {
                mode: {
                  type: 'string',
                  title: 'Next step',
                  oneOf: [
                    { const: 'report', title: 'Detailed report' },
                    { const: 'wizard', title: 'Fix with wizard' },
                  ],
                },
              },
              required: ['mode'],
            },
          });
          useWizard = fork.action === 'accept' && fork.content?.mode === 'wizard';
        } catch (_elicitErr) {
          // Client does not support form elicitation — default to detailed report (WIZ-01 criterion 3).
        }

        if (!useWizard) {
          // Detailed-report path — identical shape to pre-v1.1 output.
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
          };
        }

        // Wizard path — Phase 8 issue selection.
        // Filter to actionable findings (fail + warning). Pass findings need no fix action.
        const actionableFindings = report.findings.filter(
          (f) => f.status === 'fail' || f.status === 'warning',
        );

        // All-pass short-circuit — nothing to elicit, no checklist needed.
        if (actionableFindings.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Great news — the audit found no issues to fix. All 5 dimensions are passing.',
            }],
          };
        }

        // Build the checklist: one entry per actionable finding.
        // Key is `dimension:status` composite (unique since runAudit emits one finding per dimension in v1).
        // Title surfaces severity and the human-readable message (ISEL-01).
        const issueItems = actionableFindings.map((f) => ({
          const: `${f.dimension}:${f.status}`,
          title: `[${f.severity.toUpperCase()}] ${f.dimension} — ${f.message}`,
        }));

        // Present the multi-select checklist. `default` pre-selects every item (ISEL-02).
        const selectionResult = await server.server.elicitInput({
          mode: 'form',
          message: `${actionableFindings.length} of 5 dimensions have issues. Select which to fix — all are selected by default; deselect any you want to skip.`,
          requestedSchema: {
            type: 'object',
            properties: {
              selectedIssues: {
                type: 'array',
                title: 'Issues to fix',
                items: { anyOf: issueItems },
                default: issueItems.map((i) => i.const),
              },
            },
            required: ['selectedIssues'],
          },
        });

        // Decline / cancel — graceful exit, no error.
        if (selectionResult.action !== 'accept') {
          return {
            content: [{
              type: 'text' as const,
              text: 'Issue selection cancelled. No fixes will be applied.',
            }],
          };
        }

        // Empty selection — user deselected everything (success criterion 4).
        const selectedKeys = (selectionResult.content?.selectedIssues ?? []) as string[];
        if (selectedKeys.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No issues selected. Exiting wizard without applying fixes.',
            }],
          };
        }

        // Filter findings to the user's selection.
        const selectedFindings = actionableFindings.filter(
          (f) => selectedKeys.includes(`${f.dimension}:${f.status}`),
        );

        // -----------------------------------------------------------------
        // Phase 9: Context accumulation loop
        // Seed from upfront businessContext (CTX-01), then gather only
        // missing required fields per tool (CTX-02), carrying answers
        // forward so no field is ever asked twice (CTX-03).
        // -----------------------------------------------------------------

        // Step 1: Seed accumulator from upfront businessContext (CTX-01)
        const acc: AccumulatedContext = { ...businessContext ?? {} };
        const skippedFindings: string[] = [];

        // Step 2: Loop over selected findings in severity order (already sorted by runAudit)
        for (const finding of selectedFindings) {
          // Guard: findings without a known fixing tool are skipped silently (Pitfall 4)
          const toolName = finding.suggestedToolCall;
          if (!toolName || !TOOL_FIELD_MAP[toolName]) continue;

          const fieldSpec = TOOL_FIELD_MAP[toolName];

          // Compute which required fields are missing from acc
          const missingContextRequired = fieldSpec.contextRequired.filter(
            (f) => acc[f] === undefined,
          );
          const missingToolRequired = fieldSpec.toolRequired.filter(
            (f) => (acc as Record<string, unknown>)[f] === undefined,
          );
          const allMissing = [...missingContextRequired, ...missingToolRequired];

          // If all required fields are already present — no elicitation needed (CTX-01, CTX-03)
          if (allMissing.length === 0) continue;

          // Build the gap-fill elicitation schema for this tool's missing fields
          const properties: Record<string, unknown> = {};
          const required: string[] = [];

          for (const field of allMissing) {
            required.push(field);
            switch (field) {
              case 'businessName':
                properties[field] = { type: 'string', title: 'Business name', description: 'Your business name as it should appear in generated files' };
                break;
              case 'businessType':
                properties[field] = { type: 'string', title: 'Business type', description: "Type of business (e.g. 'vehicle wrap shop', 'law firm')" };
                break;
              case 'location':
                properties[field] = { type: 'string', title: 'Location', description: "Primary service area (e.g. 'Denver, CO')" };
                break;
              case 'services':
                properties[field] = { type: 'string', title: 'Services', description: "Comma-separated list of services (e.g. 'Vehicle wraps, Fleet graphics')" };
                break;
              case 'website':
                properties[field] = { type: 'string', title: 'Website URL', description: "Your canonical website URL (e.g. 'https://example.com')" };
                break;
              case 'phoneNumber':
                properties[field] = { type: 'string', title: 'Phone number', description: 'Contact phone number' };
                break;
              case 'description':
                properties[field] = { type: 'string', title: 'Business description', description: '1-3 sentence description of your business' };
                break;
              case 'outputPath':
                properties[field] = { type: 'string', title: 'Output path for llms.txt', description: 'Absolute path where llms.txt should be written (e.g. /home/user/site/llms.txt)' };
                break;
              case 'robotsPath':
                properties[field] = { type: 'string', title: 'Path to robots.txt', description: 'Absolute path to robots.txt (will be created if missing)' };
                break;
              case 'sitemapUrl':
                properties[field] = { type: 'string', title: 'Sitemap URL (optional)', description: "Absolute URL to sitemap.xml (e.g. 'https://example.com/sitemap.xml')" };
                // sitemapUrl is optional — remove from required (Pitfall note: we pushed it above, pop it)
                required.pop();
                break;
              case 'schemaTypes':
                properties[field] = {
                  type: 'array',
                  title: 'Schema types to generate',
                  items: { anyOf: [
                    { const: 'LocalBusiness', title: 'LocalBusiness (recommended)' },
                    { const: 'FAQPage', title: 'FAQPage' },
                    { const: 'Service', title: 'Service' },
                  ]},
                  default: ['LocalBusiness'],
                };
                break;
              case 'outputDir':
                properties[field] = { type: 'string', title: 'Output directory for markdown mirrors', description: 'Absolute path to the directory where per-page index.md files will be written' };
                break;
            }
          }

          const gapResult = await server.server.elicitInput({
            mode: 'form',
            message: `To fix "${finding.dimension}" (${finding.severity}), I need a few more details:`,
            requestedSchema: {
              type: 'object',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              properties: properties as any,
              required,
            },
          });

          // User cancelled gap-fill for this tool — skip it, continue to others (Pitfall 5)
          if (gapResult.action !== 'accept') {
            skippedFindings.push(finding.dimension);
            continue;
          }

          // Merge gap-fill response into accumulator
          Object.assign(acc, gapResult.content);

          // Post-process: split services string into array (Pitfall 2)
          if (typeof acc.services === 'string') {
            acc.services = (acc.services as string).split(',').map((s) => s.trim()).filter(Boolean);
          }
          // Post-process: cast schemaTypes to string[] if needed (Pitfall 3)
          if (acc.schemaTypes !== undefined && !Array.isArray(acc.schemaTypes)) {
            acc.schemaTypes = [String(acc.schemaTypes)];
          }
        }

        // Step 3: Build contextSummary (success criterion 4 — visible/traceable state)
        const contextLines = Object.entries(acc)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
        const contextSummary = contextLines.length > 0
          ? `Context gathered:\n${contextLines.join('\n')}`
          : 'No context gathered (all tools operate without business details)';

        // Step 4 (Phase 10): Sequential execution loop
        const fixResults: string[] = [];
        const fixErrors: string[] = [];

        for (const finding of selectedFindings) {
          if (skippedFindings.includes(finding.dimension)) continue;
          const toolName = finding.suggestedToolCall;
          if (!toolName || !TOOL_FIELD_MAP[toolName]) continue;

          switch (toolName) {
            case 'generate_llms_txt': {
              try {
                const ctx = acc as BusinessContext;
                const content = buildLlmsTxt(ctx);
                await writeFile(acc.outputPath!, content, 'utf-8');
                fixResults.push('llms.txt written to ' + acc.outputPath + ' (' + content.length + ' bytes)');
                try {
                  await server.server.elicitInput({
                    mode: 'form',
                    message: 'Fix applied: ' + fixResults[fixResults.length - 1],
                    requestedSchema: {
                      type: 'object',
                      properties: {
                        acknowledged: { type: 'string', title: 'Continue', oneOf: [{ const: 'yes', title: 'OK' }] },
                      },
                      required: ['acknowledged'],
                    },
                  });
                } catch {
                  // Non-elicitation client — silently continue
                }
              } catch (toolErr) {
                fixErrors.push('generate_llms_txt: ' + (toolErr instanceof Error ? toolErr.message : String(toolErr)));
              }
              break;
            }

            case 'configure_robots_txt': {
              try {
                const result = await patchRobotsTxt(acc.robotsPath!, acc.sitemapUrl);
                const parts: string[] = [];
                if (result.botsAdded.length > 0) {
                  parts.push('Added ' + result.botsAdded.length + ' bot allow-rule(s): ' + result.botsAdded.join(', '));
                } else {
                  parts.push('All AI bot allow-rules already present');
                }
                if (result.sitemapAdded) {
                  parts.push('Added Sitemap: ' + acc.sitemapUrl);
                }
                fixResults.push('robots.txt — ' + parts.join('; '));
                try {
                  await server.server.elicitInput({
                    mode: 'form',
                    message: 'Fix applied: ' + fixResults[fixResults.length - 1],
                    requestedSchema: {
                      type: 'object',
                      properties: {
                        acknowledged: { type: 'string', title: 'Continue', oneOf: [{ const: 'yes', title: 'OK' }] },
                      },
                      required: ['acknowledged'],
                    },
                  });
                } catch {
                  // Non-elicitation client — silently continue
                }
              } catch (toolErr) {
                fixErrors.push('configure_robots_txt: ' + (toolErr instanceof Error ? toolErr.message : String(toolErr)));
              }
              break;
            }

            case 'generate_schema_markup': {
              try {
                const ctx = acc as BusinessContext;
                const blocks = buildSchemaMarkup(ctx, acc.schemaTypes as SchemaType[]);
                fixResults.push('schema markup generated (' + blocks.length + ' block(s) — copy JSON-LD into <head>):\n' + blocks.join('\n\n'));
                try {
                  await server.server.elicitInput({
                    mode: 'form',
                    message: 'Fix applied: ' + fixResults[fixResults.length - 1],
                    requestedSchema: {
                      type: 'object',
                      properties: {
                        acknowledged: { type: 'string', title: 'Continue', oneOf: [{ const: 'yes', title: 'OK' }] },
                      },
                      required: ['acknowledged'],
                    },
                  });
                } catch {
                  // Non-elicitation client — silently continue
                }
              } catch (toolErr) {
                fixErrors.push('generate_schema_markup: ' + (toolErr instanceof Error ? toolErr.message : String(toolErr)));
              }
              break;
            }

            case 'generate_faq_content': {
              try {
                const ctx = acc as BusinessContext;
                const pairs = buildFaqContent(ctx);
                fixResults.push('FAQ content generated (' + pairs.length + ' pairs):\n' + JSON.stringify(pairs, null, 2));
                try {
                  await server.server.elicitInput({
                    mode: 'form',
                    message: 'Fix applied: ' + fixResults[fixResults.length - 1],
                    requestedSchema: {
                      type: 'object',
                      properties: {
                        acknowledged: { type: 'string', title: 'Continue', oneOf: [{ const: 'yes', title: 'OK' }] },
                      },
                      required: ['acknowledged'],
                    },
                  });
                } catch {
                  // Non-elicitation client — silently continue
                }
              } catch (toolErr) {
                fixErrors.push('generate_faq_content: ' + (toolErr instanceof Error ? toolErr.message : String(toolErr)));
              }
              break;
            }

            case 'generate_markdown_mirrors': {
              try {
                const t = target.trim();
                const isUrl = t.startsWith('http://') || t.startsWith('https://');
                const results = isUrl ? await crawlUrl(t) : await acquireLocal(t);
                const docs: MarkdownDocument[] = results.filter((r): r is MarkdownDocument => !isAcquisitionError(r));
                if (docs.length === 0) {
                  fixErrors.push('generate_markdown_mirrors: no pages acquired from ' + t);
                  break;
                }
                const dir = acc.outputDir!;
                const writtenSlugs = new Set<string>();
                const disambiguate = (slug: string): string => {
                  if (!writtenSlugs.has(slug)) { writtenSlugs.add(slug); return slug; }
                  let n = 2;
                  while (writtenSlugs.has(`${slug}-${n}`)) n++;
                  const unique = `${slug}-${n}`;
                  writtenSlugs.add(unique);
                  return unique;
                };
                const limit = pLimit(5);
                const writes = docs.map((doc) => limit(async () => {
                  const { slug, content } = buildMarkdownMirror(doc);
                  const finalSlug = disambiguate(slug);
                  const filePath = finalSlug === 'index'
                    ? path.join(dir, 'index.md')
                    : path.join(dir, finalSlug, 'index.md');
                  await mkdir(path.dirname(filePath), { recursive: true });
                  await writeFile(filePath, content, 'utf-8');
                  return filePath;
                }));
                const written = await Promise.all(writes);
                fixResults.push(written.length + ' markdown mirror(s) written under ' + acc.outputDir!);
                try {
                  await server.server.elicitInput({
                    mode: 'form',
                    message: 'Fix applied: ' + fixResults[fixResults.length - 1],
                    requestedSchema: {
                      type: 'object',
                      properties: {
                        acknowledged: { type: 'string', title: 'Continue', oneOf: [{ const: 'yes', title: 'OK' }] },
                      },
                      required: ['acknowledged'],
                    },
                  });
                } catch {
                  // Non-elicitation client — silently continue
                }
              } catch (toolErr) {
                fixErrors.push('generate_markdown_mirrors: ' + (toolErr instanceof Error ? toolErr.message : String(toolErr)));
              }
              break;
            }
          }
        }

        // Step 5: Session summary return
        const summaryLines: string[] = [
          'Wizard complete. ' + fixResults.length + ' fix(es) applied.',
        ];
        if (fixResults.length > 0) {
          summaryLines.push('', 'Applied:');
          summaryLines.push(...fixResults.map((r) => '  - ' + r));
        }
        if (fixErrors.length > 0) {
          summaryLines.push('', 'Errors:');
          summaryLines.push(...fixErrors.map((e) => '  - ' + e));
        }
        if (skippedFindings.length > 0) {
          summaryLines.push('', 'Skipped (gap-fill cancelled):');
          summaryLines.push(...skippedFindings.map((d) => '  - ' + d));
        }
        return {
          content: [{ type: 'text' as const, text: summaryLines.join('\n') }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "generate_llms_txt",
    {
      description:
        "Generate a spec-compliant llms.txt file from business details. Produces H1 site name, optional blockquote summary, and H2 section blocks (About, Services, Pricing, FAQ, Locations, Contact) per llmstxt.org spec.",
      inputSchema: {
        businessContext: businessContextSchema,
        outputPath: z.string().describe("Absolute path where llms.txt should be written"),
      },
    },
    async ({ businessContext, outputPath }) => {
      try {
        if (!outputPath || typeof outputPath !== 'string' || outputPath.trim().length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: outputPath must be a non-empty string (absolute path where llms.txt should be written)' }],
            isError: true,
          };
        }
        if (!businessContext || typeof businessContext.businessName !== 'string' || businessContext.businessName.trim().length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: businessContext.businessName is required' }],
            isError: true,
          };
        }
        const content = buildLlmsTxt(businessContext);
        await writeFile(outputPath.trim(), content, 'utf-8');
        return {
          content: [{ type: 'text' as const, text: `llms.txt written to ${outputPath.trim()} (${content.length} bytes)` }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "configure_robots_txt",
    {
      description:
        "Patch an existing robots.txt (or create one) to allow AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot) and add a Sitemap pointer. Preserves existing rules.",
      inputSchema: {
        robotsPath: z.string().describe("Absolute path to robots.txt (will be created if missing)"),
        sitemapUrl: z.string().optional().describe("Absolute URL to sitemap.xml (e.g. 'https://example.com/sitemap.xml')"),
      },
    },
    async ({ robotsPath, sitemapUrl }) => {
      try {
        if (!robotsPath || typeof robotsPath !== 'string' || robotsPath.trim().length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: robotsPath must be a non-empty string (absolute path to robots.txt)' }],
            isError: true,
          };
        }
        const result = await patchRobotsTxt(robotsPath.trim(), sitemapUrl?.trim());
        const parts: string[] = [];
        if (result.botsAdded.length > 0) {
          parts.push(`Added ${result.botsAdded.length} bot allow-rule(s): ${result.botsAdded.join(', ')}`);
        } else {
          parts.push('All 5 AI bot allow-rules already present — no bot changes needed');
        }
        if (result.sitemapAdded) {
          parts.push(`Added Sitemap: ${sitemapUrl}`);
        } else if (sitemapUrl) {
          parts.push('Sitemap directive already present — no sitemap change needed');
        }
        return {
          content: [{ type: 'text' as const, text: `${robotsPath.trim()} — ${parts.join('; ')}` }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // ---------- Phase 4 tools ----------

  server.registerTool(
    "generate_sitemap",
    {
      description:
        "Generate an XML sitemap with priority scoring (1.0 home, 0.9 service, 0.8 info, 0.7 secondary) from a local folder or live URL crawl. Emits absolute URLs with ISO 8601 lastmod dates.",
      inputSchema: {
        target: z.string().describe("URL to crawl or absolute local folder path"),
        baseUrl: z.string().describe("Canonical site URL used to make all sitemap URLs absolute (e.g. 'https://example.com')"),
        outputPath: z.string().describe("Absolute path where sitemap.xml should be written"),
      },
    },
    async ({ target, baseUrl, outputPath }) => {
      try {
        if (!target || typeof target !== 'string' || target.trim().length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: target must be a non-empty string (URL or absolute local folder path)' }], isError: true };
        }
        if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: baseUrl must be a non-empty string (e.g. https://example.com)' }], isError: true };
        }
        if (!outputPath || typeof outputPath !== 'string' || outputPath.trim().length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: outputPath must be a non-empty string (absolute path where sitemap.xml should be written)' }], isError: true };
        }

        const t = target.trim();
        const isUrl = t.startsWith('http://') || t.startsWith('https://');
        const results = isUrl ? await crawlUrl(t) : await acquireLocal(t);
        const docs: MarkdownDocument[] = results.filter((r): r is MarkdownDocument => !isAcquisitionError(r));

        if (docs.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: no pages acquired from ${t} — nothing to include in sitemap` }], isError: true };
        }

        const xml = buildSitemapXml(docs, baseUrl.trim());
        await writeFile(outputPath.trim(), xml, 'utf-8');
        return { content: [{ type: 'text' as const, text: `sitemap.xml written to ${outputPath.trim()} (${docs.length} URLs, ${xml.length} bytes)` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "generate_markdown_mirrors",
    {
      description:
        "Convert HTML pages to clean index.md files with YAML frontmatter. Strips navigation, footer, scripts, and chrome via Cheerio before Turndown conversion. One index.md per page at /page/index.md.",
      inputSchema: {
        target: z.string().describe("URL to crawl or absolute local folder path containing HTML"),
        outputDir: z.string().describe("Absolute directory where per-page /path/index.md files will be written"),
      },
    },
    async ({ target, outputDir }) => {
      try {
        if (!target || typeof target !== 'string' || target.trim().length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: target must be a non-empty string (URL or absolute local folder path)' }], isError: true };
        }
        if (!outputDir || typeof outputDir !== 'string' || outputDir.trim().length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: outputDir must be a non-empty string (absolute directory where mirror files will be written)' }], isError: true };
        }

        const t = target.trim();
        const dir = outputDir.trim();
        const isUrl = t.startsWith('http://') || t.startsWith('https://');
        const results = isUrl ? await crawlUrl(t) : await acquireLocal(t);
        const docs: MarkdownDocument[] = results.filter((r): r is MarkdownDocument => !isAcquisitionError(r));

        if (docs.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: no pages acquired from ${t} — nothing to mirror` }], isError: true };
        }

        // Slug collision handling (RESEARCH.md Pitfall 3)
        const writtenSlugs = new Set<string>();
        const disambiguate = (slug: string): string => {
          if (!writtenSlugs.has(slug)) { writtenSlugs.add(slug); return slug; }
          let n = 2;
          while (writtenSlugs.has(`${slug}-${n}`)) n++;
          const unique = `${slug}-${n}`;
          writtenSlugs.add(unique);
          return unique;
        };

        const limit = pLimit(5);
        const writes = docs.map((doc) => limit(async () => {
          const { slug, content } = buildMarkdownMirror(doc);
          const finalSlug = disambiguate(slug);
          // Home page (slug === 'index') writes to outputDir/index.md — flat, not nested (Pitfall 8)
          const filePath = finalSlug === 'index'
            ? path.join(dir, 'index.md')
            : path.join(dir, finalSlug, 'index.md');
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, content, 'utf-8');
          return filePath;
        }));
        const written = await Promise.all(writes);
        return { content: [{ type: 'text' as const, text: `${written.length} markdown mirror(s) written under ${dir}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "generate_schema_markup",
    {
      description:
        "Generate valid JSON-LD schema.org markup for LocalBusiness, FAQPage, and/or Service types from business details. Uses https://schema.org context; output passes the schema.org validator.",
      inputSchema: {
        businessContext: businessContextSchema,
        schemaTypes: z
          .array(z.enum(["LocalBusiness", "FAQPage", "Service"]))
          .describe("Which schema.org types to emit. Pass all three for a complete set."),
        faqs: z
          .array(z.object({
            question: z.string().describe("The question text, as a user might ask it"),
            answer: z.string().describe("The answer, naming the business and citing specifics"),
          }))
          .optional()
          .describe("Optional Q&A pairs used when FAQPage is in schemaTypes. If omitted, placeholders are generated from BusinessContext.services. Phase 5's generate_faq_content produces the real input for this field."),
      },
    },
    async ({ businessContext, schemaTypes, faqs }) => {
      try {
        if (!businessContext || typeof businessContext.businessName !== 'string' || businessContext.businessName.trim().length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: businessContext.businessName is required' }], isError: true };
        }
        if (!schemaTypes || !Array.isArray(schemaTypes) || schemaTypes.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: schemaTypes must contain at least one of LocalBusiness, FAQPage, Service' }], isError: true };
        }
        const blocks = buildSchemaMarkup(businessContext, schemaTypes as SchemaType[], faqs as FaqPair[] | undefined);
        return {
          content: [{ type: 'text' as const, text: blocks.join('\n\n') }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ---------- Phase 5 tool ----------

  server.registerTool(
    "generate_faq_content",
    {
      description:
        "Generate 8-10 AI-quotable Q&A pairs from business details. Answers name the business, cite specific numbers/facts, and avoid marketing hedging language. Output is directly consumable by generate_schema_markup's FAQPage type.",
      inputSchema: {
        businessContext: businessContextSchema,
        count: z.number().int().min(3).max(20).optional().describe("Number of Q&A pairs to generate (default 8-10)"),
      },
    },
    async ({ businessContext, count }) => {
      try {
        if (
          !businessContext ||
          typeof businessContext.businessName !== 'string' ||
          businessContext.businessName.trim().length === 0
        ) {
          return {
            content: [{ type: 'text' as const, text: 'Error: businessContext.businessName is required' }],
            isError: true,
          };
        }
        if (
          typeof businessContext.businessType !== 'string' ||
          businessContext.businessType.trim().length === 0
        ) {
          return {
            content: [{ type: 'text' as const, text: 'Error: businessContext.businessType is required' }],
            isError: true,
          };
        }
        const pairs = buildFaqContent(businessContext, count);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(pairs, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // ---------- v2 tool (registered as stub per PROJECT.md v1 Active list) ----------

  server.registerTool(
    "generate_location_service_pages",
    {
      description:
        "Generate full HTML/Markdown content for city and service landing pages (400-800 words each, FAQ schema, internal links, LocalBusiness schema per city). Note: full implementation is v2; this tool is registered now so the server surface is stable.",
      inputSchema: {
        businessContext: businessContextSchema,
        locations: z.array(z.string()).describe("List of cities or service areas to generate pages for"),
        outputDir: z.string().describe("Absolute directory where generated pages will be written"),
      },
    },
    async () => stubResponse("generate_location_service_pages", "v2"),
  );
}
