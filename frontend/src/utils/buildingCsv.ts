/* Building-list CSV for Step 1: one row per building.

   Columns (names in English or Swedish, any order, case-insensitive):
     Address     street address or property designation   Adress, Gatuadress, Fastighet, Fastighetsbeteckning
     Postcode    optional, helps the geocoder               Postnummer
     City        optional, helps the geocoder               Ort, Stad, Kommun
     Lat, Lon    optional coordinates (WGS84) — when given, no address lookup is needed
                                                            Latitud, Longitud, Lng, Long
     Name        optional label / your own id               Namn, Id, Byggnad
   A file without a header row is read as one address per line.

   Saved from Excel the delimiter is often ";" with decimal commas (Swedish
   settings); "," and tab work too. Quoted fields ("Storgatan 1, Göteborg") are
   handled. Example: /examples/building_list_example.csv */

/** Read an uploaded text file whatever Excel saved it as. Swedish Excel's
 *  "CSV (semikolonavgränsad)" is Windows-1252, not UTF-8, so `file.text()`
 *  would turn "Göteborg" into "G�teborg" and the address would not match.
 *  UTF-16 (Excel "Unicode text") by its byte-order mark; else strict UTF-8,
 *  falling back to Windows-1252 when the bytes are not valid UTF-8. */
export async function readTextFile(file: Blob): Promise<string> {
  const b = new Uint8Array(await file.arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
  catch { return new TextDecoder("windows-1252").decode(b); }
}

export interface CsvBuildingRow {
  line: number;          // 1-based line in the file (for messages)
  address: string | null;
  postcode: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  name: string | null;
}

/** RFC 4180-style split with the given delimiter (quotes, doubled quotes, newlines in quotes). */
function splitCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const COLS: Record<keyof Omit<CsvBuildingRow, "line">, RegExp> = {
  address: /^(address|adress|gatuadress|street|street address|fastighet|fastighetsbeteckning|property|beteckning)$/,
  postcode: /^(postcode|post code|postal code|zip|postnummer|postnr)$/,
  city: /^(city|town|ort|stad|kommun|postort|municipality)$/,
  lat: /^(lat|latitude|latitud|y)$/,
  lon: /^(lon|lng|long|longitude|longitud|x)$/,
  name: /^(name|namn|id|building|byggnad|label|objekt|objektnummer)$/,
};

const num = (s: string | undefined, decimalComma: boolean): number | null => {
  if (s == null) return null;
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  const v = Number(decimalComma ? t.replace(",", ".") : t);
  return Number.isFinite(v) ? v : null;
};

export function parseBuildingCsv(text: string): { rows: CsvBuildingRow[]; columns: string[]; hasHeader: boolean } {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", "\t", ","].map((d) => [d, first.split(d).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const delim = best[1] > 0 ? best[0] : ",";
  const raw = splitCsv(text, delim).map((r) => r.map((c) => c.trim()));
  if (!raw.length) return { rows: [], columns: [], hasHeader: false };
  const head = raw[0].map((h) => h.toLowerCase().replace(/[_.]+/g, " ").trim());
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, head.findIndex((h) => re.test(h))])) as Record<keyof typeof COLS, number>;
  const hasHeader = Object.values(idx).some((i) => i >= 0);
  const decimalComma = delim === ";";
  if (!hasHeader) {
    // No header: one address (or "lat,lon") per line.
    return {
      rows: raw.map((cells, i) => ({ line: i + 1, address: cells.join(delim === "," ? ", " : " ").trim() || null, postcode: null, city: null, lat: null, lon: null, name: null })),
      columns: [], hasHeader: false,
    };
  }
  const cell = (r: string[], k: keyof typeof COLS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() || null : null);
  const rows = raw.slice(1).map((r, i) => {
    let lat = num(cell(r, "lat") ?? undefined, decimalComma), lon = num(cell(r, "lon") ?? undefined, decimalComma);
    // Swapped columns are a common mistake; in Sweden latitude (55–69) > longitude (10–25).
    if (lat != null && lon != null && Math.abs(lat) < Math.abs(lon)) [lat, lon] = [lon, lat];
    if (lat != null && (lat < -90 || lat > 90)) lat = null;
    if (lon != null && (lon < -180 || lon > 180)) lon = null;
    return { line: i + 2, address: cell(r, "address"), postcode: cell(r, "postcode"), city: cell(r, "city"), lat, lon, name: cell(r, "name") };
  }).filter((r) => r.address || (r.lat != null && r.lon != null));
  return { rows, columns: head, hasHeader: true };
}

/** "Storgatan 1, 411 01 Göteborg" — the text sent to the geocoder. */
export const geocodeQuery = (r: CsvBuildingRow) => [r.address, [r.postcode, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
