import { Routes, Route } from "react-router-dom";
import WizardLayout from "./components/WizardLayout";
import LandingPage from "./pages/LandingPage";
import DefineProject from "./pages/DefineProject";
import DataCoverage from "./pages/DataCoverage";
import DataAssumptions from "./pages/DataAssumptions";
import Recommendations from "./pages/Recommendations";
import ExpectedResults from "./pages/ExpectedResults";
import Timeline from "./pages/Timeline";
import Budget from "./pages/Budget";

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
        <Route path="/step/4" element={<Recommendations />} />
        <Route path="/step/5" element={<ExpectedResults />} />
        <Route path="/step/6" element={<Timeline />} />
        <Route path="/step/7" element={<Budget />} />
      </Route>
    </Routes>
  );
}
