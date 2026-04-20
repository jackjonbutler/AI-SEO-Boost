// src/generators/files/schema-markup.ts
// Pure JSON-LD builder for LocalBusiness, FAQPage, and Service schema.org types.
// No I/O, no Zod, no side effects — deterministic given the same inputs.
// RESEARCH.md Pitfall 5: Always use HTTPS, no trailing slash for @context.

import type { BusinessContext } from '../../types/index.js';

export type SchemaType = 'LocalBusiness' | 'FAQPage' | 'Service';

export interface FaqPair {
  question: string;
  answer: string;
}

// RESEARCH.md Pitfall 5 — HTTPS, no trailing slash
const SCHEMA_CONTEXT = 'https://schema.org';

// ---- Internal builders (not exported) ----

function buildLocalBusiness(ctx: BusinessContext): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'LocalBusiness',
    name: ctx.businessName,
  };

  // Conditionally include optional fields — omit when absent (no null/empty values)
  if (ctx.description && ctx.description.trim().length > 0) {
    obj.description = ctx.description;
  }
  if (ctx.website && ctx.website.trim().length > 0) {
    obj.url = ctx.website;
  }
  if (ctx.phoneNumber && ctx.phoneNumber.trim().length > 0) {
    obj.telephone = ctx.phoneNumber;
  }
  if (ctx.location && ctx.location.trim().length > 0) {
    obj.address = {
      '@type': 'PostalAddress',
      addressLocality: ctx.location,
    };
  }
  if (ctx.services && ctx.services.length > 0) {
    obj.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: `${ctx.businessName} Services`,
      itemListElement: ctx.services.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s },
      })),
    };
  }

  return obj;
}

function buildFaqPage(faqs: FaqPair[]): Record<string, unknown> {
  // Filter out pairs with empty question or answer
  const filtered = faqs.filter(
    (pair) => pair.question.trim().length > 0 && pair.answer.trim().length > 0,
  );

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'FAQPage',
    mainEntity: filtered.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

function buildService(ctx: BusinessContext, serviceName: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Service',
    name: serviceName,
    provider: { '@type': 'LocalBusiness', name: ctx.businessName },
    // businessType is REQUIRED in BusinessContext — always include
    serviceType: ctx.businessType,
  };

  // Conditionally include optional fields
  if (ctx.location && ctx.location.trim().length > 0) {
    obj.areaServed = ctx.location;
  }
  if (ctx.description && ctx.description.trim().length > 0) {
    obj.description = ctx.description;
  }

  return obj;
}

function placeholderFaqs(ctx: BusinessContext): FaqPair[] {
  // RESEARCH.md Open Question 1: fallback when faqs param not provided
  if (ctx.services && ctx.services.length > 0) {
    const pairs = ctx.services.slice(0, 5).map((service) => ({
      question: `Does ${ctx.businessName} offer ${service}?`,
      answer: `${ctx.businessName} offers ${service}${ctx.location ? ' in ' + ctx.location : ''}.`,
    }));
    return pairs;
  }

  // Single generic pair
  return [
    {
      question: `What does ${ctx.businessName} do?`,
      answer:
        ctx.description ||
        `${ctx.businessName} is a ${ctx.businessType}${ctx.location ? ' based in ' + ctx.location : ''}.`,
    },
  ];
}

// ---- Public API ----

/**
 * Build JSON-LD schema.org markup blocks for the given schema types.
 *
 * Returns one string per block (except Service, which returns one per service entry).
 * Each string is valid JSON — use JSON.parse() to verify or embed directly in <script type="application/ld+json">.
 *
 * Throws on structural errors (empty businessName, empty types) to make misuse loud.
 * The MCP handler wraps calls in try/catch and returns isError:true on throw.
 */
export function buildSchemaMarkup(
  ctx: BusinessContext,
  types: SchemaType[],
  faqs?: FaqPair[],
): string[] {
  if (!ctx.businessName || ctx.businessName.trim().length === 0) {
    throw new Error('businessContext.businessName is required for schema markup');
  }
  if (!types || types.length === 0) {
    throw new Error('schemaTypes must contain at least one of LocalBusiness, FAQPage, Service');
  }

  const blocks: string[] = [];

  for (const t of types) {
    if (t === 'LocalBusiness') {
      blocks.push(JSON.stringify(buildLocalBusiness(ctx), null, 2));
    } else if (t === 'FAQPage') {
      const pairs = faqs && faqs.length > 0 ? faqs : placeholderFaqs(ctx);
      blocks.push(JSON.stringify(buildFaqPage(pairs), null, 2));
    } else if (t === 'Service') {
      const services =
        ctx.services && ctx.services.length > 0 ? ctx.services : [ctx.businessType];
      for (const s of services) {
        blocks.push(JSON.stringify(buildService(ctx, s), null, 2));
      }
    }
  }

  return blocks;
}
