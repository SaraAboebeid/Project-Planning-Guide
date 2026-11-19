/* How each app opens: title, icon, default size. Shared by the desktop icons,
   the Start menu and the apps themselves (kept free of components so there
   are no import cycles). Titles/labels are English source strings for t(). */
import type { useWM, AppId } from "../desktop/wm";
import type { IconName } from "../icons/PixelIcon";
import type { SavedBuilding } from "../portfolio";

type WMApi = ReturnType<typeof useWM>;

export const APPS: Record<Exclude<AppId, "properties">, { title: string; label: string; icon: IconName; w: number; h: number; max?: boolean }> = {
  portfolio: { title: "Buildings", label: "Buildings", icon: "folder", w: 720, h: 440 },
  stockmap: { title: "Poseidon Map", label: "Poseidon\nMap", icon: "map", w: 1060, h: 660 },
  stocktable: { title: "Building Table", label: "Building\nTable", icon: "sheet", w: 1120, h: 600 },
  csvimport: { title: "Import building list (CSV)", label: "Import CSV", icon: "report", w: 640, h: 560 },
  wizard: { title: "Renovation Wizard", label: "Renovation\nWizard", icon: "wizard", w: 680, h: 470 },
  viewer: { title: "3D Map – Gothenburg", label: "3D Map", icon: "globe", w: 1000, h: 640, max: true },
  reports: { title: "Reports", label: "Reports", icon: "report", w: 520, h: 340 },
  readme: { title: "README.txt – Notepad", label: "README.txt", icon: "notepad", w: 560, h: 440 },
  about: { title: "About Poseidon Renovation Planner", label: "About", icon: "info", w: 420, h: 360 },
};

export function openApp(wm: WMApi, app: Exclude<AppId, "properties">) {
  const a = APPS[app];
  wm.open(app, { title: a.title, icon: a.icon, w: a.w, h: a.h, max: a.max });
}

export const openWizard = (wm: WMApi) => openApp(wm, "wizard");

export function openProperties(wm: WMApi, b: SavedBuilding) {
  wm.open("properties", {
    key: `props:${b.id}`, title: "Properties for", titleArg: b.label, icon: "building",
    w: 400, h: 450, props: { id: b.id },
  });
}
