import { Outlet } from "react-router-dom";
import BrandedHeader from "./BrandedHeader";
import StepIndicator from "./StepIndicator";

/** Wraps every wizard page with header + step indicator */
export default function WizardLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <BrandedHeader />
      <StepIndicator />
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
