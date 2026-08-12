// Shared country/tab navigation config for the top bar rendered by both
// LandingPage (on "/") and DataLayout (on every other page). Kept in one place
// so the two headers can't drift out of sync with each other again — that drift
// is what caused DataLayout's old hardcoded tab list to always route back to
// the Sweden pages regardless of which country you were viewing.

export type CountryCode = "se" | "gb" | "be" | "ie";

export const COUNTRIES: {
  id: CountryCode; name: string; cities: string[];
  /** City selected when this country is chosen. Not simply cities[0]: the list
   *  is in geographic/alphabetical order, but only some cities have building
   *  data, and that is the one the app should open on. */
  defaultCity?: string;
  /** Cities that actually have data and are selectable. If set, every other
   *  listed city is shown greyed-out / "coming soon" and is not clickable. */
  enabledCities?: string[];
}[] = [
  { id: "se", name: "Sweden", cities: ["Stockholm", "Gothenburg", "Malmö"],
    defaultCity: "Gothenburg", enabledCities: ["Gothenburg"] },
  { id: "gb", name: "United Kingdom", cities: ["London", "Rotherham"], defaultCity: "London" },
  { id: "be", name: "Belgium", cities: [] },
  { id: "ie", name: "Ireland", cities: [] },
];

/** The city a country opens on — its defaultCity, else the first listed. */
export function defaultCityFor(country: CountryCode): string {
  const c = COUNTRIES.find((x) => x.id === country);
  return c?.defaultCity ?? c?.cities[0] ?? "";
}

/** Whether a city is selectable (has data). Cities not in a country's
 *  enabledCities list are shown greyed-out and disabled (e.g. Stockholm, Malmö). */
export function cityEnabled(country: CountryCode, city: string): boolean {
  const c = COUNTRIES.find((x) => x.id === country);
  if (!c || !c.enabledCities) return true;
  return c.enabledCities.includes(city);
}

/** Whether a whole country is selectable — true only if it has at least one
 *  available city. Countries with no cities yet (Belgium, Ireland) are greyed
 *  out and unclickable, like the coming-soon cities. */
export function countryEnabled(country: CountryCode): boolean {
  const c = COUNTRIES.find((x) => x.id === country);
  if (!c) return false;
  return c.cities.some((city) => cityEnabled(country, city));
}

// Map-centering data for the Step 1 location picker (LocationMap.tsx) - keyed
// by exact city name from COUNTRIES[].cities, so a Sweden/Gothenburg project
// centers and geocodes differently from a Sweden/Stockholm one, or a UK/London
// one. CITY_COORDS only has real coverage today (Gothenburg + London have
// actual building data in this app); the others are placeholders so the
// country/city pickers above don't dead-end without a map.
export const CITY_COORDS: Record<string, { lat: number; lon: number; zoom: number }> = {
  Gothenburg: { lat: 57.7089, lon: 11.9746, zoom: 12 },
  Stockholm: { lat: 59.3293, lon: 18.0686, zoom: 11 },
  "Malmö": { lat: 55.6050, lon: 13.0038, zoom: 12 },
  London: { lat: 51.5072, lon: -0.1276, zoom: 11 },
  Rotherham: { lat: 53.4302, lon: -1.3568, zoom: 13 },
};

// Country-level fallback center (no city selected, or a country with no
// cities yet, e.g. Belgium/Ireland) - roughly each country's own centroid.
export const COUNTRY_CENTER: Record<CountryCode, { lat: number; lon: number; zoom: number }> = {
  se: { lat: 62.0, lon: 15.0, zoom: 5 },
  gb: { lat: 54.0, lon: -2.5, zoom: 6 },
  be: { lat: 50.6403, lon: 4.6667, zoom: 8 },
  ie: { lat: 53.1424, lon: -7.6921, zoom: 7 },
};

/** Best-known map center for a country/city pair, falling back from
 * city -> country -> Sweden overview (the app's original hardcoded default). */
export function mapCenterFor(country: CountryCode | null | undefined, city?: string | null) {
  if (city && CITY_COORDS[city]) return CITY_COORDS[city];
  if (country && COUNTRY_CENTER[country]) return COUNTRY_CENTER[country];
  return COUNTRY_CENTER.se;
}

// Data Explorer and 3D Viewer have a UK build (/data/uk, /viewer/uk); the other
// tabs are shared across countries until they get one too.
export const LIBRARY_TABS: {
  label: string;
  path: string;
  pathByCountry?: Partial<Record<CountryCode, string>>;
}[] = [
  { label: "Pathways", path: "/pathways" },
  { label: "Analysis Tools", path: "/analysis" },
  { label: "Data Explorer", path: "/data", pathByCountry: { gb: "/data/uk" } },
  { label: "3D Viewer", path: "/viewer", pathByCountry: { gb: "/viewer/uk" } },
  { label: "Sample Reports", path: "/reports" },
  { label: "Project Team", path: "/team" },
];

export function tabPathFor(tab: (typeof LIBRARY_TABS)[number], country: CountryCode): string {
  return tab.pathByCountry?.[country] ?? tab.path;
}

/** "Sweden"/"United Kingdom"/etc (COUNTRIES[].name, also project.country's
 * stored value) -> its CountryCode. Falls back to "se" so callers with a
 * null/unset country still get a sensible map default. */
export function countryCodeFromName(name: string | null | undefined): CountryCode {
  return COUNTRIES.find((c) => c.name === name)?.id ?? "se";
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
