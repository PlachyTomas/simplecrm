/**
 * Sniff the header row of an uploaded CSV without parsing the body.
 *
 * Keeps the bundle dep-free (no papaparse) at the cost of a hand-rolled
 * single-line parser. Handles quoted cells (`"Name,with,comma"`) and
 * auto-detects `,` vs `;` vs tab delimiter from the first line.
 *
 * Only the headers are needed client-side — the mapping UI builds from
 * them and the backend re-parses the full file authoritatively on
 * /preview, so a sniff bug at worst shows the wrong header names in
 * the dropdown labels (the backend re-validates the mapping against
 * its own parse).
 */

const UTF8_BOM = "﻿";

export interface SniffResult {
  headers: string[];
  delimiter: string;
}

function detectDelimiter(line: string): string {
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Thrown with a stable machine-readable `message` (not user-facing text —
 * the rendering component maps it to a catalog key via `SNIFF_ERROR_KEY`).
 */
export class CsvSniffError extends Error {}

export async function sniffCsvHeaders(file: File): Promise<SniffResult> {
  // Read only the first ~8 KB so a 10 MB CSV still resolves instantly.
  const blob = file.slice(0, 8192);
  const text = await blob.text();
  const stripped = text.startsWith(UTF8_BOM) ? text.slice(1) : text;
  const newlineIdx = stripped.search(/\r?\n/);
  const firstLine = newlineIdx === -1 ? stripped : stripped.slice(0, newlineIdx);
  if (!firstLine.trim()) {
    throw new CsvSniffError("missing_header_row");
  }
  const delimiter = detectDelimiter(firstLine);
  const headers = parseLine(firstLine, delimiter).filter((h) => h.length > 0);
  if (headers.length === 0) {
    throw new CsvSniffError("empty_header_row");
  }
  return { headers, delimiter };
}
