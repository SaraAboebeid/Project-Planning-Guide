/* English / Swedish. Source strings are English (same convention as the main
   planner's t()); SV holds the Swedish for each. A missing key falls back to
   English, so an untranslated string shows up in English rather than blank. */
import { useSyncExternalStore } from "react";

export type Lang = "en" | "sv";

const SV: Record<string, string> = {
  // Apps / desktop
  "Buildings": "Fastigheter",
  "Renovation Wizard": "Renoveringsguiden",
  "Renovation\nWizard": "Renoverings-\nguiden",
  "3D Map – Gothenburg": "3D-karta – Göteborg",
  "3D Map": "3D-karta",
  "Reports": "Rapporter",
  "README.txt – Notepad": "LÄS MIG.txt – Anteckningar",
  "README.txt": "LÄS MIG.txt",
  "About Poseidon Renovation Planner": "Om Poseidon Renoveringsplanerare",
  "About": "Om",
  "About Poseidon…": "Om Poseidon…",
  "Help (README)": "Hjälp (LÄS MIG)",
  "Renovation Planner": "Renoveringsplanerare",
  "Planner": "Planerare",
  "Desktop": "Skrivbord",
  "Language": "Språk",
  "English": "Engelska",
  "Swedish": "Svenska",
  // Window chrome
  "Minimize": "Minimera",
  "Maximize": "Maximera",
  "Restore": "Återställ",
  "Close": "Stäng",
  "OK": "OK",
  "Yes": "Ja",
  "No": "Nej",
  "Cancel": "Avbryt",
  // Portfolio
  "Properties…": "Egenskaper",
  "Remove": "Ta bort",
  "Plan renovation…": "Planera renovering…",
  "Address:": "Adress:",
  "e.g. Vårväderstorget 2": "t.ex. Vårväderstorget 2",
  "Searching…": "Söker…",
  "Add": "Lägg till",
  "The folder is empty.": "Mappen är tom.",
  "Type an address above to add Poseidon's first building.": "Skriv en adress ovan för att lägga till Poseidons första byggnad.",
  "Name": "Namn",
  "Year built": "Byggår",
  "Atemp m²": "Atemp m²",
  "Floors": "Våningar",
  "Energy class": "Energiklass",
  "kWh/m²·yr": "kWh/m²·år",
  "Use": "Användning",
  "objects": "objekt",
  "Total Atemp:": "Total Atemp:",
  "Outside Gothenburg": "Utanför Göteborg",
  "The address was found, but it is outside Gothenburg:": "Adressen hittades, men den ligger utanför Göteborg:",
  "The planner only has building data for Gothenburg.": "Planeraren har bara byggnadsdata för Göteborg.",
  "Nearest building": "Närmaste byggnad",
  "The nearest building in the register is {m} m from the address ({addr}). Add it anyway?":
    "Närmaste byggnad i registret ligger {m} m från adressen ({addr}). Lägga till den ändå?",
  "unknown address": "okänd adress",
  "Error": "Fel",
  "Could not find the building.": "Kunde inte hitta byggnaden.",
  "Confirm removal": "Bekräfta borttagning",
  "Remove {name} from the list?": "Vill du ta bort {name} från listan?",
  "Server responded {code}": "Servern svarade {code}",
  // Properties dialog
  "Properties for": "Egenskaper för",
  "General": "Allmänt",
  "Energy": "Energi",
  "Renovation": "Renovering",
  "The building is no longer in the list.": "Byggnaden finns inte längre i listan.",
  "Use:": "Användning:",
  "Year built:": "Byggår:",
  "Floors:": "Våningar:",
  "Height:": "Höjd:",
  "Atemp:": "Atemp:",
  "Footprint:": "Fotavtryck:",
  "Facade area:": "Fasadyta:",
  "Entrances:": "Entréer:",
  "Added:": "Tillagd:",
  "Energy class:": "Energiklass:",
  "Energy performance:": "Energiprestanda:",
  "Energy certificate:": "Energideklaration:",
  "On file": "Finns",
  "Missing": "Saknas",
  "Construction period:": "Byggnadsperiod:",
  "Typical U-values for the period (W/m²K)": "Typiska U-värden för perioden (W/m²K)",
  "External wall:": "Yttervägg:",
  "Roof:": "Tak:",
  "Windows:": "Fönster:",
  "No energy certificate was found. Energy use will be estimated when the current state is calculated.":
    "Ingen energideklaration hittades. Energin uppskattas när nuläget beräknas.",
  "No renovation plans have been saved for this building yet.": "Inga renoveringsplaner har sparats för den här byggnaden än.",
  "Open the Renovation Wizard…": "Öppna Renoveringsguiden…",
  // Wizard
  "Choose buildings": "Välj byggnader",
  "Choose which of Poseidon's buildings are part of the renovation project.": "Välj vilka av Poseidons byggnader som ingår i renoveringsprojektet.",
  "Building data": "Byggnadsdata",
  "Check the data for the chosen buildings before today's energy use is calculated.": "Kontrollera uppgifterna för de valda byggnaderna innan nuläget beräknas.",
  "Current state": "Nuläge",
  "Energy demand today, calculated with the same model as the main planner (EPSM).": "Energibehov i dag, beräknat med samma modell som huvudplaneraren (EPSM).",
  "Measures": "Åtgärder",
  "Compare renovation packages: cost, energy savings and climate impact.": "Jämför renoveringspaket: kostnad, energibesparing och klimatpåverkan.",
  "Report": "Rapport",
  "Put together a decision basis for Poseidon.": "Sammanställ ett beslutsunderlag för Poseidon.",
  "Step": "Steg",
  "There are no buildings in the list yet. Add buildings in": "Det finns inga byggnader i listan än. Lägg till byggnader i",
  "first.": "först.",
  "Open Buildings": "Öppna Fastigheter",
  "Building": "Byggnad",
  "U wall": "U vägg",
  "U window": "U fönster",
  "This step is under construction. It will use the same calculations as the main planner.":
    "Det här steget är under uppbyggnad. Det kopplas till samma beräkningar som huvudplaneraren.",
  "Quit the wizard? Your choices in the wizard are not saved.": "Vill du avsluta guiden? Valen i guiden sparas inte.",
  "< Back": "< Tillbaka",
  "Next >": "Nästa >",
  // Poseidon map
  "Poseidon Map": "Beståndskarta",
  "Poseidon\nMap": "Bestånds-\nkarta",
  "Poseidon (found in Boplats plans)": "Poseidon (funnen i Boplats planritningar)",
  "Poseidon (added by you)": "Poseidon (tillagd av dig)",
  "Not Poseidon (removed by you)": "Inte Poseidon (borttagen av dig)",
  "Other apartment blocks": "Andra flerbostadshus",
  "Zoom to Poseidon": "Zooma till Poseidon",
  "Show other apartment blocks": "Visa andra flerbostadshus",
  "Each click marks or unmarks a building as Poseidon": "Varje klick markerar eller avmarkerar en byggnad som Poseidon",
  "Quick select": "Snabbval",
  "Export my changes…": "Exportera mina ändringar…",
  "Save": "Spara",
  "Saving…": "Sparar…",
  "Undo changes": "Ångra ändringar",
  "Undo the changes you have not saved yet?": "Ångra ändringarna som inte har sparats än?",
  "Export…": "Exportera…",
  "Could not save to the server. Your changes are kept in this browser; try again.":
    "Kunde inte spara till servern. Dina ändringar finns kvar i webbläsaren; försök igen.",
  "Loading saved list…": "Laddar sparad lista…",
  "All changes saved": "Alla ändringar sparade",
  "Unsaved changes": "Osparade ändringar",
  "Server not reachable – changes kept in this browser": "Servern svarar inte – ändringarna finns kvar i webbläsaren",
  "Loading map…": "Laddar karta…",
  "Zoom in to see other apartment blocks you can add.": "Zooma in för att se andra flerbostadshus som du kan lägga till.",
  "Click a building on the map.": "Klicka på en byggnad på kartan.",
  "Poseidon: found in": "Poseidon: funnen i",
  "Boplats floor plan(s)": "planritning(ar) på Boplats",
  "latest": "senast",
  "Poseidon: added by you": "Poseidon: tillagd av dig",
  "Removed by you (was matched from Boplats)": "Borttagen av dig (matchades från Boplats)",
  "Not marked as Poseidon": "Inte markerad som Poseidon",
  "Not Poseidon": "Inte Poseidon",
  "Undo removal": "Ångra borttagning",
  "Remove from Poseidon": "Ta bort från Poseidon",
  "Mark as Poseidon": "Markera som Poseidon",
  "Legend": "Teckenförklaring",
  "Matched by map location (less certain), listing:": "Matchad via kartposition (osäkrare), annons:",
  "Matched by address, listing:": "Matchad via adress, annons:",
  "Not on the map": "Saknas på kartan",
  "Poseidon addresses from Boplats with no building outline:": "Poseidon-adresser från Boplats utan byggnadskontur:",
  "Poseidon buildings": "Poseidon-byggnader",
  "from Boplats": "från Boplats",
  "added by you": "tillagda av dig",
  "removed": "borttagna",
  "Data": "Data",
  // Small apps
  "Reports from the Renovation Wizard will appear here.": "Rapporter från Renoveringsguiden hamnar här.",
  "Version 0.1 (preview)": "Version 0.1 (förhandsversion)",
  "Building data: energy certificates (Boverket), EUBUCCO building register, Lantmäteriet.":
    "Byggnadsdata: energideklarationer (Boverket), EUBUCCO-byggnadsregister, Lantmäteriet.",
  "Calculations: the same engine as Project Planning Guide.": "Beräkningar: samma motor som Project Planning Guide.",
  "Gothenburg 3D map": "3D-karta Göteborg",
};

export const README: Record<Lang, string> = {
  en: `POSEIDON RENOVATION PLANNER
===========================

A tool for planning renovations in Poseidon's housing stock
in Gothenburg.

GETTING STARTED
0. "Poseidon Map" shows the buildings found to be Poseidon's
   from Boplats floor plans. Zoom in, then click other
   apartment blocks to add the ones Poseidon also owns.
1. Open "Buildings" and type an address in Gothenburg.
   The building is added with its year built, heated area
   (Atemp) and energy class from the energy certificate.
2. Double-click a building to see its properties.
3. Open the "Renovation Wizard" and choose which buildings
   are part of the project.
4. "3D Map" shows the whole of Gothenburg in 3D.

UNDER CONSTRUCTION
- Current state (energy calculation), renovation packages
  and the report.
- Poseidon's property register (for now the list is only
  saved in this browser).

TIPS
- Drag a window's title bar to move it.
- Double-click the title bar to maximize.
- Click EN / SV next to the clock to switch language.
`,
  sv: `POSEIDON RENOVERINGSPLANERARE
==============================

Ett verktyg för att planera renoveringar i Poseidons bestånd
i Göteborg.

SÅ HÄR KOMMER DU IGÅNG
0. "Beståndskarta" visar byggnader som Boplats planritningar
   visar tillhör Poseidon. Zooma in och klicka på andra
   flerbostadshus för att lägga till Poseidons övriga hus.
1. Öppna "Fastigheter" och skriv en adress i Göteborg.
   Byggnaden läggs till med byggår, Atemp och energiklass
   från energideklarationen.
2. Dubbelklicka på en byggnad för att se dess egenskaper.
3. Öppna "Renoveringsguiden" och välj vilka byggnader
   som ingår i projektet.
4. "3D-karta" visar hela Göteborg i 3D.

UNDER UPPBYGGNAD
- Nuläge (energiberäkning), åtgärdspaket och rapport.
- Poseidons fastighetsregister (just nu sparas listan
  bara i den här webbläsaren).

TIPS
- Dra i fönstrens titelrad för att flytta dem.
- Dubbelklicka på titelraden för att maximera.
- Klicka på EN / SV bredvid klockan för att byta språk.
`,
};

const KEY = "poseidon-lang";
const listeners = new Set<() => void>();
let lang: Lang = (() => {
  try { return localStorage.getItem(KEY) === "sv" ? "sv" : "en"; } catch { return "en"; }
})();
document.documentElement.lang = lang;

export function setLang(next: Lang) {
  lang = next;
  document.documentElement.lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}
export const getLang = () => lang;

/** Translate an English source string; {name} placeholders filled from vars. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = lang === "sv" ? SV[en] ?? en : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Re-render on language change; returns [lang, t]. */
export function useLang() {
  const l = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => lang);
  return [l, t] as const;
}

/* Building-use categories arrive from the register in Swedish. */
const USE_EN: Record<string, string> = {
  bostad: "Residential", verksamhet: "Commercial", "samhällsfunktion": "Public service",
  industri: "Industrial", komplementbyggnad: "Outbuilding", komplement: "Outbuilding",
  ekonomibyggnad: "Farm building", "övrig byggnad": "Other",
  // category codes used in the map data (assets/buildings.json use_cat)
  bostad_flerfamilj: "Apartment block", bostad_enfamilj: "House", samhalle: "Public service", ovrigt: "Other",
};
const USE_SV: Record<string, string> = {
  bostad_flerfamilj: "Flerbostadshus", bostad_enfamilj: "Småhus", samhalle: "Samhällsfunktion",
  ovrigt: "Övrigt", komplement: "Komplementbyggnad",
};
export const buildingUse = (v: string | null | undefined) => {
  if (!v) return "–";
  const k = v.toLowerCase();
  if (lang === "en") return USE_EN[k] ?? v;
  const s = USE_SV[k] ?? v;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const locale =() => (lang === "sv" ? "sv-SE" : "en-GB");
