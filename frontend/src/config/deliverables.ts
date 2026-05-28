/** Shared deliverables catalog used by Step 4 and Step 5 */

export type Deliverable = [string, string];

export const DELIVERABLES: Record<string, Deliverable[]> = {
  "Building Condition": [
    ["Building Condition Assessment", "Current state of fabric, systems, and services"],
    ["Energy Performance Baseline",   "Current EUI and carbon intensity"],
    ["EPC / Certification Impact",    "Predicted rating improvement"],
  ],
  "Retrofit Measures": [
    ["Retrofit Measure Catalog",    "Prioritized list of improvement interventions"],
    ["Energy Savings Potential",    "kWh and % reduction per measure"],
    ["Carbon Reduction Pathway",    "kgCO₂e savings per intervention"],
    ["Cost-Benefit Analysis",       "CAPEX, payback, NPV per measure"],
    ["Embodied Carbon of Retrofit", "kgCO₂e from new materials and works"],
  ],
  "Building Geometry": [
    ["Building Footprint & Orientation", "Floor area, height, cardinal orientation"],
    ["Roof / Façade Area Assessment",    "Available surface area for solar installations"],
  ],
  "Energy Demand": [
    ["Annual Electricity Consumption", "Total kWh per year per building"],
    ["Annual Heating Demand",          "Thermal energy demand (kWh)"],
    ["Monthly / Hourly Load Profiles", "Demand curves for sizing and simulation"],
  ],
  "PV System": [
    ["Incident Radiation Analysis",                "Annual & seasonal solar irradiance maps (kWh/m²)"],
    ["Optimal PV Panel Placement & Coverage %",    "Best tilt, azimuth, and usable area"],
    ["Energy Yield Estimate",                      "Annual PV production (kWh/yr)"],
    ["Self-Consumption Ratio",                     "Share of PV output consumed on-site"],
    ["ROI / Payback Period",                       "Return on investment and simple payback (years)"],
    ["LCOE",                                       "Levelized cost of energy over system lifetime"],
  ],
  "Site & Climate": [
    ["Wind & Solar Resource Assessment", "Irradiance / wind speed characterization"],
    ["Shading Analysis",                 "Impact of obstacles on energy yield"],
  ],
  "System Design": [
    ["Capacity & Layout Optimization", "Sizing and placement of generation assets"],
    ["Annual Energy Production",       "Expected kWh/yr from the designed system"],
    ["Financial Analysis",             "ROI, payback period, LCOE over system lifetime"],
  ],
};

export const CROSS_CUTTING: Deliverable[] = [
  ["Executive Summary",         "High-level findings and recommendations for decision-makers"],
  ["Limitations & Assumptions", "Methodology caveats, data gaps, and proxy impacts"],
  ["Methodology Statement",     "Tools, standards, and data sources used"],
];

export function getDeliverableSections(
  projectType: string | null,
  systems: string[],
): [string, Deliverable[]][] {
  const sys = new Set(systems);
  if (projectType === "Renovation Planning") {
    return [
      ["Building Condition", DELIVERABLES["Building Condition"]!],
      ["Retrofit Measures",  DELIVERABLES["Retrofit Measures"]!],
    ];
  }
  if (projectType === "Energy Community Planning") {
    const sects: [string, Deliverable[]][] = [
      ["Building Geometry", DELIVERABLES["Building Geometry"]!],
      ["Energy Demand",     DELIVERABLES["Energy Demand"]!],
    ];
    if (sys.has("Rooftop PV") || sys.has("Community PV") || sys.has("Facade PV"))
      sects.push(["PV System", DELIVERABLES["PV System"]!]);
    return sects;
  }
  if (projectType === "Renewable Energy Planning") {
    return [
      ["Site & Climate", DELIVERABLES["Site & Climate"]!],
      ["System Design",  DELIVERABLES["System Design"]!],
    ];
  }
  return [];
}
