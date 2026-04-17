// src/types/index.ts
// Shared types used across all MCP tools.
// CRITICAL: This file must import NOTHING from other src/ modules.
// It is the leaf node in the dependency graph — types flow down from here
// to tools/, acquisition/, generators/, etc. Nothing flows back up.
// Adding an import from "../tools" or similar will create a cycle
// and cause "Cannot read properties of undefined" errors at startup.

/**
 * BusinessContext — the shared input shape used by every tool that needs
 * business details (generate_llms_txt, generate_schema_markup, generate_faq_content,
 * generate_location_service_pages, etc.).
 *
 * Keep this as a plain TypeScript interface. The Zod runtime schema for
 * BusinessContext lives in src/tools/ (or a future src/schemas/), NOT here,
 * so this file stays free of Zod dependency and can be imported cheaply
 * from anywhere.
 */
export interface BusinessContext {
  /** Required: the name of the business, as it should appear in generated output. */
  businessName: string;

  /** Required: type of business (e.g. "vehicle wrap shop", "law firm", "restaurant"). */
  businessType: string;

  /** Optional: primary service area (e.g. "Denver, CO" or "Front Range, Colorado"). */
  location?: string;

  /** Optional: list of services offered (used in llms.txt Services section and schema.org Service markup). */
  services?: string[];

  /** Optional: canonical website URL (e.g. "https://example.com"). Used to emit absolute URLs. */
  website?: string;

  /** Optional: contact phone number in E.164 or display format. */
  phoneNumber?: string;

  /** Optional: 1-3 sentence business description used in llms.txt summary blockquote. */
  description?: string;
}
