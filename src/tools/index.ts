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
        const report = await runAudit(target.trim());

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

        // Wizard path — Phase 7 stub. Phase 8 replaces this with real issue selection.
        // Return a JSON envelope so Phase 8 has the audit report and businessContext in hand.
        const wizardPayload = {
          marker: '[wizard] Phase 7 stub — issue selection lands in Phase 8',
          report,
          businessContext: businessContext ?? null,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wizardPayload, null, 2) }],
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
