# plan2stock – Boplats floor plans → 3D units → building material stock (Backa pilot)

Order of steps (paths inside the scripts point at the cloud workspace, adjust to your repo):
1. `parse.py` – reads boplats_apartments.db, cleans district names, selects one district (Backa).
2. `match.py`, `match2.py` – matches listing addresses to footprints in assets/buildings.json (EUBUCCO).
3. `osm_backa.json` – footprints and address points from OpenStreetMap for the new builds that aren't in EUBUCCO yet (Overpass, fetched via browser).
4. `plan2geo.py` + `batch.py` – vectorises each unique plan image: wall mask, outline, scale from listed m², window/door gaps, door swing arcs, OCR of room labels and appliance codes (DM, K/F, TM ...).
5. `assemble.py` – quality grade per plan (A/B/C), per-flat inventory (detected vs rule/assumed), places flats on their listed floor, estimates whole-building stock, writes backa_model.json.
6. `viewer_template.html` – Three.js viewer; replace `/*DATA*/null` with the contents of backa_model.json.

Outputs: backa_units_inventory.csv (per listing), backa_buildings_stock.csv (per building).
