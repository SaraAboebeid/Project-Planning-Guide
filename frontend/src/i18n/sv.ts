/* Swedish interface text, keyed by the English string used in the code
 * (see ./index.ts). Add entries as pages are translated; a missing entry simply
 * shows the English. Keep domain terms consistent:
 *   EPC = energideklaration · baseline = nuläge · package = renoveringspaket ·
 *   build-up = konstruktion · embodied carbon = inbyggd klimatpåverkan ·
 *   heating demand = värmebehov · U-value = U-värde · retrofit = renovering */
import { SV_STEP1 } from "./sv/step1";
import { SV_STEP2 } from "./sv/step2";
import { SV_STEP3 } from "./sv/step3";
import { SV_STEP4 } from "./sv/step4";
import { SV_STEP5 } from "./sv/step5";
import { SV_STAGED } from "./sv/stagedPlan";

/** Shared text (home page, top bar, settings, wizard frame); each step's own text lives in ./sv/stepN.ts. */
const CORE: Record<string, string> = {
  // ── Places (display only; stored values stay English) ──
  "Sweden": "Sverige",
  "United Kingdom": "Storbritannien",
  "Belgium": "Belgien",
  "Gothenburg": "Göteborg",
  "Brussels": "Bryssel",

  // ── Top bar ──
  "Renovation Planning Toolbox": "Verktygslåda för renoveringsplanering",
  "Renovation Planning Toolbox — home": "Verktygslåda för renoveringsplanering – startsida",
  "Digital Twin Decision Support": "Beslutsstöd med digital tvilling",
  "Workflow": "Arbetsflöde",
  "Analysis Tools": "Analysverktyg",
  "Data Explorer": "Datautforskaren",
  "3D Viewer": "3D-visning",
  "Sample Reports": "Exempelrapporter",
  "Project Team": "Projektgrupp",
  "Planning location — change it from the home page": "Planeringsplats – ändra den på startsidan",
  "Coming soon — not available yet": "Kommer snart – inte tillgängligt än",
  "Account and settings": "Konto och inställningar",
  "Settings": "Inställningar",
  "Language": "Språk",

  // ── Home page ──
  "Renovation Planning Toolbox + EPBD": "Verktygslåda för renoveringsplanering + EPBD",
  "Beta": "Beta",
  "{place} 3D Viewer": "3D-visning {place}",
  "{place} 3D View": "3D-vy {place}",
  "Live data": "Livedata",
  "A decision-support tool for building renovation planning — explore real building and energy data and compare renovation packages by energy, cost, and carbon.":
    "Ett beslutsstöd för renoveringsplanering av byggnader – utforska verkliga byggnads- och energidata och jämför renoveringspaket utifrån energi, kostnad och klimatpåverkan.",
  "Step {n}": "Steg {n}",
  "Define Project": "Definiera projekt",
  "Building Data & Prioritisation": "Byggnadsdata och prioritering",
  "Select & Baseline": "Urval och nuläge",
  "Renovation Calculator": "Renoveringskalkylator",
  "Report": "Rapport",
  "Set the components in scope, the KPIs to optimise for, the scale and the location.":
    "Välj vilka byggnadsdelar som ingår, vilka nyckeltal som ska optimeras, skala och plats.",
  "Review each building’s data and fill gaps, inspect façade photos for defects, and rank the buildings to flag which to renovate first.":
    "Granska varje byggnads data och fyll luckor, inspektera fasadfoton efter skador och rangordna byggnaderna för att se vilka som bör renoveras först.",
  "Confirm which of the flagged buildings to carry forward, then run the EnergyPlus baseline — their as-built demand, monthly or hourly.":
    "Bekräfta vilka av de utpekade byggnaderna som går vidare och kör sedan nulägessimuleringen i EnergyPlus – deras nuvarande energibehov, per månad eller timme.",
  "Design component build-ups, combine them into packages, and simulate or optimise each against the baseline for energy, cost and carbon.":
    "Utforma konstruktioner för byggnadsdelarna, kombinera dem till åtgärdspaket och simulera eller optimera varje paket mot nuläget för energi, kostnad och klimatpåverkan.",
  "What was analysed, the baseline, façade findings, every package tested and the recommended ones — shareable or saved as PDF.":
    "Vad som analyserats, nuläget, fasadfynd, alla testade paket och de rekommenderade – att dela eller spara som PDF.",

  // Dataset numbers
  "3D buildings": "byggnader",
  "EPC matched": "deklarerade",
  "TABULA matched": "TABULA",
  "residential": "bostäder",
  "districts": "områden",
  "buildings": "byggnader",
  "EHS estimated": "EHS-uppskattade",

  // ── Workspace card ──
  "Country": "Land",
  "City / Study Area": "Stad / studieområde",
  "No study areas available for {country} yet.": "Inga studieområden finns för {country} än.",
  "Access mode": "Åtkomst",
  "Guest Demo": "Gästdemo",
  "Explore as guest": "Utforska som gäst",
  "Chalmers Login": "Chalmers-inloggning",
  "Sign in with Chalmers": "Logga in med Chalmers",
  "Partner Login": "Partnerinloggning",
  "Sign in with partner": "Logga in som partner",
  "Soon": "Snart",
  "Start Planning": "Börja planera",
  "{city} dataset": "Datamängd {city}",
  "Add municipality": "Lägg till kommun",
  "Any Swedish municipality, e.g. Ystad": "Valfri kommun, t.ex. Ystad",
  "Select": "Välj",
  "Build": "Bygg",
  "built": "byggd",
  "{n} EPCs": "{n} energideklarationer",
  "{name} is already built.": "{name} är redan byggd.",
  "{n} energy declarations. Downloads Lantmäteriet buildings, links EPCs, builds the data set and weather - about 2-5 minutes.":
    "{n} energideklarationer. Hämtar Lantmäteriets byggnader, kopplar energideklarationer, bygger datamängden och klimatdata – cirka 2–5 minuter.",
  "Builds the buildings, energy declarations and weather for one municipality so Steps 1-5 work there.":
    "Bygger byggnader, energideklarationer och klimatdata för en kommun så att steg 1–5 fungerar där.",
  "Municipality list unavailable (backend down?)": "Kommunlistan är inte tillgänglig (är servern nere?)",
  "Could not start the build ({status})": "Kunde inte starta bygget ({status})",
  "{name} built: {buildings} buildings, {withEnergy} with EPC energy":
    "{name} byggd: {buildings} byggnader, {withEnergy} med energi från energideklaration",
  "Build failed: {error}": "Bygget misslyckades: {error}",
  "Starting...": "Startar …",

  // ── Wizard frame ──
  "Back": "Tillbaka",
  "Continue": "Fortsätt",
  "Next": "Nästa",
  "Complete": "Klart",
  "Fix the highlighted issue to continue": "Åtgärda det markerade problemet för att fortsätta",
  "Step {n} · {label}": "Steg {n} · {label}",
  "You've reached the final step 🎉": "Du har nått sista steget 🎉",
  "Your renovation plan is ready — review the report, download it, and share.":
    "Din renoveringsplan är klar – granska rapporten, ladda ner den och dela den.",
  "review each building's data, fill any gaps, and choose which buildings carry forward.":
    "granska varje byggnads data, fyll eventuella luckor och välj vilka byggnader som går vidare.",
  "simulate the as-built performance of the selected buildings — the baseline to compare against.":
    "simulera de valda byggnadernas nuvarande prestanda – nuläget att jämföra mot.",
  "design renovation packages and simulate each against the baseline for energy, cost and carbon.":
    "utforma renoveringspaket och simulera varje paket mot nuläget för energi, kostnad och klimatpåverkan.",
  "compile everything into a shareable report.": "sammanställ allt i en rapport som kan delas.",

  // ── Settings ──
  "Choose the language of the interface. Data such as addresses, material names and source titles stay as published.":
    "Välj gränssnittets språk. Data som adresser, materialnamn och källtitlar visas som de är publicerade.",
  "Some pages are not translated yet and still show English.": "Vissa sidor är ännu inte översatta och visas fortfarande på engelska.",
  "Connections & status": "Anslutningar och status",
  "Refresh": "Uppdatera",
  "Optional services — each feature degrades gracefully when its service is offline.":
    "Valfria tjänster – varje funktion fungerar i begränsad form när dess tjänst är offline.",
  "AI assistant & vision": "AI-assistent och bildanalys",
  "provider: {p}": "leverantör: {p}",
  "no API key set": "ingen API-nyckel angiven",
  "Configured": "Konfigurerad",
  "Not set": "Ej angiven",
  "EPSM — energy simulation": "EPSM – energisimulering",
  "Online": "Online",
  "Offline": "Offline",
  "Façade-ML defect model": "ML-modell för fasadskador",
  "3D viewer (Cesium)": "3D-visning (Cesium)",
  "Google Photorealistic 3D tiles": "Googles fotorealistiska 3D-kartor",
  "Checking…": "Kontrollerar …",
  "Status unavailable.": "Status är inte tillgänglig.",
  "Data & session": "Data och session",
  "All project data lives in this browser session. Clear parts of it, or reset everything.":
    "All projektdata finns i den här webbläsarsessionen. Rensa delar av den eller återställ allt.",
  "Clear façade inspections": "Rensa fasadinspektioner",
  "Clear simulation results": "Rensa simuleringsresultat",
  "Reset entire project": "Återställ hela projektet",
  "Façade inspections cleared.": "Fasadinspektionerna är rensade.",
  "Simulation results cleared.": "Simuleringsresultaten är rensade.",
  "Reset the entire project? This clears every step's data (selection, edits, results, façade inspections) and returns you to Step 1. This cannot be undone.":
    "Återställa hela projektet? Det rensar data i alla steg (urval, ändringar, resultat, fasadinspektioner) och tar dig tillbaka till steg 1. Det går inte att ångra.",
  // ── Data assistant ──
  "Ask the data": "Fråga datan",
  "Open assistant": "Öppna assistenten",
  "Data assistant": "Dataassistent",
  "Gothenburg buildings · EN / SV": "Göteborgs byggnader · SV / EN",
  "thinking…": "tänker …",
  "Close": "Stäng",
  "Send": "Skicka",
  "Theme": "Tema",
  "Switch to bright mode": "Byt till ljust läge",
  "Switch to dark mode": "Byt till mörkt läge",

  // ── Sign-in and saved projects ──
  "Sign in": "Logga in",
  "Sign out": "Logga ut",
  "Sign out and explore as guest": "Logga ut och utforska som gäst",
  "Signed in — your projects are saved to your account.": "Inloggad – dina projekt sparas på ditt konto.",
  "My projects": "Mina projekt",
  "Enter your work email and we'll send you a sign-in link. Signing in lets you save projects and open them again later.": "Ange din jobbmejl så skickar vi en inloggningslänk. När du är inloggad kan du spara projekt och öppna dem igen senare.",
  "Work email": "Jobbmejl",
  "Email me a sign-in link": "Mejla mig en inloggningslänk",
  "For now, sign-in is open to partner organisations (Chalmers, Framtiden, Poseidon, Nacka, Chalmers Next Labs, HSB).": "Tills vidare kan partnerorganisationer logga in (Chalmers, Framtiden, Poseidon, Nacka, Chalmers Next Labs, HSB).",
  "Check your inbox at {email}. The link works once and expires in 15 minutes.": "Kolla din inkorg för {email}. Länken fungerar en gång och slutar gälla efter 15 minuter.",
  "This server has no outgoing email set up yet, so the sign-in link was written to the backend log. Ask the administrator, or set SMTP_* in .env.": "Den här servern kan inte skicka mejl än, så inloggningslänken skrevs till backendens logg. Fråga administratören, eller ange SMTP_* i .env.",
  "Use a different email": "Använd en annan mejladress",
  "This sign-in link is incomplete. Request a new one.": "Inloggningslänken är ofullständig. Begär en ny.",
  "Finish signing in": "Slutför inloggningen",
  "Request a new link": "Begär en ny länk",
  "Sign in with your work email to save projects and open them again later.": "Logga in med din jobbmejl för att spara projekt och öppna dem igen senare.",
  "Signed in as {email}": "Inloggad som {email}",
  "Save the project in this tab ({name})": "Spara projektet i den här fliken ({name})",
  "Untitled project": "Namnlöst projekt",
  "New project": "Nytt projekt",
  "No saved projects yet. Start a project and press Save in the top bar — after that it saves itself as you work.": "Inga sparade projekt än. Starta ett projekt och tryck på Spara i toppraden – sedan sparas det automatiskt medan du arbetar.",
  "Project name": "Projektnamn",
  "open in this tab": "öppet i den här fliken",
  "saved {date}": "sparat {date}",
  "Open": "Öppna",
  "Rename": "Byt namn",
  "Delete": "Ta bort",
  "Delete “{name}”? This can't be undone.": "Ta bort ”{name}”? Det går inte att ångra.",
  "Sign in to save this project": "Logga in för att spara projektet",
  "Save": "Spara",
  "“{name}” is saved to your account — open it again from My projects": "”{name}” är sparat på ditt konto – öppna det igen från Mina projekt",
  "Saving…": "Sparar…",
  "Not saved": "Inte sparat",
  "not saved": "inte sparat",
  "Saved {time}": "Sparat {time}",
  "Save this project to your account": "Spara projektet på ditt konto",
  "{n} building": "{n} byggnad",
  "{n} buildings": "{n} byggnader",
  "Loading…": "Laddar…",
};

export const SV: Record<string, string> = { ...SV_STEP1, ...SV_STEP2, ...SV_STEP3, ...SV_STEP4, ...SV_STEP5, ...SV_STAGED, ...CORE };
