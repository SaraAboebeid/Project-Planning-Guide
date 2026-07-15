/**
 * Each Step 1 renovation component ("Walls", "Windows", ...) expands into
 * 1-3 "area line items" - each gets its own material picker, quantity, and
 * Wikells/Boverket lookup. Most components map 1:1; "Vertical Extension"
 * expands to 3 (new roof, new walls, new floor slab), since a new storey
 * needs all three, not just the roof+floor the old mock modelled.
 *
 * quantityKind matters for cost calculation: Wikells prices Walls/Floor/Roof
 * per m² ("SEK/m²"), but Windows/Doors/Balcony per unit ("SEK/st" - a whole
 * window, door, or balcony structure, not a per-m² assembly) - confirmed by
 * checking the actual catalogue (frontend/src/config/wikellsData.ts), not
 * assumed. "area" quantities are m²; "count" quantities are a unit count.
 */

export type QuantityKind = "area" | "count";

export interface AreaLineItem {
  key: string;                // unique key in a package's selections map
  parentComponent: string;    // Step-1 label, for tab grouping
  label: string;
  wikellsChapterId: string;   // WIKELLS_CHAPTERS[].id to source materials from
  boverketComponent: string;  // COMPONENT_MATERIAL_MAP key (utils/boverket_api.py)
  quantityKind: QuantityKind;
}

export const AREA_LINE_ITEMS: Record<string, AreaLineItem[]> = {
  "Walls": [
    { key: "Walls", parentComponent: "Walls", label: "Walls", wikellsChapterId: "ch7", boverketComponent: "Walls", quantityKind: "area" },
  ],
  "Windows": [
    { key: "Windows", parentComponent: "Windows", label: "Windows", wikellsChapterId: "ch16", boverketComponent: "Windows", quantityKind: "count" },
  ],
  "Doors": [
    { key: "Doors", parentComponent: "Doors", label: "Doors", wikellsChapterId: "ch16", boverketComponent: "Doors", quantityKind: "count" },
  ],
  "Floor": [
    { key: "Floor", parentComponent: "Floor", label: "Floor", wikellsChapterId: "ch9", boverketComponent: "Floor", quantityKind: "area" },
  ],
  "Roof": [
    { key: "Roof", parentComponent: "Roof", label: "Roof", wikellsChapterId: "ch11", boverketComponent: "Roof", quantityKind: "area" },
  ],
  "Balcony": [
    { key: "Balcony", parentComponent: "Balcony", label: "Balcony", wikellsChapterId: "ch9", boverketComponent: "Balcony", quantityKind: "count" },
  ],
  "Vertical Extension (New Floor)": [
    { key: "VertExt::Roof",  parentComponent: "Vertical Extension (New Floor)", label: "New Roof",       wikellsChapterId: "ch11", boverketComponent: "Roof",  quantityKind: "area" },
    { key: "VertExt::Walls", parentComponent: "Vertical Extension (New Floor)", label: "New Walls",      wikellsChapterId: "ch7",  boverketComponent: "Walls", quantityKind: "area" },
    { key: "VertExt::Floor", parentComponent: "Vertical Extension (New Floor)", label: "New Floor Slab", wikellsChapterId: "ch9",  boverketComponent: "Floor", quantityKind: "area" },
  ],
};

export function lineItemsFor(components: string[]): AreaLineItem[] {
  return components.flatMap((c) => AREA_LINE_ITEMS[c] ?? []);
}
