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
  // Catalogue: Renovation planning / New buildings (Wikells Sektionsdata)
  "Renovation planning": "Renoveringsplanering",
  "New buildings": "Nybyggnad",
  "All chapters (search)": "Alla kapitel (sök)",
  "Building parts": "Byggdelar",
  "Other renovation works": "Övriga renoveringsarbeten",
  "Wizard": "Guiden",
  "Wizard column: items the Renovation Wizard offers as a measure (they have a U-value and a price per m²). Green U = meets the BBR renovation target. ★ = the Wizard's suggestion: the cheapest item that meets the target.":
    "Kolumnen Guiden: poster som Renoveringsguiden erbjuder som åtgärd (de har U-värde och pris per m²). Grönt U = klarar BBR:s renoveringskrav. ★ = guidens förslag: det billigaste som klarar kravet.",
  "Complete new parts from Wikells Sektionsdata, incl. overheads, excl. VAT. Removal of the existing part is not included, and Sektionsdata has no add-on layers (e.g. extra insulation on an existing wall), so adding insulation usually costs less than these prices.":
    "Kompletta nya byggdelar från Wikells Sektionsdata, inkl. omkostnader, exkl. moms. Rivning av befintlig del ingår inte, och Sektionsdata saknar tilläggsskikt (t.ex. tilläggsisolering av befintlig vägg), så tilläggsisolering kostar oftast mindre än dessa priser.",
  "Unit": "Enhet",
  "Price (SEK)": "Pris (kr)",
  // Catalogue: edit, add rows/columns, upload, supplier API
  "Edit": "Redigera",
  "Editing": "Redigerar",
  "Edit values in the tables; your values replace the catalogue's and reach the Wizard": "Ändra värden i tabellerna; dina värden ersätter katalogens och används i guiden",
  "Add row…": "Lägg till rad…",
  "Add column…": "Lägg till kolumn…",
  "Upload catalogue…": "Ladda upp katalog…",
  "Connect supplier API…": "Koppla leverantörs-API…",
  "Supplier catalogues": "Leverantörskataloger",
  "Catalogue value": "Katalogvärde",
  "Remove column": "Ta bort kolumn",
  "Remove the column \"{c}\" and its values?": "Ta bort kolumnen \"{c}\" och dess värden?",
  "Delete row": "Ta bort rad",
  "Delete the row \"{c}\"?": "Ta bort raden \"{c}\"?",
  "Undo my changes on this row": "Ångra mina ändringar på raden",
  "Uploaded catalogues": "Uppladdade kataloger",
  "Supplier connections (API)": "Leverantörskopplingar (API)",
  "No other catalogues yet. Upload a supplier's price list (CSV or Excel), or connect a supplier's API with your key so its catalogue is fetched automatically.":
    "Inga andra kataloger ännu. Ladda upp en leverantörs prislista (CSV eller Excel), eller koppla en leverantörs API med din nyckel så hämtas katalogen automatiskt.",
  "Synced: {n} items": "Synkad: {n} poster",
  "Sync failed": "Synkningen misslyckades",
  "Last sync failed": "Senaste synkningen misslyckades",
  "key": "nyckel",
  "last sync": "senast synkad",
  "never": "aldrig",
  "uploaded": "uppladdad",
  "Syncing…": "Synkar…",
  "Sync now": "Synka nu",
  "Edit connection…": "Ändra koppling…",
  "Delete the catalogue \"{c}\"?": "Ta bort katalogen \"{c}\"?",
  "Items with a U-value, a price per m² (or per window with its size, e.g. 12x12) and a Wizard part (Walls / Windows / Roof / Floor) become measures in the Renovation Wizard.":
    "Poster med U-värde, pris per m² (eller per fönster med storlek, t.ex. 12x12) och en guidedel (Väggar / Fönster / Tak / Golv) blir åtgärder i Renoveringsguiden.",
  "Add row": "Lägg till rad",
  "Chapter": "Kapitel",
  "Sub-chapter": "Underkapitel",
  "This sub-chapter supplies the Wizard's {p} measures: with a U-value and a price per m² (or per window with its size, e.g. 12x12) the row becomes a measure.":
    "Underkapitlet ger guidens åtgärder för {p}: med U-värde och pris per m² (eller per fönster med storlek, t.ex. 12x12) blir raden en åtgärd.",
  "This sub-chapter is not used by the Wizard; the row is listed in the catalogue only.": "Underkapitlet används inte av guiden; raden visas bara i katalogen.",
  "Add column": "Lägg till kolumn",
  "Column name": "Kolumnnamn",
  "e.g. Supplier, Lead time, Note": "t.ex. Leverantör, Leveranstid, Anteckning",
  "The column appears in every catalogue table. Turn on ✎ Edit to fill in values.": "Kolumnen visas i alla katalogtabeller. Slå på ✎ Redigera för att fylla i värden.",
  "Group / type": "Grupp / typ",
  "Wizard part": "Guidedel",
  "Upload catalogue": "Ladda upp katalog",
  "Upload": "Ladda upp",
  "File (CSV or Excel .xlsx)": "Fil (CSV eller Excel .xlsx)",
  "The file has no rows": "Filen har inga rader",
  "Catalogue name": "Katalognamn",
  "{n} rows. Which column is which?": "{n} rader. Vilken kolumn är vilken?",
  "sheet": "blad",
  "— not in the file —": "— finns inte i filen —",
  "All rows are for": "Alla rader gäller",
  "— use the Wizard part column, if any —": "— använd kolumnen Guidedel, om den finns —",
  "Other columns are kept and shown as extra columns. Items with a Wizard part, a U-value and a price per m² become measures in the Renovation Wizard.":
    "Övriga kolumner behålls och visas som extra kolumner. Poster med guidedel, U-värde och pris per m² blir åtgärder i Renoveringsguiden.",
  "Preview": "Förhandsvisning",
  "Edit supplier connection": "Ändra leverantörskoppling",
  "Connect supplier API": "Koppla leverantörs-API",
  "Connecting…": "Kopplar…",
  "Save and sync": "Spara och synka",
  "For suppliers that offer a product/price API returning JSON. Your key is stored on the Poseidon server and is never shown again or sent to the browser; the server fetches the catalogue itself (HTTPS only) and refreshes it once a day when the catalogue is opened.":
    "För leverantörer med ett produkt-/pris-API som svarar med JSON. Nyckeln sparas på Poseidon-servern och visas aldrig igen eller skickas till webbläsaren; servern hämtar katalogen själv (endast HTTPS) och uppdaterar den en gång per dag när katalogen öppnas.",
  "Supplier name": "Leverantörens namn",
  "API address (URL)": "API-adress (URL)",
  "How the key is sent": "Hur nyckeln skickas",
  "Authorization: Bearer <key>": "Authorization: Bearer <nyckel>",
  "Own header (e.g. X-API-Key)": "Egen header (t.ex. X-API-Key)",
  "URL parameter (e.g. ?api_key=)": "URL-parameter (t.ex. ?api_key=)",
  "No key (public API)": "Ingen nyckel (öppet API)",
  "Header name": "Headerns namn",
  "Parameter name": "Parameterns namn",
  "API key": "API-nyckel",
  "stored": "sparad",
  "leave empty to keep": "lämna tomt för att behålla",
  "Item list path": "Sökväg till postlistan",
  "e.g. data.products (empty = the response itself)": "t.ex. data.products (tomt = själva svaret)",
  "Which field in the supplier's items is which catalogue field (dotted paths allowed, e.g. price.sek):": "Vilket fält i leverantörens poster motsvarar vilket katalogfält (punktade sökvägar går bra, t.ex. price.sek):",
  "Technical values": "Tekniska värden",
  "A1–A3, from weight × typical factor (Wikells)": "A1–A3, vikt × typisk faktor (Wikells)",
  "Could not load the Sektionsdata catalogue": "Kunde inte läsa Sektionsdata-katalogen",
  "Prices from Wikells Sektionsdata: complete new parts incl. overheads, excl. VAT.": "Priser från Wikells Sektionsdata: kompletta nya byggdelar inkl. omkostnader, exkl. moms.",
  "Wikells Sektionsdata, the complete component database for new construction. Section cost per unit incl. overheads, excl. VAT and waste; labour {rate} SEK/h. kg CO₂e = A1–A3 from weight × typical factor; – = not given (e.g. subcontract-only items).":
    "Wikells Sektionsdata, hela byggdelsdatabasen för nyproduktion. Sektionskostnad per enhet inkl. omkostnader, exkl. moms och spill; arbete {rate} kr/h. kg CO₂e = A1–A3 från vikt × typisk faktor; – = saknas (t.ex. rena UE-poster).",
  "Windows and doors": "Fönster och dörrar",
  "Roof and attic": "Tak och vind",
  "Sheet metal: roofs, cladding, drainage": "Plåt: tak, beklädnad, avvattning",
  "Basement and ground": "Källare och mark",
  "Façade surfaces": "Fasadytor",
  "Balconies, entrances and railings": "Balkonger, entréer och räcken",
  "Kitchens and bathrooms": "Kök och badrum",
  "Interior surfaces": "Invändiga ytor",
  "Common areas": "Gemensamma utrymmen",
  "Site and demolition": "Mark och rivning",
  "Replacement windows and doors, priced per piece incl. fitting, architraves and sealing. Removal of the old unit is not included.":
    "Nya fönster och dörrar, pris per styck inkl. montage, foder och tätning. Rivning av det gamla ingår inte.",
  "Re-roofing and attic (loft floor) insulation. Prices are for the complete new build-up; stripping the old roof is not included.":
    "Omläggning av tak och vindsbjälklagsisolering. Priserna gäller hela den nya uppbyggnaden; rivning av det gamla taket ingår inte.",
  "Sheet-metal roofing, wall cladding and roof drainage (subcontractor prices).": "Plåttak, fasadplåt och takavvattning (UE-priser).",
  "Basement wall insulation/drainage below ground and frost insulation. Excavation is priced separately (chapter 1).":
    "Isolering/dränering av källarväggar under mark och tjälisolering. Schaktning prissätts separat (kapitel 1).",
  "Repainting of existing façades. Sektionsdata has no add-on façade insulation; for wall insulation use the envelope measures above.":
    "Ommålning av befintliga fasader. Sektionsdata saknar tilläggsisolering av fasad; använd klimatskalsåtgärderna ovan för väggisolering.",
  "New balconies, balcony glazing, entrance steps, railings and canopies.": "Nya balkonger, inglasning, entrétrappor, räcken och skärmtak.",
  "Fittings, white goods, complete rooms and wet-room finishes for apartment refurbishment.": "Inredning, vitvaror, kompletta rum och våtrumsytskikt vid lägenhetsrenovering.",
  "Interior repainting, ceilings and skirtings.": "Invändig målning, undertak och golvlister.",
  "Stairwell entrances, common WCs and waste/recycling rooms.": "Trapphusentréer, gemensamma WC och miljörum.",
  "Removal of demolition waste and yard/garden works around the building.": "Bortforsling av rivningsmassor och gårds-/markarbeten runt huset.",
  "Excavation": "Schakt",
  "External works": "Markarbeten",
  "Substructure/foundations": "Grundläggning",
  "Ground-bearing slabs": "Plattor på mark",
  "Frames/structure": "Stomme",
  "Basement external walls": "Källarytterväggar",
  "External walls": "Ytterväggar",
  "Internal walls": "Innerväggar",
  "Floor structures": "Bjälklag",
  "Stair flights": "Trappor",
  "Roofs": "Yttertak",
  "Suspended ceilings": "Undertak",
  "Sheet metal works": "Plåtarbeten",
  "Painting works": "Målningsarbeten",
  "Flooring, cladding and finishes": "Golv, beklädnad och ytskikt",
  "Windows, doors, screens, gates": "Fönster, dörrar, partier, portar",
  "Hardware, fittings": "Inredning",
  "Standard rooms": "Standardrum",
  "Miscellaneous": "Övrigt",
  "Subcontracts": "Underentreprenader",
  "Overheads": "Omkostnader",
  "Colour by": "Färga efter",
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
  // Building table
  "Building Table": "Byggnadstabell",
  "Building\nTable": "Byggnads-\ntabell",
  "Table…": "Tabell…",
  "Address": "Adress",
  "All entrances": "Alla entréer",
  "entrances": "entréer",
  "Property designation": "Fastighetsbeteckning",
  "Fastighetsbeteckning, from the energy certificate register": "Fastighetsbeteckning, från energideklarationsregistret",
  "Year": "Byggår",
  "Height (m)": "Höjd (m)",
  "Atemp (m²)": "Atemp (m²)",
  "Footprint (m²)": "Fotavtryck (m²)",
  "Building bodies": "Byggnadskroppar",
  "Certificate energy (kWh/m²·yr)": "Energiprestanda enl. deklaration (kWh/m²·år)",
  "Energy performance from the energy certificate: heating, hot water and the building's own electricity":
    "Energiprestanda från energideklarationen: värme, varmvatten och fastighetsel",
  "RC heating (kWh/m²·yr)": "RC värme (kWh/m²·år)",
  "RC heating (MWh/yr)": "RC värme (MWh/år)",
  "RC peak heat (kW)": "RC effekttopp värme (kW)",
  "RC hot water (MWh/yr)": "RC varmvatten (MWh/år)",
  "Space heating from the EPSM RC model (hourly, typical weather year). Excludes hot water, unlike the certificate figure.":
    "Uppvärmning enligt EPSM RC-modellen (timvis, normalår). Utan varmvatten, till skillnad från deklarationens siffra.",
  "Your changes": "Dina ändringar",
  "changed": "ändrade",
  "(open data value)": "(öppna data)",
  "Re-run RC": "Kör RC igen",
  "Click a cell with a dotted underline to change it (Use, Height, Floors, Footprint, U-values): those feed the EPSM RC model, and that building is simulated again. Leave a cell empty to go back to the open data.":
    "Klicka på en cell med prickad understrykning för att ändra den (Användning, Höjd, Våningar, Fotavtryck, U-värden): de är indata till EPSM RC-modellen och byggnaden simuleras om. Lämna cellen tom för att gå tillbaka till öppna data.",
  "this column is open data and is not an input to the EPSM RC model, so it can't be edited here. Editable columns have a dotted underline: Use, Height, Floors, Footprint and the U-values.":
    "kolumnen är öppna data och inte indata till EPSM RC-modellen, så den kan inte ändras här. Redigerbara kolumner har prickad understrykning: Användning, Höjd, Våningar, Fotavtryck och U-värdena.",
  "EPSM RC input — click a cell to change it": "Indata till EPSM RC – klicka på en cell för att ändra",
  "EPSM RC:": "EPSM RC:",
  "building bodies": "byggnadskroppar",
  "EPSM RC input — double-click a cell to change it": "Indata till EPSM RC – dubbelklicka på en cell för att ändra",
  "Your value. Open data:": "Ditt värde. Öppna data:",
  "Modelled outline:": "Modellerad byggnad:",
  "Enter a number greater than zero, or leave the cell empty to use the open-data value.":
    "Ange ett tal större än noll, eller lämna cellen tom för att använda öppna data.",
  "Could not save the change.": "Kunde inte spara ändringen.",
  "RC heating:": "RC värme:",
  "yr": "år",
  "Simulating…": "Simulerar…",
  "Some RC runs failed (marked !)": "Vissa RC-körningar misslyckades (markerade !)",
  "EPSM RC up to date": "EPSM RC uppdaterad",
  "Waiting for EPSM RC…": "Väntar på EPSM RC…",
  "U-floor (W/m²K)": "U-golv (W/m²K)",
  "U-values from": "U-värden från",
  "Where each U-value used by the EPSM RC model came from": "Var varje U-värde som EPSM RC-modellen använde kommer ifrån",
  "your value": "ditt värde",
  "recorded renovation": "registrerad renovering",
  "energy certificate": "energideklaration",
  "EPSM archetype (building from 2006 or later)": "EPSM-arketyp (byggnad från 2006 eller senare)",
  "TABULA, typical for the construction period": "TABULA, typiskt för byggnadsperioden",
  "national default: no data for this building": "nationellt standardvärde: inga data för byggnaden",
  "You": "Du",
  "Recorded": "Registrerad",
  "Certificate": "Deklaration",
  "EPSM archetype": "EPSM-arketyp",
  "Default": "Standardvärde",
  "wall": "vägg",
  "roof": "tak",
  "window": "fönster",
  "floor": "golv",
  "until EPSM RC has run": "tills EPSM RC har körts",
  "EPSM RC used": "EPSM RC använde",
  "floors and height disagreed in the open data, so the model corrected one. Type a value to override.":
    "våningar och höjd stämde inte överens i öppna data, så modellen rättade det ena. Skriv ett värde för att ändra.",
  "Floors used by RC": "Våningar använda av RC",
  "the open data's floors and height don't fit the certificate's heated area (Atemp), so the model took the floor count from Atemp ÷ footprint and about 3 m per storey. Type a value to override.":
    "öppna datas våningar och höjd stämmer inte med deklarationens Atemp, så modellen tog antalet våningar från Atemp ÷ fotavtryck och cirka 3 m per våning. Skriv ett värde för att ändra.",
  "Unreliable: this outline is far too small or large for the certificate's heated area (Atemp), so the outline is probably not this building. Check it on the Poseidon Map or type the footprint.":
    "Osäkert: konturen är alldeles för liten eller stor för deklarationens Atemp, så den är troligen inte den här byggnaden. Kontrollera på beståndskartan eller skriv in fotavtrycket.",
  "Height used by RC (m)": "Höjd använd av RC (m)",
  "U-values show what EPSM RC used:": "U-värdena visar vad EPSM RC använde:",
  "black = open data (TABULA / certificate)": "svart = öppna data (TABULA / deklaration)",
  "orange": "orange",
  "national default, no data for this building": "nationellt standardvärde, inga data för byggnaden",
  "purple": "lila",
  "EPSM archetype (2006+)": "EPSM-arketyp (2006+)",
  "yellow = your value": "gul = ditt värde",
  "Loading saved RC results…": "Laddar sparade RC-resultat…",
  "Separate building bodies covered by the same energy certificate": "Separata byggnadskroppar som omfattas av samma energideklaration",
  "Energy (kWh/m²·yr)": "Energi (kWh/m²·år)",
  "EPC issued": "Energideklaration utfärdad",
  "EPC expires": "Energideklaration upphör",
  "Heating system": "Uppvärmningssystem",
  "U-wall (W/m²K)": "U-vägg (W/m²K)",
  "U-roof (W/m²K)": "U-tak (W/m²K)",
  "U-window (W/m²K)": "U-fönster (W/m²K)",
  "Boplats listings": "Annonser på Boplats",
  "Avg rent (SEK/month)": "Snitthyra (kr/mån)",
  "Avg rent (SEK/m²·month)": "Snitthyra (kr/m²·mån)",
  "Why on the list": "Varför på listan",
  "Boplats floor plan": "Planritning på Boplats",
  "Added by you": "Tillagd av dig",
  "Latitude": "Latitud",
  "Longitude": "Longitud",
  "Download Excel…": "Ladda ner Excel…",
  "Import CSV…": "Importera CSV…",
  "Open map": "Öppna kartan",
  "Filter:": "Filtrera:",
  "address, year, class…": "adress, år, klass…",
  "The list includes changes you have not saved yet on the Poseidon Map.": "Listan innehåller ändringar som ännu inte har sparats på beståndskartan.",
  "Loading…": "Laddar…",
  "buildings": "byggnader",
  "Looking up energy certificates…": "Hämtar energideklarationer…",
  "Energy certificates: Boverket register": "Energideklarationer: Boverkets register",
  "Certificate register not installed here": "Deklarationsregistret finns inte här",
  "Certificate lookup failed": "Kunde inte hämta energideklarationer",
  // CSV import
  "Import building list (CSV)": "Importera byggnadslista (CSV)",
  "Import CSV": "Importera CSV",
  "Add buildings from a CSV file": "Lägg till byggnader från en CSV-fil",
  "One row per address, e.g. exported from Excel. Each address is matched to a building on the Poseidon Map and added to the Poseidon list.":
    "En rad per adress, t.ex. exporterad från Excel. Varje adress matchas mot en byggnad på beståndskartan och läggs till i Poseidons lista.",
  "Choose file…": "Välj fil…",
  "No file chosen": "Ingen fil vald",
  "Columns": "Kolumner",
  "First row is a header": "Första raden är rubriker",
  "Address column:": "Adresskolumn:",
  "House number (if separate):": "Husnummer (om separat):",
  "(in the address)": "(i adressen)",
  "Column": "Kolumn",
  "addresses, e.g.": "adresser, t.ex.",
  "Match addresses": "Matcha adresser",
  "Addresses not found directly are looked up on the map, about one per second.": "Adresser som inte hittas direkt slås upp på kartan, ungefär en per sekund.",
  "about": "cirka",
  "left": "kvar",
  "Stop": "Stoppa",
  "Result": "Resultat",
  "buildings to add": "byggnader att lägga till",
  "already on the Poseidon list": "finns redan på Poseidons lista",
  "addresses not found": "adresser hittades inte",
  "Your address": "Din adress",
  "Matched by": "Matchad via",
  "address": "adress",
  "map location": "kartposition",
  "not found": "hittades inte",
  "buildings to Poseidon": "byggnader till Poseidon",
  "added.": "tillagda.",
  "Saved": "Sparat",
  "Open table": "Öppna tabellen",
  "Download not found…": "Ladda ner ej hittade…",
  // Renovation wizard — weights, measures, report
  "Façades & weights": "Fasader & vikter",
  "How much energy, façade condition and building characteristics each count, and AI defect detection on façade photos (the façade criterion).":
    "Hur mycket energi, fasadens skick och byggnadens egenskaper väger, och AI-detektering av skador på fasadfoton (fasadkriteriet).",
  "Which buildings to renovate first, why, and which parts of each. Flag the buildings to plan measures for.":
    "Vilka byggnader som ska renoveras först, varför, och vilka delar. Flagga byggnaderna du vill planera åtgärder för.",
  "Recommended measures for the flagged buildings from the renovation catalogue, with their effect on heating (EPSM RC), cost and payback.":
    "Rekommenderade åtgärder för de flaggade byggnaderna ur renoveringskatalogen, med effekt på uppvärmning (EPSM RC), kostnad och återbetalningstid.",
  "Save the ranking and measures as a report in the Reports folder, or print it.": "Spara rangordning och åtgärder som en rapport i mappen Rapporter, eller skriv ut den.",
  "Weights: how much each criterion counts": "Vikter: hur mycket varje kriterium väger",
  "Your judgements are consistent": "Dina bedömningar är konsekventa",
  "Your judgements contradict each other — adjust them": "Dina bedömningar motsäger varandra – justera dem",
  "should be 0.10 or less": "bör vara högst 0,10",
  "How much heat the building needs per m² a year, from EPSM RC. {lo} kWh or less gives 0 points, {hi} or more gives 100.":
    "Hur mycket värme byggnaden behöver per m² och år, enligt EPSM RC. {lo} kWh eller mindre ger 0 poäng, {hi} eller mer ger 100.",
  "Damage found on façade photos. Cracks and bulging count most; damage only the AI model saw counts half. Buildings without photos are ranked without this criterion.":
    "Skador som hittats på fasadfoton. Sprickor och buktningar väger tyngst; skador som bara AI-modellen såg räknas till hälften. Byggnader utan foton rangordnas utan detta kriterium.",
  "Older and bigger buildings get more points (age 60 %, size 40 %).": "Äldre och större byggnader får fler poäng (ålder 60 %, storlek 40 %).",
  "flagged buildings": "flaggade byggnader",
  "Open catalogue…": "Öppna katalogen…",
  "Heat price (SEK/kWh):": "Värmepris (kr/kWh):",
  "assumption": "antagande",
  "No sourced district-heating price is in the tool yet — enter Poseidon's own tariff.": "Verktyget har ännu inget källbelagt fjärrvärmepris – ange Poseidons egen taxa.",
  "For each flagged building, the parts the ranking marks as needed or worth considering get the catalogue's suggestion: the cheapest item that meets the BBR renovation target. Change or remove any measure; EPSM RC then recalculates the heating automatically.":
    "För varje flaggad byggnad får de delar som rangordningen markerar som behövs eller värda att överväga katalogens förslag: det billigaste alternativet som klarar BBR:s renoveringskrav. Ändra eller ta bort åtgärder; EPSM RC räknar då om uppvärmningen automatiskt.",
  "EPSM RC: calculating the effect of the measures…": "EPSM RC: beräknar åtgärdernas effekt…",
  "Heating before (MWh/yr)": "Värme före (MWh/år)",
  "Heating after (MWh/yr)": "Värme efter (MWh/år)",
  "Saving": "Besparing",
  "Saving (MWh/yr)": "Besparing (MWh/år)",
  "Cost": "Kostnad",
  "Payback (years)": "Återbetalning (år)",
  "Payback": "Återbetalning",
  "years": "år",
  "no measure": "ingen åtgärd",
  "Flag buildings in the Ranking step to plan measures for them.": "Flagga byggnader i steget Rangordning för att planera åtgärder för dem.",
  "Total": "Totalt",
  "Carbon is not included yet.": "Klimatpåverkan ingår inte än.",
  "Title:": "Titel:",
  "Ranking in the report:": "Rangordning i rapporten:",
  "top 20 + flagged": "topp 20 + flaggade",
  "all buildings in scope": "alla byggnader i urvalet",
  "Save report": "Spara rapport",
  "Print…": "Skriv ut…",
  "Open Reports": "Öppna Rapporter",
  "Renovation priorities": "Renoveringsprioriteringar",
  "built": "byggda",
  "class": "klass",
  "Parts (walls, windows, roof, floor, heating) are judged on age against IVL service lives, façade defects and U-value against the BBR renovation target.":
    "Delarna (väggar, fönster, tak, golv, värme) bedöms efter ålder mot IVL:s livslängder, fasadskador och U-värde mot BBR:s renoveringskrav.",
  "Energy figures are space heating from the EPSM RC model with a typical weather year — not metered use, and without hot water.":
    "Energisiffrorna är uppvärmning enligt EPSM RC-modellen med normalår – inte uppmätt användning, och utan varmvatten.",
  "{n} buildings use national default U-values for walls, roof or windows because no data exists for them.":
    "{n} byggnader använder nationella standard-U-värden för väggar, tak eller fönster eftersom data saknas.",
  "{a} buildings had floors or height corrected from the energy certificate's heated area (Atemp); {b} have an outline that does not match their certificate and get no energy score.":
    "{a} byggnader fick våningar eller höjd korrigerade utifrån energideklarationens Atemp; {b} har en kontur som inte stämmer med deklarationen och får ingen energipoäng.",
  "{n} buildings have façade photos analysed. Street imagery cannot show hairline cracks.": "{n} byggnader har analyserade fasadfoton. Gatubilder kan inte visa hårfina sprickor.",
  "Measure prices are Wikells new-build prices for the complete part (replacement); adding insulation to an existing part usually costs less.":
    "Åtgärdspriserna är Wikells nyproduktionspriser för hela byggdelen (utbyte); tilläggsisolering av befintlig del kostar oftast mindre.",
  "Heat price {p} SEK/kWh is an assumption — replace it with Poseidon's district-heating tariff.": "Värmepriset {p} kr/kWh är ett antagande – ersätt det med Poseidons fjärrvärmetaxa.",
  "Embodied and operational carbon are not included in this report yet.": "Inbyggd och driftrelaterad klimatpåverkan ingår inte i rapporten än.",
  "Report saved": "Rapport sparad",
  "Open": "Öppna",
  "\"{name}\" is saved in the Reports folder.": "\"{name}\" är sparad i mappen Rapporter.",
  "Could not save the report.": "Kunde inte spara rapporten.",
  "The browser blocked the print window. Allow pop-ups for this site and try again.": "Webbläsaren blockerade utskriftsfönstret. Tillåt popup-fönster för sidan och försök igen.",
  // 3D viewer (Poseidon layer)
  "Poseidon 3D Map": "Poseidon 3D-karta",
  "Poseidon stock": "Poseidons bestånd",
  "Off": "Av",
  "Other buildings": "Andra byggnader",
  "low": "låg",
  "high": "hög",
  "Renovation priority from the Renovation Wizard (same weights), across the whole Poseidon stock.":
    "Renoveringsprioritet från Renoveringsguiden (samma vikter), för hela Poseidons bestånd.",
  "The viewer's own colours are shown.": "Kartans egna färger visas.",
  "{n} buildings · {b} from Boplats · {a} added by you": "{n} byggnader · {b} från Boplats · {a} tillagda av dig",
  "Not on the Poseidon list": "Inte på Poseidons lista",
  "Poseidon: found in Boplats floor plans": "Poseidon: funnen i Boplats planritningar",
  "rank {r} of {n}": "plats {r} av {n}",
  "Only apartment blocks can be added to the Poseidon list, and this building isn't one in the open data. Add it on the Poseidon Map if it should be there.":
    "Bara flerbostadshus kan läggas till i Poseidons lista, och den här byggnaden är inte det enligt öppna data. Lägg till den på beståndskartan om den ska vara med.",
  "Take {name} off the Poseidon list?": "Ta bort {name} från Poseidons lista?",
  "Add {name} to the Poseidon list?": "Lägg till {name} i Poseidons lista?",
  "Poseidon layer active": "Poseidon-lagret är aktivt",
  "Loading the 3D map…": "Laddar 3D-kartan…",
  "Poseidon outlines shown:": "Poseidon-konturer som visas:",
  // Report document
  "Created": "Skapad",
  "How the buildings were ranked": "Så rangordnades byggnaderna",
  "Recommended measures": "Rekommenderade åtgärder",
  "Saving per year": "Besparing per år",
  "Heat price used:": "Värmepris som använts:",
  "Notes and limitations": "Anmärkningar och begränsningar",
  // Reports folder, report view, catalogue
  "Report –": "Rapport –",
  "Double-click a report to open it.": "Dubbelklicka på en rapport för att öppna den.",
  "Delete report": "Ta bort rapport",
  "Delete the report \"{name}\"?": "Ta bort rapporten \"{name}\"?",
  "Delete": "Ta bort",
  "Renovation catalogue": "Renoveringskatalog",
  "Catalogue": "Katalog",
  "Search…": "Sök…",
  "Code": "Kod",
  "Type": "Typ",
  "Description": "Beskrivning",
  "Price (SEK/m²)": "Pris (kr/m²)",
  "Buildings & data": "Byggnader & data",
  "Which of Poseidon's buildings to rank, and what we know about each. Filter by area, address, year or class; untick a building to leave it out. Adding past renovations or façade photos updates the ranking.":
    "Vilka av Poseidons byggnader som ska rangordnas, och vad vi vet om varje. Filtrera på område, adress, år eller klass; kryssa ur en byggnad för att utesluta den. Tidigare renoveringar eller fasadfoton uppdaterar rangordningen.",
  "Area:": "Område:",
  "All areas": "Alla områden",
  "street, address or property": "gata, adress eller fastighet",
  "unticked": "urkryssade",
  "Include in the ranking": "Ta med i rangordningen",
  "Area": "Område",
  "Data (TABULA / certificate)": "Data (TABULA / deklaration)",
  "National default": "Nationellt standardvärde",
  "No buildings match these filters.": "Inga byggnader matchar filtren.",
  "Façades": "Fasader",
  "Weights": "Vikter",
  "Ranking": "Rangordning",
  "Which of Poseidon's buildings to rank. All of them by default; narrow it down if you like.":
    "Vilka av Poseidons byggnader som ska rangordnas. Alla som standard; avgränsa om du vill.",
  "What we know about each building. Adding past renovations, U-values or façade photos updates the ranking.":
    "Vad vi vet om varje byggnad. Tidigare renoveringar, U-värden eller fasadfoton uppdaterar rangordningen.",
  "AI defect detection on façade photos: the façade criterion (F). Uninspected buildings are ranked without it.":
    "AI-detektering av skador på fasadfoton: fasadkriteriet (F). Byggnader utan inspektion rangordnas utan det.",
  "How much each criterion counts: a preset, your own weights, or pairwise comparisons (AHP).":
    "Hur mycket varje kriterium väger: förval, egna vikter eller parvisa jämförelser (AHP).",
  "Which buildings to renovate first, why, and which parts of each.":
    "Vilka byggnader som ska renoveras först, varför, och vilka delar av varje.",
  "Energy (EPSM RC heating)": "Energi (EPSM RC värme)",
  "Façade condition": "Fasadens skick",
  "Building characteristics": "Byggnadens egenskaper",
  "space heating (EPSM RC)": "uppvärmning (EPSM RC)",
  "buildings in scope": "byggnader i urvalet",
  "façades inspected": "fasader inspekterade",
  "flagged": "flaggade",
  "Filter": "Filter",
  "Address / property:": "Adress / fastighet:",
  "e.g. Kortedala, Tunnlandsgatan": "t.ex. Kortedala, Tunnlandsgatan",
  "Built from": "Byggd från",
  "to": "till",
  "(none ticked = all)": "(ingen ikryssad = alla)",
  "of": "av",
  "EPSM RC result:": "EPSM RC-resultat:",
  "National default U-values:": "Nationella standard-U-värden:",
  "Renovations recorded:": "Registrerade renoveringar:",
  "Façades inspected:": "Inspekterade fasader:",
  "Click a building's renovations or façade cell to add data. Everything you add is saved and updates the ranking straight away.":
    "Klicka på en byggnads renoverings- eller fasadcell för att lägga till data. Allt sparas och uppdaterar rangordningen direkt.",
  "Default (some parts)": "Standardvärde (vissa delar)",
  "+ add": "+ lägg till",
  "+ inspect": "+ inspektera",
  "defects": "skador",
  "no defects": "inga skador",
  "photos": "foton",
  "Inspect the highest-priority buildings": "Inspektera byggnaderna med högst prioritet",
  "Street View for the top": "Street View för de",
  "uninspected buildings of the current ranking": "översta ej inspekterade byggnaderna i rangordningen",
  "Inspect": "Inspektera",
  "Street View is billed per image and only the defect counts are kept. For a single building, or to upload your own photos, click its façade cell.":
    "Street View debiteras per bild och bara antalet skador sparas. För en enskild byggnad, eller för att ladda upp egna foton, klicka på dess fasadcell.",
  "Capture all four façades of the top {n} uninspected buildings from Street View and run defect detection? Street View is billed per image (roughly 4–12 images per building).":
    "Hämta alla fyra fasader för de {n} översta ej inspekterade byggnaderna från Street View och kör skadedetektering? Street View debiteras per bild (ungefär 4–12 bilder per byggnad).",
  "Rank": "Rang",
  "Defects found": "Hittade skador",
  "none": "inga",
  "Street View": "Street View",
  "Preset": "Förval",
  "Set weights": "Egna vikter",
  "Pairwise comparison (AHP)": "Parvis jämförelse (AHP)",
  "Balanced (default)": "Balanserad (standard)",
  "Energy-first": "Energi först",
  "Condition-first": "Skick först",
  "Building-first": "Byggnad först",
  "Which criterion matters more, and how much? (Saaty 1–9)": "Vilket kriterium väger tyngre, och hur mycket? (Saaty 1–9)",
  "equally important": "lika viktiga",
  "more important": "viktigare",
  "Consistency ratio": "Konsistenskvot",
  "(consistent, ≤ 0.10)": "(konsistent, ≤ 0,10)",
  "(inconsistent — over 0.10, revisit the judgements)": "(inkonsistent – över 0,10, se över bedömningarna)",
  "Weights in use": "Vikter som används",
  "E scores EPSM RC space heating: {lo} kWh/m²·yr = 0 (renovated to today's standard), {hi} = 100 (the worst 5 % of the Poseidon stock). F counts ML defects in full and AI-vision-only finds at half; structural defects (cracks, bulging) weigh most. C is 60 % age, 40 % size. A building without façade photos is ranked on E and C alone, with their weights scaled up.":
    "E poängsätter uppvärmning enligt EPSM RC: {lo} kWh/m²·år = 0 (renoverat till dagens standard), {hi} = 100 (de sämsta 5 % av Poseidons bestånd). F räknar ML-skador fullt och skador som bara AI hittat till hälften; konstruktiva skador (sprickor, buktningar) väger tyngst. C är 60 % ålder, 40 % storlek. En byggnad utan fasadfoton rangordnas på E och C, med uppskalade vikter.",
  "Flag top": "Flagga de",
  "Clear flags": "Rensa flaggor",
  "Open Building Table": "Öppna byggnadstabellen",
  "Component verdict": "Bedömning per del",
  "needed": "behövs",
  "consider": "överväg",
  "ok": "ok",
  "unknown": "okänt",
  "Flagged for renovation": "Flaggad för renovering",
  "Priority": "Prioritet",
  "Priority (0–100)": "Prioritet (0–100)",
  "Confidence": "Säkerhet",
  "Parts": "Delar",
  "Why": "Varför",
  "Renovation priority": "Renoveringsprioritet",
  "How much of the score rests on real data rather than defaults": "Hur mycket av poängen som bygger på verkliga data snarare än standardvärden",
  "Click to record past renovations": "Klicka för att registrera tidigare renoveringar",
  "Walls": "Väggar",
  "Windows": "Fönster",
  "Roof": "Tak",
  "Floor": "Golv",
  "crack": "spricka",
  "leakage": "läckage",
  "abscission": "avflagning",
  "corrosion": "korrosion",
  "bulge": "buktning",
  // Renovation history window
  "Renovation history –": "Renoveringshistorik –",
  "Past renovations": "Tidigare renoveringar",
  "Renovations done since construction — click to record one. A U-value recorded here is used by EPSM RC.":
    "Renoveringar sedan byggåret – klicka för att registrera. Ett U-värde som registreras här används av EPSM RC.",
  "Record renovations done since construction. A renovation restarts that part's age in the recommendations; a U-value you enter replaces the typical value in EPSM RC, so the building is simulated again and its priority updates.":
    "Registrera renoveringar sedan byggåret. En renovering nollställer delens ålder i rekommendationerna; ett U-värde du anger ersätter det typiska värdet i EPSM RC, så byggnaden simuleras om och prioriteten uppdateras.",
  "No renovations recorded yet.": "Inga renoveringar registrerade än.",
  "Component": "Byggdel",
  "U-value (W/m²K)": "U-värde (W/m²K)",
  "Note": "Anteckning",
  "Add a renovation": "Lägg till en renovering",
  "optional": "valfritt",
  "e.g. triple glazing, 200 mm mineral wool": "t.ex. treglasfönster, 200 mm mineralull",
  "Enter the year the renovation was done (1850–{now}).": "Ange året renoveringen gjordes (1850–{now}).",
  "A U-value is between 0 and 10 W/m²K, e.g. 0.18 for a well-insulated wall.": "Ett U-värde ligger mellan 0 och 10 W/m²K, t.ex. 0,18 för en välisolerad vägg.",
  // Façade inspection window
  "Façade inspection –": "Fasadinspektion –",
  "Façade inspection": "Fasadinspektion",
  "AI defect detection on façade photos (Street View or your own) — click to inspect": "AI-detektering av skador på fasadfoton (Street View eller egna) – klicka för att inspektera",
  "Inspect all 4 sides (Street View)": "Inspektera alla 4 sidor (Street View)",
  "Clear results": "Rensa resultat",
  "Saved for the ranking:": "Sparat för rangordningen:",
  "in": "på",
  "street imagery too coarse to judge": "gatubilderna för grova för att bedöma",
  "street imagery only": "bara gatubilder",
  "Not inspected yet — the ranking leaves the façade criterion out for this building.": "Inte inspekterad än – rangordningen utelämnar fasadkriteriet för byggnaden.",
  "ML defect detector not running": "ML-skadedetektorn körs inte",
  "results come from AI vision only. Start it with tools\\ml\\run_facade_service.ps1.": "resultaten kommer bara från AI-seende. Starta den med tools\\ml\\run_facade_service.ps1.",
  "Street View captures cost a little per image and are not stored (Google's terms) — only the defect counts are kept. Street imagery shows a wall at a few cm per pixel: good for an overview, not for hairline cracks. Close-up photos you upload are better evidence.":
    "Street View-bilder kostar lite per bild och sparas inte (Googles villkor) – bara antalet skador behålls. Gatubilder visar väggen med några cm per pixel: bra för översikt, inte för hårfina sprickor. Egna närbilder är bättre underlag.",
  "North": "Norr",
  "East": "Öster",
  "South": "Söder",
  "West": "Väster",
  "Capturing…": "Hämtar…",
  "Upload…": "Ladda upp…",
  "No photo this session.": "Inget foto denna session.",
  "Detecting defects…": "Söker skador…",
  "no defects found": "inga skador hittades",
  "second AI look…": "andra AI-granskning…",
  "Remove all façade results for this building? Its priority score goes back to not inspected.":
    "Ta bort alla fasadresultat för byggnaden? Prioriteringen går tillbaka till ej inspekterad.",
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
