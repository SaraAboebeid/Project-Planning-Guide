// Shared country/tab navigation config for the top bar rendered by both
// LandingPage (on "/") and DataLayout (on every other page). Kept in one place
// so the two headers can't drift out of sync with each other again — that drift
// is what caused DataLayout's old hardcoded tab list to always route back to
// the Sweden pages regardless of which country you were viewing.

export type CountryCode = "se" | "gb" | "be" | "ie";

export const COUNTRIES: { id: CountryCode; name: string; cities: string[] }[] = [
  { id: "se", name: "Sweden", cities: ["Stockholm", "Gothenburg", "Malmö"] },
  { id: "gb", name: "United Kingdom", cities: ["London"] },
  { id: "be", name: "Belgium", cities: [] },
  { id: "ie", name: "Ireland", cities: [] },
];

// Data Explorer and 3D Viewer have a UK build (/data/uk, /viewer/uk); the other
// tabs are shared across countries until they get one too.
export const LIBRARY_TABS: {
  label: string;
  path: string;
  pathByCountry?: Partial<Record<CountryCode, string>>;
}[] = [
  { label: "Pathways", path: "/pathways" },
  { label: "Data Explorer", path: "/data", pathByCountry: { gb: "/data/uk" } },
  { label: "Analysis Tools", path: "/analysis" },
  { label: "3D Viewer", path: "/viewer", pathByCountry: { gb: "/viewer/uk" } },
  { label: "Sample Reports", path: "/reports" },
];

export function tabPathFor(tab: (typeof LIBRARY_TABS)[number], country: CountryCode): string {
  return tab.pathByCountry?.[country] ?? tab.path;
}

// Maps a country-specific path back to its equivalent under another country.
// Built from LIBRARY_TABS so every {path, pathByCountry} pair round-trips
// automatically instead of needing a second hand-maintained table.
const PATH_EQUIVALENTS: Record<string, Partial<Record<CountryCode, string>>> = (() => {
  const map: Record<string, Partial<Record<CountryCode, string>>> = {};
  for (const tab of LIBRARY_TABS) {
    const variants: Partial<Record<CountryCode, string>> = { se: tab.path, ...tab.pathByCountry };
    for (const path of Object.values(variants)) {
      if (path) map[path] = variants;
    }
  }
  return map;
})();

/** Which country a given pathname belongs to, e.g. "/viewer/uk" -> "gb". */
export function countryFromPath(pathname: string): CountryCode {
  const variants = PATH_EQUIVALENTS[pathname];
  if (!variants) return "se";
  const match = (Object.entries(variants) as [CountryCode, string][]).find(([, p]) => p === pathname);
  return match?.[0] ?? "se";
}

/** The equivalent of `pathname` under `country`, if one is registered. */
export function pathForCountry(pathname: string, country: CountryCode): string | undefined {
  return PATH_EQUIVALENTS[pathname]?.[country];
}
