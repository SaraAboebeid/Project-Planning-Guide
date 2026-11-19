/* CSV building-list import: read a CSV of addresses, match each to a building
   outline on the Poseidon map, so the buildings can be marked as Poseidon's.

   Matching, in order:
   1. the address equals one of a building's entrance addresses
      (same normalisation as tools/poseidon/build_poseidon_map.py),
   2. same without a trailing letter ("Kaprisgatan 56B" -> "Kaprisgatan 56"),
   3. geocode the address (backend /api/geocode) and take the outline that
      contains the point, or the nearest one within 40 m. */
import type { MapBuilding } from "./stock";

export interface ParsedCsv { header: string[]; rows: string[][]; delimiter: string }

/** RFC-4180-ish parser; detects ; , or tab (Swedish Excel saves with ;). */
export function parseCsv(text: string): ParsedCsv {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";
  const out: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim())) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) out.push(row);
  const [header = [], ...rows] = out;
  return { header: header.map((h) => h.trim()), rows, delimiter };
}

/** Which column holds the street address, and (optionally) a separate house number. */
export function guessColumns(header: string[]): { addr: number; num: number | null; hasHeader: boolean } {
  const h = header.map((x) => x.toLowerCase());
  const addr = h.findIndex((x) => /adress|address|gatuadress|street|gata/.test(x));
  const num = h.findIndex((x) => /^(nr|nummer|husnr|husnummer|number|no\.?|gatunummer)$/.test(x));
  if (addr >= 0) return { addr, num: num >= 0 && num !== addr ? num : null, hasHeader: true };
  // No recognisable header: if the first row already looks like an address, treat it as data.
  const looksLikeAddress = header.some((x) => /[a-zåäö]{3,}\s+\d+/i.test(x));
  return { addr: Math.max(0, header.findIndex((x) => /[a-zåäö]{3,}\s+\d+/i.test(x))), num: null, hasHeader: !looksLikeAddress };
}

export function norm(a: string | null | undefined): string {
  let s = (a ?? "").split(",")[0];                 // drop ", 418 30 Göteborg"
  s = s.trim().toLowerCase().replace(/[.\s]+$/, "").replace(/\s+/g, " ");
  s = s.replace(/(\d+)\s+([a-zåäö])$/, "$1$2");    // "8 c" -> "8c"
  return s;
}
const stripLetter = (a: string) => a.replace(/(\d+)[a-zåäö]$/, "$1");

export function buildIndex(buildings: MapBuilding[]) {
  const idx = new Map<string, MapBuilding[]>();
  for (const b of buildings) {
    const keys = new Set([norm(b.addr), ...String(b.addrs ?? "").split("|").map(norm)]);
    keys.delete("");
    for (const k of keys) {
      const l = idx.get(k);
      if (l) l.push(b); else idx.set(k, [b]);
    }
  }
  return idx;
}

function inside(lon: number, lat: number, poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[j];
    if ((y1 > lat) !== (y2 > lat) && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}
function distM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const k = Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot((lat2 - lat1) * 111320, (lon2 - lon1) * 111320 * k);
}
const centroid = (p: [number, number][]) =>
  [p.reduce((s, q) => s + q[1], 0) / p.length, p.reduce((s, q) => s + q[0], 0) / p.length] as const;

export function nearestOutline(buildings: MapBuilding[], lat: number, lon: number): MapBuilding | null {
  let best: MapBuilding | null = null, bestD = 40;
  for (const b of buildings) {
    const [la, lo] = centroid(b.poly);
    const d = distM(lat, lon, la, lo);
    if (d > 400) continue;
    if (inside(lon, lat, b.poly)) return b;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

export interface ImportRow { input: string; building: MapBuilding | null; how: "address" | "geocoded" | "not found" }

export async function matchAddresses(
  addresses: string[], buildings: MapBuilding[],
  onProgress: (done: number, total: number) => void, signal: { cancelled: boolean },
): Promise<ImportRow[]> {
  const idx = buildIndex(buildings);
  const out: ImportRow[] = [];
  const todo: number[] = [];
  addresses.forEach((a, i) => {
    const k = norm(a);
    const hit = idx.get(k) ?? idx.get(stripLetter(k));
    out[i] = { input: a, building: hit?.[0] ?? null, how: hit ? "address" : "not found" };
    if (!hit && k) todo.push(i);
  });
  let done = addresses.length - todo.length;
  onProgress(done, addresses.length);
  for (const i of todo) {
    if (signal.cancelled) break;
    try {
      const q = new URLSearchParams({ address: `${addresses[i].split(",")[0].trim()}, Göteborg`, country: "se" });
      const r = await fetch(`/api/geocode?${q}`);
      if (r.ok) {
        const g = await r.json() as { lat: number; lon: number };
        const b = nearestOutline(buildings, g.lat, g.lon);
        if (b) out[i] = { input: addresses[i], building: b, how: "geocoded" };
      }
    } catch { /* leave as not found */ }
    onProgress(++done, addresses.length);
    await new Promise((res) => setTimeout(res, 1100));   // Nominatim: max 1 request/s
  }
  return out;
}
