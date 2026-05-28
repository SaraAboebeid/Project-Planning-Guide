import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import WizardLayout from "./components/WizardLayout";
import LandingPage from "./pages/LandingPage";
import DefineProject from "./pages/DefineProject";
import DataCoverage from "./pages/DataCoverage";
import DataAssumptions from "./pages/DataAssumptions";
import Scenarios from "./pages/Scenarios";
import ResultsBudget from "./pages/ResultsBudget";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/**
 * 5-step wizard — generic schema for all 3 project tracks:
 *  1 – Define Project        (type, KPIs, scope, systems)
 *  2 – Building & Site Data  (open data, EUBUCCO/EPC, select buildings)
 *  3 – Data Overview         (model confidence, sensitivity, reference DBs incl. Wikells)
 *  4 – Scenarios             (Renovation: packages + cost/carbon | EC: community scenarios | RE: generation scenarios)
 *  5 – Results & Budget      (deliverables, timeline, CAPEX pre-filled from scenarios)
 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<WizardLayout />}>
        <Route path="/step/1" element={<DefineProject />} />
        <Route path="/step/2" element={<DataCoverage />} />
        <Route path="/step/3" element={<DataAssumptions />} />
        <Route path="/step/4" element={<Scenarios />} />
        <Route path="/step/5" element={<ResultsBudget />} />
      </Route>
      </Routes>
    </>
  );
}
