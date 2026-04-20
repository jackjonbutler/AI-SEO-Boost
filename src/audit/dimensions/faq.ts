// src/audit/dimensions/faq.ts
// Checks for FAQ content: FAQPage JSON-LD or question-style headings.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as cheerio from 'cheerio';
import { isUrl } from '../types.js';
import type { AuditFinding } from '../types.js';

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

export async function checkFaq(target: string): Promise<AuditFinding> {
  const dimension = 'faq' as const;
  try {
    const html = await getHtml(target);
    if (html === null) {
      return {
        dimension,
        status: 'warning',
        severity: 'medium',
        message: 'Could not retrieve HTML to check FAQ content',
      };
    }

    const $ = cheerio.load(html);

    // Check 1: FAQPage JSON-LD
    let hasFaqPage = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).text());
        const raw = parsed['@type'];
        const types = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
        if (types.includes('FAQPage')) {
          hasFaqPage = true;
        }
      } catch {
        // Skip malformed blocks
      }
    });

    if (hasFaqPage) {
      return { dimension, status: 'pass', severity: 'low', message: 'FAQPage JSON-LD detected' };
    }

    // Check 2: Heading heuristic — question-style headings
    const questionHeadings = $('h1, h2, h3, h4').filter((_, el) => $(el).text().includes('?')).length;
    if (questionHeadings >= 3) {
      return {
        dimension,
        status: 'warning',
        severity: 'medium',
        message: `Question-style headings found (${questionHeadings}) but no FAQPage JSON-LD`,
        suggestedToolCall: 'generate_faq_content',
      };
    }

    return {
      dimension,
      status: 'fail',
      severity: 'medium',
      message: 'No FAQ content detected',
      suggestedToolCall: 'generate_faq_content',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { dimension, status: 'warning', severity: 'medium', message: `Unexpected error checking FAQ content: ${msg}` };
  }
}
