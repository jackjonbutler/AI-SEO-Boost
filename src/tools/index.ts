// src/tools/index.ts
// Registers all MCP tools on the McpServer instance.
// Every handler is a stub that returns a valid MCP response; real implementations
// land in Phases 2-5. The tool NAMES and INPUT SCHEMAS defined here are the
// stable public API surface — do not rename or re-shape inputs after this phase.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BusinessContext } from "../types/index.js";

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
        "Audit a website or local folder across 5 AI SEO dimensions (llms.txt, schema, robots.txt AI access, FAQ blocks, markdown mirrors). Returns a prioritized fix list with suggested tool calls.",
      inputSchema: {
        target: z.string().describe("URL to crawl (https://...) or absolute local folder path to walk"),
        businessContext: businessContextSchema,
      },
    },
    async () => stubResponse("audit_ai_seo", "3"),
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
    async () => stubResponse("generate_llms_txt", "3"),
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
    async () => stubResponse("configure_robots_txt", "3"),
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
    async () => stubResponse("generate_sitemap", "4"),
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
    async () => stubResponse("generate_markdown_mirrors", "4"),
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
      },
    },
    async () => stubResponse("generate_schema_markup", "4"),
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
    async () => stubResponse("generate_faq_content", "5"),
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
