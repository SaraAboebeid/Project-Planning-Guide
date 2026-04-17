import { Routes, Route } from "react-router-dom";
import WizardLayout from "./components/WizardLayout";
import LandingPage from "./pages/LandingPage";
import DefineProject from "./pages/DefineProject";
import DataCoverage from "./pages/DataCoverage";
import DataAssumptions from "./pages/DataAssumptions";
import ExpectedResults from "./pages/ExpectedResults";
import Budget from "./pages/Budget";

/**
 * 5-step wizard pipeline:
 *  1 – Define Project (type + scope)
 *  2 – Data Requirements (what data is needed + proxies)
 *  3 – Review & Confidence (sensitivity, reference data, model confidence)
 *  4 – Expected Results & Timeline (deliverables + schedule)
 *  5 – Cost Estimate (service + CAPEX/OPEX)
 */
export default function App() {
  return (
    <Routes>
      {/* Landing — no step indicator */}
      <Route path="/" element={<LandingPage />} />

      {/* Wizard pages — wrapped in layout with header + stepper */}
      <Route element={<WizardLayout />}>
        <Route path="/step/1" element={<DefineProject />} />
        <Route path="/step/2" element={<DataCoverage />} />
        <Route path="/step/3" element={<DataAssumptions />} />
        <Route path="/step/4" element={<ExpectedResults />} />
        <Route path="/step/5" element={<Budget />} />
      </Route>
    </Routes>
  );
}
