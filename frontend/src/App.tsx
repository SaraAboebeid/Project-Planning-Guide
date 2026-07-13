import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import WizardLayout from "./components/WizardLayout";
import DataLayout from "./components/DataLayout";
import LandingPage from "./pages/LandingPage";
import DefineProject from "./pages/DefineProject";
import DataCoverage from "./pages/DataCoverage";
import DataAssumptions from "./pages/DataAssumptions";
import BaselineSetup from "./pages/BaselineSetup";
import RenovationSimulator from "./pages/RenovationSimulator";
import Scenarios from "./pages/Scenarios";
import StepScenarios from "./pages/StepScenarios";
import ResultsBudget from "./pages/ResultsBudget";
import RenovationReport from "./pages/RenovationReport";
import DataExplorer from "./pages/DataExplorer";
import Timeline from "./pages/Timeline";
import Budget from "./pages/Budget";
import AnalysisTools from "./pages/AnalysisTools";
import SampleReports from "./pages/SampleReports";
import MapViewer from "./pages/MapViewer";
import UKMapViewer from "./pages/UKMapViewer";
import UKDataExplorer from "./pages/UKDataExplorer";
import { useWizardStore } from "./store/wizard";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Step3Router() {
  const projectType = useWizardStore(s => s.project.projectType);
  return projectType === "Renovation Planning"
    ? <BaselineSetup />
    : <DataAssumptions />;
}

function Step4Router() {
  const projectType = useWizardStore(s => s.project.projectType);
  return projectType === "Renovation Planning"
    ? <RenovationSimulator />
    : <StepScenarios />;
}

function Step5Router() {
  const projectType = useWizardStore(s => s.project.projectType);
  return projectType === "Renovation Planning"
    ? <RenovationReport />
    : <ResultsBudget />;
}

/**
 * 5-step wizard — generic schema for all 3 project tracks:
 *  1 – Define Project        (type, KPIs, scope, systems)
 *  2 – Building & Site Data  (open data, EUBUCCO/EPC, select buildings)
 *  3 – Data Overview         (model confidence, sensitivity, reference DBs incl. Wikells)
 *  4 – Pathways              (Renovation: packages + cost/carbon | EC: community scenarios | RE: generation scenarios)
 *  5 – Results & Budget      (deliverables, timeline, CAPEX pre-filled from scenarios)
 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/data"      element={<DataLayout><DataExplorer /></DataLayout>} />
      <Route path="/data/uk"   element={<DataLayout title="Data Explorer" accentColor="#4A90E2" accentBadge="United Kingdom Data"><UKDataExplorer /></DataLayout>} />
      <Route path="/pathways"  element={<DataLayout title="Pathways"       accentColor="#721CB8" accentBadge="Tool Overview"><Scenarios /></DataLayout>} />
      <Route path="/analysis"  element={<DataLayout title="Analysis" accentColor="#4ECDC4" accentBadge="Tools"><AnalysisTools /></DataLayout>} />
      <Route path="/viewer"    element={<DataLayout title="3D Viewer" accentColor="#5FA5FF" accentBadge="Digital Twin"><MapViewer /></DataLayout>} />
      <Route path="/viewer/uk" element={<DataLayout title="3D Viewer" accentColor="#5FA5FF" accentBadge="United Kingdom Digital Twin"><UKMapViewer /></DataLayout>} />
      <Route path="/map"       element={<Navigate to="/viewer" replace />} />
      <Route path="/budget"    element={<DataLayout title="Planning & Cost" accentColor="#F59E0B" accentBadge="Cost Estimate"><Budget /></DataLayout>} />
      <Route path="/reports" element={<DataLayout title="Reports" accentColor="#96D74C" accentBadge="Examples"><SampleReports /></DataLayout>} />
      <Route element={<WizardLayout />}>
        <Route path="/step/1" element={<DefineProject />} />
        <Route path="/step/2" element={<DataCoverage />} />
        <Route path="/step/3" element={<Step3Router />} />
        <Route path="/step/4" element={<Step4Router />} />
        <Route path="/step/5" element={<Step5Router />} />
      </Route>
      </Routes>
    </>
  );
}
