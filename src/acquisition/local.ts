// src/acquisition/local.ts
// Walks a local folder for .html files, strips chrome, converts to Markdown,
// and returns one AcquisitionResult per file.
//
// Node compat note: fs.promises.readdir({ recursive: true }) was added in Node 18.17.
// Do NOT combine recursive:true with withFileTypes:true — there is a Node 18.17-18.18
// bug where that combination drops entries silently. Use recursive:true alone, then
// filter by extension.

import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { stripChrome } from '../processing/strip.js';
import { convertToMarkdown } from '../processing/convert.js';
import type { AcquisitionResult, MarkdownDocument, AcquisitionError } from '../types/index.js';

export async function acquireLocal(folderPath: string): Promise<AcquisitionResult[]> {
  // recursive:true returns string[] of relative paths from folderPath root
  const entries = await fs.readdir(folderPath, { recursive: true });

  const htmlFiles = (entries as string[])
    .filter(e => e.endsWith('.html'))
    .map(e => path.join(folderPath, e));

  const results: AcquisitionResult[] = [];

  for (const filePath of htmlFiles) {
    const fileUrl = pathToFileURL(filePath).href;
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const { html, title, description } = stripChrome(raw, fileUrl);
      const markdown = convertToMarkdown(html);

      const doc: MarkdownDocument = {
        url: fileUrl,
        title,
        description,
        markdown,
        frontmatter: { title, url: fileUrl, description },
        source: 'local',
      };
      results.push(doc);
    } catch (err) {
      const error: AcquisitionError = {
        url: fileUrl,
        error: err instanceof Error ? err.message : String(err),
        source: 'local',
      };
      results.push(error);
    }
  }

  return results;
}
