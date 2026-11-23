/* How each app opens: title, icon, default size. Shared by the desktop icons,
   the Start menu and the apps themselves (kept free of components so there
   are no import cycles). Titles/labels are English source strings for t(). */
import type { useWM, AppId } from "../desktop/wm";
import type { IconName } from "../icons/PixelIcon";

type WMApi = ReturnType<typeof useWM>;
type SimpleApp = Exclude<AppId, "history" | "facade" | "report">;

export const APPS: Record<SimpleApp, { title: string; label: string; icon: IconName; w: number; h: number; max?: boolean }> = {
  stockmap: { title: "Poseidon Map", label: "Poseidon\nMap", icon: "map", w: 1060, h: 660 },
  stocktable: { title: "Building Table", label: "Building\nTable", icon: "sheet", w: 1120, h: 600 },
  csvimport: { title: "Import building list (CSV)", label: "Import CSV", icon: "report", w: 640, h: 560 },
  wizard: { title: "Renovation Wizard", label: "Renovation\nWizard", icon: "wizard", w: 1480, h: 760 },
  viewer: { title: "3D Map – Gothenburg", label: "3D Map", icon: "globe", w: 1000, h: 640, max: true },
  reports: { title: "Reports", label: "Reports", icon: "folder", w: 620, h: 380 },
  catalogue: { title: "Renovation catalogue", label: "Catalogue", icon: "notepad", w: 1180, h: 700 },
  readme: { title: "README.txt – Notepad", label: "README.txt", icon: "notepad", w: 560, h: 440 },
  about: { title: "About Poseidon Renovation Planner", label: "About", icon: "info", w: 420, h: 360 },
};

export function openApp(wm: WMApi, app: SimpleApp) {
  const a = APPS[app];
  wm.open(app, { title: a.title, icon: a.icon, w: a.w, h: a.h, max: a.max });
}

export const openWizard = (wm: WMApi) => openApp(wm, "wizard");

/** Renovation history of one building (table row id). */
export function openHistory(wm: WMApi, rowId: string, label: string) {
  wm.open("history", { key: `history:${rowId}`, title: "Renovation history –", titleArg: label, icon: "notepad",
    w: 560, h: 460, props: { rowId, label } });
}

/** Façade inspection of one building (table row id). */
export function openFacade(wm: WMApi, rowId: string, label: string) {
  wm.open("facade", { key: `facade:${rowId}`, title: "Façade inspection –", titleArg: label, icon: "building",
    w: 980, h: 680, props: { rowId, label } });
}
