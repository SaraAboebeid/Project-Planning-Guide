import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type ThemeMode = "dark" | "bright";
const STORAGE_KEY = "ppg-theme-mode";

function initialMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "bright" ? "bright" : "dark";
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    document.body.classList.toggle("bright-mode", mode === "bright");
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  return (
    <button
      onClick={() => setMode((m) => (m === "dark" ? "bright" : "dark"))}
      className="theme-toggle theme-toggle-sidebar sidebar-theme-icon no-hover-shadow"
      title={mode === "dark" ? "Switch to bright mode" : "Switch to dark mode"}
      aria-label={mode === "dark" ? "Switch to bright mode" : "Switch to dark mode"}
    >
      {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      {/* Same treatment as the sidebar's other captions (SideNavItem / Settings)
          so the two controls sitting together read at the same size and weight. */}
      <span className="text-[9px] tracking-wide font-medium leading-none">Theme</span>
    </button>
  );
}
