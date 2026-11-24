import { useCallback } from "react";
import { translate, useT } from "../i18n";
import { useWizardStore } from "../store/wizard";

/* Which simulation engine a project's runs use, for the words on screen.
 *
 * Swedish buildings run on EPSM's RC model in-process (backend SIM_ENGINE=rc,
 * batch ids "rc-…"); the UK and Belgium still run EnergyPlus. The UI was
 * written when everything was EnergyPlus, so its texts say "EnergyPlus" —
 * rather than fork every string (and its Swedish translation), the translated
 * text is rewritten here for Swedish projects. */

export const usesEnergyPlus = (country: string | null | undefined) =>
  country === "United Kingdom" || country === "Belgium";

export function engineLabel(country: string | null | undefined): "EPSM" | "EnergyPlus" {
  return usesEnergyPlus(country) ? "EnergyPlus" : "EPSM";
}

/** Replace "EnergyPlus" with "EPSM" in already-translated text (Swedish projects). */
export function toEngineText(s: string, country: string | null | undefined): string {
  if (usesEnergyPlus(country)) return s;
  return s
    .replace(/EnergyPlus\s*\(EPSM\)/g, "EPSM")
    .replace(/EPSM\s*\(EnergyPlus\)/g, "EPSM")
    .replace(/EnergyPlus/g, "EPSM");
}

/** useT() whose output names the engine the project actually runs on. */
export function useEngineT() {
  useT(); // re-render on language change
  const country = useWizardStore((s) => s.project.country);
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => toEngineText(translate(text, vars), country),
    [country],
  );
}
