// =============================================================
// layer_docs.js — descriptive copy for every info (i) button.
//
// Kept out of viewer/index.html so the panel markup stays scannable and the
// prose is reviewable/translatable in one place. ui.js hydrates each
// <button class="info-btn" data-layer="KEY"> from this map on init.
//
// Country-specific building copy stays templated in index.html
// ({{BUILDINGS_DESC}} / {{BUILDINGS_SOURCE}}), substituted by build.py.
// =============================================================
window.LAYER_DOCS = {
  "building-layers": { title: "Building layers", desc: "The analysed building stock and optional global OSM massing for surrounding context. Use the colour-by tabs to recolour buildings by use type, energy class or construction era." },
  "selected-building": { title: "Selected building", desc: "Attribute data for the building you clicked on the map, plus the analysis tools that run against it: window-to-wall ratio, rooftop PV potential and an EnergyPlus energy simulation.", source: "EUBUCCO · Boverket EPC · PPG analysis pipeline" },
  "base-map": { title: "Base map", desc: "The map surface drawn beneath the data layers. Exactly one can be active at a time.", source: "CartoDB · Esri · Google via Cesium Ion" },
  "light-basemap": { title: "Light basemap", desc: "Neutral light street map — ideal for daytime use and coloured data overlays.", source: "CartoDB Positron · OpenStreetMap contributors" },
  "dark-basemap": { title: "Dark basemap", desc: "Dark-themed street map. Provides strong contrast for bright-coloured overlays.", source: "CartoDB Dark Matter · OpenStreetMap contributors" },
  "satellite-imagery": { title: "Satellite imagery", desc: "High-resolution aerial and satellite imagery of the viewed area and surroundings.", source: "Esri World Imagery" },
  "photorealistic-3d-tiles": { title: "Photorealistic 3D tiles", desc: "Google's photorealistic 3D tiles with detailed building textures and terrain mesh. Requires a valid Cesium Ion access token.", source: "Google via Cesium Ion" },
  "cesium-osm-buildings": { title: "Cesium OSM Buildings", desc: "Global 3D building massing from OpenStreetMap. Adds context around the analysis area, which only covers the focus district. Combine with photorealistic tiles or use on its own.", source: "Cesium OSM Buildings · OpenStreetMap contributors" },
  "traffic-layers": { title: "Traffic layers", desc: "Operational mobility layers including live transit vehicles and stops, disruption notices, and commuter parking availability from Västtrafik.", source: "Västtrafik · GTFS-RT · Störning API" },
  "live-transit-amp-stops": { title: "Live Transit &amp; Stops", desc: "Real-time bus, tram, and ferry positions plus stop locations across Gothenburg. Requires the backend server (uvicorn) to be running.", source: "Västtrafik open API · GTFS-RT feed" },
  "traffic-disruptions": { title: "Traffic Disruptions", desc: "Live traffic disruptions, planned maintenance works, and service alerts on the public transit network. Shown as clickable markers on the map.", source: "Västtrafik Störning API" },
  "commuter-parking": { title: "Commuter Parking", desc: "Kiss-and-ride and commuter parking lots near transit stops, with live space availability where provided.", source: "Västtrafik" },
  "statistics-sweden-scb-layers": { title: "Statistics Sweden (SCB) layers", desc: "47 statistical overlays from Statistics Sweden covering population grids, administrative zones, land use areas, and the national reference grid. All loaded on demand from the SCB WFS service.", source: "Statistics Sweden (SCB) · CC0 1.0 Universal · geodata.scb.se" },
  "urban-analysis-layers": { title: "Urban Analysis layers", desc: "City-wide analytical overlays computed from OSM and EUBUCCO data. Green Index scores street segments by park proximity. Heat Island Proxy estimates thermal stress per grid cell from building energy class, age and use. Green Accessibility maps walking distance to the nearest green space.", source: "OSM · Overpass API · EUBUCCO v0.2" },
  "street-green-index": { title: "Street Green Index", desc: "Greenness score 0–1 for every street segment based on proximity to parks, forests and gardens (OSM). Colour: green = well-served, red = low green coverage. Distance-decay model with 200 m half-life.", source: "OpenStreetMap · Overpass API" },
  "urban-heat-island-proxy": { title: "Urban Heat Island Proxy", desc: "Grid-based heat island proxy (667 m cells) scored from energy class (50%), construction year (30%), and building use (20%). Green areas provide a cooling correction. Red = high thermal stress, blue = cooler areas.", source: "EUBUCCO v0.2 · Boverket EPC · OSM" },
  "green-space-accessibility": { title: "Green Space Accessibility", desc: "Straight-line distance from a 280 m grid to the nearest OSM green space. Green = within 400 m, amber = 400–800 m, red = over 800 m (WHO guideline threshold). Identifies underserved neighbourhoods.", source: "OpenStreetMap · Overpass API" },
  "country-profile": { title: "Country profile", desc: "Reference statistics for the country currently being viewed, derived from the buildings loaded on screen plus that country's national statistics.", source: "EUBUCCO · Boverket EPC · national statistics" }
};
