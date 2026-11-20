/* Read an uploaded table (CSV or Excel .xlsx) into header + rows of strings,
   in the browser. XLSX is a zip of XML files: the first worksheet and the
   shared-strings table are inflated with the built-in DecompressionStream, so
   no spreadsheet library is needed. Only cell values are read (no formulas,
   no formatting). */
import { parseCsv } from "./csvImport";

export interface Table { header: string[]; rows: string[][]; sheet?: string }

export async function readTable(file: File): Promise<Table> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files are not supported — save as .xlsx or .csv.");
  const t = parseCsv(await file.text());
  return { header: t.header, rows: t.rows };
}

/** Zip entries by name (central directory), inflated on demand. */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a valid .xlsx file");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = u8.slice(start, start + csize);
    if (method === 0) { out.set(name, dec.decode(data)); continue; }
    if (method !== 8) throw new Error("Unsupported compression in the .xlsx file");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    out.set(name, await new Response(stream).text());
  }
  return out;
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function readXlsx(buf: ArrayBuffer): Promise<Table> {
  const files = await unzip(buf, (n) => /^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml)$/.test(n));
  const parse = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  const shared: string[] = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) for (const si of Array.from(parse(ss).getElementsByTagName("si")))
    shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  const sheetName = files.get("xl/workbook.xml") ? parse(files.get("xl/workbook.xml")!).getElementsByTagName("sheet")[0]?.getAttribute("name") ?? undefined : undefined;
  const sheetFile = [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetFile) throw new Error("The .xlsx file has no worksheet");
  const rows: string[][] = [];
  for (const r of Array.from(parse(files.get(sheetFile)!).getElementsByTagName("row"))) {
    const row: string[] = [];
    for (const c of Array.from(r.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r");
      const i = ref ? colIndex(ref) : row.length;
      const type = c.getAttribute("t");
      let val = "";
      if (type === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
      else {
        const raw = c.getElementsByTagName("v")[0]?.textContent ?? "";
        val = type === "s" ? shared[Number(raw)] ?? "" : raw;
      }
      while (row.length < i) row.push("");
      row[i] = val;
    }
    if (row.some((x) => x.trim())) rows.push(row);
  }
  const [header = [], ...body] = rows;
  return { header: header.map((h) => h.trim()), rows: body, sheet: sheetName };
}

/** Guess which column is which catalogue field from the header names (EN/SV). */
export function guessMapping(header: string[]): Record<string, number | null> {
  const find = (re: RegExp) => { const i = header.findIndex((h) => re.test(h)); return i < 0 ? null : i; };
  return {
    id: find(/^(code|id|art(ikel)?(nr|\.? ?no)?|sku|item ?no|kod|nr)$/i),
    desc: find(/desc|beskriv|benämn|name|namn|product|produkt/i),
    unit: find(/^(unit|enhet|unit of measure)$/i),
    cost: find(/price|pris|cost|kostnad|sek|kr/i),
    u: find(/u[- ]?(value|värde)|^u$/i),
    co2: find(/co2|co₂|carbon|klimat|gwp/i),
    group: find(/group|grupp|category|kategori|type|typ/i),
    part: find(/wizard|part|byggdel/i),
  };
}
