import { useEffect } from "react";

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
export const wizardNav: { onNext: NavHandler | null; onBack: NavHandler | null } = {
  onNext: null,
  onBack: null,
};

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
