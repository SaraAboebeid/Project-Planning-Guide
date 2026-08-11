import { useEffect, useReducer } from "react";

type NavHandler = () => void;

/**
 * Module-level singleton the WizardLayout footer reads at click time.
 *
 * The footer (Back / Continue) is the SINGLE wizard nav control - step pages
 * used to render their own Back/Continue too, which showed up as duplicate
 * buttons. Pages that need custom Continue/Back behavior (validation, saving
 * results before advancing) register it here instead of drawing their own
 * button; pages that just move to the next step register nothing and the
 * footer's generic navigation handles them.
 *
 * React runs an unmounting route's effect cleanup before the incoming route's
 * effect, so navigating between steps leaves the singleton holding only the
 * newly-mounted page's handlers (or none).
 */
export const wizardNav: {
  onNext: NavHandler | null;
  onBack: NavHandler | null;
  /** When false, the footer's Continue is disabled (a step page can gate it,
   *  e.g. Step 1 blocks continuing while the address is outside the area). */
  canNext: boolean;
  _listeners: Set<() => void>;
} = { onNext: null, onBack: null, canNext: true, _listeners: new Set() };

export function useWizardStepNav(handlers: { onNext?: NavHandler; onBack?: NavHandler }) {
  const { onNext, onBack } = handlers;
  useEffect(() => {
    wizardNav.onNext = onNext ?? null;
    wizardNav.onBack = onBack ?? null;
    return () => {
      wizardNav.onNext = null;
      wizardNav.onBack = null;
    };
  }, [onNext, onBack]);
}

/** Enable/disable the footer Continue button from a step page. Always reset to
 *  true when the gating page unmounts. */
export function setWizardCanNext(v: boolean) {
  if (wizardNav.canNext !== v) {
    wizardNav.canNext = v;
    wizardNav._listeners.forEach((l) => l());
  }
}

/** Subscribe the footer to canNext changes so it re-renders when a page gates it. */
export function useWizardCanNext(): boolean {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const l = () => force();
    wizardNav._listeners.add(l);
    return () => { wizardNav._listeners.delete(l); };
  }, []);
  return wizardNav.canNext;
}
