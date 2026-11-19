import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./retro.css";
import { WMProvider } from "./desktop/wm";
import Desktop from "./desktop/Desktop";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WMProvider>
      <Desktop />
    </WMProvider>
  </StrictMode>,
);
