/* Step 2 — building owner and past renovations, per building.
   No dataset records either: the EPC register carries no owner (Boverket omits
   personal data) and no renovation dates. Both come from the user, are stored
   in project.buildingHistory (keyed like facadeDefects), and the renovations
   restart a component's age in the Step 4 recommendations. */

import { useMemo, useState } from "react";
import { useWizardStore, type BuildingHistory, type RenovationRecord } from "../store/wizard";
import { ASSESSED_COMPONENTS } from "../utils/renovationRecommendations";
import { useT } from "../i18n";

export interface HistoryBuilding {
  key: string;
  label: string;
  yearBuilt: number | null;
}

const PAGE = 25;
const THIS_YEAR = new Date().getFullYear();

/** Write one building's history, reading fresh state: merging into a stale copy
 *  of the map erased other buildings' entries (the facadeDefects lesson). */
function writeHistory(key: string, label: string, update: (h: BuildingHistory) => BuildingHistory) {
  const { project, setProject } = useWizardStore.getState();
  const all = { ...(project.buildingHistory ?? {}) };
  const next = update(all[key] ?? { renovations: [] });
  if (!next.owner?.trim() && next.renovations.length === 0) delete all[key];
  else all[key] = { ...next, label };
  setProject({ buildingHistory: all });
}

// Envelope parts have a U-value; a heating system does not.
const HAS_U = new Set(["Walls", "Windows", "Roof", "Floor"]);
// Window U-values run higher than opaque parts; anything outside these is a typo.
const U_RANGE: Record<string, [number, number]> = { Windows: [0.5, 6], Walls: [0.05, 3], Roof: [0.05, 3], Floor: [0.05, 3] };

function AddRenovation({ b }: { b: HistoryBuilding }) {
  const t = useT();
  const [component, setComponent] = useState<string>(ASSESSED_COMPONENTS[1]);
  const [year, setYear] = useState("");
  const [uText, setUText] = useState("");
  const y = Number(year);
  const valid = Number.isInteger(y) && y >= 1800 && y <= THIS_YEAR;
  const beforeBuilt = valid && b.yearBuilt != null && y < b.yearBuilt;
  const u = uText.trim() ? Number(uText.replace(",", ".")) : null;
  const [uMin, uMax] = U_RANGE[component] ?? [0, 10];
  const uBad = u != null && !(Number.isFinite(u) && u >= uMin && u <= uMax);
  const add = () => {
    if (!valid || uBad) return;
    const rec: RenovationRecord = { id: `${component}-${y}-${Date.now()}`, component, year: y,
      ...(u != null && HAS_U.has(component) ? { uValue: u } : {}) };
    writeHistory(b.key, b.label, (h) => ({ ...h, renovations: [...h.renovations, rec].sort((a, c) => a.year - c.year) }));
    setYear(""); setUText("");
  };
  return (
    <div className="flex items-center gap-1.5 flex-nowrap">
      <select value={component} onChange={(e) => setComponent(e.target.value)}
        className="bg-[#0d1117] border border-white/12 rounded px-1.5 py-1 text-[12px] text-white/80 focus:outline-none focus:border-violet-500/60">
        {ASSESSED_COMPONENTS.map((c) => <option key={c} value={c}>{t(c)}</option>)}
      </select>
      <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        placeholder={t("Year")} inputMode="numeric" aria-label={t("Renovation year")}
        className="w-[58px] bg-[#0d1117] border border-white/12 rounded px-1.5 py-1 text-[12px] text-white/85 focus:outline-none focus:border-violet-500/60" />
      {HAS_U.has(component) && (
        <input value={uText} onChange={(e) => setUText(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder={t("U (optional)")} inputMode="decimal" aria-label={t("U-value after the renovation, W/m²K")}
          title={t("U-value after the renovation, W/m²K — e.g. from the window supplier or the renovation drawings. Leave empty if unknown.")}
          className={`w-[78px] bg-[#0d1117] border rounded px-1.5 py-1 text-[12px] text-white/85 focus:outline-none focus:border-violet-500/60 ${uBad ? "border-red-500/70" : "border-white/12"}`} />
      )}
      <button onClick={add} disabled={!valid || uBad}
        className="px-2 py-1 rounded text-[12px] font-semibold whitespace-nowrap shrink-0 border border-[#8B6EAD]/40 text-[#8B6EAD] hover:bg-[#8B6EAD]/10 disabled:opacity-30 disabled:cursor-not-allowed">
        + {t("Add")}
      </button>
      {uBad && (
        <span className="text-[11px] text-red-300" role="alert">
          ⚠ {t("U-value for {c} should be between {a} and {b}", { c: t(component), a: uMin, b: uMax })}
        </span>
      )}
      {beforeBuilt && (
        <span className="text-[11px] text-amber-300" title={t("This is before the recorded construction year — check the year.")}>
          ⚠ {t("before built {y}", { y: b.yearBuilt! })}
        </span>
      )}
    </div>
  );
}

/* ── Cells, shared by this panel and the Step 2 building table ────────────── */

/** Owner text field. Suggests owners already typed (see OwnerSuggestions). */
export function OwnerCell({ b, owner, width = 170 }: { b: HistoryBuilding; owner?: string; width?: number }) {
  const t = useT();
  return (
    <input value={owner ?? ""} list="bh-owners"
      onChange={(e) => writeHistory(b.key, b.label, (x) => ({ ...x, owner: e.target.value }))}
      placeholder={t("Owner")} aria-label={t("Owner of {b}", { b: b.label })}
      style={{ width }}
      className="bg-[#0d1117] border border-white/12 rounded px-2 py-1 text-[12px] text-white/85 focus:outline-none focus:border-violet-500/60" />
  );
}

/** Recorded renovations as removable tags, plus the add form. */
export function RenovationsCell({ b, renovations }: { b: HistoryBuilding; renovations: RenovationRecord[] }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {renovations.map((r) => (
        <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/25 border border-emerald-700/40 text-emerald-300 whitespace-nowrap">
          {t(r.component)} {r.year}{r.uValue != null && <span className="text-emerald-200/70"> · U {r.uValue}</span>}
          <button aria-label={t("Remove")} title={t("Remove")}
            onClick={() => writeHistory(b.key, b.label, (x) => ({ ...x, renovations: x.renovations.filter((y) => y.id !== r.id) }))}
            className="text-emerald-300/60 hover:text-white leading-none">×</button>
        </span>
      ))}
      <AddRenovation b={b} />
    </div>
  );
}

/** One <datalist> of every owner typed so far; render once per page. */
export function OwnerSuggestions() {
  const history = useWizardStore((s) => s.project.buildingHistory) ?? {};
  const owners = useMemo(
    () => [...new Set(Object.values(history).map((h) => h.owner?.trim()).filter((o): o is string => !!o))].sort(),
    [history],
  );
  return <datalist id="bh-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>;
}

export default function BuildingHistoryPanel({ buildings }: { buildings: HistoryBuilding[] }) {
  const t = useT();
  const history = useWizardStore((s) => s.project.buildingHistory) ?? {};
  const [showAll, setShowAll] = useState(false);
  const [bulkOwner, setBulkOwner] = useState("");
  const shown = showAll ? buildings : buildings.slice(0, PAGE);
  const recorded = buildings.filter((b) => (history[b.key]?.renovations.length ?? 0) > 0).length;

  const applyOwnerToAll = () => {
    const owner = bulkOwner.trim();
    if (!owner) return;
    const { project, setProject } = useWizardStore.getState();
    const all = { ...(project.buildingHistory ?? {}) };
    for (const b of buildings) all[b.key] = { ...(all[b.key] ?? { renovations: [] }), owner, label: b.label };
    setProject({ buildingHistory: all });
    setBulkOwner("");
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-white/50 leading-relaxed">
        {t("No dataset records who owns a building or what has been renovated. Add what you know: a recorded renovation restarts that part's age, so Step 4 won't recommend replacing windows that were replaced in 2010.")}{" "}
        {t("If you know the U-value after the renovation, add it too: the energy simulations in Steps 3 and 4 then use it instead of the value typical for the building's era (re-run the baseline if it has already run).")}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {buildings.length > 1 && (
          <>
            <span className="text-white/45">{t("Same owner for all {n} buildings:", { n: buildings.length })}</span>
            <input value={bulkOwner} onChange={(e) => setBulkOwner(e.target.value)} list="bh-owners"
              onKeyDown={(e) => { if (e.key === "Enter") applyOwnerToAll(); }}
              placeholder={t("e.g. Bostadsbolaget")}
              className="w-[180px] bg-[#0d1117] border border-white/12 rounded px-2 py-1 text-[12px] text-white/85 focus:outline-none focus:border-violet-500/60" />
            <button onClick={applyOwnerToAll} disabled={!bulkOwner.trim()}
              className="px-2 py-1 rounded font-semibold border border-white/15 text-white/70 hover:bg-white/8 disabled:opacity-30">
              {t("Apply")}
            </button>
          </>
        )}
        <span className="ml-auto text-white/35">
          {t("Renovations recorded for {a} of {n} buildings", { a: recorded, n: buildings.length })}
        </span>
      </div>
      <OwnerSuggestions />

      <div className="overflow-x-auto rounded-lg border border-white/8">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-white/8 text-white/60">
              <th className="px-2 py-1.5 text-left font-semibold w-6">#</th>
              <th className="px-2 py-1.5 text-left font-semibold">{t("Building")}</th>
              <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{t("Built")}</th>
              <th className="px-2 py-1.5 text-left font-semibold">{t("Owner")}</th>
              <th className="px-2 py-1.5 text-left font-semibold">{t("Past renovations")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b, i) => {
              const h = history[b.key];
              return (
                <tr key={b.key} className="border-t border-white/8 align-top">
                  <td className="px-2 py-2 text-white/30 font-mono">{i + 1}</td>
                  <td className="px-2 py-2 text-white/80 font-medium max-w-[220px] truncate" title={b.label}>{b.label}</td>
                  <td className="px-2 py-2 text-white/55 whitespace-nowrap">{b.yearBuilt ?? "—"}</td>
                  <td className="px-2 py-2"><OwnerCell b={b} owner={h?.owner} /></td>
                  <td className="px-2 py-2"><RenovationsCell b={b} renovations={h?.renovations ?? []} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {buildings.length > PAGE && (
        <button onClick={() => setShowAll((s) => !s)} className="text-[12px] font-medium text-purple-400 hover:text-purple-300">
          {showAll ? `${t("Show less")} ▲` : `${t("Show all {n} buildings", { n: buildings.length })} ▼`}
        </button>
      )}
    </div>
  );
}
