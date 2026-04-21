// src/audit/dimensions/markdown.ts
// Checks whether a site exposes markdown mirror files.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isUrl, originFor } from '../types.js';
import type { AuditFinding, FrameworkDetection } from '../types.js';

function buildMarkdownPlacementNote(fw: FrameworkDetection | null | undefined): string {
  if (!fw || !fw.name) return '';
  switch (fw.name) {
    case 'Next.js':
    case 'Nuxt':
    case 'Astro':
      return ' For this framework: generate mirrors into /public/ and redeploy — each page becomes /public/<slug>/index.md.';
    case 'WordPress':
      return ' For WordPress: upload mirrors to your site root via FTP — /wp-content/ is not web-accessible for markdown files by default.';
    case 'Shopify':
      return ' For Shopify: markdown mirrors require a custom route or page template — direct file placement is not supported.';
    case 'Hugo':
    case 'Jekyll':
      return ' Place markdown mirrors in your content or static directory, rebuild, and deploy.';
    default:
      return '';
  }
}

export async function checkMarkdownMirrors(
  target: string,
  framework?: FrameworkDetection | null
): Promise<AuditFinding> {
  const dimension = 'markdown-mirrors' as const;
  try {
    if (isUrl(target)) {
      const mdUrl = `${originFor(target)}/index.md`;
      let res: Response;
      try {
        res = await fetch(mdUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return { dimension, status: 'warning', severity: 'medium', message: `Could not probe ${mdUrl}: ${msg}` };
      }
      if (res.status === 200) {
        return { dimension, status: 'pass', severity: 'low', message: 'Markdown mirror detected at /index.md' };
      }
      return {
        dimension,
        status: 'fail',
        severity: 'medium',
        message: `No markdown mirror found for home page.${buildMarkdownPlacementNote(framework)}`,
        suggestedToolCall: 'generate_markdown_mirrors',
      };
    }

    // Local folder: check for index.md or any *.md in root (one-level readdir, not recursive)
    try {
      const entries = await fs.readdir(target);
      const hasMd = entries.some(e => e.endsWith('.md'));
      if (hasMd) {
        return { dimension, status: 'pass', severity: 'low', message: 'Markdown mirror file(s) found in folder root' };
      }
      return {
        dimension,
        status: 'fail',
        severity: 'medium',
        message: `No markdown mirror files found in folder root.${buildMarkdownPlacementNote(framework)}`,
        suggestedToolCall: 'generate_markdown_mirrors',
      };
    } catch (readdirErr) {
      const msg = readdirErr instanceof Error ? readdirErr.message : String(readdirErr);
      return { dimension, status: 'warning', severity: 'medium', message: `Could not read folder for markdown check: ${msg}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { dimension, status: 'warning', severity: 'medium', message: `Unexpected error checking markdown mirrors: ${msg}` };
  }
}
