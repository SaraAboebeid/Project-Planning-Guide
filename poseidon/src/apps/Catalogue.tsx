/* The catalogue window: Wikells Sektionsdata in two sections (Renovation
   planning / New buildings) plus the user's own layer — edit any value, add
   rows and columns — and other catalogues: uploaded files (CSV / Excel) and
   supplier catalogues fetched through an API with the user's key.
   Items the Renovation Wizard can use as a measure are marked in every table;
   edited prices / U-values reach the Wizard straight away (catalogue.ts). */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, locale } from "../i18n";
import { MEASURE_BY_CODE, MEASURE_COMPONENTS, partOfGroup, recommendedMeasure } from "../catalogue";
import { BBR_RENOVATION_U } from "../planner/serviceLifeSE";
import { SEKTIONSDATA, indexItems, type SdChapter, type SdItem } from "../sektionsdata";
import {
  addColumn, addRow, autoSyncStale, cellValue, deleteSource, EDITABLE, isEdited, loadCatalogueState, removeColumn, removeRow,
  saveConnector, setCell, syncConnector, uploadCatalogue, useCatalogueState, type Connector, type Part, type Source,
} from "../catalogueStore";
import { guessMapping, readTable, type Table } from "../readTable";

const fmt = (v: number | null | undefined, d = 0) =>
  v == null ? "–" : new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const matches = (q: string, ...parts: (string | null | undefined)[]) => !q || parts.join(" ").toLowerCase().includes(q.toLowerCase());
const asNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const SD = SEKTIONSDATA;
const SD_INDEX = indexItems(SD);
const RENO_CHAPTERS = SD.chapters.filter((c) => (SD.renovation_chapters ?? []).includes(c.no));
const NEW_CHAPTERS = SD.chapters.filter((c) => !(SD.renovation_chapters ?? []).includes(c.no));

/** One table row, whatever catalogue it comes from, with the user's edits applied. */
interface CRow {
  uid: string; code: string; desc: string; unit: string;
  cost: number | null; u: number | null; co2: number | null;
  tech?: string | null; extra?: Record<string, string>; added?: boolean; group?: string;
  head?: string;
}
function withEdits(uid: string, code: string, base: { desc: string; unit: string; cost: number | null; u: number | null; co2: number | null }): CRow {
  return {
    uid, code,
    desc: String(cellValue(uid, "desc", base.desc) ?? ""), unit: String(cellValue(uid, "unit", base.unit) ?? ""),
    cost: asNum(cellValue(uid, "cost", base.cost)), u: asNum(cellValue(uid, "u", base.u)), co2: asNum(cellValue(uid, "co2", base.co2)),
  };
}
const sdRow = (i: SdItem): CRow => ({ ...withEdits(i.id, i.id, i), tech: i.tech });

/** Rows for chapters: a heading per sub-chapter, its Wikells items, then the user's added rows. */
function chapterRows(chapters: SdChapter[], q: string, added: ReturnType<typeof useCatalogueState>["edits"]["added"]) {
  const rows: CRow[] = [];
  let count = 0;
  for (const c of chapters) for (const g of c.groups) {
    const items = [
      ...g.items.map(sdRow),
      ...added.filter((r) => r.chapter === c.no && r.group === g.name).map((r) => ({ ...withEdits(r.uid, r.id, r), added: true })),
    ].filter((r) => matches(q, r.code, r.desc, g.name, r.tech));
    if (!items.length) continue;
    rows.push({ uid: `h:${c.no}:${g.name}`, code: "", desc: "", unit: "", cost: null, u: null, co2: null, head: `${c.no} · ${g.name || c.name}` });
    rows.push(...items);
    count += items.length;
  }
  return { rows, count };
}

/* ── window ─────────────────────────────────────────────────────────────── */
type Section = "reno" | "new" | "suppliers";
type DialogKind = null | { kind: "row" } | { kind: "column" } | { kind: "upload" } | { kind: "connect"; source?: Source };

export function CatalogueWindow() {
  const [, t] = useLang();
  const st = useCatalogueState();
  const [section, setSection] = useState<Section>("reno");
  const [edit, setEdit] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [renoPick, setRenoPick] = useState("ch:7");
  const [newPick, setNewPick] = useState("all");
  const [srcPick, setSrcPick] = useState<string | null>(null);
  useEffect(() => { void loadCatalogueState().then(() => autoSyncStale()); }, []);

  /** Chapter the "Add row" dialog starts in: the one on screen. */
  const currentChapter = section === "reno" && renoPick.startsWith("ch:") ? Number(renoPick.slice(3))
    : section === "new" && newPick !== "all" ? Number(newPick) : 7;

  return (
    <>
      <div className="row" style={{ padding: "4px 4px 0", gap: 4, flexWrap: "wrap" }} role="toolbar">
        <button className={`btn${edit ? " pressed" : ""}`} aria-pressed={edit} onClick={() => setEdit((e) => !e)}
          title={t("Edit values in the tables; your values replace the catalogue's and reach the Wizard")}>✎ {t(edit ? "Editing" : "Edit")}</button>
        <button className="btn" onClick={() => setDialog({ kind: "row" })}>{t("Add row…")}</button>
        <button className="btn" onClick={() => setDialog({ kind: "column" })}>{t("Add column…")}</button>
        <span className="task-sep" style={{ height: 20 }} />
        <button className="btn" onClick={() => setDialog({ kind: "upload" })}>{t("Upload catalogue…")}</button>
        <button className="btn" onClick={() => setDialog({ kind: "connect" })}>{t("Connect supplier API…")}</button>
        <span className="grow" />
        {st.error && <span className="small" style={{ color: "#a00000" }}>{st.error}</span>}
      </div>
      <div className="tabs" role="tablist" style={{ marginTop: 4 }}>
        {([["reno", "Renovation planning"], ["new", "New buildings"], ["suppliers", "Supplier catalogues"]] as [Section, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={section === k} className={`tab${section === k ? " on" : ""}`} onClick={() => setSection(k)}>
            {t(label)}{k === "suppliers" && st.sources.length ? ` (${st.sources.length})` : ""}
          </button>
        ))}
      </div>
      <div className="tab-panel" style={{ padding: 4, display: "flex", flexDirection: "column", gap: 4 }}>
        {section === "reno" && <SdSection chapters={RENO_CHAPTERS} pick={renoPick} setPick={setRenoPick} edit={edit} withGroups />}
        {section === "new" && <SdSection chapters={NEW_CHAPTERS} pick={newPick} setPick={setNewPick} edit={edit} withAll />}
        {section === "suppliers" && <SupplierSection pick={srcPick} setPick={setSrcPick} edit={edit}
          onUpload={() => setDialog({ kind: "upload" })} onConnect={(s) => setDialog({ kind: "connect", source: s })} />}
      </div>
      {dialog?.kind === "row" && <AddRowDialog chapter={currentChapter} onClose={() => setDialog(null)} />}
      {dialog?.kind === "column" && <AddColumnDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "upload" && <UploadDialog onClose={(id) => { setDialog(null); if (id) { setSection("suppliers"); setSrcPick(id); } }} />}
      {dialog?.kind === "connect" && <ConnectDialog source={dialog.source} onClose={(id) => { setDialog(null); if (id) { setSection("suppliers"); setSrcPick(id); } }} />}
    </>
  );
}

/** Left-hand chooser list (a sunken list box). */
function PickList({ items, value, onPick }: { items: { key: string; label: string; n?: number; head?: boolean }[]; value: string | null; onPick: (k: string) => void }) {
  return (
    <div className="sunken-panel" style={{ width: 250, flexShrink: 0, overflow: "auto", background: "#fff" }} role="listbox">
      {items.map((i) => i.head
        ? <div key={i.key} className="small" style={{ padding: "6px 6px 2px", fontWeight: "bold", color: "#444" }}>{i.label}</div>
        : <div key={i.key} role="option" aria-selected={value === i.key} onClick={() => onPick(i.key)}
            style={{ padding: "2px 6px 2px 12px", cursor: "default", background: value === i.key ? "var(--brand, #00707a)" : undefined, color: value === i.key ? "#fff" : undefined }}>
            {i.label}{i.n != null ? <span style={{ opacity: 0.7 }}> ({i.n})</span> : null}
          </div>)}
    </div>
  );
}

function WizardKey() {
  const [, t] = useLang();
  return <div className="hint small">
    {t("Wizard column: items the Renovation Wizard offers as a measure (they have a U-value and a price per m²). Green U = meets the BBR renovation target. ★ = the Wizard's suggestion: the cheapest item that meets the target.")}{" "}
    {MEASURE_COMPONENTS.map((c) => `${t(c)} ${BBR_RENOVATION_U[c] ?? "–"}`).join(" · ")} W/m²K.
  </div>;
}

/** Renovation planning / New buildings: chapter list + table. */
function SdSection({ chapters, pick, setPick, edit, withGroups, withAll }: {
  chapters: SdChapter[]; pick: string; setPick: (k: string) => void; edit: boolean; withGroups?: boolean; withAll?: boolean;
}) {
  const [, t] = useLang();
  const st = useCatalogueState();
  const [q, setQ] = useState("");
  const nAdded = (no: number) => st.edits.added.filter((r) => r.chapter === no).length;
  const list = [
    ...(withAll ? [{ key: "all", label: t("All chapters (search)") }] : []),
    ...(withGroups ? [{ key: "h:ch", label: t("Building parts"), head: true }] : []),
    ...chapters.map((c) => ({ key: `ch:${c.no}`, label: `${c.no} · ${t(c.name)}`, n: c.groups.reduce((s, g) => s + g.items.length, 0) + nAdded(c.no) })),
    ...(withGroups ? [{ key: "h:sd", label: t("Other renovation works"), head: true },
      ...SD.renovation.map((p) => ({ key: `sd:${p.part}`, label: t(p.part), n: p.ids.length }))] : []),
  ];
  const key = withAll && pick !== "all" && !pick.startsWith("ch:") ? `ch:${pick}` : pick;

  let body: ReactNode, count = 0;
  if (key.startsWith("sd:")) {
    const part = SD.renovation.find((p) => `sd:${p.part}` === key);
    const rows = (part?.ids ?? []).map((id) => SD_INDEX.get(id)!).filter(Boolean)
      .map((e) => ({ ...sdRow(e.item), group: t(e.group.name || e.chapter.name) }))
      .filter((r) => matches(q, r.code, r.desc, r.group, r.tech));
    count = rows.length;
    body = <>
      <div className="hint small">{t(part?.note ?? "")} {t("Prices from Wikells Sektionsdata: complete new parts incl. overheads, excl. VAT.")}</div>
      <ItemTable rows={rows} edit={edit} showGroupCol showTech={false} />
    </>;
  } else {
    const sel = key === "all" ? chapters : chapters.filter((c) => `ch:${c.no}` === key);
    const r = chapterRows(sel, q, st.edits.added);
    count = r.count;
    body = <>
      <div className="hint small">{withGroups
        ? t("Complete new parts from Wikells Sektionsdata, incl. overheads, excl. VAT. Removal of the existing part is not included, and Sektionsdata has no add-on layers (e.g. extra insulation on an existing wall), so adding insulation usually costs less than these prices.")
        : t("Wikells Sektionsdata, the complete component database for new construction. Section cost per unit incl. overheads, excl. VAT and waste; labour {rate} SEK/h. kg CO₂e = A1–A3 from weight × typical factor; – = not given (e.g. subcontract-only items).", { rate: SD.settings["Labour rate (SEK/h)"] ?? "–" })}</div>
      <ItemTable rows={r.rows} edit={edit} />
    </>;
  }
  return (
    <>
      <div className="row" style={{ gap: 4, flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <PickList items={list} value={key} onPick={(k) => setPick(withAll && k.startsWith("ch:") ? k.slice(3) : k)} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="row"><WizardKey /><span className="grow" /><input className="field" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search…")} /></div>
          {body}
        </div>
      </div>
      <div className="status-bar"><div>{count} {t("objects")}</div><div className="grow small" style={{ textAlign: "right" }}>{SD.source.split(".")[0]}</div></div>
    </>
  );
}

/** An editable cell: shows the value; in edit mode a field that saves on Enter / leaving it. */
function Cell({ uid, field, value, edit, num, d = 0, title }: { uid: string; field: string; value: string | number | null; edit: boolean; num?: boolean; d?: number; title?: string }) {
  const edited = isEdited(uid, field);
  const shown = num ? fmt(value as number | null, d) : (value ?? "");
  if (!edit) return <span className={edited ? "cat-edited" : undefined} title={edited ? title : undefined}>{shown}</span>;
  // What the field starts with; leaving it unchanged must not create an edit.
  const start = value == null ? "" : num && typeof value === "number" ? String(Math.round(value * 100) / 100) : String(value);
  return <input className={`field cell-input${edited ? " cat-edited" : ""}`} defaultValue={start} key={`${uid}:${field}:${start}`}
    style={{ width: num ? 70 : "100%", textAlign: num ? "right" : "left" }} title={title}
    onBlur={(e) => { if (e.target.value !== start) setCell(uid, field, e.target.value); }}
    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { (e.target as HTMLInputElement).value = start; (e.target as HTMLInputElement).blur(); } }} />;
}

const RECOMMENDED = () => new Set(MEASURE_COMPONENTS.map((c) => recommendedMeasure(c)?.code).filter(Boolean));

/** Items of any catalogue: Wizard use, price, unit, U, carbon, the user's columns, extra/technical columns. */
function ItemTable({ rows, edit, showGroupCol, showTech = true, extraCols = [] }: { rows: CRow[]; edit: boolean; showGroupCol?: boolean; showTech?: boolean; extraCols?: string[] }) {
  const [, t] = useLang();
  const st = useCatalogueState();
  const cols = st.edits.columns;
  const rec = useMemo(RECOMMENDED, [st.version]);
  const base = (uid: string, field: string) => {
    const i = SD_INDEX.get(uid)?.item as unknown as Record<string, unknown> | undefined;
    return i ? `${t("Catalogue value")}: ${i[field] ?? "–"}` : undefined;
  };
  const n = 7 + (showGroupCol ? 1 : 0) + cols.length + extraCols.length + (showTech ? 1 : 0) + (edit ? 1 : 0);
  return (
    <div className="sunken-panel" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 0 }}>
      <table className="list sheet">
        <thead><tr>
          <th>{t("Code")}</th><th>{t("Wizard")}</th>{showGroupCol && <th>{t("Type")}</th>}<th>{t("Description")}</th>
          <th className="num">{t("Price (SEK)")}</th><th>{t("Unit")}</th><th className="num">{t("U-value (W/m²K)")}</th>
          <th className="num" title={t("A1–A3, from weight × typical factor (Wikells)")}>kg CO₂e</th>
          {cols.map((c) => <th key={c.key}>{c.label}{edit && <button className="btn mini" title={t("Remove column")} style={{ marginLeft: 4 }}
            onClick={() => { if (confirm(t("Remove the column \"{c}\" and its values?", { c: c.label }))) removeColumn(c.key); }}>×</button>}</th>)}
          {extraCols.map((c) => <th key={`x:${c}`}>{c}</th>)}
          {showTech && <th>{t("Technical values")}</th>}
          {edit && <th />}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            if (r.head) return <tr key={r.uid}><td colSpan={n} style={{ background: "var(--face)", fontWeight: "bold" }}>{r.head}</td></tr>;
            const m = MEASURE_BY_CODE.get(r.uid);
            return <tr key={r.uid} title={r.tech ?? undefined}>
              <td>{r.added ? <span title={t("Added by you")}>＋ </span> : null}{r.code}</td>
              <td title={m ? `${fmt(m.costPerM2)} SEK/m²` : undefined}>{m ? `${rec.has(m.code) ? "★ " : ""}${t(m.component)}` : ""}</td>
              {showGroupCol && <td>{r.group}</td>}
              <td style={{ whiteSpace: "normal", minWidth: 260 }}><Cell uid={r.uid} field="desc" value={r.desc} edit={edit} title={base(r.uid, "desc")} /></td>
              <td className="num"><Cell uid={r.uid} field="cost" value={r.cost} edit={edit} num title={base(r.uid, "cost")} /></td>
              <td><Cell uid={r.uid} field="unit" value={r.unit.replace(/^SEK\//, "")} edit={edit} title={base(r.uid, "unit")} /></td>
              <td className="num" style={m?.meetsBbr && !edit ? { color: "var(--good)", fontWeight: "bold" } : undefined}><Cell uid={r.uid} field="u" value={r.u} edit={edit} num d={2} title={base(r.uid, "u")} /></td>
              <td className="num"><Cell uid={r.uid} field="co2" value={r.co2} edit={edit} num d={1} title={base(r.uid, "co2")} /></td>
              {cols.map((c) => <td key={c.key}><Cell uid={r.uid} field={c.key} value={(cellValue(r.uid, c.key, null) as string | number | null) ?? null} edit={edit} /></td>)}
              {extraCols.map((c) => <td key={`x:${c}`} className="small">{r.extra?.[c] ?? ""}</td>)}
              {showTech && <td className="small" style={{ whiteSpace: "normal", minWidth: 200, maxWidth: 280 }}>{r.tech}</td>}
              {edit && <td>{r.added
                ? <button className="btn mini" title={t("Delete row")} onClick={() => { if (confirm(t("Delete the row \"{c}\"?", { c: r.code }))) removeRow(r.uid); }}>×</button>
                : EDITABLE.some((f) => isEdited(r.uid, f)) ? <button className="btn mini" title={t("Undo my changes on this row")}
                    onClick={() => EDITABLE.forEach((f) => isEdited(r.uid, f) && setCell(r.uid, f, ""))}>↺</button> : null}</td>}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── supplier catalogues ───────────────────────────────────────────────── */
function SupplierSection({ pick, setPick, edit, onUpload, onConnect }: {
  pick: string | null; setPick: (k: string) => void; edit: boolean; onUpload: () => void; onConnect: (s?: Source) => void;
}) {
  const [, t] = useLang();
  const st = useCatalogueState();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const src = st.sources.find((s) => s.id === pick) ?? st.sources[0] ?? null;
  const list = [
    { key: "h:up", label: t("Uploaded catalogues"), head: true },
    ...st.sources.filter((s) => s.kind === "upload").map((s) => ({ key: s.id, label: s.name, n: s.items.length })),
    { key: "h:api", label: t("Supplier connections (API)"), head: true },
    ...st.sources.filter((s) => s.kind === "api").map((s) => ({ key: s.id, label: s.name, n: s.items.length })),
  ];
  if (!st.sources.length) return (
    <div style={{ padding: 16, lineHeight: 1.6 }}>
      <p>{t("No other catalogues yet. Upload a supplier's price list (CSV or Excel), or connect a supplier's API with your key so its catalogue is fetched automatically.")}</p>
      <div className="row"><button className="btn" onClick={onUpload}>{t("Upload catalogue…")}</button><button className="btn" onClick={() => onConnect()}>{t("Connect supplier API…")}</button></div>
    </div>
  );
  const rows: CRow[] = (src?.items ?? []).map((i) => ({
    ...withEdits(`${src!.id}:${i.id}`, i.id, { desc: i.desc, unit: i.unit ?? "", cost: i.cost ?? null, u: i.u ?? null, co2: i.co2 ?? null }),
    group: [i.group, i.part ? `→ ${t(i.part)}` : ""].filter(Boolean).join(" "), extra: i.extra,
  })).filter((r) => matches(q, r.code, r.desc, r.group, ...Object.values(r.extra ?? {})));
  const c: Connector | undefined = src?.connector;
  const sync = async () => {
    if (!src) return;
    setBusy(true); setMsg(null);
    try { const s = await syncConnector(src.id); setMsg(t("Synced: {n} items", { n: s.items.length })); }
    catch (e) { setMsg(`${t("Sync failed")}: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="row" style={{ gap: 4, flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <PickList items={list} value={src?.id ?? null} onPick={setPick} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {src && <div className="row" style={{ flexWrap: "wrap" }}>
            <b>{src.name}</b>
            <span className="small">{src.kind === "api"
              ? `${c?.url ?? ""} · ${t("key")} ${c?.key_hint ?? t("none")} · ${t("last sync")}: ${c?.last_sync ? new Date(c.last_sync).toLocaleString(locale()) : t("never")}`
              : `${t("uploaded")} ${new Date(src.updated_at).toLocaleString(locale())}`}</span>
            <span className="grow" />
            {src.kind === "api" && <><button className="btn" disabled={busy} onClick={sync}>{busy ? t("Syncing…") : t("Sync now")}</button>
              <button className="btn" onClick={() => onConnect(src)}>{t("Edit connection…")}</button></>}
            <button className="btn" onClick={async () => { if (confirm(t("Delete the catalogue \"{c}\"?", { c: src.name }))) { await deleteSource(src.id); } }}>{t("Delete")}</button>
            <input className="field" style={{ width: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search…")} />
          </div>}
          {(msg || c?.last_error) && <div className="hint small" style={c?.last_error && !msg?.startsWith(t("Synced")) ? { color: "#a00000" } : undefined}>{msg ?? `${t("Last sync failed")}: ${c?.last_error}`}</div>}
          <div className="hint small">{t("Items with a U-value, a price per m² (or per window with its size, e.g. 12x12) and a Wizard part (Walls / Windows / Roof / Floor) become measures in the Renovation Wizard.")}</div>
          <ItemTable rows={rows} edit={edit} showGroupCol showTech={false} extraCols={src?.columns ?? []} />
        </div>
      </div>
      <div className="status-bar"><div>{rows.length} {t("objects")}</div></div>
    </>
  );
}

/* ── dialogs ───────────────────────────────────────────────────────────── */
function Dialog({ title, onClose, children, buttons, width = 460 }: { title: string; onClose: () => void; children: ReactNode; buttons: ReactNode; width?: number }) {
  const [, t] = useLang();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal-shade">
      <div className="window active cat-dialog" role="dialog" aria-modal="true" aria-label={title}
        style={{ left: "50%", top: "45%", transform: "translate(-50%,-50%)", width, minHeight: 0, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="title-bar"><span className="title">{title}</span>
          <div className="title-btns"><button className="title-btn close" aria-label={t("Close")} onClick={onClose}>×</button></div>
        </div>
        <div style={{ padding: 10, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
        <div className="msgbox-btns">{buttons}</div>
      </div>
    </div>
  );
}
const Field = ({ label, children }: { label: string; children: ReactNode }) =>
  <label className="row" style={{ gap: 6 }}><span style={{ width: 150, flexShrink: 0 }}>{label}</span>{children}</label>;

function AddRowDialog({ chapter, onClose }: { chapter: number; onClose: () => void }) {
  const [, t] = useLang();
  const st = useCatalogueState();
  const [ch, setCh] = useState(chapter);
  const chap = SD.chapters.find((c) => c.no === ch) ?? SD.chapters[0];
  const [group, setGroup] = useState(chap.groups[0]?.name ?? "");
  const nextCode = () => {
    const used = new Set([...chap.groups.flatMap((g) => g.items.map((i) => i.id)), ...st.edits.added.map((r) => r.id)]);
    for (let n = 901; n < 1000; n++) if (!used.has(`${ch}.${n}`)) return `${ch}.${n}`;
    return `${ch}.x`;
  };
  const [f, setF] = useState({ id: "", desc: "", unit: "m²", cost: "", u: "", co2: "" });
  useEffect(() => { setGroup(chap.groups[0]?.name ?? ""); setF((x) => ({ ...x, id: nextCode() })); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ch]);
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\s/g, "").replace(",", ".")));
  const bad = !f.desc.trim() || [f.cost, f.u, f.co2].some((s) => s.trim() !== "" && !Number.isFinite(n(s)));
  const part = partOfGroup(ch, group);
  const save = () => { addRow({ id: f.id.trim() || nextCode(), chapter: ch, group, desc: f.desc.trim(), unit: f.unit.trim(), cost: n(f.cost), u: n(f.u), co2: n(f.co2) }); onClose(); };
  return (
    <Dialog title={t("Add row")} onClose={onClose} buttons={<>
      <button className="btn default" disabled={bad} onClick={save}>{t("Add")}</button><button className="btn" onClick={onClose}>{t("Cancel")}</button></>}>
      <Field label={t("Chapter")}><select className="field grow" value={ch} onChange={(e) => setCh(Number(e.target.value))}>
        {SD.chapters.map((c) => <option key={c.no} value={c.no}>{c.no} · {t(c.name)}</option>)}</select></Field>
      <Field label={t("Sub-chapter")}><select className="field grow" value={group} onChange={(e) => setGroup(e.target.value)}>
        {chap.groups.map((g) => <option key={g.name} value={g.name}>{g.name || t(chap.name)}</option>)}</select></Field>
      <Field label={t("Code")}><input className="field grow" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} /></Field>
      <Field label={t("Description")}><input className="field grow" autoFocus value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
      <Field label={t("Unit")}><select className="field grow" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
        {["m²", "pcs", "m", "m³", "kg"].map((u) => <option key={u}>{u}</option>)}</select></Field>
      <Field label={t("Price (SEK)")}><input className="field grow" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
      <Field label={t("U-value (W/m²K)")}><input className="field grow" inputMode="decimal" value={f.u} onChange={(e) => setF({ ...f, u: e.target.value })} /></Field>
      <Field label="kg CO₂e"><input className="field grow" inputMode="decimal" value={f.co2} onChange={(e) => setF({ ...f, co2: e.target.value })} /></Field>
      <div className="hint small">{part
        ? t("This sub-chapter supplies the Wizard's {p} measures: with a U-value and a price per m² (or per window with its size, e.g. 12x12) the row becomes a measure.", { p: t(part) })
        : t("This sub-chapter is not used by the Wizard; the row is listed in the catalogue only.")}</div>
    </Dialog>
  );
}

function AddColumnDialog({ onClose }: { onClose: () => void }) {
  const [, t] = useLang();
  const [label, setLabel] = useState("");
  return (
    <Dialog title={t("Add column")} onClose={onClose} width={380} buttons={<>
      <button className="btn default" disabled={!label.trim()} onClick={() => { addColumn(label); onClose(); }}>{t("Add")}</button>
      <button className="btn" onClick={onClose}>{t("Cancel")}</button></>}>
      <Field label={t("Column name")}><input className="field grow" autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) { addColumn(label); onClose(); } }} placeholder={t("e.g. Supplier, Lead time, Note")} /></Field>
      <div className="hint small">{t("The column appears in every catalogue table. Turn on ✎ Edit to fill in values.")}</div>
    </Dialog>
  );
}

const MAP_FIELDS: [string, string][] = [
  ["id", "Code"], ["desc", "Description"], ["unit", "Unit"], ["cost", "Price (SEK)"], ["u", "U-value (W/m²K)"], ["co2", "kg CO₂e"],
  ["group", "Group / type"], ["part", "Wizard part"],
];
const PART_WORDS: [Part, RegExp][] = [["Walls", /wall|vägg/i], ["Windows", /window|fönster/i], ["Roof", /roof|tak|attic|vind/i], ["Floor", /floor|golv|slab|platta|bjälklag/i]];
const toPart = (s: string): Part | null => PART_WORDS.find(([, re]) => re.test(s))?.[0] ?? null;

function UploadDialog({ onClose }: { onClose: (id?: string) => void }) {
  const [, t] = useLang();
  const [table, setTable] = useState<Table | null>(null);
  const [name, setName] = useState("");
  const [map, setMap] = useState<Record<string, number | null>>({});
  const [fixedPart, setFixedPart] = useState<Part | "">("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    try {
      const tb = await readTable(file);
      if (!tb.header.length || !tb.rows.length) throw new Error(t("The file has no rows"));
      setTable(tb); setMap(guessMapping(tb.header)); setName(file.name.replace(/\.(csv|txt|xlsx)$/i, ""));
    } catch (e) { setErr((e as Error).message); }
  };
  const items = useMemo(() => (table?.rows ?? []).map((r) => {
    const it: Record<string, unknown> = {};
    for (const [f] of MAP_FIELDS) { const i = map[f]; if (i != null) it[f] = r[i] ?? ""; }
    it.part = fixedPart || (typeof it.part === "string" ? toPart(it.part) : null);
    table!.header.forEach((h, i) => { if (!Object.values(map).includes(i) && r[i]) it[h || `col${i + 1}`] = r[i]; });
    return it;
  }), [table, map, fixedPart]);
  const save = async () => {
    setBusy(true); setErr(null);
    try { const s = await uploadCatalogue(name.trim(), items, []); onClose(s.id); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Dialog title={t("Upload catalogue")} onClose={() => onClose()} width={620} buttons={<>
      <button className="btn default" disabled={!table || map.desc == null || !name.trim() || busy} onClick={save}>{busy ? t("Saving…") : t("Upload")}</button>
      <button className="btn" onClick={() => onClose()}>{t("Cancel")}</button></>}>
      <Field label={t("File (CSV or Excel .xlsx)")}><input type="file" accept=".csv,.txt,.xlsx" onChange={(e) => onFile(e.target.files?.[0])} /></Field>
      {err && <div className="hint small" style={{ color: "#a00000" }}>{err}</div>}
      {table && <>
        <Field label={t("Catalogue name")}><input className="field grow" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="small">{t("{n} rows. Which column is which?", { n: table.rows.length })}{table.sheet ? ` (${t("sheet")} “${table.sheet}”)` : ""}</div>
        {MAP_FIELDS.map(([f, label]) => (
          <Field key={f} label={t(label) + (f === "desc" ? " *" : "")}>
            <select className="field grow" value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">{t("— not in the file —")}</option>
              {table.header.map((h, i) => <option key={i} value={i}>{h || `${t("Column")} ${i + 1}`} {table.rows[0]?.[i] ? `(${String(table.rows[0][i]).slice(0, 30)})` : ""}</option>)}
            </select>
          </Field>
        ))}
        <Field label={t("All rows are for")}><select className="field grow" value={fixedPart} onChange={(e) => setFixedPart(e.target.value as Part | "")}>
          <option value="">{t("— use the Wizard part column, if any —")}</option>
          {MEASURE_COMPONENTS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select></Field>
        <div className="hint small">{t("Other columns are kept and shown as extra columns. Items with a Wizard part, a U-value and a price per m² become measures in the Renovation Wizard.")}</div>
        <div className="small">{t("Preview")}: {items.slice(0, 3).map((i) => `${i.id ?? ""} ${i.desc ?? ""} · ${i.cost ?? "–"} ${i.unit ?? ""}${i.part ? ` → ${t(String(i.part))}` : ""}`).join(" | ")}</div>
      </>}
    </Dialog>
  );
}

function ConnectDialog({ source, onClose }: { source?: Source; onClose: (id?: string) => void }) {
  const [, t] = useLang();
  const c = source?.connector;
  const [f, setF] = useState({
    name: source?.name ?? "", url: c?.url ?? "", auth: (c?.auth ?? "bearer") as Connector["auth"], auth_name: c?.auth_name ?? "",
    api_key: "", items_path: c?.items_path ?? "",
  });
  const [mapping, setMapping] = useState<Record<string, string>>(c?.mapping ?? { id: "id", desc: "name", cost: "price", unit: "unit" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (andSync: boolean) => {
    setBusy(true); setErr(null);
    try {
      const s = await saveConnector({ ...f, auth_name: f.auth_name || null, api_key: f.api_key || null, items_path: f.items_path || null, mapping }, source?.id);
      if (andSync) await syncConnector(s.id);
      onClose(s.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Dialog title={t(source ? "Edit supplier connection" : "Connect supplier API")} onClose={() => onClose()} width={620} buttons={<>
      <button className="btn default" disabled={busy || !f.name.trim() || !f.url.trim() || !mapping.desc} onClick={() => save(true)}>{busy ? t("Connecting…") : t("Save and sync")}</button>
      <button className="btn" disabled={busy || !f.name.trim() || !f.url.trim()} onClick={() => save(false)}>{t("Save")}</button>
      <button className="btn" onClick={() => onClose()}>{t("Cancel")}</button></>}>
      <div className="hint small">{t("For suppliers that offer a product/price API returning JSON. Your key is stored on the Poseidon server and is never shown again or sent to the browser; the server fetches the catalogue itself (HTTPS only) and refreshes it once a day when the catalogue is opened.")}</div>
      <Field label={t("Supplier name")}><input className="field grow" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Beijer, Ahlsell, Byggmax" /></Field>
      <Field label={t("API address (URL)")}><input className="field grow" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://api.supplier.se/v1/products" /></Field>
      <Field label={t("How the key is sent")}><select className="field grow" value={f.auth} onChange={(e) => setF({ ...f, auth: e.target.value as Connector["auth"] })}>
        <option value="bearer">{t("Authorization: Bearer <key>")}</option>
        <option value="header">{t("Own header (e.g. X-API-Key)")}</option>
        <option value="query">{t("URL parameter (e.g. ?api_key=)")}</option>
        <option value="none">{t("No key (public API)")}</option></select></Field>
      {(f.auth === "header" || f.auth === "query") && <Field label={t(f.auth === "header" ? "Header name" : "Parameter name")}>
        <input className="field grow" value={f.auth_name} onChange={(e) => setF({ ...f, auth_name: e.target.value })} placeholder={f.auth === "header" ? "X-API-Key" : "api_key"} /></Field>}
      {f.auth !== "none" && <Field label={t("API key")}><input className="field grow" type="password" autoComplete="off" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })}
        placeholder={c?.key_hint ? `${t("stored")}: ${c.key_hint} — ${t("leave empty to keep")}` : ""} /></Field>}
      <Field label={t("Item list path")}><input className="field grow" value={f.items_path} onChange={(e) => setF({ ...f, items_path: e.target.value })} placeholder={t("e.g. data.products (empty = the response itself)")} /></Field>
      <div className="small" style={{ marginTop: 4 }}>{t("Which field in the supplier's items is which catalogue field (dotted paths allowed, e.g. price.sek):")}</div>
      {MAP_FIELDS.map(([k, label]) => (
        <Field key={k} label={t(label) + (k === "desc" ? " *" : "")}><input className="field grow" value={mapping[k] ?? ""} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })} /></Field>
      ))}
      {err && <div className="hint small" style={{ color: "#a00000" }}>{err}</div>}
    </Dialog>
  );
}
