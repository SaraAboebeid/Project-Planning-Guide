/* Swedish text for Step 5 (keyed by the English string; see ../index.ts). */
export const SV_STEP5: Record<string, string> = {
  /* ── Page header & actions ─────────────────────────────────────────── */
  "Renovation Planning · Step 5": "Renoveringsplanering · Steg 5",
  "Renovation Report": "Renoveringsrapport",
  "Everything from Steps 1-4, ready to share or save as PDF.": "Allt från steg 1–4, klart att dela eller spara som PDF.",
  "Download PDF": "Ladda ner PDF",
  "Raw data for further analysis": "Rådata för vidare analys",
  "Save as PDF": "Spara som PDF",
  "Allow pop-ups for this site to generate the PDF.": "Tillåt popup-fönster för den här webbplatsen för att skapa PDF:en.",
  "No simulation results yet. Go back to Step 4 and press \"Simulate\" on a package to generate its results.":
    "Inga simuleringsresultat ännu. Gå tillbaka till steg 4 och tryck på ”Simulera” vid ett renoveringspaket för att få dess resultat.",

  /* ── Location ──────────────────────────────────────────────────────── */
  "centre of drawn area": "mitten av ritat område",
  "centre of selected area": "mitten av valt område",
  "project location": "projektets läge",
  "{name} +{n} more": "{name} +{n} till",
  "Unknown location": "Okänd plats",

  /* ── Counts & generic words ────────────────────────────────────────── */
  "building": "byggnad",
  "buildings": "byggnader",
  "package": "renoveringspaket",
  "packages": "renoveringspaket",
  "component": "komponent",
  "components": "komponenter",
  "option": "alternativ",
  "options": "alternativ",
  "photo": "foto",
  "photos": "foton",
  "defect": "skada",
  "defects": "skador",
  "Building": "Byggnad",
  "Buildings": "Byggnader",
  "Building {n}": "Byggnad {n}",
  "Package": "Paket",
  "Package {n}": "Paket {n}",
  "Package #{n}": "Paket {n}",
  "Pkg {n}": "P{n}",
  "Step {n}": "Steg {n}",
  "Baseline": "Nuläge",
  "baseline": "nuläge",
  "Baseline (as-built)": "Nuläge (befintligt skick)",
  "all buildings": "alla byggnader",
  "All buildings": "Alla byggnader",
  "Total": "Totalt",
  "Yes": "Ja",
  "No": "Nej",
  "Done": "Klar",
  "Pending": "Väntar",
  "Assumptions": "Antaganden",

  /* ── Project summary & funnel ──────────────────────────────────────── */
  "Project Summary": "Projektsammanfattning",
  "building selected": "byggnad vald",
  "buildings selected": "byggnader valda",
  "flagged as priorities": "markerade som prioriterade",
  "baseline simulated": "simulerade i nuläge",
  "package tested": "renoveringspaket testat",
  "packages tested": "renoveringspaket testade",
  "Project type": "Projekttyp",
  "Scale": "Skala",
  "Location": "Plats",
  "Components": "Komponenter",
  "Systems in scope": "System som ingår",
  "KPIs": "Nyckeltal",
  "What was analysed": "Vad som analyserades",
  "Stage": "Steg",
  "Buildings / packages": "Byggnader / renoveringspaket",
  "What happened": "Vad som gjordes",
  "Step 2 — selection": "Steg 2 – urval",
  "Step 2 — prioritisation": "Steg 2 – prioritering",
  "Step 3 — baseline": "Steg 3 – nuläge",
  "Step 4 — packages": "Steg 4 – renoveringspaket",
  "<b>{n}</b> flagged": "<b>{n}</b> markerade",
  "<b>{n}</b> simulated": "<b>{n}</b> simulerade",
  "Selected on the map and reviewed against the available data.": "Valda på kartan och granskade mot tillgängliga data.",
  "Ranked by energy performance, façade condition and building characteristics.": "Rangordnade efter energiprestanda, fasadens skick och byggnadens egenskaper.",
  "As-built performance from EnergyPlus, the baseline everything is measured against.": "Prestanda i befintligt skick från EnergyPlus – nuläget som allt mäts mot.",
  "Each renovation package simulated against that baseline for energy, cost and carbon.": "Varje renoveringspaket simulerat mot detta nuläge för energi, kostnad och klimatpåverkan.",

  /* ── Buildings card ────────────────────────────────────────────────── */
  "Area": "Area",
  "Energy class": "Energiklass",
  "Energy class (est.)": "Energiklass (uppsk.)",
  "TABULA estimate": "TABULA-uppskattning",
  "EPC energy": "Energi enl. energideklaration",
  "EPSM baseline": "EPSM-nuläge",
  "Baseline status": "Status nuläge",

  /* ── Baseline energy ───────────────────────────────────────────────── */
  "Baseline Energy Performance": "Energiprestanda i nuläget",
  "As-built energy use by end use, kWh/m²·yr — the baseline every package is measured against.":
    "Energianvändning i befintligt skick per användningsområde, kWh/m²·år – nuläget som varje renoveringspaket mäts mot.",
  "Energy use by end use, {unit}": "Energianvändning per användningsområde, {unit}",
  "Total energy per package, {unit}": "Total energi per renoveringspaket, {unit}",
  "Energy use by end use, kWh/m²·yr.": "Energianvändning per användningsområde, kWh/m²·år.",
  "Total energy after renovation, kWh/m²·yr — baseline in grey.": "Total energianvändning efter renovering, kWh/m²·år – nuläget i grått.",
  "Heating": "Uppvärmning",
  "Hot water": "Tappvarmvatten",
  "Cooling": "Kyla",
  "Lighting": "Belysning",
  "Equipment": "Utrustning",
  "Gas per home": "Gas per bostad",
  "No baseline simulation recorded.": "Ingen simulering av nuläget sparad.",

  /* ── Facade condition ──────────────────────────────────────────────── */
  "Facade Condition": "Fasadens skick",
  "Facade Defect Detection": "Identifiering av fasadskador",
  "Photos analysed by the MBDD2025 defect detector with an AI vision second opinion — a screening aid, not a structural survey.":
    "Foton analyserade med skadedetektorn MBDD2025 och en andra bedömning med AI-bildanalys – ett hjälpmedel för screening, inte en konstruktionsbesiktning.",
  "Facade photos analysed by the MBDD2025 defect detector with an AI vision second opinion.":
    "Fasadfoton analyserade med skadedetektorn MBDD2025 och en andra bedömning med AI-bildanalys.",
  "Boxes and labels are drawn on the images exactly as reviewed in Step 2.": "Rutor och etiketter är ritade på bilderna precis som de granskades i steg 2.",
  "Detection is a screening aid, not a structural survey.": "Detekteringen är ett hjälpmedel för screening, inte en konstruktionsbesiktning.",
  "Facade": "Fasad",
  "Photos": "Foton",
  "Defects": "Skador",
  "Breakdown": "Fördelning",
  "not recorded per facade": "inte registrerat per fasad",
  "{side} facade": "{side}fasad",
  "{side} facade of {building}": "{side}fasad på {building}",
  "{pct}% confidence": "{pct} % säkerhet",
  "(AI vision)": "(AI-bildanalys)",
  "(ML model)": "(ML-modell)",
  "No defects detected on this photo.": "Inga skador upptäcktes på det här fotot.",
  "No defects detected": "Inga skador upptäcktes",
  "North": "Norr",
  "East": "Öst",
  "South": "Syd",
  "West": "Väst",
  "Crack": "Spricka",
  "Leakage / staining": "Läckage / missfärgning",
  "Spalling / abscission": "Avflagning / avspjälkning",
  "Corrosion": "Korrosion",
  "Bulge / deformation": "Utbuktning / deformation",
  "Other defect": "Annan skada",

  /* ── Materials & components ────────────────────────────────────────── */
  "Materials Selected for Testing": "Material valda för test",
  "simulated (cartesian product of above selections)": "simulerade (alla kombinationer av valen ovan)",
  "Walls": "Väggar",
  "Windows": "Fönster",
  "Doors": "Dörrar",
  "Floor": "Bjälklag",
  "Roof": "Tak",
  "Balcony": "Balkong",
  "Structure (Columns & Beams)": "Stomme (pelare och balkar)",
  "Vertical Extension (New Floor)": "Påbyggnad (ny våning)",
  "New roof": "Nytt tak",
  "New walls": "Nya väggar",
  "New floor": "Nytt bjälklag",
  "New windows": "Nya fönster",
  "New Roof": "Nytt tak",
  "New Walls": "Nya väggar",
  "New Floor": "Ny våning",
  "New Windows": "Nya fönster",
  "Component": "Komponent",
  "Material / assembly": "Material / konstruktion",
  "U-value": "U-värde",
  "No component detail recorded for this package.": "Inga komponentuppgifter sparade för det här renoveringspaketet.",
  "Materials": "Material",

  /* ── Energy comparison ─────────────────────────────────────────────── */
  "Energy Use Comparison": "Jämförelse av energianvändning",
  "Top {n} packages vs as-built baseline ({kwh})": "De {n} bästa renoveringspaketen jämfört med nuläget i befintligt skick ({kwh})",
  "best": "bäst",
  "saves energy": "sparar energi",
  "uses more than today": "använder mer än i dag",

  /* ── Chosen package per building ───────────────────────────────────── */
  "Chosen Package per Building": "Valt renoveringspaket per byggnad",
  "Chosen package per building": "Valt renoveringspaket per byggnad",
  "Selected building by building in Step 4 — a single portfolio-wide pick would average over real differences between them.":
    "Valt byggnad för byggnad i steg 4 – ett gemensamt val för hela beståndet skulle jämna ut verkliga skillnader mellan dem.",
  "Selected building by building in Step 4 — where a portfolio-wide pick would average over real differences between them.":
    "Valt byggnad för byggnad i steg 4 – där ett gemensamt val för hela beståndet skulle jämna ut verkliga skillnader mellan dem.",
  "Chosen package": "Valt renoveringspaket",
  "After": "Efter",
  "Reduction": "Minskning",
  "Energy in kWh/m²·yr.": "Energi i kWh/m²·år.",

  /* ── Recommendations ───────────────────────────────────────────────── */
  "Recommendations": "Rekommendationer",
  "Recommended packages — and what they are made of": "Rekommenderade renoveringspaket – och vad de består av",
  "Best energy saving": "Störst energibesparing",
  "largest reduction in energy use": "störst minskning av energianvändningen",
  "Lowest cost": "Lägst kostnad",
  "cheapest to build": "billigast att genomföra",
  "Lowest carbon": "Lägst klimatpåverkan",
  "largest CO₂e saving": "störst CO₂e-besparing",
  "Best balanced": "Bäst balanserat",
  "weighted 40% energy / 30% carbon / 30% cost": "viktat 40 % energi / 30 % klimat / 30 % kostnad",
  "saves <b>{n}</b> kWh/m²·yr": "sparar <b>{n}</b> kWh/m²·år",
  "kg CO₂e saved": "kg CO₂e sparat",
  "Energy use": "Energianvändning",
  "Saving": "Besparing",
  "CO₂e saved": "Sparad CO₂e",
  "Material cost": "Materialkostnad",
  "Energy": "Energi",
  "Cost": "Kostnad",

  /* ── All packages table ────────────────────────────────────────────── */
  "All simulated packages": "Alla simulerade renoveringspaket",
  "No packages simulated.": "Inga renoveringspaket simulerade.",
  "All {n} Packages — Ranked by Energy Saving": "Alla {n} renoveringspaket – rangordnade efter energibesparing",
  "Biggest energy saving": "Störst energibesparing",
  "Rank {n} by energy saving": "Plats {n} i energibesparing",
  "EnergyPlus (EPSM) results; packages are numbered as in Step 4, ★ marks the biggest energy saving.":
    "Resultat från EnergyPlus (EPSM); renoveringspaketen är numrerade som i steg 4, ★ markerar störst energibesparing.",
  "Cost and CO₂e are not reported for Belgium: no open Belgian retrofit cost or carbon data is wired in yet.":
    "Kostnad och CO₂e redovisas inte för Belgien: inga öppna belgiska data om renoveringskostnad eller klimatpåverkan är inkopplade ännu.",
  "CO₂e saved is operational, per m² a year, at the heating carbon factor used in Step 4":
    "Sparad CO₂e avser driftens klimatpåverkan, per m² och år, med uppvärmningens emissionsfaktor från steg 4",
  "(Gothenburg district heating, 0.022 kg CO₂e/kWh)": "(Göteborgs fjärrvärme, 0,022 kg CO₂e/kWh)",
  "Cost is the package's total material cost.": "Kostnaden är renoveringspaketets totala materialkostnad.",

  /* ── Summary & recommendation ──────────────────────────────────────── */
  "Summary & Recommendation": "Sammanfattning och rekommendation",
  "Based on the EPSM simulation of {packages} across {components}, the analysis identifies the following recommended strategy:":
    "Utifrån EPSM-simuleringen av {packages} för {components} pekar analysen ut följande rekommenderade strategi:",
  "{n} renovation packages": "{n} renoveringspaket",
  "Recommended Package #{n} — Best Balance of Cost, Energy & Carbon": "Rekommenderat paket {n} – bäst balans mellan kostnad, energi och klimat",
  "This package achieves a {saving} reduction in annual energy use (from {from} to {to}).":
    "Paketet minskar den årliga energianvändningen med {saving} (från {from} till {to}).",
  "This package achieves a {saving} reduction in annual energy use (from {from} to {to}), saving an estimated {carbon} of operational carbon per year, at a material cost of {cost}.":
    "Paketet minskar den årliga energianvändningen med {saving} (från {from} till {to}) och minskar driftens klimatpåverkan med uppskattningsvis {carbon} per år, till en materialkostnad på {cost}.",
  "Cost and carbon are not assessed for Belgium yet, so this ranking is by energy alone.":
    "Kostnad och klimatpåverkan bedöms ännu inte för Belgien, så rangordningen bygger enbart på energi.",
  "If cost is the primary constraint, {pkg} offers the lowest material cost at {cost} while still saving {saving}.":
    "Om kostnaden är den viktigaste begränsningen har {pkg} lägst materialkostnad, {cost}, och sparar ändå {saving}.",
  "For maximum carbon impact, {pkg} saves {carbon} of CO₂e per year.":
    "För största möjliga klimatnytta: {pkg} sparar {carbon} CO₂e per år.",

  /* ── City climate target ───────────────────────────────────────────── */
  "City climate target": "Stadens klimatmål",
  "Per-building goal": "Mål per byggnad",
  "Official target:": "Officiellt mål:",
  "Source:": "Källa:",
  "Headline goal:": "Övergripande mål:",
  "{pkg} reaches −{pct}%, meeting the target": "{pkg} når −{pct} % och når därmed målet",
  "({n} packages meet it)": "({n} renoveringspaket når det)",
  "No package reaches the −{target}% target yet — closest is {pkg} at {pct}": "Inget renoveringspaket når målet −{target} % ännu – närmast är {pkg} med {pct}",
  "(worse than baseline)": "(sämre än nuläget)",
  "Reduction vs baseline": "Minskning jämfört med nuläget",
  "Meets −{pct}% target": "Når målet −{pct} %",
  "every building to ≤ {kwh} kWh/m²·yr": "varje byggnad till ≤ {kwh} kWh/m²·år",
  "each building's own −{pct}% target": "varje byggnads eget mål −{pct} %",
  "Goal ≤ {kwh}": "Mål ≤ {kwh}",
  "Goal −{pct}%": "Mål −{pct} %",
  "{met}/{total} meet": "{met}/{total} når målet",
  "{pp}pp short": "{pp} p.e. kvar",
  "Values in kWh/m²·yr · pp = percentage points short of the building's target.": "Värden i kWh/m²·år · p.e. = procentenheter kvar till byggnadens mål.",
  "values in kWh/m²·yr · pp = percentage points short": "värden i kWh/m²·år · p.e. = procentenheter kvar",
  "Buildings at band {band} or better: {met}/{total} today": "Byggnader i klass {band} eller bättre: {met}/{total} i dag",
  "(est.)": "(uppsk.)",
  "Today (certificate)": "I dag (energicertifikat)",
  "Package bands are estimates: each building's certificate SAP, moved by the simulated change in fuel use (SAP 2012 energy-cost factor).":
    "Klasserna för renoveringspaketen är uppskattningar: byggnadens SAP-värde enligt certifikatet, justerat med den simulerade förändringen i bränsleanvändning (SAP 2012:s energikostnadsfaktor).",
  "No certificate SAP — starts from the middle of its band.": "Inget SAP-värde i certifikatet – utgår från mitten av sin klass.",

  // ClimateGoalPanel
  "{pkg} reaches {kwh}, within the ≤ {target} target": "{pkg} når {kwh}, inom målet ≤ {target}",
  "({n} packages do)": "({n} renoveringspaket gör det)",
  "No package reaches ≤ {target} yet — closest is {pkg} at {kwh}, {diff} above": "Inget renoveringspaket når ≤ {target} ännu – närmast är {pkg} med {kwh}, {diff} över",
  "Simulate a package to measure it against the target": "Simulera ett renoveringspaket för att mäta det mot målet",
  "No package reaches the target yet — closest is {pkg} at {pct}": "Inget renoveringspaket når målet ännu – närmast är {pkg} med {pct}",
  "≤ {kwh} kWh/m² BY {year}": "≤ {kwh} kWh/m² TILL {year}",
  "−{pct}% BY {year}": "−{pct} % TILL {year}",
  "NATIONAL": "NATIONELLT",
  "REGIONAL": "REGIONALT",
  "As-built today": "Befintligt skick i dag",
  "Hide materials": "Dölj material",
  "Show the materials in this package": "Visa materialen i det här renoveringspaketet",
  "Target ≤ {kwh} kWh/m²·yr": "Mål ≤ {kwh} kWh/m²·år",
  "Target −{pct}%": "Mål −{pct} %",
  "{n} kWh/m²·yr above the target": "{n} kWh/m²·år över målet",
  "EU target: −55% net greenhouse-gas emissions by 2030 vs 1990": "EU-mål: −55 % nettoutsläpp av växthusgaser till 2030 jämfört med 1990",
  "The European Union's binding climate target (European Climate Law). Shown for reference; it is an economy-wide emissions target, not scored per building.":
    "EU:s bindande klimatmål (den europeiska klimatlagen). Visas som referens; det är ett utsläppsmål för hela ekonomin och bedöms inte per byggnad.",
  "≤ {kwh} kWh/m²·yr target · simulated energy use, kWh/m²·yr (+n = above the target)":
    "mål ≤ {kwh} kWh/m²·år · simulerad energianvändning, kWh/m²·år (+n = över målet)",
  "−{pct}% target · reduction vs baseline energy demand": "mål −{pct} % · minskning jämfört med energibehovet i nuläget",
  "{met} of {n} {buildings} are at band {band} or better today — simulate a package to see where it takes them":
    "{met} av {n} {buildings} har klass {band} eller bättre i dag – simulera ett renoveringspaket för att se var det tar dem",
  "{pkg} brings {met} of {total} {buildings} to band {band} or better (estimated) — {today} today":
    "{pkg} tar {met} av {total} {buildings} till klass {band} eller bättre (uppskattat) – {today} i dag",
  "No package brings a building to band {band} yet (estimated) — {met} of {n} are there today":
    "Inget renoveringspaket tar någon byggnad till klass {band} ännu (uppskattat) – {met} av {n} är där i dag",
  "EPC {band} BY {year}": "ENERGIKLASS {band} TILL {year}",
  "Today (certificates)": "I dag (energicertifikat)",
  "{met}/{total} at {band}+": "{met}/{total} i klass {band} eller bättre",
  "Today": "I dag",
  "No certificate SAP: starts from the middle of its band": "Inget SAP-värde i certifikatet: utgår från mitten av sin klass",
  "Band (SAP score) · package bands are estimates: the certificate's SAP moved by the simulated change in fuel use.":
    "Klass (SAP-poäng) · klasserna för renoveringspaketen är uppskattningar: certifikatets SAP-värde justerat med den simulerade förändringen i bränsleanvändning.",
  "{n} building has no certificate SAP and start from the middle of their band.": "{n} byggnad saknar SAP-värde i certifikatet och utgår från mitten av sin klass.",
  "{n} buildings have no certificate SAP and start from the middle of their band.": "{n} byggnader saknar SAP-värde i certifikatet och utgår från mitten av sin klass.",

  // ClimateGoalBuildingTable
  "Every building must reach ≤ {kwh} kWh/m²·yr, so each needs a different cut from its own baseline. A package \"meets\" the target for a building when that building gets there.":
    "Varje byggnad måste nå ≤ {kwh} kWh/m²·år, så var och en behöver olika stor minskning från sitt eget nuläge. Ett renoveringspaket ”når målet” för en byggnad när just den byggnaden kommer dit.",
  "Each building's own target is its baseline cut by {pct}%. A package \"meets\" the target for a building when that building reaches its own −{pct}% line.":
    "Varje byggnads eget mål är dess nuläge minskat med {pct} %. Ett renoveringspaket ”når målet” för en byggnad när just den byggnaden når sin egen gräns på −{pct} %.",
  "Meets target (≤ {kwh} kWh/m²·yr)": "Når målet (≤ {kwh} kWh/m²·år)",
  "Meets target (≥ −{pct}%)": "Når målet (≥ −{pct} %)",
  "Below target (reduces, not enough)": "Under målet (minskar, men inte tillräckligt)",
  "No reduction vs baseline": "Ingen minskning jämfört med nuläget",

  /* ── Solar (PV) ────────────────────────────────────────────────────── */
  "Solar Production Potential (Rooftop PV)": "Potential för solelproduktion (solceller på tak)",
  "Solar production potential (rooftop PV)": "Potential för solelproduktion (solceller på tak)",
  "Fetching PVGIS estimates for the buildings…": "Hämtar PVGIS-uppskattningar för byggnaderna …",
  "Panels on the roofs of the {n} {buildings} could produce about {production} from {kwp} kWp installed.":
    "Solpaneler på taken på de {n} {buildings} skulle kunna producera omkring {production} från {kwp} kWp installerad effekt.",
  "{mwh} MWh of electricity a year": "{mwh} MWh el per år",
  "About <b>{mwh} MWh of electricity a year</b> from {kwp} kWp on the roofs of {n} {buildings}.":
    "Omkring <b>{mwh} MWh el per år</b> från {kwp} kWp på taken på {n} {buildings}.",
  "Set all roofs to": "Sätt alla tak till",
  "covered with panels — or adjust each building below": "täckt med solpaneler – eller justera varje byggnad nedan",
  "Roof covered with panels": "Andel tak med solpaneler",
  "Roof covered": "Andel tak täckt",
  "Panel area": "Panelyta",
  "System size": "Systemstorlek",
  "Annual production": "Årlig produktion",
  "saved from the 3D viewer": "sparat från 3D-vyn",
  "no result": "inget resultat",
  "Share of {address} roof covered with panels": "Andel av taket på {address} med solpaneler",
  "Share of the roof covered with panels": "Andel av taket med solpaneler",
  "Calculation: PVGIS v5.2 by the EU Joint Research Centre, using its satellite-based solar radiation data for each building's location.":
    "Beräkning: PVGIS v5.2 från EU:s gemensamma forskningscentrum (JRC), med dess satellitbaserade solinstrålningsdata för varje byggnads läge.",
  "Roof covered with panels: set per building with the slider (default 80% of the footprint, leaving the rest for edges, hatches and equipment). Production scales in proportion: the building's PVGIS yield per kWp × the system size.":
    "Andel tak med solpaneler: anges per byggnad med reglaget (standard 80 % av byggnadens fotavtryck; resten lämnas för takkanter, takluckor och installationer). Produktionen skalas proportionellt: byggnadens PVGIS-utbyte per kWp × systemstorleken.",
  "System size: 0.2 kWp per m² of usable roof (about 5 m² of roof per kWp).":
    "Systemstorlek: 0,2 kWp per m² användbar takyta (cirka 5 m² tak per kWp).",
  "Panels: crystalline silicon, tilted 35° and facing south.": "Paneler: kristallint kisel, 35° lutning och söderorientering.",
  "System losses: 14% (cables, inverter, dirt and temperature effects).": "Systemförluster: 14 % (kablar, växelriktare, smuts och temperatureffekter).",
  "Not modelled: the real roof shape and slope, obstructions (chimneys, vents) and shading from neighbouring buildings or trees — treat it as a screening estimate.":
    "Modelleras inte: takets verkliga form och lutning, hinder (skorstenar, ventilationshuvar) och skuggning från grannbyggnader eller träd – se resultatet som en översiktlig uppskattning.",

  /* ── Heating system (HVAC) ─────────────────────────────────────────── */
  "Heating System (HVAC)": "Uppvärmningssystem (VVS)",
  "On the building's {demand} heat demand, the chosen system is {system}{note} — delivering {delivered} at {cost} and {carbon}":
    "Med byggnadens värmebehov på {demand} är det valda systemet {system}{note} – det levererar {delivered} för {cost} och ger {carbon}",
  "(the as-built baseline)": "(nuläget i befintligt skick)",
  "{cost}% cost, {carbon}% carbon vs {ref}": "{cost} % kostnad, {carbon} % klimatpåverkan jämfört med {ref}",
  "the existing gas boiler": "den befintliga gaspannan",
  "district heating": "fjärrvärme",
  "System": "System",
  "SPF/eff.": "SPF/verkn.grad",
  "Delivered": "Köpt energi",
  "Op. cost/yr": "Driftkostnad/år",
  "Carbon/yr": "Klimatpåverkan/år",
  "Install": "Installation",
  "30-yr LCC": "LCC 30 år",
  "LCC": "LCC",
  "chosen": "valt",
  "Heat demand from EnergyPlus (EPSM); system economics are a supply-side layer (delivered = demand ÷ SPF).":
    "Värmebehov från EnergyPlus (EPSM); systemens ekonomi är ett lager ovanpå på tillförselsidan (levererad = behov ÷ SPF).",
  "Values are {defaults} — see the tool's Heating-system panel for sources.": "Värdena är {defaults} – se verktygets panel för uppvärmningssystem för källor.",
  "UK defaults (Ofgem price cap, DESNZ carbon factors and install costs)": "brittiska standardvärden (Ofgems pristak, DESNZ emissionsfaktorer och installationskostnader)",
  "Swedish defaults": "svenska standardvärden",

  /* ── Downloadable report: cover & footer ───────────────────────────── */
  "Building Renovation Analysis": "Analys av byggnadsrenovering",
  "no components": "inga komponenter",
  "Generated": "Skapad",
  "Prepared by": "Utarbetad av",
  "Renovation packages tested": "Testade renoveringspaket",
  "Every package below was simulated against the as-built baseline above, on the same buildings.":
    "Varje renoveringspaket nedan simulerades mot nuläget ovan, på samma byggnader.",
  "Energy from EnergyPlus (EPSM) single-zone shoebox simulation": "Energi från EnergyPlus (EPSM), enzonig skokartongsmodell",
  "as-built and refurbished U-values from TABULA Belgium (VITO, EPISCOPE)": "U-värden för befintligt skick och efter renovering från TABULA Belgien (VITO, EPISCOPE)",
  "weather: {station} TMYx": "klimatdata: {station} TMYx",
  "footprints from the PICC and heights from Bâtiments 3D LoD1 (SPW, CC BY 4.0), addresses from BeST (BOSA, CC BY 4.0)":
    "byggnadsytor från PICC och höjder från Bâtiments 3D LoD1 (SPW, CC BY 4.0), adresser från BeST (BOSA, CC BY 4.0)",
  "footprints and addresses from UrbIS (paradigm.brussels, CC0), heights from UrbIS 3D":
    "byggnadsytor och adresser från UrbIS (paradigm.brussels, CC0), höjder från UrbIS 3D",
  "construction period sampled from Statbel's building stock unless OpenStreetMap records a year.":
    "byggperioden slumpas utifrån Statbels byggnadsbestånd om inte OpenStreetMap anger ett årtal.",
  "Belgium publishes no open per-building EPCs, so there is no baseline energy class.":
    "Belgien publicerar inga öppna energideklarationer per byggnad, så det finns ingen energiklass för nuläget.",
  "No open Belgian retrofit cost or carbon data is wired in yet, so packages are not costed.":
    "Inga öppna belgiska data om renoveringskostnad eller klimatpåverkan är inkopplade ännu, så renoveringspaketen är inte kostnadsberäknade.",
  "Heating is ideal loads (heat delivered, not fuel); the model is not yet calibrated against Belgian EPB certificate statistics.":
    "Uppvärmningen är ideala laster (levererad värme, inte bränsle); modellen är ännu inte kalibrerad mot statistik från belgiska EPB-certifikat.",
  "as-built and refurbished U-values from TABULA GB (BRE, EPISCOPE)": "U-värden för befintligt skick och efter renovering från TABULA GB (BRE, EPISCOPE)",
  "Baseline energy class, SAP, floor area and heating from the MHCLG EPC register (OGL v3.0), matched to buildings via OS Open UPRN; buildings without a certificate carry a band estimated from the English Housing Survey 2024-25.":
    "Energiklass i nuläget, SAP, golvarea och uppvärmning från MHCLG:s EPC-register (OGL v3.0), kopplade till byggnaderna via OS Open UPRN; byggnader utan certifikat har en klass uppskattad från English Housing Survey 2024–25.",
  "Hot water uses the tool's Swedish Sveby draw profile, not a UK SAP assumption.":
    "Varmvattnet följer verktygets svenska Sveby-tappprofil, inte ett brittiskt SAP-antagande.",
  "U-values per EN ISO 6946": "U-värden enligt EN ISO 6946",
  "cost from Wikells Sektionsfakta": "kostnader från Wikells Sektionsfakta",
  "embodied carbon A1–A5 (production, transport, installation incl. waste) from Boverket Klimatdatabas; replacements and end-of-life not included":
    "inbyggd klimatpåverkan A1–A5 (produktion, transport, montage inkl. spill) från Boverkets klimatdatabas; utbyten och slutskede ingår inte",
  "All material costs are net of a {pct}% supplier discount entered in Step 4.":
    "Alla materialkostnader är netto efter en leverantörsrabatt på {pct} % som angavs i steg 4.",
  "Costs are installed capex (materials + labour); they exclude energy, maintenance and replacement.":
    "Kostnaderna är investeringskostnad inklusive montage (material + arbete); energi, underhåll och utbyten ingår inte.",
  "baseline energy class from Boverket EPC.": "energiklass för nuläget från Boverkets energideklarationer.",
  "Homes use Sveby 2.0 standard use: hot water as reported in the building's energy declaration, otherwise Sveby's 21 kWh/m²·yr.":
    "Bostäder använder Sveby 2.0 standardiserat brukande: varmvatten enligt byggnadens energideklaration, annars Svebys 21 kWh/m²·år.",
  "Household and business electricity is simulated for its heat but, as in Swedish energy declarations, not counted in the totals or shown.":
    "Hushålls- och verksamhetsel simuleras för sitt värmetillskott men räknas, som i svenska energideklarationer, inte med i totalerna och visas inte.",
  "Cooling reads 0 because EPSM's end-use table carries only electricity and district heating; the hourly trace does show ideal-loads cooling, which a single-zone model with no openable windows overstates.":
    "Kyla visas som 0 eftersom EPSM:s tabell över användningsområden bara innehåller el och fjärrvärme; timserien visar kyla från ideala laster, som en enzonsmodell utan öppningsbara fönster överskattar.",
  // ── City climate targets (config/climateGoals.ts) ──
  "{city} climate target": "Klimatmål för {city}",
  "Malmö building-energy climate target": "Malmös klimatmål för byggnaders energianvändning",
  "National target": "Nationellt mål",
  "Regional target": "Regionalt mål",
  "City target": "Stadens mål",
  "{whose}: reach ≤ {kwh} kWh/m²·yr by {year} — a −{pct}% cut from this baseline.": "{whose}: nå högst {kwh} kWh/m²·år till {year} – en minskning med {pct} % från detta nuläge.",
  "{whose}: reach EPC band {band} or better by {year}.": "{whose}: nå energiklass {band} eller bättre till {year}.",
  "{whose} for {year} — shown for context, not scored.": "{whose} för {year} – visas som bakgrund, bedöms inte.",
  "{whose}: reduce energy use by {pct}% by {year}, measured here against the as-built baseline.": "{whose}: minska energianvändningen med {pct} % till {year}, mätt här mot nuläget.",
  "Sweden's national goal: energy use per heated m² in homes and premises −50% by 2050 vs 1995. No local building-energy target was found for this municipality.": "Sveriges nationella mål: energianvändningen per uppvärmd m² i bostäder och lokaler ska minska med 50 % till 2050 jämfört med 1995. Inget lokalt mål för byggnaders energianvändning hittades för kommunen.",
  "Primary energy use in homes and premises −30% by 2030 vs 2010 (city-wide, per inhabitant). The city's own housing companies translate it into 84 kWh/m² PET for homes, 130 for premises.": "Primärenergianvändningen i bostäder och lokaler ska minska med 30 % till 2030 jämfört med 2010 (hela staden, per invånare). Stadens egna bostadsbolag har översatt det till 84 kWh/m² primärenergital för bostäder och 130 för lokaler.",
  "Climate footprint close to zero by 2030": "Klimatavtryck nära noll till 2030",
  "Specific energy use (kWh/m², from energy declarations) of Malmö's buildings −15% by 2030 vs 2019.": "Den specifika energianvändningen (kWh/m², enligt energideklarationerna) i Malmös byggnader ska minska med 15 % till 2030 jämfört med 2019.",
  "Area emissions −70% vs 1990; 100% renewable or recycled energy by 2030": "Utsläppen inom kommunen −70 % jämfört med 1990; 100 % förnybar eller återvunnen energi till 2030",
  "Climate-positive by 2030, fossil-free by 2040 (Miljöprogram 2030)": "Klimatpositivt till 2030, fossilfritt till 2040 (Miljöprogram 2030)",
  "No current local climate target found (the 2015–2020 strategy has expired)": "Inget aktuellt lokalt klimatmål hittades (strategin för 2015–2020 har löpt ut)",
  "Municipal group fossil-independent by 2030; area climate-neutral 2040": "Kommunkoncernen fossiloberoende till 2030; kommunen klimatneutral 2040",
  "Follows Örebro county's net zero by 2045": "Följer Örebro läns mål om nettonollutsläpp till 2045",
  "About 40% less heat demand in London's buildings by 2030 (the Mayor's net-zero-2030 pathway). It is a HEAT target; here it is applied to total energy, which is harder to cut by 40%.": "Omkring 40 % lägre värmebehov i Londons byggnader till 2030 (borgmästarens färdplan för netto noll 2030). Det är ett mål för VÄRME; här tillämpas det på den totala energin, som är svårare att minska med 40 %.",
  "Net zero by 2030": "Netto noll till 2030",
  "Council homes to reach EPC band C (SAP 69+) by 2030; private rented homes must reach EPC C by October 2030 nationally. Each package's band is estimated from the building's own certificate, moved by the simulated change in energy use.": "Kommunens bostäder ska nå energiklass C (SAP 69+) till 2030; privata hyresbostäder måste nå klass C senast oktober 2030 enligt nationella regler. Varje pakets klass uppskattas utifrån byggnadens eget certifikat, justerat med den simulerade förändringen i energianvändning.",
  "Council net zero by 2030; borough net zero by 2040": "Kommunen netto noll till 2030; hela kommunområdet netto noll till 2040",
  "RENOLUTION / CoBrACE: average residential primary energy ≤100 kWh/m²·yr (PEB) by 2050, with renovation obligations to class E (≤275) by 2033 and then class C (≤150). Compared here with simulated delivered energy, so the check is approximate.": "RENOLUTION / CoBrACE: genomsnittlig primärenergi i bostäder högst 100 kWh/m²·år (PEB) till 2050, med renoveringskrav till klass E (≤275) senast 2033 och därefter klass C (≤150). Jämförs här med simulerad köpt energi, så kontrollen är ungefärlig.",
  "−47% greenhouse gases by 2030 vs 2005; carbon neutral by 2050": "Växthusgaser −47 % till 2030 jämfört med 2005; klimatneutralt till 2050",
  "Wallonia's renovation strategy: average housing PEB label A (≤85 kWh/m²·yr) by 2050. Liège has no building-energy target of its own. Compared with simulated delivered energy, so the check is approximate.": "Valloniens renoveringsstrategi: bostäder i genomsnitt PEB-klass A (≤85 kWh/m²·år) till 2050. Liège har inget eget mål för byggnaders energianvändning. Jämförs med simulerad köpt energi, så kontrollen är ungefärlig.",
  "Liège: −55% CO₂ by 2030 vs 2005 (Covenant of Mayors)": "Liège: −55 % CO₂ till 2030 jämfört med 2005 (Borgmästaravtalet)",
  "Flanders: every home at EPC label A by 2050; buyers of E/F homes must reach label D within 6 years. Ghent has no kWh target of its own, and the label-A threshold is not verified here, so it is not scored.": "Flandern: alla bostäder i energiklass A till 2050; köpare av bostäder i klass E/F måste nå klass D inom 6 år. Gent har inget eget kWh-mål och gränsen för klass A är inte verifierad här, så målet bedöms inte.",
  "−40% CO₂ by 2030 vs 2007; climate-neutral by 2050": "−40 % CO₂ till 2030 jämfört med 2007; klimatneutralt till 2050",

  // ── 50-year study period ──
  "50-yr LCC": "LCC 50 år",
  // ── 2026-11-24: per-building packages, merged Packages & results, chart ──
  "Change": "Förändring",
  "Embodied carbon": "Inbyggd klimatpåverkan",
  "No renovation chosen": "Ingen renovering vald",
  "Whole project": "Hela projektet",
  "{c} of {n} buildings renovated": "{c} av {n} byggnader renoveras",
  "Energy in kWh/m²·yr; the whole-project figure is weighted by each building's floor area. Cost is the renovation itself, one-off.": "Energi i kWh/m²·år; värdet för hela projektet är viktat efter varje byggnads golvyta. Kostnaden är själva renoveringen, en gång.",
  "the building outline was too low for the number of floors in the energy declaration, so these buildings were simulated at floors × 3.2 m instead": "byggnadens kontur var för låg för antalet våningar i energideklarationen, så dessa byggnader simulerades i stället med våningar × 3,2 m",
};
