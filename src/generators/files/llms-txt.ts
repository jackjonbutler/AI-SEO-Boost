// src/generators/files/llms-txt.ts
// Pure function that builds a spec-compliant llms.txt string from BusinessContext.
// No I/O — same input always produces same output. Side-effect-free.
// llmstxt.org spec: H1 (required), optional blockquote, optional H2 sections.

import type { BusinessContext } from '../../types/index.js';

/**
 * Build a spec-compliant llms.txt string from the given BusinessContext.
 *
 * Rules:
 * 1. Line 1: `# <businessName>` — the only required element.
 * 2. Optional blockquote `> <description>` — emitted only when description is non-empty.
 * 3. Optional H2 sections, emitted only when content is present, in order:
 *    Services → Locations → Contact.
 * 4. Empty sections are never emitted (no `## Services\n` with no bullets).
 * 5. No invented content — reads ctx fields only, no default strings for absent fields.
 * 6. Trailing blank lines are stripped; exactly one trailing newline (POSIX compliant).
 */
export function buildLlmsTxt(ctx: BusinessContext): string {
  const lines: string[] = [];

  lines.push(`# ${ctx.businessName}`);
  lines.push('');

  if (ctx.description && ctx.description.trim().length > 0) {
    lines.push(`> ${ctx.description.trim()}`);
    lines.push('');
  }

  if (ctx.services && ctx.services.length > 0) {
    lines.push('## Services');
    for (const s of ctx.services) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }

  if (ctx.location && ctx.location.trim().length > 0) {
    lines.push('## Locations');
    lines.push(`- ${ctx.location.trim()}`);
    lines.push('');
  }

  const contactLines: string[] = [];
  if (ctx.phoneNumber && ctx.phoneNumber.trim().length > 0) {
    contactLines.push(`- Phone: ${ctx.phoneNumber.trim()}`);
  }
  if (ctx.website && ctx.website.trim().length > 0) {
    contactLines.push(`- Website: ${ctx.website.trim()}`);
  }
  if (contactLines.length > 0) {
    lines.push('## Contact');
    lines.push(...contactLines);
    lines.push('');
  }

  // Trim trailing blank lines, append exactly one trailing newline for POSIX compliance.
  return lines.join('\n').trimEnd() + '\n';
}
