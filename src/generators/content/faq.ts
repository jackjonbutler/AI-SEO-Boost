// src/generators/content/faq.ts
// Pure deterministic FAQ Q&A pair generator built on a category-based template pool.
// No I/O, no Zod, no side effects — deterministic given the same BusinessContext.
// RESEARCH.md Pitfall 4: FaqPair imported as type-only — erased at compile time, no runtime coupling.
// RESEARCH.md Pitfall 1: Templates 0-7 (index 0-7) always fire (require only businessName + businessType).

import type { BusinessContext } from '../../types/index.js';
import type { FaqPair } from '../files/schema-markup.js';

type QaTemplate = (ctx: BusinessContext) => FaqPair | null;

const TEMPLATES: QaTemplate[] = [
  // ---- Identity (required fields only — always fire — indices 0-7) ----

  // 0: What is X?
  (ctx) => ({
    question: `What is ${ctx.businessName}?`,
    answer: `${ctx.businessName} is a ${ctx.businessType}${ctx.location && ctx.location.trim() ? ' based in ' + ctx.location : ''}.`,
  }),

  // 1: What type of business is X?
  (ctx) => ({
    question: `What type of business is ${ctx.businessName}?`,
    answer: `${ctx.businessName} is a ${ctx.businessType}.`,
  }),

  // 2: What industry does X operate in?
  (ctx) => ({
    question: `What industry does ${ctx.businessName} operate in?`,
    answer: `${ctx.businessName} operates as a ${ctx.businessType}.`,
  }),

  // 3: Is X a Y?
  (ctx) => ({
    question: `Is ${ctx.businessName} a ${ctx.businessType}?`,
    answer: `Yes. ${ctx.businessName} is a ${ctx.businessType}${ctx.location && ctx.location.trim() ? ' serving ' + ctx.location : ''}.`,
  }),

  // 4: Who is X? (description appended when present)
  (ctx) => ({
    question: `Who is ${ctx.businessName}?`,
    answer: `${ctx.businessName} is a ${ctx.businessType}${ctx.location && ctx.location.trim() ? ' located in ' + ctx.location : ''}${ctx.description && ctx.description.trim() ? '. ' + ctx.description.trim() : ''}.`,
  }),

  // 5: What kind of services does X provide? (always fires — two answer forms)
  (ctx) => ({
    question: `What kind of services does ${ctx.businessName} provide?`,
    answer:
      ctx.services && ctx.services.length > 0
        ? `${ctx.businessName} provides ${ctx.services.length} service${ctx.services.length === 1 ? '' : 's'}: ${ctx.services.join(', ')}.`
        : `${ctx.businessName} provides ${ctx.businessType} services${ctx.location && ctx.location.trim() ? ' in ' + ctx.location : ''}.`,
  }),

  // 6: Where can I learn more about X? (always fires — two answer forms)
  (ctx) => ({
    question: `Where can I learn more about ${ctx.businessName}?`,
    answer:
      ctx.website && ctx.website.trim()
        ? `You can learn more about ${ctx.businessName} at ${ctx.website}.`
        : `${ctx.businessName} is a ${ctx.businessType}${ctx.location && ctx.location.trim() ? ' located in ' + ctx.location : ''}.`,
  }),

  // 7: What does X do? (always fires — enriched when optional fields present)
  (ctx) => ({
    question: `What does ${ctx.businessName} do?`,
    answer: `${ctx.businessName} operates as a ${ctx.businessType}${ctx.services && ctx.services.length > 0 ? ', offering ' + ctx.services.length + ' service' + (ctx.services.length === 1 ? '' : 's') : ''}${ctx.location && ctx.location.trim() ? ' in ' + ctx.location : ''}.`,
  }),

  // ---- Services (require ctx.services && services.length > 0 — return null otherwise) ----

  // 8: How many services does X offer?
  (ctx) =>
    ctx.services && ctx.services.length > 0
      ? {
          question: `How many services does ${ctx.businessName} offer?`,
          answer: `${ctx.businessName} offers ${ctx.services.length} service${ctx.services.length === 1 ? '' : 's'}: ${ctx.services.join(', ')}.`,
        }
      : null,

  // 9: Does X offer [first service]?
  (ctx) =>
    ctx.services && ctx.services.length > 0
      ? {
          question: `Does ${ctx.businessName} offer ${ctx.services[0]}?`,
          answer: `Yes. ${ctx.businessName} offers ${ctx.services[0]}${ctx.location && ctx.location.trim() ? ' in ' + ctx.location : ''}.`,
        }
      : null,

  // ---- Location (requires ctx.location — return null otherwise) ----

  // 10: What area does X serve?
  (ctx) =>
    ctx.location && ctx.location.trim()
      ? {
          question: `What area does ${ctx.businessName} serve?`,
          answer: `${ctx.businessName} serves ${ctx.location}.`,
        }
      : null,

  // 11: Where is X located?
  (ctx) =>
    ctx.location && ctx.location.trim()
      ? {
          question: `Where is ${ctx.businessName} located?`,
          answer: `${ctx.businessName} is located in ${ctx.location}.`,
        }
      : null,

  // ---- Contact (requires ctx.phoneNumber — return null otherwise) ----

  // 12: How do I contact X?
  (ctx) =>
    ctx.phoneNumber && ctx.phoneNumber.trim()
      ? {
          question: `How do I contact ${ctx.businessName}?`,
          answer: `You can contact ${ctx.businessName} at ${ctx.phoneNumber}${ctx.website && ctx.website.trim() ? ' or online at ' + ctx.website : ''}.`,
        }
      : null,

  // ---- Website (requires ctx.website — return null otherwise) ----

  // 13: Does X have a website?
  (ctx) =>
    ctx.website && ctx.website.trim()
      ? {
          question: `Does ${ctx.businessName} have a website?`,
          answer: `Yes. ${ctx.businessName}'s website is ${ctx.website}.`,
        }
      : null,
];

/**
 * Build a list of AI-quotable Q&A pairs derived exclusively from BusinessContext.
 *
 * Returns at least 8 pairs for any valid BusinessContext (only businessName + businessType required).
 * Returns up to `count` pairs (default 10), clamped to the available pool size (14 max).
 *
 * Throws on structural errors (empty businessName or businessType) — handler catches and returns isError:true.
 * Pure function: no I/O, no network calls, no side effects.
 */
export function buildFaqContent(ctx: BusinessContext, count?: number): FaqPair[] {
  if (!ctx.businessName || ctx.businessName.trim().length === 0) {
    throw new Error('businessContext.businessName is required for FAQ content');
  }
  if (!ctx.businessType || ctx.businessType.trim().length === 0) {
    throw new Error('businessContext.businessType is required for FAQ content');
  }

  const available = TEMPLATES
    .map((t) => t(ctx))
    .filter((p): p is FaqPair => p !== null);

  // Cap at count if provided; else cap at 10. Never exceed available pool.
  const target = Math.min(count ?? 10, available.length);
  return available.slice(0, target);
}
