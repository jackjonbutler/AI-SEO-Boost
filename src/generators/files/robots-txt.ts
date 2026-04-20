// src/generators/files/robots-txt.ts
// Append-only robots.txt patcher that adds AI crawler allow-rules and an optional
// Sitemap directive without ever removing or reordering existing content.

import { readFile, writeFile } from 'node:fs/promises';

export const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'] as const;

function botAlreadyPresent(content: string, botName: string): boolean {
  // Case-insensitive per robots.txt spec; multiline anchors so it only matches the full User-agent line.
  return new RegExp(`^\\s*user-agent:\\s*${botName}\\s*$`, 'im').test(content);
}

function sitemapAlreadyPresent(content: string, sitemapUrl: string): boolean {
  // Case-insensitive substring is sufficient — Sitemap values are URLs (conventionally ASCII).
  return content.toLowerCase().includes(`sitemap: ${sitemapUrl.toLowerCase()}`);
}

export async function patchRobotsTxt(
  robotsPath: string,
  sitemapUrl?: string,
): Promise<{ botsAdded: string[]; sitemapAdded: boolean }> {
  let content = '';
  try {
    content = await readFile(robotsPath, 'utf-8');
  } catch (err) {
    // ENOENT => start with empty content. Any other error (EACCES, EISDIR) => rethrow.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }

  const additions: string[] = [];
  const botsAdded: string[] = [];

  for (const bot of AI_BOTS) {
    if (!botAlreadyPresent(content, bot)) {
      additions.push(`\nUser-agent: ${bot}\nAllow: /`);
      botsAdded.push(bot);
    }
  }

  let sitemapAdded = false;
  if (sitemapUrl && sitemapUrl.trim().length > 0 && !sitemapAlreadyPresent(content, sitemapUrl.trim())) {
    additions.push(`\nSitemap: ${sitemapUrl.trim()}`);
    sitemapAdded = true;
  }

  if (additions.length === 0) {
    // Idempotent no-op — file is already compliant. Do NOT rewrite the file.
    return { botsAdded: [], sitemapAdded: false };
  }

  const newContent = (content.trimEnd() + '\n' + additions.join('\n') + '\n').replace(/^\n+/, '');
  await writeFile(robotsPath, newContent, 'utf-8');

  return { botsAdded, sitemapAdded };
}
