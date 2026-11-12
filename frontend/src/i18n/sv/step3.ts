/* Swedish text for Step 3 (keyed by the English string; see ../index.ts). */
export const SV_STEP3: Record<string, string> = {
  // ── Page header ──
  "Renovation Planning · Step 3": "Renoveringsplanering · Steg 3",
  "Select & Baseline": "Urval och nuläge",
  "Simulate the as-built performance of the selected buildings — the baseline every renovation package is measured against.":
    "Simulera de valda byggnadernas nuvarande prestanda – nuläget som varje renoveringspaket jämförs med.",
  "Simulate the as-built performance of the selected building — the baseline every renovation package is measured against.":
    "Simulera den valda byggnadens nuvarande prestanda – nuläget som varje renoveringspaket jämförs med.",

  // ── Building selection ──
  "No buildings loaded yet — go back to Step 2 to select buildings.":
    "Inga byggnader är inlästa än – gå tillbaka till steg 2 för att välja byggnader.",
  "{n} of {total} buildings selected": "{n} av {total} byggnader valda",
  "{n} of {total} building selected": "{n} av {total} byggnad vald",
  "Use Step 2 shortlist": "Använd urvalet från steg 2",
  "Select all": "Välj alla",
  "Clear": "Rensa",
  "Step 2 flagged top priorities: {n} building. These are the default buildings that will run baseline energy simulation in Step 3.":
    "Steg 2 pekade ut högst prioriterade: {n} byggnad. Det är de byggnader som som standard får en nulägessimulering i steg 3.",
  "Step 2 flagged top priorities: {n} buildings. These are the default buildings that will run baseline energy simulation in Step 3.":
    "Steg 2 pekade ut högst prioriterade: {n} byggnader. Det är de byggnader som som standard får en nulägessimulering i steg 3.",
  "Click a building to include or exclude it from the baseline run.":
    "Klicka på en byggnad för att ta med den i eller ta bort den från nulägessimuleringen.",
  "{n} outbuilding (sheds, garages — usually unheated) is left out by default; click to include.":
    "{n} komplementbyggnad (förråd, garage – oftast ouppvärmda) är bortvald som standard; klicka för att ta med den.",
  "{n} outbuildings (sheds, garages — usually unheated) are left out by default; click to include.":
    "{n} komplementbyggnader (förråd, garage – oftast ouppvärmda) är bortvalda som standard; klicka för att ta med dem.",
  "Click to exclude": "Klicka för att ta bort",
  "Click to include": "Klicka för att ta med",
  "Running…": "Kör …",
  "Run baseline energy simulation (EPSM) for {n} buildings": "Kör nulägessimuleringen (EPSM) för {n} byggnader",
  "Run baseline energy simulation (EPSM) for {n} building": "Kör nulägessimuleringen (EPSM) för {n} byggnad",
  "Re-run baseline energy simulation (EPSM) for {n} buildings": "Kör om nulägessimuleringen (EPSM) för {n} byggnader",
  "Re-run baseline energy simulation (EPSM) for {n} building": "Kör om nulägessimuleringen (EPSM) för {n} byggnad",

  // ── Baseline simulation card ──
  "Baseline Energy Simulation": "Nulägessimulering av energi",
  "Baseline complete": "Nuläget är klart",
  "Running EPSM simulation — please wait…": "EPSM-simuleringen körs – vänta …",
  "Send {n} buildings to EPSM to compute the as-built baseline. Missing envelope details fall back to TABULA archetype defaults, so the run always completes.":
    "Skicka {n} byggnader till EPSM för att beräkna nuläget. Saknade uppgifter om klimatskalet ersätts med standardvärden från TABULA-typbyggnader, så körningen blir alltid klar.",
  "Send {n} building to EPSM to compute the as-built baseline. Missing envelope details fall back to TABULA archetype defaults, so the run always completes.":
    "Skicka {n} byggnad till EPSM för att beräkna nuläget. Saknade uppgifter om klimatskalet ersätts med standardvärden från TABULA-typbyggnader, så körningen blir alltid klar.",
  "Select at least one building above to run the baseline.":
    "Välj minst en byggnad ovan för att köra nulägessimuleringen.",
  "Running EnergyPlus for each building…": "Kör EnergyPlus för varje byggnad …",
  "Baseline simulation failed: {error}": "Nulägessimuleringen misslyckades: {error}",

  // ── Results ──
  "EPSM Baseline Results": "Resultat från nulägessimuleringen (EPSM)",
  "Download JSON": "Ladda ner JSON",
  "Download CSV": "Ladda ner CSV",
  "Annual end-use comparison": "Jämförelse av årlig energianvändning per användning",
  "Compare all buildings together, or inspect one building's annual EPSM end-use split. For monthly and hourly profiles, see the load-profile panel below.":
    "Jämför alla byggnader tillsammans eller granska hur en byggnads årliga energianvändning fördelar sig enligt EPSM. Profiler per månad och per timme finns i lastprofilpanelen nedan.",
  "All buildings": "Alla byggnader",
  "One building": "En byggnad",
  "Building": "Byggnad",
  "Building {n}": "Byggnad {n}",
  "Height corrected:": "Höjden justerad:",
  "the building outline was too low for the number of floors in the energy declaration, so this building was simulated at floors × 3.2 m instead —":
    "byggnadens kontur var för låg för antalet våningar i energideklarationen, så byggnaden simulerades i stället med våningar × 3,2 m –",
  "the building outline was too low for the number of floors in the energy declaration, so {n} buildings were simulated at floors × 3.2 m instead —":
    "byggnadens kontur var för låg för antalet våningar i energideklarationen, så {n} byggnader simulerades i stället med våningar × 3,2 m –",
  "{address}: {floors} floors, {from} m → {to} m": "{address}: {floors} våningar, {from} m → {to} m",
  "The outline may belong to a lower wing or be linked to the wrong declaration, so treat these results with care.":
    "Konturen kan höra till en lägre flygel eller vara kopplad till fel energideklaration, så tolka resultaten med försiktighet.",
  "{n} of {total} buildings in this comparison are types the model cannot represent (swimming pools, hospitals, industrial process buildings). Select them individually to see which.":
    "{n} av {total} byggnader i jämförelsen är typer som modellen inte kan återge (simhallar, sjukhus, industribyggnader med processer). Välj dem en och en för att se vilka.",

  // End uses (chart series, legend, tiles)
  "Heating": "Uppvärmning",
  "Hot water": "Tappvarmvatten",
  "Cooling": "Kyla",
  "Lighting": "Belysning",
  "Equipment": "Utrustning",
  "Total": "Totalt",
  "Total energy use": "Total energianvändning",
  "Heating demand": "Värmebehov",
  "Cooling demand": "Kylbehov",

  // UK gas
  "Gas use:": "Gasanvändning:",
  "{n} kWh/yr for the building": "{n} kWh/år för byggnaden",
  "{n} kWh/yr per home": "{n} kWh/år per bostad",
  "{n} home": "{n} bostad",
  "{n} homes": "{n} bostäder",
  "space heating {heating}, hot water {dhw}": "uppvärmning {heating}, tappvarmvatten {dhw}",
  "simulated heated area {n} m²": "simulerad uppvärmd area {n} m²",

  // Footnotes
  "* Real EnergyPlus (EPSM) output with {weather} weather. Belgium has no open per-building EPCs, so the envelope is the TABULA Belgium archetype for the building's type and construction period, and the period is sampled from Statbel's municipal building stock unless OpenStreetMap records a year. Shared walls with neighbours are modelled as adiabatic. Heating is ideal loads (heat delivered, not fuel) and the model is not yet calibrated against Belgian EPB certificate statistics, so treat absolute values as indicative and compare packages relative to this baseline in Step 4.":
    "* Verkliga resultat från EnergyPlus (EPSM) med klimatdata från {weather}. Belgien saknar öppna energideklarationer per byggnad, så klimatskalet är TABULA:s belgiska typbyggnad för byggnadens typ och byggperiod, och perioden slumpas utifrån Statbels kommunala byggnadsbestånd om inte OpenStreetMap anger ett byggår. Väggar mot grannbyggnader modelleras som adiabatiska. Uppvärmningen är ideal (levererad värme, inte bränsle) och modellen är ännu inte kalibrerad mot belgisk EPB-statistik, så se de absoluta värdena som ungefärliga och jämför renoveringspaketen relativt detta nuläge i steg 4.",
  "* Real EnergyPlus (EPSM) output for UK homes: a gas boiler with radiators (efficiency from the EPC heating rating), SAP intermittent heating calibrated to DESNZ metered postcode gas, hot water from SAP 2012 Appendix J, simulated at the heated area (the homes' EPC floor areas) rather than the gross OSM footprint. Per-m² figures are per heated m². Proceed to Step 4 to test refurbishment tiers.":
    "* Verkliga resultat från EnergyPlus (EPSM) för brittiska bostäder: gaspanna med radiatorer (verkningsgrad från energideklarationens betyg för uppvärmningen), intermittent uppvärmning enligt SAP kalibrerad mot DESNZ uppmätta gasförbrukning per postnummer, tappvarmvatten enligt SAP 2012 bilaga J, simulerat på den uppvärmda arean (bostädernas golvarea i energideklarationerna) i stället för OSM:s bruttofotavtryck. Värden per m² avser uppvärmd m². Gå vidare till steg 4 för att testa renoveringsnivåer.",
  "* Real EnergyPlus (EPSM) output. Homes use Sveby 2.0 (2024) standard use. Hot water is what the building's own energy declaration reports where it gives a figure, otherwise Sveby's 21 kWh/m²·yr, played back through EnergyPlus as given. Household and business electricity (appliances and lighting; 21 kWh/m²·yr in homes, of which 70% warms the building) is simulated because its heat lowers the heating need, but — as in Swedish energy declarations — it is not part of the total and not shown. Office, shop and school lighting is dimmed by daylight near the windows. Infiltration is modelled too, but EnergyPlus reports it inside heating rather than as its own end use. Proceed to Step 4 to test renovation packages against this baseline.":
    "* Verkliga resultat från EnergyPlus (EPSM). Bostäder använder Sveby 2.0 (2024) som brukarindata. Tappvarmvatten är det värde byggnadens egen energideklaration anger när det finns, annars Svebys 21 kWh/m²·år, och spelas upp i EnergyPlus som det är. Hushålls- och verksamhetsel (apparater och belysning; 21 kWh/m²·år i bostäder, varav 70 % värmer byggnaden) simuleras eftersom dess värme minskar värmebehovet, men – precis som i svenska energideklarationer – ingår den inte i totalen och visas inte. Belysningen i kontor, butiker och skolor dimmas av dagsljus nära fönstren. Luftläckage (infiltration) modelleras också, men EnergyPlus redovisar det inom uppvärmningen och inte som en egen post. Gå vidare till steg 4 för att testa renoveringspaket mot detta nuläge.",

  // ── Load profile panel ──
  "Load profile": "Lastprofil",
  "real EnergyPlus output, summed per calendar month": "verkliga resultat från EnergyPlus, summerade per kalendermånad",
  "real EnergyPlus output, hour by hour": "verkliga resultat från EnergyPlus, timme för timme",
  "Monthly": "Per månad",
  "Hourly": "Per timme",
  "Toggle between absolute energy and intensity": "Växla mellan absolut energi och energi per m²",
  "Loading monthly profile…": "Läser in profil per månad …",
  "Loading hourly profile…": "Läser in profil per timme …",
  "Could not load the profile: {error}": "Kunde inte läsa in profilen: {error}",
  "This run carries no hourly trace, so there is no profile to draw — that means the data is absent, not that demand was zero. Re-run the baseline to record one.":
    "Den här körningen saknar timdata, så det finns ingen profil att visa – det betyder att data saknas, inte att behovet var noll. Kör om nulägessimuleringen för att spara timdata.",
  "Showing the first two weeks — drag the handles under the chart to pan across the year.":
    "Visar de två första veckorna – dra i handtagen under diagrammet för att flytta över året.",
  "Cooling here is the ideal-loads zone cooling the trace records. It is NOT in the headline total above: EPSM's end-use table carries only electricity and district heating columns, so district cooling falls through. A single-zone shoebox with no openable windows also overheats more readily than the real building would.":
    "Kylan här är den ideala zonkyla som timdata registrerar. Den ingår INTE i totalen ovan: EPSM:s tabell över energianvändning har bara kolumner för el och fjärrvärme, så fjärrkyla faller bort. En förenklad enzonsmodell utan öppningsbara fönster blir dessutom lättare övervarm än den verkliga byggnaden.",

  // Month abbreviations (axis/tooltip display only)
  "Jan": "jan",
  "Feb": "feb",
  "Mar": "mar",
  "Apr": "apr",
  "May": "maj",
  "Jun": "jun",
  "Jul": "jul",
  "Aug": "aug",
  "Sep": "sep",
  "Oct": "okt",
  "Nov": "nov",
  "Dec": "dec",

  // ── Peak demand ──
  "Peak demand": "Effektbehov",
  "The highest heat (space heating + hot water) and electricity demand over the year, from the hourly simulation. Power charges and the size of the heating connection follow these peaks, not the yearly total.": "Årets högsta värmebehov (uppvärmning + varmvatten) och elbehov, från timsimuleringen. Effektavgifter och storleken på värmeanslutningen följer dessa toppar, inte årsenergin.",
  "Reading the hourly results…": "Läser timresultaten…",
  "This run predates hourly output — re-run it to see peak demand.": "Den här körningen är äldre än timutdata – kör om den för att se effektbehovet.",
  "Peak heat, kW": "Max värmeeffekt, kW",
  "Highest daily average, kW": "Högsta dygnsmedel, kW",
  "Peak electricity, kW": "Max eleffekt, kW",
  "When": "När",
  "Full-load hours": "Utnyttjningstid, h",
  "Yearly heat ÷ peak: the hours the building would need at full peak to use its yearly heat. Low = a spiky load.": "Årsvärme ÷ maxeffekt: antal timmar på full effekt som motsvarar årets värmeanvändning. Lågt värde = ojämn last.",
  "All buildings together": "Alla byggnader tillsammans",
  "Show its duration curve": "Visa dess varaktighetskurva",
  "Heat demand duration curve — every hour of the year, highest first": "Varaktighetskurva för värmebehovet – årets alla timmar, högst först",
  "hours of the year": "timmar per år",
  "{h} hours a year at or above": "{h} timmar per år på eller över",
  "Heat = space heating + hot water; electricity = lighting and household appliances. Each value is an hourly average in a typical weather year, so the real peak on the coldest day of an actual winter is somewhat higher — use these figures to compare scenarios, not to size equipment.": "Värme = uppvärmning + varmvatten; el = belysning och hushållsapparater. Varje värde är ett timmedelvärde under ett normalår, så den verkliga toppen en riktigt kall vinterdag är något högre – använd siffrorna för att jämföra scenarier, inte för att dimensionera utrustning.",
  "{n} buildings have no hourly data (older runs) and are left out.": "{n} byggnader saknar timdata (äldre körningar) och är inte med.",
  "Baseline": "Nuläge",
};
