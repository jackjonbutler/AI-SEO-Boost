// src/audit/dimensions/schema.ts
// Checks whether a page's HTML contains JSON-LD schema markup.
// Type-aware: uses inferSchemaType() to match the expected @type against businessContext.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as cheerio from 'cheerio';
import { isUrl } from '../types.js';
import type { AuditFinding } from '../types.js';
import type { BusinessContext } from '../../types/index.js';
import { inferSchemaType, LOCAL_BUSINESS_SUBTYPES } from '../schema-type-map.js';

async function getHtml(target: string): Promise<string | null> {
  if (isUrl(target)) {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  // Local folder: try index.html first, then walk for first *.html
  const indexPath = path.join(target, 'index.html');
  try {
    return await fs.readFile(indexPath, 'utf-8');
  } catch {
    // Walk the directory for the first HTML file
    try {
      const entries = await fs.readdir(target, { recursive: true });
      const htmlFile = (entries as string[]).find(e => e.endsWith('.html'));
      if (htmlFile) {
        return await fs.readFile(path.join(target, htmlFile), 'utf-8');
      }
    } catch {
      // ignore
    }
    return null;
  }
}

function extractJsonLdTypes(html: string): string[] {
  const $ = cheerio.load(html);
  const types: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const raw = parsed['@type'];
      if (Array.isArray(raw)) {
        types.push(...raw.map(String));
      } else if (raw) {
        types.push(String(raw));
      }
    } catch {
      // Skip malformed JSON-LD blocks
    }
  });
  return types;
}

export async function checkSchemaMarkup(
  target: string,
  businessContext?: BusinessContext | null
): Promise<AuditFinding> {
  const dimension = 'schema' as const;
  try {
    const html = await getHtml(target);
    if (html === null) {
      return {
        dimension,
        status: 'warning',
        severity: 'medium',
        message: 'Could not retrieve HTML to check schema markup',
      };
    }

    const types = extractJsonLdTypes(html);
    const expectedType = inferSchemaType(businessContext?.businessType);

    // No JSON-LD at all — always fail
    if (types.length === 0) {
      return {
        dimension,
        status: 'fail',
        severity: 'high',
        message: 'No JSON-LD schema markup detected',
        suggestedToolCall: 'generate_schema_markup',
        suggestedToolCallArgs: { recommendedType: expectedType },
      };
    }

    // SCH-02: No businessContext provided — any @type present = pass
    if (!businessContext) {
      return {
        dimension,
        status: 'pass',
        severity: 'low',
        message: `Schema markup found: ${types.join(', ')}`,
      };
    }

    // SCH-01: businessContext provided — check for expected type or accepted parent
    const hasExpectedType = types.some(t => t === expectedType);
    // Accept a LocalBusiness subtype if the expected type IS a LocalBusiness subtype
    // (e.g. user says 'restaurant', expectedType='Restaurant', page has 'LocalBusiness' — acceptable parent)
    // Also accept exact match for LocalBusiness subtypes listed page-side
    // For SoftwareApplication / OnlineStore (NOT LocalBusiness subtypes):
    // only exact match passes — LocalBusiness does NOT satisfy these
    const hasLocalBusinessParent =
      LOCAL_BUSINESS_SUBTYPES.has(expectedType) && types.some(t => t === 'LocalBusiness');
    const passes = hasExpectedType || hasLocalBusinessParent;

    if (passes) {
      return {
        dimension,
        status: 'pass',
        severity: 'low',
        message: `Schema markup found: ${types.join(', ')}`,
      };
    }

    // Type present but not the expected type — warning
    return {
      dimension,
      status: 'warning',
      severity: 'medium',
      message: `Schema markup present but expected ${expectedType} not found. Found: ${types.join(', ')}`,
      suggestedToolCall: 'generate_schema_markup',
      suggestedToolCallArgs: { recommendedType: expectedType },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { dimension, status: 'warning', severity: 'medium', message: `Unexpected error checking schema markup: ${msg}` };
  }
}
