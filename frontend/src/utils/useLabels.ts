/* Building-use codes are shared across countries and come from the Swedish
   schema (Lantmäteriet / Boverket categories) the tool was first built on — the
   UK and Belgian pipelines map their own sources onto the same codes. They are
   internal keys; anything shown to the user goes through buildingUseLabel(). */
const USE_LABELS: Record<string, string> = {
  bostad_enfamilj: "Single-family house",
  bostad_flerfamilj: "Apartment building",
  verksamhet: "Commercial",
  handel: "Retail",
  kontor: "Office",
  samhalle: "Public / community",
  samhallsfunktion: "Public / community",
  industri: "Industrial",
  komplement: "Ancillary (garage, shed)",
  ovrigt: "Other",
};

export function buildingUseLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  return USE_LABELS[raw] ?? raw;
}

/** One-word labels for tight tables (Step 2 building table). */
const USE_SHORT: Record<string, string> = {
  bostad_enfamilj: "House",
  bostad_flerfamilj: "Apartments",
  verksamhet: "Commercial",
  handel: "Retail",
  kontor: "Office",
  samhalle: "Public",
  samhallsfunktion: "Public",
  industri: "Industrial",
  komplement: "Outbuilding",
  ovrigt: "Other",
};
export function buildingUseShort(raw: string | null | undefined): string {
  if (!raw) return "—";
  return USE_SHORT[raw] ?? raw;
}
