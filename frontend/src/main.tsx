import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { loadSeCities } from "./config/countryNav";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Municipalities built on demand join the Sweden city list before first render
// (bounded wait: the app renders regardless if the backend is slow or down).
// A promise chain, not top-level await, which the es2020 build target rejects.
loadSeCities().finally(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
));
